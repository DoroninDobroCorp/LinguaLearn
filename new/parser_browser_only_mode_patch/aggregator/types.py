"""Typed envelopes for the multi-source aggregator.

These dataclasses are the canonical wire shapes between the aggregator's
internal stages. They follow `docs/PINNACLE_MULTI_SOURCE_PLATFORM_TZ.md`
sections 6.3 (`PublishedQuote`) and 7.1 (`Account`).

The shapes are deliberately permissive in Phase 1 — fields that the
decision engine does not yet need are present but optional. Every field
has a sensible default so a Phase-1 source can emit a minimal
`SourceEvent` and still flow through the pipeline.

No I/O, no network, no global state — these types are import-time safe.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any


# ── State machine enums (TZ §7.2 / v0.1 §6) ─────────────────────────────


class SystemState(str, Enum):
    """Top-level state of the multi-source platform."""

    NORMAL = "normal"
    ACCOUNT_POOL_DEGRADED = "account_pool_degraded"
    API_DEGRADED = "api_degraded"
    BIA_ASSISTED_DEGRADED = "bia_assisted_degraded"
    DOWN = "down"


class SourceState(str, Enum):
    """State of an individual data source channel."""

    HEALTHY = "healthy"
    STALE = "stale"
    DEGRADED = "degraded"
    DISCONNECTED = "disconnected"
    QUARANTINED = "quarantined"


class AccountState(str, Enum):
    """State of a single account runtime (TZ §7.1)."""

    HEALTHY_DIRECT_WS = "healthy_direct_ws"
    HEALTHY_BROWSER_WS = "healthy_browser_ws"
    DEGRADED = "degraded"
    LOCKED = "locked"
    AUTH_FAILED = "auth_failed"
    QUARANTINED = "quarantined"
    OFFLINE = "offline"


# ── Helpers ─────────────────────────────────────────────────────────────


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ── Account entity (TZ §7.1) ────────────────────────────────────────────


@dataclass
class Account:
    """Account runtime descriptor — see TZ §7.1 for the full schema.

    Phase 1 only needs identity + state for tests. Operational fields
    (budgets, capability profile, indicators) live in plain dicts so
    later phases can extend them without refactoring callers.
    """

    account_id: str
    family: str  # pin888 | ps3838 | piwi247
    host_node: str = "mac-local"
    region: str = "EU"
    role_tags: list[str] = field(default_factory=list)
    credentials_ref: str = ""
    supported_transports: list[str] = field(default_factory=list)
    current_transport: str = "direct_ws"
    state: AccountState = AccountState.OFFLINE
    last_state_change: datetime = field(default_factory=_utc_now)
    auth_status: str = "unknown"
    ws_status: str = "disconnected"
    more_bet_budget: dict[str, Any] = field(default_factory=dict)
    indicators: dict[str, Any] = field(default_factory=dict)
    capability_profile: dict[str, Any] = field(default_factory=dict)


# ── SourceEvent: what a source emits into the aggregator ────────────────


@dataclass
class SourceEvent:
    """A single observation from one source.

    `payload` is the source-native shape (e.g. for pin888 it is the
    per-event dict that today flows through `core/broadcaster.py`).
    The aggregator does not reformat it in Phase 1 — the compat-shim
    re-emits the same dict downstream verbatim.

    Ownership: the caller owns the dict it passes in; the aggregator
    deep-copies the payload at ``ProvenanceStore.record_raw`` and again
    at fan-out (see ``aggregator/ingest.py``), so each layer holds an
    independent copy and consumer mutation cannot rewrite the raw
    provenance entry. See ``aggregator/store.py`` module docstring for
    the full ownership contract.
    """

    source_id: str  # e.g. "pin888:acct-A:browser_ws"
    family: str  # pinnacle_native | bia
    transport: str  # direct_ws | browser_ws | tab_mode | http_pull
    event_id: str  # canonical identifier (e.g. "ps3838:1234567")
    payload: dict[str, Any]
    collected_at: datetime = field(default_factory=_utc_now)
    received_at: datetime = field(default_factory=_utc_now)
    is_tombstone: bool = False
    confidence: float = 1.0
    account_id: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


# ── CandidateQuote: per-source quote stored in candidate layer ──────────


@dataclass
class CandidateQuote:
    """Per-source quote in the store's candidate layer."""

    source_id: str
    family: str
    transport: str
    event_id: str
    payload: dict[str, Any]
    collected_at: datetime
    received_at: datetime
    is_tombstone: bool = False
    confidence: float = 1.0
    rejected_reason: str | None = None

    @classmethod
    def from_source_event(cls, ev: SourceEvent) -> "CandidateQuote":
        return cls(
            source_id=ev.source_id,
            family=ev.family,
            transport=ev.transport,
            event_id=ev.event_id,
            payload=ev.payload,
            collected_at=ev.collected_at,
            received_at=ev.received_at,
            is_tombstone=ev.is_tombstone,
            confidence=ev.confidence,
        )

    def age_ms(self, now: datetime | None = None) -> int:
        now = now or _utc_now()
        return max(0, int((now - self.collected_at).total_seconds() * 1000))


# ── PublishedQuote: consumer-facing schema (TZ §6.3) ────────────────────


@dataclass
class PublishedQuoteCandidate:
    """Audit entry for a non-winning candidate (TZ §6.3 all_candidate_sources)."""

    source: str
    age_ms: int
    rejected_reason: str | None = None
    price: float | None = None


@dataclass
class PublishedOutcome:
    """Per-outcome decision output (Phase 5, TZ §5/§6.3).

    Where ``PublishedQuote`` is event-granular (back-compat surface kept
    for v1 + Phase 0-4), ``PublishedOutcome`` carries the granular
    provenance / freshness / authority decision for a single
    ``(event_id, market_id, outcome_id)`` triple.

    Emitted only when ``MSP_OUTCOME_GRANULAR_ENABLED`` is set; otherwise
    the engine path is byte-identical to v1/Phase 3.
    """

    event_id: str
    market_id: str
    outcome_id: str
    price: float | None = None
    source_used_for_publish: str = ""
    publish_authority_class: str = "pinnacle_native"
    all_candidate_sources: list[PublishedQuoteCandidate] = field(default_factory=list)
    freshness_ms: int = 0
    collected_at: datetime = field(default_factory=_utc_now)
    received_at: datetime = field(default_factory=_utc_now)
    decision_reason: str = "single_source_pass_through"
    degraded: bool = False
    fallback_state: str | None = None
    confidence: float = 1.0
    is_tombstone: bool = False
    data_class: str = "base_market"


@dataclass
class PublishedQuote:
    """Consumer-facing decision output (TZ §6.3).

    The compat-shim converts this into the legacy `:9012` `update`
    payload by re-emitting `payload` verbatim under the existing
    envelope. The richer fields below are not used by the legacy
    shim — they are reserved for the v2 feed (Phase 5+).
    """

    event_id: str
    payload: dict[str, Any]
    source_used_for_publish: str
    publish_authority_class: str = "pinnacle_native"
    all_candidate_sources: list[PublishedQuoteCandidate] = field(default_factory=list)
    freshness_ms: int = 0
    collected_at: datetime = field(default_factory=_utc_now)
    received_at: datetime = field(default_factory=_utc_now)
    decision_reason: str = "single_source_pass_through"
    degraded: bool = False
    fallback_state: str | None = None
    confidence: float = 1.0
    system_state_snapshot: SystemState = SystemState.NORMAL
    is_tombstone: bool = False
    normalized_identifiers: dict[str, Any] = field(default_factory=dict)
    # Phase 5 (opt-in). Empty list when outcome-granular publish is off
    # so v1 + Phase 0-4 byte-stream stays identical.
    outcomes: list[PublishedOutcome] = field(default_factory=list)
    morebets_context: dict[str, Any] = field(default_factory=dict)


__all__ = [
    "Account",
    "AccountState",
    "CandidateQuote",
    "PublishedOutcome",
    "PublishedQuote",
    "PublishedQuoteCandidate",
    "SourceEvent",
    "SourceState",
    "SystemState",
]
