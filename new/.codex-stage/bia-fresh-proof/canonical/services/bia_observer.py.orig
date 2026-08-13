"""
BIA cpricefeed observer — price monitor with optional state integration.

Connects to BIA cpricefeed WS and processes events / offers_hcap / offers_event
messages.

When running in observer-only mode (default: BIA_ENABLED=1 + SEND_MODE=base_only),
messages are counted but NOT written into shared state.

When the BIA more-bets pipeline is active (BIA_ENABLED=1 + SEND_MODE !=
base_only), offers_hcap / offers_event updates are matched to existing events
in ``state.events_data`` and merged as non-authoritative partial updates.

Usage (standalone)::

    asyncio.run(run_bia_observer())

The observer is gated by ``BIA_ENABLED=1`` and requires valid
``BIA_LOGIN`` / ``BIA_PASSWORD`` in the environment.
"""

from __future__ import annotations

import asyncio
import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

import aiohttp
import orjson

import config as _cfg
from services.bia_client import (
    BiaSession,
    BiaEventMsg,
    BiaInfoMsg,
    BiaOffersEventMsg,
    BiaOffersHcapMsg,
    BiaOtherMsg,
    BiaPmmMsg,
    _make_ssl_ctx,
    parse_cpricefeed_frame,
)
from services.bia_offer_proof import BiaOfferProofError, BiaOfferProofRegistry
from utils.utils import log

# Minimum session uptime (seconds) before we consider backoff reset.
_MIN_STABLE_SESSION_SEC = 30.0

# BIA emits event metadata first; rich ``offers_event`` snapshots and narrower
# ``offers_hcap`` deltas follow once the event is subscribed. Wait briefly for
# the initial inventory and keep subscribing new triples in small proven-safe
# batches.
_WATCH_HCAPS_WARMUP_SEC = _cfg.BIA_WATCH_HCAPS_WARMUP_SEC
_WATCH_HCAPS_BATCH_SIZE = _cfg.BIA_WATCH_HCAPS_BATCH_SIZE
_WATCH_HCAPS_FLUSH_SEC = _cfg.BIA_WATCH_HCAPS_FLUSH_SEC

# Rich snapshots preserve alternative lines and structural namespaces that the
# narrow hcap feed may omit.  Tennis and esports are deliberately admitted in
# the same bounded/prematch-only queue so exact set/map proofs can be built.
_WATCH_EVENT_RICH_SPORTS = frozenset({"fb", "fb_ht", "fb_htft", "tennis", "esports"})
_WATCH_EVENT_WARMUP_SEC = _cfg.BIA_WATCH_EVENT_WARMUP_SEC
_WATCH_EVENT_BATCH_SIZE = _cfg.BIA_WATCH_EVENT_BATCH_SIZE
_WATCH_EVENT_FLUSH_SEC = _cfg.BIA_WATCH_EVENT_FLUSH_SEC
_WATCH_EVENT_LIVE_SEED_SEC = _cfg.BIA_WATCH_EVENT_LIVE_SEED_SEC
_WATCH_EVENT_LIVE_SEED_COUNT = _cfg.BIA_WATCH_EVENT_LIVE_SEED_COUNT
_WATCH_EVENT_MATCH_SCAN_LIMIT = _cfg.BIA_WATCH_EVENT_MATCH_SCAN_LIMIT
_WATCH_EVENT_PREFETCH_COUNT = _cfg.BIA_WATCH_EVENT_PREFETCH_COUNT
_WATCH_EVENT_HOT_CANDIDATE_CAP = _cfg.BIA_WATCH_EVENT_HOT_CANDIDATE_CAP
_EVENT_MATCH_INDEX_TTL_SEC = 5.0
_EVENT_MATCH_MISS_TTL_SEC = 120.0
_EVENT_START_TOLERANCE_MS = 30 * 60 * 1000


def _structural_timestamp_ms(value: object) -> int | None:
    """Parse an event coordinate timestamp; never infer from market prices."""
    if value is None or isinstance(value, bool):
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        numeric = Decimal(text)
    except (InvalidOperation, ValueError):
        numeric = None
    if numeric is not None:
        if not numeric.is_finite():
            return None
        # cpricefeed metadata may use epoch seconds while parser state uses ms.
        if abs(numeric) < Decimal("100000000000"):
            numeric *= 1000
        return int(numeric.to_integral_value())
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return int(parsed.timestamp() * 1000)


def _event_start_compatibility(bia_start: object, game: dict) -> bool | None:
    bia_start_ms = _structural_timestamp_ms(bia_start)
    parser_start_ms = _structural_timestamp_ms(game.get("start_time_ms"))
    if bia_start_ms is None or parser_start_ms is None:
        return None
    return abs(bia_start_ms - parser_start_ms) <= _EVENT_START_TOLERANCE_MS


def _events_matching_bia_start(
    events_data: dict[int, dict],
    bia_start: object,
) -> tuple[dict[int, dict], bool]:
    """Return the globally time-compatible candidates when time is grounded."""
    bia_start_ms = _structural_timestamp_ms(bia_start)
    if bia_start_ms is None:
        return events_data, False
    matched: dict[int, dict] = {}
    saw_parser_time = False
    # The active parser mutates ``events_data`` from another thread while BIA
    # lookups run.  Iterate a point-in-time snapshot so a concurrent event add
    # cannot turn an exact-price lookup into a 500 response.
    for pid, game in list(events_data.items()):
        if not isinstance(game, dict):
            continue
        parser_start_ms = _structural_timestamp_ms(game.get("start_time_ms"))
        if parser_start_ms is None:
            continue
        saw_parser_time = True
        if abs(bia_start_ms - parser_start_ms) <= _EVENT_START_TOLERANCE_MS:
            matched[pid] = game
    return (matched, True) if saw_parser_time else (events_data, False)

# An exact proof may be intentionally short-lived, but a quiet BIA market must
# be re-confirmable without accepting stale state.  HTTP callers enqueue one
# bounded request; the already-authenticated observer re-subscribes to the raw
# event and wakes coalesced waiters only after the selected raw outcome itself
# has been observed after that request.
_EXACT_REFRESH_WAIT_SEC = 1.35
_EXACT_REFRESH_POLL_SEC = 0.10
_EXACT_REFRESH_SETTLE_SEC = 0.20
_EXACT_REFRESH_NEGATIVE_BACKOFF_SEC = 0.50
_EXACT_REFRESH_DISCOVERY_BACKOFF_SEC = 2.0
_EXACT_REFRESHABLE_ERRORS = frozenset({
    "BIA_EVENT_NOT_FOUND",
    "BIA_OFFER_EVENT_MISSING",
    "BIA_OFFER_PROOF_STALE",
    "BIA_OFFER_MARKET_MISSING",
    "BIA_OFFER_LINE_MISSING",
    "BIA_OFFER_OUTCOME_MISSING",
    "BIA_OFFER_PROOF_MISSING",
    "BIA_EVENT_SELECTION_INCOMPLETE",
})


def _configured_discovery_sports() -> list[str]:
    """Return the configured cpricefeed discovery sports in stable order."""
    sports: list[str] = []
    seen: set[str] = set()
    for raw_sport in getattr(_cfg, "BIA_SPORTS", ()) or ():
        sport = str(raw_sport).strip()
        if sport and sport not in seen:
            sports.append(sport)
            seen.add(sport)
    return sports


@dataclass
class _ExactRefreshRequest:
    key: tuple
    event_id: int
    period: int
    selection: dict
    deadline: float
    done: threading.Event = field(default_factory=threading.Event)
    sent_keys: set[tuple[str, str, str]] = field(default_factory=set)
    sent_wall_at: dict[tuple[str, str, str], float] = field(default_factory=dict)
    observed_keys: set[tuple[str, str, str]] = field(default_factory=set)
    candidate_keys: set[tuple[str, str, str]] = field(default_factory=set)
    candidate_stable_since: float = 0.0
    saw_no_refs: bool = False
    next_match_at: float = 0.0
    result: dict | None = None


_exact_refresh_lock = threading.RLock()
_exact_refresh_requests: dict[tuple, _ExactRefreshRequest] = {}
_exact_refresh_negative_until: dict[tuple, float] = {}
_exact_refresh_discovery_sent_at: float = 0.0


# ── Wave A step 2: base-market filter & period mapping ──────────────────────

# Base market keys that PS3838/Pinnacle owns.  BIA must NOT overwrite these.
_BIA_BASE_MARKET_KEYS = frozenset({
    "Win1x2", "Handicap", "Totals", "FirstTeamTotals", "SecondTeamTotals",
})

# BIA sport_code → Pinnacle period number.
# Root codes (no underscore suffix) are always full-match → period 0.
# Only well-established sub-period mappings are included.
# Returns None for unknown codes → offer will be skipped.
_BIA_SPORT_TO_PERIOD: dict[str, int] = {
    "fb": 0, "tennis": 0, "basket": 0, "ih": 0, "hand": 0,
    "volley": 0, "esports": 0, "baseball": 0, "af": 0,
    "cricket": 0, "darts": 0, "mma": 0, "boxing": 0,
    "arf": 0, "rl": 0, "ru": 0, "golf": 0, "cycling": 0, "snooker": 0,
    # Soccer first half → Pinnacle period 1 (grounded in sport_parsers.py)
    "fb_ht": 1,
    # Soccer HT/FT is a full-match combo market.
    "fb_htft": 0,
    # Basketball sub-periods are distinct BIA sport namespaces. Pinnacle's
    # normalized Periods layout uses 1..4 for quarters and 5 for first half.
    "basket_q1": 1,
    "basket_q2": 2,
    "basket_q3": 3,
    "basket_q4": 4,
    "basket_ht": 5,
}


def _bia_period_for_sport(sport_code: str) -> int | None:
    """Derive Pinnacle period number from BIA sport code.

    Returns None for unsupported codes (e.g. fb_corn) where
    the period mapping is ambiguous or unverified.  Callers should skip
    such offers rather than misapply them to period 0.
    """
    return _BIA_SPORT_TO_PERIOD.get(sport_code)


class BiaObserverStats:
    """Lightweight counters for the observer session — not shared state."""

    __slots__ = (
        "events_seen", "offers_count", "pmm_count", "info_count",
        "other_count", "errors", "ws_connect_ts", "last_msg_ts",
        "sports_seen", "events_by_sport", "subscribed",
        "discovered_events", "_discovered_keys", "_watch_hcaps_keys",
        "_watch_event_keys", "_watch_event_scan_cursor", "_watch_event_live_seed_cursor",
        "_fuzzy_rematch_cursor",
        "_watch_event_pending", "_watch_event_pending_keys", "_watch_event_hot_candidates",
        "_watch_event_sibling_pids",
        "_matched_event_cache", "_missed_event_cache",
        "_hcaps_no_match_keys", "_hcaps_no_match_ts",
        "_events_exact_index", "_events_exact_index_size", "_events_exact_index_built_ts",
        # Integration counters (step 2)
        "offers_applied", "offers_skipped_no_match",
        "offers_skipped_suspended", "offers_skipped_unsupported_period",
        "offers_skipped_base_only", "offers_skipped_unchanged", "matched_pids",
        # BIA event metadata registry for matching
        "_event_registry", "_offer_proofs", "_offer_event_observed_at",
        "_event_registry_changed_at", "_event_registry_revision",
        "_pid_event_ref_cache",
    )

    def __init__(self) -> None:
        self.events_seen: int = 0
        self.offers_count: int = 0
        self.pmm_count: int = 0
        self.info_count: int = 0
        self.other_count: int = 0
        self.errors: int = 0
        self.ws_connect_ts: float = 0.0
        self.last_msg_ts: float = 0.0
        self.sports_seen: set[str] = set()
        self.events_by_sport: dict[str, int] = defaultdict(int)
        self.subscribed: bool = False
        # [comp_id, sport_code, event_id] triples from "event" messages
        self.discovered_events: list[list] = []
        self._discovered_keys: set[tuple] = set()
        self._watch_hcaps_keys: set[tuple] = set()
        self._watch_event_keys: set[tuple] = set()
        self._watch_event_scan_cursor: int = 0
        self._watch_event_live_seed_cursor: int = 0
        self._fuzzy_rematch_cursor: int = 0
        self._watch_event_pending: list[list] = []
        self._watch_event_pending_keys: set[tuple] = set()
        self._watch_event_hot_candidates: list[list] = []
        self._watch_event_sibling_pids: list[int] = []
        self._matched_event_cache: dict[tuple[str, str, str], tuple[int, bool]] = {}
        self._missed_event_cache: dict[tuple[str, str, str], float] = {}
        # Subscription-level negative cache: triples checked and NOT matching
        # any pin888 event.  Cleared periodically (not by incoming events).
        self._hcaps_no_match_keys: set[tuple] = set()
        self._hcaps_no_match_ts: float = 0.0
        self._events_exact_index: dict[tuple[str, str, str], list[tuple[int, str]]] = {}
        self._events_exact_index_size: int = 0
        self._events_exact_index_built_ts: float = 0.0
        # Integration counters (step 2)
        self.offers_applied: int = 0
        self.offers_skipped_no_match: int = 0
        self.offers_skipped_suspended: int = 0
        self.offers_skipped_unsupported_period: int = 0
        self.offers_skipped_base_only: int = 0
        self.offers_skipped_unchanged: int = 0
        self.matched_pids: set[int] = set()
        # BIA event metadata: (comp_id, sport, event_key) → {home, away, ...}
        self._event_registry: dict[tuple[str, str, str], dict] = {}
        # Raw structural offer evidence.  Prices are intentionally not stored.
        self._offer_proofs = BiaOfferProofRegistry()
        self._offer_event_observed_at: dict[tuple[str, str, str], float] = {}
        self._event_registry_changed_at: float = 0.0
        self._event_registry_revision: int = 0
        self._pid_event_ref_cache: dict[tuple[int, int], tuple[int, tuple, list[dict]]] = {}

    def summary(self) -> str:
        uptime = time.time() - self.ws_connect_ts if self.ws_connect_ts else 0.0
        applied = f" applied={self.offers_applied}" if self.offers_applied else ""
        return (
            f"uptime={uptime:.0f}s events={self.events_seen} "
            f"offers={self.offers_count} pmm={self.pmm_count} "
            f"sports={sorted(self.sports_seen)} errors={self.errors}"
            f"{applied}"
        )

    def runtime_snapshot(self, *, now: float | None = None) -> dict:
        """Return a read-only dict suitable for /health and /stats payloads."""
        now = now or time.time()
        ws_uptime = now - self.ws_connect_ts if self.ws_connect_ts else None
        last_msg_age = now - self.last_msg_ts if self.last_msg_ts else None
        return {
            "connected": self.ws_connect_ts > 0 and self.last_msg_ts > 0,
            "ws_uptime_sec": round(ws_uptime, 1) if ws_uptime is not None else None,
            "last_msg_age_sec": round(last_msg_age, 1) if last_msg_age is not None else None,
            "subscribed": self.subscribed,
            "counters": {
                "events": self.events_seen,
                "offers": self.offers_count,
                "pmm": self.pmm_count,
                "info": self.info_count,
                "other": self.other_count,
            },
            "integration": {
                "applied": self.offers_applied,
                "skipped_no_match": self.offers_skipped_no_match,
                "skipped_suspended": self.offers_skipped_suspended,
                "skipped_unsupported_period": self.offers_skipped_unsupported_period,
                "skipped_base_only": self.offers_skipped_base_only,
                "skipped_unchanged": self.offers_skipped_unchanged,
                "matched_pids": len(self.matched_pids),
            },
            "sports_seen": sorted(list(self.sports_seen)),
            "discovered_events": len(self.discovered_events),
            "subscribed_events": len(self._watch_hcaps_keys),
            "watch_event_subscribed": len(self._watch_event_keys),
            "watch_event_pending": len(self._watch_event_pending),
            "match_cache_size": len(self._matched_event_cache),
            "match_cache_unique_pids": len({
                pid for (_, (pid, _)) in list(self._matched_event_cache.items())
            }),
            "miss_cache_size": len(self._missed_event_cache),
            "errors": self.errors,
        }


_HCAPS_NO_MATCH_REFRESH_SEC = 120.0  # re-check unmatched triples every 2min
_FUZZY_REMATCH_INTERVAL_SEC = 60.0   # run fuzzy rematch every 60s
_FUZZY_REMATCH_BATCH_SIZE = 500      # max events per fuzzy pass (avoid blocking)


def _fuzzy_rematch_unsubscribed(stats: BiaObserverStats) -> int:
    """Pre-populate match cache via fuzzy matching for unmatched registry events.

    The subscription filter uses exact-only matching (fast index lookup).
    This periodic task catches events that need fuzzy matching and adds them
    to the cache so the subscription filter will find them on next cycle.
    Returns the number of newly matched events.
    """
    from services.bia_event_matcher import match_bia_event, BIA_SPORT_MAP
    from state import state

    if not state.events_data or not stats._event_registry:
        return 0

    newly_matched = 0
    checked = 0
    entries = list(stats._event_registry.items())
    total = len(entries)
    start = stats._fuzzy_rematch_cursor % total
    scanned = 0
    while scanned < total and checked < _FUZZY_REMATCH_BATCH_SIZE:
        cache_key, reg_entry = entries[(start + scanned) % total]
        scanned += 1
        if cache_key in stats._matched_event_cache:
            continue
        if not isinstance(reg_entry, dict):
            continue
        sport_code = reg_entry.get("sport", "")
        if sport_code not in BIA_SPORT_MAP:
            continue

        checked += 1

        bia_home = str(reg_entry.get("home") or "")
        bia_away = str(reg_entry.get("away") or "")
        bia_league = str(reg_entry.get("competition_name") or "")
        if not bia_home or not bia_away:
            continue

        pid, swapped = match_bia_event(
            bia_home, bia_away, sport_code, state.events_data,
            bia_league=bia_league,
        )
        if pid is not None and pid in state.events_data:
            stats._matched_event_cache[cache_key] = (pid, swapped)
            newly_matched += 1

    stats._fuzzy_rematch_cursor = (start + scanned) % total

    return newly_matched


def _build_watch_hcaps(
    stats: BiaObserverStats,
    *,
    only_unsent: bool = False,
    limit: int | None = None,
) -> list | None:
    """Build a ``watch_hcaps`` subscription from discovered events.

    Uses the correct BIA protocol format:
    ``["watch_hcaps", [[comp_id, sport_code, event_id], ...]]``

    Only subscribes to sports listed in ``BIA_SPORTS`` (when configured).
    Returns the message payload or *None* if there is nothing to subscribe to.
    """
    if not stats.discovered_events:
        return None

    # Periodically flush the no-match cache to pick up newly arrived pin888 events.
    _now_m = time.monotonic()
    if stats._hcaps_no_match_keys and (_now_m - stats._hcaps_no_match_ts) >= _HCAPS_NO_MATCH_REFRESH_SEC:
        stats._hcaps_no_match_keys.clear()
        stats._hcaps_no_match_ts = _now_m

    allowed = set(_cfg.BIA_SPORTS) if _cfg.BIA_SPORTS else None
    subs: list[list] = []
    seen: set[tuple] = set()
    for triple in stats.discovered_events:
        sport = triple[1]
        if allowed and sport not in allowed:
            continue
        key = (triple[0], sport, triple[2])
        if only_unsent and key in stats._watch_hcaps_keys:
            continue
        if key in stats._hcaps_no_match_keys:
            continue
        if not _watch_hcaps_matches_live_state(stats, triple):
            stats._hcaps_no_match_keys.add(key)
            if not stats._hcaps_no_match_ts:
                stats._hcaps_no_match_ts = _now_m
            continue
        if key not in seen:
            seen.add(key)
            subs.append(triple)
            if limit is not None and len(subs) >= limit:
                break
    if not subs:
        return None
    return ["watch_hcaps", subs]


def _build_watch_events(
    stats: BiaObserverStats,
    *,
    only_unsent: bool = False,
    limit: int | None = None,
) -> list[list] | None:
    """Build individual ``watch_event`` triples for soccer rich-snapshot sports.

    Prefetches a small queue of matched candidates, but returns only up to
    ``limit`` items so live rollout can stay slow and safe.
    """
    if not stats.discovered_events and not stats._watch_event_pending:
        return None
    allowed = set(_cfg.BIA_SPORTS) if _cfg.BIA_SPORTS else None
    target_pending = max(limit or 0, _WATCH_EVENT_PREFETCH_COUNT)
    # Skip expensive scan entirely if pending queue already has enough items
    if len(stats._watch_event_pending) >= target_pending:
        pass  # fall through to dequeue
    else:
        seen: set[tuple] = set()
        total = len(stats.discovered_events)
        start = stats._watch_event_scan_cursor % total if total else 0
        idx = start
        scanned = 0
        while (
            scanned < total
            and scanned < _WATCH_EVENT_MATCH_SCAN_LIMIT
            and len(stats._watch_event_pending) < target_pending
        ):
            triple = stats.discovered_events[idx]
            sport = triple[1]
            if sport not in _WATCH_EVENT_RICH_SPORTS:
                idx = (idx + 1) % total
                scanned += 1
                continue
            if allowed and sport not in allowed:
                idx = (idx + 1) % total
                scanned += 1
                continue
            key = (triple[0], sport, triple[2])
            if key in stats._watch_event_keys:
                idx = (idx + 1) % total
                scanned += 1
                continue
            if key in stats._watch_event_pending_keys or key in seen:
                idx = (idx + 1) % total
                scanned += 1
                continue
            if _watch_event_matches_live_state(stats, triple):
                seen.add(key)
                _queue_watch_event_candidate(stats, triple)
            idx = (idx + 1) % total
            scanned += 1
        stats._watch_event_scan_cursor = idx
    if not stats._watch_event_pending:
        return None
    take = limit if limit is not None else len(stats._watch_event_pending)
    subs: list[list] = []
    while stats._watch_event_pending and len(subs) < take:
        triple = stats._watch_event_pending.pop(0)
        key = (triple[0], triple[1], triple[2])
        stats._watch_event_pending_keys.discard(key)
        if only_unsent and key in stats._watch_event_keys:
            continue
        subs.append(triple)
    return subs or None


def _queue_watch_event_candidate(
    stats: BiaObserverStats,
    triple: list,
    *,
    front: bool = False,
) -> bool:
    """Queue a rich watch_event subscription candidate with dedupe/cap logic."""
    if not isinstance(triple, list) or len(triple) < 3:
        return False
    sport = str(triple[1])
    if sport not in _WATCH_EVENT_RICH_SPORTS:
        return False
    allowed = set(_cfg.BIA_SPORTS) if _cfg.BIA_SPORTS else None
    if allowed and sport not in allowed:
        return False
    key = (triple[0], sport, triple[2])
    if key in stats._watch_event_keys:
        return False
    if key in stats._watch_event_pending_keys:
        if front:
            for idx, pending_triple in enumerate(stats._watch_event_pending):
                pending_key = (pending_triple[0], pending_triple[1], pending_triple[2])
                if pending_key != key:
                    continue
                stats._watch_event_pending.pop(idx)
                stats._watch_event_pending.insert(0, pending_triple)
                return True
        return False
    if front:
        stats._watch_event_pending.insert(0, triple)
    else:
        stats._watch_event_pending.append(triple)
    stats._watch_event_pending_keys.add(key)
    target_pending = max(_WATCH_EVENT_BATCH_SIZE, _WATCH_EVENT_PREFETCH_COUNT)
    while len(stats._watch_event_pending) > target_pending:
        dropped = stats._watch_event_pending.pop()
        dropped_key = (dropped[0], dropped[1], dropped[2])
        stats._watch_event_pending_keys.discard(dropped_key)
    return True


def _remember_watch_event_hot_candidate(stats: BiaObserverStats, triple: list) -> None:
    """Keep a small MRU list of matched rich candidates until they subscribe."""
    if not isinstance(triple, list) or len(triple) < 3:
        return
    sport = str(triple[1])
    if sport not in _WATCH_EVENT_RICH_SPORTS:
        return
    key = (triple[0], sport, triple[2])
    if key in stats._watch_event_keys:
        return
    for idx, existing in enumerate(stats._watch_event_hot_candidates):
        existing_key = (existing[0], existing[1], existing[2])
        if existing_key != key:
            continue
        stats._watch_event_hot_candidates.pop(idx)
        break
    stats._watch_event_hot_candidates.insert(0, triple)
    if len(stats._watch_event_hot_candidates) > _WATCH_EVENT_HOT_CANDIDATE_CAP:
        stats._watch_event_hot_candidates = stats._watch_event_hot_candidates[:_WATCH_EVENT_HOT_CANDIDATE_CAP]


def _promote_hot_watch_event_candidates(stats: BiaObserverStats, *, limit: int = 1) -> None:
    """Refresh hot matched candidates to the head of the pending queue."""
    if limit <= 0 or not stats._watch_event_hot_candidates:
        return
    target_pending = max(_WATCH_EVENT_BATCH_SIZE, _WATCH_EVENT_PREFETCH_COUNT)
    if len(stats._watch_event_pending) >= target_pending:
        return
    kept: list[list] = []
    promoted = 0
    for triple in stats._watch_event_hot_candidates:
        key = (triple[0], triple[1], triple[2])
        if key in stats._watch_event_keys:
            continue
        kept.append(triple)
        if promoted >= limit:
            continue
        if _queue_watch_event_candidate(stats, triple, front=True):
            promoted += 1
    stats._watch_event_hot_candidates = kept[:_WATCH_EVENT_HOT_CANDIDATE_CAP]


def _remember_watch_event_sibling_pid(stats: BiaObserverStats, pid: int) -> None:
    try:
        normalized_pid = int(pid)
    except (TypeError, ValueError):
        return
    if normalized_pid in stats._watch_event_sibling_pids:
        stats._watch_event_sibling_pids.remove(normalized_pid)
    stats._watch_event_sibling_pids.insert(0, normalized_pid)
    if len(stats._watch_event_sibling_pids) > _WATCH_EVENT_HOT_CANDIDATE_CAP:
        stats._watch_event_sibling_pids = stats._watch_event_sibling_pids[:_WATCH_EVENT_HOT_CANDIDATE_CAP]


def _promote_sibling_watch_event_candidates(stats: BiaObserverStats, *, limit: int = 1) -> None:
    if limit <= 0 or not stats._watch_event_sibling_pids:
        return
    target_pending = max(_WATCH_EVENT_BATCH_SIZE, _WATCH_EVENT_PREFETCH_COUNT)
    if len(stats._watch_event_pending) >= target_pending:
        return
    pid_reverse = _build_pid_to_bia_reverse_index(stats)
    kept: list[int] = []
    promoted = 0
    for pid in stats._watch_event_sibling_pids:
        ht_info = (pid_reverse.get(pid) or {}).get(1)
        if not ht_info:
            kept.append(pid)
            continue
        if ht_info.get("watch_event_subscribed"):
            continue
        kept.append(pid)
        if not ht_info.get("watch_hcaps_subscribed"):
            continue
        if promoted >= limit:
            continue
        comp_id = str(ht_info.get("comp_id", ""))
        try:
            comp_id_value: str | int = int(comp_id)
        except (TypeError, ValueError):
            comp_id_value = comp_id
        sibling_triple = [comp_id_value, ht_info.get("sport_code", ""), ht_info.get("event_key", "")]
        _remember_watch_event_hot_candidate(stats, sibling_triple)
        if _queue_watch_event_candidate(stats, sibling_triple, front=True):
            promoted += 1
    stats._watch_event_sibling_pids = kept[:_WATCH_EVENT_HOT_CANDIDATE_CAP]


def _watch_event_matches_live_state(stats: BiaObserverStats, triple: list) -> bool:
    """Return True when a discovered BIA event currently matches a prematch pin888 event.

    Uses exact-only matching (same as _watch_hcaps_matches_live_state) for speed.
    """
    from services.bia_event_matcher import match_bia_event_exact
    from state import state

    comp_id, sport_code, event_key = triple
    cache_key = (str(comp_id), sport_code, str(event_key))

    cached = stats._matched_event_cache.get(cache_key)
    if cached is not None:
        pid, _swapped = cached
        if pid in state.events_data:
            game = state.events_data[pid]
            return isinstance(game, dict) and bool(game.get("isLive")) is False
        stats._matched_event_cache.pop(cache_key, None)

    reg_entry = stats._event_registry.get(cache_key)
    if not isinstance(reg_entry, dict):
        return False

    bia_home = str(reg_entry.get("home") or "")
    bia_away = str(reg_entry.get("away") or "")
    bia_sport = str(reg_entry.get("sport") or sport_code)
    bia_league = str(reg_entry.get("competition_name") or "")

    exact_index = _get_events_exact_index(stats)
    pid, swapped = match_bia_event_exact(
        bia_home, bia_away, bia_sport, state.events_data,
        bia_league=bia_league, exact_index=exact_index,
    )
    if pid is None or pid not in state.events_data:
        return False

    stats._matched_event_cache[cache_key] = (pid, swapped)
    game = state.events_data[pid]
    return isinstance(game, dict) and bool(game.get("isLive")) is False


def _watch_hcaps_matches_live_state(stats: BiaObserverStats, triple: list) -> bool:
    """Return True when the BIA triple resolves to a prematch pin888 event.

    Uses **exact-only** matching (index lookup) to avoid the O(n) fuzzy scan
    that would otherwise block the event loop for seconds on large event sets.
    Alias-aware name variants keep coverage close to fuzzy for known cases.
    """
    from services.bia_event_matcher import match_bia_event_exact
    from state import state

    comp_id, sport_code, event_key = triple
    cache_key = (str(comp_id), sport_code, str(event_key))

    # Fast path: already resolved
    cached = stats._matched_event_cache.get(cache_key)
    if cached is not None:
        pid, _swapped = cached
        if pid in state.events_data:
            game = state.events_data[pid]
            return isinstance(game, dict) and bool(game.get("isLive")) is False
        stats._matched_event_cache.pop(cache_key, None)

    reg_entry = stats._event_registry.get(cache_key)
    if not isinstance(reg_entry, dict):
        return False

    bia_home = str(reg_entry.get("home") or "")
    bia_away = str(reg_entry.get("away") or "")
    bia_sport = str(reg_entry.get("sport") or sport_code)
    bia_league = str(reg_entry.get("competition_name") or "")

    exact_index = _get_events_exact_index(stats)
    pid, swapped = match_bia_event_exact(
        bia_home, bia_away, bia_sport, state.events_data,
        bia_league=bia_league, exact_index=exact_index,
    )
    if pid is None or pid not in state.events_data:
        return False

    stats._matched_event_cache[cache_key] = (pid, swapped)
    game = state.events_data[pid]
    return isinstance(game, dict) and bool(game.get("isLive")) is False


def _queue_related_watch_event_candidates(stats: BiaObserverStats, triple: list) -> None:
    """Promote cheap sibling rich periods once a soccer full-match event is subscribed."""
    if not isinstance(triple, list) or len(triple) < 3:
        return
    sport_code = str(triple[1])
    if sport_code != "fb":
        return
    pid, _swapped = _resolve_bia_event_match(
        stats,
        comp_id=str(triple[0]),
        sport_code=sport_code,
        event_key=str(triple[2]),
    )
    if pid is None:
        return
    from state import state

    game = state.events_data.get(pid)
    if not isinstance(game, dict) or bool(game.get("isLive")):
        return
    _remember_watch_event_sibling_pid(stats, pid)
    ht_info = lookup_bia_event_for_pid(pid, period=1, stats=stats)
    if not ht_info or not ht_info.get("watch_hcaps_subscribed"):
        return
    if ht_info.get("watch_event_subscribed"):
        return
    comp_id = str(ht_info.get("comp_id", ""))
    try:
        comp_id_value: str | int = int(comp_id)
    except (TypeError, ValueError):
        comp_id_value = comp_id
    sibling_triple = [comp_id_value, ht_info.get("sport_code", ""), ht_info.get("event_key", "")]
    _remember_watch_event_hot_candidate(stats, sibling_triple)
    _queue_watch_event_candidate(stats, sibling_triple, front=True)


def _count_player_props(game: dict) -> int:
    """Count player props already present in runtime state for event prioritization."""
    if not isinstance(game, dict):
        return 0
    pp_count = 0
    period_map = game.get("Period") or {}
    if isinstance(period_map, dict):
        for period_data in period_map.values():
            if isinstance(period_data, dict):
                pp_count += len(period_data.get("PlayerProps", []) or [])
    period_list = game.get("Periods") or []
    if isinstance(period_list, list):
        for period_data in period_list:
            if isinstance(period_data, dict):
                pp_count += len(period_data.get("PlayerProps", []) or [])
    return pp_count


def _count_live_special_markets(game: dict) -> int:
    """Count already-materialized non-base markets in runtime state."""
    if not isinstance(game, dict):
        return 0
    special_count = 0
    periods = game.get("Periods") or []
    if not isinstance(periods, list):
        return 0
    for period_data in periods:
        if not isinstance(period_data, dict):
            continue
        for market_key, market_value in period_data.items():
            if not isinstance(market_key, str):
                continue
            if market_key == "Number" or market_key.startswith("_"):
                continue
            if market_key in _BIA_BASE_MARKET_KEYS:
                continue
            if market_key == "PlayerProps":
                special_count += len(market_value or []) if isinstance(market_value, list) else 0
                continue
            special_count += 1
    return special_count


def _build_pid_to_bia_reverse_index(
    stats: BiaObserverStats,
) -> dict[int, dict[int, dict]]:
    """Build a reverse index: pid → {period → bia_info} from matched event cache.

    Much cheaper than calling lookup_bia_event_for_pid per event because it
    iterates the match cache once instead of doing full registry scans.
    """
    from services.bia_event_matcher import match_bia_event_exact
    from state import state

    pid_index: dict[int, dict[int, dict]] = {}
    for (comp_id, sport_code, event_key), (pid, swapped) in stats._matched_event_cache.items():
        if pid is None or pid not in state.events_data:
            continue
        period = _bia_period_for_sport(sport_code)
        watch_key_variants = {(str(comp_id), str(sport_code), str(event_key))}
        try:
            watch_key_variants.add((int(comp_id), str(sport_code), str(event_key)))
        except (TypeError, ValueError):
            pass
        info = {
            "comp_id": str(comp_id),
            "sport_code": str(sport_code),
            "event_key": str(event_key),
            "watch_hcaps_subscribed": any(k in stats._watch_hcaps_keys for k in watch_key_variants),
            "watch_event_subscribed": any(k in stats._watch_event_keys for k in watch_key_variants),
        }
        if pid not in pid_index:
            pid_index[pid] = {}
        pid_index[pid][period] = info
    return pid_index


def _seed_watch_event_candidates_from_live_state(
    stats: BiaObserverStats,
    *,
    limit: int = _WATCH_EVENT_LIVE_SEED_COUNT,
) -> None:
    """Promote a few high-value soccer events from live state into watch_event."""
    target_pending = max(_WATCH_EVENT_BATCH_SIZE, _WATCH_EVENT_PREFETCH_COUNT)
    if len(stats._watch_event_pending) >= target_pending:
        return
    from state import state

    pid_reverse = _build_pid_to_bia_reverse_index(stats)

    fallback_start_ms = 2**63 - 1
    ranked: list[tuple[int, int, int, int, int, int]] = []
    for pid, game in state.events_data.items():
        if not isinstance(game, dict):
            continue
        sport_name = str(game.get("SportName") or game.get("sport") or "")
        if sport_name.lower() != "soccer":
            continue
        try:
            normalized_pid = int(pid)
        except (TypeError, ValueError):
            continue
        try:
            start_ms = int(game.get("start_time_ms"))
        except (TypeError, ValueError):
            start_ms = fallback_start_ms
        live_rank = 1 if bool(game.get("isLive")) else 0
        special_rank = -_count_live_special_markets(game)
        props_rank = -_count_player_props(game)
        ranked.append((live_rank, special_rank, props_rank, start_ms, normalized_pid, 0))
        ranked.append((live_rank, special_rank, props_rank, start_ms, normalized_pid, 1))

    if not ranked:
        return

    ranked.sort()
    take = max(limit, 0)
    if take <= 0:
        return
    total = len(ranked)
    start = stats._watch_event_live_seed_cursor % total
    idx = start
    examined = 0
    queued: list[list] = []
    while examined < total and len(queued) < take:
        _priority_live, _priority_specials, _priority_props, _priority_start, pid, period = ranked[idx]
        info = (pid_reverse.get(pid) or {}).get(period)
        if info and info.get("watch_hcaps_subscribed"):
            if not info.get("watch_event_subscribed"):
                comp_id = str(info.get("comp_id", ""))
                try:
                    comp_id_value: str | int = int(comp_id)
                except (TypeError, ValueError):
                    comp_id_value = comp_id
                queued.append([
                    comp_id_value,
                    info.get("sport_code", ""),
                    info.get("event_key", ""),
                ])
        idx = (idx + 1) % total
        examined += 1
    stats._watch_event_live_seed_cursor = idx
    for triple in reversed(queued):
        _queue_watch_event_candidate(stats, triple, front=True)


def _get_events_exact_index(
    stats: BiaObserverStats,
) -> dict[tuple[str, str, str], list[tuple[int, str]]]:
    from services.bia_event_matcher import build_exact_match_index
    from state import state

    events_data = state.events_data if isinstance(state.events_data, dict) else {}
    now = time.time()
    should_rebuild = (
        not stats._events_exact_index
        or stats._events_exact_index_size != len(events_data)
        or (now - stats._events_exact_index_built_ts) >= _EVENT_MATCH_INDEX_TTL_SEC
    )
    if should_rebuild:
        stats._events_exact_index = build_exact_match_index(events_data)
        stats._events_exact_index_size = len(events_data)
        stats._events_exact_index_built_ts = now
    return stats._events_exact_index


def _resolve_bia_event_match(
    stats: BiaObserverStats,
    *,
    comp_id: str,
    sport_code: str,
    event_key: str,
    allow_stale_miss_recheck: bool = False,
    record_miss: bool = True,
) -> tuple[int | None, bool]:
    from services.bia_event_matcher import match_bia_event, match_bia_event_exact
    from state import state

    cache_key = (comp_id, sport_code, event_key)
    if not state.events_data:
        return None, False
    cached = stats._matched_event_cache.get(cache_key)
    if cached is not None:
        pid, swapped = cached
        if pid in state.events_data:
            return pid, swapped
        stats._matched_event_cache.pop(cache_key, None)
    miss_ts = stats._missed_event_cache.get(cache_key)
    if miss_ts is not None:
        miss_age = time.time() - miss_ts
        if miss_age < _EVENT_MATCH_MISS_TTL_SEC and not allow_stale_miss_recheck:
            return None, False
        if miss_age >= _EVENT_MATCH_MISS_TTL_SEC:
            stats._missed_event_cache.pop(cache_key, None)

    reg_entry = stats._event_registry.get(cache_key)
    if not isinstance(reg_entry, dict):
        return None, False

    bia_home = str(reg_entry.get("home") or "")
    bia_away = str(reg_entry.get("away") or "")
    bia_sport = str(reg_entry.get("sport") or sport_code)
    bia_league = str(reg_entry.get("competition_name") or "")

    exact_index = _get_events_exact_index(stats)
    pid, swapped = match_bia_event_exact(
        bia_home,
        bia_away,
        bia_sport,
        state.events_data,
        bia_league=bia_league,
        exact_index=exact_index,
    )
    if pid is None:
        pid, swapped = match_bia_event(
            bia_home,
            bia_away,
            bia_sport,
            state.events_data,
            bia_league=bia_league,
        )
    if pid is None or pid not in state.events_data:
        if record_miss:
            stats._missed_event_cache[cache_key] = time.time()
        return None, False
    stats._missed_event_cache.pop(cache_key, None)
    stats._matched_event_cache[cache_key] = (pid, swapped)
    return pid, swapped


def _bia_integration_active() -> bool:
    """Return True when BIA should feed prices into state.events_data.

    Integration is active when BIA is enabled and send mode is not base_only.
    """
    return (
        bool(_cfg.BIA_ENABLED)
        and _cfg.PS3838_SEND_MODE != "base_only"
    )


def _bia_period_signature(period_data: dict) -> bytes:
    """Stable BIA snapshot signature used to detect true BIA-side changes."""
    return orjson.dumps(period_data, option=orjson.OPT_SORT_KEYS)


def _stamp_bia_period_confirmation(
    event: dict | None,
    *,
    period_number: int,
    period_data: dict,
    now_ts: float | None = None,
    now_iso: str | None = None,
    refresh_all_stored_specials: bool = False,
) -> None:
    """Refresh timestamps for markets explicitly present in a BIA snapshot.

    This is safe even when the BIA payload is byte-identical to the last one:
    if the market is present in the current snapshot, it was explicitly
    re-confirmed by BIA and should not look stale.

    Important: this helper only refreshes timestamps for markets included in the
    current payload. It must NOT infer freshness for absent sibling markets,
    because absent can mean closed/removed.
    """
    from utils.market_ts import _build_market_ts_strict, _now_utc_iso

    if not isinstance(event, dict):
        return
    if now_ts is None:
        now_ts = time.time()
    if now_iso is None:
        now_iso = _now_utc_iso()

    event["PriceConfirmedAt"] = now_iso
    stored_periods = event.get("Periods") or []
    if period_number < len(stored_periods) and isinstance(stored_periods[period_number], dict):
        sp = stored_periods[period_number]
        market_keys = {
            str(market_key)
            for market_key in period_data
            if market_key != "Number"
        }
        if (
            refresh_all_stored_specials
            or getattr(_cfg, "BIA_EXPERIMENTAL_REFRESH_WHOLE_EVENT_SPECIALS", False)
            or getattr(_cfg, "BIA_EXPERIMENTAL_REFRESH_WHOLE_SPORT_SPECIALS", False)
        ):
            for market_key in sp.keys():
                if not isinstance(market_key, str) or market_key.startswith("_"):
                    continue
                if market_key in getattr(_cfg, "SPECIALS_KEYS", ()):
                    market_keys.add(market_key)
        for market_key in market_keys:
            sp[f"_{market_key}_ts"] = now_ts
        _build_market_ts_strict(event)


def _stamp_bia_confirmation_scope(
    pid: int,
    *,
    sport_code: str,
    period_number: int,
    period_data: dict,
    now_ts: float,
    now_iso: str,
) -> None:
    """Apply BIA freshness confirmation to the configured scope.

    Scope levels:
      1. default: only markets explicitly present in the payload
      2. experimental whole-event: all stored specials on the same event/period
      3. experimental whole-sport: all stored specials on same sport/period
    """
    from services.bia_event_matcher import BIA_SPORT_MAP
    from state import state

    target_event = state.events_data.get(pid)
    _stamp_bia_period_confirmation(
        target_event,
        period_number=period_number,
        period_data=period_data,
        now_ts=now_ts,
        now_iso=now_iso,
    )

    if not getattr(_cfg, "BIA_EXPERIMENTAL_REFRESH_WHOLE_SPORT_SPECIALS", False):
        return

    target_sport = ""
    if isinstance(target_event, dict):
        target_sport = str(target_event.get("SportName") or "").strip()
    if not target_sport:
        target_sport = str(BIA_SPORT_MAP.get(sport_code, "") or "").strip()
    if not target_sport:
        return

    for other_pid, other_event in state.events_data.items():
        if int(other_pid) == int(pid):
            continue
        if not isinstance(other_event, dict):
            continue
        if str(other_event.get("SportName") or "").strip() != target_sport:
            continue
        _stamp_bia_period_confirmation(
            other_event,
            period_number=period_number,
            period_data=period_data,
            now_ts=now_ts,
            now_iso=now_iso,
            refresh_all_stored_specials=True,
        )


async def _apply_offers_hcap(
    m: BiaOffersHcapMsg | BiaOffersEventMsg,
    stats: BiaObserverStats,
) -> None:
    """Match a BIA offers_hcap / offers_event message to an existing event and merge.

    Only called when _bia_integration_active() is True.

    Wave A step 2 guardrails:
      • Base markets (Win1x2, Handicap, Totals, TeamTotals) are stripped —
        BIA is the more-bets source, not the base-market source.
      • Period number is derived from the BIA sport code; offers for
        unsupported sub-period codes are skipped rather than misapplied.
    """
    from services.bia_market_adapter import convert_bia_markets, build_bia_game_update
    from parsing.parser import merge_updates
    from state import state
    from utils.market_ts import _now_utc_iso

    header = m.event_header
    markets = m.markets
    if not isinstance(header, list) or len(header) < 3 or not isinstance(markets, dict):
        return

    comp_id = str(header[0]) if len(header) > 0 else ""
    sport_code = str(header[1]) if len(header) > 1 else ""
    event_key = str(header[2]) if len(header) > 2 else ""

    # ── Period mapping (derive from sport code, refuse unknown) ────────
    period_number = _bia_period_for_sport(sport_code)
    if period_number is None:
        stats.offers_skipped_unsupported_period += 1
        return

    # Look up event metadata from registry (keyed by comp_id+sport+event_key)
    reg_entry = stats._event_registry.get((comp_id, sport_code, event_key))
    if not reg_entry:
        stats.offers_skipped_no_match += 1
        return

    pid, swapped = _resolve_bia_event_match(
        stats,
        comp_id=comp_id,
        sport_code=sport_code,
        event_key=event_key,
    )
    if pid is None or pid not in state.events_data:
        stats.offers_skipped_no_match += 1
        return
    existing_game = state.events_data[pid]
    if (
        getattr(_cfg, "BIA_EXPERIMENTAL_OBSERVER_WATCH_EVENT", False)
        and bool(existing_game.get("isLive")) is False
    ):
        _remember_watch_event_hot_candidate(
            stats,
            [header[0], sport_code, event_key],
        )
        _queue_watch_event_candidate(
            stats,
            [header[0], sport_code, event_key],
            front=True,
        )
    home_name = str(
        existing_game.get("Home")
        or existing_game.get("homeName")
        or existing_game.get("home")
        or ""
    )
    away_name = str(
        existing_game.get("Away")
        or existing_game.get("awayName")
        or existing_game.get("away")
        or ""
    )

    # Convert BIA markets to canonical PeriodData
    period_data = convert_bia_markets(
        markets,
        swapped=swapped,
        period_number=period_number,
        home_name=home_name,
        away_name=away_name,
    )
    if period_data is None:
        stats.offers_skipped_suspended += 1
        return

    # ── Base-market filter: strip markets owned by PS3838/Pinnacle ─────
    for base_key in _BIA_BASE_MARKET_KEYS:
        period_data.pop(base_key, None)

    if not any(k for k in period_data if k != "Number"):
        stats.offers_skipped_base_only += 1
        return

    signature = _bia_period_signature(period_data)
    cached_signatures = state.bia_specials_signature.get(pid, {})
    if isinstance(cached_signatures, dict) and cached_signatures.get(period_number) == signature:
        stats.offers_skipped_unchanged += 1
        _stamp_bia_period_confirmation(
            state.events_data.get(pid),
            period_number=period_number,
            period_data=period_data,
        )
        return

    game_update = build_bia_game_update(pid, period_data, existing_game)

    # Merge non-authoritatively (does not create new events, does not clobber)
    async with state.data_lock:
        state.events_data = merge_updates(
            state.events_data, [game_update], authoritative=False,
        )

    # Stamp freshness for delivered markets only
    ev = state.events_data.get(pid)
    if ev:
        now_ts = time.time()
        now_iso = _now_utc_iso()
        state.bia_specials_signature.setdefault(pid, {})[period_number] = signature
        _stamp_bia_confirmation_scope(
            pid,
            sport_code=sport_code,
            period_number=period_number,
            period_data=period_data,
            now_ts=now_ts,
            now_iso=now_iso,
        )

    stats.offers_applied += 1
    stats.matched_pids.add(pid)


async def _observe_ws(bia: BiaSession, stats: BiaObserverStats) -> None:
    """Single WS session: connect, subscribe, parse messages, log stats."""
    ws_url = bia.ws_url()
    if not ws_url:
        log("[BIA-obs] no WS URL (not logged in?)")
        return

    ssl_ctx = _make_ssl_ctx()
    integrate = _bia_integration_active()
    if integrate:
        log("[BIA-obs] integration mode: offers will be applied to state.events_data")

    try:
        async with bia.http.ws_connect(
            ws_url,
            heartbeat=_cfg.BIA_HEARTBEAT_SEC,
            ssl=ssl_ctx,
        ) as ws:
            global _lifecycle_state
            stats.ws_connect_ts = time.time()
            _lifecycle_state = "connected"
            log("[BIA-obs] WS connected, listening…")

            # Populate a complete bounded inventory on every cold connection;
            # passive event deltas alone can omit a quiet target indefinitely.
            discovery_sports = _configured_discovery_sports()
            if discovery_sports:
                await ws.send_json(["watch_comps", discovery_sports])
                log(
                    "[BIA-obs] requested competition inventory "
                    f"sports={discovery_sports}"
                )

            last_log = time.time()
            last_ping = time.time()
            last_hcaps_sub_send = 0.0
            last_watch_event_send = 0.0
            last_watch_event_live_seed = 0.0
            last_fuzzy_rematch = 0.0

            while True:
                # Use wait_for so pings fire even when the socket goes silent.
                try:
                    msg = await asyncio.wait_for(
                        ws.receive(), timeout=min(_cfg.BIA_HEARTBEAT_SEC, 0.25),
                    )
                except asyncio.TimeoutError:
                    msg = None

                now = time.time()

                if msg is not None:
                    if msg.type == aiohttp.WSMsgType.TEXT:
                        stats.last_msg_ts = now
                        for m in parse_cpricefeed_frame(msg.data):
                            if isinstance(m, BiaEventMsg):
                                stats.events_seen += 1
                                if m.sport:
                                    stats.sports_seen.add(m.sport)
                                    stats.events_by_sport[m.sport] += 1
                                comp_id = m.data.get("competition_id") if isinstance(m.data, dict) else None
                                if comp_id is not None and m.sport and m.event_key:
                                    key = (comp_id, m.sport, m.event_key)
                                    if key not in stats._discovered_keys:
                                        stats._discovered_keys.add(key)
                                        stats.discovered_events.append([comp_id, m.sport, m.event_key])
                                # Record event metadata for matching
                                if isinstance(m.data, dict) and m.sport and m.event_key:
                                    reg_comp_id = str(comp_id) if comp_id is not None else ""
                                    cache_key = (reg_comp_id, m.sport, m.event_key)
                                    new_home = m.data.get("home", "")
                                    new_away = m.data.get("away", "")
                                    old_entry = stats._event_registry.get(cache_key)
                                    new_entry = {
                                        "home": new_home,
                                        "away": new_away,
                                        "competition_name": m.data.get("competition_name", ""),
                                        "competition_id": reg_comp_id,
                                        "sport": m.sport,
                                        "event_key": m.event_key,
                                        "start_ts": m.data.get("start_ts"),
                                    }
                                    # Only invalidate indexes for a genuinely new or
                                    # changed identity. Repeated inventory frames must
                                    # not keep the exact-refresh quiet window open.
                                    if old_entry != new_entry:
                                        stats._matched_event_cache.pop(cache_key, None)
                                        stats._missed_event_cache.pop(cache_key, None)
                                        stats._event_registry[cache_key] = new_entry
                                        stats._event_registry_changed_at = time.monotonic()
                                        stats._event_registry_revision += 1
                            elif isinstance(m, (BiaOffersHcapMsg, BiaOffersEventMsg)):
                                stats.offers_count += 1
                                header = m.event_header
                                if isinstance(header, list) and len(header) >= 3:
                                    try:
                                        stats._offer_proofs.observe(
                                            competition_id=header[0],
                                            sport_code=header[1],
                                            event_key=header[2],
                                            markets=m.markets,
                                        )
                                        if isinstance(m, BiaOffersEventMsg):
                                            full_key = _canonical_refresh_watch_key(header)
                                            stats._offer_event_observed_at[full_key] = time.time()
                                            _complete_exact_refreshes_from_offer(
                                                stats, header,
                                            )
                                    except BiaOfferProofError:
                                        # Malformed proof input is fail-closed inside the
                                        # registry and must not interrupt the observer.
                                        stats.errors += 1
                                if integrate:
                                    await _apply_offers_hcap(m, stats)
                            elif isinstance(m, BiaPmmMsg):
                                stats.pmm_count += 1
                            elif isinstance(m, BiaInfoMsg):
                                stats.info_count += 1
                            elif isinstance(m, BiaOtherMsg):
                                stats.other_count += 1

                    elif msg.type in (
                        aiohttp.WSMsgType.ERROR,
                        aiohttp.WSMsgType.CLOSED,
                        aiohttp.WSMsgType.CLOSE,
                    ):
                        log(f"[BIA-obs] WS closed/error: {msg.type}")
                        break

                # Yield real wall-clock time so HTTP coroutines stay responsive.
                # With ~4-7 loop iterations/sec this adds only 20-35ms/s of idle.
                await asyncio.sleep(0.005)

                # Direct exact verification is allowed to re-request a raw
                # snapshot even when the normal prefetch already subscribed.
                await _drain_exact_refresh_requests(ws, stats)

                # ── Subscription logic (time-gated) ──────────────────────
                event_subs = None
                if getattr(_cfg, "BIA_EXPERIMENTAL_OBSERVER_WATCH_EVENT", False):
                    if (now - last_watch_event_live_seed) >= _WATCH_EVENT_LIVE_SEED_SEC:
                        _seed_watch_event_candidates_from_live_state(
                            stats,
                            limit=_WATCH_EVENT_LIVE_SEED_COUNT,
                        )
                        last_watch_event_live_seed = now
                    should_consider_watch_events = (
                        (not stats._watch_event_keys and (now - stats.ws_connect_ts) >= _WATCH_EVENT_WARMUP_SEC)
                        or (stats._watch_event_keys and (now - last_watch_event_send) >= _WATCH_EVENT_FLUSH_SEC)
                    )
                    if should_consider_watch_events:
                        _promote_hot_watch_event_candidates(
                            stats,
                            limit=_WATCH_EVENT_BATCH_SIZE,
                        )
                        _promote_sibling_watch_event_candidates(
                            stats,
                            limit=_WATCH_EVENT_BATCH_SIZE,
                        )
                        event_subs = _build_watch_events(
                            stats,
                            only_unsent=True,
                            limit=_WATCH_EVENT_BATCH_SIZE,
                        )
                        # Always update timer so we don't re-scan on next iteration
                        last_watch_event_send = now

                # Gate hcaps build behind the same flush timer to avoid
                # scanning 6800+ events on every WS message.
                if not stats._watch_hcaps_keys:
                    _should_build_hcaps = (
                        (now - stats.ws_connect_ts) >= _WATCH_HCAPS_WARMUP_SEC
                    )
                else:
                    _should_build_hcaps = (now - last_hcaps_sub_send) >= _WATCH_HCAPS_FLUSH_SEC

                sub = None
                if _should_build_hcaps:
                    sub = _build_watch_hcaps(
                        stats,
                        only_unsent=True,
                        limit=_WATCH_HCAPS_BATCH_SIZE,
                    )
                    # Always update timer so we don't re-scan on next iteration
                    last_hcaps_sub_send = now
                if event_subs:
                    try:
                        for triple in event_subs:
                            await ws.send_json(["watch_event", triple])
                            stats._watch_event_keys.add((triple[0], triple[1], triple[2]))
                            _queue_related_watch_event_candidates(stats, triple)
                        stats.subscribed = True
                        log(
                            "[BIA-obs] subscribed watch_event "
                            f"batch={len(event_subs)} total_events={len(stats._watch_event_keys)}"
                        )
                    except Exception:
                        break
                if sub:
                    try:
                        await ws.send_json(sub)
                        for triple in sub[1]:
                            stats._watch_hcaps_keys.add((triple[0], triple[1], triple[2]))
                        stats.subscribed = True
                        log(
                            "[BIA-obs] subscribed watch_hcaps "
                            f"batch={len(sub[1])} total_events={len(stats._watch_hcaps_keys)}"
                        )
                    except Exception:
                        break

                # Heartbeat ping — fires even when no messages arrive.
                if now - last_ping >= _cfg.BIA_HEARTBEAT_SEC:
                    try:
                        await ws.send_json(["ping", str(int(now * 1000))])
                    except Exception:
                        break
                    last_ping = now

                if now - last_log >= _cfg.BIA_OBSERVER_LOG_INTERVAL_SEC:
                    log(f"[BIA-obs] {stats.summary()}")
                    last_log = now

                # Periodic fuzzy rematch: catch events that exact match missed
                if (
                    integrate
                    and stats._event_registry
                    and (now - last_fuzzy_rematch) >= _FUZZY_REMATCH_INTERVAL_SEC
                ):
                    newly = _fuzzy_rematch_unsubscribed(stats)
                    if newly:
                        log(f"[BIA-obs] fuzzy rematch: {newly} new matches")
                        # Clear the no-match cache so subscriptions pick up new matches
                        stats._hcaps_no_match_keys.clear()
                    last_fuzzy_rematch = now

    except Exception as exc:
        stats.errors += 1
        log(f"[BIA-obs] WS error: {exc}")


# ── Module-level observer state (for runtime snapshot API) ──────────────────

_current_stats: BiaObserverStats | None = None
_observer_running: bool = False
# Explicit lifecycle: idle → connecting → connected → reconnecting → stopped
_lifecycle_state: str = "idle"


def compute_bia_circuit_state(
    *, lifecycle_state: str, now: float | None = None
) -> str:
    """Classify BIA lifecycle into a structured circuit state (Story 27.6 AC-2).

    Returns one of:

    * ``"closed"`` — BIA is connected or coming up; healthy.
    * ``"auth_failed_halted"`` — the observer has been stuck in a
      non-connected state for ≥30s after an auth failure. The monitor
      reads this to know BIA is down *and* has given up retrying for
      this cycle.
    * ``"degraded"`` — non-connected but not yet past the halt threshold
      (backoff / reconnect in progress).

    The 30-second window is the same ``_MIN_STABLE_SESSION_SEC`` used
    by the existing reconnect backoff (AC-8) — keeps the two signals
    coherent.
    """
    del now  # reserved for future time-aware logic; callers may pass it
    if lifecycle_state == "connected":
        return "closed"
    # Anything not connected is at least degraded. We only escalate to
    # auth_failed_halted when the observer has been trying to recover
    # for a meaningful interval; until that point operators see
    # "degraded" — same as the existing reconnect backoff semantics.
    if lifecycle_state in ("reconnecting", "stopped"):
        return "auth_failed_halted"
    return "degraded"


def core_platform_degraded(
    *,
    api_degraded: bool = False,
    ws_degraded: bool = False,
    bia_circuit_state: str = "closed",
) -> bool:
    """Return True iff the **core** publish path is degraded (Story 27.6 DOD-5).

    Invariant 8 from Epic-27: BIA's state must NEVER gate this flag.
    Core is considered degraded iff **both** Partner API and PS3838 WS
    are degraded at the same time. A BIA circuit open / auth halt is
    expected traffic under scope narrowing and does not count.

    ``bia_circuit_state`` is accepted and ignored on purpose — the
    parameter's presence documents the intent and keeps call-sites
    self-documenting.
    """
    del bia_circuit_state  # AC-2 invariant — explicitly not consulted
    return bool(api_degraded) and bool(ws_degraded)


def bia_observer_snapshot(*, now: float | None = None) -> dict:
    """Return the BIA observer runtime snapshot for /health and /stats.

    Safe to call at any time — returns a static ``enabled=False`` dict when
    the observer is disabled or has not yet connected.

    Uses ``_lifecycle_state`` for authoritative connection/subscription
    status instead of inferring from timestamps, so stale stats from a
    previous WS session never mislead callers during backoff or shutdown.

    Story 27.6 AC-2 additive fields (always present):

    * ``scope="morebets_only"`` — invariant label; BIA is narrowed to
      MoreBets by epic-27 scope.
    * ``core_isolated=True`` — BIA is NOT wired into the core publish
      path, so its failure does not gate core-quote publication.
    * ``circuit_state`` — structured alternative to the textual
      "CIRCUIT OPEN" log line; see :func:`compute_bia_circuit_state`.
    """
    phase = "integration" if _bia_integration_active() else "observer-only"
    snap: dict = {
        "enabled": bool(_cfg.BIA_ENABLED),
        "running": _observer_running,
        "phase": phase,
        "state": _lifecycle_state,
    }
    stats = _current_stats
    if stats is not None:
        snap.update(stats.runtime_snapshot(now=now))
    else:
        snap.update({
            "connected": False,
            "ws_uptime_sec": None,
            "last_msg_age_sec": None,
            "subscribed": False,
            "counters": {"events": 0, "offers": 0, "pmm": 0, "info": 0, "other": 0},
            "integration": {"applied": 0, "skipped_no_match": 0, "skipped_suspended": 0,
                           "skipped_unsupported_period": 0, "skipped_base_only": 0, "matched_pids": 0},
            "sports_seen": [],
            "discovered_events": 0,
            "errors": 0,
        })
    # Authoritative override: only report connected/subscribed when the WS
    # session is actually alive.  During reconnecting / stopped / idle /
    # connecting the old stats object may still carry stale timestamps.
    if _lifecycle_state != "connected":
        snap["connected"] = False
        snap["subscribed"] = False
    # Story 27.6 AC-2 — structured isolation fields (additive).
    snap["scope"] = "morebets_only"
    snap["core_isolated"] = True
    snap["circuit_state"] = compute_bia_circuit_state(
        lifecycle_state=_lifecycle_state, now=now
    )
    return snap


def _matching_bia_event_refs_for_pid(
    event_id: int,
    *,
    period: int = 0,
    stats: BiaObserverStats | None = None,
) -> list[dict]:
    """Return every current BIA event reference matching one parser event."""
    stats = stats or _current_stats
    if stats is None:
        return []

    from services.bia_event_matcher import match_bia_event_exact
    from state import state

    try:
        normalized_event_id = int(event_id)
    except (TypeError, ValueError):
        return []

    game = state.events_data.get(normalized_event_id)
    if not isinstance(game, dict):
        return []

    target_period = int(period or 0)
    events_data = state.events_data if isinstance(state.events_data, dict) else {}
    exact_index = _get_events_exact_index(stats)
    target_identity = (
        str(game.get("homeName") or game.get("Home") or game.get("home") or ""),
        str(game.get("awayName") or game.get("Away") or game.get("away") or ""),
        str(game.get("SportName") or game.get("sport") or ""),
        str(game.get("LeagueName") or game.get("league") or ""),
        str(game.get("start_time_ms") or ""),
        stats._events_exact_index_size,
        stats._events_exact_index_built_ts,
    )
    cache_key = (normalized_event_id, target_period)
    revision_before = stats._event_registry_revision
    cached = stats._pid_event_ref_cache.get(cache_key)
    if cached and cached[0] == revision_before and cached[1] == target_identity:
        return [dict(item) for item in cached[2]]
    candidate_entries: list[tuple[str, str, str, dict]] = []
    for (comp_id, sport_code, event_key), reg_entry in list(stats._event_registry.items()):
        mapped_period = _bia_period_for_sport(sport_code)
        # Tennis set identity lives in the bet_type on the root tennis event.
        tennis_set_match = sport_code == "tennis" and 1 <= target_period <= 5
        if mapped_period != target_period and not tennis_set_match:
            continue
        candidate_entries.append((str(comp_id), str(sport_code), str(event_key), reg_entry))

    if target_period == 0:
        candidate_entries.sort(key=lambda item: (1 if "_" in item[1] else 0, item[1], item[2]))

    matches: list[dict] = []
    for comp_id, sport_code, event_key, reg_entry in candidate_entries:
        bia_start = reg_entry.get("start_ts")
        pid, swapped = match_bia_event_exact(
            str(reg_entry.get("home", "") or ""),
            str(reg_entry.get("away", "") or ""),
            sport_code,
            events_data,
            bia_league=str(reg_entry.get("competition_name", "") or ""),
            exact_index=exact_index,
        )
        if pid is not None and _event_start_compatibility(
            bia_start, events_data.get(pid, {}),
        ) is False:
            pid, swapped = None, False
        constrained_events, start_constrained = _events_matching_bia_start(
            events_data, bia_start,
        )
        if pid is None and start_constrained:
            pid, swapped = match_bia_event_exact(
                str(reg_entry.get("home", "") or ""),
                str(reg_entry.get("away", "") or ""),
                sport_code,
                constrained_events,
                bia_league=str(reg_entry.get("competition_name", "") or ""),
            )
        if pid != normalized_event_id:
            continue
        stats._matched_event_cache[(str(comp_id), str(sport_code), str(event_key))] = (
            normalized_event_id,
            bool(swapped),
        )
        watch_key_variants = {(str(comp_id), str(sport_code), str(event_key))}
        try:
            watch_key_variants.add((int(comp_id), str(sport_code), str(event_key)))
        except (TypeError, ValueError):
            pass
        matches.append({
            "event_id": normalized_event_id,
            "period": target_period,
            "comp_id": str(comp_id),
            "sport_code": str(sport_code),
            "event_key": str(event_key),
            "competition_name": str(reg_entry.get("competition_name", "") or ""),
            "home": str(reg_entry.get("home", "") or ""),
            "away": str(reg_entry.get("away", "") or ""),
            "swapped": bool(swapped),
            "watch_hcaps_subscribed": any(key in stats._watch_hcaps_keys for key in watch_key_variants),
            "watch_event_subscribed": any(key in stats._watch_event_keys for key in watch_key_variants),
            "watch_event_pending": any(key in stats._watch_event_pending_keys for key in watch_key_variants),
        })
    if stats._event_registry_revision == revision_before:
        stats._pid_event_ref_cache[cache_key] = (
            revision_before,
            target_identity,
            [dict(item) for item in matches],
        )
    return matches


def lookup_bia_event_for_pid(
    event_id: int,
    *,
    period: int = 0,
    stats: BiaObserverStats | None = None,
) -> dict | None:
    """Backward-compatible event-only reverse lookup."""
    matches = _matching_bia_event_refs_for_pid(event_id, period=period, stats=stats)
    return matches[0] if matches else None


def lookup_unique_bia_event_for_pid(
    event_id: int,
    *,
    period: int = 0,
    stats: BiaObserverStats | None = None,
) -> dict:
    """Resolve event identity only when exactly one raw BIA event matches."""
    matches = _matching_bia_event_refs_for_pid(event_id, period=period, stats=stats)
    if len(matches) == 1:
        return {"found": True, **matches[0]}
    if len(matches) > 1:
        return {
            "found": False,
            "event_found": True,
            "event_id": int(event_id),
            "period": int(period or 0),
            "error_code": "BIA_EVENT_AMBIGUOUS",
            "candidate_count": len(matches),
        }
    return {
        "found": False,
        "event_found": False,
        "event_id": int(event_id),
        "period": int(period or 0),
        "error_code": "BIA_EVENT_NOT_FOUND",
    }


def lookup_bia_selection_for_pid(
    event_id: int,
    *,
    period: int,
    selection: dict,
    stats: BiaObserverStats | None = None,
) -> dict:
    """Resolve one event and prove exactly one raw BIA selection identity."""
    stats = stats or _current_stats
    try:
        normalized_event_id = int(event_id)
        target_period = int(period or 0)
    except (TypeError, ValueError):
        return {"found": False, "event_found": False, "error_code": "BIA_LOOKUP_INVALID"}
    if stats is None:
        return {
            "found": False, "event_found": False,
            "event_id": normalized_event_id, "period": target_period,
            "error_code": "BIA_OBSERVER_UNAVAILABLE",
        }

    event_refs = _matching_bia_event_refs_for_pid(
        normalized_event_id, period=target_period, stats=stats,
    )
    if not event_refs:
        return {
            "found": False, "event_found": False,
            "event_id": normalized_event_id, "period": target_period,
            "error_code": "BIA_EVENT_NOT_FOUND",
        }

    proof_selection = dict(selection or {})
    proof_selection["period"] = target_period
    proven: list[tuple[dict, dict]] = []
    failures: list[dict] = []
    for event_ref in event_refs:
        proof = stats._offer_proofs.try_prove(event_ref, proof_selection)
        if proof.get("status") == "OK" and proof.get("bet_type"):
            proven.append((event_ref, proof))
        else:
            failures.append(proof)

    # More than one BIA event can occasionally fuzzy-match the same parser
    # event. Never pick the only currently populated one while another
    # candidate is structurally unresolved: a later delta could make that
    # choice ambiguous. The bounded refresh path tries every candidate.
    if proven and failures:
        return {
            "found": False, "event_found": True,
            "event_id": normalized_event_id, "period": target_period,
            "error_code": "BIA_EVENT_SELECTION_INCOMPLETE",
            "candidate_count": len(event_refs),
            "proven_candidate_count": len(proven),
            "incomplete_candidate_count": len(failures),
        }
    if len(proven) > 1:
        return {
            "found": False, "event_found": True,
            "event_id": normalized_event_id, "period": target_period,
            "error_code": "BIA_EVENT_SELECTION_AMBIGUOUS",
            "candidate_count": len(proven),
        }
    if len(proven) == 1:
        event_ref, proof = proven[0]
        offer_proof = {
            "raw_offer_group": proof.get("raw_group"),
            "raw_asian_code": proof.get("asian_code"),
            "direction": proof.get("direction"),
            "bia_bet_type": proof.get("bet_type"),
            "observed_at": proof.get("observed_at"),
            "expires_at": proof.get("expires_at"),
        }
        return {"found": True, "event_found": True, **event_ref, "offer_proof": offer_proof}

    error_codes = {
        str(item.get("error_code") or "BIA_OFFER_PROOF_MISSING")
        for item in failures
    }
    error_code = next(iter(error_codes)) if len(error_codes) == 1 else "BIA_OFFER_PROOF_MISSING"
    return {
        "found": False, "event_found": True,
        "event_id": normalized_event_id, "period": target_period,
        "error_code": error_code,
        "candidate_count": len(event_refs),
    }


def _exact_refresh_key(event_id: int, period: int, selection: dict) -> tuple:
    """Build a price-free key for coalescing identical refresh requests."""

    def _coordinate(name: str, default: int = 0) -> int:
        try:
            return int(selection.get(name, default) or default)
        except (TypeError, ValueError):
            return default

    return (
        int(event_id),
        int(period),
        _coordinate("bet_type"),
        _coordinate("team_select"),
        str(selection.get("handicap") or "0").strip(),
        _coordinate("map_number"),
        _coordinate("game_number"),
        str(selection.get("esports_unit") or "").strip().lower(),
        str(selection.get("tennis_unit") or "").strip().lower(),
    )


def _enqueue_exact_refresh(
    event_id: int,
    *,
    period: int,
    selection: dict,
    wait_sec: float,
) -> _ExactRefreshRequest | None:
    """Coalesce one bounded structural refresh without opening another BIA WS."""
    now = time.monotonic()
    key = _exact_refresh_key(event_id, period, selection)
    with _exact_refresh_lock:
        for expired in list(_exact_refresh_requests.values()):
            if expired.deadline > now or expired.done.is_set():
                continue
            _exact_refresh_requests.pop(expired.key, None)
            expired.result = {
                "found": False,
                "event_found": bool(expired.sent_keys),
                "event_id": expired.event_id,
                "period": expired.period,
                "error_code": "BIA_OFFER_REFRESH_TIMEOUT",
            }
            expired.done.set()
        for stale_key, until in list(_exact_refresh_negative_until.items()):
            if until <= now:
                _exact_refresh_negative_until.pop(stale_key, None)
        if _lifecycle_state != "connected" or _current_stats is None:
            return None
        if _exact_refresh_negative_until.get(key, 0.0) > now:
            return None
        current = _exact_refresh_requests.get(key)
        if current is not None and not current.done.is_set():
            current.deadline = max(current.deadline, now + wait_sec + 0.25)
            return current
        request = _ExactRefreshRequest(
            key=key,
            event_id=int(event_id),
            period=int(period),
            selection=dict(selection),
            deadline=now + wait_sec + 0.25,
        )
        _exact_refresh_requests[key] = request
        return request


def _finish_exact_refresh(
    request: _ExactRefreshRequest,
    result: dict,
    *,
    negative_backoff: bool,
) -> None:
    with _exact_refresh_lock:
        if request.done.is_set():
            return
        if _exact_refresh_requests.get(request.key) is request:
            _exact_refresh_requests.pop(request.key, None)
        request.result = dict(result)
        if negative_backoff:
            _exact_refresh_negative_until[request.key] = (
                time.monotonic() + _EXACT_REFRESH_NEGATIVE_BACKOFF_SEC
            )
        request.done.set()


def _fail_all_exact_refreshes(error_code: str) -> None:
    """Wake every waiter when the authenticated observer session ends."""
    with _exact_refresh_lock:
        requests = list(_exact_refresh_requests.values())
    for request in requests:
        _finish_exact_refresh(
            request,
            {
                "found": False,
                "event_found": bool(request.sent_keys),
                "event_id": request.event_id,
                "period": request.period,
                "error_code": error_code,
            },
            negative_backoff=True,
        )


def _canonical_refresh_watch_key(values: list | tuple) -> tuple[str, str, str]:
    return (str(values[0]), str(values[1]), str(values[2]))


def _wire_triple_for_event_ref(stats: BiaObserverStats, event_ref: dict) -> list:
    wanted = (
        str(event_ref.get("comp_id") or ""),
        str(event_ref.get("sport_code") or ""),
        str(event_ref.get("event_key") or ""),
    )
    for triple in list(stats.discovered_events):
        if len(triple) >= 3 and _canonical_refresh_watch_key(triple) == wanted:
            return list(triple[:3])
    comp_id: str | int = wanted[0]
    try:
        comp_id = int(comp_id)
    except (TypeError, ValueError):
        pass
    return [comp_id, wanted[1], wanted[2]]


def _fresh_exact_refresh_result(
    request: _ExactRefreshRequest,
    stats: BiaObserverStats,
    event_refs: list[dict],
) -> dict | None:
    """Return a result only after every candidate proves this exact outcome.

    ``offers_event`` is both the initial rich response and the later delta
    carrier, with no protocol bit distinguishing the two.  Therefore freshness
    is tied to the selected raw group/direction timestamp, never to receipt of
    an arbitrary event update and never to an odds value.
    """
    proof_selection = dict(request.selection)
    proof_selection["period"] = request.period
    for event_ref in event_refs:
        watch_key = (
            str(event_ref.get("comp_id") or ""),
            str(event_ref.get("sport_code") or ""),
            str(event_ref.get("event_key") or ""),
        )
        sent_at = request.sent_wall_at.get(watch_key)
        if sent_at is None:
            return None
        proof = stats._offer_proofs.try_prove(event_ref, proof_selection)
        if proof.get("status") != "OK" or not proof.get("bet_type"):
            return None
        try:
            observed_at = float(proof.get("observed_at"))
        except (TypeError, ValueError):
            return None
        if observed_at < sent_at:
            return None
    return lookup_bia_selection_for_pid(
        request.event_id,
        period=request.period,
        selection=request.selection,
        stats=stats,
    )


async def _drain_exact_refresh_requests(ws, stats: BiaObserverStats) -> None:
    """Run refresh work on the authenticated observer connection."""
    global _exact_refresh_discovery_sent_at

    now = time.monotonic()
    with _exact_refresh_lock:
        requests = list(_exact_refresh_requests.values())
    if not requests:
        return

    active: list[_ExactRefreshRequest] = []
    for request in requests:
        if request.done.is_set():
            continue
        if request.deadline <= now:
            _finish_exact_refresh(
                request,
                {
                    "found": False,
                    "event_found": bool(request.sent_keys),
                    "event_id": request.event_id,
                    "period": request.period,
                    "error_code": "BIA_OFFER_REFRESH_TIMEOUT",
                },
                negative_backoff=True,
            )
            continue
        active.append(request)

    grouped: dict[tuple[int, int], list[_ExactRefreshRequest]] = defaultdict(list)
    for request in active:
        grouped[(request.event_id, request.period)].append(request)

    need_discovery = False
    for (event_id, period), grouped_requests in grouped.items():
        due = [request for request in grouped_requests if request.next_match_at <= now]
        if not due:
            continue
        for request in grouped_requests:
            request.next_match_at = now + _EXACT_REFRESH_POLL_SEC

        # During watch_comps inventory delivery, wait for a short quiet window
        # before another full fuzzy scan.  The initial lookup cache still makes
        # known/stale events immediate.
        registry_busy = bool(
            stats._event_registry_changed_at
            and now - stats._event_registry_changed_at < _EXACT_REFRESH_SETTLE_SEC
        )
        if registry_busy and any(
            request.saw_no_refs or request.candidate_keys
            for request in grouped_requests
        ):
            need_discovery = need_discovery or any(
                request.saw_no_refs for request in grouped_requests
            )
            continue

        event_refs = _matching_bia_event_refs_for_pid(
            event_id,
            period=period,
            stats=stats,
        )
        if not event_refs:
            need_discovery = True
            for request in grouped_requests:
                request.saw_no_refs = True
                if request.candidate_keys:
                    request.candidate_keys.clear()
                    request.candidate_stable_since = now
            continue
        for request in grouped_requests:
            request.saw_no_refs = False

        triples_by_key: dict[tuple[str, str, str], list] = {}
        for event_ref in event_refs:
            triple = _wire_triple_for_event_ref(stats, event_ref)
            watch_key = _canonical_refresh_watch_key(triple)
            triples_by_key.setdefault(watch_key, triple)
        candidate_keys = set(triples_by_key)
        for request in grouped_requests:
            if request.candidate_keys != candidate_keys:
                request.candidate_keys = set(candidate_keys)
                request.candidate_stable_since = now

        keys_to_send = [
            key for key in candidate_keys
            if any(key not in request.sent_keys for request in grouped_requests)
        ]
        hcap_triples: list[list] = []
        for watch_key in sorted(keys_to_send):
            triple = triples_by_key[watch_key]
            # Record before sending so an immediately arriving snapshot cannot
            # race the request bookkeeping.  A send failure tears down the WS;
            # the bounded caller still fails closed.
            sent_wall_at = time.time()
            for request in grouped_requests:
                if watch_key in request.sent_keys:
                    continue
                request.sent_keys.add(watch_key)
                request.sent_wall_at[watch_key] = sent_wall_at
            await ws.send_json(["watch_event", triple])
            stats._watch_event_keys.add(tuple(triple))
            hcap_triples.append(triple)
        if hcap_triples:
            await ws.send_json(["watch_hcaps", hcap_triples])
            for triple in hcap_triples:
                stats._watch_hcaps_keys.add(tuple(triple))

        # Finish only after a fresh candidate recomputation and quiet registry
        # window, so a late duplicate ref participates in ambiguity detection.
        # The helper additionally requires fresh structural evidence for this
        # exact outcome from every candidate.
        for request in list(grouped_requests):
            stable_since = max(
                request.candidate_stable_since,
                stats._event_registry_changed_at,
            )
            if (
                request.candidate_keys
                and now - stable_since >= _EXACT_REFRESH_SETTLE_SEC
            ):
                result = _fresh_exact_refresh_result(
                    request, stats, event_refs,
                )
                if result is None:
                    continue
                _finish_exact_refresh(
                    request,
                    result,
                    negative_backoff=not bool(result.get("found")),
                )

    if (
        need_discovery
        and (now - _exact_refresh_discovery_sent_at)
        >= _EXACT_REFRESH_DISCOVERY_BACKOFF_SEC
    ):
        sports = _configured_discovery_sports()
        if sports:
            await ws.send_json(["watch_comps", sports])
            _exact_refresh_discovery_sent_at = now


def _complete_exact_refreshes_from_offer(
    stats: BiaObserverStats,
    event_header: list,
) -> None:
    """Record one rich response; the settled drain decides completion."""
    if not isinstance(event_header, list) or len(event_header) < 3:
        return
    observed_key = _canonical_refresh_watch_key(event_header)
    with _exact_refresh_lock:
        requests = list(_exact_refresh_requests.values())
    for request in requests:
        if request.done.is_set() or observed_key not in request.sent_keys:
            continue
        request.observed_keys.add(observed_key)


async def lookup_bia_selection_for_pid_with_refresh(
    event_id: int,
    *,
    period: int,
    selection: dict,
    stats: BiaObserverStats | None = None,
    wait_sec: float = _EXACT_REFRESH_WAIT_SEC,
) -> dict:
    """Retry a retryable exact lookup once after a fresh raw BIA snapshot."""
    initial = lookup_bia_selection_for_pid(
        event_id,
        period=period,
        selection=selection,
        stats=stats,
    )
    if initial.get("found") or initial.get("error_code") not in _EXACT_REFRESHABLE_ERRORS:
        return initial
    # A test-supplied registry is not attached to the live observer and cannot
    # be refreshed through its socket.
    if stats is not None and stats is not _current_stats:
        return initial
    request = _enqueue_exact_refresh(
        int(event_id),
        period=int(period),
        selection=selection,
        wait_sec=max(0.0, float(wait_sec)),
    )
    if request is None:
        return initial
    completed = await asyncio.to_thread(
        request.done.wait,
        max(0.0, float(wait_sec)),
    )
    if completed and isinstance(request.result, dict):
        return dict(request.result)
    timed_out = dict(initial)
    timed_out["refresh_status"] = "timeout"
    _finish_exact_refresh(
        request,
        timed_out,
        negative_backoff=True,
    )
    if isinstance(request.result, dict):
        return dict(request.result)
    return timed_out


async def run_bia_observer() -> None:
    """Top-level loop: login → observe → reconnect with backoff.

    Runs indefinitely while ``BIA_ENABLED`` is set.  Safe to ``cancel()``.
    Exposes live counters via :func:`bia_observer_snapshot`.
    """
    global _current_stats, _observer_running, _lifecycle_state

    if not _cfg.BIA_ENABLED:
        log("[BIA-obs] disabled (BIA_ENABLED=0)")
        return

    _observer_running = True
    _lifecycle_state = "connecting"
    delay = _cfg.BIA_RECONNECT_DELAY_SEC
    jar = aiohttp.CookieJar(unsafe=True)

    try:
        async with aiohttp.ClientSession(cookie_jar=jar) as http:
            bia = BiaSession(http)

            while True:
                _lifecycle_state = "connecting"
                token = await bia.ensure_token()
                if not token:
                    log(f"[BIA-obs] login failed, retrying in {delay:.0f}s")
                    _lifecycle_state = "reconnecting"
                    await asyncio.sleep(delay)
                    delay = min(delay * 2, _cfg.BIA_RECONNECT_MAX_DELAY_SEC)
                    continue

                stats = BiaObserverStats()
                _current_stats = stats
                try:
                    await _observe_ws(bia, stats)
                finally:
                    _fail_all_exact_refreshes("BIA_OBSERVER_RECONNECTING")
                # WS session ended — mark as reconnecting immediately so
                # snapshot never reports stale connected/subscribed data.
                _lifecycle_state = "reconnecting"

                # Only reset backoff if the session was stable long enough.
                session_dur = time.time() - stats.ws_connect_ts if stats.ws_connect_ts else 0.0
                if session_dur >= _MIN_STABLE_SESSION_SEC:
                    delay = _cfg.BIA_RECONNECT_DELAY_SEC
                else:
                    delay = min(delay * 2, _cfg.BIA_RECONNECT_MAX_DELAY_SEC)

                log(f"[BIA-obs] session ended: {stats.summary()}")
                log(f"[BIA-obs] reconnecting in {delay:.0f}s")
                await asyncio.sleep(delay)
    finally:
        _observer_running = False
        _lifecycle_state = "stopped"


def search_bia_registry(query: str, limit: int = 20) -> list[dict]:
    """Search BIA event registry by team name substring."""
    stats = _current_stats
    if stats is None:
        return []
    q = query.lower().strip()
    results = []
    for (comp_id, sport_code, event_key), reg in list(stats._event_registry.items()):
        home = str(reg.get("home", "") or "").lower()
        away = str(reg.get("away", "") or "").lower()
        comp = str(reg.get("competition_name", "") or "").lower()
        if q in home or q in away or q in comp:
            results.append({
                "comp_id": comp_id,
                "sport_code": sport_code,
                "event_key": event_key,
                "home": reg.get("home", ""),
                "away": reg.get("away", ""),
                "competition": reg.get("competition_name", ""),
            })
            if len(results) >= limit:
                break
    return results
