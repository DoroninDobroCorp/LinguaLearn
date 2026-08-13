"""Bridge legacy ``:9012`` WS updates into the aggregator router.

The current production parser already emits the legacy wire contract on
``:9012``. This bridge consumes that stream and feeds the multi-source
aggregator through :class:`aggregator.sources.pin888_source.Pin888SourceAdapter`.

This gives the new platform a zero-downtime shadow path while the
source-runtime wiring is still being finalized.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
import time
from typing import Any, Optional

import websockets

from aggregator.ingest import IngestRouter
from aggregator.sources.pin888_source import Pin888SourceAdapter

_LOG = logging.getLogger(__name__)

DEFAULT_BRIDGE_WS_URL = "ws://127.0.0.1:9012"
# Story 27.13 defaults — gap detection + heartbeat.
DEFAULT_GAP_THRESHOLD_SEC = 5.0
DEFAULT_HEARTBEAT_INTERVAL_SEC = 10.0
# Линия :9012 шлёт init-кадр полного снапшота (~9+ МБ live). Прежний лимит
# 5 МБ рвал коннект 1009 "message too big" → bridge молча реконнектил, 0 ingest.
DEFAULT_MAX_MESSAGE_BYTES = 64_000_000


def pin888_bridge_enabled() -> bool:
    return os.environ.get("MSP_PIN888_BRIDGE_ENABLED", "").strip() in (
        "1",
        "true",
        "True",
        "yes",
    )


def pin888_bridge_ws_url() -> str:
    return str(
        os.environ.get("MSP_PIN888_BRIDGE_WS_URL", "").strip()
        or DEFAULT_BRIDGE_WS_URL
    )


def _env_bool(env: dict[str, str], name: str) -> bool:
    return env.get(name, "").strip() in ("1", "true", "True", "yes")


def _env_float_positive(env: dict[str, str], name: str, default: float) -> float:
    raw = env.get(name, "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    if value <= 0:
        return default
    return value


def bridge_config_from_env(env: Optional[dict[str, str]] = None) -> dict[str, Any]:
    """Read Story 27.13 env overrides for Pin888WsBridge.

    - ``MSP_PIN888_WS_GAP_THRESHOLD_SEC``     → gap counter threshold (default 5.0s)
    - ``MSP_PIN888_WS_HEARTBEAT_INTERVAL_SEC`` → app-level heartbeat cadence (default 4.0s)
    - ``MSP_PIN888_WS_HEARTBEAT_ENABLED``     → feature flag (default off) for safe rollout

    Returns a kwargs dict for ``Pin888WsBridge(...)``.
    """
    source = env if env is not None else dict(os.environ)
    return {
        "gap_threshold_sec": _env_float_positive(
            source, "MSP_PIN888_WS_GAP_THRESHOLD_SEC", DEFAULT_GAP_THRESHOLD_SEC
        ),
        "heartbeat_interval_sec": _env_float_positive(
            source, "MSP_PIN888_WS_HEARTBEAT_INTERVAL_SEC", DEFAULT_HEARTBEAT_INTERVAL_SEC
        ),
        "heartbeat_enabled": _env_bool(source, "MSP_PIN888_WS_HEARTBEAT_ENABLED"),
    }


class Pin888WsBridge:
    """Reconnecting legacy-WS consumer that feeds the aggregator router.

    Story 27.13 — в дополнение к базовому reconnect loop ведёт gap tracking
    (промежутки >threshold между событиями) и опционально отправляет
    app-level heartbeat (feature flag за ``heartbeat_enabled``).
    """

    def __init__(
        self,
        *,
        router: IngestRouter,
        ws_url: str | None = None,
        reconnect_base_sec: float = 1.0,
        reconnect_max_sec: float = 15.0,
        receive_timeout_sec: float = 5.0,
        gap_threshold_sec: float = DEFAULT_GAP_THRESHOLD_SEC,
        heartbeat_interval_sec: float = DEFAULT_HEARTBEAT_INTERVAL_SEC,
        heartbeat_enabled: bool = False,
        max_message_bytes: int = DEFAULT_MAX_MESSAGE_BYTES,
    ) -> None:
        self.router = router
        self.ws_url = str(ws_url or pin888_bridge_ws_url())
        self.max_message_bytes = int(max_message_bytes)
        self.reconnect_base_sec = max(0.5, float(reconnect_base_sec))
        self.reconnect_max_sec = max(self.reconnect_base_sec, float(reconnect_max_sec))
        self.receive_timeout_sec = max(1.0, float(receive_timeout_sec))
        self.gap_threshold_sec = max(0.5, float(gap_threshold_sec))
        self.heartbeat_interval_sec = max(0.5, float(heartbeat_interval_sec))
        self.heartbeat_enabled = bool(heartbeat_enabled)
        self.adapter = Pin888SourceAdapter(router)
        self._lock = threading.Lock()
        self.connection_count = 0
        self.message_count = 0
        self.event_count = 0
        self.error_count = 0
        # Story 27.13 gap tracking counters.
        self.gaps_total = 0
        self.gap_max_sec = 0.0
        self.heartbeats_sent = 0
        # Dispatch parallelism gauge (Story 27.13 AC-2). Growing in-flight
        # count over time would signal the downstream ingest pipeline is
        # slower than recv — operators should see it in stats().
        self.dispatch_in_flight = 0
        # Monotonic-clock timestamp of the last *event* (not control frame).
        # Used to detect gaps between application-level events so clock
        # skew / NTP jumps can't hide a stall.
        self.last_event_mono: Optional[float] = None
        # Whether the current silence span has already been counted — we
        # only log one gap per consecutive silence, not one per probe tick.
        self._gap_pending: bool = False

    def stats(self) -> dict[str, Any]:
        with self._lock:
            last_event_mono_sec: Optional[float]
            if self.last_event_mono is None:
                last_event_mono_sec = None
            else:
                last_event_mono_sec = round(time.monotonic() - self.last_event_mono, 3)
            return {
                "connections": self.connection_count,
                "messages": self.message_count,
                "events": self.event_count,
                "errors": self.error_count,
                # Story 27.13 — see also /monitoring top-level
                # "pin888_ws_gaps_total" + "pin888_ws_gap_max_sec".
                "gaps_total": self.gaps_total,
                "gap_max_sec": round(self.gap_max_sec, 3),
                "heartbeats_sent": self.heartbeats_sent,
                "last_event_mono_sec": last_event_mono_sec,
                "dispatch_in_flight": self.dispatch_in_flight,
            }

    # ── gap/heartbeat pure helpers (testable without WS) ──────────

    def _record_gap(self, gap_sec: float) -> None:
        """Bump gaps counter + update rolling max. Caller decides threshold."""
        with self._lock:
            self.gaps_total += 1
            if gap_sec > self.gap_max_sec:
                self.gap_max_sec = float(gap_sec)

    def _record_heartbeat_sent(self) -> None:
        with self._lock:
            self.heartbeats_sent += 1

    def _mark_event_received(self) -> None:
        """Called from _dispatch_message. Resets gap-pending flag + updates
        last_event_mono so next silence probe starts fresh."""
        now = time.monotonic()
        with self._lock:
            self.last_event_mono = now
            self._gap_pending = False

    def _maybe_record_gap_on_probe(self, now_mono: float) -> Optional[float]:
        """Call on each recv timeout tick. Returns gap-seconds if a new
        gap just crossed threshold (and counter was bumped), ``None`` otherwise.

        Single gap per consecutive silence — ``_gap_pending`` suppresses
        repeated counts as silence continues.
        """
        with self._lock:
            last = self.last_event_mono
            if last is None:
                return None
            gap = now_mono - last
            if gap < self.gap_threshold_sec or self._gap_pending:
                return None
            # Record while still holding the lock so the counter matches
            # the pending flag transition atomically.
            self._gap_pending = True
            self.gaps_total += 1
            if gap > self.gap_max_sec:
                self.gap_max_sec = float(gap)
            return float(gap)

    def run_forever(self, *, stop_event: threading.Event) -> None:
        asyncio.run(self._run(stop_event))

    async def _run(self, stop_event: threading.Event) -> None:
        backoff = self.reconnect_base_sec
        while not stop_event.is_set():
            try:
                async with websockets.connect(
                    self.ws_url,
                    ping_interval=20,
                    max_size=self.max_message_bytes,
                    open_timeout=10,
                ) as ws:
                    with self._lock:
                        self.connection_count += 1
                    backoff = self.reconnect_base_sec

                    last_heartbeat_mono = time.monotonic()
                    while not stop_event.is_set():
                        try:
                            raw = await asyncio.wait_for(
                                ws.recv(), timeout=self.receive_timeout_sec
                            )
                        except asyncio.TimeoutError:
                            # Story 27.13 — detect application-level gaps
                            # (WS connected but no events flowing).
                            now = time.monotonic()
                            self._maybe_record_gap_on_probe(now)
                            # Optional app-level heartbeat so the server
                            # has a signal we're alive even when we're
                            # not publishing. Behind a feature flag so
                            # rollout can be aborted instantly.
                            if (
                                self.heartbeat_enabled
                                and now - last_heartbeat_mono >= self.heartbeat_interval_sec
                            ):
                                try:
                                    await ws.send(json.dumps({"type": "ping"}))
                                    self._record_heartbeat_sent()
                                except Exception:  # noqa: BLE001
                                    # Heartbeat send failure just means the
                                    # next recv will raise — the reconnect
                                    # path handles it. Don't count as gap.
                                    pass
                                last_heartbeat_mono = now
                            continue
                        if isinstance(raw, bytes):
                            raw = raw.decode("utf-8", "replace")
                        await self._handle_raw_message_async(raw)
            except Exception as exc:  # noqa: BLE001
                with self._lock:
                    self.error_count += 1
                # Логируем причину (throttled — раз на новую ошибку): прежде
                # коннект-ошибки (напр. 1009 message too big) глотались молча.
                _LOG.warning(
                    "pin888_bridge reconnect after error: %s: %s",
                    type(exc).__name__,
                    str(exc)[:160],
                )
                # Sleep in small increments, checking stop_event
                slept = 0.0
                while slept < backoff and not stop_event.is_set():
                    step = min(0.5, backoff - slept)
                    await asyncio.sleep(step)
                    slept += step
                if stop_event.is_set():
                    break
                backoff = min(self.reconnect_max_sec, backoff * 2.0)

    async def _handle_raw_message_async(self, raw: str) -> None:
        """Parse JSON and fire-and-forget dispatch so the recv loop is never
        blocked by downstream ingest / decision work (Story 27.13 AC-2).

        Prior impl used ``await loop.run_in_executor(...)`` which made recv
        synchronous with dispatch: if dispatch ran slow, ``ws.recv()`` did
        not re-enter, kernel Recv-Q backed up, and gaps appeared on the
        bridge's own TCP connection even while the parser kept pushing.
        The deep probe showed bridge saw 4.5× more gaps than a passive
        consumer on the same stream (18 vs 4) — all explained by this
        back-pressure path.

        The executor still serialises work via the default thread pool
        (one worker consumes one frame at a time), so we retain the
        original ingest-order guarantee inside IngestRouter.ingest().
        """
        try:
            payload = json.loads(raw)
        except (TypeError, ValueError, json.JSONDecodeError):
            with self._lock:
                self.error_count += 1
            return
        with self._lock:
            self.message_count += 1
            self.dispatch_in_flight += 1
        loop = asyncio.get_running_loop()
        future = loop.run_in_executor(None, self._dispatch_message, payload)
        future.add_done_callback(self._on_dispatch_complete)

    def _on_dispatch_complete(self, _future: asyncio.Future[Any]) -> None:
        with self._lock:
            self.dispatch_in_flight -= 1

    def _handle_raw_message(self, raw: str) -> None:
        try:
            payload = json.loads(raw)
        except (TypeError, ValueError, json.JSONDecodeError):
            with self._lock:
                self.error_count += 1
            return
        with self._lock:
            self.message_count += 1
        self._dispatch_message(payload)

    def _dispatch_message(self, payload: dict[str, Any]) -> None:
        if not isinstance(payload, dict):
            return
        msg_type = str(payload.get("type") or "").strip().lower()
        if msg_type == "update":
            self.adapter.emit_legacy_update(payload)
            with self._lock:
                self.event_count += 1
            self._mark_event_received()
            return
        if msg_type not in {"init", "state"}:
            return
        events = payload.get("events") or []
        if not isinstance(events, list):
            return
        emitted = 0
        for event in events:
            if not isinstance(event, dict):
                continue
            self.adapter.emit_legacy_update(
                {"type": "update", "source": "ps3838", "data": event}
            )
            emitted += 1
        if emitted:
            with self._lock:
                self.event_count += emitted
            self._mark_event_received()


__all__ = [
    "DEFAULT_BRIDGE_WS_URL",
    "Pin888WsBridge",
    "pin888_bridge_enabled",
    "pin888_bridge_ws_url",
]