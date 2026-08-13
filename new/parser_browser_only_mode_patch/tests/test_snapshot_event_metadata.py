"""Tests for Story 27.17 — sport_id/starts_at/is_live enrichment.

Покрывает:
- `aggregator.sports.sport_id_from_name` — reverse mapping из SportName
  (pin888 payload) → numeric sport_id
- Partner API normalizer output contains sport_id, starts_at, is_live
- pin888 legacy `build_event` обогащает payload теми же полями
- `/snapshot?profile=debug` render включает три поля на верхнем уровне
- `/snapshot?profile=analytics` включает sport_id + is_live (без starts_at)
- Defensive: None когда данные недоступны, не ломает existing consumers
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any



# ── sport_id_from_name helper ──────────────────────────────────────


def test_sport_id_from_name_known_sports() -> None:
    from aggregator.sports import sport_id_from_name
    assert sport_id_from_name("Soccer") == 29
    assert sport_id_from_name("Basketball") == 4
    assert sport_id_from_name("Tennis") == 33
    assert sport_id_from_name("Hockey") == 19


def test_sport_id_from_name_case_insensitive() -> None:
    from aggregator.sports import sport_id_from_name
    assert sport_id_from_name("soccer") == 29
    assert sport_id_from_name("BASKETBALL") == 4


def test_sport_id_from_name_unknown_returns_none() -> None:
    from aggregator.sports import sport_id_from_name
    assert sport_id_from_name("Curling") is None
    assert sport_id_from_name("") is None
    assert sport_id_from_name(None) is None  # type: ignore[arg-type]


# ── Partner API normalizer output ──────────────────────────────────


def test_partner_api_normalizer_adds_sport_id_starts_at_is_live() -> None:
    """Raw Pinnacle fixture+odds with starts + liveStatus → normalized
    payload carrying sport_id/starts_at/is_live. Odds needed для emit —
    pure fixture-only delta НЕ возвращает events (это по дизайну v1).
    """
    from aggregator.sources.pinnacle_api_normalizer import normalize_sport_snapshot

    fixtures: dict[str, Any] = {
        "league": [
            {
                "name": "UEFA Champions League",
                "events": [
                    {
                        "id": 1628768413,
                        "home": "Team A",
                        "away": "Team B",
                        "starts": "2026-06-15T18:00:00Z",
                        "liveStatus": 1,
                    }
                ],
            }
        ]
    }
    odds: dict[str, Any] = {
        "leagues": [
            {
                "events": [
                    {"id": 1628768413, "periods": [{"lineId": 1, "number": 0}]}
                ]
            }
        ]
    }
    games = normalize_sport_snapshot(sport_id=29, fixtures=fixtures, odds=odds)
    assert len(games) == 1
    game = games[0]
    assert game.get("sport_id") == 29
    assert game.get("starts_at") == "2026-06-15T18:00:00Z"
    assert game.get("is_live") is True
    # Existing keys untouched
    assert game.get("SportName") == "Soccer"
    assert game.get("isLive") is True


def test_partner_api_normalizer_defensive_when_starts_missing() -> None:
    from aggregator.sources.pinnacle_api_normalizer import normalize_sport_snapshot
    fixtures: dict[str, Any] = {
        "league": [
            {
                "name": "Test League",
                "events": [
                    {
                        "id": 1000001,
                        "home": "H",
                        "away": "A",
                        "liveStatus": 0,
                        # no 'starts'
                    }
                ],
            }
        ]
    }
    odds = {"leagues": [{"events": [{"id": 1000001, "periods": []}]}]}
    games = normalize_sport_snapshot(sport_id=4, fixtures=fixtures, odds=odds)
    assert len(games) == 1
    g = games[0]
    assert g.get("sport_id") == 4
    assert g.get("starts_at") is None
    assert g.get("is_live") is False


# ── pin888 legacy adapter build_event ──────────────────────────────


def test_pin888_adapter_enriches_with_sport_id_and_is_live() -> None:
    """pin888 payload имеет SportName+isLive; build_event добавляет
    числовой sport_id через sports mapping + proxy is_live."""
    from aggregator.sources.pin888_source import Pin888SourceAdapter

    # We don't need a real router for build_event — payload enrichment
    # is a pure transform on the dict.
    class _StubRouter:
        pass

    adapter = Pin888SourceAdapter(router=_StubRouter())  # type: ignore[arg-type]
    # Reality: pin888 WS payload uses matchDate (ISO8601). Story 27.17
    # probe подтвердил 2026-04-25 — это canonical field name.
    payload: dict[str, Any] = {
        "Pid": 123,
        "MatchId": "123",
        "SportName": "Basketball",
        "isLive": True,
        "matchDate": "2026-05-01T12:00:00Z",
    }
    event = adapter.build_event(payload)
    assert event is not None
    assert event.payload.get("sport_id") == 4
    assert event.payload.get("is_live") is True
    assert event.payload.get("starts_at") == "2026-05-01T12:00:00Z"


def test_pin888_adapter_unknown_sport_leaves_sport_id_none() -> None:
    from aggregator.sources.pin888_source import Pin888SourceAdapter

    class _StubRouter:
        pass

    adapter = Pin888SourceAdapter(router=_StubRouter())  # type: ignore[arg-type]
    payload: dict[str, Any] = {
        "Pid": 999,
        "MatchId": "999",
        "SportName": "Curling",  # not in mapping
        "isLive": False,
    }
    event = adapter.build_event(payload)
    assert event is not None
    assert event.payload.get("sport_id") is None
    assert event.payload.get("is_live") is False
    assert event.payload.get("starts_at") is None


# ── views.py snapshot rendering ────────────────────────────────────


def _make_published_quote(**overrides: Any) -> Any:
    """Minimal PublishedQuote factory for view tests."""
    from aggregator.types import PublishedQuote, SystemState

    defaults: dict[str, Any] = {
        "event_id": "agg:pid:1",
        "outcomes": [],
        "is_tombstone": False,
        "degraded": False,
        "freshness_ms": 500,
        "system_state_snapshot": SystemState.NORMAL,
        "fallback_state": None,
        "confidence": 1.0,
        "publish_authority_class": "pinnacle_native",
        "decision_reason": "test",
        "source_used_for_publish": "pinnacle_api",
        "all_candidate_sources": [],
        "normalized_identifiers": {},
        "collected_at": datetime(2026, 4, 25, tzinfo=timezone.utc),
        "received_at": datetime(2026, 4, 25, tzinfo=timezone.utc),
        "payload": {
            "Pid": 1,
            "sport_id": 29,
            "starts_at": "2026-06-15T18:00:00Z",
            "is_live": True,
        },
    }
    defaults.update(overrides)
    return PublishedQuote(**defaults)


def test_render_debug_includes_sport_id_starts_at_is_live() -> None:
    from aggregator.views import ViewProfile, build_snapshot_payload
    q = _make_published_quote()
    out = build_snapshot_payload(ViewProfile.DEBUG, [q])
    assert out["events"]
    e = out["events"][0]
    assert e.get("sport_id") == 29
    assert e.get("starts_at") == "2026-06-15T18:00:00Z"
    assert e.get("is_live") is True


def test_render_debug_includes_morebets_context_when_present() -> None:
    from aggregator.views import ViewProfile, build_snapshot_payload

    q = _make_published_quote(
        morebets_context={
            "active": True,
            "mode": "overlay",
            "families": ["corners"],
            "winning_sources": ["bia"],
        }
    )
    out = build_snapshot_payload(ViewProfile.DEBUG, [q])
    e = out["events"][0]
    assert e.get("morebets_context") == {
        "active": True,
        "mode": "overlay",
        "families": ["corners"],
        "winning_sources": ["bia"],
    }


def test_render_analytics_includes_sport_id_is_live_no_starts_at() -> None:
    from aggregator.views import ViewProfile, build_snapshot_payload
    q = _make_published_quote()
    out = build_snapshot_payload(ViewProfile.ANALYTICS, [q])
    e = out["events"][0]
    assert e.get("sport_id") == 29
    assert e.get("is_live") is True
    # analytics does NOT include starts_at — it's heavier & only needed
    # for live/prematch classification in debug-level SLA tooling.
    assert "starts_at" not in e or e.get("starts_at") is None


def test_render_lightweight_does_not_include_new_fields() -> None:
    from aggregator.views import ViewProfile, build_snapshot_payload
    q = _make_published_quote()
    out = build_snapshot_payload(ViewProfile.LIGHTWEIGHT, [q])
    e = out["events"][0]
    # Lightweight stays minimal — new fields intentionally absent.
    assert "sport_id" not in e or e.get("sport_id") is None
    assert "starts_at" not in e or e.get("starts_at") is None
    assert "morebets_context" not in e or e.get("morebets_context") is None


def test_render_debug_defensive_when_payload_fields_missing() -> None:
    """Old cached quotes без enriched payload — None, not crash."""
    from aggregator.views import ViewProfile, build_snapshot_payload
    q = _make_published_quote(payload={"Pid": 42})  # bare payload
    out = build_snapshot_payload(ViewProfile.DEBUG, [q])
    e = out["events"][0]
    assert e.get("sport_id") is None
    assert e.get("starts_at") is None
    assert e.get("is_live") is None
