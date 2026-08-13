"""Tests for Story 27.6 — BIA narrowed to MoreBets + core isolation.

Covers AC-1 through AC-7 and the DOD test requirements, focused on:

* BIA observer snapshot carries structured ``scope`` /
  ``core_isolated`` / ``circuit_state`` fields (AC-2, DOD-4).
* ``core_platform_degraded()`` never consults BIA state (AC-3, DOD-5).
* ``BiaSourceAdapter`` emits SourceEvents for MoreBets families only
  and blocks core-market payloads with a counter (AC-1, AC-4, AC-7,
  DOD-7..10).
"""

from __future__ import annotations

from typing import Any

import pytest

from aggregator.sources.bia_source import BiaSourceAdapter
from aggregator.types import SourceEvent
from services.bia_observer import (
    compute_bia_circuit_state,
    core_platform_degraded,
)


# ---------------------------------------------------------------------------
# compute_bia_circuit_state — AC-2
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "state,expected",
    [
        ("connected", "closed"),
        ("idle", "degraded"),
        ("connecting", "degraded"),
        ("reconnecting", "auth_failed_halted"),
        ("stopped", "auth_failed_halted"),
    ],
)
def test_compute_bia_circuit_state_mapping(state: str, expected: str) -> None:
    assert compute_bia_circuit_state(lifecycle_state=state) == expected


# ---------------------------------------------------------------------------
# core_platform_degraded — AC-3 invariant
# ---------------------------------------------------------------------------


def test_core_not_degraded_when_api_alone_alive() -> None:
    assert core_platform_degraded(api_degraded=False, ws_degraded=True) is False


def test_core_not_degraded_when_ws_alone_alive() -> None:
    assert core_platform_degraded(api_degraded=True, ws_degraded=False) is False


def test_core_degraded_when_both_down() -> None:
    assert core_platform_degraded(api_degraded=True, ws_degraded=True) is True


@pytest.mark.parametrize(
    "bia_state", ["closed", "auth_failed_halted", "degraded"]
)
def test_bia_state_never_flips_core_degraded(bia_state: str) -> None:
    # The invariant: as long as API or WS is alive, BIA state doesn't
    # matter; core is not degraded.
    assert (
        core_platform_degraded(
            api_degraded=False,
            ws_degraded=False,
            bia_circuit_state=bia_state,
        )
        is False
    )
    # And when both natives down, BIA state also doesn't *prevent* the
    # degraded flag; both dominant inputs alone decide it.
    assert (
        core_platform_degraded(
            api_degraded=True,
            ws_degraded=True,
            bia_circuit_state=bia_state,
        )
        is True
    )


# ---------------------------------------------------------------------------
# BiaSourceAdapter — AC-1 / AC-4 / AC-6 / AC-7
# ---------------------------------------------------------------------------


def _mk_adapter(
    *, matcher_fn: Any = None
) -> tuple[BiaSourceAdapter, list[SourceEvent]]:
    captured: list[SourceEvent] = []
    adapter = BiaSourceAdapter(
        emit_callback=lambda ev: captured.append(ev),
        matcher_fn=matcher_fn,
    )
    return adapter, captured


def test_morebets_payload_is_emitted_as_source_event() -> None:
    adapter, captured = _mk_adapter()
    admitted = adapter.ingest_bia_event(
        event_type="offers_hcap",
        payload={
            "market_family": "corners",
            "pid": 4242,
            "match_confidence": 0.95,
        },
    )
    assert admitted is True
    assert len(captured) == 1
    ev = captured[0]
    assert ev.family == "bia"
    assert ev.source_id == "bia"
    assert ev.event_id == "4242"
    assert ev.confidence == 0.95


def test_core_market_payload_is_blocked() -> None:
    """AC-1: core markets must NOT produce SourceEvents."""
    adapter, captured = _mk_adapter()
    # "1x2" or any non-MoreBets label → blocked.
    admitted = adapter.ingest_bia_event(
        event_type="offers_event",
        payload={"market_family": "1x2", "pid": 1, "match_confidence": 1.0},
    )
    assert admitted is False
    assert len(captured) == 0
    stats = adapter.stats()
    assert stats["bia_core_writes_blocked_total"] == 1


def test_unknown_family_label_still_admitted() -> None:
    """DOD-8 — ``unknown_family`` is on the MoreBets allowlist."""
    adapter, captured = _mk_adapter()
    admitted = adapter.ingest_bia_event(
        event_type="offers_hcap",
        payload={"pid": 1},  # no family key → defaults to unknown_family
    )
    assert admitted is True
    assert captured[0].event_id == "1"


def test_matcher_fn_overrides_payload_confidence() -> None:
    adapter, captured = _mk_adapter(matcher_fn=lambda p: 0.72)
    adapter.ingest_bia_event(
        event_type="offers_hcap",
        payload={"market_family": "corners", "pid": 1, "match_confidence": 0.99},
    )
    assert captured[0].confidence == 0.72


def test_matcher_fn_exception_drops_event() -> None:
    def bad_matcher(payload: dict) -> float:
        raise RuntimeError("match engine angry")

    adapter, captured = _mk_adapter(matcher_fn=bad_matcher)
    admitted = adapter.ingest_bia_event(
        event_type="offers_hcap",
        payload={"market_family": "corners", "pid": 1},
    )
    assert admitted is False
    assert len(captured) == 0


def test_zero_confidence_event_not_emitted() -> None:
    adapter, captured = _mk_adapter()
    admitted = adapter.ingest_bia_event(
        event_type="offers_hcap",
        payload={"market_family": "corners", "pid": 1, "match_confidence": 0.0},
    )
    assert admitted is False
    assert captured == []
    assert adapter.stats()["bia_events_unmatched_total"] == 1


def test_confidence_clamped_to_unit_range() -> None:
    adapter, captured = _mk_adapter(matcher_fn=lambda p: 2.5)
    adapter.ingest_bia_event(
        event_type="offers_hcap",
        payload={"market_family": "corners", "pid": 1},
    )
    assert captured[0].confidence == 1.0


def test_drop_as_unmatched_updates_counter() -> None:
    adapter, _ = _mk_adapter()
    adapter.drop_as_unmatched(event_type="offers_hcap")
    adapter.drop_as_unmatched(event_type="offers_event")
    stats = adapter.stats()
    assert stats["bia_events_unmatched_total"] == 2
    assert stats["bia_messages_received_total"] == {
        "offers_hcap": 1,
        "offers_event": 1,
    }


def test_stats_include_ac7_metric_shape() -> None:
    adapter, _ = _mk_adapter()
    adapter.ingest_bia_event(
        event_type="offers_hcap",
        payload={"market_family": "corners", "pid": 1, "match_confidence": 0.9},
    )
    adapter.ingest_bia_event(
        event_type="offers_event",
        payload={"market_family": "1x2", "pid": 2, "match_confidence": 0.9},
    )
    stats = adapter.stats()
    # AC-7 canonical metric names.
    for required in (
        "bia_messages_received_total",
        "bia_events_matched_total",
        "bia_events_unmatched_total",
        "bia_source_events_emitted_total",
        "bia_core_writes_blocked_total",
    ):
        assert required in stats, f"missing AC-7 metric: {required}"
    assert stats["bia_source_events_emitted_total"] == {"scope=morebets": 1}
    assert stats["bia_core_writes_blocked_total"] == 1


def test_emit_callback_exception_does_not_break_adapter() -> None:
    def bad_emit(ev: SourceEvent) -> None:
        raise RuntimeError("consumer on fire")

    adapter = BiaSourceAdapter(emit_callback=bad_emit)
    # Should NOT raise; stats still reflect the emitted event.
    admitted = adapter.ingest_bia_event(
        event_type="offers_hcap",
        payload={"market_family": "corners", "pid": 1, "match_confidence": 0.9},
    )
    assert admitted is True
    assert adapter.stats()["bia_source_events_emitted_total"] == {
        "scope=morebets": 1
    }


# ---------------------------------------------------------------------------
# BIA observer snapshot additive fields — AC-2 / DOD-4 / DOD-6
# ---------------------------------------------------------------------------


def test_bia_observer_snapshot_contains_scope_field() -> None:
    from services.bia_observer import bia_observer_snapshot

    snap = bia_observer_snapshot()
    assert snap["scope"] == "morebets_only"
    assert snap["core_isolated"] is True
    assert snap["circuit_state"] in {"closed", "degraded", "auth_failed_halted"}


def test_bia_observer_snapshot_backwards_compat_keys_preserved() -> None:
    """Existing consumers reading enabled/running/state/connected keep working."""
    from services.bia_observer import bia_observer_snapshot

    snap = bia_observer_snapshot()
    for legacy_key in ("enabled", "running", "state", "connected"):
        assert legacy_key in snap
