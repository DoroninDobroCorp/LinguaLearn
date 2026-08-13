from __future__ import annotations

from parsing.parser import parse_ps3838_all_sports


def _regular_event(*, event_id: int, parent_id: int, home: str, away: str, league: str) -> list:
    event = [None] * 29
    event[0] = event_id
    event[1] = home
    event[2] = away
    event[4] = 1773928800000
    event[8] = {
        "0": [
            [],
            [],
            ["2.20", "1.68", None, 4527000003, 0, 2700.0, 1],
            [],
            [],
        ]
    }
    event[28] = parent_id
    event[27] = None
    return event


def _soccer_extra_child(*, event_id: int, parent_id: int, home: str, away: str) -> list:
    event = [None] * 29
    event[0] = event_id
    event[1] = home
    event[2] = away
    event[4] = 1773928800000
    event[8] = {
        "0": [
            [[], []],
            None,
            [[0.5, -0.5, "0.5", "1.88", "1.92", 0, 1, 3527000101, 1, 2000, 1]],
            [["3.5", 3.5, "1.91", "1.89", 3527000102, 1, 2000, 1]],
            ["7.20", "1.56", "3.90", 3527000103, 0, 2700.0, 1],
            0,
            None,
            0,
            0,
            [0, 0],
            0,
            None,
            None,
            1,
        ]
    }
    event[28] = parent_id
    return event


def _basketball_extra_child(*, event_id: int, parent_id: int, home: str, away: str) -> list:
    event = [None] * 29
    event[0] = event_id
    event[1] = home
    event[2] = away
    event[4] = 1773928800000
    event[8] = {
        "0": [
            [
                [["108.5", 108.5, "1.90", "1.90", 4527000201, 0, 100, 1]],
                [],
            ],
            None,
            [[-4.5, 4.5, "4.5", "1.91", "1.89", 0, 1, 4527000202, 1, 200, 1]],
            [["220.5", 220.5, "1.87", "1.93", 4527000203, 1, 200, 1]],
            ["2.15", "1.72", None, 4527000204, 0, 2700.0, 1],
            0,
            None,
            0,
            0,
            [0, 0],
            0,
            None,
            None,
            1,
        ]
    }
    event[28] = parent_id
    return event


def _payload(*, sport_id: int, league: str, regular: list, extra: list) -> dict:
    return {
        "odds": {
            "l": [[sport_id, "", [[0, league, [regular]]]]],
            "e": [[sport_id, [[0, [extra]]]]],
        }
    }


def test_soccer_extra_child_merges_into_parent_pid():
    payload = _payload(
        sport_id=29,
        league="Friendly",
        regular=_regular_event(
            event_id=1627052554,
            parent_id=1627052554,
            home="British Virgin Islands",
            away="Anguilla",
            league="Friendly",
        ),
        extra=_soccer_extra_child(
            event_id=1627074699,
            parent_id=1627052554,
            home="British Virgin Islands",
            away="Anguilla",
        ),
    )

    results = parse_ps3838_all_sports(payload, is_live=True)

    assert len(results) == 1
    game = results[0]
    period0 = game["Periods"][0]
    assert game["Pid"] == 1627052554
    assert period0["Win1x2"]["LineEventId"] == 1627074699
    assert period0["Totals"]["3.5"]["LineEventId"] == 1627074699
    assert period0["Handicap"]["-0.5"]["LineEventId"] == 1627074699


def test_basketball_extra_child_merges_into_parent_pid():
    payload = _payload(
        sport_id=4,
        league="NBA",
        regular=_regular_event(
            event_id=1627043610,
            parent_id=1627043610,
            home="Indiana Pacers",
            away="Miami Heat",
            league="NBA",
        ),
        extra=_basketball_extra_child(
            event_id=1627084886,
            parent_id=1627043610,
            home="Indiana Pacers",
            away="Miami Heat",
        ),
    )

    results = parse_ps3838_all_sports(payload, is_live=True)

    assert len(results) == 1
    game = results[0]
    period0 = game["Periods"][0]
    assert game["Pid"] == 1627043610
    assert period0["Win1x2"]["LineEventId"] == 1627084886
    assert period0["Handicap"]["4.5"]["LineEventId"] == 1627084886
    assert period0["FirstTeamTotals"]["108.5"]["LineEventId"] == 1627084886


def test_mixed_live_and_prematch_keys_preserve_scope_flags():
    live_event = _regular_event(
        event_id=1628000001,
        parent_id=1628000001,
        home="Live Home",
        away="Live Away",
        league="Live League",
    )
    prematch_event = _regular_event(
        event_id=1628000002,
        parent_id=1628000002,
        home="Prematch Home",
        away="Prematch Away",
        league="Prematch League",
    )
    payload = {
        "odds": {
            "l": [[29, "", [[0, "Live League", [live_event]]]]],
            "n": [[29, "", [[0, "Prematch League", [prematch_event]]]]],
        }
    }

    results = parse_ps3838_all_sports(payload, is_live=True)

    assert {game["Pid"]: game["isLive"] for game in results} == {
        1628000001: True,
        1628000002: False,
    }
