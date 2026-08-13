"""Pinnacle Official API → aggregator source adapter.

Wraps :class:`aggregator.sources.pinnacle_api_client.PinnacleApiClient`
plus :mod:`aggregator.sources.pinnacle_api_normalizer` and feeds the
resulting events into an :class:`aggregator.ingest.IngestRouter` as
``SourceEvent``s with ``source_id="pinnacle_api"`` so the
``DecisionEngine`` can arbitrate between this source and the existing
pin888 source.

Phase 2 wiring policy:

- construction is **gated** by both ``MSP_AGGREGATOR_ENABLED`` and the
  new ``MSP_PINNACLE_API_ENABLED`` flag (both default off);
- there are **no module-level network calls or env reads** — the
  ``__init__`` itself is also pure (the client must be passed in or
  built via :meth:`PinnacleApiSourceAdapter.from_env_or_none`);
- every error inside ``emit_*`` / ``poll_once`` is caught and counted;
  it never bubbles out and never breaks the production broadcaster
  path.

Disappearance handling uses **two complementary mechanisms**, since
the Pinnacle API's delta endpoints return only changes (a missing pid
in a delta does NOT mean it was removed):

1. **Periodic forced full resync** — every ``full_resync_every_n_polls``
   polls (env ``MSP_PINNACLE_API_FULL_RESYNC_EVERY``, default ``30``)
   the adapter resets the per-sport delta cursors so the next request
   pulls a full snapshot. After the full pull, any pid in
   ``_last_seen_pids`` that is absent from the snapshot is tombstoned.
2. **Delta-mode removal parsing** — when a delta ``/v3/odds`` response
   contains an event whose ``periods`` array is empty, Pinnacle is
   signalling that the event no longer has tradable markets. The
   adapter treats that as a removal and emits an immediate tombstone
   (and prunes the pid from ``_last_seen_pids``).

The first poll for each sport initializes ``_last_seen_pids`` from the
full snapshot **without** emitting tombstones.
"""

from __future__ import annotations

import os
import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any, Deque, Optional

from aggregator.ingest import IngestRouter, aggregator_enabled
from aggregator.sources.pinnacle_api_client import (
    PinnacleApiAuthError,
    PinnacleApiClient,
    PinnacleApiError,
    PinnacleApiRateLimitError,
    PinnacleApiServerError,
    PinnacleApiTransportError,
)
from aggregator.sources.pinnacle_api_normalizer import (
    SPECIALS_SUPPORTED_SPORT_IDS,
    build_tombstone,
    event_id_for_pid,
    extract_pids,
    normalize_sport_snapshot,
)
from aggregator.types import SourceEvent

DEFAULT_SOURCE_ID = "pinnacle_api"
DEFAULT_FAMILY = "pinnacle_native"
DEFAULT_TRANSPORT = "http_pull"
DEFAULT_POLL_INTERVAL_SEC = 10.0
DEFAULT_SPORT_IDS: tuple[int, ...] = (29, 33, 4, 19, 34, 18, 12)
DEFAULT_FULL_RESYNC_EVERY_N_POLLS = 30

# Story 27.3 AC-1/AC-2: per-market-class cadence + backoff defaults.
#   Live polling: "нещадно тащим" — default 1s, clamped to ≥100ms floor.
#   Prematch polling: 5s is enough; markets change slowly.
#   Backoff: 2s base × 2^n, capped at 60s. Mirrors TZ spec.
#   Rate-limit budget: 120 req/min per class (conservative guess; tune after rollout).
DEFAULT_POLL_LIVE_SEC = 1.0
DEFAULT_POLL_PREMATCH_SEC = 5.0
DEFAULT_BACKOFF_BASE_SEC = 2.0
DEFAULT_BACKOFF_MAX_SEC = 60.0
DEFAULT_REQ_PER_MIN_BUDGET = 120
DEFAULT_API_DEGRADED_THRESHOLD_SEC = 180.0  # AC-5 / DOD-8: "> 3 мин подряд"
_POLL_FLOOR_SEC = 0.1  # never hammer the upstream faster than this
_RATE_LIMITED_STREAK_THRESHOLD = 3  # AC-2: flag after 3 consecutive 429
_LATENCY_SAMPLE_WINDOW = 1024  # AC-6: sliding window for p50/p95/p99

# AC-6: stats key ordering. Always present even when zero so /stats
# consumers can rely on the shape.
_ERROR_CLASSES: tuple[str, ...] = ("auth", "rate_limit", "server", "transport")

# Tennis sport id — only sport for which we apply the parentId-based
# subevent dedup (e.g. "John Doe (Games)" vs "John Doe").
_TENNIS_SPORT_ID = 33

# Multiplier applied to the last advertised Retry-After when the API
# rate-limits us. Keeps the loop cooperative even if Retry-After is
# missing — a flat fallback also exists in poll_once.
_RATE_LIMIT_FALLBACK_SEC = 30.0


def pinnacle_api_enabled() -> bool:
    """Return ``True`` iff both feature flags are enabled.

    Both ``MSP_AGGREGATOR_ENABLED`` (the umbrella aggregator flag) and
    ``MSP_PINNACLE_API_ENABLED`` (this source-specific flag) must be
    set; either off keeps the source completely inert.
    """
    if not aggregator_enabled():
        return False
    raw = (os.environ.get("MSP_PINNACLE_API_ENABLED") or "").strip()
    return raw in ("1", "true", "True", "yes")


def _resolve_full_resync_every() -> int:
    """Read ``MSP_PINNACLE_API_FULL_RESYNC_EVERY`` at construction time."""
    raw = (os.environ.get("MSP_PINNACLE_API_FULL_RESYNC_EVERY") or "").strip()
    if not raw:
        return DEFAULT_FULL_RESYNC_EVERY_N_POLLS
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_FULL_RESYNC_EVERY_N_POLLS
    return n if n > 0 else DEFAULT_FULL_RESYNC_EVERY_N_POLLS


def _resolve_poll_interval() -> float:
    """Read ``MSP_PINNACLE_API_POLL_INTERVAL_SEC`` at construction time.

    Falls back to :data:`DEFAULT_POLL_INTERVAL_SEC`. Values <0.5s are
    clamped to 0.5s to avoid hammering the upstream by accident.
    """
    raw = (os.environ.get("MSP_PINNACLE_API_POLL_INTERVAL_SEC") or "").strip()
    if not raw:
        return DEFAULT_POLL_INTERVAL_SEC
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return DEFAULT_POLL_INTERVAL_SEC
    if v < 0.5:
        return 0.5
    return v


def _read_float_env(
    name: str, *, default: float, floor: float | None = None
) -> float:
    """Read a float env var with fallback and optional floor clamp."""
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return default
    if floor is not None and v < floor:
        return floor
    return v


def _resolve_poll_live_sec() -> float:
    """Read ``MSP_PINNACLE_API_POLL_LIVE_SEC`` (AC-1, DOD-1)."""
    return _read_float_env(
        "MSP_PINNACLE_API_POLL_LIVE_SEC",
        default=DEFAULT_POLL_LIVE_SEC,
        floor=_POLL_FLOOR_SEC,
    )


def _resolve_poll_prematch_sec() -> float:
    """Read ``MSP_PINNACLE_API_POLL_PREMATCH_SEC`` (AC-1, DOD-1)."""
    return _read_float_env(
        "MSP_PINNACLE_API_POLL_PREMATCH_SEC",
        default=DEFAULT_POLL_PREMATCH_SEC,
        floor=_POLL_FLOOR_SEC,
    )


def _resolve_backoff_base_sec() -> float:
    """Read ``MSP_PINNACLE_API_BACKOFF_BASE_SEC`` (AC-2, DOD-3)."""
    return _read_float_env(
        "MSP_PINNACLE_API_BACKOFF_BASE_SEC",
        default=DEFAULT_BACKOFF_BASE_SEC,
        floor=0.1,
    )


def _resolve_backoff_max_sec() -> float:
    """Read ``MSP_PINNACLE_API_BACKOFF_MAX_SEC`` (AC-2, DOD-3)."""
    return _read_float_env(
        "MSP_PINNACLE_API_BACKOFF_MAX_SEC",
        default=DEFAULT_BACKOFF_MAX_SEC,
        floor=1.0,
    )


def _resolve_req_per_min_budget() -> int:
    """Read ``MSP_PINNACLE_API_REQ_PER_MIN_BUDGET`` (implementation note §9)."""
    raw = (os.environ.get("MSP_PINNACLE_API_REQ_PER_MIN_BUDGET") or "").strip()
    if not raw:
        return DEFAULT_REQ_PER_MIN_BUDGET
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_REQ_PER_MIN_BUDGET
    return n if n > 0 else DEFAULT_REQ_PER_MIN_BUDGET


def _resolve_api_degraded_threshold_sec() -> float:
    """Read ``MSP_PINNACLE_API_DEGRADED_THRESHOLD_SEC`` (AC-5, DOD-8).

    Partner API is considered ``degraded`` when its current failure
    streak has been active for at least this many seconds.
    """
    return _read_float_env(
        "MSP_PINNACLE_API_DEGRADED_THRESHOLD_SEC",
        default=DEFAULT_API_DEGRADED_THRESHOLD_SEC,
        floor=0.0,
    )


def _resolve_sport_ids() -> list[int]:
    """Read ``MSP_PINNACLE_API_SPORTS`` (AC-7, DOD-13).

    Expects a comma-separated list of integer Pinnacle sport ids. Blank
    / malformed falls back to :data:`DEFAULT_SPORT_IDS` (soccer, tennis,
    basketball, and a handful of specials-supporting sports).

    Default per story spec: ``29,4,33`` (soccer, basketball, tennis).
    Story-spec default wins over :data:`DEFAULT_SPORT_IDS` unless the
    env var is explicitly set.
    """
    raw = (os.environ.get("MSP_PINNACLE_API_SPORTS") or "").strip()
    if not raw:
        # DOD-13 baseline — soccer (29), basketball (4), tennis (33).
        # Pinnacle sport ids: 19 is Ice Hockey, NOT tennis.
        return [29, 4, 33]
    out: list[int] = []
    for chunk in raw.split(","):
        s = chunk.strip()
        if not s:
            continue
        try:
            out.append(int(s))
        except ValueError:
            continue
    return out if out else [29, 4, 33]


class _RateLimitBudget:
    """Sliding-window request counter (implementation note §9).

    Tracks request timestamps within a 60-second window and signals
    ``is_over_budget`` when the count crosses the configured cap. The
    adapter uses this to defensively slow down its own polling even
    before the upstream returns 429.

    Not thread-safe; adapter owns the only reference and serialises
    access through its own lock when needed.
    """

    def __init__(self, *, limit_per_min: int, window_sec: float = 60.0) -> None:
        self.limit_per_min = int(limit_per_min)
        self.window_sec = float(window_sec)
        self._timestamps: list[float] = []

    def record(self, *, now_ts: float) -> None:
        self._timestamps.append(float(now_ts))
        self._evict(now_ts=now_ts)

    def _evict(self, *, now_ts: float) -> None:
        cutoff = now_ts - self.window_sec
        # Common case: drop from the head until we hit a fresh entry.
        while self._timestamps and self._timestamps[0] < cutoff:
            self._timestamps.pop(0)

    def requests_in_last_minute(self, *, now_ts: float) -> int:
        self._evict(now_ts=now_ts)
        return len(self._timestamps)

    def is_over_budget(self, *, now_ts: float) -> bool:
        return self.requests_in_last_minute(now_ts=now_ts) > self.limit_per_min


class _ClassBackoffState:
    """Per-class consecutive-failure counter + rate-limit streak tracker.

    One instance per (``is_live`` value) tracks:

    * ``consecutive_failures`` — count of back-to-back 429/5xx from the
      upstream. Drives exponential backoff ``base × 2^n`` up to ``max``.
    * ``consecutive_rate_limits`` — count of back-to-back 429 specifically.
      Used by AC-2 to flag ``rate_limited=true`` in ``/health`` after
      the threshold is crossed.
    * ``first_failure_ts`` — ``time.time()`` at the start of the current
      failure streak. ``None`` while the class is healthy. Used by AC-5
      to flip ``adapter.degraded`` after the streak exceeds the
      configured threshold.

    All three fields reset on the first successful poll.
    """

    __slots__ = (
        "consecutive_failures",
        "consecutive_rate_limits",
        "first_failure_ts",
    )

    def __init__(self) -> None:
        self.consecutive_failures: int = 0
        self.consecutive_rate_limits: int = 0
        self.first_failure_ts: float | None = None

    def on_success(self) -> None:
        self.consecutive_failures = 0
        self.consecutive_rate_limits = 0
        self.first_failure_ts = None

    def on_rate_limit(self, *, now_ts: float | None = None) -> None:
        self.consecutive_failures += 1
        self.consecutive_rate_limits += 1
        if self.first_failure_ts is None:
            self.first_failure_ts = (
                float(now_ts) if now_ts is not None else time.time()
            )

    def on_server_error(self, *, now_ts: float | None = None) -> None:
        self.consecutive_failures += 1
        # Non-429 server errors don't count towards the rate-limit streak.
        if self.first_failure_ts is None:
            self.first_failure_ts = (
                float(now_ts) if now_ts is not None else time.time()
            )

    def exponential_backoff(self, *, base: float, cap: float) -> float:
        """Return ``base × 2^(n-1)`` clamped to ``[base, cap]`` for n>=1."""
        n = max(1, self.consecutive_failures)
        raw: float = float(base) * float(2 ** (n - 1))
        return float(min(raw, cap))

    def streak_duration(self, *, now_ts: float | None = None) -> float:
        """Seconds since the streak started, or ``0.0`` if no active streak."""
        if self.first_failure_ts is None:
            return 0.0
        now = float(now_ts) if now_ts is not None else time.time()
        return max(0.0, now - self.first_failure_ts)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PinnacleApiSourceAdapter:
    """Source adapter for the Pinnacle Official API.

    The adapter is unit-testable in isolation: pass a stub client whose
    ``fetch_*`` methods return canned dicts. ``poll_once`` will normalize
    them, push :class:`SourceEvent`s into the supplied router, and emit
    tombstones for any Pid that disappeared between ticks.
    """

    def __init__(
        self,
        *,
        router: IngestRouter,
        client: PinnacleApiClient | None = None,
        sport_ids: list[int] | None = None,
        poll_interval_s: float = DEFAULT_POLL_INTERVAL_SEC,
        source_id: str = DEFAULT_SOURCE_ID,
        family: str = DEFAULT_FAMILY,
        transport: str = DEFAULT_TRANSPORT,
        account_id: str | None = "pinnacle_api",
        full_resync_every_n_polls: int | None = None,
    ) -> None:
        self.router = router
        self.client = client
        self.sport_ids: list[int] = list(sport_ids) if sport_ids else list(DEFAULT_SPORT_IDS)
        self.poll_interval_s = float(poll_interval_s)
        self.source_id = source_id
        self.family = family
        self.transport = transport
        self.account_id = account_id
        self.full_resync_every_n_polls = (
            int(full_resync_every_n_polls)
            if full_resync_every_n_polls is not None and int(full_resync_every_n_polls) > 0
            else _resolve_full_resync_every()
        )

        # Per-sport bookkeeping
        self._last_seen_pids: dict[int, set[int]] = {sid: set() for sid in self.sport_ids}
        # Per-sport delta cursors (the API's `last` value). Legacy unified
        # cursors retained for backwards-compat `poll_once()` path.
        self._fixtures_since: dict[int, int | None] = {sid: None for sid in self.sport_ids}
        self._odds_since: dict[int, int | None] = {sid: None for sid in self.sport_ids}
        # Story 27.3.A AC-1: independent cursors per market class so that
        # a live-class `last` advance does not make the prematch class
        # miss events between polls.
        self._fixtures_since_live: dict[int, int | None] = {
            sid: None for sid in self.sport_ids
        }
        self._fixtures_since_prematch: dict[int, int | None] = {
            sid: None for sid in self.sport_ids
        }
        self._odds_since_live: dict[int, int | None] = {
            sid: None for sid in self.sport_ids
        }
        self._odds_since_prematch: dict[int, int | None] = {
            sid: None for sid in self.sport_ids
        }
        # Per-sport counter of polls since the last forced full resync.
        self._polls_since_resync: dict[int, int] = {sid: 0 for sid in self.sport_ids}

        # Story 27.3.A AC-2: per-class backoff + shared rate-limit budget.
        # Keyed by the `is_live` value actually passed to poll_once_class
        # (True → "live", False → "prematch", None → "unified"/legacy).
        self._backoff_by_class: dict[str, _ClassBackoffState] = {
            "live": _ClassBackoffState(),
            "prematch": _ClassBackoffState(),
            "unified": _ClassBackoffState(),
        }
        self._backoff_base_sec = _resolve_backoff_base_sec()
        self._backoff_max_sec = _resolve_backoff_max_sec()
        self._req_budget = _RateLimitBudget(
            limit_per_min=_resolve_req_per_min_budget()
        )
        # AC-5 threshold cached at construction time to avoid env reads on hot path.
        self._degraded_threshold_sec = _resolve_api_degraded_threshold_sec()
        # Configurable polling intervals per market class.
        self.poll_live_s = _resolve_poll_live_sec()
        self.poll_prematch_s = _resolve_poll_prematch_sec()
        # Per-sport fixture-metadata cache so that delta-only odds
        # events keep their home/away/league/isLive (otherwise downstream
        # consumers see empty match names between full snapshots).
        self._fixture_meta: dict[int, dict[int, dict[str, Any]]] = {
            sid: {} for sid in self.sport_ids
        }
        # Per-sport set of pids to suppress (e.g. tennis "(Games)"
        # subevents that duplicate a parent matchup).
        self._skip_pids: dict[int, set[int]] = {sid: set() for sid in self.sport_ids}

        # Counters — read by tests / future metrics endpoint.
        self._lock = threading.Lock()
        self.error_count = 0
        self.rate_limit_count = 0
        self.events_emitted = 0
        self.tombstones_emitted = 0
        self.poll_count = 0

        # Story 27.3.E AC-6: extended observability state.
        # errors_by_class counts typed upstream failures for /stats.
        self._errors_by_class: dict[str, int] = {cls: 0 for cls in _ERROR_CLASSES}
        # latency_samples: sliding window of poll durations (ms) → p50/p95/p99.
        self._latency_samples_ms: Deque[float] = deque(
            maxlen=_LATENCY_SAMPLE_WINDOW
        )
        # published_quotes_total: caller increments after a successful
        # downstream publish so stats can cross-check adapter→router→publish.
        self.published_quotes_total: int = 0
        # last_poll_ts: time.time() at the start of the most recent poll_once.
        # None until the first poll runs.
        self._last_poll_ts: float | None = None

        # Story 27.20: per-class poll counters + per-class latency windows.
        # Keys match _class_key() → "live", "prematch", "unified".
        self._polls_by_class: dict[str, int] = {
            "live": 0, "prematch": 0, "unified": 0
        }
        self._latency_by_class: dict[str, Deque[float]] = {
            "live": deque(maxlen=_LATENCY_SAMPLE_WINDOW),
            "prematch": deque(maxlen=_LATENCY_SAMPLE_WINDOW),
            "unified": deque(maxlen=_LATENCY_SAMPLE_WINDOW),
        }

        # Story 27.21 AC-1: per-sport last-completed-poll timestamp (monotonic).
        # Records time.monotonic() right after _fetch_one_sport succeeds for
        # sport_id S. stats() computes age = now - ts to expose poll freshness.
        self._per_sport_last_poll_ts: dict[int, float] = {}
        self._per_sport_last_poll_ts_lock = threading.Lock()

    @property
    def rate_limited(self) -> bool:
        """AC-2 / DOD-4: true iff any class is in a ≥3-429 streak.

        Cleared on the first successful poll of that class.
        """
        return any(
            state.consecutive_rate_limits >= _RATE_LIMITED_STREAK_THRESHOLD
            for state in self._backoff_by_class.values()
        )

    def record_poll_latency_ms(self, ms: float) -> None:
        """Record a poll duration sample (milliseconds) into the sliding
        window used for :attr:`stats` percentiles (AC-6 / DOD-11)."""
        with self._lock:
            self._latency_samples_ms.append(float(ms))

    def record_published_quote(self) -> None:
        """Increment :attr:`published_quotes_total` (AC-6 / DOD-11).

        Called by the caller that wires the adapter into the router —
        typically a consumer callback or the router itself, once it
        has successfully fan-out a published quote to downstream.
        """
        with self._lock:
            self.published_quotes_total += 1

    def _record_error(self, error_class: str) -> None:
        """Internal — bump the typed error counter."""
        with self._lock:
            self._errors_by_class[error_class] = (
                self._errors_by_class.get(error_class, 0) + 1
            )

    def _latency_percentile(self, q: float) -> float:
        """Compute the q-th percentile (0.0..1.0) from the latency window.

        Returns 0.0 when the window is empty. Uses the *nearest rank*
        method with deterministic ordering so tests can reason about it.
        """
        samples = sorted(self._latency_samples_ms)
        if not samples:
            return 0.0
        # Nearest-rank: rank = ceil(q * N).
        rank = max(1, int(q * len(samples) + 0.9999))
        idx = min(len(samples) - 1, rank - 1)
        return float(samples[idx])

    @property
    def last_poll_age_sec(self) -> float | None:
        """Seconds since the last ``poll_once_class`` started, or ``None``."""
        if self._last_poll_ts is None:
            return None
        return max(0.0, time.time() - self._last_poll_ts)

    @property
    def coverage_events_count(self) -> int:
        """Total distinct pids currently tracked across all sports (AC-6)."""
        total = 0
        for pids in self._last_seen_pids.values():
            total += len(pids)
        return total

    @property
    def degraded(self) -> bool:
        """AC-5 / DOD-8: true iff any class has an active failure streak
        lasting longer than ``MSP_PINNACLE_API_DEGRADED_THRESHOLD_SEC``
        (default 180s).

        Orthogonal to :attr:`rate_limited` — a short 429 burst does not
        imply ``degraded`` until the streak time crosses the threshold,
        and a sustained 5xx streak without any 429 still trips degraded.
        """
        now = time.time()
        threshold = float(self._degraded_threshold_sec)
        for state in self._backoff_by_class.values():
            duration = state.streak_duration(now_ts=now)
            if duration > threshold and state.consecutive_failures > 0:
                return True
        return False

    # ── construction helpers ──────────────────────────────────────────

    @classmethod
    def from_env_or_none(
        cls,
        *,
        router: IngestRouter,
        sport_ids: list[int] | None = None,
        poll_interval_s: float | None = None,
    ) -> "PinnacleApiSourceAdapter | None":
        """Build the adapter only when both feature flags are on.

        Returns ``None`` (no client created, no env read for creds) when
        either ``MSP_AGGREGATOR_ENABLED`` or ``MSP_PINNACLE_API_ENABLED``
        is unset. This is the entry point production wiring should use.

        ``poll_interval_s`` may be passed explicitly; otherwise we read
        ``MSP_PINNACLE_API_POLL_INTERVAL_SEC`` from the environment and
        fall back to :data:`DEFAULT_POLL_INTERVAL_SEC`.
        """
        if not pinnacle_api_enabled():
            return None
        client = PinnacleApiClient.from_env()
        interval = (
            float(poll_interval_s)
            if poll_interval_s is not None
            else _resolve_poll_interval()
        )
        # AC-7 / DOD-13 — sport_ids default from MSP_PINNACLE_API_SPORTS.
        resolved_sport_ids = sport_ids if sport_ids is not None else _resolve_sport_ids()
        return cls(
            router=router,
            client=client,
            sport_ids=resolved_sport_ids,
            poll_interval_s=interval,
        )

    # ── conversion ────────────────────────────────────────────────────

    def _build_event(
        self,
        payload: dict[str, Any],
        *,
        is_tombstone: bool = False,
        collected_at: datetime | None = None,
    ) -> SourceEvent | None:
        if not isinstance(payload, dict):
            return None
        pid = payload.get("Pid")
        if pid is None:
            return None
        try:
            pid_int = int(pid)
        except (TypeError, ValueError):
            return None
        now = collected_at or _utc_now()
        return SourceEvent(
            source_id=self.source_id,
            family=self.family,
            transport=self.transport,
            event_id=event_id_for_pid(pid_int),
            payload=payload,
            collected_at=now,
            received_at=now,
            is_tombstone=is_tombstone,
            account_id=self.account_id,
        )

    # ── per-event hooks ───────────────────────────────────────────────

    def emit_fixture(self, raw: dict[str, Any]) -> None:
        """Wrap ``raw`` in a SourceEvent and push it through the router.

        Errors are caught and counted — never raised — so a single
        malformed event cannot break the producer loop or the
        production WS broadcaster running in a sibling task.
        """
        try:
            ev = self._build_event(raw)
            if ev is None:
                return
            self.router.ingest(ev)
            with self._lock:
                self.events_emitted += 1
        except Exception:  # noqa: BLE001 — never break the producer
            with self._lock:
                self.error_count += 1

    def emit_tombstone(self, pid: int, *, sport_id: int | None = None) -> None:
        """Emit an explicit tombstone for an event no longer in the snapshot."""
        try:
            payload = build_tombstone(int(pid), sport_id=sport_id)
            ev = self._build_event(payload, is_tombstone=True)
            if ev is None:
                return
            self.router.ingest(ev)
            with self._lock:
                self.tombstones_emitted += 1
        except Exception:  # noqa: BLE001 — never break the producer
            with self._lock:
                self.error_count += 1

    # ── polling ───────────────────────────────────────────────────────

    def _extract_removed_pids_from_delta_odds(
        self, odds_payload: dict[str, Any] | None
    ) -> set[int]:
        """Parse Pinnacle's delta-mode removal signal from an odds payload.

        Pinnacle's ``/v3/odds`` delta endpoint signals that a previously
        offered event no longer has tradable markets by including the
        event in the response with an **empty** ``periods`` array. (This
        differs from period-level ``status==2`` which only suspends an
        individual market, and from ``periods`` simply not changing —
        unchanged events are omitted entirely from delta responses.)

        Reference: ``tools/ps3838_api_parity.py`` iterates
        ``event.get("periods") or []`` (so an empty list is the
        idiomatic "no markets" state) and the Go reference at
        ``parse_pinnacle/internal/entity/odds.go`` declares ``Periods
        []PeriodODDS`` — an empty slice is the canonical removal cue.

        TODO: if we encounter operational evidence that an alternative
        signal is more reliable (e.g. an event-level ``status`` field
        not currently exposed in the legacy entity), revisit this.
        """
        if not isinstance(odds_payload, dict):
            return set()
        removed: set[int] = set()
        for league in odds_payload.get("leagues") or []:
            if not isinstance(league, dict):
                continue
            for event in league.get("events") or []:
                if not isinstance(event, dict):
                    continue
                periods = event.get("periods")
                if not isinstance(periods, list) or len(periods) > 0:
                    continue
                pid_raw = event.get("id")
                if pid_raw is None:
                    continue
                try:
                    removed.add(int(pid_raw))
                except (TypeError, ValueError):
                    continue
        return removed

    def _force_full_resync_sport(
        self, sport_id: int, *, is_live: bool | None = None
    ) -> None:
        """Reset cursors for a single sport (per-sport isolation).

        Also clears the fixture-meta + skip caches for that sport so the
        upcoming full snapshot becomes the new ground truth. When a
        specific class is named, only that class's cursors reset;
        ``is_live=None`` resets the legacy unified cursors for
        backwards-compat.
        """
        fix_since, odds_since = self._cursors_for_class(is_live)
        if sport_id in fix_since:
            fix_since[sport_id] = None
        if sport_id in odds_since:
            odds_since[sport_id] = None
        # Drop cached fixture meta on a forced full resync; the next
        # snapshot will rebuild it. This guarantees we don't carry
        # stale home/away/league forever.
        self._fixture_meta[sport_id] = {}
        self._skip_pids[sport_id] = set()

    @staticmethod
    def _is_subvariant_name(name: str) -> bool:
        s = (name or "").strip()
        return s.endswith(")") and "(" in s

    def _update_fixture_meta(
        self, sport_id: int, fixtures: dict[str, Any] | None
    ) -> None:
        """Merge fixtures from this poll into the per-sport meta cache.

        Removes only happen on full snapshots / forced resyncs; in
        delta mode missing pids do **not** mean removal.
        """
        if not isinstance(fixtures, dict):
            return
        cache = self._fixture_meta.setdefault(sport_id, {})
        for league in fixtures.get("league") or []:
            if not isinstance(league, dict):
                continue
            league_name = str(league.get("name") or "")
            for event in league.get("events") or []:
                if not isinstance(event, dict):
                    continue
                try:
                    pid = int(event.get("id") or 0)
                except (TypeError, ValueError):
                    continue
                if pid <= 0:
                    continue
                try:
                    parent_id = int(event.get("parentId") or 0)
                except (TypeError, ValueError):
                    parent_id = 0
                # Story 27.17 — carry starts timestamp через delta
                # polls. Pinnacle v3/fixtures использует 'starts' field.
                starts_raw = event.get("starts") or event.get("startTime")
                cache[pid] = {
                    "home": str(event.get("home") or ""),
                    "away": str(event.get("away") or ""),
                    "league": league_name,
                    "is_live": event.get("liveStatus") in (1, "1"),
                    # Story 27.24 — Pinnacle status "H" = Halted (между сетами,
                    # маркеты legitimately suspended). Используется в SLA-фильтре
                    # чтобы отличить настоящую паузу от delivery failure.
                    "is_halted": str(event.get("status") or "").upper() == "H",
                    "parent_id": parent_id,
                    "starts_at": str(starts_raw) if starts_raw else None,
                }

    def _recompute_skip_pids(self, sport_id: int) -> None:
        """Recompute the per-sport skip-set from the fixture-meta cache.

        For tennis we drop the "(Games)" / "(Sets)" subvariant entries
        when a parent matchup has multiple children: keep the one
        whose home/away names do **not** end with ``(...)`` and skip
        the rest. This restores the legacy browser behaviour of
        showing one row per matchup instead of two.
        """
        if sport_id != _TENNIS_SPORT_ID:
            self._skip_pids[sport_id] = set()
            return
        cache = self._fixture_meta.get(sport_id) or {}
        # Group children by parent_id (>0); top-level fixtures (parent
        # 0) are kept as-is.
        by_parent: dict[int, list[int]] = {}
        for pid, meta in cache.items():
            parent_id = int(meta.get("parent_id") or 0)
            if parent_id <= 0:
                continue
            by_parent.setdefault(parent_id, []).append(pid)
        skip: set[int] = set()
        for _parent_id, pids in by_parent.items():
            if len(pids) <= 1:
                continue
            # Prefer canonical (no parens) entries.
            canonical = [
                pid
                for pid in pids
                if not self._is_subvariant_name(str(cache[pid].get("home") or ""))
                and not self._is_subvariant_name(str(cache[pid].get("away") or ""))
            ]
            if not canonical:
                # No clean variant — keep the lowest pid as the
                # canonical one to ensure stable behaviour.
                canonical = [min(pids)]
            keep = set(canonical)
            for pid in pids:
                if pid not in keep:
                    skip.add(pid)
        self._skip_pids[sport_id] = skip

    def _cursors_for_class(
        self, is_live: bool | None
    ) -> tuple[dict[int, int | None], dict[int, int | None]]:
        """Return ``(fixtures_since, odds_since)`` dicts for the class.

        Story 27.3.A: live / prematch have independent cursor tracks so
        one class's ``last`` advance can't make the other miss events.
        ``is_live=None`` selects the legacy unified cursors, preserving
        backwards compatibility for callers that did not split.
        """
        if is_live is True:
            return self._fixtures_since_live, self._odds_since_live
        if is_live is False:
            return self._fixtures_since_prematch, self._odds_since_prematch
        return self._fixtures_since, self._odds_since

    def _fetch_one_sport(
        self, sport_id: int, *, is_live: bool | None = None
    ) -> tuple[list[dict[str, Any]], set[int], bool, set[int]]:
        """Fetch + normalize a single sport for one market class.

        Returns ``(games, current_pids, was_full_snapshot, removed_pids)``:

        - ``was_full_snapshot`` reflects whether the cursors *at request
          time* were both ``None`` (i.e. this poll was a full pull, not
          a delta). It is captured BEFORE cursors advance.
        - ``removed_pids`` is the set of pids the delta odds payload
          flagged for removal (empty for full snapshots).

        ``is_live`` is forwarded to the HTTP client so the server-side
        filter applies (``/v3/odds?isLive=…``). ``None`` preserves the
        legacy unfiltered behaviour.

        Raises whatever the underlying client raises; ``poll_once_class``
        wraps the call in a try/except so one failing sport does not
        derail the others.
        """
        assert self.client is not None, "client missing — wire one before polling"
        fix_since, odds_since = self._cursors_for_class(is_live)
        was_full_snapshot = (
            fix_since[sport_id] is None and odds_since[sport_id] is None
        )
        fixtures = self.client.fetch_fixtures(
            sport_id, since=fix_since[sport_id], is_live=is_live
        )
        odds = self.client.fetch_odds(
            sport_id, since=odds_since[sport_id], is_live=is_live
        )

        # Update fixture-meta cache (full snapshot replaces, delta
        # merges — see _force_full_resync_sport which clears the cache
        # before a full pull). This lets delta-only odds events keep
        # their home/away/league/isLive without a re-resync.
        if was_full_snapshot:
            # Hard reset before merge so vanished fixtures drop out.
            self._fixture_meta[sport_id] = {}
        self._update_fixture_meta(sport_id, fixtures)

        # Parse removal markers from the delta odds payload BEFORE we
        # normalize (normalization drops events with no periods so we
        # would lose the signal otherwise). For a full snapshot we ignore
        # this — disappearance is handled by the snapshot diff instead.
        removed_pids: set[int] = (
            set() if was_full_snapshot else self._extract_removed_pids_from_delta_odds(odds)
        )

        special_fixtures: dict[str, Any] | None = None
        special_odds: dict[str, Any] | None = None
        if sport_id in SPECIALS_SUPPORTED_SPORT_IDS:
            try:
                special_fixtures = self.client.fetch_special_fixtures(
                    sport_id, is_live=is_live
                )
                special_odds = self.client.fetch_special_odds(
                    sport_id, is_live=is_live
                )
            except PinnacleApiError:
                # Specials are best-effort; main markets must still flow.
                with self._lock:
                    self.error_count += 1
                special_fixtures = None
                special_odds = None

        # Advance cursors for next poll. None-safe: if the response
        # had no `last`, we keep the previous cursor and effectively
        # re-pull on the next tick (acceptable; matches Go ref).
        from aggregator.sources.pinnacle_api_client import extract_cursor

        new_fix_cursor = extract_cursor(fixtures)
        if new_fix_cursor is not None:
            fix_since[sport_id] = new_fix_cursor
        new_odds_cursor = extract_cursor(odds)
        if new_odds_cursor is not None:
            odds_since[sport_id] = new_odds_cursor

        games = normalize_sport_snapshot(
            sport_id=sport_id,
            fixtures=fixtures,
            odds=odds,
            special_fixtures=special_fixtures,
            special_odds=special_odds,
            fixture_meta_override=self._fixture_meta.get(sport_id) or {},
        )
        current_pids = extract_pids(games)
        return games, current_pids, was_full_snapshot, removed_pids

    def poll_once(self) -> float | None:
        """Legacy unified poll — backwards-compat wrapper for callers
        that do not split live/prematch. Forwards to :meth:`poll_once_class`
        with ``is_live=None``.

        New code should call :meth:`poll_once_class` directly so it can
        honour the per-class cadence introduced in Story 27.3.A.
        """
        return self.poll_once_class(is_live=None)

    @staticmethod
    def _class_key(is_live: bool | None) -> str:
        if is_live is True:
            return "live"
        if is_live is False:
            return "prematch"
        return "unified"

    def poll_once_class(self, *, is_live: bool | None = None) -> float | None:
        """Run one poll cycle across all configured sports for one class.

        Story 27.3.A AC-1/AC-2:

        - Live and prematch tracks each hold independent cursors so one
          class advancing its ``last`` never starves the other.
        - Per-class backoff counters drive exponential sleep on
          consecutive ``429``/``5xx``. ``Retry-After`` from the 429
          overrides the computed value if advertised.
        - The shared request budget throttles aggregate request rate
          when it crosses the configured ceiling (defensive against
          our own over-poll).

        Two disappearance mechanisms run unchanged:

        - **Periodic full resync** per (sport, class) tuple.
        - **Delta removal parsing** — empty ``periods`` array flags a pid.

        Returns a suggested next-sleep override (seconds) when backoff
        kicked in; ``None`` means "use the default class interval".
        """
        if self.client is None:
            return None
        poll_started_at = time.time()
        class_key = self._class_key(is_live)
        with self._lock:
            self.poll_count += 1
            self._last_poll_ts = poll_started_at
            self._polls_by_class[class_key] = self._polls_by_class.get(class_key, 0) + 1
        suggested_sleep: float | None = None
        backoff_state = self._backoff_by_class[class_key]
        had_transport_level_failure = False

        for sport_id in self.sport_ids:
            # Per-sport forced resync gate. We reset cursors BEFORE the
            # fetch so this poll pulls a full snapshot. The counter is
            # incremented in this same step; only this sport's cursors
            # are touched (other sports stay on their own delta tracks).
            self._polls_since_resync[sport_id] = (
                self._polls_since_resync.get(sport_id, 0) + 1
            )
            if self._polls_since_resync[sport_id] >= self.full_resync_every_n_polls:
                self._force_full_resync_sport(sport_id, is_live=is_live)

            # Record the request against the sliding-window budget; the
            # fetch below actually issues it. We count up-front so that
            # even failed requests consume budget (they hit the upstream).
            self._req_budget.record(now_ts=time.time())

            try:
                games, current_pids, was_full_snapshot, removed_pids = (
                    self._fetch_one_sport(sport_id, is_live=is_live)
                )
            except PinnacleApiRateLimitError as exc:
                with self._lock:
                    self.rate_limit_count += 1
                self._record_error("rate_limit")
                backoff_state.on_rate_limit(now_ts=time.time())
                had_transport_level_failure = True
                # Prefer the server's Retry-After; fall back to the
                # configured exponential value.
                computed = backoff_state.exponential_backoff(
                    base=self._backoff_base_sec, cap=self._backoff_max_sec
                )
                suggested = (
                    float(exc.retry_after)
                    if exc.retry_after is not None
                    else computed
                )
                if suggested_sleep is None or suggested > suggested_sleep:
                    suggested_sleep = suggested
                # Halt the remainder of this tick — we're being told to slow down.
                break
            except PinnacleApiServerError:
                with self._lock:
                    self.error_count += 1
                self._record_error("server")
                backoff_state.on_server_error(now_ts=time.time())
                had_transport_level_failure = True
                computed = backoff_state.exponential_backoff(
                    base=self._backoff_base_sec, cap=self._backoff_max_sec
                )
                if suggested_sleep is None or computed > suggested_sleep:
                    suggested_sleep = computed
                # Server errors are per-sport transient; keep trying other sports.
                continue
            except PinnacleApiTransportError:
                # AC-5: connect / read / proxy failures count toward the
                # degraded streak; otherwise the whole VPN dropping out
                # would keep us silent with `degraded=False`.
                with self._lock:
                    self.error_count += 1
                self._record_error("transport")
                backoff_state.on_server_error(now_ts=time.time())
                had_transport_level_failure = True
                computed = backoff_state.exponential_backoff(
                    base=self._backoff_base_sec, cap=self._backoff_max_sec
                )
                if suggested_sleep is None or computed > suggested_sleep:
                    suggested_sleep = computed
                continue
            except PinnacleApiAuthError:
                # Auth errors are typically fatal until creds rotate; we
                # still count them and let the caller decide to disable
                # the adapter (bia-observer lesson — don't hammer 401s).
                with self._lock:
                    self.error_count += 1
                self._record_error("auth")
                backoff_state.on_server_error(now_ts=time.time())
                had_transport_level_failure = True
                continue
            except Exception:  # noqa: BLE001 — never break the loop
                with self._lock:
                    self.error_count += 1
                continue

            # Story 27.21 AC-1: record completed-poll timestamp for this sport.
            _poll_done_ts = time.monotonic()
            with self._per_sport_last_poll_ts_lock:
                self._per_sport_last_poll_ts[sport_id] = _poll_done_ts

            for game in games:
                self.emit_fixture(game)

            previous = self._last_seen_pids.get(sport_id, set())
            if was_full_snapshot:
                # Full snapshot — tombstone any pid we used to see and
                # is now absent. The snapshot becomes the new ground
                # truth; reset the per-sport resync counter.
                disappeared = previous - current_pids
                for pid in disappeared:
                    self.emit_tombstone(pid, sport_id=sport_id)
                self._last_seen_pids[sport_id] = set(current_pids)
                self._polls_since_resync[sport_id] = 0
            else:
                # Delta — accumulate currently-seen pids, then process
                # any removal signals from the delta odds payload.
                merged = previous | current_pids
                for pid in removed_pids:
                    if pid in merged:
                        self.emit_tombstone(pid, sport_id=sport_id)
                        merged.discard(pid)
                self._last_seen_pids[sport_id] = merged

        # AC-2 / DOD-4: a class successfully completed its full sport
        # rotation without a 429/5xx → it is healthy; reset its streak.
        if not had_transport_level_failure:
            backoff_state.on_success()

        # Defensive self-throttle: if we've been hitting the upstream
        # harder than the configured ceiling, recommend a short pause
        # even without 429. This is the "don't get us banned" safety.
        if (
            suggested_sleep is None
            and self._req_budget.is_over_budget(now_ts=time.time())
        ):
            suggested_sleep = self._backoff_base_sec

        # AC-6: record poll duration into the aggregate sliding window.
        elapsed_ms = (time.time() - poll_started_at) * 1000.0
        self.record_poll_latency_ms(elapsed_ms)
        # Story 27.20: also record into the per-class window.
        with self._lock:
            self._latency_by_class[class_key].append(elapsed_ms)

        return suggested_sleep

    def force_full_resync(self) -> None:
        """Reset cursors so the next poll is a full snapshot.

        Useful after an auth recovery or extended downtime where the
        delta cursor would skip intermediate state.
        """
        for sid in self.sport_ids:
            self._fixtures_since[sid] = None
            self._odds_since[sid] = None
            self._polls_since_resync[sid] = 0

    def run_forever(self, *, stop_event: threading.Event) -> None:
        """Legacy unified polling loop — single cadence, ``is_live=None``.

        Retained for backwards-compat and for deployments that do not
        want the per-class split. Production wiring that wants the
        Story 27.3.A AC-1 cadence split should use
        :meth:`run_forever_per_class` instead.
        """
        while not stop_event.is_set():
            try:
                override = self.poll_once()
            except Exception:  # noqa: BLE001 — defensive; poll_once is already safe
                with self._lock:
                    self.error_count += 1
                override = None
            sleep_for = override if override is not None else self.poll_interval_s
            # Cooperative wait so stop_event aborts promptly.
            stop_event.wait(timeout=max(0.1, float(sleep_for)))

    def _run_one_class(
        self,
        *,
        is_live: bool,
        interval_sec: float,
        stop_event: threading.Event,
    ) -> None:
        """Single-class polling loop for one ``is_live`` value."""
        while not stop_event.is_set():
            try:
                override = self.poll_once_class(is_live=is_live)
            except Exception:  # noqa: BLE001 — defensive; poll_once_class is already safe
                with self._lock:
                    self.error_count += 1
                override = None
            sleep_for = override if override is not None else interval_sec
            stop_event.wait(timeout=max(_POLL_FLOOR_SEC, float(sleep_for)))

    def run_forever_per_class(
        self,
        *,
        stop_event: threading.Event,
    ) -> list[threading.Thread]:
        """Spawn two polling threads (live + prematch) with independent
        cadence and return their handles so the caller can ``join()``
        them after signaling ``stop_event``.

        This is the Story 27.3.A AC-1 production entry point. Each
        thread calls :meth:`poll_once_class` with its own ``is_live``
        value and sleeps the configured interval (or the backoff hint
        returned by ``poll_once_class``).
        """
        threads: list[threading.Thread] = []
        for is_live, interval in (
            (True, self.poll_live_s),
            (False, self.poll_prematch_s),
        ):
            t = threading.Thread(
                target=self._run_one_class,
                kwargs={
                    "is_live": is_live,
                    "interval_sec": interval,
                    "stop_event": stop_event,
                },
                name=f"pinnacle-api-{'live' if is_live else 'prematch'}",
                daemon=True,
            )
            t.start()
            threads.append(t)
        return threads

    # ── Story 27.22: parallel-per-sport polling ───────────────────────

    def _poll_one_sport(
        self,
        sport_id: int,
        *,
        is_live: bool,
        class_key: str,
    ) -> tuple[bool, Optional[float]]:
        """Poll one sport for one class (parallel-polling building block).

        Returns ``(transport_ok, backoff_override)``:
        - ``transport_ok=False`` when a rate-limit/server/transport error occurred.
        - ``backoff_override`` is the suggested sleep (seconds) or ``None``.

        Thread-safe for concurrent calls on *different* sport_ids.
        Callers must never run two threads for the same (sport_id, is_live) pair.
        """
        if self.client is None:
            return True, None

        backoff_state = self._backoff_by_class[class_key]

        # Resync gate — only one thread owns this sport_id slot.
        self._polls_since_resync[sport_id] = (
            self._polls_since_resync.get(sport_id, 0) + 1
        )
        if self._polls_since_resync[sport_id] >= self.full_resync_every_n_polls:
            self._force_full_resync_sport(sport_id, is_live=is_live)

        # _req_budget is NOT thread-safe; guard with the shared lock.
        with self._lock:
            self._req_budget.record(now_ts=time.time())

        try:
            games, current_pids, was_full_snapshot, removed_pids = (
                self._fetch_one_sport(sport_id, is_live=is_live)
            )
        except PinnacleApiRateLimitError as exc:
            with self._lock:
                self.rate_limit_count += 1
                backoff_state.on_rate_limit(now_ts=time.time())
            self._record_error("rate_limit")
            computed = backoff_state.exponential_backoff(
                base=self._backoff_base_sec, cap=self._backoff_max_sec
            )
            override = float(exc.retry_after) if exc.retry_after is not None else computed
            return False, override
        except PinnacleApiServerError:
            with self._lock:
                self.error_count += 1
                backoff_state.on_server_error(now_ts=time.time())
            self._record_error("server")
            return False, backoff_state.exponential_backoff(
                base=self._backoff_base_sec, cap=self._backoff_max_sec
            )
        except PinnacleApiTransportError:
            with self._lock:
                self.error_count += 1
                backoff_state.on_server_error(now_ts=time.time())
            self._record_error("transport")
            return False, backoff_state.exponential_backoff(
                base=self._backoff_base_sec, cap=self._backoff_max_sec
            )
        except PinnacleApiAuthError:
            with self._lock:
                self.error_count += 1
                backoff_state.on_server_error(now_ts=time.time())
            self._record_error("auth")
            return False, backoff_state.exponential_backoff(
                base=self._backoff_base_sec, cap=self._backoff_max_sec
            )
        except Exception:  # noqa: BLE001 — never break the loop
            with self._lock:
                self.error_count += 1
            return False, None

        # Success path: update per-sport timestamp, emit, diff tombstones.
        with self._per_sport_last_poll_ts_lock:
            self._per_sport_last_poll_ts[sport_id] = time.monotonic()

        for game in games:
            self.emit_fixture(game)

        previous = self._last_seen_pids.get(sport_id, set())
        if was_full_snapshot:
            disappeared = previous - current_pids
            for pid in disappeared:
                self.emit_tombstone(pid, sport_id=sport_id)
            self._last_seen_pids[sport_id] = set(current_pids)
            self._polls_since_resync[sport_id] = 0
        else:
            merged = previous | current_pids
            for pid in removed_pids:
                if pid in merged:
                    self.emit_tombstone(pid, sport_id=sport_id)
                    merged.discard(pid)
            self._last_seen_pids[sport_id] = merged

        with self._lock:
            backoff_state.on_success()
            is_over = self._req_budget.is_over_budget(now_ts=time.time())
        if is_over:
            return True, self._backoff_base_sec

        return True, None

    def _run_one_sport_class(
        self,
        sport_id: int,
        *,
        is_live: bool,
        interval_sec: float,
        stop_event: threading.Event,
    ) -> None:
        """Per-sport polling loop for one class (Story 27.22 parallel mode)."""
        class_key = self._class_key(is_live)
        while not stop_event.is_set():
            t0 = time.time()
            with self._lock:
                self._last_poll_ts = t0  # keep poll_age_sec() current in parallel mode
            try:
                _ok, backoff = self._poll_one_sport(
                    sport_id, is_live=is_live, class_key=class_key
                )
            except Exception:  # noqa: BLE001 — defensive outer catch
                with self._lock:
                    self.error_count += 1
                backoff = None
            elapsed_ms = (time.time() - t0) * 1000.0
            with self._lock:
                self.poll_count += 1
                self._polls_by_class[class_key] = (
                    self._polls_by_class.get(class_key, 0) + 1
                )
                self._latency_by_class[class_key].append(elapsed_ms)
                self._latency_samples_ms.append(elapsed_ms)
            sleep_for = backoff if backoff is not None else interval_sec
            stop_event.wait(timeout=max(_POLL_FLOOR_SEC, float(sleep_for)))

    def run_forever_parallel(
        self,
        *,
        stop_event: threading.Event,
    ) -> list[threading.Thread]:
        """Spawn one thread per (sport_id, class) — Story 27.22 parallel mode.

        Returns ``N_sports × 2`` daemon thread handles. Each sport polls its
        own live and prematch data independently, eliminating the sequential
        poll-cycle bottleneck (~128s → ~1-2s per-sport poll age).

        Set ``MSP_PINNACLE_API_PARALLEL_POLLS=1`` to activate this entry point
        via the main.py wiring.
        """
        threads: list[threading.Thread] = []
        for sport_id in self.sport_ids:
            for is_live, interval in (
                (True, self.poll_live_s),
                (False, self.poll_prematch_s),
            ):
                name = (
                    f"pinnacle-api-{'live' if is_live else 'prematch'}-sport{sport_id}"
                )
                t = threading.Thread(
                    target=self._run_one_sport_class,
                    kwargs={
                        "sport_id": sport_id,
                        "is_live": is_live,
                        "interval_sec": interval,
                        "stop_event": stop_event,
                    },
                    name=name,
                    daemon=True,
                )
                t.start()
                threads.append(t)
        return threads

    # ── observability ─────────────────────────────────────────────────

    def _latency_percentile_from(self, samples: Deque[float], q: float) -> float:
        """Compute the q-th percentile from an arbitrary latency deque.

        Uses nearest-rank (same algorithm as :meth:`_latency_percentile`).
        Safe to call under ``_lock``.
        """
        sorted_samples = sorted(samples)
        if not sorted_samples:
            return 0.0
        rank = max(1, int(q * len(sorted_samples) + 0.9999))
        idx = min(len(sorted_samples) - 1, rank - 1)
        return float(sorted_samples[idx])

    def stats(self) -> dict[str, Any]:
        """Story 27.3.A / 27.20 / 27.20.1 surface for /stats + /health consumers.

        Extends the legacy int-only counters with per-class backoff
        state, the aggregate rate-limit flag, Story 27.20 per-class poll
        counts + per-class latency percentiles, and Story 27.20.1
        client-level transport metrics.
        """
        now = time.time()
        with self._lock:
            polls_by_class_snapshot = dict(self._polls_by_class)
            per_class_latency_p50: dict[str, float] = {
                k: self._latency_percentile_from(v, 0.50)
                for k, v in self._latency_by_class.items()
            }
            per_class_latency_p95: dict[str, float] = {
                k: self._latency_percentile_from(v, 0.95)
                for k, v in self._latency_by_class.items()
            }
            base: dict[str, Any] = {
                "events_emitted": self.events_emitted,
                "tombstones_emitted": self.tombstones_emitted,
                "error_count": self.error_count,
                "rate_limit_count": self.rate_limit_count,
                "poll_count": self.poll_count,
                "polls_total": self.poll_count,  # AC-6 alias
                "rate_limited": self.rate_limited,
                "degraded": self.degraded,
                "consecutive_failures_by_class": {
                    k: v.consecutive_failures
                    for k, v in self._backoff_by_class.items()
                },
                "consecutive_rate_limits_by_class": {
                    k: v.consecutive_rate_limits
                    for k, v in self._backoff_by_class.items()
                },
                "failure_streak_duration_sec_by_class": {
                    k: v.streak_duration(now_ts=now)
                    for k, v in self._backoff_by_class.items()
                },
                "req_per_min_budget_used": self._req_budget.requests_in_last_minute(
                    now_ts=now
                ),
                "req_per_min_budget_limit": self._req_budget.limit_per_min,
                # Story 27.3.E AC-6 observability fields.
                "errors_by_class": dict(self._errors_by_class),
                "latency_p50_ms": self._latency_percentile(0.50),
                "latency_p95_ms": self._latency_percentile(0.95),
                "latency_p99_ms": self._latency_percentile(0.99),
                "published_quotes_total": self.published_quotes_total,
                "coverage_events_count": self.coverage_events_count,
                "last_poll_age_sec": self.last_poll_age_sec,
                # Story 27.20: per-class poll counts + latency.
                # Keys: "live", "prematch", "unified".
                # Always present (zero values before first poll) so
                # dashboards can rely on the shape.
                "per_class_polls": polls_by_class_snapshot,
                "per_class_latency_p50_ms": per_class_latency_p50,
                "per_class_latency_p95_ms": per_class_latency_p95,
                # Story 27.20.1 AC-6 defaults (overwritten below if client present).
                "sessions_refreshed_total": 0,
                "per_call_timeouts_total": 0,
                "per_call_latency_buckets": {"≤1s": 0, "1-5s": 0, "5-15s": 0, ">15s": 0},
            }
        # Story 27.21 AC-1: per-sport poll age computed from monotonic clock.
        _mono_now = time.monotonic()
        with self._per_sport_last_poll_ts_lock:
            base["per_sport_poll_age_sec"] = {
                str(sid): round(_mono_now - ts, 3)
                for sid, ts in self._per_sport_last_poll_ts.items()
            }

        # Story 27.20.1 AC-6: merge client-level transport metrics when available.
        if self.client is not None:
            client_metrics_fn = getattr(self.client, "client_metrics", None)
            if callable(client_metrics_fn):
                try:
                    cm = client_metrics_fn()
                    if isinstance(cm, dict):
                        for key in (
                            "sessions_refreshed_total",
                            "per_call_timeouts_total",
                            "per_call_latency_buckets",
                        ):
                            if key in cm:
                                base[key] = cm[key]
                except Exception:  # noqa: BLE001 — observability must not raise
                    pass
        return base


# Convenience for tests that want a tiny synchronous run.
def run_n_polls(
    adapter: PinnacleApiSourceAdapter,
    *,
    n: int,
    sleep_s: float = 0.0,
) -> None:
    for _ in range(int(n)):
        adapter.poll_once()
        if sleep_s > 0:
            time.sleep(sleep_s)


__all__ = [
    "DEFAULT_API_DEGRADED_THRESHOLD_SEC",
    "DEFAULT_BACKOFF_BASE_SEC",
    "DEFAULT_BACKOFF_MAX_SEC",
    "DEFAULT_POLL_INTERVAL_SEC",
    "DEFAULT_POLL_LIVE_SEC",
    "DEFAULT_POLL_PREMATCH_SEC",
    "DEFAULT_REQ_PER_MIN_BUDGET",
    "DEFAULT_SOURCE_ID",
    "PinnacleApiSourceAdapter",
    "_ClassBackoffState",
    "_RateLimitBudget",
    "_resolve_api_degraded_threshold_sec",
    "_resolve_backoff_base_sec",
    "_resolve_backoff_max_sec",
    "_resolve_poll_live_sec",
    "_resolve_poll_prematch_sec",
    "_resolve_req_per_min_budget",
    "_resolve_sport_ids",
    "pinnacle_api_enabled",
    "run_n_polls",
]
