import asyncio
import copy
import time

import handlers.uo_handler as uo_handler
from state import state


def _snapshot_state():
    return copy.deepcopy(state.__dict__)


def _restore_state(snapshot):
    state.__dict__.clear()
    state.__dict__.update(snapshot)


def _run_handle_update_odds(data, parsed_games, label="TST-UO"):
    async def fake_process_data(_data, force_live=None, skip_time_update=True, inline_parse=True):
        return parsed_games

    async def fake_broadcast_games(_parsed, _label):
        return None

    return asyncio.run(
        uo_handler.handle_update_odds(
            data,
            True,
            label,
            fake_process_data,
            fake_broadcast_games,
        )
    )


def test_update_odds_does_not_refresh_event_existence_timestamps():
    snapshot = _snapshot_state()
    try:
        original_seen = "2026-03-21T10:00:00Z"
        original_created = "2026-03-21T09:59:00Z"
        original_confirmed = "2026-03-21T09:58:00Z"
        state.events_data = {
            101: {
                "Pid": 101,
                "isLive": True,
                "SportName": "Basketball",
                "LastSeenAt": original_seen,
                "CreatedAt": original_created,
                "PriceConfirmedAt": original_confirmed,
                "Periods": [
                    {
                        "Totals": {
                            "150.5": {
                                "WinMore": {"value": 1.91},
                                "WinLess": {"value": 1.91},
                            }
                        },
                        "_Totals_ts": time.time() - 20,
                    }
                ],
            }
        }
        state.raw_events = {101: {"is_live": True, "sport_id": 4, "event": [101]}}
        state.last_u_touched_markets = {101: {(0, "Totals")}}
        data = {"odds": {"u": [[4, [[0, 0, 101]]]]}}
        parsed = [
            {
                "Pid": 101,
                "isLive": True,
                "SportName": "Basketball",
                "Periods": [
                    {
                        "Totals": {
                            "150.5": {
                                "WinMore": {"value": 1.83},
                                "WinLess": {"value": 1.99},
                            }
                        }
                    }
                ],
            }
        ]

        _run_handle_update_odds(data, parsed)

        event = state.events_data[101]
        assert event["LastSeenAt"] == original_seen
        assert event["CreatedAt"] == original_created
        assert event["PriceConfirmedAt"] == original_confirmed
        assert event["Periods"][0]["_Totals_ts"] > time.time() - 2
        assert state.update_signal_ts[101] > 0
        assert state.board_signal_ts[101] > 0
        assert 101 in state.uo_validated_events
    finally:
        _restore_state(snapshot)


def test_update_odds_empty_parse_does_not_mark_valid_data_time():
    snapshot = _snapshot_state()
    try:
        state.events_data = {
            101: {
                "Pid": 101,
                "isLive": True,
                "SportName": "Basketball",
                "LastSeenAt": "2026-03-21T10:00:00Z",
                "CreatedAt": "2026-03-21T09:59:00Z",
                "Periods": [{}],
            }
        }
        state.raw_events = {101: {"is_live": True, "sport_id": 4, "event": [101]}}
        state.last_u_touched_markets = {}
        state.last_valid_data_time = 123.456
        data = {"odds": {"u": [[4, [[0, 0, 101]]]]}}

        _run_handle_update_odds(data, [])

        assert state.last_valid_data_time == 123.456
    finally:
        _restore_state(snapshot)


def test_update_odds_empty_parse_still_marks_raw_lane_uo_confirm():
    snapshot = _snapshot_state()
    try:
        state.events_data = {}
        state.raw_events = {}
        state.last_u_touched_markets = {}
        data = {
            "odds": {
                "u": [
                    [4, [[0, 1, 101], [0, 4, 202]]],
                ]
            }
        }

        _run_handle_update_odds(data, [])

        assert state.lane_uo_confirm_ts["S4B1"] > 0
        assert state.lane_uo_confirm_ts["S4B100"] > 0
    finally:
        _restore_state(snapshot)


def test_update_odds_price_none_marks_market_closed_without_touching_event_existence():
    snapshot = _snapshot_state()
    try:
        original_seen = "2026-03-21T10:00:00Z"
        state.events_data = {
            202: {
                "Pid": 202,
                "isLive": True,
                "SportName": "Basketball",
                "LastSeenAt": original_seen,
                "CreatedAt": "2026-03-21T09:59:00Z",
                "Periods": [
                    {
                        "Totals": {
                            "165.5": {
                                "WinMore": {"value": 1.95},
                                "WinLess": {"value": 1.87},
                            }
                        }
                    }
                ],
            }
        }
        state.raw_events = {202: {"is_live": True, "sport_id": 4, "event": [202]}}
        state.last_u_touched_markets = {202: {(0, "Totals")}}
        data = {"odds": {"u": [[4, [[0, 0, 202]]]]}}
        parsed = [
            {
                "Pid": 202,
                "isLive": True,
                "SportName": "Basketball",
                "Periods": [{}],
            }
        ]

        _run_handle_update_odds(data, parsed)

        period = state.events_data[202]["Periods"][0]
        assert period["_Totals_closed_ts"] > 0
        assert period["_Totals_ts"] > 0
        assert state.events_data[202]["LastSeenAt"] == original_seen
    finally:
        _restore_state(snapshot)


def test_update_odds_maps_volleyball_classic_touches_to_sets_markets():
    snapshot = _snapshot_state()
    try:
        stale_ts = time.time() - 20
        state.events_data = {
            303: {
                "Pid": 303,
                "isLive": True,
                "SportName": "Volleyball",
                "Periods": [
                    {
                        "SetsHandicap": {
                            "-1.5": {
                                "Win1": {"value": 1.91},
                                "Win2": {"value": 1.91},
                            }
                        },
                        "SetsTotal": {
                            "3.5": {
                                "WinMore": {"value": 1.88},
                                "WinLess": {"value": 1.92},
                            }
                        },
                        "_SetsHandicap_ts": stale_ts,
                        "_SetsTotal_ts": stale_ts,
                    }
                ],
            }
        }
        state.raw_events = {303: {"is_live": True, "sport_id": 34, "event": [303]}}
        state.last_u_touched_markets = {303: {(0, "Handicap"), (0, "Totals")}}
        data = {"odds": {"u": [[34, [[0, 0, 303]]]]}}
        parsed = [
            {
                "Pid": 303,
                "isLive": True,
                "SportName": "Volleyball",
                "Periods": [
                    {
                        "SetsHandicap": {
                            "-1.5": {
                                "Win1": {"value": 1.95},
                                "Win2": {"value": 1.87},
                            }
                        },
                        "SetsTotal": {
                            "3.5": {
                                "WinMore": {"value": 1.84},
                                "WinLess": {"value": 1.96},
                            }
                        },
                    }
                ],
            }
        ]

        _run_handle_update_odds(data, parsed)

        period = state.events_data[303]["Periods"][0]
        assert period["_SetsHandicap_ts"] > time.time() - 2
        assert period["_SetsTotal_ts"] > time.time() - 2
        assert state.board_signal_ts[303] > 0
    finally:
        _restore_state(snapshot)


def test_lane_wide_stamp_skips_untouched_closure_guard_markets():
    """Closure-guard markets (Win1x2, Handicap, Totals) must NOT get fresh
    timestamps from lane-wide stamping when only a different market was
    touched.  This prevents stale prices from appearing fresh during the
    timing gap between an exchange halt and receipt of the halt UO signal."""
    snapshot = _snapshot_state()
    try:
        stale_ts = time.time() - 20
        state.events_data = {
            501: {
                "Pid": 501,
                "isLive": True,
                "SportName": "Soccer",
                "Raw": {"sport_id": 29},
                "Periods": [
                    {
                        "Win1x2": {
                            "Win1": {"value": 2.50},
                            "WinNone": {"value": 3.20},
                            "Win2": {"value": 2.80},
                        },
                        "Totals": {
                            "2.5": {
                                "WinMore": {"value": 1.91},
                                "WinLess": {"value": 1.91},
                            }
                        },
                        "Handicap": {
                            "0.0": {
                                "Win1": {"value": 1.95},
                                "Win2": {"value": 1.87},
                            }
                        },
                        "_Win1x2_ts": stale_ts,
                        "_Totals_ts": stale_ts,
                        "_Handicap_ts": stale_ts,
                    }
                ],
            }
        }
        state.raw_events = {501: {"is_live": True, "sport_id": 29, "event": [501]}}
        # Only Totals was touched — Win1x2 and Handicap should NOT be refreshed
        state.last_u_touched_markets = {501: {(0, "Totals")}}
        data = {"odds": {"u": [[29, [[0, 3, 501]]]]}}
        parsed = [
            {
                "Pid": 501,
                "isLive": True,
                "SportName": "Soccer",
                "Periods": [
                    {
                        "Totals": {
                            "2.5": {
                                "WinMore": {"value": 1.85},
                                "WinLess": {"value": 1.97},
                            }
                        }
                    }
                ],
            }
        ]

        _run_handle_update_odds(data, parsed, label="S29B1")

        period = state.events_data[501]["Periods"][0]
        # Totals was directly touched — must be fresh
        assert period["_Totals_ts"] > time.time() - 2
        # Win1x2 and Handicap were NOT touched — must stay stale
        # (prevents stale halted prices from looking fresh)
        assert period["_Win1x2_ts"] == stale_ts
        assert period["_Handicap_ts"] == stale_ts
    finally:
        _restore_state(snapshot)


def test_update_odds_refreshes_only_markets_owned_by_current_lane_label():
    snapshot = _snapshot_state()
    try:
        stale_ts = time.time() - 20
        state.events_data = {
            350: {
                "Pid": 350,
                "isLive": True,
                "SportName": "Basketball",
                "Periods": [
                    {
                        "Win1x2": {
                            "Win1": {"value": 1.70},
                            "Win2": {"value": 2.20},
                        },
                        "FirstTeamTotals": {
                            "74.5": {
                                "WinMore": {"value": 1.91},
                                "WinLess": {"value": 1.91},
                            }
                        },
                        "SecondTeamTotals": {
                            "76.5": {
                                "WinMore": {"value": 1.88},
                                "WinLess": {"value": 1.94},
                            }
                        },
                        "_Win1x2_ts": stale_ts,
                        "_FirstTeamTotals_ts": stale_ts,
                        "_SecondTeamTotals_ts": stale_ts,
                    }
                ],
            }
        }
        state.raw_events = {350: {"is_live": True, "sport_id": 4, "event": [350]}}
        state.last_u_touched_markets = {350: {(0, "FirstTeamTotals")}}
        data = {"odds": {"u": [[4, [[0, 0, 350]]]]}}
        parsed = [
            {
                "Pid": 350,
                "isLive": True,
                "SportName": "Basketball",
                "Periods": [
                    {
                        "FirstTeamTotals": {
                            "74.5": {
                                "WinMore": {"value": 1.83},
                                "WinLess": {"value": 1.99},
                            }
                        }
                    }
                ],
            }
        ]

        _run_handle_update_odds(data, parsed, label="S4B100")

        period = state.events_data[350]["Periods"][0]
        assert period["_FirstTeamTotals_ts"] > time.time() - 2
        # SecondTeamTotals is a closure-guard market that was NOT directly
        # touched — lane-wide stamping no longer refreshes it to prevent
        # stale halted prices from appearing fresh.
        assert period["_SecondTeamTotals_ts"] == stale_ts
        assert period["_Win1x2_ts"] == stale_ts
    finally:
        _restore_state(snapshot)


def test_update_odds_keeps_source_limited_tennis_touches_on_classic_keys():
    snapshot = _snapshot_state()
    try:
        stale_ts = time.time() - 20
        limited_until = time.time() + 30
        state.events_data = {
            404: {
                "Pid": 404,
                "isLive": True,
                "SportName": "Tennis",
                "_tennis_sets_source_limited_until": limited_until,
                "Periods": [
                    {
                        "Handicap": {
                            "2.5": {
                                "Win1": {"value": 1.91},
                                "Win2": {"value": 1.91},
                            }
                        },
                        "Totals": {
                            "22.5": {
                                "WinMore": {"value": 1.88},
                                "WinLess": {"value": 1.92},
                            }
                        },
                        "_Handicap_ts": stale_ts,
                        "_Totals_ts": stale_ts,
                    }
                ],
            }
        }
        state.raw_events = {404: {"is_live": True, "sport_id": 33, "event": [404]}}
        state.last_u_touched_markets = {404: {(0, "Handicap"), (0, "Totals")}}
        data = {"odds": {"u": [[33, [[0, 0, 404]]]]}}
        parsed = [
            {
                "Pid": 404,
                "isLive": True,
                "SportName": "Tennis",
                "_tennis_sets_source_limited_until": limited_until,
                "Periods": [
                    {
                        "Handicap": {
                            "2.5": {
                                "Win1": {"value": 1.85},
                                "Win2": {"value": 1.97},
                            }
                        },
                        "Totals": {
                            "22.5": {
                                "WinMore": {"value": 1.84},
                                "WinLess": {"value": 1.98},
                            }
                        },
                    }
                ],
            }
        ]

        _run_handle_update_odds(data, parsed)

        period = state.events_data[404]["Periods"][0]
        assert period["_Handicap_ts"] > time.time() - 2
        assert period["_Totals_ts"] > time.time() - 2
        assert "_SetsHandicap_ts" not in period
        assert "_SetsTotal_ts" not in period
        assert state.board_signal_ts[404] > 0
    finally:
        _restore_state(snapshot)
