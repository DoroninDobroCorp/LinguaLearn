"""Phase 3 sqlite-mirror tests for ``aggregator.store.ProvenanceStore``.

Covers:
- opt-in via constructor + env var
- batched commit (size + dwell)
- queue overflow drops oldest + bumps counter
- query helpers (last_published / candidate_history / decision_trace)
- sqlite write failure does NOT propagate
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

from aggregator.store import (
    DEFAULT_BATCH_MAX_AGE_MS,
    ProvenanceStore,
)
from aggregator.types import CandidateQuote, PublishedQuote, SourceEvent


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ev(event_id: str = "agg:1", source_id: str = "pin888:A") -> SourceEvent:
    n = _now()
    return SourceEvent(
        source_id=source_id,
        family="pinnacle_native",
        transport="browser_ws",
        event_id=event_id,
        payload={"Pid": 1},
        collected_at=n,
        received_at=n,
    )


def _cand(event_id: str = "agg:1", source_id: str = "pin888:A", *, age_sec: float = 0.0) -> CandidateQuote:
    n = _now() - timedelta(seconds=age_sec)
    return CandidateQuote(
        source_id=source_id,
        family="pinnacle_native",
        transport="browser_ws",
        event_id=event_id,
        payload={"Pid": 1},
        collected_at=n,
        received_at=n,
    )


def _pub(event_id: str = "agg:1", source_used: str = "pin888:A", *, reason: str = "test") -> PublishedQuote:
    return PublishedQuote(
        event_id=event_id,
        payload={"Pid": 1},
        source_used_for_publish=source_used,
        decision_reason=reason,
    )


# ── opt-in (constructor + env) ────────────────────────────────────────


def test_sqlite_off_by_default(monkeypatch):
    monkeypatch.delenv("MSP_STORE_SQLITE_PATH", raising=False)
    s = ProvenanceStore()
    assert s._sqlite is None  # noqa: SLF001
    s.close()


def test_sqlite_constructor_opt_in(tmp_path):
    db = tmp_path / "prov.sqlite"
    s = ProvenanceStore(sqlite_path=str(db))
    assert s._sqlite is not None  # noqa: SLF001
    s.close()
    assert db.exists()


def test_sqlite_env_opt_in(tmp_path, monkeypatch):
    db = tmp_path / "envprov.sqlite"
    monkeypatch.setenv("MSP_STORE_SQLITE_PATH", str(db))
    s = ProvenanceStore()
    assert s._sqlite is not None  # noqa: SLF001
    s.close()
    assert db.exists()


# ── tables created with WAL + indices ─────────────────────────────────


def test_all_phase3_tables_exist(tmp_path):
    db = tmp_path / "schema.sqlite"
    s = ProvenanceStore(sqlite_path=str(db))
    s.close()
    con = sqlite3.connect(str(db))
    rows = con.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).fetchall()
    names = {r[0] for r in rows}
    con.close()
    assert {
        "raw_events",
        "normalized_events",
        "candidate_quotes",
        "published_quotes",
        "decision_history",
    } <= names


# ── batching (size threshold) ─────────────────────────────────────────


def test_batch_commits_when_size_reached(tmp_path):
    db = tmp_path / "batch.sqlite"
    s = ProvenanceStore(sqlite_path=str(db), sqlite_batch_size=4, sqlite_batch_max_age_ms=60_000)
    # 3 record_raw calls → not yet flushed
    for i in range(3):
        s.record_raw(_ev(event_id=f"agg:{i}"))
    assert s.counters.flushed_rows == 0
    # 4th triggers flush
    s.record_raw(_ev(event_id="agg:3"))
    assert s.counters.flushed_rows == 4
    assert s.counters.flush_count == 1
    s.close()


def test_explicit_flush_drains_queue(tmp_path):
    db = tmp_path / "flush.sqlite"
    s = ProvenanceStore(sqlite_path=str(db), sqlite_batch_size=100, sqlite_batch_max_age_ms=60_000)
    s.record_raw(_ev())
    s.record_raw(_ev(event_id="agg:2"))
    assert s.counters.flushed_rows == 0
    n = s.flush_sqlite()
    assert n == 2
    assert s.counters.flushed_rows == 2
    s.close()


# ── overflow drops oldest + counter ───────────────────────────────────


def test_queue_overflow_drops_oldest_and_bumps_counter(tmp_path):
    db = tmp_path / "overflow.sqlite"
    # Tiny cap so we can overflow easily; large batch so flush doesn't
    # auto-drain mid-test.
    s = ProvenanceStore(
        sqlite_path=str(db),
        sqlite_batch_size=1000,
        sqlite_batch_max_age_ms=60_000,
        sqlite_queue_cap=5,
    )
    for i in range(20):
        s.record_raw(_ev(event_id=f"agg:{i}"))
    # 20 enqueued, cap=5 → 15 dropped from the front.
    assert s.counters.dropped_overflow_count == 15
    n = s.flush_sqlite()
    assert n == 5
    s.close()


# ── sqlite failure does not propagate ─────────────────────────────────


def test_sqlite_write_failure_is_swallowed(tmp_path):
    db = tmp_path / "fail.sqlite"
    s = ProvenanceStore(sqlite_path=str(db), sqlite_batch_size=1)
    # Close the connection out from under the store to force a failure
    # on the next flush.
    assert s._sqlite is not None  # noqa: SLF001
    s._sqlite.close()  # noqa: SLF001 — deliberate sabotage
    # Replace with a closed connection to keep the attribute non-None
    # but unusable.
    closed = sqlite3.connect(":memory:")
    closed.close()
    s._sqlite = closed  # noqa: SLF001
    # This must NOT raise even though the connection is dead.
    s.record_raw(_ev())  # batch_size=1 triggers immediate flush
    assert s.counters.sqlite_error_count >= 1
    s.close()


# ── query helpers ────────────────────────────────────────────────────


def test_last_published_returns_most_recent_for_event_id():
    s = ProvenanceStore()
    s.append_history(_pub(event_id="agg:1", reason="r1"))
    s.append_history(_pub(event_id="agg:2", reason="other"))
    s.append_history(_pub(event_id="agg:1", reason="r2"))
    last = s.last_published("agg:1")
    assert last is not None
    assert last.decision_reason == "r2"
    assert s.last_published("nonexistent") is None


def test_candidate_history_records_observations():
    s = ProvenanceStore()
    s.upsert_candidate(_cand(age_sec=2.0))
    s.upsert_candidate(_cand(age_sec=1.0))
    s.upsert_candidate(_cand(age_sec=0.0))
    hist = s.candidate_history("agg:1")
    assert len(hist) == 3
    # Oldest first.
    assert hist[0].collected_at <= hist[-1].collected_at


def test_candidate_history_since_filter():
    s = ProvenanceStore()
    s.upsert_candidate(_cand(age_sec=10.0))
    s.upsert_candidate(_cand(age_sec=0.0))
    cutoff = _now() - timedelta(seconds=5.0)
    hist = s.candidate_history("agg:1", since=cutoff)
    assert len(hist) == 1


def test_decision_trace_returns_last_n():
    s = ProvenanceStore()
    for i in range(5):
        s.append_history(_pub(event_id="agg:1", reason=f"r{i}"))
    trace = s.decision_trace("agg:1", last_n=3)
    assert [pq.decision_reason for pq in trace] == ["r2", "r3", "r4"]
    assert s.decision_trace("agg:1", last_n=0) == []


# ── batched writes appear in sqlite after flush ───────────────────────


def test_published_quote_persists_with_full_provenance(tmp_path):
    db = tmp_path / "pub.sqlite"
    s = ProvenanceStore(sqlite_path=str(db), sqlite_batch_size=1)
    s.append_history(
        PublishedQuote(
            event_id="agg:42",
            payload={"Pid": 42},
            source_used_for_publish="pinnacle_api",
            publish_authority_class="pinnacle_native",
            decision_reason="fresh_native_official_api_preferred_base_market",
            degraded=False,
            fallback_state=None,
            freshness_ms=125,
        )
    )
    rows = s.sqlite_query(
        "SELECT event_id, source_used, decision_reason, degraded, freshness_ms "
        "FROM published_quotes WHERE event_id = ?",
        ("agg:42",),
    )
    assert len(rows) == 1
    assert rows[0][0] == "agg:42"
    assert rows[0][1] == "pinnacle_api"
    assert rows[0][3] == 0
    assert rows[0][4] == 125
    # decision_history was also written.
    drows = s.sqlite_query(
        "SELECT event_id FROM decision_history WHERE event_id = ?", ("agg:42",)
    )
    assert len(drows) == 1
    s.close()


def test_max_age_dwell_constant_exposed():
    """Sanity — DEFAULT_BATCH_MAX_AGE_MS exported for ops tuning."""
    assert DEFAULT_BATCH_MAX_AGE_MS > 0


def test_sqlite_retention_prunes_old_rows_from_every_table(tmp_path):
    db = tmp_path / "retention.sqlite"
    s = ProvenanceStore(
        sqlite_path=str(db),
        sqlite_retention_sec=3600,
        sqlite_prune_interval_sec=3600,
        sqlite_prune_batch=100,
    )
    assert s._sqlite is not None  # noqa: SLF001
    now = datetime(2026, 8, 9, 12, 0, tzinfo=timezone.utc)
    old = (now - timedelta(hours=2)).isoformat()
    fresh = (now - timedelta(minutes=10)).isoformat()
    con = s._sqlite  # noqa: SLF001
    con.execute(
        "INSERT INTO raw_events(source_id,event_id,collected_at,received_at,is_tombstone) "
        "VALUES ('s','old',?,?,0),('s','fresh',?,?,0)",
        (old, old, fresh, fresh),
    )
    con.execute(
        "INSERT INTO normalized_events(source_id,event_id,observed_at) "
        "VALUES ('s','old',?),('s','fresh',?)",
        (old, fresh),
    )
    con.execute(
        "INSERT INTO candidate_quotes(event_id,source_id,collected_at) "
        "VALUES ('old','s',?),('fresh','s',?)",
        (old, fresh),
    )
    con.execute(
        "INSERT INTO published_quotes(event_id,source_used,collected_at) "
        "VALUES ('old','s',?),('fresh','s',?)",
        (old, fresh),
    )
    con.execute(
        "INSERT INTO decision_history(event_id,source_used,recorded_at) "
        "VALUES ('old','s',?),('fresh','s',?)",
        (old, fresh),
    )
    con.commit()

    assert s.prune_sqlite(now=now) == 5
    for table in (
        "raw_events",
        "normalized_events",
        "candidate_quotes",
        "published_quotes",
        "decision_history",
    ):
        event_ids = [row[0] for row in con.execute(f"SELECT event_id FROM {table}")]
        assert event_ids == ["fresh"]
    assert s.counters.sqlite_pruned_rows == 5
    assert s.counters.sqlite_prune_count == 1
    assert s.counters.sqlite_prune_error_count == 0
    s.close()


# ── Fix 1: construction must never crash on unwritable sqlite path ──


def test_sqlite_init_failure_does_not_propagate(tmp_path):
    """Unwritable / nonexistent sqlite path must NOT raise from
    ``ProvenanceStore.__init__``. The store must silently degrade to
    in-memory-only operation, bump ``sqlite_error_count``, and ingest
    must keep working via the in-memory primary.
    """
    bad_path = "/nonexistent_dir_xyz_msp/foo.sqlite"
    # (a) construction must not raise
    s = ProvenanceStore(sqlite_path=bad_path)
    # (b) the connection must be None
    assert s._sqlite is None  # noqa: SLF001
    # (d) the error counter must have been bumped
    assert s.counters.sqlite_error_count >= 1

    # (c) ingest layer continues to work via in-memory primary —
    # record_raw / upsert_candidate / append_history must not raise
    # and must remain queryable in-memory.
    s.record_raw(_ev("agg:99"))
    s.upsert_candidate(_cand("agg:99"))
    s.append_history(_pub("agg:99"))
    assert s.last_published("agg:99") is not None
    assert s.get_candidates("agg:99") != []

    # flush_sqlite must be a no-op when the connection is None.
    assert s.flush_sqlite() == 0
    # sqlite_query must safely return [] when disabled.
    assert s.sqlite_query("SELECT 1") == []
    s.close()


def test_sqlite_init_failure_on_corrupt_file(tmp_path):
    """A non-sqlite file at the path must also degrade gracefully."""
    bogus = tmp_path / "not_a_db.sqlite"
    bogus.write_bytes(b"this is definitely not a sqlite database file")
    s = ProvenanceStore(sqlite_path=str(bogus))
    # Either connect succeeds and PRAGMA/CREATE fails, or both fail —
    # in every case ``__init__`` must not raise and the store must end
    # up with ``_sqlite = None`` and the error counter bumped.
    assert s._sqlite is None  # noqa: SLF001
    assert s.counters.sqlite_error_count >= 1
    s.close()
