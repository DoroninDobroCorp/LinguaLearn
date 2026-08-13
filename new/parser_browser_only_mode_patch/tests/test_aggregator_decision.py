"""Unit tests for `aggregator.decision.DecisionEngine` (Phase 1 policy)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from aggregator.decision import DecisionEngine
from aggregator.types import CandidateQuote, SystemState


def _cand(source_id: str, *, payload=None, age_sec: float = 0.0, is_tombstone: bool = False) -> CandidateQuote:
    now = datetime.now(timezone.utc) - timedelta(seconds=age_sec)
    return CandidateQuote(
        source_id=source_id,
        family="pinnacle_native",
        transport="browser_ws",
        event_id="pin888:1",
        payload=payload or {"Pid": 1},
        collected_at=now,
        received_at=now,
        is_tombstone=is_tombstone,
    )


def test_no_candidates_yields_none():
    eng = DecisionEngine()
    assert eng.decide([]) is None


def test_single_candidate_pass_through():
    eng = DecisionEngine()
    c = _cand("pin888:A")
    pq = eng.decide([c])
    assert pq is not None
    assert pq.event_id == "pin888:1"
    assert pq.source_used_for_publish == "pin888:A"
    assert pq.publish_authority_class == "pinnacle_native"
    assert pq.decision_reason == "single_source_pass_through"
    assert pq.degraded is False
    assert pq.payload is c.payload
    assert pq.all_candidate_sources == []


def test_multi_candidate_picks_freshest():
    eng = DecisionEngine()
    older = _cand("pin888:A", age_sec=2.0)
    newer = _cand("pin888:B", age_sec=0.0)
    pq = eng.decide([older, newer])
    assert pq is not None
    assert pq.source_used_for_publish == "pin888:B"
    losers = pq.all_candidate_sources
    assert len(losers) == 1
    assert losers[0].source == "pin888:A"
    assert losers[0].rejected_reason == "not_freshest"
    assert losers[0].age_ms >= 0


def test_tombstone_passes_through_with_flag():
    eng = DecisionEngine()
    pq = eng.decide([_cand("pin888:A", is_tombstone=True)])
    assert pq is not None
    assert pq.is_tombstone is True


def test_system_state_propagates_to_published_quote():
    eng = DecisionEngine()
    pq = eng.decide([_cand("pin888:A")], system_state=SystemState.API_DEGRADED)
    assert pq is not None
    assert pq.system_state_snapshot == SystemState.API_DEGRADED


def test_freshness_ms_is_recorded():
    eng = DecisionEngine()
    pq = eng.decide([_cand("pin888:A", age_sec=1.0)])
    assert pq is not None
    assert pq.freshness_ms >= 800  # ~1s, allow scheduling jitter
