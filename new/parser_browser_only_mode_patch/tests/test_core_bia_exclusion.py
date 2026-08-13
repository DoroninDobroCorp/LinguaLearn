"""Tests for Story 27.4.C — BIA exclusion from core decision path (AC-6, DOD-13/14).

Epic-27 invariant: BIA is **never** a publisher for core markets (1X2,
Handicap, Totals). Even when BIA is fresh and pinnacle-native sources
are absent, the engine must not hand core quotes to BIA — "better skip
than wrong match" (TZ v1.0 §2 invariant 3).

The filter operates at the candidate-list boundary: ``DecisionEngine``
drops any ``CandidateQuote`` with ``family in {"bia", "bia_supplement"}``
**before** running the normal publisher-selection logic. The rejected
BIA candidate is still recorded in ``PublishedQuote.all_candidate_sources``
with ``rejected_reason="bia_not_allowed_in_core"`` so operations can
audit the drop.

MoreBets (Story 27.5/27.6) is handled outside the core path and may
include BIA; the engine's ``market_class`` kwarg gates the filter.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from aggregator.decision import (
    BIA_NOT_ALLOWED_IN_CORE_REJECTED_REASON,
    DecisionEngine,
)
from aggregator.types import CandidateQuote, SystemState


def _cand(
    *,
    source_id: str,
    family: str,
    age_ms: int = 0,
    is_tombstone: bool = False,
    event_id: str = "pinnacle:42",
) -> CandidateQuote:
    now = datetime.now(timezone.utc)
    collected = now - timedelta(milliseconds=age_ms)
    return CandidateQuote(
        source_id=source_id,
        family=family,
        transport="http_pull" if "api" in source_id else "ws",
        event_id=event_id,
        payload={"Pid": 42, "Periods": [{"Number": 0, "MoneyLine": {"Home": 1.9}}]},
        collected_at=collected,
        received_at=collected,
        is_tombstone=is_tombstone,
    )


# ---------------------------------------------------------------------------
# Core: BIA is always excluded (DOD-13/14)
# ---------------------------------------------------------------------------


def test_bia_candidate_is_excluded_from_core() -> None:
    engine = DecisionEngine()
    bia = _cand(source_id="bia", family="bia")
    pq = engine.decide([bia], market_class="core")
    # Nothing else to fall back on → engine publishes nothing. "Better
    # skip than wrong match." (TZ v1.0 §2 invariant 3).
    assert pq is None


def test_bia_candidate_is_excluded_even_when_freshest() -> None:
    engine = DecisionEngine()
    bia = _cand(source_id="bia", family="bia", age_ms=0)  # newest
    api = _cand(source_id="pinnacle_api", family="pinnacle_native", age_ms=500)
    pq = engine.decide([bia, api], market_class="core")
    assert pq is not None
    assert pq.source_used_for_publish == "pinnacle_api"


def test_rejected_bia_appears_in_all_candidate_sources_audit() -> None:
    engine = DecisionEngine()
    bia = _cand(source_id="bia", family="bia", age_ms=100)
    ws = _cand(source_id="pin888", family="pinnacle_native", age_ms=200)
    pq = engine.decide([bia, ws], market_class="core")
    assert pq is not None
    rejected_sources = [c.source for c in pq.all_candidate_sources]
    assert "bia" in rejected_sources
    # And its reason is the canonical constant.
    bia_row = next(c for c in pq.all_candidate_sources if c.source == "bia")
    assert bia_row.rejected_reason == BIA_NOT_ALLOWED_IN_CORE_REJECTED_REASON
    assert bia_row.rejected_reason == "bia_not_allowed_in_core"


def test_bia_tombstone_also_excluded_in_core() -> None:
    """TZ invariant — BIA is inadmissible even for lifecycle signals in core."""
    engine = DecisionEngine()
    bia_tomb = _cand(source_id="bia", family="bia", is_tombstone=True)
    api = _cand(source_id="pinnacle_api", family="pinnacle_native")
    pq = engine.decide([bia_tomb, api], market_class="core")
    assert pq is not None
    assert pq.source_used_for_publish == "pinnacle_api"
    assert not pq.is_tombstone


def test_bia_family_variant_also_excluded() -> None:
    """``family="bia_supplement"`` is another canonical BIA label (some
    historical paths tag it this way)."""
    engine = DecisionEngine()
    bia = _cand(source_id="bia:fallback", family="bia_supplement")
    api = _cand(source_id="pinnacle_api", family="pinnacle_native")
    pq = engine.decide([bia, api], market_class="core")
    assert pq.source_used_for_publish == "pinnacle_api"  # type: ignore[union-attr]


# ---------------------------------------------------------------------------
# Non-core paths: BIA is NOT touched by the filter (Story 27.5/27.6 territory)
# ---------------------------------------------------------------------------


def test_bia_admitted_for_more_bets_market_class() -> None:
    """Story 27.5/27.6 rely on BIA for MoreBets; filter must not drop it."""
    engine = DecisionEngine()
    bia = _cand(source_id="bia", family="bia", age_ms=100)
    pq = engine.decide([bia], market_class="more_bets")
    assert pq is not None
    assert pq.source_used_for_publish == "bia"


def test_market_class_none_defaults_to_core_behaviour() -> None:
    """Calling decide without the kwarg must apply BIA-exclusion."""
    engine = DecisionEngine()
    bia = _cand(source_id="bia", family="bia")
    pq = engine.decide([bia])  # no market_class kwarg
    assert pq is None


# ---------------------------------------------------------------------------
# Backwards compat: non-BIA candidate mix continues to work
# ---------------------------------------------------------------------------


def test_api_and_ws_mix_unaffected_by_filter() -> None:
    engine = DecisionEngine()
    api = _cand(source_id="pinnacle_api", family="pinnacle_native", age_ms=300)
    ws = _cand(source_id="pin888", family="pinnacle_native", age_ms=100)
    pq = engine.decide([api, ws], market_class="core")
    assert pq is not None
    # legacy single_source_pass_through: freshest wins.
    assert pq.source_used_for_publish == "pin888"


def test_no_candidates_returns_none() -> None:
    engine = DecisionEngine()
    pq = engine.decide([], market_class="core")
    assert pq is None


def test_only_bia_candidates_return_none_in_core() -> None:
    engine = DecisionEngine()
    bia1 = _cand(source_id="bia:a", family="bia")
    bia2 = _cand(source_id="bia:b", family="bia_supplement")
    pq = engine.decide([bia1, bia2], market_class="core")
    assert pq is None


# ---------------------------------------------------------------------------
# System state kwargs propagate through the filter
# ---------------------------------------------------------------------------


def test_system_state_passes_through_after_filter() -> None:
    engine = DecisionEngine()
    api = _cand(source_id="pinnacle_api", family="pinnacle_native")
    bia = _cand(source_id="bia", family="bia")
    pq = engine.decide(
        [api, bia],
        market_class="core",
        system_state=SystemState.API_DEGRADED,
    )
    assert pq is not None
    assert pq.system_state_snapshot is SystemState.API_DEGRADED
