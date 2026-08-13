"""Provenance store for the multi-source aggregator.

Layered storage as per TZ §8:

- raw      — immutable ring buffer of every `SourceEvent` accepted;
- normalized — last normalized payload per (source_id, event_id);
- candidate — currently-relevant `CandidateQuote`s per event_id, keyed
  by source_id;
- history  — append-only log of `PublishedQuote`s.

**Provenance ownership semantics (Phase 1 — Option A: deep-copy on
entry).** ``record_raw`` deep-copies the incoming ``SourceEvent.payload``
before storing it, so consumer mutation of *any* downstream layer
(normalized, candidate, published) cannot retroactively rewrite the raw
provenance entry. Downstream layers (candidate / published) receive
their own copy on fan-out (see ``aggregator.ingest``). This trades a
small amount of CPU/RSS for hard isolation of the audit trail required
by TZ §8.

Phase 3 — durable sqlite mirror
------------------------------

Optional. Enabled only when ``MSP_STORE_SQLITE_PATH`` is set in env
(or passed explicitly to the constructor). Off by default; nothing
under :mod:`aggregator.store` opens a file at import time.

Design:

- single ``sqlite3.Connection`` opened with ``check_same_thread=False``
  and configured for WAL + ``synchronous=NORMAL``;
- writes are queued in-memory (bounded), flushed in a single
  transaction on a configurable batch size or maximum dwell time;
- if the queue overflows the cap, oldest entries are dropped and a
  counter (``dropped_overflow_count``) is bumped — the in-memory
  primary store is unaffected;
- if any sqlite write raises, we log+counter (``sqlite_error_count``)
  and never propagate the exception up the ingest path (TZ §8 — the
  audit layer must never break ingest);
- Tables: ``raw_events``, ``normalized_events``, ``candidate_quotes``,
  ``published_quotes``, ``decision_history`` — indexed by
  ``event_id``, ``source_id``, timestamp.

Query helpers (``last_published``, ``candidate_history``,
``decision_trace``) read from the in-memory primary; sqlite is the
durable secondary used for cold-store / parity.
"""

from __future__ import annotations

import copy
import dataclasses
import logging
import os
import sqlite3
import threading
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Iterator, Optional

from aggregator.types import CandidateQuote, PublishedQuote, SourceEvent

DEFAULT_RAW_RING = 5000
DEFAULT_HISTORY_RING = 5000

DEFAULT_BATCH_SIZE = 64
DEFAULT_BATCH_MAX_AGE_MS = 250
DEFAULT_QUEUE_CAP = 2000
DEFAULT_SQLITE_RETENTION_SEC = 7 * 24 * 60 * 60
DEFAULT_SQLITE_PRUNE_INTERVAL_SEC = 60 * 60
DEFAULT_SQLITE_PRUNE_BATCH = 100_000

_SQLITE_RETENTION_TABLES = (
    ("raw_events", "collected_at"),
    ("normalized_events", "observed_at"),
    ("candidate_quotes", "collected_at"),
    ("published_quotes", "collected_at"),
    ("decision_history", "recorded_at"),
)

logger = logging.getLogger(__name__)


def _env_int_default(name: str, default: int) -> int:
    raw = os.environ.get(name)
    try:
        value = int(raw) if raw is not None else default
    except (TypeError, ValueError):
        return default
    if value < 0:
        return default
    return value


@dataclass
class _SqliteCounters:
    flushed_rows: int = 0
    flush_count: int = 0
    dropped_overflow_count: int = 0
    sqlite_error_count: int = 0
    sqlite_pruned_rows: int = 0
    sqlite_prune_count: int = 0
    sqlite_prune_error_count: int = 0


@dataclass
class _PendingWrite:
    table: str
    sql: str
    params: tuple


class ProvenanceStore:
    """In-memory provenance store with optional batched sqlite mirror.

    All public methods are thread-safe via an internal lock; the
    aggregator may run in a single asyncio task today, but the contract
    must allow shadow-mode read access from diagnostic endpoints.
    """

    def __init__(
        self,
        *,
        raw_ring: int = DEFAULT_RAW_RING,
        history_ring: int = DEFAULT_HISTORY_RING,
        sqlite_path: str | None = None,
        sqlite_batch_size: int = DEFAULT_BATCH_SIZE,
        sqlite_batch_max_age_ms: int = DEFAULT_BATCH_MAX_AGE_MS,
        sqlite_queue_cap: int = DEFAULT_QUEUE_CAP,
        sqlite_retention_sec: int | None = None,
        sqlite_prune_interval_sec: int | None = None,
        sqlite_prune_batch: int | None = None,
    ) -> None:
        self._lock = threading.Lock()
        self._raw: deque[SourceEvent] = deque(maxlen=raw_ring)
        self._normalized: dict[tuple[str, str], dict] = {}
        self._last_update_ts: dict[str, float] = {}
        # candidate[event_id][source_id] = CandidateQuote
        self._candidate: dict[str, dict[str, CandidateQuote]] = {}
        self._history: deque[PublishedQuote] = deque(maxlen=history_ring)
        # Per-event candidate observations (sliding ring) for the
        # ``candidate_history()`` helper — bounded so it cannot bloat.
        self._candidate_log: dict[str, deque[CandidateQuote]] = {}
        self._candidate_log_per_event = _env_int_default(
            "MSP_CANDIDATE_LOG_PER_EVENT",
            20,
        )

        # ── sqlite ────────────────────────────────────────────────────
        self._sqlite_path = sqlite_path or os.environ.get("MSP_STORE_SQLITE_PATH") or None
        self._sqlite: sqlite3.Connection | None = None
        self._sqlite_batch_size = max(1, int(sqlite_batch_size))
        self._sqlite_batch_max_age_ms = max(1, int(sqlite_batch_max_age_ms))
        self._sqlite_queue_cap = max(1, int(sqlite_queue_cap))
        self._sqlite_queue: deque[_PendingWrite] = deque()
        self._sqlite_queue_first_enqueue_at: float | None = None
        self._sqlite_lock = threading.Lock()
        self.counters = _SqliteCounters()
        provenance_ttl = _env_int_default(
            "MSP_PROVENANCE_TTL_SEC", DEFAULT_SQLITE_RETENTION_SEC
        )
        self._sqlite_retention_sec = max(
            0,
            int(
                sqlite_retention_sec
                if sqlite_retention_sec is not None
                else _env_int_default("MSP_STORE_SQLITE_RETENTION_SEC", provenance_ttl)
            ),
        )
        self._sqlite_prune_interval_sec = max(
            0,
            int(
                sqlite_prune_interval_sec
                if sqlite_prune_interval_sec is not None
                else _env_int_default(
                    "MSP_STORE_SQLITE_PRUNE_INTERVAL_SEC",
                    DEFAULT_SQLITE_PRUNE_INTERVAL_SEC,
                )
            ),
        )
        self._sqlite_prune_batch = max(
            1,
            int(
                sqlite_prune_batch
                if sqlite_prune_batch is not None
                else _env_int_default(
                    "MSP_STORE_SQLITE_PRUNE_BATCH", DEFAULT_SQLITE_PRUNE_BATCH
                )
            ),
        )
        self._sqlite_last_prune_monotonic = time.monotonic()

        if self._sqlite_path:
            try:
                self._sqlite = sqlite3.connect(
                    self._sqlite_path, check_same_thread=False
                )
                self._init_sqlite()
            except Exception as exc:  # noqa: BLE001 — audit must not break ingest
                # Construction must never propagate sqlite failures
                # (TZ §8: durable mirror is opt-in/best-effort; the
                # in-memory primary store remains fully functional).
                self.counters.sqlite_error_count += 1
                logger.warning(
                    "sqlite init failed for %r: %s — durable mirror disabled",
                    self._sqlite_path,
                    exc,
                )
                if self._sqlite is not None:
                    try:
                        self._sqlite.close()
                    except Exception:  # noqa: BLE001
                        pass
                self._sqlite = None

    # ── raw ────────────────────────────────────────────────────────────

    def record_raw(self, event: SourceEvent) -> None:
        """Store an immutable copy of ``event`` in the raw layer.

        The payload is deep-copied so downstream mutation cannot rewrite
        the provenance record (Option A in module docstring). The
        ``SourceEvent`` itself is rebuilt via ``dataclasses.replace`` to
        preserve all other fields.
        """
        snapshot = dataclasses.replace(event, payload=copy.deepcopy(event.payload))
        with self._lock:
            self._raw.append(snapshot)
        if self._sqlite is not None:
            self._enqueue_sqlite(
                "raw_events",
                "INSERT INTO raw_events(source_id, event_id, collected_at, "
                "received_at, is_tombstone) VALUES (?, ?, ?, ?, ?)",
                (
                    event.source_id,
                    event.event_id,
                    event.collected_at.isoformat(),
                    event.received_at.isoformat(),
                    int(event.is_tombstone),
                ),
            )

    def iter_raw(self) -> Iterator[SourceEvent]:
        with self._lock:
            return iter(list(self._raw))

    # ── normalized ─────────────────────────────────────────────────────

    def upsert_normalized(self, source_id: str, event_id: str, payload: dict) -> None:
        with self._lock:
            self._normalized[(source_id, event_id)] = payload
            self._last_update_ts[event_id] = time.time()
        if self._sqlite is not None:
            self._enqueue_sqlite(
                "normalized_events",
                "INSERT INTO normalized_events(source_id, event_id, observed_at) "
                "VALUES (?, ?, ?)",
                (source_id, event_id, _utcnow_iso()),
            )

    def get_normalized(self, source_id: str, event_id: str) -> dict | None:
        with self._lock:
            return self._normalized.get((source_id, event_id))

    # ── candidate ──────────────────────────────────────────────────────

    def upsert_candidate(self, candidate: CandidateQuote) -> None:
        with self._lock:
            bucket = self._candidate.setdefault(candidate.event_id, {})
            bucket[candidate.source_id] = candidate
            self._last_update_ts[candidate.event_id] = time.time()
            log = self._candidate_log.setdefault(
                candidate.event_id,
                deque(maxlen=self._candidate_log_per_event),
            )
            log.append(candidate)
        if self._sqlite is not None:
            self._enqueue_sqlite(
                "candidate_quotes",
                "INSERT INTO candidate_quotes(event_id, source_id, family, "
                "transport, collected_at, is_tombstone, confidence) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    candidate.event_id,
                    candidate.source_id,
                    candidate.family,
                    candidate.transport,
                    candidate.collected_at.isoformat(),
                    int(candidate.is_tombstone),
                    float(candidate.confidence),
                ),
            )

    def refresh_candidate_timestamp(
        self,
        source_id: str,
        event_id: str,
        *,
        collected_at: datetime,
        received_at: datetime,
    ) -> bool:
        """Refresh an unchanged live candidate without audit/SQLite churn."""
        with self._lock:
            bucket = self._candidate.get(event_id)
            current = bucket.get(source_id) if bucket else None
            if current is None:
                return False
            bucket[source_id] = dataclasses.replace(
                current,
                collected_at=collected_at,
                received_at=received_at,
            )
            self._last_update_ts[event_id] = time.time()
            return True

    def remove_candidate(self, event_id: str, source_id: str) -> None:
        with self._lock:
            bucket = self._candidate.get(event_id)
            if bucket and source_id in bucket:
                del bucket[source_id]
                if not bucket:
                    del self._candidate[event_id]

    def clear_candidates(self, event_id: str) -> None:
        """Drop every candidate (any source) for ``event_id``.

        Used by the ingest pipeline after a tombstone is published so
        that surviving live candidates from *other* sources cannot
        immediately re-publish a non-tombstone quote and "un-tombstone"
        the event. See ``aggregator.ingest.IngestRouter.ingest``.
        """
        with self._lock:
            self._candidate.pop(event_id, None)

    def get_candidates(self, event_id: str) -> list[CandidateQuote]:
        with self._lock:
            bucket = self._candidate.get(event_id)
            if not bucket:
                return []
            return list(bucket.values())

    def list_event_ids(self) -> list[str]:
        with self._lock:
            return list(self._candidate.keys())

    def evict_stale(self, now_ts: float, ttl_sec: float) -> int:
        """Evict event-scoped in-memory provenance older than ``ttl_sec``.

        ``_raw`` and ``_history`` are bounded rings and intentionally
        excluded. The return value is the number of event_id buckets removed.
        """
        # Wall-clock time.time() eviction can evict early on NTP forward jumps > TTL; srv01 slews, risk is low; now_ts is injectable for tests.  # noqa: E501
        cutoff = now_ts - ttl_sec
        with self._lock:
            stale_event_ids = {
                event_id
                for event_id, last_update in self._last_update_ts.items()
                if last_update < cutoff
            }
            if not stale_event_ids:
                return 0

            for event_id in stale_event_ids:
                self._candidate.pop(event_id, None)
                self._candidate_log.pop(event_id, None)
                self._last_update_ts.pop(event_id, None)

            stale_normalized_keys = [
                key for key in self._normalized if key[1] in stale_event_ids
            ]
            for key in stale_normalized_keys:
                self._normalized.pop(key, None)

            return len(stale_event_ids)

    # ── history ────────────────────────────────────────────────────────

    def append_history(self, published: PublishedQuote) -> None:
        with self._lock:
            self._history.append(published)
        if self._sqlite is not None:
            self._enqueue_sqlite(
                "published_quotes",
                "INSERT INTO published_quotes(event_id, source_used, "
                "publish_authority_class, decision_reason, degraded, "
                "fallback_state, is_tombstone, collected_at, freshness_ms) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    published.event_id,
                    published.source_used_for_publish,
                    published.publish_authority_class,
                    published.decision_reason,
                    int(published.degraded),
                    published.fallback_state,
                    int(published.is_tombstone),
                    published.collected_at.isoformat(),
                    int(published.freshness_ms),
                ),
            )
            self._enqueue_sqlite(
                "decision_history",
                "INSERT INTO decision_history(event_id, source_used, "
                "decision_reason, degraded, fallback_state, recorded_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    published.event_id,
                    published.source_used_for_publish,
                    published.decision_reason,
                    int(published.degraded),
                    published.fallback_state,
                    _utcnow_iso(),
                ),
            )

    def iter_history(self) -> Iterable[PublishedQuote]:
        with self._lock:
            return list(self._history)

    # ── Phase 3 query helpers ──────────────────────────────────────────

    def last_published(self, event_id: str) -> Optional[PublishedQuote]:
        """Most recent ``PublishedQuote`` for ``event_id`` (in-memory)."""
        with self._lock:
            for pq in reversed(self._history):
                if pq.event_id == event_id:
                    return pq
            return None

    def candidate_history(
        self, event_id: str, since: Optional[datetime] = None
    ) -> list[CandidateQuote]:
        """Per-source observations for ``event_id`` newer than ``since``.

        The store keeps a bounded per-event ring (default 20 entries)
        of every ``upsert_candidate`` call so diagnostics can replay
        the path that led to a particular publish. Returns oldest-first.
        """
        with self._lock:
            log = self._candidate_log.get(event_id)
            if not log:
                return []
            entries = list(log)
        if since is None:
            return entries
        return [c for c in entries if c.collected_at >= since]

    def decision_trace(self, event_id: str, last_n: int = 20) -> list[PublishedQuote]:
        """Most recent ``last_n`` published quotes for ``event_id``."""
        with self._lock:
            matching = [pq for pq in self._history if pq.event_id == event_id]
        if last_n <= 0:
            return []
        return matching[-last_n:]

    # ── sqlite ─────────────────────────────────────────────────────────

    def _enqueue_sqlite(self, table: str, sql: str, params: tuple) -> None:
        """Push a row onto the batched write queue.

        Drops oldest on overflow + bumps a counter; never raises.
        """
        with self._sqlite_lock:
            if len(self._sqlite_queue) >= self._sqlite_queue_cap:
                # Drop oldest to make room — ingest hot-path is more
                # important than perfect sqlite history.
                self._sqlite_queue.popleft()
                self.counters.dropped_overflow_count += 1
            self._sqlite_queue.append(_PendingWrite(table=table, sql=sql, params=params))
            if self._sqlite_queue_first_enqueue_at is None:
                self._sqlite_queue_first_enqueue_at = time.monotonic()

            should_flush = (
                len(self._sqlite_queue) >= self._sqlite_batch_size
                or self._batch_age_ms() >= self._sqlite_batch_max_age_ms
            )
        if should_flush:
            self.flush_sqlite()

    def _batch_age_ms(self) -> float:
        if self._sqlite_queue_first_enqueue_at is None:
            return 0.0
        return (time.monotonic() - self._sqlite_queue_first_enqueue_at) * 1000.0

    def flush_sqlite(self) -> int:
        """Drain the pending queue into sqlite in a single transaction.

        Returns the number of rows committed. Never raises on sqlite
        failure — the failure is logged and counted, and the queue is
        cleared (since retrying the same broken write indefinitely
        would be worse).
        """
        if self._sqlite is None:
            return 0
        with self._sqlite_lock:
            if not self._sqlite_queue:
                return 0
            pending = list(self._sqlite_queue)
            self._sqlite_queue.clear()
            self._sqlite_queue_first_enqueue_at = None
        try:
            cur = self._sqlite.cursor()
            cur.execute("BEGIN")
            for w in pending:
                cur.execute(w.sql, w.params)
            self._sqlite.commit()
        except Exception as exc:  # noqa: BLE001 — audit must not break ingest
            self.counters.sqlite_error_count += 1
            logger.warning("sqlite flush failed: %s (rows dropped=%d)", exc, len(pending))
            try:
                self._sqlite.rollback()
            except Exception:  # noqa: BLE001
                pass
            return 0
        self.counters.flushed_rows += len(pending)
        self.counters.flush_count += 1
        self._maybe_prune_sqlite()
        return len(pending)

    def _maybe_prune_sqlite(self) -> int:
        """Run one bounded retention pass when the configured interval elapses."""
        if (
            self._sqlite is None
            or self._sqlite_retention_sec <= 0
            or self._sqlite_prune_interval_sec <= 0
        ):
            return 0
        current = time.monotonic()
        if current - self._sqlite_last_prune_monotonic < self._sqlite_prune_interval_sec:
            return 0
        # Latch before I/O so a failing database cannot create a retry storm on
        # every hot-path flush. The next normal interval will try again.
        self._sqlite_last_prune_monotonic = current
        return self.prune_sqlite()

    def prune_sqlite(self, *, now: datetime | None = None) -> int:
        """Delete one bounded batch of durable provenance older than retention.

        The SQLite mirror is diagnostic cold storage, not the live state
        authority.  A bounded pass prevents unbounded disk growth without
        putting an unbounded DELETE on the ingest hot path.  Freed pages remain
        inside the database and are reused by future writes.
        """
        if self._sqlite is None or self._sqlite_retention_sec <= 0:
            return 0
        current = now or datetime.now(timezone.utc)
        if current.tzinfo is None:
            current = current.replace(tzinfo=timezone.utc)
        cutoff = (current - timedelta(seconds=self._sqlite_retention_sec)).isoformat()

        try:
            with self._sqlite_lock:
                cur = self._sqlite.cursor()
                cur.execute("BEGIN")
                removed = 0
                for table, timestamp_column in _SQLITE_RETENTION_TABLES:
                    # Table/column names come exclusively from the constant
                    # above. The cutoff and batch stay parameterized.
                    cur.execute(
                        f"DELETE FROM {table} WHERE id IN ("
                        f"SELECT id FROM {table} WHERE {timestamp_column} < ? "
                        f"ORDER BY {timestamp_column} LIMIT ?)",
                        (cutoff, self._sqlite_prune_batch),
                    )
                    if cur.rowcount > 0:
                        removed += cur.rowcount
                self._sqlite.commit()
                # Keep WAL bounded; PASSIVE never waits for readers.
                self._sqlite.execute("PRAGMA wal_checkpoint(PASSIVE)")
        except Exception as exc:  # noqa: BLE001 — audit must not break ingest
            self.counters.sqlite_prune_error_count += 1
            logger.warning("sqlite retention prune failed: %s", exc)
            try:
                self._sqlite.rollback()
            except Exception:  # noqa: BLE001
                pass
            return 0

        self.counters.sqlite_pruned_rows += removed
        self.counters.sqlite_prune_count += 1
        return removed

    def _init_sqlite(self) -> None:
        assert self._sqlite is not None
        # WAL + relaxed sync — durable enough for an audit log; we
        # accept losing the trailing few writes on crash.
        self._sqlite.execute("PRAGMA journal_mode=WAL")
        self._sqlite.execute("PRAGMA synchronous=NORMAL")
        self._sqlite.executescript(
            """
            CREATE TABLE IF NOT EXISTS raw_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id TEXT NOT NULL,
                event_id TEXT NOT NULL,
                collected_at TEXT NOT NULL,
                received_at TEXT NOT NULL,
                is_tombstone INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS ix_raw_events_event_id ON raw_events(event_id);
            CREATE INDEX IF NOT EXISTS ix_raw_events_source_id ON raw_events(source_id);
            CREATE INDEX IF NOT EXISTS ix_raw_events_collected_at ON raw_events(collected_at);

            CREATE TABLE IF NOT EXISTS normalized_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id TEXT NOT NULL,
                event_id TEXT NOT NULL,
                observed_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_norm_event_id ON normalized_events(event_id);
            CREATE INDEX IF NOT EXISTS ix_norm_observed_at ON normalized_events(observed_at);

            CREATE TABLE IF NOT EXISTS candidate_quotes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT NOT NULL,
                source_id TEXT NOT NULL,
                family TEXT,
                transport TEXT,
                collected_at TEXT NOT NULL,
                is_tombstone INTEGER NOT NULL DEFAULT 0,
                confidence REAL NOT NULL DEFAULT 1.0
            );
            CREATE INDEX IF NOT EXISTS ix_cand_event_id ON candidate_quotes(event_id);
            CREATE INDEX IF NOT EXISTS ix_cand_source_id ON candidate_quotes(source_id);
            CREATE INDEX IF NOT EXISTS ix_cand_collected_at ON candidate_quotes(collected_at);

            CREATE TABLE IF NOT EXISTS published_quotes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT NOT NULL,
                source_used TEXT NOT NULL,
                publish_authority_class TEXT,
                decision_reason TEXT,
                degraded INTEGER NOT NULL DEFAULT 0,
                fallback_state TEXT,
                is_tombstone INTEGER NOT NULL DEFAULT 0,
                collected_at TEXT NOT NULL,
                freshness_ms INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS ix_pub_event_id ON published_quotes(event_id);
            CREATE INDEX IF NOT EXISTS ix_pub_collected_at ON published_quotes(collected_at);

            CREATE TABLE IF NOT EXISTS decision_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT NOT NULL,
                source_used TEXT NOT NULL,
                decision_reason TEXT,
                degraded INTEGER NOT NULL DEFAULT 0,
                fallback_state TEXT,
                recorded_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_dec_event_id ON decision_history(event_id);
            CREATE INDEX IF NOT EXISTS ix_dec_recorded_at ON decision_history(recorded_at);
            """
        )
        self._sqlite.commit()

    def sqlite_query(self, sql: str, params: tuple = ()) -> list[Any]:
        """Test/diagnostic helper — synchronous read of the sqlite mirror.

        Always flushes pending writes first.
        """
        if self._sqlite is None:
            return []
        self.flush_sqlite()
        with self._sqlite_lock:
            cur = self._sqlite.execute(sql, params)
            return cur.fetchall()

    def close(self) -> None:
        with self._lock:
            if self._sqlite is not None:
                try:
                    self.flush_sqlite()
                except Exception:  # noqa: BLE001
                    pass
                self._sqlite.close()
                self._sqlite = None


def _utcnow_iso() -> str:
    from datetime import datetime as _dt
    from datetime import timezone as _tz

    return _dt.now(_tz.utc).isoformat()


__all__ = [
    "ProvenanceStore",
    "DEFAULT_BATCH_SIZE",
    "DEFAULT_BATCH_MAX_AGE_MS",
    "DEFAULT_QUEUE_CAP",
]
