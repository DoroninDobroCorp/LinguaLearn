"""L1 (Partner API) circuit-state tracker for Story 27.3.D exclusive
publish authority.

This module defines a tiny state-machine that the aggregator owns per
logical L1 source (today: ``pinnacle_api``). It has two purposes:

1. Provide a single ``is_open`` bit the decision engine can consult to
   decide whether L1 is currently acting as the exclusive publisher or
   L2 is filling in (AC-8).
2. Enforce the anti-flap hysteresis mandated by AC-8 / DOD-15: returning
   from ``OPEN`` to ``HEALTHY`` requires ``recovery_cycles`` consecutive
   successful probe cycles. A single success after a fault is NOT enough.

Design notes:

- The tracker is **pure** — no time, no threading, no env reads. The
  caller (``IngestRouter`` or a supervisor) decides what counts as a
  success or a failure and feeds the events in. This keeps it trivially
  unit-testable and reusable for any future L1-shaped source (e.g. the
  conditional Arcadia standby from Story 27.9).
- Hysteresis state is **not** applied to per-event / per-quote freshness.
  There is no freshness arbitration in Epic-27's core ladder: while the
  circuit is closed, L1 wins every covered event regardless of WS age.
"""

from __future__ import annotations

from enum import Enum


DEFAULT_CIRCUIT_FAILURE_THRESHOLD = 3
DEFAULT_CIRCUIT_RECOVERY_CYCLES = 2


class CircuitState(str, Enum):
    """Observable circuit states for an L1 source."""

    HEALTHY = "healthy"
    OPEN = "open"


class _L1CircuitTracker:
    """State machine tracking whether the L1 source is the active publisher.

    Parameters
    ----------
    failure_threshold
        Number of consecutive failure events that trips the circuit
        from ``HEALTHY`` to ``OPEN``. Reset on any success while healthy.
    recovery_cycles
        Number of consecutive success events required to return from
        ``OPEN`` to ``HEALTHY``. Any failure during recovery resets the
        healthy streak, keeping the circuit open.

    The caller is expected to drive this via ``on_failure()`` /
    ``on_success()`` from whatever source-health signal is authoritative
    — typically the Partner API adapter's poll outcomes.
    """

    __slots__ = (
        "failure_threshold",
        "recovery_cycles",
        "state",
        "_consecutive_failures",
        "_consecutive_healthy",
    )

    def __init__(
        self,
        *,
        failure_threshold: int = DEFAULT_CIRCUIT_FAILURE_THRESHOLD,
        recovery_cycles: int = DEFAULT_CIRCUIT_RECOVERY_CYCLES,
    ) -> None:
        if failure_threshold < 1:
            raise ValueError("failure_threshold must be >= 1")
        if recovery_cycles < 1:
            raise ValueError("recovery_cycles must be >= 1")
        self.failure_threshold: int = int(failure_threshold)
        self.recovery_cycles: int = int(recovery_cycles)
        self.state: CircuitState = CircuitState.HEALTHY
        self._consecutive_failures: int = 0
        self._consecutive_healthy: int = 0

    @property
    def is_open(self) -> bool:
        """True iff the L1 source is currently in ``OPEN`` state."""
        return self.state is CircuitState.OPEN

    def on_failure(self) -> None:
        """Record a single failure event (5xx / transport / auth).

        Increments the consecutive-failure counter in ``HEALTHY`` and
        trips the circuit to ``OPEN`` when the threshold is reached.
        Always resets the healthy-recovery counter so an in-flight
        recovery attempt is aborted.
        """
        self._consecutive_healthy = 0
        if self.state is CircuitState.HEALTHY:
            self._consecutive_failures += 1
            if self._consecutive_failures >= self.failure_threshold:
                self.state = CircuitState.OPEN
        # In OPEN state failures are expected; no bookkeeping required.

    def on_success(self) -> None:
        """Record a single success event.

        In ``HEALTHY`` state, a success simply zeroes the failure streak
        (so a lone 5xx does not stay counted forever). In ``OPEN`` state,
        it ticks the healthy-recovery counter; when it reaches
        ``recovery_cycles`` the circuit returns to ``HEALTHY`` and both
        counters reset.
        """
        if self.state is CircuitState.HEALTHY:
            self._consecutive_failures = 0
            return
        # OPEN → count consecutive healthy probes.
        self._consecutive_healthy += 1
        if self._consecutive_healthy >= self.recovery_cycles:
            self.state = CircuitState.HEALTHY
            self._consecutive_failures = 0
            self._consecutive_healthy = 0


__all__ = [
    "CircuitState",
    "DEFAULT_CIRCUIT_FAILURE_THRESHOLD",
    "DEFAULT_CIRCUIT_RECOVERY_CYCLES",
    "_L1CircuitTracker",
]
