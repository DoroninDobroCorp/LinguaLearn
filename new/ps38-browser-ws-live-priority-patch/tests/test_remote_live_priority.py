from __future__ import annotations

import json
import threading
from typing import Any

import pytest

from aggregator.main import (
    _drain_remote_event_queue,
    _enqueue_remote_event,
    _remote_event_drop_count,
    _reset_remote_event_queue_for_tests,
)
from aggregator.pin888_hub_compat import Pin888HubCompatState
from tools.remote_fleet_node import RemoteBatchPoster


def _payload(pid: int, *, live: bool, sequence: int = 0) -> dict[str, Any]:
    return {
        "Pid": pid,
        "SportId": 29,
        "isLive": live,
        "is_live": live,
        "sequence": sequence,
        "Periods": [
            {
                "Number": 0,
                "Win1x2": {
                    "Win1": {"value": 2.1, "raw": {"line_id": 101}},
                    "WinNone": {"value": 3.4, "raw": {"line_id": 101}},
                    "Win2": {"value": 3.2, "raw": {"line_id": 101}},
                    "LineId": 101,
                },
            }
        ],
    }


def _envelope(pid: int, *, live: bool, sequence: int = 0) -> dict[str, Any]:
    return {
        "source_id": "pin888:fleet:soccer-account:29",
        "family": "pin888",
        "transport": "browser_ws",
        "event_id": f"pin888:{pid}",
        "account_id": "soccer-account",
        "payload": _payload(pid, live=live, sequence=sequence),
    }


@pytest.mark.asyncio
async def test_browser_ws_live_precedes_cold_prematch_burst_and_coalesces() -> None:
    _reset_remote_event_queue_for_tests()
    live_pid = 1_630_999_999

    for offset in range(570):
        _enqueue_remote_event(_envelope(1_630_000_000 + offset, live=False))

    # The same fixture can move from the cold prematch board to live. Its old
    # normal-priority copy must be removed, and repeated live snapshots must
    # remain last-write-wins without losing priority.
    _enqueue_remote_event(_envelope(live_pid, live=False, sequence=0))
    _enqueue_remote_event(_envelope(live_pid, live=True, sequence=1))
    _enqueue_remote_event(_envelope(live_pid, live=True, sequence=2))

    seen: list[dict[str, Any]] = []
    stopped = threading.Event()
    stopped.set()

    await _drain_remote_event_queue(
        lambda item: seen.append(item) or {"ok": True},
        stopped,
        batch_size=1_000,
        idle_sleep_sec=0,
        max_events_per_sec=1_000_000_000,
    )

    assert len(seen) == 571
    assert seen[0]["event_id"] == f"pin888:{live_pid}"
    assert seen[0]["payload"]["sequence"] == 2
    assert all(not item["payload"]["isLive"] for item in seen[1:])
    assert _remote_event_drop_count() == 0


def test_pin888_role_poster_already_emits_browser_ws_envelope() -> None:
    class Client:
        pass

    frame = _payload(1_630_000_001, live=True)
    frame["_account"] = "soccer-account"
    poster = RemoteBatchPoster(Client(), source_family="pin888")  # type: ignore[arg-type]

    envelope = poster._event_payload(frame)

    assert envelope["source_id"] == "pin888:fleet:soccer-account:29"
    assert envelope["family"] == "pin888"
    assert envelope["transport"] == "browser_ws"
    assert envelope["event_id"] == "pin888:1630000001"
    assert envelope["payload"] == frame


def test_ps3838_poster_legacy_raw_shape_is_unchanged() -> None:
    class Client:
        pass

    frame = _payload(1_630_000_002, live=False)
    poster = RemoteBatchPoster(Client(), source_family="ps3838")  # type: ignore[arg-type]

    assert poster._event_payload(frame) == frame


@pytest.mark.asyncio
async def test_live_priority_preserves_hub_compat_payload_contract() -> None:
    _reset_remote_event_queue_for_tests()
    envelope = _envelope(1_630_000_001, live=True, sequence=7)
    state = Pin888HubCompatState()
    seen: list[dict[str, Any]] = []
    stopped = threading.Event()
    stopped.set()

    def ingest(item: dict[str, Any]) -> dict[str, Any]:
        seen.append(item)
        state.ingest_event(item["payload"])
        return {"ok": True}

    _enqueue_remote_event(envelope)
    await _drain_remote_event_queue(
        ingest,
        stopped,
        batch_size=10,
        idle_sleep_sec=0,
        max_events_per_sec=1_000_000_000,
    )

    snapshot = state.snapshot("soccer")
    hub_data = json.loads(snapshot["data"])

    assert seen == [envelope]
    assert snapshot["scope"] == "live"
    assert hub_data["type"] == "FULL_ODDS"
    assert {row[-1] for row in hub_data["odds"]["l"]} == {1_630_000_001}
    assert state.health()["sports"]["soccer"]["live_events"] == 1
