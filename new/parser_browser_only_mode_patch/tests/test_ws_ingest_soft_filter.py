"""Tests for Story 27.4.B — WS ingest-side soft filter (AC-2, DOD-4/5/6).

WS events whose canonical Pinnacle pid is already covered by Partner
API (L1) must be dropped at the ``IngestRouter`` boundary **before**
the core ``DecisionEngine`` sees them. Rationale: even though L1
exclusively publishes covered events (Story 27.3.D AC-8), letting WS
candidates land in the candidate layer inflates dedup churn and muddies
the audit trail.

The filter is a **soft** one — the WS transport still accepts the full
stream from the Mac-side parser; narrowing is done in aggregator only.
Network-level narrowing is explicitly out-of-scope (story Implementation
Notes §2).

Env override ``MSP_PS3838_WS_FORCE_EVENTS="pid1,pid2"`` bypasses the
filter for the listed pids — useful for operational testing.

Counters exposed for ``/stats``:

* ``ws_events_filtered_as_l1_covered_total`` keyed by source_id
* ``ws_events_accepted_as_l2_complement_total`` keyed by source_id
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from aggregator.decision import DecisionEngine
from aggregator.ingest import IngestRouter
from aggregator.store import ProvenanceStore
from aggregator.types import SourceEvent


def _mk_router(
    *,
    l1_covered_pids: set[int] | None = None,
    force_pids_env: str | None = None,
    monkeypatch: pytest.MonkeyPatch | None = None,
) -> tuple[IngestRouter, list]:
    if monkeypatch is not None:
        if force_pids_env is not None:
            monkeypatch.setenv("MSP_PS3838_WS_FORCE_EVENTS", force_pids_env)
        else:
            monkeypatch.delenv("MSP_PS3838_WS_FORCE_EVENTS", raising=False)
    store = ProvenanceStore()
    engine = DecisionEngine()
    pids = set(l1_covered_pids or set())

    def provider() -> set[int]:
        return set(pids)

    router = IngestRouter(
        store, engine, l1_covered_pids_provider=provider
    )
    captured: list = []
    router.register_consumer(lambda q: captured.append(q))
    return router, captured


def _mk_event(
    *,
    source_id: str,
    transport: str,
    pid: int,
    price: float = 1.9,
) -> SourceEvent:
    now = datetime.now(timezone.utc)
    return SourceEvent(
        source_id=source_id,
        family="pinnacle_native",
        transport=transport,
        event_id=f"{source_id}:{pid}",
        payload={
            "Pid": pid,
            "Periods": [{"Number": 0, "MoneyLine": {"Home": price}}],
        },
        collected_at=now,
        received_at=now,
    )


# ---------------------------------------------------------------------------
# Baseline — router works unchanged when no provider is wired
# ---------------------------------------------------------------------------


def test_no_provider_means_no_filtering() -> None:
    store = ProvenanceStore()
    engine = DecisionEngine()
    router = IngestRouter(store, engine)  # no l1_covered_pids_provider
    captured: list = []
    router.register_consumer(lambda q: captured.append(q))
    router.ingest(_mk_event(source_id="pin888", transport="ws", pid=42))
    assert len(captured) == 1, "filter must be off by default"


# ---------------------------------------------------------------------------
# AC-2: WS events for L1-covered pids are dropped
# ---------------------------------------------------------------------------


def test_ws_event_for_l1_covered_pid_is_filtered() -> None:
    router, captured = _mk_router(l1_covered_pids={42})
    pq = router.ingest(_mk_event(source_id="pin888", transport="ws", pid=42))
    assert pq is None
    assert len(captured) == 0


def test_ws_event_for_uncovered_pid_is_admitted() -> None:
    router, captured = _mk_router(l1_covered_pids={42})
    pq = router.ingest(_mk_event(source_id="pin888", transport="ws", pid=99))
    assert pq is not None
    assert len(captured) == 1
    assert pq.source_used_for_publish == "pin888"


def test_api_events_never_filtered_by_ws_filter() -> None:
    """Filter must NOT drop pinnacle_api events — it's WS-only."""
    router, captured = _mk_router(l1_covered_pids={42})
    pq = router.ingest(
        _mk_event(source_id="pinnacle_api", transport="http_pull", pid=42)
    )
    assert pq is not None
    assert pq.source_used_for_publish == "pinnacle_api"
    assert len(captured) == 1


def test_browser_ws_transport_is_also_filtered() -> None:
    router, captured = _mk_router(l1_covered_pids={42})
    pq = router.ingest(
        _mk_event(
            source_id="pin888:acct-A:browser_ws", transport="browser_ws", pid=42
        )
    )
    assert pq is None
    assert len(captured) == 0


def test_tab_mode_transport_is_also_filtered() -> None:
    """Tabs are part of the L2 complement tier too (story 27.4 DOD-10)."""
    router, captured = _mk_router(l1_covered_pids={42})
    pq = router.ingest(
        _mk_event(source_id="pin888:tab", transport="tab_mode", pid=42)
    )
    assert pq is None


# ---------------------------------------------------------------------------
# Counters (DOD-6)
# ---------------------------------------------------------------------------


def test_filter_counter_increments_on_drop() -> None:
    router, _ = _mk_router(l1_covered_pids={42})
    router.ingest(_mk_event(source_id="pin888", transport="ws", pid=42))
    router.ingest(_mk_event(source_id="pin888", transport="ws", pid=42, price=1.8))
    assert router.ws_events_filtered_as_l1_covered_total() == {"pin888": 2}


def test_accept_counter_increments_on_pass_through() -> None:
    router, _ = _mk_router(l1_covered_pids={42})
    router.ingest(_mk_event(source_id="pin888", transport="ws", pid=99))
    counts = router.ws_events_accepted_as_l2_complement_total()
    assert counts.get("pin888", 0) == 1


def test_filter_and_accept_counters_are_independent_per_source() -> None:
    router, _ = _mk_router(l1_covered_pids={42})
    router.ingest(_mk_event(source_id="pin888:acct-A:browser_ws", transport="browser_ws", pid=42))
    router.ingest(_mk_event(source_id="pin888:tab", transport="tab_mode", pid=99))
    filtered = router.ws_events_filtered_as_l1_covered_total()
    accepted = router.ws_events_accepted_as_l2_complement_total()
    assert filtered.get("pin888:acct-A:browser_ws", 0) == 1
    assert accepted.get("pin888:tab", 0) == 1


# ---------------------------------------------------------------------------
# Manual override — MSP_PS3838_WS_FORCE_EVENTS
# ---------------------------------------------------------------------------


def test_force_events_env_bypasses_filter(monkeypatch: pytest.MonkeyPatch) -> None:
    router, captured = _mk_router(
        l1_covered_pids={42, 43},
        force_pids_env="42",
        monkeypatch=monkeypatch,
    )
    pq = router.ingest(_mk_event(source_id="pin888", transport="ws", pid=42))
    # Forced through despite being L1-covered.
    assert pq is not None
    assert len(captured) == 1


def test_force_events_env_multiple_ids(monkeypatch: pytest.MonkeyPatch) -> None:
    router, captured = _mk_router(
        l1_covered_pids={42, 43, 44},
        force_pids_env="42,44",
        monkeypatch=monkeypatch,
    )
    router.ingest(_mk_event(source_id="pin888", transport="ws", pid=42))
    router.ingest(_mk_event(source_id="pin888", transport="ws", pid=43))  # filtered
    router.ingest(_mk_event(source_id="pin888", transport="ws", pid=44))
    # 42 + 44 forced through, 43 filtered.
    assert len(captured) == 2


def test_force_events_env_empty_string_is_no_op(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    router, _ = _mk_router(
        l1_covered_pids={42},
        force_pids_env="",
        monkeypatch=monkeypatch,
    )
    pq = router.ingest(_mk_event(source_id="pin888", transport="ws", pid=42))
    assert pq is None  # still filtered


def test_force_events_env_bogus_falls_back_gracefully(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    router, _ = _mk_router(
        l1_covered_pids={42},
        force_pids_env="banana,peach",
        monkeypatch=monkeypatch,
    )
    pq = router.ingest(_mk_event(source_id="pin888", transport="ws", pid=42))
    # Bogus ids don't force anything through → filter still applies.
    assert pq is None


# ---------------------------------------------------------------------------
# Edge cases — missing / bogus Pid should not crash
# ---------------------------------------------------------------------------


def test_event_without_pid_in_payload_is_admitted() -> None:
    """No pid → can't dedupe against L1 coverage → pass through (safe)."""
    router, captured = _mk_router(l1_covered_pids={42})
    now = datetime.now(timezone.utc)
    ev = SourceEvent(
        source_id="pin888",
        family="pinnacle_native",
        transport="ws",
        event_id="pin888:unknown",
        payload={"no_pid": True, "Periods": [{"Number": 0, "MoneyLine": {"Home": 1.9}}]},
        collected_at=now,
        received_at=now,
    )
    pq = router.ingest(ev)
    assert pq is not None


def test_stale_admits_counter_exposed_and_defaults_zero() -> None:
    router, _ = _mk_router(l1_covered_pids={42})
    assert router.ws_events_admitted_during_stale_diff_total() == 0


def test_stale_admits_increments_when_pid_recently_added_to_l1() -> None:
    """DOD-2 — admit for a pid that L1 just got → stale-diff admit."""
    store = ProvenanceStore()
    engine = DecisionEngine()
    # Covered set is stale — pid 99 is NOT in it yet.
    covered: set[int] = {42}
    # But recently-added set contains 99 — L1 just saw it.
    recent: set[int] = {99}
    router = IngestRouter(
        store,
        engine,
        l1_covered_pids_provider=lambda: set(covered),
        l1_recently_added_pids_provider=lambda: set(recent),
    )
    router.ingest(_mk_event(source_id="pin888", transport="ws", pid=99))
    assert router.ws_events_admitted_during_stale_diff_total() == 1


def test_stale_admits_does_not_increment_for_genuinely_uncovered_pid() -> None:
    store = ProvenanceStore()
    engine = DecisionEngine()
    router = IngestRouter(
        store,
        engine,
        l1_covered_pids_provider=lambda: {42},
        l1_recently_added_pids_provider=lambda: {42},  # unrelated
    )
    router.ingest(_mk_event(source_id="pin888", transport="ws", pid=99))
    assert router.ws_events_admitted_during_stale_diff_total() == 0


def test_tombstone_for_covered_pid_still_filtered() -> None:
    """Tombstones with L1-covered pid are still WS-side → filter.

    AC-2 says "WS event dropped if event_id ∈ L1-covered"; tombstones
    are still WS-side signals we don't need given L1 authority.
    """
    router, captured = _mk_router(l1_covered_pids={42})
    now = datetime.now(timezone.utc)
    ev = SourceEvent(
        source_id="pin888",
        family="pinnacle_native",
        transport="ws",
        event_id="pin888:42",
        payload={"Pid": 42},
        collected_at=now,
        received_at=now,
        is_tombstone=True,
    )
    pq = router.ingest(ev)
    assert pq is None
    assert len(captured) == 0
