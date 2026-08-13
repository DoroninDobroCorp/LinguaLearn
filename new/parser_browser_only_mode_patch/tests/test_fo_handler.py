import copy
import asyncio

import handlers.fo_handler as fo_handler
from state import state


def _snapshot_state() -> dict:
    return copy.deepcopy(state.__dict__)


def _restore_state(snapshot: dict) -> None:
    state.__dict__.clear()
    state.__dict__.update(snapshot)


def _single_live_odds_payload() -> dict:
    return {
        "odds": {
            "l": [
                [33, "Tennis", [[1, "League", [{}]]]],
            ],
            "n": [],
        }
    }


def _single_live_soccer_odds_payload() -> dict:
    return {
        "odds": {
            "l": [
                [29, "Soccer", [[1, "League", [{}]]]],
            ],
            "n": [],
        }
    }


def _single_live_volleyball_odds_payload() -> dict:
    return {
        "odds": {
            "l": [
                [34, "Volleyball", [[1, "League", [{}]]]],
            ],
            "n": [],
        }
    }


def _single_live_esports_odds_payload() -> dict:
    return {
        "odds": {
            "l": [
                [12, "ESports", [[1, "League", [{}]]]],
            ],
            "n": [],
        }
    }


def _single_prematch_esports_odds_payload() -> dict:
    return {
        "odds": {
            "l": [],
            "n": [
                [12, "ESports", [[1, "League", [{}]]]],
            ],
        }
    }


def _single_live_basketball_odds_payload() -> dict:
    return {
        "odds": {
            "l": [
                [4, "Basketball", [[1, "League", [{}]]]],
            ],
            "n": [],
        }
    }


def _combined_basketball_odds_payload() -> dict:
    return {
        "odds": {
            "l": [
                [4, "Basketball", [[1, "League", [{}]]]],
            ],
            "n": [
                [4, "Basketball", [[1, "League", [{}]]]],
            ],
        }
    }


def _patch_runtime(monkeypatch):
    async def fake_broadcast(_payload):
        return None

    monkeypatch.setattr(fo_handler, "broadcast", fake_broadcast)
    monkeypatch.setattr(fo_handler, "map_game_pid", lambda game: game)
    monkeypatch.setattr(fo_handler, "should_drop_stale", lambda: True)
    monkeypatch.setattr(fo_handler, "_build_update_payload", lambda payload: payload)
    monkeypatch.setattr(fo_handler, "_filter_markets", lambda game: game)



def _basketball_live_game(event_id: int = 401) -> dict:
    return {
        "Pid": event_id,
        "isLive": True,
        "SportName": "Basketball",
        "homeName": "A",
        "awayName": "B",
        "Periods": [{
            "Win1x2": {
                "Win1": {"value": 1.8},
                "Win2": {"value": 2.0},
            },
            "Handicap": {
                "-1.5": {
                    "Win1": {"value": 1.9},
                    "Win2": {"value": 1.9},
                }
            },
            "Totals": {
                "150.5": {
                    "WinMore": {"value": 1.9},
                    "WinLess": {"value": 1.9},
                }
            },
        }],
    }


def _basketball_prematch_game(event_id: int = 402) -> dict:
    game = _basketball_live_game(event_id=event_id)
    game["isLive"] = False
    return game


def test_purge_event_runtime_state_clears_bia_runtime_state():
    snapshot = _snapshot_state()
    try:
        purged_event_id = 499
        state.events_data = {
            purged_event_id: _basketball_prematch_game(event_id=purged_event_id),
        }
        state.event_source = {purged_event_id: "ps3838"}
        state.raw_events = {
            purged_event_id: {"is_live": False, "sport_id": 4},
            501: {"is_live": False, "sport_id": 4},
            502: {"is_live": False, "sport_id": 4},
            503: {"is_live": False, "sport_id": 4},
        }
        state.last_broadcast_ts = {purged_event_id: 101.0}
        state.bia_specials_signature = {purged_event_id: {0: b"sig"}}
        state.update_signal_ts = {purged_event_id: 105.0}
        state.board_signal_ts = {purged_event_id: 106.0}
        state.list_signal_event_ts = {purged_event_id: 107.0}
        state.last_u_touched_markets = {purged_event_id: {(0, "BTTS")}}

        fo_handler._purge_event_runtime_state(purged_event_id)

        assert purged_event_id not in state.events_data
        assert purged_event_id not in state.event_source
        assert purged_event_id not in state.raw_events
        assert purged_event_id not in state.last_broadcast_ts
        assert purged_event_id not in state.bia_specials_signature
        assert purged_event_id not in state.update_signal_ts
        assert purged_event_id not in state.board_signal_ts
        assert purged_event_id not in state.list_signal_event_ts
        assert purged_event_id not in state.last_u_touched_markets
    finally:
        _restore_state(snapshot)


def test_combined_full_odds_does_not_clear_idle_live_pending(monkeypatch):
    snapshot = _snapshot_state()
    try:
        _patch_runtime(monkeypatch)
        monkeypatch.setattr(fo_handler.time, "time", lambda: 200.0)
        state.raw_events = {401: {"is_live": True, "sport_id": 4}}
        state.events_data = {}
        state.event_source = {}
        state.last_broadcast_ts = {}
        state.lane_idle_fo_pending_ts = {"S4B1": 100.0}
        state.lane_idle_fo_last_warn_ts = {"S4B1": 99.0}
        state.lane_fo_confirm_ts = {}
        state.lane_uo_confirm_ts = {}

        async def _process_data(*args, **kwargs):
            return [_basketball_live_game(), _basketball_prematch_game()]

        asyncio.run(
            fo_handler.handle_full_odds(
                _combined_basketball_odds_payload(),
                None,
                "S4",
                _process_data,
                None,
            )
        )

        assert state.lane_idle_fo_pending_ts["S4B1"] == 100.0
        assert state.lane_idle_fo_last_warn_ts["S4B1"] == 99.0
        assert state.lane_fo_confirm_ts["S4B1"] == 200.0
    finally:
        _restore_state(snapshot)


def test_live_only_full_odds_clears_idle_live_pending(monkeypatch):
    snapshot = _snapshot_state()
    try:
        _patch_runtime(monkeypatch)
        monkeypatch.setattr(fo_handler.time, "time", lambda: 200.0)
        state.raw_events = {401: {"is_live": True, "sport_id": 4}}
        state.events_data = {}
        state.event_source = {}
        state.last_broadcast_ts = {}
        state.lane_idle_fo_pending_ts = {"S4B1": 100.0}
        state.lane_idle_fo_last_warn_ts = {"S4B1": 99.0}
        state.lane_fo_confirm_ts = {}
        state.lane_uo_confirm_ts = {}

        async def _process_data(*args, **kwargs):
            return [_basketball_live_game()]

        asyncio.run(
            fo_handler.handle_full_odds(
                _single_live_basketball_odds_payload(),
                None,
                "S4",
                _process_data,
                None,
            )
        )

        assert "S4B1" not in state.lane_idle_fo_pending_ts
        assert "S4B1" not in state.lane_idle_fo_last_warn_ts
        assert state.lane_fo_confirm_ts["S4B1"] == 200.0
    finally:
        _restore_state(snapshot)


def test_carry_runtime_backoff_fields_preserves_active_flags():
    target = {}
    source = {
        "_child_empty_classic_streak": 3,
        "_child_empty_classic_last_ts": 490.0,
        "_child_empty_classic_backoff_until": 560.0,
        "_tennis_sets_empty_streak": 2,
        "_tennis_sets_empty_last_ts": 491.0,
        "_tennis_sets_source_limited_until": 570.0,
        "_tennis_sets_source_limited_raw_event_id": 9102,
        "_tennis_sets_source_probe_due_ts": 530.0,
    }

    fo_handler._carry_runtime_backoff_fields(target, source, 500.0)

    assert target["_child_empty_classic_streak"] == 3
    assert target["_child_empty_classic_last_ts"] == 490.0
    assert target["_child_empty_classic_backoff_until"] == 560.0
    assert target["_tennis_sets_empty_streak"] == 2
    assert target["_tennis_sets_empty_last_ts"] == 491.0
    assert target["_tennis_sets_source_limited_until"] == 570.0
    assert target["_tennis_sets_source_limited_raw_event_id"] == 9102
    assert target["_tennis_sets_source_probe_due_ts"] == 530.0


def test_existing_live_event_skips_prematch_overwrite(monkeypatch):
    snapshot = _snapshot_state()
    try:
        now_ts = 500.0
        monkeypatch.setattr(fo_handler.time, "time", lambda: now_ts)

        async def _noop_broadcast(*args, **kwargs):
            return None

        monkeypatch.setattr(fo_handler, "broadcast", _noop_broadcast)
        monkeypatch.setattr(fo_handler, "should_drop_stale", lambda *args, **kwargs: False)

        state.events_data = {
            8101: {
                "Pid": 8101,
                "isLive": True,
                "SportName": "ESports",
                "homeName": "faze",
                "awayName": "tyloo",
                "Periods": [{
                    "Win1x2": {
                        "Win1": {"value": 1.8},
                        "Win2": {"value": 2.0},
                    },
                }],
                "_child_empty_classic_streak": 5,
                "_child_empty_classic_backoff_until": 560.0,
            }
        }
        state.event_source = {8101: "ps3838"}
        state.raw_events = {}
        state.last_broadcast_ts = {}

        parsed = [{
            "Pid": 8101,
            "isLive": False,
            "SportName": "ESports",
            "homeName": "faze",
            "awayName": "tyloo",
            "Periods": [{
                "Win1x2": {
                    "Win1": {"value": 1.9},
                    "Win2": {"value": 1.9},
                },
            }],
        }]

        async def _process_data(*args, **kwargs):
            return parsed

        asyncio.run(
            fo_handler.handle_full_odds(
                _single_prematch_esports_odds_payload(),
                False,
                "FO-PM",
                _process_data,
                None,
            )
        )

        event = state.events_data[8101]
        assert event["isLive"] is True
        assert event["_child_empty_classic_streak"] == 5
        assert event["_child_empty_classic_backoff_until"] == 560.0
    finally:
        _restore_state(snapshot)


def test_score_snapshot_normalizes_zero_strings():
    has_score, home_score, away_score = fo_handler._score_snapshot(
        {
            "HasScore": "true",
            "HomeScore": "0",
            "AwayScore": "0.0",
        }
    )

    assert has_score is True
    assert home_score == 0.0
    assert away_score == 0.0


def test_sparse_live_classic_p0_preserve_detects_soccer_handicap_only():
    old_game = {
        "Pid": 8001,
        "isLive": True,
        "SportName": "Soccer",
        "Periods": [{
            "Win1x2": {
                "Win1": {"value": 1.8},
                "Win2": {"value": 2.0},
            },
            "Handicap": {
                "0.0": {
                    "Win1": {"value": 1.91},
                    "Win2": {"value": 1.91},
                }
            },
            "Totals": {
                "2.5": {
                    "WinMore": {"value": 1.91},
                    "WinLess": {"value": 1.91},
                }
            },
        }],
    }
    new_game = {
        "Pid": 8001,
        "isLive": True,
        "SportName": "Soccer",
        "Periods": [{
            "Handicap": {
                "0.0": {
                    "Win1": {"value": 1.95},
                    "Win2": {"value": 1.87},
                }
            },
            "Win1x2": {
                "Win1": {"value": 0},
                "Win2": {"value": 0},
            },
        }],
    }

    assert fo_handler._should_preserve_sparse_live_classic_p0(
        old_game,
        new_game,
        is_child_origin=False,
    ) is True
