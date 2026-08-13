#!/usr/bin/env python3
"""morebets_targeting -- targeting layer for MORE_BET events.

Story 27.36 P1/P2 fixes (adversarial review):
  P1.1 -- real watch_duration: first_trigger_time per eid; deadline fixed.
  P1.2 -- top-N only for FortedTopNTrigger; AllLive/Manual bypass top-N.
  P1.3 -- capacity_cap enforced; output bounded at high churn.
  P2.4 -- from_config() reads MOREBETS_* env vars.
  P2.5 -- real profit stored (incl. negative).
  P2.6 -- backwards-time guard: clamp now >= _last_now.
  P2.7 -- is_live field on MoreBetTarget; required_accounts_mixed().
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Callable, Protocol

import config

from aggregator import fleet_calc as _fc
from aggregator import forted_targeting as _ft
from aggregator.bia_price_tracker import BiaPriceTracker, get_shared_tracker

log = logging.getLogger(__name__)

__all__ = [
    "MoreBetTarget",
    "MoreBetTrigger",
    "FortedTopNTrigger",
    "AllLiveTrigger",
    "ManualTrigger",
    "BiaPriceChangeTrigger",
    "MoreBetsTargeter",
]

@dataclass(frozen=True)
class MoreBetTarget:
    event_id: int
    family: str
    deadline: float
    priority: float
    is_live: bool = False


class MoreBetTrigger(Protocol):
    def current_forks(self, now: float) -> list[dict[str, Any]]:
        ...  # pragma: no cover


class FortedTopNTrigger:
    def __init__(self, forks: list[dict[str, Any]] | None = None) -> None:
        self._forks: list[dict[str, Any]] = list(forks) if forks else []

    def set_forks(self, forks: list[dict[str, Any]]) -> None:
        self._forks = list(forks)

    def current_forks(self, now: float) -> list[dict[str, Any]]:
        del now
        return list(self._forks)


class AllLiveTrigger:
    def __init__(self, event_ids: list[int] | None = None) -> None:
        self._event_ids: list[int] = list(event_ids) if event_ids else []

    def set_live_events(self, event_ids: list[int]) -> None:
        self._event_ids = list(event_ids)

    def current_forks(self, now: float) -> list[dict[str, Any]]:
        del now
        return [
            dict(event_id=eid, profit=0.0, is_live=True)
            for eid in self._event_ids
        ]


class ManualTrigger:
    def __init__(self, event_ids: list[int]) -> None:
        self._event_ids: list[int] = list(event_ids)

    def current_forks(self, now: float) -> list[dict[str, Any]]:
        del now
        return [
            dict(event_id=eid, profit=0.0, is_live=False)
            for eid in self._event_ids
        ]
class BiaPriceChangeTrigger:
    """MoreBetTrigger: BIA price changes -> Pinnacle pids for MORE_BET.

    Story 27.42 + 27.46.  Reads hot events from a BiaPriceTracker.

    Key routing (27.46):
    - If key is int: treated directly as Pinnacle pid (primary path when
      bia_observer feeds the shared tracker with matched pids).
    - If key is str and pid_resolver is set: resolved via resolver (backward
      compat, Story 27.42 path).
    - Otherwise: silently skipped (financial safety).

    ``tracker`` defaults to the module-level shared singleton so that
    bia_observer and this trigger share state within the same process.
    ``pid_resolver`` is optional (not needed when keys are already pids).
    """

    def __init__(
        self,
        tracker: BiaPriceTracker | None = None,
        pid_resolver: Callable[[str], int | None] | None = None,
    ) -> None:
        self._tracker: BiaPriceTracker = (
            tracker if tracker is not None else get_shared_tracker()
        )
        self._pid_resolver = pid_resolver

    def current_forks(self, now: float) -> list[dict[str, Any]]:
        seen: set[int] = set()
        result: list[dict[str, Any]] = []
        for key in self._tracker.hot_events(now):
            if isinstance(key, int):
                pid: int | None = key  # direct pid path (27.46)
            elif isinstance(key, str) and self._pid_resolver is not None:
                pid = self._pid_resolver(key)  # legacy resolver path (27.42)
            else:
                pid = None
            if pid is None:
                continue
            if pid in seen:
                continue
            seen.add(pid)
            result.append({"event_id": pid, "profit": 0.0, "is_live": True})
        return result


class MoreBetsTargeter:
    def __init__(
        self,
        triggers: list[MoreBetTrigger],
        top_n: int = 10,
        watch_duration_sec: float = 120.0,
        live_refresh_sec: float = 2.0,
        prematch_refresh_sec: float = 12.0,
        default_family: str = "first_half_1x2",
        capacity_cap: int | None = None,
    ) -> None:
        self._triggers = triggers
        self._top_n = top_n
        self._watch_duration_sec = watch_duration_sec
        self._live_refresh_sec = live_refresh_sec
        self._prematch_refresh_sec = prematch_refresh_sec
        self._default_family = default_family
        self._capacity_cap = capacity_cap
        self._first_seen: dict[int, float] = {}
        self._in_fork: set[int] = set()
        self._hard_expired: set[int] = set()
        self._last_now: float = float("-inf")

    @classmethod
    def from_config(
        cls,
        *,
        bia_pid_resolver: Callable[[str], int | None] | None = None,
    ) -> "MoreBetsTargeter":
        watch_sec = float(os.getenv("MOREBETS_WATCH_DURATION_SEC", "120"))
        top_n = int(os.getenv("MOREBETS_TOP_N", "10"))
        live_r = float(os.getenv("MOREBETS_LIVE_REFRESH_SEC", "2"))
        prematch_r = float(os.getenv("MOREBETS_PREMATCH_REFRESH_SEC", "12"))
        triggers_env = os.getenv("MOREBETS_TRIGGERS", "forted_topn")
        trigger_names = [t.strip() for t in triggers_env.split(",") if t.strip()]
        triggers: list[MoreBetTrigger] = []
        if "forted_topn" in trigger_names:
            triggers.append(FortedTopNTrigger())
        if "all_live" in trigger_names:
            triggers.append(AllLiveTrigger())
        if "manual" in trigger_names:
            triggers.append(ManualTrigger([]))
        if "bia_price" in trigger_names:
            if config.BIA_PRICE_TRIGGER_ENABLED:
                # 27.46: shared tracker (pid-keyed from bia_observer); resolver
                # is optional — kept for backward compat when str keys are used.
                triggers.append(
                    BiaPriceChangeTrigger(pid_resolver=bia_pid_resolver)
                )
        return cls(
            triggers=triggers,
            top_n=top_n,
            watch_duration_sec=watch_sec,
            live_refresh_sec=live_r,
            prematch_refresh_sec=prematch_r,
        )


    def get_trigger(self, name: str) -> object | None:
        """Return first trigger matching logical name or None.

        Supported names: 'forted_topn', 'all_live', 'manual', 'bia_price'.
        Used by wiring code (e.g. main.py) to obtain FortedTopNTrigger
        for injection into FortedFeedPoller without breaking from_config().
        """
        _name_to_cls: dict[str, type[object]] = {
            "forted_topn": FortedTopNTrigger,
            "all_live": AllLiveTrigger,
            "manual": ManualTrigger,
            "bia_price": BiaPriceChangeTrigger,
        }
        cls = _name_to_cls.get(name)
        if cls is None:
            return None
        for t in self._triggers:
            if isinstance(t, cls):
                return t
        return None

    def select_targets(self, now: float) -> list[MoreBetTarget]:
        if now < self._last_now:
            log.warning(
                "morebets_targeting: backwards time %.3f < last %.3f; clamping",
                now, self._last_now,
            )
            now = self._last_now
        self._last_now = now
        forted_forks: list[dict[str, Any]] = []
        forced_forks: list[dict[str, Any]] = []
        for trigger in self._triggers:
            forks = trigger.current_forks(now)
            if isinstance(trigger, FortedTopNTrigger):
                forted_forks.extend(forks)
            else:
                forced_forks.extend(forks)
        curr_top: set[int] = set(_ft.rank_top_n(forted_forks, self._top_n))
        newly_entered = curr_top - self._in_fork
        just_left = self._in_fork - curr_top
        for eid in just_left:
            self._hard_expired.discard(eid)
        for eid in newly_entered:
            if eid not in self._hard_expired:
                self._first_seen[eid] = now
        self._in_fork = curr_top
        forted_eids: list[int] = []
        to_clean: list[int] = []
        for eid, ft in list(self._first_seen.items()):
            deadline = ft + self._watch_duration_sec
            if now <= deadline:
                forted_eids.append(eid)
            else:
                if eid in curr_top:
                    self._hard_expired.add(eid)
                to_clean.append(eid)
        for eid in to_clean:
            del self._first_seen[eid]
        forced_by_eid: dict[int, dict[str, Any]] = {}
        for fork in forced_forks:
            feid: Any = fork.get("event_id")
            if isinstance(feid, int) and feid not in forced_by_eid:
                forced_by_eid[feid] = fork
        profit_by_eid: dict[int, float] = {}
        is_live_by_eid: dict[int, bool] = {}
        for fork in forted_forks + forced_forks:
            feid2: Any = fork.get("event_id")
            if not isinstance(feid2, int):
                continue
            eid = feid2
            p_raw = fork.get("profit")
            p2 = float(p_raw) if isinstance(p_raw, (int, float)) else 0.0
            if eid not in profit_by_eid or p2 > profit_by_eid[eid]:
                profit_by_eid[eid] = p2
            if fork.get("is_live"):
                is_live_by_eid[eid] = True
            elif eid not in is_live_by_eid:
                is_live_by_eid[eid] = False
        all_active: dict[int, float] = {}
        for eid in forted_eids:
            all_active[eid] = self._first_seen[eid] + self._watch_duration_sec
        for eid in forced_by_eid:
            all_active[eid] = now + self._watch_duration_sec
        targets: list[MoreBetTarget] = [
            MoreBetTarget(
                event_id=eid,
                family=self._default_family,
                deadline=deadline,
                priority=profit_by_eid.get(eid, 0.0),
                is_live=is_live_by_eid.get(eid, False),
            )
            for eid, deadline in all_active.items()
        ]
        targets.sort(key=lambda t: t.priority, reverse=True)
        if self._capacity_cap is not None and len(targets) > self._capacity_cap:
            log.warning(
                "morebets_targeting: watchlist %d > capacity_cap %d; truncating",
                len(targets), self._capacity_cap,
            )
            targets = targets[: self._capacity_cap]
        return targets

    def required_accounts(
        self,
        watchlist_size: int,
        *,
        is_live: bool = True,
    ) -> int:
        refresh = self._live_refresh_sec if is_live else self._prematch_refresh_sec
        return int(_fc.morebet_accounts(watchlist_size, refresh))

    def required_accounts_mixed(self, targets: list[MoreBetTarget]) -> int:
        live_count = sum(1 for t in targets if t.is_live)
        prematch_count = len(targets) - live_count
        return (
            self.required_accounts(live_count, is_live=True)
            + self.required_accounts(prematch_count, is_live=False)
        )

    def min_interval_sec(self) -> float:
        return float(_ft.next_interval())

    def max_events_per_worker(self, *, is_live: bool = True) -> int:
        refresh = self._live_refresh_sec if is_live else self._prematch_refresh_sec
        return int(_ft.worker_capacity(refresh))
