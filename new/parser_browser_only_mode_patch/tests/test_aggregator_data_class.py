"""Unit tests for ``aggregator.data_class.classify`` (TZ §4)."""

from __future__ import annotations

from datetime import datetime, timezone

from aggregator.data_class import DataClass, classify, classify_payload
from aggregator.types import SourceEvent


def _ev(payload: dict, *, is_tombstone: bool = False) -> SourceEvent:
    now = datetime.now(timezone.utc)
    return SourceEvent(
        source_id="pin888:acct-A:browser_ws",
        family="pinnacle_native",
        transport="browser_ws",
        event_id="x",
        payload=payload,
        collected_at=now,
        received_at=now,
        is_tombstone=is_tombstone,
    )


def test_tombstone_event_classifies_lifecycle():
    assert classify(_ev({"Pid": 1}, is_tombstone=True)) is DataClass.LIFECYCLE


def test_payload_removed_flag_classifies_lifecycle():
    assert classify_payload({"Pid": 1, "Removed": True}) is DataClass.LIFECYCLE
    assert classify_payload({"Pid": 1, "tombstone": True}) is DataClass.LIFECYCLE


def test_status_suspended_classifies_lifecycle():
    assert classify_payload({"Pid": 1, "status": "suspended"}) is DataClass.LIFECYCLE
    assert classify_payload({"Pid": 1, "Status": "Closed"}) is DataClass.LIFECYCLE


def test_explicit_market_class_base():
    assert classify_payload({"market_class": "base"}) is DataClass.BASE_MARKET
    assert classify_payload({"data_class": "main"}) is DataClass.BASE_MARKET


def test_explicit_market_class_specials():
    assert classify_payload({"market_class": "specials"}) is DataClass.MORE_BETS_SPECIAL
    assert classify_payload({"market_class": "more_bets"}) is DataClass.MORE_BETS_SPECIAL


def test_market_type_token_base():
    assert classify_payload({"market_type": "moneyline"}) is DataClass.BASE_MARKET
    assert classify_payload({"Type": "Asian Handicap"}) is DataClass.BASE_MARKET
    assert classify_payload({"market_type": "totals"}) is DataClass.BASE_MARKET


def test_market_type_token_specials():
    assert classify_payload({"market_type": "outright"}) is DataClass.MORE_BETS_SPECIAL
    assert classify_payload({"Type": "Anytime"}) is DataClass.MORE_BETS_SPECIAL


def test_payload_with_odds_fields_is_base_market():
    assert classify_payload({"Pid": 1, "Periods": [{}]}) is DataClass.BASE_MARKET
    assert classify_payload({"price": 1.92}) is DataClass.BASE_MARKET


def test_unknown_payload_falls_back_to_base_event():
    assert classify_payload({"Pid": 1, "homeName": "A", "awayName": "B"}) is DataClass.BASE_EVENT


def test_classifier_does_not_crash_on_garbage():
    assert classify_payload(None) is DataClass.BASE_EVENT
    assert classify_payload({}) is DataClass.BASE_EVENT
    # weirdly typed values must not raise
    assert classify_payload({"market_type": object()}) is DataClass.BASE_EVENT
    assert classify_payload({"status": 42}) is DataClass.BASE_EVENT
