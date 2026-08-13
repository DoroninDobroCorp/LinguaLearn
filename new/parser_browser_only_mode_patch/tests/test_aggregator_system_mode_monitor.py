"""Tests for ``SourceHealthRegistry`` + ``SystemModeMonitor`` (TZ §3.3)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from aggregator.state_machine import (
    DEFAULT_HEALTHY_AGE_SEC,
    SourceHealthRegistry,
    SystemMode,
    SystemModeMonitor,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── SourceHealthRegistry ──────────────────────────────────────────────


def test_health_starts_empty():
    h = SourceHealthRegistry()
    assert h.get("pin888:acct-A:browser_ws") is None
    assert h.known_source_ids() == []


def test_mark_event_creates_and_freshens():
    h = SourceHealthRegistry()
    t0 = _now()
    h.mark_event("pin888:acct-A:browser_ws", when=t0)
    rec = h.get("pin888:acct-A:browser_ws")
    assert rec is not None
    assert rec.last_event_at == t0
    assert rec.total_events == 1
    assert rec.is_fresh(now=t0)
    assert rec.is_fresh(now=t0 + timedelta(seconds=DEFAULT_HEALTHY_AGE_SEC - 0.5))
    assert not rec.is_fresh(now=t0 + timedelta(seconds=DEFAULT_HEALTHY_AGE_SEC + 1))


def test_failure_bumps_consecutive_count_then_event_resets():
    h = SourceHealthRegistry()
    h.mark_failure("pinnacle_api")
    h.mark_failure("pinnacle_api")
    rec = h.get("pinnacle_api")
    assert rec is not None and rec.consecutive_failures == 2
    h.mark_event("pinnacle_api")
    rec = h.get("pinnacle_api")
    assert rec is not None and rec.consecutive_failures == 0


# ── SystemModeMonitor — per-mode transitions ──────────────────────────


def _monitor() -> tuple[SourceHealthRegistry, SystemModeMonitor]:
    h = SourceHealthRegistry()
    m = SystemModeMonitor(health=h, min_dwell_sec=0)
    return h, m


def test_normal_when_api_and_browser_ws_both_fresh():
    h, m = _monitor()
    now = _now()
    h.mark_event("pinnacle_api", when=now)
    h.mark_event("pin888:acct-A:browser_ws", when=now)
    assert m.compute_mode(now=now) is SystemMode.NORMAL


def test_api_degraded_when_only_browser_ws_fresh():
    h, m = _monitor()
    now = _now()
    h.mark_event("pin888:acct-A:browser_ws", when=now)
    assert m.compute_mode(now=now) is SystemMode.API_DEGRADED


def test_pool_degraded_when_only_api_fresh():
    h, m = _monitor()
    now = _now()
    h.mark_event("pinnacle_api", when=now)
    assert m.compute_mode(now=now) is SystemMode.POOL_DEGRADED


def test_bia_assisted_when_only_bia_fresh():
    h, m = _monitor()
    now = _now()
    h.mark_event("bia", when=now)
    assert m.compute_mode(now=now) is SystemMode.BIA_ASSISTED_DEGRADED


def test_hard_degraded_when_nothing_fresh():
    h, m = _monitor()
    now = _now()
    # Old events present but past the API healthy threshold (120s).
    h.mark_event("pinnacle_api", when=now - timedelta(seconds=121))
    assert m.compute_mode(now=now) is SystemMode.HARD_DEGRADED


def test_hard_degraded_when_no_events_at_all():
    _h, m = _monitor()
    assert m.compute_mode() is SystemMode.HARD_DEGRADED


def test_recovery_to_normal_is_instant_no_dwell():
    h = SourceHealthRegistry()
    m = SystemModeMonitor(health=h, min_dwell_sec=60)
    now = _now()
    # Pre-condition: we are already in a degraded mode.
    m.force_mode(SystemMode.API_DEGRADED)
    m.force_mode(None)  # release override but keep _current_mode
    h.mark_event("pin888:acct-A:browser_ws", when=now)
    # API comes back: should flip to NORMAL immediately, not wait dwell.
    h.mark_event("pinnacle_api", when=now)
    assert m.compute_mode(now=now) is SystemMode.NORMAL


def test_degradation_requires_dwell_when_configured():
    h = SourceHealthRegistry()
    m = SystemModeMonitor(health=h, min_dwell_sec=10)
    now = _now()
    h.mark_event("pinnacle_api", when=now)
    h.mark_event("pin888:acct-A:browser_ws", when=now)
    assert m.compute_mode(now=now) is SystemMode.NORMAL
    # API silent for >120s (API healthy threshold); pin888 still fresh → proposed = API_DEGRADED.
    later = now + timedelta(seconds=130)
    h.mark_event("pin888:acct-A:browser_ws", when=later)
    # First observation: still NORMAL (within dwell).
    assert m.compute_mode(now=later) is SystemMode.NORMAL
    # After dwell elapsed: switch.
    later2 = later + timedelta(seconds=11)
    h.mark_event("pin888:acct-A:browser_ws", when=later2)
    assert m.compute_mode(now=later2) is SystemMode.API_DEGRADED


def test_force_mode_overrides_computation():
    _h, m = _monitor()
    m.force_mode(SystemMode.HARD_DEGRADED)
    assert m.compute_mode() is SystemMode.HARD_DEGRADED
    m.force_mode(None)
    # No fresh sources — hard_degraded again, but via computation now.
    assert m.compute_mode() is SystemMode.HARD_DEGRADED


def test_unknown_source_id_does_not_blow_up_propose():
    h, m = _monitor()
    now = _now()
    h.mark_event("unknown_family:weird:thing", when=now)
    # No registered profile → ignored, treated as nothing fresh.
    assert m.compute_mode(now=now) is SystemMode.HARD_DEGRADED


# ── Fix 3: simplified "no fresh sources" branch ───────────────────────


def test_no_fresh_sources_returns_hard_degraded_uniformly():
    """Document the chosen Fix-3 behaviour: when no source is fresh,
    the monitor returns HARD_DEGRADED whether the registry is empty,
    has only stale-but-alive entries, or only has long-dead entries.
    The previous dead branch — ``HARD_DEGRADED if not any_alive else
    HARD_DEGRADED`` — was simplified to a single return; STOPPED is
    reserved for the explicit operator-shutdown path (force_mode and
    the system FSM), not for an empty/stale registry.
    """
    # Empty registry.
    h_empty, m_empty = _monitor()
    assert m_empty.compute_mode(now=_now()) is SystemMode.HARD_DEGRADED

    # Stale-but-still-within-hard-age: alive but not fresh.
    h_stale, m_stale = _monitor()
    now = _now()
    # API healthy_age_sec is now 120s; pick 130s old: alive yet stale.
    h_stale.mark_event("pinnacle_api", when=now - timedelta(seconds=130))
    assert m_stale.compute_mode(now=now) is SystemMode.HARD_DEGRADED

    # Long-dead — past hard age threshold.
    h_dead, m_dead = _monitor()
    h_dead.mark_event("pinnacle_api", when=now - timedelta(seconds=600))
    assert m_dead.compute_mode(now=now) is SystemMode.HARD_DEGRADED
