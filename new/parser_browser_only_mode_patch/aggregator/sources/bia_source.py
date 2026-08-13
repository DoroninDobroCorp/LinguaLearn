"""BIA source adapter — Story 27.6 (AC-4, AC-6, DOD-7..10).

BIA-shape events become ``SourceEvent`` instances with
``family="bia"`` and ``source_kind="bia"`` so the MoreBets dispatcher
(Story 27.5) can route them as L3 candidates. The adapter:

1. Accepts raw BIA events via :meth:`ingest_bia_event`.
2. Filters to MoreBets-eligible market families only. Core markets
   (``BASE_MARKET``, ``BASE_EVENT``) are **dropped** with the
   ``bia_core_writes_blocked_total`` counter incremented — invariant
   8 from Epic-27.
3. Extracts ``match_confidence`` from the matcher (if supplied) and
   carries it in the emitted :class:`SourceEvent.confidence` field so
   the dispatcher can enforce ``min_confidence.bia``.
4. Exposes counters compatible with AC-7.

The adapter does **not** perform any network I/O — it's a pure
translation layer between BIA observer messages and the aggregator
contract. Callers wrap it with whatever integration glue the runtime
actually uses (the bia_observer module or a test stub).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from aggregator.types import SourceEvent


DEFAULT_SOURCE_ID = "bia"
DEFAULT_FAMILY = "bia"
DEFAULT_TRANSPORT = "bia_ws"

# MoreBets market families BIA is allowed to contribute to. Core
# families ("1x2", "handicap_full", "totals_full" etc.) are excluded
# per Epic-27 invariant 8.
_MOREBETS_ALLOWED_FAMILIES: frozenset[str] = frozenset({
    "corners",
    "cards",
    "player_props",
    "period_totals",
    "alt_totals",
    "alt_handicaps",
    "first_half_1x2",
    "first_team_totals",
    "second_team_totals",
    "odd_even",
    "unknown_family",
})

_log = logging.getLogger("aggregator.sources.bia")


@dataclass
class _BiaSourceStats:
    messages_received_by_type: dict[str, int] = field(default_factory=dict)
    events_matched_total: int = 0
    events_unmatched_total: int = 0
    source_events_emitted_total: int = 0
    core_writes_blocked_total: int = 0
    low_confidence_dropped_total: int = 0


@dataclass
class BiaSourceAdapter:
    """MoreBets-only source adapter wrapping the BIA observer feed.

    The runtime wires a BIA event callback into :meth:`ingest_bia_event`
    which inspects the event shape, decides whether it's a MoreBets
    candidate, and calls the supplied ``emit_callback`` with a ready
    :class:`SourceEvent`. Core-market BIA messages are blocked at this
    layer (counter inc + debug log).

    Parameters
    ----------
    emit_callback:
        Function called once per admitted event; signature
        ``(event: SourceEvent) -> None``. The caller is responsible
        for feeding the event into their aggregator pipeline.
    matcher_fn:
        Optional callable returning ``match_confidence`` ∈ [0,1] for a
        BIA event. When missing the adapter assumes ``1.0`` — the
        match was already confirmed upstream.
    now_fn:
        Optional clock hook for tests.
    """

    emit_callback: Callable[[SourceEvent], None]
    matcher_fn: Optional[Callable[[dict], float]] = None
    now_fn: Callable[[], datetime] = field(
        default_factory=lambda: lambda: datetime.now(timezone.utc)
    )
    source_id: str = DEFAULT_SOURCE_ID
    family: str = DEFAULT_FAMILY
    transport: str = DEFAULT_TRANSPORT
    _stats: _BiaSourceStats = field(default_factory=_BiaSourceStats)

    # ── Core API ------------------------------------------------------

    def ingest_bia_event(
        self,
        *,
        event_type: str,
        payload: dict[str, Any],
        event_id: str | None = None,
    ) -> bool:
        """Process one BIA observer message.

        Returns ``True`` iff a SourceEvent was emitted (MoreBets +
        confidence gate passed); ``False`` otherwise.
        """
        # Counter bookkeeping first — every message counted even if dropped.
        self._stats.messages_received_by_type[event_type] = (
            self._stats.messages_received_by_type.get(event_type, 0) + 1
        )

        market_family = self._extract_family(payload)

        # AC-1 / DOD-8 — core-market BIA writes blocked here.
        if market_family not in _MOREBETS_ALLOWED_FAMILIES:
            self._stats.core_writes_blocked_total += 1
            _log.debug(
                "bia_source dropped core-market payload family=%s", market_family
            )
            return False

        # AC-6 — reuse the matcher to compute confidence.
        if self.matcher_fn is not None:
            try:
                confidence = float(self.matcher_fn(payload))
            except Exception:  # noqa: BLE001
                confidence = 0.0
        else:
            confidence = float(payload.get("match_confidence", 1.0))

        if confidence <= 0.0:
            self._stats.events_unmatched_total += 1
            return False

        # Bound to [0, 1].
        confidence = max(0.0, min(1.0, confidence))
        self._stats.events_matched_total += 1

        ev_id = event_id or str(payload.get("event_id") or payload.get("pid") or "")
        now = self.now_fn()
        scoped_payload = dict(payload)
        # Canonical, immutable scope marker consumed by both decision engines.
        # Do not trust a caller-provided data_class for BIA.
        scoped_payload["market_class"] = "more_bets"
        scoped_payload["market_family"] = market_family
        source_event = SourceEvent(
            source_id=self.source_id,
            family=self.family,
            transport=self.transport,
            event_id=ev_id,
            payload=scoped_payload,
            collected_at=now,
            received_at=now,
            confidence=confidence,
        )
        self._stats.source_events_emitted_total += 1
        try:
            self.emit_callback(source_event)
        except Exception:  # noqa: BLE001 — never let a consumer break us
            _log.exception("bia_source emit_callback raised")
        return True

    def drop_as_unmatched(self, *, event_type: str) -> None:
        """Called by the runtime when a matcher failed to find a Pinnacle
        counterpart. Bumps the ``unmatched`` counter for AC-7."""
        self._stats.messages_received_by_type[event_type] = (
            self._stats.messages_received_by_type.get(event_type, 0) + 1
        )
        self._stats.events_unmatched_total += 1

    # ── Observability -------------------------------------------------

    def stats(self) -> dict[str, Any]:
        return {
            "bia_messages_received_total": dict(
                self._stats.messages_received_by_type
            ),
            "bia_events_matched_total": self._stats.events_matched_total,
            "bia_events_unmatched_total": self._stats.events_unmatched_total,
            "bia_source_events_emitted_total": {
                "scope=morebets": self._stats.source_events_emitted_total
            },
            "bia_core_writes_blocked_total": self._stats.core_writes_blocked_total,
            "bia_low_confidence_dropped_total": self._stats.low_confidence_dropped_total,
        }

    # ── Helpers -------------------------------------------------------

    @staticmethod
    def _extract_family(payload: dict[str, Any]) -> str:
        """Return the BIA event's ``market_family`` label.

        BIA messages may tag the family under ``market_family`` or
        ``family`` — treat both as canonical. Unknown → ``"unknown_family"``
        so the MoreBets dispatcher's fallback slot can still serve it.
        """
        for key in ("market_family", "family"):
            raw = payload.get(key)
            if isinstance(raw, str) and raw:
                return raw
        return "unknown_family"


__all__ = [
    "BiaSourceAdapter",
]
