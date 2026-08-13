"""Tabs fallback state machine — Story 27.4.D (AC-4, AC-5, DOD-9..12).

PS3838 WS is the default L2 source. Tabs (cookie-based browser sessions)
are a **fallback** for WS — activated only under two co-occurring
conditions:

1. ``MSP_TABS_FALLBACK_ALLOWED=1`` — explicit operator policy flag.
   TZ v1.0 §2 invariant 5 ("no automatic tab fallback in normal mode")
   is satisfied by keeping the default off; flipping the flag is the
   "explicit policy".
2. PS3838 WS circuit is **open** (story 27.4 AC-5 hard precondition).

The controller encodes a 4-state machine — ``OFF → ARMED → ACTIVE →
PAUSING → OFF`` — with anti-flap hysteresis on the return path:
recovery requires ``DEFAULT_WS_RECOVERY_CYCLES`` (2) consecutive
healthy WS probes to transition from PAUSING to OFF. A new WS failure
during recovery reinstates ACTIVE.

Pure module: no I/O, no threading. The caller feeds per-tick signals
through :meth:`TabsController.update` and optionally reports subscribe
results via :meth:`on_subscribe_result`.
"""

from __future__ import annotations

import os
from enum import Enum
from typing import Any


DEFAULT_WS_RECOVERY_CYCLES = 2


class TabsState(str, Enum):
    OFF = "off"
    ARMED = "armed"
    ACTIVE = "active"
    PAUSING = "pausing"


def tabs_fallback_allowed(env: dict[str, str] | None = None) -> bool:
    """Read ``MSP_TABS_FALLBACK_ALLOWED`` and coerce to bool.

    Accepts the usual truthy literals (``1``, ``true``, ``True``,
    ``yes``) — anything else is ``False``. The Epic-27 interpretation
    of TZ v1.0 §2 invariant 5: this flag is the "explicit policy"
    switch — default off.
    """
    source = env if env is not None else os.environ
    raw = (source.get("MSP_TABS_FALLBACK_ALLOWED") or "").strip()
    return raw in ("1", "true", "True", "yes")


class TabsController:
    """State machine that decides when tabs should substitute for WS.

    The caller is expected to invoke :meth:`update` once per tick with
    the fresh ``(allowed, ws_circuit_open)`` pair. After an ``ARMED`` →
    ``ACTIVE`` transition the external tab subscriber confirms success
    via :meth:`on_subscribe_result`. The controller itself never
    performs I/O.
    """

    __slots__ = ("_state", "_healthy_cycles", "_recovery_cycles")

    def __init__(
        self,
        *,
        recovery_cycles: int = DEFAULT_WS_RECOVERY_CYCLES,
    ) -> None:
        if recovery_cycles < 1:
            raise ValueError("recovery_cycles must be >= 1")
        self._state: TabsState = TabsState.OFF
        self._healthy_cycles: int = 0
        self._recovery_cycles: int = int(recovery_cycles)

    # ── Query -----------------------------------------------------------

    @property
    def state(self) -> TabsState:
        return self._state

    @property
    def is_active(self) -> bool:
        """True iff tabs are actively serving as the L2 substitute."""
        return self._state is TabsState.ACTIVE

    @property
    def reason(self) -> str:
        """Short label for ``/health`` surface."""
        if self._state is TabsState.OFF:
            return "off"
        if self._state is TabsState.PAUSING:
            return "ws_recovery_pending"
        return "ws_circuit_open"

    # ── Mutation --------------------------------------------------------

    def update(self, *, allowed: bool, ws_circuit_open: bool) -> TabsState:
        """Feed one tick of (``allowed``, ``ws_circuit_open``) signals.

        Returns the post-transition state. Behaviour per current state:

        * **OFF**: arm if ``allowed AND ws_circuit_open``, else stay.
        * **ARMED**: go OFF if ``NOT allowed`` (operator revocation) or
          ``NOT ws_circuit_open`` (WS recovered before we subscribed).
        * **ACTIVE**: go OFF immediately on ``NOT allowed``; enter
          PAUSING on first healthy WS (``ws_circuit_open=False``).
        * **PAUSING**: count consecutive healthy ticks; return to
          ACTIVE on a fresh failure; drop to OFF after
          ``recovery_cycles`` healthy ticks. ``NOT allowed`` → OFF.
        """
        if not allowed:
            # Operator revocation is immediate.
            self._state = TabsState.OFF
            self._healthy_cycles = 0
            return self._state

        if self._state is TabsState.OFF:
            if ws_circuit_open:
                self._state = TabsState.ARMED
            return self._state

        if self._state is TabsState.ARMED:
            if not ws_circuit_open:
                # WS came back before we subscribed — no need for tabs.
                self._state = TabsState.OFF
            return self._state

        if self._state is TabsState.ACTIVE:
            if not ws_circuit_open:
                self._state = TabsState.PAUSING
                self._healthy_cycles = 1
            return self._state

        # PAUSING
        if ws_circuit_open:
            # New failure during recovery — tabs stay on.
            self._state = TabsState.ACTIVE
            self._healthy_cycles = 0
        else:
            self._healthy_cycles += 1
            if self._healthy_cycles >= self._recovery_cycles:
                self._state = TabsState.OFF
                self._healthy_cycles = 0
        return self._state

    def on_subscribe_result(self, *, success: bool) -> TabsState:
        """Caller reports the outcome of the tab subscribe attempt.

        In ``ARMED`` state a successful subscribe transitions to
        ``ACTIVE``; a failure leaves the controller in ``ARMED`` so
        the next tick can retry. Called in other states is a no-op.
        """
        if self._state is TabsState.ARMED and success:
            self._state = TabsState.ACTIVE
        return self._state

    # ── Observability --------------------------------------------------

    def snapshot(self, *, allowed: bool) -> dict[str, Any]:
        """/health surface (DOD-12)."""
        return {
            "tabs_fallback_allowed": bool(allowed),
            "tabs_fallback_active": self.is_active,
            "tabs_fallback_reason": self.reason,
            "tabs_fallback_state": self._state.value,
        }


__all__ = [
    "DEFAULT_WS_RECOVERY_CYCLES",
    "TabsController",
    "TabsState",
    "tabs_fallback_allowed",
]
