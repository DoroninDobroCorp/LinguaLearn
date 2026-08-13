"""Consumer view profiles + snapshot/delta encoders (Phase 5, TZ §8/§9.4).

Three view profiles:

- ``lightweight`` — ``event_id``, outcome ids, prices, freshness,
  ``degraded`` flag, ``system_state``. Smallest payload — for the
  value engine.
- ``analytics`` — lightweight ⊕ per-source candidate prices,
  ``fallback_state``, ``confidence``, ``decision_reason``. For the
  predictor.
- ``debug`` — analytics ⊕ ``decision_reason`` (full chain), raw
  provenance pointers, state-machine snapshot. For ops / parity /
  Bogdan.

Field containment invariant (enforced by tests):
``lightweight ⊆ analytics ⊆ debug``.

Selection
---------

- ``MSP_VIEW_PROFILE`` env: ``lightweight``/``analytics``/``debug``.
- Default ``lightweight`` — only takes effect when the v2 feed is
  served (i.e. ``MSP_AGGREGATOR_ENABLED`` is on). The renderers
  themselves are pure.

Snapshot / delta
----------------

``build_snapshot_payload(view_profile, quotes)`` and
``build_delta_payload(view_profile, since_ts, quotes)`` are pure
functions. They never read env directly — caller picks the profile.

Nothing here opens a socket. The endpoints in TZ §9.5 will arrive in
Phase 7; this module only exposes encoders.
"""

from __future__ import annotations

import os
from dataclasses import asdict
from datetime import datetime
from enum import Enum
from typing import Any, Iterable

from aggregator.types import PublishedOutcome, PublishedQuote


class ViewProfile(str, Enum):
    LIGHTWEIGHT = "lightweight"
    ANALYTICS = "analytics"
    DEBUG = "debug"


def view_profile_from_env() -> ViewProfile:
    raw = os.environ.get("MSP_VIEW_PROFILE", "").strip().lower()
    if raw == "analytics":
        return ViewProfile.ANALYTICS
    if raw == "debug":
        return ViewProfile.DEBUG
    return ViewProfile.LIGHTWEIGHT


# ── per-outcome rendering ─────────────────────────────────────────────


_LW_OUTCOME_FIELDS = ("market_id", "outcome_id", "price", "freshness_ms")
_AN_EXTRA_OUTCOME_FIELDS = (
    "publish_authority_class",
    "decision_reason",
    "degraded",
    "fallback_state",
    "confidence",
    "data_class",
)
_DBG_EXTRA_OUTCOME_FIELDS = (
    "source_used_for_publish",
    "is_tombstone",
    "collected_at",
    "received_at",
)


def _iso(ts: datetime | None) -> str | None:
    if ts is None:
        return None
    return ts.isoformat()


def _outcome_lightweight(o: PublishedOutcome) -> dict[str, Any]:
    return {
        "market_id": o.market_id,
        "outcome_id": o.outcome_id,
        "price": o.price,
        "freshness_ms": o.freshness_ms,
    }


def _outcome_analytics(o: PublishedOutcome) -> dict[str, Any]:
    base = _outcome_lightweight(o)
    base.update({
        "publish_authority_class": o.publish_authority_class,
        "decision_reason": o.decision_reason,
        "degraded": o.degraded,
        "fallback_state": o.fallback_state,
        "confidence": o.confidence,
        "data_class": o.data_class,
        "all_candidate_sources": [
            {"source": c.source, "age_ms": c.age_ms, "price": c.price,
             "rejected_reason": c.rejected_reason}
            for c in o.all_candidate_sources
        ],
    })
    return base


def _outcome_debug(o: PublishedOutcome) -> dict[str, Any]:
    base = _outcome_analytics(o)
    base.update({
        "source_used_for_publish": o.source_used_for_publish,
        "is_tombstone": o.is_tombstone,
        "collected_at": _iso(o.collected_at),
        "received_at": _iso(o.received_at),
    })
    return base


# ── per-quote rendering ──────────────────────────────────────────────


def render_lightweight(quote: PublishedQuote) -> dict[str, Any]:
    return {
        "event_id": quote.event_id,
        "freshness_ms": quote.freshness_ms,
        "degraded": quote.degraded,
        "system_state": quote.system_state_snapshot.value,
        "is_tombstone": quote.is_tombstone,
        "outcomes": [_outcome_lightweight(o) for o in quote.outcomes],
    }


def _payload_field(quote: PublishedQuote, key: str) -> Any:
    """Read a defensive field from quote.payload; return None if payload
    isn't a dict or key missing. Story 27.17 — metadata enrichment.
    """
    payload = getattr(quote, "payload", None)
    if not isinstance(payload, dict):
        return None
    return payload.get(key)


def render_analytics(quote: PublishedQuote) -> dict[str, Any]:
    out = render_lightweight(quote)
    out.update({
        "publish_authority_class": quote.publish_authority_class,
        "decision_reason": quote.decision_reason,
        "fallback_state": quote.fallback_state,
        "confidence": quote.confidence,
        "all_candidate_sources": [
            {"source": c.source, "age_ms": c.age_ms, "price": c.price,
             "rejected_reason": c.rejected_reason}
            for c in quote.all_candidate_sources
        ],
        "outcomes": [_outcome_analytics(o) for o in quote.outcomes],
        # Story 27.17 — sport_id + is_live даже в analytics profile,
        # т.к. большинству SLA дашбордов они нужны. starts_at — только
        # в debug (heavy для high-fanout feeds).
        "sport_id": _payload_field(quote, "sport_id"),
        "is_live": _payload_field(quote, "is_live"),
        # Story 27.24 — is_halted (status="H" из Pinnacle fixtures API).
        # Используется в verify_sla_matrix чтобы исключать из SLA только
        # legitimate-паузы, а не delivery failures с пустыми markets.
        "is_halted": bool(_payload_field(quote, "is_halted")),
    })
    return out


def render_debug(quote: PublishedQuote) -> dict[str, Any]:
    out = render_analytics(quote)
    out.update({
        "source_used_for_publish": quote.source_used_for_publish,
        "collected_at": _iso(quote.collected_at),
        "received_at": _iso(quote.received_at),
        "normalized_identifiers": dict(quote.normalized_identifiers),
        "raw_provenance_ref": {
            "event_id": quote.event_id,
            "source": quote.source_used_for_publish,
        },
        "outcomes": [_outcome_debug(o) for o in quote.outcomes],
        # Story 27.17 — starts_at для live/prematch classification в
        # distance-test tooling (Story 27.10/11).
        "starts_at": _payload_field(quote, "starts_at"),
    })
    if quote.morebets_context:
        out["morebets_context"] = dict(quote.morebets_context)
    return out


def render(quote: PublishedQuote, profile: ViewProfile) -> dict[str, Any]:
    if profile is ViewProfile.LIGHTWEIGHT:
        return render_lightweight(quote)
    if profile is ViewProfile.ANALYTICS:
        return render_analytics(quote)
    return render_debug(quote)


# ── snapshot / delta encoders ────────────────────────────────────────


def build_snapshot_payload(
    profile: ViewProfile,
    quotes: Iterable[PublishedQuote],
    *,
    state_machine_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the initial snapshot payload for a fresh consumer."""
    rendered = [render(q, profile) for q in quotes]
    out: dict[str, Any] = {
        "type": "snapshot",
        "profile": profile.value,
        "events": rendered,
        "count": len(rendered),
    }
    if profile is ViewProfile.DEBUG:
        out["state_machine"] = dict(state_machine_snapshot or {})
    return out


def build_delta_payload(
    profile: ViewProfile,
    since_ts: datetime | None,
    quotes: Iterable[PublishedQuote],
    *,
    state_machine_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a delta payload — only quotes newer than ``since_ts``."""
    selected: list[PublishedQuote] = []
    for q in quotes:
        if since_ts is None or q.received_at > since_ts:
            selected.append(q)
    rendered = [render(q, profile) for q in selected]
    out: dict[str, Any] = {
        "type": "delta",
        "profile": profile.value,
        "since": _iso(since_ts),
        "events": rendered,
        "count": len(rendered),
    }
    if profile is ViewProfile.DEBUG:
        out["state_machine"] = dict(state_machine_snapshot or {})
    return out


# Avoid unused-import warning when extending later.
_ = asdict


__all__ = [
    "ViewProfile",
    "build_delta_payload",
    "build_snapshot_payload",
    "render",
    "render_analytics",
    "render_debug",
    "render_lightweight",
    "view_profile_from_env",
]
