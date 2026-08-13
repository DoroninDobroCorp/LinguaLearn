from __future__ import annotations

from typing import Any, Dict

import pytest

from parsing.sport_parsers import parse_esports_events, parse_tennis_events
from state import state
from utils.event_store import build_games_from_raw


def _tennis_sets_event(
    *,
    event_id: int,
    parent_id: int,
    source_seq: int,
    touch_seq: int,
    home_ml: float,
    away_ml: float,
    total_over: float,
    total_under: float,
    hcap_home: float,
    hcap_away: float,
    line_seed: int,
    event_type: str = "Sets",
) -> Dict[str, Any]:
    return {
        "sport_id": 33,
        "sport_name": "Tennis",
        "league_name": "ATP Test",
        "event_id": event_id,
        "parent_id": parent_id,
        "home_name": "Alpha",
        "away_name": "Beta",
        "home_score": 0.0,
        "away_score": 0.0,
        "has_score": False,
        "event_type": event_type,
        "start_time_ms": 1773928800000,
        "is_extra": False,
        "_source_seq": source_seq,
        "_touch_seq": touch_seq,
        "_market_touch_seq": {
            "0:Win1x2": touch_seq,
            "0:SetsHandicap": touch_seq,
            "0:SetsTotal": touch_seq,
        },
        "odds_block": {
            "0": [
                [[-1.5, 1.5, "1.5", str(hcap_home), str(hcap_away), 0, 1, line_seed + 1, 0, 550.0, 1]],
                [["2.5", 2.5, str(total_over), str(total_under), line_seed + 2, 0, 550.0, 1]],
                [str(away_ml), str(home_ml), None, line_seed + 3, 0, 2700.0, 1],
                [],
                [],
                0,
                0,
                [0, 0],
                0,
                None,
                None,
                1,
            ]
        },
    }


def _esports_kills_event(
    *,
    event_id: int,
    parent_id: int,
    source_seq: int,
    touch_seq: int,
    home_ml: float,
    away_ml: float,
    total_over: float,
    total_under: float,
    hcap_home: float,
    hcap_away: float,
    line_seed: int,
) -> Dict[str, Any]:
    return {
        "sport_id": 12,
        "sport_name": "ESports",
        "league_name": "CS2 Test",
        "event_id": event_id,
        "parent_id": parent_id,
        "home_name": "Alpha Kills",
        "away_name": "Beta Kills",
        "home_score": 0.0,
        "away_score": 0.0,
        "has_score": False,
        "event_type": "",
        "start_time_ms": 1773928800000,
        "is_extra": False,
        "_source_seq": source_seq,
        "_touch_seq": touch_seq,
        "odds_block": {
            "0": [
                [[-1.5, str(hcap_home), str(hcap_away), line_seed + 1]],
                [["12.5", 12.5, str(total_over), str(total_under), line_seed + 2, 0, 550.0, 1]],
                [str(away_ml), str(home_ml), None, line_seed + 3, 0, 2700.0, 1],
                [],
                [],
                0,
                0,
                [0, 0],
                0,
                None,
                None,
                1,
            ]
        },
    }


def _modern_raw_event(
    *,
    event_id: int,
    parent_id: int,
    home_name: str,
    away_name: str,
    odds_block: Dict[str, Any],
    event_type: str = "",
) -> list[Any]:
    event = [None] * 29
    event[0] = event_id
    event[1] = home_name
    event[2] = away_name
    event[4] = 1773928800000
    event[8] = odds_block
    event[9] = [0, 0]
    event[27] = event_type
    event[28] = parent_id
    return event


@pytest.fixture
def parser_state_snapshot():
    snapshot = dict(state.__dict__)
    try:
        state.raw_events = {}
        state.events_data = {}
        state._raw_touch_seq = 0
        yield
    finally:
        state.__dict__.clear()
        state.__dict__.update(snapshot)


def test_tennis_grouped_markets_keep_fresher_child_even_if_stale_parent_is_later():
    child = _tennis_sets_event(
        event_id=1626429787,
        parent_id=1626413699,
        source_seq=0,
        touch_seq=20,
        home_ml=1.61,
        away_ml=2.38,
        total_over=1.88,
        total_under=1.96,
        hcap_home=1.83,
        hcap_away=2.01,
        line_seed=3508191300,
    )
    parent = _tennis_sets_event(
        event_id=1626413699,
        parent_id=1626413699,
        source_seq=1,
        touch_seq=10,
        home_ml=1.49,
        away_ml=2.72,
        total_over=1.71,
        total_under=2.12,
        hcap_home=1.66,
        hcap_away=2.22,
        line_seed=3508191400,
        event_type="",
    )

    game = parse_tennis_events([child, parent], is_live=True)[1626413699]
    period = game["Periods"][0]

    assert period["Win1x2"]["Win1"]["value"] == pytest.approx(1.61)
    assert period["Win1x2"]["Win2"]["value"] == pytest.approx(2.38)
    assert period["Win1x2"]["LineEventId"] == 1626429787
    assert period["SetsTotal"]["2.5"]["WinMore"]["value"] == pytest.approx(1.88)
    assert period["SetsTotal"]["2.5"]["LineEventId"] == 1626429787
    assert period["SetsHandicap"]["1.5"]["Win1"]["value"] == pytest.approx(1.83)
    assert period["SetsHandicap"]["1.5"]["LineEventId"] == 1626429787


def test_esports_kills_market_keeps_fresher_child_even_if_source_order_reverses():
    fresh = _esports_kills_event(
        event_id=1627000001,
        parent_id=1627000000,
        source_seq=0,
        touch_seq=25,
        home_ml=1.77,
        away_ml=2.05,
        total_over=1.92,
        total_under=1.86,
        hcap_home=1.81,
        hcap_away=1.97,
        line_seed=4508191300,
    )
    stale = _esports_kills_event(
        event_id=1627000002,
        parent_id=1627000000,
        source_seq=1,
        touch_seq=10,
        home_ml=1.59,
        away_ml=2.31,
        total_over=1.74,
        total_under=2.05,
        hcap_home=1.68,
        hcap_away=2.12,
        line_seed=4508191400,
    )

    game = parse_esports_events([fresh, stale], is_live=True)[1627000000]
    kills = game["Periods"][0]["Kills"]

    assert kills["Win1x2"]["Win1"]["value"] == pytest.approx(1.77)
    assert kills["Win1x2"]["LineEventId"] == 1627000001
    assert kills["Totals"]["12.5"]["WinMore"]["value"] == pytest.approx(1.92)
    assert kills["Totals"]["12.5"]["LineEventId"] == 1627000001
    assert kills["Handicap"]["-1.5"]["Win1"]["value"] == pytest.approx(1.81)
    assert kills["Handicap"]["-1.5"]["LineEventId"] == 1627000001


def test_build_games_from_raw_uses_market_specific_touch_for_grouped_volleyball_children(parser_state_snapshot):
    parent_event_id = 1627100001
    child_event_id = 1627100002
    parent_id = 1627100000

    parent_odds = {
        "1": [
            [[-2.5, 2.5, "2.5", "1.70", "2.10", 0, 1, 4600000001, 0, 550.0, 1]],
            [["145.5", 145.5, "1.74", "2.08", 4600000002, 0, 550.0, 1]],
            ["2.24", "1.66", None, 4600000003, 0, 2700.0, 1],
            [],
            [],
            0,
            0,
            [0, 0],
            0,
            None,
            None,
            1,
        ]
    }
    child_odds = {
        "1": [
            [[-2.5, 2.5, "2.5", "1.86", "1.96", 0, 1, 4700000001, 0, 550.0, 1]],
            [["145.5", 145.5, "1.93", "1.89", 4700000002, 0, 550.0, 1]],
            ["2.40", "1.55", None, 4700000003, 0, 2700.0, 1],
            [],
            [],
            0,
            0,
            [0, 0],
            0,
            None,
            None,
            1,
        ]
    }

    state.raw_events[parent_event_id] = {
        "sport_id": 34,
        "league_name": "Volleyball Test",
        "event": _modern_raw_event(
            event_id=parent_event_id,
            parent_id=parent_id,
            home_name="Alpha",
            away_name="Beta",
            odds_block=parent_odds,
            event_type="",
        ),
        "is_live": True,
        "updated_at": 200.0,
        "touch_seq": 30,
        "market_touch_seq": {
            "1:Win1x2": 30,
            "1:Handicap": 5,
            "1:Totals": 5,
        },
    }
    state.raw_events[child_event_id] = {
        "sport_id": 34,
        "league_name": "Volleyball Test",
        "event": _modern_raw_event(
            event_id=child_event_id,
            parent_id=parent_id,
            home_name="Alpha (Points)",
            away_name="Beta (Points)",
            odds_block=child_odds,
            event_type="",
        ),
        "is_live": True,
        "updated_at": 100.0,
        "touch_seq": 10,
        "market_touch_seq": {
            "1:Handicap": 40,
            "1:Totals": 40,
        },
    }

    games = build_games_from_raw({parent_event_id, child_event_id}, source_time_ms=1700000000000, is_live=True)

    assert len(games) == 1
    game = games[0]
    period = game["Periods"][1]

    assert game["Pid"] == parent_id
    assert period["Win1x2"]["Win1"]["value"] == pytest.approx(1.66)
    assert period["Win1x2"]["LineEventId"] == parent_event_id
    assert period["Totals"]["145.5"]["WinMore"]["value"] == pytest.approx(1.93)
    assert period["Totals"]["145.5"]["LineEventId"] == child_event_id
    assert period["Handicap"]["2.5"]["Win1"]["value"] == pytest.approx(1.86)
    assert period["Handicap"]["2.5"]["LineEventId"] == child_event_id
