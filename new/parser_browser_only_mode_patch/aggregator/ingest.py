"""Ingest router: entry point for any source emitting `SourceEvent`s.

The router is intentionally tiny in Phase 1: every event flows through
the same pipeline:

    SourceEvent ─► record_raw ─► normalize ─► upsert_candidate
                                              │
                                              └─► DecisionEngine ─► PublishedQuote
                                                                    │
                                                                    └─► append_history
                                                                    └─► consumers

Consumers register a callback via `register_consumer` and receive the
`PublishedQuote` synchronously. There is no asyncio in this layer —
callers can wrap calls in their own task if needed.

The aggregator does **not** start any network listener or subscribe to
anything until ``MSP_AGGREGATOR_ENABLED=1``. This module is import-time
inert.

**Provenance ownership.** ``ProvenanceStore.record_raw`` deep-copies the
payload before storing, and ``ingest`` deep-copies the payload again
**per consumer** before fan-out (Option A — N×deepcopy). Net effect:
each of (raw, candidate, published-to-consumer-N) holds an independent
dict; mutation by any consumer cannot leak back into the raw audit
layer **or** into payloads handed to peer consumers. See
``aggregator/store.py`` module docstring for the full ownership
contract.
"""

from __future__ import annotations

import copy
import dataclasses
import logging
import os
import threading
from datetime import datetime
from typing import Any, Callable

from aggregator.data_class import DataClass
from aggregator.decision import DecisionEngine
from aggregator.state_machine import (
    SourceHealthRegistry,
    SystemMode,
    SystemModeMonitor,
)
from aggregator.store import ProvenanceStore
from aggregator.types import (
    CandidateQuote,
    PublishedQuote,
    SourceEvent,
    SystemState,
)

# Optional Phase 4 dependency — typed via TYPE_CHECKING to keep the
# import-time graph identical for callers that don't use the pool.
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - typing only
    from aggregator.account_pool import AccountPool
    from aggregator.morebets_dispatcher import MoreBetsDispatcher

ConsumerCallback = Callable[[PublishedQuote], None]

# Story 27.4.B: transports that count as the L2 complement tier. WS
# and browser-WS are the primary flavours today; tab-mode becomes L2
# under the explicit fallback flag (AC-5 in story 27.4). Partner API
# uses ``http_pull`` and is never filtered by the L1-coverage gate.
_L2_TRANSPORTS: frozenset[str] = frozenset(
    {"ws", "browser_ws", "tab_mode", "authenticated_dom"}
)
NormalizeCallback = Callable[[SourceEvent], dict]
EventIdResolver = Callable[[SourceEvent, dict], str]

_MOREBETS_EXPLICIT_CLASSES: frozenset[str] = frozenset(
    {"special", "specials", "more_bets", "morebets", "additional"}
)
_MOREBETS_FAMILY_BY_MARKET_KEY: dict[str, str] = {
    "CornersTotal": "corners",
    "CornersHandicap": "corners",
    "CornersFirstTeamTotal": "corners",
    "CornersSecondTeamTotal": "corners",
    "BookingsTotal": "cards",
    "BookingsHandicap": "cards",
    "BookingsFirstTeamTotal": "cards",
    "BookingsSecondTeamTotal": "cards",
    "PlayerProps": "player_props",
    "OddEven": "odd_even",
    "HomeOddEven": "odd_even",
    "AwayOddEven": "odd_even",
    "OddEvenTotalCombo": "odd_even",
    "FirstTeamTotals": "first_team_totals",
    "SecondTeamTotals": "second_team_totals",
    # Dedicated names are safe to overlay.  Generic full-match ``Totals``
    # and ``Handicap`` remain core containers and are deliberately excluded.
    "AltTotals": "alt_totals",
    "AlternateTotals": "alt_totals",
    "AltHandicap": "alt_handicaps",
    "AltHandicaps": "alt_handicaps",
    "AlternateHandicap": "alt_handicaps",
    "AlternateHandicaps": "alt_handicaps",
}
_MOREBETS_UNKNOWN_SPECIAL_KEYS: frozenset[str] = frozenset(
    {
        "BTTS",
        "DoubleChance",
        "DrawNoBet",
        "FirstTeamToScore",
        "HomeTeamToScore",
        "AwayTeamToScore",
        "HomeWinToNil",
        "AwayWinToNil",
        "EitherTeamToScore",
        "CorrectScore",
        "ExactTotalGoals",
        "TotalGoalsRange",
        "WinningMargin",
        "ThreeWayHandicap",
        "BTTSWinnerCombo",
        "BTTSTotalCombo",
        "WinnerTotalCombo",
        "HalfTimeFullTime",
        "HomeExactGoals",
        "AwayExactGoals",
        "ToQualify",
    }
)
_MOREBETS_PERIOD_SKIP_FIELDS: frozenset[str] = frozenset(
    {"Number", "Description", "Status", "Cutoff"}
)
_BIA_CANDIDATE_FAMILIES: frozenset[str] = frozenset({"bia", "bia_supplement"})
_morebets_log = logging.getLogger("aggregator.morebets")


@dataclasses.dataclass(frozen=True)
class _MoreBetsFragment:
    family: str
    payload: dict[str, Any]
    market_keys_by_period: dict[int, tuple[str, ...]]
    explicit_payload: bool = False


def _norm_token(value: Any) -> str:
    if value is None:
        return ""
    try:
        return str(value).strip().lower().replace("-", "_").replace(" ", "_")
    except Exception:  # noqa: BLE001
        return ""


def _extract_explicit_morebets_family(payload: dict[str, Any]) -> str | None:
    for key in ("market_family", "family"):
        raw = payload.get(key)
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
    return None


def _market_class_from_candidates(candidates: list[CandidateQuote]) -> str | None:
    """Return 'more_bets' if ALL candidates carry market_class='more_bets'.

    Used in the fallback decision path (morebets_dispatcher=None) so that fleet /
    browser-WS candidates bearing an explicit market_class tag are routed correctly
    through DecisionEngine (BIA-exclusion bypass, etc.).

    Conservative: requires ALL candidates to bear the tag so that mixed buckets
    (base + morebets overlay) are not accidentally misrouted.  Returns None for
    core events and mixed buckets -> zero regression for all base tests.
    """
    if not candidates:
        return None
    for c in candidates:
        if not (isinstance(c.payload, dict) and c.payload.get("market_class") == "more_bets"):
            return None
    return "more_bets"


def _fragment_market_keys_by_period(payload: dict[str, Any]) -> dict[int, tuple[str, ...]]:
    periods = payload.get("Periods")
    if not isinstance(periods, list):
        return {}
    keys_by_period: dict[int, tuple[str, ...]] = {}
    for period_index, period in enumerate(periods):
        if not isinstance(period, dict):
            continue
        keys = tuple(
            key
            for key in period
            if isinstance(key, str)
            and not key.startswith("_")
            and key not in _MOREBETS_PERIOD_SKIP_FIELDS
        )
        if keys:
            keys_by_period[period_index] = keys
    return keys_by_period


def _morebets_family_for_market(period_index: int, market_key: str) -> str | None:
    family = _MOREBETS_FAMILY_BY_MARKET_KEY.get(market_key)
    if family is not None:
        return family
    if market_key == "Win1x2" and period_index == 1:
        return "first_half_1x2"
    if market_key == "Totals" and period_index > 0:
        return "period_totals"
    if market_key in _MOREBETS_UNKNOWN_SPECIAL_KEYS:
        return "unknown_family"
    return None


def _extract_morebets_fragments(payload: dict[str, Any]) -> list[_MoreBetsFragment]:
    if not isinstance(payload, dict):
        return []

    explicit_family = _extract_explicit_morebets_family(payload)
    explicit_class = _norm_token(
        payload.get("market_class")
        or payload.get("data_class")
        or payload.get("MarketClass")
    )
    if explicit_family is not None or explicit_class in _MOREBETS_EXPLICIT_CLASSES:
        family = explicit_family or "unknown_family"
        periods = payload.get("Periods")
        if not isinstance(periods, list):
            return []
        safe_periods: list[dict[str, Any]] = []
        safe_keys: dict[int, tuple[str, ...]] = {}
        for period_index, period in enumerate(periods):
            safe_period: dict[str, Any] = {}
            if isinstance(period, dict):
                if "Number" in period:
                    safe_period["Number"] = copy.deepcopy(period["Number"])
                admitted = tuple(
                    key
                    for key in period
                    if isinstance(key, str)
                    and _morebets_family_for_market(period_index, key) == family
                )
                for key in admitted:
                    safe_period[key] = copy.deepcopy(period[key])
                if admitted:
                    safe_keys[period_index] = admitted
            safe_periods.append(safe_period)
        if not safe_keys:
            # Fail closed: an explicit MoreBets label is not permission to
            # smuggle generic MoneyLine/Handicap/Totals into the overlay.
            return []
        safe_payload = {
            key: copy.deepcopy(value)
            for key, value in payload.items()
            if key != "Periods"
        }
        safe_payload["market_class"] = "more_bets"
        safe_payload["market_family"] = family
        safe_payload["Periods"] = safe_periods
        return [
            _MoreBetsFragment(
                family=family,
                payload=safe_payload,
                market_keys_by_period=safe_keys,
                explicit_payload=True,
            )
        ]

    periods = payload.get("Periods")
    if not isinstance(periods, list):
        return []

    periods_by_family: dict[str, dict[int, dict[str, Any]]] = {}
    keys_by_family: dict[str, dict[int, list[str]]] = {}
    for period_index, period in enumerate(periods):
        if not isinstance(period, dict):
            continue
        number = period.get("Number", period_index)
        for market_key, market_value in period.items():
            if (
                not isinstance(market_key, str)
                or market_key.startswith("_")
                or market_key in _MOREBETS_PERIOD_SKIP_FIELDS
            ):
                continue
            family = _morebets_family_for_market(period_index, market_key)
            if family is None:
                continue

            family_period = periods_by_family.setdefault(family, {}).setdefault(
                period_index, {"Number": number}
            )
            family_period[market_key] = copy.deepcopy(market_value)
            keys_by_family.setdefault(family, {}).setdefault(period_index, []).append(
                market_key
            )

    fragments: list[_MoreBetsFragment] = []
    for family, period_map in periods_by_family.items():
        fragment_payload = {key: value for key, value in payload.items() if key != "Periods"}
        fragment_payload["market_class"] = "more_bets"
        fragment_payload["market_family"] = family
        max_index = max(period_map) if period_map else -1
        fragment_periods: list[dict[str, Any]] = [{} for _ in range(max_index + 1)]
        for period_index, period_data in period_map.items():
            fragment_periods[period_index] = period_data
        fragment_payload["Periods"] = fragment_periods
        fragments.append(
            _MoreBetsFragment(
                family=family,
                payload=fragment_payload,
                market_keys_by_period={
                    idx: tuple(keys)
                    for idx, keys in keys_by_family.get(family, {}).items()
                },
            )
        )
    return fragments


def _candidate_dispatch_source(candidate: CandidateQuote) -> str | None:
    head = str(candidate.source_id or "").split(":", 1)[0].strip().lower()
    if candidate.family in _BIA_CANDIDATE_FAMILIES or head == "bia":
        return "bia"
    if head == "pinnacle_api" or candidate.transport == "http_pull":
        return "api"
    if head in {"pin888", "ps3838"} or candidate.transport in (
        "browser_ws",
        "tab_mode",
        "authenticated_dom",
        "direct_ws",
        "ws",
    ):
        return "ws"
    return None


def _sport_id_from_payload(payload: dict[str, Any]) -> int:
    raw = payload.get("sport_id")
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        return int(raw)
    sport_name = payload.get("SportName")
    if isinstance(sport_name, str):
        try:
            from aggregator.sports import sport_id_from_name

            sport_id = sport_id_from_name(sport_name)
            if sport_id is not None:
                return int(sport_id)
        except Exception:  # noqa: BLE001
            pass
    return 0


def _candidate_is_explicit_morebets(candidate: CandidateQuote) -> bool:
    fragments = _extract_morebets_fragments(candidate.payload)
    return bool(fragments) and all(fragment.explicit_payload for fragment in fragments)


def _is_bia_source_event(event: SourceEvent) -> bool:
    head = str(event.source_id or "").split(":", 1)[0].strip().lower()
    return event.family in _BIA_CANDIDATE_FAMILIES or head == "bia"


def _sanitize_bia_morebets_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Return a MoreBets-only BIA payload, or ``None`` when no safe keys exist.

    This ingress guard is intentionally independent of the dispatcher.  Even
    with MoreBets dispatch disabled, a BIA packet cannot reach a decision
    engine carrying generic core market containers.
    """
    fragments = _extract_morebets_fragments(payload)
    if not fragments:
        return None
    safe = {
        key: copy.deepcopy(value)
        for key, value in payload.items()
        if key != "Periods"
    }
    safe["market_class"] = "more_bets"
    families = {fragment.family for fragment in fragments}
    if len(families) == 1:
        safe["market_family"] = next(iter(families))
    else:
        safe.pop("market_family", None)
    max_period = max(
        (index for fragment in fragments for index in fragment.market_keys_by_period),
        default=-1,
    )
    safe_periods: list[dict[str, Any]] = [{} for _ in range(max_period + 1)]
    for fragment in fragments:
        fragment_periods = fragment.payload.get("Periods")
        if not isinstance(fragment_periods, list):
            continue
        for period_index, keys in fragment.market_keys_by_period.items():
            if period_index >= len(fragment_periods):
                continue
            source_period = fragment_periods[period_index]
            if not isinstance(source_period, dict):
                continue
            target_period = safe_periods[period_index]
            if "Number" in source_period:
                target_period.setdefault("Number", copy.deepcopy(source_period["Number"]))
            for key in keys:
                if key in source_period:
                    target_period[key] = copy.deepcopy(source_period[key])
    safe["Periods"] = safe_periods
    return safe


def _identity_event_id(ev: SourceEvent, normalized: dict) -> str:
    del normalized
    return ev.event_id


def _identity_normalize(ev: SourceEvent) -> dict:
    """Default normalize stage: pass payload through unchanged.

    Phase 1 sources (pin888) already emit pin888-shaped dicts, so the
    compat-shim can re-emit them verbatim. Later phases register
    per-source normalizers.
    """
    return ev.payload


def aggregator_enabled() -> bool:
    """Return True iff the runtime feature flag is set.

    Default off. Anything that wants to plug into the aggregator at
    runtime must check this; unit tests can construct an
    ``IngestRouter`` directly without touching the flag.
    """
    return os.environ.get("MSP_AGGREGATOR_ENABLED", "").strip() in ("1", "true", "True", "yes")


# Story 27.3.B AC-3: dedup signature helpers. Keep at module level so
# tests and external code (observability) can reach them directly.

_DEDUP_SKIP_PERIOD_FIELDS: frozenset[str] = frozenset(
    {"Number", "Status", "Cutoff"}
)
_DEDUP_LINE_FIELDS: frozenset[str] = frozenset({"Hdp", "Points"})
# Pin888-shape market entries often carry identity / line metadata
# alongside the side→price mapping. These fields are NOT outcomes and
# must not contribute to the dedup signature — otherwise unchanged
# LineIds would keep matching and suppress legitimate price updates.
_DEDUP_SIDE_SKIP_FIELDS: frozenset[str] = frozenset(
    {"LineId", "LineEventId", "MaxBet", "MaxWager", "AltLineId"}
)


def _build_quote_signature(payload: Any) -> frozenset[tuple[Any, ...]]:
    """Return a stable identity signature for a normalized payload.

    AC-3: the tuple is ``(market_key, outcome_id, price, line)`` where
    ``market_key = f"p{period}:{market_type}"`` and ``line`` carries the
    handicap (``Hdp``) or total (``Points``) when applicable, else
    ``None``.

    Two payloads producing the same frozenset are considered duplicates
    for dedup purposes; differing ``Hdp`` / ``Points`` lines keep the
    signatures distinct even when raw prices are unchanged.

    Pure / total — never raises. Returns an empty frozenset on
    malformed / empty payloads; callers should treat that as "no
    dedup evidence".
    """
    if not isinstance(payload, dict):
        return frozenset()
    periods = payload.get("Periods")
    if not isinstance(periods, list):
        return frozenset()

    parts: set[tuple[Any, ...]] = set()
    for period in periods:
        if not isinstance(period, dict):
            continue
        pnum = period.get("Number", 0)
        for market_type, market_data in period.items():
            if market_type in _DEDUP_SKIP_PERIOD_FIELDS:
                continue
            # Handicap / Totals are usually lists of {Hdp|Points, ...}
            # entries; MoneyLine / Win1x2 are flat dicts.
            if isinstance(market_data, list):
                entries: list[Any] = list(market_data)
            elif isinstance(market_data, dict):
                entries = [market_data]
            else:
                continue
            market_key = f"p{pnum}:{market_type}"
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                line: float | None = None
                for line_field in _DEDUP_LINE_FIELDS:
                    raw_line = entry.get(line_field)
                    if isinstance(raw_line, (int, float)) and not isinstance(raw_line, bool):
                        line = float(raw_line)
                        break
                for side, price_raw in entry.items():
                    if side in _DEDUP_LINE_FIELDS or side in _DEDUP_SIDE_SKIP_FIELDS:
                        continue
                    # Pin888-shape sides nest the numeric price under a
                    # ``value`` key; raw-Pinnacle shapes carry the float
                    # directly. Handle both.
                    price: Any = price_raw
                    if isinstance(price_raw, dict):
                        price = price_raw.get("value")
                    if isinstance(price, bool):
                        continue
                    try:
                        px = float(price)
                    except (TypeError, ValueError):
                        continue
                    parts.add((market_key, str(side), px, line))
    return frozenset(parts)


class IngestRouter:
    """Phase 1 ingest router.

    Stateless w.r.t. the stream itself; state lives in the supplied
    `ProvenanceStore` and `DecisionEngine`.
    """

    def __init__(
        self,
        store: ProvenanceStore,
        decision: DecisionEngine,
        *,
        normalize: NormalizeCallback = _identity_normalize,
        event_id_resolver: EventIdResolver = _identity_event_id,
        source_health: SourceHealthRegistry | None = None,
        system_mode_monitor: SystemModeMonitor | None = None,
        account_pool: "AccountPool | None" = None,
        morebets_dispatcher: "MoreBetsDispatcher | None" = None,
        dedup_window_sec: float = 1.0,
        l1_covered_pids_provider: Callable[[], set[int]] | None = None,
        l1_recently_added_pids_provider: Callable[[], set[int]] | None = None,
    ) -> None:
        self.store = store
        self.decision = decision
        self.normalize = normalize
        self.event_id_resolver = event_id_resolver
        self._consumers: list[ConsumerCallback] = []
        self.system_state: SystemState = SystemState.NORMAL
        # Story 27.3.B AC-3: suppress no-op re-emissions from aggressive
        # polling. Keyed by (source_id, event_id) so two sources emitting
        # the same odds do not clash. Tombstones bypass dedup entirely.
        self.dedup_window_sec: float = float(dedup_window_sec)
        self._last_quote_signature: dict[
            tuple[str, str], tuple[frozenset[tuple[Any, ...]], datetime]
        ] = {}
        self._duplicate_updates_total: dict[str, int] = {}
        # Story 27.4.B AC-2: ingest-side L2 soft filter.
        self.l1_covered_pids_provider = l1_covered_pids_provider
        # Story 27.4.E DOD-2: optional provider of pids added to L1
        # within the TTL window — WS admits for those count as stale.
        self.l1_recently_added_pids_provider = l1_recently_added_pids_provider
        self._ws_filtered_counts: dict[str, int] = {}
        self._ws_accepted_counts: dict[str, int] = {}
        self._stale_admits_total: int = 0
        # Per-source heartbeat tracker (Phase 3). Created lazily so
        # Phase 1 callers that pass ``store`` + ``decision`` only keep
        # working unchanged; the registry is still attached so the
        # SystemModeMonitor can be wired in later.
        self.source_health = source_health or SourceHealthRegistry()
        # Phase 3: optional SystemModeMonitor — when wired, ingest()
        # queries it on every event and forwards the current mode to
        # the decision engine via ``system_mode=``. Backward-compat:
        # when unset (Phase 1 callers / unit tests passing
        # ``system_mode=`` directly), behaviour is identical to before
        # — engine sees default SystemMode.NORMAL.
        self.system_mode_monitor = system_mode_monitor
        # Phase 4: optional AccountPool — exposed to consumers /
        # decision engine that opt in. The router itself does not
        # consult the pool on the hot path; it merely holds the
        # reference so downstream code (e.g. account-aware decision
        # adjuncts) can look it up via ``router.account_pool``.
        self.account_pool = account_pool
        self.morebets_dispatcher = morebets_dispatcher
        self._ingest_lock = threading.Lock()
        # Fix #4: счётчик ingest-вызовов для периодической очистки устаревших
        # записей _last_quote_signature. Purge каждые ~1000 инвокаций.
        self._ingest_call_count: int = 0
        self._signature_purge_interval: int = 1000

    def register_consumer(self, cb: ConsumerCallback) -> None:
        self._consumers.append(cb)

    def set_system_state(self, state: SystemState) -> None:
        self.system_state = state

    def duplicate_updates_total_by_source(self) -> dict[str, int]:
        """AC-3 / DOD-6: per-source dedup counter.

        Returns a copy so callers can mutate freely.
        """
        return dict(self._duplicate_updates_total)

    # ── Story 27.4.B observability counters (AC-2 / DOD-6) ─────────────

    def ws_events_filtered_as_l1_covered_total(self) -> dict[str, int]:
        """Per-source count of WS events dropped by the L1-coverage filter."""
        return dict(self._ws_filtered_counts)

    def ws_events_accepted_as_l2_complement_total(self) -> dict[str, int]:
        """Per-source count of WS events admitted as L2 complements."""
        return dict(self._ws_accepted_counts)

    def ws_events_admitted_during_stale_diff_total(self) -> int:
        """DOD-2 — count of WS admits where the cached coverage diff
        likely already knew the pid via L1 (meaning the diff was stale).

        Non-zero is expected; a sustained non-zero rate ≥ 5 % of ingest
        signals that ``CoverageDiffCache.ttl_sec`` should be tightened
        (e.g. 30 s → 10 s). Operators set the threshold in the runbook.
        """
        return self._stale_admits_total

    def _resolve_force_pids(self) -> set[int]:
        """Read ``MSP_PS3838_WS_FORCE_EVENTS`` → set of ints.

        Bogus values and empty strings are dropped silently — callers
        must not be able to accidentally disable the filter through a
        typo.
        """
        raw = (os.environ.get("MSP_PS3838_WS_FORCE_EVENTS") or "").strip()
        if not raw:
            return set()
        out: set[int] = set()
        for chunk in raw.split(","):
            s = chunk.strip()
            if not s:
                continue
            try:
                out.add(int(s))
            except ValueError:
                continue
        return out

    def _is_l2_transport(self, event: SourceEvent) -> bool:
        return event.transport in _L2_TRANSPORTS

    def _extract_canonical_pid(self, event: SourceEvent) -> int | None:
        """Return ``payload["Pid"]`` as int, or ``None`` if missing/bogus."""
        payload = event.payload
        if not isinstance(payload, dict):
            return None
        raw = payload.get("Pid")
        if raw is None:
            return None
        try:
            return int(raw)
        except (TypeError, ValueError):
            return None

    def _apply_l1_coverage_filter(self, event: SourceEvent) -> bool:
        """Return ``True`` iff the event should be dropped by the L2 filter.

        Called by ``_ingest_unlocked`` early in the pipeline. Side
        effect: bumps the per-source filtered/accepted counter. When the
        filter is off (no provider wired) or the transport is not an L2
        one, returns ``False`` and does not touch counters.
        """
        if self.l1_covered_pids_provider is None:
            return False
        if not self._is_l2_transport(event):
            return False
        pid = self._extract_canonical_pid(event)
        if pid is None:
            # Missing Pid — can't reason about coverage → safe default admit.
            return False
        force_pids = self._resolve_force_pids()
        if pid in force_pids:
            # Manual override (operational testing) — do not filter, also
            # not counted as a "normal" L2 admit.
            return False
        try:
            covered = self.l1_covered_pids_provider()
        except Exception:  # noqa: BLE001 — provider must not break ingest
            return False
        if pid in covered:
            self._ws_filtered_counts[event.source_id] = (
                self._ws_filtered_counts.get(event.source_id, 0) + 1
            )
            return True
        # Admit — but check if the pid was added to L1 within the
        # cache's freshness window. That signals a stale coverage diff.
        if self.l1_recently_added_pids_provider is not None:
            try:
                recent = self.l1_recently_added_pids_provider()
            except Exception:  # noqa: BLE001
                recent = set()
            if pid in recent:
                self._stale_admits_total += 1
        self._ws_accepted_counts[event.source_id] = (
            self._ws_accepted_counts.get(event.source_id, 0) + 1
        )
        return False

    # ── Pipeline ───────────────────────────────────────────────────────

    def ingest(self, event: SourceEvent) -> PublishedQuote | None:
        """Drive a single ``SourceEvent`` through the pipeline.

        On a tombstone publish, *all* candidates for the event_id (from
        every source, not just the emitting one) are dropped from the
        candidate layer. This prevents a stale live candidate from
        another source — kept around because it had not yet timed out —
        from being immediately re-elected by the decision engine and
        "un-tombstoning" the event on the next ingest tick. Sources
        that observe the event again later may republish through the
        normal fan-in.
        """
        with self._ingest_lock:
            return self._ingest_unlocked(event)

    def _purge_stale_signatures(self, now: datetime) -> None:
        """Fix #4: удалить устаревшие записи _last_quote_signature.

        Запись считается устаревшей, если её prev_ts старше
        N*dedup_window_sec (по умолчанию N=10, т.е. ~10× дедуп-окна).
        Это безопасно: запись используется только для сравнения внутри
        dedup_window_sec; по истечении окна она уже никогда не совпадёт.
        Вызывается периодически (каждые ~1000 ingest) изнутри lock.
        """
        cutoff_sec = self.dedup_window_sec * 10.0
        stale_keys = [
            k for k, (_, ts) in self._last_quote_signature.items()
            if (now - ts).total_seconds() > cutoff_sec
        ]
        for k in stale_keys:
            del self._last_quote_signature[k]

    def _ingest_unlocked(self, event: SourceEvent) -> PublishedQuote | None:
        # Fix #4: периодически вычищать устаревшие dedup-сигнатуры.
        self._ingest_call_count += 1
        if self._ingest_call_count % self._signature_purge_interval == 0:
            self._purge_stale_signatures(event.received_at)

        # Story 27.4.B AC-2: WS / browser_ws / tab_mode events whose
        # canonical pid is already covered by Partner API are dropped
        # BEFORE any state mutation so the raw layer stays clean of
        # filtered noise and the dedup / decision paths never see them.
        if self._apply_l1_coverage_filter(event):
            return None

        # 1) raw layer (store deep-copies payload internally)
        self.store.record_raw(event)

        # 1.5) heartbeat — record this source produced an event. Done
        # before normalize so even malformed payloads still count as
        # "source is alive". (Phase 3, TZ §6.2)
        self.source_health.mark_event(event.source_id, when=event.received_at)

        # 2) normalize layer
        normalized = self.normalize(event)
        if _is_bia_source_event(event):
            normalized = _sanitize_bia_morebets_payload(normalized)
            if normalized is None:
                return None
        resolved_event_id = self.event_id_resolver(event, normalized)
        self.store.upsert_normalized(event.source_id, resolved_event_id, normalized)

        # 2.5) Story 27.3.B AC-3 dedup gate. Tombstones bypass — they
        # carry lifecycle semantics and a repeat is still meaningful. An
        # empty signature means "no price evidence to compare against",
        # so we do not dedup either (e.g. placeholder events with no
        # markets offered yet).
        if not event.is_tombstone:
            signature = _build_quote_signature(normalized)
            if signature:
                sig_key = (event.source_id, resolved_event_id)
                prev = self._last_quote_signature.get(sig_key)
                if prev is not None:
                    prev_sig, prev_ts = prev
                    dt = (event.received_at - prev_ts).total_seconds()
                    if (
                        prev_sig == signature
                        and 0 <= dt <= self.dedup_window_sec
                    ):
                        # A repeated authenticated live DOM observation is a
                        # freshness heartbeat. Refresh its candidate timestamp
                        # without rerunning the expensive decision/fan-out path.
                        if (
                            event.transport == "authenticated_dom"
                            and bool((event.payload or {}).get("isLive"))
                        ):
                            refreshed = self.store.refresh_candidate_timestamp(
                                event.source_id,
                                resolved_event_id,
                                collected_at=event.collected_at,
                                received_at=event.received_at,
                            )
                            if not refreshed:
                                self.store.upsert_candidate(
                                    CandidateQuote(
                                        source_id=event.source_id,
                                        family=event.family,
                                        transport=event.transport,
                                        event_id=resolved_event_id,
                                        payload=normalized,
                                        collected_at=event.collected_at,
                                        received_at=event.received_at,
                                        is_tombstone=False,
                                        confidence=event.confidence,
                                    )
                                )
                        # Duplicate inside the window — count it, short-circuit.
                        self._duplicate_updates_total[event.source_id] = (
                            self._duplicate_updates_total.get(event.source_id, 0) + 1
                        )
                        return None
                self._last_quote_signature[sig_key] = (signature, event.received_at)

        # 3) candidate layer
        candidate = CandidateQuote(
            source_id=event.source_id,
            family=event.family,
            transport=event.transport,
            event_id=resolved_event_id,
            payload=normalized,
            collected_at=event.collected_at,
            received_at=event.received_at,
            is_tombstone=event.is_tombstone,
            confidence=event.confidence,
        )
        self.store.upsert_candidate(candidate)

        # 4) decision
        candidates = self.store.get_candidates(resolved_event_id)
        mode = self._current_system_mode(event.received_at)
        if self._is_explicit_morebets_bucket(candidates):
            published = self._maybe_dispatch_explicit_morebets_bucket(
                candidates,
                now=event.received_at,
                system_mode=mode,
            )
            # Dispatcher is authoritative for explicit morebets buckets:
            # if it declined (rate limited / all sources rejected), do NOT
            # fall through to the legacy decision path.
            if published is None:
                return None
        else:
            mb_candidates = [
                c for c in candidates
                if isinstance(c.payload, dict) and c.payload.get("market_class") == "more_bets"
            ]
            base_candidates = [
                c for c in candidates
                if not (isinstance(c.payload, dict) and c.payload.get("market_class") == "more_bets")
            ]
            if mb_candidates and base_candidates:
                mb_pub = self._decide_candidates(
                    mb_candidates, system_mode=mode, market_class="more_bets"
                )
                if mb_pub is not None:
                    mb_pub = self._apply_morebets_overlays(
                        mb_pub, mb_candidates, now=event.received_at
                    )
                    self.store.append_history(mb_pub)
                    for cb in list(self._consumers):
                        try:
                            cb(dataclasses.replace(
                                mb_pub, payload=copy.deepcopy(mb_pub.payload)
                            ))
                        except Exception:  # noqa: BLE001
                            pass
                published = self._decide_candidates(
                    base_candidates, system_mode=mode, market_class=None
                )
            else:
                mc = _market_class_from_candidates(candidates)
                published = self._decide_candidates(candidates, system_mode=mode, market_class=mc)
        if published is None:
            return None

        published = self._apply_morebets_overlays(
            published,
            candidates,
            now=event.received_at,
        )

        # 5) history
        self.store.append_history(published)

        # 6) fan-out — give each consumer its OWN independent payload
        # copy (Option A, per docstring contract). Mutation by one
        # consumer cannot leak into raw / candidate / history layers
        # OR into payloads handed to other consumers (TZ §8 provenance
        # contract). Cost is N×deepcopy; with N=1 today, negligible.
        return_quote = dataclasses.replace(
            published, payload=copy.deepcopy(published.payload)
        )
        for cb in list(self._consumers):
            consumer_quote = dataclasses.replace(
                published, payload=copy.deepcopy(published.payload)
            )
            try:
                cb(consumer_quote)
            except Exception:  # noqa: BLE001  — consumers must not break ingest
                pass

        # 7) for tombstones, drop *all* candidates for this event_id so
        # other-source live candidates do not immediately re-publish a
        # non-tombstone quote on the next ingest tick.
        if event.is_tombstone:
            self.store.clear_candidates(resolved_event_id)

        return return_quote

    def _current_system_mode(self, when: datetime) -> SystemMode | None:
        if self.system_mode_monitor is None:
            return None
        try:
            return self.system_mode_monitor.compute_mode(now=when)
        except Exception:  # noqa: BLE001 — monitor must not break ingest
            return SystemMode.NORMAL

    def _decide_candidates(
        self,
        candidates: Iterable[CandidateQuote],
        *,
        system_mode: SystemMode | None,
        market_class: str | None = None,
        data_class: DataClass | None = None,
    ) -> PublishedQuote | None:
        decide_kwargs: dict[str, Any] = {"system_state": self.system_state}
        attempts: list[dict[str, Any]] = []
        if data_class is not None and system_mode is not None:
            attempts.append(
                {**decide_kwargs, "system_mode": system_mode, "data_class": data_class}
            )
        if data_class is not None:
            attempts.append({**decide_kwargs, "data_class": data_class})
        if market_class is not None and system_mode is not None:
            attempts.append(
                {**decide_kwargs, "system_mode": system_mode, "market_class": market_class}
            )
        if market_class is not None:
            attempts.append({**decide_kwargs, "market_class": market_class})
        if system_mode is not None:
            attempts.append({**decide_kwargs, "system_mode": system_mode})
        attempts.append(dict(decide_kwargs))

        for kwargs in attempts:
            try:
                return self.decision.decide(candidates, **kwargs)
            except TypeError:
                continue
        return self.decision.decide(candidates, **decide_kwargs)

    def _morebets_family_entries(
        self,
        candidates: Iterable[CandidateQuote],
    ) -> dict[str, list[tuple[CandidateQuote, _MoreBetsFragment]]]:
        entries: dict[str, list[tuple[CandidateQuote, _MoreBetsFragment]]] = {}
        for candidate in candidates:
            for fragment in _extract_morebets_fragments(candidate.payload):
                entries.setdefault(fragment.family, []).append((candidate, fragment))
        return entries

    def _dispatch_morebets_family(
        self,
        *,
        event_id: str,
        family: str,
        entries: list[tuple[CandidateQuote, _MoreBetsFragment]],
        now: datetime,
    ) -> tuple[Any, tuple[CandidateQuote, _MoreBetsFragment] | None]:
        if self.morebets_dispatcher is None:
            return None, None

        from aggregator.morebets_dispatcher import SourceQuote

        winners_by_source: dict[str, tuple[CandidateQuote, _MoreBetsFragment]] = {}
        for candidate, fragment in entries:
            source = _candidate_dispatch_source(candidate)
            if source is None:
                continue
            existing = winners_by_source.get(source)
            if existing is None or candidate.collected_at > existing[0].collected_at:
                winners_by_source[source] = (candidate, fragment)

        if not winners_by_source:
            return None, None

        sample_payload = entries[0][1].payload
        sport_id = _sport_id_from_payload(sample_payload)
        quotes: list[SourceQuote] = []
        for source in ("api", "ws", "bia"):
            selected = winners_by_source.get(source)
            if selected is None:
                continue
            candidate, _fragment = selected
            confidence = candidate.confidence if source == "bia" else 1.0
            quotes.append(
                SourceQuote(
                    source=source,
                    present=True,
                    age_sec=max(0.0, candidate.age_ms(now) / 1000.0),
                    match_confidence=confidence,
                )
            )

        decision = self.morebets_dispatcher.dispatch(
            sport_id=sport_id,
            market_family=family,
            quotes=quotes,
        )
        _morebets_log.debug(
            "morebets dispatch event_id=%s family=%s winner=%s reason=%s rejected=%s",
            event_id,
            family,
            decision.winning_source,
            decision.reason_detail,
            decision.rejected,
        )
        if not decision.resolved:
            return decision, None
        return decision, winners_by_source.get(str(decision.winning_source))

    def _with_morebets_context(
        self,
        published: PublishedQuote,
        *,
        families: Iterable[str],
        mode: str,
        winning_sources: Iterable[str],
    ) -> PublishedQuote:
        context = dict(getattr(published, "morebets_context", {}) or {})
        merged_families = {
            str(family).strip()
            for family in context.get("families", [])
            if str(family).strip()
        }
        merged_families.update(
            str(family).strip() for family in families if str(family).strip()
        )
        merged_sources = {
            str(source).strip()
            for source in context.get("winning_sources", [])
            if str(source).strip()
        }
        merged_sources.update(
            str(source).strip() for source in winning_sources if str(source).strip()
        )

        existing_mode = str(context.get("mode") or "").strip()
        if existing_mode and existing_mode != mode:
            merged_mode = "mixed"
        else:
            merged_mode = mode

        context.update({
            "active": True,
            "mode": merged_mode,
            "families": sorted(merged_families),
            "winning_sources": sorted(merged_sources),
        })
        return dataclasses.replace(published, morebets_context=context)

    def _is_explicit_morebets_bucket(self, candidates: list[CandidateQuote]) -> bool:
        """True iff dispatcher should own the decision for this bucket.

        Requires: dispatcher wired, exactly one morebets family present,
        and every candidate carries an explicit morebets payload.
        """
        if self.morebets_dispatcher is None or not candidates:
            return False
        family_entries = self._morebets_family_entries(candidates)
        if len(family_entries) != 1:
            return False
        return all(_candidate_is_explicit_morebets(candidate) for candidate in candidates)

    def _maybe_dispatch_explicit_morebets_bucket(
        self,
        candidates: list[CandidateQuote],
        *,
        now: datetime,
        system_mode: SystemMode | None,
    ) -> PublishedQuote | None:
        if self.morebets_dispatcher is None or not candidates:
            return None

        family_entries = self._morebets_family_entries(candidates)
        if len(family_entries) != 1:
            return None
        for candidate in candidates:
            if not _candidate_is_explicit_morebets(candidate):
                return None
        family, entries = next(iter(family_entries.items()))
        if not entries or not all(fragment.explicit_payload for _, fragment in entries):
            return None

        _decision, winner = self._dispatch_morebets_family(
            event_id=candidates[0].event_id,
            family=family,
            entries=entries,
            now=now,
        )
        if winner is None:
            return None

        winning_source = _candidate_dispatch_source(winner[0])
        # Publish the family-scoped fragment, never the raw explicit payload.
        # The raw payload may contain generic core containers alongside its
        # MoreBets marker; those must not escape into the consumer view.
        winning_candidates = [
            dataclasses.replace(candidate, payload=copy.deepcopy(fragment.payload))
            for candidate, fragment in entries
            if _candidate_dispatch_source(candidate) == winning_source
        ]
        published = self._decide_candidates(
            winning_candidates,
            system_mode=system_mode,
            market_class="more_bets",
            data_class=DataClass.MORE_BETS_SPECIAL,
        )
        if published is None:
            return None
        return self._with_morebets_context(
            published,
            families=[family],
            mode="explicit_bucket",
            winning_sources=[winning_source or ""],
        )

    def _apply_morebets_overlays(
        self,
        published: PublishedQuote,
        candidates: list[CandidateQuote],
        *,
        now: datetime,
    ) -> PublishedQuote:
        if self.morebets_dispatcher is None or not candidates:
            return published

        family_entries = self._morebets_family_entries(candidates)
        if not family_entries:
            return published
        bucket_is_explicit = all(
            _candidate_is_explicit_morebets(candidate) for candidate in candidates
        )

        merged_payload = copy.deepcopy(published.payload)
        if not isinstance(merged_payload, dict):
            return published
        merged_periods = merged_payload.get("Periods")
        if not isinstance(merged_periods, list):
            return published

        changed = False
        applied_families: set[str] = set()
        winning_sources: set[str] = set()
        for family, entries in sorted(family_entries.items()):
            if bucket_is_explicit and entries and all(
                fragment.explicit_payload for _, fragment in entries
            ):
                continue
            _decision, winner = self._dispatch_morebets_family(
                event_id=published.event_id,
                family=family,
                entries=entries,
                now=now,
            )
            if winner is None:
                continue

            winning_candidate, fragment = winner
            fragment_periods = fragment.payload.get("Periods")
            if not isinstance(fragment_periods, list):
                continue

            union_keys: dict[int, set[str]] = {}
            for _candidate, candidate_fragment in entries:
                for period_index, keys in candidate_fragment.market_keys_by_period.items():
                    union_keys.setdefault(period_index, set()).update(keys)

            for period_index, keys in union_keys.items():
                while len(merged_periods) <= period_index:
                    merged_periods.append({})
                period = merged_periods[period_index]
                if not isinstance(period, dict):
                    period = {}
                    merged_periods[period_index] = period
                for key in keys:
                    period.pop(key, None)
                if period_index < len(fragment_periods):
                    src_period = fragment_periods[period_index]
                    if isinstance(src_period, dict):
                        if "Number" in src_period and "Number" not in period:
                            period["Number"] = src_period["Number"]
                        for key in keys:
                            if key in src_period:
                                period[key] = copy.deepcopy(src_period[key])
                changed = True
                applied_families.add(family)
                winning_source = _candidate_dispatch_source(winning_candidate)
                if winning_source is not None:
                    winning_sources.add(winning_source)

        if not changed:
            return published
        merged_payload["Periods"] = merged_periods
        published = dataclasses.replace(published, payload=merged_payload)
        return self._with_morebets_context(
            published,
            families=sorted(applied_families),
            mode="overlay",
            winning_sources=sorted(winning_sources),
        )


__all__ = ["IngestRouter", "aggregator_enabled"]
