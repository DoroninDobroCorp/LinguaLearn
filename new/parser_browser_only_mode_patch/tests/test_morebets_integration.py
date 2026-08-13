"""Integration tests for Story 27.5 — MoreBets dispatch cycle (DOD-17, DOD-18).

DOD-17: "Integration test: full MoreBets fetch cycle для corners family".
DOD-18: "Integration test: policy reload через SIGHUP без рестарта" —
the OS signal itself is wired in production (`install_sighup_handler`);
here we exercise the reload primitive it invokes, end-to-end.
"""

from __future__ import annotations

import signal as _signal
from pathlib import Path
from unittest.mock import patch

import pytest

from aggregator.event_priority_queue import EventPriority, EventPriorityQueue
from aggregator.morebets_dispatcher import (
    DispatchDecision,
    MoreBetsDispatcher,
    SourceQuote,
)
from aggregator.morebets_policy import load_policy
from aggregator.morebets_policy_reload import (
    install_sighup_handler,
    reload_dispatcher_policy,
)


_REPO_ROOT = Path(__file__).resolve().parents[1]
_POLICY_PATH = _REPO_ROOT / "config" / "morebets_priority_policy.yaml"


# ---------------------------------------------------------------------------
# DOD-17: full fetch cycle for corners family
# ---------------------------------------------------------------------------


def test_full_corners_cycle_api_fresh_resolves_immediately() -> None:
    """End-to-end: queue → dispatch → published-quote reason_detail."""
    queue = EventPriorityQueue()
    dispatcher = MoreBetsDispatcher(policy=load_policy(_POLICY_PATH))
    published: list[tuple[str, str, DispatchDecision]] = []

    # Simulate two events with different priority.
    queue.push("match:1", EventPriority.PROMOTED)
    queue.push("match:2", EventPriority.FAIR)

    # Snapshot of per-source freshness for each event.
    quotes_by_event = {
        "match:1": [
            SourceQuote(source="api", present=True, age_sec=0.5),
            SourceQuote(source="ws", present=True, age_sec=0.2),
            SourceQuote(source="bia", present=True, match_confidence=0.95),
        ],
        "match:2": [
            SourceQuote(source="api", present=False),
            SourceQuote(source="ws", present=True, age_sec=1.0),
            SourceQuote(source="bia", present=True, match_confidence=0.95),
        ],
    }

    # Drain the queue; dispatch per event.
    while True:
        head = queue.pop()
        if head is None:
            break
        event_id, priority = head
        decision = dispatcher.dispatch(
            sport_id=29,
            market_family="corners",
            quotes=quotes_by_event[event_id],
        )
        assert decision.resolved
        published.append((event_id, str(priority.name), decision))

    # PROMOTED event drained first.
    assert [eid for eid, _, _ in published] == ["match:1", "match:2"]
    # match:1 — API fresh → l1_api_fresh.
    assert published[0][2].reason_detail == "l1_api_fresh"
    # match:2 — API absent → l2_ws_fresh.
    assert published[1][2].reason_detail == "l2_ws_fresh"

    # Stats reflect 2 attempts, api+ws wins, 1 fallback (API absent
    # for match:2 counts as fallback).
    stats = dispatcher.stats()
    assert stats["morebets_dispatch_attempts_total"] == 2
    counts = stats["morebets_dispatch_success_by_source_total"]
    assert counts == {"api": 1, "ws": 1}
    assert stats["morebets_dispatch_fallback_total"] == 1


def test_full_corners_cycle_all_stale_exhaust() -> None:
    dispatcher = MoreBetsDispatcher(policy=load_policy(_POLICY_PATH))
    decision = dispatcher.dispatch(
        sport_id=29,
        market_family="corners",
        quotes=[
            SourceQuote(source="api", present=True, age_sec=999.0),
            SourceQuote(source="ws", present=True, age_sec=999.0),
            SourceQuote(source="bia", present=True, match_confidence=0.3),
        ],
    )
    assert decision.winning_source is None
    assert "exhausted" in decision.reason_detail
    assert {src for src, _ in decision.rejected} == {"api", "ws", "bia"}


# ---------------------------------------------------------------------------
# DOD-18: SIGHUP reload without process restart
# ---------------------------------------------------------------------------


def test_install_sighup_handler_registers_handler() -> None:
    """Verify install_sighup_handler actually wires a callable onto SIGHUP.

    We patch ``signal.signal`` so the test doesn't mutate the real
    process's signal table (which would affect the test runner).
    """
    dispatcher = MoreBetsDispatcher(policy=load_policy(_POLICY_PATH))
    with patch("signal.signal") as mock_signal:
        install_sighup_handler(dispatcher)
        mock_signal.assert_called_once()
        args, kwargs = mock_signal.call_args
        assert args[0] == _signal.SIGHUP
        assert callable(args[1])


def test_sighup_handler_triggers_reload_primitive(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The installed handler must call reload_dispatcher_policy with the dispatcher."""
    # Copy shipped policy so reload can find it.
    copied = tmp_path / "policy.yaml"
    copied.write_text(_POLICY_PATH.read_text(encoding="utf-8"), encoding="utf-8")
    monkeypatch.setenv("MSP_MOREBETS_POLICY_PATH", str(copied))

    dispatcher = MoreBetsDispatcher(policy=load_policy(_POLICY_PATH))
    original_policy = dispatcher.policy

    captured_handler = {}

    def capture(sig, fn):
        captured_handler["sig"] = sig
        captured_handler["fn"] = fn

    with patch("signal.signal", side_effect=capture):
        install_sighup_handler(dispatcher)

    # Manually invoke the captured handler — no real signal needed.
    captured_handler["fn"](_signal.SIGHUP, None)
    # Policy object should have been replaced by the handler.
    assert dispatcher.policy is not original_policy


def test_reload_end_to_end_swap_and_dispatch(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Load → dispatch → reload → dispatch still works with new policy."""
    copied = tmp_path / "policy.yaml"
    copied.write_text(_POLICY_PATH.read_text(encoding="utf-8"), encoding="utf-8")
    monkeypatch.setenv("MSP_MOREBETS_POLICY_PATH", str(copied))

    dispatcher = MoreBetsDispatcher(policy=load_policy(copied))

    quotes = [SourceQuote(source="api", present=True, age_sec=0.5)]
    d1 = dispatcher.dispatch(sport_id=29, market_family="corners", quotes=quotes)
    assert d1.winning_source == "api"

    # Reload (identical content, just to exercise the swap path).
    assert reload_dispatcher_policy(dispatcher) is True

    d2 = dispatcher.dispatch(sport_id=29, market_family="corners", quotes=quotes)
    assert d2.winning_source == "api"
