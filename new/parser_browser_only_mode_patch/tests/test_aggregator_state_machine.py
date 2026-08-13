"""Unit tests for `aggregator.state_machine`."""

from __future__ import annotations

import pytest

from aggregator.state_machine import (
    make_account_fsm,
    make_source_fsm,
    make_system_fsm,
)
from aggregator.types import AccountState, SourceState, SystemState


def test_system_fsm_initial_normal():
    fsm = make_system_fsm()
    assert fsm.state == SystemState.NORMAL


def test_system_fsm_can_degrade_then_recover():
    fsm = make_system_fsm()
    assert fsm.can(SystemState.API_DEGRADED)
    fsm.transition(SystemState.API_DEGRADED)
    assert fsm.state == SystemState.API_DEGRADED
    fsm.transition(SystemState.NORMAL)
    assert fsm.state == SystemState.NORMAL


def test_system_fsm_illegal_self_loop():
    fsm = make_system_fsm()
    with pytest.raises(ValueError):
        fsm.transition(SystemState.NORMAL)


def test_source_fsm_disconnect_then_recover():
    fsm = make_source_fsm()
    assert fsm.state == SourceState.DISCONNECTED
    fsm.transition(SourceState.HEALTHY)
    fsm.transition(SourceState.STALE)
    fsm.transition(SourceState.HEALTHY)
    assert fsm.state == SourceState.HEALTHY


def test_source_fsm_quarantine_only_from_degraded_or_disconnected():
    fsm = make_source_fsm(SourceState.HEALTHY)
    with pytest.raises(ValueError):
        fsm.transition(SourceState.QUARANTINED)


def test_account_fsm_offline_to_direct_ws():
    fsm = make_account_fsm()
    assert fsm.state == AccountState.OFFLINE
    fsm.transition(AccountState.HEALTHY_DIRECT_WS)


def test_account_fsm_cannot_skip_through_locked():
    fsm = make_account_fsm(AccountState.OFFLINE)
    with pytest.raises(ValueError):
        fsm.transition(AccountState.LOCKED)


def test_account_fsm_browser_swap_allowed():
    """TZ §7.2: only one of direct_ws / browser_ws can be active. The
    transition itself is allowed (swap), but never simultaneous."""
    fsm = make_account_fsm(AccountState.HEALTHY_DIRECT_WS)
    fsm.transition(AccountState.HEALTHY_BROWSER_WS)
    assert fsm.state == AccountState.HEALTHY_BROWSER_WS


def test_fsm_records_last_change_timestamp():
    fsm = make_source_fsm()
    before = fsm.last_change
    fsm.transition(SourceState.HEALTHY)
    assert fsm.last_change >= before
