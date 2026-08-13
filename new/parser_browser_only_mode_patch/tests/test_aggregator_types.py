"""Unit tests for `aggregator.types`."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from aggregator.types import (
    Account,
    AccountState,
    CandidateQuote,
    PublishedQuote,
    PublishedQuoteCandidate,
    SourceEvent,
    SourceState,
    SystemState,
)


def test_enums_have_expected_members():
    assert SystemState.NORMAL.value == "normal"
    assert SourceState.HEALTHY.value == "healthy"
    assert AccountState.HEALTHY_DIRECT_WS.value == "healthy_direct_ws"


def test_account_defaults():
    acc = Account(account_id="pin888-acct-a", family="pin888")
    assert acc.host_node == "mac-local"
    assert acc.state == AccountState.OFFLINE
    assert acc.role_tags == []
    assert acc.supported_transports == []


def test_source_event_defaults_have_timestamps():
    ev = SourceEvent(
        source_id="pin888:acct-A:browser_ws",
        family="pinnacle_native",
        transport="browser_ws",
        event_id="pin888:42",
        payload={"Pid": 42},
    )
    assert isinstance(ev.collected_at, datetime)
    assert ev.collected_at.tzinfo is not None
    assert ev.is_tombstone is False
    assert ev.confidence == 1.0


def test_candidate_from_source_event_preserves_fields():
    now = datetime(2026, 4, 19, 15, 30, 0, tzinfo=timezone.utc)
    ev = SourceEvent(
        source_id="pin888:acct-A:browser_ws",
        family="pinnacle_native",
        transport="browser_ws",
        event_id="pin888:42",
        payload={"Pid": 42},
        collected_at=now,
        received_at=now,
        is_tombstone=True,
        confidence=0.5,
    )
    cand = CandidateQuote.from_source_event(ev)
    assert cand.source_id == ev.source_id
    assert cand.family == ev.family
    assert cand.event_id == ev.event_id
    assert cand.payload is ev.payload
    assert cand.is_tombstone is True
    assert cand.confidence == 0.5


def test_candidate_age_ms_monotonic():
    base = datetime(2026, 4, 19, 15, 30, 0, tzinfo=timezone.utc)
    cand = CandidateQuote(
        source_id="s",
        family="pinnacle_native",
        transport="browser_ws",
        event_id="e",
        payload={},
        collected_at=base,
        received_at=base,
    )
    assert cand.age_ms(base) == 0
    assert cand.age_ms(base + timedelta(milliseconds=250)) == 250
    assert cand.age_ms(base + timedelta(seconds=2)) == 2000


def test_published_quote_minimal_construct():
    q = PublishedQuote(
        event_id="pin888:42",
        payload={"Pid": 42},
        source_used_for_publish="pin888:acct-A:browser_ws",
    )
    assert q.publish_authority_class == "pinnacle_native"
    assert q.degraded is False
    assert q.system_state_snapshot == SystemState.NORMAL
    assert q.all_candidate_sources == []


def test_published_quote_candidate_record():
    rec = PublishedQuoteCandidate(source="bia", age_ms=800, rejected_reason="lower_authority", price=1.93)
    assert rec.source == "bia"
    assert rec.age_ms == 800
    assert rec.rejected_reason == "lower_authority"
    assert rec.price == 1.93
