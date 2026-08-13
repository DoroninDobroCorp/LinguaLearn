"""Quick end-to-end smoke test for aggregator.pin888_ws_broadcaster."""

from __future__ import annotations

import asyncio
import json
import urllib.request
from datetime import datetime, timezone

import pytest

from aggregator.ingest import IngestRouter
from aggregator.pin888_ws_broadcaster import (
    Pin888WsBroadcaster,
    _latest_per_event,
)
from aggregator.store import ProvenanceStore
from aggregator.types import PublishedQuote


def _pq(event_id: str, pid: int, *, tombstone: bool = False) -> PublishedQuote:
    payload = {"Pid": pid, "Sport": "soccer"}
    if tombstone:
        payload["Removed"] = True
    return PublishedQuote(
        event_id=event_id,
        payload=payload,
        source_used_for_publish="pin888",
        is_tombstone=tombstone,
        collected_at=datetime.now(timezone.utc),
        received_at=datetime.now(timezone.utc),
    )


def test_latest_per_event_drops_tombstones_and_keeps_last():
    history = [_pq("e1", 1), _pq("e2", 2), _pq("e1", 11), _pq("e2", 22, tombstone=True)]
    latest = _latest_per_event(history)
    assert len(latest) == 1
    assert latest[0].event_id == "e1"
    assert latest[0].payload["Pid"] == 11


def test_ws_broadcaster_init_and_update_frames():
    store = ProvenanceStore()
    router = IngestRouter(store=store, decision=None, event_id_resolver=lambda _e: None)

    # Seed store with one historical published quote so init is non-empty.
    store.append_history(_pq("e1", 1))

    broadcaster = Pin888WsBroadcaster(
        router=router, store=store, host="127.0.0.1", port=0
    )
    # Use an ephemeral free port
    import socket

    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    broadcaster.port = port

    broadcaster.start(wait_ready=True, timeout=3.0)

    async def _client_roundtrip():
        import websockets

        async with websockets.connect(f"ws://127.0.0.1:{port}") as ws:
            # First message: init
            init_raw = await asyncio.wait_for(ws.recv(), timeout=2.0)
            init = json.loads(init_raw)
            assert init["type"] == "init"
            assert init["count"] == 1
            assert init["events"][0]["Pid"] == 1

            # Push a new quote through the router consumer callback.
            broadcaster._on_quote(_pq("e2", 99))
            update_raw = await asyncio.wait_for(ws.recv(), timeout=2.0)
            upd = json.loads(update_raw)
            assert upd["type"] == "update"
            assert upd["source"] == "ps3838"
            assert upd["data"]["Pid"] == 99
            assert upd["stale"] is False

    try:
        asyncio.run(_client_roundtrip())
    finally:
        broadcaster.stop()


def test_ws_broadcaster_http_snapshot_returns_init_events():
    store = ProvenanceStore()
    router = IngestRouter(store=store, decision=None, event_id_resolver=lambda _e: None)
    store.append_history(_pq("e1", 1))

    broadcaster = Pin888WsBroadcaster(
        router=router, store=store, host="127.0.0.1", port=0
    )
    import socket

    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    broadcaster.port = port

    broadcaster.start(wait_ready=True, timeout=3.0)
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/snapshot", timeout=2) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        assert payload["type"] == "init"
        assert payload["count"] == 1
        assert payload["events"][0]["Pid"] == 1
    finally:
        broadcaster.stop()


def test_ws_broadcaster_large_init_uses_update_replay(monkeypatch):
    """When init exceeds INIT_SNAPSHOT_MAX_BYTES, broadcaster must split."""
    import aggregator.pin888_ws_broadcaster as mod

    monkeypatch.setattr(mod, "INIT_SNAPSHOT_MAX_BYTES", 200)

    store = ProvenanceStore()
    router = IngestRouter(store=store, decision=None, event_id_resolver=lambda _e: None)
    for i in range(5):
        store.append_history(_pq(f"e{i}", i))

    broadcaster = mod.Pin888WsBroadcaster(
        router=router, store=store, host="127.0.0.1", port=0
    )
    import socket as _s

    s = _s.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    broadcaster.port = port

    broadcaster.start(wait_ready=True, timeout=3.0)

    async def _client_roundtrip():
        import websockets

        async with websockets.connect(f"ws://127.0.0.1:{port}") as ws:
            first = json.loads(await asyncio.wait_for(ws.recv(), timeout=2.0))
            assert first["type"] == "init"
            assert first["snapshot_mode"] == "update_replay"
            assert first["replay_total"] == 5
            assert first["events"] == []
            # Expect 5 replay update frames with source=ps3838
            for _ in range(5):
                env = json.loads(await asyncio.wait_for(ws.recv(), timeout=2.0))
                assert env["type"] == "update"
                assert env["source"] == "ps3838"

    try:
        asyncio.run(_client_roundtrip())
    finally:
        broadcaster.stop()


def test_broadcast_drops_slow_client_without_blocking(monkeypatch):
    """A wedged client must be evicted quickly instead of stalling the loop."""
    import aggregator.pin888_ws_broadcaster as mod

    class SlowClient:
        def __init__(self) -> None:
            self.closed = False

        async def send(self, _msg: str) -> None:
            await asyncio.sleep(3600)

        async def close(self) -> None:
            self.closed = True

    monkeypatch.setattr(mod, "WS_SEND_TIMEOUT_SEC", 0.01)

    store = ProvenanceStore()
    router = IngestRouter(store=store, decision=None, event_id_resolver=lambda _e: None)
    broadcaster = mod.Pin888WsBroadcaster(router=router, store=store, host="127.0.0.1", port=0)

    slow = SlowClient()
    broadcaster._clients.add(slow)

    asyncio.run(broadcaster._broadcast({"type": "heartbeat"}))

    assert slow not in broadcaster._clients
    assert slow.closed is True


def test_send_init_times_out_for_non_draining_client(monkeypatch):
    """Large init replay must fail fast for a client that stops draining."""
    import aggregator.pin888_ws_broadcaster as mod

    class SlowClient:
        async def send(self, _msg: str) -> None:
            await asyncio.sleep(3600)

        async def close(self) -> None:
            return None

    monkeypatch.setattr(mod, "WS_SEND_TIMEOUT_SEC", 0.01)

    store = ProvenanceStore()
    router = IngestRouter(store=store, decision=None, event_id_resolver=lambda _e: None)
    broadcaster = mod.Pin888WsBroadcaster(router=router, store=store, host="127.0.0.1", port=0)

    quotes = [_pq(f"e{i}", i) for i in range(3)]

    with pytest.raises(asyncio.TimeoutError):
        asyncio.run(broadcaster._send_init(SlowClient(), quotes))


def test_on_quote_enqueues_envelope_on_loop() -> None:
    store = ProvenanceStore()
    router = IngestRouter(store=store, decision=None, event_id_resolver=lambda _e: None)
    broadcaster = Pin888WsBroadcaster(router=router, store=store, host="127.0.0.1", port=0)

    class FakeLoop:
        def is_running(self) -> bool:
            return True

        def call_soon_threadsafe(self, fn, *args):
            fn(*args)

    broadcaster._loop = FakeLoop()
    broadcaster._broadcast_queue = asyncio.Queue()

    broadcaster._on_quote(_pq("e1", 101))

    queued = broadcaster._broadcast_queue.get_nowait()
    assert queued["type"] == "update"
    assert queued["data"]["Pid"] == 101
