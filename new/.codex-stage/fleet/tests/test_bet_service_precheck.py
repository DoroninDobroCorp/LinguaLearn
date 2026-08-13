import pytest

import services.bet_service as bet_service
from services.bet_service import _inspect_standard_selection


@pytest.mark.asyncio
async def test_real_place_fails_closed_when_parser_owned_session_is_stale(
    tmp_path, monkeypatch
):
    monkeypatch.setattr(bet_service, "ENABLE_BETTING", True)
    monkeypatch.setattr(bet_service, "DRY_RUN", False)
    monkeypatch.setattr(bet_service, "PARSER_SESSION_MAX_AGE_SEC", 180.0)
    client = bet_service.PS3838BetClient(str(tmp_path / "missing-session.json"))

    result = await client.place_bet("selection", "1.9", "odds", 1.0)

    assert result["status"] == "BLOCKED"
    assert result["error"] == "PARSER_SESSION_STALE"


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
                "_market_ts": {
                    "Totals": 100.0,
                    "Handicap": 100.0,
                },
            }
        ],
    }


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
