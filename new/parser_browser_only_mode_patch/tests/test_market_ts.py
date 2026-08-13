import utils.market_ts as market_ts
from state import state


def test_summarize_live_base_market_ages_maps_tennis_source_limited_to_sets_slots():
    now_ts = 100.0
    events_data = {
        7001: {
            "Pid": 7001,
            "isLive": True,
            "SportName": "Tennis",
            "_tennis_sets_source_limited_until": now_ts + 30.0,
            "Periods": [{
                "Win1x2": {
                    "Win1": {"value": 1.8},
                    "Win2": {"value": 2.0},
                },
                "Handicap": {
                    "2.5": {
                        "Win1": {"value": 1.91},
                        "Win2": {"value": 1.91},
                    }
                },
                "Totals": {
                    "22.5": {
                        "WinMore": {"value": 1.91},
                        "WinLess": {"value": 1.91},
                    }
                },
                "_Win1x2_ts": now_ts - 4.0,
                "_Handicap_ts": now_ts - 5.0,
                "_Totals_ts": now_ts - 6.0,
                "_market_ts": {
                    "Win1x2": now_ts - 4.0,
                    "Handicap": now_ts - 5.0,
                    "Totals": now_ts - 6.0,
                },
            }],
        }
    }

    summary = market_ts._summarize_live_base_market_ages(events_data, now_ts=now_ts)

    tennis = summary["Tennis"]
    assert tennis["Win1x2"]["count"] == 1
    assert tennis["Win1x2"]["avg_age_sec"] == 4.0
    assert tennis["SetsHandicap"]["count"] == 1
    assert tennis["SetsHandicap"]["avg_age_sec"] == 5.0
    assert tennis["SetsTotal"]["count"] == 1
    assert tennis["SetsTotal"]["avg_age_sec"] == 6.0


def test_summarize_live_base_market_ages_applies_lane_confirm_to_classic_markets():
    snapshot = dict(state.__dict__)
    try:
        now_ts = 110.0
        state.lane_epoch_start_ts = {"S29B1": 100.0}
        state.lane_fo_confirm_ts = {"S29B1": 101.0}
        state.lane_uo_confirm_ts = {"S29B1": 109.0}
        events_data = {
            7002: {
                "Pid": 7002,
                "isLive": True,
                "SportName": "Soccer",
                "Raw": {"sport_id": 29},
                "Periods": [{
                    "Win1x2": {
                        "Win1": {"value": 1.8},
                        "WinNone": {"value": 3.2},
                        "Win2": {"value": 4.0},
                    },
                    "Handicap": {
                        "-0.5": {
                            "Win1": {"value": 1.91},
                            "Win2": {"value": 1.91},
                        }
                    },
                    "Totals": {
                        "2.5": {
                            "WinMore": {"value": 1.91},
                            "WinLess": {"value": 1.91},
                        }
                    },
                    "_Win1x2_ts": 90.0,
                    "_Handicap_ts": 90.0,
                    "_Totals_ts": 90.0,
                    "_market_ts": {
                        "Win1x2": 90.0,
                        "Handicap": 90.0,
                        "Totals": 90.0,
                    },
                }],
            }
        }

        summary = market_ts._summarize_live_base_market_ages(events_data, now_ts=now_ts)

        soccer = summary["Soccer"]
        assert soccer["Win1x2"]["max_age_sec"] == 1.0
        assert soccer["Handicap"]["max_age_sec"] == 1.0
        assert soccer["Totals"]["max_age_sec"] == 1.0
    finally:
        state.__dict__.clear()
        state.__dict__.update(snapshot)


def test_effective_market_age_prefers_lane_confirm_timestamp():
    snapshot = dict(state.__dict__)
    try:
        now_ts = 110.0
        state.lane_epoch_start_ts = {"S29B1": 100.0}
        state.lane_fo_confirm_ts = {"S29B1": 101.0}
        state.lane_uo_confirm_ts = {"S29B1": 109.0}
        game = {
            "Pid": 7003,
            "isLive": True,
            "SportName": "Soccer",
            "Raw": {"sport_id": 29},
        }
        period = {
            "Win1x2": {
                "Win1": {"value": 1.8},
                "WinNone": {"value": 3.2},
                "Win2": {"value": 4.0},
            },
            "_Win1x2_ts": 90.0,
            "_market_ts": {"Win1x2": 90.0},
        }

        age_sec = market_ts._effective_market_age(period, game, "Win1x2", now_ts=now_ts)

        assert age_sec == 1.0
    finally:
        state.__dict__.clear()
        state.__dict__.update(snapshot)


def test_sanitize_game_for_output_applies_lane_confirm_to_classic_markets():
    snapshot = dict(state.__dict__)
    try:
        state.lane_epoch_start_ts = {"S29B1": 100.0}
        state.lane_fo_confirm_ts = {"S29B1": 101.0}
        state.lane_uo_confirm_ts = {"S29B1": 109.0}
        game = {
            "Pid": 1,
            "SportName": "Soccer",
            "Raw": {"sport_id": 29},
            "Periods": [{
                "Win1x2": {
                    "Win1": {"value": 1.8},
                    "WinNone": {"value": 3.2},
                    "Win2": {"value": 4.0},
                },
                "Handicap": {"-0.5": {"Win1": {"value": 2.0}, "Win2": {"value": 1.8}}},
                "Totals": {"2.5": {"WinMore": {"value": 1.9}, "WinLess": {"value": 1.9}}},
                "_Win1x2_ts": 90.0,
                "_Handicap_ts": 90.0,
                "_Totals_ts": 90.0,
                "_market_ts": {"Win1x2": 90.0, "Handicap": 90.0, "Totals": 90.0},
            }],
        }

        out = market_ts._sanitize_game_for_output(game)
        p0 = out["Periods"][0]

        assert p0["_market_ts"]["Win1x2"] == 109.0
        assert p0["_market_ts"]["Handicap"] == 109.0
        assert p0["_market_ts"]["Totals"] == 109.0
    finally:
        state.__dict__.clear()
        state.__dict__.update(snapshot)


def test_lane_labels_for_game_include_volleyball_sets_only_as_btg1():
    game = {
        "Pid": 1,
        "SportName": "Volleyball",
        "Raw": {"sport_id": 34},
        "Periods": [{
            "SetsHandicap": {"-1.5": {"Win1": {"value": 1.95}, "Win2": {"value": 1.87}}},
            "SetsTotal": {"3.5": {"WinMore": {"value": 1.88}, "WinLess": {"value": 1.92}}},
        }],
    }

    assert market_ts._lane_labels_for_game(game) == {"S34B1"}


def test_sanitize_game_for_output_applies_lane_confirm_to_volleyball_set_markets():
    snapshot = dict(state.__dict__)
    try:
        state.lane_epoch_start_ts = {"S34B1": 100.0}
        state.lane_fo_confirm_ts = {"S34B1": 101.0}
        state.lane_uo_confirm_ts = {"S34B1": 109.0}
        game = {
            "Pid": 1,
            "SportName": "Volleyball",
            "Raw": {"sport_id": 34},
            "Periods": [{
                "Win1x2": {
                    "Win1": {"value": 1.62},
                    "Win2": {"value": 2.28},
                },
                "SetsHandicap": {"-1.5": {"Win1": {"value": 1.95}, "Win2": {"value": 1.87}}},
                "SetsTotal": {"3.5": {"WinMore": {"value": 1.88}, "WinLess": {"value": 1.92}}},
                "_Win1x2_ts": 90.0,
                "_SetsHandicap_ts": 90.0,
                "_SetsTotal_ts": 90.0,
                "_market_ts": {"Win1x2": 90.0, "SetsHandicap": 90.0, "SetsTotal": 90.0},
            }],
        }

        out = market_ts._sanitize_game_for_output(game)
        p0 = out["Periods"][0]

        assert p0["_market_ts"]["Win1x2"] == 109.0
        assert p0["_market_ts"]["SetsHandicap"] == 109.0
        assert p0["_market_ts"]["SetsTotal"] == 109.0
    finally:
        state.__dict__.clear()
        state.__dict__.update(snapshot)


def test_sanitize_game_for_output_keeps_btg100_separate_from_classic_lane():
    snapshot = dict(state.__dict__)
    try:
        state.lane_epoch_start_ts = {"S4B1": 100.0, "S4B100": 100.0}
        state.lane_fo_confirm_ts = {"S4B1": 101.0, "S4B100": 101.0}
        state.lane_uo_confirm_ts = {"S4B1": 109.0, "S4B100": 107.0}
        game = {
            "Pid": 1,
            "SportName": "Basketball",
            "Raw": {"sport_id": 4},
            "Periods": [{
                "Win1x2": {
                    "Win1": {"value": 1.7},
                    "Win2": {"value": 2.2},
                },
                "FirstTeamTotals": {"88.5": {"WinMore": {"value": 1.9}, "WinLess": {"value": 1.9}}},
                "SecondTeamTotals": {"80.5": {"WinMore": {"value": 1.9}, "WinLess": {"value": 1.9}}},
                "_Win1x2_ts": 90.0,
                "_FirstTeamTotals_ts": 90.0,
                "_SecondTeamTotals_ts": 90.0,
                "_market_ts": {
                    "Win1x2": 90.0,
                    "FirstTeamTotals": 90.0,
                    "SecondTeamTotals": 90.0,
                },
            }],
        }

        out = market_ts._sanitize_game_for_output(game)
        p0 = out["Periods"][0]

        assert p0["_market_ts"]["Win1x2"] == 109.0
        assert p0["_market_ts"]["FirstTeamTotals"] == 107.0
        assert p0["_market_ts"]["SecondTeamTotals"] == 107.0
    finally:
        state.__dict__.clear()
        state.__dict__.update(snapshot)


def test_sanitize_game_for_output_does_not_apply_lane_confirm_without_fo_in_epoch():
    snapshot = dict(state.__dict__)
    try:
        state.lane_epoch_start_ts = {"S29B1": 100.0}
        state.lane_fo_confirm_ts = {"S29B1": 99.0}
        state.lane_uo_confirm_ts = {"S29B1": 109.0}
        game = {
            "Pid": 1,
            "SportName": "Soccer",
            "Raw": {"sport_id": 29},
            "Periods": [{
                "Win1x2": {
                    "Win1": {"value": 1.8},
                    "WinNone": {"value": 3.2},
                    "Win2": {"value": 4.0},
                },
                "_Win1x2_ts": 90.0,
                "_market_ts": {"Win1x2": 90.0},
            }],
        }

        out = market_ts._sanitize_game_for_output(game)
        p0 = out["Periods"][0]

        assert p0["_market_ts"]["Win1x2"] == 90.0
    finally:
        state.__dict__.clear()
        state.__dict__.update(snapshot)


def test_summarize_live_base_market_ages_prefers_fresher_fo_market_timestamp():
    now_ts = 110.0
    events_data = {
        7100: {
            "Pid": 7100,
            "isLive": True,
            "SportName": "Tennis",
            "Periods": [{
                "Win1x2": {
                    "Win1": {"value": 1.8},
                    "Win2": {"value": 2.0},
                },
                "_Win1x2_ts": 90.0,
                "_fo_Win1x2_ts": 105.0,
                "_market_ts": {"Win1x2": 90.0},
            }],
        }
    }

    summary = market_ts._summarize_live_base_market_ages(events_data, now_ts=now_ts)

    assert summary["Tennis"]["Win1x2"]["max_age_sec"] == 5.0


def test_sanitize_game_for_output_normalizes_market_ts_from_fresher_fo_timestamp():
    game = {
        "Pid": 1,
        "SportName": "Tennis",
        "Periods": [{
            "Win1x2": {
                "Win1": {"value": 1.8},
                "Win2": {"value": 2.0},
            },
            "_Win1x2_ts": 90.0,
            "_fo_Win1x2_ts": 105.0,
            "_market_ts": {"Win1x2": 90.0},
        }],
    }

    out = market_ts._sanitize_game_for_output(game)
    p0 = out["Periods"][0]

    assert p0["_Win1x2_ts"] == 105.0
    assert p0["_market_ts"]["Win1x2"] == 105.0


def test_sanitize_game_for_output_can_experimentally_confirm_more_bet_markets_from_b1_lane():
    snapshot = dict(state.__dict__)
    old_flag = market_ts.PS3838_EXPERIMENTAL_MB_CONFIRM_FROM_B1
    try:
        market_ts.PS3838_EXPERIMENTAL_MB_CONFIRM_FROM_B1 = True
        state.lane_epoch_start_ts = {"S29B1": 100.0}
        state.lane_fo_confirm_ts = {"S29B1": 101.0}
        state.lane_uo_confirm_ts = {"S29B1": 109.0}
        game = {
            "Pid": 1,
            "SportName": "Soccer",
            "Raw": {"sport_id": 29},
            "Periods": [{
                "DoubleChance": {
                    "1X": {"value": 1.22},
                    "12": {"value": 1.31},
                    "X2": {"value": 1.45},
                },
                "CornersTotal": {"9.5": {"WinMore": {"value": 1.9}, "WinLess": {"value": 1.9}}},
                "_DoubleChance_ts": 90.0,
                "_CornersTotal_ts": 90.0,
                "_market_ts": {"DoubleChance": 90.0, "CornersTotal": 90.0},
            }],
        }

        out = market_ts._sanitize_game_for_output(game)
        p0 = out["Periods"][0]

        assert p0["_market_ts"]["DoubleChance"] == 109.0
        assert p0["_market_ts"]["CornersTotal"] == 109.0
    finally:
        market_ts.PS3838_EXPERIMENTAL_MB_CONFIRM_FROM_B1 = old_flag
        state.__dict__.clear()
        state.__dict__.update(snapshot)


def test_sanitize_game_for_output_does_not_confirm_more_bet_markets_for_touched_event():
    snapshot = dict(state.__dict__)
    old_flag = market_ts.PS3838_EXPERIMENTAL_MB_CONFIRM_FROM_B1
    try:
        market_ts.PS3838_EXPERIMENTAL_MB_CONFIRM_FROM_B1 = True
        state.lane_epoch_start_ts = {"S29B1": 100.0}
        state.lane_fo_confirm_ts = {"S29B1": 101.0}
        state.lane_uo_confirm_ts = {"S29B1": 109.0}
        game = {
            "Pid": 1,
            "SportName": "Soccer",
            "Raw": {"sport_id": 29},
            "_board_signal_ts": 109.0,
            "Periods": [{
                "DoubleChance": {
                    "1X": {"value": 1.22},
                    "12": {"value": 1.31},
                    "X2": {"value": 1.45},
                },
                "_DoubleChance_ts": 90.0,
                "_market_ts": {"DoubleChance": 90.0},
            }],
        }

        out = market_ts._sanitize_game_for_output(game)
        p0 = out["Periods"][0]

        assert p0["_market_ts"]["DoubleChance"] == 90.0
    finally:
        market_ts.PS3838_EXPERIMENTAL_MB_CONFIRM_FROM_B1 = old_flag
        state.__dict__.clear()
        state.__dict__.update(snapshot)


def test_lane_confirm_uses_fo_ts_when_uo_not_yet_received():
    # push model: silence = alive; FO epoch confirmed but UO not yet arrived
    # effective age should be now - fo_confirm_ts (not fall back to old stored_ts)
    snapshot = dict(state.__dict__)
    try:
        now_ts = 115.0
        state.lane_epoch_start_ts = {"S29B1": 100.0}
        state.lane_fo_confirm_ts = {"S29B1": 110.0}
        state.lane_uo_confirm_ts = {}  # no UO yet
        game = {
            "Pid": 1,
            "SportName": "Soccer",
            "Raw": {"sport_id": 29},
            "Periods": [{
                "Win1x2": {
                    "Win1": {"value": 1.8},
                    "WinNone": {"value": 3.2},
                    "Win2": {"value": 4.0},
                },
                "_Win1x2_ts": 50.0,  # very old stored ts
                "_market_ts": {"Win1x2": 50.0},
            }],
        }

        age = market_ts._effective_market_age(game["Periods"][0], game, "Win1x2", now_ts=now_ts)

        # Should be 5.0 (now - fo_confirm = 115-110), NOT 65.0 (now - old_stored = 115-50)
        assert age == 5.0, f"Expected 5.0 (fo_confirm floor), got {age}"
    finally:
        state.__dict__.clear()
        state.__dict__.update(snapshot)


def test_lane_confirm_uses_fo_ts_when_uo_from_old_epoch():
    # UO arrived but from previous epoch — FO still the floor
    snapshot = dict(state.__dict__)
    try:
        now_ts = 115.0
        state.lane_epoch_start_ts = {"S29B1": 100.0}
        state.lane_fo_confirm_ts = {"S29B1": 110.0}
        state.lane_uo_confirm_ts = {"S29B1": 95.0}  # UO from before epoch start
        game = {
            "Pid": 1,
            "SportName": "Soccer",
            "Raw": {"sport_id": 29},
            "Periods": [{
                "Win1x2": {
                    "Win1": {"value": 1.8},
                    "WinNone": {"value": 3.2},
                    "Win2": {"value": 4.0},
                },
                "_Win1x2_ts": 50.0,
                "_market_ts": {"Win1x2": 50.0},
            }],
        }

        age = market_ts._effective_market_age(game["Periods"][0], game, "Win1x2", now_ts=now_ts)

        assert age == 5.0, f"Expected 5.0 (fo_confirm floor), got {age}"
    finally:
        state.__dict__.clear()
        state.__dict__.update(snapshot)
