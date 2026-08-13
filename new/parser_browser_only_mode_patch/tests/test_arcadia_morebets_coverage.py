from __future__ import annotations

from tools.arcadia_morebets_coverage import (
    analyze_coverage,
    extract_arcadia_specials_only_ids,
    extract_our_morebets,
    is_morebets_snapshot_event,
    parse_pid_from_snapshot_event,
)


def test_parse_pid_from_snapshot_event_prefers_shared_pid_event_id() -> None:
    event = {"event_id": "agg:pid:12345", "normalized_identifiers": {"pid": 999}}
    assert parse_pid_from_snapshot_event(event) == 12345


def test_parse_pid_from_snapshot_event_falls_back_to_normalized_identifiers() -> None:
    event = {"event_id": "legacy:whatever", "normalized_identifiers": {"pid": "456"}}
    assert parse_pid_from_snapshot_event(event) == 456


def test_is_morebets_snapshot_event_detects_morebets_data_class() -> None:
    event = {
        "decision_reason": "fresh_native_browser_ws_preferred_base_market",
        "outcomes": [{"data_class": "more_bets_special"}],
    }
    assert is_morebets_snapshot_event(event) is True


def test_is_morebets_snapshot_event_detects_morebets_context_marker() -> None:
    event = {"morebets_context": {"active": True, "families": ["corners"]}}
    assert is_morebets_snapshot_event(event) is True


def test_extract_our_morebets_filters_by_sport_and_collects_metadata() -> None:
    snapshot = {
        "events": [
            {
                "event_id": "agg:pid:101",
                "sport_id": 29,
                "starts_at": "2026-04-26T08:00:00+00:00",
                "decision_reason": "fresh_native_browser_ws_preferred_more_bets_special",
                "source_used_for_publish": "ws",
                "outcomes": [
                    {"market_id": 12, "data_class": "more_bets_special"},
                    {"market_id": 11, "data_class": "more_bets_special"},
                ],
            },
            {
                "event_id": "agg:pid:202",
                "sport_id": 33,
                "decision_reason": "fresh_native_browser_ws_preferred_more_bets_special",
                "source_used_for_publish": "ws",
                "outcomes": [{"market_id": 99, "data_class": "more_bets_special"}],
            },
        ]
    }

    extracted = extract_our_morebets(snapshot, sport_id=29, seen_at="2026-04-26T08:05:00+00:00")
    assert sorted(extracted) == [101]
    assert extracted[101]["market_ids"] == [11, 12]
    assert extracted[101]["source_used_for_publish"] == "ws"
    assert extracted[101]["seen_first_at"] == "2026-04-26T08:05:00+00:00"


def test_extract_arcadia_specials_only_ids_subtracts_base_ids() -> None:
    base = [{"id": 1}, {"id": 2}, {"id": 3}]
    specials = [{"id": 2}, {"id": 3}, {"id": 4}, {"id": 5}]
    assert extract_arcadia_specials_only_ids(base, specials) == {4, 5}


def test_analyze_coverage_returns_no_when_our_only_exceeds_threshold() -> None:
    our_morebets = {
        10: {"pid": 10, "source_used_for_publish": "ws"},
        20: {"pid": 20, "source_used_for_publish": "ws"},
        30: {"pid": 30, "source_used_for_publish": "api"},
        40: {"pid": 40, "source_used_for_publish": "api"},
    }

    coverage = analyze_coverage(our_morebets, {30, 40, 50}, sample_size=2)
    assert coverage["intersect"] == 2
    assert coverage["arcadia_only"] == 1
    assert coverage["our_only"] == 2
    assert coverage["our_only_pct"] == 0.5
    assert coverage["verdict"] == "NO"
    assert [sample["pid"] for sample in coverage["our_only_sample"]] == [10, 20]