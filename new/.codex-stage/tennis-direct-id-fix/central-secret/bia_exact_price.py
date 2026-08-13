"""
BIA PMM exact-price client for shadow Pinnacle verification.

This module is intentionally narrow:
  - reuse existing BIA login + cpricefeed parsing from ``services.bia_client``
  - request only explicit, proven market families
  - return a normalized quote payload without changing downstream contracts

The caller is expected to keep the current PS3838 verify result as the primary
contract and attach the exact-price quote as supplementary metadata.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import time
from typing import Any

import aiohttp

import config as _cfg
from services.bia_client import BiaPmmMsg, BiaSession, _make_ssl_ctx, parse_cpricefeed_frame

logger = logging.getLogger(__name__)


_SUPPORTED_DC_MAP = {
    "homeordraw": ("h", "d"),
    "homeoraway": ("h", "a"),
    "draworaway": ("d", "a"),
}


class BiaExactPriceMappingError(ValueError):
    """Raised when a selection cannot be translated into a proven BIA bet_type."""

    def __init__(self, code: str, message: str | None = None):
        super().__init__(message or code)
        self.code = code


class BiaExactPriceRateLimitError(RuntimeError):
    """Raised when BIA throttles PMM betslip requests."""

    def __init__(
        self,
        *,
        operation: str,
        http_status: int,
        retry_after_sec: float | None,
        body: Any,
    ):
        self.operation = str(operation or "bia_request")
        self.http_status = int(http_status or 429)
        self.retry_after_sec = float(retry_after_sec or 0.0)
        self.body = body
        super().__init__(
            f"{self.operation} failed: HTTP {self.http_status} "
            f"retry_after={self.retry_after_sec:g} body={_safe_body_repr(body)}"
        )


def _safe_body_repr(body: Any) -> str:
    if isinstance(body, dict):
        return f"dict(keys={sorted(str(key) for key in body)})"
    if isinstance(body, list):
        return f"list(len={len(body)})"
    return f"{type(body).__name__}"


def _coerce_nonnegative_float(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed < 0:
        return None
    return parsed


def _find_retry_after(node: Any) -> float | None:
    if isinstance(node, dict):
        for key in ("retry_after", "retryAfter", "Retry-After", "retry-after"):
            if key in node:
                parsed = _coerce_nonnegative_float(node.get(key))
                if parsed is not None:
                    return parsed
        for value in node.values():
            parsed = _find_retry_after(value)
            if parsed is not None:
                return parsed
        return None
    if isinstance(node, list):
        for item in node:
            parsed = _find_retry_after(item)
            if parsed is not None:
                return parsed
    return None


def _extract_retry_after_sec(headers: Any, body: Any) -> float | None:
    if headers is not None:
        parsed = _coerce_nonnegative_float(headers.get("Retry-After") or headers.get("retry-after"))
        if parsed is not None:
            return parsed
    return _find_retry_after(body)


async def _read_response_body(resp: aiohttp.ClientResponse) -> Any:
    try:
        return await resp.json(content_type=None)
    except Exception:
        raw_text = await resp.text()
        if not raw_text:
            return ""
        try:
            return json.loads(raw_text)
        except Exception:
            return raw_text


def _normalize_contestant(value: Any) -> str:
    return "".join(str(value or "").lower().split())


def _format_line(value: Any) -> str:
    try:
        line = float(value)
    except (TypeError, ValueError) as exc:
        raise BiaExactPriceMappingError("INVALID_HANDICAP", "handicap is required") from exc
    if line.is_integer():
        return str(int(line))
    return f"{line:g}"


def _format_asian_code(value: Any) -> str:
    try:
        line = float(value)
    except (TypeError, ValueError) as exc:
        raise BiaExactPriceMappingError("INVALID_HANDICAP", "handicap is required") from exc
    if not math.isfinite(line):
        raise BiaExactPriceMappingError("INVALID_HANDICAP", "handicap must be finite")
    scaled = line * 4.0
    code = round(scaled)
    if not math.isclose(scaled, code, rel_tol=0.0, abs_tol=1e-7):
        raise BiaExactPriceMappingError("BIA_ASIAN_LINE_NOT_QUARTER")
    return str(int(code))


def _parse_correct_score_contestant(contestant: str, *, swapped: bool) -> tuple[str, str]:
    normalized = str(contestant or "").strip().replace(" ", "")
    for sep in (":", "-"):
        if sep not in normalized:
            continue
        left, right = normalized.split(sep, 1)
        if not left.isdigit() or not right.isdigit():
            break
        if swapped:
            return right, left
        return left, right
    raise BiaExactPriceMappingError("UNSUPPORTED_CORRECT_SCORE_CONTESTANT")


def _parse_exact_total_contestant(contestant: str) -> str:
    normalized = str(contestant or "").strip().replace(" ", "")
    if normalized.isdigit():
        return normalized
    raise BiaExactPriceMappingError("UNSUPPORTED_EXACT_TOTAL_GOALS_CONTESTANT")


def _parse_total_goals_range_contestant(contestant: str) -> tuple[str, str]:
    normalized = str(contestant or "").strip().replace(" ", "").replace("–", "-")
    if normalized.endswith("+") and normalized[:-1].isdigit():
        return normalized[:-1], "999"
    if "-" not in normalized:
        raise BiaExactPriceMappingError("UNSUPPORTED_TOTAL_GOALS_RANGE_CONTESTANT")
    left, right = normalized.split("-", 1)
    if not left.isdigit() or not right.isdigit():
        raise BiaExactPriceMappingError("UNSUPPORTED_TOTAL_GOALS_RANGE_CONTESTANT")
    return left, right


def _parse_winning_margin_contestant(contestant: str, *, swapped: bool) -> tuple[str, str]:
    normalized = _normalize_contestant(contestant)
    if normalized.startswith("homeby"):
        side = _swapped_side("h", swapped=swapped)
        margin = normalized.removeprefix("homeby")
    elif normalized.startswith("awayby"):
        side = _swapped_side("a", swapped=swapped)
        margin = normalized.removeprefix("awayby")
    else:
        raise BiaExactPriceMappingError("UNSUPPORTED_WINNING_MARGIN_CONTESTANT")
    if not margin.isdigit():
        raise BiaExactPriceMappingError("UNSUPPORTED_WINNING_MARGIN_CONTESTANT")
    return side, margin


def _swapped_side(side: str, *, swapped: bool) -> str:
    if not swapped:
        return side
    if side == "h":
        return "a"
    if side == "a":
        return "h"
    return side


def bia_bet_type_matches_exact(requested: str, returned: Any) -> bool:
    """Compare BIA identity, allowing only its explicit live-score wrapper."""
    requested = str(requested or "")
    returned = str(returned or "")
    if not requested or not returned:
        return False
    if returned == requested:
        return True
    parts = returned.split(",")
    if len(parts) < 6 or parts[:2] != ["for", "ir"]:
        return False
    try:
        int(parts[2])
        int(parts[3])
    except (TypeError, ValueError):
        return False
    return "for," + ",".join(parts[4:]) == requested


def _is_soccer_three_way_sport(event_ref: dict[str, Any]) -> bool:
    return str(event_ref.get("sport_code", "") or "").strip().lower().startswith("fb")


def _selection_bia_bet_type(event_ref: dict[str, Any], selection: dict[str, Any]) -> str:
    swapped = bool(event_ref.get("swapped"))
    sport_code = str(event_ref.get("sport_code", "") or "").strip().lower()
    special_type = str(selection.get("special_type", "") or "").strip()
    contestant = _normalize_contestant(selection.get("contestant"))

    if special_type:
        if special_type == "double_chance":
            sides = _SUPPORTED_DC_MAP.get(contestant)
            if not sides:
                raise BiaExactPriceMappingError("UNSUPPORTED_DOUBLE_CHANCE")
            if swapped:
                swapped_dc_map = {
                    "homeordraw": ("d", "a"),
                    "homeoraway": ("h", "a"),
                    "draworaway": ("h", "d"),
                }
                left, right = swapped_dc_map[contestant]
            else:
                left, right = sides
            return f"for,dc,{left},{right}"
        if special_type == "btts":
            if contestant != "yes":
                raise BiaExactPriceMappingError("UNSUPPORTED_BTTS_CONTESTANT")
            return "for,score,both"
        if special_type == "home_team_to_score":
            if contestant != "yes":
                raise BiaExactPriceMappingError("UNSUPPORTED_HOME_TEAM_TO_SCORE_CONTESTANT")
            return f"for,score,{_swapped_side('h', swapped=swapped)}"
        if special_type == "away_team_to_score":
            if contestant != "yes":
                raise BiaExactPriceMappingError("UNSUPPORTED_AWAY_TEAM_TO_SCORE_CONTESTANT")
            return f"for,score,{_swapped_side('a', swapped=swapped)}"
        if special_type == "correct_score":
            home_goals, away_goals = _parse_correct_score_contestant(
                selection.get("contestant", ""),
                swapped=swapped,
            )
            return f"for,cs,{home_goals},{away_goals}"
        if special_type == "exact_total_goals":
            goals = _parse_exact_total_contestant(selection.get("contestant", ""))
            return f"for,exact_total,{goals}"
        if special_type == "total_goals_range":
            low, high = _parse_total_goals_range_contestant(selection.get("contestant", ""))
            return f"for,gr,{low},{high}"
        if special_type == "winning_margin":
            side, margin = _parse_winning_margin_contestant(
                selection.get("contestant", ""),
                swapped=swapped,
            )
            return f"for,wm,{side},{margin}"
        raise BiaExactPriceMappingError("UNSUPPORTED_SPECIAL_MARKET")

    try:
        bet_type = int(selection.get("bet_type"))
        team_select = int(selection.get("team_select"))
    except (TypeError, ValueError) as exc:
        raise BiaExactPriceMappingError("INVALID_SELECTION_FORMAT") from exc

    try:
        period = int(selection.get("period") or 0)
        game_number = int(selection.get("game_number") or 0)
        map_number = int(selection.get("map_number") or 0)
    except (TypeError, ValueError) as exc:
        raise BiaExactPriceMappingError("INVALID_SELECTION_FORMAT") from exc
    if period < 0 or game_number < 0 or map_number < 0 or map_number > 5:
        raise BiaExactPriceMappingError("INVALID_SELECTION_FORMAT")
    if map_number and sport_code not in {"esports", "e-sports"}:
        raise BiaExactPriceMappingError("BIA_MAP_REQUIRES_ESPORTS")
    esports_unit = str(selection.get("esports_unit") or "").strip().lower()
    if esports_unit not in {"", "rounds", "kills"}:
        raise BiaExactPriceMappingError("BIA_UNSUPPORTED_ESPORTS_UNIT")
    if esports_unit and sport_code not in {"esports", "e-sports"}:
        raise BiaExactPriceMappingError("BIA_ESPORTS_UNIT_REQUIRES_ESPORTS")
    tennis_unit = str(selection.get("tennis_unit") or "").strip().lower()
    if tennis_unit not in {"", "game", "set"}:
        raise BiaExactPriceMappingError("BIA_UNSUPPORTED_TENNIS_UNIT")
    if tennis_unit and sport_code != "tennis":
        raise BiaExactPriceMappingError("BIA_TENNIS_UNIT_REQUIRES_TENNIS")

    def esports_prefix() -> str:
        prefix = f"for,tmap,{map_number}," if map_number else "for,tp,all,"
        if esports_unit == "kills":
            prefix += "sub,kills,"
        return prefix

    if sport_code == "tennis" and game_number:
        if period <= 0 or period > 5 or bet_type != 1 or team_select not in (0, 1):
            raise BiaExactPriceMappingError("BIA_UNSUPPORTED_TENNIS_GAME_MARKET")
        side = "p1" if team_select == 0 else "p2"
        if swapped:
            side = "p2" if side == "p1" else "p1"
        return f"for,tgame,{period},{game_number},vwhatever,{side}"

    if sport_code == "tennis":
        if period > 5:
            raise BiaExactPriceMappingError("BIA_UNSUPPORTED_TENNIS_PERIOD")
        set_no: int | str = period if period > 0 else "all"
        side = "p1" if team_select == 0 else "p2"
        if swapped:
            side = "p2" if side == "p1" else "p1"
        if bet_type == 1 and team_select in (0, 1):
            return f"for,tset,{set_no},vwhatever,{side}"
        if not tennis_unit:
            raise BiaExactPriceMappingError("BIA_TENNIS_UNIT_REQUIRED")
        if bet_type == 2 and team_select in (0, 1):
            return f"for,tset,{set_no},vwhatever,{tennis_unit},ah,{side},{_format_asian_code(selection.get('handicap'))}"
        if bet_type == 3 and team_select in (3, 4):
            direction = "ahover" if team_select == 3 else "ahunder"
            return f"for,tset,{set_no},vwhatever,{tennis_unit},{direction},{_format_asian_code(selection.get('handicap'))}"
        if bet_type in (4, 5):
            valid_team_selects = {
                4: {5: "tahover", 0: "tahunder"},
                5: {7: "tahover", 1: "tahunder"},
            }
            direction = valid_team_selects[bet_type].get(team_select)
            if direction is None:
                raise BiaExactPriceMappingError("UNSUPPORTED_TEAM_TOTAL_TEAM")
            side = "p1" if bet_type == 4 else "p2"
            if swapped:
                side = "p2" if side == "p1" else "p1"
            return (
                f"for,tset,{set_no},vwhole,{tennis_unit},{direction},{side},"
                f"{_format_asian_code(selection.get('handicap'))}"
            )
        raise BiaExactPriceMappingError("UNSUPPORTED_STANDARD_MARKET")

    if bet_type == 1:
        team_map = {
            0: _swapped_side("h", swapped=swapped),
            1: _swapped_side("a", swapped=swapped),
            2: "d",
        }
        side = team_map.get(team_select)
        if not side:
            raise BiaExactPriceMappingError("UNSUPPORTED_MONEYLINE_TEAM")
        if sport_code in {"esports", "e-sports"}:
            if team_select == 2:
                raise BiaExactPriceMappingError("UNSUPPORTED_ESPORTS_MAP_DRAW")
            return f"{esports_prefix()}ml,{side}"
        if _is_soccer_three_way_sport(event_ref):
            return f"for,tp,reg,wdw,{side}"
        if team_select == 2:
            return "for,tp,reg,wdw,d"
        return f"for,ml,{side}"

    if bet_type == 2:
        if team_select not in (0, 1):
            raise BiaExactPriceMappingError("UNSUPPORTED_HANDICAP_TEAM")
        side = _swapped_side("h" if team_select == 0 else "a", swapped=swapped)
        code = _format_asian_code(selection.get("handicap"))
        if sport_code in {"esports", "e-sports"}:
            return f"{esports_prefix()}ah,{side},{code}"
        return f"for,ah,{side},{code}"

    if bet_type == 3:
        code = _format_asian_code(selection.get("handicap"))
        prefix = esports_prefix() if sport_code in {"esports", "e-sports"} else "for,"
        if team_select == 3:
            return f"{prefix}ahover,{code}"
        if team_select == 4:
            return f"{prefix}ahunder,{code}"
        raise BiaExactPriceMappingError("UNSUPPORTED_TOTALS_TEAM")

    if bet_type in (4, 5):
        valid_team_selects = {
            4: {5: "tahover", 0: "tahunder"},
            5: {7: "tahover", 1: "tahunder"},
        }
        direction = valid_team_selects[bet_type].get(team_select)
        if direction is None:
            raise BiaExactPriceMappingError("UNSUPPORTED_TEAM_TOTAL_TEAM")
        side = _swapped_side("h" if bet_type == 4 else "a", swapped=swapped)
        code = _format_asian_code(selection.get("handicap"))
        prefix = esports_prefix() if sport_code in {"esports", "e-sports"} else "for,"
        return f"{prefix}{direction},{side},{code}"

    raise BiaExactPriceMappingError("UNSUPPORTED_STANDARD_MARKET")


def build_bia_betslip_request(
    event_ref: dict[str, Any],
    selection: dict[str, Any],
    *,
    want_bookies: list[str] | None = None,
) -> dict[str, Any]:
    sport_code = str(event_ref.get("sport_code", "") or "").strip()
    event_key = str(event_ref.get("event_key", "") or "").strip()
    if not sport_code or not event_key:
        raise BiaExactPriceMappingError("BIA_EVENT_REF_INCOMPLETE")
    offer_proof = event_ref.get("offer_proof")
    if offer_proof is None:
        raise BiaExactPriceMappingError("BIA_OFFER_PROOF_REQUIRED")
    if not isinstance(offer_proof, dict):
        raise BiaExactPriceMappingError("BIA_OFFER_PROOF_INVALID")
    proved_bet_type = str(
        offer_proof.get("bia_bet_type") or offer_proof.get("bet_type") or ""
    ).strip()
    if (
        not proved_bet_type.startswith("for,")
        or len(proved_bet_type) > 200
        or any(char.isspace() for char in proved_bet_type)
    ):
        raise BiaExactPriceMappingError("BIA_OFFER_PROOF_INVALID")
    return {
        "sport": sport_code,
        "event_id": event_key,
        # Production PMM requests are emitted only from a fresh central raw
        # offer proof.  Selection metadata and prices never invent identity.
        "bet_type": proved_bet_type,
        "equivalent_bets": False,
        "want_bookies": list(want_bookies or ["pin88"]),
    }


def _extract_limit_amount(raw_value: Any) -> float | None:
    if isinstance(raw_value, (int, float)):
        return float(raw_value)
    if isinstance(raw_value, (list, tuple)):
        for item in raw_value:
            if isinstance(item, (int, float)):
                return float(item)
    return None


def extract_pin88_effective_quote(
    msg: BiaPmmMsg,
    *,
    expected_bet_type: str | None = None,
) -> dict[str, Any]:
    if expected_bet_type is not None and not bia_bet_type_matches_exact(
        expected_bet_type, msg.bet_type,
    ):
        return {
            "status": "UNAVAILABLE",
            "error_code": "PMM_BET_TYPE_MISMATCH",
            "bookie": "pin88",
        }
    if str(msg.status_code or "").lower() not in {"", "ok", "active", "success"}:
        return {
            "status": "UNAVAILABLE",
            "error_code": f"PMM_STATUS_{str(msg.status_code or 'unknown').upper()}",
            "bookie": "pin88",
        }
    if not isinstance(msg.price_list, list) or not msg.price_list:
        return {
            "status": "UNAVAILABLE",
            "error_code": "PMM_NO_PRICE_LIST",
            "bookie": "pin88",
        }
    effective = msg.price_list[0].get("effective", {}) if isinstance(msg.price_list[0], dict) else {}
    try:
        odds = float(effective["price"])
    except (KeyError, TypeError, ValueError):
        return {
            "status": "UNAVAILABLE",
            "error_code": "PMM_PRICE_MISSING",
            "bookie": "pin88",
        }
    return {
        "status": "OK",
        "source": "bia_pmm",
        "bookie": "pin88",
        "bet_type": msg.bet_type,
        "odds": odds,
        "min_stake": _extract_limit_amount(effective.get("min")),
        "max_stake": _extract_limit_amount(effective.get("max")),
    }


class BiaExactPriceClient:
    """Serialize BIA PMM requests and return a normalized pin88 quote."""

    def __init__(
        self,
        *,
        request_timeout_sec: float | None = None,
        min_interval_sec: float | None = None,
        rate_limit_retries: int | None = None,
        rate_limit_max_wait_sec: float | None = None,
        want_bookies: list[str] | None = None,
    ):
        self._request_timeout_sec = float(
            request_timeout_sec
            if request_timeout_sec is not None
            else getattr(_cfg, "PS3838_VERIFY_EXACT_PRICE_TIMEOUT_SEC", 8.0)
        )
        self._min_interval_sec = float(
            min_interval_sec
            if min_interval_sec is not None
            else getattr(_cfg, "PS3838_VERIFY_EXACT_PRICE_MIN_INTERVAL_SEC", 1.25)
        )
        self._rate_limit_retries = max(
            0,
            int(
                rate_limit_retries
                if rate_limit_retries is not None
                else getattr(_cfg, "PS3838_VERIFY_EXACT_PRICE_RATE_LIMIT_RETRIES", 2)
            ),
        )
        self._rate_limit_max_wait_sec = max(
            self._min_interval_sec,
            float(
                rate_limit_max_wait_sec
                if rate_limit_max_wait_sec is not None
                else getattr(_cfg, "PS3838_VERIFY_EXACT_PRICE_RATE_LIMIT_MAX_WAIT_SEC", 30.0)
            ),
        )
        self._want_bookies = [
            str(bookie).strip().lower()
            for bookie in (
                want_bookies
                if want_bookies is not None
                else getattr(_cfg, "PS3838_VERIFY_EXACT_PRICE_WANT_BOOKIES", ["pin88"])
            )
            if str(bookie).strip()
        ] or ["pin88"]
        self._http: aiohttp.ClientSession | None = None
        self._bia: BiaSession | None = None
        self._ws: aiohttp.ClientWebSocketResponse | None = None
        self._ws_token: str | None = None
        self._last_dispatch_ts: float = 0.0
        self._rate_limit_streak: int = 0
        self._rate_limited_until_ts: float = 0.0
        self._lock = asyncio.Lock()
        self._ssl_ctx = _make_ssl_ctx()

    async def start(self) -> None:
        if self._http is not None and not self._http.closed:
            return
        timeout = aiohttp.ClientTimeout(total=max(30.0, self._request_timeout_sec + 5.0))
        self._http = aiohttp.ClientSession(cookie_jar=aiohttp.CookieJar(unsafe=True), timeout=timeout)
        self._bia = BiaSession(self._http)

    async def close(self) -> None:
        if self._ws is not None and not self._ws.closed:
            await self._ws.close()
        self._ws = None
        self._ws_token = None
        if self._http is not None and not self._http.closed:
            await self._http.close()
        self._http = None
        self._bia = None

    async def quote_pin88(self, event_ref: dict[str, Any], selection: dict[str, Any]) -> dict[str, Any]:
        try:
            payload = build_bia_betslip_request(event_ref, selection, want_bookies=self._want_bookies)
        except BiaExactPriceMappingError as exc:
            return {
                "status": "UNSUPPORTED",
                "error_code": exc.code,
                "bookie": "pin88",
            }

        async with self._lock:
            try:
                await self.start()
                await self._ensure_ws()
                create_attempt = 0
                while True:
                    betslip_id = ""
                    quote: dict[str, Any] | None = None
                    cleanup_meta: dict[str, Any] | None = None
                    try:
                        await self._respect_rate_limit()
                        created = await self._create_betslip(payload)
                        self._clear_rate_limit_state()
                        betslip_id = str(created.get("betslip_id", "") or "")
                        if not betslip_id:
                            quote = {
                                "status": "ERROR",
                                "error_code": "BIA_BETSLIP_ID_MISSING",
                                "bookie": "pin88",
                            }
                        elif str(created.get("bet_type") or "") != str(payload["bet_type"]):
                            quote = {
                                "status": "UNAVAILABLE",
                                "error_code": "BIA_BET_TYPE_MISMATCH",
                                "bookie": "pin88",
                                "betslip_id": betslip_id,
                            }
                        elif created.get("equivalent_bets") is not False:
                            quote = {
                                "status": "UNAVAILABLE",
                                "error_code": "BIA_EQUIVALENT_BETS_NOT_DISABLED",
                                "bookie": "pin88",
                                "betslip_id": betslip_id,
                            }
                        elif not self._pin88_offered(created, expected_bet_type=payload["bet_type"]):
                            quote = {
                                "status": "UNAVAILABLE",
                                "error_code": "PIN88_NOT_OFFERED",
                                "bookie": "pin88",
                                "betslip_id": betslip_id,
                            }
                        else:
                            quote = await self._wait_for_pin88_quote(
                                betslip_id, expected_bet_type=payload["bet_type"],
                            )
                            quote["betslip_id"] = betslip_id
                    except BiaExactPriceRateLimitError as exc:
                        wait_sec = self._schedule_rate_limit_backoff(exc.retry_after_sec)
                        if create_attempt >= self._rate_limit_retries:
                            return {
                                "status": "RATE_LIMITED",
                                "error_code": "PMM_RATE_LIMITED",
                                "bookie": "pin88",
                                "retry_after_sec": wait_sec,
                                "http_status": exc.http_status,
                                "error": str(exc),
                            }
                        create_attempt += 1
                        logger.info(
                            "BIA exact-price throttled on create; retrying in %.2fs (%d/%d)",
                            wait_sec,
                            create_attempt,
                            self._rate_limit_retries,
                        )
                        await asyncio.sleep(wait_sec)
                        continue
                    finally:
                        if betslip_id:
                            cleanup_meta = await self._delete_betslip_with_retries(betslip_id)
                    if quote is not None:
                        if cleanup_meta:
                            quote.update(cleanup_meta)
                        return quote
            except Exception as exc:
                return {
                    "status": "ERROR",
                    "error_code": "BIA_EXACT_PRICE_ERROR",
                    "bookie": "pin88",
                    "error": str(exc),
                }

    async def _ensure_ws(self) -> None:
        if self._bia is None or self._http is None:
            raise RuntimeError("BIA HTTP session is not initialized")
        token = await self._bia.ensure_token()
        if not token:
            raise RuntimeError("BIA token unavailable")
        if self._ws is not None and not self._ws.closed and self._ws_token == token:
            return
        if self._ws is not None and not self._ws.closed:
            await self._ws.close()
        ws_url = self._bia.ws_url()
        if not ws_url:
            raise RuntimeError("BIA WS URL unavailable")
        self._ws = await self._http.ws_connect(ws_url, heartbeat=25, ssl=self._ssl_ctx)
        self._ws_token = token

    async def _respect_rate_limit(self) -> None:
        now = time.time()
        not_before = max(self._last_dispatch_ts + self._min_interval_sec, self._rate_limited_until_ts)
        if now < not_before:
            await asyncio.sleep(not_before - now)
        self._last_dispatch_ts = time.time()

    async def _create_betslip(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self._bia is None or self._http is None:
            raise RuntimeError("BIA HTTP session is not initialized")
        token = await self._bia.ensure_token()
        if not token:
            raise RuntimeError("BIA token unavailable")
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Origin": _cfg.BIA_BASE_URL,
            "Referer": _cfg.BIA_BASE_URL + "/",
            "session": token,
        }
        timeout = aiohttp.ClientTimeout(total=self._request_timeout_sec)
        async with self._http.post(
            f"{_cfg.BIA_BASE_URL}/v1/betslips/",
            json=payload,
            headers=headers,
            ssl=self._ssl_ctx,
            timeout=timeout,
        ) as resp:
            body = await _read_response_body(resp)
            if resp.status == 429:
                raise BiaExactPriceRateLimitError(
                    operation="create_betslip",
                    http_status=resp.status,
                    retry_after_sec=_extract_retry_after_sec(resp.headers, body),
                    body=body,
                )
            if resp.status != 200:
                raise RuntimeError(
                    f"create betslip failed: HTTP {resp.status} body={_safe_body_repr(body)}"
                )
            return body.get("data", body) if isinstance(body, dict) else {}

    async def _delete_betslip(self, betslip_id: str) -> None:
        if not betslip_id or self._bia is None or self._http is None:
            return
        token = await self._bia.ensure_token()
        if not token:
            return
        headers = {
            "Accept": "application/json",
            "Origin": _cfg.BIA_BASE_URL,
            "Referer": _cfg.BIA_BASE_URL + "/",
            "session": token,
        }
        timeout = aiohttp.ClientTimeout(total=self._request_timeout_sec)
        async with self._http.delete(
            f"{_cfg.BIA_BASE_URL}/v1/betslips/{betslip_id}/",
            headers=headers,
            ssl=self._ssl_ctx,
            timeout=timeout,
        ) as resp:
            if resp.status in {200, 204, 404}:
                return
            body = await _read_response_body(resp)
            if resp.status == 429:
                raise BiaExactPriceRateLimitError(
                    operation="delete_betslip",
                    http_status=resp.status,
                    retry_after_sec=_extract_retry_after_sec(resp.headers, body),
                    body=body,
                )
            raise RuntimeError(
                f"delete betslip failed: HTTP {resp.status} body={_safe_body_repr(body)}"
            )

    def _clear_rate_limit_state(self) -> None:
        self._rate_limit_streak = 0
        self._rate_limited_until_ts = 0.0

    def _schedule_rate_limit_backoff(self, retry_after_sec: float | None) -> float:
        self._rate_limit_streak = min(8, self._rate_limit_streak + 1)
        fallback_wait = self._min_interval_sec * float(2 ** max(0, self._rate_limit_streak - 1))
        wait_sec = retry_after_sec if retry_after_sec and retry_after_sec > 0 else fallback_wait
        wait_sec = max(self._min_interval_sec, min(self._rate_limit_max_wait_sec, float(wait_sec)))
        self._rate_limited_until_ts = max(self._rate_limited_until_ts, time.time() + wait_sec)
        return wait_sec

    async def _delete_betslip_with_retries(self, betslip_id: str) -> dict[str, Any] | None:
        attempt = 0
        while True:
            try:
                await self._delete_betslip(betslip_id)
                self._clear_rate_limit_state()
                return None
            except BiaExactPriceRateLimitError as exc:
                wait_sec = self._schedule_rate_limit_backoff(exc.retry_after_sec)
                if attempt >= self._rate_limit_retries:
                    logger.warning(
                        "BIA exact-price cleanup stayed throttled for betslip %s after %d retries",
                        betslip_id,
                        self._rate_limit_retries,
                    )
                    return {
                        "cleanup_error_code": "PMM_DELETE_RATE_LIMITED",
                        "cleanup_retry_after_sec": wait_sec,
                        "cleanup_error": str(exc),
                    }
                attempt += 1
                logger.info(
                    "BIA exact-price cleanup throttled; retrying in %.2fs (%d/%d)",
                    wait_sec,
                    attempt,
                    self._rate_limit_retries,
                )
                await asyncio.sleep(wait_sec)
            except Exception as exc:
                return {
                    "cleanup_error_code": "BIA_DELETE_BETSLIP_ERROR",
                    "cleanup_error": str(exc),
                }

    def _pin88_offered(
        self,
        created: dict[str, Any],
        *,
        expected_bet_type: str,
    ) -> bool:
        want = {bookie.lower() for bookie in self._want_bookies}
        offered = {
            str(item).strip().lower()
            for item in (created.get("bookies_with_offers") or [])
            if str(item).strip()
        }
        matching_account = False
        wanted_account_present = False
        for account in created.get("accounts") or []:
            if not isinstance(account, dict):
                continue
            if str(account.get("bookie", "")).strip().lower() in want:
                wanted_account_present = True
                if bia_bet_type_matches_exact(expected_bet_type, account.get("bet_type")):
                    matching_account = True
        return matching_account or (bool(offered & want) and not wanted_account_present)

    async def _wait_for_pin88_quote(
        self,
        betslip_id: str,
        *,
        expected_bet_type: str,
    ) -> dict[str, Any]:
        if self._ws is None:
            raise RuntimeError("BIA WS is not connected")
        deadline = time.time() + self._request_timeout_sec
        while time.time() < deadline:
            remaining = max(0.1, min(1.0, deadline - time.time()))
            msg = await self._ws.receive(timeout=remaining)
            if msg.type == aiohttp.WSMsgType.TEXT:
                for parsed in parse_cpricefeed_frame(msg.data):
                    if not isinstance(parsed, BiaPmmMsg):
                        continue
                    if str(parsed.betslip_id) != betslip_id:
                        continue
                    if str(parsed.bookie or "").strip().lower() != "pin88":
                        continue
                    return extract_pin88_effective_quote(
                        parsed, expected_bet_type=expected_bet_type,
                    )
            elif msg.type in {aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED}:
                raise RuntimeError("BIA WS closed while waiting for quote")
            elif msg.type == aiohttp.WSMsgType.ERROR:
                raise RuntimeError(f"BIA WS error: {self._ws.exception()}")
        return {
            "status": "UNAVAILABLE",
            "error_code": "PMM_TIMEOUT",
            "bookie": "pin88",
        }
