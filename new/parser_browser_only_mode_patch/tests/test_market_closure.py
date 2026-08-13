from utils.market_ts import (
    _count_active_closed_markers,
    _clear_market_closed,
    _is_market_closed,
    _mark_market_closed,
    _sanitize_game_for_output,
    _summarize_live_base_market_ages,
)


def test_mark_and_clear_market_closed_updates_state():
    period = {}
    _mark_market_closed(period, "Totals", 123.0)

    assert _is_market_closed(period, "Totals")
    assert period["_Totals_ts"] == 123.0
    assert period["_Totals_closed_ts"] == 123.0

    _clear_market_closed(period, "Totals")

    assert not _is_market_closed(period, "Totals")
    assert period["_Totals_ts"] == 123.0


def test_sanitize_hides_closed_totals_and_market_ts():
    game = {
        "Periods": [
            {
                "Totals": {
                    "2.5": {
                        "WinMore": {"value": 0.0},
                        "WinLess": {"value": 0.0},
                    }
                },
                "_Totals_ts": 100.0,
                "_Totals_closed_ts": 100.0,
                "_market_ts": {"Totals": 100.0, "Win1x2": 50.0},
                "Win1x2": {
                    "Win1": {"value": 1.9},
                    "WinNone": {"value": 3.2},
                    "Win2": {"value": 4.1},
                },
            }
        ]
    }

    out = _sanitize_game_for_output(game)
    period = out["Periods"][0]

    assert "Totals" not in period
    assert "_Totals_closed_ts" not in period
    assert period["_closed_markets"] == {"Totals": 100.0}
    assert "Totals" not in period.get("_market_ts", {})
    assert "Win1x2" in period


def test_sanitize_keeps_partial_real_line():
    game = {
        "Periods": [
            {
                "Totals": {
                    "2.5": {
                        "WinMore": {"value": 1.95},
                        "WinLess": {"value": 0.0},
                    },
                    "3.5": {
                        "WinMore": {"value": 0.0},
                        "WinLess": {"value": 0.0},
                    },
                },
                "_Totals_ts": 200.0,
                "_market_ts": {"Totals": 200.0},
            }
        ]
    }

    out = _sanitize_game_for_output(game)
    totals = out["Periods"][0]["Totals"]

    assert "2.5" in totals
    assert "3.5" not in totals


def test_sanitize_hides_zero_win1x2():
    game = {
        "Periods": [
            {
                "Win1x2": {
                    "Win1": {"value": 0.0},
                    "WinNone": {"value": 0.0},
                    "Win2": {"value": 0.0},
                },
                "_Win1x2_ts": 10.0,
                "_market_ts": {"Win1x2": 10.0},
            }
        ]
    }

    out = _sanitize_game_for_output(game)
    period = out["Periods"][0]

    assert "Win1x2" not in period
    assert "Win1x2" not in period.get("_market_ts", {})


def test_count_active_closed_markers_groups_by_market():
    events = {
        1: {"Periods": [{"_Totals_closed_ts": 10.0, "_Handicap_closed_ts": 11.0}, {"_Totals_closed_ts": 12.0}]},
        2: {"Periods": [{"_Win1x2_closed_ts": 13.0}]},
    }

    summary = _count_active_closed_markers(events)

    assert summary["total"] == 4
    assert summary["by_market"] == {"Handicap": 1, "Totals": 2, "Win1x2": 1}


def test_summarize_live_base_market_ages_uses_period0_by_sport():
    events = {
        1: {"isLive": True, "SportName": "Soccer", "Periods": [{"_Win1x2_ts": 90.0, "_Totals_ts": 80.0}]},
        2: {"isLive": True, "SportName": "Soccer", "Periods": [{"_market_ts": {"Handicap": 70.0}}]},
        3: {"isLive": False, "SportName": "Soccer", "Periods": [{"_Win1x2_ts": 10.0}]},
    }

    summary = _summarize_live_base_market_ages(events, now_ts=100.0)

    assert summary == {
        "Soccer": {
            "Handicap": {"count": 1, "avg_age_sec": 30.0, "min_age_sec": 30.0, "max_age_sec": 30.0},
            "Totals": {"count": 1, "avg_age_sec": 20.0, "min_age_sec": 20.0, "max_age_sec": 20.0},
            "Win1x2": {"count": 1, "avg_age_sec": 10.0, "min_age_sec": 10.0, "max_age_sec": 10.0},
        }
    }
