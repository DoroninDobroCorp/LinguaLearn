"""Round-trip equivalence tests for `aggregator.compat_shim`.

The shim must produce byte-level-identical output to the legacy
`core.broadcaster._build_update_payload` path for any event-dict that
flows through the aggregator. This keeps the Phase 1 invariant
(`Mac :9012 → serverforvovka → admin.ibet.team` unchanged).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import orjson
import pytest

from aggregator.compat_shim import (
    _with_pin888_event_aliases,
    to_pin888_init,
    to_pin888_tombstone_update,
    to_pin888_update,
)
from aggregator.decision import DecisionEngine
from aggregator.ingest import IngestRouter
from aggregator.sources.pin888_source import Pin888SourceAdapter
from aggregator.store import ProvenanceStore
from aggregator.types import PublishedQuote

FIXTURES = Path(__file__).parent / "fixtures" / "baseline_compat"


def _load(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / name).read_text())


# ── direct shim equivalence ───────────────────────────────────────────


def _legacy_build_update_payload(out_game: dict, *, stale: bool = False, reason: str | None = None) -> dict:
    """Reference output for shim equivalence tests — includes alias backfill matching compat_shim."""
    data = _with_pin888_event_aliases(out_game)
    payload = {"type": "update", "source": "ps3838", "data": data, "stale": stale}
    if stale:
        payload["reason"] = reason
    return payload


def test_to_pin888_update_matches_broadcaster_payload():
    fixture = _load("update.json")
    quote = PublishedQuote(
        event_id="pin888:5550002",
        payload=fixture["data"],
        source_used_for_publish="pin888:acct-A:browser_ws",
    )
    shim_envelope = to_pin888_update(quote, stale=False)
    direct = _legacy_build_update_payload(fixture["data"], stale=False)
    assert shim_envelope == direct


def test_to_pin888_update_stale_with_reason():
    fixture = _load("update.json")
    quote = PublishedQuote(
        event_id="pin888:5550002",
        payload=fixture["data"],
        source_used_for_publish="pin888:acct-A:browser_ws",
    )
    shim = to_pin888_update(quote, stale=True, stale_reason="upstream silent 30s")
    direct = _legacy_build_update_payload(fixture["data"], stale=True, reason="upstream silent 30s")
    assert shim == direct
    assert shim["reason"] == "upstream silent 30s"


def test_to_pin888_update_byte_equal_via_orjson():
    fixture = _load("update.json")
    quote = PublishedQuote(
        event_id="pin888:5550002",
        payload=fixture["data"],
        source_used_for_publish="pin888:acct-A:browser_ws",
    )
    shim_bytes = orjson.dumps(to_pin888_update(quote))
    direct_bytes = orjson.dumps(_legacy_build_update_payload(fixture["data"]))
    assert shim_bytes == direct_bytes


def test_to_pin888_init_matches_baseline_shape():
    fixture = _load("init.json")
    quotes = [
        PublishedQuote(
            event_id=f"pin888:{ev['Pid']}",
            payload=ev,
            source_used_for_publish="pin888:acct-A:browser_ws",
        )
        for ev in fixture["events"]
    ]
    shim = to_pin888_init(quotes, stale=False)
    assert shim["type"] == "init"
    assert shim["count"] == fixture["count"]
    assert shim["events"] == [_with_pin888_event_aliases(ev) for ev in fixture["events"]]
    assert shim["stale"] is False


def test_to_legacy_tombstone_matches_fixture():
    fixture = _load("tombstone.json")
    data = fixture["data"]
    shim = to_pin888_tombstone_update(
        data["Pid"],
        home_name=data["homeName"],
        away_name=data["awayName"],
        is_live=data["isLive"],
    )
    assert shim == fixture


# ── full round-trip through router + adapter + shim ──────────────────


def test_round_trip_pin888_update_through_aggregator_is_byte_equal():
    """End-to-end: legacy envelope → adapter → router → published →
    compat_shim → orjson bytes. Must equal the direct broadcaster
    output."""
    fixture = _load("update.json")

    store = ProvenanceStore()
    decision = DecisionEngine()
    router = IngestRouter(store, decision)
    adapter = Pin888SourceAdapter(router)

    captured: list[PublishedQuote] = []
    router.register_consumer(captured.append)

    adapter.emit_legacy_update(fixture)

    assert len(captured) == 1
    pq = captured[0]
    assert pq.event_id == "pin888:5550002"
    # Provenance ownership (Option A): consumer receives an independent
    # deep-copied payload, equal-but-not-identical to the input.
    assert pq.payload == fixture["data"]
    assert pq.payload is not fixture["data"]

    shim_bytes = orjson.dumps(to_pin888_update(pq, stale=False))
    direct_bytes = orjson.dumps(_legacy_build_update_payload(fixture["data"], stale=False))
    assert shim_bytes == direct_bytes


def test_round_trip_tombstone_pass_through():
    """Tombstone runtime path: legacy tombstone envelope → adapter →
    router → consumer → ``to_pin888_update`` must reproduce the
    ``handlers/fo_handler.py`` line ~1214 envelope byte-for-byte (no
    ``stale`` key)."""
    fixture = _load("tombstone.json")
    store = ProvenanceStore()
    router = IngestRouter(store, DecisionEngine())
    adapter = Pin888SourceAdapter(router)

    pq_holder: list[PublishedQuote] = []
    router.register_consumer(pq_holder.append)

    adapter.emit_legacy_update(fixture)
    assert pq_holder, "no PublishedQuote emitted"
    pq = pq_holder[0]
    assert pq.is_tombstone is True

    shim = to_pin888_update(pq)
    assert shim == fixture
    # Byte-equal under the same serializer broadcaster uses.
    assert orjson.dumps(shim) == orjson.dumps(fixture)
    # Critical: tombstone envelope MUST NOT carry "stale" / "reason"
    # (legacy producer at handlers/fo_handler.py line ~1214 omits them).
    assert "stale" not in shim
    assert "reason" not in shim
    # Even if the caller passes stale=True, tombstone path ignores it.
    forced = to_pin888_update(pq, stale=True, stale_reason="forced")
    assert "stale" not in forced
    assert "reason" not in forced


def test_to_pin888_init_replay_matches_baseline_shape():
    """init_replay light header: must match
    ``core.broadcaster._send_snapshot_with_replay`` byte-for-byte."""
    from aggregator.compat_shim import to_pin888_init_replay

    fixture = _load("init_replay.json")
    shim = to_pin888_init_replay(replay_total=fixture["replay_total"], stale=False)
    assert shim == fixture
    assert orjson.dumps(shim) == orjson.dumps(fixture)


def test_to_pin888_init_replay_stale_with_reason():
    from aggregator.compat_shim import to_pin888_init_replay

    shim = to_pin888_init_replay(replay_total=42, stale=True, stale_reason="upstream silent 30s")
    assert shim == {
        "type": "init",
        "events": [],
        "count": 0,
        "stale": True,
        "reason": "upstream silent 30s",
        "snapshot_mode": "update_replay",
        "replay_total": 42,
    }
    # Insertion order must match legacy producer (broadcaster.py:412 +
    # 144-148): type, events, count, stale, [reason], snapshot_mode,
    # replay_total — both json and orjson serialize in this order.
    assert list(shim.keys()) == [
        "type", "events", "count", "stale", "reason",
        "snapshot_mode", "replay_total",
    ]


@pytest.mark.parametrize("stale,reason", [(False, None), (True, "src disconnected")])
def test_to_pin888_update_envelope_keys(stale, reason):
    quote = PublishedQuote(
        event_id="x",
        payload={"Pid": 1},
        source_used_for_publish="src",
    )
    env = to_pin888_update(quote, stale=stale, stale_reason=reason)
    expected = {"type", "source", "data", "stale"}
    if stale and reason:
        expected.add("reason")
    assert set(env.keys()) == expected


# ── regression: stale=True with falsy reason must still insert key ────
# Legacy producers in core/broadcaster.py (lines 189-192, 339-340,
# 412-415) unconditionally insert payload["reason"] = state.stale_reason
# whenever stale is True — even if the value is None or "". The shim
# previously gated on truthiness and dropped the key, breaking byte
# equality. These tests pin the corrected behavior.


@pytest.mark.parametrize("reason", [None, "", "upstream silent 30s"])
def test_to_pin888_update_stale_true_falsy_reason_byte_equal(reason):
    # Inline copy of core/broadcaster.py lines 189-192 (_build_update_payload).
    out_game = {"Pid": 5550002, "homeName": "A", "awayName": "B"}
    legacy = {"type": "update", "source": "ps3838", "data": _with_pin888_event_aliases(out_game), "stale": True}
    if True:  # mirror `if state.stale:`
        legacy["reason"] = reason

    quote = PublishedQuote(
        event_id="pin888:5550002",
        payload=out_game,
        source_used_for_publish="pin888:acct-A:browser_ws",
    )
    shim = to_pin888_update(quote, stale=True, stale_reason=reason)
    assert orjson.dumps(shim) == orjson.dumps(legacy)
    assert "reason" in shim
    assert shim["reason"] == reason


@pytest.mark.parametrize("reason", [None, "", "src disconnected"])
def test_to_pin888_init_stale_true_falsy_reason_byte_equal(reason):
    # Inline copy of core/broadcaster.py lines 412-414 (init payload).
    mapped_state: list[dict] = []
    legacy = {"type": "init", "events": mapped_state, "count": len(mapped_state), "stale": True}
    if True:  # mirror `if state.stale:`
        legacy["reason"] = reason

    shim = to_pin888_init([], stale=True, stale_reason=reason)
    assert orjson.dumps(shim) == orjson.dumps(legacy)
    assert "reason" in shim
    assert shim["reason"] == reason


@pytest.mark.parametrize("reason", [None, "", "src disconnected"])
def test_to_pin888_init_replay_stale_true_falsy_reason_byte_equal(reason):
    # Inline copy of core/broadcaster.py lines 412-414 + the
    # _send_snapshot_with_replay tail that assigns snapshot_mode and
    # replay_total in-place onto the same dict (preserving key order).
    from aggregator.compat_shim import to_pin888_init_replay

    mapped_state: list[dict] = []
    legacy = {"type": "init", "events": mapped_state, "count": len(mapped_state), "stale": True}
    if True:  # mirror `if state.stale:`
        legacy["reason"] = reason
    legacy["snapshot_mode"] = "update_replay"
    legacy["replay_total"] = 7

    shim = to_pin888_init_replay(replay_total=7, stale=True, stale_reason=reason)
    assert orjson.dumps(shim) == orjson.dumps(legacy)
    assert "reason" in shim
    assert shim["reason"] == reason
