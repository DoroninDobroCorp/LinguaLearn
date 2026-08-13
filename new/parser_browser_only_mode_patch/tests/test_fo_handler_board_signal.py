import asyncio
import copy
import time

import handlers.fo_handler as fo_handler
from utils.market_ts import (
    _build_market_ts_strict,
    _is_market_closed,
    _sanitize_game_for_output,
    _summarize_live_base_market_ages,
)
from parsing.parser import merge_updates
from state import state


def _snapshot_state():
    return copy.deepcopy(state.__dict__)


def _restore_state(snapshot):
    state.__dict__.clear()
    state.__dict__.update(snapshot)


def _patch_runtime(monkeypatch):
    async def fake_broadcast(_payload):
        return None

    monkeypatch.setattr(fo_handler, "broadcast", fake_broadcast)
    monkeypatch.setattr(fo_handler, "map_game_pid", lambda game: game)
    monkeypatch.setattr(fo_handler, "should_drop_stale", lambda: True)
    monkeypatch.setattr(fo_handler, "_build_update_payload", lambda payload: payload)
    monkeypatch.setattr(fo_handler, "_filter_markets", lambda game: game)



def _run_handle_full_odds(parsed_games):
    async def fake_process_data(_data, force_live=None):
        return parsed_games

    async def fake_broadcast_games(_parsed, _label):
        return None

    return asyncio.run(
        fo_handler.handle_full_odds(
            {"odds": {"l": []}},
            True,
            "TST",
            fake_process_data,
            fake_broadcast_games,
        )
    )


def test_full_odds_score_change_sets_board_signal(monkeypatch):
    snapshot = _snapshot_state()
    try:
        _patch_runtime(monkeypatch)
        state.events_data = {
            101: {
                "Pid": 101,
                "isLive": True,
                "SportName": "Basketball",
                "HomeScore": 0,
                "AwayScore": 0,
                "Periods": [{}],
                "CreatedAt": "2026-01-01T00:00:00Z",
                "LastSeenAt": "2026-01-01T00:00:00Z",
            }
        }
        state.raw_events = {}
        state.event_source = {101: "ps3838"}
        state.board_signal_ts = {}
        state.board_signal_events_total = 0
        state.board_signal_events_last = 0
        state.board_signal_last_ts = 0.0
        state.last_broadcast_ts = {}
        state.more_bet_last_sent = {}

        _run_handle_full_odds([
            {
                "Pid": 101,
                "isLive": True,
                "SportName": "Basketball",
                "HomeScore": 1,
                "AwayScore": 0,
                "homeName": "A",
                "awayName": "B",
                "Periods": [{}],
            }
        ])

        assert 101 in state.board_signal_ts
        assert state.board_signal_events_last == 1
        assert state.board_signal_events_total == 1
        assert state.events_data[101]["_board_signal_ts"] == state.board_signal_ts[101]
    finally:
        _restore_state(snapshot)


def test_build_market_ts_strict_includes_sets_markets():
    game = {
        "Periods": [{
            "SetsHandicap": {
                "-1.5": {
                    "Win1": {"value": 1.87},
                    "Win2": {"value": 1.95},
                }
            },
            "SetsTotal": {
                "2.5": {
                    "WinMore": {"value": 1.91},
                    "WinLess": {"value": 1.91},
                }
            },
            "_SetsHandicap_ts": 100.0,
            "_SetsTotal_ts": 101.0,
        }]
    }

    _build_market_ts_strict(game)

    p0 = game["Periods"][0]
    assert p0["_market_ts"]["SetsHandicap"] == 100.0
    assert p0["_market_ts"]["SetsTotal"] == 101.0


def test_summarize_live_base_market_ages_uses_sets_markets_for_tennis():
    summary = _summarize_live_base_market_ages(
        {
            1: {
                "isLive": True,
                "SportName": "Tennis",
                "Periods": [{
                    "Win1x2": {
                        "Win1": {"value": 1.42},
                        "Win2": {"value": 2.88},
                    },
                    "SetsHandicap": {
                        "-1.5": {
                            "Win1": {"value": 1.91},
                            "Win2": {"value": 1.91},
                        }
                    },
                    "SetsTotal": {
                        "2.5": {
                            "WinMore": {"value": 1.87},
                            "WinLess": {"value": 1.95},
                        }
                    },
                    "_Win1x2_ts": 100.0,
                    "_SetsHandicap_ts": 110.0,
                    "_SetsTotal_ts": 120.0,
                }],
            }
        },
        now_ts=130.0,
    )

    tennis = summary["Tennis"]
    assert "Win1x2" in tennis
    assert "SetsHandicap" in tennis
    assert "SetsTotal" in tennis
    assert "Handicap" not in tennis
    assert "Totals" not in tennis


def test_raw_odds_event_count_counts_real_events_not_sport_blocks():
    odds = {
        "l": [[4, 100, [[200, "League", [{}, {}]]]]],
        "n": [[4, 0, []]],
    }

    assert fo_handler._raw_odds_event_count(odds, "l") == 2
    assert fo_handler._raw_odds_event_count(odds, "n") == 0


def test_merge_updates_refreshes_raw_copy_for_existing_event():
    existing = {
        505: {
            "Pid": 505,
            "isLive": True,
            "HomeScore": 0,
            "AwayScore": 0,
            "Periods": [{
                "Handicap": {
                    "7.5": {
                        "Win1": {"value": 1.91},
                        "Win2": {"value": 1.91},
                        "LineId": 1111111111,
                    }
                }
            }],
            "Raw": {
                "event_id": 505,
                "odds_block": {
                    "0": [
                        [[-7.5, 7.5, "7.5", "1.91", "1.91", 0, 1, 1111111111, 1, 100.0, 1]],
                        [],
                        [],
                        [],
                        [],
                    ]
                },
            },
        }
    }

    updates = [{
        "Pid": 505,
        "Periods": [{
            "Handicap": {
                "7.5": {
                    "Win1": {"value": 1.943},
                    "Win2": {"value": 1.769},
                    "LineId": 3333333333,
                }
            }
        }],
        "Raw": {
            "event_id": 505,
            "odds_block": {
                "0": [
                    [[-7.5, 7.5, "7.5", "1.943", "1.769", 0, 1, 3333333333, 1, 100.0, 1]],
                    [],
                    [],
                    [],
                    [],
                ]
            },
        },
    }]

    merged = merge_updates(existing, updates, authoritative=False)

    assert merged[505]["Raw"]["odds_block"]["0"][0][0][7] == 3333333333
    assert merged[505]["Raw"]["odds_block"]["0"][0][0][3] == "1.943"


def test_merge_updates_derives_is_alt_for_line_entries():
    existing = {
        606: {
            "Pid": 606,
            "isLive": True,
            "Periods": [{
                "Totals": {
                    "124.5": {
                        "WinMore": {"value": 1.91, "raw": {}},
                        "WinLess": {"value": 1.91, "raw": {}},
                        "LineId": 1111111111,
                    }
                }
            }],
        }
    }

    updates = [{
        "Pid": 606,
        "Periods": [{
            "Totals": {
                "124.5": {
                    "WinMore": {"value": 1.917, "raw": {}},
                    "WinLess": {"value": 1.917, "raw": {}},
                    "LineId": 55789993940,
                }
            }
        }],
    }]

    merged = merge_updates(existing, updates, authoritative=False)

    line = merged[606]["Periods"][0]["Totals"]["124.5"]
    assert line["LineId"] == 55789993940
    assert line["IsAlt"] == 1
    assert line["WinMore"]["raw"]["line_id"] == 55789993940
    assert line["WinMore"]["raw"]["is_alt"] == 1
    assert line["WinLess"]["raw"]["line_id"] == 55789993940
    assert line["WinLess"]["raw"]["is_alt"] == 1
