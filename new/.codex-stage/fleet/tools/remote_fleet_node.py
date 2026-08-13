#!/usr/bin/env python3
"""Run PS3838 fleet workers on a remote node and post events to central feed.

The central node owns publication/consumers.  This process owns browser workers
for local accounts and sends normalized frames to ``/fleet/events`` plus raw
MORE_BET replies to ``/fleet/raw-frames``.  It is intentionally small and uses
the existing Worker/Supervisor/AccountPool limiters instead of redefining rates.
"""

from __future__ import annotations

import asyncio
import json
import os
import queue
import signal
import threading
import time
import urllib.error
import urllib.request
from collections import Counter
from typing import Any

from aggregator.account_pool import AccountPool, FleetAccount, FleetAccountPool
from aggregator.account_runtime_loader import load_ps3838_runtime_bundles
from aggregator.fleet.account_sport_supervisor import AccountSportFleetSupervisor
from aggregator.fleet.sport_allocation import SportSpec, accounts_for_sport, parse_sports
from aggregator.fleet.rotating_supervisor import RotatingFleetSupervisor
from aggregator.fleet.supervisor import Supervisor


DEFAULT_SPORTS = "soccer:29,tennis:33,basketball:4,hockey:19,volleyball:34,e-sports:12"


def _env_bool(name: str, default: str = "0") -> bool:
    return os.environ.get(name, default).strip() in ("1", "true", "True", "yes")


def _central_url() -> str:
    return os.environ.get("REMOTE_FLEET_CENTRAL_URL", "http://127.0.0.1:9013").rstrip("/")


def _remote_token() -> str:
    return os.environ.get("REMOTE_FLEET_TOKEN", "").strip()


def _source_family() -> str:
    raw = os.environ.get("REMOTE_FLEET_SOURCE_FAMILY", "ps3838").strip().lower()
    return raw.replace(" ", "_").replace("/", "_") or "ps3838"


class JsonHttpClient:
    def __init__(self, base_url: str, token: str = "", timeout: float = 8.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout

    def get_json(self, path: str) -> dict[str, Any]:
        req = urllib.request.Request(self.base_url + path, headers=self._headers())
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data if isinstance(data, dict) else {}

    def post_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(payload, separators=(",", ":"), default=str).encode("utf-8")
        req = urllib.request.Request(
            self.base_url + path,
            data=body,
            headers={**self._headers(), "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data if isinstance(data, dict) else {}

    def _headers(self) -> dict[str, str]:
        if not self.token:
            return {}
        return {"X-PS38-Remote-Token": self.token}


class RemoteBatchPoster:
    def __init__(
        self,
        client: JsonHttpClient,
        *,
        event_batch_size: int = 250,
        raw_batch_size: int = 50,
        flush_interval_sec: float = 0.25,
        max_queue: int = 20_000,
        source_family: str = "ps3838",
    ) -> None:
        self.client = client
        self.event_batch_size = max(1, int(event_batch_size))
        self.raw_batch_size = max(1, int(raw_batch_size))
        self.flush_interval_sec = max(0.05, float(flush_interval_sec))
        self.source_family = source_family.strip().lower() or "ps3838"
        self.events: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=max_queue)
        self.live_events: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=max_queue)
        self.raw_frames: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=max_queue)
        self.stop_event = threading.Event()
        self.sent_events = 0
        self.sent_raw_frames = 0
        self.dropped_events = 0
        self.dropped_raw_frames = 0
        self.errors = 0
        self.queued_by_transport: Counter[str] = Counter()
        self.sent_by_transport: Counter[str] = Counter()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="remote-fleet-poster")

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self.stop_event.set()
        self._thread.join(timeout=5.0)

    def on_event(self, frame: dict[str, Any]) -> None:
        event = self._event_payload(frame)
        self.queued_by_transport[str(event.get("transport") or "legacy")] += 1
        target = (
            self.live_events
            if event.get("transport") == "authenticated_dom"
            and bool((event.get("payload") or {}).get("isLive"))
            else self.events
        )
        self._put(target, event, "event")

    def on_raw_frame(self, frame: dict[str, Any]) -> None:
        if frame.get("type") != "MORE_BET":
            return
        self._put(self.raw_frames, frame, "raw")

    def _event_payload(self, frame: dict[str, Any]) -> dict[str, Any]:
        if self.source_family == "ps3838":
            return dict(frame)

        payload = dict(frame)
        account_id = str(payload.get("_account") or "fleet")
        sport_id = payload.get("SportId", "?")
        pid = payload.get("Pid")
        transport = str(payload.get("_transport") or "browser_ws")
        return {
            # Keep independent candidates for the authenticated DOM snapshot
            # and the browser WebSocket.  Reusing one source id caused the
            # slower-arriving WS frame to overwrite the price currently
            # visible to the logged-in user.
            "source_id": "%s:fleet:%s:%s:%s"
            % (self.source_family, account_id, sport_id, transport),
            "family": self.source_family,
            "transport": transport,
            "event_id": "%s:%s" % (self.source_family, pid) if pid is not None else "",
            "account_id": account_id,
            "payload": payload,
        }

    def _put(self, q: queue.Queue[dict[str, Any]], frame: dict[str, Any], kind: str) -> None:
        try:
            q.put_nowait(dict(frame))
        except queue.Full:
            try:
                q.get_nowait()
            except queue.Empty:
                pass
            try:
                q.put_nowait(dict(frame))
            except queue.Full:
                if kind == "event":
                    self.dropped_events += 1
                else:
                    self.dropped_raw_frames += 1

    def _loop(self) -> None:
        next_stats_at = time.monotonic() + 15.0
        while not self.stop_event.is_set():
            self._flush_once()
            if time.monotonic() >= next_stats_at:
                print(
                    "remote fleet transport stats: queued=%s sent=%s errors=%d"
                    % (dict(self.queued_by_transport), dict(self.sent_by_transport), self.errors),
                    flush=True,
                )
                next_stats_at = time.monotonic() + 15.0
            self.stop_event.wait(self.flush_interval_sec)
        for _ in range(20):
            if self.live_events.empty() and self.events.empty() and self.raw_frames.empty():
                break
            self._flush_once()

    def _flush_once(self) -> None:
        # Storefront live DOM must not wait behind a burst of full WS snapshots.
        self._flush_queue(self.live_events, self.event_batch_size, "/fleet/events", "events")
        self._flush_queue(self.events, self.event_batch_size, "/fleet/events", "events")
        self._flush_queue(self.raw_frames, self.raw_batch_size, "/fleet/raw-frames", "frames")

    def _flush_queue(
        self,
        q: queue.Queue[dict[str, Any]],
        batch_size: int,
        path: str,
        key: str,
    ) -> None:
        batch: list[dict[str, Any]] = []
        while len(batch) < batch_size:
            try:
                batch.append(q.get_nowait())
            except queue.Empty:
                break
        if not batch:
            return
        try:
            self.client.post_json(path, {key: batch})
            if key == "events":
                self.sent_events += len(batch)
                self.sent_by_transport.update(
                    str(item.get("transport") or "legacy") for item in batch
                )
            else:
                self.sent_raw_frames += len(batch)
        except Exception:
            self.errors += 1
            # Put newest data back only if there is space; old stale frames can be dropped.
            for item in batch[-batch_size // 2 :]:
                try:
                    q.put_nowait(item)
                except queue.Full:
                    break


class RemoteWatchlistProvider:
    def __init__(self, client: JsonHttpClient, ttl_sec: float = 5.0) -> None:
        self.client = client
        self.ttl_sec = max(0.5, ttl_sec)
        self._expires_at = 0.0
        self._cached: list[int] = []

    def __call__(self) -> list[int]:
        now = time.monotonic()
        if now < self._expires_at:
            return list(self._cached)
        try:
            data = self.client.get_json("/fleet/watchlist")
            raw = data.get("watchlist") if data.get("ok") else []
            self._cached = [int(x) for x in raw] if isinstance(raw, list) else []
            self._expires_at = now + self.ttl_sec
        except Exception:
            self._expires_at = now + min(self.ttl_sec, 2.0)
        return list(self._cached)


class RemoteMoreBetTargetProvider:
    def __init__(self, client: JsonHttpClient, no_target_ttl_sec: float = 1.0) -> None:
        self.client = client
        self.no_target_ttl_sec = max(0.2, no_target_ttl_sec)
        self._no_target_until = 0.0

    def __call__(self) -> int | None:
        now = time.monotonic()
        if now < self._no_target_until:
            return None
        try:
            data = self.client.post_json("/fleet/morebet/next", {})
            event_id = data.get("event_id") if data.get("ok") else None
            if event_id is None:
                self._no_target_until = now + self.no_target_ttl_sec
                return None
            return int(event_id)
        except Exception:
            self._no_target_until = now + self.no_target_ttl_sec
            return None


async def _run_supervisors(
    sports: list[SportSpec],
    fleet_accounts: list[FleetAccount],
    account_pool: AccountPool,
    poster: RemoteBatchPoster,
    watchlist_provider: RemoteWatchlistProvider,
    morebet_provider: RemoteMoreBetTargetProvider,
    stop_event: threading.Event,
) -> None:
    target_k = int(os.environ.get("REMOTE_FLEET_TARGET_K_PER_SPORT", "1"))
    worker_run_sec = float(os.environ.get("REMOTE_FLEET_WORKER_RUN_SEC", "600"))
    cdp_base = int(os.environ.get("REMOTE_FLEET_CDP_BASE", "9300"))
    socks_base = int(os.environ.get("REMOTE_FLEET_SOCKS_BASE", "19300"))
    port_stride = int(os.environ.get("REMOTE_FLEET_PORT_STRIDE", "1000"))
    allocation_mode = os.environ.get("REMOTE_FLEET_ALLOCATION_MODE", "per_sport").strip().lower()
    supervisors: list[Supervisor] = []
    if allocation_mode in {"account_sports", "multi_sport", "multi_tab"}:
        supervisors.append(
            AccountSportFleetSupervisor(
                accounts=fleet_accounts,
                sports=sports,
                on_event=poster.on_event,
                worker_run_sec=worker_run_sec,
                watchlist_provider=watchlist_provider,
                canonical_pool=account_pool,
                on_raw_frame=poster.on_raw_frame,
                next_morebet_target=morebet_provider,
                cdp_base=cdp_base,
                socks_base=socks_base,
                assignment_spec=os.environ.get("REMOTE_FLEET_ACCOUNT_SPORTS", ""),
                rotate_assignments=_env_bool("REMOTE_FLEET_ROTATE_ASSIGNMENTS"),
            )
        )
    elif allocation_mode in {"rotating", "exclusive", "shared_pool"}:
        rotating_target_k = int(
            os.environ.get(
                "REMOTE_FLEET_ROTATING_TARGET_K",
                str(min(target_k, max(1, len(fleet_accounts)))),
            )
        )
        supervisors.append(
            RotatingFleetSupervisor(
                pool=FleetAccountPool(fleet_accounts, success_cooldown_sec=0.0),
                sports=sports,
                on_event=poster.on_event,
                target_k=min(rotating_target_k, max(1, len(fleet_accounts))),
                worker_run_sec=worker_run_sec,
                watchlist_provider=watchlist_provider,
                canonical_pool=account_pool,
                on_raw_frame=poster.on_raw_frame,
                next_morebet_target=morebet_provider,
                cdp_base=cdp_base,
                socks_base=socks_base,
            )
        )
    else:
        for idx, sport in enumerate(sports):
            sport_accounts = accounts_for_sport(fleet_accounts, idx, sport.slug, target_k)
            if not sport_accounts:
                continue
            supervisors.append(
                Supervisor(
                    pool=FleetAccountPool(sport_accounts),
                    on_event=poster.on_event,
                    target_k=len(sport_accounts),
                    sport=sport.sport_id,
                    slug=sport.slug,
                    worker_run_sec=worker_run_sec,
                    watchlist_provider=watchlist_provider,
                    canonical_pool=account_pool,
                    on_raw_frame=poster.on_raw_frame,
                    next_morebet_target=morebet_provider,
                    cdp_base=cdp_base + idx * port_stride,
                    socks_base=socks_base + idx * port_stride,
                )
            )
    if not supervisors:
        raise RuntimeError("no supervisors configured")
    await asyncio.gather(
        *[
            sup.run(total_sec=float("inf"), stop_event=stop_event)
            for sup in supervisors
        ]
    )


def main() -> int:
    sports = parse_sports(os.environ.get("REMOTE_FLEET_SPORTS", DEFAULT_SPORTS), default=DEFAULT_SPORTS)
    bundles = load_ps3838_runtime_bundles(
        accounts_path=os.environ.get("MOREBETS_PS3838_ACCOUNTS_PATH", "~/.secrets/ps3838_accounts.txt"),
        proxies_path=os.environ.get("MOREBETS_PS3838_PROXIES_PATH", "~/.secrets/ps3838_proxies.txt"),
        domain=os.environ.get("MOREBETS_PS3838_DOMAIN", "www.ps3838.com"),
        allow_direct=_env_bool("MOREBETS_PS3838_ALLOW_DIRECT"),
    )
    account_pool = AccountPool()
    for bundle in bundles:
        account_pool.register(bundle.account)
    fleet_accounts = [bundle.fleet_account for bundle in bundles]

    client = JsonHttpClient(
        _central_url(),
        token=_remote_token(),
        timeout=float(os.environ.get("REMOTE_FLEET_HTTP_TIMEOUT_SEC", "8")),
    )
    poster = RemoteBatchPoster(client, source_family=_source_family())
    watchlist_provider = RemoteWatchlistProvider(client)
    morebet_provider = RemoteMoreBetTargetProvider(client)
    stop_event = threading.Event()

    def _stop(_signum: int, _frame: Any) -> None:
        stop_event.set()

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    poster.start()
    print(
        "remote fleet starting: sports=%s accounts=%d central=%s"
        % ([(s.slug, s.sport_id) for s in sports], len(fleet_accounts), _central_url()),
        flush=True,
    )
    try:
        asyncio.run(
            _run_supervisors(
                sports,
                fleet_accounts,
                account_pool,
                poster,
                watchlist_provider,
                morebet_provider,
                stop_event,
            )
        )
    finally:
        poster.stop()
        print(
            "remote fleet stopped: sent_events=%d sent_raw=%d dropped_events=%d errors=%d"
            % (poster.sent_events, poster.sent_raw_frames, poster.dropped_events, poster.errors),
            flush=True,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
