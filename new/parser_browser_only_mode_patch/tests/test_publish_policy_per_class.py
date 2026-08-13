"""Phase 5: per-class publish policy tests (TZ §4 / §5)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from aggregator.data_class import DataClass
from aggregator.decision import (
    DEFAULT_HARD_AGE_LIVE_BY_CLASS,
    DEFAULT_HARD_AGE_PREMATCH_BY_CLASS,
    DecisionEngineV2,
)
from aggregator.decision_reasons import DecisionReason
from aggregator.state_machine import SystemMode
from aggregator.types import CandidateQuote


def _cand(
    source_id: str,
    *,
    age_sec: float = 0.0,
    payload: dict | None = None,
    is_tombstone: bool = False,
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
        payload=payload or {},
        collected_at=now,
        received_at=now,
        is_tombstone=is_tombstone,
    )


# ── BASE_EVENT ─────────────────────────────────────────────────────


def test_base_event_official_api_wins_in_normal():
    eng = DecisionEngineV2()
    api = _cand("pinnacle_api", transport="http_pull", payload={"market_class": "event"})
    ws = _cand("pin888:acct-A:browser_ws", payload={"market_class": "event"})
    pq = eng.decide([api, ws], system_mode=SystemMode.NORMAL, data_class=DataClass.BASE_EVENT)
    assert pq is not None
    assert pq.source_used_for_publish == "pinnacle_api"
    assert DecisionReason.FRESH_NATIVE_OFFICIAL_API_PREFERRED.value in pq.decision_reason
    assert pq.decision_reason.endswith(DataClass.BASE_EVENT.value)


# ── BASE_MARKET ────────────────────────────────────────────────────


def test_base_market_browser_ws_wins_in_api_degraded():
    eng = DecisionEngineV2()
    ws = _cand("pin888:acct-A:browser_ws", payload={"market_class": "base"})
    pq = eng.decide([ws], system_mode=SystemMode.API_DEGRADED, data_class=DataClass.BASE_MARKET)
    assert pq is not None
    assert pq.source_used_for_publish == "pin888:acct-A:browser_ws"
    assert pq.degraded is True  # any non-NORMAL mode flags degraded
    assert pq.fallback_state == "API_DEGRADED"
    assert DecisionReason.FRESH_NATIVE_BROWSER_WS_PREFERRED.value in pq.decision_reason


def test_base_market_tab_mode_is_degraded_vs_browser_ws():
    eng = DecisionEngineV2()
    tab = _cand("pin888:acct-X:tab_mode", transport="tab_mode", payload={"market_class": "base"})
    pq = eng.decide([tab], system_mode=SystemMode.NORMAL, data_class=DataClass.BASE_MARKET)
    assert pq is not None
    assert pq.degraded is True
    assert DecisionReason.TAB_FALLBACK_USED.value in pq.decision_reason


def test_base_market_bia_strictly_below_native():
    eng = DecisionEngineV2()
    ws = _cand("pin888:acct-A:browser_ws", payload={"market_class": "base"})
    bia = _cand("bia", family="bia", transport="http_pull", payload={"market_class": "base"})
    pq = eng.decide([ws, bia], system_mode=SystemMode.NORMAL, data_class=DataClass.BASE_MARKET)
    assert pq is not None
    assert pq.publish_authority_class == "pinnacle_native"
    assert pq.source_used_for_publish == "pin888:acct-A:browser_ws"


# ── MORE_BETS_SPECIAL ─────────────────────────────────────────────


def test_specials_browser_wins_when_api_has_no_coverage():
    """TZ §3.3 — when API has no coverage on a special, browser wins."""
    eng = DecisionEngineV2()
    api_empty = _cand(
        "pinnacle_api",
        transport="http_pull",
        payload={"market_class": "special", "outcomes": []},
    )
    ws = _cand(
        "pin888:acct-A:browser_ws",
        payload={
            "market_class": "special",
            "outcomes": [{"market_id": "first_to_5", "outcome_id": "home", "price": 1.5}],
        },
    )
    pq = eng.decide(
        [api_empty, ws],
        system_mode=SystemMode.NORMAL,
        data_class=DataClass.MORE_BETS_SPECIAL,
    )
    assert pq is not None
    assert pq.source_used_for_publish == "pin888:acct-A:browser_ws"
    assert (
        DecisionReason.SPECIALS_BROWSER_PREFERRED_API_NO_COVERAGE.value
        in pq.decision_reason
    )
    assert pq.degraded is False


def test_specials_api_with_coverage_still_wins():
    eng = DecisionEngineV2()
    api = _cand(
        "pinnacle_api",
        transport="http_pull",
        payload={
            "market_class": "special",
            "outcomes": [{"market_id": "first_to_5", "outcome_id": "home", "price": 1.50}],
        },
    )
    ws = _cand(
        "pin888:acct-A:browser_ws",
        payload={
            "market_class": "special",
            "outcomes": [{"market_id": "first_to_5", "outcome_id": "home", "price": 1.55}],
        },
    )
    pq = eng.decide([api, ws], system_mode=SystemMode.NORMAL, data_class=DataClass.MORE_BETS_SPECIAL)
    assert pq is not None
    assert pq.source_used_for_publish == "pinnacle_api"
    assert DecisionReason.FRESH_NATIVE_OFFICIAL_API_PREFERRED.value in pq.decision_reason


# ── LIFECYCLE / tombstones ─────────────────────────────────────────


def test_lifecycle_tombstone_from_native_short_circuits():
    eng = DecisionEngineV2()
    live = _cand("pinnacle_api", transport="http_pull", payload={"market_class": "base"})
    tomb = _cand(
        "pin888:acct-A:browser_ws", is_tombstone=True, payload={"market_class": "lifecycle"}
    )
    pq = eng.decide([live, tomb], system_mode=SystemMode.NORMAL)
    assert pq is not None
    assert pq.is_tombstone is True
    assert pq.decision_reason == DecisionReason.TOMBSTONE_FROM_NATIVE_SOURCE.value


def test_lifecycle_tombstone_from_bia_does_not_preempt():
    eng = DecisionEngineV2()
    live = _cand("pin888:acct-A:browser_ws", payload={"market_class": "base"})
    bia_tomb = _cand("bia", family="bia", transport="http_pull", is_tombstone=True)
    pq = eng.decide([live, bia_tomb], system_mode=SystemMode.NORMAL)
    assert pq is not None
    assert pq.is_tombstone is False
    assert pq.source_used_for_publish == "pin888:acct-A:browser_ws"


# ── per-class freshness budget ─────────────────────────────────────


def test_per_class_hard_age_table_drops_stale_base_market():
    """Per-class table: BASE_MARKET live cutoff is 15s by default."""
    eng = DecisionEngineV2(
        per_class_hard_age_live=DEFAULT_HARD_AGE_LIVE_BY_CLASS,
        per_class_hard_age_prematch=DEFAULT_HARD_AGE_PREMATCH_BY_CLASS,
    )
    very_old = _cand(
        "pinnacle_api", transport="http_pull", age_sec=20.0,
        payload={"market_class": "base"},
    )
    pq = eng.decide([very_old], system_mode=SystemMode.NORMAL, data_class=DataClass.BASE_MARKET)
    assert pq is None  # dropped by per-class hard age (15s < 20s)


def test_per_class_hard_age_table_keeps_lifecycle_longer():
    """LIFECYCLE class tolerates more age (60s default)."""
    eng = DecisionEngineV2(
        per_class_hard_age_live=DEFAULT_HARD_AGE_LIVE_BY_CLASS,
    )
    middle = _cand(
        "pin888:acct-A:browser_ws", age_sec=20.0,
        is_tombstone=True, payload={"market_class": "lifecycle"},
    )
    pq = eng.decide([middle], system_mode=SystemMode.NORMAL, data_class=DataClass.LIFECYCLE)
    assert pq is not None
    assert pq.is_tombstone is True


# ── confidence / authority tiebreak ────────────────────────────────


def test_native_outranks_bia_at_same_freshness():
    eng = DecisionEngineV2()
    ws = _cand("pin888:acct-A:browser_ws", age_sec=0.5)
    bia = _cand("bia", family="bia", transport="http_pull", age_sec=0.5)
    pq = eng.decide([ws, bia], system_mode=SystemMode.NORMAL, data_class=DataClass.BASE_MARKET)
    assert pq is not None
    assert pq.publish_authority_class == "pinnacle_native"
    assert pq.source_used_for_publish == "pin888:acct-A:browser_ws"
