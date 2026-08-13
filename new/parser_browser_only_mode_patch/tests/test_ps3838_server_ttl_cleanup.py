from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

import ps3838_server
from state import state


@pytest.fixture
def parser_state_snapshot():
    snapshot = dict(state.__dict__)
    try:
        state.running = True
        state.events_data = {}
        state.event_source = {}
        state.raw_events = {}
        state.last_broadcast_ts = {}
        state.bia_specials_signature = {}
        state.last_u_touched_markets = {}
        state.update_signal_ts = {}
        state.board_signal_ts = {}
        state.list_signal_event_ts = {}
        state.sport_ws_429_backoff_until = {}
        state._mb_specials_presence = {}
        yield
    finally:
        state.__dict__.clear()
        state.__dict__.update(snapshot)


def _stale_seen_at(now_ts: float, age_sec: float) -> str:
    seen_dt = datetime.fromtimestamp(now_ts, tz=timezone.utc) - timedelta(seconds=age_sec)
    return seen_dt.isoformat().replace("+00:00", "Z")


def _raw_event(*, event_id: int, parent_id: int) -> list:
    event = [None] * 29
    event[0] = event_id
    event[28] = parent_id
    return event


@pytest.mark.asyncio
async def test_ttl_cleanup_removes_orphan_child_raw_family(parser_state_snapshot, monkeypatch):
    now_ts = 10_000.0
    parent_id = 1627062777
    child_raw_id = 1627072744

    state.events_data[parent_id] = {
        "Pid": parent_id,
        "isLive": False,
        "LastSeenAt": _stale_seen_at(
            now_ts,
            ps3838_server.EVENTS_DATA_TTL_PREMATCH_SEC + 5.0,
        ),
    }
    state.event_source[parent_id] = "ps3838"
    state.last_broadcast_ts[parent_id] = 123.0
    state.bia_specials_signature[parent_id] = {0: b'{"BTTS":{"Yes":{"value":1.85}},"Number":0}'}
    state._mb_specials_presence[parent_id] = {"seen": True}

    # Reproduces the ghost-match case: only the child raw row remains under a
    # different raw_event_id while the logical parser row lives under parent_id.
    state.raw_events[child_raw_id] = {
        "is_live": False,
        "sport_id": 33,
        "event": _raw_event(event_id=child_raw_id, parent_id=parent_id),
    }
    state.last_u_touched_markets[child_raw_id] = {(0, "Totals")}
    state.update_signal_ts[child_raw_id] = 1.0
    state.board_signal_ts[child_raw_id] = 2.0
    state.list_signal_event_ts[child_raw_id] = 3.0

    monkeypatch.setattr(ps3838_server.time, "time", lambda: now_ts)

    async def fake_sleep(_delay: float):
        fake_sleep.calls += 1
        if fake_sleep.calls >= 2:
            state.running = False

    fake_sleep.calls = 0
    monkeypatch.setattr(ps3838_server.asyncio, "sleep", fake_sleep)
    monkeypatch.setattr(ps3838_server, "log", lambda _msg: None)

    await ps3838_server.events_data_ttl_cleanup()

    assert parent_id not in state.events_data
    assert parent_id not in state.event_source
    assert parent_id not in state.last_broadcast_ts
    assert parent_id not in state.bia_specials_signature
    assert parent_id not in state._mb_specials_presence

    assert child_raw_id not in state.raw_events
    assert child_raw_id not in state.last_u_touched_markets
    assert child_raw_id not in state.update_signal_ts
    assert child_raw_id not in state.board_signal_ts
    assert child_raw_id not in state.list_signal_event_ts


@pytest.mark.asyncio
async def test_ttl_cleanup_skips_rate_limited_sport_family(parser_state_snapshot, monkeypatch):
    now_ts = 20_000.0
    parent_id = 1627062777
    child_raw_id = 1627072744

    state.events_data[parent_id] = {
        "Pid": parent_id,
        "isLive": False,
        "LastSeenAt": _stale_seen_at(
            now_ts,
            ps3838_server.EVENTS_DATA_TTL_PREMATCH_SEC + 5.0,
        ),
    }
    state.event_source[parent_id] = "ps3838"
    state.raw_events[child_raw_id] = {
        "is_live": False,
        "sport_id": 33,
        "event": _raw_event(event_id=child_raw_id, parent_id=parent_id),
    }
    state.sport_ws_429_backoff_until[33] = now_ts + 60.0

    monkeypatch.setattr(ps3838_server.time, "time", lambda: now_ts)

    async def fake_sleep(_delay: float):
        fake_sleep.calls += 1
        if fake_sleep.calls >= 2:
            state.running = False

    fake_sleep.calls = 0
    monkeypatch.setattr(ps3838_server.asyncio, "sleep", fake_sleep)
    monkeypatch.setattr(ps3838_server, "log", lambda _msg: None)

    await ps3838_server.events_data_ttl_cleanup()

    assert parent_id in state.events_data
    assert parent_id in state.event_source
    assert child_raw_id in state.raw_events
