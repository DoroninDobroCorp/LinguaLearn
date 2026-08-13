"""Runtime wiring tests for MoreBets dispatcher integration."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from aggregator.decision import DecisionEngine
from aggregator.ingest import IngestRouter
from aggregator.morebets_dispatcher import MoreBetsDispatcher
from aggregator.morebets_policy import load_policy
from aggregator.store import ProvenanceStore
from aggregator.types import PublishedQuote, SourceEvent


_POLICY_PATH = "config/morebets_priority_policy.yaml"


def _dispatcher() -> MoreBetsDispatcher:
    return MoreBetsDispatcher(policy=load_policy(_POLICY_PATH))


def _router(*, dispatcher: MoreBetsDispatcher | None = None) -> tuple[IngestRouter, list[PublishedQuote]]:
    seen: list[PublishedQuote] = []
    router = IngestRouter(
        ProvenanceStore(),
        DecisionEngine(),
        morebets_dispatcher=dispatcher,
    )
    router.register_consumer(seen.append)
    return router, seen


def _explicit_morebets_payload(
    *,
    pid: int = 42,
    family: str = "corners",
    marker: str,
    market_key: str = "CornersTotal",
) -> dict:
    return {
        "Pid": pid,
        "sport_id": 29,
        "market_class": "more_bets",
        "market_family": family,
        "marker": marker,
        "Periods": [
            {
                "Number": 0,
                market_key: {"9.5": {"Over": 1.91, "Under": 1.91}},
            }
        ],
    }


def _legacy_payload(*, pid: int = 42, marker: str) -> dict:
    return {
        "Pid": pid,
        "sport_id": 29,
        "marker": marker,
        "Periods": [
            {
                "Number": 0,
                "MoneyLine": {"Home": 1.91, "Away": 1.95},
            }
        ],
    }


def _event(
    *,
    source_id: str,
    family: str,
    transport: str,
    payload: dict,
    event_id: str = "agg:pid:42",
    age_sec: float = 0.0,
    confidence: float = 1.0,
) -> SourceEvent:
    now = datetime.now(timezone.utc)
    collected = now - timedelta(seconds=age_sec)
    return SourceEvent(
        source_id=source_id,
        family=family,
        transport=transport,
        event_id=event_id,
        payload=payload,
        collected_at=collected,
        received_at=now,
        confidence=confidence,
    )


def test_flag_off_path_is_unchanged_for_explicit_morebets_quotes() -> None:
    router, seen = _router()

    router.ingest(
        _event(
            source_id="pinnacle_api",
            family="pinnacle_native",
            transport="http_pull",
            payload=_explicit_morebets_payload(marker="api"),
            age_sec=1.0,
        )
    )
    pq = router.ingest(
        _event(
            source_id="pin888:acct-A:browser_ws",
            family="pinnacle_native",
            transport="browser_ws",
            payload=_explicit_morebets_payload(marker="ws"),
        )
    )

    assert pq is not None
    assert pq.source_used_for_publish == "pin888:acct-A:browser_ws"
    assert pq.payload["marker"] == "ws"
    assert pq.morebets_context == {}
    assert seen[-1].source_used_for_publish == "pin888:acct-A:browser_ws"


def test_flag_on_l1_only_quote_wins() -> None:
    router, _seen = _router(dispatcher=_dispatcher())

    pq = router.ingest(
        _event(
            source_id="pinnacle_api",
            family="pinnacle_native",
            transport="http_pull",
            payload=_explicit_morebets_payload(marker="api"),
        )
    )

    assert pq is not None
    assert pq.source_used_for_publish == "pinnacle_api"
    assert pq.payload["marker"] == "api"
    assert pq.morebets_context == {
        "active": True,
        "mode": "explicit_bucket",
        "families": ["corners"],
        "winning_sources": ["api"],
    }


def test_flag_on_l1_absent_bia_present_bia_wins() -> None:
    router, _seen = _router(dispatcher=_dispatcher())

    pq = router.ingest(
        _event(
            source_id="bia",
            family="bia",
            transport="bia_ws",
            payload=_explicit_morebets_payload(marker="bia"),
            confidence=0.95,
        )
    )

    assert pq is not None
    assert pq.source_used_for_publish == "bia"
    assert pq.payload["marker"] == "bia"


def test_low_confidence_bia_is_rejected() -> None:
    dispatcher = _dispatcher()
    router, seen = _router(dispatcher=dispatcher)

    pq = router.ingest(
        _event(
            source_id="bia",
            family="bia",
            transport="bia_ws",
            payload=_explicit_morebets_payload(marker="bia"),
            confidence=0.25,
        )
    )

    assert pq is None
    assert seen == []
    stats = dispatcher.stats()
    assert stats["morebets_bia_rejected_low_confidence_total"] == 1


def test_rate_limited_l2_falls_back_to_l3(monkeypatch) -> None:
    monkeypatch.setattr("aggregator.morebets_dispatcher.time.monotonic", lambda: 1000.0)
    dispatcher = _dispatcher()
    router, _seen = _router(dispatcher=dispatcher)

    first = router.ingest(
        _event(
            source_id="pin888:acct-A:browser_ws",
            family="pinnacle_native",
            transport="browser_ws",
            payload=_explicit_morebets_payload(marker="ws-1"),
            event_id="agg:pid:1",
        )
    )
    second = router.ingest(
        _event(
            source_id="pin888:acct-A:browser_ws",
            family="pinnacle_native",
            transport="browser_ws",
            payload=_explicit_morebets_payload(marker="ws-2"),
            event_id="agg:pid:2",
        )
    )
    exhausted = router.ingest(
        _event(
            source_id="pin888:acct-A:browser_ws",
            family="pinnacle_native",
            transport="browser_ws",
            payload=_explicit_morebets_payload(marker="ws-3"),
            event_id="agg:pid:3",
        )
    )
    fallback = router.ingest(
        _event(
            source_id="bia",
            family="bia",
            transport="bia_ws",
            payload=_explicit_morebets_payload(marker="bia-3"),
            event_id="agg:pid:3",
            confidence=0.95,
        )
    )

    assert first is not None
    assert first.source_used_for_publish == "pin888:acct-A:browser_ws"
    assert second is not None
    assert second.source_used_for_publish == "pin888:acct-A:browser_ws"
    assert exhausted is None
    assert fallback is not None
    assert fallback.source_used_for_publish == "bia"
    stats = dispatcher.stats()
    assert stats["morebets_ws_budget_exhausted_total"] >= 1


def test_mixed_payload_overlay_keeps_base_winner_and_adds_morebets_family() -> None:
    router, _seen = _router(dispatcher=_dispatcher())

    router.ingest(
        _event(
            source_id="pinnacle_api",
            family="pinnacle_native",
            transport="http_pull",
            payload=_legacy_payload(marker="api"),
        )
    )
    pq = router.ingest(
        _event(
            source_id="bia",
            family="bia",
            transport="bia_ws",
            payload=_explicit_morebets_payload(marker="bia"),
            confidence=0.95,
        )
    )

    assert pq is not None
    assert pq.source_used_for_publish == "pinnacle_api"
    assert pq.payload["marker"] == "api"
    period0 = pq.payload["Periods"][0]
    assert "MoneyLine" in period0
    assert "CornersTotal" in period0
    assert period0["CornersTotal"]["9.5"]["Over"] == 1.91
    assert pq.morebets_context == {
        "active": True,
        "mode": "overlay",
        "families": ["corners"],
        "winning_sources": ["bia"],
    }