from __future__ import annotations

from datetime import datetime, timezone

import pytest

from aggregator.decision import DecisionEngine
from aggregator import identity as identity_mod
from aggregator.identity import shared_pid_event_id
from aggregator.ingest import IngestRouter
from aggregator.store import ProvenanceStore
from aggregator.types import SourceEvent


@pytest.fixture(autouse=True)
def _reset_identity_cache():
    """Reset the cached flag before each test."""
    identity_mod._shared_pid_enabled_cached = None
    yield
    identity_mod._shared_pid_enabled_cached = None


def _utc() -> datetime:
    return datetime.now(timezone.utc)


def test_shared_pid_event_id_disabled_by_default(monkeypatch):
    monkeypatch.delenv("MSP_SHARED_PID_EVENT_ID_ENABLED", raising=False)
    event = SourceEvent(
        source_id="pin888:acct-A:browser_ws",
        family="pinnacle_native",
        transport="browser_ws",
        event_id="pin888:123",
        payload={"Pid": 123},
        collected_at=_utc(),
        received_at=_utc(),
    )

    assert shared_pid_event_id(event, event.payload) == "pin888:123"


def test_shared_pid_event_id_collapses_pinnacle_native_sources(monkeypatch):
    monkeypatch.setenv("MSP_SHARED_PID_EVENT_ID_ENABLED", "1")
    store = ProvenanceStore()
    router = IngestRouter(
        store=store,
        decision=DecisionEngine(),
        event_id_resolver=shared_pid_event_id,
    )

    now = _utc()
    events = [
        SourceEvent(
            source_id="pin888:acct-A:browser_ws",
            family="pinnacle_native",
            transport="browser_ws",
            event_id="pin888:321",
            payload={"Pid": 321, "homeName": "a", "awayName": "b"},
            collected_at=now,
            received_at=now,
        ),
        SourceEvent(
            source_id="ps3838:fleet:acct-B:29",
            family="pinnacle_native",
            transport="browser_ws",
            event_id="ps3838:321",
            payload={"Pid": 321, "homeName": "a", "awayName": "b"},
            collected_at=now,
            received_at=now,
        ),
        SourceEvent(
            source_id="piwi247:acct-X:browser_ws",
            family="pv247",
            transport="browser_ws",
            event_id="piwi247:321",
            payload={"Pid": 321, "homeName": "a", "awayName": "b"},
            collected_at=now,
            received_at=now,
        ),
        SourceEvent(
            source_id="pinnacle_api",
            family="pinnacle_native",
            transport="http_pull",
            event_id="pinnacle_api:321",
            payload={"Pid": 321, "homeName": "a", "awayName": "b"},
            collected_at=now,
            received_at=now,
        ),
    ]

    for event in events:
        router.ingest(event)

    candidates = store.get_candidates("agg:pid:321")
    assert len(candidates) == 4
    assert {candidate.source_id for candidate in candidates} == {
        "pin888:acct-A:browser_ws",
        "ps3838:fleet:acct-B:29",
        "piwi247:acct-X:browser_ws",
        "pinnacle_api",
    }


def test_shared_pid_event_id_collapses_piwi247(monkeypatch):
    monkeypatch.setenv("MSP_SHARED_PID_EVENT_ID_ENABLED", "1")
    event = SourceEvent(
        source_id="piwi247:acct-X:browser_ws",
        family="pv247",
        transport="browser_ws",
        event_id="piwi247:123",
        payload={"Pid": 123},
        collected_at=_utc(),
        received_at=_utc(),
    )

    assert shared_pid_event_id(event, event.payload) == "agg:pid:123"
