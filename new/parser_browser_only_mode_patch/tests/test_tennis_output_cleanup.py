from utils.market_ts import _sanitize_game_for_output


def test_sanitize_game_hides_zero_only_tennis_sets_placeholders():
    game = {
        "SportName": "Tennis",
        "Periods": [{
            "Win1x2": {
                "Win1": {"value": 1.91},
                "Win2": {"value": 1.91},
            },
            "SetsHandicap": {
                "-0.0": {
                    "Win1": {"value": 0.0},
                    "Win2": {"value": 0.0},
                }
            },
            "SetsTotal": {
                "0.0": {
                    "WinMore": {"value": 0.0},
                    "WinLess": {"value": 0.0},
                }
            },
            "_Win1x2_ts": 100.0,
            "_SetsHandicap_ts": 100.0,
            "_SetsTotal_ts": 100.0,
            "_market_ts": {
                "Win1x2": 100.0,
                "SetsHandicap": 100.0,
                "SetsTotal": 100.0,
            },
        }],
    }

    out = _sanitize_game_for_output(game)
    period = out["Periods"][0]

    assert "SetsHandicap" not in period
    assert "SetsTotal" not in period
    assert "Win1x2" in period
    assert "SetsHandicap" not in period.get("_market_ts", {})
    assert "SetsTotal" not in period.get("_market_ts", {})
