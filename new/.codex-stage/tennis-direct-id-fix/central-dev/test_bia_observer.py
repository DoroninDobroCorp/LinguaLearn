"""
Tests for services/bia_observer.py (observer stats, WS loop, subscription)
and async paths in services/bia_client.py (login, verify, ensure_token).
"""

from __future__ import annotations

import asyncio
import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import aiohttp
import pytest

from services.bia_client import BiaSession, _make_ssl_ctx
from services.bia_observer import (
    BiaObserverStats,
    _MIN_STABLE_SESSION_SEC,
    _build_watch_events,
    _build_watch_hcaps,
    _bia_period_for_sport,
    _promote_hot_watch_event_candidates,
    _promote_sibling_watch_event_candidates,
    _remember_watch_event_hot_candidate,
    _observe_ws,
    _queue_watch_event_candidate,
    _queue_related_watch_event_candidates,
    _resolve_bia_event_match,
    _seed_watch_event_candidates_from_live_state,
    lookup_bia_event_for_pid,
    lookup_bia_selection_for_pid,
    run_bia_observer,
)


# ── BiaObserverStats ────────────────────────────────────────────────────────


def test_basketball_namespaces_map_to_exact_parser_periods():
    assert _bia_period_for_sport("basket") == 0
    assert [_bia_period_for_sport(f"basket_q{number}") for number in range(1, 5)] == [1, 2, 3, 4]
    assert _bia_period_for_sport("basket_ht") == 5
    assert _bia_period_for_sport("basket_unknown") is None


def test_stats_initial_values():
    s = BiaObserverStats()
    assert s.events_seen == 0
    assert s.offers_count == 0
    assert s.pmm_count == 0
    assert s.info_count == 0
    assert s.other_count == 0
    assert s.errors == 0
    assert s.ws_connect_ts == 0.0
    assert s.last_msg_ts == 0.0
    assert s.sports_seen == set()
    assert s.subscribed is False
    assert s.discovered_events == []
    assert s._discovered_keys == set()
    assert s._watch_hcaps_keys == set()
    assert s._watch_event_keys == set()
    assert s._watch_event_scan_cursor == 0
    assert s._watch_event_live_seed_cursor == 0
    assert s._watch_event_pending == []
    assert s._watch_event_pending_keys == set()
    assert s._missed_event_cache == {}


def test_stats_summary_format():
    s = BiaObserverStats()
    s.ws_connect_ts = time.time() - 10
    s.events_seen = 5
    s.offers_count = 3
    s.pmm_count = 1
    s.sports_seen = {"fb", "tennis"}
    s.errors = 0
    txt = s.summary()
    assert "events=5" in txt
    assert "offers=3" in txt
    assert "pmm=1" in txt
    assert "errors=0" in txt


# ── _build_watch_hcaps ──────────────────────────────────────────────────────


def test_build_watch_hcaps_empty():
    s = BiaObserverStats()
    assert _build_watch_hcaps(s) is None


def test_build_watch_hcaps_with_events():
    s = BiaObserverStats()
    s.events_by_sport["fb"] = 10
    s.events_by_sport["tennis"] = 3
    s.discovered_events = [
        [3, "fb", "2026-04-05,95,47"],
        [17, "fb", "2026-04-05,1268,535"],
        [5, "tennis", "2026-04-05,200,100"],
    ]
    with patch("services.bia_observer._watch_hcaps_matches_live_state", return_value=True):
        msg = _build_watch_hcaps(s)
    assert msg is not None
    assert msg[0] == "watch_hcaps"
    assert len(msg[1]) == 3
    # Each entry is a [comp_id, sport_code, event_id] triple
    assert msg[1][0] == [3, "fb", "2026-04-05,95,47"]


def test_build_watch_hcaps_filters_by_bia_sports():
    """Only sports in BIA_SPORTS are included in the subscription."""
    s = BiaObserverStats()
    s.events_by_sport["fb"] = 5
    s.events_by_sport["cricket"] = 2
    s.discovered_events = [
        [3, "fb", "2026-04-05,1,1"],
        [7, "cricket", "2026-04-05,2,2"],
    ]
    with patch("services.bia_observer._watch_hcaps_matches_live_state", return_value=True):
        msg = _build_watch_hcaps(s)
    assert msg is not None
    # Default BIA_SPORTS includes fb but not cricket
    sports_in_sub = {triple[1] for triple in msg[1]}
    assert "fb" in sports_in_sub
    assert "cricket" not in sports_in_sub


def test_build_watch_hcaps_deduplicates():
    s = BiaObserverStats()
    s.events_by_sport["fb"] = 2
    s.discovered_events = [
        [3, "fb", "2026-04-05,95,47"],
        [3, "fb", "2026-04-05,95,47"],  # duplicate
    ]
    with patch("services.bia_observer._watch_hcaps_matches_live_state", return_value=True):
        msg = _build_watch_hcaps(s)
    assert msg is not None
    assert len(msg[1]) == 1


def test_build_watch_hcaps_only_unsent_filters_already_watched():
    s = BiaObserverStats()
    s.discovered_events = [
        [3, "fb", "2026-04-05,95,47"],
        [5, "tennis", "2026-04-05,200,100"],
    ]
    s._watch_hcaps_keys.add((3, "fb", "2026-04-05,95,47"))
    with patch("services.bia_observer._watch_hcaps_matches_live_state", return_value=True):
        msg = _build_watch_hcaps(s, only_unsent=True)
    assert msg is not None
    assert msg[1] == [[5, "tennis", "2026-04-05,200,100"]]


def test_build_watch_events_includes_exact_proof_sports_only():
    s = BiaObserverStats()
    s.discovered_events = [
        [3, "fb", "2026-04-05,95,47"],
        [3, "fb_ht", "2026-04-05,95,47"],
        [3, "fb_htft", "2026-04-05,95,47"],
        [5, "tennis", "2026-04-05,200,100"],
        [6, "esports", "2026-04-05,201,101"],
        [7, "fb_corn", "2026-04-05,2,2"],
    ]
    with patch("services.bia_observer._watch_event_matches_live_state", return_value=True):
        msg = _build_watch_events(s)
    assert msg == [
        [3, "fb", "2026-04-05,95,47"],
        [3, "fb_ht", "2026-04-05,95,47"],
        [3, "fb_htft", "2026-04-05,95,47"],
        [5, "tennis", "2026-04-05,200,100"],
        [6, "esports", "2026-04-05,201,101"],
    ]


def test_build_watch_events_only_unsent_filters_already_watched():
    s = BiaObserverStats()
    s.discovered_events = [
        [3, "fb", "2026-04-05,95,47"],
        [3, "fb_ht", "2026-04-05,95,47"],
    ]
    s._watch_event_keys.add((3, "fb", "2026-04-05,95,47"))
    with patch("services.bia_observer._watch_event_matches_live_state", return_value=True):
        msg = _build_watch_events(s, only_unsent=True)
    assert msg == [[3, "fb_ht", "2026-04-05,95,47"]]


def _watch_event_matches_live_state_for_test(_stats, triple):
    return triple[1] == "fb"


def test_queue_watch_event_candidate_front_inserts_and_trims_tail():
    s = BiaObserverStats()
    from services.bia_observer import _WATCH_EVENT_BATCH_SIZE, _WATCH_EVENT_PREFETCH_COUNT
    cap = max(_WATCH_EVENT_BATCH_SIZE, _WATCH_EVENT_PREFETCH_COUNT)
    for idx in range(cap):
        triple = [idx, "fb", f"evt-{idx}"]
        s._watch_event_pending.append(triple)
        s._watch_event_pending_keys.add((idx, "fb", f"evt-{idx}"))

    added = _queue_watch_event_candidate(
        s,
        [999, "fb", "priority-evt"],
        front=True,
    )

    assert added is True
    assert s._watch_event_pending[0] == [999, "fb", "priority-evt"]
    assert len(s._watch_event_pending) == cap
    assert (999, "fb", "priority-evt") in s._watch_event_pending_keys
    assert (cap - 1, "fb", f"evt-{cap - 1}") not in s._watch_event_pending_keys


def test_queue_watch_event_candidate_front_moves_existing_pending_to_front():
    s = BiaObserverStats()
    s._watch_event_pending = [
        [1, "fb", "evt-1"],
        [2, "fb", "evt-2"],
        [3, "fb", "evt-3"],
    ]
    s._watch_event_pending_keys = {
        (1, "fb", "evt-1"),
        (2, "fb", "evt-2"),
        (3, "fb", "evt-3"),
    }

    moved = _queue_watch_event_candidate(
        s,
        [3, "fb", "evt-3"],
        front=True,
    )

    assert moved is True
    assert s._watch_event_pending == [
        [3, "fb", "evt-3"],
        [1, "fb", "evt-1"],
        [2, "fb", "evt-2"],
    ]


def test_promote_hot_watch_event_candidates_moves_hot_match_to_front():
    s = BiaObserverStats()
    s._watch_event_pending = [
        [1, "fb", "evt-1"],
        [2, "fb", "evt-2"],
    ]
    s._watch_event_pending_keys = {
        (1, "fb", "evt-1"),
        (2, "fb", "evt-2"),
    }
    _remember_watch_event_hot_candidate(s, [2, "fb", "evt-2"])

    _promote_hot_watch_event_candidates(s, limit=1)

    assert s._watch_event_pending[0] == [2, "fb", "evt-2"]
    assert s._watch_event_hot_candidates == [[2, "fb", "evt-2"]]


def test_resolve_bia_event_match_can_bypass_stale_miss_cache(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s._event_registry[("29", "fb", "evt-1")] = {
            "competition_name": "UEFA Europa League",
            "home": "Bologna",
            "away": "Aston Villa",
            "sport": "fb",
            "event_key": "evt-1",
            "competition_id": "29",
        }
        s._missed_event_cache[("29", "fb", "evt-1")] = time.time()
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1626579734: {
                    "Pid": 1626579734,
                    "SportName": "Soccer",
                    "homeName": "Bologna",
                    "awayName": "Aston Villa",
                }
            },
            raising=False,
        )

        miss_pid, _ = _resolve_bia_event_match(
            s,
            comp_id="29",
            sport_code="fb",
            event_key="evt-1",
        )
        hit_pid, _ = _resolve_bia_event_match(
            s,
            comp_id="29",
            sport_code="fb",
            event_key="evt-1",
            allow_stale_miss_recheck=True,
        )

        assert miss_pid is None
        assert hit_pid == 1626579734
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_resolve_bia_event_match_skips_miss_cache_when_runtime_inventory_empty(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s._event_registry[("29", "fb", "evt-1")] = {
            "competition_name": "UEFA Europa League",
            "home": "Bologna",
            "away": "Aston Villa",
            "sport": "fb",
            "event_key": "evt-1",
            "competition_id": "29",
        }
        monkeypatch.setattr(state, "events_data", {}, raising=False)

        pid, swapped = _resolve_bia_event_match(
            s,
            comp_id="29",
            sport_code="fb",
            event_key="evt-1",
        )

        assert pid is None
        assert swapped is False
        assert s._missed_event_cache == {}
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_build_watch_hcaps_does_not_record_miss_cache_for_unmatched_event(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s.discovered_events = [[29, "fb", "evt-1"]]
        s._event_registry[("29", "fb", "evt-1")] = {
            "competition_name": "UEFA Europa League",
            "home": "Bologna",
            "away": "Aston Villa",
            "sport": "fb",
            "event_key": "evt-1",
            "competition_id": "29",
        }
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1: {
                    "Pid": 1,
                    "SportName": "Soccer",
                    "homeName": "Roma",
                    "awayName": "Lazio",
                    "isLive": False,
                }
            },
            raising=False,
        )

        msg = _build_watch_hcaps(s)

        assert msg is None
        assert s._missed_event_cache == {}
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_seed_watch_event_candidates_from_live_state_prioritizes_top_soccer(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s._event_registry[("29", "fb", "bologna-evt")] = {
            "competition_name": "UEFA Europa League",
            "home": "Bologna",
            "away": "Aston Villa",
            "sport": "fb",
            "event_key": "bologna-evt",
            "competition_id": "29",
        }
        s._event_registry[("31", "fb", "later-evt")] = {
            "competition_name": "Serie A",
            "home": "Torino",
            "away": "Roma",
            "sport": "fb",
            "event_key": "later-evt",
            "competition_id": "31",
        }
        s._watch_hcaps_keys = {
            (29, "fb", "bologna-evt"),
            (31, "fb", "later-evt"),
        }
        s._matched_event_cache[("29", "fb", "bologna-evt")] = (1626579734, False)
        s._matched_event_cache[("31", "fb", "later-evt")] = (2000000001, False)
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1626579734: {
                    "Pid": 1626579734,
                    "SportName": "Soccer",
                    "homeName": "Bologna",
                    "awayName": "Aston Villa",
                    "start_time_ms": 100,
                },
                2000000001: {
                    "Pid": 2000000001,
                    "SportName": "Soccer",
                    "homeName": "Torino",
                    "awayName": "Roma",
                    "start_time_ms": 200,
                },
            },
            raising=False,
        )

        _seed_watch_event_candidates_from_live_state(s, limit=2)

        assert s._watch_event_pending == [
            [29, "fb", "bologna-evt"],
            [31, "fb", "later-evt"],
        ]
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_seed_watch_event_candidates_from_live_state_prefers_player_props(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s._event_registry[("29", "fb", "early-evt")] = {
            "competition_name": "League",
            "home": "Early",
            "away": "Kickoff",
            "sport": "fb",
            "event_key": "early-evt",
            "competition_id": "29",
        }
        s._event_registry[("31", "fb", "rich-evt")] = {
            "competition_name": "League",
            "home": "Rich",
            "away": "Match",
            "sport": "fb",
            "event_key": "rich-evt",
            "competition_id": "31",
        }
        s._watch_hcaps_keys = {
            (29, "fb", "early-evt"),
            (31, "fb", "rich-evt"),
        }
        s._matched_event_cache[("29", "fb", "early-evt")] = (1001, False)
        s._matched_event_cache[("31", "fb", "rich-evt")] = (1002, False)
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1001: {
                    "Pid": 1001,
                    "SportName": "Soccer",
                    "homeName": "Early",
                    "awayName": "Kickoff",
                    "start_time_ms": 100,
                },
                1002: {
                    "Pid": 1002,
                    "SportName": "Soccer",
                    "homeName": "Rich",
                    "awayName": "Match",
                    "start_time_ms": 200,
                    "Period": {
                        0: {
                            "PlayerProps": [{"Name": "Anytime Scorer"}],
                        },
                    },
                },
            },
            raising=False,
        )

        _seed_watch_event_candidates_from_live_state(s, limit=1)

        assert s._watch_event_pending == [[31, "fb", "rich-evt"]]
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_seed_watch_event_candidates_from_live_state_prefers_richer_specials(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s._event_registry[("29", "fb", "early-evt")] = {
            "competition_name": "League",
            "home": "Early",
            "away": "Kickoff",
            "sport": "fb",
            "event_key": "early-evt",
            "competition_id": "29",
        }
        s._event_registry[("31", "fb", "rich-evt")] = {
            "competition_name": "League",
            "home": "Rich",
            "away": "Match",
            "sport": "fb",
            "event_key": "rich-evt",
            "competition_id": "31",
        }
        s._watch_hcaps_keys = {
            (29, "fb", "early-evt"),
            (31, "fb", "rich-evt"),
        }
        s._matched_event_cache[("29", "fb", "early-evt")] = (1001, False)
        s._matched_event_cache[("31", "fb", "rich-evt")] = (1002, False)
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1001: {
                    "Pid": 1001,
                    "SportName": "Soccer",
                    "homeName": "Early",
                    "awayName": "Kickoff",
                    "start_time_ms": 100,
                    "Periods": [
                        {"Number": 0, "Win1x2": []},
                    ],
                },
                1002: {
                    "Pid": 1002,
                    "SportName": "Soccer",
                    "homeName": "Rich",
                    "awayName": "Match",
                    "start_time_ms": 200,
                    "Periods": [
                        {
                            "Number": 0,
                            "Win1x2": [],
                            "CorrectScore": [],
                            "WinningMargin": [],
                            "TotalGoalsRange": [],
                        },
                    ],
                },
            },
            raising=False,
        )

        _seed_watch_event_candidates_from_live_state(s, limit=1)

        assert s._watch_event_pending == [[31, "fb", "rich-evt"]]
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_seed_watch_event_candidates_from_live_state_prefers_prematch(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s._event_registry[("29", "fb", "live-evt")] = {
            "competition_name": "League",
            "home": "Live",
            "away": "Match",
            "sport": "fb",
            "event_key": "live-evt",
            "competition_id": "29",
        }
        s._event_registry[("31", "fb", "prematch-evt")] = {
            "competition_name": "League",
            "home": "Prematch",
            "away": "Match",
            "sport": "fb",
            "event_key": "prematch-evt",
            "competition_id": "31",
        }
        s._watch_hcaps_keys = {
            (29, "fb", "live-evt"),
            (31, "fb", "prematch-evt"),
        }
        s._matched_event_cache[("29", "fb", "live-evt")] = (1001, False)
        s._matched_event_cache[("31", "fb", "prematch-evt")] = (1002, False)
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1001: {
                    "Pid": 1001,
                    "SportName": "Soccer",
                    "homeName": "Live",
                    "awayName": "Match",
                    "start_time_ms": 100,
                    "isLive": True,
                },
                1002: {
                    "Pid": 1002,
                    "SportName": "Soccer",
                    "homeName": "Prematch",
                    "awayName": "Match",
                    "start_time_ms": 200,
                    "isLive": False,
                },
            },
            raising=False,
        )

        _seed_watch_event_candidates_from_live_state(s, limit=1)

        assert s._watch_event_pending == [[31, "fb", "prematch-evt"]]
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_build_watch_events_skips_live_matches(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s.discovered_events = [[29, "fb", "live-evt"]]
        s._event_registry[("29", "fb", "live-evt")] = {
            "competition_name": "League",
            "home": "Live",
            "away": "Match",
            "sport": "fb",
            "event_key": "live-evt",
            "competition_id": "29",
        }
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1001: {
                    "Pid": 1001,
                    "SportName": "Soccer",
                    "homeName": "Live",
                    "awayName": "Match",
                    "isLive": True,
                },
            },
            raising=False,
        )

        subs = _build_watch_events(s, only_unsent=True, limit=1)

        assert subs is None
        assert s._watch_event_pending == []
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_seed_watch_event_candidates_from_live_state_rotates_cursor(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        registry_entries = [
            ("29", "Alpha", "One", "evt-1"),
            ("30", "Bravo", "Two", "evt-2"),
            ("31", "Charlie", "Three", "evt-3"),
        ]
        for comp_id, home, away, event_key in registry_entries:
            s._event_registry[(comp_id, "fb", event_key)] = {
                "competition_name": "League",
                "home": home,
                "away": away,
                "sport": "fb",
                "event_key": event_key,
                "competition_id": comp_id,
            }
            s._watch_hcaps_keys.add((int(comp_id), "fb", event_key))
        s._matched_event_cache[("29", "fb", "evt-1")] = (1001, False)
        s._matched_event_cache[("30", "fb", "evt-2")] = (1002, False)
        s._matched_event_cache[("31", "fb", "evt-3")] = (1003, False)
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1001: {
                    "Pid": 1001,
                    "SportName": "Soccer",
                    "homeName": "Alpha",
                    "awayName": "One",
                    "start_time_ms": 100,
                },
                1002: {
                    "Pid": 1002,
                    "SportName": "Soccer",
                    "homeName": "Bravo",
                    "awayName": "Two",
                    "start_time_ms": 200,
                },
                1003: {
                    "Pid": 1003,
                    "SportName": "Soccer",
                    "homeName": "Charlie",
                    "awayName": "Three",
                    "start_time_ms": 300,
                },
            },
            raising=False,
        )

        _seed_watch_event_candidates_from_live_state(s, limit=1)
        first_pending = list(s._watch_event_pending)
        s._watch_event_pending.clear()
        s._watch_event_pending_keys.clear()
        _seed_watch_event_candidates_from_live_state(s, limit=1)
        second_pending = list(s._watch_event_pending)

        assert first_pending == [[29, "fb", "evt-1"]]
        assert second_pending == [[30, "fb", "evt-2"]]
        assert s._watch_event_live_seed_cursor == 3
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_seed_watch_event_candidates_from_live_state_reorders_existing_pending(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s._event_registry[("29", "fb", "bologna-evt")] = {
            "competition_name": "UEFA Europa League",
            "home": "Bologna",
            "away": "Aston Villa",
            "sport": "fb",
            "event_key": "bologna-evt",
            "competition_id": "29",
        }
        s._watch_hcaps_keys.add((29, "fb", "bologna-evt"))
        s._matched_event_cache[("29", "fb", "bologna-evt")] = (1626579734, False)
        s._watch_event_pending = [
            [31, "fb", "other-evt"],
            [29, "fb", "bologna-evt"],
        ]
        s._watch_event_pending_keys = {
            (31, "fb", "other-evt"),
            (29, "fb", "bologna-evt"),
        }
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1626579734: {
                    "Pid": 1626579734,
                    "SportName": "Soccer",
                    "homeName": "Bologna",
                    "awayName": "Aston Villa",
                    "start_time_ms": 100,
                },
            },
            raising=False,
        )

        _seed_watch_event_candidates_from_live_state(s, limit=1)

        assert s._watch_event_pending[0] == [29, "fb", "bologna-evt"]
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_seed_watch_event_candidates_from_live_state_can_pick_first_half_entry(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s._event_registry[("29", "fb", "bologna-evt")] = {
            "competition_name": "UEFA Europa League",
            "home": "Bologna",
            "away": "Aston Villa",
            "sport": "fb",
            "event_key": "bologna-evt",
            "competition_id": "29",
        }
        s._event_registry[("29", "fb_ht", "bologna-evt")] = {
            "competition_name": "UEFA Europa League",
            "home": "Bologna",
            "away": "Aston Villa",
            "sport": "fb_ht",
            "event_key": "bologna-evt",
            "competition_id": "29",
        }
        s._watch_hcaps_keys = {
            (29, "fb", "bologna-evt"),
            (29, "fb_ht", "bologna-evt"),
        }
        s._matched_event_cache[("29", "fb", "bologna-evt")] = (1626579734, False)
        s._matched_event_cache[("29", "fb_ht", "bologna-evt")] = (1626579734, False)
        s._watch_event_keys.add((29, "fb", "bologna-evt"))
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1626579734: {
                    "Pid": 1626579734,
                    "SportName": "Soccer",
                    "homeName": "Bologna",
                    "awayName": "Aston Villa",
                    "start_time_ms": 100,
                },
            },
            raising=False,
        )

        _seed_watch_event_candidates_from_live_state(s, limit=2)

        assert s._watch_event_pending == [[29, "fb_ht", "bologna-evt"]]
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_queue_related_watch_event_candidates_promotes_first_half(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s._event_registry[("29", "fb", "bologna-evt")] = {
            "competition_name": "UEFA Europa League",
            "home": "Bologna",
            "away": "Aston Villa",
            "sport": "fb",
            "event_key": "bologna-evt",
            "competition_id": "29",
        }
        s._event_registry[("29", "fb_ht", "bologna-evt")] = {
            "competition_name": "UEFA Europa League",
            "home": "Bologna",
            "away": "Aston Villa",
            "sport": "fb_ht",
            "event_key": "bologna-evt",
            "competition_id": "29",
        }
        s._watch_hcaps_keys = {
            (29, "fb", "bologna-evt"),
            (29, "fb_ht", "bologna-evt"),
        }
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1626579734: {
                    "Pid": 1626579734,
                    "SportName": "Soccer",
                    "homeName": "Bologna",
                    "awayName": "Aston Villa",
                    "start_time_ms": 100,
                },
            },
            raising=False,
        )

        _queue_related_watch_event_candidates(s, [29, "fb", "bologna-evt"])

        assert s._watch_event_pending == [[29, "fb_ht", "bologna-evt"]]
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_promote_sibling_watch_event_candidates_queues_first_half_when_ready(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s._watch_event_sibling_pids = [1626579734]
        s._event_registry[("29", "fb_ht", "bologna-evt")] = {
            "competition_name": "UEFA Europa League",
            "home": "Bologna",
            "away": "Aston Villa",
            "sport": "fb_ht",
            "event_key": "bologna-evt",
            "competition_id": "29",
        }
        s._watch_hcaps_keys = {(29, "fb_ht", "bologna-evt")}
        s._matched_event_cache[("29", "fb_ht", "bologna-evt")] = (1626579734, False)
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1626579734: {
                    "Pid": 1626579734,
                    "SportName": "Soccer",
                    "homeName": "Bologna",
                    "awayName": "Aston Villa",
                    "start_time_ms": 100,
                },
            },
            raising=False,
        )

        _promote_sibling_watch_event_candidates(s, limit=1)

        assert s._watch_event_pending == [[29, "fb_ht", "bologna-evt"]]
        assert s._watch_event_sibling_pids == [1626579734]
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


# ── _observe_ws ─────────────────────────────────────────────────────────────


def _make_fake_ws(messages: list, *, close_after: int | None = None):
    """Return a fake WS context manager that yields ``messages`` then closes."""
    ws = AsyncMock()
    ws.closed = False
    call_count = 0

    async def _receive():
        nonlocal call_count
        if call_count < len(messages):
            msg = messages[call_count]
            call_count += 1
            return msg
        # After messages exhausted, return CLOSE
        ws.closed = True
        return SimpleNamespace(type=aiohttp.WSMsgType.CLOSE, data=None, extra=None)

    ws.receive = _receive
    ws.send_json = AsyncMock()
    return ws


def _text_msg(data: str) -> SimpleNamespace:
    return SimpleNamespace(type=aiohttp.WSMsgType.TEXT, data=data)


def _close_msg() -> SimpleNamespace:
    return SimpleNamespace(type=aiohttp.WSMsgType.CLOSE, data=None, extra=None)


class _FakeWSCtx:
    """Async context manager that returns a pre-built fake WS."""

    def __init__(self, ws):
        self._ws = ws

    async def __aenter__(self):
        return self._ws

    async def __aexit__(self, *exc):
        pass


@pytest.mark.asyncio
async def test_observe_ws_no_url():
    """_observe_ws returns immediately when no WS URL."""
    http = MagicMock()
    bia = BiaSession(http)
    stats = BiaObserverStats()
    await _observe_ws(bia, stats)
    assert stats.ws_connect_ts == 0.0


@pytest.mark.asyncio
async def test_observe_ws_requests_configured_competition_inventory_first():
    """A cold connection actively requests the bounded configured inventory."""
    ws = _make_fake_ws([_close_msg()])
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(ws))
    bia = BiaSession(http)
    bia._token = "test-tok"
    bia._login_ts = time.time()

    stats = BiaObserverStats()
    with patch(
        "services.bia_observer._cfg.BIA_SPORTS",
        ["esports", "tennis", "esports", ""],
    ):
        await _observe_ws(bia, stats)

    ws.send_json.assert_awaited_once_with(
        ["watch_comps", ["esports", "tennis"]],
    )


@pytest.mark.asyncio
async def test_observe_ws_processes_events():
    """Events and rich/narrow BIA offer frames are counted."""
    event_frame = json.dumps(["event", ["fb", "2026-04-05,1,1"], {"home": "A", "away": "B", "competition_id": 3}])
    offers_event_frame = json.dumps(["offers_event", ["fb", "2026-04-05,1,1"], {"cs": []}])
    offers_frame = json.dumps(["offers_hcap", ["fb", "2026-04-05,1,1"], {"wdw": []}])

    ws = _make_fake_ws([
        _text_msg(event_frame),
        _text_msg(offers_event_frame),
        _text_msg(offers_frame),
        _close_msg(),
    ])
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(ws))
    bia = BiaSession(http)
    bia._token = "test-tok"
    bia._login_ts = time.time()

    stats = BiaObserverStats()
    with patch("services.bia_observer._cfg.BIA_EXPERIMENTAL_OBSERVER_WATCH_EVENT", True), \
         patch("services.bia_observer._watch_hcaps_matches_live_state", side_effect=_watch_event_matches_live_state_for_test), \
         patch("services.bia_observer._WATCH_HCAPS_WARMUP_SEC", 0.0), \
         patch("services.bia_observer._WATCH_EVENT_WARMUP_SEC", 0.0), \
         patch("services.bia_observer._watch_event_matches_live_state", side_effect=_watch_event_matches_live_state_for_test):
        await _observe_ws(bia, stats)

    assert stats.events_seen == 1
    assert stats.offers_count == 2
    assert "fb" in stats.sports_seen
    # watch_hcaps should have been sent with [comp_id, sport, event_id] triple
    assert stats.subscribed is True
    assert len(stats.discovered_events) == 1
    assert stats.discovered_events[0] == [3, "fb", "2026-04-05,1,1"]
    calls = ws.send_json.call_args_list
    event_calls = [c for c in calls if c[0][0][0] == "watch_event"]
    hcap_calls = [c for c in calls if c[0][0][0] == "watch_hcaps"]
    assert len(event_calls) == 1
    assert event_calls[0][0][0] == ["watch_event", [3, "fb", "2026-04-05,1,1"]]
    assert len(hcap_calls) == 1
    sent_subs = hcap_calls[0][0][0][1]
    assert sent_subs[0] == [3, "fb", "2026-04-05,1,1"]


@pytest.mark.asyncio
async def test_observe_ws_ingests_raw_offer_proof_before_optional_integration():
    offers = json.dumps([
        "offers_hcap",
        [3, "fb", "2026-04-05,1,1"],
        {"tahou,h": [None, [[2.5, 1.91, 1.95]]]},
    ])
    ws = _make_fake_ws([_text_msg(offers), _close_msg()])
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(ws))
    bia = BiaSession(http)
    bia._token = "test-tok"
    bia._login_ts = time.time()
    stats = BiaObserverStats()

    with patch("services.bia_observer._bia_integration_active", return_value=False):
        await _observe_ws(bia, stats)

    proof = stats._offer_proofs.prove(
        {"comp_id": "3", "sport_code": "fb", "event_key": "2026-04-05,1,1"},
        {"bet_type": 4, "team_select": 5, "handicap": 2.5},
    )
    assert proof.bet_type == "for,tahover,h,10"


@pytest.mark.asyncio
async def test_observe_ws_incrementally_subscribes_new_events():
    event1 = json.dumps(["event", ["fb", "2026-04-05,1,1"], {"home": "A", "away": "B", "competition_id": 3}])
    event2 = json.dumps(["event", ["fb", "2026-04-05,1,2"], {"home": "C", "away": "D", "competition_id": 3}])
    event3 = json.dumps(["event", ["tennis", "2026-04-05,2,1"], {"home": "E", "away": "F", "competition_id": 5}])

    ws = _make_fake_ws([
        _text_msg(event1),
        _text_msg(event2),
        _text_msg(event3),
        _close_msg(),
    ])
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(ws))
    bia = BiaSession(http)
    bia._token = "test-tok"
    bia._login_ts = time.time()

    stats = BiaObserverStats()
    with patch("services.bia_observer._cfg.BIA_EXPERIMENTAL_OBSERVER_WATCH_EVENT", True), \
         patch("services.bia_observer._watch_hcaps_matches_live_state", side_effect=_watch_event_matches_live_state_for_test), \
         patch("services.bia_observer._WATCH_HCAPS_BATCH_SIZE", 2), \
         patch("services.bia_observer._WATCH_EVENT_BATCH_SIZE", 2), \
         patch("services.bia_observer._WATCH_HCAPS_WARMUP_SEC", 0.0), \
         patch("services.bia_observer._WATCH_EVENT_WARMUP_SEC", 0.0), \
         patch("services.bia_observer._WATCH_HCAPS_FLUSH_SEC", 0.0), \
         patch("services.bia_observer._WATCH_EVENT_FLUSH_SEC", 0.0), \
         patch("services.bia_observer._watch_event_matches_live_state", side_effect=_watch_event_matches_live_state_for_test):
        await _observe_ws(bia, stats)

    calls = ws.send_json.call_args_list
    event_calls = [c for c in calls if c[0][0][0] == "watch_event"]
    hcap_calls = [c for c in calls if c[0][0][0] == "watch_hcaps"]
    assert len(event_calls) == 2
    assert [c[0][0][1] for c in event_calls] == [
        [3, "fb", "2026-04-05,1,1"],
        [3, "fb", "2026-04-05,1,2"],
    ]
    # With time-gated builds, hcaps may arrive in 1 or 2 batches.
    assert len(hcap_calls) >= 1
    all_hcap_triples = []
    for hc in hcap_calls:
        all_hcap_triples.extend(hc[0][0][1])
    assert sorted(all_hcap_triples) == sorted([
        [3, "fb", "2026-04-05,1,1"],
        [3, "fb", "2026-04-05,1,2"],
    ])
    assert stats._watch_hcaps_keys == {
        (3, "fb", "2026-04-05,1,1"),
        (3, "fb", "2026-04-05,1,2"),
    }
    assert stats._watch_event_keys == {
        (3, "fb", "2026-04-05,1,1"),
        (3, "fb", "2026-04-05,1,2"),
    }


@pytest.mark.asyncio
async def test_observe_ws_deduplicates_discovered_events():
    """Duplicate event messages must not grow discovered_events unboundedly."""
    event_frame = json.dumps(["event", ["fb", "2026-04-05,1,1"], {"home": "A", "away": "B", "competition_id": 3}])

    ws = _make_fake_ws([
        _text_msg(event_frame),
        _text_msg(event_frame),
        _text_msg(event_frame),
        _close_msg(),
    ])
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(ws))
    bia = BiaSession(http)
    bia._token = "test-tok"
    bia._login_ts = time.time()

    stats = BiaObserverStats()
    with patch("services.bia_observer._watch_event_matches_live_state", side_effect=_watch_event_matches_live_state_for_test):
        await _observe_ws(bia, stats)

    assert stats.events_seen == 3
    assert len(stats.discovered_events) == 1
    assert len(stats._discovered_keys) == 1


@pytest.mark.asyncio
async def test_observe_ws_paces_full_watch_hcaps_batches():
    """Even full watch_hcaps batches must respect the flush interval."""
    event1 = json.dumps(["event", ["fb", "2026-04-05,1,1"], {"home": "A", "away": "B", "competition_id": 3}])
    event2 = json.dumps(["event", ["fb", "2026-04-05,1,2"], {"home": "C", "away": "D", "competition_id": 3}])
    event3 = json.dumps(["event", ["fb", "2026-04-05,1,3"], {"home": "E", "away": "F", "competition_id": 3}])
    event4 = json.dumps(["event", ["fb", "2026-04-05,1,4"], {"home": "G", "away": "H", "competition_id": 3}])

    ws = _make_fake_ws([
        _text_msg(event1),
        _text_msg(event2),
        _text_msg(event3),
        _text_msg(event4),
        _close_msg(),
    ])
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(ws))
    bia = BiaSession(http)
    bia._token = "test-tok"
    bia._login_ts = time.time()

    stats = BiaObserverStats()
    fake_now = iter([0.0, 0.0, 0.0, 0.1, 0.2, 0.3, 0.4, 0.5])
    with patch("services.bia_observer._cfg.BIA_EXPERIMENTAL_OBSERVER_WATCH_EVENT", True), \
         patch("services.bia_observer._watch_hcaps_matches_live_state", side_effect=_watch_event_matches_live_state_for_test), \
         patch("services.bia_observer.time.time", side_effect=lambda: next(fake_now)), \
         patch("services.bia_observer._WATCH_HCAPS_BATCH_SIZE", 2), \
         patch("services.bia_observer._WATCH_EVENT_BATCH_SIZE", 2), \
         patch("services.bia_observer._WATCH_HCAPS_WARMUP_SEC", 0.0), \
         patch("services.bia_observer._WATCH_EVENT_WARMUP_SEC", 0.0), \
         patch("services.bia_observer._WATCH_HCAPS_FLUSH_SEC", 1.0), \
         patch("services.bia_observer._WATCH_EVENT_FLUSH_SEC", 1.0), \
         patch("services.bia_observer._watch_event_matches_live_state", side_effect=_watch_event_matches_live_state_for_test):
        await _observe_ws(bia, stats)

    calls = ws.send_json.call_args_list
    event_calls = [c for c in calls if c[0][0][0] == "watch_event"]
    hcap_calls = [c for c in calls if c[0][0][0] == "watch_hcaps"]
    # With time-gated builds (no batch-size shortcut), only the first
    # event seen before the initial build fires gets subscribed,
    # because subsequent events arrive before the 1s flush interval.
    assert len(event_calls) == 1
    assert event_calls[0][0][0] == ["watch_event", [3, "fb", "2026-04-05,1,1"]]
    assert len(hcap_calls) == 1
    assert hcap_calls[0][0][0][1] == [
        [3, "fb", "2026-04-05,1,1"],
    ]
    assert stats._watch_hcaps_keys == {
        (3, "fb", "2026-04-05,1,1"),
    }
    assert stats._watch_event_keys == {
        (3, "fb", "2026-04-05,1,1"),
    }


@pytest.mark.asyncio
async def test_observe_ws_heartbeat_on_timeout():
    """When no message arrives within the heartbeat interval, a ping is sent."""
    event_frame = json.dumps(["event", ["fb", "2026-04-05,1,1"], {"home": "A", "away": "B", "competition_id": 3}])
    ws = _make_fake_ws([])  # no messages at all
    call_idx = 0

    async def _receive_with_timeout():
        nonlocal call_idx
        call_idx += 1
        if call_idx == 1:
            # First call: return an event so subscription logic works
            return _text_msg(event_frame)
        if call_idx <= 3:
            # Next calls: simulate silence (TimeoutError)
            raise asyncio.TimeoutError
        # Then close
        return _close_msg()

    ws.receive = _receive_with_timeout

    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(ws))
    bia = BiaSession(http)
    bia._token = "test-tok"
    bia._login_ts = time.time()

    stats = BiaObserverStats()

    # Patch wait_for to call receive directly (bypassing the real timeout).
    async def _patched_wait_for(coro, *, timeout=None):
        return await coro

    with patch("services.bia_observer._cfg") as mock_cfg, \
         patch("services.bia_observer.asyncio.wait_for", side_effect=_patched_wait_for):
        mock_cfg.BIA_HEARTBEAT_SEC = 0.0  # ensure ping fires every iteration
        mock_cfg.BIA_OBSERVER_LOG_INTERVAL_SEC = 999
        mock_cfg.BIA_SSL_VERIFY = True
        await _observe_ws(bia, stats)

    # A ping should have been sent during the timeout branch
    ping_calls = [c for c in ws.send_json.call_args_list if c[0][0][0] == "ping"]
    assert len(ping_calls) >= 1


@pytest.mark.asyncio
async def test_observe_ws_error_increments_stats():
    """WS connect exception increments stats.errors."""
    http = MagicMock()
    http.ws_connect = MagicMock(side_effect=ConnectionError("boom"))
    bia = BiaSession(http)
    bia._token = "test-tok"
    bia._login_ts = time.time()

    stats = BiaObserverStats()
    await _observe_ws(bia, stats)
    assert stats.errors == 1


# ── run_bia_observer ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_run_observer_disabled():
    """Observer exits immediately when BIA_ENABLED is False."""
    with patch("services.bia_observer._cfg") as mock_cfg:
        mock_cfg.BIA_ENABLED = False
        await run_bia_observer()


@pytest.mark.asyncio
async def test_run_observer_login_fail_backoff():
    """Login failure doubles the backoff delay."""
    iteration = 0

    async def _fake_ensure(*_a, **_kw):
        return None

    async def _fake_sleep(delay):
        nonlocal iteration
        iteration += 1
        if iteration == 1:
            assert delay == 5.0
        elif iteration == 2:
            assert delay == 10.0
        elif iteration >= 3:
            raise asyncio.CancelledError  # break out

    with patch("services.bia_observer._cfg") as mock_cfg, \
         patch("services.bia_observer.aiohttp") as mock_aio, \
         patch("services.bia_observer.asyncio.sleep", side_effect=_fake_sleep):
        mock_cfg.BIA_ENABLED = True
        mock_cfg.BIA_RECONNECT_DELAY_SEC = 5.0
        mock_cfg.BIA_RECONNECT_MAX_DELAY_SEC = 120.0

        mock_http = AsyncMock()
        mock_aio.CookieJar.return_value = MagicMock()
        mock_aio.ClientSession.return_value.__aenter__ = AsyncMock(return_value=mock_http)
        mock_aio.ClientSession.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch.object(BiaSession, "ensure_token", new=_fake_ensure):
            with pytest.raises(asyncio.CancelledError):
                await run_bia_observer()

    assert iteration >= 3


@pytest.mark.asyncio
async def test_run_observer_lifecycle_reconnecting_during_login_fail():
    """During login-fail backoff sleep, lifecycle_state must be 'reconnecting'."""
    import services.bia_observer as obs

    states_during_sleep: list[str] = []

    async def _fake_ensure(*_a, **_kw):
        return None

    async def _fake_sleep(delay):
        states_during_sleep.append(obs._lifecycle_state)
        if len(states_during_sleep) >= 2:
            raise asyncio.CancelledError

    with patch("services.bia_observer._cfg") as mock_cfg, \
         patch("services.bia_observer.aiohttp") as mock_aio, \
         patch("services.bia_observer.asyncio.sleep", side_effect=_fake_sleep):
        mock_cfg.BIA_ENABLED = True
        mock_cfg.BIA_RECONNECT_DELAY_SEC = 5.0
        mock_cfg.BIA_RECONNECT_MAX_DELAY_SEC = 120.0

        mock_http = AsyncMock()
        mock_aio.CookieJar.return_value = MagicMock()
        mock_aio.ClientSession.return_value.__aenter__ = AsyncMock(return_value=mock_http)
        mock_aio.ClientSession.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch.object(BiaSession, "ensure_token", new=_fake_ensure):
            with pytest.raises(asyncio.CancelledError):
                await run_bia_observer()

    assert all(s == "reconnecting" for s in states_during_sleep)
    assert obs._lifecycle_state == "stopped"


@pytest.mark.asyncio
async def test_run_observer_backoff_resets_after_stable_session():
    """Backoff resets to base delay after a session lasting > _MIN_STABLE_SESSION_SEC."""
    delays_seen: list[float] = []
    iteration = 0

    async def _fake_ensure(*_a, **_kw):
        return "tok-ok"

    async def _fake_observe(bia, stats):
        # Simulate a session that lasted long enough
        stats.ws_connect_ts = time.time() - (_MIN_STABLE_SESSION_SEC + 1)

    async def _fake_sleep(delay):
        nonlocal iteration
        delays_seen.append(delay)
        iteration += 1
        if iteration >= 2:
            raise asyncio.CancelledError

    with patch("services.bia_observer._cfg") as mock_cfg, \
         patch("services.bia_observer.aiohttp") as mock_aio, \
         patch("services.bia_observer.asyncio.sleep", side_effect=_fake_sleep), \
         patch("services.bia_observer._observe_ws", side_effect=_fake_observe):
        mock_cfg.BIA_ENABLED = True
        mock_cfg.BIA_RECONNECT_DELAY_SEC = 5.0
        mock_cfg.BIA_RECONNECT_MAX_DELAY_SEC = 120.0

        mock_http = AsyncMock()
        mock_aio.CookieJar.return_value = MagicMock()
        mock_aio.ClientSession.return_value.__aenter__ = AsyncMock(return_value=mock_http)
        mock_aio.ClientSession.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch.object(BiaSession, "ensure_token", new=_fake_ensure):
            with pytest.raises(asyncio.CancelledError):
                await run_bia_observer()

    # After a stable session, delay should be the base value
    assert delays_seen[0] == 5.0


@pytest.mark.asyncio
async def test_run_observer_lifecycle_reconnecting_after_ws_close():
    """After _observe_ws returns (WS closed), lifecycle must be 'reconnecting'
    during the backoff sleep — never 'connected' with stale stats."""
    import services.bia_observer as obs

    lifecycle_during_sleep: list[str] = []
    snapshot_during_sleep: list[dict] = []

    async def _fake_ensure(*_a, **_kw):
        return "tok"

    async def _fake_observe(bia, stats):
        # Simulate a real session that had data
        stats.ws_connect_ts = time.time() - 5
        stats.last_msg_ts = time.time() - 1
        stats.subscribed = True
        stats.events_seen = 10

    async def _fake_sleep(delay):
        lifecycle_during_sleep.append(obs._lifecycle_state)
        from services.bia_observer import bia_observer_snapshot
        snapshot_during_sleep.append(bia_observer_snapshot(now=time.time()))
        raise asyncio.CancelledError

    with patch("services.bia_observer._cfg") as mock_cfg, \
         patch("services.bia_observer.aiohttp") as mock_aio, \
         patch("services.bia_observer.asyncio.sleep", side_effect=_fake_sleep), \
         patch("services.bia_observer._observe_ws", side_effect=_fake_observe):
        mock_cfg.BIA_ENABLED = True
        mock_cfg.BIA_RECONNECT_DELAY_SEC = 5.0
        mock_cfg.BIA_RECONNECT_MAX_DELAY_SEC = 120.0

        mock_http = AsyncMock()
        mock_aio.CookieJar.return_value = MagicMock()
        mock_aio.ClientSession.return_value.__aenter__ = AsyncMock(return_value=mock_http)
        mock_aio.ClientSession.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch.object(BiaSession, "ensure_token", new=_fake_ensure):
            with pytest.raises(asyncio.CancelledError):
                await run_bia_observer()

    assert lifecycle_during_sleep == ["reconnecting"]
    snap = snapshot_during_sleep[0]
    assert snap["connected"] is False, "stale connected must be overridden"
    assert snap["subscribed"] is False, "stale subscribed must be overridden"
    assert snap["state"] == "reconnecting"
    # Counters are preserved for diagnostics
    assert snap["counters"]["events"] == 10


# ── BiaSession async paths ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_login_success():
    """login() returns token on 200 response."""
    resp_data = {"data": {"session_id": "tok-123", "customer_id": 42, "username": "tester"}}

    mock_resp = AsyncMock()
    mock_resp.status = 200
    mock_resp.json = AsyncMock(return_value=resp_data)
    mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_resp.__aexit__ = AsyncMock(return_value=False)

    mock_http = MagicMock()
    mock_http.post = MagicMock(return_value=mock_resp)

    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_LOGIN = "user"
        mock_cfg.BIA_PASSWORD = "pass"
        mock_cfg.BIA_BASE_URL = "https://test.example.com"
        mock_cfg.BIA_SSL_VERIFY = True
        mock_cfg.BIA_SESSION_MAX_AGE_SEC = 3600.0

        bia = BiaSession(mock_http)
        token = await bia.login()

    assert token == "tok-123"
    assert bia.token == "tok-123"
    assert not bia.is_expired


@pytest.mark.asyncio
async def test_login_http_error():
    """login() returns None on non-200 status."""
    mock_resp = AsyncMock()
    mock_resp.status = 401
    mock_resp.text = AsyncMock(return_value="Unauthorized")
    mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_resp.__aexit__ = AsyncMock(return_value=False)

    mock_http = MagicMock()
    mock_http.post = MagicMock(return_value=mock_resp)

    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_LOGIN = "user"
        mock_cfg.BIA_PASSWORD = "pass"
        mock_cfg.BIA_BASE_URL = "https://test.example.com"
        mock_cfg.BIA_SSL_VERIFY = True
        mock_cfg.BIA_SESSION_MAX_AGE_SEC = 3600.0

        bia = BiaSession(mock_http)
        token = await bia.login()

    assert token is None


@pytest.mark.asyncio
async def test_login_no_credentials():
    """login() returns None when credentials are empty."""
    mock_http = MagicMock()

    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_LOGIN = ""
        mock_cfg.BIA_PASSWORD = ""
        mock_cfg.BIA_SSL_VERIFY = True
        mock_cfg.BIA_SESSION_MAX_AGE_SEC = 3600.0

        bia = BiaSession(mock_http)
        token = await bia.login()

    assert token is None
    # No HTTP call should have been made
    mock_http.post.assert_not_called()


@pytest.mark.asyncio
async def test_login_exception():
    """login() returns None on network exception."""
    mock_http = MagicMock()
    mock_http.post = MagicMock(side_effect=aiohttp.ClientError("fail"))

    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_LOGIN = "user"
        mock_cfg.BIA_PASSWORD = "pass"
        mock_cfg.BIA_BASE_URL = "https://test.example.com"
        mock_cfg.BIA_SSL_VERIFY = True
        mock_cfg.BIA_SESSION_MAX_AGE_SEC = 3600.0

        bia = BiaSession(mock_http)
        token = await bia.login()

    assert token is None


@pytest.mark.asyncio
async def test_verify_success():
    """verify() returns True on 200 response."""
    mock_resp = AsyncMock()
    mock_resp.status = 200
    mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_resp.__aexit__ = AsyncMock(return_value=False)

    mock_http = MagicMock()
    mock_http.get = MagicMock(return_value=mock_resp)

    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_BASE_URL = "https://test.example.com"
        mock_cfg.BIA_SSL_VERIFY = True
        mock_cfg.BIA_SESSION_MAX_AGE_SEC = 3600.0

        bia = BiaSession(mock_http)
        bia._token = "tok-abc"
        bia._login_ts = time.time()
        result = await bia.verify()

    assert result is True


@pytest.mark.asyncio
async def test_verify_no_token():
    """verify() returns False when no token set."""
    mock_http = MagicMock()

    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_SSL_VERIFY = True
        mock_cfg.BIA_SESSION_MAX_AGE_SEC = 3600.0

        bia = BiaSession(mock_http)
        result = await bia.verify()

    assert result is False


@pytest.mark.asyncio
async def test_verify_http_failure():
    """verify() returns False on non-200."""
    mock_resp = AsyncMock()
    mock_resp.status = 401
    mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_resp.__aexit__ = AsyncMock(return_value=False)

    mock_http = MagicMock()
    mock_http.get = MagicMock(return_value=mock_resp)

    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_BASE_URL = "https://test.example.com"
        mock_cfg.BIA_SSL_VERIFY = True
        mock_cfg.BIA_SESSION_MAX_AGE_SEC = 3600.0

        bia = BiaSession(mock_http)
        bia._token = "tok-abc"
        result = await bia.verify()

    assert result is False


@pytest.mark.asyncio
async def test_verify_exception():
    """verify() returns False on network error."""
    mock_http = MagicMock()
    mock_http.get = MagicMock(side_effect=aiohttp.ClientError("fail"))

    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_BASE_URL = "https://test.example.com"
        mock_cfg.BIA_SSL_VERIFY = True
        mock_cfg.BIA_SESSION_MAX_AGE_SEC = 3600.0

        bia = BiaSession(mock_http)
        bia._token = "tok-abc"
        result = await bia.verify()

    assert result is False


@pytest.mark.asyncio
async def test_ensure_token_returns_cached():
    """ensure_token() returns cached token when not expired."""
    mock_http = MagicMock()

    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_SSL_VERIFY = True
        mock_cfg.BIA_SESSION_MAX_AGE_SEC = 3600.0

        bia = BiaSession(mock_http)
        bia._token = "cached-tok"
        bia._login_ts = time.time()
        result = await bia.ensure_token()

    assert result == "cached-tok"


@pytest.mark.asyncio
async def test_ensure_token_relogins_when_expired():
    """ensure_token() calls login() when token is expired."""
    mock_resp = AsyncMock()
    mock_resp.status = 200
    mock_resp.json = AsyncMock(return_value={"data": {"session_id": "new-tok"}})
    mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_resp.__aexit__ = AsyncMock(return_value=False)

    mock_http = MagicMock()
    mock_http.post = MagicMock(return_value=mock_resp)

    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_LOGIN = "user"
        mock_cfg.BIA_PASSWORD = "pass"
        mock_cfg.BIA_BASE_URL = "https://test.example.com"
        mock_cfg.BIA_SSL_VERIFY = True
        mock_cfg.BIA_SESSION_MAX_AGE_SEC = 3600.0

        bia = BiaSession(mock_http)
        # Token is expired (no token set)
        result = await bia.ensure_token()

    assert result == "new-tok"


# ── _make_ssl_ctx ───────────────────────────────────────────────────────────


def test_make_ssl_ctx_verify_disabled():
    """Returns an SSL context with verification disabled."""
    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_SSL_VERIFY = False
        ctx = _make_ssl_ctx()
    assert ctx is not None
    import ssl
    assert ctx.check_hostname is False
    assert ctx.verify_mode == ssl.CERT_NONE


def test_make_ssl_ctx_verify_enabled():
    """Returns None when SSL verification is enabled."""
    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_SSL_VERIFY = True
        ctx = _make_ssl_ctx()
    assert ctx is None


# ── BiaSession.http property ────────────────────────────────────────────────


def test_session_http_property():
    """The public http property returns the underlying session."""
    mock_http = MagicMock()
    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_SSL_VERIFY = True
        bia = BiaSession(mock_http)
    assert bia.http is mock_http


# ── runtime_snapshot / bia_observer_snapshot ─────────────────────────────────


def test_runtime_snapshot_default_stats():
    """Fresh BiaObserverStats produces a complete but zeroed snapshot."""
    s = BiaObserverStats()
    snap = s.runtime_snapshot(now=100.0)
    assert snap["connected"] is False
    assert snap["ws_uptime_sec"] is None
    assert snap["last_msg_age_sec"] is None
    assert snap["subscribed"] is False
    assert snap["counters"]["events"] == 0
    assert snap["errors"] == 0
    assert snap["sports_seen"] == []
    assert snap["discovered_events"] == 0
    assert snap["subscribed_events"] == 0
    assert snap["watch_event_subscribed"] == 0
    assert snap["watch_event_pending"] == 0
    assert snap["match_cache_size"] == 0
    assert snap["miss_cache_size"] == 0


def test_runtime_snapshot_with_active_session():
    """After WS connect and messages, snapshot reflects live values."""
    s = BiaObserverStats()
    s.ws_connect_ts = 50.0
    s.last_msg_ts = 98.0
    s.events_seen = 10
    s.offers_count = 5
    s.pmm_count = 2
    s.info_count = 1
    s.other_count = 3
    s.errors = 1
    s.subscribed = True
    s.sports_seen = {"fb", "tennis"}
    s.discovered_events = [[1, "fb", "x"], [2, "tennis", "y"]]
    s._watch_hcaps_keys = {(1, "fb", "x"), (2, "tennis", "y")}
    s._watch_event_keys = {(1, "fb", "x")}
    s._watch_event_pending = [[3, "fb", "z"]]
    s._matched_event_cache = {("1", "fb", "x"): (101, False)}
    s._missed_event_cache = {("2", "tennis", "y"): 99.0}

    snap = s.runtime_snapshot(now=100.0)
    assert snap["connected"] is True
    assert snap["ws_uptime_sec"] == 50.0
    assert snap["last_msg_age_sec"] == 2.0
    assert snap["subscribed"] is True
    assert snap["counters"]["events"] == 10
    assert snap["counters"]["offers"] == 5
    assert snap["counters"]["pmm"] == 2
    assert snap["counters"]["info"] == 1
    assert snap["counters"]["other"] == 3
    assert snap["errors"] == 1
    assert snap["sports_seen"] == ["fb", "tennis"]
    assert snap["discovered_events"] == 2
    assert snap["subscribed_events"] == 2
    assert snap["watch_event_subscribed"] == 1
    assert snap["watch_event_pending"] == 1
    assert snap["match_cache_size"] == 1
    assert snap["miss_cache_size"] == 1


def test_bia_observer_snapshot_when_disabled():
    """Module-level snapshot returns enabled=False when BIA is off."""
    import services.bia_observer as obs

    orig_enabled = obs._cfg.BIA_ENABLED
    orig_stats = obs._current_stats
    orig_running = obs._observer_running
    orig_lc = obs._lifecycle_state
    try:
        obs._cfg.BIA_ENABLED = False
        obs._current_stats = None
        obs._observer_running = False
        obs._lifecycle_state = "idle"

        from services.bia_observer import bia_observer_snapshot
        snap = bia_observer_snapshot(now=100.0)
        assert snap["enabled"] is False
        assert snap["running"] is False
        assert snap["phase"] == "observer-only"
        assert snap["state"] == "idle"
        assert snap["connected"] is False
    finally:
        obs._cfg.BIA_ENABLED = orig_enabled
        obs._current_stats = orig_stats
        obs._observer_running = orig_running
        obs._lifecycle_state = orig_lc


def test_bia_observer_snapshot_when_running():
    """Module-level snapshot reflects live stats when observer is connected."""
    import services.bia_observer as obs

    orig_enabled = obs._cfg.BIA_ENABLED
    orig_stats = obs._current_stats
    orig_running = obs._observer_running
    orig_lc = obs._lifecycle_state
    try:
        obs._cfg.BIA_ENABLED = True
        obs._observer_running = True
        obs._lifecycle_state = "connected"
        s = BiaObserverStats()
        s.ws_connect_ts = 60.0
        s.last_msg_ts = 99.0
        s.events_seen = 7
        s.subscribed = True
        obs._current_stats = s

        from services.bia_observer import bia_observer_snapshot
        snap = bia_observer_snapshot(now=100.0)
        assert snap["enabled"] is True
        assert snap["running"] is True
        assert snap["state"] == "connected"
        assert snap["connected"] is True
        assert snap["subscribed"] is True
        assert snap["counters"]["events"] == 7
        assert snap["ws_uptime_sec"] == 40.0
        assert snap["last_msg_age_sec"] == 1.0
    finally:
        obs._cfg.BIA_ENABLED = orig_enabled
        obs._current_stats = orig_stats
        obs._observer_running = orig_running
        obs._lifecycle_state = orig_lc


def test_bia_observer_snapshot_stale_during_reconnect():
    """During reconnect/backoff, snapshot must NOT report connected/subscribed
    even when _current_stats still carries stale timestamps from a previous
    WS session — this is the core staleness fix."""
    import services.bia_observer as obs

    orig = (obs._cfg.BIA_ENABLED, obs._current_stats,
            obs._observer_running, obs._lifecycle_state)
    try:
        obs._cfg.BIA_ENABLED = True
        obs._observer_running = True
        obs._lifecycle_state = "reconnecting"
        # Simulate stale stats from a recently-closed WS session
        s = BiaObserverStats()
        s.ws_connect_ts = 50.0
        s.last_msg_ts = 95.0
        s.subscribed = True
        s.events_seen = 42
        obs._current_stats = s

        from services.bia_observer import bia_observer_snapshot
        snap = bia_observer_snapshot(now=100.0)
        assert snap["state"] == "reconnecting"
        assert snap["connected"] is False, "must NOT report connected during backoff"
        assert snap["subscribed"] is False, "must NOT report subscribed during backoff"
        # Counters are still visible (useful for diagnostics)
        assert snap["counters"]["events"] == 42
    finally:
        obs._cfg.BIA_ENABLED, obs._current_stats, \
            obs._observer_running, obs._lifecycle_state = orig


def test_bia_observer_snapshot_stale_during_stopped():
    """After observer stops, snapshot must report stopped/disconnected."""
    import services.bia_observer as obs

    orig = (obs._cfg.BIA_ENABLED, obs._current_stats,
            obs._observer_running, obs._lifecycle_state)
    try:
        obs._cfg.BIA_ENABLED = True
        obs._observer_running = False
        obs._lifecycle_state = "stopped"
        s = BiaObserverStats()
        s.ws_connect_ts = 10.0
        s.last_msg_ts = 80.0
        s.subscribed = True
        obs._current_stats = s

        from services.bia_observer import bia_observer_snapshot
        snap = bia_observer_snapshot(now=100.0)
        assert snap["state"] == "stopped"
        assert snap["running"] is False
        assert snap["connected"] is False
        assert snap["subscribed"] is False
    finally:
        obs._cfg.BIA_ENABLED, obs._current_stats, \
            obs._observer_running, obs._lifecycle_state = orig


def test_bia_observer_snapshot_during_connecting():
    """While connecting (login phase), snapshot shows connecting/disconnected."""
    import services.bia_observer as obs

    orig = (obs._cfg.BIA_ENABLED, obs._current_stats,
            obs._observer_running, obs._lifecycle_state)
    try:
        obs._cfg.BIA_ENABLED = True
        obs._observer_running = True
        obs._lifecycle_state = "connecting"
        obs._current_stats = None

        from services.bia_observer import bia_observer_snapshot
        snap = bia_observer_snapshot(now=100.0)
        assert snap["state"] == "connecting"
        assert snap["connected"] is False
        assert snap["subscribed"] is False
    finally:
        obs._cfg.BIA_ENABLED, obs._current_stats, \
            obs._observer_running, obs._lifecycle_state = orig


def test_lookup_bia_event_for_pid_respects_period_and_swapped(monkeypatch):
    import services.bia_observer as obs
    from state import state

    orig_stats = obs._current_stats
    orig_events = state.events_data
    try:
        stats = BiaObserverStats()
        stats._event_registry[("3", "fb_ht", "2026-04-05,95,47")] = {
            "competition_name": "England Premier League",
            "home": "Arsenal",
            "away": "Chelsea",
        }
        obs._current_stats = stats
        monkeypatch.setattr(
            state,
            "events_data",
            {
                101: {
                    "Home": "Chelsea",
                    "Away": "Arsenal",
                    "SportName": "Soccer",
                }
            },
            raising=False,
        )

        result = lookup_bia_event_for_pid(101, period=1)

        assert result is not None
        assert result["sport_code"] == "fb_ht"
        assert result["period"] == 1
        assert result["event_key"] == "2026-04-05,95,47"
        assert result["swapped"] is True
        assert result["watch_hcaps_subscribed"] is False
        assert result["watch_event_subscribed"] is False
        assert result["watch_event_pending"] is False
    finally:
        obs._current_stats = orig_stats
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_lookup_bia_event_for_pid_matches_alias_variants(monkeypatch):
    import services.bia_observer as obs
    from state import state

    orig_stats = obs._current_stats
    orig_events = state.events_data
    try:
        stats = BiaObserverStats()
        stats._event_registry[("3", "fb", "2026-04-10,95,47")] = {
            "competition_name": "England Premier League",
            "home": "West Ham",
            "away": "Wolverhampton",
        }
        obs._current_stats = stats
        monkeypatch.setattr(
            state,
            "events_data",
            {
                101: {
                    "Home": "West Ham United",
                    "Away": "Wolverhampton Wanderers",
                    "SportName": "Soccer",
                }
            },
            raising=False,
        )

        result = lookup_bia_event_for_pid(101, period=0)

        assert result is not None
        assert result["sport_code"] == "fb"
        assert result["period"] == 0
        assert result["event_key"] == "2026-04-10,95,47"
        assert result["swapped"] is False
    finally:
        obs._current_stats = orig_stats
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_lookup_bia_event_for_pid_rejects_globally_ambiguous_duplicate_fixture(monkeypatch):
    """One BIA ref must not independently prove two identical parser fixtures."""
    import services.bia_observer as obs
    from state import state

    stats = BiaObserverStats()
    stats._event_registry[("3", "fb", "2026-08-01,95,47")] = {
        "competition_name": "England Premier League",
        "home": "Arsenal",
        "away": "Chelsea",
    }
    monkeypatch.setattr(state, "events_data", {
        101: {
            "Home": "Arsenal", "Away": "Chelsea", "SportName": "Soccer",
            "LeagueName": "England Premier League",
        },
        202: {
            "Home": "Arsenal", "Away": "Chelsea", "SportName": "Soccer",
            "LeagueName": "England Premier League",
        },
    }, raising=False)

    assert lookup_bia_event_for_pid(101, period=0, stats=stats) is None
    assert lookup_bia_event_for_pid(202, period=0, stats=stats) is None


def test_lookup_bia_event_for_pid_uses_structural_start_to_resolve_duplicate(monkeypatch):
    """Start time may break a name/league tie; odds may not."""
    from state import state

    stats = BiaObserverStats()
    stats._event_registry[("3", "fb", "2026-08-01,95,47")] = {
        "competition_name": "England Premier League",
        "home": "Arsenal",
        "away": "Chelsea",
        "start_ts": "2026-08-01T12:00:00Z",
    }
    monkeypatch.setattr(state, "events_data", {
        101: {
            "Home": "Arsenal", "Away": "Chelsea", "SportName": "Soccer",
            "LeagueName": "England Premier League", "start_time_ms": 1785585600000,
        },
        202: {
            "Home": "Arsenal", "Away": "Chelsea", "SportName": "Soccer",
            "LeagueName": "England Premier League", "start_time_ms": 1785607200000,
        },
    }, raising=False)

    assert lookup_bia_event_for_pid(101, period=0, stats=stats)["event_id"] == 101
    assert lookup_bia_event_for_pid(202, period=0, stats=stats) is None


def test_events_matching_bia_start_snapshots_concurrently_mutated_parser_state(monkeypatch):
    """A parser update during lookup must not raise or join the in-flight scan."""
    import services.bia_observer as obs

    events = {
        101: {"start_time_ms": 1785585600000},
        202: {"start_time_ms": 1785585660000},
    }
    original_parser = obs._structural_timestamp_ms

    def mutating_parser(value):
        if isinstance(value, int) and 303 not in events:
            events[303] = {"start_time_ms": 1785585720000}
        return original_parser(value)

    monkeypatch.setattr(obs, "_structural_timestamp_ms", mutating_parser)

    matched, constrained = obs._events_matching_bia_start(
        events, "2026-08-01T12:00:00Z",
    )

    assert constrained is True
    assert set(matched) == {101, 202}
    assert 303 in events


def test_search_bia_registry_snapshots_concurrently_mutated_registry():
    """HTTP registry search must tolerate the observer adding an event."""
    import services.bia_observer as obs

    stats = BiaObserverStats()

    class MutatingEntry(dict):
        def get(self, key, default=None):
            stats._event_registry[("2", "fb", "new-event")] = {
                "home": "Later Home", "away": "Later Away",
            }
            return super().get(key, default)

    stats._event_registry[("1", "fb", "original-event")] = MutatingEntry({
        "home": "Arsenal", "away": "Chelsea", "competition_name": "Premier League",
    })
    original_stats = obs._current_stats
    obs._current_stats = stats
    try:
        results = obs.search_bia_registry("arsenal")
    finally:
        obs._current_stats = original_stats

    assert [result["event_key"] for result in results] == ["original-event"]
    assert ("2", "fb", "new-event") in stats._event_registry


def test_lookup_bia_event_for_pid_does_not_use_fuzzy_name_similarity(monkeypatch):
    """Proof lookup accepts deterministic aliases, never approximate typos."""
    from state import state

    stats = BiaObserverStats()
    stats._event_registry[("3", "fb", "event")] = {
        "competition_name": "England Premier League",
        "home": "Arsenel",
        "away": "Chelsea",
    }
    monkeypatch.setattr(state, "events_data", {
        101: {
            "Home": "Arsenal", "Away": "Chelsea", "SportName": "Soccer",
            "LeagueName": "England Premier League",
        },
    }, raising=False)

    assert lookup_bia_event_for_pid(101, period=0, stats=stats) is None


def test_lookup_bia_event_for_pid_prefers_root_period_match(monkeypatch):
    import services.bia_observer as obs
    from state import state

    orig_stats = obs._current_stats
    orig_events = state.events_data
    try:
        stats = BiaObserverStats()
        stats._event_registry[("28", "fb_htft", "2026-04-08,187,173")] = {
            "competition_name": "UEFA Champions League",
            "home": "FC Barcelona",
            "away": "Atletico Madrid",
        }
        stats._event_registry[("28", "fb", "2026-04-08,187,173")] = {
            "competition_name": "UEFA Champions League",
            "home": "FC Barcelona",
            "away": "Atletico Madrid",
        }
        obs._current_stats = stats
        monkeypatch.setattr(
            state,
            "events_data",
            {
                101: {
                    "Home": "FC Barcelona",
                    "Away": "Atletico Madrid",
                    "SportName": "Soccer",
                }
            },
            raising=False,
        )

        result = lookup_bia_event_for_pid(101, period=0)

        assert result is not None
        assert result["sport_code"] == "fb"
        assert result["period"] == 0
        assert result["event_key"] == "2026-04-08,187,173"
        assert result["watch_hcaps_subscribed"] is False
        assert result["watch_event_subscribed"] is False
        assert result["watch_event_pending"] is False
    finally:
        obs._current_stats = orig_stats
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_lookup_bia_event_for_pid_reports_subscription_status_with_int_comp_id(monkeypatch):
    import services.bia_observer as obs
    from state import state

    orig_stats = obs._current_stats
    orig_events = state.events_data
    try:
        stats = BiaObserverStats()
        key = (29, "fb", "2026-04-09,234,2")
        stats._event_registry[key] = {
            "competition_name": "UEFA Europa League",
            "home": "Bologna",
            "away": "Aston Villa",
        }
        stats._watch_hcaps_keys.add(key)
        stats._watch_event_pending_keys.add(key)
        obs._current_stats = stats
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1626579734: {
                    "Home": "Bologna",
                    "Away": "Aston Villa",
                    "SportName": "Soccer",
                }
            },
            raising=False,
        )

        result = lookup_bia_event_for_pid(1626579734, period=0)

        assert result is not None
        assert result["watch_hcaps_subscribed"] is True
        assert result["watch_event_subscribed"] is False
        assert result["watch_event_pending"] is True
    finally:
        obs._current_stats = orig_stats
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_lookup_bia_selection_for_pid_returns_exact_esports_map_proof(monkeypatch):
    from state import state

    stats = BiaObserverStats()
    stats._event_registry[("42", "esports", "2026-07-29,10087270,10069346")] = {
        "competition_name": "StarSeries SA Qualifier",
        "home": "MiBR",
        "away": "Fluxo W7M",
    }
    stats._offer_proofs.observe(
        competition_id="42",
        sport_code="esports",
        event_key="2026-07-29,10087270,10069346",
        markets={"time_ml,tmap,1": [None, [["h", 1.53], ["a", 2.84]]]},
    )
    monkeypatch.setattr(state, "events_data", {
        101: {
            "Home": "MiBR", "Away": "Fluxo W7M", "SportName": "Esports",
        },
    }, raising=False)

    with patch(
        "services.bia_event_matcher.match_bia_event_exact",
        return_value=(101, False),
    ):
        result = lookup_bia_selection_for_pid(
            101,
            period=0,
            selection={
                "bet_type": 1, "team_select": 1, "handicap": 0,
                "map_number": 1, "esports_unit": "rounds",
            },
            stats=stats,
        )

    assert result["found"] is True
    assert result["offer_proof"]["raw_offer_group"] == "time_ml,tmap,1"
    assert result["offer_proof"]["bia_bet_type"] == "for,tmap,1,ml,a"


def test_lookup_bia_selection_for_pid_rejects_partially_proven_duplicate(monkeypatch):
    from state import state

    stats = BiaObserverStats()
    keys = [
        ("42", "esports", "event-a"),
        ("43", "esports", "event-b"),
    ]
    for comp_id, sport, event_key in keys:
        stats._event_registry[(comp_id, sport, event_key)] = {
            "competition_name": "StarSeries SA Qualifier",
            "home": "MiBR",
            "away": "Fluxo W7M",
        }
    stats._offer_proofs.observe(
        competition_id="42",
        sport_code="esports",
        event_key="event-a",
        markets={"time_win,tmap,1,ml": [None, [["a", 2.84], ["h", 1.39]]]},
    )
    monkeypatch.setattr(state, "events_data", {
        101: {"Home": "MiBR", "Away": "Fluxo W7M", "SportName": "Esports"},
    }, raising=False)

    with patch(
        "services.bia_event_matcher.match_bia_event_exact",
        return_value=(101, False),
    ):
        result = lookup_bia_selection_for_pid(
            101,
            period=0,
            selection={
                "bet_type": 1, "team_select": 1, "handicap": 0,
                "map_number": 1, "esports_unit": "rounds",
            },
            stats=stats,
        )

    assert result["found"] is False
    assert result["error_code"] == "BIA_EVENT_SELECTION_INCOMPLETE"
    assert result["proven_candidate_count"] == 1
    assert result["incomplete_candidate_count"] == 1


@pytest.mark.asyncio
async def test_exact_refresh_requires_fresh_selected_outcome(monkeypatch):
    import services.bia_observer as obs
    from state import state

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    event_key = "2026-07-28,10055772,10055781"
    stats.discovered_events.append([10008160, "esports", event_key])
    stats._event_registry[("10008160", "esports", event_key)] = {
        "competition_name": "CS2 - StarLadder StarSeries",
        "home": "MiBR Academy",
        "away": "Fluxo",
    }
    monkeypatch.setattr(state, "events_data", {
        1632983548: {
            "Home": "MiBR", "Away": "Fluxo W7M", "SportName": "ESports",
        },
    }, raising=False)
    selection = {
        "bet_type": 1, "team_select": 1, "handicap": 0,
        "map_number": 1, "esports_unit": "rounds",
    }
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    request = obs._enqueue_exact_refresh(
        1632983548, period=0, selection=selection, wait_sec=1.0,
    )
    assert request is not None
    ws = SimpleNamespace(send_json=AsyncMock())

    try:
        with patch(
            "services.bia_event_matcher.match_bia_event_exact",
            return_value=(1632983548, False),
        ):
            await obs._drain_exact_refresh_requests(ws, stats)
            # An unrelated rich event update cannot confirm this selection.
            obs._complete_exact_refreshes_from_offer(
                stats, [10008160, "esports", event_key],
            )
            request.candidate_stable_since -= obs._EXACT_REFRESH_SETTLE_SEC + 0.01
            request.next_match_at = 0.0
            await obs._drain_exact_refresh_requests(ws, stats)
            assert not request.done.is_set()

            sent_at = request.sent_wall_at[("10008160", "esports", event_key)]
            stats._offer_proofs.observe(
                competition_id=10008160,
                sport_code="esports",
                event_key=event_key,
                markets={
                    "time_win,tmap,1,ml": [None, [["a", 2.84], ["h", 1.393]]],
                },
                observed_at=sent_at + 0.01,
            )
            request.next_match_at = 0.0
            await obs._drain_exact_refresh_requests(ws, stats)

        sent = [call.args[0] for call in ws.send_json.await_args_list]
        assert ["watch_event", [10008160, "esports", event_key]] in sent
        assert ["watch_hcaps", [[10008160, "esports", event_key]]] in sent
        assert request.done.is_set()
        assert request.result["found"] is True
        assert request.result["offer_proof"]["raw_offer_group"] == "time_win,tmap,1,ml"
        assert request.result["offer_proof"]["bia_bet_type"] == "for,tmap,1,ml,a"
    finally:
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.asyncio
async def test_exact_refresh_includes_late_second_candidate(monkeypatch):
    import services.bia_observer as obs
    from state import state

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    first_key = ("42", "esports", "event-a")
    second_key = ("43", "esports", "event-b")
    stats.discovered_events.append([42, "esports", "event-a"])
    stats._event_registry[first_key] = {
        "competition_name": "StarSeries", "home": "MiBR", "away": "Fluxo W7M",
    }
    monkeypatch.setattr(state, "events_data", {
        101: {"Home": "MiBR", "Away": "Fluxo W7M", "SportName": "Esports"},
    }, raising=False)
    selection = {
        "bet_type": 1, "team_select": 1, "handicap": 0,
        "map_number": 1, "esports_unit": "rounds",
    }
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    request = obs._enqueue_exact_refresh(101, period=0, selection=selection, wait_sec=1.0)
    assert request is not None
    ws = SimpleNamespace(send_json=AsyncMock())

    try:
        with patch(
            "services.bia_event_matcher.match_bia_event_exact",
            return_value=(101, False),
        ):
            await obs._drain_exact_refresh_requests(ws, stats)
            first_sent = request.sent_wall_at[first_key]
            stats._offer_proofs.observe(
                competition_id="42", sport_code="esports", event_key="event-a",
                markets={"time_win,tmap,1,ml": [None, [["a", 2.8]]]},
                observed_at=first_sent + 0.01,
            )

            # A second matching raw event arrives before the settle window.
            stats.discovered_events.append([43, "esports", "event-b"])
            stats._event_registry[second_key] = {
                "competition_name": "StarSeries", "home": "MiBR", "away": "Fluxo W7M",
            }
            stats._event_registry_revision += 1
            stats._event_registry_changed_at = 0.0
            request.next_match_at = 0.0
            await obs._drain_exact_refresh_requests(ws, stats)
            second_sent = request.sent_wall_at[second_key]
            stats._offer_proofs.observe(
                competition_id="43", sport_code="esports", event_key="event-b",
                markets={"time_win,tmap,1,ml": [None, [["a", 2.8]]]},
                observed_at=second_sent + 0.01,
            )
            request.candidate_stable_since -= obs._EXACT_REFRESH_SETTLE_SEC + 0.01
            request.next_match_at = 0.0
            await obs._drain_exact_refresh_requests(ws, stats)

        sent = [call.args[0] for call in ws.send_json.await_args_list]
        assert ["watch_event", [42, "esports", "event-a"]] in sent
        assert ["watch_event", [43, "esports", "event-b"]] in sent
        assert request.done.is_set()
        assert request.result["found"] is False
        assert request.result["error_code"] == "BIA_EVENT_SELECTION_AMBIGUOUS"
    finally:
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.asyncio
async def test_exact_refresh_groups_selections_into_one_transport_refresh(monkeypatch):
    import services.bia_observer as obs

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    event_ref = {
        "event_id": 101, "period": 0, "comp_id": "42",
        "sport_code": "esports", "event_key": "event-a", "swapped": False,
    }
    stats.discovered_events.append([42, "esports", "event-a"])
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    first = obs._enqueue_exact_refresh(
        101, period=0,
        selection={"bet_type": 1, "team_select": 0, "map_number": 1, "esports_unit": "rounds"},
        wait_sec=1.0,
    )
    second = obs._enqueue_exact_refresh(
        101, period=0,
        selection={"bet_type": 1, "team_select": 1, "map_number": 1, "esports_unit": "rounds"},
        wait_sec=1.0,
    )
    assert first is not None and second is not None
    ws = SimpleNamespace(send_json=AsyncMock())

    try:
        with patch(
            "services.bia_observer._matching_bia_event_refs_for_pid",
            return_value=[event_ref],
        ) as matcher:
            await obs._drain_exact_refresh_requests(ws, stats)

        matcher.assert_called_once_with(101, period=0, stats=stats)
        sent = [call.args[0] for call in ws.send_json.await_args_list]
        assert sent.count(["watch_event", [42, "esports", "event-a"]]) == 1
        assert sent.count(["watch_hcaps", [[42, "esports", "event-a"]]]) == 1
    finally:
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


def test_exact_refresh_is_not_enqueued_while_observer_disconnected():
    import services.bia_observer as obs

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
    try:
        obs._current_stats = BiaObserverStats()
        obs._lifecycle_state = "reconnecting"
        request = obs._enqueue_exact_refresh(
            101,
            period=0,
            selection={"bet_type": 1, "team_select": 0},
            wait_sec=1.0,
        )
        assert request is None
        assert obs._exact_refresh_requests == {}
    finally:
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle


@pytest.mark.asyncio
async def test_run_observer_sets_running_flag():
    """run_bia_observer sets _observer_running=True while running, False on exit.
    Also verifies lifecycle state transitions: connecting → (observe) → stopped."""
    import services.bia_observer as obs

    running_states: list[bool] = []
    lifecycle_states: list[str] = []

    async def _fake_ensure(*_a, **_kw):
        lifecycle_states.append(obs._lifecycle_state)
        return "tok"

    async def _fake_observe(bia, stats):
        running_states.append(obs._observer_running)
        lifecycle_states.append(obs._lifecycle_state)
        raise asyncio.CancelledError  # break out

    with patch("services.bia_observer._cfg") as mock_cfg, \
         patch("services.bia_observer.aiohttp") as mock_aio, \
         patch("services.bia_observer._observe_ws", side_effect=_fake_observe):
        mock_cfg.BIA_ENABLED = True
        mock_cfg.BIA_RECONNECT_DELAY_SEC = 1.0
        mock_cfg.BIA_RECONNECT_MAX_DELAY_SEC = 10.0

        mock_http = AsyncMock()
        mock_aio.CookieJar.return_value = MagicMock()
        mock_aio.ClientSession.return_value.__aenter__ = AsyncMock(return_value=mock_http)
        mock_aio.ClientSession.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch.object(BiaSession, "ensure_token", new=_fake_ensure):
            with pytest.raises(asyncio.CancelledError):
                await run_bia_observer()

    assert running_states == [True]
    assert obs._observer_running is False
    assert obs._lifecycle_state == "stopped"
    # ensure_token sees "connecting", _observe_ws sees "connecting" (WS not yet opened)
    assert lifecycle_states[0] == "connecting"
    assert lifecycle_states[1] == "connecting"


@pytest.mark.asyncio
async def test_run_observer_exposes_current_stats():
    """run_bia_observer assigns _current_stats before calling _observe_ws."""
    import services.bia_observer as obs

    captured_stats: list = []

    async def _fake_ensure(*_a, **_kw):
        return "tok"

    async def _fake_observe(bia, stats):
        captured_stats.append(obs._current_stats)
        assert obs._current_stats is stats
        raise asyncio.CancelledError

    with patch("services.bia_observer._cfg") as mock_cfg, \
         patch("services.bia_observer.aiohttp") as mock_aio, \
         patch("services.bia_observer._observe_ws", side_effect=_fake_observe):
        mock_cfg.BIA_ENABLED = True
        mock_cfg.BIA_RECONNECT_DELAY_SEC = 1.0
        mock_cfg.BIA_RECONNECT_MAX_DELAY_SEC = 10.0

        mock_http = AsyncMock()
        mock_aio.CookieJar.return_value = MagicMock()
        mock_aio.ClientSession.return_value.__aenter__ = AsyncMock(return_value=mock_http)
        mock_aio.ClientSession.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch.object(BiaSession, "ensure_token", new=_fake_ensure):
            with pytest.raises(asyncio.CancelledError):
                await run_bia_observer()

    assert len(captured_stats) == 1
    assert captured_stats[0] is not None


# ── competition_id registry collision ───────────────────────────────────────


@pytest.mark.asyncio
async def test_event_registry_uses_comp_id_in_key():
    """Two events with the same sport+event_key but different competition_ids
    must NOT overwrite each other in the _event_registry."""
    event1 = json.dumps(["event", ["fb", "2026-04-05,1,1"], {
        "home": "TeamA", "away": "TeamB",
        "competition_id": 10, "competition_name": "Premier League",
        "start_ts": "2026-04-05T12:00:00Z",
    }])
    event2 = json.dumps(["event", ["fb", "2026-04-05,1,1"], {
        "home": "TeamX", "away": "TeamY",
        "competition_id": 20, "competition_name": "FA Cup",
    }])

    ws = _make_fake_ws([_text_msg(event1), _text_msg(event2), _close_msg()])
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(ws))
    bia = BiaSession(http)
    bia._token = "test-tok"
    bia._login_ts = time.time()

    stats = BiaObserverStats()
    await _observe_ws(bia, stats)

    assert stats.events_seen == 2
    # Both events coexist in the registry (different comp_id)
    assert ("10", "fb", "2026-04-05,1,1") in stats._event_registry
    assert ("20", "fb", "2026-04-05,1,1") in stats._event_registry
    # Metadata is correct for each
    assert stats._event_registry[("10", "fb", "2026-04-05,1,1")]["home"] == "TeamA"
    assert stats._event_registry[("10", "fb", "2026-04-05,1,1")]["start_ts"] == "2026-04-05T12:00:00Z"
    assert stats._event_registry[("20", "fb", "2026-04-05,1,1")]["home"] == "TeamX"
