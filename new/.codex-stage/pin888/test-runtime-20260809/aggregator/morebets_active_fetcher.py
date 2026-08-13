"""morebets_active_fetcher: Consumer EventPriorityQueue (Story 27.38).

Anti-ban rate-cap invariants
----------------------------
Per-account request rate is limited by two orthogonal mechanisms:

(a) **Global** — ``pool.pick()`` internally calls
    ``more_bets_budget.consume()`` under the pool lock, which enforces a
    global per-account sliding-window budget shared by all consumers of
    the same ``AccountPool`` instance.
(b) **Local** — ``_last_request_ts[acct_key]`` enforces <= 1 r/s per
    account *within this fetcher instance* (single-instance invariant).

Current wiring (``main.py``) creates exactly **one** ``MoreBetsActiveFetcher``
per ``AccountPool``.  Multiple instances on the same pool are not intended
and would require a shared per-account rate-limiter in ``AccountPool`` itself
(follow-up for live-pilot story 27.39).

On HTTP 429 the fetcher additionally calls ``pool.report_outcome(acct, "429")``
so the pool-level FSM / ``last_429_at`` flag is updated — this makes the
backoff visible to all pool consumers even in a hypothetical multi-instance
setup.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any, Protocol

from aggregator.account_pool import AccountPool
from aggregator.event_priority_queue import EventPriorityQueue
from aggregator.forted_targeting import HARD_MOREBET_RPS_CAP, next_interval

_log = logging.getLogger(__name__)


class FetchStatus(Enum):
    OK = "ok"
    RATE_LIMITED = "rate_limited"
    ERROR = "error"


@dataclass(frozen=True)
class FetchResult:
    status: FetchStatus
    detail: str = ""


class MoreBetFetcher(Protocol):
    def fetch(self, event_id: str, account: Any) -> FetchResult:
        ...


class MoreBetsActiveFetcher:
    """Proactive consumer of ``EventPriorityQueue`` -> per-event MORE_BET pull.

    Anti-ban cap is enforced by (a) pool budget (global) and (b) local
    ``_last_request_ts`` (<= 1 r/s per account, single-instance).  See module
    docstring for details.
    """

    def __init__(
        self,
        queue: EventPriorityQueue,
        pool: AccountPool,
        fetch_fn: MoreBetFetcher,
        *,
        family: str = "ps3838",
        min_interval_sec: float = next_interval(),
    ) -> None:
        if min_interval_sec <= 0:
            raise ValueError("min_interval_sec must be > 0")
        safe_interval = max(min_interval_sec, 1.0 / HARD_MOREBET_RPS_CAP)
        self._queue = queue
        self._pool = pool
        self._fetch_fn = fetch_fn
        self._family = family
        self._min_interval_sec = safe_interval
        self._last_request_ts: dict[str, float] = {}
        self._blocked_until: dict[str, float] = {}

    def run_once(self, now: float) -> bool:
        item = self._queue.pop()
        if item is None:
            return False
        event_id, priority = item

        account = self._pool.pick(self._family, market="more_bet")
        if account is None:
            # No account available — put event back preserving any concurrent
            # priority promotion.
            self._queue.reschedule(event_id, priority)
            return False

        acct_key: str = account.account_id

        if now < self._blocked_until.get(acct_key, 0.0):
            # Account still in 429 local backoff window.
            self._queue.reschedule(event_id, priority)
            return False

        last_ts = self._last_request_ts.get(acct_key, float("-inf"))
        if (now - last_ts) < self._min_interval_sec:
            # Rate-cap: too soon since last request for this account.
            self._queue.reschedule(event_id, priority)
            return False

        self._last_request_ts[acct_key] = now

        # --- post-pop critical section: any exception must requeue the event --
        try:
            result = self._fetch_fn.fetch(event_id, account)
        except Exception:
            # Unexpected error — requeue so the event is not lost, then
            # re-raise so run_forever can log it.
            self._queue.reschedule(event_id, priority)
            raise

        if result.status == FetchStatus.RATE_LIMITED:
            # 1. Tell the pool FSM about the 429 so backoff is pool-visible.
            self._pool.report_outcome(acct_key, "429")
            # 2. Local double-protection: block this account for 2x interval.
            self._blocked_until[acct_key] = now + 2.0 * self._min_interval_sec
            _log.warning(
                "MORE_BET rate-limited acct=%s event=%s backoff_until=%.1f",
                acct_key, event_id, self._blocked_until[acct_key],
            )
            # 3. Return event to queue — do NOT drop it.
            self._queue.reschedule(event_id, priority)
        elif result.status == FetchStatus.ERROR:
            _log.warning(
                "MORE_BET fetch error acct=%s event=%s detail=%r - requeuing",
                acct_key, event_id, result.detail,
            )
            self._queue.reschedule(event_id, priority)

        return True

    def run_forever(self, stop_event: threading.Event) -> None:
        while not stop_event.is_set():
            try:
                self.run_once(time.time())
            except Exception:  # noqa: BLE001
                _log.exception("MoreBetsActiveFetcher.run_once() failed")
            stop_event.wait(timeout=self._min_interval_sec)


__all__ = ["FetchResult", "FetchStatus", "MoreBetFetcher", "MoreBetsActiveFetcher"]
