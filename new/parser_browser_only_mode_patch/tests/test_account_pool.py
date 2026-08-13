"""Unit tests for `aggregator.account_pool` (Phase 4 / TZ §6, §7.1)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from aggregator.account_fsm import AccountFSM, AccountState
from aggregator.account_pool import (
    Account,
    AccountPool,
    MoreBetsBudget,
    account_pool_enabled,
)


def _t(s: int = 0) -> datetime:
    return datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=s)


def _acct(
    aid: str,
    family: str = "pin888",
    transport: str = "direct_ws",
    *,
    state: AccountState = AccountState.HEALTHY_DIRECT_WS,
    cap: int = 30,
) -> Account:
    return Account(
        account_id=aid,
        family=family,
        current_transport=transport,
        supported_transports={transport},
        more_bets_budget=MoreBetsBudget(cap=cap, window_sec=60.0),
        fsm=AccountFSM(state=state, hysteresis_ticks_required=1),
    )


# ── registration ──────────────────────────────────────────────────────


def test_register_get_unregister_round_trip():
    pool = AccountPool()
    a = _acct("a1")
    pool.register(a)
    assert pool.get("a1") is a
    pool.unregister("a1")
    assert pool.get("a1") is None


def test_all_accounts_returns_snapshot_list():
    pool = AccountPool()
    pool.register(_acct("a1"))
    pool.register(_acct("a2"))
    assert {a.account_id for a in pool.all_accounts()} == {"a1", "a2"}


# ── selection / picking ───────────────────────────────────────────────


def test_pick_returns_none_when_no_account_for_family():
    pool = AccountPool()
    pool.register(_acct("a1", family="pin888"))
    assert pool.pick("ps3838") is None


def test_pick_skips_quarantined_and_locked_accounts():
    pool = AccountPool()
    pool.register(_acct("locked", state=AccountState.LOCKED))
    pool.register(_acct("auth_hold", state=AccountState.AUTH_HOLD))
    pool.register(_acct("good", state=AccountState.HEALTHY_DIRECT_WS))
    picked = pool.pick("pin888")
    assert picked is not None and picked.account_id == "good"


def test_pick_prefers_direct_ws_over_browser_ws_over_tab():
    pool = AccountPool()
    pool.register(_acct("tab", transport="tab"))
    pool.register(_acct("browser", transport="browser_ws"))
    pool.register(_acct("direct", transport="direct_ws"))
    picked = pool.pick("pin888")
    assert picked is not None and picked.account_id == "direct"


def test_pick_round_robins_within_equal_authority_peers():
    pool = AccountPool()
    pool.register(_acct("a"))
    pool.register(_acct("b"))
    pool.register(_acct("c"))
    picked_ids = [pool.pick("pin888").account_id for _ in range(6)]
    # Every peer must be picked twice (round-robin) — order is the
    # registration insertion order.
    counts = {pid: picked_ids.count(pid) for pid in {"a", "b", "c"}}
    assert counts == {"a": 2, "b": 2, "c": 2}


def test_pick_more_bet_skips_exhausted_budget():
    pool = AccountPool()
    full = _acct("full", cap=2)
    free = _acct("free", cap=10)
    pool.register(full)
    pool.register(free)
    # Burn full's budget.
    full.more_bets_budget.consume(_t(0))
    full.more_bets_budget.consume(_t(0))
    # Pick keeps returning `free` for more_bet markets.
    for _ in range(5):
        picked = pool.pick("pin888", market="more_bet", now=_t(1))
        assert picked.account_id == "free"


def test_pick_more_bet_consumes_budget_at_pick_time():
    pool = AccountPool()
    a = _acct("a", cap=2)
    pool.register(a)
    pool.pick("pin888", market="more_bet", now=_t(0))
    pool.pick("pin888", market="more_bet", now=_t(0))
    assert a.more_bets_budget.used(_t(0)) == 2
    # Third pick → budget exhausted → no candidate.
    assert pool.pick("pin888", market="more_bet", now=_t(0)) is None


def test_more_bet_used_outcome_does_not_double_charge_budget():
    # Regression: `more_bet_used` is telemetry-only; budget was already
    # consumed inside pick(). Reporting the outcome must NOT consume again.
    pool = AccountPool()
    a = _acct("a", cap=4)
    pool.register(a)
    picked = pool.pick("pin888", market="more_bet", now=_t(0))
    assert picked is not None
    pool.report_outcome(picked.account_id, "more_bet_used", _t(0))
    assert a.more_bets_budget.used(_t(0)) == 1


def test_pick_non_more_bet_market_ignores_budget():
    pool = AccountPool()
    a = _acct("a", cap=1)
    pool.register(a)
    a.more_bets_budget.consume(_t(0))  # budget exhausted
    picked = pool.pick("pin888", market="base", now=_t(1))
    assert picked is not None and picked.account_id == "a"


def test_more_bets_budget_window_expires():
    b = MoreBetsBudget(cap=2, window_sec=10.0)
    b.consume(_t(0))
    b.consume(_t(1))
    assert b.available(_t(2)) == 0
    # After the window slides past, both old uses drop off.
    assert b.available(_t(20)) == 2


# ── outcome reporting drives FSM ──────────────────────────────────────


def test_report_outcome_429_drives_fsm_to_rate_limited():
    pool = AccountPool()
    a = _acct("a")
    pool.register(a)
    pool.report_outcome("a", "429", _t(1))
    assert a.state is AccountState.RATE_LIMITED_429
    assert a.last_429_at == _t(1)
    # And subsequent picks skip the quarantined account.
    # (RATE_LIMITED_429 is *not* quarantined; pick can still hand it
    # out for non-MB markets — that's by design. We only assert the
    # FSM moved.)


def test_report_outcome_401_marks_rotation_required():
    pool = AccountPool()
    a = _acct("a")
    pool.register(a)
    pool.report_outcome("a", "401", _t(2))
    assert a.state is AccountState.ROTATION_REQUIRED_401
    assert a.last_401_at == _t(2)
    assert a.auth_status == "rotation_required"
    # Now a is quarantined and pick returns None.
    assert pool.pick("pin888") is None


def test_report_outcome_lock_blocks_picks():
    pool = AccountPool()
    a = _acct("a")
    pool.register(a)
    pool.report_outcome("a", "lock")
    assert a.lock_state == "locked"
    assert pool.pick("pin888") is None


def test_report_outcome_unknown_kind_is_silent_noop():
    pool = AccountPool()
    a = _acct("a")
    pool.register(a)
    pool.report_outcome("a", "no-such-kind")
    assert a.state is AccountState.HEALTHY_DIRECT_WS


def test_report_outcome_for_unknown_account_is_silent_noop():
    pool = AccountPool()
    pool.report_outcome("missing", "ok")  # must not raise


def test_report_outcome_swallows_illegal_fsm_transition():
    pool = AccountPool()
    a = _acct("a", state=AccountState.LOCKED)
    pool.register(a)
    # OK is illegal from LOCKED — pool must swallow.
    pool.report_outcome("a", "ok")
    assert a.state is AccountState.LOCKED


# ── monitoring helpers ────────────────────────────────────────────────


def test_snapshot_serialises_basic_fields():
    pool = AccountPool()
    pool.register(_acct("a"))
    pool.register(_acct("b", state=AccountState.LOCKED))
    snap = pool.snapshot()
    assert snap["count"] == 2
    assert snap["healthy_primary"] == 1
    states = {a["account_id"]: a["state"] for a in snap["accounts"]}
    assert states["a"] == AccountState.HEALTHY_DIRECT_WS.value
    assert states["b"] == AccountState.LOCKED.value


def test_has_any_healthy_browser_account_filters_by_family():
    pool = AccountPool()
    pool.register(_acct("a1", family="pin888"))
    pool.register(_acct("b1", family="ps3838", state=AccountState.LOCKED))
    assert pool.has_any_healthy_browser_account(["pin888"]) is True
    assert pool.has_any_healthy_browser_account(["ps3838"]) is False
    assert pool.has_any_healthy_browser_account() is True


def test_healthy_accounts_in_family_filters():
    pool = AccountPool()
    pool.register(_acct("good", family="pin888"))
    pool.register(_acct("bad", family="pin888", state=AccountState.LOCKED))
    pool.register(_acct("other", family="ps3838"))
    healthy = pool.healthy_accounts_in_family("pin888")
    assert {a.account_id for a in healthy} == {"good"}


def test_account_pool_enabled_reads_env(monkeypatch):
    monkeypatch.delenv("MSP_ACCOUNT_POOL_ENABLED", raising=False)
    assert account_pool_enabled() is False
    monkeypatch.setenv("MSP_ACCOUNT_POOL_ENABLED", "1")
    assert account_pool_enabled() is True
    monkeypatch.setenv("MSP_ACCOUNT_POOL_ENABLED", "no")
    assert account_pool_enabled() is False


def test_pick_bumps_current_load():
    pool = AccountPool()
    a = _acct("a")
    pool.register(a)
    pool.pick("pin888")
    pool.pick("pin888")
    assert a.current_load == 2
    # ok outcome decrements load.
    pool.report_outcome("a", "ok")
    assert a.current_load == 1


def test_register_overwrites_same_account_id():
    pool = AccountPool()
    pool.register(_acct("a", family="pin888"))
    pool.register(_acct("a", family="ps3838"))
    assert pool.get("a").family == "ps3838"


def test_pick_skips_account_in_429_cooldown() -> None:
    """FIX-2 (P1): pick() не выдаёт аккаунт в пределах ACCOUNT_429_COOLDOWN_SEC после 429."""
    pool = AccountPool()
    a = _acct("a429")
    pool.register(a)
    t0 = _t(0)
    pool.report_outcome("a429", "429", t0)
    assert a.last_429_at == t0
    assert pool.pick("pin888", now=_t(1)) is None, "within cooldown must return None"


def test_pick_account_available_after_429_cooldown() -> None:
    """FIX-2 (P1): после cooldown аккаунт снова выдаётся pick()."""
    pool = AccountPool()
    a = _acct("a429b")
    pool.register(a)
    t0 = _t(0)
    pool.report_outcome("a429b", "429", t0)
    picked = pool.pick("pin888", now=_t(5))
    assert picked is not None and picked.account_id == "a429b"


def test_pick_account_with_no_429_is_pickable() -> None:
    """FIX-2 (P1): last_429_at=None → аккаунт доступен без ограничений."""
    pool = AccountPool()
    a = _acct("anone")
    pool.register(a)
    assert a.last_429_at is None
    picked = pool.pick("pin888", now=_t(0))
    assert picked is not None and picked.account_id == "anone"


def test_reserve_more_bet_specific_account_consumes_named_budget() -> None:
    pool = AccountPool()
    a = _acct("a", cap=1)
    b = _acct("b", cap=10)
    pool.register(a)
    pool.register(b)
    assert pool.reserve_more_bet("a", now=_t(0)) is True
    assert a.more_bets_budget.used(_t(0)) == 1
    assert b.more_bets_budget.used(_t(0)) == 0
    assert pool.reserve_more_bet("a", now=_t(0)) is False


def test_reserve_more_bet_respects_429_cooldown_for_named_account() -> None:
    pool = AccountPool()
    a = _acct("a429")
    pool.register(a)
    pool.report_outcome("a429", "429", _t(0))
    assert pool.reserve_more_bet("a429", now=_t(1)) is False
    assert pool.reserve_more_bet("a429", now=_t(5)) is True


def test_reserve_more_bet_per_account_1rps_limiter() -> None:
    pool = AccountPool()
    a = _acct("a", cap=60)
    pool.register(a)
    t0 = _t(0)
    assert pool.reserve_more_bet("a", now=t0) is True
    assert pool.reserve_more_bet("a", now=t0) is False
    t1 = _t(1)
    assert pool.reserve_more_bet("a", now=t1) is True
    t2 = _t(2)
    assert pool.reserve_more_bet("a", now=t2) is True


def test_reserve_more_bet_1rps_two_accounts_independent() -> None:
    pool = AccountPool()
    a = _acct("a", cap=60)
    b = _acct("b", cap=60)
    pool.register(a)
    pool.register(b)
    t0 = _t(0)
    assert pool.reserve_more_bet("a", now=t0) is True
    assert pool.reserve_more_bet("b", now=t0) is True
    assert pool.reserve_more_bet("a", now=t0) is False
    assert pool.reserve_more_bet("b", now=t0) is False
    t1 = _t(1)
    assert pool.reserve_more_bet("a", now=t1) is True
    assert pool.reserve_more_bet("b", now=t1) is True
