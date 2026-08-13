import config as _cfg
import core.subscription as subscription
import core.subscription_sport_fo as _sport_fo
from state import state


def _reset_state():
    state.events_data = {}
    state.lane_epoch_start_ts = {}
    state.lane_fo_confirm_ts = {}
    state.lane_uo_confirm_ts = {}
    state.lane_idle_fo_last_sent_ts = {}
    state.lane_idle_fo_pending_ts = {}
    state.lane_idle_fo_last_warn_ts = {}
    _cfg.PS3838_SPORT_FO_IDLE_LIVE_ENABLED = True
    _sport_fo.PS3838_SPORT_FO_IDLE_LIVE_ENABLED = True
    _cfg.PS3838_SPORT_FO_IDLE_LIVE_WARN_SEC = 15.0
    _sport_fo.PS3838_SPORT_FO_IDLE_LIVE_WARN_SEC = 15.0


def test_idle_lane_refresh_due_for_quiet_live_classic_lane():
    _reset_state()
    state.events_data = {
        1001: {
            "isLive": True,
            "SportName": "Soccer",
            "Raw": {"sport_id": 29},
        }
    }
    state.lane_epoch_start_ts = {"S29B1": 100.0}
    state.lane_fo_confirm_ts = {"S29B1": 101.0}
    due, quiet_for = subscription._sport_fo_idle_lane_refresh_due(
        29,
        1,
        106.0,
        gap_sec=4.0,
        min_interval_sec=4.0,
    )
    assert due is True
    assert quiet_for == 5.0


def test_idle_lane_refresh_not_due_when_recent_uo_or_recent_idle_send():
    _reset_state()
    state.events_data = {
        1002: {
            "isLive": True,
            "SportName": "Soccer",
            "Raw": {"sport_id": 29},
        }
    }
    state.lane_epoch_start_ts = {"S29B1": 100.0}
    state.lane_fo_confirm_ts = {"S29B1": 101.0}
    state.lane_uo_confirm_ts = {"S29B1": 104.5}
    due, quiet_for = subscription._sport_fo_idle_lane_refresh_due(
        29,
        1,
        107.0,
        gap_sec=4.0,
        min_interval_sec=4.0,
    )
    assert due is False
    assert quiet_for == 2.5

    state.lane_uo_confirm_ts = {}
    state.lane_idle_fo_last_sent_ts = {"S29B1": 104.5}
    due, quiet_for = subscription._sport_fo_idle_lane_refresh_due(
        29,
        1,
        107.0,
        gap_sec=4.0,
        min_interval_sec=4.0,
    )
    assert due is False
    assert quiet_for == 6.0


def test_idle_lane_refresh_not_due_without_live_events_for_sport():
    _reset_state()
    state.events_data = {
        1003: {
            "isLive": False,
            "SportName": "Soccer",
            "Raw": {"sport_id": 29},
        },
        1004: {
            "isLive": True,
            "SportName": "Basketball",
            "Raw": {"sport_id": 4},
        },
    }
    state.lane_epoch_start_ts = {"S29B1": 100.0}
    state.lane_fo_confirm_ts = {"S29B1": 101.0}
    due, quiet_for = subscription._sport_fo_idle_lane_refresh_due(
        29,
        1,
        106.0,
        gap_sec=4.0,
        min_interval_sec=4.0,
    )
    assert due is False
    assert quiet_for == 0.0


def test_idle_lane_refresh_due_for_live_team_totals_lane_only_when_present():
    _reset_state()
    state.events_data = {
        2001: {
            "isLive": True,
            "SportName": "Basketball",
            "Raw": {"sport_id": 4},
            "Periods": [
                {
                    "FirstTeamTotals": {"91.5": {"WinMore": {"value": 1.9}, "WinLess": {"value": 1.9}}},
                    "SecondTeamTotals": {"88.5": {"WinMore": {"value": 1.9}, "WinLess": {"value": 1.9}}},
                }
            ],
        }
    }
    state.lane_epoch_start_ts = {"S4B100": 100.0}
    state.lane_fo_confirm_ts = {"S4B100": 101.0}
    due, quiet_for = subscription._sport_fo_idle_lane_refresh_due(
        4,
        100,
        106.0,
        gap_sec=4.0,
        min_interval_sec=4.0,
    )
    assert due is True
    assert quiet_for == 5.0



def test_idle_lane_refresh_not_due_while_pending_request_is_recent():
    _reset_state()
    state.events_data = {
        1005: {
            "isLive": True,
            "SportName": "Soccer",
            "Raw": {"sport_id": 29},
        }
    }
    state.lane_epoch_start_ts = {"S29B1": 100.0}
    state.lane_fo_confirm_ts = {"S29B1": 101.0}
    state.lane_idle_fo_pending_ts = {"S29B1": 102.5}
    due, quiet_for = subscription._sport_fo_idle_lane_refresh_due(
        29,
        1,
        107.0,
        gap_sec=4.0,
        min_interval_sec=4.0,
    )
    assert due is False
    assert quiet_for == 6.0


def test_idle_lane_refresh_due_again_when_pending_request_is_too_old():
    _reset_state()
    state.events_data = {
        1006: {
            "isLive": True,
            "SportName": "Soccer",
            "Raw": {"sport_id": 29},
        }
    }
    state.lane_epoch_start_ts = {"S29B1": 100.0}
    state.lane_fo_confirm_ts = {"S29B1": 101.0}
    state.lane_idle_fo_pending_ts = {"S29B1": 90.0}
    due, quiet_for = subscription._sport_fo_idle_lane_refresh_due(
        29,
        1,
        107.0,
        gap_sec=4.0,
        min_interval_sec=4.0,
    )
    assert due is True
    assert quiet_for == 6.0


def test_inventory_resubscribe_due_soon_uses_idle_tick_window():
    assert subscription._inventory_resubscribe_due_soon(101.8, 101.0, tick_sec=1.0) is True
    assert subscription._inventory_resubscribe_due_soon(102.2, 101.0, tick_sec=1.0) is False
    assert subscription._inventory_resubscribe_due_soon(100.5, 101.0, tick_sec=1.0) is True


def test_inventory_resubscribe_due_soon_can_use_expanded_horizon():
    assert subscription._inventory_resubscribe_due_soon(104.5, 101.0, horizon_sec=4.0) is True
    assert subscription._inventory_resubscribe_due_soon(105.2, 101.0, horizon_sec=4.0) is False


def test_idle_inventory_promotion_picks_quiet_lane_when_inventory_is_close():
    _reset_state()
    state.events_data = {
        1007: {
            "isLive": True,
            "SportName": "Soccer",
            "Raw": {"sport_id": 29},
        }
    }
    state.lane_epoch_start_ts = {"S29B1": 100.0}
    state.lane_fo_confirm_ts = {"S29B1": 101.0}

    promoted = subscription._sport_fo_idle_inventory_promotion_candidates(
        [29],
        [1],
        112.0,
        115.0,
    )

    assert promoted == {"S29B1": 11.0}
