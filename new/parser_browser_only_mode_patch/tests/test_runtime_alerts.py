from state import state
from utils.runtime_alerts import build_runtime_alerts, collect_live_market_outliers, collect_live_stale_event_logs


def test_live_market_age_alert_ignores_normal_volleyball_cadence():
    alerts = build_runtime_alerts(
        stale=False,
        logged_in=True,
        delay_ms=0,
        live_market_age_p0_by_sport={
            "Volleyball": {
                "SetsHandicap": {"count": 3, "avg_age_sec": 11.0, "min_age_sec": 10.5, "max_age_sec": 11.2},
            },
        },
    )

    assert alerts["active"] == []


def test_live_market_age_alert_uses_15s_threshold_for_other_sports():
    alerts = build_runtime_alerts(
        stale=False,
        logged_in=True,
        delay_ms=0,
        live_market_age_p0_by_sport={
            "Volleyball": {
                "SetsHandicap": {"count": 3, "avg_age_sec": 11.0, "min_age_sec": 10.5, "max_age_sec": 11.2},
            },
            "Basketball": {
                "Totals": {"count": 4, "avg_age_sec": 15.1, "min_age_sec": 14.9, "max_age_sec": 15.2},
            },
        },
    )

    assert alerts["active"][0]["code"] == "live_market_age_high"
    assert alerts["active"][0]["details"]["sport"] == "Basketball"
    assert alerts["active"][0]["details"]["warn_threshold_sec"] == 15.0


def test_live_market_age_alert_uses_relaxed_esports_threshold():
    alerts = build_runtime_alerts(
        stale=False,
        logged_in=True,
        delay_ms=0,
        live_market_age_p0_by_sport={
            "ESports": {
                "Win1x2": {"count": 1, "avg_age_sec": 32.0, "min_age_sec": 32.0, "max_age_sec": 32.0},
            },
        },
    )

    assert alerts["active"] == []


def test_collect_live_market_outliers_uses_lane_confirm_fallback():
    snapshot = dict(state.__dict__)
    try:
        state.lane_epoch_start_ts = {"S29B1": 100.0}
        state.lane_fo_confirm_ts = {"S29B1": 101.0}
        state.lane_uo_confirm_ts = {"S29B1": 109.0}
        events_data = {
            1: {
                "Pid": 1,
                "isLive": True,
                "SportName": "Soccer",
                "Raw": {"sport_id": 29},
                "homeName": "Home",
                "awayName": "Away",
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
        }

        rows = collect_live_market_outliers(
            events_data,
            now_ts=110.0,
            sport_name="Soccer",
            market_key="Win1x2",
            limit=1,
        )

        assert rows[0]["age_sec"] == 1.0
    finally:
        state.__dict__.clear()
        state.__dict__.update(snapshot)


def test_collect_live_stale_event_logs_reports_createdat_vs_market_mismatch():
    snapshot = dict(state.__dict__)
    try:
        state.lane_epoch_start_ts = {}
        state.lane_fo_confirm_ts = {}
        state.lane_uo_confirm_ts = {}
        rows = collect_live_stale_event_logs(
            {
                1: {
                    "Pid": 1,
                    "isLive": True,
                    "SportName": "Soccer",
                    "CreatedAt": "1970-01-01T00:01:20Z",
                    "LastSeenAt": "1970-01-01T00:01:39Z",
                    "Raw": {"event_id": 501, "parent_id": 501, "sport_id": 29},
                    "homeName": "Home",
                    "awayName": "Away",
                    "Periods": [{
                        "Win1x2": {
                            "Win1": {"value": 1.8},
                            "WinNone": {"value": 3.2},
                            "Win2": {"value": 4.0},
                        },
                        "Handicap": {
                            "-0.5": {
                                "Win1": {"value": 1.9},
                                "Win2": {"value": 1.9},
                            }
                        },
                        "Totals": {
                            "2.5": {
                                "WinMore": {"value": 1.95},
                                "WinLess": {"value": 1.87},
                            }
                        },
                        "_Win1x2_ts": 99.0,
                        "_Handicap_ts": 98.0,
                        "_Totals_ts": 97.0,
                    }],
                }
            },
            now_ts=100.0,
            threshold_sec=15.0,
            list_signal_event_ts={1: 99.5},
            update_signal_ts={1: 99.25},
            board_signal_ts={1: 98.5},
        )

        assert len(rows) == 1
        assert rows[0]["reasons"] == ["created_at"]
        assert rows[0]["created_age_sec"] == 20.0
        assert rows[0]["last_seen_age_sec"] == 1.0
        assert rows[0]["p0_market_ages"] == {
            "Win1x2": 1.0,
            "Handicap": 2.0,
            "Totals": 3.0,
        }
        assert rows[0]["list_signal_age_sec"] == 0.5
        assert rows[0]["update_signal_age_sec"] == 0.75
        assert rows[0]["board_signal_age_sec"] == 1.5
    finally:
        state.__dict__.clear()
        state.__dict__.update(snapshot)


def test_collect_live_stale_event_logs_highlights_volleyball_p0_vs_p1plus():
    snapshot = dict(state.__dict__)
    try:
        state.lane_epoch_start_ts = {}
        state.lane_fo_confirm_ts = {}
        state.lane_uo_confirm_ts = {}
        rows = collect_live_stale_event_logs(
            {
                34: {
                    "Pid": 34,
                    "isLive": True,
                    "SportName": "Volleyball",
                    "CreatedAt": "1970-01-01T00:01:38Z",
                    "Raw": {"event_id": 834, "parent_id": 834, "sport_id": 34},
                    "homeName": "Team A",
                    "awayName": "Team B",
                    "Periods": [
                        {
                            "Win1x2": {
                                "Win1": {"value": 1.7},
                                "Win2": {"value": 2.1},
                            },
                            "SetsHandicap": {
                                "-1.5": {
                                    "Win1": {"value": 1.95},
                                    "Win2": {"value": 1.85},
                                }
                            },
                            "SetsTotal": {
                                "180.5": {
                                    "WinMore": {"value": 1.91},
                                    "WinLess": {"value": 1.91},
                                }
                            },
                            "_Win1x2_ts": 99.0,
                            "_SetsHandicap_ts": 70.0,
                            "_SetsTotal_ts": 72.0,
                        },
                        {
                            "Handicap": {
                                "-2.5": {
                                    "Win1": {"value": 1.8},
                                    "Win2": {"value": 2.0},
                                }
                            },
                            "Totals": {
                                "45.5": {
                                    "WinMore": {"value": 1.9},
                                    "WinLess": {"value": 1.9},
                                }
                            },
                            "_Handicap_ts": 96.0,
                            "_Totals_ts": 97.0,
                        },
                    ],
                }
            },
            now_ts=100.0,
            threshold_sec=15.0,
        )

        assert len(rows) == 1
        assert rows[0]["reasons"] == ["market_p0"]
        assert rows[0]["p0_market_ages"] == {
            "Win1x2": 1.0,
            "SetsHandicap": 30.0,
            "SetsTotal": 28.0,
        }
        assert rows[0]["p1plus_point_ages"] == {
            "Handicap": 4.0,
            "Totals": 3.0,
        }
    finally:
        state.__dict__.clear()
        state.__dict__.update(snapshot)


def test_collect_live_stale_event_logs_uses_relaxed_esports_threshold():
    snapshot = dict(state.__dict__)
    try:
        state.lane_epoch_start_ts = {}
        state.lane_fo_confirm_ts = {}
        state.lane_uo_confirm_ts = {}
        rows = collect_live_stale_event_logs(
            {
                12: {
                    "Pid": 12,
                    "isLive": True,
                    "SportName": "ESports",
                    "CreatedAt": "1970-01-01T00:01:30Z",
                    "Raw": {"event_id": 12, "parent_id": 12, "sport_id": 12},
                    "homeName": "Alpha",
                    "awayName": "Beta",
                    "Periods": [{
                        "Win1x2": {
                            "Win1": {"value": 1.8},
                            "Win2": {"value": 2.1},
                        },
                        "Handicap": {
                            "-1.5": {
                                "Win1": {"value": 1.9},
                                "Win2": {"value": 1.9},
                            }
                        },
                        "Totals": {
                            "2.5": {
                                "WinMore": {"value": 1.95},
                                "WinLess": {"value": 1.87},
                            }
                        },
                        "_Win1x2_ts": 70.0,
                        "_Handicap_ts": 70.0,
                        "_Totals_ts": 70.0,
                    }],
                }
            },
            now_ts=100.0,
            threshold_sec=15.0,
        )

        assert rows == []
    finally:
        state.__dict__.clear()
        state.__dict__.update(snapshot)
