import json

import pytest

import config as _cfg
import core.broadcaster as broadcaster
from state import state


def _reset_broadcast_state():
    state.clients = set()
    state.events_data = {}
    state.event_source = {}
    state.stale = False
    state.stale_reason = ""


class _FailingClient:
    remote_address = ("127.0.0.1", 9001)

    async def send(self, _payload):
        raise RuntimeError("boom")


class _DisconnectingClient:
    remote_address = ("127.0.0.1", 9002)

    def __init__(self):
        self.sent_payloads = []

    async def send(self, payload):
        self.sent_payloads.append(payload)
        state.clients.discard(self)

    def __aiter__(self):
        return self

    async def __anext__(self):
        raise StopAsyncIteration


class _CollectingClient:
    remote_address = ("127.0.0.1", 9003)

    def __init__(self):
        self.sent_payloads = []

    async def send(self, payload):
        self.sent_payloads.append(payload)

    def __aiter__(self):
        return self

    async def __anext__(self):
        raise StopAsyncIteration


@pytest.mark.asyncio
async def test_send_bytes_to_client_discards_failed_client():
    _reset_broadcast_state()
    client = _FailingClient()
    state.clients.add(client)

    await broadcaster.send_bytes_to_client(client, b"payload")

    assert client not in state.clients


@pytest.mark.asyncio
async def test_client_handler_tolerates_client_removed_during_send():
    _reset_broadcast_state()
    client = _DisconnectingClient()

    await broadcaster.client_handler(client)

    assert client.sent_payloads
    assert client not in state.clients


@pytest.mark.asyncio
async def test_client_handler_keeps_prematch_init_when_live_lane_stale_only(monkeypatch):
    _reset_broadcast_state()
    monkeypatch.setattr(_cfg, "PS3838_ONLY_LIVE", False)
    monkeypatch.setattr(_cfg, "PS3838_ONLY_PREMATCH", False)
    state.is_logged_in = True
    state.stale = False
    state.stale_live = True
    state.stale_prematch = False
    state.events_data = {
        1001: {
            "Pid": 1001,
            "SportName": "Soccer",
            "LeagueName": "League",
            "homeName": "Alpha",
            "awayName": "Beta",
            "isLive": False,
            "Periods": [],
        },
        1002: {
            "Pid": 1002,
            "SportName": "Soccer",
            "LeagueName": "League",
            "homeName": "Gamma",
            "awayName": "Delta",
            "isLive": True,
            "Periods": [],
        },
    }
    state.event_source = {1001: "ps3838", 1002: "ps3838"}

    async def fake_check_silence():
        return False

    monkeypatch.setattr(broadcaster, "check_silence", fake_check_silence)
    client = _DisconnectingClient()

    await broadcaster.client_handler(client)

    payload = json.loads(client.sent_payloads[0])
    assert payload["type"] == "init"
    assert payload["stale"] is False
    assert payload["count"] == 1
    assert [event["Pid"] for event in payload["events"]] == [1001]


@pytest.mark.asyncio
async def test_client_handler_refreshes_stale_before_init(monkeypatch):
    _reset_broadcast_state()
    state.is_logged_in = True
    state.stale = True
    state.stale_reason = "old stale marker"
    state.stale_live = True
    state.stale_prematch = True
    state.events_data = {
        2001: {
            "Pid": 2001,
            "SportName": "Soccer",
            "LeagueName": "League",
            "homeName": "Alpha",
            "awayName": "Beta",
            "isLive": True,
            "Periods": [],
        },
    }
    state.event_source = {2001: "ps3838"}
    calls = []

    async def fake_check_silence():
        calls.append("check")
        state.stale = False
        state.stale_reason = ""
        state.stale_live = False
        state.stale_prematch = False
        return False

    monkeypatch.setattr(broadcaster, "check_silence", fake_check_silence)

    client = _DisconnectingClient()
    await broadcaster.client_handler(client)

    assert calls == ["check"]
    payload = json.loads(client.sent_payloads[0])
    assert payload["type"] == "init"
    assert payload["stale"] is False
    assert payload["count"] == 1
    assert [event["Pid"] for event in payload["events"]] == [2001]


@pytest.mark.asyncio
async def test_client_handler_replays_large_init_as_updates(monkeypatch):
    _reset_broadcast_state()
    monkeypatch.setattr(_cfg, "PS3838_ONLY_LIVE", False)
    monkeypatch.setattr(_cfg, "PS3838_ONLY_PREMATCH", False)
    state.is_logged_in = True
    state.stale = False
    state.events_data = {
        3001: {
            "Pid": 3001,
            "SportName": "Soccer",
            "LeagueName": "League",
            "homeName": "Alpha",
            "awayName": "Beta",
            "isLive": True,
            "Periods": [{"Win1x2": {"Win1": {"value": 1.8}, "Win2": {"value": 2.1}}}],
        },
        3002: {
            "Pid": 3002,
            "SportName": "Soccer",
            "LeagueName": "League",
            "homeName": "Gamma",
            "awayName": "Delta",
            "isLive": False,
            "Periods": [{"Totals": {"2.5": {"WinMore": {"value": 1.9}, "WinLess": {"value": 1.9}}}}],
        },
    }
    state.event_source = {3001: "ps3838", 3002: "ps3838"}

    async def fake_check_silence():
        return False

    monkeypatch.setattr(broadcaster, "check_silence", fake_check_silence)
    monkeypatch.setattr(broadcaster, "INIT_SNAPSHOT_MAX_BYTES", 1)

    client = _CollectingClient()
    await broadcaster.client_handler(client)

    assert len(client.sent_payloads) == 3

    init_payload = json.loads(client.sent_payloads[0])
    assert init_payload["type"] == "init"
    assert init_payload["events"] == []
    assert init_payload["count"] == 0
    assert init_payload["snapshot_mode"] == "update_replay"
    assert init_payload["replay_total"] == 2

    update_payloads = [json.loads(payload) for payload in client.sent_payloads[1:]]
    assert [payload["type"] for payload in update_payloads] == ["update", "update"]
    assert [payload["data"]["Pid"] for payload in update_payloads] == [3001, 3002]


def test_filter_markets_base_only_strips_toqualify(monkeypatch):
    """In base_only mode, ToQualify (a special) must be stripped from periods."""
    monkeypatch.setattr(_cfg, "PS3838_SEND_MODE", "base_only")
    game = {
        "Pid": 9001,
        "SportName": "Soccer",
        "homeName": "A",
        "awayName": "B",
        "Periods": [{
            "Number": 0,
            "Win1x2": {"Win1": {"value": 1.5}},
            "ToQualify": {"Home": {"value": 1.8}, "Away": {"value": 2.1}},
            "BTTS": {"Yes": {"value": 1.7}},
        }],
    }
    result = broadcaster._filter_markets(game)
    p0 = result["Periods"][0]
    assert "Win1x2" in p0, "base market must be preserved"
    assert "ToQualify" not in p0, "ToQualify must be stripped in base_only"
    assert "BTTS" not in p0, "BTTS must be stripped in base_only"


def test_filter_markets_all_mode_keeps_toqualify(monkeypatch):
    """In 'all' mode, ToQualify must be preserved."""
    monkeypatch.setattr(_cfg, "PS3838_SEND_MODE", "all")
    game = {
        "Pid": 9002,
        "SportName": "Soccer",
        "homeName": "A",
        "awayName": "B",
        "Periods": [{
            "Number": 0,
            "Win1x2": {"Win1": {"value": 1.5}},
            "ToQualify": {"Home": {"value": 1.8}, "Away": {"value": 2.1}},
        }],
    }
    result = broadcaster._filter_markets(game)
    p0 = result["Periods"][0]
    assert "ToQualify" in p0
    assert "Win1x2" in p0


@pytest.mark.asyncio
async def test_send_state_loop_refreshes_stale_without_clients(monkeypatch):
    _reset_broadcast_state()
    state.running = True
    calls = []

    async def fake_check_silence():
        calls.append("check")
        state.running = False
        return False

    async def fake_sleep(_seconds):
        return None

    monkeypatch.setattr(broadcaster, "check_silence", fake_check_silence)
    monkeypatch.setattr(broadcaster.asyncio, "sleep", fake_sleep)

    await broadcaster.send_state_loop()

    assert calls == ["check"]


@pytest.mark.asyncio
async def test_send_state_loop_skips_empty_live_state_when_live_cache_exists(monkeypatch):
    _reset_broadcast_state()
    monkeypatch.setattr(_cfg, "PS3838_ONLY_LIVE", False)
    monkeypatch.setattr(_cfg, "PS3838_ONLY_PREMATCH", False)
    state.running = True
    state.is_logged_in = True
    state.stale = False
    state.stale_live = True
    state.stale_prematch = False
    state.events_data = {
        1001: {
            "Pid": 1001,
            "SportName": "Soccer",
            "LeagueName": "League",
            "homeName": "Alpha",
            "awayName": "Beta",
            "isLive": True,
            "Periods": [],
        },
        1002: {
            "Pid": 1002,
            "SportName": "Soccer",
            "LeagueName": "League",
            "homeName": "Gamma",
            "awayName": "Delta",
            "isLive": False,
            "Periods": [],
        },
    }
    state.event_source = {1001: "ps3838", 1002: "ps3838"}
    client = _DisconnectingClient()
    state.clients = {client}
    checks = []

    async def fake_check_silence():
        checks.append("check")
        state.running = False
        return False

    sleep_calls = []

    async def fake_sleep(seconds):
        sleep_calls.append(seconds)
        state.running = False
        return None

    monkeypatch.setattr(broadcaster, "check_silence", fake_check_silence)
    monkeypatch.setattr(broadcaster.asyncio, "sleep", fake_sleep)

    await broadcaster.send_state_loop()

    assert checks == ["check"]
    assert len(client.sent_payloads) == 1
    payload = json.loads(client.sent_payloads[0])
    assert payload["type"] == "state"
    assert payload["scope"] == "full"
    assert payload["count"] == 1
    assert [event["Pid"] for event in payload["events"]] == [1002]
    assert sleep_calls
