"""MoreBets source-priority dispatcher (Story 27.5 / AC-2, AC-3, AC-4, AC-7).

Drives source selection per (event, market_family): tries L1 (Partner
API), falls through to L2 (WS + Tabs substitute) subject to a token-
bucket rate limit, and finally L3 (BIA) subject to a min-confidence
gate. The result is a :class:`DispatchDecision` describing which
source won, or why nothing did.

The dispatcher is **pure** — it does not perform network I/O. Instead
it accepts per-tick :class:`SourceQuote` snapshots from the caller
(the adapter wiring that sits one level up) and picks the winning
source based on the policy. This makes it trivially unit-testable.

Rate limiting is intentionally per-tier (shared L2 budget between WS
and Tabs), per-(sport_id, family) to match DOD-5 / AC-3.

BIA min-confidence filter (AC-4 / DOD-6) rejects low-confidence
candidates before they can win; the rejection is recorded in
``DispatchDecision.rejected`` for audit.

Observability counters (AC-7 / DOD-10) are exposed via :meth:`stats`.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Iterable, Optional

from aggregator.morebets_policy import MoreBetsFamilyPolicy, MoreBetsPolicy
from aggregator.sources.arcadia_morebets_helper import (
    ArcadiaMoreBetsHelper,
    arcadia_l3_helper_enabled,
)


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SourceQuote:
    """A candidate quote from a given source at a point in time.

    ``age_sec`` is the observed freshness (``received_at - last_updated``).
    ``match_confidence`` is populated for BIA; for api/ws it defaults to
    ``1.0`` (Pinnacle-native — exact event identity).
    ``present`` is False when the source was polled but returned nothing
    usable (no quote for this event or the budget was exhausted).
    """

    source: str  # "api" | "ws" | "bia"
    present: bool
    age_sec: float = 0.0
    match_confidence: float = 1.0


@dataclass
class DispatchDecision:
    """Outcome of a single dispatch call."""

    winning_source: str | None
    reason_detail: str
    rejected: list[tuple[str, str]] = field(default_factory=list)  # (source, reason)

    @property
    def resolved(self) -> bool:
        return self.winning_source is not None


# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------


class _TokenBucket:
    """Simple token bucket per (sport_id, family) — L2-tier shared.

    Burst capacity equals the configured ``qps_ceil``; tokens refill at
    ``qps_ceil`` / second. ``try_acquire`` returns True on success (1
    token deducted) and False when budget is exhausted.

    Monotonic clock so suspended processes don't accidentally refund
    minutes of tokens on resume.
    """

    __slots__ = ("_tokens", "_capacity", "_refill_rate", "_last_refill")

    def __init__(self, *, qps_ceil: float, burst: float | None = None) -> None:
        self._capacity: float = float(burst if burst is not None else qps_ceil)
        self._refill_rate: float = float(qps_ceil)
        self._tokens: float = self._capacity
        self._last_refill: float = time.monotonic()

    def try_acquire(self, *, now: float | None = None) -> bool:
        now_ts = float(now) if now is not None else time.monotonic()
        elapsed = max(0.0, now_ts - self._last_refill)
        self._tokens = min(
            self._capacity, self._tokens + elapsed * self._refill_rate
        )
        self._last_refill = now_ts
        if self._tokens >= 1.0:
            self._tokens -= 1.0
            return True
        return False

    def available(self, *, now: float | None = None) -> float:
        now_ts = float(now) if now is not None else time.monotonic()
        elapsed = max(0.0, now_ts - self._last_refill)
        return min(self._capacity, self._tokens + elapsed * self._refill_rate)


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------


@dataclass
class _DispatcherStats:
    attempts_total: int = 0
    success_by_source: dict[str, int] = field(default_factory=dict)
    fallback_total: int = 0  # dispatches where L1 did not win
    exhausted_total: int = 0  # all priority tiers failed
    ws_budget_exhausted_total: int = 0
    bia_rejected_low_confidence_total: int = 0

    def as_dict(self) -> dict[str, int | dict[str, int]]:
        return {
            "morebets_dispatch_attempts_total": self.attempts_total,
            "morebets_dispatch_success_by_source_total": dict(self.success_by_source),
            "morebets_dispatch_fallback_total": self.fallback_total,
            "morebets_dispatch_exhausted_total": self.exhausted_total,
            "morebets_ws_budget_exhausted_total": self.ws_budget_exhausted_total,
            "morebets_bia_rejected_low_confidence_total": self.bia_rejected_low_confidence_total,
        }


class MoreBetsDispatcher:
    """Source-priority dispatcher for MoreBets markets.

    Usage::

        dispatcher = MoreBetsDispatcher(policy=policy)
        decision = dispatcher.dispatch(
            sport_id=29,
            market_family="corners",
            quotes=[api_quote, ws_quote, bia_quote],
        )
        if decision.resolved:
            publish_from(decision.winning_source)

    ``policy`` is captured by reference at construction; :meth:`swap_policy`
    atomically replaces it for live SIGHUP reloads (Story 27.5.B).
    """

    def __init__(
        self,
        *,
        policy: MoreBetsPolicy,
        arcadia_helper: ArcadiaMoreBetsHelper | None = None,
    ) -> None:
        self._policy: MoreBetsPolicy = policy
        # DOD-5: key is ``(sport_id, family, tier)`` — ``tier="l2"`` is the
        # only tier that currently carries a bucket, but the 3-tuple keeps
        # the contract extensible if a future L3 tier gets its own budget.
        self._buckets: dict[tuple[int, str, str], _TokenBucket] = {}
        self._stats: _DispatcherStats = _DispatcherStats()
        # Story 27.16 AC-3/AC-5: optional Arcadia L3 helper.
        # Injected at construction time; None if MSP_ARCADIA_L3_HELPER_ENABLED=0.
        self._arcadia: ArcadiaMoreBetsHelper | None = arcadia_helper

    # ── policy ---------------------------------------------------------

    @property
    def policy(self) -> MoreBetsPolicy:
        return self._policy

    def swap_policy(self, new_policy: MoreBetsPolicy) -> None:
        """Atomic policy replacement (SIGHUP reload support)."""
        self._policy = new_policy
        # Bucket keys are per-family; if a family's l2_qps_ceil changed,
        # the existing bucket keeps its *balance* but will refill at the
        # new rate on next try_acquire. Acceptable for the reload path.

    # ── dispatch -------------------------------------------------------

    def dispatch(
        self,
        *,
        sport_id: int,
        market_family: str,
        quotes: Iterable[SourceQuote],
        pid: int | None = None,
    ) -> DispatchDecision:
        self._stats.attempts_total += 1
        family_policy = self._policy.for_family(market_family)
        quotes_by_source = {q.source: q for q in quotes}
        rejected: list[tuple[str, str]] = []

        for idx, source in enumerate(family_policy.priority_order):
            quote = quotes_by_source.get(source)
            if quote is None or not quote.present:
                rejected.append((source, f"{source}_absent"))
                continue

            decision = self._try_source(
                sport_id=sport_id,
                family=market_family,
                family_policy=family_policy,
                source=source,
                quote=quote,
                rejected=rejected,
            )
            if decision is not None:
                # L1 winning = idx 0; otherwise fallback.
                if idx > 0:
                    self._stats.fallback_total += 1
                self._stats.success_by_source[source] = (
                    self._stats.success_by_source.get(source, 0) + 1
                )
                return decision

        # Story 27.16 AC-3/AC-5: Arcadia L3 fallback when all other sources fail.
        # Only active when MSP_ARCADIA_L3_HELPER_ENABLED=1 and a pid was provided.
        if self._arcadia is not None and arcadia_l3_helper_enabled() and pid is not None:
            arcadia_data = self._arcadia.fetch_morebet(pid)
            if arcadia_data is not None:
                self._stats.success_by_source["arcadia_l3"] = (
                    self._stats.success_by_source.get("arcadia_l3", 0) + 1
                )
                return DispatchDecision(
                    winning_source="arcadia_l3",
                    reason_detail="morebet_arcadia_helper",
                    rejected=list(rejected),
                )

        # Nothing resolved.
        self._stats.exhausted_total += 1
        return DispatchDecision(
            winning_source=None,
            reason_detail=self._build_exhausted_reason(rejected),
            rejected=rejected,
        )

    def _try_source(
        self,
        *,
        sport_id: int,
        family: str,
        family_policy: MoreBetsFamilyPolicy,
        source: str,
        quote: SourceQuote,
        rejected: list[tuple[str, str]],
    ) -> Optional[DispatchDecision]:
        if source == "api":
            if quote.age_sec > family_policy.stale_api_sec:
                rejected.append((source, "api_stale"))
                return None
            return DispatchDecision(
                winning_source="api",
                reason_detail="l1_api_fresh",
                rejected=list(rejected),
            )

        if source == "ws":
            if quote.age_sec > family_policy.stale_ws_sec:
                rejected.append((source, "ws_stale"))
                return None
            # L2-tier token bucket shared for WS + Tabs (Tabs substitute
            # uses the same `ws` source id; DOD-5 contract).
            bucket = self._ensure_bucket(
                sport_id=sport_id,
                family=family,
                qps_ceil=family_policy.l2_qps_ceil,
            )
            if not bucket.try_acquire():
                self._stats.ws_budget_exhausted_total += 1
                rejected.append((source, "ws_budget_exhausted"))
                return None
            return DispatchDecision(
                winning_source="ws",
                reason_detail="l2_ws_fresh",
                rejected=list(rejected),
            )

        if source == "bia":
            min_conf = float(family_policy.min_confidence.get("bia", 0.85))
            if quote.match_confidence < min_conf:
                self._stats.bia_rejected_low_confidence_total += 1
                rejected.append((source, "bia_low_confidence"))
                return None
            return DispatchDecision(
                winning_source="bia",
                reason_detail="l3_bia_fallback",
                rejected=list(rejected),
            )

        # Unknown source label in priority_order — schema should have
        # caught this, but be defensive.
        rejected.append((source, "unknown_source_label"))
        return None

    def _ensure_bucket(
        self, *, sport_id: int, family: str, qps_ceil: float, tier: str = "l2"
    ) -> _TokenBucket:
        """Return the bucket for ``(sport_id, family, tier)`` — DOD-5 3-tuple key."""
        key: tuple[int, str, str] = (int(sport_id), family, tier)
        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = _TokenBucket(qps_ceil=qps_ceil)
            self._buckets[key] = bucket
        return bucket

    @staticmethod
    def _build_exhausted_reason(rejected: list[tuple[str, str]]) -> str:
        if not rejected:
            return "no_sources_configured"
        return "exhausted_" + "_".join(f"{src}:{why}" for src, why in rejected)

    # ── observability -------------------------------------------------

    def stats(self) -> dict[str, int | dict[str, int]]:
        return self._stats.as_dict()

    def bucket_snapshot(self) -> dict[tuple[int, str, str], float]:
        """Available tokens per ``(sport_id, family, tier)``. For /stats surface.

        Tier is canonically ``"l2"`` in V1 — the 3-tuple key keeps the
        contract future-proof for per-tier budgets (e.g. separate L3
        bucket if BIA ever acquires its own rate limit).
        """
        return {key: bucket.available() for key, bucket in self._buckets.items()}


__all__ = [
    "DispatchDecision",
    "MoreBetsDispatcher",
    "SourceQuote",
]
