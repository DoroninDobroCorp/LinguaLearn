from __future__ import annotations

from aggregator.decision import DecisionEngine
from aggregator.ingest import IngestRouter
from aggregator.sources.pin888_ws_bridge import Pin888WsBridge
from aggregator.store import ProvenanceStore


def _wire():
    store = ProvenanceStore()
    router = IngestRouter(store=store, decision=DecisionEngine())
    captured: list = []
    router.register_consumer(lambda pq: captured.append(pq))
    return store, captured, Pin888WsBridge(router=router)


def test_bridge_dispatches_update_payload():
    _store, captured, bridge = _wire()

    bridge._dispatch_message(
        {
            "type": "update",
            "source": "ps3838",
            "data": {"Pid": 7001, "homeName": "a", "awayName": "b"},
        }
    )

    assert len(captured) == 1
    assert captured[0].event_id == "pin888:7001"
    assert bridge.stats()["events"] == 1


def test_bridge_replays_state_events_as_updates():
    _store, captured, bridge = _wire()

    bridge._dispatch_message(
        {
            "type": "state",
            "events": [
                {"Pid": 7002, "homeName": "a", "awayName": "b"},
                {"Pid": 7003, "homeName": "c", "awayName": "d"},
            ],
        }
    )

    assert [quote.event_id for quote in captured] == ["pin888:7002", "pin888:7003"]
    assert bridge.stats()["events"] == 2


def test_bridge_ignores_invalid_json_message():
    _store, captured, bridge = _wire()

    bridge._handle_raw_message("{not-json")

    assert captured == []
    assert bridge.stats()["errors"] == 1


def test_bridge_reconnects_with_exponential_backoff():
    """Verify the bridge reconnects after a connection failure with backoff."""
    import threading
    from unittest.mock import patch

    _store, captured, bridge = _wire()
    bridge.ws_url = "ws://127.0.0.1:1"  # unreachable
    bridge.reconnect_base_sec = 0.05
    bridge.reconnect_max_sec = 0.2

    stop = threading.Event()
    errors_seen: list[float] = []
    original_run = bridge._run

    async def _patched_run(stop_event: threading.Event) -> None:
        backoff = bridge.reconnect_base_sec
        attempts = 0
        while not stop_event.is_set() and attempts < 4:
            attempts += 1
            try:
                import websockets
                async with websockets.connect(bridge.ws_url, open_timeout=0.1):
                    pass
            except Exception:
                with bridge._lock:
                    bridge.error_count += 1
                errors_seen.append(backoff)
                backoff = min(bridge.reconnect_max_sec, backoff * 2.0)
                await __import__("asyncio").sleep(0.01)  # minimal sleep for test speed
        stop_event.set()

    with patch.object(bridge, "_run", _patched_run):
        t = threading.Thread(target=bridge.run_forever, kwargs={"stop_event": stop})
        t.start()
        t.join(timeout=5)
        stop.set()

    stats = bridge.stats()
    assert stats["errors"] >= 3, f"Expected >= 3 errors, got {stats['errors']}"
    # Backoff should be doubling
    assert errors_seen[1] > errors_seen[0], "Backoff should increase"
    assert errors_seen[-1] <= bridge.reconnect_max_sec + 0.01

def test_bridge_default_max_message_bytes_fits_line_snapshot():
    """Линия :9012 шлёт init-кадр ~9 МБ; дефолтный лимит обязан его вмещать.

    Регрессия: прежний хардкод max_size=5_000_000 рвал коннект 1009
    "message too big" на полном снапшоте → 0 ingest. Дефолт должен быть
    с запасом над реальным кадром (наблюдалось 9.16 МБ, 1566 событий).
    """
    from aggregator.sources.pin888_ws_bridge import (
        DEFAULT_MAX_MESSAGE_BYTES,
        Pin888WsBridge,
    )
    from aggregator.decision import DecisionEngine
    from aggregator.ingest import IngestRouter
    from aggregator.store import ProvenanceStore

    assert DEFAULT_MAX_MESSAGE_BYTES >= 16_000_000

    router = IngestRouter(store=ProvenanceStore(), decision=DecisionEngine())
    bridge = Pin888WsBridge(router=router)
    assert bridge.max_message_bytes == DEFAULT_MAX_MESSAGE_BYTES

    custom = Pin888WsBridge(router=router, max_message_bytes=1_234_567)
    assert custom.max_message_bytes == 1_234_567
