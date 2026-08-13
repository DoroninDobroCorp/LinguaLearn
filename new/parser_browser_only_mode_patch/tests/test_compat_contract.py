"""Regression tests for the legacy `:9012` WS contract.

These are schema-style assertions over canonical fixtures captured in
`tests/fixtures/baseline_compat/`. Any future change that breaks the
shape consumed by `serverforvovka` / `admin.ibet.team` will trip these
tests before it reaches production.

Dynamic fields (timestamps) are not asserted.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

FIXTURES = Path(__file__).parent / "fixtures" / "baseline_compat"


def _load(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / name).read_text())


# ── init ─────────────────────────────────────────────────────────────


def test_init_envelope_shape():
    msg = _load("init.json")
    assert msg["type"] == "init"
    assert isinstance(msg["events"], list)
    assert isinstance(msg["count"], int)
    assert msg["count"] == len(msg["events"])
    assert isinstance(msg["stale"], bool)
    # Optional fields:
    if "snapshot_mode" in msg:
        pytest.fail("init fixture must use the small-snapshot variant; "
                    "see init_replay.json for the large variant")


def test_init_event_dict_shape():
    msg = _load("init.json")
    for event in msg["events"]:
        assert "Pid" in event
        assert "homeName" in event
        assert "awayName" in event
        assert "isLive" in event
        assert "Periods" in event
        assert isinstance(event["Periods"], list)


# ── init replay (large snapshot) ──────────────────────────────────────


def test_init_replay_shape():
    msg = _load("init_replay.json")
    assert msg["type"] == "init"
    assert msg["events"] == []
    assert msg["count"] == 0
    assert msg["snapshot_mode"] == "update_replay"
    assert isinstance(msg["replay_total"], int)
    assert msg["replay_total"] >= 0
    assert isinstance(msg["stale"], bool)


# ── state snapshot ────────────────────────────────────────────────────


def test_state_envelope_shape():
    msg = _load("state.json")
    assert msg["type"] == "state"
    assert msg["scope"] in ("live", "full", "prematch")
    assert isinstance(msg["events"], list)
    assert msg["count"] == len(msg["events"])
    assert isinstance(msg["stale"], bool)


# ── update ────────────────────────────────────────────────────────────


def test_update_envelope_shape():
    msg = _load("update.json")
    assert msg["type"] == "update"
    assert msg["source"] == "ps3838"
    assert isinstance(msg["data"], dict)
    assert "stale" in msg
    assert isinstance(msg["stale"], bool)


def test_update_data_shape():
    msg = _load("update.json")
    data = msg["data"]
    assert "Pid" in data
    assert "Periods" in data
    assert isinstance(data["Periods"], list)


# ── tombstone ─────────────────────────────────────────────────────────


def test_tombstone_envelope_shape():
    msg = _load("tombstone.json")
    assert msg["type"] == "update"
    assert msg["source"] == "ps3838"
    data = msg["data"]
    assert isinstance(data, dict)
    assert data.get("Removed") is True
    assert "Pid" in data
    assert "homeName" in data
    assert "awayName" in data
    assert "isLive" in data


# ── conformance helpers exposed for other tests ───────────────────────


REQUIRED_INIT_KEYS = {"type", "events", "count", "stale"}
REQUIRED_UPDATE_KEYS = {"type", "source", "data", "stale"}
REQUIRED_STATE_KEYS = {"type", "scope", "events", "count", "stale"}


def assert_conforms_to_pin888_update(envelope: dict[str, Any]) -> None:
    """Schema check used by other tests / runtime asserts."""
    assert envelope.get("type") == "update"
    assert envelope.get("source") == "ps3838"
    assert isinstance(envelope.get("data"), dict)
    # `stale` is present on broadcaster-built updates but tombstone
    # updates emitted by `handlers/fo_handler.py` omit it. Both shapes
    # are accepted by downstream consumers.
    if "stale" in envelope:
        assert isinstance(envelope["stale"], bool)


def test_assert_conforms_helper_passes_for_fixtures():
    assert_conforms_to_pin888_update(_load("update.json"))
    assert_conforms_to_pin888_update(_load("tombstone.json"))


def test_required_key_sets_are_subsets():
    init_msg = _load("init.json")
    update_msg = _load("update.json")
    state_msg = _load("state.json")
    assert REQUIRED_INIT_KEYS.issubset(init_msg.keys())
    assert REQUIRED_UPDATE_KEYS.issubset(update_msg.keys())
    assert REQUIRED_STATE_KEYS.issubset(state_msg.keys())
