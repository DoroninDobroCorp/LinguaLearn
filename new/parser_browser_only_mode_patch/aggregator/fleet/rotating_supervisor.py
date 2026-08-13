"""Exclusive account scheduler for multi-sport PS3838 fleet workers.

The legacy per-sport wiring creates an independent Supervisor per sport.  That
is fine only when every sport owns distinct accounts.  With a small account
pool it can clone the same credential into many concurrent browser sessions.

RotatingFleetSupervisor keeps one shared FleetAccountPool for all sports: an
account can run at most one Worker at a time, and each replacement picks the
next sport in round-robin order.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any, Callable, Type

from aggregator.account_pool import AccountPool, FleetAccount, FleetAccountPool, replacements_needed
from aggregator.fleet.sport_allocation import SportSpec, profile_for_sport
from aggregator.fleet.supervisor import (
    _log_worker_stats,
    _safe_rmtree_fleet_profile,
    assign_ports,
    classify_failure,
)
from aggregator.fleet.worker import Worker


_LOG = logging.getLogger(__name__)


class RotatingFleetSupervisor:
    """Maintain K workers over a shared account pool and rotating sport list."""

    def __init__(
        self,
        *,
        pool: FleetAccountPool,
        sports: list[SportSpec],
        on_event: Callable[[dict[str, Any]], None],
        target_k: int,
        worker_run_sec: float = 600.0,
        watchlist_provider: Callable[[], list[int]] | None = None,
        canonical_pool: AccountPool | None = None,
        on_raw_frame: Callable[[dict[str, Any]], None] | None = None,
        next_morebet_target: Callable[[], int | None] | None = None,
        cdp_base: int = 9300,
        socks_base: int = 19300,
        _worker_cls: Type[Worker] | None = None,
    ) -> None:
        if not sports:
            raise ValueError("RotatingFleetSupervisor requires at least one sport")
        self.pool = pool
        self.sports = list(sports)
        self.on_event = on_event
        self.target_k = max(1, int(target_k))
        self.worker_run_sec = float(worker_run_sec)
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
        self._sport_cursor = 0
        self._prev_profile: dict[str, str] = {}
        self._last_sport_by_task: dict[int, SportSpec] = {}

    def _next_sport(self) -> tuple[int, SportSpec]:
        idx = self._sport_cursor % len(self.sports)
        self._sport_cursor += 1
        return idx, self.sports[idx]

    def _reserve_morebet(self, account_id: str) -> bool:
        if self.canonical_pool is None:
            return True
        return self.canonical_pool.reserve_more_bet(account_id)

    def _spawn(self, now: float) -> asyncio.Task[dict[str, Any]] | None:
        acc: FleetAccount | None = self.pool.acquire(now)
        if acc is None:
            return None
        sport_idx, sport = self._next_sport()
        slot = self._slot_seq
        self._slot_seq += 1
        cdp, socks = assign_ports(slot, cdp_base=self.cdp_base, socks_base=self.socks_base)
        cfg: dict[str, Any] = dict(acc.cfg)
        cfg.setdefault("cdp", cdp)
        cfg.setdefault("socks", socks)
        new_profile = profile_for_sport(acc.id, sport.slug, sport_idx, slot)
        cfg.setdefault("profile", new_profile)
        prev_profile = self._prev_profile.get(acc.id)
        if prev_profile is not None and prev_profile != cfg["profile"]:
            _safe_rmtree_fleet_profile(prev_profile, acc.id)
        self._prev_profile[acc.id] = cfg["profile"]

        worker_kwargs: dict[str, Any] = {
            "label": acc.id,
            "sport": sport.sport_id,
            "slug": sport.slug,
            "on_event": self.on_event,
            "cfg": cfg,
            "reserve_morebet": self._reserve_morebet,
        }
        if self.on_raw_frame is not None:
            worker_kwargs["on_raw_frame"] = self.on_raw_frame
        if self.next_morebet_target is not None:
            worker_kwargs["next_morebet_target"] = self.next_morebet_target
        try:
            worker = self._worker_cls(**worker_kwargs)
        except TypeError:
            worker_kwargs.pop("on_raw_frame", None)
            worker_kwargs.pop("next_morebet_target", None)
            try:
                worker = self._worker_cls(**worker_kwargs)
            except TypeError:
                worker_kwargs.pop("reserve_morebet", None)
                worker = self._worker_cls(**worker_kwargs)

        self.spawned += 1
        watchlist = self.watchlist_provider() if self.watchlist_provider is not None else []
        task: asyncio.Task[dict[str, Any]] = asyncio.ensure_future(
            worker.run(self.worker_run_sec, watchlist)
        )
        setattr(task, "_acc_id", acc.id)
        setattr(task, "_sport_slug", sport.slug)
        setattr(task, "_sport_id", sport.sport_id)
        self._last_sport_by_task[id(task)] = sport
        _LOG.info(
            "rotating worker start acc=%s sport=%s:%s slot=%s",
            acc.id,
            sport.slug,
            sport.sport_id,
            slot,
        )
        return task

    async def _wait_for_reserve(
        self,
        *,
        now: float,
        start: float,
        total_sec: float,
        stop_event: Any,
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
        stop_event: Any = None,
        _clock: Callable[[], float] = time.time,
    ) -> dict[str, Any]:
        start = _clock()
        tasks: set[asyncio.Task[dict[str, Any]]] = set()
        for _ in range(min(self.target_k, max(1, self.pool.reserve_count(_clock())))):
            task = self._spawn(_clock())
            if task is not None:
                tasks.add(task)

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
            for task in done:
                acc_id: str = getattr(task, "_acc_id", "?")
                sport_slug: str = getattr(task, "_sport_slug", "?")
                sport_id: Any = getattr(task, "_sport_id", "?")
                try:
                    res = task.result()
                    status = str(res.get("status", "FAIL: unknown"))
                except Exception as exc:  # noqa: BLE001
                    res = {}
                    status = "FAIL: %s" % str(exc)[:80]
                _log_worker_stats(_LOG, acc_id, status, res)
                reason = classify_failure(status)
                self.pool.release(now, acc_id, reason)
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
                self.failures.append(
                    dict(acc=acc_id, sport=sport_slug, sport_id=sport_id, status=status, reason=reason)
                )
                self._last_sport_by_task.pop(id(task), None)

            need = replacements_needed(
                self.target_k,
                healthy_active=len(tasks),
                reserve=self.pool.reserve_count(now),
            )
            for _ in range(need):
                task = self._spawn(now)
                if task is not None:
                    tasks.add(task)
                    self.swaps += 1
            if not tasks and not _should_stop():
                await self._wait_for_reserve(
                    now=_clock(),
                    start=start,
                    total_sec=total_sec,
                    stop_event=stop_event,
                )

        if tasks:
            done, pending = await asyncio.wait(tasks, timeout=3.0)
            for task in done:
                acc_id = getattr(task, "_acc_id", "?")
                try:
                    res = task.result()
                    status = str(res.get("status", "FAIL: unknown"))
                except Exception as exc:  # noqa: BLE001
                    res = {}
                    status = "FAIL: %s" % str(exc)[:80]
                _log_worker_stats(_LOG, acc_id, status, res)
            for task in pending:
                task.cancel()
            if pending:
                await asyncio.gather(*pending, return_exceptions=True)

        now = _clock()
        return dict(
            target_k=self.target_k,
            sports=[dict(slug=s.slug, sport_id=s.sport_id) for s in self.sports],
            spawned=self.spawned,
            swaps=self.swaps,
            pool=self.pool.snapshot(now),
            failures=self.failures,
        )


__all__ = ["RotatingFleetSupervisor"]
