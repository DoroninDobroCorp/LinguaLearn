"""Phase 5: view profile tests (TZ §8 / §9.4)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from aggregator.types import (
    PublishedOutcome,
    PublishedQuote,
    PublishedQuoteCandidate,
    SystemState,
)
from aggregator.views import (
    ViewProfile,
    build_delta_payload,
    build_snapshot_payload,
    render,
    render_analytics,
    render_debug,
    render_lightweight,
    view_profile_from_env,
)


def _now() -> datetime:
    return datetime(2026, 4, 19, 15, 30, tzinfo=timezone.utc)


def _quote() -> PublishedQuote:
    o = PublishedOutcome(
        event_id="agg:1",
        market_id="1x2",
        outcome_id="home",
        price=1.92,
        source_used_for_publish="pin888:acct-A:browser_ws",
        publish_authority_class="pinnacle_native",
        all_candidate_sources=[
            PublishedQuoteCandidate(source="bia", age_ms=300, price=1.95,
                                    rejected_reason="lower_authority"),
        ],
        freshness_ms=350,
        collected_at=_now(),
        received_at=_now(),
        decision_reason="fresh_native_browser_ws_preferred_base_market",
        degraded=False,
        confidence=0.97,
        data_class="base_market",
    )
    return PublishedQuote(
        event_id="agg:1",
        payload={"market_class": "base"},
        source_used_for_publish="pin888:acct-A:browser_ws",
        publish_authority_class="pinnacle_native",
        all_candidate_sources=[
            PublishedQuoteCandidate(source="pinnacle_api", age_ms=4200,
                                    rejected_reason="less_fresh", price=1.91),
        ],
        freshness_ms=350,
        collected_at=_now(),
        received_at=_now(),
        decision_reason="fresh_native_browser_ws_preferred_base_market",
        degraded=False,
        confidence=0.97,
        system_state_snapshot=SystemState.NORMAL,
        normalized_identifiers={"pinnacle_event_id": 1234567},
        outcomes=[o],
    )


# ── env flag ───────────────────────────────────────────────────────


def test_view_profile_default_lightweight(monkeypatch):
    monkeypatch.delenv("MSP_VIEW_PROFILE", raising=False)
    assert view_profile_from_env() is ViewProfile.LIGHTWEIGHT


def test_view_profile_env_analytics(monkeypatch):
    monkeypatch.setenv("MSP_VIEW_PROFILE", "analytics")
    assert view_profile_from_env() is ViewProfile.ANALYTICS


def test_view_profile_env_debug(monkeypatch):
    monkeypatch.setenv("MSP_VIEW_PROFILE", "debug")
    assert view_profile_from_env() is ViewProfile.DEBUG


# ── lightweight shape ──────────────────────────────────────────────


def test_lightweight_has_only_minimum_fields():
    q = _quote()
    out = render_lightweight(q)
    assert set(out.keys()) == {
        "event_id", "freshness_ms", "degraded", "system_state",
        "is_tombstone", "outcomes",
    }
    assert out["event_id"] == "agg:1"
    assert out["system_state"] == "normal"
    assert out["outcomes"][0] == {
        "market_id": "1x2",
        "outcome_id": "home",
        "price": 1.92,
        "freshness_ms": 350,
    }


def test_lightweight_lacks_provenance_fields():
    q = _quote()
    out = render_lightweight(q)
    assert "all_candidate_sources" not in out
    assert "decision_reason" not in out
    assert "source_used_for_publish" not in out


# ── analytics ⊃ lightweight ─────────────────────────────────────────


def test_analytics_is_superset_of_lightweight():
    q = _quote()
    lw = render_lightweight(q)
    an = render_analytics(q)
    for k in lw:
        assert k in an, f"analytics missing lightweight key {k}"
    # extra fields
    assert "decision_reason" in an
    assert "all_candidate_sources" in an
    assert "publish_authority_class" in an
    assert "fallback_state" in an
    assert "confidence" in an
    # outcome-level extras present
    assert "decision_reason" in an["outcomes"][0]
    assert "publish_authority_class" in an["outcomes"][0]


def test_analytics_lacks_debug_only_fields():
    q = _quote()
    an = render_analytics(q)
    assert "raw_provenance_ref" not in an
    assert "source_used_for_publish" not in an
    assert "normalized_identifiers" not in an


# ── debug ⊃ analytics ──────────────────────────────────────────────


def test_debug_is_superset_of_analytics():
    q = _quote()
    an = render_analytics(q)
    dbg = render_debug(q)
    for k in an:
        assert k in dbg, f"debug missing analytics key {k}"
    assert "raw_provenance_ref" in dbg
    assert "source_used_for_publish" in dbg
    assert "normalized_identifiers" in dbg
    assert "collected_at" in dbg
    # outcome debug fields
    o = dbg["outcomes"][0]
    assert "source_used_for_publish" in o
    assert "is_tombstone" in o


# ── render dispatcher ──────────────────────────────────────────────


def test_render_dispatcher_picks_correct_profile():
    q = _quote()
    assert render(q, ViewProfile.LIGHTWEIGHT) == render_lightweight(q)
    assert render(q, ViewProfile.ANALYTICS) == render_analytics(q)
    assert render(q, ViewProfile.DEBUG) == render_debug(q)


# ── snapshot / delta ───────────────────────────────────────────────


def test_snapshot_payload_includes_count_and_profile():
    q = _quote()
    snap = build_snapshot_payload(ViewProfile.LIGHTWEIGHT, [q, q])
    assert snap["type"] == "snapshot"
    assert snap["profile"] == "lightweight"
    assert snap["count"] == 2
    assert len(snap["events"]) == 2


def test_snapshot_debug_includes_state_machine():
    q = _quote()
    snap = build_snapshot_payload(
        ViewProfile.DEBUG, [q],
        state_machine_snapshot={"system_mode": "normal"},
    )
    assert snap["state_machine"] == {"system_mode": "normal"}


def test_delta_filters_by_since_ts():
    q_old = _quote()
    q_new = _quote()
    q_new.received_at = _now() + timedelta(seconds=10)
    delta = build_delta_payload(
        ViewProfile.LIGHTWEIGHT, _now() + timedelta(seconds=1), [q_old, q_new],
    )
    assert delta["count"] == 1
    assert delta["events"][0]["event_id"] == "agg:1"


def test_delta_with_no_since_includes_all():
    q = _quote()
    delta = build_delta_payload(ViewProfile.ANALYTICS, None, [q, q])
    assert delta["count"] == 2
    assert delta["since"] is None
