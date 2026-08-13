from __future__ import annotations

import copy
import json

from aggregator.pin888_hub_compat import (
    Pin888HubCompatState,
    bia_lookup_payload,
    event_to_stream_rows,
    special_offer_proof_payload,
    special_lookup_payload,
)


def test_bia_lookup_payload_delegates_to_existing_matcher() -> None:
    calls = []

    def lookup(event_id, *, period):
        calls.append((event_id, period))
        return {"event_key": "bia-1", "sport_code": "fb", "swapped": False}

    body, status = bia_lookup_payload("123", "1", lookup=lookup)

    assert status == 200
    assert body["found"] is True
    assert body["event_key"] == "bia-1"
    assert calls == [(123, 1)]


def test_bia_lookup_payload_rejects_invalid_event_id() -> None:
    body, status = bia_lookup_payload("nope")
    assert status == 400
    assert body["error"] == "event_id and period must be integers"


def test_bia_lookup_payload_forwards_exact_selection_proof_coordinates() -> None:
    calls = []

    def selection_lookup(event_id, *, period, selection):
        calls.append((event_id, period, selection))
        return {
            "found": True,
            "event_found": True,
            "offer_proof": {"bia_bet_type": "for,tmap,1,ahunder,90"},
        }

    body, status = bia_lookup_payload(
        "123",
        "0",
        proof_raw="1",
        bet_type_raw="3",
        team_select_raw="4",
        handicap_raw="22.5",
        map_number_raw="1",
        esports_unit_raw="rounds",
        market_context_raw="corners",
        selection_lookup=selection_lookup,
    )

    assert status == 200
    assert body["found"] is True
    assert calls == [(123, 0, {
        "bet_type": 3,
        "team_select": 4,
        "handicap": "22.5",
        "map_number": 1,
        "game_number": 0,
        "esports_unit": "rounds",
        "market_context": "corners",
        "period_type": "",
        "inning_number": 0,
        "half_number": 0,
    })]


def test_bia_lookup_payload_requires_complete_proof_coordinates() -> None:
    body, status = bia_lookup_payload("123", "0", proof_raw="1")
    assert status == 400
    assert "proof requires" in body["error"]


def test_bia_lookup_payload_preserves_unique_lookup_ambiguity() -> None:
    body, status = bia_lookup_payload(
        "123",
        "0",
        lookup=lambda *_args, **_kwargs: {
            "found": False,
            "event_found": True,
            "error_code": "BIA_EVENT_AMBIGUOUS",
            "candidate_count": 2,
        },
    )

    assert status == 200
    assert body["found"] is False
    assert body["error_code"] == "BIA_EVENT_AMBIGUOUS"
    assert body["candidate_count"] == 2


def test_special_lookup_payload_uses_exact_structural_coordinates() -> None:
    calls = []

    def lookup(event_id, special_type, contestant, period, handicap):
        calls.append((event_id, special_type, contestant, period, handicap))
        return {
            "cid": "selection-42",
            "special_id": 991,
            "price": 1.875,
            "ts": 1234,
        }

    body, status = special_lookup_payload(
        "1633133757", "TO_QUALIFY", "Home", "0", "0", lookup=lookup,
    )

    assert status == 200
    assert body == {
        "found": True,
        "event_id": 1633133757,
        "special_type": "to_qualify",
        "contestant": "Home",
        "period": 0,
        "handicap": 0.0,
        "cid": "selection-42",
        "special_id": 991,
        "price": 1.875,
        "ts": 1234,
        "source": "pinnacle_special_ids",
    }
    assert calls == [(1633133757, "to_qualify", "Home", 0, 0.0)]


def test_special_lookup_payload_rejects_incomplete_or_invalid_identity() -> None:
    body, status = special_lookup_payload("163", "", "Home")
    assert status == 400
    assert body["error"] == "invalid special type"

    body, status = special_lookup_payload("163", "to qualify", "Home")
    assert status == 400
    assert body["error"] == "invalid special type"


def test_special_lookup_payload_does_not_return_unpriced_selection() -> None:
    body, status = special_lookup_payload(
        "163", "to_qualify", "Away", lookup=lambda *_args: {
            "cid": "selection-1",
            "price": 0,
        },
    )
    assert status == 200
    assert body["found"] is False


def test_special_lookup_payload_falls_back_to_fresh_exact_bia_special() -> None:
    events = {
        1633133757: {
            "Periods": [{
                "Number": 0,
                "ToQualify": {
                    "Home": {"value": 1.91},
                    "Away": {"value": 1.97},
                },
                "_ToQualify_ts": 1000.0,
            }],
        },
    }
    body, status = special_lookup_payload(
        "1633133757",
        "to_qualify",
        "Away",
        events_data=events,
        lookup=lambda *_args: None,
    )

    # The synthetic fixture timestamp is intentionally evaluated through the
    # pure normalized helper below; the public helper must reject stale data.
    assert status == 200
    assert body["found"] is False

    from aggregator.pin888_hub_compat import _normalized_special_offer

    exact = _normalized_special_offer(
        events,
        1633133757,
        "to_qualify",
        "Away",
        0,
        0.0,
        now=1001.0,
    )
    assert exact == {
        "cid": "bia-special-proof:1633133757:0:to_qualify:Away",
        "price": 1.97,
        "ts": 1000.0,
        "source": "bia_special_offer",
    }


def test_normalized_special_offer_requires_exact_contestant_and_freshness() -> None:
    from aggregator.pin888_hub_compat import _normalized_special_offer

    events = {
        "10": {
            "Period": {"0": {
                "ToQualify": {"Home": {"value": 1.8}},
                "_ToQualify_ts": 2000.0,
            }},
        },
    }
    assert _normalized_special_offer(
        events, 10, "to_qualify", "Away", 0, 0, now=2001,
    ) is None
    assert _normalized_special_offer(
        events, 10, "to_qualify", "Home", 0, 0, now=4001,
    ) is None


def test_special_offer_proof_payload_requires_one_exact_bia_namespace() -> None:
    class Registry:
        def try_prove_special(self, ref, **coordinates):
            if ref["sport_code"] != "fb":
                return {"status": "UNAVAILABLE", "error_code": "BIA_OFFER_MARKET_MISSING"}
            assert coordinates == {
                "special_type": "to_qualify",
                "contestant": "Home",
                "period": 0,
                "handicap": 0.0,
            }
            return {
                "status": "OK",
                "raw_group": "qualify",
                "outcome": "h",
                "bet_type": "for,qualify,h",
                "observed_at": 100.0,
                "expires_at": 200.0,
            }

    body = special_offer_proof_payload(
        [
            {"sport_code": "fb", "event_key": "event", "swapped": False},
            {"sport_code": "fb_corn", "event_key": "event", "swapped": False},
        ],
        Registry(),
        special_type="to_qualify",
        contestant="Home",
        period=0,
        handicap=0.0,
    )

    assert body["found"] is True
    assert body["source"] == "bia_special_offer_proof"
    assert body["sport_code"] == "fb"
    assert body["offer_proof"]["raw_offer_group"] == "qualify"
    assert body["offer_proof"]["bia_bet_type"] == "for,qualify,h"


def _sample_event() -> dict:
    return {
        "Pid": 1630000001,
        "SportId": 29,
        "isLive": True,
        "is_live": True,
        "Periods": [
            {
                "Number": 0,
                "Win1x2": {
                    "Win1": {"value": 2.1, "raw": {"line_id": 101}},
                    "WinNone": {"value": 3.4, "raw": {"line_id": 101}},
                    "Win2": {"value": 3.2, "raw": {"line_id": 101}},
                    "LineId": 101,
                },
                "Handicap": {
                    "-0.5": {
                        "Win1": {"value": 1.9, "raw": {"line_id": 201}},
                        "LineId": 201,
                    },
                    "0.5": {
                        "Win2": {"value": 1.95, "raw": {"line_id": 201}},
                        "LineId": 201,
                    },
                },
                "Totals": {
                    "2.5": {
                        "WinMore": {"value": 1.85, "raw": {"line_id": 301}},
                        "WinLess": {"value": 2.0, "raw": {"line_id": 301}},
                        "LineId": 301,
                    }
                },
            }
        ],
    }


def _sample_prematch_event() -> dict:
    event = _sample_event()
    event["Pid"] = 1630000002
    event["isLive"] = False
    event["is_live"] = False
    return event


def test_event_to_stream_rows_matches_robinarb_hub_shape() -> None:
    rows = event_to_stream_rows(_sample_event())

    assert [row[2] for row in rows if row[1] == 1] == [0, 1, 2]
    home_ml = next(row for row in rows if row[1] == 1 and row[2] == 0)
    away_ml = next(row for row in rows if row[1] == 1 and row[2] == 2)
    total_over = next(row for row in rows if row[1] == 3 and row[2] == 3)

    assert home_ml[5] == 2.1
    assert away_ml[5] == 3.2
    assert total_over[3] == 2.5
    assert total_over[6] == 301
    assert all(len(row) >= 13 and row[-1] == 1630000001 for row in rows)


def test_event_to_stream_rows_uses_raw_fallback_for_hockey() -> None:
    event = {
        "Pid": 1630000019,
        "SportId": 19,
        "raw": [
            1630000019,
            "Home HC",
            "Away HC",
            0,
            0,
            1630000019,
            0,
            0,
            {
                "0": [
                    [[-0.5, 0.5, "-0.5", 1.9, 1.95, 0, 0, 2000001]],
                    [[2.5, 1.85, 2.0, 3000001]],
                    [1.7, 2.2, 0, 4000001],
                    [[1.5, 1.8, 2.05, 5000001]],
                    [[1.5, 1.9, 1.9, 5000002]],
                    2,
                ]
            },
        ],
    }

    rows = event_to_stream_rows(event)

    assert rows
    assert {row[1] for row in rows} >= {1, 2, 3}
    assert any(row[1] == 1 and row[2] == 0 and row[5] == 2.2 for row in rows)
    assert any(row[1] == 1 and row[2] == 1 and row[5] == 1.7 for row in rows)
    assert all(row[-1] == 1630000019 for row in rows)


def test_state_snapshot_returns_old_hub_envelope() -> None:
    state = Pin888HubCompatState()
    state.ingest_event(_sample_event())

    snapshot = state.snapshot("soccer")
    data = json.loads(snapshot["data"])

    assert snapshot["t"] == "snapshot"
    assert snapshot["slug"] == "soccer"
    assert snapshot["sport"] == 29
    assert data["type"] == "FULL_ODDS"
    assert len(data["odds"]["l"]) >= 6


def test_state_snapshot_preserves_live_and_prematch_scope() -> None:
    state = Pin888HubCompatState()
    state.ingest_event(_sample_event())
    state.ingest_event(_sample_prematch_event())

    snapshot = state.snapshot("soccer")
    data = json.loads(snapshot["data"])
    health = state.health()["sports"]["soccer"]

    assert snapshot["scope"] == "mixed"
    assert data["type"] == "FULL_ODDS"
    assert data["odds"]["l"]
    assert data["odds"]["n"]
    assert {row[-1] for row in data["odds"]["l"]} == {1630000001}
    assert {row[-1] for row in data["odds"]["n"]} == {1630000002}
    assert health["live_events"] == 1
    assert health["prematch_events"] == 1


def test_state_replaces_previous_board_when_root_line_ids_change() -> None:
    state = Pin888HubCompatState()
    previous = _sample_event()
    state.ingest_event(previous)

    current = copy.deepcopy(previous)
    current["Periods"][0]["Win1x2"]["LineId"] = 102
    current["Periods"][0]["Win1x2"]["Win1"] = {
        "value": 1.72,
        "raw": {"line_id": 102},
    }
    current["Periods"][0]["Win1x2"]["WinNone"] = {
        "value": 3.8,
        "raw": {"line_id": 102},
    }
    current["Periods"][0]["Win1x2"]["Win2"] = {
        "value": 4.9,
        "raw": {"line_id": 102},
    }
    state.ingest_event(current)

    snapshot = state.snapshot("soccer")
    rows = json.loads(snapshot["data"])["odds"]["l"]
    moneyline_rows = [row for row in rows if row[1] == 1]

    assert len(moneyline_rows) == 3
    assert {row[6] for row in moneyline_rows} == {102}
    assert {row[5] for row in moneyline_rows} == {1.72, 3.8, 4.9}


def test_state_coalesces_duplicate_period_versions_inside_one_event() -> None:
    state = Pin888HubCompatState()
    event = _sample_event()
    current_period = copy.deepcopy(event["Periods"][0])
    current_period["Win1x2"]["LineId"] = 102
    current_period["Win1x2"]["Win1"] = {
        "value": 1.72,
        "raw": {"line_id": 102},
    }
    current_period["Win1x2"]["WinNone"] = {
        "value": 3.8,
        "raw": {"line_id": 102},
    }
    current_period["Win1x2"]["Win2"] = {
        "value": 4.9,
        "raw": {"line_id": 102},
    }
    event["Periods"].append(current_period)

    state.ingest_event(event)

    snapshot = state.snapshot("soccer")
    rows = json.loads(snapshot["data"])["odds"]["l"]
    moneyline_rows = [row for row in rows if row[1] == 1]

    assert len(moneyline_rows) == 3
    assert {row[6] for row in moneyline_rows} == {102}
    assert {row[5] for row in moneyline_rows} == {1.72, 3.8, 4.9}


def test_state_more_bet_cache_and_pending_target() -> None:
    state = Pin888HubCompatState(cache_ttl_sec=10)

    assert state.next_morebet_target() is None
    assert state.queue_morebet_target(1630000001) is True
    assert state.next_morebet_target() == 1630000001

    frame = {
        "type": "MORE_BET",
        "_requested_event_id": 1630000001,
        "odds": {"e": [29, "Soccer", None, [1630000001, "Home", "Away", 0, 0, 0, 0, 0, {}]]},
    }
    state.ingest_raw_frame(frame)
    result = state.request_more_bet(1630000001, timeout=0.01)

    assert result["ok"] is True
    assert result["event_id"] == "1630000001"
    assert result["data"]["type"] == "MORE_BET"
    assert "_requested_event_id" not in result["data"]


def test_hub_health_fails_closed_when_cached_source_is_stale(monkeypatch) -> None:
    state = Pin888HubCompatState(health_max_source_age_sec=30)
    empty = state.health()
    assert empty["ok"] is False
    assert empty["health_reason"] == "source_inventory_empty"
    monkeypatch.setattr("aggregator.pin888_hub_compat.time.time", lambda: 100.0)
    state.ingest_event(_sample_prematch_event())

    monkeypatch.setattr("aggregator.pin888_hub_compat.time.time", lambda: 120.0)
    fresh = state.health()
    assert fresh["ok"] is True
    assert fresh["source_fresh"] is True
    assert fresh["health_reason"] == "fresh"
    assert fresh["source_age_sec"] == 20.0

    monkeypatch.setattr("aggregator.pin888_hub_compat.time.time", lambda: 131.0)
    stale = state.health()
    assert stale["ok"] is False
    assert stale["source_fresh"] is False
    assert stale["health_reason"] == "stale_sports"
    assert stale["source_age_sec"] == 31.0
    assert stale["stale_sports"] == ["soccer"]

    hockey = copy.deepcopy(_sample_event())
    hockey["Pid"] = 1630000019
    hockey["SportId"] = 19
    state.ingest_event(hockey)
    partial = state.health()
    assert partial["any_source_fresh"] is True
    assert partial["source_fresh"] is False
    assert partial["ok"] is False
    assert partial["stale_sports"] == ["soccer"]


def test_high_priority_more_bet_overtakes_background_queue() -> None:
    state = Pin888HubCompatState(cache_ttl_sec=10)

    assert state.queue_morebet_target(1630000001) is True
    assert state.queue_morebet_target(1630000002) is True
    assert state.queue_morebet_target(1630000003, priority=True) is True

    assert state.next_morebet_target() == 1630000003
    assert state.next_morebet_target() == 1630000001


def test_existing_more_bet_target_can_be_promoted() -> None:
    state = Pin888HubCompatState(cache_ttl_sec=10)

    assert state.queue_morebet_target(1630000001) is True
    assert state.queue_morebet_target(1630000002) is True
    assert state.queue_morebet_target(1630000002, priority=True) is True

    assert state.next_morebet_target() == 1630000002


def test_unanswered_more_bet_target_does_not_starve_next_target() -> None:
    state = Pin888HubCompatState(cache_ttl_sec=10)

    assert state.queue_morebet_target(1630000001, priority=True) is True
    assert state.queue_morebet_target(1630000002, priority=True) is True

    assert state.next_morebet_target() == 1630000001
    assert state.next_morebet_target() == 1630000002


def test_expired_unanswered_more_bet_target_is_dropped() -> None:
    state = Pin888HubCompatState(
        cache_ttl_sec=10,
        pending_more_bet_ttl_sec=1,
    )
    assert state.queue_morebet_target(1630000001) is True
    state._pending_more_bets["1630000001"].requested_at -= 2

    assert state.next_morebet_target() is None
    assert state.health()["pending_more_bets"] == 0
