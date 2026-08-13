"""Tests for TabSleepManager."""
from __future__ import annotations

import pytest

from core.tab_sleep import (
    EMPTY_GRACE_REVIEWS,
    TabPowerState,
    TabReviewResult,
    TabSleepManager,
)


def test_new_tab_defaults_to_active():
    mgr = TabSleepManager()
    mgr.register(29, "today")
    assert mgr.is_active(29, "today")
    assert mgr.should_dom_snapshot(29, "today")
    assert mgr.should_keep_tab_open(29, "today")


def test_unknown_tab_treated_as_active():
    mgr = TabSleepManager()
    assert mgr.is_active(99, "today")
    assert mgr.should_dom_snapshot(99, "today")


def test_empty_tab_non_morebet_sport_suspends_after_grace():
    """Volleyball (34) with 0 games should suspend after EMPTY_GRACE_REVIEWS."""
    mgr = TabSleepManager()
    mgr.register(34, "today")

    for i in range(EMPTY_GRACE_REVIEWS - 1):
        result = mgr.review_tab(34, "today", game_event_ids=set(), now=100.0 + i)
        assert result.new_power == TabPowerState.ACTIVE  # still in grace

    result = mgr.review_tab(34, "today", game_event_ids=set(), now=200.0)
    assert result.new_power == TabPowerState.SUSPENDED
    assert not mgr.should_keep_tab_open(34, "today")
    assert not mgr.should_dom_snapshot(34, "today")


def test_empty_tab_morebet_sport_sleeps_after_grace():
    """Soccer (29) with 0 games suspends after grace (no longer kept open for more_bets)."""
    mgr = TabSleepManager()
    mgr.register(29, "today")

    for i in range(EMPTY_GRACE_REVIEWS - 1):
        mgr.review_tab(29, "today", game_event_ids=set(), now=100.0 + i)

    result = mgr.review_tab(29, "today", game_event_ids=set(), now=200.0)
    assert result.new_power == TabPowerState.SUSPENDED
    assert not mgr.should_dom_snapshot(29, "today")


def test_api_covers_all_non_morebet_suspends():
    """Basketball (4) where API covers all events → suspend."""
    api_events = {1001, 1002, 1003}
    mgr = TabSleepManager(
        
        api_event_ids_fn=lambda sport_id: api_events,
    )
    mgr.register(4, "today")

    result = mgr.review_tab(4, "today", game_event_ids={1001, 1002, 1003}, now=100.0)
    assert result.new_power == TabPowerState.SUSPENDED
    assert result.api_covered_count == 3
    assert result.unique_count == 0


def test_api_covers_all_morebet_sport_sleeps():
    """Soccer (29) where API covers all events → suspend (no longer kept open for more_bets)."""
    api_events = {2001, 2002}
    mgr = TabSleepManager(
        api_event_ids_fn=lambda sport_id: api_events,
    )
    mgr.register(29, "today")

    result = mgr.review_tab(29, "today", game_event_ids={2001, 2002}, now=100.0)
    assert result.new_power == TabPowerState.SUSPENDED
    assert result.reason.startswith("API covers all")


def test_unique_events_keeps_active():
    """Tab with events not on API stays active."""
    api_events = {3001}
    mgr = TabSleepManager(
        
        api_event_ids_fn=lambda sport_id: api_events,
    )
    mgr.register(29, "today")

    result = mgr.review_tab(29, "today", game_event_ids={3001, 3002, 3003}, now=100.0)
    assert result.new_power == TabPowerState.ACTIVE
    assert result.unique_count == 2
    assert result.api_covered_count == 1


def test_tab_wakes_up_when_unique_events_appear():
    """Suspended tab returns to ACTIVE when new unique events appear."""
    api_events = {4001, 4002}
    mgr = TabSleepManager(
        api_event_ids_fn=lambda sport_id: api_events,
    )
    mgr.register(29, "today")

    # First: API covers all → suspend
    mgr.review_tab(29, "today", game_event_ids={4001, 4002}, now=100.0)
    assert mgr.is_suspended(29, "today")

    # Then: new unique event appears → active
    result = mgr.review_tab(29, "today", game_event_ids={4001, 4002, 4003}, now=200.0)
    assert result.new_power == TabPowerState.ACTIVE
    assert result.unique_count == 1


def test_force_active():
    """force_active wakes up a suspended tab."""
    mgr = TabSleepManager(
        api_event_ids_fn=lambda sport_id: {5001},
    )
    mgr.register(29, "today")
    mgr.review_tab(29, "today", game_event_ids={5001}, now=100.0)
    assert mgr.is_suspended(29, "today")

    mgr.force_active(29, "today", reason="api_source_down")
    assert mgr.is_active(29, "today")


def test_force_all_active():
    """force_all_active wakes all sleeping/suspended tabs."""
    mgr = TabSleepManager(
        
        api_event_ids_fn=lambda sport_id: {6001, 6002},
    )
    mgr.register(29, "today")
    mgr.register(4, "today")

    mgr.review_tab(29, "today", game_event_ids={6001}, now=100.0)
    mgr.review_tab(4, "today", game_event_ids={6001}, now=100.0)

    mgr.force_all_active(reason="failover")
    assert mgr.is_active(29, "today")
    assert mgr.is_active(4, "today")


def test_review_all():
    """review_all processes all registered tabs."""
    api_events = {7001}
    mgr = TabSleepManager(
        
        api_event_ids_fn=lambda sport_id: api_events,
    )
    mgr.register(29, "today")
    mgr.register(4, "early")

    results = mgr.review_all(
        tab_games={
            (29, "today"): {7001},        # API covers → sleep (soccer)
            (4, "early"): {7001, 7002},    # partial coverage → active
        },
        now=100.0,
    )
    assert len(results) == 2
    by_key = {r.key: r for r in results}
    assert by_key[(29, "today")].new_power == TabPowerState.SUSPENDED
    assert by_key[(4, "early")].new_power == TabPowerState.ACTIVE


def test_needs_review_timing():
    mgr = TabSleepManager(review_interval_sec=900.0)
    mgr.register(29, "today")

    # Initially needs review after interval
    assert mgr.needs_review(now=1000.0)

    mgr.review_all(tab_games={(29, "today"): {1}}, now=1000.0)
    assert not mgr.needs_review(now=1000.0)
    assert not mgr.needs_review(now=1500.0)
    assert mgr.needs_review(now=1901.0)


def test_summary():
    mgr = TabSleepManager(
        
        api_event_ids_fn=lambda sport_id: {8001},
    )
    mgr.register(29, "today")
    mgr.register(4, "early")
    mgr.review_tab(29, "today", game_event_ids={8001}, now=100.0)

    summary = mgr.summary()
    assert summary["suspended"] == 1  # soccer covered by API
    assert summary["active"] == 1    # basketball not reviewed or has unique data
    assert "29:today" in summary["tabs"]


def test_empty_grace_resets_on_games():
    """If games appear during grace period, consecutive_empty resets."""
    mgr = TabSleepManager()
    mgr.register(34, "today")

    # One empty review
    mgr.review_tab(34, "today", game_event_ids=set(), now=100.0)
    s = mgr.get_state(34, "today")
    assert s.consecutive_empty == 1

    # Games appear — counter resets
    mgr.review_tab(34, "today", game_event_ids={9001}, now=200.0)
    assert s.consecutive_empty == 0
    assert s.power == TabPowerState.ACTIVE


def test_no_api_fn_treats_all_as_unique():
    """Without API callback, all events are treated as unique → tab stays active."""
    mgr = TabSleepManager(api_event_ids_fn=None)
    mgr.register(29, "today")

    result = mgr.review_tab(29, "today", game_event_ids={1001, 1002}, now=100.0)
    assert result.new_power == TabPowerState.ACTIVE
    assert result.unique_count == 2
    assert result.api_covered_count == 0
