from __future__ import annotations
import inspect
import pytest
from aggregator.morebets_targeting import (
    AllLiveTrigger, FortedTopNTrigger, ManualTrigger,
    MoreBetTarget, MoreBetsTargeter,
)

def _forks(*pairs):  # type: ignore[no-untyped-def]
    return [dict(event_id=eid, profit=pr, is_live=False) for eid, pr in pairs]


def _make(triggers, top_n=5, watch=120.0, cap=None, live_r=2.0, prematch_r=12.0):  # type: ignore[no-untyped-def]
    return MoreBetsTargeter(
        triggers=triggers,
        top_n=top_n,
        watch_duration_sec=watch,
        live_refresh_sec=live_r,
        prematch_refresh_sec=prematch_r,
        default_family="first_half_1x2",
        capacity_cap=cap,
    )

# --- T01: select_targets basic ---

def test_select_targets_sorted_by_profit():
    trigger = FortedTopNTrigger(_forks((101, 1.5), (102, 3.0), (103, 0.8)))
    t = _make([trigger])
    targets = t.select_targets(now=0.0)
    assert len(targets) == 3
    assert all(isinstance(x, MoreBetTarget) for x in targets)
    assert targets[0].event_id == 102
    assert targets[1].event_id == 101
    assert targets[2].event_id == 103


def test_select_targets_family_propagated():
    trigger = FortedTopNTrigger(_forks((201, 2.0)))
    t = MoreBetsTargeter(triggers=[trigger], default_family="corners")
    assert t.select_targets(now=0.0)[0].family == "corners"


# --- T02: watch_duration expiry ---

def test_watch_duration_expiry():
    trigger = FortedTopNTrigger(_forks((301, 2.0)))
    t = _make([trigger], watch=60.0)
    t.select_targets(now=0.0)
    trigger.set_forks([])
    assert any(x.event_id == 301 for x in t.select_targets(now=50.0))
    assert not any(x.event_id == 301 for x in t.select_targets(now=70.0))


def test_deadline_value():
    trigger = FortedTopNTrigger(_forks((401, 1.0)))
    t = _make([trigger], watch=120.0)
    targets = t.select_targets(now=500.0)
    assert targets[0].deadline == pytest.approx(620.0)


# --- T03: deadline update on retrigger ---

def test_deadline_update_on_retrigger():
    trigger = FortedTopNTrigger(_forks((501, 2.0)))
    t = _make([trigger], watch=120.0)
    t.select_targets(now=0.0)
    trigger.set_forks([])
    t.select_targets(now=60.0)
    trigger.set_forks(_forks((501, 2.0)))
    tgts = t.select_targets(now=90.0)
    evt = next(x for x in tgts if x.event_id == 501)
    assert evt.deadline == pytest.approx(210.0)

# --- T04: top-N priority sort ---

def test_top_n_priority_sort_descending():
    forks = _forks((601, 0.5), (602, 5.0), (603, 2.0), (604, 1.0))
    t = _make([FortedTopNTrigger(forks)], top_n=4)
    targets = t.select_targets(now=0.0)
    priorities = [x.priority for x in targets]
    assert priorities == sorted(priorities, reverse=True)
    assert targets[0].event_id == 602


def test_top_n_limits_initial_count():
    forks = _forks((701, 3.0), (702, 2.0), (703, 1.0), (704, 0.5))
    t = _make([FortedTopNTrigger(forks)], top_n=2)
    targets = t.select_targets(now=0.0)
    assert len(targets) == 2
    assert {x.event_id for x in targets} == {701, 702}


# --- T05: FortedTopNTrigger ---

def test_forted_topn_set_forks():
    trigger = FortedTopNTrigger()
    assert trigger.current_forks(0.0) == []
    trigger.set_forks(_forks((801, 1.5)))
    forks = trigger.current_forks(0.0)
    assert len(forks) == 1 and forks[0]["event_id"] == 801


def test_forted_topn_constructor_initial():
    trigger = FortedTopNTrigger(_forks((901, 0.9), (902, 1.1)))
    ids = {f["event_id"] for f in trigger.current_forks(0.0)}
    assert ids == {901, 902}


# --- T06: AllLiveTrigger ---

def test_all_live_trigger_is_live_true():
    trigger = AllLiveTrigger([1001, 1002, 1003])
    forks = trigger.current_forks(0.0)
    assert len(forks) == 3
    assert all(f["is_live"] is True for f in forks)
    assert all(f["profit"] == 0.0 for f in forks)


def test_all_live_trigger_set_live_events():
    trigger = AllLiveTrigger()
    assert trigger.current_forks(0.0) == []
    trigger.set_live_events([1101, 1102])
    assert len(trigger.current_forks(0.0)) == 2


# --- T07: ManualTrigger ---

def test_manual_trigger_returns_ids():
    trigger = ManualTrigger([1201, 1202])
    forks = trigger.current_forks(0.0)
    assert len(forks) == 2
    assert all(f["profit"] == 0.0 for f in forks)
    assert all(f["is_live"] is False for f in forks)
    assert {f["event_id"] for f in forks} == {1201, 1202}

# --- T08: account-agnostic ---

def test_account_agnostic_no_pool_param():
    sig = inspect.signature(MoreBetsTargeter.select_targets)
    assert "account_pool" not in sig.parameters
    assert "accounts" not in sig.parameters


def test_account_agnostic_pure_event_result():
    t = _make([ManualTrigger([1301, 1302])])
    for tgt in t.select_targets(now=0.0):
        assert isinstance(tgt.event_id, int)
        assert isinstance(tgt.family, str) and tgt.family


# --- T09: capacity_cap ---

def test_capacity_cap_truncates():
    forks = _forks((1401, 5.0), (1402, 4.0), (1403, 3.0), (1404, 2.0), (1405, 1.0))
    t = _make([FortedTopNTrigger(forks)], top_n=5, cap=2)
    targets = t.select_targets(now=0.0)
    assert len(targets) == 2
    assert targets[0].event_id == 1401
    assert targets[1].event_id == 1402


def test_capacity_cap_none_no_limit():
    forks = _forks(*[(1500 + i, float(i)) for i in range(8)])
    t = _make([FortedTopNTrigger(forks)], top_n=8, cap=None)
    assert len(t.select_targets(now=0.0)) == 8


# --- T10: empty triggers ---

def test_empty_triggers_list():
    assert _make([]).select_targets(now=0.0) == []


def test_trigger_with_empty_forks():
    assert _make([FortedTopNTrigger([])]).select_targets(now=0.0) == []


# --- T11: multiple triggers union ---

def test_multiple_triggers_union():
    t1 = FortedTopNTrigger(_forks((1601, 2.0)))
    t2 = AllLiveTrigger([1602])
    t3 = ManualTrigger([1603])
    t = _make([t1, t2, t3], top_n=10)
    ids = {x.event_id for x in t.select_targets(now=0.0)}
    assert {1601, 1602, 1603}.issubset(ids)


# --- T12: linger after drop from top-N ---

def test_linger_after_drop_from_topn():
    trigger = FortedTopNTrigger(_forks((1701, 3.0), (1702, 2.0)))
    t = _make([trigger], top_n=2, watch=60.0)
    t.select_targets(now=0.0)
    trigger.set_forks(_forks((1703, 5.0), (1704, 4.0)))
    ids_30 = {x.event_id for x in t.select_targets(now=30.0)}
    assert 1701 in ids_30 and 1702 in ids_30
    ids_70 = {x.event_id for x in t.select_targets(now=70.0)}
    assert 1701 not in ids_70 and 1702 not in ids_70


# --- T13: rhythm cap anti-ban ---

def test_min_interval_sec_ge_one():
    assert _make([]).min_interval_sec() >= 1.0


def test_min_interval_sec_exact_one():
    assert _make([]).min_interval_sec() == pytest.approx(1.0)


# --- T14: required_accounts ---

def test_required_accounts_live():
    t = _make([], live_r=2.0)
    assert t.required_accounts(4, is_live=True) == 2


def test_required_accounts_prematch():
    t = _make([], prematch_r=12.0)
    assert t.required_accounts(12, is_live=False) == 1


# --- T15: max_events_per_worker ---

def test_max_events_per_worker_live():
    assert _make([], live_r=2.0).max_events_per_worker(is_live=True) == 2


def test_max_events_per_worker_prematch():
    assert _make([], prematch_r=12.0).max_events_per_worker(is_live=False) == 12


def test_watch_duration_no_extend_while_fork_continuous():
    trigger = FortedTopNTrigger(_forks((9001, 2.0)))
    t = _make([trigger], watch=60.0)
    t.select_targets(now=0.0)
    result = t.select_targets(now=70.0)
    assert not any(x.event_id == 9001 for x in result)


def test_alllive_not_cut_by_topn():
    trigger = AllLiveTrigger([1, 2, 3, 4, 5])
    t = _make([trigger], top_n=2)
    targets = t.select_targets(now=0.0)
    assert len(targets) == 5
    assert {x.event_id for x in targets} == {1, 2, 3, 4, 5}


def test_manual_not_evicted_by_forted_forks():
    manual = ManualTrigger([8001, 8002])
    forted = FortedTopNTrigger(_forks((8003, 5.0), (8004, 4.0), (8005, 3.0)))
    t = _make([forted, manual], top_n=2)
    ids = {x.event_id for x in t.select_targets(now=0.0)}
    assert 8001 in ids and 8002 in ids
    assert 8003 in ids and 8004 in ids


def test_high_churn_bounded_by_capacity_cap():
    trigger = FortedTopNTrigger()
    t = _make([trigger], top_n=2, watch=120.0, cap=4)
    for tick in range(5):
        now = float(tick * 10)
        trigger.set_forks(_forks((tick * 100 + 1, 2.0), (tick * 100 + 2, 1.0)))
        result = t.select_targets(now=now)
        assert len(result) <= 4


def test_from_config_defaults():
    t = MoreBetsTargeter.from_config()
    assert t._top_n == 10
    assert t._watch_duration_sec == pytest.approx(120.0)
    assert len(t._triggers) >= 1


def test_from_config_env_override(monkeypatch):
    monkeypatch.setenv("MOREBETS_TOP_N", "5")
    monkeypatch.setenv("MOREBETS_WATCH_DURATION_SEC", "60")
    monkeypatch.setenv("MOREBETS_TRIGGERS", "forted_topn,all_live")
    t = MoreBetsTargeter.from_config()
    assert t._top_n == 5
    assert t._watch_duration_sec == pytest.approx(60.0)
    assert any(isinstance(tr, FortedTopNTrigger) for tr in t._triggers)
    assert any(isinstance(tr, AllLiveTrigger) for tr in t._triggers)


def test_negative_profit_as_priority():
    trigger = FortedTopNTrigger([dict(event_id=7001, profit=-1.0, is_live=False)])
    t = _make([trigger])
    targets = t.select_targets(now=0.0)
    assert len(targets) == 1
    assert targets[0].priority == pytest.approx(-1.0)


def test_backwards_time_clamped():
    trigger = FortedTopNTrigger(_forks((6001, 1.0)))
    t = _make([trigger], watch=60.0)
    t.select_targets(now=100.0)
    result = t.select_targets(now=50.0)
    assert any(x.event_id == 6001 for x in result)


def test_is_live_propagated_alllive():
    trigger = AllLiveTrigger([5001, 5002])
    t = _make([trigger])
    targets = t.select_targets(now=0.0)
    assert all(target.is_live is True for target in targets)


def test_is_live_false_for_manual():
    trigger = ManualTrigger([5003])
    t = _make([trigger])
    targets = t.select_targets(now=0.0)
    assert all(target.is_live is False for target in targets)


def test_required_accounts_mixed():
    t = _make([], live_r=2.0, prematch_r=12.0)
    live_targets = [
        MoreBetTarget(event_id=i, family="x", deadline=100.0, priority=0.0, is_live=True)
        for i in range(4)
    ]
    prematch_targets = [
        MoreBetTarget(event_id=100+i, family="x", deadline=100.0, priority=0.0, is_live=False)
        for i in range(12)
    ]
    mixed = live_targets + prematch_targets
    assert t.required_accounts_mixed(mixed) == 3
