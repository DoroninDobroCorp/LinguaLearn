"""Tests for Story 27.4.A — coverage-diff cache (AC-1, DOD-1/2/3).

``compute_coverage_diff(sport_id, api_events, ws_events)`` returns the
set of Pinnacle event ids visible via WS but **not** via Partner API.
Caller feeds the two sets (obtained from the respective source state
snapshots); the function is pure. A ``CoverageDiffCache`` wraps it with
a TTL so repeated lookups inside the poll loop don't rescan state.

The stale-window counter ``stale_admits_total`` is incremented whenever
the cache returns a diff that is older than the TTL's fresh window —
callers use it to tune TTL (e.g. drop to 10s if noise exceeds 5%).
"""

from __future__ import annotations

import time

from aggregator.coverage_diff import (
    DEFAULT_COVERAGE_DIFF_TTL_SEC,
    CoverageDiffCache,
    compute_coverage_diff,
)


# ---------------------------------------------------------------------------
# compute_coverage_diff — pure function
# ---------------------------------------------------------------------------


def test_diff_empty_when_ws_subset_of_api() -> None:
    api = {1, 2, 3, 4}
    ws = {1, 2}
    assert compute_coverage_diff(api_events=api, ws_events=ws) == set()


def test_diff_returns_ws_only_events() -> None:
    api = {1, 2, 3}
    ws = {2, 3, 4, 5}
    assert compute_coverage_diff(api_events=api, ws_events=ws) == {4, 5}


def test_diff_empty_api_means_every_ws_event_is_complement() -> None:
    assert compute_coverage_diff(api_events=set(), ws_events={10, 11}) == {10, 11}


def test_diff_empty_ws_gives_empty_complement() -> None:
    assert compute_coverage_diff(api_events={1, 2}, ws_events=set()) == set()


def test_diff_is_symmetric_difference_not_subtracted() -> None:
    """Events in API but not WS stay L1-only (no WS complement).

    ``compute_coverage_diff`` must return ``ws − api``, NOT symmetric
    difference — only L2-fill events matter.
    """
    api = {1, 2}
    ws = {3}
    assert compute_coverage_diff(api_events=api, ws_events=ws) == {3}


def test_diff_tolerates_int_and_str_pids_distinct_type() -> None:
    # AC-1 must not accidentally coerce types — 1 (int) ≠ "1" (str).
    api = {1}
    ws = {"1"}
    assert compute_coverage_diff(api_events=api, ws_events=ws) == {"1"}


# ---------------------------------------------------------------------------
# CoverageDiffCache — TTL semantics
# ---------------------------------------------------------------------------


def test_cache_default_ttl_matches_story_spec() -> None:
    cache = CoverageDiffCache()
    assert cache.ttl_sec == DEFAULT_COVERAGE_DIFF_TTL_SEC == 30.0


def test_cache_custom_ttl() -> None:
    cache = CoverageDiffCache(ttl_sec=10)
    assert cache.ttl_sec == 10.0


def test_cache_hit_returns_same_value_without_recompute() -> None:
    cache = CoverageDiffCache(ttl_sec=60.0)
    n_computed = {"n": 0}

    def provider(sport_id: int) -> tuple[set[int], set[int]]:
        n_computed["n"] += 1
        return {1, 2}, {2, 3}

    d1 = cache.get(sport_id=29, provider=provider)
    d2 = cache.get(sport_id=29, provider=provider)
    assert d1 == d2 == {3}
    assert n_computed["n"] == 1, "second call must hit the cache"


def test_cache_miss_after_ttl_expiry_recomputes() -> None:
    cache = CoverageDiffCache(ttl_sec=0.01)
    n_computed = {"n": 0}

    def provider(sport_id: int) -> tuple[set[int], set[int]]:
        n_computed["n"] += 1
        return set(), {10}

    cache.get(sport_id=29, provider=provider)
    time.sleep(0.02)
    cache.get(sport_id=29, provider=provider)
    assert n_computed["n"] == 2


def test_cache_is_keyed_per_sport() -> None:
    cache = CoverageDiffCache(ttl_sec=60.0)
    calls: list[int] = []

    def provider(sport_id: int) -> tuple[set[int], set[int]]:
        calls.append(sport_id)
        return set(), {sport_id * 10}

    d_soccer = cache.get(sport_id=29, provider=provider)
    d_basket = cache.get(sport_id=4, provider=provider)
    assert d_soccer == {290}
    assert d_basket == {40}
    assert calls == [29, 4]


def test_cache_invalidate_clears_entry() -> None:
    cache = CoverageDiffCache(ttl_sec=60.0)
    n_computed = {"n": 0}

    def provider(sport_id: int) -> tuple[set[int], set[int]]:
        n_computed["n"] += 1
        return set(), {1}

    cache.get(sport_id=29, provider=provider)
    cache.invalidate(sport_id=29)
    cache.get(sport_id=29, provider=provider)
    assert n_computed["n"] == 2


def test_cache_metrics_expose_hit_miss_counts() -> None:
    cache = CoverageDiffCache(ttl_sec=60.0)

    def provider(sport_id: int) -> tuple[set, set]:
        return set(), {1}

    cache.get(sport_id=29, provider=provider)  # miss
    cache.get(sport_id=29, provider=provider)  # hit
    cache.get(sport_id=29, provider=provider)  # hit

    assert cache.hits == 2
    assert cache.misses == 1


# ---------------------------------------------------------------------------
# Snapshot helpers exposed via cache for observability
# ---------------------------------------------------------------------------


def test_cache_snapshot_returns_last_counts() -> None:
    cache = CoverageDiffCache(ttl_sec=60.0)
    cache.get(sport_id=29, provider=lambda sid: ({1, 2, 3}, {2, 3, 4}))
    snap = cache.snapshot_counts()
    # per-sport — (api_count, ws_count, complement_count)
    assert snap[29] == (3, 3, 1)


def test_cache_aggregate_coverage_metrics() -> None:
    cache = CoverageDiffCache(ttl_sec=60.0)
    cache.get(sport_id=29, provider=lambda sid: ({1, 2, 3}, {2, 3, 4}))
    cache.get(sport_id=4, provider=lambda sid: ({10, 11}, {11, 12, 13}))
    # api = {1,2,3} + {10,11} = 5
    # complement (ws-only) = {4} + {12,13} = 3
    assert cache.total_api_events() == 5
    assert cache.total_ws_complement_events() == 3
