"""Tests for Story 27.13 AC-3/AC-6 — gap counters + heartbeat в Pin888WsBridge.

Покрывает:
- `gap_threshold_sec` (`MSP_PIN888_WS_GAP_THRESHOLD_SEC`, default 5s)
- `heartbeat_interval_sec` (`MSP_PIN888_WS_HEARTBEAT_INTERVAL_SEC`, default 4s)
- `heartbeat_enabled` (`MSP_PIN888_WS_HEARTBEAT_ENABLED`, default off)
- `.stats()` output содержит `gaps_total`, `gap_max_sec`, `heartbeats_sent`,
  `last_event_mono_sec`
- pure-функции `_is_gap_above_threshold`, `_should_send_heartbeat` (testable
  без WS соединения)

Без live websockets — только field wiring + helper purity.
"""

from __future__ import annotations

from aggregator.sources.pin888_ws_bridge import (
    Pin888WsBridge,
    bridge_config_from_env,
)


def _make_bridge(**kwargs: object) -> Pin888WsBridge:
    # Minimal IngestRouter-compatible stub — we don't exercise publish path.
    # But Pin888WsBridge accepts any object that Pin888SourceAdapter wraps,
    # and Pin888SourceAdapter only calls router.ingest() on emit, never from stats.
    class _Router:
        pass
    return Pin888WsBridge(router=_Router(), **kwargs)  # type: ignore[arg-type]


# ── bridge_config_from_env ─────────────────────────────────────────


def test_bridge_config_defaults_unset() -> None:
    cfg = bridge_config_from_env(env={})
    assert cfg["gap_threshold_sec"] == 5.0
    # 10s default chosen so heartbeat RPM (6/min) stays well below
    # the PS3838 rate-limit ceiling (~50 RPM aggregate WS budget).
    assert cfg["heartbeat_interval_sec"] == 10.0
    assert cfg["heartbeat_enabled"] is False


def test_bridge_config_reads_gap_threshold() -> None:
    cfg = bridge_config_from_env(env={"MSP_PIN888_WS_GAP_THRESHOLD_SEC": "10"})
    assert cfg["gap_threshold_sec"] == 10.0


def test_bridge_config_reads_heartbeat_interval() -> None:
    cfg = bridge_config_from_env(env={"MSP_PIN888_WS_HEARTBEAT_INTERVAL_SEC": "7.5"})
    assert cfg["heartbeat_interval_sec"] == 7.5


def test_bridge_config_heartbeat_enabled_truthy() -> None:
    for val in ("1", "true", "True", "yes"):
        cfg = bridge_config_from_env(env={"MSP_PIN888_WS_HEARTBEAT_ENABLED": val})
        assert cfg["heartbeat_enabled"] is True, f"value {val!r} should enable"


def test_bridge_config_heartbeat_enabled_falsy() -> None:
    for val in ("", "0", "false", "no"):
        cfg = bridge_config_from_env(env={"MSP_PIN888_WS_HEARTBEAT_ENABLED": val})
        assert cfg["heartbeat_enabled"] is False, f"value {val!r} should disable"


def test_bridge_config_ignores_invalid_numeric() -> None:
    cfg = bridge_config_from_env(env={"MSP_PIN888_WS_GAP_THRESHOLD_SEC": "abc"})
    assert cfg["gap_threshold_sec"] == 5.0


# ── bridge field wiring ─────────────────────────────────────────────


def test_bridge_default_gap_threshold_is_5s() -> None:
    b = _make_bridge()
    assert b.gap_threshold_sec == 5.0


def test_bridge_accepts_custom_gap_threshold() -> None:
    b = _make_bridge(gap_threshold_sec=12.0)
    assert b.gap_threshold_sec == 12.0


def test_bridge_default_heartbeat_disabled() -> None:
    b = _make_bridge()
    assert b.heartbeat_enabled is False


def test_bridge_accepts_heartbeat_enabled() -> None:
    b = _make_bridge(heartbeat_enabled=True, heartbeat_interval_sec=6.0)
    assert b.heartbeat_enabled is True
    assert b.heartbeat_interval_sec == 6.0


# ── stats() ─────────────────────────────────────────────────────────


def test_stats_includes_27_13_counters() -> None:
    b = _make_bridge()
    stats = b.stats()
    # Pre-existing keys stay for backward compat.
    for key in ("connections", "messages", "events", "errors"):
        assert key in stats
    # 27.13 additions.
    for key in ("gaps_total", "gap_max_sec", "heartbeats_sent", "last_event_mono_sec"):
        assert key in stats, f"stats must expose {key} for AC-6 alerting"


def test_stats_starts_at_zero_for_new_bridge() -> None:
    b = _make_bridge()
    stats = b.stats()
    assert stats["gaps_total"] == 0
    assert stats["gap_max_sec"] == 0.0
    assert stats["heartbeats_sent"] == 0


# ── _record_gap pure helper ─────────────────────────────────────────


def test_record_gap_bumps_counter_and_updates_max() -> None:
    b = _make_bridge()
    b._record_gap(7.0)
    b._record_gap(12.0)
    b._record_gap(4.0)  # above default 5? no, below. Caller must filter.
    stats = b.stats()
    assert stats["gaps_total"] == 3
    assert stats["gap_max_sec"] == 12.0


def test_record_heartbeat_bumps_counter() -> None:
    b = _make_bridge()
    b._record_heartbeat_sent()
    b._record_heartbeat_sent()
    assert b.stats()["heartbeats_sent"] == 2


def test_stats_exposes_dispatch_in_flight_gauge() -> None:
    """AC-2: dispatch parallelism gauge for detecting downstream slowness."""
    b = _make_bridge()
    assert "dispatch_in_flight" in b.stats()
    assert b.stats()["dispatch_in_flight"] == 0
    # Simulate dispatch in progress (bump done manually as _handle_raw_message_async would).
    with b._lock:
        b.dispatch_in_flight += 2
    assert b.stats()["dispatch_in_flight"] == 2
    b._on_dispatch_complete(None)  # type: ignore[arg-type]
    assert b.stats()["dispatch_in_flight"] == 1
