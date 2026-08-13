"""Tests for Story 27.16 — Arcadia L3 integration in MoreBetsDispatcher."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

from aggregator.morebets_dispatcher import (
    MoreBetsDispatcher,
    SourceQuote,
)
from aggregator.morebets_policy import load_policy
from aggregator.sources.arcadia_morebets_helper import ArcadiaMoreBetsHelper

_POLICY_PATH = Path(__file__).resolve().parents[1] / "config" / "morebets_priority_policy.yaml"


def _make_policy() -> object:
    return load_policy(_POLICY_PATH)


def _empty_quotes() -> list[SourceQuote]:
    return [
        SourceQuote(source="api", present=False),
        SourceQuote(source="ws", present=False),
        SourceQuote(source="bia", present=False),
    ]


def test_arcadia_fallback_when_all_sources_exhausted(monkeypatch):
    monkeypatch.setenv("MSP_ARCADIA_L3_HELPER_ENABLED", "1")
    arcadia = MagicMock(spec=ArcadiaMoreBetsHelper)
    arcadia.fetch_morebet.return_value = {"pid": 42, "source": "arcadia_l3"}

    dispatcher = MoreBetsDispatcher(policy=_make_policy(), arcadia_helper=arcadia)
    decision = dispatcher.dispatch(
        sport_id=29,
        market_family="default",
        quotes=_empty_quotes(),
        pid=42,
    )

    assert decision.resolved is True
    assert decision.winning_source == "arcadia_l3"
    assert decision.reason_detail == "morebet_arcadia_helper"
    arcadia.fetch_morebet.assert_called_once_with(42)


def test_arcadia_fallback_skipped_when_flag_off(monkeypatch):
    monkeypatch.setenv("MSP_ARCADIA_L3_HELPER_ENABLED", "0")
    arcadia = MagicMock(spec=ArcadiaMoreBetsHelper)
    arcadia.fetch_morebet.return_value = {"pid": 42, "source": "arcadia_l3"}

    dispatcher = MoreBetsDispatcher(policy=_make_policy(), arcadia_helper=arcadia)
    decision = dispatcher.dispatch(
        sport_id=29,
        market_family="default",
        quotes=_empty_quotes(),
        pid=42,
    )

    assert decision.resolved is False
    arcadia.fetch_morebet.assert_not_called()


def test_arcadia_fallback_skipped_when_helper_none():
    dispatcher = MoreBetsDispatcher(policy=_make_policy(), arcadia_helper=None)
    decision = dispatcher.dispatch(
        sport_id=29,
        market_family="default",
        quotes=_empty_quotes(),
        pid=42,
    )
    assert decision.resolved is False


def test_arcadia_fallback_skipped_when_pid_none(monkeypatch):
    monkeypatch.setenv("MSP_ARCADIA_L3_HELPER_ENABLED", "1")
    arcadia = MagicMock(spec=ArcadiaMoreBetsHelper)
    arcadia.fetch_morebet.return_value = {"pid": 1}

    dispatcher = MoreBetsDispatcher(policy=_make_policy(), arcadia_helper=arcadia)
    decision = dispatcher.dispatch(
        sport_id=29,
        market_family="default",
        quotes=_empty_quotes(),
        # pid not provided
    )
    assert decision.resolved is False
    arcadia.fetch_morebet.assert_not_called()


def test_arcadia_fallback_none_from_helper_keeps_exhausted(monkeypatch):
    monkeypatch.setenv("MSP_ARCADIA_L3_HELPER_ENABLED", "1")
    arcadia = MagicMock(spec=ArcadiaMoreBetsHelper)
    arcadia.fetch_morebet.return_value = None

    dispatcher = MoreBetsDispatcher(policy=_make_policy(), arcadia_helper=arcadia)
    decision = dispatcher.dispatch(
        sport_id=29,
        market_family="default",
        quotes=_empty_quotes(),
        pid=99,
    )
    assert decision.resolved is False
    assert decision.winning_source is None


def test_arcadia_not_called_when_primary_wins(monkeypatch):
    monkeypatch.setenv("MSP_ARCADIA_L3_HELPER_ENABLED", "1")
    arcadia = MagicMock(spec=ArcadiaMoreBetsHelper)

    dispatcher = MoreBetsDispatcher(policy=_make_policy(), arcadia_helper=arcadia)
    quotes = [
        SourceQuote(source="api", present=True, age_sec=0.5),
        SourceQuote(source="ws", present=False),
        SourceQuote(source="bia", present=False),
    ]
    decision = dispatcher.dispatch(
        sport_id=29, market_family="default", quotes=quotes, pid=1
    )
    assert decision.resolved is True
    assert decision.winning_source == "api"
    arcadia.fetch_morebet.assert_not_called()


def test_arcadia_counter_incremented(monkeypatch):
    monkeypatch.setenv("MSP_ARCADIA_L3_HELPER_ENABLED", "1")
    arcadia = MagicMock(spec=ArcadiaMoreBetsHelper)
    arcadia.fetch_morebet.return_value = {"pid": 7, "source": "arcadia_l3"}

    dispatcher = MoreBetsDispatcher(policy=_make_policy(), arcadia_helper=arcadia)
    dispatcher.dispatch(
        sport_id=29,
        market_family="default",
        quotes=_empty_quotes(),
        pid=7,
    )
    stats = dispatcher.stats()
    assert stats["morebets_dispatch_success_by_source_total"].get("arcadia_l3", 0) == 1
