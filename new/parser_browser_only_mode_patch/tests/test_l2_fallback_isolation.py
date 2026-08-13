"""Integration tests for Story 27.4 — L2 fallback isolation (AC-3, AC-5, AC-7..10).

These tests wire ``IngestRouter`` + ``DecisionEngine`` + ``TabsController``
+ ``CoverageDiffCache`` together and exercise the end-to-end contract:

* **AC-3** — Partner API (L1) publishes continuously even when WS fails.
* **AC-5** — Tabs fallback activates only under explicit policy +
  WS circuit-open.
* **AC-7** — WS session rotation does not block L1 publish.
* **AC-8** — Normal mode never flips tabs on.
* **AC-9** — Coverage gaps without BIA coverage produce no publish.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from aggregator.coverage_diff import CoverageDiffCache
from aggregator.decision import DecisionEngine
from aggregator.ingest import IngestRouter
from aggregator.monitoring import PlatformMonitor
from aggregator.store import ProvenanceStore
from aggregator.tabs_controller import TabsController, TabsState
from aggregator.types import SourceEvent


def _mk_event(
    *,
    source_id: str,
    transport: str,
    pid: int,
    price: float = 1.92,
    family: str = "pinnacle_native",
    is_tombstone: bool = False,
) -> SourceEvent:
    now = datetime.now(timezone.utc)
    return SourceEvent(
        source_id=source_id,
        family=family,
        transport=transport,
        event_id=f"{source_id}:{pid}",
        payload={
            "Pid": pid,
            "Periods": [{"Number": 0, "MoneyLine": {"Home": price}}],
        },
        collected_at=now,
        received_at=now,
        is_tombstone=is_tombstone,
    )


class _FakeLegacySource:
    """Stand-in for ``pin888_ws_bridge`` exposing degraded flags."""

    def __init__(
        self, *, degraded: bool = False, session_rotating: bool = False
    ) -> None:
        self.degraded = degraded
        self.session_rotating = session_rotating


# ---------------------------------------------------------------------------
# AC-3 — PS3838 WS down, Partner API publishes
# ---------------------------------------------------------------------------


def test_api_publishes_when_ws_candidates_are_filtered() -> None:
    """L1-covered WS events are dropped at ingest; API remains publisher."""
    store = ProvenanceStore()
    engine = DecisionEngine()
    router = IngestRouter(
        store, engine, l1_covered_pids_provider=lambda: {42}
    )
    captured: list = []
    router.register_consumer(lambda q: captured.append(q))

    # API event first (establishes the L1 candidate).
    router.ingest(
        _mk_event(source_id="pinnacle_api", transport="http_pull", pid=42)
    )
    # WS event for the same pid — must be filtered by the soft filter.
    router.ingest(_mk_event(source_id="pin888", transport="ws", pid=42))

    # Only one quote published, and it's the API one.
    assert len(captured) == 1
    assert captured[0].source_used_for_publish == "pinnacle_api"


def test_api_still_publishes_when_ws_source_marked_degraded() -> None:
    """WS degraded flag in monitor does not gate API publish path."""
    store = ProvenanceStore()
    engine = DecisionEngine()
    router = IngestRouter(store, engine)
    captured: list = []
    router.register_consumer(lambda q: captured.append(q))

    monitor = PlatformMonitor(
        pin888_bridge=_FakeLegacySource(degraded=True)
    )
    snap = monitor.snapshot()
    assert snap["ps3838_ws_degraded"] is True

    # API events still published through the router.
    router.ingest(
        _mk_event(source_id="pinnacle_api", transport="http_pull", pid=5)
    )
    assert len(captured) == 1
    assert captured[0].source_used_for_publish == "pinnacle_api"


def test_pin888_ws_session_rotating_surfaces_in_health() -> None:
    """AC-7 — session rotation flag is independently exposed."""
    monitor = PlatformMonitor(
        pin888_bridge=_FakeLegacySource(session_rotating=True)
    )
    snap = monitor.snapshot()
    assert snap["pin888_ws_session_rotating"] is True
    assert snap["ps3838_ws_degraded"] is False


# ---------------------------------------------------------------------------
# AC-4 — tabs off by default
# ---------------------------------------------------------------------------


def test_tabs_off_by_default_in_monitor(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MSP_TABS_FALLBACK_ALLOWED", raising=False)
    tabs = TabsController()
    monitor = PlatformMonitor(tabs_controller=tabs)
    snap = monitor.snapshot()
    assert snap["tabs_fallback_allowed"] is False
    assert snap["tabs_fallback_active"] is False
    assert snap["tabs_fallback_state"] == "off"


# ---------------------------------------------------------------------------
# AC-5 — tabs activate only with (allowed + ws_circuit_open)
# ---------------------------------------------------------------------------


def test_tabs_activate_on_explicit_policy_plus_ws_down(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MSP_TABS_FALLBACK_ALLOWED", "1")
    tabs = TabsController()
    tabs.update(allowed=True, ws_circuit_open=True)
    tabs.on_subscribe_result(success=True)

    monitor = PlatformMonitor(tabs_controller=tabs)
    snap = monitor.snapshot()
    assert snap["tabs_fallback_allowed"] is True
    assert snap["tabs_fallback_active"] is True
    assert snap["tabs_fallback_state"] == "active"


def test_tabs_do_not_activate_without_explicit_flag() -> None:
    """AC-5 precondition — flag is not set → tabs stay off."""
    tabs = TabsController()
    # ws_circuit_open alone is not enough — allowed must be true.
    tabs.update(allowed=False, ws_circuit_open=True)
    assert tabs.state is TabsState.OFF


def test_tabs_do_not_activate_without_ws_failure() -> None:
    tabs = TabsController()
    tabs.update(allowed=True, ws_circuit_open=False)
    assert tabs.state is TabsState.OFF


def test_tabs_deactivate_after_ws_recovery_cycles() -> None:
    """DOD-11 — tabs return to OFF after 2 consecutive healthy cycles."""
    tabs = TabsController(recovery_cycles=2)
    tabs.update(allowed=True, ws_circuit_open=True)
    tabs.on_subscribe_result(success=True)
    assert tabs.state is TabsState.ACTIVE

    tabs.update(allowed=True, ws_circuit_open=False)  # 1st healthy
    tabs.update(allowed=True, ws_circuit_open=False)  # 2nd healthy → OFF
    assert tabs.state is TabsState.OFF


# ---------------------------------------------------------------------------
# AC-1 — coverage cache → monitor aggregates
# ---------------------------------------------------------------------------


def test_monitor_reports_coverage_counts() -> None:
    cache = CoverageDiffCache()
    cache.get(sport_id=29, provider=lambda sid: ({1, 2, 3}, {2, 3, 4}))
    cache.get(sport_id=4, provider=lambda sid: ({10, 11}, {12}))

    monitor = PlatformMonitor(coverage_diff_cache=cache)
    snap = monitor.snapshot()
    assert snap["pinnacle_api_coverage_events_count"] == 5
    assert snap["ps3838_ws_complement_events_count"] == 2
    # Complement = {4} + {12} (ws-only pids)


# ---------------------------------------------------------------------------
# AC-9 — coverage gaps counter defaults to zero
# ---------------------------------------------------------------------------


def test_core_coverage_gaps_count_default_zero() -> None:
    monitor = PlatformMonitor()
    snap = monitor.snapshot()
    # Default implementation returns 0 until cross-source-matcher wiring lands.
    assert snap["core_coverage_gaps_count"] == 0
