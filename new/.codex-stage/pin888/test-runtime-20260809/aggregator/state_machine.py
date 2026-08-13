"""State machines for system / source / account (TZ §7.2 / v0.1 §6).

Phase 1 implementation: declarative transition tables + a tiny FSM
helper. No timers, no orchestration — just pure state transitions that
upper layers can call.

Phase 3 additions
-----------------

- ``SystemMode`` enum — the *operational* mode the aggregator is in
  (NORMAL / API_DEGRADED / POOL_DEGRADED / BIA_ASSISTED_DEGRADED /
  HARD_DEGRADED / STOPPED). Distinct from the legacy ``SystemState``
  in ``aggregator.types`` to avoid renaming Phase-1 callers.
- ``SourceHealth`` registry — per-source heartbeat-on-event tracker.
  ``IngestRouter`` calls ``mark_event(source_id)`` on every successful
  ingest; ``SystemModeMonitor`` reads the registry and computes the
  current mode using simple thresholds.
- ``SystemModeMonitor`` — observes ``SourceHealth`` and the registered
  ``SourceProfile`` set, and computes the current ``SystemMode`` using
  the rules in TZ §3.3 / §11. No timers, no background tasks — caller
  invokes ``compute_mode(now=...)`` whenever they want a fresh read.
"""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Generic, Mapping, Optional, TypeVar

from aggregator.sources.profile import (
    DEFAULT_REGISTRY,
    AuthorityClass,
    SourceProfile,
    SourceProfileRegistry,
)
from aggregator.types import AccountState, SourceState, SystemState

E = TypeVar("E")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class FSM(Generic[E]):
    state: E
    transitions: Mapping[E, frozenset[E]]
    last_change: datetime = field(default_factory=_utc_now)

    def can(self, target: E) -> bool:
        return target in self.transitions.get(self.state, frozenset())

    def transition(self, target: E) -> E:
        if not self.can(target):
            raise ValueError(f"illegal transition {self.state!r} → {target!r}")
        self.state = target
        self.last_change = _utc_now()
        return self.state


# ── System FSM ─────────────────────────────────────────────────────────

SYSTEM_TRANSITIONS: Mapping[SystemState, frozenset[SystemState]] = {
    SystemState.NORMAL: frozenset({
        SystemState.ACCOUNT_POOL_DEGRADED,
        SystemState.API_DEGRADED,
        SystemState.BIA_ASSISTED_DEGRADED,
        SystemState.DOWN,
    }),
    SystemState.ACCOUNT_POOL_DEGRADED: frozenset({
        SystemState.NORMAL,
        SystemState.BIA_ASSISTED_DEGRADED,
        SystemState.DOWN,
    }),
    SystemState.API_DEGRADED: frozenset({
        SystemState.NORMAL,
        SystemState.BIA_ASSISTED_DEGRADED,
        SystemState.DOWN,
    }),
    SystemState.BIA_ASSISTED_DEGRADED: frozenset({
        SystemState.NORMAL,
        SystemState.ACCOUNT_POOL_DEGRADED,
        SystemState.API_DEGRADED,
        SystemState.DOWN,
    }),
    SystemState.DOWN: frozenset({SystemState.NORMAL}),
}


def make_system_fsm(initial: SystemState = SystemState.NORMAL) -> FSM[SystemState]:
    return FSM(state=initial, transitions=SYSTEM_TRANSITIONS)


# ── Source FSM ─────────────────────────────────────────────────────────

SOURCE_TRANSITIONS: Mapping[SourceState, frozenset[SourceState]] = {
    SourceState.HEALTHY: frozenset({SourceState.STALE, SourceState.DEGRADED, SourceState.DISCONNECTED}),
    SourceState.STALE: frozenset({SourceState.HEALTHY, SourceState.DEGRADED, SourceState.DISCONNECTED}),
    SourceState.DEGRADED: frozenset({
        SourceState.HEALTHY,
        SourceState.STALE,
        SourceState.DISCONNECTED,
        SourceState.QUARANTINED,
    }),
    SourceState.DISCONNECTED: frozenset({SourceState.HEALTHY, SourceState.QUARANTINED}),
    SourceState.QUARANTINED: frozenset({SourceState.DISCONNECTED, SourceState.HEALTHY}),
}


def make_source_fsm(initial: SourceState = SourceState.DISCONNECTED) -> FSM[SourceState]:
    return FSM(state=initial, transitions=SOURCE_TRANSITIONS)


# ── Account FSM ────────────────────────────────────────────────────────
#
# Invariant from TZ §7.2: одновременный direct_ws + browser_ws на одном
# account-token запрещён. The state enum already encodes this — only one
# of HEALTHY_DIRECT_WS / HEALTHY_BROWSER_WS may be the current state.

ACCOUNT_TRANSITIONS: Mapping[AccountState, frozenset[AccountState]] = {
    AccountState.OFFLINE: frozenset({
        AccountState.HEALTHY_DIRECT_WS,
        AccountState.HEALTHY_BROWSER_WS,
        AccountState.AUTH_FAILED,
    }),
    AccountState.HEALTHY_DIRECT_WS: frozenset({
        AccountState.DEGRADED,
        AccountState.LOCKED,
        AccountState.AUTH_FAILED,
        AccountState.OFFLINE,
        AccountState.HEALTHY_BROWSER_WS,
    }),
    AccountState.HEALTHY_BROWSER_WS: frozenset({
        AccountState.DEGRADED,
        AccountState.LOCKED,
        AccountState.AUTH_FAILED,
        AccountState.OFFLINE,
        AccountState.HEALTHY_DIRECT_WS,
    }),
    AccountState.DEGRADED: frozenset({
        AccountState.HEALTHY_DIRECT_WS,
        AccountState.HEALTHY_BROWSER_WS,
        AccountState.LOCKED,
        AccountState.QUARANTINED,
        AccountState.OFFLINE,
    }),
    AccountState.LOCKED: frozenset({AccountState.QUARANTINED, AccountState.OFFLINE}),
    AccountState.AUTH_FAILED: frozenset({AccountState.OFFLINE, AccountState.QUARANTINED}),
    AccountState.QUARANTINED: frozenset({AccountState.OFFLINE}),
}


def make_account_fsm(
    initial: AccountState = AccountState.OFFLINE,
) -> FSM[AccountState]:
    return FSM(state=initial, transitions=ACCOUNT_TRANSITIONS)


__all__ = [
    "FSM",
    "ACCOUNT_TRANSITIONS",
    "SOURCE_TRANSITIONS",
    "SYSTEM_TRANSITIONS",
    "SourceHealth",
    "SourceHealthRegistry",
    "SystemMode",
    "SystemModeMonitor",
    "make_account_fsm",
    "make_source_fsm",
    "make_system_fsm",
]


# ── Phase 3: SystemMode + SourceHealth + Monitor ──────────────────────


class SystemMode(str, Enum):
    """Operational mode of the aggregator (TZ §3.3 / §11).

    Distinct from the legacy ``aggregator.types.SystemState`` enum,
    which is the *consumer-visible* state stamp on PublishedQuotes.
    The decision engine v2 reads ``SystemMode`` to pick per-mode
    authority hierarchies.
    """

    NORMAL = "normal"
    API_DEGRADED = "api_degraded"
    POOL_DEGRADED = "pool_degraded"
    BIA_ASSISTED_DEGRADED = "bia_assisted_degraded"
    HARD_DEGRADED = "hard_degraded"
    STOPPED = "stopped"


# Default freshness thresholds (TZ §5 N1 values, conservative).
# Tuned per-mode by SystemModeMonitor; tests pass overrides.
DEFAULT_HEALTHY_AGE_SEC = 6.0  # 2 × N1_live
DEFAULT_HARD_AGE_SEC = 15.0  # 5 × N1_live


@dataclass
class SourceHealth:
    """Heartbeat state for a single source.

    ``last_event_at`` is updated on every successful ingest; failures
    bump ``consecutive_failures``. ``is_fresh`` is a pure read against
    ``now`` and the configured threshold — there is no background
    timer.
    """

    source_id: str
    last_event_at: Optional[datetime] = None
    last_failure_at: Optional[datetime] = None
    consecutive_failures: int = 0
    total_events: int = 0

    def is_fresh(self, *, now: datetime, healthy_age_sec: float = DEFAULT_HEALTHY_AGE_SEC) -> bool:
        if self.last_event_at is None:
            return False
        return (now - self.last_event_at) <= timedelta(seconds=healthy_age_sec)

    def is_alive(self, *, now: datetime, hard_age_sec: float = DEFAULT_HARD_AGE_SEC) -> bool:
        if self.last_event_at is None:
            return False
        return (now - self.last_event_at) <= timedelta(seconds=hard_age_sec)


class SourceHealthRegistry:
    """Thread-safe map of ``source_id`` → ``SourceHealth``.

    The IngestRouter holds a reference and bumps it on every event.
    Diagnostic endpoints + SystemModeMonitor read it. No background
    work.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._map: dict[str, SourceHealth] = {}

    def mark_event(self, source_id: str, *, when: Optional[datetime] = None) -> None:
        when = when or datetime.now(timezone.utc)
        with self._lock:
            h = self._map.get(source_id)
            if h is None:
                h = SourceHealth(source_id=source_id)
                self._map[source_id] = h
            h.last_event_at = when
            h.consecutive_failures = 0
            h.total_events += 1

    def mark_failure(self, source_id: str, *, when: Optional[datetime] = None) -> None:
        when = when or datetime.now(timezone.utc)
        with self._lock:
            h = self._map.get(source_id)
            if h is None:
                h = SourceHealth(source_id=source_id)
                self._map[source_id] = h
            h.last_failure_at = when
            h.consecutive_failures += 1

    def get(self, source_id: str) -> Optional[SourceHealth]:
        with self._lock:
            h = self._map.get(source_id)
            if h is None:
                return None
            # Return a snapshot to avoid race on attribute reads.
            return SourceHealth(
                source_id=h.source_id,
                last_event_at=h.last_event_at,
                last_failure_at=h.last_failure_at,
                consecutive_failures=h.consecutive_failures,
                total_events=h.total_events,
            )

    def known_source_ids(self) -> list[str]:
        with self._lock:
            return list(self._map.keys())


def _profile_for(
    source_id: str, registry: Optional[SourceProfileRegistry] = None
) -> Optional[SourceProfile]:
    return (registry or DEFAULT_REGISTRY).get(source_id)


@dataclass
class SystemModeMonitor:
    """Compute the current ``SystemMode`` from source health.

    Rules (TZ §3.3 / §11, simplified for Phase 3):

    - if **no** source has produced a fresh event recently → HARD_DEGRADED;
    - if only BIA-class sources are alive → BIA_ASSISTED_DEGRADED;
    - if no OFFICIAL_API source is alive but at least one BROWSER_WS
      pinnacle-native source is fresh → API_DEGRADED;
    - if at least one OFFICIAL_API source is fresh but **no**
      BROWSER_WS pinnacle-native source is fresh → POOL_DEGRADED;
    - otherwise → NORMAL.

    Phase-4 extension: when an :class:`AccountPool` is wired (optional
    ``account_pool`` field), the monitor *also* checks whether any
    pickable browser/direct-WS account exists in the pool. If the API
    looks fresh **and** the pool reports zero healthy browser-class
    accounts, the mode is forced to POOL_DEGRADED regardless of the
    raw source-event timing — pool-level degradation is the operator
    signal for "browser feeds need attention".

    Mode is *computed*; it can change every call. A small hysteresis is
    applied so flips happen on a sustained signal: ``min_dwell_sec``
    is the minimum time the monitor must observe a candidate mode
    different from the current one before it switches. Tests can set
    this to ``0`` to disable.
    """

    health: SourceHealthRegistry
    registry: SourceProfileRegistry = field(default_factory=lambda: DEFAULT_REGISTRY)
    healthy_age_sec: float = DEFAULT_HEALTHY_AGE_SEC
    hard_age_sec: float = DEFAULT_HARD_AGE_SEC
    min_dwell_sec: float = 0.0
    # Phase 4 — optional AccountPool. Typed as Any to avoid a
    # circular import (account_pool -> nothing here, but keep the
    # import-time graph minimal so Phase 1 callers stay flat).
    account_pool: object | None = None
    pool_families: tuple[str, ...] = ("pin888", "ps3838", "pv247")
    _current_mode: SystemMode = SystemMode.NORMAL
    _candidate_mode: Optional[SystemMode] = None
    _candidate_since: Optional[datetime] = None

    def __post_init__(self) -> None:
        # Allow env-driven override only on construction, not at module load.
        self._explicit_override: Optional[SystemMode] = None

    def force_mode(self, mode: Optional[SystemMode]) -> None:
        """Pin the monitor to ``mode`` (testing / ops escape hatch)."""
        self._explicit_override = mode
        if mode is not None:
            self._current_mode = mode

    def compute_mode(self, *, now: Optional[datetime] = None) -> SystemMode:
        if self._explicit_override is not None:
            return self._explicit_override

        now = now or datetime.now(timezone.utc)
        proposed = self._propose(now)

        if proposed == self._current_mode:
            self._candidate_mode = None
            self._candidate_since = None
            return self._current_mode

        # Hysteresis — require sustained signal before switching, EXCEPT
        # when we're recovering from a degraded state into NORMAL: the
        # TZ §6.4 anti-flap rule is asymmetric (degrade fast on stale,
        # recover instantly on healthy native).
        recovering_to_normal = (
            self._current_mode != SystemMode.NORMAL and proposed == SystemMode.NORMAL
        )
        if recovering_to_normal or self.min_dwell_sec <= 0:
            self._current_mode = proposed
            self._candidate_mode = None
            self._candidate_since = None
            return self._current_mode

        if self._candidate_mode != proposed:
            self._candidate_mode = proposed
            self._candidate_since = now
            return self._current_mode

        assert self._candidate_since is not None
        if (now - self._candidate_since) >= timedelta(seconds=self.min_dwell_sec):
            self._current_mode = proposed
            self._candidate_mode = None
            self._candidate_since = None
        return self._current_mode

    # ── internals ─────────────────────────────────────────────────────

    def _propose(self, now: datetime) -> SystemMode:
        api_fresh = False
        ws_fresh = False
        bia_fresh = False

        # API sources poll every ~10s × N sports → use a generous freshness
        # window (120s ≈ 2 full cycles) instead of the WS-oriented default.
        _API_HEALTHY_AGE_SEC = 120.0

        for sid in self.health.known_source_ids():
            h = self.health.get(sid)
            if h is None:
                continue
            profile = _profile_for(sid, self.registry)
            if profile is None:
                continue
            if profile.authority_class is AuthorityClass.OFFICIAL_API:
                if h.is_fresh(now=now, healthy_age_sec=_API_HEALTHY_AGE_SEC):
                    api_fresh = True
            elif (
                profile.authority_class
                in (AuthorityClass.BROWSER_WS, AuthorityClass.TAB_MODE)
                and profile.is_pinnacle_native
            ):
                if h.is_fresh(now=now, healthy_age_sec=self.healthy_age_sec):
                    ws_fresh = True
            elif profile.authority_class is AuthorityClass.BIA_SUPPLEMENT:
                if h.is_fresh(now=now, healthy_age_sec=self.healthy_age_sec):
                    bia_fresh = True

        if not (api_fresh or ws_fresh or bia_fresh):
            # No source is producing fresh events. The hard/soft
            # distinction (alive-but-stale vs. never-seen) was
            # considered and dropped: callers want a single sentinel
            # and the test suite/TZ §3.3 collapses the two into
            # HARD_DEGRADED. STOPPED is reserved for the explicit
            # operator shutdown path (force_mode / system FSM).
            return SystemMode.HARD_DEGRADED
        if not api_fresh and not ws_fresh and bia_fresh:
            return SystemMode.BIA_ASSISTED_DEGRADED
        if api_fresh and not ws_fresh:
            return SystemMode.POOL_DEGRADED
        if not api_fresh and ws_fresh:
            return SystemMode.API_DEGRADED

        # Phase 4: even when both API + WS look fresh from raw events,
        # consult the account pool. If we know about browser accounts
        # but none are pickable+healthy, that's a pool-degraded signal
        # operators must see (e.g. all browser tabs in 401 rotation).
        if self.account_pool is not None:
            try:
                pool = self.account_pool
                # Duck-typed call so we avoid an import cycle.
                if hasattr(pool, "families") and hasattr(
                    pool, "has_any_healthy_browser_account"
                ):
                    known_families = pool.families()
                    target = [f for f in self.pool_families if f in known_families]
                    if target and not pool.has_any_healthy_browser_account(
                        families=target
                    ):
                        return SystemMode.POOL_DEGRADED
            except Exception:  # noqa: BLE001 — pool must not break monitor
                pass

        return SystemMode.NORMAL


def system_mode_from_env() -> Optional[SystemMode]:
    """Optional ops escape hatch — set ``MSP_FORCE_SYSTEM_MODE``.

    Useful for shadow-mode bring-up where we want to lock the engine
    into a particular policy regardless of source health. Returns
    ``None`` when unset / invalid.
    """
    raw = os.environ.get("MSP_FORCE_SYSTEM_MODE", "").strip().lower()
    if not raw:
        return None
    for m in SystemMode:
        if m.value == raw:
            return m
    return None


def _env_float_positive(env: dict[str, str], name: str, default: float) -> float:
    """Read a strictly-positive float from *env*; fall back to *default* on
    empty / non-numeric / negative.

    Centralised because the three age-config reads below need identical
    defensiveness, and startup must never crash on a typo.
    """
    raw = env.get(name, "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    if value < 0:
        return default
    return value


def age_config_from_env(env: Optional[dict[str, str]] = None) -> dict[str, Any]:
    """Read Story-27.12 env overrides for SystemModeMonitor thresholds.

    Environment (all optional, numeric seconds):

    - ``MSP_HEALTHY_AGE_SEC``            → global ``healthy_age_sec`` override
      (default :data:`DEFAULT_HEALTHY_AGE_SEC`). Applies to WS + BIA sources;
      API sources keep their internal 120s window regardless.
    - ``MSP_HEALTHY_AGE_SEC_BROWSER_WS`` → per-profile override specifically
      for BROWSER_WS pinnacle-native sources (returned as
      ``healthy_age_sec_browser_ws``; ``None`` if unset). The runtime may
      choose to apply this only where appropriate — see
      ``SystemModeMonitor._propose``.
    - ``MSP_HARD_AGE_SEC``               → ``hard_age_sec`` override (default
      :data:`DEFAULT_HARD_AGE_SEC`).
    - ``MSP_SYSTEM_MODE_MIN_DWELL_SEC``  → hysteresis dwell before a mode
      flip commits (default ``0.0`` — no hysteresis).

    Returns a dict usable directly as **kwargs into ``SystemModeMonitor(...)``
    (with ``healthy_age_sec_browser_ws`` stripped if the caller doesn't
    support it).
    """
    source = env if env is not None else dict(os.environ)
    healthy_ws_raw = source.get("MSP_HEALTHY_AGE_SEC_BROWSER_WS", "").strip()
    healthy_ws: Optional[float]
    if not healthy_ws_raw:
        healthy_ws = None
    else:
        try:
            parsed = float(healthy_ws_raw)
            healthy_ws = parsed if parsed >= 0 else None
        except ValueError:
            healthy_ws = None

    return {
        "healthy_age_sec": _env_float_positive(
            source, "MSP_HEALTHY_AGE_SEC", DEFAULT_HEALTHY_AGE_SEC
        ),
        "hard_age_sec": _env_float_positive(
            source, "MSP_HARD_AGE_SEC", DEFAULT_HARD_AGE_SEC
        ),
        "min_dwell_sec": _env_float_positive(
            source, "MSP_SYSTEM_MODE_MIN_DWELL_SEC", 0.0
        ),
        "healthy_age_sec_browser_ws": healthy_ws,
    }
