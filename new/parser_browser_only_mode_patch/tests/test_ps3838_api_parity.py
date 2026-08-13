from tools import ps3838_api_parity as parity


def test_extract_canonical_outcomes_flattens_nested_markets_and_normalizes_odd_even():
    game = {
        "Periods": [
            {
                "Win1x2": {
                    "Win1": {"value": 1.57},
                    "WinNone": {"value": 4.93},
                    "Win2": {"value": 5.05},
                    "LineId": 123,
                },
                "Handicap": {
                    "-1.0": {
                        "Win1": {"value": 1.9},
                        "LineId": 200,
                    },
                    "1.0": {
                        "Win2": {"value": 2.0},
                    },
                },
                "OddEven": {
                    "Yes": {"value": 1.98},
                    "No": {"value": 1.84},
                },
                "PlayerProps": [
                    {
                        "PlayerName": "John Doe",
                        "Market": "Goals",
                        "Line": 1.5,
                        "Over": {"value": 2.2},
                        "Under": {"value": 1.7},
                    }
                ],
            }
        ]
    }

    result = parity.extract_canonical_outcomes(game)

    assert result["P0|Win1x2|Win1"] == 1.57
    assert result["P0|Win1x2|WinNone"] == 4.93
    assert result["P0|Handicap|-1.0|Win1"] == 1.9
    assert result["P0|Handicap|1.0|Win2"] == 2.0
    assert result["P0|OddEven|Odd"] == 1.98
    assert result["P0|OddEven|Even"] == 1.84
    assert result["P0|PlayerProps|John Doe|Goals|1.5|Over"] == 2.2
    assert result["P0|PlayerProps|John Doe|Goals|1.5|Under"] == 1.7


def test_build_api_games_merges_regular_and_special_markets():
    fixtures = {
        "sportId": 29,
        "league": [
            {
                "id": 1,
                "name": "uefa champions league",
                "events": [
                    {
                        "id": 12345,
                        "home": "Barcelona",
                        "away": "Atletico Madrid",
                        "liveStatus": 0,
                    }
                ],
            }
        ],
    }
    odds = {
        "sportId": 29,
        "leagues": [
            {
                "id": 1,
                "name": "uefa champions league",
                "events": [
                    {
                        "id": 12345,
                        "periods": [
                            {
                                "number": 0,
                                "status": 1,
                                "lineId": 555,
                                "moneyline": {"home": 1.571, "away": 5.05, "draw": 4.93},
                                "spreads": [{"hdp": -1.0, "home": 1.9, "away": 2.0}],
                                "totals": [{"points": 3.5, "over": 1.943, "under": 1.943}],
                                "teamTotal": {
                                    "home": {"points": 2.5, "over": 2.28, "under": 1.657},
                                    "away": {"points": 1.5, "over": 2.65, "under": 1.5},
                                },
                            }
                        ],
                    }
                ],
            }
        ],
    }
    special_fixtures = {
        "sportId": 29,
        "leagues": [
            {
                "id": 1,
                "specials": [
                    {
                        "id": 9001,
                        "name": "Both Teams To Score?",
                        "category": "Team Props",
                        "event": {"id": 12345, "periodNumber": 0},
                        "contestants": [{"id": 1, "name": "Yes"}, {"id": 2, "name": "No"}],
                    },
                    {
                        "id": 9002,
                        "name": "Correct Score",
                        "category": "Team Props",
                        "event": {"id": 12345, "periodNumber": 0},
                        "contestants": [
                            {"id": 10, "name": "Barcelona 2, Atletico Madrid 1"},
                            {"id": 11, "name": "Barcelona 1, Atletico Madrid 1"},
                        ],
                    },
                ],
            }
        ],
    }
    special_odds = {
        "sportId": 29,
        "leagues": [
            {
                "id": 1,
                "specials": [
                    {
                        "id": 9001,
                        "contestantLines": [
                            {"id": 1, "lineId": 101, "price": 1.51, "handicap": None},
                            {"id": 2, "lineId": 102, "price": 2.82, "handicap": None},
                        ],
                    },
                    {
                        "id": 9002,
                        "contestantLines": [
                            {"id": 10, "lineId": 201, "price": 9.64, "handicap": None},
                            {"id": 11, "lineId": 202, "price": 8.20, "handicap": None},
                        ],
                    },
                ],
            }
        ],
    }

    games, special_counts, special_names = parity.build_api_games(
        sport_id=29,
        fixtures=fixtures,
        odds=odds,
        special_fixtures=special_fixtures,
        special_odds=special_odds,
    )

    game = games[12345]
    period0 = game["Periods"][0]

    assert period0["Win1x2"]["Win1"]["value"] == 1.571
    assert period0["Handicap"]["-1.0"]["Win1"]["value"] == 1.9
    assert period0["Handicap"]["1.0"]["Win2"]["value"] == 2.0
    assert period0["Totals"]["3.5"]["WinMore"]["value"] == 1.943
    assert period0["FirstTeamTotals"]["2.5"]["WinMore"]["value"] == 2.28
    assert period0["SecondTeamTotals"]["1.5"]["WinMore"]["value"] == 2.65
    assert period0["BTTS"]["Yes"]["value"] == 1.51
    assert period0["BTTS"]["No"]["value"] == 2.82
    assert period0["CorrectScore"]["2:1"]["value"] == 9.64
    assert special_counts[12345] == 2
    assert special_names[12345] == ["Both Teams To Score?", "Correct Score"]


def test_compare_games_reports_missing_keys_and_price_mismatch():
    api_game = {
        "Periods": [
            {
                "Win1x2": {
                    "Win1": {"value": 1.5},
                    "Win2": {"value": 2.7},
                },
                "BTTS": {
                    "Yes": {"value": 1.8},
                    "No": {"value": 2.0},
                },
            }
        ]
    }
    runtime_game = {
        "Periods": [
            {
                "Win1x2": {
                    "Win1": {"value": 1.5},
                    "Win2": {"value": 2.8},
                },
            }
        ]
    }

    result = parity.compare_games(api_game, runtime_game, tolerance=0.001)

    assert result["api_outcome_count"] == 4
    assert result["runtime_outcome_count"] == 2
    assert result["missing_in_runtime_count"] == 2
    assert result["price_mismatch_count"] == 1
    assert "P0|BTTS|Yes" in result["missing_in_runtime_sample"]
    assert result["price_mismatches_sample"][0]["key"] == "P0|Win1x2|Win2"


def test_api_sport_snapshot_filtered_respects_live_flag():
    snapshot = parity.ApiSportSnapshot(
        sport_id=29,
        sport_name="Soccer",
        fixtures={},
        odds={},
        special_fixtures=None,
        special_odds=None,
        games={
            1: {"Pid": 1, "isLive": False},
            2: {"Pid": 2, "isLive": True},
        },
        special_counts=parity.Counter({1: 3, 2: 5}),
        special_names={1: ["A"], 2: ["B"]},
    )

    prematch = snapshot.filtered(prematch_only=True)
    live = snapshot.filtered(live_only=True)

    assert set(prematch.games) == {1}
    assert prematch.special_counts == parity.Counter({1: 3})
    assert prematch.special_names == {1: ["A"]}
    assert set(live.games) == {2}
    assert live.special_counts == parity.Counter({2: 5})
    assert live.special_names == {2: ["B"]}
