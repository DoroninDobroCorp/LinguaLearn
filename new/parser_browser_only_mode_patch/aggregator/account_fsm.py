"""Account-level finite state machine (Phase 4 / TZ §7.2).

This module defines the formal state machine that drives a single
*account runtime* (one piwi247 / pin888 / ps3838 browser tab or direct
WS session). It is **separate** from the legacy ``aggregator.types
.AccountState`` enum (kept for Phase 1 callers) — Phase 4 needs a
strictly larger vocabulary so failure modes that previously collapsed
into ``DEGRADED`` become independently observable / actionable:

    HEALTHY_DIRECT_WS      → primary, direct WS open
    HEALTHY_BROWSER_WS     → primary, browser-attached WS open
    WS_DEGRADED_TAB_FALLBACK → WS dead; tab-mode emergency feed running
    AUTH_HOLD              → soft auth issue; pause work, no rotation
    RATE_LIMITED_429       → upstream rate-limit; cool-down window
    ROTATION_REQUIRED_401  → hard auth fail; account must rotate creds
    LOCKED                 → upstream locked the account; do not touch
    DRAINED                → cooperatively retired (e.g. budget gone)

Failover & failback are **explicit transitions** — never silent. The
table below captures every legal edge; anything not listed raises
``IllegalAccountTransition`` (caller bug) and is logged.

Hysteresis: rate-limit / auth-hold recovery only flips back to a
healthy state once N consecutive ``ok`` events have been observed
(parameterised; default 3). This prevents flap when the upstream is
intermittently rate-limited at the boundary of its window.

Invariant from TZ §7.2: simultaneous ``direct_ws`` + ``browser_ws`` on
the same account-token is forbidden. The FSM enforces this by allowing
direct↔browser swaps only via an explicit transition (no auto-fallback
between them).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Mapping, Optional


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AccountState(str, Enum):
    """Phase-4 account-level state vocabulary (TZ §7.2)."""

    HEALTHY_DIRECT_WS = "healthy_direct_ws"
    HEALTHY_BROWSER_WS = "healthy_browser_ws"
    WS_DEGRADED_TAB_FALLBACK = "ws_degraded_tab_fallback"
    AUTH_HOLD = "auth_hold"
    RATE_LIMITED_429 = "rate_limited_429"
    ROTATION_REQUIRED_401 = "rotation_required_401"
    LOCKED = "locked"
    DRAINED = "drained"


# Healthy "primary" states — used by hysteresis recovery and the pool
# selection policy. Tab fallback is *operational* but not "primary".
HEALTHY_PRIMARY_STATES: frozenset[AccountState] = frozenset(
    {AccountState.HEALTHY_DIRECT_WS, AccountState.HEALTHY_BROWSER_WS}
)

# States that mean "do not pick this account for new work".
QUARANTINED_STATES: frozenset[AccountState] = frozenset(
    {
        AccountState.AUTH_HOLD,
        AccountState.ROTATION_REQUIRED_401,
        AccountState.LOCKED,
        AccountState.DRAINED,
    }
)


class AccountEvent(str, Enum):
    """External signals the FSM consumes via :meth:`AccountFSM.feed`."""

    OK = "ok"  # successful operation / heartbeat
    HTTP_401 = "http_401"
    HTTP_429 = "http_429"
    AUTH_HOLD = "auth_hold"  # soft auth pause (e.g. 2FA prompt seen)
    AUTH_RECOVERED = "auth_recovered"
    LOCKED = "locked"
    UNLOCK = "unlock"  # operator manual / upstream cleared lock
    WS_DROP = "ws_drop"  # primary WS disconnected
    WS_RECONNECT_DIRECT = "ws_reconnect_direct"
    WS_RECONNECT_BROWSER = "ws_reconnect_browser"
    TAB_FALLBACK_ENGAGED = "tab_fallback_engaged"
    TRANSPORT_DOWNGRADE = "transport_downgrade"
    TRANSPORT_UPGRADE = "transport_upgrade"
    DRAIN = "drain"  # operator cooperatively retires the account


# Transition table: (from_state) → { event → to_state }.
# Anything not present is FORBIDDEN — `feed` raises.
#
# Design rules (TZ §7.2):
#   - direct↔browser swap only via explicit reconnect events;
#   - tab fallback only via explicit TAB_FALLBACK_ENGAGED;
#   - 401/429 do not auto-recover — hysteresis-gated OK does;
#   - LOCKED is sticky (only UNLOCK or DRAIN escape).
_TRANSITIONS: Mapping[
    AccountState, Mapping[AccountEvent, AccountState]
] = {
    AccountState.HEALTHY_DIRECT_WS: {
        AccountEvent.OK: AccountState.HEALTHY_DIRECT_WS,
        AccountEvent.HTTP_401: AccountState.ROTATION_REQUIRED_401,
        AccountEvent.HTTP_429: AccountState.RATE_LIMITED_429,
        AccountEvent.AUTH_HOLD: AccountState.AUTH_HOLD,
        AccountEvent.LOCKED: AccountState.LOCKED,
        AccountEvent.WS_DROP: AccountState.WS_DEGRADED_TAB_FALLBACK,
        AccountEvent.WS_RECONNECT_BROWSER: AccountState.HEALTHY_BROWSER_WS,
        AccountEvent.TRANSPORT_DOWNGRADE: AccountState.HEALTHY_BROWSER_WS,
        AccountEvent.DRAIN: AccountState.DRAINED,
    },
    AccountState.HEALTHY_BROWSER_WS: {
        AccountEvent.OK: AccountState.HEALTHY_BROWSER_WS,
        AccountEvent.HTTP_401: AccountState.ROTATION_REQUIRED_401,
        AccountEvent.HTTP_429: AccountState.RATE_LIMITED_429,
        AccountEvent.AUTH_HOLD: AccountState.AUTH_HOLD,
        AccountEvent.LOCKED: AccountState.LOCKED,
        AccountEvent.WS_DROP: AccountState.WS_DEGRADED_TAB_FALLBACK,
        AccountEvent.WS_RECONNECT_DIRECT: AccountState.HEALTHY_DIRECT_WS,
        AccountEvent.TRANSPORT_DOWNGRADE: AccountState.WS_DEGRADED_TAB_FALLBACK,
        AccountEvent.TRANSPORT_UPGRADE: AccountState.HEALTHY_DIRECT_WS,
        AccountEvent.DRAIN: AccountState.DRAINED,
    },
    AccountState.WS_DEGRADED_TAB_FALLBACK: {
        AccountEvent.OK: AccountState.WS_DEGRADED_TAB_FALLBACK,
        AccountEvent.WS_RECONNECT_DIRECT: AccountState.HEALTHY_DIRECT_WS,
        AccountEvent.WS_RECONNECT_BROWSER: AccountState.HEALTHY_BROWSER_WS,
        AccountEvent.TAB_FALLBACK_ENGAGED: AccountState.WS_DEGRADED_TAB_FALLBACK,
        AccountEvent.TRANSPORT_UPGRADE: AccountState.HEALTHY_BROWSER_WS,
        AccountEvent.HTTP_401: AccountState.ROTATION_REQUIRED_401,
        AccountEvent.HTTP_429: AccountState.RATE_LIMITED_429,
        AccountEvent.LOCKED: AccountState.LOCKED,
        AccountEvent.DRAIN: AccountState.DRAINED,
    },
    AccountState.AUTH_HOLD: {
        AccountEvent.AUTH_HOLD: AccountState.AUTH_HOLD,
        AccountEvent.AUTH_RECOVERED: AccountState.AUTH_HOLD,  # gated by hysteresis
        AccountEvent.OK: AccountState.AUTH_HOLD,  # gated by hysteresis
        AccountEvent.HTTP_401: AccountState.ROTATION_REQUIRED_401,
        AccountEvent.LOCKED: AccountState.LOCKED,
        AccountEvent.DRAIN: AccountState.DRAINED,
    },
    AccountState.RATE_LIMITED_429: {
        AccountEvent.HTTP_429: AccountState.RATE_LIMITED_429,
        AccountEvent.OK: AccountState.RATE_LIMITED_429,  # gated by hysteresis
        AccountEvent.HTTP_401: AccountState.ROTATION_REQUIRED_401,
        AccountEvent.LOCKED: AccountState.LOCKED,
        AccountEvent.WS_DROP: AccountState.WS_DEGRADED_TAB_FALLBACK,
        AccountEvent.DRAIN: AccountState.DRAINED,
    },
    AccountState.ROTATION_REQUIRED_401: {
        AccountEvent.HTTP_401: AccountState.ROTATION_REQUIRED_401,
        AccountEvent.AUTH_RECOVERED: AccountState.HEALTHY_DIRECT_WS,
        AccountEvent.LOCKED: AccountState.LOCKED,
        AccountEvent.DRAIN: AccountState.DRAINED,
    },
    AccountState.LOCKED: {
        AccountEvent.LOCKED: AccountState.LOCKED,
        AccountEvent.UNLOCK: AccountState.AUTH_HOLD,
        AccountEvent.DRAIN: AccountState.DRAINED,
    },
    AccountState.DRAINED: {
        AccountEvent.DRAIN: AccountState.DRAINED,
        # DRAINED is terminal — operator must remove + re-register to
        # bring the account back into rotation.
    },
}


# Events that the hysteresis gate counts as "healthy ticks". For
# RATE_LIMITED_429 we require N successive ``OK`` to flip back; for
# AUTH_HOLD we accept either ``OK`` *or* ``AUTH_RECOVERED`` so the
# operator can short-circuit recovery via an explicit signal.
_HYSTERESIS_HEALTHY_EVENT: Mapping[AccountState, frozenset[AccountEvent]] = {
    AccountState.RATE_LIMITED_429: frozenset({AccountEvent.OK}),
    AccountState.AUTH_HOLD: frozenset({AccountEvent.OK, AccountEvent.AUTH_RECOVERED}),
}


# Recovery target after hysteresis is satisfied.
_HYSTERESIS_RECOVERY_TARGET: Mapping[AccountState, AccountState] = {
    AccountState.RATE_LIMITED_429: AccountState.HEALTHY_DIRECT_WS,
    AccountState.AUTH_HOLD: AccountState.HEALTHY_DIRECT_WS,
}


DEFAULT_HYSTERESIS_TICKS = 3


class IllegalAccountTransition(Exception):
    """Raised when an event is fed that has no transition from the current state."""

    def __init__(self, state: AccountState, event: AccountEvent) -> None:
        super().__init__(
            f"illegal account transition: state={state.value!r} event={event.value!r}"
        )
        self.state = state
        self.event = event


@dataclass
class AccountFSM:
    """Account state machine — pure, no I/O.

    Callers feed external events via :meth:`feed`; reads of ``state``
    return the current symbol. Hysteresis keeps the FSM from flapping
    on intermittent recovery signals — see module docstring.
    """

    state: AccountState = AccountState.HEALTHY_DIRECT_WS
    hysteresis_ticks_required: int = DEFAULT_HYSTERESIS_TICKS
    last_change: datetime = field(default_factory=_utc_now)
    consecutive_healthy_ticks: int = 0
    transitions_log: list[tuple[datetime, AccountState, AccountState, AccountEvent]] = field(
        default_factory=list
    )

    def can(self, event: AccountEvent) -> bool:
        """``True`` iff ``event`` has a declared transition from ``state``."""
        return event in _TRANSITIONS.get(self.state, {})

    def feed(self, event: AccountEvent, now: Optional[datetime] = None) -> AccountState:
        """Apply one event; return the resulting state.

        Raises :class:`IllegalAccountTransition` for undeclared edges so
        bugs surface loudly during integration. Pool wiring must catch
        and log this — never crash the pool.
        """
        when = now or _utc_now()
        table = _TRANSITIONS.get(self.state)
        if table is None or event not in table:
            raise IllegalAccountTransition(self.state, event)

        target = table[event]
        prior = self.state

        # Hysteresis gating: in RATE_LIMITED_429 / AUTH_HOLD a single
        # OK / AUTH_RECOVERED is *not* enough; we require N successive
        # healthy ticks before the explicit recovery happens.
        healthy_set = _HYSTERESIS_HEALTHY_EVENT.get(self.state)
        if healthy_set is not None and event in healthy_set:
            self.consecutive_healthy_ticks += 1
            if self.consecutive_healthy_ticks >= self.hysteresis_ticks_required:
                target = _HYSTERESIS_RECOVERY_TARGET[self.state]
                self.consecutive_healthy_ticks = 0
            else:
                # Self-loop — table already maps OK back to current state
                # for the gated states. Don't log a no-op transition.
                return self.state
        else:
            # Any non-healthy event resets the streak.
            self.consecutive_healthy_ticks = 0

        if target == prior:
            # Self-loops (e.g. OK in HEALTHY_DIRECT_WS) — no change to log.
            return self.state

        self.state = target
        self.last_change = when
        self.transitions_log.append((when, prior, target, event))
        return self.state

    @property
    def is_healthy_primary(self) -> bool:
        return self.state in HEALTHY_PRIMARY_STATES

    @property
    def is_quarantined(self) -> bool:
        return self.state in QUARANTINED_STATES


# Pure introspection for tests / monitoring.
def declared_transitions() -> dict[AccountState, dict[AccountEvent, AccountState]]:
    """Return a deep-copy of the transition table (for tests)."""
    return {state: dict(events) for state, events in _TRANSITIONS.items()}


__all__ = [
    "AccountEvent",
    "AccountFSM",
    "AccountState",
    "DEFAULT_HYSTERESIS_TICKS",
    "HEALTHY_PRIMARY_STATES",
    "IllegalAccountTransition",
    "QUARANTINED_STATES",
    "declared_transitions",
]
