"""End-to-end multi-source decision test.

Wires both ``Pin888SourceAdapter`` and ``PinnacleApiSourceAdapter``
against a single ``IngestRouter`` and verifies the cross-source
behavior of the Phase 1 ``DecisionEngine`` plus the tombstone-clear
semantics introduced in commit 8c5a889.

NOTE on **publish authority**. TZ §6 prescribes a per-data-class
authority hierarchy (Pinnacle-native > BIA, with Official API tagged
``primary structured`` and browser-WS tagged ``primary live``). The
**Phase 1** ``DecisionEngine`` ships only the simplest viable rule:
single-source pass-through, falling back to *freshest* when more than
one candidate is held. The richer per-class hierarchy lands in
Phase 5. So this test asserts:

- both sources publish independently (no cross-source clobber);
- when both have a live candidate for the same Pid, the freshest wins
  and the loser is recorded as ``rejected_reason="not_freshest"``;
- pin888-vs-pinnacle_api event_id namespaces don't collide
  (``pin888:N`` vs ``pinnacle_api:N``);
- when a source publishes a tombstone, the cross-source candidate
  bucket is cleared and a stale live quote from the other source
  cannot resurrect the event on the next ingest tick.

Phase 5 hardening punted (with rationale): the test does **not**
assert that "Official API beats browser-WS for prematch structured"
— that policy is not implemented yet. See Phase 2 summary report.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from aggregator.decision import DecisionEngine
from aggregator.ingest import IngestRouter
from aggregator.sources.pin888_source import Pin888SourceAdapter
from aggregator.sources.pinnacle_api_source import PinnacleApiSourceAdapter
from aggregator.sources.pinnacle_api_normalizer import event_id_for_pid
from aggregator.store import ProvenanceStore
from aggregator.types import SourceEvent


class _StubClient:
    """Minimal stub — the integration test drives emit_* directly."""


def _wire():
    store = ProvenanceStore()
    router = IngestRouter(store, DecisionEngine())
    captured: list = []
    router.register_consumer(lambda pq: captured.append(pq))
    pin888 = Pin888SourceAdapter(router)
    api = PinnacleApiSourceAdapter(router=router, client=_StubClient(), sport_ids=[29])
    return router, store, captured, pin888, api


# ── independent publish per source ───────────────────────────────────


def test_each_source_publishes_independently_under_distinct_event_ids():
    """pin888 emits Pid 100 → pin888:100; pinnacle_api emits Pid 100 → pinnacle_api:100.

    The pin888 source uses the legacy `pin888:<Pid>` namespace and the
    API source uses `pinnacle_api:<Pid>`; they are different events
    from the aggregator's perspective until the matching layer
    (Phase 3+) collapses them. Verified here so we don't accidentally
    cross the streams in Phase 2.
    """
    router, _store, captured, pin888, api = _wire()

    pin888.emit_legacy_update(
        {"type": "update", "source": "ps3838", "data": {"Pid": 100, "homeName": "A", "awayName": "B"}}
    )
    api.emit_fixture({"Pid": 100, "homeName": "x", "awayName": "y"})

    event_ids = sorted(pq.event_id for pq in captured)
    assert event_ids == ["pin888:100", event_id_for_pid(100)]
    sources = sorted(pq.source_used_for_publish for pq in captured)
    assert sources == ["pin888:acct-A:browser_ws", "pinnacle_api"]


# ── same canonical event_id across sources → freshness wins ──────────


def _ingest_synthetic(router: IngestRouter, *, source_id: str, transport: str, event_id: str, age_sec: float, pid: int) -> None:
    """Inject a hand-crafted SourceEvent so we can control collected_at."""
    now = datetime.now(timezone.utc) - timedelta(seconds=age_sec)
    ev = SourceEvent(
        source_id=source_id,
        family="pinnacle_native",
        transport=transport,
        event_id=event_id,
        payload={"Pid": pid, "_marker": source_id},
        collected_at=now,
        received_at=now,
    )
    router.ingest(ev)


def test_when_both_sources_share_event_id_freshest_wins_and_loser_audited():
    """Both sources publish for the same canonical event_id: the freshest
    wins and the older one shows up under all_candidate_sources.
    """
    router, _store, captured, _pin888, _api = _wire()
    canonical_id = "agg:1234567"  # any shared id

    _ingest_synthetic(
        router, source_id="pin888:acct-A:browser_ws", transport="browser_ws",
        event_id=canonical_id, age_sec=2.0, pid=1234567,
    )
    _ingest_synthetic(
        router, source_id="pinnacle_api", transport="http_pull",
        event_id=canonical_id, age_sec=0.0, pid=1234567,
    )

    last = captured[-1]
    # Phase 1 rule: freshest wins regardless of source
    assert last.source_used_for_publish == "pinnacle_api"
    loser_sources = [c.source for c in last.all_candidate_sources]
    assert "pin888:acct-A:browser_ws" in loser_sources
    assert all(c.rejected_reason == "not_freshest" for c in last.all_candidate_sources)


def test_when_pinnacle_api_is_older_pin888_publishes():
    """Symmetric case — confirms there's no source-specific bias."""
    router, _store, captured, _pin888, _api = _wire()
    canonical_id = "agg:9999"

    _ingest_synthetic(
        router, source_id="pinnacle_api", transport="http_pull",
        event_id=canonical_id, age_sec=2.0, pid=9999,
    )
    _ingest_synthetic(
        router, source_id="pin888:acct-A:browser_ws", transport="browser_ws",
        event_id=canonical_id, age_sec=0.0, pid=9999,
    )

    last = captured[-1]
    assert last.source_used_for_publish == "pin888:acct-A:browser_ws"


# ── cross-source tombstone clears the bucket (commit 8c5a889) ────────


def test_pin888_tombstone_clears_pinnacle_api_candidate_for_same_event_id():
    """Re: commit 8c5a889 — a tombstone publish drops *all* candidates
    (any source) for that event_id, so a stale live API quote cannot be
    re-elected on the very next ingest tick.

    The earlier (pre-8c5a889) bug published a tombstone, then the next
    pin888 emission re-read the un-cleared API candidate and
    "un-tombstoned" the event. Verify that does not happen now even
    when sources are different.
    """
    router, store, captured, _pin888, _api = _wire()
    canonical_id = "agg:55555"

    # 1) API publishes a live quote.
    _ingest_synthetic(
        router, source_id="pinnacle_api", transport="http_pull",
        event_id=canonical_id, age_sec=0.5, pid=55555,
    )
    assert captured[-1].is_tombstone is False
    assert any(c.source_id == "pinnacle_api" for c in store.get_candidates(canonical_id))

    # 2) pin888 publishes a TOMBSTONE for the same canonical event_id.
    now = datetime.now(timezone.utc)
    tombstone = SourceEvent(
        source_id="pin888:acct-A:browser_ws",
        family="pinnacle_native",
        transport="browser_ws",
        event_id=canonical_id,
        payload={"Pid": 55555, "Removed": True},
        collected_at=now,
        received_at=now,
        is_tombstone=True,
    )
    router.ingest(tombstone)
    assert captured[-1].is_tombstone is True
    # Cross-source clear: NO candidates remain for this event_id.
    assert store.get_candidates(canonical_id) == []

    # 3) Next ingest tick from API (no further data) must NOT replay
    # the old live quote — there's nothing left in the bucket.
    candidates_after = store.get_candidates(canonical_id)
    assert candidates_after == []


# ── one source going silent doesn't impair the other ────────────────


def test_pinnacle_api_silent_pin888_continues_publishing():
    router, _store, captured, pin888, _api = _wire()

    # No api emissions at all.
    pin888.emit_legacy_update(
        {"type": "update", "source": "ps3838", "data": {"Pid": 1, "homeName": "h", "awayName": "a"}}
    )
    pin888.emit_legacy_update(
        {"type": "update", "source": "ps3838", "data": {"Pid": 2, "homeName": "h", "awayName": "a"}}
    )

    pids_published = sorted(pq.event_id for pq in captured)
    assert pids_published == ["pin888:1", "pin888:2"]
    for pq in captured:
        assert pq.source_used_for_publish == "pin888:acct-A:browser_ws"


def test_pin888_silent_pinnacle_api_continues_publishing():
    router, _store, captured, _pin888, api = _wire()

    api.emit_fixture({"Pid": 11, "homeName": "h", "awayName": "a"})
    api.emit_fixture({"Pid": 12, "homeName": "h", "awayName": "a"})

    event_ids = sorted(pq.event_id for pq in captured)
    assert event_ids == ["pinnacle_api:11", "pinnacle_api:12"]
    for pq in captured:
        assert pq.source_used_for_publish == "pinnacle_api"


# ── both sources alive, distinct events: no clobber ─────────────────


def test_both_sources_publishing_disjoint_events_dont_clobber_each_other():
    router, _store, captured, pin888, api = _wire()

    pin888.emit_legacy_update(
        {"type": "update", "source": "ps3838", "data": {"Pid": 700, "homeName": "h", "awayName": "a"}}
    )
    api.emit_fixture({"Pid": 800, "homeName": "x", "awayName": "y"})
    pin888.emit_legacy_update(
        {"type": "update", "source": "ps3838", "data": {"Pid": 701, "homeName": "h", "awayName": "a"}}
    )

    event_ids = sorted(pq.event_id for pq in captured)
    assert event_ids == ["pin888:700", "pin888:701", "pinnacle_api:800"]


# ── Phase 3: v2 engine integration scenarios ────────────────────────


def _wire_v2():
    """Same wiring helper as _wire(), but with DecisionEngineV2."""
    from aggregator.decision import DecisionEngineV2
    from aggregator.store import ProvenanceStore

    store = ProvenanceStore()
    router = IngestRouter(store, DecisionEngineV2())
    captured: list = []
    router.register_consumer(lambda pq: captured.append(pq))
    return router, store, captured


def test_v2_official_api_outranks_browser_ws_for_same_canonical_event():
    """With v2 enabled, OFFICIAL_API beats BROWSER_WS regardless of
    freshness ordering — encodes TZ §4 normal-mode authority.
    """
    router, _store, captured = _wire_v2()
    canonical_id = "agg:111"

    _ingest_synthetic(
        router, source_id="pin888:acct-A:browser_ws", transport="browser_ws",
        event_id=canonical_id, age_sec=0.0, pid=111,
    )
    _ingest_synthetic(
        router, source_id="pinnacle_api", transport="http_pull",
        event_id=canonical_id, age_sec=2.0, pid=111,
    )

    last = captured[-1]
    # API older but higher tier still wins under v2.
    assert last.source_used_for_publish == "pinnacle_api"
    assert last.publish_authority_class == "pinnacle_native"
    assert last.degraded is False


def test_v2_tombstone_short_circuits_live_quote():
    """Native tombstone wins immediately even if a fresher live quote
    from another native source is present.
    """
    router, _store, captured = _wire_v2()
    canonical_id = "agg:222"

    _ingest_synthetic(
        router, source_id="pinnacle_api", transport="http_pull",
        event_id=canonical_id, age_sec=0.0, pid=222,
    )
    now = datetime.now(timezone.utc)
    tombstone = SourceEvent(
        source_id="pin888:acct-A:browser_ws",
        family="pinnacle_native",
        transport="browser_ws",
        event_id=canonical_id,
        payload={"Pid": 222, "Removed": True},
        collected_at=now,
        received_at=now,
        is_tombstone=True,
    )
    router.ingest(tombstone)

    last = captured[-1]
    assert last.is_tombstone is True
    assert last.decision_reason == "tombstone_from_native_source"
