import copy

from parsing.parser import merge_period


def test_partial_empty_line_maps_do_not_clear_existing_classic_markets():
    target = {
        "Totals": {
            "210.5": {"WinMore": {"value": 1.91}, "WinLess": {"value": 1.91}, "LineId": 123},
        },
        "Handicap": {
            "-4.5": {"Win1": {"value": 1.87}, "Win2": {"value": 1.95}, "LineId": 456},
        },
        "_Totals_ts": 1000.0,
        "_Handicap_ts": 1000.0,
    }
    source = {"Totals": {}, "Handicap": {}}

    merge_period(target, source, authoritative=False)

    assert "210.5" in target["Totals"]
    assert "-4.5" in target["Handicap"]
    assert target["_Totals_ts"] == 1000.0
    assert target["_Handicap_ts"] == 1000.0


def test_partial_empty_line_map_clears_only_when_explicitly_allowed():
    target = {
        "Totals": {"210.5": {"WinMore": {"value": 1.91}, "WinLess": {"value": 1.91}, "LineId": 123}},
        "Handicap": {"-4.5": {"Win1": {"value": 1.87}, "Win2": {"value": 1.95}, "LineId": 456}},
        "_Totals_ts": 1000.0,
        "_Handicap_ts": 1000.0,
    }
    source = {
        "Totals": {},
        "Handicap": {},
        "_allow_empty_clear": ["Totals"],
    }

    merge_period(target, copy.deepcopy(source), authoritative=False)

    assert "Totals" not in target
    assert "_Totals_ts" not in target
    assert "-4.5" in target["Handicap"]
    assert target["_Handicap_ts"] == 1000.0


def test_non_authoritative_named_market_maps_merge_instead_of_replace():
    target = {
        "CorrectScore": {"1:0": {"value": 8.5}},
        "ExactTotalGoals": {"2": {"value": 1.892}},
        "TotalGoalsRange": {"4-6": {"value": 5.6}},
        "WinningMargin": {
            "Home By 1": {"value": 4.8},
            "Away By 1": {"value": 5.1},
        },
    }
    source = {
        "CorrectScore": {"1:1": {"value": 1.98}},
        "ExactTotalGoals": {"3": {"value": 3.25}},
        "TotalGoalsRange": {"1-3": {"value": 1.72}},
        "WinningMargin": {
            "Home By 2": {"value": 7.4},
            "Away By 2": {"value": 8.1},
        },
    }

    merge_period(target, copy.deepcopy(source), authoritative=False)

    assert sorted(target["CorrectScore"]) == ["1:0", "1:1"]
    assert sorted(target["ExactTotalGoals"]) == ["2", "3"]
    assert sorted(target["TotalGoalsRange"]) == ["1-3", "4-6"]
    assert sorted(target["WinningMargin"]) == [
        "Away By 1",
        "Away By 2",
        "Home By 1",
        "Home By 2",
    ]
