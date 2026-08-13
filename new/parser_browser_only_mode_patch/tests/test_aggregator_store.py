"""Unit tests for `aggregator.store.ProvenanceStore`."""

from __future__ import annotations

import os
from datetime import datetime, timezone

import pytest

from aggregator.decision import DecisionEngine  # noqa: F401 — reused indirectly
from aggregator.store import ProvenanceStore
from aggregator.types import CandidateQuote, PublishedQuote, SourceEvent


def _ev(source_id: str = "pin888:A", event_id: str = "pin888:1"):
    now = datetime.now(timezone.utc)
    return SourceEvent(
        source_id=source_id,
        family="pinnacle_native",
        transport="browser_ws",
        event_id=event_id,
        payload={"Pid": event_id},
        collected_at=now,
        received_at=now,
    )


def _cand(source_id: str, event_id: str = "pin888:1") -> CandidateQuote:
    return CandidateQuote.from_source_event(_ev(source_id, event_id))


def test_record_raw_ring_buffer():
    s = ProvenanceStore(raw_ring=3)
    for i in range(5):
        s.record_raw(_ev(event_id=f"pin888:{i}"))
    raws = list(s.iter_raw())
    assert len(raws) == 3
    assert [r.event_id for r in raws] == ["pin888:2", "pin888:3", "pin888:4"]


def test_normalized_upsert_get_roundtrip():
    s = ProvenanceStore()
    s.upsert_normalized("pin888:A", "pin888:1", {"Pid": 1, "x": 2})
    assert s.get_normalized("pin888:A", "pin888:1") == {"Pid": 1, "x": 2}
    assert s.get_normalized("pin888:A", "pin888:missing") is None


def test_candidate_upsert_replaces_per_source():
    s = ProvenanceStore()
    s.upsert_candidate(_cand("pin888:A"))
    s.upsert_candidate(_cand("pin888:B"))
    cands = s.get_candidates("pin888:1")
    assert {c.source_id for c in cands} == {"pin888:A", "pin888:B"}

    # Re-upserting same source replaces:
    s.upsert_candidate(_cand("pin888:A"))
    cands = s.get_candidates("pin888:1")
    assert len(cands) == 2


def test_candidate_remove_and_list():
    s = ProvenanceStore()
    s.upsert_candidate(_cand("pin888:A", "pin888:1"))
    s.upsert_candidate(_cand("pin888:A", "pin888:2"))
    assert set(s.list_event_ids()) == {"pin888:1", "pin888:2"}
    s.remove_candidate("pin888:1", "pin888:A")
    assert set(s.list_event_ids()) == {"pin888:2"}


def test_history_append_iter():
    s = ProvenanceStore()
    pq = PublishedQuote(
        event_id="pin888:1",
        payload={"Pid": 1},
        source_used_for_publish="pin888:A",
    )
    s.append_history(pq)
    assert list(s.iter_history()) == [pq]


def test_sqlite_optional_backend(tmp_path):
    db = tmp_path / "prov.sqlite"
    s = ProvenanceStore(sqlite_path=str(db))
    s.record_raw(_ev())
    s.append_history(
        PublishedQuote(
            event_id="pin888:1",
            payload={"Pid": 1},
            source_used_for_publish="pin888:A",
        )
    )
    s.close()
    # Reopen and confirm rows persisted
    import sqlite3
    con = sqlite3.connect(str(db))
    raw_rows = con.execute("SELECT event_id FROM raw_events").fetchall()
    hist_rows = con.execute("SELECT event_id FROM published_quotes").fetchall()
    con.close()
    assert raw_rows == [("pin888:1",)]
    assert hist_rows == [("pin888:1",)]


def test_env_sqlite_path(monkeypatch, tmp_path):
    db = tmp_path / "envprov.sqlite"
    monkeypatch.setenv("MSP_STORE_SQLITE_PATH", str(db))
    s = ProvenanceStore()
    assert s._sqlite is not None  # noqa: SLF001 — internal field intentionally checked
    s.close()
    assert os.path.exists(db)


def test_get_candidates_returns_copy_not_internal_dict():
    s = ProvenanceStore()
    s.upsert_candidate(_cand("pin888:A"))
    cands = s.get_candidates("pin888:1")
    cands.clear()
    # internal still has it
    assert s.get_candidates("pin888:1") != []


@pytest.mark.parametrize("missing", ["pin888:9999", ""])
def test_get_candidates_missing_returns_empty(missing):
    s = ProvenanceStore()
    assert s.get_candidates(missing) == []
