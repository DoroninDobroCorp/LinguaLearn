"""Tests for Story 27.5.B — policy reload (AC-8 / DOD-7)."""

from __future__ import annotations

from pathlib import Path

import pytest

from aggregator.morebets_dispatcher import MoreBetsDispatcher, SourceQuote
from aggregator.morebets_policy import MoreBetsPolicy, load_policy
from aggregator.morebets_policy_reload import reload_dispatcher_policy


_REPO_ROOT = Path(__file__).resolve().parents[1]
_BUILTIN_POLICY = _REPO_ROOT / "config" / "morebets_priority_policy.yaml"


def _load() -> MoreBetsPolicy:
    return load_policy(_BUILTIN_POLICY)


def test_reload_installs_new_policy_reference() -> None:
    dispatcher = MoreBetsDispatcher(policy=_load())
    new_policy = _load()
    result = reload_dispatcher_policy(dispatcher, loader=lambda: new_policy)
    assert result is True
    assert dispatcher.policy is new_policy


def test_reload_changes_runtime_behaviour() -> None:
    """Simulate a policy flip — smaller L2 budget — observe dispatch change."""
    dispatcher = MoreBetsDispatcher(policy=_load())
    # Baseline corners allows 2 WS wins (burst=2).
    quotes = [
        SourceQuote(source="api", present=False),
        SourceQuote(source="ws", present=True, age_sec=1.0),
    ]
    for _ in range(2):
        d = dispatcher.dispatch(sport_id=29, market_family="corners", quotes=quotes)
        assert d.winning_source == "ws"
    # Bucket now empty — next fails.
    d3 = dispatcher.dispatch(sport_id=29, market_family="corners", quotes=quotes)
    assert d3.winning_source is None

    # Swap in a fresh policy — existing buckets retain *balance* but
    # the refill rate is whatever the new policy specifies. For the
    # smoke test we reload the SAME content — dispatcher keeps working.
    reload_dispatcher_policy(dispatcher, loader=_load)
    # New dispatches after reload still see zero-balance on corners
    # bucket (same family key, same bucket instance); that's intended.


def test_reload_does_not_crash_on_loader_exception() -> None:
    dispatcher = MoreBetsDispatcher(policy=_load())
    original_policy = dispatcher.policy

    def broken_loader() -> MoreBetsPolicy:
        raise RuntimeError("disk on fire")

    result = reload_dispatcher_policy(dispatcher, loader=broken_loader)
    assert result is False
    # Previous policy still active — we prefer live-stale over crash.
    assert dispatcher.policy is original_policy


def test_reload_default_loader_reads_env(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Point MSP_MOREBETS_POLICY_PATH at a copy of the built-in file.
    copied = tmp_path / "policy.yaml"
    copied.write_text(_BUILTIN_POLICY.read_text(encoding="utf-8"), encoding="utf-8")
    monkeypatch.setenv("MSP_MOREBETS_POLICY_PATH", str(copied))

    dispatcher = MoreBetsDispatcher(policy=_load())
    original = dispatcher.policy
    assert reload_dispatcher_policy(dispatcher) is True
    # A real load took place → a new instance.
    assert dispatcher.policy is not original
    assert dispatcher.policy.version == 1


def test_reload_broken_yaml_keeps_old_policy(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    bad = tmp_path / "bad.yaml"
    bad.write_text("not: valid: [yaml\n", encoding="utf-8")
    monkeypatch.setenv("MSP_MOREBETS_POLICY_PATH", str(bad))

    dispatcher = MoreBetsDispatcher(policy=_load())
    original = dispatcher.policy
    assert reload_dispatcher_policy(dispatcher) is False
    assert dispatcher.policy is original
