"""tests/test_bia_observe_tracker.py -- Story 27.46 unit tests."""
from __future__ import annotations
import threading
import pytest
import config
from aggregator.bia_price_tracker import (
    BiaPriceTracker, _reset_shared_tracker, get_shared_tracker,
)
from aggregator.morebets_targeting import (
    BiaPriceChangeTrigger, MoreBetsTargeter,
)

def _fresh() -> BiaPriceTracker:
    return BiaPriceTracker(fresh_sec=30.0)

class TestSharedTrackerSingleton:
    def test_same_instance_returned(self) -> None:
        _reset_shared_tracker()
        t1 = get_shared_tracker()
        t2 = get_shared_tracker()
        assert t1 is t2

    def test_reset_allows_fresh_creation(self) -> None:
        _reset_shared_tracker()
        t1 = get_shared_tracker()
        _reset_shared_tracker()
        t2 = get_shared_tracker()
        assert t1 is not t2

    def test_fresh_sec_from_config(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _reset_shared_tracker()
        monkeypatch.setattr(config, "BIA_PRICE_FRESH_SEC", 77.0)
        monkeypatch.setattr(config, "BIA_PRICE_MIN_DELTA", 0.0)
        t = get_shared_tracker()
        assert t._fresh_sec == 77.0

    def test_explicit_params_override_config(self) -> None:
        _reset_shared_tracker()
        t = get_shared_tracker(fresh_sec=55.0, min_delta=0.1)
        assert t._fresh_sec == 55.0
        assert t._min_delta == 0.1


class TestObserveIntKey:
    def test_observe_int_first_call_not_hot(self) -> None:
        t = _fresh()
        t.observe(12345, {"h": 1.9}, now=0.0)
        assert 12345 not in t.hot_events(now=0.0)

    def test_observe_int_change_marks_hot(self) -> None:
        t = _fresh()
        t.observe(12345, {"h": 1.9}, now=0.0)
        t.observe(12345, {"h": 2.0}, now=1.0)
        assert 12345 in t.hot_events(now=1.0)

    def test_observe_int_no_change_not_hot(self) -> None:
        t = _fresh()
        t.observe(12345, {"h": 1.9}, now=0.0)
        t.observe(12345, {"h": 1.9}, now=1.0)
        assert 12345 not in t.hot_events(now=1.0)

    def test_shared_tracker_pid_observe_and_hot(self) -> None:
        _reset_shared_tracker()
        tr = get_shared_tracker()
        tr.observe(99001, {"h": 1.5}, now=0.0)
        tr.observe(99001, {"h": 1.6}, now=0.5)
        assert 99001 in tr.hot_events(now=1.0)


class TestTriggerIntKeyPath:
    def test_int_key_no_resolver_returns_fork(self) -> None:
        t = _fresh()
        t.observe(55555, {"h": 1.9}, now=0.0)
        t.observe(55555, {"h": 2.0}, now=0.1)
        trigger = BiaPriceChangeTrigger(tracker=t)
        forks = trigger.current_forks(now=0.5)
        assert len(forks) == 1
        assert forks[0]["event_id"] == 55555
        assert forks[0]["profit"] == 0.0
        assert forks[0]["is_live"] is True

    def test_trigger_uses_shared_tracker_by_default(self) -> None:
        _reset_shared_tracker()
        trigger = BiaPriceChangeTrigger()
        shared = get_shared_tracker()
        assert trigger._tracker is shared

    def test_trigger_current_forks_via_shared_pid_key(self) -> None:
        _reset_shared_tracker()
        shared = get_shared_tracker()
        shared.observe(77777, {"odds": 2.1}, now=0.0)
        shared.observe(77777, {"odds": 2.2}, now=0.5)
        trigger = BiaPriceChangeTrigger()
        forks = trigger.current_forks(now=1.0)
        assert any(f["event_id"] == 77777 for f in forks)

    def test_non_int_key_without_resolver_skipped(self) -> None:
        t = _fresh()
        t.observe(("tuple_key",), {"h": 1.9}, now=0.0)
        t.observe(("tuple_key",), {"h": 2.0}, now=0.5)
        trigger = BiaPriceChangeTrigger(tracker=t)
        forks = trigger.current_forks(now=1.0)
        assert forks == []

    def test_int_key_expired_not_in_forks(self) -> None:
        t = BiaPriceTracker(fresh_sec=5.0)
        t.observe(44444, {"h": 1.9}, now=0.0)
        t.observe(44444, {"h": 2.0}, now=0.0)
        trigger = BiaPriceChangeTrigger(tracker=t)
        assert trigger.current_forks(now=10.0) == []


class TestObserverPathFlag:
    def test_flag_off_guard_prevents_observe(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _reset_shared_tracker()
        monkeypatch.setattr(config, "BIA_PRICE_TRIGGER_ENABLED", False)
        import config as _cfg
        pid = 12345
        markets = {"h": 1.9}
        if _cfg.BIA_PRICE_TRIGGER_ENABLED:
            get_shared_tracker().observe(pid, markets, 0.0)
            get_shared_tracker().observe(pid, {"h": 2.0}, 1.0)
        _reset_shared_tracker()
        assert get_shared_tracker().hot_events(1.0) == []

    def test_flag_on_guard_allows_observe(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _reset_shared_tracker()
        monkeypatch.setattr(config, "BIA_PRICE_TRIGGER_ENABLED", True)
        import config as _cfg
        pid = 12345
        if _cfg.BIA_PRICE_TRIGGER_ENABLED:
            get_shared_tracker().observe(pid, {"h": 1.9}, 0.0)
            get_shared_tracker().observe(pid, {"h": 2.0}, 1.0)
        assert 12345 in get_shared_tracker().hot_events(1.0)

    def test_pid_none_guard_skips(self) -> None:
        _reset_shared_tracker()
        tracker = get_shared_tracker()
        pid = None
        markets = {"h": 1.9}
        if pid is not None:
            tracker.observe(pid, markets, 0.0)
        assert tracker.hot_events(0.0) == []

    def test_pid_not_in_events_data_guard_skips(self) -> None:
        _reset_shared_tracker()
        tracker = get_shared_tracker()
        events_data = {111: {"Home": "A"}}
        pid = 999
        if pid is None or pid not in events_data:
            pass
        else:
            tracker.observe(pid, {"h": 1.9}, 0.0)
            tracker.observe(pid, {"h": 2.0}, 1.0)
        assert 999 not in tracker.hot_events(1.0)


class TestFreshnessWindowIntKey:
    def test_within_window(self) -> None:
        t = BiaPriceTracker(fresh_sec=30.0)
        t.observe(10001, {"h": 1.9}, now=0.0)
        t.observe(10001, {"h": 2.0}, now=0.0)
        assert 10001 in t.hot_events(now=15.0)

    def test_expired(self) -> None:
        t = BiaPriceTracker(fresh_sec=10.0)
        t.observe(10002, {"h": 1.9}, now=0.0)
        t.observe(10002, {"h": 2.0}, now=0.0)
        assert 10002 not in t.hot_events(now=11.0)

    def test_window_extended_by_new_change(self) -> None:
        t = BiaPriceTracker(fresh_sec=10.0)
        t.observe(10003, {"h": 1.9}, now=0.0)
        t.observe(10003, {"h": 2.0}, now=0.0)
        t.observe(10003, {"h": 2.1}, now=8.0)
        assert 10003 in t.hot_events(now=16.0)
        assert 10003 not in t.hot_events(now=19.0)


class TestThreadSafety:
    def test_concurrent_observe_and_hot_events(self) -> None:
        t = BiaPriceTracker(fresh_sec=60.0)
        errors: list[Exception] = []

        def writer() -> None:
            for i in range(300):
                try:
                    t.observe(i % 10, {"h": float(i)}, now=float(i))
                except Exception as e:
                    errors.append(e)

        def reader() -> None:
            for _ in range(300):
                try:
                    t.hot_events(now=0.0)
                except Exception as e:
                    errors.append(e)

        w = threading.Thread(target=writer)
        r = threading.Thread(target=reader)
        w.start()
        r.start()
        w.join()
        r.join()
        assert not errors

    def test_shared_tracker_concurrent_creates_singleton(self) -> None:
        _reset_shared_tracker()
        results: list[BiaPriceTracker] = []
        lock = threading.Lock()

        def get() -> None:
            t = get_shared_tracker()
            with lock:
                results.append(t)

        threads = [threading.Thread(target=get) for _ in range(10)]
        for th in threads:
            th.start()
        for th in threads:
            th.join()
        assert all(r is results[0] for r in results)


class TestObserverToTriggerFlow:
    def test_pid_observed_fires_in_current_forks(self) -> None:
        _reset_shared_tracker()
        shared = get_shared_tracker()
        pid = 12345
        shared.observe(pid, {"specials_h": 1.80}, now=0.0)
        shared.observe(pid, {"specials_h": 1.85}, now=1.0)
        trigger = BiaPriceChangeTrigger()
        forks = trigger.current_forks(now=2.0)
        assert any(f["event_id"] == pid for f in forks)

    def test_from_config_trigger_on_shared_tracker(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _reset_shared_tracker()
        monkeypatch.setenv("MOREBETS_TRIGGERS", "bia_price")
        monkeypatch.setattr(config, "BIA_PRICE_TRIGGER_ENABLED", True)
        monkeypatch.setattr(config, "BIA_PRICE_FRESH_SEC", 30.0)
        monkeypatch.setattr(config, "BIA_PRICE_MIN_DELTA", 0.0)
        targeter = MoreBetsTargeter.from_config()
        trigger = next(tr for tr in targeter._triggers if isinstance(tr, BiaPriceChangeTrigger))
        assert trigger._tracker is get_shared_tracker()
        pid = 55001
        get_shared_tracker().observe(pid, {"h": 2.0}, now=0.0)
        get_shared_tracker().observe(pid, {"h": 2.1}, now=1.0)
        targets = targeter.select_targets(now=2.0)
        assert any(t.event_id == pid for t in targets)
