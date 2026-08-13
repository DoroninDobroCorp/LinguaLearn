"""Aggregator CLI entry point (Phase 8, TZ §10).

Assembles all components, starts the event loop, and shuts down
gracefully on SIGINT/SIGTERM.

Flag: ``MSP_AGGREGATOR_ENABLED`` must be set to ``1``/``true`` for
the entry point to actually start. Otherwise prints a message and
exits cleanly.

Not run at import time — everything is inside ``main()``.
"""

from __future__ import annotations

import asyncio
from collections import deque
import logging
import os
import queue
import signal
import threading
import time
from typing import Any, Callable


_remote_event_q: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=20000)
_remote_live_event_q: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=5000)
_remote_event_latest: dict[str, dict[str, dict[str, Any]]] = {}
_remote_live_event_latest: dict[str, dict[str, dict[str, Any]]] = {}
_remote_event_source_order: deque[str] = deque()
_remote_live_event_source_order: deque[str] = deque()
_remote_event_latest_lock = threading.Lock()
_remote_event_drops = 0
_remote_event_drops_lock = threading.Lock()
_live_dom_lock = threading.Lock()
_live_dom_latest: dict[str, tuple[float, dict[str, Any]]] = {}


def _record_remote_event_drop(count: int = 1) -> None:
    global _remote_event_drops
    with _remote_event_drops_lock:
        _remote_event_drops += count


def _remote_event_drop_count() -> int:
    with _remote_event_drops_lock:
        return _remote_event_drops


def _reset_remote_event_queue_for_tests(
    maxsize: int = 20000,
) -> queue.Queue[dict[str, Any]]:
    global _remote_event_drops, _remote_event_q, _remote_live_event_q
    _remote_event_q = queue.Queue(maxsize=maxsize)
    _remote_live_event_q = queue.Queue(maxsize=maxsize)
    with _remote_event_latest_lock:
        _remote_event_latest.clear()
        _remote_live_event_latest.clear()
        _remote_event_source_order.clear()
        _remote_live_event_source_order.clear()
    with _remote_event_drops_lock:
        _remote_event_drops = 0
    return _remote_event_q


def _enqueue_remote_event(item: dict[str, Any]) -> dict[str, Any]:
    """Thread-safe ack; coalesce complete snapshots by source and event.

    Fleet workers send full event snapshots, not deltas.  Queueing every
    intermediate version made a cold-start inventory burst take minutes to
    drain, so consumers received old odds even while newer snapshots were
    already waiting.  Last-write-wins per source/event preserves the same
    final state while keeping live updates bounded and current.
    """
    payload = item.get("payload")
    transport = str(item.get("transport") or "")
    payload_is_live = isinstance(payload, dict) and bool(payload.get("isLive"))
    is_live_dom = (
        transport == "authenticated_dom"
        and payload_is_live
    )
    is_live_priority = (
        transport in {"authenticated_dom", "browser_ws"}
        and payload_is_live
    )
    if is_live_dom:
        pid = str(payload.get("Pid") or item.get("event_id") or "")
        if pid:
            with _live_dom_lock:
                _live_dom_latest[pid] = (time.monotonic(), dict(payload))
    event_id = str(item.get("event_id") or "").strip()
    source_id = str(item.get("source_id") or item.get("transport") or "").strip()
    if event_id and source_id:
        target_latest = (
            _remote_live_event_latest if is_live_priority else _remote_event_latest
        )
        other_latest = (
            _remote_event_latest if is_live_priority else _remote_live_event_latest
        )
        target_order = (
            _remote_live_event_source_order
            if is_live_priority
            else _remote_event_source_order
        )
        with _remote_event_latest_lock:
            bucket = target_latest.get(source_id)
            if bucket is None:
                bucket = target_latest[source_id] = {}
                target_order.append(source_id)
            bucket[event_id] = dict(item)
            other_bucket = other_latest.get(source_id)
            if other_bucket is not None:
                other_bucket.pop(event_id, None)
                if not other_bucket:
                    other_latest.pop(source_id, None)
        return {"ok": True}
    target = (
        _remote_live_event_q
        if is_live_priority
        else _remote_event_q
    )
    try:
        target.put_nowait(item)
    except queue.Full:
        try:
            target.get_nowait()
        except queue.Empty:
            pass
        else:
            target.task_done()
            _record_remote_event_drop()
        try:
            target.put_nowait(item)
        except queue.Full:
            # A concurrent producer filled the queue again; drop this newest item.
            _record_remote_event_drop()
    return {"ok": True}


def _live_dom_snapshot() -> dict[str, Any]:
    cutoff = time.monotonic() - 5.0
    with _live_dom_lock:
        stale = [key for key, (seen, _payload) in _live_dom_latest.items() if seen < cutoff]
        for key in stale:
            _live_dom_latest.pop(key, None)
        events = [dict(payload) for _seen, payload in _live_dom_latest.values()]
    return {"type": "live_dom_snapshot", "events": events, "count": len(events)}


async def _drain_remote_event_queue(
    ingest: Callable[[dict[str, Any]], dict[str, Any] | None],
    stop_event: threading.Event,
    *,
    batch_size: int = 10,
    idle_sleep_sec: float = 0.005,
    log_interval_sec: float = 30.0,
    max_events_per_sec: float = 50.0,
) -> None:
    log = logging.getLogger("aggregator.remote_fleet")
    next_log_at = time.monotonic() + log_interval_sec

    def _pop_latest(
        pending: dict[str, dict[str, dict[str, Any]]],
        source_order: deque[str],
    ) -> dict[str, Any] | None:
        """Pop one event while round-robining independent source streams.

        A cold soccer snapshot is much larger than most sport snapshots.  A
        single insertion-ordered dictionary therefore delayed Tennis,
        Baseball and Esports by minutes even though their current frames were
        already in memory.  One source gets one turn before it is appended to
        the tail again, so every configured sport starts becoming usable at
        once without sacrificing last-write-wins coalescing.
        """
        while source_order:
            source_id = source_order.popleft()
            bucket = pending.get(source_id)
            if not bucket:
                pending.pop(source_id, None)
                continue
            event_id = next(iter(bucket))
            item = bucket.pop(event_id)
            if bucket:
                source_order.append(source_id)
            else:
                pending.pop(source_id, None)
            return item
        return None

    def _pending_latest_count(
        pending: dict[str, dict[str, dict[str, Any]]],
    ) -> int:
        return sum(len(bucket) for bucket in pending.values())

    while (
        not stop_event.is_set()
        or not _remote_live_event_q.empty()
        or not _remote_event_q.empty()
        or bool(_remote_live_event_latest)
        or bool(_remote_event_latest)
    ):
        batch_started_at = time.monotonic()
        drained = 0
        for _ in range(batch_size):
            item: dict[str, Any] | None = None
            source_q: queue.Queue[dict[str, Any]] | None = None
            with _remote_event_latest_lock:
                item = _pop_latest(
                    _remote_live_event_latest, _remote_live_event_source_order
                )
                if item is None:
                    item = _pop_latest(
                        _remote_event_latest, _remote_event_source_order
                    )
            if item is None:
                source_q = _remote_live_event_q
                try:
                    item = source_q.get_nowait()
                except queue.Empty:
                    source_q = _remote_event_q
                    try:
                        item = source_q.get_nowait()
                    except queue.Empty:
                        break
            try:
                ingest(item)
            except Exception:
                log.exception("remote fleet event ingest failed")
            finally:
                drained += 1
                if source_q is not None:
                    source_q.task_done()

        drops = _remote_event_drop_count()
        now = time.monotonic()
        if drops > 0 and now >= next_log_at:
            log.warning(
                "remote fleet event queue size=%d live_size=%d drops=%d",
                _remote_event_q.qsize() + _pending_latest_count(_remote_event_latest),
                _remote_live_event_q.qsize()
                + _pending_latest_count(_remote_live_event_latest),
                drops,
            )
            next_log_at = now + log_interval_sec

        if drained == 0:
            await asyncio.sleep(idle_sleep_sec)
        else:
            # Ingest performs normalization, matching and publication under
            # the Python GIL.  An unbounded cold-start drain can otherwise
            # starve /health, /snapshot and /lookup-bia for seconds at a time.
            # Cap throughput while still keeping live latency below a batch.
            target_duration = drained / max(1.0, max_events_per_sec)
            elapsed = time.monotonic() - batch_started_at
            # Keep an explicit 50% rest duty cycle even when one normalization
            # pass is itself slower than the nominal rate.  Rate limiting
            # alone cannot yield the GIL in that case.
            await asyncio.sleep(max(elapsed, target_duration - elapsed, 0.0))


def _aggregator_enabled() -> bool:
    return os.environ.get("MSP_AGGREGATOR_ENABLED", "").strip() in (
        "1",
        "true",
        "True",
        "yes",
    )


def _v2_feed_enabled() -> bool:
    return os.environ.get("MSP_V2_FEED_ENABLED", "").strip() in (
        "1",
        "true",
        "True",
        "yes",
    )


def _failover_enabled() -> bool:
    return os.environ.get("MSP_FAILOVER_ENABLED", "").strip() in (
        "1",
        "true",
        "True",
        "yes",
    )


def _pin888_bridge_enabled() -> bool:
    return os.environ.get("MSP_PIN888_BRIDGE_ENABLED", "").strip() in (
        "1",
        "true",
        "True",
        "yes",
    )


def _pin888_hub_compat_enabled() -> bool:
    return os.environ.get("MSP_PIN888_HUB_COMPAT_ENABLED", "0").strip() in (
        "1",
        "true",
        "True",
        "yes",
    )


def _bia_observer_enabled() -> bool:
    return os.environ.get("BIA_ENABLED", "0").strip() in (
        "1",
        "true",
        "True",
        "yes",
    )


def _morebets_dispatcher_enabled() -> bool:
    return os.environ.get("MSP_MOREBETS_DISPATCHER_ENABLED", "0").strip() in (
        "1",
        "true",
        "True",
        "yes",
    )


def _morebets_targeting_enabled() -> bool:
    """Story 27.37: мост targeting -> EventPriorityQueue (default OFF)."""
    return os.environ.get("MOREBETS_TARGETING_ENABLED", "0").strip() in (
        "1",
        "true",
        "True",
        "yes",
    )


def _morebets_proactive_enabled() -> bool:
    """Story 27.38: проактивный consumer EventPriorityQueue (default OFF)."""
    return os.environ.get("MOREBETS_PROACTIVE_ENABLED", "0").strip() in (
        "1",
        "true",
        "True",
        "yes",
    )

def _morebets_fleet_enabled() -> bool:
    return os.environ.get("MOREBETS_FLEET_ENABLED", "0").strip() in (
        "1", "true", "True", "yes"
    )


def _morebets_fleet_require_watchlist() -> bool:
    return os.environ.get("MOREBETS_FLEET_REQUIRE_WATCHLIST", "1").strip() not in (
        "0", "false", "False", "no",
    )


def _morebets_fleet_start_wait_sec() -> float:
    raw = os.environ.get("MOREBETS_FLEET_START_WAIT_SEC", "30")
    try:
        return max(0.0, float(raw or "30"))
    except ValueError:
        return 30.0


def _wait_for_initial_watchlist(
    provider: Callable[[], list[int]],
    stop_event: threading.Event,
    timeout_sec: float,
) -> list[int]:
    import time

    deadline = time.monotonic() + max(0.0, timeout_sec)
    while not stop_event.is_set():
        watchlist = provider()
        if watchlist:
            return watchlist
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return []
        stop_event.wait(timeout=min(1.0, remaining))
    return []


def _fleet_supervisor_start_state(
    *,
    account_count: int,
    require_watchlist: bool,
    initial_watchlist: list[int],
) -> tuple[bool, str | None]:
    if account_count <= 0:
        return False, "no ps3838 runtime accounts"
    if require_watchlist and not initial_watchlist:
        return True, "empty initial watchlist"
    return True, None




def _forted_feed_enabled() -> bool:
    """Story 27.45: Forted feed поллер (default OFF - 0 эффекта при выключенном флаге)."""
    return os.environ.get("FORTED_FEED_ENABLED", "0").strip() in (
        "1", "true", "True", "yes",
    )

def _morebets_load_ps3838_secrets_enabled() -> bool:
    return os.environ.get("MOREBETS_LOAD_PS3838_SECRETS", "0").strip() in (
        "1", "true", "True", "yes"
    )


def _mirror_frame_to_legacy_state(frame: dict[str, Any]) -> None:
    """Expose fleet frames to legacy BIA matcher state.

    ``services.bia_observer`` still matches BIA events against
    ``state.events_data``.  The central aggregator owns the actual publish path,
    so this mirror is intentionally narrow: it only lets BIA resolve PS38 PIDs
    and feed the shared BiaPriceTracker/MoreBets trigger.
    """
    pid = frame.get("Pid")
    if not isinstance(pid, int):
        return
    try:
        import time as _time
        from parsing.parser import merge_updates
        from state import state as _legacy_state

        game = dict(frame)
        if pid not in _legacy_state.events_data:
            _legacy_state.events_data[pid] = game
        else:
            _legacy_state.events_data = merge_updates(
                _legacy_state.events_data,
                [game],
                authoritative=False,
            )
        _legacy_state.event_source[pid] = "ps3838"
        _legacy_state.chain_state_update_ts = _time.time()
    except Exception:
        import logging as _logging

        _logging.getLogger("aggregator").exception(
            "failed to mirror fleet frame into legacy BIA state"
        )




def _pin888_ws_broadcaster_enabled() -> bool:
    return os.environ.get("MSP_PIN888_WS_BROADCASTER_ENABLED", "").strip() in (
        "1",
        "true",
        "True",
        "yes",
    )


def _positive_env_float(name: str, default: float) -> float:
    raw = os.environ.get(name, str(default)).strip()
    try:
        value = float(raw)
    except ValueError:
        return default
    if value <= 0.0:
        return default
    return value


def _provenance_ttl_sec() -> float:
    return _positive_env_float("MSP_PROVENANCE_TTL_SEC", 120.0)


def _provenance_evict_interval_sec() -> float:
    return _positive_env_float("MSP_PROVENANCE_EVICT_INTERVAL_SEC", 30.0)


def _run_provenance_evict_loop(
    store: Any,
    stop_event: threading.Event,
    *,
    ttl_sec: float,
    interval_sec: float,
    log_every_cycles: int = 10,
) -> None:
    log = logging.getLogger("aggregator.provenance_evict")
    cycle = 0
    evicted_since_log = 0
    log_every = max(1, int(log_every_cycles))
    while not stop_event.is_set():
        try:
            evicted_since_log += store.evict_stale(time.time(), ttl_sec)
        except Exception:
            log.exception("provenance TTL eviction failed")
        cycle += 1
        if cycle % log_every == 0:
            log.info(
                "provenance TTL eviction cycles=%d evicted=%d ttl_sec=%.3f",
                cycle,
                evicted_since_log,
                ttl_sec,
            )
            evicted_since_log = 0
        stop_event.wait(timeout=interval_sec)


def _build_config_summary() -> dict[str, Any]:
    """Collect env-based config into a printable dict."""
    return {
        "MSP_AGGREGATOR_ENABLED": os.environ.get("MSP_AGGREGATOR_ENABLED", ""),
        "MSP_V2_FEED_ENABLED": os.environ.get("MSP_V2_FEED_ENABLED", ""),
        "MSP_FAILOVER_ENABLED": os.environ.get("MSP_FAILOVER_ENABLED", ""),
        "MSP_PIN888_BRIDGE_ENABLED": os.environ.get("MSP_PIN888_BRIDGE_ENABLED", ""),
        "MSP_MOREBETS_DISPATCHER_ENABLED": os.environ.get(
            "MSP_MOREBETS_DISPATCHER_ENABLED", "0"
        ),
        "MSP_SHARED_PID_EVENT_ID_ENABLED": os.environ.get("MSP_SHARED_PID_EVENT_ID_ENABLED", ""),
        "MSP_DECISION_V2_ENABLED": os.environ.get("MSP_DECISION_V2_ENABLED", ""),
        "MSP_BROWSER_ONLY_AUTHORITATIVE": os.environ.get(
            "MSP_BROWSER_ONLY_AUTHORITATIVE", ""
        ),
        "MSP_ACCOUNT_POOL_ENABLED": os.environ.get("MSP_ACCOUNT_POOL_ENABLED", ""),
        "MSP_FEED_PORT": os.environ.get("MSP_FEED_PORT", "9013"),
        "MSP_PIN888_WS_BROADCASTER_ENABLED": os.environ.get("MSP_PIN888_WS_BROADCASTER_ENABLED", ""),
        "MSP_PIN888_WS_BROADCASTER_PORT": os.environ.get("MSP_PIN888_WS_BROADCASTER_PORT", "9014"),
        "MSP_PIN888_HUB_COMPAT_ENABLED": os.environ.get("MSP_PIN888_HUB_COMPAT_ENABLED", "0"),
        "MSP_PIN888_HUB_COMPAT_PORT": os.environ.get("MSP_PIN888_HUB_COMPAT_PORT", "19100"),
        "MSP_STORE_SQLITE_PATH": os.environ.get("MSP_STORE_SQLITE_PATH", ""),
        "MSP_PROVENANCE_TTL_SEC": os.environ.get("MSP_PROVENANCE_TTL_SEC", "120"),
        "MSP_PROVENANCE_EVICT_INTERVAL_SEC": os.environ.get(
            "MSP_PROVENANCE_EVICT_INTERVAL_SEC",
            "30",
        ),
    }


def main() -> None:
    """Aggregator entry point. Blocks until shutdown signal received."""
    import logging
    _log_level = os.environ.get("MSP_LOG_LEVEL", "WARNING").upper()
    logging.basicConfig(
        level=getattr(logging, _log_level, logging.WARNING),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )

    if not _aggregator_enabled():
        print("[aggregator] MSP_AGGREGATOR_ENABLED not set — exiting.")
        return

    # Late imports to avoid any import-time side effects when module
    # is merely imported (e.g. by tests).
    from aggregator.account_pool import AccountPool
    from aggregator.cross_source_matcher import CrossSourceMatcher
    from aggregator.decision import build_default_engine
    from aggregator.failover import FailoverOrchestrator
    from aggregator.feed_server import FeedServer
    from aggregator.identity import shared_pid_event_id
    from aggregator.ingest import IngestRouter
    from aggregator.pin888_hub_compat import Pin888HubCompatServer
    from aggregator.pin888_ws_broadcaster import Pin888WsBroadcaster
    from aggregator.monitoring import PlatformMonitor
    from aggregator.sources.pin888_ws_bridge import Pin888WsBridge
    from aggregator.state_machine import (
        SourceHealthRegistry,
        SystemModeMonitor,
    )
    from aggregator.store import ProvenanceStore

    # Print config summary.
    config = _build_config_summary()
    print("[aggregator] Starting with config:")
    for k, v in config.items():
        print(f"  {k}={v!r}")

    # Assemble components.
    health_registry = SourceHealthRegistry()
    pool = AccountPool()
    _ps3838_runtime_bundles: list[Any] = []
    if _morebets_fleet_enabled() or _morebets_load_ps3838_secrets_enabled():
        from aggregator.account_runtime_loader import load_ps3838_runtime_bundles

        try:
            _ps3838_runtime_bundles = load_ps3838_runtime_bundles(
                accounts_path=os.environ.get(
                    "MOREBETS_PS3838_ACCOUNTS_PATH",
                    "~/.secrets/ps3838_accounts.txt",
                ),
                proxies_path=os.environ.get(
                    "MOREBETS_PS3838_PROXIES_PATH",
                    "~/.secrets/ps3838_proxies.txt",
                ),
                proxy_user=os.environ.get("MOREBETS_PS3838_PROXY_USER", ""),
                proxy_password=os.environ.get(
                    "MOREBETS_PS3838_PROXY_PASS",
                    "",
                ),
                domain=os.environ.get("MOREBETS_PS3838_DOMAIN", "www.ps3838.com"),
            )
        except Exception as _ex:
            print("[aggregator] ps3838 account secrets not loaded: %s" % _ex)
            _ps3838_runtime_bundles = []
        for _bundle in _ps3838_runtime_bundles:
            pool.register(_bundle.account)
        if _ps3838_runtime_bundles:
            print(
                "[aggregator] ps3838 runtime accounts loaded: %d"
                % len(_ps3838_runtime_bundles)
            )
    # Story 27.12 AC-2/AC-6 — pull healthy_age_sec + min_dwell_sec from env.
    from aggregator.state_machine import age_config_from_env

    _age_cfg = age_config_from_env()
    # Per-profile override (browser_ws) currently not wired into
    # SystemModeMonitor; dropped here so the monitor kwargs stay type-safe.
    _age_cfg.pop("healthy_age_sec_browser_ws", None)
    monitor = SystemModeMonitor(health=health_registry, account_pool=pool, **_age_cfg)
    store = ProvenanceStore()
    engine = build_default_engine()
    matcher = CrossSourceMatcher()
    morebets_dispatcher = None
    if _morebets_dispatcher_enabled():
        from aggregator.morebets_dispatcher import MoreBetsDispatcher
        from aggregator.morebets_policy import load_policy

        morebets_dispatcher = MoreBetsDispatcher(
            policy=load_policy("config/morebets_priority_policy.yaml")
        )

    # Story 27.37: мост targeting -> EventPriorityQueue (additive, флаг default OFF).
    _targeting_queue = None
    _targeting_promoter = None
    _targeting_targeter = None
    if _morebets_targeting_enabled():
        from aggregator.event_priority_queue import EventPriorityQueue as _EPQ
        from aggregator.morebets_targeting import MoreBetsTargeter as _MBTargeter
        from aggregator.morebets_targeting_bridge import TargetingPromoter as _TPromoter

        _targeting_queue = _EPQ()
        _targeting_targeter = _MBTargeter.from_config()
        _targeting_promoter = _TPromoter(
            targeter=_targeting_targeter,
            queue=_targeting_queue,
        )
        print("[aggregator] morebets targeting bridge ENABLED")

    router = IngestRouter(  # noqa: F841 — assembled for side-effect wiring
        store=store,
        decision=engine,
        event_id_resolver=shared_pid_event_id,
        source_health=health_registry,
        system_mode_monitor=monitor,
        account_pool=pool,
        morebets_dispatcher=morebets_dispatcher,
    )

    failover: FailoverOrchestrator | None = None
    if _failover_enabled():
        failover = FailoverOrchestrator(pool=pool, monitor=monitor)

    feed: FeedServer | None = None
    legacy_ws: Pin888WsBroadcaster | None = None
    hub_compat: Pin888HubCompatServer | None = None
    source_threads: list[threading.Thread] = []
    pin888_bridge: Pin888WsBridge | None = None
    bia_runtime: dict[str, Any] = {}

    def _select_morebet_watchlist() -> list[int]:
        if _targeting_targeter is None:
            return []
        import time as _fleet_time

        return [
            int(t.event_id)
            for t in _targeting_targeter.select_targets(_fleet_time.time())
        ]

    def _ingest_ps3838_frame(frame: dict[str, Any]) -> dict[str, Any]:
        from aggregator.types import SourceEvent as _SrcEvent
        from datetime import datetime as _dt, timezone as _tz

        pid = frame.get("Pid")
        if not isinstance(pid, int):
            try:
                pid = int(pid)
                frame = dict(frame)
                frame["Pid"] = pid
            except (TypeError, ValueError):
                return {"ok": False, "error": "missing_pid"}
        if hub_compat is not None:
            hub_compat.ingest_event(frame)
        if _bia_observer_enabled():
            _mirror_frame_to_legacy_state(frame)
        now_dt = _dt.now(_tz.utc)
        event = _SrcEvent(
            source_id="ps3838:fleet:%s:%s" % (
                frame.get("_account", "fleet"),
                frame.get("SportId", "?"),
            ),
            family="ps3838",
            transport="browser_ws",
            event_id="ps3838:%d" % pid,
            payload=dict(frame),
            collected_at=now_dt,
            received_at=now_dt,
        )
        router.ingest(event)
        return {"ok": True}

    def _ingest_remote_event(item: dict[str, Any]) -> dict[str, Any]:
        """Accept either a PS3838 frame or a generic SourceEvent envelope."""
        if isinstance(item.get("payload"), dict) and item.get("source_id"):
            from aggregator.types import SourceEvent as _SrcEvent
            from datetime import datetime as _dt, timezone as _tz

            payload = dict(item["payload"])
            event_id = str(item.get("event_id") or payload.get("event_id") or "")
            pid = payload.get("Pid")
            if not event_id and pid is not None:
                event_id = "%s:%s" % (item.get("family") or "remote", pid)
            if not event_id:
                return {"ok": False, "error": "missing_event_id"}
            if pid is not None:
                if not isinstance(pid, int):
                    try:
                        pid = int(pid)
                        payload["Pid"] = pid
                    except (TypeError, ValueError):
                        pid = None
                if pid is not None:
                    if hub_compat is not None:
                        hub_compat.ingest_event(payload)
                    if _bia_observer_enabled():
                        _mirror_frame_to_legacy_state(payload)
            now_dt = _dt.now(_tz.utc)
            event = _SrcEvent(
                source_id=str(item.get("source_id")),
                family=str(item.get("family") or "remote"),
                transport=str(item.get("transport") or "remote"),
                event_id=event_id,
                payload=payload,
                collected_at=now_dt,
                received_at=now_dt,
                account_id=item.get("account_id"),
                is_tombstone=bool(item.get("is_tombstone", False)),
            )
            router.ingest(event)
            return {"ok": True}
        return _ingest_ps3838_frame(item)

    def _ingest_remote_raw_frame(frame: dict[str, Any]) -> dict[str, Any]:
        if hub_compat is not None:
            hub_compat.ingest_raw_frame(frame)
            return {"ok": True}
        return {"ok": False, "error": "hub_compat_disabled"}

    def _next_remote_morebet_target() -> int | None:
        if hub_compat is None:
            return None
        return hub_compat.next_morebet_target()

    platform_monitor = PlatformMonitor(
        system_mode_monitor=monitor,
        account_pool=pool,
        provenance_store=store,
        decision_engine=engine,
        failover_orchestrator=failover,
        feed_server=None,
        source_health_registry=health_registry,
        cross_source_matcher=matcher,
        morebets_dispatcher=morebets_dispatcher,
    )

    router.register_consumer(
        lambda pq: platform_monitor.record_publish(
            degraded=bool(pq.degraded),
            source=str(pq.source_used_for_publish or ""),
        )
    )

    if _v2_feed_enabled():
        feed = FeedServer(
            quote_provider=lambda: list(store.iter_history()),
            monitoring_provider=lambda: platform_monitor.snapshot(),
            remote_event_handler=_enqueue_remote_event,
            remote_raw_frame_handler=_ingest_remote_raw_frame,
            remote_watchlist_provider=_select_morebet_watchlist,
            remote_morebet_target_provider=_next_remote_morebet_target,
            live_dom_snapshot_provider=_live_dom_snapshot,
        )
        feed.start()
        print(f"[aggregator] v2 feed server started on port {feed.port}")
        platform_monitor.feed_server = feed

    if _pin888_ws_broadcaster_enabled():
        legacy_ws = Pin888WsBroadcaster(router=router, store=store)
        legacy_ws.start()
        print(
            f"[aggregator] legacy WS broadcaster started on "
            f"{legacy_ws.host}:{legacy_ws.port}"
        )

    if _pin888_hub_compat_enabled():
        hub_compat = Pin888HubCompatServer()
        hub_compat.start()
        print(
            f"[aggregator] pin888 hub compatibility server started on "
            f"{hub_compat.host}:{hub_compat.port}"
        )

    shutdown_event = threading.Event()
    provenance_ttl_sec = _provenance_ttl_sec()
    provenance_evict_interval_sec = _provenance_evict_interval_sec()
    provenance_evict_thread = threading.Thread(
        target=_run_provenance_evict_loop,
        args=(store, shutdown_event),
        kwargs={
            "ttl_sec": provenance_ttl_sec,
            "interval_sec": provenance_evict_interval_sec,
        },
        daemon=True,
        name="aggregator-provenance-evict",
    )
    provenance_evict_thread.start()
    source_threads.append(provenance_evict_thread)
    print(
        "[aggregator] provenance TTL eviction started "
        "ttl=%.1fs interval=%.1fs"
        % (provenance_ttl_sec, provenance_evict_interval_sec)
    )

    if feed is not None:
        def _run_remote_event_drain() -> None:
            asyncio.run(_drain_remote_event_queue(_ingest_remote_event, shutdown_event))

        thread = threading.Thread(
            target=_run_remote_event_drain,
            daemon=True,
            name="aggregator-remote-fleet-drain",
        )
        thread.start()
        source_threads.append(thread)
        print("[aggregator] remote fleet event drain started")

    if _pin888_bridge_enabled():
        # Story 27.13 — heartbeat + gap-detection kwargs from env.
        from aggregator.sources.pin888_ws_bridge import bridge_config_from_env

        pin888_bridge = Pin888WsBridge(router=router, **bridge_config_from_env())
        # Story 27.13 AC-6 — wire bridge into PlatformMonitor so /monitoring
        # exposes gap counters (pin888_ws_gaps_total / pin888_ws_gap_max_sec).
        platform_monitor.pin888_bridge = pin888_bridge
        thread = threading.Thread(
            target=pin888_bridge.run_forever,
            kwargs={"stop_event": shutdown_event},
            daemon=True,
            name="aggregator-pin888-bridge",
        )
        thread.start()
        source_threads.append(thread)
        print(f"[aggregator] pin888 bridge started for {pin888_bridge.ws_url}")

    if _bia_observer_enabled():
        from services.bia_observer import bia_observer_snapshot, run_bia_observer

        platform_monitor.bia_snapshot_provider = bia_observer_snapshot

        def _run_bia_observer_thread() -> None:
            import asyncio as _asyncio
            import logging as _logging

            loop = _asyncio.new_event_loop()
            task = loop.create_task(run_bia_observer())
            bia_runtime["loop"] = loop
            bia_runtime["task"] = task
            _asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(task)
            except _asyncio.CancelledError:
                pass
            except Exception:
                _logging.getLogger("aggregator").exception("BIA observer stopped unexpectedly")
            finally:
                try:
                    loop.run_until_complete(loop.shutdown_asyncgens())
                except Exception:
                    pass
                loop.close()

        _bia_thread = threading.Thread(
            target=_run_bia_observer_thread,
            daemon=True,
            name="aggregator-bia-observer",
        )
        _bia_thread.start()
        source_threads.append(_bia_thread)
        print("[aggregator] BIA observer started inside central feed process")

    # Story 27.37: периодический promote в EventPriorityQueue (additive, флаг default OFF).
    if _targeting_promoter is not None:
        _captured_promoter = _targeting_promoter

        def _run_targeting_promote() -> None:
            import logging as _log2
            import time as _time3
            _tlog = _log2.getLogger("aggregator.morebets_targeting_bridge")
            while not shutdown_event.is_set():
                try:
                    _captured_promoter.promote(_time3.time())
                except Exception:
                    _tlog.exception("targeting promote() failed")
                shutdown_event.wait(timeout=2.0)

        _targeting_thread = threading.Thread(
            target=_run_targeting_promote,
            daemon=True,
            name="aggregator-morebets-targeting",
        )
        _targeting_thread.start()
        source_threads.append(_targeting_thread)
        print("[aggregator] morebets targeting promoter thread started")

    if (
        _morebets_proactive_enabled()
        and _targeting_queue is not None
        and not _morebets_fleet_enabled()
    ):
        import logging as _log3
        from aggregator.morebets_active_fetcher import (
            FetchResult as _FetchResult,
            FetchStatus as _FetchStatus,
            MoreBetsActiveFetcher as _MAFetcher,
        )
        from aggregator.morebets_ws_fetcher import WsMoreBetFetcher as _WsMoreBetFetcher

        def _build_morebet_sender() -> Any:
            # FIX P2-B: явная точка инъекции sender (AC-5).
            # Story 27.40 подключит BrowserWSProxy-мост: достаточно
            # задать env MOREBET_SENDER_CLASS или вернуть экземпляр
            # FrameSender здесь — без переписывания остального кода.
            # TODO(27.40): инстанцировать BrowserWSProxy-мост и вернуть его.
            # Пример: import importlib; cls = importlib.import_module(env);
            #          return cls() if env else None
            _sender_class = os.environ.get("MOREBET_SENDER_CLASS", "")
            if _sender_class:
                import importlib as _il
                _mod, _attr = _sender_class.rsplit(".", 1)
                return getattr(_il.import_module(_mod), _attr)()
            return None  # default OFF до 27.40

        class _NotWiredFetcher:
            def fetch(self, event_id: str, account: object) -> _FetchResult:
                _log3.getLogger("aggregator.morebets_active_fetcher").warning(
                    "MORE_BET fetch not wired yet (27.40 подключит мост) event %s",
                    event_id,
                )
                return _FetchResult(_FetchStatus.ERROR, "not wired")

        _ws_sender = _build_morebet_sender()
        _fetch_fn: object = (
            _WsMoreBetFetcher(_ws_sender) if _ws_sender is not None else _NotWiredFetcher()
        )

        _proactive_fetcher = _MAFetcher(
            queue=_targeting_queue,
            pool=pool,
            fetch_fn=_fetch_fn,
        )
        _captured_pfetcher = _proactive_fetcher

        def _run_proactive_fetch() -> None:
            _captured_pfetcher.run_forever(shutdown_event)

        _proactive_thread = threading.Thread(
            target=_run_proactive_fetch,
            daemon=True,
            name="aggregator-morebets-active-fetcher",
        )
        _proactive_thread.start()
        source_threads.append(_proactive_thread)
        print("[aggregator] morebets active fetcher thread started")


    if _forted_feed_enabled():
        if _targeting_targeter is not None:
            from aggregator.forted_feed import FortedFeedPoller as _FFPoller
            from aggregator.forted_feed import RealForkFetcher as _RFFetcher
            from aggregator.morebets_targeting import FortedTopNTrigger as _FTNTrigger

            _forted_trigger_obj = _targeting_targeter.get_trigger("forted_topn")
            if isinstance(_forted_trigger_obj, _FTNTrigger):
                _signals_url = os.environ.get(
                    "SHARPBOOK_SIGNALS_URL",
                    "http://127.0.0.1:8082/api/signals/feed",
                )
                _feed_interval = float(os.environ.get("FORTED_FEED_INTERVAL_SEC", "5") or "5")
                _feed_format = (os.environ.get("FORTED_FEED_FORMAT", "sanitized") or "sanitized").strip().lower()
                if _feed_format not in ("sanitized", "raw"):
                    print("[aggregator] WARNING: unknown FORTED_FEED_FORMAT=%r -> sanitized" % _feed_format)
                    _feed_format = "sanitized"
                _feed_key = (os.environ.get("FORTED_FEED_KEY", "") or "").strip()
                _forted_poller = _FFPoller(
                    trigger=_forted_trigger_obj,
                    fetcher=_RFFetcher(_signals_url, key=_feed_key),
                    interval_sec=_feed_interval,
                    fmt=_feed_format,
                )
                _forted_poller.poll_once()
                _captured_forted_poller = _forted_poller

                def _run_forted_feed() -> None:
                    _captured_forted_poller.run_forever(shutdown_event)

                _forted_thread = threading.Thread(
                    target=_run_forted_feed,
                    daemon=True,
                    name="aggregator-forted-feed",
                )
                _forted_thread.start()
                source_threads.append(_forted_thread)
                print("[aggregator] forted feed poller started interval=%.1fs fmt=%s" % (_feed_interval, _feed_format))
            else:
                print("[aggregator] forted feed: FortedTopNTrigger not found in targeter - skipping")
        else:
            print("[aggregator] forted feed: FORTED_FEED_ENABLED=1 but MOREBETS_TARGETING_ENABLED=0 - no targeter")


    if _morebets_fleet_enabled():
        from aggregator.fleet.supervisor import Supervisor as _FleetSupervisor
        from aggregator.fleet.account_sport_supervisor import AccountSportFleetSupervisor as _AccountSportSupervisor
        from aggregator.fleet.rotating_supervisor import RotatingFleetSupervisor as _RotatingFleetSupervisor
        from aggregator.account_pool import FleetAccount as _FleetAccount
        from aggregator.account_pool import FleetAccountPool as _FleetPool
        from aggregator.fleet.sport_allocation import accounts_for_sport as _fleet_accounts_for_sport
        from aggregator.fleet.sport_allocation import parse_sports as _parse_fleet_sports

        _fleet_target_k = int(os.environ.get("MOREBETS_FLEET_TARGET_K", "3"))
        _fleet_allocation_mode = (
            os.environ.get("MOREBETS_FLEET_ALLOCATION_MODE", "per_sport")
            .strip()
            .lower()
        )
        _fleet_sports_default = "soccer:29"
        _fleet_sports = _parse_fleet_sports(
            os.environ.get("MOREBETS_FLEET_SPORTS", _fleet_sports_default),
            default=_fleet_sports_default,
        )
        _fleet_cdp_base = int(os.environ.get("MOREBETS_FLEET_CDP_BASE", "9300"))
        _fleet_socks_base = int(os.environ.get("MOREBETS_FLEET_SOCKS_BASE", "19300"))
        _fleet_port_stride = int(os.environ.get("MOREBETS_FLEET_PORT_STRIDE", "1000"))
        _fleet_worker_run_sec = float(os.environ.get("MOREBETS_FLEET_WORKER_RUN_SEC", "600"))
        _fleet_accounts: list[_FleetAccount] = [
            _bundle.fleet_account for _bundle in _ps3838_runtime_bundles
        ]

        _initial_watchlist = _select_morebet_watchlist()
        if _morebets_fleet_require_watchlist() and not _initial_watchlist:
            _fleet_wait_sec = _morebets_fleet_start_wait_sec()
            if _fleet_wait_sec > 0:
                print(
                    "[aggregator] fleet waiting for initial watchlist up to %.1fs"
                    % _fleet_wait_sec
                )
                _initial_watchlist = _wait_for_initial_watchlist(
                    _select_morebet_watchlist,
                    shutdown_event,
                    _fleet_wait_sec,
                )

        _fleet_should_start, _fleet_start_reason = _fleet_supervisor_start_state(
            account_count=len(_fleet_accounts),
            require_watchlist=_morebets_fleet_require_watchlist(),
            initial_watchlist=_initial_watchlist,
        )
        if not _fleet_should_start:
            print("[aggregator] fleet supervisor not started: %s" % _fleet_start_reason)
        else:
            if _fleet_start_reason == "empty initial watchlist":
                print(
                    "[aggregator] fleet supervisor starting without initial watchlist; "
                    "workers will subscribe to base odds and wait for MORE_BET targets"
                )

            _fleet_supervisors: list[Any] = []
            if _fleet_allocation_mode in {"account_sports", "multi_sport", "multi_tab"}:
                _fleet_supervisors.append(
                    _AccountSportSupervisor(
                        accounts=_fleet_accounts,
                        sports=_fleet_sports,
                        on_event=_ingest_ps3838_frame,
                        worker_run_sec=_fleet_worker_run_sec,
                        watchlist_provider=_select_morebet_watchlist,
                        canonical_pool=pool,
                        on_raw_frame=(
                            hub_compat.ingest_raw_frame if hub_compat is not None else None
                        ),
                        next_morebet_target=(
                            hub_compat.next_morebet_target if hub_compat is not None else None
                        ),
                        cdp_base=_fleet_cdp_base,
                        socks_base=_fleet_socks_base,
                        assignment_spec=os.environ.get("MOREBETS_FLEET_ACCOUNT_SPORTS", ""),
                        rotate_assignments=os.environ.get(
                            "MOREBETS_FLEET_ROTATE_ASSIGNMENTS",
                            "0",
                        ).strip() in ("1", "true", "True", "yes"),
                    )
                )
            elif _fleet_allocation_mode in {"rotating", "exclusive", "shared_pool"}:
                _rotating_target_k = int(
                    os.environ.get(
                        "MOREBETS_FLEET_ROTATING_TARGET_K",
                        str(min(_fleet_target_k, max(1, len(_fleet_accounts)))),
                    )
                )
                _fleet_supervisors.append(
                    _RotatingFleetSupervisor(
                        pool=_FleetPool(_fleet_accounts, success_cooldown_sec=0.0),
                        sports=_fleet_sports,
                        on_event=_ingest_ps3838_frame,
                        target_k=min(_rotating_target_k, max(1, len(_fleet_accounts))),
                        worker_run_sec=_fleet_worker_run_sec,
                        watchlist_provider=_select_morebet_watchlist,
                        canonical_pool=pool,
                        on_raw_frame=(
                            hub_compat.ingest_raw_frame if hub_compat is not None else None
                        ),
                        next_morebet_target=(
                            hub_compat.next_morebet_target if hub_compat is not None else None
                        ),
                        cdp_base=_fleet_cdp_base,
                        socks_base=_fleet_socks_base,
                    )
                )
            else:
                for _sport_idx, _sport in enumerate(_fleet_sports):
                    _sport_accounts = _fleet_accounts_for_sport(
                        _fleet_accounts,
                        _sport_idx,
                        _sport.slug,
                        _fleet_target_k,
                    )
                    if not _sport_accounts:
                        continue
                    _fleet_supervisors.append(
                        _FleetSupervisor(
                            pool=_FleetPool(_sport_accounts),
                            on_event=_ingest_ps3838_frame,
                            target_k=len(_sport_accounts),
                            sport=_sport.sport_id,
                            slug=_sport.slug,
                            worker_run_sec=_fleet_worker_run_sec,
                            watchlist_provider=_select_morebet_watchlist,
                            canonical_pool=pool,
                            on_raw_frame=(
                                hub_compat.ingest_raw_frame if hub_compat is not None else None
                            ),
                            next_morebet_target=(
                                hub_compat.next_morebet_target if hub_compat is not None else None
                            ),
                            cdp_base=_fleet_cdp_base + _sport_idx * _fleet_port_stride,
                            socks_base=_fleet_socks_base + _sport_idx * _fleet_port_stride,
                        )
                    )

            def _run_fleet_supervisor() -> None:
                import asyncio as _lo
                loop = _lo.new_event_loop()
                _lo.set_event_loop(loop)
                try:
                    loop.run_until_complete(
                        _lo.gather(
                            *[
                                _supervisor.run(
                                    total_sec=float("inf"),
                                    stop_event=shutdown_event,
                                )
                                for _supervisor in _fleet_supervisors
                            ]
                        )
                    )
                finally:
                    loop.close()

            _fleet_thread = threading.Thread(
                target=_run_fleet_supervisor,
                daemon=True,
                name="aggregator-fleet-supervisor",
            )
            _fleet_thread.start()
            source_threads.append(_fleet_thread)
            print(
                "[aggregator] fleet supervisors started sports=%s target_k=%d mode=%s"
                % ([(s.slug, s.sport_id) for s in _fleet_sports], _fleet_target_k, _fleet_allocation_mode)
            )

    print("[aggregator] All components assembled. Waiting for events...")

    # Graceful shutdown machinery.
    def _handle_signal(signum: int, frame: Any) -> None:
        print(f"\n[aggregator] Received signal {signum}, shutting down...")
        shutdown_event.set()

    orig_sigint = signal.getsignal(signal.SIGINT)
    orig_sigterm = signal.getsignal(signal.SIGTERM)
    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    # Block until shutdown.
    shutdown_event.wait()

    bia_loop = bia_runtime.get("loop")
    bia_task = bia_runtime.get("task")
    if bia_loop is not None and bia_task is not None:
        try:
            bia_loop.call_soon_threadsafe(bia_task.cancel)
        except Exception:
            pass

    # Join source threads so in-flight ingest() calls complete before closing store.
    for t in source_threads:
        t.join(timeout=5.0)
        if t.is_alive():
            print(f"[aggregator] Warning: thread {t.name} did not stop within 5s")

    # Cleanup.
    if legacy_ws is not None:
        legacy_ws.stop()
        print("[aggregator] Legacy WS broadcaster stopped.")

    if hub_compat is not None:
        hub_compat.stop()
        print("[aggregator] pin888 hub compatibility server stopped.")

    if feed is not None:
        feed.stop()
        print("[aggregator] Feed server stopped.")

    store.close()
    print("[aggregator] Store closed.")

    # Restore original signal handlers.
    signal.signal(signal.SIGINT, orig_sigint)
    signal.signal(signal.SIGTERM, orig_sigterm)

    print("[aggregator] Shutdown complete.")


if __name__ == "__main__":
    main()
