"""Consumer contract types (Phase 7, TZ §8).

Formal dataclass definitions documenting the exact shapes for:
- ``SnapshotPayload``: list of events per view profile.
- ``DeltaPayload``: list of changed events since timestamp.
- ``EventView``: fields per profile (lightweight ⊂ analytics ⊂ debug).

These are the reference types that consumers import/reference. They do
NOT replace the functional encoders in ``aggregator.views`` — they
exist so consumers have a stable importable contract to test against.

Import-time inert. No I/O.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class CandidateSourceView:
    """Per-source candidate visible in analytics+ profiles."""

    source: str = ""
    age_ms: float = 0.0
    price: float = 0.0
    rejected_reason: Optional[str] = None


@dataclass
class OutcomeViewLightweight:
    """Outcome fields in the lightweight profile."""

    market_id: str = ""
    outcome_id: str = ""
    price: float = 0.0
    freshness_ms: float = 0.0


@dataclass
class OutcomeViewAnalytics(OutcomeViewLightweight):
    """Outcome fields in the analytics profile (⊃ lightweight)."""

    publish_authority_class: str = ""
    decision_reason: str = ""
    degraded: bool = False
    fallback_state: str = ""
    confidence: float = 1.0
    data_class: str = ""
    all_candidate_sources: list[CandidateSourceView] = field(default_factory=list)


@dataclass
class OutcomeViewDebug(OutcomeViewAnalytics):
    """Outcome fields in the debug profile (⊃ analytics)."""

    source_used_for_publish: str = ""
    is_tombstone: bool = False
    collected_at: Optional[str] = None
    received_at: Optional[str] = None


@dataclass
class EventViewLightweight:
    """Event-level fields in the lightweight profile."""

    event_id: str = ""
    freshness_ms: float = 0.0
    degraded: bool = False
    system_state: str = "normal"
    is_tombstone: bool = False
    outcomes: list[OutcomeViewLightweight] = field(default_factory=list)


@dataclass
class EventViewAnalytics(EventViewLightweight):
    """Event-level fields in the analytics profile (⊃ lightweight)."""

    publish_authority_class: str = ""
    decision_reason: str = ""
    fallback_state: str = ""
    confidence: float = 1.0
    all_candidate_sources: list[CandidateSourceView] = field(default_factory=list)
    outcomes: list[OutcomeViewAnalytics] = field(default_factory=list)  # type: ignore[assignment]


@dataclass
class EventViewDebug(EventViewAnalytics):
    """Event-level fields in the debug profile (⊃ analytics)."""

    source_used_for_publish: str = ""
    collected_at: Optional[str] = None
    received_at: Optional[str] = None
    normalized_identifiers: dict[str, str] = field(default_factory=dict)
    raw_provenance_ref: dict[str, str] = field(default_factory=dict)
    outcomes: list[OutcomeViewDebug] = field(default_factory=list)  # type: ignore[assignment]


@dataclass
class SnapshotPayload:
    """Full snapshot payload shape."""

    type: str = "snapshot"
    profile: str = "lightweight"
    events: list[dict[str, Any]] = field(default_factory=list)
    count: int = 0
    state_machine: Optional[dict[str, Any]] = None


@dataclass
class DeltaPayload:
    """Delta payload shape — events changed since a timestamp."""

    type: str = "delta"
    profile: str = "lightweight"
    since: Optional[str] = None
    events: list[dict[str, Any]] = field(default_factory=list)
    count: int = 0
    state_machine: Optional[dict[str, Any]] = None


# Helper: field sets per profile for containment validation.
LIGHTWEIGHT_FIELDS: frozenset[str] = frozenset(
    EventViewLightweight.__dataclass_fields__.keys()
)
ANALYTICS_FIELDS: frozenset[str] = frozenset(
    EventViewAnalytics.__dataclass_fields__.keys()
)
DEBUG_FIELDS: frozenset[str] = frozenset(
    EventViewDebug.__dataclass_fields__.keys()
)


__all__ = [
    "ANALYTICS_FIELDS",
    "CandidateSourceView",
    "DEBUG_FIELDS",
    "DeltaPayload",
    "EventViewAnalytics",
    "EventViewDebug",
    "EventViewLightweight",
    "LIGHTWEIGHT_FIELDS",
    "OutcomeViewAnalytics",
    "OutcomeViewDebug",
    "OutcomeViewLightweight",
    "SnapshotPayload",
]
