"""supervisor: holds K live workers with hot-swap from pool (Story 27.40).

FleetAccountPool + Worker: spawns target_k workers, monitors, on failure
classifies reason (429/lockout/auth -> LOCKED 24h; route/proxy/transient -> COOLDOWN),
acquires from reserve and spawns replacement.
on_event -- fan-in callback (adapter -> IngestRouter.ingest).
classify_failure testable without network.
"""
from __future__ import annotations

import asyncio
import logging
import shutil
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable, Type

from aggregator.account_pool import (
    AccountPool,
    FleetAccount,
    FleetAccountPool,
    replacements_needed,
)
from aggregator.forted_targeting import partition_watchlist
from aggregator.fleet.worker import Worker


_LOG = logging.getLogger(__name__)


_ACC_ID_RE = __import__("re").compile(r"^[A-Za-z0-9_-]+$")


def _safe_rmtree_fleet_profile(path: str, acc_id: str) -> None:
    """Безопасно удалить старый профиль fleet-воркера.

    Удаляет ТОЛЬКО пути вида /tmp/fleet-sup-<acc_id>-<N>, чтобы не
    затронуть чужие директории. worker.py:374 делает rmtree СВОЕГО ud
    (fleet-worker-*) — здесь удаляется профиль supervisor'а (fleet-sup-*).

    Меры безопасности (v2):
    1. acc_id должен содержать только [A-Za-z0-9_-] — никаких '/'  или '..'.
    2. raw-путь проверяется regex до resolve.
    3. realpath резолвится и проверяется: должен начинаться с realpath(/tmp)/fleet-sup-<acc_id>-
       и оставаться внутри realpath(/tmp) (защита от symlink и path-traversal).
    4. Только при прохождении обеих проверок — rmtree.
    """
    import os  # noqa: PLC0415
    import re  # noqa: PLC0415

    # Шаг 1: whitelist для acc_id — никаких / или .. в имени аккаунта.
    if not _ACC_ID_RE.match(acc_id):
        _LOG.warning(
            "skip rmtree: acc_id %r contains invalid characters (expected [A-Za-z0-9_-])",
            acc_id,
        )
        return

    # Шаг 2: raw-путь должен соответствовать шаблону fleet-sup-<acc_id>-N.
    expected = r"^/tmp/fleet-sup-%s-\d+$" % re.escape(acc_id)
    if not re.match(expected, path):
        _LOG.debug(
            "skip rmtree: path %r does not match fleet-sup pattern for acc %s", path, acc_id
        )
        return

    # Шаг 3: resolve и проверить что realpath остаётся внутри /tmp.
    try:
        real = os.path.realpath(path)
    except Exception as exc:
        _LOG.warning("skip rmtree: realpath(%r) failed: %s", path, exc)
        return

    tmp_real = os.path.realpath("/tmp")
    expected_prefix = os.path.join(tmp_real, "fleet-sup-%s-" % acc_id)
    if not real.startswith(expected_prefix):
        _LOG.warning(
            "skip rmtree: realpath %r does not start with expected prefix %r (symlink/traversal?)",
            real, expected_prefix,
        )
        return
    if not (real == tmp_real or real.startswith(tmp_real + os.sep)):
        _LOG.warning(
            "skip rmtree: realpath %r escapes tmp root %r (symlink/traversal?)",
            real,
            tmp_real,
        )
        return

    try:
        shutil.rmtree(path, ignore_errors=True)
    except Exception as exc:
        _LOG.debug("rmtree %r failed (non-critical): %s", path, exc)


def _log_worker_stats(
    log: logging.Logger, acc_id: str, status: str, res: dict[str, Any]
) -> None:
    """Log compact worker stats. INFO for DONE, WARNING for FAIL/lockout."""
    mb_sent = res.get("morebet_sent", 0)
    mb_ans = res.get("morebet_answered", 0)
    ratio = res.get("morebet_answer_ratio", "?")
    events = res.get("events_emitted", 0)
    odds_frames = res.get("odds_frames_seen", 0)
    raw_events = res.get("odds_raw_events_seen", 0)
    raw_keys = res.get("odds_key_counts", {})
    mb_raw_events = res.get("morebet_raw_events_seen", 0)
    reconnects = res.get("reconnects", 0)
    http_429 = res.get("got_429", 0)
    msg = (
        "worker done acc=%s status=%s events=%s odds_frames=%s raw_events=%s raw_keys=%s "
        "mb_raw_events=%s mb_sent=%s mb_ans=%s ratio=%s reconnects=%s http_429=%s"
    )
    if status == "DONE":
        log.info(
            msg,
            acc_id,
            status,
            events,
            odds_frames,
            raw_events,
            raw_keys,
            mb_raw_events,
            mb_sent,
            mb_ans,
            ratio,
            reconnects,
            http_429,
        )
    else:
        log.warning(
            msg,
            acc_id,
            status,
            events,
            odds_frames,
            raw_events,
            raw_keys,
            mb_raw_events,
            mb_sent,
            mb_ans,
            ratio,
            reconnects,
            http_429,
        )


_PROXY_FAILURE_MARKERS = (
    "proxy",
    "socks",
    "tunnel",
    "net::err_proxy",
    "net::err_tunnel",
    "net::err_name_not_resolved",
    "net::err_connection",
    "net::err_timed_out",
    "net::err_socks",
    "err_proxy_connection_failed",
    "err_tunnel_connection_failed",
    "err_socks",
    "407",
    "econnrefused",
    "econnreset",
    "etimedout",
    "enotfound",
    "ehostunreach",
    "connection refused",
    "connection reset",
    "connection timed out",
    "tunnel connection failed",
    "close 1006",
)

_AUTH_FAILURE_MARKERS = (
    "login:",
    "multiple login",
    "guest mode",
    "sign-in controls",
    "credentials",
    "unauthorized",
    "forbidden",
    "401",
    "403",
)


def classify_failure(status: str) -> str:
    """Worker status -> reason for FleetAccountPool.release.

    429/rate-limit -> lockout (24h).
    Auth/login failures -> auth_hold (manual account attention).
    Proxy/network route failures -> proxy (short route cooldown).
    Other failures/DONE -> transient/ok.
    """
    s = status.lower()
    if "429" in s or "lockout" in s or "rate" in s:
        return "lockout"
    if any(marker in s for marker in _PROXY_FAILURE_MARKERS):
        return "proxy"
    if any(marker in s for marker in _AUTH_FAILURE_MARKERS):
        return "auth_hold"
    if status == "DONE":
        return "ok"
    return "transient"


def assign_ports(slot: int, cdp_base: int = 9300, socks_base: int = 19300) -> tuple[int, int]:
    """Unique CDP/SOCKS ports per worker slot (no conflicts between N browsers)."""
    return cdp_base + slot, socks_base + slot


class Supervisor:
    """Maintains target_k live workers with hot-swap from FleetAccountPool.

    on_event -- fan-in callback (ingest adapter or any sink).
    _worker_cls -- injection point for unit tests (replace Worker with mock).
    """

    def __init__(
        self,
        pool: FleetAccountPool,
        on_event: Callable[[dict[str, Any]], None],
        target_k: int,
        sport: int = 29,
        slug: str = "soccer",
        worker_run_sec: float = 600.0,
        watchlist_provider: Callable[[], list[int]] | None = None,
        canonical_pool: AccountPool | None = None,
        on_raw_frame: Callable[[dict[str, Any]], None] | None = None,
        next_morebet_target: Callable[[], int | None] | None = None,
        cdp_base: int = 9300,
        socks_base: int = 19300,
        _worker_cls: Type[Worker] | None = None,
    ) -> None:
        self.pool = pool
        self.on_event = on_event
        self.target_k = target_k
        self.sport = sport
        self.slug = slug
        self.worker_run_sec = worker_run_sec
        self.watchlist_provider = watchlist_provider
        self.canonical_pool = canonical_pool
        self.on_raw_frame = on_raw_frame
        self.next_morebet_target = next_morebet_target
        self.cdp_base = cdp_base
        self.socks_base = socks_base
        self._worker_cls: Type[Worker] = _worker_cls or Worker
        self.swaps = 0
        self.spawned = 0
        self.failures: list[dict[str, Any]] = []
        self._slot_seq = 0
        self._watchlist_snapshot: list[int] | None = None
        self._free_bucket_indices: set[int] = set()
        # Fix #2: отслеживаем последний профиль по acc_id для удаления при respawn.
        self._prev_profile: dict[str, str] = {}

    def _spawn(self, now: float) -> asyncio.Task[dict[str, Any]] | None:
        acc: FleetAccount | None = self.pool.acquire(now)
        if acc is None:
            return None
        slot = self._slot_seq
        self._slot_seq += 1
        # Stable bucket index: reuse a freed index so replacement keeps same
        # watchlist slice as the failed worker (no duplicate/gap coverage).
        bucket_idx = (
            self._free_bucket_indices.pop()
            if self._free_bucket_indices
            else slot % max(1, self.target_k)
        )
        cdp, socks = assign_ports(slot, cdp_base=self.cdp_base, socks_base=self.socks_base)
        cfg: dict[str, Any] = dict(acc.cfg)
        cfg.setdefault("cdp", cdp)
        cfg.setdefault("socks", socks)
        new_profile = "/tmp/fleet-sup-%s-%d" % (acc.id, slot)
        cfg.setdefault("profile", new_profile)
        # Fix #2: удалить предыдущий профиль этого аккаунта при respawn.
        # Защита: удаляем ТОЛЬКО путь вида /tmp/fleet-sup-<acc_id>-<N>.
        prev_profile = self._prev_profile.get(acc.id)
        if prev_profile is not None and prev_profile != cfg["profile"]:
            _safe_rmtree_fleet_profile(prev_profile, acc.id)
        self._prev_profile[acc.id] = cfg["profile"]
        worker_kwargs: dict[str, Any] = {
            "label": acc.id,
            "sport": self.sport,
            "slug": self.slug,
            "on_event": self.on_event,
            "cfg": cfg,
            "reserve_morebet": self._reserve_morebet,
        }
        if self.on_raw_frame is not None:
            worker_kwargs["on_raw_frame"] = self.on_raw_frame
        if self.next_morebet_target is not None:
            worker_kwargs["next_morebet_target"] = self.next_morebet_target
        try:
            w = self._worker_cls(**worker_kwargs)
        except TypeError:
            worker_kwargs.pop("on_raw_frame", None)
            worker_kwargs.pop("next_morebet_target", None)
            try:
                w = self._worker_cls(**worker_kwargs)
            except TypeError:
                worker_kwargs.pop("reserve_morebet", None)
                w = self._worker_cls(**worker_kwargs)
        self.spawned += 1
        watchlist = self._watchlist_for_bucket(bucket_idx)
        task: asyncio.Task[dict[str, Any]] = asyncio.ensure_future(
            w.run(self.worker_run_sec, watchlist)
        )
        setattr(task, "_acc_id", acc.id)
        setattr(task, "_bucket_idx", bucket_idx)
        return task

    def _reserve_morebet(self, account_id: str) -> bool:
        if self.canonical_pool is None:
            return True
        return self.canonical_pool.reserve_more_bet(account_id)

    def _watchlist_for_slot(self, slot: int) -> list[int]:
        if self._watchlist_snapshot is not None:
            wl = self._watchlist_snapshot
        elif self.watchlist_provider is not None:
            wl = self.watchlist_provider()
        else:
            return []
        if not wl:
            return []
        buckets = partition_watchlist(wl, max(1, self.target_k))
        return list(buckets[slot % len(buckets)])

    def _watchlist_for_bucket(self, bucket_idx: int) -> list[int]:
        """Return the watchlist slice for a stable bucket index.

        Unlike _watchlist_for_slot (slot % k drifts on replacement),
        this takes a pre-assigned bucket_idx in [0..target_k-1] so
        replacements reuse the exact same partition slice as the worker
        they replace (P1b fix, Story 27.41).
        """
        if self._watchlist_snapshot is not None:
            wl = self._watchlist_snapshot
        elif self.watchlist_provider is not None:
            wl = self.watchlist_provider()
        else:
            return []
        if not wl:
            return []
        buckets = partition_watchlist(wl, max(1, self.target_k))
        return list(buckets[bucket_idx % len(buckets)])

    async def _wait_for_reserve(
        self,
        *,
        now: float,
        start: float,
        total_sec: float,
        stop_event: threading.Event | None,
    ) -> None:
        next_at = self.pool.next_available_at(now)
        wait_sec = 1.0 if next_at is None else max(0.05, min(1.0, next_at - now))
        if total_sec != float("inf"):
            remaining = max(0.0, total_sec - (now - start))
            wait_sec = min(wait_sec, remaining)
        if stop_event is not None and stop_event.wait(timeout=wait_sec):
            return
        await asyncio.sleep(0 if stop_event is not None else wait_sec)

    async def run(
        self,
        total_sec: float,
        stop_event: threading.Event | None = None,
        _clock: Callable[[], float] = time.time,
    ) -> dict[str, Any]:
        """Hold target_k workers for total_sec, replacing failed ones from reserve.

        stop_event -- optional threading.Event for early shutdown
        (used by main.py daemon thread wiring).
        """
        start = _clock()
        tasks: set[asyncio.Task[dict[str, Any]]] = set()
        self._watchlist_snapshot = (
            self.watchlist_provider() if self.watchlist_provider is not None else []
        )
        self._free_bucket_indices = set(range(self.target_k))
        for _ in range(self.target_k):
            t = self._spawn(_clock())
            if t is not None:
                tasks.add(t)

        def _should_stop() -> bool:
            if stop_event is not None and stop_event.is_set():
                return True
            return _clock() - start >= total_sec

        while not _should_stop():
            if tasks:
                done, pending = await asyncio.wait(
                    tasks, timeout=10.0, return_when=asyncio.FIRST_COMPLETED
                )
                tasks = set(pending)
            else:
                done = set()
            now = _clock()
            for t in done:
                acc_id: str = getattr(t, "_acc_id", "?")
                bucket_idx_done: int | None = getattr(t, "_bucket_idx", None)
                res: dict[str, Any] = {}
                try:
                    res = t.result()
                    status = str(res.get("status", "FAIL: unknown"))
                except Exception as ex:
                    status = "FAIL: %s" % str(ex)[:80]
                _log_worker_stats(_LOG, acc_id, status, res)
                reason = classify_failure(status)
                self.pool.release(now, acc_id, reason)
                if bucket_idx_done is not None:
                    self._free_bucket_indices.add(bucket_idx_done)
                if reason == "lockout" and self.canonical_pool is not None:
                    self.canonical_pool.report_outcome(
                        acc_id,
                        "429",
                        datetime.now(timezone.utc),
                    )
                elif reason == "auth_hold" and self.canonical_pool is not None:
                    self.canonical_pool.report_outcome(
                        acc_id,
                        "auth_hold",
                        datetime.now(timezone.utc),
                    )
                elif reason == "proxy" and self.canonical_pool is not None:
                    self.canonical_pool.report_outcome(
                        acc_id,
                        "ws_drop",
                        datetime.now(timezone.utc),
                    )
                self.failures.append(dict(acc=acc_id, status=status, reason=reason))
            need = replacements_needed(
                self.target_k,
                healthy_active=len(tasks),
                reserve=self.pool.reserve_count(now),
            )
            if need > 0:
                self._watchlist_snapshot = (
                    self.watchlist_provider() if self.watchlist_provider is not None else []
                )
            for _ in range(need):
                nt = self._spawn(now)
                if nt is not None:
                    tasks.add(nt)
                    self.swaps += 1
            if not tasks and not _should_stop():
                await self._wait_for_reserve(
                    now=_clock(),
                    start=start,
                    total_sec=total_sec,
                    stop_event=stop_event,
                )

        if tasks:
            _drain_done, _drain_pending = await asyncio.wait(tasks, timeout=3.0)
            for _dt in _drain_done:
                _drain_acc_id: str = getattr(_dt, "_acc_id", "?")
                _drain_res: dict[str, Any] = {}
                _drain_status: str
                try:
                    _drain_res = _dt.result()
                    _drain_status = str(_drain_res.get("status", "FAIL: unknown"))
                except Exception as _ex:
                    _drain_status = "FAIL: %s" % str(_ex)[:80]
                _log_worker_stats(_LOG, _drain_acc_id, _drain_status, _drain_res)
            if _drain_pending:
                for _dt in _drain_pending:
                    _dt.cancel()
                # Дождаться завершения отмены детерминированно — гарантирует
                # отработку cleanup воркера (terminate Chrome) даже если в
                # Worker.run().finally однажды появится await (review 27.49 P2).
                await asyncio.gather(*_drain_pending, return_exceptions=True)
        now = _clock()
        return dict(
            target_k=self.target_k,
            spawned=self.spawned,
            swaps=self.swaps,
            pool=self.pool.snapshot(now),
            failures=self.failures,
        )
