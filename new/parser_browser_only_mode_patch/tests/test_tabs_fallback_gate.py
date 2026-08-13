"""Tests for Story 27.4.D — Tabs fallback state machine (AC-4, AC-5, DOD-9..12).

Tabs are the explicit-gated L2 substitute for PS3838 WS. They activate
only when **both** conditions hold:

* ``MSP_TABS_FALLBACK_ALLOWED=1`` — explicit operator policy flag
* PS3838 WS circuit is **open** — actual L2 failure

Default state: OFF. WS recovery (≥2 consecutive healthy probe cycles)
returns the tabs controller to OFF via PAUSING to prevent flapping
when WS flaps on/off.

State diagram::

    OFF ──(allowed ∧ ws_open)──► ARMED ──(subscribe_ok)──► ACTIVE
      ▲                            │                           │
      │                            ▼                           │
      └─(flag cleared OR ws_alive)─┴────────── ws healthy ─────▶ PAUSING
                                                                 │
                                                  2 healthy cycles │
                                                                 ▼
                                                               OFF

The controller is pure: caller feeds (``allowed``, ``ws_circuit_open``,
``subscribe_ok``) per tick; the controller returns the resulting state.
"""

from __future__ import annotations

import pytest

from aggregator.tabs_controller import (
    DEFAULT_WS_RECOVERY_CYCLES,
    TabsController,
    TabsState,
    tabs_fallback_allowed,
)


def _make_ctl(*, recovery_cycles: int = DEFAULT_WS_RECOVERY_CYCLES) -> TabsController:
    return TabsController(recovery_cycles=recovery_cycles)


# ---------------------------------------------------------------------------
# tabs_fallback_allowed env gate (DOD-9)
# ---------------------------------------------------------------------------


def test_flag_default_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MSP_TABS_FALLBACK_ALLOWED", raising=False)
    assert tabs_fallback_allowed() is False


@pytest.mark.parametrize("val", ["1", "true", "True", "yes"])
def test_flag_on_accepts_common_truthy(
    monkeypatch: pytest.MonkeyPatch, val: str
) -> None:
    monkeypatch.setenv("MSP_TABS_FALLBACK_ALLOWED", val)
    assert tabs_fallback_allowed() is True


@pytest.mark.parametrize("val", ["0", "false", "no", "", "bananas"])
def test_flag_off_rejects_other_values(
    monkeypatch: pytest.MonkeyPatch, val: str
) -> None:
    monkeypatch.setenv("MSP_TABS_FALLBACK_ALLOWED", val)
    assert tabs_fallback_allowed() is False


# ---------------------------------------------------------------------------
# Controller — initial state + basic transitions
# ---------------------------------------------------------------------------


def test_controller_starts_off() -> None:
    ctl = _make_ctl()
    assert ctl.state is TabsState.OFF
    assert ctl.is_active is False
    assert ctl.reason == "off"


def test_allowed_without_ws_open_stays_off() -> None:
    ctl = _make_ctl()
    ctl.update(allowed=True, ws_circuit_open=False)
    assert ctl.state is TabsState.OFF


def test_ws_open_without_allowed_stays_off() -> None:
    """AC-4: without explicit policy flag tabs never activate."""
    ctl = _make_ctl()
    ctl.update(allowed=False, ws_circuit_open=True)
    assert ctl.state is TabsState.OFF
    assert ctl.reason == "off"


def test_allowed_plus_ws_open_transitions_to_armed() -> None:
    ctl = _make_ctl()
    ctl.update(allowed=True, ws_circuit_open=True)
    assert ctl.state is TabsState.ARMED
    assert ctl.is_active is False  # ARMED is not ACTIVE yet
    assert ctl.reason == "ws_circuit_open"


def test_armed_to_active_on_subscribe_ok() -> None:
    ctl = _make_ctl()
    ctl.update(allowed=True, ws_circuit_open=True)
    ctl.on_subscribe_result(success=True)
    assert ctl.state is TabsState.ACTIVE
    assert ctl.is_active is True


def test_armed_stays_armed_on_subscribe_failure() -> None:
    ctl = _make_ctl()
    ctl.update(allowed=True, ws_circuit_open=True)
    ctl.on_subscribe_result(success=False)
    # Caller will retry — remain in ARMED so next tick can try again.
    assert ctl.state is TabsState.ARMED


# ---------------------------------------------------------------------------
# Recovery path — ACTIVE → PAUSING → OFF on WS recovery
# ---------------------------------------------------------------------------


def test_active_to_pausing_on_first_ws_healthy() -> None:
    ctl = _make_ctl(recovery_cycles=2)
    ctl.update(allowed=True, ws_circuit_open=True)
    ctl.on_subscribe_result(success=True)
    assert ctl.state is TabsState.ACTIVE
    ctl.update(allowed=True, ws_circuit_open=False)
    assert ctl.state is TabsState.PAUSING


def test_pausing_to_off_after_recovery_cycles() -> None:
    ctl = _make_ctl(recovery_cycles=2)
    ctl.update(allowed=True, ws_circuit_open=True)
    ctl.on_subscribe_result(success=True)
    ctl.update(allowed=True, ws_circuit_open=False)  # PAUSING (1 healthy)
    ctl.update(allowed=True, ws_circuit_open=False)  # OFF (2 healthy)
    assert ctl.state is TabsState.OFF
    assert ctl.reason == "off"


def test_pausing_goes_back_to_active_on_ws_fail_during_recovery() -> None:
    ctl = _make_ctl(recovery_cycles=2)
    ctl.update(allowed=True, ws_circuit_open=True)
    ctl.on_subscribe_result(success=True)
    ctl.update(allowed=True, ws_circuit_open=False)  # PAUSING
    # WS flips back to open — tabs stay active to cover again.
    ctl.update(allowed=True, ws_circuit_open=True)
    assert ctl.state is TabsState.ACTIVE


def test_recovery_cycles_configurable() -> None:
    ctl = _make_ctl(recovery_cycles=3)
    ctl.update(allowed=True, ws_circuit_open=True)
    ctl.on_subscribe_result(success=True)
    ctl.update(allowed=True, ws_circuit_open=False)  # PAUSING, cycle 1
    ctl.update(allowed=True, ws_circuit_open=False)  # PAUSING, cycle 2
    assert ctl.state is TabsState.PAUSING
    ctl.update(allowed=True, ws_circuit_open=False)  # OFF, cycle 3
    assert ctl.state is TabsState.OFF


def test_default_recovery_cycles_is_two() -> None:
    # Spec: DOD-11 "≥2 consecutive healthy WS cycles".
    assert DEFAULT_WS_RECOVERY_CYCLES == 2


# ---------------------------------------------------------------------------
# Flag-cleared shortcut
# ---------------------------------------------------------------------------


def test_operator_clears_flag_returns_to_off_immediately() -> None:
    ctl = _make_ctl()
    ctl.update(allowed=True, ws_circuit_open=True)
    ctl.on_subscribe_result(success=True)
    assert ctl.state is TabsState.ACTIVE
    ctl.update(allowed=False, ws_circuit_open=True)
    # Operator revoked the explicit policy — tabs off immediately.
    assert ctl.state is TabsState.OFF


# ---------------------------------------------------------------------------
# Reason labels surfaced in /health
# ---------------------------------------------------------------------------


def test_reason_off_in_off_state() -> None:
    ctl = _make_ctl()
    assert ctl.reason == "off"


def test_reason_ws_circuit_open_in_armed_active_pausing() -> None:
    ctl = _make_ctl(recovery_cycles=2)
    ctl.update(allowed=True, ws_circuit_open=True)
    assert ctl.reason == "ws_circuit_open"
    ctl.on_subscribe_result(success=True)
    assert ctl.reason == "ws_circuit_open"
    ctl.update(allowed=True, ws_circuit_open=False)
    assert ctl.reason == "ws_recovery_pending"


# ---------------------------------------------------------------------------
# Snapshot for /health
# ---------------------------------------------------------------------------


def test_snapshot_shape_matches_dod_12_fields() -> None:
    ctl = _make_ctl()
    snap = ctl.snapshot(allowed=False)
    assert set(snap.keys()) == {
        "tabs_fallback_allowed",
        "tabs_fallback_active",
        "tabs_fallback_reason",
        "tabs_fallback_state",
    }
    assert snap["tabs_fallback_allowed"] is False
    assert snap["tabs_fallback_active"] is False
    assert snap["tabs_fallback_reason"] == "off"
    assert snap["tabs_fallback_state"] == "off"


def test_snapshot_in_active_state() -> None:
    ctl = _make_ctl()
    ctl.update(allowed=True, ws_circuit_open=True)
    ctl.on_subscribe_result(success=True)
    snap = ctl.snapshot(allowed=True)
    assert snap["tabs_fallback_allowed"] is True
    assert snap["tabs_fallback_active"] is True
    assert snap["tabs_fallback_state"] == "active"
    assert snap["tabs_fallback_reason"] == "ws_circuit_open"


# ---------------------------------------------------------------------------
# AC-8 guard: normal mode (api ok, ws ok) never flips tabs on
# ---------------------------------------------------------------------------


def test_normal_mode_for_many_cycles_stays_off(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MSP_TABS_FALLBACK_ALLOWED", "1")
    ctl = _make_ctl()
    for _ in range(100):
        ctl.update(allowed=True, ws_circuit_open=False)
    assert ctl.state is TabsState.OFF
