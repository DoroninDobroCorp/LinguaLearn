import pytest

from services.bet_service import _bia_lookup_proof_params, _inspect_standard_selection


def _sample_event():
    return {
        "Pid": 101,
        "isLive": True,
        "Periods": [
            {
                "PeriodNumber": 0,
                "Totals": {
                    "210.5": {
                        "WinMore": {"value": 1.91},
                        "WinLess": {"value": 1.91},
                        "LineId": 321,
                        "LineEventId": 101,
                    }
                },
                "Handicap": {
                    "-4.5": {
                        "Win1": {"value": 1.88},
                        "Win2": {"value": 1.94},
                        "LineId": 654,
                        "LineEventId": 101,
                    }
                },
                "FirstTeamTotals": {
                    "2.5": {
                        "WinMore": {"value": 1.86},
                        "WinLess": {"value": 1.96},
                        "LineId": 777,
                        "LineEventId": 101,
                    }
                },
                "SecondTeamTotals": {
                    "2.5": {
                        "WinMore": {"value": 2.02},
                        "WinLess": {"value": 1.80},
                        "LineId": 778,
                        "LineEventId": 101,
                    }
                },
                "_market_ts": {
                    "Totals": 100.0,
                    "Handicap": 100.0,
                    "FirstTeamTotals": 100.0,
                    "SecondTeamTotals": 100.0,
                },
            }
        ],
    }


def test_bia_lookup_cache_identity_includes_selection_and_uses_root_for_maps():
    period, params, suffix = _bia_lookup_proof_params(1, {
        "bet_type": 3,
        "team_select": 4,
        "handicap": 22.5,
        "map_number": 1,
        "esports_unit": "rounds",
    })
    assert period == 0
    assert params == {
        "proof": 1,
        "bet_type": 3,
        "team_select": 4,
        "handicap": "22.5",
        "map_number": 1,
        "game_number": 0,
        "esports_unit": "rounds",
    }
    _, changed_line, changed_suffix = _bia_lookup_proof_params(1, {
        **params,
        "handicap": 22.25,
    })
    assert changed_line["handicap"] == "22.25"
    assert changed_suffix != suffix


def test_bia_lookup_nonstandard_selection_keeps_backward_event_lookup():
    period, params, suffix = _bia_lookup_proof_params(2, {"special_type": "btts"})
    assert period == 2
    assert params == {}
    assert suffix == "{}"


def test_bia_lookup_standard_coordinates_never_truncate_or_fall_back_event_only():
    poisoned = (
        (1.9, {"bet_type": 1, "team_select": 0, "handicap": 0}),
        (0, {"bet_type": 1.9, "team_select": 0, "handicap": 0}),
        (0, {"bet_type": 1, "team_select": True, "handicap": 0}),
        (0, {"bet_type": 2, "team_select": 0, "handicap": -1.5, "map_number": 1.9}),
        (0, {"bet_type": 1, "team_select": 0, "handicap": 0, "game_number": "bad"}),
    )
    for period, selection in poisoned:
        with pytest.raises(ValueError, match="BIA_STANDARD_SELECTION_INVALID"):
            _bia_lookup_proof_params(period, selection)


def test_bia_lookup_moneyline_without_handicap_still_requires_selection_proof():
    period, params, _suffix = _bia_lookup_proof_params(0, {
        "bet_type": 1,
        "team_select": 1,
    })

    assert period == 0
    assert params["proof"] == 1
    assert params["handicap"] == "0"
    assert params["team_select"] == 1


def test_exact_total_line_is_found_with_side_and_age():
    result = _inspect_standard_selection(
        _sample_event(),
        {
            "event_id": 101,
            "period": 0,
            "bet_type": 3,
            "team_select": 3,
            "handicap": 210.5,
            "line_id": 321,
        },
        now_ts=106.5,
    )

    assert result["ok"] is True
    assert result["market_key"] == "Totals"
    assert result["line_id"] == 321
    assert round(result["age_sec"], 2) == 6.5


def test_missing_exact_total_line_is_blocked_before_verify():
    result = _inspect_standard_selection(
        _sample_event(),
        {
            "event_id": 101,
            "period": 0,
            "bet_type": 3,
            "team_select": 3,
            "handicap": 211.5,
            "line_id": 0,
        },
        now_ts=106.5,
    )

    assert result["ok"] is False
    assert result["reason"] == "LINE_MISSING"


def test_line_id_mismatch_is_detected():
    result = _inspect_standard_selection(
        _sample_event(),
        {
            "event_id": 101,
            "period": 0,
            "bet_type": 2,
            "team_select": 0,
            "handicap": -4.5,
            "line_id": 999,
        },
        now_ts=106.5,
    )

    assert result["ok"] is False
    assert result["reason"] == "LINE_ID_MISMATCH"


def test_team_total_side_contract_uses_ps3838_team_select_values():
    for bet_type, team_select, line_id in ((4, 5, 777), (4, 0, 777), (5, 7, 778), (5, 1, 778)):
        result = _inspect_standard_selection(
            _sample_event(),
            {
                "event_id": 101,
                "period": 0,
                "bet_type": bet_type,
                "team_select": team_select,
                "handicap": 2.5,
                "line_id": line_id,
            },
            now_ts=106.5,
        )
        assert result["ok"] is True
        assert result["line_id"] == line_id


def test_nearby_structural_line_is_never_rounded_into_a_market():
    for poison_line in (2.49, 2.499, 2.50001):
        result = _inspect_standard_selection(
            _sample_event(),
            {
                "event_id": 101,
                "period": 0,
                "bet_type": 4,
                "team_select": 5,
                "handicap": poison_line,
                "line_id": 0,
            },
            now_ts=106.5,
        )
        assert result["ok"] is False
        assert result["reason"] == "LINE_MISSING"
