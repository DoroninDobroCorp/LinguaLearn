"""Phase 7: consumer contract tests."""

from __future__ import annotations

from dataclasses import asdict

from aggregator.consumer_contract import (
    ANALYTICS_FIELDS,
    DEBUG_FIELDS,
    DeltaPayload,
    EventViewDebug,
    EventViewLightweight,
    LIGHTWEIGHT_FIELDS,
    OutcomeViewAnalytics,
    OutcomeViewDebug,
    OutcomeViewLightweight,
    SnapshotPayload,
)


# ── field containment invariant ───────────────────────────────────


def test_lightweight_subset_of_analytics():
    assert LIGHTWEIGHT_FIELDS <= ANALYTICS_FIELDS


def test_analytics_subset_of_debug():
    assert ANALYTICS_FIELDS <= DEBUG_FIELDS


def test_outcome_lightweight_subset_of_analytics():
    lw_fields = set(OutcomeViewLightweight.__dataclass_fields__.keys())
    an_fields = set(OutcomeViewAnalytics.__dataclass_fields__.keys())
    assert lw_fields <= an_fields


def test_outcome_analytics_subset_of_debug():
    an_fields = set(OutcomeViewAnalytics.__dataclass_fields__.keys())
    dbg_fields = set(OutcomeViewDebug.__dataclass_fields__.keys())
    assert an_fields <= dbg_fields


# ── serialization ─────────────────────────────────────────────────


def test_snapshot_payload_serializes():
    p = SnapshotPayload(
        type="snapshot",
        profile="lightweight",
        events=[{"event_id": "e1"}],
        count=1,
    )
    d = asdict(p)
    assert d["type"] == "snapshot"
    assert d["count"] == 1
    assert len(d["events"]) == 1


def test_delta_payload_serializes():
    p = DeltaPayload(
        type="delta",
        profile="analytics",
        since="2026-01-01T00:00:00+00:00",
        events=[],
        count=0,
    )
    d = asdict(p)
    assert d["type"] == "delta"
    assert d["since"] == "2026-01-01T00:00:00+00:00"


def test_event_view_debug_has_all_fields():
    ev = EventViewDebug(
        event_id="ev1",
        freshness_ms=10.0,
        degraded=False,
        system_state="normal",
        source_used_for_publish="pin888:a:browser_ws",
    )
    d = asdict(ev)
    assert "event_id" in d
    assert "source_used_for_publish" in d
    assert "normalized_identifiers" in d


def test_lightweight_event_has_minimal_fields():
    ev = EventViewLightweight(event_id="x", freshness_ms=5.0)
    d = asdict(ev)
    assert set(d.keys()) == {
        "event_id", "freshness_ms", "degraded", "system_state",
        "is_tombstone", "outcomes",
    }
