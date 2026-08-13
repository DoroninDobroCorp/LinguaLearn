from parsing.sport_parsers import parse_tennis_events


def _sample_live_tennis_sets_event_status2():
    return {
        "sport_id": 33,
        "sport_name": "Tennis",
        "league_name": "ATP Miami - R1",
        "event_id": 1626429787,
        "parent_id": 1626413699,
        "home_name": "Moise Kouame",
        "away_name": "Zachary Svajda",
        "home_score": 0.0,
        "away_score": 0.0,
        "has_score": False,
        "event_type": "Sets",
        "start_time_ms": 1773928800000,
        "is_extra": False,
        "odds_block": {
            "0": [
                [[-1.5, 1.5, "1.5", "1.119", "8.160", 0, 1, 3508191393, 0, 550.0, 1]],
                [["2.5", 2.5, "1.119", "8.160", 3508191393, 0, 550.0, 1]],
                ["1.323", "3.650", None, 3508191393, 0, 2700.0, 1],
                0,
                None,
                0,
                0,
                [0, 0],
                0,
                None,
                None,
                2,
            ]
        },
    }


def test_live_tennis_status2_with_real_prices_is_not_skipped():
    game = parse_tennis_events([_sample_live_tennis_sets_event_status2()], is_live=True)[1626413699]
    period = game["Periods"][0]

    assert period["Win1x2"]["Win1"]["value"] == 3.65
    assert period["Win1x2"]["Win2"]["value"] == 1.323
    assert period["SetsTotal"]["2.5"]["WinMore"]["value"] == 1.119
    assert period["SetsTotal"]["2.5"]["WinLess"]["value"] == 8.16
    assert period["SetsHandicap"]["1.5"]["Win1"]["value"] == 1.119
    assert period["SetsHandicap"]["-1.5"]["Win2"]["value"] == 8.16
