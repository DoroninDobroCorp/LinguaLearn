"""Dry-run client for the local Betfair Sportsbook betslip worker.

The worker controls the bookmaker website in a persistent browser.  This
adapter deliberately has no method for submitting a bet: it can only prepare
one fixed-odds selection in the betslip and fill the stake field.
"""
from __future__ import annotations

import math
import os
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import httpx


class BetfairSportsbookBasketError(RuntimeError):
    pass


class BetfairSportsbookBasketIndeterminateError(BetfairSportsbookBasketError):
    """Story 2.2b fix-1 (P1, money-safety): raised when a `dry_run=False`
    POST /basket to the worker fails AFTER the request has left this process
    (read/write/protocol timeout or error, not a connection failure) -- the
    worker's own request queue may still process and place the bet
    asynchronously even though this client gave up waiting. Callers must
    treat this exactly like the direct-API client's PLACE_INDETERMINATE:
    hold the reserved stake for reconciliation, never refund, never retry,
    never fall back to another placement path (that risks a double-place).
    """


@dataclass(frozen=True)
class BetfairSportsbookBasketConfig:
    worker_url: str = "http://127.0.0.1:8898"
    timeout_sec: float = 45.0

    @classmethod
    def from_env(cls) -> "BetfairSportsbookBasketConfig":
        return cls(
            worker_url=os.getenv(
                "BETFAIR_SPORTSBOOK_BASKET_URL",
                "http://127.0.0.1:8898",
            ).strip().rstrip("/"),
            timeout_sec=max(
                5.0,
                float(os.getenv("BETFAIR_SPORTSBOOK_BASKET_TIMEOUT_SEC", "45")),
            ),
        )

    def configured(self) -> bool:
        parsed = urlparse(self.worker_url)
        return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _positive_float(value: Any, name: str) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise BetfairSportsbookBasketError(f"{name} is missing or invalid") from exc
    if not math.isfinite(parsed) or parsed <= 0:
        raise BetfairSportsbookBasketError(f"{name} is missing or invalid")
    return parsed


def build_prepare_payload(
    *,
    arb: dict[str, Any],
    quote: dict[str, Any],
    event_url: str,
    stake: float,
    dry_run: bool = True,
) -> dict[str, Any]:
    parsed = urlparse(str(event_url or "").strip())
    if parsed.scheme != "https" or parsed.hostname not in {"betfair.com", "www.betfair.com"}:
        raise BetfairSportsbookBasketError("event_url must be a Betfair HTTPS URL")
    if "/exchange/" in parsed.path.lower() or "/betting/" not in parsed.path.lower():
        raise BetfairSportsbookBasketError("event_url must point to Betfair Sportsbook, not Exchange")

    market_id = str(quote.get("market_id") or "").strip()
    selection_id = str(quote.get("selection_id") or "").strip()
    market_name = str(quote.get("market_name") or arb.get("market") or "").strip()
    # API catalog resolution uses Paddy's bare runnerName (for example
    # ``Under``), but the browser fallback needs the exact rendered line to
    # avoid matching a different Under runner. Paddy therefore supplies a
    # dedicated selection_label when the line lives only in runner.handicap.
    selection = str(
        quote.get("selection_label")
        or quote.get("selection")
        or arb.get("bk2_selection")
        or arb.get("side2")
        or ""
    ).strip()
    if not market_id or not selection_id or not market_name or not selection:
        raise BetfairSportsbookBasketError("resolved sportsbook market and selection identifiers are required")

    return {
        "dry_run": dry_run,
        "arb_id": str(arb.get("id") or "betfair-sportsbook"),
        "event_url": event_url,
        "market_id": market_id,
        "selection_id": selection_id,
        "market_name": market_name,
        "selection": selection,
        "expected_odds": _positive_float(quote.get("current_odds"), "expected_odds"),
        "stake": round(_positive_float(stake, "stake"), 2),
    }


class BetfairSportsbookBasketClient:
    def __init__(
        self,
        config: BetfairSportsbookBasketConfig | None = None,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.config = config or BetfairSportsbookBasketConfig.from_env()
        # Story 2.2b fix-1: injectable transport so tests can exercise the
        # post-send-timeout classification with httpx.MockTransport instead
        # of a real worker process (mirrors betfair_sportsbook_place_api.py).
        self._transport = transport

    def _client_kwargs(self, timeout: float) -> dict[str, Any]:
        kwargs: dict[str, Any] = {"timeout": timeout}
        if self._transport is not None:
            kwargs["transport"] = self._transport
        return kwargs

    async def status(self) -> dict[str, Any]:
        if not self.config.configured():
            return {"available": False, "status": "NOT_CONFIGURED"}
        try:
            async with httpx.AsyncClient(**self._client_kwargs(min(self.config.timeout_sec, 5.0))) as client:
                response = await client.get(f"{self.config.worker_url}/status")
                response.raise_for_status()
                data = response.json()
            return data if isinstance(data, dict) else {"available": False, "status": "INVALID_RESPONSE"}
        except Exception as exc:  # noqa: BLE001 - status is diagnostic
            return {"available": False, "status": "UNREACHABLE", "detail": str(exc)}

    async def prepare(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(payload.get("dry_run"), bool):
            raise BetfairSportsbookBasketError("sportsbook basket preparation requires dry_run boolean")
        if not self.config.configured():
            raise BetfairSportsbookBasketError("sportsbook basket worker is not configured")
        dry_run = bool(payload.get("dry_run"))
        try:
            async with httpx.AsyncClient(**self._client_kwargs(self.config.timeout_sec)) as client:
                response = await client.post(f"{self.config.worker_url}/basket", json=payload)
            data = response.json()
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout) as exc:
            # Pre-send: the connection to the worker (localhost) was never
            # established -- nothing left this process, no money at risk.
            raise BetfairSportsbookBasketError(f"sportsbook basket worker unreachable: {exc}") from exc
        except Exception as exc:  # noqa: BLE001 - see money-safety note below
            # Story 2.2b fix-1 (P1): everything else here (ReadTimeout,
            # WriteTimeout, RemoteProtocolError, a bad response body, ...)
            # can only happen once the POST has left this process -- the
            # worker's own queue (see betfair_sportsbook_basket_worker.cjs)
            # may still process it and place the bet asynchronously even
            # though this client gave up waiting. For a live placement that
            # is indeterminate, never a clean failure; for dry_run it is
            # safe to treat as an ordinary failure (no money at risk either
            # way).
            if dry_run:
                raise BetfairSportsbookBasketError(f"sportsbook basket worker failed: {exc}") from exc
            raise BetfairSportsbookBasketIndeterminateError(
                f"sportsbook basket worker request indeterminate after send: {exc}"
            ) from exc
        if response.status_code >= 400 or not isinstance(data, dict) or not data.get("ok"):
            detail = data.get("detail") if isinstance(data, dict) else response.text
            status = data.get("status") if isinstance(data, dict) else "ERROR"
            raise BetfairSportsbookBasketError(f"{status}: {detail or 'basket preparation failed'}")
        return data
