"""Unit tests for `aggregator.ingest.IngestRouter`."""

from __future__ import annotations

from datetime import datetime, timezone

from aggregator.decision import DecisionEngine
from aggregator.ingest import IngestRouter, aggregator_enabled
from aggregator.store import ProvenanceStore
from aggregator.types import PublishedQuote, SourceEvent


def _ev(event_id: str = "pin888:1", *, is_tombstone: bool = False) -> SourceEvent:
    now = datetime.now(timezone.utc)
    return SourceEvent(
        source_id="pin888:acct-A:browser_ws",
        family="pinnacle_native",
        transport="browser_ws",
        event_id=event_id,
        payload={"Pid": event_id, "stale": False},
        collected_at=now,
        received_at=now,
        is_tombstone=is_tombstone,
    )


def _router() -> IngestRouter:
    return IngestRouter(ProvenanceStore(), DecisionEngine())


def test_ingest_returns_published_quote():
    router = _router()
    pq = router.ingest(_ev())
    assert isinstance(pq, PublishedQuote)
    assert pq.event_id == "pin888:1"
    assert pq.source_used_for_publish == "pin888:acct-A:browser_ws"


def test_ingest_records_in_all_layers():
    store = ProvenanceStore()
    router = IngestRouter(store, DecisionEngine())
    router.ingest(_ev("pin888:1"))
    assert len(list(store.iter_raw())) == 1
    assert store.get_normalized("pin888:acct-A:browser_ws", "pin888:1") is not None
    assert len(store.get_candidates("pin888:1")) == 1
    assert len(list(store.iter_history())) == 1


def test_consumer_callback_fired():
    seen: list[PublishedQuote] = []
    router = _router()
    router.register_consumer(seen.append)
    router.ingest(_ev())
    assert len(seen) == 1


def test_consumer_exception_does_not_break_pipeline():
    router = _router()

    def boom(_pq):
        raise RuntimeError("downstream blew up")

    router.register_consumer(boom)
    pq = router.ingest(_ev())
    assert pq is not None  # ingest still completed


def test_normalize_callback_invoked():
    def upper_normalize(ev: SourceEvent) -> dict:
        return {**ev.payload, "normalized_by": "test"}

    store = ProvenanceStore()
    router = IngestRouter(store, DecisionEngine(), normalize=upper_normalize)
    pq = router.ingest(_ev())
    assert pq is not None
    assert pq.payload["normalized_by"] == "test"
    saved = store.get_normalized("pin888:acct-A:browser_ws", "pin888:1")
    assert saved == {"Pid": "pin888:1", "stale": False, "normalized_by": "test"}


def test_tombstone_drops_candidate_after_publish():
    store = ProvenanceStore()
    router = IngestRouter(store, DecisionEngine())
    router.ingest(_ev("pin888:1"))
    assert store.get_candidates("pin888:1") != []
    pq = router.ingest(_ev("pin888:1", is_tombstone=True))
    assert pq is not None
    assert pq.is_tombstone is True
    assert store.get_candidates("pin888:1") == []


def _ev_from(source_id: str, event_id: str = "pin888:1", *, is_tombstone: bool = False) -> SourceEvent:
    now = datetime.now(timezone.utc)
    return SourceEvent(
        source_id=source_id,
        family="pinnacle_native",
        transport="browser_ws",
        event_id=event_id,
        payload={"Pid": event_id, "Removed": is_tombstone},
        collected_at=now,
        received_at=now,
        is_tombstone=is_tombstone,
    )


def test_tombstone_retracts_other_source_candidates():
    """Issue 4: a tombstone publish must drop *all* candidates for the
    event_id (not just the emitting source's). Otherwise a surviving
    live candidate from source B would be re-elected on the next ingest
    and "un-tombstone" the event."""
    store = ProvenanceStore()
    router = IngestRouter(store, DecisionEngine())

    captured: list[PublishedQuote] = []
    router.register_consumer(captured.append)

    # Source B publishes a live update first.
    router.ingest(_ev_from("src-B", "pin888:42"))
    # Source A then publishes a tombstone.
    pq = router.ingest(_ev_from("src-A", "pin888:42", is_tombstone=True))
    assert pq is not None
    assert pq.is_tombstone is True

    # Candidate bucket for the event must be empty: the live src-B
    # candidate must NOT survive the tombstone publish.
    assert store.get_candidates("pin888:42") == []

    # And the LAST emitted PublishedQuote must remain a tombstone — no
    # un-tombstoning by an immediate stale republish.
    assert captured[-1].is_tombstone is True


def test_provenance_consumer_mutation_does_not_rewrite_raw():
    """Issue 5 (Option A): consumer mutation must NOT propagate back
    into the raw provenance layer. The store deep-copies on entry and
    ingest deep-copies again on fan-out, so each layer is independent.
    """
    store = ProvenanceStore()
    router = IngestRouter(store, DecisionEngine())
    captured: list[PublishedQuote] = []
    router.register_consumer(captured.append)

    ev = _ev("pin888:7")
    router.ingest(ev)

    # Consumer mutates the payload it received.
    captured[0].payload["mutated_by_consumer"] = True
    captured[0].payload["Pid"] = "TAMPERED"

    raws = list(store.iter_raw())
    assert len(raws) == 1
    assert "mutated_by_consumer" not in raws[0].payload
    assert raws[0].payload["Pid"] == "pin888:7"


def test_aggregator_enabled_default_off(monkeypatch):
    monkeypatch.delenv("MSP_AGGREGATOR_ENABLED", raising=False)
    assert aggregator_enabled() is False


def test_aggregator_enabled_when_set(monkeypatch):
    monkeypatch.setenv("MSP_AGGREGATOR_ENABLED", "1")
    assert aggregator_enabled() is True
    monkeypatch.setenv("MSP_AGGREGATOR_ENABLED", "true")
    assert aggregator_enabled() is True
    monkeypatch.setenv("MSP_AGGREGATOR_ENABLED", "no")
    assert aggregator_enabled() is False


# ── Fix 4 (Option A): per-consumer payload isolation ──────────────────


def test_consumer_fanout_each_consumer_gets_independent_payload():
    """One consumer mutating its payload must not affect any other
    consumer's payload (Option A — N×deepcopy in fan-out).
    """
    store = ProvenanceStore()
    router = IngestRouter(store, DecisionEngine())
    captured_a: list[PublishedQuote] = []
    captured_b: list[PublishedQuote] = []
    router.register_consumer(captured_a.append)
    router.register_consumer(captured_b.append)

    router.ingest(_ev("pin888:99"))

    # Consumer A and B must each have their own dict instance.
    assert captured_a[0].payload is not captured_b[0].payload

    # Mutation in A is invisible to B.
    captured_a[0].payload["mutated_by_a"] = True
    assert "mutated_by_a" not in captured_b[0].payload
    # And invisible to the raw audit layer.
    raws = list(store.iter_raw())
    assert "mutated_by_a" not in raws[0].payload
