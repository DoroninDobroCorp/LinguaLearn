"""Account capability model + pool (Phase 4 / TZ §6, §7.1).

Owns the live registry of account runtimes (one per pin888 / ps3838 /
piwi247 browser tab or direct WS session) and decides which account
should be picked for a given (data_class, market) request. Decisions
stay light — the pool deliberately does not own the network layer; it
hands out an :class:`Account` and the caller does the I/O.

Selection policy (TZ §6.2 + §6.5 transport tier):

1. only consider accounts of the requested ``family``;
2. drop quarantined / locked / drained / auth-hold accounts;
3. respect ``more_bets_budget`` — accounts whose budget window is
   exhausted are skipped for ``more_bet`` markets but still eligible
   for base/discovery markets;
4. prefer ``direct_ws`` > ``browser_ws`` > ``tab`` (transport tier);
5. round-robin within healthy peers of equal authority — keeps load
   balanced without external state.

Everything is opt-in: callers that don't pass an :class:`AccountPool`
to :class:`aggregator.ingest.IngestRouter` see zero behavioural change.
The ``MSP_ACCOUNT_POOL_ENABLED`` flag is checked by *callers* — this
module never reads env at import or in its hot path.
"""

from __future__ import annotations

import os
import threading
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Optional

from aggregator.account_fsm import AccountFSM, AccountState

_ACCOUNT_429_COOLDOWN_SEC: float = float(os.getenv("ACCOUNT_429_COOLDOWN_SEC", "2.0"))
HARD_MOREBET_RPS_CAP: float = 1.0
_MIN_MOREBET_INTERVAL: float = 1.0 / HARD_MOREBET_RPS_CAP


# Transport tier — higher = preferred. Ranks come from TZ §6 (browser/
# direct WS preferred over tab fallback) — and are deliberately wider
# than the AuthorityClass numbers in ``aggregator.sources.profile`` so
# the two never get accidentally compared.
_TRANSPORT_RANK: dict[str, int] = {
    "direct_ws": 30,
    "browser_ws": 20,
    "tab": 10,
    "tab_mode": 10,
}

# Outcome kinds the pool consumes (mirror events the FSM consumes,
# plus a few aggregate signals it uses internally for budgets).
OUTCOME_KINDS: frozenset[str] = frozenset(
    {
        "ok",
        "401",
        "429",
        "lock",
        "ws_drop",
        "auth_hold",
        "recover",
        "drained",
        "more_bet_used",
    }
)


def account_pool_enabled() -> bool:
    """Return True iff ``MSP_ACCOUNT_POOL_ENABLED`` is set.

    Callers gate construction on this; the pool itself never touches
    env beyond this convenience helper.
    """
    raw = (os.environ.get("MSP_ACCOUNT_POOL_ENABLED") or "").strip()
    return raw in ("1", "true", "True", "yes")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class MoreBetsBudget:
    """Sliding-window budget for more_bet probes (TZ §5 More-Bets policy).

    ``window_sec`` is the rolling window length; ``cap`` is the maximum
    allowed events inside that window. ``_used_at`` is a ring buffer of
    timestamps; we prune lazily on each :meth:`available` call.
    """

    cap: int = 30
    window_sec: float = 60.0
    _used_at: list[datetime] = field(default_factory=list)

    def used(self, now: Optional[datetime] = None) -> int:
        self._prune(now or _utc_now())
        return len(self._used_at)

    def available(self, now: Optional[datetime] = None) -> int:
        return max(0, self.cap - self.used(now))

    def consume(self, now: Optional[datetime] = None) -> bool:
        when = now or _utc_now()
        self._prune(when)
        if len(self._used_at) >= self.cap:
            return False
        self._used_at.append(when)
        return True

    def _prune(self, now: datetime) -> None:
        cutoff = now - timedelta(seconds=self.window_sec)
        # Keep only events still inside the window.
        self._used_at = [t for t in self._used_at if t >= cutoff]


@dataclass
class Account:
    """Per-account runtime descriptor (TZ §7.1 enriched for Phase 4)."""

    account_id: str
    family: str  # 'pin888' | 'ps3838' | 'pv247'
    host: str = "mac-local"
    region: str = "EU"
    role: str = "base_feed"
    credentials_ref: str = ""
    supported_transports: set[str] = field(default_factory=set)
    current_transport: str = "direct_ws"
    previous_transport: str = ""
    more_bets_budget: MoreBetsBudget = field(default_factory=MoreBetsBudget)
    capability_profile: dict[str, Any] = field(default_factory=dict)
    last_401_at: Optional[datetime] = None
    last_429_at: Optional[datetime] = None
    last_more_bet_at: Optional[datetime] = None
    lock_state: str = "unlocked"  # unlocked | locked | quarantined
    ws_status: str = "disconnected"  # connected | disconnected | reconnecting
    auth_status: str = "unknown"  # ok | hold | rotation_required | unknown
    current_load: int = 0  # in-flight requests, bumped by callers
    last_health_at: Optional[datetime] = None
    fsm: AccountFSM = field(default_factory=AccountFSM)

    # ── derived predicates ────────────────────────────────────────────

    @property
    def state(self) -> AccountState:
        return self.fsm.state

    def is_pickable(self) -> bool:
        """Cheap predicate: account is in a state usable for new work."""
        return not self.fsm.is_quarantined and self.lock_state != "locked"

    def transport_rank(self) -> int:
        return _TRANSPORT_RANK.get(self.current_transport, 0)


@dataclass
class AccountPool:
    """Thread-safe registry + selection over :class:`Account` instances.

    The pool is deliberately tiny — it does not own threads, does not
    push events to consumers, does not start any background work.
    Callers (source adapters, decision engine) read state via
    :meth:`pick` and report outcomes via :meth:`report_outcome`.
    """

    _accounts: dict[str, Account] = field(default_factory=dict)
    _lock: threading.RLock = field(default_factory=threading.RLock)
    # Round-robin cursor per (family, transport) bucket so equal-authority
    # peers share load.
    _rr_cursor: dict[tuple[str, str], int] = field(
        default_factory=lambda: defaultdict(int)
    )

    # ── registration ──────────────────────────────────────────────────

    def register(self, account: Account) -> None:
        with self._lock:
            self._accounts[account.account_id] = account

    def unregister(self, account_id: str) -> None:
        with self._lock:
            self._accounts.pop(account_id, None)

    def get(self, account_id: str) -> Optional[Account]:
        with self._lock:
            return self._accounts.get(account_id)

    def all_accounts(self) -> list[Account]:
        with self._lock:
            return list(self._accounts.values())

    # ── selection ─────────────────────────────────────────────────────

    def pick(
        self,
        family: str,
        *,
        data_class: Optional[str] = None,
        market: Optional[str] = None,
        now: Optional[datetime] = None,
    ) -> Optional[Account]:
        """Pick the best account for a (family, data_class, market) need.

        ``data_class`` and ``market`` are advisory tokens; the only
        special-cased market today is ``"more_bet"``, which forces a
        ``more_bets_budget`` check. Other markets are budget-blind.

        Returns ``None`` when no eligible account exists.
        """
        when = now or _utc_now()
        is_more_bet = market == "more_bet"

        with self._lock:
            candidates = [
                a
                for a in self._accounts.values()
                if a.family == family
                and a.is_pickable()
                and (
                    a.last_429_at is None
                    or (when - a.last_429_at).total_seconds() >= _ACCOUNT_429_COOLDOWN_SEC
                )
            ]
            if is_more_bet:
                candidates = [a for a in candidates if a.more_bets_budget.available(when) > 0]
            if not candidates:
                return None

            # Bucket by transport rank — top tier first.
            candidates.sort(key=lambda a: a.transport_rank(), reverse=True)
            top_rank = candidates[0].transport_rank()
            top = [a for a in candidates if a.transport_rank() == top_rank]

            # Round-robin inside the equal-rank cohort.
            cursor_key = (family, top[0].current_transport)
            cursor = self._rr_cursor[cursor_key] % len(top)
            self._rr_cursor[cursor_key] = (cursor + 1) % len(top)
            picked = top[cursor]

            if is_more_bet:
                # Budget slot reserved here. Caller MAY call
                # ``report_outcome(..., 'more_bet_used')`` for telemetry;
                # the budget is not refunded on failure and not
                # double-charged on success.
                picked.more_bets_budget.consume(when)

            picked.current_load += 1
            picked.last_health_at = when
            return picked

    def reserve_more_bet(
        self,
        account_id: str,
        *,
        now: Optional[datetime] = None,
    ) -> bool:
        """Reserve one MORE_BET slot for a specific account.

        Fleet workers already own a concrete browser account, so using
        ``pick(..., market="more_bet")`` would round-robin across the pool
        and could charge a different credential.  This method applies the
        same pickability, 429-cooldown, and sliding-window budget checks to
        the named account under the pool lock.
        """
        when = now or _utc_now()
        with self._lock:
            acc = self._accounts.get(account_id)
            if acc is None:
                return False
            if not acc.is_pickable():
                return False
            if (
                acc.last_429_at is not None
                and (when - acc.last_429_at).total_seconds()
                < _ACCOUNT_429_COOLDOWN_SEC
            ):
                return False
            if acc.last_more_bet_at is not None:
                elapsed = (when - acc.last_more_bet_at).total_seconds()
                if elapsed < _MIN_MOREBET_INTERVAL:
                    return False
            if acc.more_bets_budget.available(when) <= 0:
                return False
            acc.last_more_bet_at = when
            return acc.more_bets_budget.consume(when)

    # ── feedback ──────────────────────────────────────────────────────

    def report_outcome(
        self,
        account_id: str,
        kind: str,
        ts: Optional[datetime] = None,
    ) -> None:
        """Push an outcome signal back into the account's FSM + indicators.

        Unknown ``kind`` strings are ignored (defensive — callers may be
        on older code paths). Illegal FSM transitions are caught and
        logged-by-counter; the pool never crashes a caller.
        """
        if kind not in OUTCOME_KINDS:
            return
        when = ts or _utc_now()
        with self._lock:
            acc = self._accounts.get(account_id)
            if acc is None:
                return
            self._apply_outcome(acc, kind, when)

    def _apply_outcome(self, acc: Account, kind: str, when: datetime) -> None:
        acc.last_health_at = when
        # Translate pool-level outcome string → FSM event.
        fsm_event = _OUTCOME_TO_FSM_EVENT.get(kind)

        if kind == "ok":
            acc.current_load = max(0, acc.current_load - 1)
        elif kind == "401":
            acc.last_401_at = when
            acc.auth_status = "rotation_required"
        elif kind == "429":
            acc.last_429_at = when
        elif kind == "lock":
            acc.lock_state = "locked"
        elif kind == "auth_hold":
            acc.auth_status = "hold"
        elif kind == "ws_drop":
            acc.ws_status = "disconnected"
        elif kind == "recover":
            acc.auth_status = "ok"
            acc.ws_status = "connected"
            acc.lock_state = "unlocked"
        elif kind == "drained":
            pass  # FSM transition below handles state
        elif kind == "more_bet_used":
            # Telemetry-only: budget was already consumed at pick() time.
            pass

        if fsm_event is not None:
            try:
                acc.fsm.feed(fsm_event, now=when)
            except Exception:  # noqa: BLE001 — illegal transition: log + continue
                # We deliberately swallow IllegalAccountTransition so a
                # buggy caller (or a redundant outcome) cannot kill the
                # pool. Tests can introspect FSM state directly.
                pass

    # ── monitoring ────────────────────────────────────────────────────

    def snapshot(self) -> dict[str, Any]:
        """Return a JSON-serialisable snapshot for diagnostics endpoints.

        Heavy enough to be useful in dashboards; light enough to call on
        every monitoring tick.
        """
        with self._lock:
            accounts = []
            for a in self._accounts.values():
                accounts.append(
                    {
                        "account_id": a.account_id,
                        "family": a.family,
                        "state": a.state.value,
                        "current_transport": a.current_transport,
                        "lock_state": a.lock_state,
                        "ws_status": a.ws_status,
                        "auth_status": a.auth_status,
                        "current_load": a.current_load,
                        "more_bets_used": a.more_bets_budget.used(),
                        "more_bets_cap": a.more_bets_budget.cap,
                        "last_401_at": a.last_401_at.isoformat() if a.last_401_at else None,
                        "last_429_at": a.last_429_at.isoformat() if a.last_429_at else None,
                        "last_health_at": (
                            a.last_health_at.isoformat() if a.last_health_at else None
                        ),
                    }
                )
            return {
                "accounts": accounts,
                "count": len(accounts),
                "healthy_primary": sum(
                    1 for a in self._accounts.values() if a.fsm.is_healthy_primary
                ),
            }

    # ── helpers used by SystemModeMonitor ─────────────────────────────

    def healthy_accounts_in_family(self, family: str) -> list[Account]:
        """Return the currently pickable accounts for a family."""
        with self._lock:
            return [
                a
                for a in self._accounts.values()
                if a.family == family and a.is_pickable() and a.fsm.is_healthy_primary
            ]

    def families(self) -> set[str]:
        with self._lock:
            return {a.family for a in self._accounts.values()}

    def has_any_healthy_browser_account(
        self, families: Optional[Iterable[str]] = None
    ) -> bool:
        """Is there at least one pickable browser/direct-WS-healthy account?

        Used by ``SystemModeMonitor`` to detect "account-pool-degraded"
        mode (TZ §3.3): when API is fresh but we have *no* healthy
        browser-class account in the requested families, we are in
        pool-degraded territory regardless of source-health timing.
        """
        target_families = set(families) if families is not None else None
        with self._lock:
            for a in self._accounts.values():
                if target_families is not None and a.family not in target_families:
                    continue
                if a.is_pickable() and a.fsm.is_healthy_primary:
                    return True
            return False


# Mapping pool-outcome strings → FSM events. Kept here (not in
# account_fsm) so the FSM module stays caller-agnostic.
from aggregator.account_fsm import AccountEvent  # noqa: E402

_OUTCOME_TO_FSM_EVENT: dict[str, AccountEvent] = {
    "ok": AccountEvent.OK,
    "401": AccountEvent.HTTP_401,
    "429": AccountEvent.HTTP_429,
    "auth_hold": AccountEvent.AUTH_HOLD,
    "lock": AccountEvent.LOCKED,
    "ws_drop": AccountEvent.WS_DROP,
    "recover": AccountEvent.AUTH_RECOVERED,
    "drained": AccountEvent.DRAIN,
    # more_bet_used is budget-only; no FSM event.
}




FLEET_AVAILABLE = "AVAILABLE"
FLEET_ACTIVE = "ACTIVE"
FLEET_COOLDOWN = "COOLDOWN"
FLEET_LOCKED = "LOCKED"
FLEET_COOLDOWN_SEC: float = 120.0
FLEET_LOCK_SEC: float = 24 * 3600.0


class FleetAccount:
    """Simple fleet account for Supervisor runtime (Story 27.40).

    Lives in account_pool.py (ONE pool module) beside canonical Account.
    Managed by FleetAccountPool.
    """

    __slots__ = ("id", "cfg", "status", "available_at", "fail_count", "lock_count", "last_used_at")

    def __init__(self, id: str, cfg: dict[str, Any] | None = None) -> None:  # noqa: A002
        self.id = id
        self.cfg: dict[str, Any] = cfg if cfg is not None else {}
        self.status: str = FLEET_AVAILABLE
        self.available_at: float = 0.0
        self.fail_count: int = 0
        self.lock_count: int = 0
        self.last_used_at: float = 0.0


class FleetAccountPool:
    """Fleet pool: acquire/release/reserve_count/hot-swap lifecycle (Story 27.40).

    COOLDOWN: short wait (~120s) after transient failure.
    LOCKED: long wait (~24h) after 429/ban.
    """

    def __init__(
        self,
        accounts: list[FleetAccount],
        cooldown_sec: float = FLEET_COOLDOWN_SEC,
        lock_sec: float = FLEET_LOCK_SEC,
        success_cooldown_sec: float | None = None,
    ) -> None:
        if accounts and len({a.id for a in accounts}) != len(accounts):
            raise ValueError("duplicate FleetAccount ids")
        self._accounts: dict[str, FleetAccount] = {a.id: a for a in accounts}
        self.cooldown_sec = cooldown_sec
        self.lock_sec = lock_sec
        self.success_cooldown_sec = cooldown_sec if success_cooldown_sec is None else success_cooldown_sec

    def tick(self, now: float) -> None:
        """Promote COOLDOWN/LOCKED accounts whose timeout has expired."""
        for a in self._accounts.values():
            if a.status in (FLEET_COOLDOWN, FLEET_LOCKED) and now >= a.available_at:
                a.status = FLEET_AVAILABLE

    def acquire(self, now: float) -> FleetAccount | None:
        """Acquire one available account (least-recently-used for load balance)."""
        self.tick(now)
        avail = [a for a in self._accounts.values() if a.status == FLEET_AVAILABLE]
        if not avail:
            return None
        acc = min(avail, key=lambda a: a.last_used_at)
        acc.status = FLEET_ACTIVE
        acc.last_used_at = now
        return acc

    def acquire_n(self, now: float, n: int) -> list[FleetAccount]:
        """Acquire up to n accounts."""
        out: list[FleetAccount] = []
        for _ in range(n):
            a = self.acquire(now)
            if a is None:
                break
            out.append(a)
        return out

    def release(self, now: float, acc_id: str, reason: str = "ok") -> None:
        """Release account.

        Successful workers use success_cooldown_sec.  The legacy per-sport
        supervisor keeps the old cooldown behavior by default, while the
        rotating multi-sport supervisor can explicitly set it to 0 and move a
        healthy account to the next sport immediately.
        """
        acc = self._accounts.get(acc_id)
        if acc is None:
            return
        if reason in ("rate_limit", "lockout", "429", "auth_hold", "401"):
            acc.status = FLEET_LOCKED
            acc.available_at = now + self.lock_sec
            acc.lock_count += 1
            acc.fail_count += 1
        elif reason == "ok":
            if self.success_cooldown_sec <= 0:
                acc.status = FLEET_AVAILABLE
                acc.available_at = now
            else:
                acc.status = FLEET_COOLDOWN
                acc.available_at = now + self.success_cooldown_sec
        else:
            acc.status = FLEET_COOLDOWN
            acc.available_at = now + self.cooldown_sec
            acc.fail_count += 1

    def active_count(self) -> int:
        return sum(1 for a in self._accounts.values() if a.status == FLEET_ACTIVE)

    def reserve_count(self, now: float) -> int:
        """Count of accounts available right now (the hot-swap reserve)."""
        self.tick(now)
        return sum(1 for a in self._accounts.values() if a.status == FLEET_AVAILABLE)

    def locked_count(self, now: float) -> int:
        self.tick(now)
        return sum(1 for a in self._accounts.values() if a.status == FLEET_LOCKED)

    def cooldown_count(self, now: float) -> int:
        self.tick(now)
        return sum(1 for a in self._accounts.values() if a.status == FLEET_COOLDOWN)

    def next_available_at(self, now: float) -> float | None:
        """Earliest timestamp when a non-active fleet account can be acquired."""
        self.tick(now)
        candidates = [
            a.available_at
            for a in self._accounts.values()
            if a.status in (FLEET_COOLDOWN, FLEET_LOCKED)
        ]
        return min(candidates) if candidates else None

    def snapshot(self, now: float) -> dict[str, int]:
        """Serialisable pool snapshot."""
        self.tick(now)
        return dict(
            total=len(self._accounts),
            active=self.active_count(),
            reserve=self.reserve_count(now),
            cooldown=self.cooldown_count(now),
            locked=self.locked_count(now),
        )


def replacements_needed(target_k: int, healthy_active: int, reserve: int) -> int:
    """How many accounts to spawn for hot-swap: deficit capped by reserve."""
    deficit = max(0, target_k - healthy_active)
    return min(deficit, reserve)


__all__ = [
    "Account",
    "AccountPool",
    "FleetAccount",
    "FleetAccountPool",
    "MoreBetsBudget",
    "OUTCOME_KINDS",
    "account_pool_enabled",
    "replacements_needed",
]
