"""Failover/failback orchestrator (Phase 6, TZ §7 / §3.3).

Monitors :class:`AccountPool` and :class:`SystemModeMonitor` to trigger
transport downgrades (direct_ws → browser_ws → tab) on source
degradation and upgrades (tab → browser_ws → direct_ws) on recovery.

Design
------
- Failover reasons are logged with timestamp + old_state + new_state +
  trigger.
- Failback has configurable cooldown (don't flip-flop).
- Hysteresis: N consecutive healthy ticks before upgrading.
- System-level: ``API_DEGRADED`` triggers browser-account pool promotion
  for data classes that API covered.
- Flag: ``MSP_FAILOVER_ENABLED`` (default off). When off, no automatic
  transport switching occurs.

Import-time inert. No I/O, no threads.
"""

from __future__ import annotations

import os
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from aggregator.account_fsm import AccountEvent, AccountState
from aggregator.account_pool import Account, AccountPool
from aggregator.state_machine import SystemMode, SystemModeMonitor

# Maximum failover log entries retained in memory.
FAILOVER_LOG_MAXLEN: int = 10_000


def failover_enabled() -> bool:
    """Check ``MSP_FAILOVER_ENABLED``; default OFF."""
    return os.environ.get("MSP_FAILOVER_ENABLED", "").strip() in (
        "1",
        "true",
        "True",
        "yes",
    )


# Transport downgrade order (best → worst).
TRANSPORT_PRIORITY: list[str] = ["direct_ws", "browser_ws", "tab"]

# Inverse — for upgrade (worst → best).
TRANSPORT_UPGRADE_ORDER: list[str] = ["tab", "browser_ws", "direct_ws"]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class FailoverLogEntry:
    """Immutable record of a failover/failback event."""

    timestamp: datetime
    account_id: str
    old_transport: str
    new_transport: str
    trigger: str
    direction: str  # "downgrade" | "upgrade"


@dataclass
class FailoverOrchestrator:
    """Monitors pool + system mode; triggers transport switches.

    Pure orchestration logic — no network. Callers invoke
    :meth:`tick` periodically (e.g. on each ingest cycle or health
    check). The orchestrator inspects the current state and may
    issue downgrade/upgrade commands.

    Configuration:
        - ``recovery_ticks_required``: consecutive healthy ticks before upgrade.
        - ``cooldown_sec``: minimum seconds between failback attempts.
        - ``auto_downgrade``: whether to downgrade automatically.
        - ``auto_upgrade``: whether to upgrade automatically on recovery.
    """

    pool: AccountPool
    monitor: SystemModeMonitor
    recovery_ticks_required: int = 3
    cooldown_sec: float = 60.0
    auto_downgrade: bool = True
    auto_upgrade: bool = True

    # Per-account tracking.
    _recovery_ticks: dict[str, int] = field(default_factory=dict)
    _last_switch_at: dict[str, datetime] = field(default_factory=dict)
    _log: deque[FailoverLogEntry] = field(
        default_factory=lambda: deque(maxlen=FAILOVER_LOG_MAXLEN)
    )

    @property
    def log(self) -> list[FailoverLogEntry]:
        return list(self._log)

    def tick(self, *, now: Optional[datetime] = None) -> list[FailoverLogEntry]:
        """Run one orchestration cycle. Returns entries for any switches made."""
        if not failover_enabled():
            return []
        now = now or _utc_now()
        entries: list[FailoverLogEntry] = []

        mode = self.monitor.compute_mode(now=now)

        for account in self.pool.all_accounts():
            entry = self._evaluate_account(account, mode, now)
            if entry is not None:
                entries.append(entry)
                self._log.append(entry)

        return entries

    def _evaluate_account(
        self, account: Account, mode: SystemMode, now: datetime
    ) -> Optional[FailoverLogEntry]:
        """Decide whether to switch transport for a single account."""
        aid = account.account_id

        # Check if degraded → downgrade.
        if self.auto_downgrade and self._should_downgrade(account, mode):
            return self._do_downgrade(account, now, mode)

        # Check if healthy → upgrade.
        if self.auto_upgrade and self._should_upgrade(account, mode, now):
            # Count healthy tick.
            self._recovery_ticks[aid] = self._recovery_ticks.get(aid, 0) + 1
            if self._recovery_ticks[aid] >= self.recovery_ticks_required:
                self._recovery_ticks[aid] = 0
                return self._do_upgrade(account, now)
        else:
            # Reset recovery streak on any non-healthy signal.
            self._recovery_ticks.pop(aid, None)

        return None

    def _should_downgrade(self, account: Account, mode: SystemMode) -> bool:
        """Account needs downgrade if its FSM is in a degraded/ws-drop state
        or system mode indicates API degradation."""
        state = account.fsm.state
        transport = account.current_transport

        # Already at lowest tier — nothing to downgrade to.
        if transport == "tab":
            return False

        # WS degraded → downgrade.
        if state == AccountState.WS_DEGRADED_TAB_FALLBACK and transport != "tab":
            return True

        # System-level API_DEGRADED + account is on direct_ws → step down.
        if mode == SystemMode.API_DEGRADED and transport == "direct_ws":
            return True

        return False

    def _should_upgrade(self, account: Account, mode: SystemMode, now: datetime) -> bool:
        """Account is eligible for upgrade if healthy and cooldown elapsed."""
        transport = account.current_transport

        # Already at highest tier.
        if transport == "direct_ws":
            return False

        # Must be in a healthy primary state OR tab fallback (operational but degraded).
        if not account.fsm.is_healthy_primary and account.fsm.state != AccountState.WS_DEGRADED_TAB_FALLBACK:
            return False

        # System must not be degraded.
        if mode in (SystemMode.API_DEGRADED, SystemMode.HARD_DEGRADED, SystemMode.STOPPED):
            return False

        # Cooldown check.
        last = self._last_switch_at.get(account.account_id)
        if last is not None:
            if (now - last) < timedelta(seconds=self.cooldown_sec):
                return False

        return True

    def _do_downgrade(self, account: Account, now: datetime, mode: SystemMode) -> Optional[FailoverLogEntry]:
        """Execute transport downgrade on account."""
        old = account.current_transport
        idx = TRANSPORT_PRIORITY.index(old) if old in TRANSPORT_PRIORITY else 0
        if idx >= len(TRANSPORT_PRIORITY) - 1:
            return None  # Already at lowest.
        new_transport = TRANSPORT_PRIORITY[idx + 1]

        account.previous_transport = old  # type: ignore[attr-defined]
        account.current_transport = new_transport
        self._last_switch_at[account.account_id] = now
        self._recovery_ticks.pop(account.account_id, None)

        # Feed FSM event for transport change.
        if new_transport == "tab":
            if account.fsm.can(AccountEvent.TAB_FALLBACK_ENGAGED):
                account.fsm.feed(AccountEvent.TAB_FALLBACK_ENGAGED, now=now)
        else:
            if account.fsm.can(AccountEvent.TRANSPORT_DOWNGRADE):
                account.fsm.feed(AccountEvent.TRANSPORT_DOWNGRADE, now=now)

        trigger = f"system_mode={mode.value},state={account.fsm.state.value}"
        return FailoverLogEntry(
            timestamp=now,
            account_id=account.account_id,
            old_transport=old,
            new_transport=new_transport,
            trigger=trigger,
            direction="downgrade",
        )

    def _do_upgrade(self, account: Account, now: datetime) -> Optional[FailoverLogEntry]:
        """Execute transport upgrade on account."""
        old = account.current_transport
        idx = TRANSPORT_UPGRADE_ORDER.index(old) if old in TRANSPORT_UPGRADE_ORDER else 0
        if idx >= len(TRANSPORT_UPGRADE_ORDER) - 1:
            return None  # Already at highest.
        new_transport = TRANSPORT_UPGRADE_ORDER[idx + 1]

        account.previous_transport = old  # type: ignore[attr-defined]
        account.current_transport = new_transport
        self._last_switch_at[account.account_id] = now

        # Feed FSM upgrade event.
        if account.fsm.can(AccountEvent.TRANSPORT_UPGRADE):
            account.fsm.feed(AccountEvent.TRANSPORT_UPGRADE, now=now)
        elif new_transport == "direct_ws" and account.fsm.can(AccountEvent.WS_RECONNECT_DIRECT):
            account.fsm.feed(AccountEvent.WS_RECONNECT_DIRECT, now=now)
        elif new_transport == "browser_ws" and account.fsm.can(AccountEvent.WS_RECONNECT_BROWSER):
            account.fsm.feed(AccountEvent.WS_RECONNECT_BROWSER, now=now)

        trigger = f"recovery_after_{self.recovery_ticks_required}_healthy_ticks"
        return FailoverLogEntry(
            timestamp=now,
            account_id=account.account_id,
            old_transport=old,
            new_transport=new_transport,
            trigger=trigger,
            direction="upgrade",
        )

    def force_downgrade(self, account_id: str, *, now: Optional[datetime] = None) -> Optional[FailoverLogEntry]:
        """Manual / operator downgrade."""
        now = now or _utc_now()
        account = self.pool.get(account_id)
        if account is None:
            return None
        mode = self.monitor.compute_mode(now=now)
        entry = self._do_downgrade(account, now, mode)
        if entry:
            self._log.append(entry)
        return entry

    def force_upgrade(self, account_id: str, *, now: Optional[datetime] = None) -> Optional[FailoverLogEntry]:
        """Manual / operator upgrade."""
        now = now or _utc_now()
        account = self.pool.get(account_id)
        if account is None:
            return None
        entry = self._do_upgrade(account, now)
        if entry:
            self._log.append(entry)
        return entry

    def status(self) -> dict[str, Any]:
        """Diagnostic snapshot."""
        return {
            "enabled": failover_enabled(),
            "recovery_ticks_required": self.recovery_ticks_required,
            "cooldown_sec": self.cooldown_sec,
            "log_size": len(self._log),
            "recovery_ticks": dict(self._recovery_ticks),
        }


__all__ = [
    "FAILOVER_LOG_MAXLEN",
    "FailoverLogEntry",
    "FailoverOrchestrator",
    "TRANSPORT_PRIORITY",
    "TRANSPORT_UPGRADE_ORDER",
    "failover_enabled",
]
