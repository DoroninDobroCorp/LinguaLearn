from parsing.sport_parsers import parse_soccer_events


def _sample_soccer_event():
    return {
        "sport_id": 29,
        "sport_name": "Soccer",
        "league_name": "UEFA - Europa League",
        "event_id": 1625140504,
        "parent_id": 1625140504,
        "home_name": "Freiburg",
        "away_name": "Genk",
        "home_score": 0.0,
        "away_score": 0.0,
        "has_score": False,
        "event_type": "Regular",
        "start_time_ms": 1773942300000,
        "is_extra": False,
        "odds_block": {
            "0": [
                [
                    [1.25, -1.25, "1-1.5", "2.340", "1.649", 1, 0, 55794015394, 1, 20000.0, 0],
                    [1.0, -1.0, "1.0", "2.030", "1.877", 1, 0, 3508116928, 0, 20000.0, 0],
                ],
                [
                    ["2.5-3", 2.75, "2.040", "1.854", 3508116928, 0, 10000.0, 0],
                ],
                ["5.700", "1.595", "4.240", 3508116928, 0, 15000.0, 0],
                0,
                None,
                1,
                0,
                [1, 1],
                43,
                None,
                None,
                1,
            ]
        },
    }


def _sample_zero_handicap_event(home_score=0.0, away_score=0.0):
    event = _sample_soccer_event()
    event["home_score"] = home_score
    event["away_score"] = away_score
    event["has_score"] = True
    event["odds_block"]["0"][0] = [
        [0.0, 0.0, "0.0", "2.280", "1.628", 0, 0, 56961307735, 1, 2250.0, 1],
    ]
    return event


def test_soccer_handicap_sign_is_betslip_aligned_for_prematch():
    game = parse_soccer_events([_sample_soccer_event()], is_live=False)[1625140504]
    period = game["Periods"][0]
    hdp = period["Handicap"]

    assert hdp["-1.25"]["Win1"]["value"] == 2.34
    assert hdp["-1.25"]["Win1"]["raw"]["handicap"] == -1.25
    assert hdp["1.25"]["Win2"]["value"] == 1.649
    assert hdp["1.25"]["Win2"]["raw"]["handicap"] == 1.25

    assert hdp["-1.0"]["Win1"]["value"] == 2.03
    assert hdp["-1.0"]["Win1"]["raw"]["handicap"] == -1.0
    assert hdp["1.0"]["Win2"]["value"] == 1.877
    assert hdp["1.0"]["Win2"]["raw"]["handicap"] == 1.0


def test_soccer_handicap_sign_is_betslip_aligned_for_live():
    game = parse_soccer_events([_sample_soccer_event()], is_live=True)[1625140504]
    period = game["Periods"][0]
    hdp = period["Handicap"]

    assert hdp["-1.0"]["Win1"]["value"] == 2.03
    assert hdp["1.0"]["Win2"]["value"] == 1.877


def test_browser_live_soccer_h0_is_shifted_by_current_score():
    event = _sample_zero_handicap_event(home_score=1.0, away_score=0.0)

    game = parse_soccer_events([event], is_live=True)[1625140504]
    hdp = game["Periods"][0]["Handicap"]

    assert hdp["-1.0"]["Win1"]["value"] == 2.28
    assert hdp["-1.0"]["Win1"]["raw"]["handicap"] == -1.0
    assert hdp["1.0"]["Win2"]["value"] == 1.628
    assert hdp["1.0"]["Win2"]["raw"]["handicap"] == 1.0
    assert "0.0" not in hdp
    assert "-0.0" not in hdp


def test_browser_live_soccer_h0_at_level_score_stays_h0():
    event = _sample_zero_handicap_event(home_score=0.0, away_score=0.0)

    game = parse_soccer_events([event], is_live=True)[1625140504]
    hdp = game["Periods"][0]["Handicap"]

    assert hdp["0.0"]["Win1"]["value"] == 2.28
    assert hdp["0.0"]["Win2"]["value"] == 1.628
    assert hdp["0.0"]["Win1"]["raw"]["handicap"] == 0.0
    assert hdp["0.0"]["Win2"]["raw"]["handicap"] == 0.0


def test_browser_prematch_soccer_h0_is_not_score_shifted():
    # A defensive regression: prematch normalization must remain independent
    # from score fields even if an upstream row happens to carry them.
    event = _sample_zero_handicap_event(home_score=1.0, away_score=0.0)

    game = parse_soccer_events([event], is_live=False)[1625140504]
    hdp = game["Periods"][0]["Handicap"]

    assert hdp["-0.0"]["Win1"]["value"] == 2.28
    assert hdp["0.0"]["Win2"]["value"] == 1.628
    assert "-1.0" not in hdp
    assert "1.0" not in hdp
