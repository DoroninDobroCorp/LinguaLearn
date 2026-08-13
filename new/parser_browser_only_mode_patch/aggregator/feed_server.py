"""v2 feed server (Phase 7, TZ §9.5).

Lightweight HTTP + SSE feed server on port 9013 (configurable via
``MSP_FEED_PORT``). Serves:

- ``GET /snapshot?profile=lightweight|analytics|debug`` — full state.
- ``GET /events?profile=...&since_ts=<iso>`` — SSE delta stream.
- ``GET /health`` — liveness check.

Flag: ``MSP_V2_FEED_ENABLED`` (default off). When off, the server
does NOT start. The server never binds at import time.

Dependencies: stdlib only (``http.server`` + ``threading``).
The legacy ``:9012`` feed is COMPLETELY UNTOUCHED.
"""

from __future__ import annotations

import json
import hmac
import os
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable, Optional
from urllib.parse import parse_qs, urlparse

from aggregator.views import ViewProfile, build_delta_payload, build_snapshot_payload


def v2_feed_enabled() -> bool:
    """Check ``MSP_V2_FEED_ENABLED``; default OFF."""
    return os.environ.get("MSP_V2_FEED_ENABLED", "").strip() in (
        "1",
        "true",
        "True",
        "yes",
    )


def _feed_port() -> int:
    try:
        return int(os.environ.get("MSP_FEED_PORT", "9013"))
    except (ValueError, TypeError):
        return 9013


def _parse_profile(raw: str) -> ViewProfile:
    raw = raw.strip().lower()
    if raw == "analytics":
        return ViewProfile.ANALYTICS
    if raw == "debug":
        return ViewProfile.DEBUG
    return ViewProfile.LIGHTWEIGHT


QuoteProvider = Callable[[], list[Any]]
MonitoringProvider = Callable[[], dict[str, Any]]
RemoteEventHandler = Callable[[dict[str, Any]], dict[str, Any] | None]
RemoteRawFrameHandler = Callable[[dict[str, Any]], dict[str, Any] | None]
RemoteWatchlistProvider = Callable[[], list[int]]
RemoteMoreBetTargetProvider = Callable[[], int | None]
LiveDomSnapshotProvider = Callable[[], dict[str, Any]]


def _remote_fleet_token() -> str:
    return os.environ.get("MSP_REMOTE_FLEET_TOKEN", "").strip()


def _max_post_bytes() -> int:
    try:
        return int(os.environ.get("MSP_FEED_MAX_POST_BYTES", str(20 * 1024 * 1024)))
    except (TypeError, ValueError):
        return 20 * 1024 * 1024


class _FeedHandler(BaseHTTPRequestHandler):
    """HTTP request handler for the v2 feed."""

    # Class-level references set by FeedServer before serving.
    quote_provider: Optional[QuoteProvider] = None
    monitoring_provider: Optional[MonitoringProvider] = None
    remote_event_handler: Optional[RemoteEventHandler] = None
    remote_raw_frame_handler: Optional[RemoteRawFrameHandler] = None
    remote_watchlist_provider: Optional[RemoteWatchlistProvider] = None
    remote_morebet_target_provider: Optional[RemoteMoreBetTargetProvider] = None
    live_dom_snapshot_provider: Optional[LiveDomSnapshotProvider] = None

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        # Suppress default stderr logging.
        pass

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        params = parse_qs(parsed.query)

        if path == "/health":
            self._respond_json({"status": "ok"})
        elif path == "/monitoring":
            self._handle_monitoring()
        elif path == "/fleet/watchlist":
            self._handle_remote_watchlist()
        elif path == "/snapshot":
            self._handle_snapshot(params)
        elif path == "/live-dom-snapshot":
            provider = self.__class__.live_dom_snapshot_provider
            self._respond_json(provider() if provider else {"events": [], "count": 0})
        elif path == "/events":
            self._handle_events_sse(params)
        else:
            self._respond_json({"error": "not found"}, status=404)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/fleet/events":
            self._handle_remote_events()
        elif path == "/fleet/raw-frames":
            self._handle_remote_raw_frames()
        elif path == "/fleet/morebet/next":
            self._handle_remote_morebet_next()
        else:
            self._respond_json({"error": "not found"}, status=404)

    def _handle_snapshot(self, params: dict[str, list[str]]) -> None:
        profile = _parse_profile(params.get("profile", ["lightweight"])[0])
        provider = self.__class__.quote_provider
        quotes = provider() if provider else []
        payload = build_snapshot_payload(profile, quotes)
        self._respond_json(payload)

    def _handle_monitoring(self) -> None:
        provider = self.__class__.monitoring_provider
        payload = provider() if provider else {}
        self._respond_json(payload)

    def _handle_remote_watchlist(self) -> None:
        if not self._authorize_remote():
            return
        provider = self.__class__.remote_watchlist_provider
        if provider is None:
            self._respond_json({"ok": False, "error": "remote_fleet_disabled"}, status=503)
            return
        try:
            watchlist = [int(x) for x in provider()]
        except Exception:
            self._respond_json({"ok": False, "error": "watchlist_failed"}, status=500)
            return
        self._respond_json({"ok": True, "watchlist": watchlist})

    def _handle_remote_morebet_next(self) -> None:
        if not self._authorize_remote():
            return
        provider = self.__class__.remote_morebet_target_provider
        if provider is None:
            self._respond_json({"ok": True, "event_id": None})
            return
        try:
            event_id = provider()
        except Exception:
            self._respond_json({"ok": False, "error": "morebet_next_failed"}, status=500)
            return
        self._respond_json({"ok": True, "event_id": event_id})

    def _handle_remote_events(self) -> None:
        if not self._authorize_remote():
            return
        handler = self.__class__.remote_event_handler
        if handler is None:
            self._respond_json({"ok": False, "error": "remote_fleet_disabled"}, status=503)
            return
        payload = self._read_json_body()
        if payload is None:
            return
        events = self._payload_items(payload, "events", "event")
        accepted, errors = self._handle_remote_items(events, handler)
        self._respond_json({"ok": not errors, "accepted": accepted, "errors": errors[:5]})

    def _handle_remote_raw_frames(self) -> None:
        if not self._authorize_remote():
            return
        handler = self.__class__.remote_raw_frame_handler
        if handler is None:
            self._respond_json({"ok": False, "error": "remote_fleet_disabled"}, status=503)
            return
        payload = self._read_json_body()
        if payload is None:
            return
        frames = self._payload_items(payload, "frames", "frame")
        accepted, errors = self._handle_remote_items(frames, handler)
        self._respond_json({"ok": not errors, "accepted": accepted, "errors": errors[:5]})

    def _authorize_remote(self) -> bool:
        token = _remote_fleet_token()
        if not token:
            return True
        supplied = self.headers.get("X-PS38-Remote-Token", "").strip()
        auth = self.headers.get("Authorization", "").strip()
        if not supplied and auth.lower().startswith("bearer "):
            supplied = auth[7:].strip()
        if hmac.compare_digest(supplied, token):
            return True
        self._respond_json({"ok": False, "error": "unauthorized"}, status=401)
        return False

    def _read_json_body(self) -> Any | None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except (TypeError, ValueError):
            length = 0
        if length <= 0:
            self._respond_json({"ok": False, "error": "empty_body"}, status=400)
            return None
        if length > _max_post_bytes():
            self._respond_json({"ok": False, "error": "body_too_large"}, status=413)
            return None
        try:
            raw = self.rfile.read(length)
            return json.loads(raw.decode("utf-8"))
        except Exception:
            self._respond_json({"ok": False, "error": "invalid_json"}, status=400)
            return None

    @staticmethod
    def _payload_items(payload: Any, list_key: str, single_key: str) -> list[dict[str, Any]]:
        if isinstance(payload, list):
            raw_items = payload
        elif isinstance(payload, dict) and isinstance(payload.get(list_key), list):
            raw_items = payload[list_key]
        elif isinstance(payload, dict) and isinstance(payload.get(single_key), dict):
            raw_items = [payload[single_key]]
        elif isinstance(payload, dict):
            raw_items = [payload]
        else:
            raw_items = []
        return [item for item in raw_items if isinstance(item, dict)]

    @staticmethod
    def _handle_remote_items(
        items: list[dict[str, Any]],
        handler: Callable[[dict[str, Any]], dict[str, Any] | None],
    ) -> tuple[int, list[str]]:
        accepted = 0
        errors: list[str] = []
        for item in items:
            try:
                handler(item)
                accepted += 1
            except Exception as exc:  # noqa: BLE001
                errors.append(str(exc)[:200])
        return accepted, errors

    def _handle_events_sse(self, params: dict[str, list[str]]) -> None:
        profile = _parse_profile(params.get("profile", ["lightweight"])[0])
        since_raw = params.get("since_ts", [None])[0]
        since_ts: Optional[datetime] = None
        if since_raw:
            try:
                since_ts = datetime.fromisoformat(since_raw)
            except (ValueError, TypeError):
                pass

        # Normalize naive timestamp to UTC to avoid TypeError when
        # comparing with tz-aware received_at.
        if since_ts is not None and since_ts.tzinfo is None:
            since_ts = since_ts.replace(tzinfo=timezone.utc)

        # Build payload BEFORE sending headers so parse errors return
        # a clean HTTP error instead of crashing mid-stream.
        provider = self.__class__.quote_provider
        quotes = provider() if provider else []
        try:
            payload = build_delta_payload(profile, since_ts, quotes)
        except Exception:
            self._respond_json({"error": "failed to build delta payload"}, status=500)
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()

        data = json.dumps(payload, default=str)
        try:
            self.wfile.write(f"data: {data}\n\n".encode("utf-8"))
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            return  # client disconnected
        # Single-shot SSE: close after first frame. A real streaming
        # implementation would loop here with keep-alive; for now the
        # consumer reconnects for the next delta.

    def _respond_json(self, obj: Any, status: int = 200) -> None:
        body = json.dumps(obj, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            return


class FeedServer:
    """Manages the v2 feed HTTP server lifecycle.

    Call :meth:`start` to bind and serve in a background thread.
    Call :meth:`stop` to shut down. Never binds at construction time.
    """

    def __init__(
        self,
        quote_provider: Optional[QuoteProvider] = None,
        monitoring_provider: Optional[MonitoringProvider] = None,
        remote_event_handler: Optional[RemoteEventHandler] = None,
        remote_raw_frame_handler: Optional[RemoteRawFrameHandler] = None,
        remote_watchlist_provider: Optional[RemoteWatchlistProvider] = None,
        remote_morebet_target_provider: Optional[RemoteMoreBetTargetProvider] = None,
        live_dom_snapshot_provider: Optional[LiveDomSnapshotProvider] = None,
        port: Optional[int] = None,
    ):
        self._port = port if port is not None else _feed_port()
        self._quote_provider = quote_provider or (lambda: [])
        self._monitoring_provider = monitoring_provider or (lambda: {})
        self._remote_event_handler = remote_event_handler
        self._remote_raw_frame_handler = remote_raw_frame_handler
        self._remote_watchlist_provider = remote_watchlist_provider
        self._remote_morebet_target_provider = remote_morebet_target_provider
        self._live_dom_snapshot_provider = live_dom_snapshot_provider
        self._server: Optional[ThreadingHTTPServer] = None
        self._thread: Optional[threading.Thread] = None

    @property
    def port(self) -> int:
        return self._port

    def start(self) -> None:
        """Start the server in a daemon thread. Idempotent."""
        if self._server is not None:
            return
        if not v2_feed_enabled():
            return

        # Wire provider to handler class.
        handler_class = type(
            "_BoundFeedHandler",
            (_FeedHandler,),
            {
                "quote_provider": self._quote_provider,
                "monitoring_provider": self._monitoring_provider,
                "remote_event_handler": self._remote_event_handler,
                "remote_raw_frame_handler": self._remote_raw_frame_handler,
                "remote_watchlist_provider": self._remote_watchlist_provider,
                "remote_morebet_target_provider": self._remote_morebet_target_provider,
                "live_dom_snapshot_provider": self._live_dom_snapshot_provider,
            },
        )
        self._server = ThreadingHTTPServer(("127.0.0.1", self._port), handler_class)
        self._server.daemon_threads = True
        self._thread = threading.Thread(
            target=self._server.serve_forever,
            daemon=True,
            name="v2-feed-server",
        )
        self._thread.start()

    def stop(self) -> None:
        """Shut down the server. Idempotent."""
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
            self._server = None
            self._thread = None

    @property
    def is_running(self) -> bool:
        return self._server is not None


__all__ = [
    "FeedServer",
    "MonitoringProvider",
    "QuoteProvider",
    "RemoteEventHandler",
    "RemoteMoreBetTargetProvider",
    "RemoteRawFrameHandler",
    "RemoteWatchlistProvider",
    "v2_feed_enabled",
]
