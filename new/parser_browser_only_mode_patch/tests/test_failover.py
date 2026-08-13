"""Phase 6: failover orchestrator tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from aggregator.account_fsm import AccountFSM, AccountState
from aggregator.account_pool import Account, AccountPool
from aggregator.failover import (
    FailoverOrchestrator,
    failover_enabled,
)
from aggregator.state_machine import (
    SourceHealthRegistry,
    SystemMode,
    SystemModeMonitor,
)


def _utc(y=2026, mo=5, d=1, h=12, m=0, s=0):
    return datetime(y, mo, d, h, m, s, tzinfo=timezone.utc)


def _make_pool_and_monitor(accounts=None, mode_override=None):
    pool = AccountPool()
    for a in (accounts or []):
        pool.register(a)
    health = SourceHealthRegistry()
    monitor = SystemModeMonitor(health=health)
    if mode_override:
        monitor.force_mode(mode_override)
    return pool, monitor


def _make_account(aid="acct-1", family="pin888", transport="direct_ws", state=None):
    fsm = AccountFSM(state=state or AccountState.HEALTHY_DIRECT_WS)
    return Account(
        account_id=aid,
        family=family,
        current_transport=transport,
        fsm=fsm,
    )


# ── flag tests ────────────────────────────────────────────────────


def test_failover_disabled_by_default(monkeypatch):
    monkeypatch.delenv("MSP_FAILOVER_ENABLED", raising=False)
    assert failover_enabled() is False


def test_failover_enabled_when_set(monkeypatch):
    monkeypatch.setenv("MSP_FAILOVER_ENABLED", "1")
    assert failover_enabled() is True


# ── downgrade scenarios ───────────────────────────────────────────


def test_api_degraded_triggers_downgrade_from_direct_ws(monkeypatch):
    monkeypatch.setenv("MSP_FAILOVER_ENABLED", "1")
    acct = _make_account(transport="direct_ws")
    pool, monitor = _make_pool_and_monitor([acct], mode_override=SystemMode.API_DEGRADED)
    orch = FailoverOrchestrator(pool=pool, monitor=monitor)

    entries = orch.tick(now=_utc())
    assert len(entries) == 1
    assert entries[0].direction == "downgrade"
    assert entries[0].old_transport == "direct_ws"
    assert entries[0].new_transport == "browser_ws"
    assert acct.current_transport == "browser_ws"


def test_ws_drop_triggers_tab_fallback(monkeypatch):
    monkeypatch.setenv("MSP_FAILOVER_ENABLED", "1")
    acct = _make_account(transport="browser_ws", state=AccountState.WS_DEGRADED_TAB_FALLBACK)
    acct.fsm = AccountFSM(state=AccountState.WS_DEGRADED_TAB_FALLBACK)
    pool, monitor = _make_pool_and_monitor([acct], mode_override=SystemMode.NORMAL)
    orch = FailoverOrchestrator(pool=pool, monitor=monitor)

    entries = orch.tick(now=_utc())
    assert len(entries) == 1
    assert entries[0].new_transport == "tab"
    assert acct.current_transport == "tab"


# ── upgrade / recovery scenarios ──────────────────────────────────


def test_recovery_requires_n_healthy_ticks(monkeypatch):
    monkeypatch.setenv("MSP_FAILOVER_ENABLED", "1")
    acct = _make_account(transport="browser_ws", state=AccountState.HEALTHY_BROWSER_WS)
    pool, monitor = _make_pool_and_monitor([acct], mode_override=SystemMode.NORMAL)
    orch = FailoverOrchestrator(pool=pool, monitor=monitor, recovery_ticks_required=3)

    now = _utc()
    # Ticks 1 and 2 — not enough.
    assert orch.tick(now=now) == []
    assert orch.tick(now=now + timedelta(seconds=61)) == []
    # Tick 3 — upgrade!
    entries = orch.tick(now=now + timedelta(seconds=122))
    assert len(entries) == 1
    assert entries[0].direction == "upgrade"
    assert entries[0].new_transport == "direct_ws"


def test_cooldown_prevents_flipflop(monkeypatch):
    monkeypatch.setenv("MSP_FAILOVER_ENABLED", "1")
    acct = _make_account(transport="browser_ws", state=AccountState.HEALTHY_BROWSER_WS)
    pool, monitor = _make_pool_and_monitor([acct], mode_override=SystemMode.NORMAL)
    orch = FailoverOrchestrator(
        pool=pool, monitor=monitor, recovery_ticks_required=1, cooldown_sec=120.0
    )

    now = _utc()
    # First tick upgrades (recovery_ticks_required=1).
    entries = orch.tick(now=now)
    assert len(entries) == 1
    assert acct.current_transport == "direct_ws"

    # Force downgrade back to browser.
    acct.current_transport = "browser_ws"
    acct.fsm = AccountFSM(state=AccountState.HEALTHY_BROWSER_WS)

    # Next tick within cooldown → no upgrade.
    entries2 = orch.tick(now=now + timedelta(seconds=30))
    assert entries2 == []

    # After cooldown → upgrade again.
    entries3 = orch.tick(now=now + timedelta(seconds=130))
    assert len(entries3) == 1
    assert entries3[0].direction == "upgrade"


# ── system mode transitions ───────────────────────────────────────


def test_no_switching_when_flag_off(monkeypatch):
    monkeypatch.delenv("MSP_FAILOVER_ENABLED", raising=False)
    acct = _make_account(transport="direct_ws")
    pool, monitor = _make_pool_and_monitor([acct], mode_override=SystemMode.API_DEGRADED)
    orch = FailoverOrchestrator(pool=pool, monitor=monitor)

    entries = orch.tick(now=_utc())
    assert entries == []
    assert acct.current_transport == "direct_ws"


def test_log_accumulates_entries(monkeypatch):
    monkeypatch.setenv("MSP_FAILOVER_ENABLED", "1")
    acct = _make_account(transport="direct_ws")
    pool, monitor = _make_pool_and_monitor([acct], mode_override=SystemMode.API_DEGRADED)
    orch = FailoverOrchestrator(pool=pool, monitor=monitor)

    orch.tick(now=_utc())
    assert len(orch.log) == 1
    assert orch.log[0].account_id == "acct-1"


# ── Bug fix: tab auto-upgrade ─────────────────────────────────────


def test_auto_upgrade_from_tab_after_healthy_ticks(monkeypatch):
    """Account at tab state with consecutive healthy ticks gets upgraded."""
    monkeypatch.setenv("MSP_FAILOVER_ENABLED", "1")
    acct = _make_account(
        transport="tab", state=AccountState.WS_DEGRADED_TAB_FALLBACK
    )
    pool, monitor = _make_pool_and_monitor([acct], mode_override=SystemMode.NORMAL)
    orch = FailoverOrchestrator(pool=pool, monitor=monitor, recovery_ticks_required=3, cooldown_sec=0)

    now = _utc()
    # Ticks 1 and 2 — not enough.
    assert orch.tick(now=now) == []
    assert orch.tick(now=now + timedelta(seconds=1)) == []
    # Tick 3 — upgrade fires.
    entries = orch.tick(now=now + timedelta(seconds=2))
    assert len(entries) == 1
    assert entries[0].direction == "upgrade"
    assert entries[0].old_transport == "tab"
    assert entries[0].new_transport == "browser_ws"
    assert acct.current_transport == "browser_ws"
    # FSM should now be HEALTHY_BROWSER_WS (via TRANSPORT_UPGRADE).
    assert acct.fsm.state == AccountState.HEALTHY_BROWSER_WS


# ── Bug fix: FSM downgrade event for direct_ws → browser_ws ──────


def test_fsm_updated_on_direct_to_browser_downgrade(monkeypatch):
    """Downgrade direct_ws → browser_ws feeds TRANSPORT_DOWNGRADE to FSM."""
    monkeypatch.setenv("MSP_FAILOVER_ENABLED", "1")
    acct = _make_account(transport="direct_ws", state=AccountState.HEALTHY_DIRECT_WS)
    pool, monitor = _make_pool_and_monitor([acct], mode_override=SystemMode.API_DEGRADED)
    orch = FailoverOrchestrator(pool=pool, monitor=monitor)

    entries = orch.tick(now=_utc())
    assert len(entries) == 1
    assert entries[0].new_transport == "browser_ws"
    assert acct.fsm.state == AccountState.HEALTHY_BROWSER_WS


# ── Bounded log (Phase 8 fix) ────────────────────────────────────


def test_failover_log_bounded(monkeypatch):
    """_log is a bounded deque; old entries are evicted when maxlen is exceeded."""
    from collections import deque

    from aggregator.failover import FAILOVER_LOG_MAXLEN, FailoverLogEntry

    monkeypatch.setenv("MSP_FAILOVER_ENABLED", "1")
    acct = _make_account(transport="direct_ws")
    pool, monitor = _make_pool_and_monitor([acct], mode_override=SystemMode.NORMAL)
    orch = FailoverOrchestrator(pool=pool, monitor=monitor)

    # Verify it's a deque with maxlen.
    assert isinstance(orch._log, deque)
    assert orch._log.maxlen == FAILOVER_LOG_MAXLEN

    # Fill with synthetic entries beyond a small maxlen.
    small_maxlen = 5
    orch._log = deque(maxlen=small_maxlen)
    now = _utc()
    for i in range(10):
        orch._log.append(
            FailoverLogEntry(
                timestamp=now,
                account_id=f"acct-{i}",
                old_transport="direct_ws",
                new_transport="browser_ws",
                trigger="test",
                direction="downgrade",
            )
        )
    # Only last 5 entries remain.
    assert len(orch._log) == small_maxlen
    assert orch._log[0].account_id == "acct-5"
