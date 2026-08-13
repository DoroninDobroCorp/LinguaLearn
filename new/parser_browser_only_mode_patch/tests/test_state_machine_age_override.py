"""Tests for Story 27.12 — env-override для healthy_age_sec + hysteresis.

Покрывает AC-2 (MSP_HEALTHY_AGE_SEC, MSP_HEALTHY_AGE_SEC_BROWSER_WS)
и AC-6 (MSP_SYSTEM_MODE_MIN_DWELL_SEC hysteresis). Без live сети —
только pure функции + in-memory SourceHealthRegistry.
"""

from __future__ import annotations

from datetime import datetime, timezone


from aggregator.state_machine import (
    DEFAULT_HARD_AGE_SEC,
    DEFAULT_HEALTHY_AGE_SEC,
    SourceHealthRegistry,
    SystemMode,
    SystemModeMonitor,
    age_config_from_env,
)


def _utc(h: int = 12, m: int = 0, s: int = 0) -> datetime:
    return datetime(2026, 6, 1, h, m, s, tzinfo=timezone.utc)


# ── age_config_from_env helper ────────────────────────────────────


def test_age_config_from_env_returns_defaults_when_unset() -> None:
    cfg = age_config_from_env(env={})
    assert cfg["healthy_age_sec"] == DEFAULT_HEALTHY_AGE_SEC
    assert cfg["hard_age_sec"] == DEFAULT_HARD_AGE_SEC
    assert cfg["min_dwell_sec"] == 0.0
    assert cfg["healthy_age_sec_browser_ws"] is None


def test_age_config_from_env_reads_global_healthy_override() -> None:
    cfg = age_config_from_env(env={"MSP_HEALTHY_AGE_SEC": "12.5"})
    assert cfg["healthy_age_sec"] == 12.5


def test_age_config_from_env_reads_browser_ws_specific_override() -> None:
    # Per-profile override (AC-2): browser WS может нуждаться в более
    # мягком threshold чем общий WS default.
    cfg = age_config_from_env(env={"MSP_HEALTHY_AGE_SEC_BROWSER_WS": "18.0"})
    assert cfg["healthy_age_sec_browser_ws"] == 18.0


def test_age_config_from_env_reads_hysteresis() -> None:
    cfg = age_config_from_env(env={"MSP_SYSTEM_MODE_MIN_DWELL_SEC": "30"})
    assert cfg["min_dwell_sec"] == 30.0


def test_age_config_from_env_ignores_invalid_values() -> None:
    # Любой не-float просто даёт default — не хотим чтобы typo в env
    # ломал startup aggregator'а.
    cfg = age_config_from_env(env={"MSP_HEALTHY_AGE_SEC": "abc"})
    assert cfg["healthy_age_sec"] == DEFAULT_HEALTHY_AGE_SEC


def test_age_config_from_env_rejects_negative() -> None:
    # Отрицательные значения бессмысленны — fall back to default.
    cfg = age_config_from_env(env={"MSP_HEALTHY_AGE_SEC": "-1"})
    assert cfg["healthy_age_sec"] == DEFAULT_HEALTHY_AGE_SEC


# ── hysteresis behavior with env override ─────────────────────────


def _register_browser_ws(registry: SourceHealthRegistry, source_id: str) -> None:
    """Register a pin888-native browser WS source (authority BROWSER_WS)."""
    # Нас интересует факт что registry знает этот source; is_fresh проверяется
    # через его last_event_at.
    registry.mark_event(source_id, when=_utc(h=12, m=0, s=0))


def test_hysteresis_suppresses_single_tick_flip_to_pool_degraded() -> None:
    """AC-6: Single-tick jitter НЕ должен флипнуть NORMAL→POOL_DEGRADED
    когда min_dwell_sec=30."""
    registry = SourceHealthRegistry()
    # API source pinnacle_api и browser-WS source pin888:acct-A:browser_ws.
    # Оба known в default profile registry (см. aggregator/source_profile.py).
    registry.mark_event("pinnacle_api", when=_utc(h=12, m=0, s=0))
    registry.mark_event("pin888:acct-A:browser_ws", when=_utc(h=12, m=0, s=0))

    monitor = SystemModeMonitor(health=registry, min_dwell_sec=30.0)
    # First call — should be NORMAL since both fresh.
    assert monitor.compute_mode(now=_utc(h=12, m=0, s=1)) == SystemMode.NORMAL

    # Now pin888 WS stops getting fresh events, but only for 5s — below
    # min_dwell_sec=30 threshold. Must NOT flip to POOL_DEGRADED.
    registry.mark_event("pinnacle_api", when=_utc(h=12, m=0, s=10))
    # pin888 WS not updated — its last_event_at remains at s=0
    # Now querying at s=11 → pin888 WS age is 11s > DEFAULT_HEALTHY_AGE_SEC (6s)
    # → candidate mode is POOL_DEGRADED, but dwell hasn't elapsed
    assert monitor.compute_mode(now=_utc(h=12, m=0, s=11)) == SystemMode.NORMAL
    # Still within dwell window
    assert monitor.compute_mode(now=_utc(h=12, m=0, s=20)) == SystemMode.NORMAL


def test_hysteresis_respects_dwell_before_flip() -> None:
    """AC-6: После истечения min_dwell_sec — флип происходит.

    Monitor needs TWO calls seeing the same candidate: first sets the
    candidate + timer, second (after dwell elapsed) commits the flip.
    Design in state_machine.py:373.
    """
    registry = SourceHealthRegistry()
    registry.mark_event("pinnacle_api", when=_utc(h=12, m=0, s=0))
    registry.mark_event("pin888:acct-A:browser_ws", when=_utc(h=12, m=0, s=0))

    monitor = SystemModeMonitor(health=registry, min_dwell_sec=30.0)
    monitor.compute_mode(now=_utc(h=12, m=0, s=1))  # establishes NORMAL baseline

    # pin888 WS goes stale (no mark_event), API refreshed at s=10
    registry.mark_event("pinnacle_api", when=_utc(h=12, m=0, s=10))

    # First observation of POOL_DEGRADED candidate at s=11 → set timer, stay NORMAL
    assert monitor.compute_mode(now=_utc(h=12, m=0, s=11)) == SystemMode.NORMAL

    # 31 seconds later candidate still POOL_DEGRADED → dwell elapsed, commit.
    registry.mark_event("pinnacle_api", when=_utc(h=12, m=0, s=42))
    assert monitor.compute_mode(now=_utc(h=12, m=0, s=42)) == SystemMode.POOL_DEGRADED


def test_hysteresis_zero_disables_dwell() -> None:
    """При min_dwell_sec=0 (default) — flip instant."""
    registry = SourceHealthRegistry()
    registry.mark_event("pinnacle_api", when=_utc(h=12, m=0, s=0))
    registry.mark_event("pin888:acct-A:browser_ws", when=_utc(h=12, m=0, s=0))

    monitor = SystemModeMonitor(health=registry, min_dwell_sec=0.0)
    assert monitor.compute_mode(now=_utc(h=12, m=0, s=1)) == SystemMode.NORMAL

    # pin888 WS goes stale (age > 6s), API stays fresh → instant flip
    registry.mark_event("pinnacle_api", when=_utc(h=12, m=0, s=10))
    # pin888 WS not refreshed — query at s=11 → age 11s > 6s
    assert monitor.compute_mode(now=_utc(h=12, m=0, s=11)) == SystemMode.POOL_DEGRADED


def test_healthy_age_sec_override_keeps_ws_fresh_longer() -> None:
    """Если healthy_age_sec=15 → pin888 WS age=10s стабильно fresh (NORMAL),
    тогда как с default 6s тот же age считался бы stale (POOL_DEGRADED)."""
    registry = SourceHealthRegistry()
    registry.mark_event("pinnacle_api", when=_utc(h=12, m=0, s=0))
    registry.mark_event("pin888:acct-A:browser_ws", when=_utc(h=12, m=0, s=0))

    # With default 6s
    monitor_strict = SystemModeMonitor(health=registry, healthy_age_sec=6.0, min_dwell_sec=0.0)
    monitor_strict.compute_mode(now=_utc(h=12, m=0, s=1))
    registry.mark_event("pinnacle_api", when=_utc(h=12, m=0, s=10))
    assert monitor_strict.compute_mode(now=_utc(h=12, m=0, s=11)) == SystemMode.POOL_DEGRADED

    # Reset registry
    registry2 = SourceHealthRegistry()
    registry2.mark_event("pinnacle_api", when=_utc(h=12, m=0, s=0))
    registry2.mark_event("pin888:acct-A:browser_ws", when=_utc(h=12, m=0, s=0))

    # With tolerant 15s
    monitor_loose = SystemModeMonitor(health=registry2, healthy_age_sec=15.0, min_dwell_sec=0.0)
    monitor_loose.compute_mode(now=_utc(h=12, m=0, s=1))
    registry2.mark_event("pinnacle_api", when=_utc(h=12, m=0, s=10))
    # pin888 WS age = 11s, but threshold = 15s → still fresh → NORMAL
    assert monitor_loose.compute_mode(now=_utc(h=12, m=0, s=11)) == SystemMode.NORMAL
