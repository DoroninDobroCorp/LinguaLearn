"""Focused tests for pure BIA lookup-failure diagnostics and its adapter."""

from __future__ import annotations

from services.bia_lookup_diagnostics import (
    annotate_lookup_failure,
    lookup_diagnostic_category,
)
from services.bia_observer import BiaObserverStats, lookup_bia_selection_for_pid


def test_lookup_failure_distinguishes_parser_event_from_bia_identity_miss(monkeypatch):
    from services import bia_observer as obs
    from state import state

    stats = BiaObserverStats()
    monkeypatch.setattr(state, "events_data", {
        101: {
            "Home": "Existing Home",
            "Away": "Existing Away",
            "SportName": "Soccer",
        },
    }, raising=False)
    monkeypatch.setattr(
        obs,
        "_matching_bia_event_refs_for_pid",
        lambda *_args, **_kwargs: [],
    )

    result = lookup_bia_selection_for_pid(
        101,
        period=0,
        selection={"bet_type": 1, "team_select": 0, "handicap": 0},
        stats=stats,
    )

    assert result["error_code"] == "BIA_EVENT_NOT_FOUND"
    assert result["parser_event_found"] is True
    assert result["diagnostic_category"] == "bia_event_identity_missing"

    missing = lookup_bia_selection_for_pid(
        999,
        period=0,
        selection={"bet_type": 1, "team_select": 0, "handicap": 0},
        stats=stats,
    )
    assert missing["parser_event_found"] is False
    assert missing["diagnostic_category"] == "parser_event_missing"


def test_lookup_failure_exposes_bounded_price_free_market_evidence(monkeypatch):
    from services import bia_observer as obs
    from state import state

    stats = BiaObserverStats()
    monkeypatch.setattr(state, "events_data", {101: {}}, raising=False)
    event_ref = {
        "event_id": 101,
        "period": 0,
        "comp_id": "703",
        "sport_code": "fb",
        "event_key": "2026-08-08,26163,753",
        "swapped": False,
    }
    stats._offer_proofs.observe(
        competition_id="703",
        sport_code="fb",
        event_key="2026-08-08,26163,753",
        markets={"wdw": [None, [["h", 2.1], ["d", 3.2], ["a", 3.8]]]},
    )
    stats._raw_offer_groups[("fb", "2026-08-08,26163,753")] = {
        "wdw", "time_ah,tperiod,1",
    }
    monkeypatch.setattr(
        obs,
        "_matching_bia_event_refs_for_pid",
        lambda *_args, **_kwargs: [dict(event_ref)],
    )

    result = lookup_bia_selection_for_pid(
        101,
        period=0,
        selection={"bet_type": 3, "team_select": 4, "handicap": 2.5},
        stats=stats,
    )

    assert result["error_code"] == "BIA_OFFER_MARKET_MISSING"
    assert result["diagnostic_category"] == "market_family_missing"
    assert result["parser_event_found"] is True
    assert result["candidate_error_codes"] == ["BIA_OFFER_MARKET_MISSING"]
    assert result["raw_offer_group_count"] == 2
    assert result["raw_offer_groups"] == ["time_ah,tperiod,1", "wdw"]


def test_lookup_diagnostics_use_current_parser_inventory_not_stale_candidate_refs(
    monkeypatch,
):
    from services import bia_observer as obs
    from state import state

    stats = BiaObserverStats()
    stale_ref = {
        "event_id": 101,
        "period": 0,
        "comp_id": "703",
        "sport_code": "fb",
        "event_key": "2026-08-08,26163,753",
    }
    monkeypatch.setattr(state, "events_data", {}, raising=False)

    result = obs._annotate_bia_lookup_failure(
        {
            "found": False,
            "event_found": False,
            "event_id": 101,
            "error_code": "BIA_EVENT_NOT_FOUND",
        },
        event_id=101,
        stats=stats,
        event_refs=[stale_ref],
    )

    assert result["parser_event_found"] is False
    assert result["diagnostic_category"] == "parser_event_missing"
    assert result["raw_offer_group_count"] == 0


def test_pure_annotation_sanitizes_and_bounds_structural_evidence():
    event_ref = {"sport_code": "fb", "event_key": "event-1"}
    result = annotate_lookup_failure(
        {
            "found": False,
            "error_code": "BIA_OFFER_MARKET_MISSING",
            "raw_offer_groups": [" wdw ", "", "x" * 97],
            "raw_offer_group_count": 7,
        },
        parser_event_found=True,
        event_refs=[event_ref, None],
        candidate_error_codes=[" bia_offer_line_missing ", "", None],
        raw_offer_groups_by_event={("fb", "event-1"): {"ah", "wdw"}},
    )

    assert result == {
        "found": False,
        "error_code": "BIA_OFFER_MARKET_MISSING",
        "parser_event_found": True,
        "diagnostic_category": "market_family_missing",
        "candidate_error_codes": ["BIA_OFFER_LINE_MISSING"],
        "raw_offer_group_count": 7,
        "raw_offer_groups": ["ah", "wdw"],
    }


def test_pure_annotation_caps_samples_without_losing_total_count():
    result = annotate_lookup_failure(
        {"found": False, "error_code": "BIA_OFFER_PROOF_MISSING"},
        parser_event_found=True,
        event_refs=[{"sport_code": "fb", "event_key": "event-1"}],
        candidate_error_codes=[f"error_{number:02}" for number in range(20)],
        raw_offer_groups_by_event={
            ("fb", "event-1"): {f"group_{number:02}" for number in range(35)},
        },
    )

    assert result["candidate_error_codes"] == [
        f"ERROR_{number:02}" for number in range(16)
    ]
    assert result["raw_offer_group_count"] == 35
    assert result["raw_offer_groups"] == [
        f"group_{number:02}" for number in range(32)
    ]


def test_pure_annotation_leaves_success_payload_untouched():
    successful = {"found": True, "offer_proof": {"bia_bet_type": "for,ml,h"}}

    assert annotate_lookup_failure(
        successful,
        parser_event_found=False,
        candidate_error_codes=["BIA_OFFER_MARKET_MISSING"],
    ) == successful


def test_refresh_unavailable_is_transport_not_selection_failure():
    from services import bia_observer as obs

    expected = lookup_diagnostic_category(
        "BIA_OFFER_REFRESH_UNAVAILABLE",
        parser_event_found=True,
    )

    assert expected == "observer_unavailable"
    assert obs._bia_lookup_diagnostic_category(
        "BIA_OFFER_REFRESH_UNAVAILABLE",
        parser_event_found=True,
    ) == expected
