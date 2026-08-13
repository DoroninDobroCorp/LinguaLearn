"""Integration test: IngestRouter + AccountPool + SystemModeMonitor.

Phase 4 deliverable §4.4 + §4.5 — exercises the optional pool wiring
end-to-end so the "account-pool-degraded" mode is reachable, and
proves the v1 path remains unaffected when the pool is absent.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from aggregator.account_fsm import AccountFSM, AccountState
from aggregator.account_pool import Account, AccountPool, MoreBetsBudget
from aggregator.decision import DecisionEngine
from aggregator.ingest import IngestRouter
from aggregator.state_machine import (
    SourceHealthRegistry,
    SystemMode,
    SystemModeMonitor,
)
from aggregator.store import ProvenanceStore
from aggregator.types import SourceEvent


def _t(s: int = 0) -> datetime:
    return datetime(2026, 6, 1, tzinfo=timezone.utc) + timedelta(seconds=s)


def _api_event(now: datetime) -> SourceEvent:
    return SourceEvent(
        source_id="pinnacle_api",
        family="pinnacle_native",
        transport="http_pull",
        event_id="pinnacle_api:1",
        payload={"Pid": 1},
        collected_at=now,
        received_at=now,
    )


def _pin888_event(now: datetime) -> SourceEvent:
    return SourceEvent(
        source_id="pin888:acct-A:browser_ws",
        family="pinnacle_native",
        transport="browser_ws",
        event_id="pin888:1",
        payload={"Pid": 1},
        collected_at=now,
        received_at=now,
    )


def _account(aid: str, family: str = "pin888", state: AccountState = AccountState.HEALTHY_DIRECT_WS) -> Account:
    return Account(
        account_id=aid,
        family=family,
        more_bets_budget=MoreBetsBudget(cap=10),
        fsm=AccountFSM(state=state, hysteresis_ticks_required=1),
    )


def test_ingest_router_accepts_optional_account_pool():
    pool = AccountPool()
    store = ProvenanceStore()
    router = IngestRouter(store, DecisionEngine(), account_pool=pool)
    assert router.account_pool is pool
    # Behaviour is identical without the pool — single ingest works.
    router.ingest(_pin888_event(_t(0)))
    assert len(list(store.iter_history())) == 1


def test_system_mode_monitor_unchanged_when_no_pool_wired():
    """v1 path: monitor without a pool falls back to source-health rules."""
    health = SourceHealthRegistry()
    health.mark_event("pinnacle_api", when=_t(0))
    health.mark_event("pin888:acct-A:browser_ws", when=_t(0))
    mon = SystemModeMonitor(health=health, healthy_age_sec=10.0)
    assert mon.compute_mode(now=_t(1)) is SystemMode.NORMAL


def test_account_pool_degraded_mode_when_no_healthy_browser_account():
    """Both API + WS sources fresh, but pool reports no healthy browser
    account → mode is forced to POOL_DEGRADED."""
    health = SourceHealthRegistry()
    health.mark_event("pinnacle_api", when=_t(0))
    health.mark_event("pin888:acct-A:browser_ws", when=_t(0))
    pool = AccountPool()
    pool.register(_account("a1", family="pin888", state=AccountState.LOCKED))
    pool.register(_account("a2", family="pin888", state=AccountState.AUTH_HOLD))
    mon = SystemModeMonitor(
        health=health,
        healthy_age_sec=10.0,
        account_pool=pool,
        pool_families=("pin888",),
    )
    assert mon.compute_mode(now=_t(1)) is SystemMode.POOL_DEGRADED


def test_account_pool_normal_mode_when_at_least_one_healthy_account():
    health = SourceHealthRegistry()
    health.mark_event("pinnacle_api", when=_t(0))
    health.mark_event("pin888:acct-A:browser_ws", when=_t(0))
    pool = AccountPool()
    pool.register(_account("a1", family="pin888", state=AccountState.LOCKED))
    pool.register(_account("a2", family="pin888", state=AccountState.HEALTHY_DIRECT_WS))
    mon = SystemModeMonitor(
        health=health,
        healthy_age_sec=10.0,
        account_pool=pool,
        pool_families=("pin888",),
    )
    assert mon.compute_mode(now=_t(1)) is SystemMode.NORMAL


def test_account_pool_with_no_registered_accounts_does_not_force_degraded():
    """Pool wired but empty → monitor must not flip to POOL_DEGRADED.

    An empty pool means "no opinion" — the system might be running
    pre-pool callers. Only when the pool *knows* about the family but
    has no healthy account do we degrade.
    """
    health = SourceHealthRegistry()
    health.mark_event("pinnacle_api", when=_t(0))
    health.mark_event("pin888:acct-A:browser_ws", when=_t(0))
    pool = AccountPool()  # empty
    mon = SystemModeMonitor(
        health=health,
        healthy_age_sec=10.0,
        account_pool=pool,
        pool_families=("pin888",),
    )
    assert mon.compute_mode(now=_t(1)) is SystemMode.NORMAL


def test_router_ingests_with_monitor_and_pool_in_normal_mode():
    health = SourceHealthRegistry()
    pool = AccountPool()
    pool.register(_account("a1", family="pin888"))
    mon = SystemModeMonitor(
        health=health,
        healthy_age_sec=10.0,
        account_pool=pool,
        pool_families=("pin888",),
    )
    store = ProvenanceStore()
    router = IngestRouter(
        store, DecisionEngine(),
        source_health=health,
        system_mode_monitor=mon,
        account_pool=pool,
    )
    # Both API and WS events arrive — published.
    router.ingest(_api_event(_t(0)))
    router.ingest(_pin888_event(_t(0)))
    # 1 event_id namespace per source → 2 history entries.
    assert len(list(store.iter_history())) == 2


def test_pool_failure_in_monitor_does_not_break_compute_mode():
    """The monitor swallows a pool that misbehaves — compute_mode never
    raises (TZ §3.3 invariant: monitoring must never crash producers)."""

    class BadPool:
        def families(self):
            raise RuntimeError("pool exploded")

        def has_any_healthy_browser_account(self, families=None):  # noqa: ARG002
            raise RuntimeError("nope")

    health = SourceHealthRegistry()
    health.mark_event("pinnacle_api", when=_t(0))
    health.mark_event("pin888:acct-A:browser_ws", when=_t(0))
    mon = SystemModeMonitor(
        health=health,
        healthy_age_sec=10.0,
        account_pool=BadPool(),
        pool_families=("pin888",),
    )
    assert mon.compute_mode(now=_t(1)) is SystemMode.NORMAL
