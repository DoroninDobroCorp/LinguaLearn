#!/usr/bin/env python3
"""Bridge the internal aggregated browser-parser feed into Big Value Analyzer.

This process intentionally has no bookmaker-provider client.  Its only upstream
is the loopback WebSocket endpoint created by the SSH transport from ``secret``.
It unwraps the aggregate feed envelopes and sends one canonical ``GameData``
object per WebSocket message to the live or prematch Analyzer ingress.

Freshness is fail-closed:

* init/replay frames keep the real ``PriceConfirmedAt`` / ``CreatedAt``;
* all frames use the browser ``PriceConfirmedAt`` / ``CreatedAt``;
* delivery/receipt time is never substituted for missing confirmation time;
* stale frames, tombstones and malformed events aren't forwarded.
"""

from __future__ import annotations

import asyncio
import copy
import json
import logging
import math
import os
import signal
import threading
import time
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import websockets
import yaml

from internal_analyzer_transport import ingress_headers


LOGGER = logging.getLogger("bv_aggregated_feed_adapter")
ALLOWED_ENVELOPE_SOURCES = frozenset({"ps3838"})
EXPECTED_DATA_SOURCE = "Pinnacle"
MAX_FRAME_BYTES = 16 * 1024 * 1024
PROVENANCE_REQUIRED_MARKETS = (
    "Win1x2",
    "Totals",
    "Handicap",
    "FirstTeamTotals",
    "SecondTeamTotals",
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def positive_prices(value: Any) -> int:
    """Count canonical positive decimal-odds leaves in a nested structure."""
    if isinstance(value, list):
        return sum(positive_prices(item) for item in value)
    if not isinstance(value, dict):
        return 0

    count = 0
    if "value" in value:
        try:
            price = float(value["value"])
            if math.isfinite(price) and price > 1.0:
                count += 1
        except (TypeError, ValueError):
            pass
    return count + sum(
        positive_prices(item) for key, item in value.items() if key != "value"
    )


def has_unprovenanced_price(periods: list[Any]) -> bool:
    """Detect any positive price that did not come from a parser line.

    Genuine browser-parser price leaves carry a non-empty ``raw`` provenance
    object.  The aggregator compatibility projection used to inject a winning
    outcome from a later period into period zero without that object.  Rejecting
    the whole event is deliberately fail-closed and prevents a contaminated
    replay cache or an unprovenanced special from reaching value calculation.
    """

    def contains_unprovenanced_leaf(value: Any) -> bool:
        if isinstance(value, list):
            return any(contains_unprovenanced_leaf(item) for item in value)
        if not isinstance(value, dict):
            return False
        if "value" in value:
            try:
                price = float(value["value"])
            except (TypeError, ValueError):
                return False
            return (
                math.isfinite(price)
                and price > 1.0
                and (
                    not isinstance(value.get("raw"), dict)
                    or not value.get("raw")
                )
            )
        return any(
            contains_unprovenanced_leaf(item)
            for key, item in value.items()
            if not str(key).startswith("_")
        )

    return contains_unprovenanced_leaf(periods)


def base_market_confirmation_epochs(
    periods: list[Any],
) -> tuple[dict[tuple[int, str], float] | None, str | None]:
    """Return authoritative browser timestamps for populated base markets.

    A group is relevant only when it contains a positive canonical price.
    Every such group must carry its own finite Unix-seconds timestamp from the
    browser site-WebSocket frame.  No event, delivery or heartbeat timestamp is
    accepted as a substitute.
    """
    confirmed: dict[tuple[int, str], float] = {}
    for period_index, period in enumerate(periods):
        if not isinstance(period, dict):
            continue
        market_times = period.get("_market_ts")
        for market_name in PROVENANCE_REQUIRED_MARKETS:
            market = period.get(market_name)
            if not isinstance(market, dict) or positive_prices(market) == 0:
                continue
            if not isinstance(market_times, dict):
                return None, "missing_market_confirmation"
            raw_timestamp = market_times.get(market_name)
            if isinstance(raw_timestamp, bool):
                return None, "invalid_market_confirmation"
            try:
                timestamp = float(raw_timestamp)
            except (TypeError, ValueError):
                return None, "invalid_market_confirmation"
            if not math.isfinite(timestamp) or timestamp <= 0.0:
                return None, "invalid_market_confirmation"
            confirmed[(period_index, market_name)] = timestamp
    return confirmed, None


def confirmations_regress(
    current: dict[tuple[int, str], float],
    previous: dict[tuple[int, str], float],
) -> bool:
    """Whether an update moves any already-seen market timestamp backward."""
    return any(
        key in previous and timestamp + 1e-6 < previous[key]
        for key, timestamp in current.items()
    )


def normalized_identity(value: str) -> str:
    return " ".join(value.casefold().split())


@dataclass(frozen=True)
class AdapterConfig:
    upstream_url: str
    snapshot_url: str
    analyzer_live_url: str
    analyzer_prematch_url: str
    analyzer_key: str
    health_host: str
    health_port: int
    max_live_confirmation_age_seconds: float
    max_prematch_confirmation_age_seconds: float
    max_future_skew_seconds: float

    @classmethod
    def from_environment(cls) -> "AdapterConfig":
        config_path = Path(
            os.environ.get(
                "BV_ANALYZER_CONFIG",
                "/srv/big_value/backend/analyzer/configs/common.yml",
            )
        )
        analyzer_key = os.environ.get("BV_ANALYZER_INGRESS_KEY", "").strip()
        if not analyzer_key:
            with config_path.open("r", encoding="utf-8") as config_file:
                config_doc = yaml.safe_load(config_file) or {}
            analyzer_key = str(
                config_doc.get("security", {})
                .get("api_keys", {})
                .get("pinnacle", "")
            ).strip()
        if not analyzer_key:
            raise RuntimeError("authoritative-source Analyzer ingress key is missing")

        return cls(
            upstream_url=os.environ.get(
                "BV_AGGREGATED_FEED_URL", "ws://127.0.0.1:19014"
            ),
            snapshot_url=os.environ.get(
                "BV_AGGREGATED_SNAPSHOT_URL", "http://127.0.0.1:19014/snapshot"
            ),
            analyzer_live_url=os.environ.get(
                "BV_ANALYZER_LIVE_URL", "ws://127.0.0.1:7200"
            ),
            analyzer_prematch_url=os.environ.get(
                "BV_ANALYZER_PREMATCH_URL", "ws://127.0.0.1:7201"
            ),
            analyzer_key=analyzer_key,
            health_host=os.environ.get("BV_FEED_ADAPTER_HEALTH_HOST", "127.0.0.1"),
            health_port=int(os.environ.get("BV_FEED_ADAPTER_HEALTH_PORT", "19015")),
            max_live_confirmation_age_seconds=float(
                os.environ.get("BV_FEED_MAX_LIVE_CONFIRMATION_AGE_SECONDS", "7")
            ),
            max_prematch_confirmation_age_seconds=float(
                os.environ.get(
                    "BV_FEED_MAX_PREMATCH_CONFIRMATION_AGE_SECONDS", "90"
                )
            ),
            max_future_skew_seconds=float(
                os.environ.get("BV_FEED_MAX_FUTURE_SKEW_SECONDS", "10")
            ),
        )


class AdapterStats:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.started_at = iso_now()
        self.upstream_connected = False
        self.initialized = False
        self.replay_total = 0
        self.replay_remaining = 0
        self.live_downstream_connected = False
        self.prematch_downstream_connected = False
        self.last_upstream_message_at: str | None = None
        self.last_heartbeat_at: str | None = None
        self.last_live_forward_at: str | None = None
        self.last_prematch_forward_at: str | None = None
        self.received_frames = 0
        self.forwarded_live = 0
        self.forwarded_prematch = 0
        self.rejected: dict[str, int] = {}
        self.reconnects = 0
        self.downstream_send_errors = 0
        self.reconcile_successes = 0
        self.reconcile_failures = 0
        self.platform_degraded_frames = 0
        self.last_reconcile_at: str | None = None

    def set(self, **values: Any) -> None:
        with self._lock:
            for key, value in values.items():
                setattr(self, key, value)

    def increment(self, key: str, amount: int = 1) -> None:
        with self._lock:
            setattr(self, key, int(getattr(self, key)) + amount)

    def reject(self, reason: str) -> None:
        with self._lock:
            self.rejected[reason] = self.rejected.get(reason, 0) + 1

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            data = {
                "started_at": self.started_at,
                "upstream_connected": self.upstream_connected,
                "initialized": self.initialized,
                "replay_total": self.replay_total,
                "replay_remaining": self.replay_remaining,
                "downstream": {
                    "live_connected": self.live_downstream_connected,
                    "prematch_connected": self.prematch_downstream_connected,
                },
                "last_upstream_message_at": self.last_upstream_message_at,
                "last_heartbeat_at": self.last_heartbeat_at,
                "last_live_forward_at": self.last_live_forward_at,
                "last_prematch_forward_at": self.last_prematch_forward_at,
                "last_reconcile_at": self.last_reconcile_at,
                "counters": {
                    "received_frames": self.received_frames,
                    "forwarded_live": self.forwarded_live,
                    "forwarded_prematch": self.forwarded_prematch,
                    "rejected": dict(sorted(self.rejected.items())),
                    "reconnects": self.reconnects,
                    "downstream_send_errors": self.downstream_send_errors,
                    "reconcile_successes": self.reconcile_successes,
                    "reconcile_failures": self.reconcile_failures,
                    "platform_degraded_frames": self.platform_degraded_frames,
                },
            }

        if not data["upstream_connected"] or not data["initialized"]:
            status = "starting"
        elif not all(data["downstream"].values()):
            status = "degraded"
        else:
            status = "ok"
        data["status"] = status
        return data


def prepare_event(
    raw_event: Any,
    *,
    replay: bool,
    stale: bool,
    now: datetime,
    max_live_confirmation_age_seconds: float,
    max_prematch_confirmation_age_seconds: float,
    max_future_skew_seconds: float,
) -> tuple[dict[str, Any] | None, str | None]:
    """Validate one feed event and select an honest confirmation timestamp."""
    # The shared feed's legacy ``stale`` bit currently describes platform
    # topology (browser-only / API_DEGRADED), not price age.  It is exposed as
    # telemetry by FeedAdapter, while price admission is decided exclusively by
    # the browser confirmations below.  Replay receives the exact same checks.
    _ = replay, stale
    if not isinstance(raw_event, dict):
        return None, "data_not_object"
    if raw_event.get("Removed") is True or raw_event.get("Deleted") is True:
        return None, "tombstone"
    if raw_event.get("Source") != EXPECTED_DATA_SOURCE:
        return None, "unexpected_data_source"

    pid = raw_event.get("Pid")
    if isinstance(pid, bool) or not isinstance(pid, int) or pid <= 0:
        return None, "invalid_pid"
    match_id = raw_event.get("MatchId")
    if not isinstance(match_id, str) or not match_id.strip():
        return None, "missing_match_id"
    for field in ("LeagueName", "homeName", "awayName", "SportName"):
        value = raw_event.get(field)
        if not isinstance(value, str) or len(value.strip()) < 2:
            return None, f"invalid_{field}"
    if normalized_identity(raw_event["homeName"]) == normalized_identity(
        raw_event["awayName"]
    ):
        return None, "same_teams"
    if type(raw_event.get("isLive")) is not bool:
        return None, "invalid_live_flag"

    periods = raw_event.get("Periods")
    if not isinstance(periods, list) or not periods:
        return None, "missing_periods"
    if positive_prices(periods) == 0:
        return None, "no_positive_prices"
    if has_unprovenanced_price(periods):
        return None, "unprovenanced_price"

    confirmation_raw = raw_event.get("PriceConfirmedAt")
    confirmation = parse_timestamp(confirmation_raw)
    if confirmation is None:
        return None, "missing_confirmation_time"

    market_confirmations, market_reason = base_market_confirmation_epochs(periods)
    if market_confirmations is None:
        return None, market_reason

    confirmation_epochs = [confirmation.timestamp(), *market_confirmations.values()]
    now_epoch = now.timestamp()
    if any(
        timestamp - now_epoch > max_future_skew_seconds
        for timestamp in confirmation_epochs
    ):
        return None, "confirmation_in_future"

    effective_confirmation = datetime.fromtimestamp(
        min(confirmation_epochs), tz=timezone.utc
    )
    max_age_seconds = (
        max_live_confirmation_age_seconds
        if raw_event["isLive"]
        else max_prematch_confirmation_age_seconds
    )
    if (now - effective_confirmation).total_seconds() > max_age_seconds:
        return None, "confirmation_stale"

    event = copy.deepcopy(raw_event)
    event["CreatedAt"] = effective_confirmation.isoformat(
        timespec="milliseconds"
    ).replace("+00:00", "Z")
    return event, None


class AnalyzerSink:
    def __init__(
        self,
        *,
        mode: str,
        url: str,
        analyzer_key: str,
        stats: AdapterStats,
    ) -> None:
        self.mode = mode
        self.url = url
        self.analyzer_key = analyzer_key
        self.stats = stats
        self.websocket: Any = None
        self._lock = asyncio.Lock()

    def _set_connected(self, connected: bool) -> None:
        self.stats.set(**{f"{self.mode}_downstream_connected": connected})

    async def connect(self) -> None:
        if self.websocket is not None:
            return
        self.websocket = await websockets.connect(
            self.url,
            additional_headers=ingress_headers(self.analyzer_key),
            proxy=None,
            open_timeout=10,
            ping_interval=20,
            ping_timeout=20,
            close_timeout=3,
            max_size=MAX_FRAME_BYTES,
            max_queue=128,
        )
        self._set_connected(True)
        LOGGER.info("connected to %s Analyzer ingress", self.mode)

    async def close(self) -> None:
        websocket, self.websocket = self.websocket, None
        self._set_connected(False)
        if websocket is not None:
            try:
                await websocket.close()
            except Exception:
                pass

    async def send(self, event: dict[str, Any]) -> None:
        payload = json.dumps(event, ensure_ascii=False, separators=(",", ":"))
        async with self._lock:
            for attempt in range(2):
                try:
                    await self.connect()
                    await self.websocket.send(payload)
                    stamp = iso_now()
                    if self.mode == "live":
                        self.stats.increment("forwarded_live")
                        self.stats.set(last_live_forward_at=stamp)
                    else:
                        self.stats.increment("forwarded_prematch")
                        self.stats.set(last_prematch_forward_at=stamp)
                    return
                except Exception as exc:
                    self.stats.increment("downstream_send_errors")
                    await self.close()
                    if attempt == 0:
                        await asyncio.sleep(0.2)
                        continue
                    raise RuntimeError(
                        f"failed to send event to {self.mode} Analyzer"
                    ) from exc


class FeedAdapter:
    def __init__(self, config: AdapterConfig, stats: AdapterStats) -> None:
        self.config = config
        self.stats = stats
        self.live_sink = AnalyzerSink(
            mode="live",
            url=config.analyzer_live_url,
            analyzer_key=config.analyzer_key,
            stats=stats,
        )
        self.prematch_sink = AnalyzerSink(
            mode="prematch",
            url=config.analyzer_prematch_url,
            analyzer_key=config.analyzer_key,
            stats=stats,
        )
        self.replay_remaining = 0
        self.replay_buffer: dict[int, dict[str, Any]] = {}
        self.last_market_confirmations: dict[
            tuple[int, str, int, str], float
        ] = {}

    async def close(self) -> None:
        await asyncio.gather(self.live_sink.close(), self.prematch_sink.close())

    async def _forward_event(self, raw_event: Any, *, replay: bool, stale: bool) -> None:
        if stale:
            self.stats.increment("platform_degraded_frames")
        event, reason = prepare_event(
            raw_event,
            replay=replay,
            stale=stale,
            now=utc_now(),
            max_live_confirmation_age_seconds=(
                self.config.max_live_confirmation_age_seconds
            ),
            max_prematch_confirmation_age_seconds=(
                self.config.max_prematch_confirmation_age_seconds
            ),
            max_future_skew_seconds=self.config.max_future_skew_seconds,
        )
        if event is None:
            self.stats.reject(reason or "unknown")
            return
        current_confirmations, _ = base_market_confirmation_epochs(event["Periods"])
        current_confirmations = current_confirmations or {}
        previous: dict[tuple[int, str], float] = {}
        for period_index, market_name in current_confirmations:
            identity = (
                event["Pid"],
                event["MatchId"],
                period_index,
                market_name,
            )
            if identity in self.last_market_confirmations:
                previous[(period_index, market_name)] = (
                    self.last_market_confirmations[identity]
                )
        if confirmations_regress(current_confirmations, previous):
            self.stats.reject("market_confirmation_regressed")
            return
        sink = self.live_sink if event["isLive"] else self.prematch_sink
        await sink.send(event)
        for (period_index, market_name), timestamp in current_confirmations.items():
            self.last_market_confirmations[
                (event["Pid"], event["MatchId"], period_index, market_name)
            ] = timestamp

    def _fetch_snapshot_sync(self) -> tuple[list[Any], bool]:
        request = urllib.request.Request(
            self.config.snapshot_url,
            headers={"Accept": "application/json"},
            method="GET",
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read(MAX_FRAME_BYTES + 1)
        if len(body) > MAX_FRAME_BYTES:
            raise RuntimeError("aggregated snapshot exceeds size limit")
        document = json.loads(body)
        if not isinstance(document, dict) or not isinstance(document.get("events"), list):
            raise RuntimeError("aggregated snapshot has invalid shape")
        return document["events"], bool(document.get("stale", False))

    async def _publish_initial_state(
        self, events: list[Any], *, stale: bool, reconciled: bool
    ) -> None:
        for event in events:
            await self._forward_event(event, replay=True, stale=stale)
        values: dict[str, Any] = {"initialized": True}
        if reconciled:
            values["last_reconcile_at"] = iso_now()
            self.stats.increment("reconcile_successes")
        self.stats.set(**values)

    async def _complete_replay(self) -> None:
        fallback_events = list(self.replay_buffer.values())
        try:
            events, stale = await asyncio.to_thread(self._fetch_snapshot_sync)
            await self._publish_initial_state(
                events, stale=stale, reconciled=True
            )
            LOGGER.info(
                "initial replay reconciled against current snapshot: %d events",
                len(events),
            )
        except Exception as exc:
            self.stats.increment("reconcile_failures")
            LOGGER.warning(
                "post-replay snapshot reconcile failed (%s); using complete replay state",
                type(exc).__name__,
            )
            await self._publish_initial_state(
                fallback_events, stale=False, reconciled=False
            )
        finally:
            self.replay_buffer.clear()

    async def _handle_frame(self, raw_frame: str | bytes) -> None:
        self.stats.increment("received_frames")
        self.stats.set(last_upstream_message_at=iso_now())
        try:
            envelope = json.loads(raw_frame)
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.stats.reject("invalid_json")
            return
        if not isinstance(envelope, dict):
            self.stats.reject("envelope_not_object")
            return

        envelope_type = envelope.get("type")
        if envelope_type == "heartbeat":
            if envelope.get("source") not in ALLOWED_ENVELOPE_SOURCES:
                self.stats.reject("unexpected_envelope_source")
                return
            self.stats.set(last_heartbeat_at=iso_now())
            return

        if envelope_type == "init":
            events = envelope.get("events")
            if not isinstance(events, list):
                self.stats.reject("invalid_init_events")
                return
            replay_total = int(envelope.get("replay_total") or 0)
            self.replay_remaining = max(0, replay_total)
            self.replay_buffer.clear()
            self.stats.set(
                replay_total=self.replay_remaining,
                replay_remaining=self.replay_remaining,
                initialized=(self.replay_remaining == 0),
            )
            if self.replay_remaining == 0:
                await self._publish_initial_state(
                    events,
                    stale=bool(envelope.get("stale", False)),
                    reconciled=False,
                )
            return

        if envelope_type != "update":
            self.stats.reject("unknown_envelope_type")
            return
        if envelope.get("source") not in ALLOWED_ENVELOPE_SOURCES:
            self.stats.reject("unexpected_envelope_source")
            return

        is_replay = self.replay_remaining > 0
        if is_replay:
            replay_event = envelope.get("data")
            if isinstance(replay_event, dict):
                replay_pid = replay_event.get("Pid")
                if isinstance(replay_pid, int) and not isinstance(replay_pid, bool):
                    self.replay_buffer[replay_pid] = replay_event
            self.replay_remaining -= 1
            self.stats.set(replay_remaining=self.replay_remaining)
            if self.replay_remaining == 0:
                LOGGER.info(
                    "initial feed replay complete: %d frames",
                    self.stats.snapshot()["replay_total"],
                )
                await self._complete_replay()
            return

        await self._forward_event(
            envelope.get("data"),
            replay=False,
            stale=bool(envelope.get("stale", False)),
        )

    async def run_forever(self) -> None:
        backoff = 1.0
        while True:
            self.replay_remaining = 0
            self.replay_buffer.clear()
            self.stats.set(
                upstream_connected=False,
                initialized=False,
                replay_total=0,
                replay_remaining=0,
            )
            try:
                await asyncio.gather(
                    self.live_sink.connect(), self.prematch_sink.connect()
                )
                LOGGER.info("connecting to internal aggregated parser feed")
                async with websockets.connect(
                    self.config.upstream_url,
                    proxy=None,
                    open_timeout=15,
                    ping_interval=20,
                    ping_timeout=20,
                    close_timeout=3,
                    max_size=MAX_FRAME_BYTES,
                    max_queue=2048,
                ) as upstream:
                    self.stats.set(upstream_connected=True)
                    backoff = 1.0
                    async for frame in upstream:
                        await self._handle_frame(frame)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self.stats.increment("reconnects")
                LOGGER.warning(
                    "feed connection cycle failed (%s); retrying in %.1fs",
                    type(exc).__name__,
                    backoff,
                )
            finally:
                self.stats.set(upstream_connected=False, initialized=False)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30.0)


def start_health_server(stats: AdapterStats, host: str, port: int) -> ThreadingHTTPServer:
    class HealthHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 - stdlib handler API
            if self.path.rstrip("/") != "/health":
                self.send_error(404)
                return
            payload = json.dumps(stats.snapshot(), sort_keys=True).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, format_string: str, *args: Any) -> None:
            return

    server = ThreadingHTTPServer((host, port), HealthHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


async def async_main() -> None:
    config = AdapterConfig.from_environment()
    stats = AdapterStats()
    health_server = start_health_server(stats, config.health_host, config.health_port)
    adapter = FeedAdapter(config, stats)
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop_event.set)

    runner = asyncio.create_task(adapter.run_forever())
    await stop_event.wait()
    runner.cancel()
    try:
        await runner
    except asyncio.CancelledError:
        pass
    await adapter.close()
    health_server.shutdown()


def main() -> None:
    logging.basicConfig(
        level=os.environ.get("BV_FEED_ADAPTER_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
