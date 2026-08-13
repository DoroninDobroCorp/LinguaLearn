"""tests/test_bia_price_trigger.py -- Story 27.42 unit tests."""
from __future__ import annotations

import config
import pytest
from aggregator.bia_price_tracker import BiaPriceTracker, _reset_shared_tracker
from aggregator.morebets_targeting import (
    BiaPriceChangeTrigger,
    FortedTopNTrigger,
    MoreBetsTargeter,
)


def _tracker(fresh: float = 30.0, min_d: float = 0.0) -> BiaPriceTracker:
    return BiaPriceTracker(fresh_sec=fresh, min_delta=min_d)


class TestObserveFirstTime:
    def test_first_observation_returns_false(self) -> None:
        t = _tracker()
        assert t.observe("ev1", {"h": 1.9}, now=0.0) is False

    def test_first_observation_event_not_hot(self) -> None:
        t = _tracker()
        t.observe("ev1", {"h": 1.9}, now=0.0)
        assert "ev1" not in t.hot_events(now=0.0)


class TestObserveSameValue:
    def test_same_value_returns_false(self) -> None:
        t = _tracker()
        t.observe("ev1", {"h": 1.9}, now=0.0)
        assert t.observe("ev1", {"h": 1.9}, now=1.0) is False

    def test_same_value_event_not_hot(self) -> None:
        t = _tracker()
        t.observe("ev1", {"h": 1.9}, now=0.0)
        t.observe("ev1", {"h": 1.9}, now=1.0)
        assert "ev1" not in t.hot_events(now=1.0)


class TestObserveChanged:
    def test_changed_value_returns_true(self) -> None:
        t = _tracker()
        t.observe("ev1", {"h": 1.9}, now=0.0)
        assert t.observe("ev1", {"h": 2.0}, now=1.0) is True

    def test_changed_value_event_becomes_hot(self) -> None:
        t = _tracker(fresh=30.0)
        t.observe("ev1", {"h": 1.9}, now=0.0)
        t.observe("ev1", {"h": 2.0}, now=1.0)
        assert "ev1" in t.hot_events(now=1.0)

    def test_multiple_markets_any_change_triggers(self) -> None:
        t = _tracker()
        t.observe("ev1", {"h": 1.9, "tot": 2.5}, now=0.0)
        assert t.observe("ev1", {"h": 1.9, "tot": 2.6}, now=1.0) is True

class TestMinDelta:
    def test_below_min_delta_not_change(self) -> None:
        t = _tracker(min_d=0.1)
        t.observe("ev1", {"h": 1.9}, now=0.0)
        assert t.observe("ev1", {"h": 1.95}, now=1.0) is False

    def test_at_min_delta_is_change(self) -> None:
        t = _tracker(min_d=0.1)
        t.observe("ev1", {"h": 1.9}, now=0.0)
        assert t.observe("ev1", {"h": 2.0}, now=1.0) is True

    def test_above_min_delta_is_change(self) -> None:
        t = _tracker(min_d=0.05)
        t.observe("ev1", {"h": 1.9}, now=0.0)
        assert t.observe("ev1", {"h": 2.1}, now=1.0) is True

    def test_non_numeric_change_always_triggers(self) -> None:
        t = _tracker(min_d=1.0)
        t.observe("ev1", {"status": "open"}, now=0.0)
        assert t.observe("ev1", {"status": "suspended"}, now=1.0) is True

class TestFreshnessWindow:
    def test_hot_within_window(self) -> None:
        t = _tracker(fresh=30.0)
        t.observe("ev1", {"h": 1.9}, now=0.0)
        t.observe("ev1", {"h": 2.0}, now=0.0)
        assert "ev1" in t.hot_events(now=15.0)

    def test_hot_at_boundary(self) -> None:
        t = _tracker(fresh=30.0)
        t.observe("ev1", {"h": 1.9}, now=0.0)
        t.observe("ev1", {"h": 2.0}, now=0.0)
        assert "ev1" in t.hot_events(now=29.9)

    def test_expired_after_window(self) -> None:
        t = _tracker(fresh=30.0)
        t.observe("ev1", {"h": 1.9}, now=0.0)
        t.observe("ev1", {"h": 2.0}, now=0.0)
        assert "ev1" not in t.hot_events(now=30.0)

    def test_new_change_extends_window(self) -> None:
        t = _tracker(fresh=30.0)
        t.observe("ev1", {"h": 1.9}, now=0.0)
        t.observe("ev1", {"h": 2.0}, now=0.0)
        t.observe("ev1", {"h": 2.1}, now=25.0)
        assert "ev1" in t.hot_events(now=50.0)
        assert "ev1" not in t.hot_events(now=56.0)

    def test_hot_events_prunes_expired(self) -> None:
        t = _tracker(fresh=10.0)
        t.observe("ev1", {"h": 1.9}, now=0.0)
        t.observe("ev1", {"h": 2.0}, now=0.0)
        t.observe("ev2", {"h": 1.9}, now=5.0)
        t.observe("ev2", {"h": 2.0}, now=5.0)
        hot = t.hot_events(now=11.0)
        assert "ev1" not in hot
        assert "ev2" in hot

class TestBiaPriceChangeTrigger:
    def test_hot_event_with_pid_returns_fork(self) -> None:
        tracker = _tracker(fresh=30.0)
        tracker.observe("bia_ev_1", {"h": 1.9}, now=0.0)
        tracker.observe("bia_ev_1", {"h": 2.0}, now=0.0)
        trigger = BiaPriceChangeTrigger(
            tracker=tracker,
            pid_resolver=lambda k: 12345 if k == "bia_ev_1" else None,
        )
        forks = trigger.current_forks(now=5.0)
        assert len(forks) == 1
        assert forks[0]["event_id"] == 12345
        assert forks[0]["profit"] == 0.0
        assert forks[0]["is_live"] is True

    def test_none_pid_skipped(self) -> None:
        tracker = _tracker(fresh=30.0)
        tracker.observe("unmapped", {"h": 1.9}, now=0.0)
        tracker.observe("unmapped", {"h": 2.0}, now=0.0)
        trigger = BiaPriceChangeTrigger(
            tracker=tracker, pid_resolver=lambda k: None
        )
        assert trigger.current_forks(now=5.0) == []

    def test_dedup_multiple_events_same_pid(self) -> None:
        tracker = _tracker(fresh=30.0)
        for key in ("ev_a", "ev_b"):
            tracker.observe(key, {"h": 1.9}, now=0.0)
            tracker.observe(key, {"h": 2.0}, now=0.0)
        trigger = BiaPriceChangeTrigger(
            tracker=tracker, pid_resolver=lambda k: 99999
        )
        forks = trigger.current_forks(now=5.0)
        assert [f["event_id"] for f in forks].count(99999) == 1

    def test_mixed_mapped_unmapped(self) -> None:
        tracker = _tracker(fresh=30.0)
        for key in ("mapped", "unmapped"):
            tracker.observe(key, {"h": 1.9}, now=0.0)
            tracker.observe(key, {"h": 2.0}, now=0.0)
        trigger = BiaPriceChangeTrigger(
            tracker=tracker,
            pid_resolver=lambda k: 111 if k == "mapped" else None,
        )
        forks = trigger.current_forks(now=5.0)
        assert len(forks) == 1
        assert forks[0]["event_id"] == 111

    def test_expired_events_not_in_forks(self) -> None:
        tracker = _tracker(fresh=10.0)
        tracker.observe("ev1", {"h": 1.9}, now=0.0)
        tracker.observe("ev1", {"h": 2.0}, now=0.0)
        trigger = BiaPriceChangeTrigger(
            tracker=tracker, pid_resolver=lambda k: 777
        )
        assert trigger.current_forks(now=20.0) == []

class TestIntegration:
    def test_bia_trigger_targets_returned(self) -> None:
        tracker = _tracker(fresh=30.0)
        tracker.observe("ev_bia", {"h": 1.9}, now=0.0)
        tracker.observe("ev_bia", {"h": 2.0}, now=0.0)
        trigger = BiaPriceChangeTrigger(
            tracker=tracker,
            pid_resolver=lambda k: 5001 if k == "ev_bia" else None,
        )
        targeter = MoreBetsTargeter(
            triggers=[trigger], top_n=10, watch_duration_sec=120.0
        )
        targets = targeter.select_targets(now=1.0)
        assert 5001 in {t.event_id for t in targets}

    def test_bia_trigger_union_with_forted_topn(self) -> None:
        tracker = _tracker(fresh=30.0)
        tracker.observe("ev_bia", {"h": 1.9}, now=0.0)
        tracker.observe("ev_bia", {"h": 2.0}, now=0.0)
        bia_trigger = BiaPriceChangeTrigger(
            tracker=tracker,
            pid_resolver=lambda k: 6001 if k == "ev_bia" else None,
        )
        forted_trigger = FortedTopNTrigger(
            [dict(event_id=7001, profit=2.0, is_live=False)]
        )
        targeter = MoreBetsTargeter(
            triggers=[forted_trigger, bia_trigger],
            top_n=10, watch_duration_sec=120.0,
        )
        targets = targeter.select_targets(now=1.0)
        ids = {t.event_id for t in targets}
        assert 6001 in ids
        assert 7001 in ids

    def test_dedup_in_select_targets(self) -> None:
        tracker = _tracker(fresh=30.0)
        tracker.observe("ev_bia", {"h": 1.9}, now=0.0)
        tracker.observe("ev_bia", {"h": 2.0}, now=0.0)
        shared_pid = 8001
        bia_trigger = BiaPriceChangeTrigger(
            tracker=tracker, pid_resolver=lambda k: shared_pid
        )
        forted_trigger = FortedTopNTrigger(
            [dict(event_id=shared_pid, profit=3.0, is_live=False)]
        )
        targeter = MoreBetsTargeter(
            triggers=[forted_trigger, bia_trigger],
            top_n=10, watch_duration_sec=120.0,
        )
        targets = targeter.select_targets(now=1.0)
        assert sum(1 for t in targets if t.event_id == shared_pid) == 1


class TestFromConfigFlag:
    def test_flag_off_no_bia_price_trigger(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("MOREBETS_TRIGGERS", "bia_price")
        monkeypatch.setattr(config, "BIA_PRICE_TRIGGER_ENABLED", False)
        t = MoreBetsTargeter.from_config()
        assert not any(isinstance(tr, BiaPriceChangeTrigger) for tr in t._triggers)

    def test_flag_on_adds_bia_price_trigger(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("MOREBETS_TRIGGERS", "bia_price")
        monkeypatch.setattr(config, "BIA_PRICE_TRIGGER_ENABLED", True)
        monkeypatch.setattr(config, "BIA_PRICE_FRESH_SEC", 45.0)
        monkeypatch.setattr(config, "BIA_PRICE_MIN_DELTA", 0.05)
        t = MoreBetsTargeter.from_config(bia_pid_resolver=lambda _: 42)
        assert any(isinstance(tr, BiaPriceChangeTrigger) for tr in t._triggers)


class TestLastCleanup:
    """P1.2: _last keys are purged when event expires from _hot_until."""

    def test_expired_event_keys_removed_from_last(self) -> None:
        t = _tracker(fresh=10.0)
        t.observe("ev1", {"h": 1.9}, now=0.0)
        t.observe("ev1", {"h": 2.0}, now=0.0)
        assert any(k[0] == "ev1" for k in t._last)
        t.hot_events(now=11.0)
        assert not any(k[0] == "ev1" for k in t._last)

    def test_last_len_drops_after_expiry(self) -> None:
        t = _tracker(fresh=10.0)
        t.observe("ev1", {"h": 1.9, "tot": 2.5}, now=0.0)
        t.observe("ev1", {"h": 2.0}, now=0.0)
        t.observe("ev2", {"h": 1.8}, now=5.0)
        t.observe("ev2", {"h": 1.9}, now=5.0)
        before = len(t._last)
        t.hot_events(now=11.0)
        after = len(t._last)
        assert after < before
        assert not any(k[0] == "ev1" for k in t._last)
        assert any(k[0] == "ev2" for k in t._last)

    def test_non_hot_event_last_untouched(self) -> None:
        t = _tracker(fresh=10.0)
        t.observe("ev_cold", {"h": 1.5}, now=0.0)
        t.observe("ev_hot", {"h": 1.9}, now=0.0)
        t.observe("ev_hot", {"h": 2.0}, now=0.0)
        t.hot_events(now=11.0)
        assert any(k[0] == "ev_cold" for k in t._last)


class TestFromConfigPidResolver:
    """P1.1: from_config with/without bia_pid_resolver."""

    def test_bia_enabled_with_resolver_trigger_active(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _reset_shared_tracker()  # 27.46: fresh singleton for this test
        monkeypatch.setenv("MOREBETS_TRIGGERS", "bia_price")
        monkeypatch.setattr(config, "BIA_PRICE_TRIGGER_ENABLED", True)
        monkeypatch.setattr(config, "BIA_PRICE_FRESH_SEC", 30.0)
        monkeypatch.setattr(config, "BIA_PRICE_MIN_DELTA", 0.0)
        def resolver(key: str) -> int | None:
            return 999 if key == "ev_test" else None
        t = MoreBetsTargeter.from_config(bia_pid_resolver=resolver)
        bia_triggers = [tr for tr in t._triggers if isinstance(tr, BiaPriceChangeTrigger)]
        assert len(bia_triggers) == 1
        trg = bia_triggers[0]
        trg._tracker.observe("ev_test", {"h": 1.9}, now=0.0)
        trg._tracker.observe("ev_test", {"h": 2.0}, now=0.0)
        forks = trg.current_forks(now=1.0)
        assert len(forks) == 1
        assert forks[0]["event_id"] == 999

    def test_bia_enabled_no_resolver_no_trigger(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _reset_shared_tracker()  # 27.46: avoid stale singleton from other tests
        monkeypatch.setenv("MOREBETS_TRIGGERS", "bia_price")
        monkeypatch.setattr(config, "BIA_PRICE_TRIGGER_ENABLED", True)
        t = MoreBetsTargeter.from_config()
        # 27.46: trigger is added even without resolver (shared pid-keyed tracker)
        assert any(isinstance(tr, BiaPriceChangeTrigger) for tr in t._triggers)
        targets = t.select_targets(now=1.0)
        assert isinstance(targets, list)


class TestFromConfigReadsConfig:
    """P2.2: from_config reads config.BIA_PRICE_* attributes."""

    def test_monkeypatch_config_fresh_sec_is_used(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _reset_shared_tracker()  # 27.46: ensure fresh singleton picks up patched config
        monkeypatch.setenv("MOREBETS_TRIGGERS", "bia_price")
        monkeypatch.setattr(config, "BIA_PRICE_TRIGGER_ENABLED", True)
        monkeypatch.setattr(config, "BIA_PRICE_FRESH_SEC", 99.0)
        monkeypatch.setattr(config, "BIA_PRICE_MIN_DELTA", 0.0)
        t = MoreBetsTargeter.from_config(bia_pid_resolver=lambda _: 1)
        bia_trg = next(tr for tr in t._triggers if isinstance(tr, BiaPriceChangeTrigger))
        assert bia_trg._tracker._fresh_sec == 99.0

    def test_monkeypatch_config_min_delta_is_used(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _reset_shared_tracker()  # 27.46: ensure fresh singleton picks up patched config
        monkeypatch.setenv("MOREBETS_TRIGGERS", "bia_price")
        monkeypatch.setattr(config, "BIA_PRICE_TRIGGER_ENABLED", True)
        monkeypatch.setattr(config, "BIA_PRICE_FRESH_SEC", 30.0)
        monkeypatch.setattr(config, "BIA_PRICE_MIN_DELTA", 0.25)
        t = MoreBetsTargeter.from_config(bia_pid_resolver=lambda _: 1)
        bia_trg = next(tr for tr in t._triggers if isinstance(tr, BiaPriceChangeTrigger))
        assert bia_trg._tracker._min_delta == 0.25
