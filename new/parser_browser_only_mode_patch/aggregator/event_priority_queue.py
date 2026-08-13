"""Event-level priority queue for MoreBets (Story 27.5 / AC-6, DOD-8).

Story 27.5 AC-6 splits priority logic into two orthogonal concerns:

* **Event-level** (this module): "which event do we fetch next?" —
  promoted ROI / watchlist / fresh base signals / fairness queue.
* **Source-level** (:mod:`aggregator.morebets_dispatcher`): "which
  source do we ask first for a given event?" — the source priority
  matrix.

The queue is a plain min-heap ordered by ``(−priority, sequence)`` so
higher-priority items pop first, ties broken by insertion order
(fairness / FIFO).

Priority tiers (``EventPriority``):

* ``PROMOTED`` (100) — externally promoted ROI / watchlist entries.
* ``FRESH_BASE`` (75) — event whose base-market price or status
  signal is fresher than a threshold.
* ``FAIR`` (50) — events already known to be MoreBet-capable; rotated
  by round-robin fairness.
* ``DISCOVERY`` (10) — capped, rare probes of unknown events.

The queue is thread-unsafe (single-threaded consumer pattern); callers
can layer their own lock if needed.
"""

from __future__ import annotations

import heapq
import threading
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Iterable


class EventPriority(IntEnum):
    PROMOTED = 100
    FRESH_BASE = 75
    FAIR = 50
    DISCOVERY = 10


@dataclass(order=True)
class _Entry:
    sort_key: tuple[int, int]
    event_id: str = field(compare=False)
    priority: EventPriority = field(compare=False)


class EventPriorityQueue:
    """Min-heap keyed on ``(−priority, sequence)``.

    ``push(event_id, priority)`` inserts; ``pop()`` removes the highest
    priority item (FIFO tie-break). Re-pushing the same event_id is
    idempotent — we keep the earliest insertion (highest fairness) and
    the latest priority (reprioritisation wins).
    """

    def __init__(self) -> None:
        self._heap: list[_Entry] = []
        self._sequence: int = 0
        # Latest known priority per event_id. When we pop and the entry
        # was downgraded, we re-heap; when upgraded, the older entry is
        # a stale tombstone we skip.
        self._current: dict[str, EventPriority] = {}
        self._lock: threading.RLock = threading.RLock()

    def __len__(self) -> int:
        with self._lock:
            return len(self._current)

    @property
    def is_empty(self) -> bool:
        return len(self) == 0

    def push(self, event_id: str, priority: EventPriority) -> None:
        with self._lock:
            self._sequence += 1
            entry = _Entry(
                sort_key=(-int(priority), self._sequence),
                event_id=event_id,
                priority=priority,
            )
            heapq.heappush(self._heap, entry)
            self._current[event_id] = priority

    def pop(self) -> tuple[str, EventPriority] | None:
        """Return the highest-priority live entry, or ``None`` if empty."""
        with self._lock:
            while self._heap:
                entry = heapq.heappop(self._heap)
                current = self._current.get(entry.event_id)
                if current is None:
                    continue
                if current != entry.priority:
                    continue
                del self._current[entry.event_id]
                return entry.event_id, entry.priority
            return None

    def cancel(self, event_id: str) -> bool:
        """Mark an entry cancelled without walking the heap."""
        with self._lock:
            return self._current.pop(event_id, None) is not None

    def snapshot(self) -> list[tuple[str, EventPriority]]:
        """Live (event_id, priority) pairs in priority order (copy)."""
        with self._lock:
            items = [
                (event_id, priority)
                for event_id, priority in self._current.items()
            ]
        items.sort(key=lambda t: -int(t[1]))
        return items

    def peek_by_priority(self, priority: EventPriority) -> Iterable[str]:
        """Return live event_ids currently sitting at ``priority``."""
        with self._lock:
            return [eid for eid, p in self._current.items() if p == priority]

    def reschedule(self, event_id: str, priority: EventPriority) -> None:
        """Re-insert *event_id* preserving the HIGHER priority if a concurrent
        push already promoted it.  Safe put-back for consumers after a failed
        or deferred fetch attempt.

        Semantics:

        * If *event_id* is already queued at a **higher** priority than
          *priority*, the higher value is kept (no accidental demotion).
        * If *event_id* is not present, it is inserted at *priority*.
        * If *event_id* is present at a **lower** priority, it is upgraded to
          *priority* (same as a normal ``push``).
        """
        with self._lock:
            existing = self._current.get(event_id)
            effective: EventPriority = (
                priority if existing is None else max(existing, priority)
            )
            self._sequence += 1
            entry = _Entry(
                sort_key=(-int(effective), self._sequence),
                event_id=event_id,
                priority=effective,
            )
            heapq.heappush(self._heap, entry)
            self._current[event_id] = effective


__all__ = ["EventPriority", "EventPriorityQueue"]
