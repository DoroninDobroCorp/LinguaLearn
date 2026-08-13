"""Legacy pin888-format WebSocket broadcaster (contour cutover).

Emits byte-compatible :9012 frames so the downstream consumers
(Go analyzer on serverforvovka, Go predictor on Mac) can keep using
their existing WS protocol while we swap their data provider from the
raw pin888 Mac parser to the aggregator's decision output.

Flag: ``MSP_PIN888_WS_BROADCASTER_ENABLED`` (default off). Import-time inert.
Port: ``MSP_PIN888_WS_BROADCASTER_PORT`` (default 9014).
Host: ``MSP_PIN888_WS_BROADCASTER_HOST`` (default 0.0.0.0).

Protocol (identical to core/broadcaster.py):
- On connect: one ``{"type":"init","events":[...],"count":N,"stale":false}`` frame.
- On every published quote: ``{"type":"update","source":"ps3838","data":{...},
  "stale":bool,"reason":?}`` (or tombstone variant without ``stale`` key).

Design: router.register_consumer() callback dispatched from arbitrary
thread → queue onto the WS loop. A single broadcaster worker drains that
queue so handshakes don't starve behind a flood of per-quote tasks.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import threading
from datetime import datetime, timezone
from typing import Any, Optional

from aggregator.compat_shim import (
    PIN888_SOURCE_TAG,
    to_pin888_init,
    to_pin888_tombstone_update,
    to_pin888_update,
)
from aggregator.ingest import IngestRouter
from aggregator.store import ProvenanceStore
from aggregator.types import PublishedQuote

logger = logging.getLogger(__name__)

# Match core/broadcaster.py INIT_SNAPSHOT_MAX_BYTES. Frames larger than this
# are split via the "update_replay" protocol so we stay compatible with
# consumers that impose a ~1MB WS frame size limit.
INIT_SNAPSHOT_MAX_BYTES = 900_000
# WS frame size ceiling for the server — must allow headroom above the
# replay threshold for single very large update frames.
WS_MAX_FRAME_BYTES = 4 * 1024 * 1024

# How often we broadcast a stream-liveness heartbeat. Tuned to feel
# real-time on the monitor while keeping the per-client byte cost
# negligible (~50 bytes per tick).
HEARTBEAT_INTERVAL_SEC = 1.0

# Bound per-client send time so a wedged downstream consumer can't pin the
# broadcaster event loop and starve new handshakes on :9014.
WS_SEND_TIMEOUT_SEC = 0.5


def _quote_is_live(quote: PublishedQuote) -> bool:
    payload = quote.payload if isinstance(quote.payload, dict) else {}
    return bool(payload.get("isLive") or payload.get("IsLive") or payload.get("is_live"))


def pin888_ws_broadcaster_enabled() -> bool:
    """Check ``MSP_PIN888_WS_BROADCASTER_ENABLED``; default OFF."""
    return os.environ.get("MSP_PIN888_WS_BROADCASTER_ENABLED", "").strip() in (
        "1",
        "true",
        "True",
        "yes",
    )


def _pin888_ws_port() -> int:
    try:
        return int(os.environ.get("MSP_PIN888_WS_BROADCASTER_PORT", "9014"))
    except (ValueError, TypeError):
        return 9014


def _pin888_ws_host() -> str:
    return os.environ.get("MSP_PIN888_WS_BROADCASTER_HOST", "0.0.0.0")


def _dumps(obj: Any) -> str:
    return json.dumps(obj, default=str)


def _now_iso() -> str:
    """Current UTC instant in ISO8601 with millisecond precision and 'Z'."""
    now = datetime.now(timezone.utc)
    now = now.replace(microsecond=(now.microsecond // 1000) * 1000)
    return now.isoformat().replace("+00:00", "Z")


async def _send_with_timeout(websocket: Any, payload: str) -> None:
    """Send one WS frame with a hard timeout.

    The legacy broadcaster shares one asyncio loop for handshakes and outgoing
    frames. If one consumer stops draining its socket, an unbounded ``ws.send``
    can stall the loop and make new clients time out during opening handshake.
    """
    await asyncio.wait_for(websocket.send(payload), timeout=WS_SEND_TIMEOUT_SEC)


def _stamp_event_freshness(data: dict[str, Any], now_iso: str) -> None:
    """Bump per-event freshness stamps on a legacy ``data`` block.

    The aggregator re-emits cached events on every poll cycle even when
    upstream prices have not changed (a successful poll is itself a
    re-affirmation). Consumers/monitors need a per-event freshness
    timestamp that reflects "this event was just confirmed alive" —
    not just "prices changed".

    - ``LastUpdated`` is always set to ``now`` (the freshness signal).
    - ``CreatedAt`` is left alone if upstream provided it; backfilled
      to ``now`` when missing (e.g. Pinnacle API source emissions never
      carried a CreatedAt field).
    - Tombstone removal markers are NOT stamped (handled by caller).
    """
    if not isinstance(data, dict):
        return
    data["LastUpdated"] = now_iso
    if not data.get("CreatedAt"):
        data["CreatedAt"] = now_iso


def _latest_per_event(history: list[PublishedQuote]) -> list[PublishedQuote]:
    """Keep last PublishedQuote per event_id (insertion-order history)."""
    latest: dict[str, PublishedQuote] = {}
    for pq in history:
        latest[pq.event_id] = pq
    # Drop tombstones from init snapshot (matches compat_shim.to_pin888_init).
    return [pq for pq in latest.values() if not pq.is_tombstone]


def _identity_text(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").casefold()).strip()


def _fixture_identity(payload: dict[str, Any]) -> tuple[Any, ...] | None:
    """Return a stable storefront identity across API/browser event IDs."""
    home = _identity_text(payload.get("homeName") or payload.get("HomeName") or payload.get("Home"))
    away = _identity_text(payload.get("awayName") or payload.get("AwayName") or payload.get("Away"))
    sport = _identity_text(payload.get("SportName") or payload.get("SportId") or payload.get("Sport"))
    if not home or not away or not sport:
        return None
    raw = payload.get("Raw") if isinstance(payload.get("Raw"), dict) else {}
    start = _to_int(raw.get("start_time_ms") or payload.get("StartTimeMs")) or 0
    return sport, home, away, bool(payload.get("isLive") or payload.get("IsLive")), start


def _to_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _market_quality(payload: dict[str, Any]) -> int:
    """Prefer the duplicate that actually carries a usable base line."""
    periods = payload.get("Periods")
    if not isinstance(periods, list):
        return 0

    def positive_prices(value: Any) -> int:
        if isinstance(value, dict):
            count = 0
            for key, item in value.items():
                if str(key).casefold() in {"value", "price", "odds", "win1", "win2", "winnone", "over", "under", "home", "away", "draw"}:
                    try:
                        count += int(float(item) > 1.0)
                    except (TypeError, ValueError):
                        count += positive_prices(item)
                else:
                    count += positive_prices(item)
            return count
        if isinstance(value, list):
            return sum(positive_prices(item) for item in value)
        return 0

    return positive_prices(periods)


def _latest_per_fixture(history: list[PublishedQuote]) -> list[PublishedQuote]:
    """Collapse logical duplicates while keeping the richest market payload."""
    by_identity: dict[tuple[Any, ...], PublishedQuote] = {}
    passthrough: list[PublishedQuote] = []
    for quote in _latest_per_event(history):
        identity = _fixture_identity(quote.payload)
        if identity is None:
            passthrough.append(quote)
            continue
        current = by_identity.get(identity)
        if current is None or _market_quality(quote.payload) > _market_quality(current.payload):
            by_identity[identity] = quote
    return passthrough + list(by_identity.values())


class Pin888WsBroadcaster:
    """WebSocket server emitting pin888-legacy-format frames.

    Parameters
    ----------
    router :
        Aggregator ingest router; a consumer is registered on construction.
    store :
        Provenance store used to build the init snapshot on each connect.
    host, port :
        Overrides for ``MSP_PIN888_WS_BROADCASTER_HOST`` / ``MSP_PIN888_WS_BROADCASTER_PORT``.
    """

    def __init__(
        self,
        router: IngestRouter,
        store: ProvenanceStore,
        *,
        host: Optional[str] = None,
        port: Optional[int] = None,
    ) -> None:
        self.router = router
        self.store = store
        self.host = host if host is not None else _pin888_ws_host()
        self.port = port if port is not None else _pin888_ws_port()
        self._clients: set = set()
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._server: Any = None
        self._thread: Optional[threading.Thread] = None
        self._broadcast_queue: Optional[asyncio.Queue[dict[str, Any]]] = None
        self._ready = threading.Event()
        self._projection_lock = threading.Lock()
        self._projection_by_identity: dict[tuple[Any, ...], PublishedQuote] = {}
        self._latest_by_event: dict[str, PublishedQuote] = {}
        router.register_consumer(self._on_quote)

    # ── Router → broadcast bridge (thread-safe) ─────────────────────────

    def _on_quote(self, quote: PublishedQuote) -> None:
        loop = self._loop
        if loop is None or not loop.is_running():
            return
        envelopes: list[dict[str, Any]] = []
        identity = _fixture_identity(quote.payload)
        with self._projection_lock:
            if quote.is_tombstone:
                self._latest_by_event.pop(quote.event_id, None)
            else:
                self._latest_by_event[quote.event_id] = quote
            current = self._projection_by_identity.get(identity) if identity is not None else None
            if quote.is_tombstone:
                if current is not None and current.event_id == quote.event_id:
                    self._projection_by_identity.pop(identity, None)
                envelopes.append(to_pin888_update(quote, stale=bool(quote.degraded)))
            elif current is not None and current.event_id != quote.event_id:
                if _market_quality(quote.payload) <= _market_quality(current.payload):
                    return
                old_pid = current.payload.get("Pid") or current.payload.get("MatchId")
                envelopes.append(to_pin888_tombstone_update(old_pid))
                self._projection_by_identity[identity] = quote
                envelopes.append(to_pin888_update(quote, stale=bool(quote.degraded)))
            else:
                if identity is not None:
                    self._projection_by_identity[identity] = quote
                envelopes.append(to_pin888_update(quote, stale=bool(quote.degraded)))
        now_iso = _now_iso()
        for envelope in envelopes:
            data = envelope.get("data")
            if isinstance(data, dict) and not data.get("Removed"):
                _stamp_event_freshness(data, now_iso)
        try:
            for envelope in envelopes:
                loop.call_soon_threadsafe(self._enqueue_envelope, envelope)
        except RuntimeError:
            # Loop closing; drop silently.
            pass

    def _enqueue_envelope(self, envelope: dict[str, Any]) -> None:
        queue = self._broadcast_queue
        if queue is None:
            return
        queue.put_nowait(envelope)

    async def _broadcast(self, envelope: dict[str, Any]) -> None:
        if not self._clients:
            return
        msg = _dumps(envelope)
        dead: list[Any] = []
        for ws in list(self._clients):
            try:
                await _send_with_timeout(ws, msg)
            except Exception:
                dead.append(ws)
            await asyncio.sleep(0)
        for ws in dead:
            self._clients.discard(ws)
            try:
                await asyncio.wait_for(ws.close(), timeout=0.2)
            except Exception:
                pass

    # ── Connection handler ──────────────────────────────────────────────

    def _init_envelope(self, quotes: list[PublishedQuote]) -> dict[str, Any]:
        init_env = to_pin888_init(quotes)
        events = init_env.get("events")
        if isinstance(events, list):
            now_iso = _now_iso()
            for ev in events:
                if isinstance(ev, dict):
                    _stamp_event_freshness(ev, now_iso)
        return init_env

    async def _send_init(self, websocket: Any, quotes: list[PublishedQuote]) -> None:
        """Send the init envelope. Splits via update_replay when too large.

        Mirrors ``core.broadcaster._send_snapshot_with_replay``: when the
        full init payload exceeds ``INIT_SNAPSHOT_MAX_BYTES`` we emit an
        empty init with ``snapshot_mode="update_replay"`` + ``replay_total``
        and then one ``update`` frame per event.
        """
        init_env = self._init_envelope(quotes)
        events = init_env.get("events")
        init_bytes = _dumps(init_env)
        if not isinstance(events, list) or len(init_bytes) <= INIT_SNAPSHOT_MAX_BYTES:
            await _send_with_timeout(websocket, init_bytes)
            return

        light = dict(init_env)
        light["events"] = []
        light["count"] = 0
        light["snapshot_mode"] = "update_replay"
        light["replay_total"] = len(events)
        await _send_with_timeout(websocket, _dumps(light))
        logger.info(
            "legacy_ws: large init %d bytes — replaying %d events",
            len(init_bytes),
            len(events),
        )
        for idx, event_data in enumerate(events, start=1):
            replay = {
                "type": "update",
                "source": PIN888_SOURCE_TAG,
                "data": event_data,
                "stale": False,
            }
            await _send_with_timeout(websocket, _dumps(replay))
            await asyncio.sleep(0)

    async def _handler(self, websocket: Any) -> None:
        try:
            history = list(self.store.iter_history())
        except Exception:
            history = []
        init_quotes = _latest_per_fixture(history)
        with self._projection_lock:
            for quote in init_quotes:
                if not quote.is_tombstone:
                    self._latest_by_event[quote.event_id] = quote
                identity = _fixture_identity(quote.payload)
                if identity is not None:
                    self._projection_by_identity[identity] = quote
        try:
            await self._send_init(websocket, init_quotes)
        except Exception:
            logger.debug("legacy_ws: init send failed", exc_info=True)
            return

        self._clients.add(websocket)
        logger.info(
            "legacy_ws: client connected; total=%d init_events=%d",
            len(self._clients),
            len(init_quotes),
        )
        try:
            async for _ in websocket:
                # We don't expect client-to-server messages; drain to detect close.
                pass
        except Exception:
            logger.debug("legacy_ws: client loop error", exc_info=True)
        finally:
            self._clients.discard(websocket)
            logger.info("legacy_ws: client disconnected; total=%d", len(self._clients))

    # ── Lifecycle ───────────────────────────────────────────────────────

    async def _run(self) -> None:
        import websockets
        from websockets.datastructures import Headers
        from websockets.http11 import Response

        async def _process_request(connection: Any, request: Any) -> Any:
            if request.path in ("/health", "/health/"):
                body = json.dumps(
                    {"status": "ok", "clients": len(self._clients)}
                ).encode()
                return Response(
                    200,
                    "OK",
                    Headers(
                        [
                            (b"Content-Type", b"application/json"),
                            (b"Content-Length", str(len(body)).encode()),
                        ]
                    ),
                    body,
                )
            if request.path in ("/snapshot", "/snapshot/"):
                try:
                    history = list(self.store.iter_history())
                except Exception:
                    history = []
                body = _dumps(self._init_envelope(_latest_per_fixture(history))).encode()
                return Response(
                    200,
                    "OK",
                    Headers(
                        [
                            (b"Content-Type", b"application/json"),
                            (b"Content-Length", str(len(body)).encode()),
                        ]
                    ),
                    body,
                )
            if request.path in ("/live-snapshot", "/live-snapshot/"):
                with self._projection_lock:
                    latest = list(self._latest_by_event.values())
                if not latest:
                    try:
                        history = list(self.store.iter_history())
                    except Exception:
                        history = []
                    latest = _latest_per_event(history)
                # Do not collapse by fixture richness here: a richer WS/parent
                # duplicate may be older than the authenticated DOM quote.
                # Parify groups these rows, chooses the live authority, and
                # fills only missing secondary markets from siblings.
                body = _dumps(
                    self._init_envelope([quote for quote in latest if _quote_is_live(quote)])
                ).encode()
                return Response(
                    200,
                    "OK",
                    Headers(
                        [
                            (b"Content-Type", b"application/json"),
                            (b"Content-Length", str(len(body)).encode()),
                        ]
                    ),
                    body,
                )
            return None  # proceed with WS upgrade

        self._broadcast_queue = asyncio.Queue()
        self._server = await websockets.serve(
            self._handler,
            self.host,
            self.port,
            max_size=WS_MAX_FRAME_BYTES,
            # Disable server-initiated pings: the autossh tunnel adds latency
            # that causes pong timeouts (1011 disconnect every ~670s).
            # Downstream forwarder_smart.py handles its own reconnection.
            ping_interval=None,
            process_request=_process_request,
        )
        self._ready.set()
        broadcaster_task = asyncio.create_task(self._broadcast_worker())
        heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        try:
            await self._server.wait_closed()
        except asyncio.CancelledError:
            pass
        finally:
            broadcaster_task.cancel()
            heartbeat_task.cancel()
            try:
                await broadcaster_task
            except (asyncio.CancelledError, Exception):
                pass
            try:
                await heartbeat_task
            except (asyncio.CancelledError, Exception):
                pass

    async def _broadcast_worker(self) -> None:
        """Drain enqueued envelopes on the WS loop with fair scheduling."""
        queue = self._broadcast_queue
        if queue is None:
            return
        try:
            while True:
                envelope = await queue.get()
                await self._broadcast(envelope)
                await asyncio.sleep(0)
        except asyncio.CancelledError:
            return

    async def _heartbeat_loop(self) -> None:
        """Periodically emit a stream-liveness ping."""
        try:
            while True:
                await asyncio.sleep(HEARTBEAT_INTERVAL_SEC)
                if not self._clients:
                    continue
                envelope = {
                    "type": "heartbeat",
                    "source": PIN888_SOURCE_TAG,
                    "ts": _now_iso(),
                }
                try:
                    self._enqueue_envelope(envelope)
                except Exception:
                    logger.debug("legacy_ws: heartbeat broadcast failed", exc_info=True)
        except asyncio.CancelledError:
            return

    def start(self, *, wait_ready: bool = True, timeout: float = 5.0) -> None:
        """Start the WS server in a background thread with its own event loop."""
        if self._thread is not None:
            return

        def _run_loop() -> None:
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)
            try:
                self._loop.run_until_complete(self._run())
            except Exception:
                logger.exception("legacy_ws: server crashed")
            finally:
                try:
                    self._loop.close()
                except Exception:
                    pass

        self._thread = threading.Thread(
            target=_run_loop,
            daemon=True,
            name="aggregator-pin888-ws",
        )
        self._thread.start()
        if wait_ready:
            self._ready.wait(timeout=timeout)

    def stop(self) -> None:
        """Shut down the WS server cleanly."""
        loop = self._loop
        server = self._server
        if loop is None or server is None:
            return
        try:
            loop.call_soon_threadsafe(server.close)
        except Exception:
            pass
        if self._thread is not None:
            self._thread.join(timeout=5.0)


__all__ = [
    "Pin888WsBroadcaster",
    "pin888_ws_broadcaster_enabled",
]
