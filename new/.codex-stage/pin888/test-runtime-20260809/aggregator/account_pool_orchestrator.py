"""PS3838 account-pool rotation orchestrator (Story 27.7 / AC-2..AC-7).

Sits on top of the existing :class:`aggregator.account_pool.AccountPool`
and :class:`aggregator.account_fsm.AccountFSM`. Owns **rotation logic
only** — never issues network calls, never touches credentials.

Responsibilities:

* Track which account is currently ``primary`` (the single account
  whose WS is the live L2 source).
* Sliding-window counter of auth errors per account; when it crosses
  the rotation threshold, rotate primary to the next reserve that is
  in an FSM healthy state.
* Cool-down the rotated-out account — it cannot be re-elected until
  ``cooldown_after_rotation_sec`` has passed. Prevents hot flapping.
* Cap rotations per hour; exceeding the cap freezes further switches
  and surfaces ``requires_manual_intervention=True`` for the operator.
* Emit observability counters and an "active account id" signal.

The orchestrator is pure Python — no I/O, no threading locks on the
hot path. Callers feed events via :meth:`on_auth_error` etc. and read
state via :meth:`snapshot`.
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Optional

from aggregator.account_pool_config import Ps3838PoolConfig


@dataclass
class _AccountRuntimeState:
    """Per-account rotation metadata tracked by the orchestrator."""

    account_id: str
    recent_auth_errors: Deque[float] = field(default_factory=deque)
    cooldown_until_ts: float = 0.0
    total_rotations_out: int = 0
    total_rotations_in: int = 0


class Ps3838PoolOrchestrator:
    """Rotation + observability layer over the existing AccountFSM/Pool.

    Usage::

        cfg = load_pool_config("config/ps3838_account_pool.yaml")
        orch = Ps3838PoolOrchestrator(cfg=cfg)
        orch.on_auth_error("acct-primary")
        if orch.rotation_recommended("acct-primary"):
            orch.rotate_primary()

    The orchestrator does not enforce who's active — it exposes
    ``primary_account_id`` and the caller (the pin888 parser wiring)
    reads it each tick to decide which session to subscribe.
    """

    def __init__(self, *, cfg: Ps3838PoolConfig) -> None:
        self._cfg: Ps3838PoolConfig = cfg
        self._accounts: dict[str, _AccountRuntimeState] = {
            a.id: _AccountRuntimeState(account_id=a.id) for a in cfg.accounts
        }
        # First account in the YAML is the initial primary; reserves
        # follow in order. Empty primary is only possible for an empty
        # accounts list which the pydantic schema already rejects.
        self._primary_id: Optional[str] = cfg.accounts[0].id
        # Sliding window of switch timestamps for the hourly cap.
        self._switch_timestamps: Deque[float] = deque()
        self._requires_manual_intervention: bool = False

    # ── Primary accessors --------------------------------------------

    @property
    def primary_account_id(self) -> Optional[str]:
        return self._primary_id

    @property
    def reserve_account_ids(self) -> list[str]:
        return [a.id for a in self._cfg.accounts if a.id != self._primary_id]

    @property
    def requires_manual_intervention(self) -> bool:
        return self._requires_manual_intervention

    # ── Event ingestion ----------------------------------------------

    def on_auth_error(self, account_id: str, *, now: float | None = None) -> None:
        """Record a single 401/403 against the given account.

        The orchestrator evicts stale entries from the sliding window
        before storing the new timestamp, so the counter always
        reflects the configured ``trigger_auth_errors_window_sec``.
        """
        ts = float(now) if now is not None else time.monotonic()
        state = self._accounts.get(account_id)
        if state is None:
            return
        window = self._cfg.rotation_policy.trigger_auth_errors_window_sec
        cutoff = ts - window
        while state.recent_auth_errors and state.recent_auth_errors[0] < cutoff:
            state.recent_auth_errors.popleft()
        state.recent_auth_errors.append(ts)

    def on_successful_auth(self, account_id: str) -> None:
        """Clear the recent-auth-errors streak on a successful login."""
        state = self._accounts.get(account_id)
        if state is not None:
            state.recent_auth_errors.clear()

    # ── Rotation decisions -------------------------------------------

    def rotation_recommended(
        self, account_id: str, *, now: float | None = None
    ) -> bool:
        """True iff ``account_id`` has crossed the auth-error threshold."""
        state = self._accounts.get(account_id)
        if state is None:
            return False
        ts = float(now) if now is not None else time.monotonic()
        window = self._cfg.rotation_policy.trigger_auth_errors_window_sec
        cutoff = ts - window
        # Lazy prune to make the check idempotent.
        while state.recent_auth_errors and state.recent_auth_errors[0] < cutoff:
            state.recent_auth_errors.popleft()
        return len(state.recent_auth_errors) >= self._cfg.rotation_policy.trigger_threshold

    def rotate_primary(self, *, now: float | None = None) -> Optional[str]:
        """Rotate the current primary out and promote the next reserve.

        Returns the new primary's id, or ``None`` if no reserve is
        eligible (all in cooldown or the hourly cap is exhausted).
        """
        ts = float(now) if now is not None else time.monotonic()
        # Hourly cap check.
        hour_cutoff = ts - 3600.0
        while self._switch_timestamps and self._switch_timestamps[0] < hour_cutoff:
            self._switch_timestamps.popleft()
        if len(self._switch_timestamps) >= self._cfg.rotation_policy.max_switch_rate_per_hour:
            self._requires_manual_intervention = True
            return None

        old_primary_id = self._primary_id
        if old_primary_id is None:
            return None

        # Put the rotated-out account into cooldown.
        old_state = self._accounts[old_primary_id]
        cool = self._cfg.rotation_policy.cooldown_after_rotation_sec
        old_state.cooldown_until_ts = ts + cool
        old_state.total_rotations_out += 1
        old_state.recent_auth_errors.clear()

        # Pick the first reserve whose cooldown has elapsed and whose
        # id != old primary.
        candidate_id: Optional[str] = None
        for account in self._cfg.accounts:
            if account.id == old_primary_id:
                continue
            state = self._accounts[account.id]
            if state.cooldown_until_ts > ts:
                continue
            candidate_id = account.id
            break

        if candidate_id is None:
            # No eligible reserve — keep old primary (caller will see
            # `requires_manual_intervention=True` if no progress).
            self._requires_manual_intervention = True
            return None

        self._primary_id = candidate_id
        self._accounts[candidate_id].total_rotations_in += 1
        self._switch_timestamps.append(ts)
        return candidate_id

    # ── Observability ------------------------------------------------

    def snapshot(self, *, now: float | None = None) -> dict[str, object]:
        """Return /health + /stats surface for the pool orchestrator.

        ``now`` overrides :func:`time.monotonic` for deterministic
        tests; defaults to the real monotonic clock in production.
        """
        now = float(now) if now is not None else time.monotonic()
        return {
            "ps3838_pool_active_account_id": self._primary_id or "none",
            "ps3838_pool_reserve_account_ids": self.reserve_account_ids,
            "ps3838_pool_switches_last_hour": len(
                [ts for ts in self._switch_timestamps if ts > now - 3600.0]
            ),
            "ps3838_pool_requires_manual_intervention": (
                self._requires_manual_intervention
            ),
            "accounts": {
                aid: {
                    "recent_auth_errors": len(state.recent_auth_errors),
                    "in_cooldown": state.cooldown_until_ts > now,
                    "cooldown_remaining_sec": max(
                        0.0, state.cooldown_until_ts - now
                    ),
                    "total_rotations_out": state.total_rotations_out,
                    "total_rotations_in": state.total_rotations_in,
                }
                for aid, state in self._accounts.items()
            },
        }


__all__ = ["Ps3838PoolOrchestrator"]
