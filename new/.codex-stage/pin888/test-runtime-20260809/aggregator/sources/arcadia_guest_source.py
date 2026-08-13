"""Arcadia Guest API source adapter — Story 27.9.

Active L1-replacement adapter for the Pinnacle front-end Guest API.
Activates ONLY when both conditions hold:

1. ``MSP_ARCADIA_STANDBY_ENABLED=1`` (feature flag, default off).
2. Partner API (L1) circuit is open (consulted via injected callback
   over :class:`aggregator.l1_circuit._L1CircuitTracker`).

When inactive, :meth:`poll_once` increments a counter and returns
without any network I/O — safe to call on every tick. When active, it
fetches Arcadia matchups + markets, joins them via the normalizer,
and emits the resulting :class:`aggregator.types.SourceEvent` instances
through ``emit_callback``.

Invariants (non-negotiable, from Epic-27 P0-4):

1. Arcadia is a **standby L1-replacement**, NOT a parallel source.
2. Becomes the active publisher **only** when
   ``_L1CircuitTracker.is_open`` for the Partner API source.
3. No freshness-based override — age comparisons between Arcadia and
   Partner API never trigger a swap.
4. The core cascade stays ``L1 (Partner API OR Arcadia standby) → L2
   WS → Tabs``; Arcadia does NOT add a new tier.

Story 27.1 spike verdict: AMBER — development unblocked, production
flip gated on pre-enable parity check vs Partner API over a live
window (see ``docs/ARCADIA_RESEARCH_REPORT.md``).
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from aggregator.sources.arcadia_guest_client import (
    ArcadiaApiError,
    ArcadiaApiRateLimitError,
    ArcadiaApiServerError,
    ArcadiaApiTransportError,
    ArcadiaGuestClient,
)
from aggregator.sources.arcadia_guest_normalizer import normalize_snapshot
from aggregator.types import SourceEvent


DEFAULT_ARCADIA_ENABLED_ENV = "MSP_ARCADIA_STANDBY_ENABLED"
DEFAULT_ARCADIA_SPORT_IDS: tuple[int, ...] = (29, 4, 19)  # soccer, bball, tennis

_log = logging.getLogger("aggregator.sources.arcadia")


def arcadia_standby_enabled(env: dict[str, str] | None = None) -> bool:
    """Return True iff ``MSP_ARCADIA_STANDBY_ENABLED`` is set.

    Default off — matches Story 27.9 gating. Operators flip to ``1``
    only after the Story 27.1 spike's follow-up parity check confirms
    Arcadia divergence vs Partner API stays below the configured
    threshold.
    """
    source = env if env is not None else os.environ
    raw = (source.get(DEFAULT_ARCADIA_ENABLED_ENV) or "").strip()
    return raw in ("1", "true", "True", "yes")


@dataclass
class ArcadiaStandbyAdapter:
    """Gated Arcadia Guest API source adapter.

    Parameters
    ----------
    is_partner_api_circuit_open:
        Callable returning True when the Partner API (L1) circuit
        tracker reports ``is_open``. The adapter consults this hook
        on every ``is_active`` / ``poll_once`` call.
    emit_callback:
        Consumer to receive :class:`SourceEvent` instances. Required
        for the active path; can be ``None`` during skeleton testing.
    client:
        Optional :class:`ArcadiaGuestClient` instance. When omitted and
        ``poll_once`` needs to execute, a fresh client is built from
        env via :meth:`ArcadiaGuestClient.from_env`.
    sport_ids:
        Sports to poll. Defaults to the Story 27.9 canonical set
        (29=soccer, 4=basketball, 19=tennis).
    """

    is_partner_api_circuit_open: Callable[[], bool]
    emit_callback: Optional[Callable[[SourceEvent], None]] = None
    client: Optional[ArcadiaGuestClient] = None
    sport_ids: tuple[int, ...] = DEFAULT_ARCADIA_SPORT_IDS
    source_id: str = "arcadia_guest"
    family: str = "pinnacle_native"  # Arcadia is still Pinnacle-owned data
    transport: str = "http_pull_guest"

    # Internal counters — always present so /stats surface is consistent.
    _activations_total: int = 0
    _poll_attempts_total: int = 0
    _events_emitted_total: int = 0
    _errors_by_class: dict[str, int] = field(
        default_factory=lambda: {
            "rate_limit": 0,
            "server": 0,
            "transport": 0,
            "other": 0,
        }
    )
    _last_poll_ts: Optional[float] = None
    _enabled_override: Optional[bool] = field(default=None)

    def enabled(self) -> bool:
        """True iff the feature flag is set (env-driven)."""
        if self._enabled_override is not None:
            return bool(self._enabled_override)
        return arcadia_standby_enabled()

    def is_active(self) -> bool:
        """True iff Arcadia should be **the** L1 publisher right now.

        Both conditions must hold:

        * flag enabled (``MSP_ARCADIA_STANDBY_ENABLED=1``);
        * Partner API circuit is open.

        If either is false → False, so the core dispatcher keeps
        publishing Partner API quotes.
        """
        if not self.enabled():
            return False
        try:
            return bool(self.is_partner_api_circuit_open())
        except Exception:  # noqa: BLE001
            # Defensive: if the callback blows up, we refuse to
            # activate — Partner API stays authoritative.
            return False

    # ── Polling ------------------------------------------------------

    def _resolve_client(self) -> ArcadiaGuestClient:
        if self.client is not None:
            return self.client
        self.client = ArcadiaGuestClient.from_env()
        return self.client

    def poll_once(self) -> int:
        """Run one poll cycle. Returns the number of events emitted.

        Fast path when inactive: increments the attempt counter and
        returns ``0``. No network I/O while the gate is closed.

        When active, iterates the configured sports, fetches matchups
        + markets per sport, normalises the joined payload into
        Pin888-shape game dicts, and emits each as a
        :class:`SourceEvent` via ``emit_callback``. Transport errors
        / rate-limits are bucketed in :attr:`_errors_by_class` and
        never propagate — the loop continues with the next sport.
        """
        self._poll_attempts_total += 1
        self._last_poll_ts = time.time()
        if not self.is_active():
            return 0
        self._activations_total += 1
        client = self._resolve_client()

        emitted = 0
        for sport_id in self.sport_ids:
            try:
                matchups = client.fetch_matchups(sport_id, with_specials=False)
                markets = client.fetch_markets(sport_id)
            except ArcadiaApiRateLimitError:
                self._errors_by_class["rate_limit"] += 1
                _log.warning("arcadia sport=%s rate-limited", sport_id)
                continue
            except ArcadiaApiServerError as e:
                self._errors_by_class["server"] += 1
                _log.warning("arcadia sport=%s server error %s", sport_id, e.status)
                continue
            except ArcadiaApiTransportError as e:
                self._errors_by_class["transport"] += 1
                _log.warning("arcadia sport=%s transport %s", sport_id, e)
                continue
            except ArcadiaApiError as e:
                self._errors_by_class["other"] += 1
                _log.warning("arcadia sport=%s api %s", sport_id, e)
                continue
            except Exception:  # noqa: BLE001 — defensive; never break the caller
                self._errors_by_class["other"] += 1
                continue

            games = normalize_snapshot(matchups=matchups, markets=markets)
            now = datetime.now(timezone.utc)
            for game in games:
                pid = game.get("Pid")
                if not isinstance(pid, int):
                    continue
                event = SourceEvent(
                    source_id=self.source_id,
                    family=self.family,
                    transport=self.transport,
                    event_id=f"{self.source_id}:{pid}",
                    payload=game,
                    collected_at=now,
                    received_at=now,
                )
                if self.emit_callback is not None:
                    try:
                        self.emit_callback(event)
                    except Exception:  # noqa: BLE001
                        _log.exception("emit_callback raised for pid=%s", pid)
                        continue
                emitted += 1
        self._events_emitted_total += emitted
        return emitted

    # ── Observability ------------------------------------------------

    def stats(self) -> dict[str, Any]:
        return {
            "arcadia_standby_enabled": self.enabled(),
            "arcadia_standby_active": self.is_active(),
            "arcadia_standby_activations_total": self._activations_total,
            "arcadia_standby_poll_attempts_total": self._poll_attempts_total,
            "arcadia_standby_events_emitted_total": self._events_emitted_total,
            "arcadia_standby_errors_by_class": dict(self._errors_by_class),
            "arcadia_standby_last_poll_age_sec": (
                max(0.0, time.time() - self._last_poll_ts)
                if self._last_poll_ts is not None
                else None
            ),
            "source_id": self.source_id,
        }


__all__ = [
    "ArcadiaStandbyAdapter",
    "DEFAULT_ARCADIA_ENABLED_ENV",
    "DEFAULT_ARCADIA_SPORT_IDS",
    "arcadia_standby_enabled",
]
