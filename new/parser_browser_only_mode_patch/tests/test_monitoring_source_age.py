"""Tests for Story 27.12 AC-3 — per-source age surfacing в /monitoring.

Проверяет что `source_coverage[src]` содержит `max_age_sec` и `p50_age_sec`
computed из SourceHealth.last_event_at, плюс top-level alias
`per_source_max_age_sec` для лёгкого alerting.
"""

from __future__ import annotations

from datetime import datetime, timezone

from aggregator.monitoring import PlatformMonitor
from aggregator.state_machine import (
    SourceHealthRegistry,
)


def _utc(h: int = 12, m: int = 0, s: int = 0) -> datetime:
    return datetime(2026, 6, 1, h, m, s, tzinfo=timezone.utc)


def test_source_coverage_exposes_max_age_sec_per_source() -> None:
    """AC-3: source_coverage[src] содержит max_age_sec field."""
    registry = SourceHealthRegistry()
    registry.mark_event("pinnacle_api", when=_utc(s=0))
    registry.mark_event("pin888:acct-A:browser_ws", when=_utc(s=3))

    mon = PlatformMonitor(source_health_registry=registry)
    snap = mon.snapshot(now=_utc(s=10))

    coverage = snap.get("source_coverage", {})
    assert "pinnacle_api" in coverage
    assert "max_age_sec" in coverage["pinnacle_api"], (
        "source_coverage entry must expose max_age_sec (AC-3 / DOD-3)"
    )
    # pinnacle_api last at s=0, now=s=10 → age = 10s
    assert 9.5 <= coverage["pinnacle_api"]["max_age_sec"] <= 10.5

    # pin888 last at s=3, now=s=10 → age = 7s
    assert 6.5 <= coverage["pin888:acct-A:browser_ws"]["max_age_sec"] <= 7.5


def test_source_coverage_exposes_p50_age_sec() -> None:
    """AC-3: p50_age_sec computed (at minimum equals max_age_sec when only 1 source tick)."""
    registry = SourceHealthRegistry()
    registry.mark_event("pinnacle_api", when=_utc(s=0))

    mon = PlatformMonitor(source_health_registry=registry)
    snap = mon.snapshot(now=_utc(s=5))

    coverage = snap.get("source_coverage", {})
    assert "p50_age_sec" in coverage["pinnacle_api"], (
        "source_coverage entry must expose p50_age_sec (AC-3 / DOD-3)"
    )
    assert 4.5 <= coverage["pinnacle_api"]["p50_age_sec"] <= 5.5


def test_snapshot_has_top_level_per_source_max_age_alias() -> None:
    """AC-3: top-level `per_source_max_age_sec` dict для лёгкого alerting."""
    registry = SourceHealthRegistry()
    registry.mark_event("pinnacle_api", when=_utc(s=0))
    registry.mark_event("pin888:acct-A:browser_ws", when=_utc(s=2))

    mon = PlatformMonitor(source_health_registry=registry)
    snap = mon.snapshot(now=_utc(s=10))

    assert "per_source_max_age_sec" in snap, (
        "snapshot must have top-level per_source_max_age_sec alias (AC-3 / DOD-4)"
    )
    per_source = snap["per_source_max_age_sec"]
    assert isinstance(per_source, dict)
    assert "pinnacle_api" in per_source
    assert "pin888:acct-A:browser_ws" in per_source
    assert 9.5 <= per_source["pinnacle_api"] <= 10.5
    assert 7.5 <= per_source["pin888:acct-A:browser_ws"] <= 8.5


def test_source_coverage_handles_missing_last_event_at() -> None:
    """Defensive: source registered but never received event — age = None, not crash."""
    registry = SourceHealthRegistry()
    # Register a failure (no successful event yet)
    registry.mark_failure("pinnacle_api", when=_utc(s=0))

    mon = PlatformMonitor(source_health_registry=registry)
    snap = mon.snapshot(now=_utc(s=10))

    coverage = snap.get("source_coverage", {})
    if "pinnacle_api" in coverage:
        # Age может быть None или отсутствовать; но не должно быть crash
        age = coverage["pinnacle_api"].get("max_age_sec")
        assert age is None or isinstance(age, (int, float))


def test_snapshot_without_registry_returns_empty_source_coverage() -> None:
    """PlatformMonitor без source_health_registry не падает."""
    mon = PlatformMonitor()  # no registry
    snap = mon.snapshot(now=_utc(s=10))
    # Should still have the key, just empty
    assert "source_coverage" in snap
    assert "per_source_max_age_sec" in snap
