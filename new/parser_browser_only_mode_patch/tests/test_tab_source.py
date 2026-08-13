"""Phase 6: tab source adapter tests."""

from __future__ import annotations

from datetime import datetime, timezone

from aggregator.sources.tab_source import (
    TabSnapshot,
    TabSource,
    TabSourceEvent,
    failover_enabled,
)


def _utc(y=2026, mo=5, d=1, h=12, m=0, s=0):
    return datetime(y, mo, d, h, m, s, tzinfo=timezone.utc)


# ── flag tests ────────────────────────────────────────────────────


def test_tab_source_flag_off_by_default(monkeypatch):
    monkeypatch.delenv("MSP_FAILOVER_ENABLED", raising=False)
    assert failover_enabled() is False


def test_tab_source_flag_on(monkeypatch):
    monkeypatch.setenv("MSP_FAILOVER_ENABLED", "1")
    assert failover_enabled() is True


# ── snapshot processing ───────────────────────────────────────────


def test_tab_source_produces_events_when_enabled(monkeypatch):
    monkeypatch.setenv("MSP_FAILOVER_ENABLED", "1")
    ts = TabSource(family="pin888")
    snap = TabSnapshot(
        account_id="acct-tab-1",
        family="pin888",
        events=[
            {"event_id": "ev1", "sport": "soccer", "price": 1.85},
            {"event_id": "ev2", "sport": "tennis", "price": 2.10},
        ],
        captured_at=_utc(),
    )
    results = ts.process_snapshot(snap)
    assert len(results) == 2
    assert all(isinstance(r, TabSourceEvent) for r in results)
    assert results[0].source_id == "pin888:acct-tab-1:tab"
    assert results[0].transport_mode == "tab"
    assert results[0].event_id == "ev1"
    assert results[0].metadata["tab_penalty"] is True


def test_tab_source_returns_empty_when_disabled(monkeypatch):
    monkeypatch.delenv("MSP_FAILOVER_ENABLED", raising=False)
    ts = TabSource(family="pin888")
    snap = TabSnapshot(
        account_id="acct-1",
        family="pin888",
        events=[{"event_id": "x"}],
        captured_at=_utc(),
    )
    assert ts.process_snapshot(snap) == []


def test_tab_source_generates_event_id_when_missing(monkeypatch):
    monkeypatch.setenv("MSP_FAILOVER_ENABLED", "1")
    ts = TabSource(family="ps3838")
    snap = TabSnapshot(
        account_id="acct-2",
        family="ps3838",
        events=[{"sport": "soccer"}],  # no event_id
        captured_at=_utc(),
    )
    results = ts.process_snapshot(snap)
    assert len(results) == 1
    assert results[0].event_id.startswith("tab_")


def test_tab_source_payload_is_copied(monkeypatch):
    monkeypatch.setenv("MSP_FAILOVER_ENABLED", "1")
    ts = TabSource(family="pin888")
    raw = {"event_id": "ev1", "price": 1.5}
    snap = TabSnapshot(account_id="a", family="pin888", events=[raw], captured_at=_utc())
    results = ts.process_snapshot(snap)
    # Mutation of original doesn't affect the event.
    raw["price"] = 999
    assert results[0].payload["price"] == 1.5
