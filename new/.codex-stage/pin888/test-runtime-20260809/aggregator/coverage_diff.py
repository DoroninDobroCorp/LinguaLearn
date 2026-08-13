"""Coverage-diff cache — Story 27.4.A (AC-1, DOD-1/2/3).

Given two source-coverage sets (Partner API L1 and PS3838 WS L2),
``compute_coverage_diff`` returns the set of events visible via WS but
**not** via the Partner API. Callers use this list as the L2
"complement" — events where WS (or Tabs) must still publish because L1
is blind to them.

``CoverageDiffCache`` wraps the function with a per-sport TTL so the
ingest-side filter can look diffs up cheaply on every WS event without
rescanning full-state sets. The TTL defaults to 30 seconds (per
story spec); operators can tighten it if ``stale_admits_total``
(counted elsewhere in IngestRouter) creeps above ~5 %.

The module is pure — no I/O, no threading, no env reads. All inputs
are passed in; ``time.monotonic()`` is used for TTL bookkeeping only.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Callable, Hashable


DEFAULT_COVERAGE_DIFF_TTL_SEC: float = 30.0


CoverageSets = tuple[set[Hashable], set[Hashable]]
CoverageProvider = Callable[[int], CoverageSets]


def compute_coverage_diff(
    *,
    api_events: set[Hashable],
    ws_events: set[Hashable],
) -> set[Hashable]:
    """Return ``ws_events − api_events`` — events needing L2 fill.

    The function is a thin wrapper around set difference so tests and
    callers can reason about "L2 complement" as a named concept rather
    than an inline ``a - b``. No type coercion: ``1`` (int) and ``"1"``
    (str) stay distinct so callers are forced to normalise event ids
    upstream before calling this.
    """
    return set(ws_events) - set(api_events)


@dataclass
class _CacheEntry:
    api_count: int
    ws_count: int
    diff: set[Hashable]
    computed_at: float


@dataclass
class CoverageDiffCache:
    """Per-sport coverage-diff cache with TTL semantics (AC-1).

    Call pattern::

        cache.get(sport_id=29, provider=lambda sid: (api_set, ws_set))

    The ``provider`` is invoked on cache miss or expiry; the cache holds
    the resulting diff until ``ttl_sec`` seconds elapse. Writes are not
    thread-safe — callers expected to hold an external lock if they
    share the cache across threads.
    """

    ttl_sec: float = DEFAULT_COVERAGE_DIFF_TTL_SEC
    _entries: dict[int, _CacheEntry] = field(default_factory=dict)
    hits: int = 0
    misses: int = 0

    def __post_init__(self) -> None:
        self.ttl_sec = float(self.ttl_sec)

    def get(
        self,
        *,
        sport_id: int,
        provider: CoverageProvider,
    ) -> set[Hashable]:
        now = time.monotonic()
        existing = self._entries.get(sport_id)
        if existing is not None and (now - existing.computed_at) < self.ttl_sec:
            self.hits += 1
            return set(existing.diff)
        self.misses += 1
        api_events, ws_events = provider(sport_id)
        diff = compute_coverage_diff(api_events=api_events, ws_events=ws_events)
        self._entries[sport_id] = _CacheEntry(
            api_count=len(api_events),
            ws_count=len(ws_events),
            diff=diff,
            computed_at=now,
        )
        return set(diff)

    def invalidate(self, *, sport_id: int) -> None:
        self._entries.pop(sport_id, None)

    def snapshot_counts(self) -> dict[int, tuple[int, int, int]]:
        """Return ``{sport_id: (api_count, ws_count, complement_count)}``
        from the currently cached entries. Useful for /stats surface."""
        return {
            sid: (entry.api_count, entry.ws_count, len(entry.diff))
            for sid, entry in self._entries.items()
        }

    def total_api_events(self) -> int:
        """Sum of distinct-per-sport Partner API event counts."""
        return sum(entry.api_count for entry in self._entries.values())

    def total_ws_complement_events(self) -> int:
        """Sum of WS-only (complement) event counts across all cached sports."""
        return sum(len(entry.diff) for entry in self._entries.values())


__all__ = [
    "DEFAULT_COVERAGE_DIFF_TTL_SEC",
    "CoverageDiffCache",
    "CoverageProvider",
    "CoverageSets",
    "compute_coverage_diff",
]
