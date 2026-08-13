"""Phase 5 integration: pin888 + pinnacle_api + piwi247 fixtures →
matcher → engine → feed in each profile.

No real network — all sources fed from in-test fixtures. Verifies that
the Phase 5 outcome-granular path, cross-source matcher, per-class
policy, and view profiles cooperate end-to-end behind opt-in flags.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from aggregator.cross_source_matcher import (
    CrossSourceMatcher,
    EventDescriptor,
)
from aggregator.data_class import DataClass
from aggregator.decision import DecisionEngineV2
from aggregator.state_machine import SystemMode
from aggregator.types import (
    CandidateQuote,
    SystemState,
)
from aggregator.views import (
    ViewProfile,
    build_snapshot_payload,
    render,
)


def _ts(*args) -> datetime:
    return datetime(*args, tzinfo=timezone.utc)


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── fixture set: same fixture observed by 3 sources ─────────────────


def _three_source_candidates() -> tuple[CandidateQuote, CandidateQuote, CandidateQuote]:
    base = _now()
    api_payload = {
        "market_class": "base",
        "outcomes": [
            {"market_id": "1x2", "outcome_id": "home", "price": 1.91},
            {"market_id": "1x2", "outcome_id": "away", "price": 4.20},
        ],
    }
    pin_payload = {
        "market_class": "base",
        "outcomes": [
            {"market_id": "1x2", "outcome_id": "home", "price": 1.92},
            {"market_id": "1x2", "outcome_id": "away", "price": 4.10},
            {"market_id": "1x2", "outcome_id": "draw", "price": 3.50},
        ],
    }
    piwi_payload = {
        "market_class": "base",
        "outcomes": [
            {"market_id": "1x2", "outcome_id": "home", "price": 1.93},
        ],
    }
    api = CandidateQuote(
        source_id="pinnacle_api", family="pinnacle_native",
        transport="http_pull", event_id="pinnacle_api:9001",
        payload=api_payload, collected_at=base, received_at=base,
    )
    pin = CandidateQuote(
        source_id="pin888:acct-A:browser_ws", family="pinnacle_native",
        transport="browser_ws", event_id="pin888:12345",
        payload=pin_payload,
        collected_at=base - timedelta(milliseconds=200),
        received_at=base - timedelta(milliseconds=180),
    )
    piwi = CandidateQuote(
        source_id="piwi247:acct-X:browser_ws", family="pinnacle_native",
        transport="browser_ws", event_id="piwi247:abc",
        payload=piwi_payload,
        collected_at=base - timedelta(milliseconds=500),
        received_at=base - timedelta(milliseconds=480),
    )
    return api, pin, piwi


# ── matcher ─────────────────────────────────────────────────────────


def test_matcher_groups_three_sources_to_same_match_key():
    m = CrossSourceMatcher()
    descs = [
        EventDescriptor(
            sport="soccer", league="EPL",
            home_team="Arsenal", away_team="Chelsea",
            start_time=_ts(2026, 4, 19, 15, 30),
        ),
        EventDescriptor(
            sport="Soccer", league="epl",
            home_team="ARSENAL", away_team="Chelsea",
            start_time=_ts(2026, 4, 19, 15, 30),
        ),
        EventDescriptor(
            sport="soccer", league="EPL",
            home_team="Arsenal", away_team="chelsea",
            start_time=_ts(2026, 4, 19, 15, 32),
        ),
    ]
    buckets = m.group(descs)
    assert len(buckets) == 1, f"expected 1 bucket, got {buckets}"
    (single_key,) = buckets.keys()
    assert single_key.startswith("match:soccer:epl:")


# ── engine + outcome-granular ───────────────────────────────────────


def test_engine_outcome_granular_three_sources_resolution():
    api, pin, piwi = _three_source_candidates()
    eng = DecisionEngineV2(emit_outcomes=True)
    pq = eng.decide(
        [api, pin, piwi],
        system_mode=SystemMode.NORMAL,
        data_class=DataClass.BASE_MARKET,
    )
    assert pq is not None

    # Event-level winner: API has highest authority and is fresh.
    assert pq.source_used_for_publish == "pinnacle_api"
    assert pq.publish_authority_class == "pinnacle_native"
    assert pq.degraded is False

    # Per-outcome winners.
    by_oid = {o.outcome_id: o for o in pq.outcomes}
    # home + away — API wins (highest authority).
    assert by_oid["home"].source_used_for_publish == "pinnacle_api"
    assert by_oid["home"].price == 1.91
    assert by_oid["away"].source_used_for_publish == "pinnacle_api"
    # draw — only pin888 has it.
    assert by_oid["draw"].source_used_for_publish == "pin888:acct-A:browser_ws"
    assert by_oid["draw"].price == 3.50

    # All outcomes carry decision_reason and provenance.
    for o in pq.outcomes:
        assert o.decision_reason
        assert o.publish_authority_class in {"pinnacle_native", "bia"}


# ── full pipeline → view profiles ───────────────────────────────────


def test_full_pipeline_renders_each_view_profile():
    api, pin, piwi = _three_source_candidates()
    eng = DecisionEngineV2(emit_outcomes=True)
    pq = eng.decide(
        [api, pin, piwi],
        system_mode=SystemMode.NORMAL,
        system_state=SystemState.NORMAL,
        data_class=DataClass.BASE_MARKET,
    )
    assert pq is not None

    lw = render(pq, ViewProfile.LIGHTWEIGHT)
    an = render(pq, ViewProfile.ANALYTICS)
    dbg = render(pq, ViewProfile.DEBUG)

    # Outcomes carried through.
    assert {o["outcome_id"] for o in lw["outcomes"]} == {"home", "away", "draw"}
    assert lw["system_state"] == "normal"

    # analytics carries decision_reason; debug carries source.
    assert "decision_reason" in an
    assert "source_used_for_publish" in dbg

    # Snapshot payload wraps it.
    snap = build_snapshot_payload(ViewProfile.DEBUG, [pq],
                                  state_machine_snapshot={"system_mode": "normal"})
    assert snap["count"] == 1
    assert snap["state_machine"]["system_mode"] == "normal"


# ── degraded mode end-to-end ────────────────────────────────────────


def test_pipeline_under_api_degraded_mode_picks_browser_ws():
    """API gone → browser_ws wins; degraded flag propagates to view."""
    api, pin, piwi = _three_source_candidates()
    # Simulate API being absent in this poll.
    eng = DecisionEngineV2(emit_outcomes=True)
    pq = eng.decide(
        [pin, piwi],
        system_mode=SystemMode.API_DEGRADED,
        data_class=DataClass.BASE_MARKET,
    )
    assert pq is not None
    assert pq.source_used_for_publish == "pin888:acct-A:browser_ws"
    assert pq.degraded is True
    assert pq.fallback_state == "API_DEGRADED"

    an = render(pq, ViewProfile.ANALYTICS)
    assert an["degraded"] is True
    assert an["fallback_state"] == "API_DEGRADED"


# ── tombstone propagation ───────────────────────────────────────────


def test_tombstone_short_circuits_full_pipeline():
    api, pin, piwi = _three_source_candidates()
    base = _now()
    tomb = CandidateQuote(
        source_id="pin888:acct-A:browser_ws",
        family="pinnacle_native", transport="browser_ws",
        event_id="pin888:12345", payload={}, collected_at=base, received_at=base,
        is_tombstone=True,
    )
    eng = DecisionEngineV2(emit_outcomes=True)
    pq = eng.decide(
        [api, piwi, tomb],
        system_mode=SystemMode.NORMAL,
    )
    assert pq is not None
    assert pq.is_tombstone is True
    assert pq.source_used_for_publish == "pin888:acct-A:browser_ws"
    # Outcomes still carry candidate audit (we extract from non-tomb peers).
    dbg = render(pq, ViewProfile.DEBUG)
    assert dbg["is_tombstone"] is True
