"""Tests for Story 27.3.D — exclusive publish authority + anti-flap (AC-8).

Partner API (L1) is the **exclusive** core-markets publisher for every
event it covers, regardless of WS (L2) freshness. The only time L2
becomes the active publisher is when Partner API's own circuit is open
(consecutive auth / 5xx / transport failures crossed the threshold).
Returning from ``circuit-open`` back to ``healthy`` requires
``recovery_cycles`` consecutive healthy probes — this is the anti-flap
hysteresis mandated by AC-8 / DOD-15.

The hysteresis is applied **only** to circuit-state transitions. There
is no freshness-based fallback: a stale-but-alive L1 still wins over a
faster-than-L1 WS.

These tests exercise the new ``_L1CircuitTracker`` primitive and the
``DecisionEngine.decide()`` signature extension (``exclusive_l1_source_id``
+ ``l1_circuit_open`` kwargs).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from aggregator.decision import DecisionEngine
from aggregator.decision_reasons import DecisionReason
from aggregator.l1_circuit import (
    DEFAULT_CIRCUIT_FAILURE_THRESHOLD,
    DEFAULT_CIRCUIT_RECOVERY_CYCLES,
    CircuitState,
    _L1CircuitTracker,
)
from aggregator.types import CandidateQuote, SystemState


def _mk_cand(
    *,
    source_id: str,
    age_ms: int = 0,
    price: float = 1.92,
    event_id: str = "pinnacle:42",
    is_tombstone: bool = False,
) -> CandidateQuote:
    now = datetime.now(timezone.utc)
    collected = now - timedelta(milliseconds=age_ms)
    return CandidateQuote(
        source_id=source_id,
        family="pinnacle_native",
        transport="http_pull" if "api" in source_id else "ws",
        event_id=event_id,
        payload={
            "Pid": 42,
            "Periods": [{"Number": 0, "MoneyLine": {"Home": price}}],
        },
        collected_at=collected,
        received_at=collected,
        is_tombstone=is_tombstone,
    )


# ---------------------------------------------------------------------------
# _L1CircuitTracker — circuit-state state machine
# ---------------------------------------------------------------------------


def test_tracker_starts_healthy() -> None:
    t = _L1CircuitTracker()
    assert t.state is CircuitState.HEALTHY
    assert t.is_open is False


def test_tracker_opens_after_threshold_consecutive_failures() -> None:
    t = _L1CircuitTracker(failure_threshold=3)
    for _ in range(3):
        t.on_failure()
    assert t.state is CircuitState.OPEN
    assert t.is_open is True


def test_tracker_does_not_open_on_sub_threshold_failures() -> None:
    t = _L1CircuitTracker(failure_threshold=3)
    t.on_failure()
    t.on_failure()
    assert t.state is CircuitState.HEALTHY
    assert t.is_open is False


def test_tracker_counter_resets_on_success_while_healthy() -> None:
    t = _L1CircuitTracker(failure_threshold=3)
    t.on_failure()
    t.on_failure()
    t.on_success()  # reset
    # Need 3 fresh failures to re-open.
    t.on_failure()
    t.on_failure()
    assert t.is_open is False


def test_tracker_single_success_after_open_does_not_close() -> None:
    """AC-8 / DOD-15: anti-flap requires N consecutive healthy probes."""
    t = _L1CircuitTracker(failure_threshold=3, recovery_cycles=2)
    for _ in range(3):
        t.on_failure()
    assert t.is_open is True
    t.on_success()
    # Still open — one healthy probe is not enough.
    assert t.is_open is True


def test_tracker_recovers_after_recovery_cycles() -> None:
    t = _L1CircuitTracker(failure_threshold=3, recovery_cycles=2)
    for _ in range(3):
        t.on_failure()
    t.on_success()
    t.on_success()
    assert t.state is CircuitState.HEALTHY
    assert t.is_open is False


def test_tracker_one_failure_in_recovery_resets_healthy_counter() -> None:
    t = _L1CircuitTracker(failure_threshold=3, recovery_cycles=2)
    for _ in range(3):
        t.on_failure()
    t.on_success()
    t.on_failure()  # reset healthy streak; circuit stays OPEN
    t.on_success()
    # Only 1 consecutive healthy now, need 2.
    assert t.is_open is True


def test_tracker_defaults_match_constants() -> None:
    t = _L1CircuitTracker()
    assert t.failure_threshold == DEFAULT_CIRCUIT_FAILURE_THRESHOLD == 3
    assert t.recovery_cycles == DEFAULT_CIRCUIT_RECOVERY_CYCLES == 2


# ---------------------------------------------------------------------------
# DecisionEngine — exclusive L1 authority while circuit closed
# ---------------------------------------------------------------------------


def test_l1_exclusive_picks_api_even_when_ws_is_fresher() -> None:
    """AC-8 canonical case: Partner API age=1.5s, WS age=0.3s → publish API."""
    engine = DecisionEngine()
    api_cand = _mk_cand(source_id="pinnacle_api", age_ms=1500, price=1.92)
    ws_cand = _mk_cand(source_id="pin888", age_ms=300, price=1.93)

    pq = engine.decide(
        [api_cand, ws_cand],
        exclusive_l1_source_id="pinnacle_api",
        l1_circuit_open=False,
    )
    assert pq is not None
    assert pq.source_used_for_publish == "pinnacle_api"
    assert pq.decision_reason == DecisionReason.L1_PARTNER_API_EXCLUSIVE.value


def test_l1_exclusive_picks_api_when_only_api_present() -> None:
    engine = DecisionEngine()
    api_cand = _mk_cand(source_id="pinnacle_api", age_ms=800)
    pq = engine.decide(
        [api_cand],
        exclusive_l1_source_id="pinnacle_api",
        l1_circuit_open=False,
    )
    assert pq is not None
    assert pq.source_used_for_publish == "pinnacle_api"
    assert pq.decision_reason == DecisionReason.L1_PARTNER_API_EXCLUSIVE.value


def test_l1_exclusive_stale_but_alive_still_wins() -> None:
    """AC-8 edge: L1 age=5s > stale_threshold_live=2s but circuit closed.
    Despite being 'stale', L1 remains publisher — there is no freshness
    override."""
    engine = DecisionEngine()
    stale_api = _mk_cand(source_id="pinnacle_api", age_ms=5000)
    fresh_ws = _mk_cand(source_id="pin888", age_ms=100)

    pq = engine.decide(
        [stale_api, fresh_ws],
        exclusive_l1_source_id="pinnacle_api",
        l1_circuit_open=False,
    )
    assert pq is not None
    assert pq.source_used_for_publish == "pinnacle_api"


def test_circuit_open_fallback_to_ws() -> None:
    engine = DecisionEngine()
    api_cand = _mk_cand(source_id="pinnacle_api", age_ms=100)
    ws_cand = _mk_cand(source_id="pin888", age_ms=500)

    pq = engine.decide(
        [api_cand, ws_cand],
        exclusive_l1_source_id="pinnacle_api",
        l1_circuit_open=True,
    )
    assert pq is not None
    assert pq.source_used_for_publish == "pin888"
    assert pq.decision_reason == DecisionReason.L1_FALLBACK_TO_L2_WS.value


def test_circuit_open_without_l2_candidate_returns_none() -> None:
    """If the circuit is open AND there is no L2 candidate, we publish
    nothing — better skip than wrong match (TZ §2)."""
    engine = DecisionEngine()
    api_cand = _mk_cand(source_id="pinnacle_api", age_ms=100)
    pq = engine.decide(
        [api_cand],
        exclusive_l1_source_id="pinnacle_api",
        l1_circuit_open=True,
    )
    assert pq is None


def test_event_without_l1_coverage_uses_l2_complement() -> None:
    """AC-8 invariant: events NOT covered by L1 → publisher = L2 (WS).

    In this test there is no pinnacle_api candidate at all for the event
    → engine picks the WS one with the L2_COMPLEMENT reason.
    """
    engine = DecisionEngine()
    ws_cand = _mk_cand(source_id="pin888", age_ms=400, event_id="pin888:99")

    pq = engine.decide(
        [ws_cand],
        exclusive_l1_source_id="pinnacle_api",
        l1_circuit_open=False,
    )
    assert pq is not None
    assert pq.source_used_for_publish == "pin888"
    assert pq.decision_reason == DecisionReason.L2_COMPLEMENT.value


def test_legacy_single_source_pass_through_unchanged() -> None:
    """No exclusive kwarg → old behaviour (single_source_pass_through)."""
    engine = DecisionEngine()
    api_cand = _mk_cand(source_id="pinnacle_api", age_ms=200)
    ws_cand = _mk_cand(source_id="pin888", age_ms=100)

    pq = engine.decide([api_cand, ws_cand])
    assert pq is not None
    # Freshest wins in legacy mode (WS here).
    assert pq.source_used_for_publish == "pin888"
    assert pq.decision_reason == "single_source_pass_through"


def test_tombstone_from_l1_short_circuits_even_with_exclusive() -> None:
    """Tombstone from the exclusive source should always publish as
    tombstone, not as a regular quote; AC-8 does not override lifecycle."""
    engine = DecisionEngine()
    tomb = _mk_cand(source_id="pinnacle_api", age_ms=200, is_tombstone=True)
    ws_cand = _mk_cand(source_id="pin888", age_ms=100)

    pq = engine.decide(
        [tomb, ws_cand],
        exclusive_l1_source_id="pinnacle_api",
        l1_circuit_open=False,
    )
    assert pq is not None
    assert pq.source_used_for_publish == "pinnacle_api"
    assert pq.is_tombstone is True


# ---------------------------------------------------------------------------
# stale_threshold boundary (DOD-17 specific edges)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("api_age_ms", [1900, 2000, 2100, 4999, 5100])
def test_l1_wins_at_various_ages_while_circuit_closed(api_age_ms: int) -> None:
    engine = DecisionEngine()
    api_cand = _mk_cand(source_id="pinnacle_api", age_ms=api_age_ms)
    ws_cand = _mk_cand(source_id="pin888", age_ms=100)
    pq = engine.decide(
        [api_cand, ws_cand],
        exclusive_l1_source_id="pinnacle_api",
        l1_circuit_open=False,
    )
    assert pq is not None
    assert pq.source_used_for_publish == "pinnacle_api"


# ---------------------------------------------------------------------------
# System-state shouldn't flip decision
# ---------------------------------------------------------------------------


def test_system_state_respected_but_does_not_override_exclusive() -> None:
    engine = DecisionEngine()
    api_cand = _mk_cand(source_id="pinnacle_api", age_ms=200)
    pq = engine.decide(
        [api_cand],
        system_state=SystemState.API_DEGRADED,
        exclusive_l1_source_id="pinnacle_api",
        l1_circuit_open=False,
    )
    assert pq is not None
    assert pq.source_used_for_publish == "pinnacle_api"
    assert pq.system_state_snapshot is SystemState.API_DEGRADED
