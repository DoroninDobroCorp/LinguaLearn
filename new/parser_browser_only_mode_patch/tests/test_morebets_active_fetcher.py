"""tests/test_morebets_active_fetcher.py -- Story 27.38.

>= 24 unit-tests for MoreBetsActiveFetcher.
"""

from __future__ import annotations

import threading
import time
from typing import Any

import pytest

from aggregator.account_pool import Account
from aggregator.event_priority_queue import EventPriority, EventPriorityQueue
from aggregator.morebets_active_fetcher import (
    FetchResult,
    FetchStatus,
    MoreBetsActiveFetcher,
)


def _make_account(account_id: str = "acct-1", family: str = "ps3838") -> Account:
    return Account(account_id=account_id, family=family)


class _FakePool:
    """Minimal AccountPool stub — records pick() and report_outcome() calls."""

    def __init__(self, account: Account | None) -> None:
        self._account = account
        self.picks: list[str] = []
        self.reported_outcomes: list[tuple[str, str]] = []

    def pick(self, family: str, *, market: str | None = None, **kw: Any) -> Account | None:
        self.picks.append(family)
        return self._account

    def report_outcome(
        self, account_id: str, kind: str, ts: float | None = None
    ) -> None:
        self.reported_outcomes.append((account_id, kind))


class _FakeFetcher:
    def __init__(self, result: FetchResult | None = None) -> None:
        self.result = result or FetchResult(FetchStatus.OK)
        self.calls: list[tuple[str, Any]] = []

    def fetch(self, event_id: str, account: Any) -> FetchResult:
        self.calls.append((event_id, account))
        return self.result


def _make_fetcher(
    queue: EventPriorityQueue | None = None,
    account: Account | None = None,
    fetch_result: FetchResult | None = None,
    family: str = "ps3838",
    min_interval: float = 0.0,
) -> tuple[EventPriorityQueue, _FakePool, _FakeFetcher, MoreBetsActiveFetcher]:
    if account is None:
        account = _make_account()
    q = queue or EventPriorityQueue()
    pool = _FakePool(account)
    ff = _FakeFetcher(fetch_result)
    if min_interval == 0.0:
        fetcher = MoreBetsActiveFetcher(queue=q, pool=pool, fetch_fn=ff, family=family, min_interval_sec=1.0)
    else:
        fetcher = MoreBetsActiveFetcher(queue=q, pool=pool, fetch_fn=ff, family=family, min_interval_sec=min_interval)
    return q, pool, ff, fetcher


# ---------------------------------------------------------------------------
# Tests 1-10 (existing)
# ---------------------------------------------------------------------------

def test_run_once_pop_fetch_returns_true() -> None:
    """AC-1: run_once True когда pop -> pick -> fetch успешно."""
    q, pool, ff, fetcher = _make_fetcher()
    q.push("evt-101", EventPriority.PROMOTED)
    result = fetcher.run_once(now=1000.0)
    assert result is True
    assert len(ff.calls) == 1
    assert ff.calls[0][0] == "evt-101"


def test_run_once_empty_queue_returns_false() -> None:
    """AC-1: пустая очередь → False, fetch не вызывается."""
    q, pool, ff, fetcher = _make_fetcher()
    result = fetcher.run_once(now=1000.0)
    assert result is False
    assert len(ff.calls) == 0


def test_run_once_no_account_returns_event_to_queue() -> None:
    """AC-1: pool.pick() -> None -> событие возвращено в очередь, False."""
    q = EventPriorityQueue()
    pool = _FakePool(None)
    ff = _FakeFetcher()
    fetcher = MoreBetsActiveFetcher(queue=q, pool=pool, fetch_fn=ff, min_interval_sec=1.0)
    q.push("evt-200", EventPriority.PROMOTED)
    result = fetcher.run_once(now=1000.0)
    assert result is False
    assert len(ff.calls) == 0
    popped = q.pop()
    assert popped is not None
    assert popped[0] == "evt-200"
    assert popped[1] == EventPriority.PROMOTED


def test_run_once_no_account_preserves_priority() -> None:
    """AC-1: событие возвращается с исходным приоритетом."""
    q = EventPriorityQueue()
    pool = _FakePool(None)
    ff = _FakeFetcher()
    fetcher = MoreBetsActiveFetcher(queue=q, pool=pool, fetch_fn=ff, min_interval_sec=1.0)
    q.push("evt-300", EventPriority.FAIR)
    fetcher.run_once(now=1000.0)
    item = q.pop()
    assert item is not None
    eid, prio = item
    assert eid == "evt-300"
    assert prio == EventPriority.FAIR


def test_fetch_result_ok() -> None:
    """AC-2: FetchResult с OK статусом."""
    res = FetchResult(FetchStatus.OK)
    assert res.status == FetchStatus.OK
    assert res.detail == ""


def test_fetch_result_rate_limited() -> None:
    """AC-2: FetchResult с RATE_LIMITED статусом."""
    res = FetchResult(FetchStatus.RATE_LIMITED, "429 Too Many Requests")
    assert res.status == FetchStatus.RATE_LIMITED
    assert res.detail == "429 Too Many Requests"


def test_fetch_result_error() -> None:
    """AC-2: FetchResult с ERROR статусом."""
    res = FetchResult(FetchStatus.ERROR, "timeout")
    assert res.status == FetchStatus.ERROR
    assert res.detail == "timeout"


def test_429_backoff_no_immediate_retry() -> None:
    """AC-3: на 429 аккаунт не используется повторно в пределах интервала."""
    acct = _make_account("acct-x")
    q = EventPriorityQueue()
    pool = _FakePool(acct)
    ff = _FakeFetcher(FetchResult(FetchStatus.RATE_LIMITED, "429"))
    fetcher = MoreBetsActiveFetcher(queue=q, pool=pool, fetch_fn=ff, min_interval_sec=1.0)
    q.push("evt-1", EventPriority.PROMOTED)
    t0 = 1000.0
    fetcher.run_once(t0)
    assert len(ff.calls) == 1
    q.push("evt-2", EventPriority.PROMOTED)
    ff2 = _FakeFetcher(FetchResult(FetchStatus.OK))
    fetcher._fetch_fn = ff2
    result = fetcher.run_once(t0 + 0.1)
    assert result is False
    assert len(ff2.calls) == 0


def test_rate_limit_one_rps() -> None:
    """AC-3: ≤1 r/s — второй запрос раньше интервала отклоняется."""
    acct = _make_account("acct-y")
    q = EventPriorityQueue()
    pool = _FakePool(acct)
    ff = _FakeFetcher(FetchResult(FetchStatus.OK))
    fetcher = MoreBetsActiveFetcher(queue=q, pool=pool, fetch_fn=ff, min_interval_sec=1.0)
    q.push("evt-A", EventPriority.FAIR)
    q.push("evt-B", EventPriority.FAIR)
    t0 = 2000.0
    r1 = fetcher.run_once(t0)
    assert r1 is True
    assert len(ff.calls) == 1
    r2 = fetcher.run_once(t0 + 0.5)
    assert r2 is False
    assert len(ff.calls) == 1
    r3 = fetcher.run_once(t0 + 1.0)
    assert r3 is True
    assert len(ff.calls) == 2


def test_rate_limit_event_preserved_when_too_fast() -> None:
    """AC-3: событие возвращается в очередь при нарушении rate limit."""
    acct = _make_account("acct-z")
    q = EventPriorityQueue()
    pool = _FakePool(acct)
    ff = _FakeFetcher(FetchResult(FetchStatus.OK))
    fetcher = MoreBetsActiveFetcher(queue=q, pool=pool, fetch_fn=ff, min_interval_sec=1.0)
    q.push("evt-keep", EventPriority.PROMOTED)
    fetcher.run_once(3000.0)
    q.push("evt-ret", EventPriority.FAIR)
    fetcher.run_once(3000.3)
    item = q.pop()
    assert item is not None
    assert item[0] == "evt-ret"


# ---------------------------------------------------------------------------
# Tests 11-20 (existing)
# ---------------------------------------------------------------------------

def test_fetch_called_with_str_event_id() -> None:
    """DOD-7: event_id передаётся в fetch как str."""
    q, pool, ff, fetcher = _make_fetcher()
    q.push("12345", EventPriority.PROMOTED)
    fetcher.run_once(5000.0)
    assert len(ff.calls) == 1
    eid, _ = ff.calls[0]
    assert isinstance(eid, str)
    assert eid == "12345"


def test_thread_safety_push_pop_no_loss() -> None:
    """AC-4: 2 треда push/pop под нагрузкой без потерь и дублей."""
    N = 200
    q = EventPriorityQueue()
    fetched: list[str] = []
    lock = threading.Lock()
    stop = threading.Event()
    _ctr = [0]

    class _UniquePool:
        def pick(self, family: str, **kw: Any) -> Account:
            _ctr[0] += 1
            return _make_account(f"acct-{_ctr[0]}")

        def report_outcome(self, account_id: str, kind: str, ts: float | None = None) -> None:
            pass

    class _Collect:
        def fetch(self, event_id: str, account: Any) -> FetchResult:
            with lock:
                fetched.append(event_id)
            return FetchResult(FetchStatus.OK)

    fetcher = MoreBetsActiveFetcher(
        queue=q, pool=_UniquePool(), fetch_fn=_Collect(), min_interval_sec=1.0
    )

    def pusher() -> None:
        for i in range(N):
            q.push(f"e{i}", EventPriority.FAIR)
            time.sleep(0.0001)

    def consumer() -> None:
        while not stop.is_set() or not q.is_empty:
            fetcher.run_once(time.time())
            time.sleep(0.0001)

    t_push = threading.Thread(target=pusher)
    t_pop = threading.Thread(target=consumer)
    t_push.start()
    t_pop.start()
    t_push.join(timeout=5.0)
    stop.set()
    t_pop.join(timeout=5.0)

    assert len(fetched) == N
    assert len(set(fetched)) == N


def test_run_forever_stops_on_stop_event() -> None:
    """AC: run_forever завершается когда stop_event установлен."""
    q, pool, ff, fetcher = _make_fetcher()
    stop = threading.Event()
    t = threading.Thread(target=fetcher.run_forever, args=(stop,), daemon=True)
    t.start()
    time.sleep(0.05)
    stop.set()
    t.join(timeout=3.0)
    assert not t.is_alive()


def test_account_agnostic_different_family() -> None:
    """AC-7: при смене family контракт run_once не меняется."""
    acct_pin = _make_account("pin-1", family="pin888")
    q = EventPriorityQueue()
    pool = _FakePool(acct_pin)
    ff = _FakeFetcher(FetchResult(FetchStatus.OK))
    fetcher = MoreBetsActiveFetcher(
        queue=q, pool=pool, fetch_fn=ff, family="pin888", min_interval_sec=1.0
    )
    q.push("evt-pin", EventPriority.PROMOTED)
    result = fetcher.run_once(now=1000.0)
    assert result is True
    assert pool.picks == ["pin888"]
    assert ff.calls[0][0] == "evt-pin"


def test_account_agnostic_multiple_accounts_round_robin() -> None:
    """AC-7: fetcher делегирует выбор аккаунта pool.pick."""
    accounts = [_make_account(f"a{i}") for i in range(3)]
    idx = [0]

    class _RRPool:
        def pick(self, family: str, **kw: Any) -> Account:
            a = accounts[idx[0] % len(accounts)]
            idx[0] += 1
            return a

        def report_outcome(self, account_id: str, kind: str, ts: float | None = None) -> None:
            pass

    q = EventPriorityQueue()
    ff = _FakeFetcher()
    fetcher = MoreBetsActiveFetcher(
        queue=q, pool=_RRPool(), fetch_fn=ff, min_interval_sec=0.0001
    )
    for i in range(3):
        q.push(f"evt-{i}", EventPriority.FAIR)
    for i in range(3):
        fetcher.run_once(float(i) * 2.0)
    assert len(ff.calls) == 3


def test_flag_off_proactive_not_enabled() -> None:
    """AC-5: при выключенном флаге MOREBETS_PROACTIVE_ENABLED предикат = False."""
    import os
    os.environ.pop("MOREBETS_PROACTIVE_ENABLED", None)
    import importlib
    import aggregator.main as _main_mod
    importlib.reload(_main_mod)
    assert hasattr(_main_mod, "_morebets_proactive_enabled")
    assert not _main_mod._morebets_proactive_enabled()


def test_flag_on_proactive_enabled() -> None:
    """AC-5: при MOREBETS_PROACTIVE_ENABLED=1 предикат = True."""
    import os
    os.environ["MOREBETS_PROACTIVE_ENABLED"] = "1"
    import importlib
    import aggregator.main as _main_mod
    importlib.reload(_main_mod)
    assert _main_mod._morebets_proactive_enabled()
    os.environ.pop("MOREBETS_PROACTIVE_ENABLED", None)


def test_run_once_error_result_still_returns_true() -> None:
    """AC-2: FetchResult.ERROR — run_once True (запрос был сделан)."""
    q, pool, ff, fetcher = _make_fetcher(
        fetch_result=FetchResult(FetchStatus.ERROR, "network error")
    )
    q.push("evt-err", EventPriority.DISCOVERY)
    result = fetcher.run_once(1000.0)
    assert result is True
    assert ff.calls[0][0] == "evt-err"


def test_429_extended_backoff_allows_after_interval() -> None:
    """AC-3: после истечения backoff аккаунт снова используется."""
    acct = _make_account("acct-bk")
    q = EventPriorityQueue()
    pool = _FakePool(acct)
    ff_429 = _FakeFetcher(FetchResult(FetchStatus.RATE_LIMITED))
    fetcher = MoreBetsActiveFetcher(queue=q, pool=pool, fetch_fn=ff_429, min_interval_sec=1.0)
    q.push("evt-1", EventPriority.PROMOTED)
    t0 = 5000.0
    fetcher.run_once(t0)
    ff_ok = _FakeFetcher(FetchResult(FetchStatus.OK))
    fetcher._fetch_fn = ff_ok
    q.push("evt-2", EventPriority.PROMOTED)
    r_blocked = fetcher.run_once(t0 + 1.5)
    assert r_blocked is False
    r_ok = fetcher.run_once(t0 + 2.1)
    assert r_ok is True
    assert len(ff_ok.calls) == 1


def test_fetch_fn_receives_account_object() -> None:
    """AC-1: fetch_fn.fetch получает account (не None)."""
    acct = _make_account("acct-check")
    q, pool, ff, fetcher = _make_fetcher(account=acct)
    q.push("evt-chk", EventPriority.FRESH_BASE)
    fetcher.run_once(8000.0)
    _, fetched_acct = ff.calls[0]
    assert fetched_acct is acct


# ---------------------------------------------------------------------------
# New tests 21-24: P1-1, P1-2, P1-3 (via reschedule), P2 fixes
# ---------------------------------------------------------------------------

def test_429_requeue_and_report_outcome() -> None:
    """FIX P1-1: 429 -> событие requeue + pool.report_outcome + нет повторного fetch.

    Проверяет одновременно:
    1. После RATE_LIMITED событие снова в очереди (не потеряно).
    2. pool.report_outcome(acct, "429") вызван (pool-level FSM backoff).
    3. Повторный run_once в пределах backoff НЕ шлёт второй fetch.
    """
    acct = _make_account("acct-429")
    q = EventPriorityQueue()
    pool = _FakePool(acct)
    ff_429 = _FakeFetcher(FetchResult(FetchStatus.RATE_LIMITED, "429"))
    fetcher = MoreBetsActiveFetcher(queue=q, pool=pool, fetch_fn=ff_429, min_interval_sec=1.0)
    q.push("evt-429", EventPriority.PROMOTED)
    t0 = 9000.0

    r1 = fetcher.run_once(t0)
    assert r1 is True
    assert len(ff_429.calls) == 1

    # 1. Событие должно быть возвращено в очередь (reschedule)
    assert not q.is_empty, "event must be re-queued after 429"
    item = q.pop()
    assert item is not None
    assert item[0] == "evt-429"
    assert item[1] == EventPriority.PROMOTED

    # 2. pool.report_outcome должен быть вызван с kind="429"
    assert ("acct-429", "429") in pool.reported_outcomes, (
        "pool.report_outcome(acct, '429') must be called for pool-level FSM backoff"
    )

    # 3. В пределах backoff повторный run_once не должен слать fetch
    q.push("evt-429", EventPriority.PROMOTED)
    ff_ok = _FakeFetcher(FetchResult(FetchStatus.OK))
    fetcher._fetch_fn = ff_ok
    r2 = fetcher.run_once(t0 + 0.5)
    assert r2 is False, "within backoff window must return False"
    assert len(ff_ok.calls) == 0, "no second fetch within backoff window"


def test_single_instance_rate_cap_invariant() -> None:
    """FIX P1-2: single-instance <=1 r/s — два события на один аккаунт -> один fetch.

    Документирует инвариант single-instance anti-ban cap через _last_request_ts.
    Второе событие reschedule (не теряется).
    """
    acct = _make_account("acct-cap")
    q = EventPriorityQueue()
    pool = _FakePool(acct)
    ff = _FakeFetcher(FetchResult(FetchStatus.OK))
    fetcher = MoreBetsActiveFetcher(queue=q, pool=pool, fetch_fn=ff, min_interval_sec=1.0)
    q.push("evt-cap-1", EventPriority.FAIR)
    q.push("evt-cap-2", EventPriority.FAIR)
    t0 = 3000.0

    r1 = fetcher.run_once(t0)
    assert r1 is True
    assert len(ff.calls) == 1

    # Второй вызов в пределах 1 секунды -> rate-cap
    r2 = fetcher.run_once(t0 + 0.3)
    assert r2 is False, "second request within interval must be blocked (single-instance cap)"
    assert len(ff.calls) == 1, "only one fetch allowed within the rate interval"

    # Событие должно остаться в очереди via reschedule (не потеряно)
    assert not q.is_empty, "deferred event must remain in queue via reschedule"


def test_exception_in_fetch_requeues_event() -> None:
    """FIX P2: исключение в fetch -> событие возвращается в очередь (не теряется)."""
    acct = _make_account("acct-ex")
    q = EventPriorityQueue()
    pool = _FakePool(acct)

    class _RaisingFetcher:
        def fetch(self, event_id: str, account: Any) -> FetchResult:
            raise RuntimeError("network failure")

    fetcher = MoreBetsActiveFetcher(
        queue=q, pool=pool, fetch_fn=_RaisingFetcher(), min_interval_sec=1.0
    )
    q.push("evt-ex", EventPriority.FAIR)

    with pytest.raises(RuntimeError, match="network failure"):
        fetcher.run_once(now=4000.0)

    # Событие должно быть возвращено в очередь (не потеряно)
    assert not q.is_empty, "event must be re-queued after fetch exception"
    item = q.pop()
    assert item is not None
    assert item[0] == "evt-ex"
    assert item[1] == EventPriority.FAIR


def test_run_once_returns_true_on_rate_limited() -> None:
    """FIX P1-1: run_once возвращает True на 429 (fetch выполнен, ответ получен)."""
    acct = _make_account("acct-rl-ret")
    q = EventPriorityQueue()
    pool = _FakePool(acct)
    ff = _FakeFetcher(FetchResult(FetchStatus.RATE_LIMITED))
    fetcher = MoreBetsActiveFetcher(queue=q, pool=pool, fetch_fn=ff, min_interval_sec=1.0)
    q.push("evt-rl-ret", EventPriority.PROMOTED)
    result = fetcher.run_once(now=6000.0)
    assert result is True, "run_once must return True when fetch happened (even 429)"
    assert len(ff.calls) == 1


def test_error_result_requeues_event() -> None:
    """FIX-1 (P1): FetchStatus.ERROR - событие reschedule в очередь, не теряется."""
    q, pool, ff, fetcher = _make_fetcher(
        fetch_result=FetchResult(FetchStatus.ERROR, "network error"),
    )
    q.push("evt-err-req", EventPriority.PROMOTED)
    result = fetcher.run_once(7000.0)
    assert result is True
    assert not q.is_empty, "event must be re-queued after ERROR (not dropped)"
    item = q.pop()
    assert item is not None
    assert item[0] == "evt-err-req"
    assert item[1] == EventPriority.PROMOTED


def test_ok_result_does_not_requeue_event() -> None:
    """FIX-1 (P1): FetchStatus.OK - событие НЕ возвращается в очередь (успех потребил)."""
    q, pool, ff, fetcher = _make_fetcher(
        fetch_result=FetchResult(FetchStatus.OK),
    )
    q.push("evt-ok-norq", EventPriority.FAIR)
    result = fetcher.run_once(7100.0)
    assert result is True
    assert q.is_empty, "OK fetch must consume the event (no requeue)"
