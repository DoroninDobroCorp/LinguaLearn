"""Decision engine v2 — per-data-class authority tests (TZ §4-§6).

Covers:
- per-class authority winners (API > WS > TAB > BIA)
- freshness ties broken by authority class
- degraded / fallback_state flags per SystemMode
- LIFECYCLE tombstone short-circuit
- HARD_DEGRADED / STOPPED → no publish
- v2 disabled by default; enabled via MSP_DECISION_V2_ENABLED
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from aggregator.data_class import DataClass
from aggregator.decision import (
    DecisionEngine,
    DecisionEngineV2,
    build_default_engine,
    decision_v2_enabled,
)
from aggregator.state_machine import SystemMode
from aggregator.types import CandidateQuote, SystemState


def _cand(
    source_id: str,
    *,
    age_sec: float = 0.0,
    payload: dict | None = None,
    is_tombstone: bool = False,
    confidence: float = 1.0,
    family: str = "pinnacle_native",
    transport: str = "browser_ws",
    event_id: str = "agg:1",
) -> CandidateQuote:
    now = datetime.now(timezone.utc) - timedelta(seconds=age_sec)
    return CandidateQuote(
        source_id=source_id,
        family=family,
        transport=transport,
        event_id=event_id,
        payload=payload or {"Pid": 1, "market_class": "base"},
        collected_at=now,
        received_at=now,
        is_tombstone=is_tombstone,
        confidence=confidence,
    )


# ── opt-in flag ───────────────────────────────────────────────────────


def test_v2_off_by_default(monkeypatch):
    monkeypatch.delenv("MSP_DECISION_V2_ENABLED", raising=False)
    assert decision_v2_enabled() is False
    assert isinstance(build_default_engine(), DecisionEngine)


def test_v2_opt_in(monkeypatch):
    monkeypatch.setenv("MSP_DECISION_V2_ENABLED", "1")
    assert decision_v2_enabled() is True
    assert isinstance(build_default_engine(), DecisionEngineV2)


# ── per-class authority ordering (TZ §4) ──────────────────────────────


def test_official_api_beats_browser_ws_in_normal_mode():
    eng = DecisionEngineV2()
    api = _cand("pinnacle_api", age_sec=0.0, transport="http_pull")
    ws = _cand("pin888:acct-A:browser_ws", age_sec=0.0, transport="browser_ws")
    pq = eng.decide([api, ws], system_mode=SystemMode.NORMAL)
    assert pq is not None
    assert pq.source_used_for_publish == "pinnacle_api"
    assert pq.publish_authority_class == "pinnacle_native"
    assert pq.degraded is False
    assert "fresh_native_official_api" in pq.decision_reason


def test_browser_ws_beats_tab_mode():
    eng = DecisionEngineV2()
    ws = _cand("pin888:acct-A:browser_ws", age_sec=0.0)
    tab = _cand("pin888:acct-X:tab_mode", age_sec=0.0, transport="tab_mode")
    pq = eng.decide([tab, ws], system_mode=SystemMode.NORMAL)
    assert pq is not None
    assert pq.source_used_for_publish == "pin888:acct-A:browser_ws"


def test_tab_mode_winner_is_marked_degraded():
    eng = DecisionEngineV2()
    tab = _cand("pin888:acct-X:tab_mode", age_sec=0.0, transport="tab_mode")
    pq = eng.decide([tab], system_mode=SystemMode.NORMAL)
    assert pq is not None
    assert pq.source_used_for_publish == "pin888:acct-X:tab_mode"
    assert pq.degraded is True
    assert "tab_fallback" in pq.decision_reason


def test_pinnacle_native_always_beats_bia_when_both_fresh():
    eng = DecisionEngineV2()
    bia = _cand("bia", age_sec=0.1, family="bia", transport="http_pull")
    ws = _cand("pin888:acct-A:browser_ws", age_sec=0.5)
    pq = eng.decide([bia, ws], system_mode=SystemMode.NORMAL)
    assert pq is not None
    assert pq.source_used_for_publish == "pin888:acct-A:browser_ws"
    assert pq.publish_authority_class == "pinnacle_native"
    # The BIA loser should be audited with lower_authority.
    losers = {c.source: c.rejected_reason for c in pq.all_candidate_sources}
    assert losers.get("bia") == "lower_authority"


def test_bia_only_winner_marks_degraded_and_bia_assisted_state():
    eng = DecisionEngineV2()
    bia = _cand("bia", age_sec=0.1, family="bia", transport="http_pull")
    pq = eng.decide([bia], system_mode=SystemMode.BIA_ASSISTED_DEGRADED)
    assert pq is not None
    assert pq.source_used_for_publish == "bia"
    assert pq.publish_authority_class == "bia"
    assert pq.degraded is True
    assert pq.fallback_state == "BIA_ASSISTED"


# ── freshness tiebreakers ─────────────────────────────────────────────


def test_freshness_breaks_tie_within_same_authority_class():
    eng = DecisionEngineV2()
    older = _cand("pin888:acct-A:browser_ws", age_sec=2.0)
    newer = _cand("ps3838:acct-X:browser_ws", age_sec=0.0)
    pq = eng.decide([older, newer], system_mode=SystemMode.NORMAL)
    assert pq is not None
    assert pq.source_used_for_publish == "ps3838:acct-X:browser_ws"


def test_authority_class_beats_freshness():
    """API older but higher tier still beats fresher browser-WS."""
    eng = DecisionEngineV2()
    api_old = _cand("pinnacle_api", age_sec=2.0, transport="http_pull")
    ws_new = _cand("pin888:acct-A:browser_ws", age_sec=0.0)
    pq = eng.decide([api_old, ws_new], system_mode=SystemMode.NORMAL)
    assert pq is not None
    assert pq.source_used_for_publish == "pinnacle_api"


# ── per-mode minimum + degraded flag ──────────────────────────────────


def test_normal_mode_with_browser_ws_only_not_degraded():
    """In NORMAL mode, browser-WS still meets the minimum native tier."""
    eng = DecisionEngineV2()
    ws = _cand("pin888:acct-A:browser_ws", age_sec=0.0)
    pq = eng.decide([ws], system_mode=SystemMode.NORMAL)
    assert pq is not None
    assert pq.degraded is False
    assert pq.fallback_state is None


def test_api_degraded_mode_browser_ws_winner_degraded_with_state():
    eng = DecisionEngineV2()
    ws = _cand("pin888:acct-A:browser_ws", age_sec=0.0)
    pq = eng.decide([ws], system_mode=SystemMode.API_DEGRADED)
    assert pq is not None
    assert pq.degraded is True
    assert pq.fallback_state == "API_DEGRADED"


def test_pool_degraded_mode_api_winner_degraded_with_state():
    eng = DecisionEngineV2()
    api = _cand("pinnacle_api", age_sec=0.0, transport="http_pull")
    pq = eng.decide([api], system_mode=SystemMode.POOL_DEGRADED)
    assert pq is not None
    assert pq.degraded is True
    assert pq.fallback_state == "POOL_DEGRADED"


def test_hard_degraded_publishes_nothing():
    eng = DecisionEngineV2()
    api = _cand("pinnacle_api", age_sec=0.0, transport="http_pull")
    assert eng.decide([api], system_mode=SystemMode.HARD_DEGRADED) is None
    assert eng.decide([api], system_mode=SystemMode.STOPPED) is None


# ── LIFECYCLE / tombstone short-circuit ───────────────────────────────


def test_tombstone_from_native_wins_over_live_quotes():
    eng = DecisionEngineV2()
    live = _cand("pinnacle_api", age_sec=0.0, transport="http_pull")
    tomb = _cand("pin888:acct-A:browser_ws", age_sec=0.5, is_tombstone=True)
    pq = eng.decide([live, tomb], system_mode=SystemMode.NORMAL)
    assert pq is not None
    assert pq.is_tombstone is True
    assert pq.source_used_for_publish == "pin888:acct-A:browser_ws"
    assert pq.decision_reason == "tombstone_from_native_source"


def test_tombstone_from_bia_does_not_short_circuit_native_live():
    """BIA tombstones must not silence a live native quote (TZ §2)."""
    eng = DecisionEngineV2()
    bia_tomb = _cand("bia", age_sec=0.0, family="bia", transport="http_pull", is_tombstone=True)
    live = _cand("pin888:acct-A:browser_ws", age_sec=0.0)
    pq = eng.decide([bia_tomb, live], system_mode=SystemMode.NORMAL)
    assert pq is not None
    # The native live wins; the tombstone is not from a native source so
    # the short-circuit does not fire.
    assert pq.source_used_for_publish == "pin888:acct-A:browser_ws"
    assert pq.is_tombstone is False


# ── unknown / expired candidates ──────────────────────────────────────


def test_unknown_source_profile_is_skipped():
    eng = DecisionEngineV2()
    unk = _cand("never_seen:foo")
    api = _cand("pinnacle_api", age_sec=0.0, transport="http_pull")
    pq = eng.decide([unk, api], system_mode=SystemMode.NORMAL)
    assert pq is not None
    assert pq.source_used_for_publish == "pinnacle_api"
    # The unknown source is still logged in the loser audit.
    sources = [c.source for c in pq.all_candidate_sources]
    assert "never_seen:foo" in sources


def test_expired_candidate_is_dropped_by_hard_max_age():
    eng = DecisionEngineV2(hard_max_age_sec_live=2.0)
    fresh = _cand("pin888:acct-A:browser_ws", age_sec=0.0)
    expired = _cand("pinnacle_api", age_sec=10.0, transport="http_pull")
    pq = eng.decide([fresh, expired], system_mode=SystemMode.NORMAL)
    assert pq is not None
    # Expired API dropped; fresh WS wins despite lower tier.
    assert pq.source_used_for_publish == "pin888:acct-A:browser_ws"


def test_no_acceptable_candidates_returns_none():
    eng = DecisionEngineV2(hard_max_age_sec_live=1.0)
    expired = _cand("pinnacle_api", age_sec=10.0, transport="http_pull")
    assert eng.decide([expired], system_mode=SystemMode.NORMAL) is None


def test_empty_candidates_returns_none():
    eng = DecisionEngineV2()
    assert eng.decide([], system_mode=SystemMode.NORMAL) is None


# ── PublishedQuote provenance fields ──────────────────────────────────


def test_published_quote_records_full_provenance():
    eng = DecisionEngineV2()
    api = _cand("pinnacle_api", age_sec=0.0, transport="http_pull")
    ws = _cand("pin888:acct-A:browser_ws", age_sec=0.5)
    bia = _cand("bia", age_sec=0.2, family="bia", transport="http_pull")
    pq = eng.decide([api, ws, bia], system_mode=SystemMode.NORMAL, data_class=DataClass.BASE_MARKET)
    assert pq is not None
    assert pq.source_used_for_publish == "pinnacle_api"
    assert pq.system_state_snapshot is SystemState.NORMAL
    audit = {c.source: c for c in pq.all_candidate_sources}
    assert "pin888:acct-A:browser_ws" in audit
    assert "bia" in audit
    assert audit["bia"].rejected_reason == "lower_authority"
    assert pq.freshness_ms >= 0


@pytest.mark.parametrize(
    "mode,expected_state",
    [
        (SystemMode.NORMAL, None),
        (SystemMode.API_DEGRADED, "API_DEGRADED"),
        (SystemMode.POOL_DEGRADED, "POOL_DEGRADED"),
        (SystemMode.BIA_ASSISTED_DEGRADED, "BIA_ASSISTED"),
    ],
)
def test_fallback_state_matches_system_mode(mode, expected_state):
    """For each non-HARD mode, fallback_state on a winning native quote
    matches the per-mode label (None in NORMAL).
    """
    eng = DecisionEngineV2()
    if mode is SystemMode.BIA_ASSISTED_DEGRADED:
        winner = _cand("bia", age_sec=0.0, family="bia", transport="http_pull")
    elif mode is SystemMode.POOL_DEGRADED:
        winner = _cand("pinnacle_api", age_sec=0.0, transport="http_pull")
    else:
        winner = _cand("pin888:acct-A:browser_ws", age_sec=0.0)
    pq = eng.decide([winner], system_mode=mode)
    assert pq is not None
    assert pq.fallback_state == expected_state


# ── Fix 2: IngestRouter must forward SystemMode from the monitor ──────


def _src_event(
    source_id: str,
    *,
    event_id: str = "agg:wire-1",
    family: str = "pinnacle_native",
    transport: str = "browser_ws",
):
    from aggregator.types import SourceEvent

    n = datetime.now(timezone.utc)
    return SourceEvent(
        source_id=source_id,
        family=family,
        transport=transport,
        event_id=event_id,
        payload={"Pid": 1, "src": source_id},
        collected_at=n,
        received_at=n,
    )


def test_ingest_router_forwards_system_mode_to_engine():
    """End-to-end wiring: when a SystemModeMonitor is wired into
    IngestRouter, the engine must see the monitor's mode (not silently
    default to NORMAL). We assert the *flags* on the PublishedQuote
    change with the monitor's mode — that is what proves the kwarg
    travelled through, regardless of whether per-mode ranking changes
    the winner.
    """
    from aggregator.ingest import IngestRouter
    from aggregator.state_machine import (
        SourceHealthRegistry,
        SystemMode,
        SystemModeMonitor,
    )
    from aggregator.store import ProvenanceStore

    health = SourceHealthRegistry()
    monitor = SystemModeMonitor(health=health)
    monitor.force_mode(SystemMode.API_DEGRADED)

    router = IngestRouter(
        ProvenanceStore(),
        DecisionEngineV2(),
        source_health=health,
        system_mode_monitor=monitor,
    )

    # Both sources publish for the same (event_id, BASE_MARKET) bucket.
    api_ev = _src_event("pinnacle_api", transport="http_pull")
    ws_ev = _src_event("pin888:acct-A:browser_ws")
    router.ingest(api_ev)
    pq = router.ingest(ws_ev)

    # Mode reached the engine: published quote carries the
    # API_DEGRADED fallback_state and degraded=True. Without the wire,
    # the engine would silently see NORMAL and the flags would be
    # (False, None). This is the assertion that distinguishes the two.
    assert pq is not None
    assert pq.degraded is True
    assert pq.fallback_state == "API_DEGRADED"


def test_ingest_router_mode_normal_yields_no_degradation():
    """Control case for the wiring test above: monitor pinned to
    NORMAL → degraded=False, fallback_state=None. Combined with the
    API_DEGRADED test, this proves the kwarg actually flows through.
    """
    from aggregator.ingest import IngestRouter
    from aggregator.state_machine import (
        SourceHealthRegistry,
        SystemMode,
        SystemModeMonitor,
    )
    from aggregator.store import ProvenanceStore

    health = SourceHealthRegistry()
    monitor = SystemModeMonitor(health=health)
    monitor.force_mode(SystemMode.NORMAL)

    router = IngestRouter(
        ProvenanceStore(),
        DecisionEngineV2(),
        source_health=health,
        system_mode_monitor=monitor,
    )
    router.ingest(_src_event("pinnacle_api", transport="http_pull"))
    pq = router.ingest(_src_event("pin888:acct-A:browser_ws"))
    assert pq is not None
    assert pq.degraded is False
    assert pq.fallback_state is None


def test_ingest_router_without_monitor_defaults_to_normal_path():
    """Backward-compat: routers built without ``system_mode_monitor``
    keep working unchanged — the engine sees its default
    ``SystemMode.NORMAL`` and never raises a TypeError.
    """
    from aggregator.ingest import IngestRouter
    from aggregator.store import ProvenanceStore

    router = IngestRouter(ProvenanceStore(), DecisionEngineV2())
    api_ev = _src_event("pinnacle_api", transport="http_pull")
    ws_ev = _src_event("pin888:acct-A:browser_ws")
    router.ingest(api_ev)
    pq = router.ingest(ws_ev)
    # NORMAL mode → OFFICIAL_API outranks BROWSER_WS, no degradation.
    assert pq is not None
    assert pq.source_used_for_publish == "pinnacle_api"
    assert pq.degraded is False
    assert pq.fallback_state is None


def test_ingest_router_with_monitor_uses_v1_engine_too():
    """The v1 engine (``DecisionEngine``) does not accept
    ``system_mode``; the router must gracefully fall back to the v1
    signature when a monitor is wired but the engine is v1.
    """
    from aggregator.ingest import IngestRouter
    from aggregator.state_machine import (
        SourceHealthRegistry,
        SystemMode,
        SystemModeMonitor,
    )
    from aggregator.store import ProvenanceStore

    health = SourceHealthRegistry()
    monitor = SystemModeMonitor(health=health)
    monitor.force_mode(SystemMode.API_DEGRADED)

    router = IngestRouter(
        ProvenanceStore(),
        DecisionEngine(),  # v1 — does not accept system_mode
        source_health=health,
        system_mode_monitor=monitor,
    )
    pq = router.ingest(_src_event("pin888:acct-A:browser_ws"))
    # v1 engine still produces a publish; we only assert no crash.
    assert pq is not None
