"""Unit tests for `aggregator.sources.pin888_source.Pin888SourceAdapter`."""

from __future__ import annotations

from datetime import datetime, timezone

from aggregator.decision import DecisionEngine
from aggregator.ingest import IngestRouter
from aggregator.sources.pin888_source import Pin888SourceAdapter
from aggregator.store import ProvenanceStore


def _adapter() -> tuple[Pin888SourceAdapter, IngestRouter, ProvenanceStore]:
    store = ProvenanceStore()
    router = IngestRouter(store, DecisionEngine())
    return Pin888SourceAdapter(router), router, store


def test_build_event_uses_pid_for_event_id():
    adapter, _r, _s = _adapter()
    ev = adapter.build_event({"Pid": 12345, "homeName": "X", "awayName": "Y"})
    assert ev.event_id == "pin888:12345"
    assert ev.source_id == "pin888:acct-A:browser_ws"
    assert ev.family == "pinnacle_native"
    assert ev.transport == "browser_ws"
    assert ev.account_id == "pin888-acct-a"
    assert ev.is_tombstone is False


def test_build_event_detects_tombstone_via_removed():
    adapter, _r, _s = _adapter()
    ev = adapter.build_event({"Pid": 1, "Removed": True})
    assert ev.is_tombstone is True


def test_build_event_detects_tombstone_via_deleted():
    adapter, _r, _s = _adapter()
    ev = adapter.build_event({"Pid": 1, "Deleted": True})
    assert ev.is_tombstone is True


def test_build_event_uses_explicit_collected_at():
    adapter, _r, _s = _adapter()
    ts = datetime(2026, 4, 19, 15, 30, 0, tzinfo=timezone.utc)
    ev = adapter.build_event({"Pid": 1}, collected_at=ts)
    assert ev.collected_at == ts
    assert ev.received_at == ts


def test_from_legacy_update_round_trips_to_source_event():
    adapter, _r, _s = _adapter()
    env = {"type": "update", "source": "ps3838", "data": {"Pid": 99}, "stale": False}
    ev = adapter.from_legacy_update(env)
    assert ev is not None
    assert ev.event_id == "pin888:99"
    # Story 27.17 — build_event enriches payload с sport_id/starts_at/is_live
    # (defensive None/False когда исходный payload их не даёт).
    assert ev.payload["Pid"] == 99
    assert ev.payload.get("sport_id") is None
    assert ev.payload.get("starts_at") is None
    assert ev.payload.get("is_live") is False


def test_from_legacy_update_rejects_non_update():
    adapter, _r, _s = _adapter()
    assert adapter.from_legacy_update({"type": "init", "events": []}) is None
    assert adapter.from_legacy_update({"type": "update", "source": "other", "data": {}}) is None
    assert adapter.from_legacy_update({"type": "update", "source": "ps3838"}) is None
    assert adapter.from_legacy_update({"type": "update", "source": "ps3838", "data": "not-a-dict"}) is None
    assert adapter.from_legacy_update("not-a-dict") is None


def test_emit_legacy_update_pushes_into_router():
    adapter, router, store = _adapter()
    env = {"type": "update", "source": "ps3838", "data": {"Pid": 7}, "stale": False}
    adapter.emit_legacy_update(env)
    raws = list(store.iter_raw())
    assert len(raws) == 1
    assert raws[0].event_id == "pin888:7"
    assert len(list(store.iter_history())) == 1


def test_emit_legacy_update_swallows_router_errors(monkeypatch):
    adapter, router, _store = _adapter()

    def _boom(_ev):
        raise RuntimeError("router failed")

    monkeypatch.setattr(router, "ingest", _boom)
    # Must not raise.
    adapter.emit_legacy_update({"type": "update", "source": "ps3838", "data": {"Pid": 1}, "stale": False})


def test_emit_legacy_update_ignores_non_event_envelopes():
    adapter, _r, store = _adapter()
    adapter.emit_legacy_update({"type": "init", "events": []})
    adapter.emit_legacy_update({"type": "status", "status": "fresh"})
    assert list(store.iter_raw()) == []


def test_event_id_falls_back_when_pid_missing():
    adapter, _r, _s = _adapter()
    ev = adapter.build_event({"EventId": "abc"})
    assert ev is not None
    assert ev.event_id == "pin888:abc"


def test_build_event_returns_none_when_no_stable_id():
    """Issue 3: payloads with no Pid/EventId/id must NOT collapse to a
    single ``pin888:unknown`` bucket — they must be dropped."""
    adapter, _r, _s = _adapter()
    assert adapter.build_event({}) is None
    assert adapter.build_event({"homeName": "X"}) is None
    # empty-string Pid is also invalid
    assert adapter.build_event({"Pid": ""}) is None


def test_emit_legacy_update_drops_payload_with_no_pid_and_bumps_counter():
    """Dropped events must not flow into the router, and the module-
    level missing-pid counter must increment (so operators can detect
    upstream regressions without log spam)."""
    from aggregator.sources import pin888_source

    before = pin888_source.missing_pid_drop_count()
    adapter, _r, store = _adapter()
    env = {"type": "update", "source": "ps3838", "data": {"homeName": "X"}, "stale": False}
    adapter.emit_legacy_update(env)
    assert list(store.iter_raw()) == []
    assert list(store.iter_history()) == []
    assert pin888_source.missing_pid_drop_count() == before + 1


def test_from_legacy_update_returns_none_for_payload_with_no_pid():
    adapter, _r, _s = _adapter()
    env = {"type": "update", "source": "ps3838", "data": {"foo": "bar"}, "stale": False}
    assert adapter.from_legacy_update(env) is None
