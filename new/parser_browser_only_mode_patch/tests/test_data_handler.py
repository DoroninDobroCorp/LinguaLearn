import pytest

from handlers import data_handler
from state import state


def _snapshot_state():
    return dict(state.__dict__)


def _restore_state(snapshot):
    state.__dict__.clear()
    state.__dict__.update(snapshot)


@pytest.mark.asyncio
async def test_process_data_prematch_only_executor_path_uses_running_loop(monkeypatch):
    parsed_calls = []

    async def fake_set_status(*_args, **_kwargs):
        return None

    async def fake_maybe_refresh(*_args, **_kwargs):
        return None

    def fake_parse(payload, *, is_live, source_time_ms):
        parsed_calls.append(
            {
                "payload": payload,
                "is_live": is_live,
                "source_time_ms": source_time_ms,
            }
        )
        return [{"Pid": 101}]

    monkeypatch.setattr(data_handler, "parse_ps3838_all_sports", fake_parse)
    monkeypatch.setattr(data_handler, "store_raw_events", lambda *_args, **_kwargs: set())
    monkeypatch.setattr(data_handler, "apply_u_updates", lambda *_args, **_kwargs: (set(), {}))
    monkeypatch.setattr(data_handler, "build_games_from_raw", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(data_handler, "allow_live", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(data_handler, "set_status", fake_set_status)
    monkeypatch.setattr(data_handler, "maybe_refresh", fake_maybe_refresh)

    monkeypatch.setattr(data_handler._cfg, "PS3838_ONLY_LIVE", False, raising=False)
    monkeypatch.setattr(data_handler._cfg, "PS3838_ONLY_PREMATCH", True, raising=False)

    monkeypatch.setattr(state, "_prematch_sport_times", {}, raising=False)
    monkeypatch.setattr(state, "last_is_live", None, raising=False)
    monkeypatch.setattr(state, "start_ts", 0.0, raising=False)
    monkeypatch.setattr(state, "last_msg_time_ms", 0, raising=False)
    monkeypatch.setattr(state, "last_ws_activity_time", 0.0, raising=False)
    monkeypatch.setattr(state, "last_data_recv_time", 0.0, raising=False)
    monkeypatch.setattr(state, "last_ssn", 0, raising=False)
    monkeypatch.setattr(state, "odds_keys_seen", {}, raising=False)
    monkeypatch.setattr(state, "odds_keys_nonempty", {}, raising=False)
    monkeypatch.setattr(state, "parse_error_dumped", False, raising=False)
    monkeypatch.setattr(state, "_specials_dump_count", 20, raising=False)
    monkeypatch.setattr(state, "_specials_keys_dumped", True, raising=False)
    monkeypatch.setattr(state, "ws_specials_dumps", 0, raising=False)

    payload = {
        "type": "FULL_ODDS",
        "time": 1_775_821_265_075,
        "odds": {
            "refreshAll": True,
            "n": [[29, "Soccer", []]],
        },
    }

    parsed = await data_handler.process_data(payload, force_live=False, inline_parse=False)

    assert parsed == [{"Pid": 101}]
    assert len(parsed_calls) == 1
    assert parsed_calls[0]["is_live"] is False
    assert parsed_calls[0]["payload"] == {"odds": {"n": [[29, "Soccer", []]]}}


@pytest.mark.asyncio
async def test_broadcast_games_does_not_refresh_event_last_seen(monkeypatch):
    snapshot = _snapshot_state()
    try:
        original_seen = "2026-04-12T10:00:00Z"
        state.events_data = {
            101: {
                "Pid": 101,
                "isLive": True,
                "LastSeenAt": original_seen,
                "Periods": [{}],
            }
        }
        state.event_source = {}
        state.last_broadcast_ts = {}
        state.clients = set()

        monkeypatch.setattr(data_handler, "allow_live", lambda *_args, **_kwargs: True)
        monkeypatch.setattr(data_handler, "should_drop_stale", lambda: False)
        monkeypatch.setattr(data_handler, "map_game_pid", lambda game: game)
        monkeypatch.setattr(data_handler, "_filter_markets", lambda game: game)
        monkeypatch.setattr(data_handler, "_build_update_payload", lambda game: game)

        await data_handler._broadcast_games([{"Pid": 101, "isLive": True}], "TST-BROADCAST")

        assert state.events_data[101]["LastSeenAt"] == original_seen
        assert state.event_source[101] == "ps3838"
        assert state.last_broadcast_ts[101] > 0
    finally:
        _restore_state(snapshot)
