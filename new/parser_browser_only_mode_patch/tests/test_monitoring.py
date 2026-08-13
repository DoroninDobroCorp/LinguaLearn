"""Phase 8: PlatformMonitor tests."""

from __future__ import annotations

from datetime import datetime, timezone

from aggregator.monitoring import PlatformMonitor
from aggregator.state_machine import (
    SourceHealthRegistry,
    SystemMode,
    SystemModeMonitor,
)


def _utc(y=2026, mo=6, d=1, h=12, m=0, s=0):
    return datetime(y, mo, d, h, m, s, tzinfo=timezone.utc)


# ── snapshot shape ────────────────────────────────────────────────


def test_snapshot_returns_correct_keys():
    mon = PlatformMonitor()
    snap = mon.snapshot(now=_utc())
    expected_keys = {
        "system_mode",
        "api_health",
        "per_account_health",
        "source_coverage",
        # Story 27.12 DOD-4 — flat per-source age alias.
        "per_source_max_age_sec",
        "publish_source_distribution",
        "match_stats",
        "stale_rate",
        "failover_log_tail",
        "consumer_delivery",
        "uptime",
        # Story 27.3.C — per-source degraded flags.
        "pinnacle_api_degraded",
        "pinnacle_api_rate_limited",
        "pin888_ws_degraded",
        # Story 27.3.E / AC-6 — observability.
        "pinnacle_api_enabled",
        "pinnacle_api_stats",
        # Story 27.3.F — top-level /health aliases per DOD-10.
        "pinnacle_api_last_poll_age_sec",
        "pinnacle_api_coverage_events_count",
        # Story 27.4.E — L2/tabs/coverage surface fields.
        "tabs_fallback_allowed",
        "tabs_fallback_active",
        "tabs_fallback_reason",
        "tabs_fallback_state",
        "ps3838_ws_complement_events_count",
        "ps3838_ws_degraded",
        "pin888_ws_session_rotating",
        "core_coverage_gaps_count",
        "ps3838_ws_events_admitted_during_stale_diff_total",
        # Story 27.13 AC-6 — pin888 WS gap surface.
        "pin888_ws_gaps_total",
        "pin888_ws_gap_max_sec",
        "pin888_ws_last_event_age_sec",
        # Story 27.5 — MoreBetsDispatcher wiring.
        "morebets_dispatcher_enabled",
        "morebets_dispatcher_stats",
        # Story 27.16 — Arcadia L3 helper counters.
        "arcadia_l3_helper_enabled",
        "arcadia_l3_stats",
        # BIA observer lifecycle.
        "bia",
    }
    assert set(snap.keys()) == expected_keys


def test_snapshot_system_mode_unknown_when_no_monitor():
    mon = PlatformMonitor()
    snap = mon.snapshot(now=_utc())
    assert snap["system_mode"] == "unknown"


def test_snapshot_system_mode_from_monitor():
    health = SourceHealthRegistry()
    smm = SystemModeMonitor(health=health)
    smm.force_mode(SystemMode.NORMAL)
    mon = PlatformMonitor(system_mode_monitor=smm)
    snap = mon.snapshot(now=_utc())
    assert snap["system_mode"] == "normal"


def test_snapshot_uptime():
    start = _utc(h=10)
    mon = PlatformMonitor(_start_time=start)
    snap = mon.snapshot(now=_utc(h=12))
    assert snap["uptime"] == 7200.0


# ── stale_rate ────────────────────────────────────────────────────


def test_stale_rate_zero_when_no_publishes():
    mon = PlatformMonitor()
    snap = mon.snapshot()
    assert snap["stale_rate"] == 0.0


def test_stale_rate_calculation():
    mon = PlatformMonitor()
    # 3 total, 1 degraded → 1/3
    mon.record_publish(degraded=False, source="api")
    mon.record_publish(degraded=True, source="ws")
    mon.record_publish(degraded=False, source="api")
    snap = mon.snapshot()
    assert abs(snap["stale_rate"] - 1 / 3) < 1e-9


def test_publish_source_distribution():
    mon = PlatformMonitor()
    mon.record_publish(source="api")
    mon.record_publish(source="api")
    mon.record_publish(source="ws")
    snap = mon.snapshot()
    assert snap["publish_source_distribution"] == {"api": 2, "ws": 1}


def test_bia_snapshot_default_disabled() -> None:
    mon = PlatformMonitor()
    snap = mon.snapshot(now=_utc())
    assert snap["bia"]["enabled"] is False
    assert snap["bia"]["state"] == "disabled"


def test_bia_snapshot_provider_is_forwarded() -> None:
    mon = PlatformMonitor(
        bia_snapshot_provider=lambda **_: {
            "enabled": True,
            "running": True,
            "state": "connected",
            "connected": True,
        }
    )
    snap = mon.snapshot(now=_utc())
    assert snap["bia"]["enabled"] is True
    assert snap["bia"]["state"] == "connected"


# ── consumer delivery ────────────────────────────────────────────


def test_consumer_delivery_tracking():
    mon = PlatformMonitor()
    ts = _utc()
    mon.record_consumer_delivery(consumer_count=5, ts=ts)
    snap = mon.snapshot()
    assert snap["consumer_delivery"]["connected_consumers"] == 5
    assert snap["consumer_delivery"]["last_delta_ts"] == ts.isoformat()


# ── source coverage ──────────────────────────────────────────────


def test_source_coverage_from_health_registry():
    health = SourceHealthRegistry()
    now = _utc()
    health.mark_event("api_source", when=now)
    health.mark_event("api_source", when=now)
    health.mark_event("ws_source", when=now)
    mon = PlatformMonitor(source_health_registry=health)
    snap = mon.snapshot(now=now)
    assert snap["source_coverage"]["api_source"]["event_count"] == 2
    assert snap["source_coverage"]["ws_source"]["event_count"] == 1


# ── match stats ──────────────────────────────────────────────────


def test_match_stats_from_matcher():
    from aggregator.cross_source_matcher import CrossSourceMatcher, MatchStats

    matcher = CrossSourceMatcher()
    matcher.stats = MatchStats(matched=10, unmatched_missing_field=2, unmatched_outside_window=1)
    mon = PlatformMonitor(cross_source_matcher=matcher)
    snap = mon.snapshot()
    assert snap["match_stats"] == {"matched": 10, "unmatched": 2, "collision": 1}


# ── failover log tail ────────────────────────────────────────────


def test_failover_log_tail_empty():
    mon = PlatformMonitor()
    snap = mon.snapshot()
    assert snap["failover_log_tail"] == []


# ── Story 27.3.C per-source degraded flags ───────────────────────────


class _FakeAdapter:
    """Tiny stand-in for a source adapter with a degraded/rate_limited state."""

    def __init__(self, *, degraded: bool = False, rate_limited: bool = False) -> None:
        self.degraded = degraded
        self.rate_limited = rate_limited


def test_pinnacle_api_degraded_false_when_no_adapter() -> None:
    mon = PlatformMonitor()
    snap = mon.snapshot()
    assert snap["pinnacle_api_degraded"] is False
    assert snap["pinnacle_api_rate_limited"] is False


def test_pinnacle_api_degraded_propagates_from_adapter() -> None:
    adapter = _FakeAdapter(degraded=True, rate_limited=False)
    mon = PlatformMonitor(pinnacle_api_source=adapter)
    snap = mon.snapshot()
    assert snap["pinnacle_api_degraded"] is True
    assert snap["pinnacle_api_rate_limited"] is False


def test_pinnacle_api_rate_limited_propagates_from_adapter() -> None:
    adapter = _FakeAdapter(degraded=False, rate_limited=True)
    mon = PlatformMonitor(pinnacle_api_source=adapter)
    snap = mon.snapshot()
    assert snap["pinnacle_api_degraded"] is False
    assert snap["pinnacle_api_rate_limited"] is True


def test_pin888_ws_degraded_default_false() -> None:
    mon = PlatformMonitor()
    snap = mon.snapshot()
    assert snap["pin888_ws_degraded"] is False


def test_pin888_ws_degraded_propagates() -> None:
    legacy = _FakeAdapter(degraded=True)
    mon = PlatformMonitor(pin888_bridge=legacy)
    snap = mon.snapshot()
    assert snap["pin888_ws_degraded"] is True


def test_pin888_and_api_degraded_are_independent() -> None:
    api = _FakeAdapter(degraded=True)
    legacy = _FakeAdapter(degraded=False)
    mon = PlatformMonitor(pinnacle_api_source=api, pin888_bridge=legacy)
    snap = mon.snapshot()
    # AC-4: API degraded flag does not drag legacy into degraded.
    assert snap["pinnacle_api_degraded"] is True
    assert snap["pin888_ws_degraded"] is False


def test_api_degraded_does_not_flip_when_only_legacy_down() -> None:
    # Mirror: AC-5 — legacy WS down does not make API degraded.
    api = _FakeAdapter(degraded=False)
    legacy = _FakeAdapter(degraded=True)
    mon = PlatformMonitor(pinnacle_api_source=api, pin888_bridge=legacy)
    snap = mon.snapshot()
    assert snap["pinnacle_api_degraded"] is False
    assert snap["pin888_ws_degraded"] is True
