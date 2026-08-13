"""Unit tests for `aggregator.account_fsm` (Phase 4 / TZ §7.2)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from aggregator.account_fsm import (
    DEFAULT_HYSTERESIS_TICKS,
    AccountEvent,
    AccountFSM,
    AccountState,
    HEALTHY_PRIMARY_STATES,
    IllegalAccountTransition,
    QUARANTINED_STATES,
    declared_transitions,
)


def _t(s: int = 0) -> datetime:
    return datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=s)


# ── declared transitions: every legal edge actually transitions ───────


@pytest.mark.parametrize("frm,event,to", [
    (AccountState.HEALTHY_DIRECT_WS, AccountEvent.HTTP_429, AccountState.RATE_LIMITED_429),
    (AccountState.HEALTHY_DIRECT_WS, AccountEvent.HTTP_401, AccountState.ROTATION_REQUIRED_401),
    (AccountState.HEALTHY_DIRECT_WS, AccountEvent.AUTH_HOLD, AccountState.AUTH_HOLD),
    (AccountState.HEALTHY_DIRECT_WS, AccountEvent.LOCKED, AccountState.LOCKED),
    (AccountState.HEALTHY_DIRECT_WS, AccountEvent.WS_DROP, AccountState.WS_DEGRADED_TAB_FALLBACK),
    (AccountState.HEALTHY_DIRECT_WS, AccountEvent.WS_RECONNECT_BROWSER, AccountState.HEALTHY_BROWSER_WS),
    (AccountState.HEALTHY_DIRECT_WS, AccountEvent.DRAIN, AccountState.DRAINED),
    (AccountState.HEALTHY_BROWSER_WS, AccountEvent.WS_RECONNECT_DIRECT, AccountState.HEALTHY_DIRECT_WS),
    (AccountState.WS_DEGRADED_TAB_FALLBACK, AccountEvent.WS_RECONNECT_DIRECT, AccountState.HEALTHY_DIRECT_WS),
    (AccountState.WS_DEGRADED_TAB_FALLBACK, AccountEvent.WS_RECONNECT_BROWSER, AccountState.HEALTHY_BROWSER_WS),
    (AccountState.ROTATION_REQUIRED_401, AccountEvent.AUTH_RECOVERED, AccountState.HEALTHY_DIRECT_WS),
    (AccountState.LOCKED, AccountEvent.UNLOCK, AccountState.AUTH_HOLD),
    (AccountState.LOCKED, AccountEvent.DRAIN, AccountState.DRAINED),
    (AccountState.RATE_LIMITED_429, AccountEvent.HTTP_401, AccountState.ROTATION_REQUIRED_401),
    (AccountState.RATE_LIMITED_429, AccountEvent.WS_DROP, AccountState.WS_DEGRADED_TAB_FALLBACK),
])
def test_declared_transition_fires(frm, event, to):
    fsm = AccountFSM(state=frm, hysteresis_ticks_required=1)
    assert fsm.feed(event, now=_t(1)) is to


# ── forbidden transitions raise ────────────────────────────────────────


@pytest.mark.parametrize("frm,event", [
    # cannot recover from LOCKED via OK / AUTH_RECOVERED
    (AccountState.LOCKED, AccountEvent.OK),
    (AccountState.LOCKED, AccountEvent.AUTH_RECOVERED),
    (AccountState.LOCKED, AccountEvent.HTTP_429),
    # cannot directly swap WS without going through reconnect events
    (AccountState.HEALTHY_DIRECT_WS, AccountEvent.WS_RECONNECT_DIRECT),
    (AccountState.HEALTHY_BROWSER_WS, AccountEvent.WS_RECONNECT_BROWSER),
    # DRAINED is terminal
    (AccountState.DRAINED, AccountEvent.OK),
    (AccountState.DRAINED, AccountEvent.AUTH_RECOVERED),
    (AccountState.DRAINED, AccountEvent.UNLOCK),
    # cannot tab-fallback from a primary directly without WS_DROP
    (AccountState.HEALTHY_DIRECT_WS, AccountEvent.TAB_FALLBACK_ENGAGED),
    # ROTATION_REQUIRED_401 cannot be cleared by OK
    (AccountState.ROTATION_REQUIRED_401, AccountEvent.OK),
    (AccountState.ROTATION_REQUIRED_401, AccountEvent.HTTP_429),
])
def test_forbidden_transition_raises(frm, event):
    fsm = AccountFSM(state=frm)
    with pytest.raises(IllegalAccountTransition) as exc:
        fsm.feed(event)
    assert exc.value.state is frm
    assert exc.value.event is event


# ── hysteresis ─────────────────────────────────────────────────────────


def test_rate_limit_recovery_requires_n_consecutive_ok():
    fsm = AccountFSM(
        state=AccountState.RATE_LIMITED_429,
        hysteresis_ticks_required=3,
    )
    # 2 OKs are not enough.
    assert fsm.feed(AccountEvent.OK) is AccountState.RATE_LIMITED_429
    assert fsm.feed(AccountEvent.OK) is AccountState.RATE_LIMITED_429
    # Third OK flips back to HEALTHY_DIRECT_WS.
    assert fsm.feed(AccountEvent.OK) is AccountState.HEALTHY_DIRECT_WS


def test_rate_limit_streak_resets_on_429():
    fsm = AccountFSM(
        state=AccountState.RATE_LIMITED_429,
        hysteresis_ticks_required=3,
    )
    fsm.feed(AccountEvent.OK)
    fsm.feed(AccountEvent.OK)
    # Another 429 resets the streak.
    fsm.feed(AccountEvent.HTTP_429)
    fsm.feed(AccountEvent.OK)
    assert fsm.state is AccountState.RATE_LIMITED_429
    fsm.feed(AccountEvent.OK)
    fsm.feed(AccountEvent.OK)
    assert fsm.state is AccountState.HEALTHY_DIRECT_WS


def test_auth_hold_recovers_via_explicit_signal_after_hysteresis():
    fsm = AccountFSM(
        state=AccountState.AUTH_HOLD,
        hysteresis_ticks_required=2,
    )
    fsm.feed(AccountEvent.AUTH_RECOVERED)  # 1
    assert fsm.state is AccountState.AUTH_HOLD
    fsm.feed(AccountEvent.AUTH_RECOVERED)  # 2
    assert fsm.state is AccountState.HEALTHY_DIRECT_WS


def test_auth_hold_to_lock_without_recovery_path():
    fsm = AccountFSM(state=AccountState.AUTH_HOLD)
    fsm.feed(AccountEvent.LOCKED)
    assert fsm.state is AccountState.LOCKED


# ── log + introspection ────────────────────────────────────────────────


def test_transitions_log_records_real_changes_only():
    fsm = AccountFSM(state=AccountState.HEALTHY_DIRECT_WS, hysteresis_ticks_required=1)
    fsm.feed(AccountEvent.OK, now=_t(1))  # self-loop, not logged
    fsm.feed(AccountEvent.HTTP_429, now=_t(2))
    assert len(fsm.transitions_log) == 1
    when, frm, to, ev = fsm.transitions_log[0]
    assert frm is AccountState.HEALTHY_DIRECT_WS
    assert to is AccountState.RATE_LIMITED_429
    assert ev is AccountEvent.HTTP_429
    assert when == _t(2)


def test_can_returns_true_for_declared_event_only():
    fsm = AccountFSM(state=AccountState.HEALTHY_DIRECT_WS)
    assert fsm.can(AccountEvent.HTTP_429) is True
    assert fsm.can(AccountEvent.WS_RECONNECT_DIRECT) is False
    assert fsm.can(AccountEvent.UNLOCK) is False


def test_helpers_classify_state_groups():
    healthy = AccountFSM(state=AccountState.HEALTHY_DIRECT_WS)
    quarantined = AccountFSM(state=AccountState.LOCKED)
    fallback = AccountFSM(state=AccountState.WS_DEGRADED_TAB_FALLBACK)
    assert healthy.is_healthy_primary is True
    assert quarantined.is_quarantined is True
    assert fallback.is_healthy_primary is False
    assert fallback.is_quarantined is False
    assert AccountState.HEALTHY_BROWSER_WS in HEALTHY_PRIMARY_STATES
    assert AccountState.DRAINED in QUARANTINED_STATES


def test_default_hysteresis_constant_is_three():
    assert DEFAULT_HYSTERESIS_TICKS == 3


def test_declared_transitions_returns_full_table_copy():
    table = declared_transitions()
    # Sanity: copy is independent.
    table.pop(AccountState.LOCKED)
    fsm = AccountFSM(state=AccountState.LOCKED)
    # Original FSM still works — pop did not mutate the module table.
    fsm.feed(AccountEvent.UNLOCK)
    assert fsm.state is AccountState.AUTH_HOLD


def test_last_change_is_recorded_on_real_transition():
    fsm = AccountFSM(state=AccountState.HEALTHY_DIRECT_WS, hysteresis_ticks_required=1)
    before = fsm.last_change
    fsm.feed(AccountEvent.OK, now=_t(5))  # self-loop, no update
    assert fsm.last_change == before
    fsm.feed(AccountEvent.HTTP_429, now=_t(10))
    assert fsm.last_change == _t(10)
