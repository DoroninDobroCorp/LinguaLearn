"""
Tests for services/bia_observer.py (observer stats, WS loop, subscription)
and async paths in services/bia_client.py (login, verify, ensure_token).
"""

from __future__ import annotations

import asyncio
import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import aiohttp
import pytest

from services.bia_client import BiaSession, _make_ssl_ctx
from services.bia_observer import (
    BiaObserverStats,
    _MIN_STABLE_SESSION_SEC,
    _build_watch_events,
    _build_watch_hcaps,
    _bia_period_for_sport,
    _bia_sport_covers_period,
    _promote_hot_watch_event_candidates,
    _promote_sibling_watch_event_candidates,
    _remember_watch_event_hot_candidate,
    _observe_ws,
    _queue_watch_event_candidate,
    _queue_related_watch_event_candidates,
    _resolve_bia_event_match,
    _seed_watch_event_candidates_from_live_state,
    lookup_bia_event_for_pid,
    lookup_bia_selection_for_pid,
    run_bia_observer,
)


def test_exact_refresh_key_keeps_root_subperiods_distinct():
    from services import bia_observer as obs

    first = obs._exact_refresh_key(10, 0, {
        "bet_type": 3, "team_select": 4, "handicap": 0.5,
        "period_type": "inning", "inning_number": 1,
    })
    sixth = obs._exact_refresh_key(10, 0, {
        "bet_type": 3, "team_select": 4, "handicap": 0.5,
        "period_type": "inning", "inning_number": 6,
    })
    half = obs._exact_refresh_key(10, 0, {
        "bet_type": 3, "team_select": 4, "handicap": 0.5,
        "period_type": "half", "half_number": 1,
    })
    assert len({first, sixth, half}) == 3


def test_exact_refresh_key_keeps_market_contexts_distinct():
    from services import bia_observer as obs

    base = {
        "bet_type": 5, "team_select": 7, "handicap": 3.5,
    }
    match = obs._exact_refresh_key(10, 0, base)
    corners = obs._exact_refresh_key(10, 0, {**base, "market_context": "corners"})
    bookings = obs._exact_refresh_key(10, 0, {**base, "market_context": "bookings"})

    assert len({match, corners, bookings}) == 3


def test_exact_refresh_key_keeps_special_contestants_distinct():
    from services import bia_observer as obs

    home = obs._exact_refresh_key(10, 0, {
        "special_type": "to_qualify", "contestant": "Home",
    })
    away = obs._exact_refresh_key(10, 0, {
        "special_type": "to_qualify", "contestant": "Away",
    })
    standard = obs._exact_refresh_key(10, 0, {
        "bet_type": 1, "team_select": 0,
    })

    assert len({home, away, standard}) == 3


def test_duplicate_catalog_and_reverse_orientation_collapse_to_one_event():
    from services import bia_observer as obs

    stats = BiaObserverStats()
    for comp_id in ("10003308", "10004389"):
        stats._event_registry[(comp_id, "esports", "2026-08-06,1,2")] = {
            "home": "LoL - DRX Challengers",
            "away": "LoL - DN SOOPers",
            "start_ts": "2026-08-06T08:00:00Z",
        }
    refs = [
        {"comp_id": "10003308", "sport_code": "esports", "event_key": "2026-08-06,1,2", "swapped": False},
        {"comp_id": "10004389", "sport_code": "esports", "event_key": "2026-08-06,1,2", "swapped": False},
        {"comp_id": "10003308", "sport_code": "esports", "event_key": "2026-08-06,2,1", "swapped": True},
    ]
    deduped = obs._dedupe_equivalent_event_refs(stats, refs)
    assert len(deduped) == 1
    assert deduped[0]["swapped"] is False
    assert deduped[0]["comp_id"] == "10003308"
    assert obs._observer_registry_collision_identities(stats) == set()


def test_conflicting_catalog_duplicate_still_fails_closed():
    from services import bia_observer as obs

    stats = BiaObserverStats()
    stats._event_registry[("1", "esports", "2026-08-06,1,2")] = {
        "home": "Alpha", "away": "Beta", "start_ts": "2026-08-06T08:00:00Z",
    }
    stats._event_registry[("2", "esports", "2026-08-06,1,2")] = {
        "home": "Gamma", "away": "Delta", "start_ts": "2026-08-06T08:00:00Z",
    }
    stats._event_registry_revision = 1
    assert ("esports", "2026-08-06,1,2") in obs._observer_registry_collision_identities(stats)


def test_exact_participant_names_outrank_shorter_team_alias():
    from services import bia_observer as obs

    refs = [
        {"comp_id": "1", "sport_code": "esports", "event_key": "2026-08-06,1,2", "home": "LoL - DRX Challengers", "away": "LoL - SOOPers", "swapped": False},
        {"comp_id": "1", "sport_code": "esports", "event_key": "2026-08-06,1,3", "home": "LoL - DRX Challengers", "away": "LoL - DN SOOPers", "swapped": False},
    ]
    preferred = obs._prefer_exact_participant_refs(
        {"Home": "Kiwoom DRX", "Away": "DN SOOPers"}, refs,
    )
    assert len(preferred) == 1
    assert preferred[0]["event_key"] == "2026-08-06,1,3"


def test_catalog_team_aliases_with_different_entity_ids_collapse():
    from services import bia_observer as obs

    stats = BiaObserverStats()
    stats._event_registry[("1", "esports", "2026-08-06,10,20")] = {
        "home": "LoL - Maryville University",
        "away": "LoL - CCG",
        "start_ts": "2026-08-06T21:00:00Z",
    }
    stats._event_registry[("1", "esports", "2026-08-06,10,21")] = {
        "home": "Maryville University",
        "away": "CCG Esports",
        "start_ts": "2026-08-06T21:00:00Z",
    }
    refs = [
        {"comp_id": "1", "sport_code": "esports", "event_key": "2026-08-06,10,20", "swapped": False},
        {"comp_id": "1", "sport_code": "esports", "event_key": "2026-08-06,10,21", "swapped": False},
    ]

    deduped = obs._dedupe_equivalent_event_refs(stats, refs)

    assert len(deduped) == 1


# ── BiaObserverStats ────────────────────────────────────────────────────────


def test_basketball_namespaces_map_to_exact_parser_periods():
    assert _bia_period_for_sport("basket") == 0
    assert [_bia_period_for_sport(f"basket_q{number}") for number in range(1, 5)] == [1, 2, 3, 4]
    assert _bia_period_for_sport("basket_ht") == 5
    assert _bia_period_for_sport("basket_unknown") is None


def test_root_event_period_coverage_is_explicit_for_tennis_hockey_and_volleyball():
    assert _bia_sport_covers_period("tennis", 5) is True
    assert _bia_sport_covers_period("ih", 1) is True
    assert _bia_sport_covers_period("ih", 3) is True
    assert _bia_sport_covers_period("ih", 4) is False
    assert _bia_sport_covers_period("volley", 1) is True
    assert _bia_sport_covers_period("volley", 5) is True
    assert _bia_sport_covers_period("volley", 6) is False
    assert _bia_sport_covers_period("fb", 1) is False


def test_reverse_lookup_keeps_hockey_root_event_for_period_market(monkeypatch):
    from services import bia_observer as obs
    from state import state

    stats = BiaObserverStats()
    stats._event_registry[("62082", "ih", "2026-08-08,68916,10060880")] = {
        "competition_name": "Australia AIHL",
        "home": "Sydney Ice Dogs",
        "away": "Newcastle North Stars",
        "start_ts": "2026-08-08T07:00:00Z",
    }
    monkeypatch.setattr(state, "events_data", {
        1633209183: {
            "Home": "Sydney Ice Dogs",
            "Away": "Newcastle North Stars",
            "SportName": "Hockey",
            "LeagueName": "Australia IHL",
        },
    }, raising=False)

    refs = obs._matching_bia_event_refs_for_pid(
        1633209183, period=1, stats=stats,
    )

    assert len(refs) == 1
    assert refs[0]["sport_code"] == "ih"


def test_soccer_context_namespaces_require_explicit_market_context():
    from services import bia_observer as obs

    assert _bia_period_for_sport("fb_corn") == 0
    assert _bia_period_for_sport("fb_corn_ht") == 1
    assert _bia_period_for_sport("fb_book") == 0
    refs = [
        {"sport_code": "fb", "event_key": "match"},
        {"sport_code": "fb_corn", "event_key": "corners"},
        {"sport_code": "fb_corn_ht", "event_key": "corners-half"},
        {"sport_code": "fb_book", "event_key": "bookings"},
    ]
    assert [r["event_key"] for r in obs._filter_bia_event_refs_for_market_context(
        refs, market_context="corners", period=0,
    )] == ["corners"]
    assert [r["event_key"] for r in obs._filter_bia_event_refs_for_market_context(
        refs, market_context="", period=0,
    )] == ["match"]
    assert [r["event_key"] for r in obs._filter_bia_event_refs_for_market_context(
        refs, market_context="bookings", period=0,
    )] == ["bookings"]
    assert obs._filter_bia_event_refs_for_market_context(
        refs, market_context="bookings", period=1,
    ) == []


@pytest.mark.parametrize(
    ("event_id", "pin_home", "pin_away", "bia_home", "bia_away"),
    [
        (1633292664, "Audax Italiano", "Deportivo Nublense", "Audax CS Italiano", "CD Ñublense"),
        (1633294717, "Deportivo Cuenca", "Manta FC", "CD Cuenca", "Manta FC"),
        (1633265663, "Henan FC", "Qingdao West Coast FC", "Henan Songshan Longmen", "Qingdao West Coast"),
    ],
)
def test_fresh_corner_identity_resolves_exactly_without_fuzzy_rematch(
    monkeypatch, event_id, pin_home, pin_away, bia_home, bia_away,
):
    """A newly seeded Forted identity must not wait for the 60s fuzzy cursor."""
    from services import bia_observer as obs
    from state import state

    stats = BiaObserverStats()
    key = ("296", "fb_corn", f"2026-08-09,{event_id},2")
    stats._event_registry[key] = {
        "competition_name": "Grounded league",
        "home": bia_home,
        "away": bia_away,
        "start_ts": "2026-08-09T11:00:00Z",
    }
    monkeypatch.setattr(state, "events_data", {
        event_id: {
            "Pid": event_id,
            "Home": pin_home,
            "Away": pin_away,
            "SportName": "Soccer",
            "LeagueName": "Soccer - Grounded league Corners",
        },
    }, raising=False)

    refs = obs._matching_bia_event_refs_for_pid(event_id, period=0, stats=stats)
    corner_refs = obs._filter_bia_event_refs_for_market_context(
        refs, market_context="corners", period=0,
    )

    assert len(corner_refs) == 1
    assert corner_refs[0]["event_key"] == key[2]
    assert stats._matched_event_cache[key] == (event_id, False)


@pytest.mark.parametrize(
    (
        "event_id", "home", "away", "event_key", "raw_group",
        "line", "bet_type", "team_select", "expected_bet_type",
    ),
    [
        (
            1632998982,
            "CR Flamengo (RJ)",
            "EC Vitoria (BA)",
            "2026-08-09,570,1653",
            "tahou,a",
            2.5,
            5,
            7,
            "for,tahover,a,10",
        ),
        (
            1632998981,
            "SE Palmeiras (SP)",
            "SC Internacional (RS)",
            "2026-08-09,709,753",
            "ahou",
            5.5,
            3,
            3,
            "for,ahover,22",
        ),
        (
            1632995997,
            "CA Bragantino (SP)",
            "SC Corinthians (SP)",
            "2026-08-09,1583,26163",
            "ahou",
            4.5,
            3,
            3,
            "for,ahover,18",
        ),
    ],
)
def test_booking_context_proves_exact_live_audit_lines_only_on_fb_book(
    monkeypatch,
    event_id,
    home,
    away,
    event_key,
    raw_group,
    line,
    bet_type,
    team_select,
    expected_bet_type,
):
    """Grounded audit cases must never fall through to ordinary soccer."""
    from state import state

    stats = BiaObserverStats()
    for sport_code in ("fb", "fb_ht", "fb_corn", "fb_book"):
        stats._event_registry[("209", sport_code, event_key)] = {
            "competition_name": "Brazil Campeonato Brasiliero Serie A",
            "home": home,
            "away": away,
            "start_ts": "2026-08-09T20:00:00Z",
        }
    stats._offer_proofs.observe(
        competition_id="209",
        sport_code="fb_book",
        event_key=event_key,
        markets={raw_group: [None, [[line, 1.91, 1.95]]]},
    )
    monkeypatch.setattr(state, "events_data", {
        event_id: {
            "Home": home,
            "Away": away,
            "SportName": "Soccer",
            "LeagueName": "Brazil Serie A Bookings",
            "start_time_ms": 1786305600000,
        },
    }, raising=False)

    with patch(
        "services.bia_event_matcher.match_bia_event_exact",
        return_value=(event_id, False),
    ):
        result = lookup_bia_selection_for_pid(
            event_id,
            period=0,
            selection={
                "bet_type": bet_type,
                "team_select": team_select,
                "handicap": line,
                "market_context": "bookings",
            },
            stats=stats,
        )

    assert result["found"] is True
    assert result["sport_code"] == "fb_book"
    assert result["offer_proof"]["raw_offer_group"] == raw_group
    assert result["offer_proof"]["bia_bet_type"] == expected_bet_type


def test_ordinary_and_corner_lookups_cannot_consume_booking_offers(monkeypatch):
    from services import bia_observer as obs

    refs = [
        {"sport_code": "fb", "event_key": "same-event"},
        {"sport_code": "fb_ht", "event_key": "same-event"},
        {"sport_code": "fb_corn", "event_key": "same-event"},
        {"sport_code": "fb_corn_ht", "event_key": "same-event"},
        {"sport_code": "fb_book", "event_key": "same-event"},
    ]

    ordinary = obs._filter_bia_event_refs_for_market_context(
        refs, market_context="", period=0,
    )
    corners = obs._filter_bia_event_refs_for_market_context(
        refs, market_context="corners", period=0,
    )

    assert {ref["sport_code"] for ref in ordinary} == {"fb", "fb_ht"}
    assert [ref["sport_code"] for ref in corners] == ["fb_corn"]
    assert all(ref["sport_code"] != "fb_book" for ref in ordinary + corners)


@pytest.mark.asyncio
async def test_booking_rich_offers_are_proof_only_and_never_mutate_event_state(
    monkeypatch,
):
    from services import bia_observer as obs
    from services.bia_client import BiaOffersEventMsg
    from state import state

    stats = BiaObserverStats()
    event_key = "2026-08-09,709,753"
    stats._event_registry[("209", "fb_book", event_key)] = {
        "competition_name": "Brazil Campeonato Brasiliero Série A",
        "home": "SE Palmeiras (SP)",
        "away": "SC Internacional (RS)",
    }
    events = {
        1: {
            "Pid": 1,
            "SportName": "Soccer",
            "Home": "SE Palmeiras SP",
            "Away": "SC Internacional RS",
            "LeagueName": "Brazil Campeonato Brasiliero Série A",
        },
        2: {
            "Pid": 2,
            "SportName": "Soccer",
            "Home": "SE Palmeiras SP",
            "Away": "SC Internacional RS",
            "LeagueName": "Brazil Serie A Bookings",
        },
    }
    monkeypatch.setattr(state, "events_data", events, raising=False)
    message = BiaOffersEventMsg(
        raw=[],
        event_header=[209, "fb_book", event_key],
        markets={"cs": [None, [["1:0", 9.0]]]},
    )

    with patch.object(
        obs,
        "_resolve_bia_event_match",
        side_effect=AssertionError("proof-only frame reached normalized matcher"),
    ):
        await obs._apply_offers_hcap(message, stats)

    assert all("Period" not in game and "Periods" not in game for game in events.values())


@pytest.mark.asyncio
async def test_manual_hydration_cannot_merge_a_booking_namespace(monkeypatch):
    from services.bia_event_hydration import _apply_bia_event_markets
    from state import state

    game = {
        "Pid": 1,
        "SportName": "Soccer",
        "Home": "SE Palmeiras SP",
        "Away": "SC Internacional RS",
        "LeagueName": "Brazil Campeonato Brasiliero Série A",
    }
    monkeypatch.setattr(state, "events_data", {1: game}, raising=False)

    result = await _apply_bia_event_markets(
        1,
        {
            "sport_code": "fb_book",
            "event_key": "2026-08-09,709,753",
            "swapped": False,
        },
        {"cs": [None, [["1:0", 9.0]]]},
    )

    assert result == {
        "status": "proof_only_namespace",
        "sport_code": "fb_book",
        "period": 0,
    }
    assert "Period" not in game and "Periods" not in game


def test_legacy_event_lookup_excludes_booking_proof_namespace(monkeypatch):
    from services import bia_observer as obs

    booking_ref = {
        "event_id": 1,
        "period": 0,
        "comp_id": "209",
        "sport_code": "fb_book",
        "event_key": "2026-08-09,709,753",
        "swapped": False,
    }
    monkeypatch.setattr(
        obs,
        "_matching_bia_event_refs_for_pid",
        lambda *_args, **_kwargs: [booking_ref],
    )

    assert obs.lookup_bia_event_for_pid(1, period=0, stats=BiaObserverStats()) is None


@pytest.mark.asyncio
async def test_pmm_hydration_never_quotes_or_merges_a_booking_namespace(monkeypatch):
    from services import bia_observer as obs
    from services import bia_pmm_hydration as pmm
    from state import state

    game = {
        "Pid": 1,
        "SportName": "Soccer",
        "Home": "SE Palmeiras SP",
        "Away": "SC Internacional RS",
        "LeagueName": "Brazil Campeonato Brasiliero Série A",
        "Periods": [{"Number": 0}],
    }
    booking_ref = {
        "event_id": 1,
        "period": 0,
        "comp_id": "209",
        "sport_code": "fb_book",
        "event_key": "2026-08-09,709,753",
        "swapped": False,
    }

    class FailingClient:
        async def quote_pin88(self, *_args, **_kwargs):
            raise AssertionError("PMM attempted to quote a bookings event")

    monkeypatch.setattr(state, "events_data", {1: game}, raising=False)
    monkeypatch.setattr(
        obs,
        "_matching_bia_event_refs_for_pid",
        lambda *_args, **_kwargs: [booking_ref],
    )
    monkeypatch.setattr(
        pmm,
        "hydrate_bia_event_snapshot",
        AsyncMock(return_value={"status": "ok", "updated_periods": 0}),
    )

    result = await pmm.hydrate_bia_supported_outcomes(
        1,
        periods=(0,),
        client=FailingClient(),
    )

    assert result["updated_total"] == 0
    assert result["periods"]["0"]["event_ref_found"] is False
    assert game["Periods"] == [{"Number": 0}]


def test_configured_football_discovers_and_queues_rich_context_children():
    from services import bia_observer as obs

    stats = BiaObserverStats()
    with patch.object(obs._cfg, "BIA_SPORTS", ("fb",)):
        sports = obs._configured_discovery_sports()
        corner_queued = obs._queue_watch_event_candidate(
            stats,
            [10003917, "fb_corn", "2026-08-06,27524,688"],
        )
        bookings_queued = obs._queue_watch_event_candidate(
            stats,
            [10003917, "fb_book", "2026-08-06,27524,688"],
        )

    assert sports == ["fb", "fb_corn", "fb_corn_ht", "fb_book"]
    assert corner_queued is True
    assert bookings_queued is True
    assert stats._watch_event_pending == [
        [10003917, "fb_corn", "2026-08-06,27524,688"],
        [10003917, "fb_book", "2026-08-06,27524,688"],
    ]


def test_stats_initial_values():
    s = BiaObserverStats()
    assert s.events_seen == 0
    assert s.offers_count == 0
    assert s.pmm_count == 0
    assert s.info_count == 0
    assert s.other_count == 0
    assert s.errors == 0
    assert s.ws_connect_ts == 0.0
    assert s.last_msg_ts == 0.0
    assert s.sports_seen == set()
    assert s.subscribed is False
    assert s.discovered_events == []
    assert s._discovered_keys == set()
    assert s._watch_hcaps_keys == set()
    assert s._watch_event_keys == set()
    assert s._watch_event_scan_cursor == 0
    assert s._watch_event_live_seed_cursor == 0
    assert s._watch_event_pending == []
    assert s._watch_event_pending_keys == set()
    assert s._missed_event_cache == {}


def test_stats_summary_format():
    s = BiaObserverStats()
    s.ws_connect_ts = time.time() - 10
    s.events_seen = 5
    s.offers_count = 3
    s.pmm_count = 1
    s.sports_seen = {"fb", "tennis"}
    s.errors = 0
    txt = s.summary()
    assert "events=5" in txt
    assert "offers=3" in txt
    assert "pmm=1" in txt
    assert "errors=0" in txt


# ── _build_watch_hcaps ──────────────────────────────────────────────────────


def test_build_watch_hcaps_empty():
    s = BiaObserverStats()
    assert _build_watch_hcaps(s) is None


def test_build_watch_hcaps_with_events():
    s = BiaObserverStats()
    s.events_by_sport["fb"] = 10
    s.events_by_sport["tennis"] = 3
    s.discovered_events = [
        [3, "fb", "2026-04-05,95,47"],
        [17, "fb", "2026-04-05,1268,535"],
        [5, "tennis", "2026-04-05,200,100"],
    ]
    with patch("services.bia_observer._watch_hcaps_matches_live_state", return_value=True):
        msg = _build_watch_hcaps(s)
    assert msg is not None
    assert msg[0] == "watch_hcaps"
    assert len(msg[1]) == 3
    # Each entry is a [comp_id, sport_code, event_id] triple
    assert msg[1][0] == [3, "fb", "2026-04-05,95,47"]


def test_build_watch_hcaps_filters_by_bia_sports():
    """Only sports in BIA_SPORTS are included in the subscription."""
    s = BiaObserverStats()
    s.events_by_sport["fb"] = 5
    s.events_by_sport["cricket"] = 2
    s.discovered_events = [
        [3, "fb", "2026-04-05,1,1"],
        [7, "cricket", "2026-04-05,2,2"],
    ]
    with patch("services.bia_observer._watch_hcaps_matches_live_state", return_value=True):
        msg = _build_watch_hcaps(s)
    assert msg is not None
    # Default BIA_SPORTS includes fb but not cricket
    sports_in_sub = {triple[1] for triple in msg[1]}
    assert "fb" in sports_in_sub
    assert "cricket" not in sports_in_sub


def test_build_watch_hcaps_deduplicates():
    s = BiaObserverStats()
    s.events_by_sport["fb"] = 2
    s.discovered_events = [
        [3, "fb", "2026-04-05,95,47"],
        [3, "fb", "2026-04-05,95,47"],  # duplicate
    ]
    with patch("services.bia_observer._watch_hcaps_matches_live_state", return_value=True):
        msg = _build_watch_hcaps(s)
    assert msg is not None
    assert len(msg[1]) == 1


def test_build_watch_hcaps_only_unsent_filters_already_watched():
    s = BiaObserverStats()
    s.discovered_events = [
        [3, "fb", "2026-04-05,95,47"],
        [5, "tennis", "2026-04-05,200,100"],
    ]
    s._watch_hcaps_keys.add((3, "fb", "2026-04-05,95,47"))
    with patch("services.bia_observer._watch_hcaps_matches_live_state", return_value=True):
        msg = _build_watch_hcaps(s, only_unsent=True)
    assert msg is not None
    assert msg[1] == [[5, "tennis", "2026-04-05,200,100"]]


def test_build_watch_events_includes_exact_proof_sports_only():
    s = BiaObserverStats()
    s.discovered_events = [
        [3, "fb", "2026-04-05,95,47"],
        [3, "fb_ht", "2026-04-05,95,47"],
        [3, "fb_htft", "2026-04-05,95,47"],
        [5, "tennis", "2026-04-05,200,100"],
        [6, "esports", "2026-04-05,201,101"],
        [7, "fb_corn", "2026-04-05,2,2"],
    ]
    with patch("services.bia_observer._watch_event_matches_live_state", return_value=True):
        msg = _build_watch_events(s)
    assert msg == [
        [3, "fb", "2026-04-05,95,47"],
        [3, "fb_ht", "2026-04-05,95,47"],
        [3, "fb_htft", "2026-04-05,95,47"],
        [5, "tennis", "2026-04-05,200,100"],
        [6, "esports", "2026-04-05,201,101"],
    ]


def test_build_watch_events_only_unsent_filters_already_watched():
    s = BiaObserverStats()
    s.discovered_events = [
        [3, "fb", "2026-04-05,95,47"],
        [3, "fb_ht", "2026-04-05,95,47"],
    ]
    s._watch_event_keys.add((3, "fb", "2026-04-05,95,47"))
    with patch("services.bia_observer._watch_event_matches_live_state", return_value=True):
        msg = _build_watch_events(s, only_unsent=True)
    assert msg == [[3, "fb_ht", "2026-04-05,95,47"]]


def _watch_event_matches_live_state_for_test(_stats, triple):
    return triple[1] == "fb"


def test_queue_watch_event_candidate_front_inserts_and_trims_tail():
    s = BiaObserverStats()
    from services.bia_observer import _WATCH_EVENT_BATCH_SIZE, _WATCH_EVENT_PREFETCH_COUNT
    cap = max(_WATCH_EVENT_BATCH_SIZE, _WATCH_EVENT_PREFETCH_COUNT)
    for idx in range(cap):
        triple = [idx, "fb", f"evt-{idx}"]
        s._watch_event_pending.append(triple)
        s._watch_event_pending_keys.add((idx, "fb", f"evt-{idx}"))

    added = _queue_watch_event_candidate(
        s,
        [999, "fb", "priority-evt"],
        front=True,
    )

    assert added is True
    assert s._watch_event_pending[0] == [999, "fb", "priority-evt"]
    assert len(s._watch_event_pending) == cap
    assert (999, "fb", "priority-evt") in s._watch_event_pending_keys
    assert (cap - 1, "fb", f"evt-{cap - 1}") not in s._watch_event_pending_keys


def test_queue_watch_event_candidate_front_moves_existing_pending_to_front():
    s = BiaObserverStats()
    s._watch_event_pending = [
        [1, "fb", "evt-1"],
        [2, "fb", "evt-2"],
        [3, "fb", "evt-3"],
    ]
    s._watch_event_pending_keys = {
        (1, "fb", "evt-1"),
        (2, "fb", "evt-2"),
        (3, "fb", "evt-3"),
    }

    moved = _queue_watch_event_candidate(
        s,
        [3, "fb", "evt-3"],
        front=True,
    )

    assert moved is True
    assert s._watch_event_pending == [
        [3, "fb", "evt-3"],
        [1, "fb", "evt-1"],
        [2, "fb", "evt-2"],
    ]


def test_promote_hot_watch_event_candidates_moves_hot_match_to_front():
    s = BiaObserverStats()
    s._watch_event_pending = [
        [1, "fb", "evt-1"],
        [2, "fb", "evt-2"],
    ]
    s._watch_event_pending_keys = {
        (1, "fb", "evt-1"),
        (2, "fb", "evt-2"),
    }
    _remember_watch_event_hot_candidate(s, [2, "fb", "evt-2"])

    _promote_hot_watch_event_candidates(s, limit=1)

    assert s._watch_event_pending[0] == [2, "fb", "evt-2"]
    assert s._watch_event_hot_candidates == [[2, "fb", "evt-2"]]


def test_resolve_bia_event_match_can_bypass_stale_miss_cache(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s._event_registry[("29", "fb", "evt-1")] = {
            "competition_name": "UEFA Europa League",
            "home": "Bologna",
            "away": "Aston Villa",
            "sport": "fb",
            "event_key": "evt-1",
            "competition_id": "29",
        }
        s._missed_event_cache[("29", "fb", "evt-1")] = time.time()
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1626579734: {
                    "Pid": 1626579734,
                    "SportName": "Soccer",
                    "homeName": "Bologna",
                    "awayName": "Aston Villa",
                }
            },
            raising=False,
        )

        miss_pid, _ = _resolve_bia_event_match(
            s,
            comp_id="29",
            sport_code="fb",
            event_key="evt-1",
        )
        hit_pid, _ = _resolve_bia_event_match(
            s,
            comp_id="29",
            sport_code="fb",
            event_key="evt-1",
            allow_stale_miss_recheck=True,
        )

        assert miss_pid is None
        assert hit_pid == 1626579734
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_resolve_bia_event_match_skips_miss_cache_when_runtime_inventory_empty(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s._event_registry[("29", "fb", "evt-1")] = {
            "competition_name": "UEFA Europa League",
            "home": "Bologna",
            "away": "Aston Villa",
            "sport": "fb",
            "event_key": "evt-1",
            "competition_id": "29",
        }
        monkeypatch.setattr(state, "events_data", {}, raising=False)

        pid, swapped = _resolve_bia_event_match(
            s,
            comp_id="29",
            sport_code="fb",
            event_key="evt-1",
        )

        assert pid is None
        assert swapped is False
        assert s._missed_event_cache == {}
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_build_watch_hcaps_does_not_record_miss_cache_for_unmatched_event(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s.discovered_events = [[29, "fb", "evt-1"]]
        s._event_registry[("29", "fb", "evt-1")] = {
            "competition_name": "UEFA Europa League",
            "home": "Bologna",
            "away": "Aston Villa",
            "sport": "fb",
            "event_key": "evt-1",
            "competition_id": "29",
        }
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1: {
                    "Pid": 1,
                    "SportName": "Soccer",
                    "homeName": "Roma",
                    "awayName": "Lazio",
                    "isLive": False,
                }
            },
            raising=False,
        )

        msg = _build_watch_hcaps(s)

        assert msg is None
        assert s._missed_event_cache == {}
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_seed_watch_event_candidates_from_live_state_prioritizes_top_soccer(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s._event_registry[("29", "fb", "bologna-evt")] = {
            "competition_name": "UEFA Europa League",
            "home": "Bologna",
            "away": "Aston Villa",
            "sport": "fb",
            "event_key": "bologna-evt",
            "competition_id": "29",
        }
        s._event_registry[("31", "fb", "later-evt")] = {
            "competition_name": "Serie A",
            "home": "Torino",
            "away": "Roma",
            "sport": "fb",
            "event_key": "later-evt",
            "competition_id": "31",
        }
        s._watch_hcaps_keys = {
            (29, "fb", "bologna-evt"),
            (31, "fb", "later-evt"),
        }
        s._matched_event_cache[("29", "fb", "bologna-evt")] = (1626579734, False)
        s._matched_event_cache[("31", "fb", "later-evt")] = (2000000001, False)
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1626579734: {
                    "Pid": 1626579734,
                    "SportName": "Soccer",
                    "homeName": "Bologna",
                    "awayName": "Aston Villa",
                    "start_time_ms": 100,
                },
                2000000001: {
                    "Pid": 2000000001,
                    "SportName": "Soccer",
                    "homeName": "Torino",
                    "awayName": "Roma",
                    "start_time_ms": 200,
                },
            },
            raising=False,
        )

        _seed_watch_event_candidates_from_live_state(s, limit=2)

        assert s._watch_event_pending == [
            [29, "fb", "bologna-evt"],
            [31, "fb", "later-evt"],
        ]
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_seed_watch_event_candidates_from_live_state_prefers_player_props(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s._event_registry[("29", "fb", "early-evt")] = {
            "competition_name": "League",
            "home": "Early",
            "away": "Kickoff",
            "sport": "fb",
            "event_key": "early-evt",
            "competition_id": "29",
        }
        s._event_registry[("31", "fb", "rich-evt")] = {
            "competition_name": "League",
            "home": "Rich",
            "away": "Match",
            "sport": "fb",
            "event_key": "rich-evt",
            "competition_id": "31",
        }
        s._watch_hcaps_keys = {
            (29, "fb", "early-evt"),
            (31, "fb", "rich-evt"),
        }
        s._matched_event_cache[("29", "fb", "early-evt")] = (1001, False)
        s._matched_event_cache[("31", "fb", "rich-evt")] = (1002, False)
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1001: {
                    "Pid": 1001,
                    "SportName": "Soccer",
                    "homeName": "Early",
                    "awayName": "Kickoff",
                    "start_time_ms": 100,
                },
                1002: {
                    "Pid": 1002,
                    "SportName": "Soccer",
                    "homeName": "Rich",
                    "awayName": "Match",
                    "start_time_ms": 200,
                    "Period": {
                        0: {
                            "PlayerProps": [{"Name": "Anytime Scorer"}],
                        },
                    },
                },
            },
            raising=False,
        )

        _seed_watch_event_candidates_from_live_state(s, limit=1)

        assert s._watch_event_pending == [[31, "fb", "rich-evt"]]
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_seed_watch_event_candidates_from_live_state_prefers_richer_specials(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s._event_registry[("29", "fb", "early-evt")] = {
            "competition_name": "League",
            "home": "Early",
            "away": "Kickoff",
            "sport": "fb",
            "event_key": "early-evt",
            "competition_id": "29",
        }
        s._event_registry[("31", "fb", "rich-evt")] = {
            "competition_name": "League",
            "home": "Rich",
            "away": "Match",
            "sport": "fb",
            "event_key": "rich-evt",
            "competition_id": "31",
        }
        s._watch_hcaps_keys = {
            (29, "fb", "early-evt"),
            (31, "fb", "rich-evt"),
        }
        s._matched_event_cache[("29", "fb", "early-evt")] = (1001, False)
        s._matched_event_cache[("31", "fb", "rich-evt")] = (1002, False)
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1001: {
                    "Pid": 1001,
                    "SportName": "Soccer",
                    "homeName": "Early",
                    "awayName": "Kickoff",
                    "start_time_ms": 100,
                    "Periods": [
                        {"Number": 0, "Win1x2": []},
                    ],
                },
                1002: {
                    "Pid": 1002,
                    "SportName": "Soccer",
                    "homeName": "Rich",
                    "awayName": "Match",
                    "start_time_ms": 200,
                    "Periods": [
                        {
                            "Number": 0,
                            "Win1x2": [],
                            "CorrectScore": [],
                            "WinningMargin": [],
                            "TotalGoalsRange": [],
                        },
                    ],
                },
            },
            raising=False,
        )

        _seed_watch_event_candidates_from_live_state(s, limit=1)

        assert s._watch_event_pending == [[31, "fb", "rich-evt"]]
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_seed_watch_event_candidates_from_live_state_prefers_prematch(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s._event_registry[("29", "fb", "live-evt")] = {
            "competition_name": "League",
            "home": "Live",
            "away": "Match",
            "sport": "fb",
            "event_key": "live-evt",
            "competition_id": "29",
        }
        s._event_registry[("31", "fb", "prematch-evt")] = {
            "competition_name": "League",
            "home": "Prematch",
            "away": "Match",
            "sport": "fb",
            "event_key": "prematch-evt",
            "competition_id": "31",
        }
        s._watch_hcaps_keys = {
            (29, "fb", "live-evt"),
            (31, "fb", "prematch-evt"),
        }
        s._matched_event_cache[("29", "fb", "live-evt")] = (1001, False)
        s._matched_event_cache[("31", "fb", "prematch-evt")] = (1002, False)
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1001: {
                    "Pid": 1001,
                    "SportName": "Soccer",
                    "homeName": "Live",
                    "awayName": "Match",
                    "start_time_ms": 100,
                    "isLive": True,
                },
                1002: {
                    "Pid": 1002,
                    "SportName": "Soccer",
                    "homeName": "Prematch",
                    "awayName": "Match",
                    "start_time_ms": 200,
                    "isLive": False,
                },
            },
            raising=False,
        )

        _seed_watch_event_candidates_from_live_state(s, limit=1)

        assert s._watch_event_pending == [[31, "fb", "prematch-evt"]]
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_build_watch_events_skips_live_matches(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s.discovered_events = [[29, "fb", "live-evt"]]
        s._event_registry[("29", "fb", "live-evt")] = {
            "competition_name": "League",
            "home": "Live",
            "away": "Match",
            "sport": "fb",
            "event_key": "live-evt",
            "competition_id": "29",
        }
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1001: {
                    "Pid": 1001,
                    "SportName": "Soccer",
                    "homeName": "Live",
                    "awayName": "Match",
                    "isLive": True,
                },
            },
            raising=False,
        )

        subs = _build_watch_events(s, only_unsent=True, limit=1)

        assert subs is None
        assert s._watch_event_pending == []
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_seed_watch_event_candidates_from_live_state_rotates_cursor(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        registry_entries = [
            ("29", "Alpha", "One", "evt-1"),
            ("30", "Bravo", "Two", "evt-2"),
            ("31", "Charlie", "Three", "evt-3"),
        ]
        for comp_id, home, away, event_key in registry_entries:
            s._event_registry[(comp_id, "fb", event_key)] = {
                "competition_name": "League",
                "home": home,
                "away": away,
                "sport": "fb",
                "event_key": event_key,
                "competition_id": comp_id,
            }
            s._watch_hcaps_keys.add((int(comp_id), "fb", event_key))
        s._matched_event_cache[("29", "fb", "evt-1")] = (1001, False)
        s._matched_event_cache[("30", "fb", "evt-2")] = (1002, False)
        s._matched_event_cache[("31", "fb", "evt-3")] = (1003, False)
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1001: {
                    "Pid": 1001,
                    "SportName": "Soccer",
                    "homeName": "Alpha",
                    "awayName": "One",
                    "start_time_ms": 100,
                },
                1002: {
                    "Pid": 1002,
                    "SportName": "Soccer",
                    "homeName": "Bravo",
                    "awayName": "Two",
                    "start_time_ms": 200,
                },
                1003: {
                    "Pid": 1003,
                    "SportName": "Soccer",
                    "homeName": "Charlie",
                    "awayName": "Three",
                    "start_time_ms": 300,
                },
            },
            raising=False,
        )

        _seed_watch_event_candidates_from_live_state(s, limit=1)
        first_pending = list(s._watch_event_pending)
        s._watch_event_pending.clear()
        s._watch_event_pending_keys.clear()
        _seed_watch_event_candidates_from_live_state(s, limit=1)
        second_pending = list(s._watch_event_pending)

        assert first_pending == [[29, "fb", "evt-1"]]
        assert second_pending == [[30, "fb", "evt-2"]]
        assert s._watch_event_live_seed_cursor == 3
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_seed_watch_event_candidates_from_live_state_reorders_existing_pending(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s._event_registry[("29", "fb", "bologna-evt")] = {
            "competition_name": "UEFA Europa League",
            "home": "Bologna",
            "away": "Aston Villa",
            "sport": "fb",
            "event_key": "bologna-evt",
            "competition_id": "29",
        }
        s._watch_hcaps_keys.add((29, "fb", "bologna-evt"))
        s._matched_event_cache[("29", "fb", "bologna-evt")] = (1626579734, False)
        s._watch_event_pending = [
            [31, "fb", "other-evt"],
            [29, "fb", "bologna-evt"],
        ]
        s._watch_event_pending_keys = {
            (31, "fb", "other-evt"),
            (29, "fb", "bologna-evt"),
        }
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1626579734: {
                    "Pid": 1626579734,
                    "SportName": "Soccer",
                    "homeName": "Bologna",
                    "awayName": "Aston Villa",
                    "start_time_ms": 100,
                },
            },
            raising=False,
        )

        _seed_watch_event_candidates_from_live_state(s, limit=1)

        assert s._watch_event_pending[0] == [29, "fb", "bologna-evt"]
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_seed_watch_event_candidates_from_live_state_can_pick_first_half_entry(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s._event_registry[("29", "fb", "bologna-evt")] = {
            "competition_name": "UEFA Europa League",
            "home": "Bologna",
            "away": "Aston Villa",
            "sport": "fb",
            "event_key": "bologna-evt",
            "competition_id": "29",
        }
        s._event_registry[("29", "fb_ht", "bologna-evt")] = {
            "competition_name": "UEFA Europa League",
            "home": "Bologna",
            "away": "Aston Villa",
            "sport": "fb_ht",
            "event_key": "bologna-evt",
            "competition_id": "29",
        }
        s._watch_hcaps_keys = {
            (29, "fb", "bologna-evt"),
            (29, "fb_ht", "bologna-evt"),
        }
        s._matched_event_cache[("29", "fb", "bologna-evt")] = (1626579734, False)
        s._matched_event_cache[("29", "fb_ht", "bologna-evt")] = (1626579734, False)
        s._watch_event_keys.add((29, "fb", "bologna-evt"))
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1626579734: {
                    "Pid": 1626579734,
                    "SportName": "Soccer",
                    "homeName": "Bologna",
                    "awayName": "Aston Villa",
                    "start_time_ms": 100,
                },
            },
            raising=False,
        )

        _seed_watch_event_candidates_from_live_state(s, limit=2)

        assert s._watch_event_pending == [[29, "fb_ht", "bologna-evt"]]
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_queue_related_watch_event_candidates_promotes_first_half(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s._event_registry[("29", "fb", "bologna-evt")] = {
            "competition_name": "UEFA Europa League",
            "home": "Bologna",
            "away": "Aston Villa",
            "sport": "fb",
            "event_key": "bologna-evt",
            "competition_id": "29",
        }
        s._event_registry[("29", "fb_ht", "bologna-evt")] = {
            "competition_name": "UEFA Europa League",
            "home": "Bologna",
            "away": "Aston Villa",
            "sport": "fb_ht",
            "event_key": "bologna-evt",
            "competition_id": "29",
        }
        s._watch_hcaps_keys = {
            (29, "fb", "bologna-evt"),
            (29, "fb_ht", "bologna-evt"),
        }
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1626579734: {
                    "Pid": 1626579734,
                    "SportName": "Soccer",
                    "homeName": "Bologna",
                    "awayName": "Aston Villa",
                    "start_time_ms": 100,
                },
            },
            raising=False,
        )

        _queue_related_watch_event_candidates(s, [29, "fb", "bologna-evt"])

        assert s._watch_event_pending == [[29, "fb_ht", "bologna-evt"]]
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_promote_sibling_watch_event_candidates_queues_first_half_when_ready(monkeypatch):
    from state import state

    orig_events = state.events_data
    try:
        s = BiaObserverStats()
        s._watch_event_sibling_pids = [1626579734]
        s._event_registry[("29", "fb_ht", "bologna-evt")] = {
            "competition_name": "UEFA Europa League",
            "home": "Bologna",
            "away": "Aston Villa",
            "sport": "fb_ht",
            "event_key": "bologna-evt",
            "competition_id": "29",
        }
        s._watch_hcaps_keys = {(29, "fb_ht", "bologna-evt")}
        s._matched_event_cache[("29", "fb_ht", "bologna-evt")] = (1626579734, False)
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1626579734: {
                    "Pid": 1626579734,
                    "SportName": "Soccer",
                    "homeName": "Bologna",
                    "awayName": "Aston Villa",
                    "start_time_ms": 100,
                },
            },
            raising=False,
        )

        _promote_sibling_watch_event_candidates(s, limit=1)

        assert s._watch_event_pending == [[29, "fb_ht", "bologna-evt"]]
        assert s._watch_event_sibling_pids == [1626579734]
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


# ── _observe_ws ─────────────────────────────────────────────────────────────


def _make_fake_ws(messages: list, *, stay_open: bool = False):
    """Return a fake WS yielding ``messages`` and optionally remaining open."""
    ws = AsyncMock()
    ws.closed = False
    call_count = 0

    async def _receive():
        nonlocal call_count
        if call_count < len(messages):
            msg = messages[call_count]
            call_count += 1
            return msg
        if stay_open:
            await asyncio.Event().wait()
        # After messages exhausted, return CLOSE.
        ws.closed = True
        return SimpleNamespace(type=aiohttp.WSMsgType.CLOSE, data=None, extra=None)

    ws.receive = _receive
    ws.send_json = AsyncMock()
    return ws


def _text_msg(data: str) -> SimpleNamespace:
    return SimpleNamespace(type=aiohttp.WSMsgType.TEXT, data=data)


def _close_msg() -> SimpleNamespace:
    return SimpleNamespace(type=aiohttp.WSMsgType.CLOSE, data=None, extra=None)


class _FakeWSCtx:
    """Async context manager that returns a pre-built fake WS."""

    def __init__(self, ws):
        self._ws = ws

    async def __aenter__(self):
        return self._ws

    async def __aexit__(self, *exc):
        pass


@pytest.mark.asyncio
async def test_observe_ws_no_url():
    """_observe_ws returns immediately when no WS URL."""
    http = MagicMock()
    bia = BiaSession(http)
    stats = BiaObserverStats()
    await _observe_ws(bia, stats)
    assert stats.ws_connect_ts == 0.0


@pytest.mark.asyncio
async def test_observe_ws_requests_configured_competition_inventory_first():
    """A cold connection actively requests the bounded configured inventory."""
    ws = _make_fake_ws([_close_msg()])
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(ws))
    bia = BiaSession(http)
    bia._token = "test-tok"
    bia._login_ts = time.time()

    stats = BiaObserverStats()
    with patch(
        "services.bia_observer._cfg.BIA_SPORTS",
        ["esports", "tennis", "esports", ""],
    ):
        await _observe_ws(bia, stats)

    ws.send_json.assert_awaited_once_with(
        ["watch_comps", ["esports", "tennis"]],
    )


@pytest.mark.asyncio
async def test_observe_ws_processes_events():
    """Events and rich/narrow BIA offer frames are counted."""
    event_frame = json.dumps(["event", ["fb", "2026-04-05,1,1"], {"home": "A", "away": "B", "competition_id": 3}])
    offers_event_frame = json.dumps(["offers_event", ["fb", "2026-04-05,1,1"], {"cs": []}])
    offers_frame = json.dumps(["offers_hcap", ["fb", "2026-04-05,1,1"], {"wdw": []}])

    ws = _make_fake_ws([
        _text_msg(event_frame),
        _text_msg(offers_event_frame),
        _text_msg(offers_frame),
        _close_msg(),
    ])
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(ws))
    bia = BiaSession(http)
    bia._token = "test-tok"
    bia._login_ts = time.time()

    stats = BiaObserverStats()
    with patch("services.bia_observer._cfg.BIA_EXPERIMENTAL_OBSERVER_WATCH_EVENT", True), \
         patch("services.bia_observer._watch_hcaps_matches_live_state", side_effect=_watch_event_matches_live_state_for_test), \
         patch("services.bia_observer._WATCH_HCAPS_WARMUP_SEC", 0.0), \
         patch("services.bia_observer._WATCH_EVENT_WARMUP_SEC", 0.0), \
         patch("services.bia_observer._watch_event_matches_live_state", side_effect=_watch_event_matches_live_state_for_test):
        await _observe_ws(bia, stats)

    assert stats.events_seen == 1
    assert stats.offers_count == 2
    assert "fb" in stats.sports_seen
    # watch_hcaps should have been sent with [comp_id, sport, event_id] triple
    assert stats.subscribed is True
    assert len(stats.discovered_events) == 1
    assert stats.discovered_events[0] == [3, "fb", "2026-04-05,1,1"]
    calls = ws.send_json.call_args_list
    event_calls = [c for c in calls if c[0][0][0] == "watch_event"]
    hcap_calls = [c for c in calls if c[0][0][0] == "watch_hcaps"]
    assert len(event_calls) == 1
    assert event_calls[0][0][0] == ["watch_event", [3, "fb", "2026-04-05,1,1"]]
    assert len(hcap_calls) == 1
    sent_subs = hcap_calls[0][0][0][1]
    assert sent_subs[0] == [3, "fb", "2026-04-05,1,1"]


@pytest.mark.asyncio
async def test_observe_ws_ingests_raw_offer_proof_before_optional_integration():
    offers = json.dumps([
        "offers_hcap",
        [3, "fb", "2026-04-05,1,1"],
        {"tahou,h": [None, [[2.5, 1.91, 1.95]]]},
    ])
    ws = _make_fake_ws([_text_msg(offers), _close_msg()])
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(ws))
    bia = BiaSession(http)
    bia._token = "test-tok"
    bia._login_ts = time.time()
    stats = BiaObserverStats()

    with patch("services.bia_observer._bia_integration_active", return_value=False):
        await _observe_ws(bia, stats)

    proof = stats._offer_proofs.prove(
        {"comp_id": "3", "sport_code": "fb", "event_key": "2026-04-05,1,1"},
        {"bet_type": 4, "team_select": 5, "handicap": 2.5},
    )
    assert proof.bet_type == "for,tahover,h,10"


@pytest.mark.asyncio
async def test_observe_ws_incrementally_subscribes_new_events():
    event1 = json.dumps(["event", ["fb", "2026-04-05,1,1"], {"home": "A", "away": "B", "competition_id": 3}])
    event2 = json.dumps(["event", ["fb", "2026-04-05,1,2"], {"home": "C", "away": "D", "competition_id": 3}])
    event3 = json.dumps(["event", ["tennis", "2026-04-05,2,1"], {"home": "E", "away": "F", "competition_id": 5}])

    ws = _make_fake_ws([
        _text_msg(event1),
        _text_msg(event2),
        _text_msg(event3),
        _close_msg(),
    ])
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(ws))
    bia = BiaSession(http)
    bia._token = "test-tok"
    bia._login_ts = time.time()

    stats = BiaObserverStats()
    with patch("services.bia_observer._cfg.BIA_EXPERIMENTAL_OBSERVER_WATCH_EVENT", True), \
         patch("services.bia_observer._watch_hcaps_matches_live_state", side_effect=_watch_event_matches_live_state_for_test), \
         patch("services.bia_observer._WATCH_HCAPS_BATCH_SIZE", 2), \
         patch("services.bia_observer._WATCH_EVENT_BATCH_SIZE", 2), \
         patch("services.bia_observer._WATCH_HCAPS_WARMUP_SEC", 0.0), \
         patch("services.bia_observer._WATCH_EVENT_WARMUP_SEC", 0.0), \
         patch("services.bia_observer._WATCH_HCAPS_FLUSH_SEC", 0.0), \
         patch("services.bia_observer._WATCH_EVENT_FLUSH_SEC", 0.0), \
         patch("services.bia_observer._watch_event_matches_live_state", side_effect=_watch_event_matches_live_state_for_test):
        await _observe_ws(bia, stats)

    calls = ws.send_json.call_args_list
    event_calls = [c for c in calls if c[0][0][0] == "watch_event"]
    hcap_calls = [c for c in calls if c[0][0][0] == "watch_hcaps"]
    assert len(event_calls) == 2
    assert [c[0][0][1] for c in event_calls] == [
        [3, "fb", "2026-04-05,1,1"],
        [3, "fb", "2026-04-05,1,2"],
    ]
    # With time-gated builds, hcaps may arrive in 1 or 2 batches.
    assert len(hcap_calls) >= 1
    all_hcap_triples = []
    for hc in hcap_calls:
        all_hcap_triples.extend(hc[0][0][1])
    assert sorted(all_hcap_triples) == sorted([
        [3, "fb", "2026-04-05,1,1"],
        [3, "fb", "2026-04-05,1,2"],
    ])
    assert stats._watch_hcaps_keys == {
        (3, "fb", "2026-04-05,1,1"),
        (3, "fb", "2026-04-05,1,2"),
    }
    assert stats._watch_event_keys == {
        (3, "fb", "2026-04-05,1,1"),
        (3, "fb", "2026-04-05,1,2"),
    }


@pytest.mark.asyncio
async def test_observe_ws_deduplicates_discovered_events():
    """Duplicate event messages must not grow discovered_events unboundedly."""
    event_frame = json.dumps(["event", ["fb", "2026-04-05,1,1"], {"home": "A", "away": "B", "competition_id": 3}])

    ws = _make_fake_ws([
        _text_msg(event_frame),
        _text_msg(event_frame),
        _text_msg(event_frame),
        _close_msg(),
    ])
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(ws))
    bia = BiaSession(http)
    bia._token = "test-tok"
    bia._login_ts = time.time()

    stats = BiaObserverStats()
    with patch("services.bia_observer._watch_event_matches_live_state", side_effect=_watch_event_matches_live_state_for_test):
        await _observe_ws(bia, stats)

    assert stats.events_seen == 3
    assert len(stats.discovered_events) == 1
    assert len(stats._discovered_keys) == 1


@pytest.mark.asyncio
async def test_observe_ws_paces_full_watch_hcaps_batches():
    """Even full watch_hcaps batches must respect the flush interval."""
    event1 = json.dumps(["event", ["fb", "2026-04-05,1,1"], {"home": "A", "away": "B", "competition_id": 3}])
    event2 = json.dumps(["event", ["fb", "2026-04-05,1,2"], {"home": "C", "away": "D", "competition_id": 3}])
    event3 = json.dumps(["event", ["fb", "2026-04-05,1,3"], {"home": "E", "away": "F", "competition_id": 3}])
    event4 = json.dumps(["event", ["fb", "2026-04-05,1,4"], {"home": "G", "away": "H", "competition_id": 3}])

    ws = _make_fake_ws([
        _text_msg(event1),
        _text_msg(event2),
        _text_msg(event3),
        _text_msg(event4),
        _close_msg(),
    ])
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(ws))
    bia = BiaSession(http)
    bia._token = "test-tok"
    bia._login_ts = time.time()

    stats = BiaObserverStats()
    fake_now = iter([0.0, 0.0, 0.0, 0.1, 0.2, 0.3, 0.4, 0.5])
    with patch("services.bia_observer._cfg.BIA_EXPERIMENTAL_OBSERVER_WATCH_EVENT", True), \
         patch("services.bia_observer._watch_hcaps_matches_live_state", side_effect=_watch_event_matches_live_state_for_test), \
         patch("services.bia_observer.time.time", side_effect=lambda: next(fake_now)), \
         patch("services.bia_observer._WATCH_HCAPS_BATCH_SIZE", 2), \
         patch("services.bia_observer._WATCH_EVENT_BATCH_SIZE", 2), \
         patch("services.bia_observer._WATCH_HCAPS_WARMUP_SEC", 0.0), \
         patch("services.bia_observer._WATCH_EVENT_WARMUP_SEC", 0.0), \
         patch("services.bia_observer._WATCH_HCAPS_FLUSH_SEC", 1.0), \
         patch("services.bia_observer._WATCH_EVENT_FLUSH_SEC", 1.0), \
         patch("services.bia_observer._watch_event_matches_live_state", side_effect=_watch_event_matches_live_state_for_test):
        await _observe_ws(bia, stats)

    calls = ws.send_json.call_args_list
    event_calls = [c for c in calls if c[0][0][0] == "watch_event"]
    hcap_calls = [c for c in calls if c[0][0][0] == "watch_hcaps"]
    # With time-gated builds (no batch-size shortcut), only the first
    # event seen before the initial build fires gets subscribed,
    # because subsequent events arrive before the 1s flush interval.
    assert len(event_calls) == 1
    assert event_calls[0][0][0] == ["watch_event", [3, "fb", "2026-04-05,1,1"]]
    assert len(hcap_calls) == 1
    assert hcap_calls[0][0][0][1] == [
        [3, "fb", "2026-04-05,1,1"],
    ]
    assert stats._watch_hcaps_keys == {
        (3, "fb", "2026-04-05,1,1"),
    }
    assert stats._watch_event_keys == {
        (3, "fb", "2026-04-05,1,1"),
    }


@pytest.mark.asyncio
async def test_observe_ws_heartbeat_on_timeout():
    """When no message arrives within the heartbeat interval, a ping is sent."""
    event_frame = json.dumps(["event", ["fb", "2026-04-05,1,1"], {"home": "A", "away": "B", "competition_id": 3}])
    ws = _make_fake_ws([])  # no messages at all
    call_idx = 0

    async def _receive_with_timeout():
        nonlocal call_idx
        call_idx += 1
        if call_idx == 1:
            # First call: return an event so subscription logic works
            return _text_msg(event_frame)
        if call_idx <= 3:
            # Next calls: simulate silence (TimeoutError)
            raise asyncio.TimeoutError
        # Then close
        return _close_msg()

    ws.receive = _receive_with_timeout

    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(ws))
    bia = BiaSession(http)
    bia._token = "test-tok"
    bia._login_ts = time.time()

    stats = BiaObserverStats()

    # Patch wait_for to call receive directly (bypassing the real timeout).
    async def _patched_wait_for(coro, *, timeout=None):
        return await coro

    with patch("services.bia_observer._cfg") as mock_cfg, \
         patch("services.bia_observer.asyncio.wait_for", side_effect=_patched_wait_for):
        mock_cfg.BIA_HEARTBEAT_SEC = 0.0  # ensure ping fires every iteration
        mock_cfg.BIA_OBSERVER_LOG_INTERVAL_SEC = 999
        mock_cfg.BIA_SSL_VERIFY = True
        await _observe_ws(bia, stats)

    # A ping should have been sent during the timeout branch
    ping_calls = [c for c in ws.send_json.call_args_list if c[0][0][0] == "ping"]
    assert len(ping_calls) >= 1


@pytest.mark.asyncio
async def test_observe_ws_error_increments_stats():
    """WS connect exception increments stats.errors."""
    http = MagicMock()
    http.ws_connect = MagicMock(side_effect=ConnectionError("boom"))
    bia = BiaSession(http)
    bia._token = "test-tok"
    bia._login_ts = time.time()

    stats = BiaObserverStats()
    await _observe_ws(bia, stats)
    assert stats.errors == 1


# ── run_bia_observer ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_run_observer_disabled():
    """Observer exits immediately when BIA_ENABLED is False."""
    with patch("services.bia_observer._cfg") as mock_cfg:
        mock_cfg.BIA_ENABLED = False
        await run_bia_observer()


@pytest.mark.asyncio
async def test_run_observer_login_fail_backoff():
    """Login failure doubles the backoff delay."""
    iteration = 0

    async def _fake_ensure(*_a, **_kw):
        return None

    async def _fake_sleep(delay):
        nonlocal iteration
        iteration += 1
        if iteration == 1:
            assert delay == 5.0
        elif iteration == 2:
            assert delay == 10.0
        elif iteration >= 3:
            raise asyncio.CancelledError  # break out

    with patch("services.bia_observer._cfg") as mock_cfg, \
         patch("services.bia_observer.aiohttp") as mock_aio, \
         patch("services.bia_observer.asyncio.sleep", side_effect=_fake_sleep):
        mock_cfg.BIA_ENABLED = True
        mock_cfg.BIA_RECONNECT_DELAY_SEC = 5.0
        mock_cfg.BIA_RECONNECT_MAX_DELAY_SEC = 120.0

        mock_http = AsyncMock()
        mock_aio.CookieJar.return_value = MagicMock()
        mock_aio.ClientSession.return_value.__aenter__ = AsyncMock(return_value=mock_http)
        mock_aio.ClientSession.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch.object(BiaSession, "ensure_token", new=_fake_ensure):
            with pytest.raises(asyncio.CancelledError):
                await run_bia_observer()

    assert iteration >= 3


@pytest.mark.asyncio
async def test_run_observer_lifecycle_reconnecting_during_login_fail():
    """During login-fail backoff sleep, lifecycle_state must be 'reconnecting'."""
    import services.bia_observer as obs

    states_during_sleep: list[str] = []

    async def _fake_ensure(*_a, **_kw):
        return None

    async def _fake_sleep(delay):
        states_during_sleep.append(obs._lifecycle_state)
        if len(states_during_sleep) >= 2:
            raise asyncio.CancelledError

    with patch("services.bia_observer._cfg") as mock_cfg, \
         patch("services.bia_observer.aiohttp") as mock_aio, \
         patch("services.bia_observer.asyncio.sleep", side_effect=_fake_sleep):
        mock_cfg.BIA_ENABLED = True
        mock_cfg.BIA_RECONNECT_DELAY_SEC = 5.0
        mock_cfg.BIA_RECONNECT_MAX_DELAY_SEC = 120.0

        mock_http = AsyncMock()
        mock_aio.CookieJar.return_value = MagicMock()
        mock_aio.ClientSession.return_value.__aenter__ = AsyncMock(return_value=mock_http)
        mock_aio.ClientSession.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch.object(BiaSession, "ensure_token", new=_fake_ensure):
            with pytest.raises(asyncio.CancelledError):
                await run_bia_observer()

    assert all(s == "reconnecting" for s in states_during_sleep)
    assert obs._lifecycle_state == "stopped"


@pytest.mark.asyncio
async def test_run_observer_backoff_resets_after_stable_session():
    """Backoff resets to base delay after a session lasting > _MIN_STABLE_SESSION_SEC."""
    delays_seen: list[float] = []
    iteration = 0

    async def _fake_ensure(*_a, **_kw):
        return "tok-ok"

    async def _fake_observe(bia, stats):
        # Simulate a session that lasted long enough
        stats.ws_connect_ts = time.time() - (_MIN_STABLE_SESSION_SEC + 1)

    async def _fake_sleep(delay):
        nonlocal iteration
        delays_seen.append(delay)
        iteration += 1
        if iteration >= 2:
            raise asyncio.CancelledError

    with patch("services.bia_observer._cfg") as mock_cfg, \
         patch("services.bia_observer.aiohttp") as mock_aio, \
         patch("services.bia_observer.asyncio.sleep", side_effect=_fake_sleep), \
         patch("services.bia_observer._observe_ws", side_effect=_fake_observe):
        mock_cfg.BIA_ENABLED = True
        mock_cfg.BIA_RECONNECT_DELAY_SEC = 5.0
        mock_cfg.BIA_RECONNECT_MAX_DELAY_SEC = 120.0

        mock_http = AsyncMock()
        mock_aio.CookieJar.return_value = MagicMock()
        mock_aio.ClientSession.return_value.__aenter__ = AsyncMock(return_value=mock_http)
        mock_aio.ClientSession.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch.object(BiaSession, "ensure_token", new=_fake_ensure):
            with pytest.raises(asyncio.CancelledError):
                await run_bia_observer()

    # After a stable session, delay should be the base value
    assert delays_seen[0] == 5.0


@pytest.mark.asyncio
async def test_run_observer_lifecycle_reconnecting_after_ws_close():
    """After _observe_ws returns (WS closed), lifecycle must be 'reconnecting'
    during the backoff sleep — never 'connected' with stale stats."""
    import services.bia_observer as obs

    lifecycle_during_sleep: list[str] = []
    snapshot_during_sleep: list[dict] = []

    async def _fake_ensure(*_a, **_kw):
        return "tok"

    async def _fake_observe(bia, stats):
        # Simulate a real session that had data
        stats.ws_connect_ts = time.time() - 5
        stats.last_msg_ts = time.time() - 1
        stats.subscribed = True
        stats.events_seen = 10

    async def _fake_sleep(delay):
        lifecycle_during_sleep.append(obs._lifecycle_state)
        from services.bia_observer import bia_observer_snapshot
        snapshot_during_sleep.append(bia_observer_snapshot(now=time.time()))
        raise asyncio.CancelledError

    with patch("services.bia_observer._cfg") as mock_cfg, \
         patch("services.bia_observer.aiohttp") as mock_aio, \
         patch("services.bia_observer.asyncio.sleep", side_effect=_fake_sleep), \
         patch("services.bia_observer._observe_ws", side_effect=_fake_observe):
        mock_cfg.BIA_ENABLED = True
        mock_cfg.BIA_RECONNECT_DELAY_SEC = 5.0
        mock_cfg.BIA_RECONNECT_MAX_DELAY_SEC = 120.0

        mock_http = AsyncMock()
        mock_aio.CookieJar.return_value = MagicMock()
        mock_aio.ClientSession.return_value.__aenter__ = AsyncMock(return_value=mock_http)
        mock_aio.ClientSession.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch.object(BiaSession, "ensure_token", new=_fake_ensure):
            with pytest.raises(asyncio.CancelledError):
                await run_bia_observer()

    assert lifecycle_during_sleep == ["reconnecting"]
    snap = snapshot_during_sleep[0]
    assert snap["connected"] is False, "stale connected must be overridden"
    assert snap["subscribed"] is False, "stale subscribed must be overridden"
    assert snap["state"] == "reconnecting"
    # Counters are preserved for diagnostics
    assert snap["counters"]["events"] == 10


# ── BiaSession async paths ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_login_success():
    """login() returns token on 200 response."""
    resp_data = {"data": {"session_id": "tok-123", "customer_id": 42, "username": "tester"}}

    mock_resp = AsyncMock()
    mock_resp.status = 200
    mock_resp.json = AsyncMock(return_value=resp_data)
    mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_resp.__aexit__ = AsyncMock(return_value=False)

    mock_http = MagicMock()
    mock_http.post = MagicMock(return_value=mock_resp)

    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_LOGIN = "user"
        mock_cfg.BIA_PASSWORD = "pass"
        mock_cfg.BIA_BASE_URL = "https://test.example.com"
        mock_cfg.BIA_SSL_VERIFY = True
        mock_cfg.BIA_SESSION_MAX_AGE_SEC = 3600.0

        bia = BiaSession(mock_http)
        token = await bia.login()

    assert token == "tok-123"
    assert bia.token == "tok-123"
    assert not bia.is_expired


@pytest.mark.asyncio
async def test_login_http_error():
    """login() returns None on non-200 status."""
    mock_resp = AsyncMock()
    mock_resp.status = 401
    mock_resp.text = AsyncMock(return_value="Unauthorized")
    mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_resp.__aexit__ = AsyncMock(return_value=False)

    mock_http = MagicMock()
    mock_http.post = MagicMock(return_value=mock_resp)

    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_LOGIN = "user"
        mock_cfg.BIA_PASSWORD = "pass"
        mock_cfg.BIA_BASE_URL = "https://test.example.com"
        mock_cfg.BIA_SSL_VERIFY = True
        mock_cfg.BIA_SESSION_MAX_AGE_SEC = 3600.0

        bia = BiaSession(mock_http)
        token = await bia.login()

    assert token is None


@pytest.mark.asyncio
async def test_login_no_credentials():
    """login() returns None when credentials are empty."""
    mock_http = MagicMock()

    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_LOGIN = ""
        mock_cfg.BIA_PASSWORD = ""
        mock_cfg.BIA_SSL_VERIFY = True
        mock_cfg.BIA_SESSION_MAX_AGE_SEC = 3600.0

        bia = BiaSession(mock_http)
        token = await bia.login()

    assert token is None
    # No HTTP call should have been made
    mock_http.post.assert_not_called()


@pytest.mark.asyncio
async def test_login_exception():
    """login() returns None on network exception."""
    mock_http = MagicMock()
    mock_http.post = MagicMock(side_effect=aiohttp.ClientError("fail"))

    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_LOGIN = "user"
        mock_cfg.BIA_PASSWORD = "pass"
        mock_cfg.BIA_BASE_URL = "https://test.example.com"
        mock_cfg.BIA_SSL_VERIFY = True
        mock_cfg.BIA_SESSION_MAX_AGE_SEC = 3600.0

        bia = BiaSession(mock_http)
        token = await bia.login()

    assert token is None


@pytest.mark.asyncio
async def test_verify_success():
    """verify() returns True on 200 response."""
    mock_resp = AsyncMock()
    mock_resp.status = 200
    mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_resp.__aexit__ = AsyncMock(return_value=False)

    mock_http = MagicMock()
    mock_http.get = MagicMock(return_value=mock_resp)

    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_BASE_URL = "https://test.example.com"
        mock_cfg.BIA_SSL_VERIFY = True
        mock_cfg.BIA_SESSION_MAX_AGE_SEC = 3600.0

        bia = BiaSession(mock_http)
        bia._token = "tok-abc"
        bia._login_ts = time.time()
        result = await bia.verify()

    assert result is True


@pytest.mark.asyncio
async def test_verify_no_token():
    """verify() returns False when no token set."""
    mock_http = MagicMock()

    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_SSL_VERIFY = True
        mock_cfg.BIA_SESSION_MAX_AGE_SEC = 3600.0

        bia = BiaSession(mock_http)
        result = await bia.verify()

    assert result is False


@pytest.mark.asyncio
async def test_verify_http_failure():
    """verify() returns False on non-200."""
    mock_resp = AsyncMock()
    mock_resp.status = 401
    mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_resp.__aexit__ = AsyncMock(return_value=False)

    mock_http = MagicMock()
    mock_http.get = MagicMock(return_value=mock_resp)

    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_BASE_URL = "https://test.example.com"
        mock_cfg.BIA_SSL_VERIFY = True
        mock_cfg.BIA_SESSION_MAX_AGE_SEC = 3600.0

        bia = BiaSession(mock_http)
        bia._token = "tok-abc"
        result = await bia.verify()

    assert result is False


@pytest.mark.asyncio
async def test_verify_exception():
    """verify() returns False on network error."""
    mock_http = MagicMock()
    mock_http.get = MagicMock(side_effect=aiohttp.ClientError("fail"))

    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_BASE_URL = "https://test.example.com"
        mock_cfg.BIA_SSL_VERIFY = True
        mock_cfg.BIA_SESSION_MAX_AGE_SEC = 3600.0

        bia = BiaSession(mock_http)
        bia._token = "tok-abc"
        result = await bia.verify()

    assert result is False


@pytest.mark.asyncio
async def test_ensure_token_returns_cached():
    """ensure_token() returns cached token when not expired."""
    mock_http = MagicMock()

    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_SSL_VERIFY = True
        mock_cfg.BIA_SESSION_MAX_AGE_SEC = 3600.0

        bia = BiaSession(mock_http)
        bia._token = "cached-tok"
        bia._login_ts = time.time()
        result = await bia.ensure_token()

    assert result == "cached-tok"


@pytest.mark.asyncio
async def test_ensure_token_relogins_when_expired():
    """ensure_token() calls login() when token is expired."""
    mock_resp = AsyncMock()
    mock_resp.status = 200
    mock_resp.json = AsyncMock(return_value={"data": {"session_id": "new-tok"}})
    mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_resp.__aexit__ = AsyncMock(return_value=False)

    mock_http = MagicMock()
    mock_http.post = MagicMock(return_value=mock_resp)

    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_LOGIN = "user"
        mock_cfg.BIA_PASSWORD = "pass"
        mock_cfg.BIA_BASE_URL = "https://test.example.com"
        mock_cfg.BIA_SSL_VERIFY = True
        mock_cfg.BIA_SESSION_MAX_AGE_SEC = 3600.0

        bia = BiaSession(mock_http)
        # Token is expired (no token set)
        result = await bia.ensure_token()

    assert result == "new-tok"


# ── _make_ssl_ctx ───────────────────────────────────────────────────────────


def test_make_ssl_ctx_verify_disabled():
    """Returns an SSL context with verification disabled."""
    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_SSL_VERIFY = False
        ctx = _make_ssl_ctx()
    assert ctx is not None
    import ssl
    assert ctx.check_hostname is False
    assert ctx.verify_mode == ssl.CERT_NONE


def test_make_ssl_ctx_verify_enabled():
    """Returns None when SSL verification is enabled."""
    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_SSL_VERIFY = True
        ctx = _make_ssl_ctx()
    assert ctx is None


# ── BiaSession.http property ────────────────────────────────────────────────


def test_session_http_property():
    """The public http property returns the underlying session."""
    mock_http = MagicMock()
    with patch("services.bia_client._cfg") as mock_cfg:
        mock_cfg.BIA_SSL_VERIFY = True
        bia = BiaSession(mock_http)
    assert bia.http is mock_http


# ── runtime_snapshot / bia_observer_snapshot ─────────────────────────────────


def test_runtime_snapshot_default_stats():
    """Fresh BiaObserverStats produces a complete but zeroed snapshot."""
    s = BiaObserverStats()
    snap = s.runtime_snapshot(now=100.0)
    assert snap["connected"] is False
    assert snap["ws_uptime_sec"] is None
    assert snap["last_msg_age_sec"] is None
    assert snap["subscribed"] is False
    assert snap["counters"]["events"] == 0
    assert snap["errors"] == 0
    assert snap["sports_seen"] == []
    assert snap["discovered_events"] == 0
    assert snap["subscribed_events"] == 0
    assert snap["watch_event_subscribed"] == 0
    assert snap["watch_event_pending"] == 0
    assert snap["match_cache_size"] == 0
    assert snap["miss_cache_size"] == 0


def test_runtime_snapshot_with_active_session():
    """After WS connect and messages, snapshot reflects live values."""
    s = BiaObserverStats()
    s.ws_connect_ts = 50.0
    s.last_msg_ts = 98.0
    s.events_seen = 10
    s.offers_count = 5
    s.pmm_count = 2
    s.info_count = 1
    s.other_count = 3
    s.errors = 1
    s.subscribed = True
    s.sports_seen = {"fb", "tennis"}
    s.discovered_events = [[1, "fb", "x"], [2, "tennis", "y"]]
    s._watch_hcaps_keys = {(1, "fb", "x"), (2, "tennis", "y")}
    s._watch_event_keys = {(1, "fb", "x")}
    s._watch_event_pending = [[3, "fb", "z"]]
    s._matched_event_cache = {("1", "fb", "x"): (101, False)}
    s._missed_event_cache = {("2", "tennis", "y"): 99.0}

    snap = s.runtime_snapshot(now=100.0)
    assert snap["connected"] is True
    assert snap["ws_uptime_sec"] == 50.0
    assert snap["last_msg_age_sec"] == 2.0
    assert snap["subscribed"] is True
    assert snap["counters"]["events"] == 10
    assert snap["counters"]["offers"] == 5
    assert snap["counters"]["pmm"] == 2
    assert snap["counters"]["info"] == 1
    assert snap["counters"]["other"] == 3
    assert snap["errors"] == 1
    assert snap["sports_seen"] == ["fb", "tennis"]
    assert snap["discovered_events"] == 2
    assert snap["subscribed_events"] == 2
    assert snap["watch_event_subscribed"] == 1
    assert snap["watch_event_pending"] == 1
    assert snap["match_cache_size"] == 1
    assert snap["miss_cache_size"] == 1


def test_bia_observer_snapshot_when_disabled():
    """Module-level snapshot returns enabled=False when BIA is off."""
    import services.bia_observer as obs

    orig_enabled = obs._cfg.BIA_ENABLED
    orig_stats = obs._current_stats
    orig_running = obs._observer_running
    orig_lc = obs._lifecycle_state
    try:
        obs._cfg.BIA_ENABLED = False
        obs._current_stats = None
        obs._observer_running = False
        obs._lifecycle_state = "idle"

        from services.bia_observer import bia_observer_snapshot
        snap = bia_observer_snapshot(now=100.0)
        assert snap["enabled"] is False
        assert snap["running"] is False
        assert snap["phase"] == "observer-only"
        assert snap["state"] == "idle"
        assert snap["connected"] is False
    finally:
        obs._cfg.BIA_ENABLED = orig_enabled
        obs._current_stats = orig_stats
        obs._observer_running = orig_running
        obs._lifecycle_state = orig_lc


def test_bia_observer_snapshot_when_running():
    """Module-level snapshot reflects live stats when observer is connected."""
    import services.bia_observer as obs

    orig_enabled = obs._cfg.BIA_ENABLED
    orig_stats = obs._current_stats
    orig_running = obs._observer_running
    orig_lc = obs._lifecycle_state
    try:
        obs._cfg.BIA_ENABLED = True
        obs._observer_running = True
        obs._lifecycle_state = "connected"
        s = BiaObserverStats()
        s.ws_connect_ts = 60.0
        s.last_msg_ts = 99.0
        s.events_seen = 7
        s.subscribed = True
        obs._current_stats = s

        from services.bia_observer import bia_observer_snapshot
        snap = bia_observer_snapshot(now=100.0)
        assert snap["enabled"] is True
        assert snap["running"] is True
        assert snap["state"] == "connected"
        assert snap["connected"] is True
        assert snap["subscribed"] is True
        assert snap["counters"]["events"] == 7
        assert snap["ws_uptime_sec"] == 40.0
        assert snap["last_msg_age_sec"] == 1.0
    finally:
        obs._cfg.BIA_ENABLED = orig_enabled
        obs._current_stats = orig_stats
        obs._observer_running = orig_running
        obs._lifecycle_state = orig_lc


def test_bia_observer_snapshot_stale_during_reconnect():
    """During reconnect/backoff, snapshot must NOT report connected/subscribed
    even when _current_stats still carries stale timestamps from a previous
    WS session — this is the core staleness fix."""
    import services.bia_observer as obs

    orig = (obs._cfg.BIA_ENABLED, obs._current_stats,
            obs._observer_running, obs._lifecycle_state)
    try:
        obs._cfg.BIA_ENABLED = True
        obs._observer_running = True
        obs._lifecycle_state = "reconnecting"
        # Simulate stale stats from a recently-closed WS session
        s = BiaObserverStats()
        s.ws_connect_ts = 50.0
        s.last_msg_ts = 95.0
        s.subscribed = True
        s.events_seen = 42
        obs._current_stats = s

        from services.bia_observer import bia_observer_snapshot
        snap = bia_observer_snapshot(now=100.0)
        assert snap["state"] == "reconnecting"
        assert snap["connected"] is False, "must NOT report connected during backoff"
        assert snap["subscribed"] is False, "must NOT report subscribed during backoff"
        # Counters are still visible (useful for diagnostics)
        assert snap["counters"]["events"] == 42
    finally:
        obs._cfg.BIA_ENABLED, obs._current_stats, \
            obs._observer_running, obs._lifecycle_state = orig


def test_bia_observer_snapshot_stale_during_stopped():
    """After observer stops, snapshot must report stopped/disconnected."""
    import services.bia_observer as obs

    orig = (obs._cfg.BIA_ENABLED, obs._current_stats,
            obs._observer_running, obs._lifecycle_state)
    try:
        obs._cfg.BIA_ENABLED = True
        obs._observer_running = False
        obs._lifecycle_state = "stopped"
        s = BiaObserverStats()
        s.ws_connect_ts = 10.0
        s.last_msg_ts = 80.0
        s.subscribed = True
        obs._current_stats = s

        from services.bia_observer import bia_observer_snapshot
        snap = bia_observer_snapshot(now=100.0)
        assert snap["state"] == "stopped"
        assert snap["running"] is False
        assert snap["connected"] is False
        assert snap["subscribed"] is False
    finally:
        obs._cfg.BIA_ENABLED, obs._current_stats, \
            obs._observer_running, obs._lifecycle_state = orig


def test_bia_observer_snapshot_during_connecting():
    """While connecting (login phase), snapshot shows connecting/disconnected."""
    import services.bia_observer as obs

    orig = (obs._cfg.BIA_ENABLED, obs._current_stats,
            obs._observer_running, obs._lifecycle_state)
    try:
        obs._cfg.BIA_ENABLED = True
        obs._observer_running = True
        obs._lifecycle_state = "connecting"
        obs._current_stats = None

        from services.bia_observer import bia_observer_snapshot
        snap = bia_observer_snapshot(now=100.0)
        assert snap["state"] == "connecting"
        assert snap["connected"] is False
        assert snap["subscribed"] is False
    finally:
        obs._cfg.BIA_ENABLED, obs._current_stats, \
            obs._observer_running, obs._lifecycle_state = orig


def test_lookup_bia_event_for_pid_respects_period_and_swapped(monkeypatch):
    import services.bia_observer as obs
    from state import state

    orig_stats = obs._current_stats
    orig_events = state.events_data
    try:
        stats = BiaObserverStats()
        stats._event_registry[("3", "fb_ht", "2026-04-05,95,47")] = {
            "competition_name": "England Premier League",
            "home": "Arsenal",
            "away": "Chelsea",
        }
        obs._current_stats = stats
        monkeypatch.setattr(
            state,
            "events_data",
            {
                101: {
                    "Home": "Chelsea",
                    "Away": "Arsenal",
                    "SportName": "Soccer",
                }
            },
            raising=False,
        )

        result = lookup_bia_event_for_pid(101, period=1)

        assert result is not None
        assert result["sport_code"] == "fb_ht"
        assert result["period"] == 1
        assert result["event_key"] == "2026-04-05,95,47"
        assert result["swapped"] is True
        assert result["watch_hcaps_subscribed"] is False
        assert result["watch_event_subscribed"] is False
        assert result["watch_event_pending"] is False
    finally:
        obs._current_stats = orig_stats
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_lookup_bia_event_for_pid_matches_alias_variants(monkeypatch):
    import services.bia_observer as obs
    from state import state

    orig_stats = obs._current_stats
    orig_events = state.events_data
    try:
        stats = BiaObserverStats()
        stats._event_registry[("3", "fb", "2026-04-10,95,47")] = {
            "competition_name": "England Premier League",
            "home": "West Ham",
            "away": "Wolverhampton",
        }
        obs._current_stats = stats
        monkeypatch.setattr(
            state,
            "events_data",
            {
                101: {
                    "Home": "West Ham United",
                    "Away": "Wolverhampton Wanderers",
                    "SportName": "Soccer",
                }
            },
            raising=False,
        )

        result = lookup_bia_event_for_pid(101, period=0)

        assert result is not None
        assert result["sport_code"] == "fb"
        assert result["period"] == 0
        assert result["event_key"] == "2026-04-10,95,47"
        assert result["swapped"] is False
    finally:
        obs._current_stats = orig_stats
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_lookup_bia_event_for_pid_rejects_globally_ambiguous_duplicate_fixture(monkeypatch):
    """One BIA ref must not independently prove two identical parser fixtures."""
    from state import state

    stats = BiaObserverStats()
    stats._event_registry[("3", "fb", "2026-08-01,95,47")] = {
        "competition_name": "England Premier League",
        "home": "Arsenal",
        "away": "Chelsea",
    }
    monkeypatch.setattr(state, "events_data", {
        101: {
            "Home": "Arsenal", "Away": "Chelsea", "SportName": "Soccer",
            "LeagueName": "England Premier League",
        },
        202: {
            "Home": "Arsenal", "Away": "Chelsea", "SportName": "Soccer",
            "LeagueName": "England Premier League",
        },
    }, raising=False)

    assert lookup_bia_event_for_pid(101, period=0, stats=stats) is None
    assert lookup_bia_event_for_pid(202, period=0, stats=stats) is None


def test_lookup_bia_event_for_pid_uses_structural_start_to_resolve_duplicate(monkeypatch):
    """Start time may break a name/league tie; odds may not."""
    from state import state

    stats = BiaObserverStats()
    stats._event_registry[("3", "fb", "2026-08-01,95,47")] = {
        "competition_name": "England Premier League",
        "home": "Arsenal",
        "away": "Chelsea",
        "start_ts": "2026-08-01T12:00:00Z",
    }
    monkeypatch.setattr(state, "events_data", {
        101: {
            "Home": "Arsenal", "Away": "Chelsea", "SportName": "Soccer",
            "LeagueName": "England Premier League", "start_time_ms": 1785585600000,
        },
        202: {
            "Home": "Arsenal", "Away": "Chelsea", "SportName": "Soccer",
            "LeagueName": "England Premier League", "start_time_ms": 1785607200000,
        },
    }, raising=False)

    assert lookup_bia_event_for_pid(101, period=0, stats=stats)["event_id"] == 101
    assert lookup_bia_event_for_pid(202, period=0, stats=stats) is None


def test_events_matching_bia_start_snapshots_concurrently_mutated_parser_state(monkeypatch):
    """A parser update during lookup must not raise or join the in-flight scan."""
    import services.bia_observer as obs

    events = {
        101: {"start_time_ms": 1785585600000},
        202: {"start_time_ms": 1785585660000},
    }
    original_parser = obs._structural_timestamp_ms

    def mutating_parser(value):
        if isinstance(value, int) and 303 not in events:
            events[303] = {"start_time_ms": 1785585720000}
        return original_parser(value)

    monkeypatch.setattr(obs, "_structural_timestamp_ms", mutating_parser)

    matched, constrained = obs._events_matching_bia_start(
        events, "2026-08-01T12:00:00Z",
    )

    assert constrained is True
    assert set(matched) == {101, 202}
    assert 303 in events


def test_search_bia_registry_snapshots_concurrently_mutated_registry():
    """HTTP registry search must tolerate the observer adding an event."""
    import services.bia_observer as obs

    stats = BiaObserverStats()

    class MutatingEntry(dict):
        def get(self, key, default=None):
            stats._event_registry[("2", "fb", "new-event")] = {
                "home": "Later Home", "away": "Later Away",
            }
            return super().get(key, default)

    stats._event_registry[("1", "fb", "original-event")] = MutatingEntry({
        "home": "Arsenal", "away": "Chelsea", "competition_name": "Premier League",
    })
    stats._raw_offer_groups[("fb", "original-event")] = {
        "time_ah,tperiod,1", "ah",
    }
    original_stats = obs._current_stats
    obs._current_stats = stats
    try:
        results = obs.search_bia_registry("arsenal")
    finally:
        obs._current_stats = original_stats

    assert [result["event_key"] for result in results] == ["original-event"]
    assert results[0]["raw_offer_groups"] == ["ah", "time_ah,tperiod,1"]
    assert ("2", "fb", "new-event") in stats._event_registry


def test_lookup_bia_event_for_pid_does_not_use_fuzzy_name_similarity(monkeypatch):
    """Proof lookup accepts deterministic aliases, never approximate typos."""
    from state import state

    stats = BiaObserverStats()
    stats._event_registry[("3", "fb", "event")] = {
        "competition_name": "England Premier League",
        "home": "Arsenel",
        "away": "Chelsea",
    }
    monkeypatch.setattr(state, "events_data", {
        101: {
            "Home": "Arsenal", "Away": "Chelsea", "SportName": "Soccer",
            "LeagueName": "England Premier League",
        },
    }, raising=False)

    assert lookup_bia_event_for_pid(101, period=0, stats=stats) is None


def test_lookup_bia_event_for_pid_prefers_root_period_match(monkeypatch):
    import services.bia_observer as obs
    from state import state

    orig_stats = obs._current_stats
    orig_events = state.events_data
    try:
        stats = BiaObserverStats()
        stats._event_registry[("28", "fb_htft", "2026-04-08,187,173")] = {
            "competition_name": "UEFA Champions League",
            "home": "FC Barcelona",
            "away": "Atletico Madrid",
        }
        stats._event_registry[("28", "fb", "2026-04-08,187,173")] = {
            "competition_name": "UEFA Champions League",
            "home": "FC Barcelona",
            "away": "Atletico Madrid",
        }
        obs._current_stats = stats
        monkeypatch.setattr(
            state,
            "events_data",
            {
                101: {
                    "Home": "FC Barcelona",
                    "Away": "Atletico Madrid",
                    "SportName": "Soccer",
                }
            },
            raising=False,
        )

        result = lookup_bia_event_for_pid(101, period=0)

        assert result is not None
        assert result["sport_code"] == "fb"
        assert result["period"] == 0
        assert result["event_key"] == "2026-04-08,187,173"
        assert result["watch_hcaps_subscribed"] is False
        assert result["watch_event_subscribed"] is False
        assert result["watch_event_pending"] is False
    finally:
        obs._current_stats = orig_stats
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_lookup_bia_event_for_pid_reports_subscription_status_with_int_comp_id(monkeypatch):
    import services.bia_observer as obs
    from state import state

    orig_stats = obs._current_stats
    orig_events = state.events_data
    try:
        stats = BiaObserverStats()
        key = (29, "fb", "2026-04-09,234,2")
        stats._event_registry[key] = {
            "competition_name": "UEFA Europa League",
            "home": "Bologna",
            "away": "Aston Villa",
        }
        stats._watch_hcaps_keys.add(key)
        stats._watch_event_pending_keys.add(key)
        obs._current_stats = stats
        monkeypatch.setattr(
            state,
            "events_data",
            {
                1626579734: {
                    "Home": "Bologna",
                    "Away": "Aston Villa",
                    "SportName": "Soccer",
                }
            },
            raising=False,
        )

        result = lookup_bia_event_for_pid(1626579734, period=0)

        assert result is not None
        assert result["watch_hcaps_subscribed"] is True
        assert result["watch_event_subscribed"] is False
        assert result["watch_event_pending"] is True
    finally:
        obs._current_stats = orig_stats
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_lookup_bia_event_for_pid_uses_observer_match_cache_without_registry_rematch(monkeypatch):
    """A live proof lookup must stay bounded after the observer matched the event."""
    from services import bia_event_matcher
    from state import state

    stats = BiaObserverStats()
    key = ("29", "baseball", "2026-08-05,123,456")
    stats._event_registry[key] = {
        "competition_name": "MLB",
        "home": "Detroit Tigers",
        "away": "Seattle Mariners",
        "start_ts": "2026-08-05T19:00:00Z",
    }
    stats._matched_event_cache[key] = (1633099714, True)
    stats._watch_hcaps_keys.add(key)
    monkeypatch.setattr(state, "events_data", {
        1633099714: {
            "Home": "Seattle Mariners",
            "Away": "Detroit Tigers",
            "SportName": "Baseball",
            "LeagueName": "MLB",
            "start_time_ms": 1785956400000,
        },
    }, raising=False)

    def unexpected_full_rematch(*_args, **_kwargs):
        raise AssertionError("proof lookup repeated the full registry match")

    monkeypatch.setattr(bia_event_matcher, "match_bia_event_exact", unexpected_full_rematch)

    result = lookup_bia_event_for_pid(1633099714, period=0, stats=stats)

    assert result is not None
    assert result["sport_code"] == "baseball"
    assert result["swapped"] is True
    assert result["watch_hcaps_subscribed"] is True


def test_reverse_lookup_maps_one_bia_event_to_exact_unit_sibling_without_start(monkeypatch):
    from services import bia_observer as obs
    from state import state

    stats = BiaObserverStats()
    key = ("42", "esports", "2026-08-06,10055676,10082823")
    stats._event_registry[key] = {
        "competition_name": "League of Legends NACL",
        "home": "LoL - NRG",
        "away": "LoL - Cupid eSports",
        "start_ts": "2026-08-06T01:00:00Z",
    }
    monkeypatch.setattr(state, "events_data", {
        101: {
            "Home": "NRG", "Away": "Cupid", "SportName": "E Sports",
            "LeagueName": "League of Legends - NACL",
        },
        202: {
            "Home": "NRG (Kills)", "Away": "Cupid (Kills)", "SportName": "E Sports",
            "LeagueName": "League of Legends - NACL",
        },
    }, raising=False)

    refs = obs._matching_bia_event_refs_for_pid(202, period=0, stats=stats)

    assert len(refs) == 1
    assert refs[0]["event_id"] == 202
    assert refs[0]["event_key"] == key[2]


def test_reverse_lookup_accepts_unique_one_hour_esports_schedule_drift(monkeypatch):
    from services import bia_observer as obs
    from state import state

    stats = BiaObserverStats()
    key = ("42", "esports", "2026-08-06,10055676,10082823")
    stats._event_registry[key] = {
        "competition_name": "League of Legends NACL",
        "home": "LoL - NRG",
        "away": "LoL - Cupid eSports",
        "start_ts": "2026-08-06T01:00:00Z",
    }
    monkeypatch.setattr(state, "events_data", {
        202: {
            "Home": "NRG (Kills)", "Away": "Cupid (Kills)",
            "SportName": "E Sports", "LeagueName": "League of Legends - NACL",
            "start_time_ms": "2026-08-06T00:00:00Z",
        },
    }, raising=False)

    refs = obs._matching_bia_event_refs_for_pid(202, period=0, stats=stats)

    assert len(refs) == 1
    assert refs[0]["event_key"] == key[2]


def test_reverse_lookup_rejects_large_esports_schedule_drift(monkeypatch):
    from services import bia_observer as obs
    from state import state

    stats = BiaObserverStats()
    stats._event_registry[("42", "esports", "event")] = {
        "competition_name": "League of Legends NACL",
        "home": "LoL - NRG", "away": "LoL - Cupid eSports",
        "start_ts": "2026-08-06T03:00:01Z",
    }
    monkeypatch.setattr(state, "events_data", {
        202: {
            "Home": "NRG", "Away": "Cupid", "SportName": "E Sports",
            "LeagueName": "League of Legends - NACL",
            "start_time_ms": "2026-08-06T00:00:00Z",
        },
    }, raising=False)

    assert obs._matching_bia_event_refs_for_pid(202, period=0, stats=stats) == []


def test_reverse_lookup_accepts_unique_delayed_tennis_start(monkeypatch):
    from services import bia_observer as obs
    from state import state

    stats = BiaObserverStats()
    stats._event_registry[("1131", "tennis", "delayed-match")] = {
        "competition_name": "WTA Toronto",
        "home": "Sorana Cirstea", "away": "Maya Joint",
        "start_ts": "2026-08-05T23:38:34Z",
    }
    monkeypatch.setattr(state, "events_data", {
        303: {
            "Home": "Sorana Cirstea", "Away": "Maya Joint",
            "SportName": "Tennis", "LeagueName": "WTA Toronto",
            "start_time_ms": "2026-08-05T20:30:00Z",
        },
    }, raising=False)

    refs = obs._matching_bia_event_refs_for_pid(303, period=0, stats=stats)

    assert len(refs) == 1
    assert refs[0]["event_key"] == "delayed-match"


def test_reverse_lookup_without_parser_start_rejects_repeated_bia_fixtures(monkeypatch):
    from services import bia_observer as obs
    from state import state

    stats = BiaObserverStats()
    for day in ("2026-08-06", "2026-08-07"):
        key = ("42", "baseball", f"{day},100,200")
        stats._event_registry[key] = {
            "competition_name": "MLB",
            "home": "Boston Red Sox",
            "away": "Chicago White Sox",
            "start_ts": f"{day}T19:00:00Z",
        }
    monkeypatch.setattr(state, "events_data", {
        303: {
            "Home": "Boston Red Sox", "Away": "Chicago White Sox",
            "SportName": "Baseball", "LeagueName": "MLB",
        },
    }, raising=False)

    assert obs._matching_bia_event_refs_for_pid(303, period=0, stats=stats) == []


def test_legacy_event_lookup_rejects_persistent_competition_collision(monkeypatch):
    import services.bia_observer as obs

    stats = BiaObserverStats()
    stats._event_registry[("42", "esports", "shared-event")] = {
        "home": "Alpha", "away": "Beta", "competition_name": "First",
    }
    stats._event_registry[("43", "esports", "shared-event")] = {
        "home": "Gamma", "away": "Delta", "competition_name": "Second",
    }
    event_ref = {
        "event_id": 101, "period": 0, "comp_id": "42",
        "sport_code": "esports", "event_key": "shared-event", "swapped": False,
    }
    monkeypatch.setattr(
        obs,
        "_matching_bia_event_refs_for_pid",
        lambda *_args, **_kwargs: [event_ref],
    )

    assert obs.lookup_bia_event_for_pid(101, period=0, stats=stats) is None


def test_lookup_bia_selection_for_pid_returns_exact_esports_map_proof(monkeypatch):
    from state import state

    stats = BiaObserverStats()
    stats._event_registry[("42", "esports", "2026-07-29,10087270,10069346")] = {
        "competition_name": "StarSeries SA Qualifier",
        "home": "MiBR",
        "away": "Fluxo W7M",
    }
    stats._offer_proofs.observe(
        competition_id="42",
        sport_code="esports",
        event_key="2026-07-29,10087270,10069346",
        markets={"time_ml,tmap,1": [None, [["h", 1.53], ["a", 2.84]]]},
    )
    monkeypatch.setattr(state, "events_data", {
        101: {
            "Home": "MiBR", "Away": "Fluxo W7M", "SportName": "Esports",
        },
    }, raising=False)

    with patch(
        "services.bia_event_matcher.match_bia_event_exact",
        return_value=(101, False),
    ):
        result = lookup_bia_selection_for_pid(
            101,
            period=0,
            selection={
                "bet_type": 1, "team_select": 1, "handicap": 0,
                "map_number": 1, "esports_unit": "rounds",
            },
            stats=stats,
        )

    assert result["found"] is True
    assert result["offer_proof"]["raw_offer_group"] == "time_ml,tmap,1"
    assert result["offer_proof"]["bia_bet_type"] == "for,tmap,1,ml,a"


def test_lookup_bia_selection_for_pid_returns_exact_to_qualify_proof():
    stats = BiaObserverStats()
    event_ref = {
        "event_id": 101,
        "period": 0,
        "comp_id": "703",
        "sport_code": "fb",
        "event_key": "2026-08-06,26163,753",
        "swapped": False,
    }
    stats._event_registry[("703", "fb", "2026-08-06,26163,753")] = {
        "competition_name": "Brazil Copa do Brazil",
        "home": "SC Corinthians (SP)",
        "away": "SC Internacional (RS)",
    }
    stats._offer_proofs.observe(
        competition_id="703",
        sport_code="fb",
        event_key="2026-08-06,26163,753",
        markets={"qualify": [None, [["h", 1.91], ["a", 1.97]]]},
    )

    with patch(
        "services.bia_observer._matching_bia_event_refs_for_pid",
        return_value=[event_ref],
    ):
        result = lookup_bia_selection_for_pid(
            101,
            period=0,
            selection={
                "special_type": "to_qualify",
                "contestant": "Home",
                "handicap": 0,
            },
            stats=stats,
        )

    assert result["found"] is True
    assert result["offer_proof"]["raw_offer_group"] == "qualify"
    assert result["offer_proof"]["bia_bet_type"] == "for,qualify,h"


@pytest.mark.asyncio
async def test_public_refresh_lookup_rejects_persistent_competition_collision():
    import services.bia_observer as obs

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    stats._event_registry[("42", "esports", "shared-event")] = {
        "home": "Alpha", "away": "Beta", "competition_name": "First",
    }
    stats._event_registry[("43", "esports", "shared-event")] = {
        "home": "Gamma", "away": "Delta", "competition_name": "Second",
    }
    stats._offer_proofs.observe(
        competition_id="42",
        sport_code="esports",
        event_key="shared-event",
        markets={"time_win,tmap,1,ml": [None, [["a", 2.1]]]},
    )
    event_ref = {
        "event_id": 101, "period": 0, "comp_id": "42",
        "sport_code": "esports", "event_key": "shared-event", "swapped": False,
    }
    obs._current_stats = stats
    obs._lifecycle_state = "connected"

    try:
        with patch(
            "services.bia_observer._matching_bia_event_refs_for_pid",
            return_value=[event_ref],
        ):
            result = await obs.lookup_bia_selection_for_pid_with_refresh(
                101,
                period=0,
                selection={
                    "bet_type": 1, "team_select": 1, "map_number": 1,
                    "esports_unit": "rounds",
                },
                stats=stats,
                wait_sec=0.1,
            )

        assert result["found"] is False
        assert result["error_code"] == "BIA_OFFER_EVENT_COLLISION"
        assert "offer_proof" not in result
        with obs._exact_refresh_lock:
            assert not obs._exact_refresh_requests
    finally:
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


def test_lookup_bia_selection_for_pid_rejects_partially_proven_duplicate(monkeypatch):
    from state import state

    stats = BiaObserverStats()
    keys = [
        ("42", "esports", "event-a"),
        ("43", "esports", "event-b"),
    ]
    for comp_id, sport, event_key in keys:
        stats._event_registry[(comp_id, sport, event_key)] = {
            "competition_name": "StarSeries SA Qualifier",
            "home": "MiBR",
            "away": "Fluxo W7M",
        }
    stats._offer_proofs.observe(
        competition_id="42",
        sport_code="esports",
        event_key="event-a",
        markets={"time_win,tmap,1,ml": [None, [["a", 2.84], ["h", 1.39]]]},
    )
    monkeypatch.setattr(state, "events_data", {
        101: {"Home": "MiBR", "Away": "Fluxo W7M", "SportName": "Esports"},
    }, raising=False)

    with patch(
        "services.bia_event_matcher.match_bia_event_exact",
        return_value=(101, False),
    ):
        result = lookup_bia_selection_for_pid(
            101,
            period=0,
            selection={
                "bet_type": 1, "team_select": 1, "handicap": 0,
                "map_number": 1, "esports_unit": "rounds",
            },
            stats=stats,
        )

    assert result["found"] is False
    assert result["error_code"] == "BIA_EVENT_SELECTION_INCOMPLETE"
    assert result["proven_candidate_count"] == 1
    assert result["incomplete_candidate_count"] == 1


@pytest.mark.asyncio
async def test_exact_refresh_requires_fresh_selected_outcome(monkeypatch):
    import services.bia_observer as obs
    from state import state

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    event_key = "2026-07-28,10055772,10055781"
    stats.discovered_events.append([10008160, "esports", event_key])
    stats._event_registry[("10008160", "esports", event_key)] = {
        "competition_name": "CS2 - StarLadder StarSeries",
        "home": "MiBR Academy",
        "away": "Fluxo",
    }
    monkeypatch.setattr(state, "events_data", {
        1632983548: {
            "Home": "MiBR", "Away": "Fluxo W7M", "SportName": "ESports",
        },
    }, raising=False)
    selection = {
        "bet_type": 1, "team_select": 1, "handicap": 0,
        "map_number": 1, "esports_unit": "rounds",
    }
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    request = obs._enqueue_exact_refresh(
        1632983548, period=0, selection=selection, wait_sec=1.0,
    )
    assert request is not None
    main_ws = SimpleNamespace(send_json=AsyncMock())
    refresh_ws = _make_fake_ws([
        _text_msg(json.dumps([
            "offers_event",
            [999, "esports", "unrelated-event"],
            {"time_win,tmap,1,ml": [None, [["a", 9.99]]]},
        ])),
        _text_msg(json.dumps([
            "offers_event",
            [10008160, "esports", event_key],
            {"time_win,tmap,1,ml": [None, [["a", 2.84], ["h", 1.393]]]},
        ])),
    ], stay_open=True)
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(refresh_ws))
    bia = BiaSession(http)
    bia._token = "test-token"
    bia._login_ts = time.time()

    # A stale proof in the long-lived observer must not satisfy this request.
    stats._offer_proofs.observe(
        competition_id=10008160,
        sport_code="esports",
        event_key=event_key,
        markets={"time_win,tmap,1,ml": [None, [["a", 2.84]]]},
        observed_at=time.time() - 1000,
    )

    try:
        with patch(
            "services.bia_event_matcher.match_bia_event_exact",
            return_value=(1632983548, False),
        ):
            await obs._drain_exact_refresh_requests(main_ws, stats, bia=bia)
            request.candidate_stable_since -= obs._EXACT_REFRESH_SETTLE_SEC + 0.01
            # Unrelated inventory churn must not invalidate this request's
            # unchanged exact candidate set.
            stats._event_registry_changed_at = time.monotonic()
            request.next_match_at = 0.0
            await obs._drain_exact_refresh_requests(main_ws, stats, bia=bia)
            assert obs._exact_refresh_generation_task is not None
            await obs._exact_refresh_generation_task

        sent = [call.args[0] for call in refresh_ws.send_json.await_args_list]
        assert ["watch_event", [10008160, "esports", event_key]] in sent
        assert not any(payload[0] == "watch_hcaps" for payload in sent)
        main_ws.send_json.assert_not_awaited()
        assert request.done.is_set()
        assert request.result["found"] is True
        assert request.result["offer_proof"]["raw_offer_group"] == "time_win,tmap,1,ml"
        assert request.result["offer_proof"]["bia_bet_type"] == "for,tmap,1,ml,a"
    finally:
        await obs._cancel_exact_refresh_generation()
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.parametrize(
    ("market_context", "expected_sport"),
    [("corners", "fb_corn"), ("bookings", "fb_book")],
)
@pytest.mark.asyncio
async def test_exact_refresh_subscribes_only_to_requested_market_context(
    monkeypatch,
    market_context,
    expected_sport,
):
    import services.bia_observer as obs

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    await obs._cancel_exact_refresh_generation()
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    refs = [
        {"comp_id": "1", "sport_code": "fb", "event_key": "same-event", "swapped": False},
        {"comp_id": "1", "sport_code": "fb_corn", "event_key": "same-event", "swapped": False},
        {"comp_id": "1", "sport_code": "fb_book", "event_key": "same-event", "swapped": False},
        {"comp_id": "1", "sport_code": "fb_htft", "event_key": "same-event", "swapped": False},
    ]
    captured: dict[str, object] = {}

    async def fake_generation(_bia, _stats, requests, triples_by_key):
        captured["requests"] = list(requests)
        captured["triples"] = dict(triples_by_key)

    monkeypatch.setattr(obs, "_matching_bia_event_refs_for_pid", lambda *a, **k: list(refs))
    monkeypatch.setattr(obs, "_run_exact_refresh_generation", fake_generation)
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    request = obs._enqueue_exact_refresh(
        1632820971,
        period=0,
        selection={
            "bet_type": 5,
            "team_select": 7,
            "handicap": 3.5,
            "market_context": market_context,
        },
        wait_sec=1.0,
    )
    assert request is not None
    main_ws = SimpleNamespace(send_json=AsyncMock())
    bia = BiaSession(MagicMock())

    try:
        await obs._drain_exact_refresh_requests(main_ws, stats, bia=bia)
        assert request.candidate_keys == {("1", expected_sport, "same-event")}
        request.candidate_stable_since -= obs._EXACT_REFRESH_SETTLE_SEC + 0.01
        request.next_match_at = 0.0
        await obs._drain_exact_refresh_requests(main_ws, stats, bia=bia)
        assert obs._exact_refresh_generation_task is not None
        await obs._exact_refresh_generation_task
        assert set(captured["triples"]) == {("1", expected_sport, "same-event")}
    finally:
        await obs._cancel_exact_refresh_generation()
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.asyncio
async def test_verify_may_return_stale_exact_address_only_when_explicitly_requested(monkeypatch):
    import services.bia_observer as obs

    stats = BiaObserverStats()
    event_ref = {
        "event_id": 1633133757,
        "period": 0,
        "comp_id": "42",
        "competition_id": "42",
        "sport_code": "fb_corn",
        "event_key": "stale-corners-event",
        "swapped": False,
    }
    observed_at = time.time() - 10_000
    stats._offer_proofs.observe(
        competition_id="42",
        sport_code="fb_corn",
        event_key="stale-corners-event",
        markets={"ah": [-16, [["a", 1.877], ["h", 1.98]]]},
        observed_at=observed_at,
    )
    monkeypatch.setattr(
        obs,
        "_matching_bia_event_refs_for_pid",
        lambda *args, **kwargs: [dict(event_ref)],
    )
    selection = {
        "bet_type": 2,
        "team_select": 1,
        "handicap": 4.0,
        "market_context": "corners",
    }

    strict = obs.lookup_bia_selection_for_pid(
        1633133757,
        period=0,
        selection=selection,
        stats=stats,
    )
    candidate = await obs.lookup_bia_selection_for_pid_with_refresh(
        1633133757,
        period=0,
        selection=selection,
        stats=stats,
        allow_stale_candidate=True,
    )

    assert strict["found"] is False
    assert strict["error_code"] == "BIA_OFFER_PROOF_STALE"
    assert candidate["found"] is True
    assert candidate["offer_proof"]["stale_candidate"] is True
    assert candidate["offer_proof"]["bia_bet_type"] == "for,ah,a,-16"


@pytest.mark.asyncio
@pytest.mark.parametrize("batched", [False, True])
async def test_exact_refresh_settles_split_namespaces_as_ambiguous(batched):
    import services.bia_observer as obs

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    event_ref = {
        "event_id": 101, "period": 0, "comp_id": "42",
        "sport_code": "esports", "event_key": "event-a", "swapped": False,
    }
    watch_key = ("42", "esports", "event-a")
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    request = obs._enqueue_exact_refresh(
        101,
        period=0,
        selection={
            "bet_type": 1, "team_select": 1, "map_number": 1,
            "esports_unit": "rounds",
        },
        wait_sec=0.5,
        initial_result={
            "found": False, "event_found": True,
            "error_code": "BIA_OFFER_PROOF_STALE",
        },
    )
    assert request is not None
    request.candidate_keys = {watch_key}
    request.candidate_refs = {watch_key: dict(event_ref)}
    request.candidate_stable_since = time.monotonic() - 1.0
    submessages = [
        [
            "offers_hcap", [42, "esports", "event-a"],
            {"time_win,tmap,1,ml": [None, [["a", 99.99]]]},
        ],
        [
            "offers_event", [42, "esports", "event-a"],
            {"time_win,tmap,1,ml": [None, [["a", 1.01]]]},
        ],
        [
            "offers_event", [42, "esports", "event-a"],
            {"time_ml,tmap,1": [None, [["a", 5000.0]]]},
        ],
    ]
    messages = (
        [_text_msg(json.dumps(submessages))]
        if batched
        else [_text_msg(json.dumps(item)) for item in submessages]
    )
    refresh_ws = _make_fake_ws(messages, stay_open=True)
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(refresh_ws))
    bia = BiaSession(http)
    bia._token = "test-token"
    bia._login_ts = time.time()

    try:
        await obs._run_exact_refresh_generation(
            bia,
            stats,
            [request],
            {watch_key: [42, "esports", "event-a"]},
        )

        assert request.done.is_set()
        assert request.result["found"] is False
        assert request.result["error_code"] == "BIA_OFFER_PROOF_AMBIGUOUS"
        assert "offer_proof" not in request.result
    finally:
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.asyncio
@pytest.mark.parametrize("tombstone_type", ["offers_event", "offers_hcap"])
async def test_exact_refresh_positive_then_tombstone_fails_closed(tombstone_type):
    import services.bia_observer as obs

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    event_ref = {
        "event_id": 101, "period": 0, "comp_id": "42",
        "sport_code": "esports", "event_key": "event-a", "swapped": False,
    }
    watch_key = ("42", "esports", "event-a")
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    request = obs._enqueue_exact_refresh(
        101,
        period=0,
        selection={
            "bet_type": 1, "team_select": 1, "map_number": 1,
            "esports_unit": "rounds",
        },
        wait_sec=0.5,
    )
    assert request is not None
    request.candidate_keys = {watch_key}
    request.candidate_refs = {watch_key: dict(event_ref)}
    request.candidate_stable_since = time.monotonic() - 1.0
    refresh_ws = _make_fake_ws([
        _text_msg(json.dumps([
            "offers_event", [42, "esports", "event-a"],
            {"time_win,tmap,1,ml": [None, [["a", 2.1]]]},
        ])),
        _text_msg(json.dumps([
            tombstone_type, [42, "esports", "event-a"],
            {"time_win,tmap,1,ml": None},
        ])),
    ], stay_open=True)
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(refresh_ws))
    bia = BiaSession(http)
    bia._token = "test-token"
    bia._login_ts = time.time()

    try:
        await obs._run_exact_refresh_generation(
            bia,
            stats,
            [request],
            {watch_key: [42, "esports", "event-a"]},
        )

        assert request.result["found"] is False
        assert request.result["error_code"] == "BIA_OFFER_MARKET_MISSING"
        assert "offer_proof" not in request.result
    finally:
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.asyncio
async def test_exact_refresh_hcap_delta_cannot_establish_proof():
    import services.bia_observer as obs

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    event_ref = {
        "event_id": 101, "period": 0, "comp_id": "42",
        "sport_code": "esports", "event_key": "event-a", "swapped": False,
    }
    watch_key = ("42", "esports", "event-a")
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    request = obs._enqueue_exact_refresh(
        101,
        period=0,
        selection={
            "bet_type": 1, "team_select": 1, "map_number": 1,
            "esports_unit": "rounds",
        },
        wait_sec=0.5,
    )
    assert request is not None
    request.candidate_keys = {watch_key}
    request.candidate_refs = {watch_key: dict(event_ref)}
    request.candidate_stable_since = time.monotonic() - 1.0
    refresh_ws = _make_fake_ws([
        _text_msg(json.dumps([
            "offers_hcap", [42, "esports", "event-a"],
            {"time_win,tmap,1,ml": [None, [["a", 2.1]]]},
        ])),
        _text_msg(json.dumps([
            "offers_event", [42, "esports", "event-a"],
            {"time_win,tmap,2,ml": [None, [["a", 1.01]]]},
        ])),
    ], stay_open=True)
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(refresh_ws))
    bia = BiaSession(http)
    bia._token = "test-token"
    bia._login_ts = time.time()

    try:
        await obs._run_exact_refresh_generation(
            bia,
            stats,
            [request],
            {watch_key: [42, "esports", "event-a"]},
        )

        assert request.result["found"] is False
        assert request.result["error_code"] == "BIA_OFFER_MARKET_MISSING"
        assert "offer_proof" not in request.result
    finally:
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.asyncio
async def test_exact_refresh_includes_late_second_candidate(monkeypatch):
    import services.bia_observer as obs
    from state import state

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    first_key = ("42", "esports", "event-a")
    second_key = ("43", "esports", "event-b")
    stats.discovered_events.append([42, "esports", "event-a"])
    stats._event_registry[first_key] = {
        "competition_name": "StarSeries", "home": "MiBR", "away": "Fluxo W7M",
    }
    monkeypatch.setattr(state, "events_data", {
        101: {"Home": "MiBR", "Away": "Fluxo W7M", "SportName": "Esports"},
    }, raising=False)
    selection = {
        "bet_type": 1, "team_select": 1, "handicap": 0,
        "map_number": 1, "esports_unit": "rounds",
    }
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    request = obs._enqueue_exact_refresh(101, period=0, selection=selection, wait_sec=1.0)
    assert request is not None
    main_ws = SimpleNamespace(send_json=AsyncMock())
    refresh_ws = _make_fake_ws([
        _text_msg(json.dumps([
            "offers_event", [42, "esports", "event-a"],
            {"time_win,tmap,1,ml": [None, [["a", 2.8]]]},
        ])),
        _text_msg(json.dumps([
            "offers_event", [43, "esports", "event-b"],
            {"time_win,tmap,1,ml": [None, [["a", 2.8]]]},
        ])),
    ], stay_open=True)
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(refresh_ws))
    bia = BiaSession(http)
    bia._token = "test-token"
    bia._login_ts = time.time()

    try:
        with patch(
            "services.bia_event_matcher.match_bia_event_exact",
            return_value=(101, False),
        ):
            await obs._drain_exact_refresh_requests(main_ws, stats, bia=bia)

            # A second matching raw event arrives before the settle window.
            stats.discovered_events.append([43, "esports", "event-b"])
            stats._event_registry[second_key] = {
                "competition_name": "StarSeries", "home": "MiBR", "away": "Fluxo W7M",
            }
            stats._event_registry_revision += 1
            stats._event_registry_changed_at = 0.0
            request.next_match_at = 0.0
            await obs._drain_exact_refresh_requests(main_ws, stats, bia=bia)
            request.candidate_stable_since -= obs._EXACT_REFRESH_SETTLE_SEC + 0.01
            request.next_match_at = 0.0
            await obs._drain_exact_refresh_requests(main_ws, stats, bia=bia)
            assert obs._exact_refresh_generation_task is not None
            await obs._exact_refresh_generation_task

        sent = [call.args[0] for call in refresh_ws.send_json.await_args_list]
        assert ["watch_event", [42, "esports", "event-a"]] in sent
        assert ["watch_event", [43, "esports", "event-b"]] in sent
        assert request.done.is_set()
        assert request.result["found"] is False
        assert request.result["error_code"] == "BIA_EVENT_SELECTION_AMBIGUOUS"
    finally:
        await obs._cancel_exact_refresh_generation()
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.asyncio
async def test_exact_refresh_groups_selections_into_one_transport_refresh(monkeypatch):
    import services.bia_observer as obs

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    event_ref = {
        "event_id": 101, "period": 0, "comp_id": "42",
        "sport_code": "esports", "event_key": "event-a", "swapped": False,
    }
    stats.discovered_events.append([42, "esports", "event-a"])
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    first = obs._enqueue_exact_refresh(
        101, period=0,
        selection={"bet_type": 1, "team_select": 0, "map_number": 1, "esports_unit": "rounds"},
        wait_sec=1.0,
    )
    second = obs._enqueue_exact_refresh(
        101, period=0,
        selection={"bet_type": 1, "team_select": 1, "map_number": 1, "esports_unit": "rounds"},
        wait_sec=1.0,
    )
    assert first is not None and second is not None
    main_ws = SimpleNamespace(send_json=AsyncMock())
    refresh_ws = _make_fake_ws([
        _text_msg(json.dumps([
            "offers_event", [42, "esports", "event-a"],
            {"time_win,tmap,1,ml": [None, [["h", 1.8], ["a", 2.1]]]},
        ])),
    ], stay_open=True)
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(refresh_ws))
    bia = BiaSession(http)
    bia._token = "test-token"
    bia._login_ts = time.time()

    try:
        with patch(
            "services.bia_observer._matching_bia_event_refs_for_pid",
            return_value=[event_ref],
        ) as matcher:
            await obs._drain_exact_refresh_requests(main_ws, stats, bia=bia)
            first.candidate_stable_since -= obs._EXACT_REFRESH_SETTLE_SEC + 0.01
            second.candidate_stable_since -= obs._EXACT_REFRESH_SETTLE_SEC + 0.01
            first.next_match_at = 0.0
            second.next_match_at = 0.0
            await obs._drain_exact_refresh_requests(main_ws, stats, bia=bia)
            assert obs._exact_refresh_generation_task is not None
            await obs._exact_refresh_generation_task

        assert matcher.call_count == 2
        sent = [call.args[0] for call in refresh_ws.send_json.await_args_list]
        assert sent.count(["watch_event", [42, "esports", "event-a"]]) == 1
        assert not any(payload[0] == "watch_hcaps" for payload in sent)
        assert first.result["found"] is True
        assert first.result["offer_proof"]["bia_bet_type"] == "for,tmap,1,ml,h"
        assert second.result["found"] is True
        assert second.result["offer_proof"]["bia_bet_type"] == "for,tmap,1,ml,a"
    finally:
        await obs._cancel_exact_refresh_generation()
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.asyncio
async def test_exact_refresh_fresh_socket_close_fails_closed():
    import services.bia_observer as obs

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    event_ref = {
        "event_id": 101,
        "period": 0,
        "comp_id": "42",
        "sport_code": "esports",
        "event_key": "event-a",
        "swapped": False,
    }
    stats.discovered_events.append([42, "esports", "event-a"])
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    request = obs._enqueue_exact_refresh(
        101,
        period=0,
        selection={
            "bet_type": 1,
            "team_select": 1,
            "map_number": 1,
            "esports_unit": "rounds",
        },
        wait_sec=1.0,
    )
    assert request is not None
    main_ws = SimpleNamespace(send_json=AsyncMock())
    refresh_ws = _make_fake_ws([_close_msg()])
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(refresh_ws))
    bia = BiaSession(http)
    bia._token = "test-token"
    bia._login_ts = time.time()

    try:
        with patch(
            "services.bia_observer._matching_bia_event_refs_for_pid",
            return_value=[event_ref],
        ):
            await obs._drain_exact_refresh_requests(main_ws, stats, bia=bia)
            request.candidate_stable_since -= obs._EXACT_REFRESH_SETTLE_SEC + 0.01
            request.next_match_at = 0.0
            await obs._drain_exact_refresh_requests(main_ws, stats, bia=bia)
            assert obs._exact_refresh_generation_task is not None
            await obs._exact_refresh_generation_task

        assert request.done.is_set()
        assert request.result["found"] is False
        assert request.result["error_code"] == "BIA_OFFER_REFRESH_UNAVAILABLE"
        assert request.result["refresh_status"] == "unavailable"
    finally:
        await obs._cancel_exact_refresh_generation()
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.asyncio
async def test_exact_refresh_hanging_connect_is_bounded(monkeypatch):
    import services.bia_observer as obs

    class _HangingWSCtx:
        async def __aenter__(self):
            await asyncio.Event().wait()

        async def __aexit__(self, *exc):
            return None

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    event_ref = {
        "event_id": 101,
        "period": 0,
        "comp_id": "42",
        "sport_code": "esports",
        "event_key": "event-a",
        "swapped": False,
    }
    stats.discovered_events.append([42, "esports", "event-a"])
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    request = obs._enqueue_exact_refresh(
        101,
        period=0,
        selection={
            "bet_type": 1,
            "team_select": 1,
            "map_number": 1,
            "esports_unit": "rounds",
        },
        wait_sec=1.0,
    )
    assert request is not None
    main_ws = SimpleNamespace(send_json=AsyncMock())
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_HangingWSCtx())
    bia = BiaSession(http)
    bia._token = "test-token"
    bia._login_ts = time.time()
    monkeypatch.setattr(obs, "_EXACT_REFRESH_CONNECT_TIMEOUT_SEC", 0.02)

    try:
        with patch(
            "services.bia_observer._matching_bia_event_refs_for_pid",
            return_value=[event_ref],
        ):
            await obs._drain_exact_refresh_requests(main_ws, stats, bia=bia)
            request.candidate_stable_since -= obs._EXACT_REFRESH_SETTLE_SEC + 0.01
            request.next_match_at = 0.0
            await obs._drain_exact_refresh_requests(main_ws, stats, bia=bia)
            task = obs._exact_refresh_generation_task
            assert task is not None
            await asyncio.wait_for(task, timeout=0.30)
            await obs._drain_exact_refresh_requests(main_ws, stats, bia=bia)

        assert request.done.is_set()
        assert request.result["found"] is False
        assert request.result["refresh_status"] == "unavailable"
        assert obs._exact_refresh_generation_task is None
    finally:
        await obs._cancel_exact_refresh_generation()
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.asyncio
async def test_exact_refresh_connect_respects_later_batch_deadline():
    import services.bia_observer as obs

    class _DelayedWSCtx(_FakeWSCtx):
        async def __aenter__(self):
            await asyncio.sleep(0.05)
            return await super().__aenter__()

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    event_ref = {
        "event_id": 101,
        "period": 0,
        "comp_id": "42",
        "sport_code": "esports",
        "event_key": "event-a",
        "swapped": False,
    }
    watch_key = ("42", "esports", "event-a")
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    short = obs._enqueue_exact_refresh(
        101,
        period=0,
        selection={
            "bet_type": 1,
            "team_select": 0,
            "map_number": 1,
            "esports_unit": "rounds",
        },
        wait_sec=1.0,
    )
    long = obs._enqueue_exact_refresh(
        101,
        period=0,
        selection={
            "bet_type": 1,
            "team_select": 1,
            "map_number": 1,
            "esports_unit": "rounds",
        },
        wait_sec=1.0,
    )
    assert short is not None and long is not None
    for request in (short, long):
        request.candidate_keys = {watch_key}
        request.candidate_refs = {watch_key: dict(event_ref)}
        request.candidate_stable_since = time.monotonic() - 1.0
    short.deadline = time.monotonic() + 0.02
    long.deadline = time.monotonic() + 1.0

    refresh_ws = _make_fake_ws([
        _text_msg(json.dumps([
            "offers_event", [42, "esports", "event-a"],
            {"time_win,tmap,1,ml": [None, [["h", 1.8], ["a", 2.1]]]},
        ])),
    ], stay_open=True)
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_DelayedWSCtx(refresh_ws))
    bia = BiaSession(http)
    bia._token = "test-token"
    bia._login_ts = time.time()

    try:
        await obs._run_exact_refresh_generation(
            bia,
            stats,
            [short, long],
            {watch_key: [42, "esports", "event-a"]},
        )

        assert short.result["found"] is False
        assert short.result["refresh_status"] == "timeout"
        assert long.result["found"] is True
        assert long.result["offer_proof"]["bia_bet_type"] == "for,tmap,1,ml,a"
    finally:
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.asyncio
async def test_exact_refresh_uses_still_connected_token_past_local_login_age(monkeypatch):
    import services.bia_observer as obs

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    event_ref = {
        "event_id": 101,
        "period": 0,
        "comp_id": "42",
        "sport_code": "esports",
        "event_key": "event-a",
        "swapped": False,
    }
    watch_key = ("42", "esports", "event-a")
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    request = obs._enqueue_exact_refresh(
        101,
        period=0,
        selection={
            "bet_type": 1,
            "team_select": 1,
            "map_number": 1,
            "esports_unit": "rounds",
        },
        wait_sec=1.0,
    )
    assert request is not None
    request.candidate_keys = {watch_key}
    request.candidate_refs = {watch_key: dict(event_ref)}
    request.candidate_stable_since = time.monotonic() - 1.0
    refresh_ws = _make_fake_ws([
        _text_msg(json.dumps([
            "offers_event", [42, "esports", "event-a"],
            {"time_win,tmap,1,ml": [None, [["a", 2.1]]]},
        ])),
    ], stay_open=True)
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(refresh_ws))
    bia = BiaSession(http)
    bia._token = "old-but-valid-token"
    bia._login_ts = time.time() - 7200
    bia.verify = AsyncMock(return_value=True)

    try:
        await obs._run_exact_refresh_generation(
            bia,
            stats,
            [request],
            {watch_key: [42, "esports", "event-a"]},
        )

        bia.verify.assert_not_awaited()
        assert request.result["found"] is True
        assert request.result["offer_proof"]["bia_bet_type"] == "for,tmap,1,ml,a"
    finally:
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.asyncio
async def test_exact_refresh_hanging_send_does_not_block_next_generation(monkeypatch):
    import services.bia_observer as obs

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    event_ref = {
        "event_id": 101,
        "period": 0,
        "comp_id": "42",
        "sport_code": "esports",
        "event_key": "event-a",
        "swapped": False,
    }
    watch_key = ("42", "esports", "event-a")
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    first = obs._enqueue_exact_refresh(
        101,
        period=0,
        selection={
            "bet_type": 1,
            "team_select": 0,
            "map_number": 1,
            "esports_unit": "rounds",
        },
        wait_sec=1.0,
    )
    assert first is not None
    first.candidate_keys = {watch_key}
    first.candidate_refs = {watch_key: dict(event_ref)}
    first.candidate_stable_since = time.monotonic() - 1.0

    hanging_ws = AsyncMock()

    async def _hang_send(_payload):
        await asyncio.Event().wait()

    hanging_ws.send_json = _hang_send
    normal_ws = _make_fake_ws([
        _text_msg(json.dumps([
            "offers_event", [42, "esports", "event-a"],
            {"time_win,tmap,1,ml": [None, [["a", 2.1]]]},
        ])),
    ], stay_open=True)
    http = MagicMock()
    http.ws_connect = MagicMock(side_effect=[
        _FakeWSCtx(hanging_ws),
        _FakeWSCtx(normal_ws),
    ])
    bia = BiaSession(http)
    bia._token = "test-token"
    bia._login_ts = time.time()
    monkeypatch.setattr(obs, "_EXACT_REFRESH_SEND_TIMEOUT_SEC", 0.02)

    try:
        await asyncio.wait_for(
            obs._run_exact_refresh_generation(
                bia,
                stats,
                [first],
                {watch_key: [42, "esports", "event-a"]},
            ),
            timeout=0.30,
        )
        assert first.result["found"] is False
        assert first.result["refresh_status"] == "unavailable"

        second = obs._enqueue_exact_refresh(
            101,
            period=0,
            selection={
                "bet_type": 1,
                "team_select": 1,
                "map_number": 1,
                "esports_unit": "rounds",
            },
            wait_sec=1.0,
        )
        assert second is not None
        second.candidate_keys = {watch_key}
        second.candidate_refs = {watch_key: dict(event_ref)}
        second.candidate_stable_since = time.monotonic() - 1.0
        await obs._run_exact_refresh_generation(
            bia,
            stats,
            [second],
            {watch_key: [42, "esports", "event-a"]},
        )

        assert http.ws_connect.call_count == 2
        assert second.result["found"] is True
    finally:
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.asyncio
async def test_exact_refresh_restarts_for_candidate_added_during_generation(monkeypatch):
    import services.bia_observer as obs
    from state import state

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    first_key = ("42", "esports", "event-a")
    second_key = ("43", "esports", "event-b")
    stats.discovered_events.append([42, "esports", "event-a"])
    stats._event_registry[first_key] = {
        "competition_name": "StarSeries",
        "home": "MiBR",
        "away": "Fluxo W7M",
    }
    monkeypatch.setattr(state, "events_data", {
        101: {"Home": "MiBR", "Away": "Fluxo W7M", "SportName": "Esports"},
    }, raising=False)
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    request = obs._enqueue_exact_refresh(
        101,
        period=0,
        selection={
            "bet_type": 1,
            "team_select": 1,
            "map_number": 1,
            "esports_unit": "rounds",
        },
        wait_sec=1.0,
    )
    assert request is not None
    main_ws = SimpleNamespace(send_json=AsyncMock())

    first_ws = AsyncMock()
    first_ws.closed = False

    async def _block_receive():
        await asyncio.Event().wait()

    first_ws.receive = _block_receive
    first_ws.send_json = AsyncMock()
    second_ws = _make_fake_ws([
        _text_msg(json.dumps([
            "offers_event", [42, "esports", "event-a"],
            {"time_win,tmap,1,ml": [None, [["a", 2.8]]]},
        ])),
        _text_msg(json.dumps([
            "offers_event", [43, "esports", "event-b"],
            {"time_win,tmap,1,ml": [None, [["a", 2.8]]]},
        ])),
    ], stay_open=True)
    http = MagicMock()
    http.ws_connect = MagicMock(side_effect=[
        _FakeWSCtx(first_ws),
        _FakeWSCtx(second_ws),
    ])
    bia = BiaSession(http)
    bia._token = "test-token"
    bia._login_ts = time.time()

    try:
        with patch(
            "services.bia_event_matcher.match_bia_event_exact",
            return_value=(101, False),
        ):
            await obs._drain_exact_refresh_requests(main_ws, stats, bia=bia)
            request.candidate_stable_since -= obs._EXACT_REFRESH_SETTLE_SEC + 0.01
            request.next_match_at = 0.0
            await obs._drain_exact_refresh_requests(main_ws, stats, bia=bia)
            first_task = obs._exact_refresh_generation_task
            assert first_task is not None

            for _ in range(20):
                if first_ws.send_json.await_count:
                    break
                await asyncio.sleep(0.01)
            assert first_ws.send_json.await_count

            stats.discovered_events.append([43, "esports", "event-b"])
            stats._event_registry[second_key] = {
                "competition_name": "StarSeries",
                "home": "MiBR",
                "away": "Fluxo W7M",
            }
            stats._event_registry_revision += 1
            request.next_match_at = 0.0
            await obs._drain_exact_refresh_requests(main_ws, stats, bia=bia)
            await asyncio.wait_for(first_task, timeout=0.30)

            request.candidate_stable_since -= obs._EXACT_REFRESH_SETTLE_SEC + 0.01
            request.next_match_at = 0.0
            await obs._drain_exact_refresh_requests(main_ws, stats, bia=bia)
            second_task = obs._exact_refresh_generation_task
            assert second_task is not None and second_task is not first_task
            await second_task

        assert http.ws_connect.call_count == 2
        assert request.done.is_set()
        assert request.result["found"] is False
        assert request.result["error_code"] == "BIA_EVENT_SELECTION_AMBIGUOUS"
        second_sent = [call.args[0] for call in second_ws.send_json.await_args_list]
        assert ["watch_event", [42, "esports", "event-a"]] in second_sent
        assert ["watch_event", [43, "esports", "event-b"]] in second_sent
    finally:
        await obs._cancel_exact_refresh_generation()
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.asyncio
async def test_exact_refresh_revalidates_candidate_revision_before_commit(monkeypatch):
    import services.bia_observer as obs

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    first_ref = {
        "event_id": 101, "period": 0, "comp_id": "42",
        "sport_code": "esports", "event_key": "event-a", "swapped": False,
    }
    second_ref = {
        "event_id": 101, "period": 0, "comp_id": "43",
        "sport_code": "esports", "event_key": "event-b", "swapped": False,
    }
    first_key = ("42", "esports", "event-a")
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    request = obs._enqueue_exact_refresh(
        101,
        period=0,
        selection={
            "bet_type": 1, "team_select": 1, "map_number": 1,
            "esports_unit": "rounds",
        },
        wait_sec=0.25,
    )
    assert request is not None
    request.candidate_keys = {first_key}
    request.candidate_refs = {first_key: dict(first_ref)}
    request.candidate_stable_since = time.monotonic() - 1.0
    request.candidate_revision = 0
    refresh_ws = _make_fake_ws([
        _text_msg(json.dumps([
            "offers_event", [42, "esports", "event-a"],
            {"time_win,tmap,1,ml": [None, [["a", 2.1]]]},
        ])),
    ], stay_open=True)
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(refresh_ws))
    bia = BiaSession(http)
    bia._token = "test-token"
    bia._login_ts = time.time()

    async def _learn_late_duplicate():
        await asyncio.sleep(0.05)
        stats._event_registry_revision = 1

    monkeypatch.setattr(
        obs,
        "_matching_bia_event_refs_for_pid",
        lambda *_args, **_kwargs: [first_ref, second_ref],
    )
    learn_task = asyncio.create_task(_learn_late_duplicate())
    try:
        await obs._run_exact_refresh_generation(
            bia,
            stats,
            [request],
            {first_key: [42, "esports", "event-a"]},
        )
        await learn_task

        assert request.result["found"] is False
        assert request.result["refresh_status"] == "timeout"
        assert "offer_proof" not in request.result
    finally:
        if not learn_task.done():
            learn_task.cancel()
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.asyncio
async def test_late_independent_refresh_joins_silent_active_generation():
    import services.bia_observer as obs

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    first_key = ("42", "esports", "event-a")
    second_key = ("43", "esports", "event-b")
    first_ref = {
        "event_id": 101, "period": 0, "comp_id": "42",
        "sport_code": "esports", "event_key": "event-a", "swapped": False,
    }
    second_ref = {
        "event_id": 102, "period": 0, "comp_id": "43",
        "sport_code": "esports", "event_key": "event-b", "swapped": False,
    }
    selection = {
        "bet_type": 1, "team_select": 1, "map_number": 1,
        "esports_unit": "rounds",
    }
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    first = obs._enqueue_exact_refresh(
        101, period=0, selection=selection, wait_sec=0.25,
    )
    assert first is not None
    first.candidate_keys = {first_key}
    first.candidate_refs = {first_key: dict(first_ref)}
    first.candidate_stable_since = time.monotonic() - 1.0
    receive_queue: asyncio.Queue = asyncio.Queue()
    refresh_ws = AsyncMock()
    refresh_ws.closed = False

    async def _receive():
        return await receive_queue.get()

    async def _send(payload):
        if payload == ["watch_event", [43, "esports", "event-b"]]:
            receive_queue.put_nowait(_text_msg(json.dumps([
                "offers_event", [43, "esports", "event-b"],
                {"time_win,tmap,1,ml": [None, [["a", 2.2]]]},
            ])))

    refresh_ws.receive = _receive
    refresh_ws.send_json = AsyncMock(side_effect=_send)
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(refresh_ws))
    bia = BiaSession(http)
    bia._token = "test-token"
    bia._login_ts = time.time()

    async def _enqueue_late():
        await asyncio.sleep(0.05)
        second = obs._enqueue_exact_refresh(
            102, period=0, selection=selection, wait_sec=0.25,
        )
        assert second is not None
        second.candidate_keys = {second_key}
        second.candidate_refs = {second_key: dict(second_ref)}
        second.candidate_stable_since = time.monotonic() - 1.0
        return second

    late_task = asyncio.create_task(_enqueue_late())
    try:
        await obs._run_exact_refresh_generation(
            bia,
            stats,
            [first],
            {first_key: [42, "esports", "event-a"]},
        )
        second = await late_task
        assert first.result["found"] is False
        assert first.result["refresh_status"] == "timeout"
        assert second.result["found"] is True
        assert second.result["offer_proof"]["observed_at"] >= second.sent_wall_at[
            second_key
        ]
        assert http.ws_connect.call_count == 1
        refresh_ws.send_json.assert_any_await(
            ["watch_event", [43, "esports", "event-b"]]
        )
    finally:
        if not late_task.done():
            late_task.cancel()
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.asyncio
@pytest.mark.parametrize("reverse", [False, True])
async def test_competition_collision_fails_closed_symmetrically(reverse):
    import services.bia_observer as obs

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    specs = [
        (101, "42", 2.1),
        (102, "43", 2.2),
    ]
    if reverse:
        specs.reverse()
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    requests = []
    triples = {}
    for event_id, comp_id, _price in specs:
        watch_key = (comp_id, "esports", "shared-event")
        event_ref = {
            "event_id": event_id, "period": 0, "comp_id": comp_id,
            "sport_code": "esports", "event_key": "shared-event",
            "swapped": False,
        }
        request = obs._enqueue_exact_refresh(
            event_id,
            period=0,
            selection={
                "bet_type": 1, "team_select": 1, "map_number": 1,
                "esports_unit": "rounds",
            },
            wait_sec=0.7,
        )
        assert request is not None
        request.candidate_keys = {watch_key}
        request.candidate_refs = {watch_key: dict(event_ref)}
        request.candidate_stable_since = time.monotonic() - 1.0
        requests.append(request)
        triples[watch_key] = [int(comp_id), "esports", "shared-event"]

    http = MagicMock()
    http.ws_connect = MagicMock()
    bia = BiaSession(http)
    bia._token = "test-token"
    bia._login_ts = time.time()

    try:
        await obs._run_exact_refresh_generation(
            bia, stats, requests, triples,
        )

        assert http.ws_connect.call_count == 0
        assert all(request.result["found"] is False for request in requests)
        for request in requests:
            assert request.result["error_code"] == "BIA_OFFER_EVENT_COLLISION"
            assert "offer_proof" not in request.result
    finally:
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.asyncio
@pytest.mark.parametrize("foreign_kind", ["offers_event", "offers_hcap"])
@pytest.mark.parametrize("foreign_first", [False, True])
async def test_auxiliary_foreign_competition_frame_invalidates_exact_proof(
    foreign_kind,
    foreign_first,
):
    import services.bia_observer as obs

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    watch_key = ("42", "esports", "shared-event")
    event_ref = {
        "event_id": 101, "period": 0, "comp_id": "42",
        "sport_code": "esports", "event_key": "shared-event",
        "swapped": False,
    }
    stats._event_registry[watch_key] = {
        "home": "Alpha", "away": "Beta", "competition_name": "First",
    }
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    request = obs._enqueue_exact_refresh(
        101,
        period=0,
        selection={
            "bet_type": 1, "team_select": 1, "map_number": 1,
            "esports_unit": "rounds",
        },
        wait_sec=0.7,
    )
    assert request is not None
    request.candidate_keys = {watch_key}
    request.candidate_refs = {watch_key: dict(event_ref)}
    request.candidate_stable_since = time.monotonic() - 1.0
    target_frame = _text_msg(json.dumps([
        "offers_event", [42, "esports", "shared-event"],
        {"time_win,tmap,1,ml": [None, [["a", 2.1]]]},
    ]))
    foreign_frame = _text_msg(json.dumps([
        foreign_kind, [43, "esports", "shared-event"],
        {"time_win,tmap,1,ml": [None, [["a", 9.9]]]},
    ]))
    frames = [foreign_frame, target_frame] if foreign_first else [
        target_frame, foreign_frame,
    ]
    refresh_ws = _make_fake_ws(frames, stay_open=True)
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(refresh_ws))
    bia = BiaSession(http)
    bia._token = "test-token"
    bia._login_ts = time.time()

    try:
        await obs._run_exact_refresh_generation(
            bia,
            stats,
            [request],
            {watch_key: [42, "esports", "shared-event"]},
        )

        identity = ("esports", "shared-event")
        assert request.result["found"] is False
        assert request.result["error_code"] == "BIA_OFFER_EVENT_COLLISION"
        assert "offer_proof" not in request.result
        assert identity in stats._observed_offer_collision_identities
        assert identity in obs._observer_registry_collision_identities(stats)
    finally:
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


def test_expired_refresh_cannot_reuse_positive_cached_before_collision():
    import services.bia_observer as obs

    stats = BiaObserverStats()
    watch_key = ("42", "esports", "shared-event")
    request = obs._ExactRefreshRequest(
        key=(101, 0, "deadline-edge"),
        event_id=101,
        period=0,
        selection={
            "bet_type": 1, "team_select": 1, "map_number": 1,
            "esports_unit": "rounds",
        },
        deadline=time.monotonic() + 1.0,
    )
    request.candidate_keys = {watch_key}
    request.candidate_refs = {watch_key: {
        "event_id": 101, "period": 0, "comp_id": "42",
        "sport_code": "esports", "event_key": "shared-event",
        "swapped": False,
    }}
    request.candidate_stable_since = time.monotonic() - 1.0
    request.sent_keys = {watch_key}
    request.sent_wall_at = {watch_key: time.time() - 1.0}
    registry = obs.BiaOfferProofRegistry()
    obs._record_fresh_exact_offer(
        registry,
        stats,
        [request],
        [42, "esports", "shared-event"],
        {"time_win,tmap,1,ml": [None, [["a", 2.1]]]},
        rich=True,
    )
    request.fresh_offer_seen_at[watch_key] -= obs._EXACT_REFRESH_SETTLE_SEC + 0.01

    cached = obs._fresh_exact_refresh_result(request, stats)
    assert cached is not None and cached["found"] is True
    assert request.collision_checked_revision == stats._event_registry_revision
    assert request.collision_detected is False

    request.deadline = time.monotonic() - 0.01
    obs._record_fresh_exact_offer(
        registry,
        stats,
        [request],
        [43, "esports", "shared-event"],
        {"time_win,tmap,1,ml": [None, [["a", 9.9]]]},
        rich=False,
    )

    assert request.collision_detected is True
    assert ("esports", "shared-event") in (
        stats._observed_offer_collision_identities
    )
    assert obs._fresh_exact_refresh_result(request, stats) is None


@pytest.mark.parametrize("foreign_kind", ["offers_event", "offers_hcap"])
def test_auxiliary_collision_persists_after_request_completion(foreign_kind):
    import services.bia_observer as obs

    stats = BiaObserverStats()
    watch_key = ("42", "esports", "shared-event")
    request = obs._ExactRefreshRequest(
        key=(101, 0, "completed-collision"),
        event_id=101,
        period=0,
        selection={
            "bet_type": 1, "team_select": 1, "map_number": 1,
            "esports_unit": "rounds",
        },
        deadline=time.monotonic() + 1.0,
    )
    request.candidate_keys = {watch_key}
    request.candidate_refs = {watch_key: {
        "event_id": 101, "period": 0, "comp_id": "42",
        "sport_code": "esports", "event_key": "shared-event",
        "swapped": False,
    }}
    request.sent_keys = {watch_key}
    request.sent_wall_at = {watch_key: time.time() - 1.0}
    registry = obs.BiaOfferProofRegistry()
    obs._record_fresh_exact_offer(
        registry,
        stats,
        [request],
        [42, "esports", "shared-event"],
        {"time_win,tmap,1,ml": [None, [["a", 2.1]]]},
        rich=True,
    )
    request.done.set()

    obs._record_fresh_exact_offer(
        registry,
        stats,
        [request],
        [43, "esports", "shared-event"],
        {"time_win,tmap,1,ml": [None, [["a", 9.9]]]},
        rich=foreign_kind == "offers_event",
    )

    identity = ("esports", "shared-event")
    assert identity in stats._observed_offer_collision_identities
    assert identity in obs._observer_registry_collision_identities(stats)


def test_registry_collision_before_late_target_is_persistent():
    import services.bia_observer as obs

    stats = BiaObserverStats()
    registry = obs.BiaOfferProofRegistry()
    obs._record_fresh_exact_offer(
        registry,
        stats,
        [],
        [43, "esports", "shared-event"],
        {"time_win,tmap,1,ml": [None, [["a", 9.9]]]},
        rich=True,
    )
    watch_key = ("42", "esports", "shared-event")
    request = obs._ExactRefreshRequest(
        key=(101, 0, "late-target"),
        event_id=101,
        period=0,
        selection={
            "bet_type": 1, "team_select": 1, "map_number": 1,
            "esports_unit": "rounds",
        },
        deadline=time.monotonic() + 1.0,
    )
    request.candidate_keys = {watch_key}
    request.candidate_refs = {watch_key: {
        "event_id": 101, "period": 0, "comp_id": "42",
        "sport_code": "esports", "event_key": "shared-event",
        "swapped": False,
    }}
    request.sent_keys = {watch_key}
    request.sent_wall_at = {watch_key: time.time() - 1.0}

    obs._record_fresh_exact_offer(
        registry,
        stats,
        [request],
        [42, "esports", "shared-event"],
        {"time_win,tmap,1,ml": [None, [["a", 2.1]]]},
        rich=True,
    )

    identity = ("esports", "shared-event")
    assert request.collision_detected is True
    assert identity in stats._observed_offer_collision_identities
    assert identity in obs._observer_registry_collision_identities(stats)


def test_foreign_header_against_unsent_candidate_is_persistent():
    import services.bia_observer as obs

    stats = BiaObserverStats()
    request = obs._ExactRefreshRequest(
        key=(101, 0, "candidate-switch"),
        event_id=101,
        period=0,
        selection={},
        deadline=time.monotonic() + 1.0,
    )
    request.candidate_keys = {("42", "esports", "shared-event")}

    obs._record_fresh_exact_offer(
        obs.BiaOfferProofRegistry(),
        stats,
        [request],
        [43, "esports", "shared-event"],
        {},
        rich=False,
    )

    identity = ("esports", "shared-event")
    assert request.sent_keys == set()
    assert request.collision_detected is True
    assert identity in stats._observed_offer_collision_identities
    assert identity in obs._observer_registry_collision_identities(stats)


@pytest.mark.asyncio
async def test_later_request_sees_persistent_inventory_competition_collision():
    import services.bia_observer as obs

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    stats._event_registry[("42", "esports", "shared-event")] = {
        "home": "Alpha", "away": "Beta", "competition_name": "First",
    }
    first_key = ("42", "esports", "shared-event")
    first_ref = {
        "event_id": 101, "period": 0, "comp_id": "42",
        "sport_code": "esports", "event_key": "shared-event", "swapped": False,
    }
    selection = {
        "bet_type": 1, "team_select": 1, "map_number": 1,
        "esports_unit": "rounds",
    }
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    first = obs._enqueue_exact_refresh(
        101, period=0, selection=selection, wait_sec=0.7,
    )
    assert first is not None
    first.candidate_keys = {first_key}
    first.candidate_refs = {first_key: dict(first_ref)}
    first.candidate_stable_since = time.monotonic() - 1.0
    first_ws = _make_fake_ws([
        _text_msg(json.dumps([
            "offers_event", [42, "esports", "shared-event"],
            {"time_win,tmap,1,ml": [None, [["a", 2.1]]]},
        ])),
    ], stay_open=True)
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(first_ws))
    bia = BiaSession(http)
    bia._token = "test-token"
    bia._login_ts = time.time()

    try:
        await obs._run_exact_refresh_generation(
            bia,
            stats,
            [first],
            {first_key: [42, "esports", "shared-event"]},
        )
        assert first.result["found"] is True

        # A later inventory frame reveals that PMM's sport+event_id coordinate
        # is shared by another competition.  A sequential request must not be
        # allowed to look unique merely because the first request is gone.
        stats._event_registry[("43", "esports", "shared-event")] = {
            "home": "Gamma", "away": "Delta", "competition_name": "Second",
        }
        stats._event_registry_revision += 1
        second_key = ("43", "esports", "shared-event")
        second = obs._enqueue_exact_refresh(
            102, period=0, selection=selection, wait_sec=0.7,
        )
        assert second is not None
        second.candidate_keys = {second_key}
        second.candidate_refs = {second_key: {
            "event_id": 102, "period": 0, "comp_id": "43",
            "sport_code": "esports", "event_key": "shared-event",
            "swapped": False,
        }}
        second.candidate_stable_since = time.monotonic() - 1.0
        await obs._run_exact_refresh_generation(
            bia,
            stats,
            [second],
            {second_key: [43, "esports", "shared-event"]},
        )

        assert second.result["found"] is False
        assert second.result["error_code"] == "BIA_OFFER_EVENT_COLLISION"
        assert http.ws_connect.call_count == 1
    finally:
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.asyncio
async def test_late_competition_collision_fails_both_requests_closed():
    import services.bia_observer as obs

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    first_key = ("42", "esports", "shared-event")
    second_key = ("43", "esports", "shared-event")
    first_ref = {
        "event_id": 101, "period": 0, "comp_id": "42",
        "sport_code": "esports", "event_key": "shared-event", "swapped": False,
    }
    second_ref = {
        "event_id": 102, "period": 0, "comp_id": "43",
        "sport_code": "esports", "event_key": "shared-event", "swapped": False,
    }
    selection = {
        "bet_type": 1, "team_select": 1, "map_number": 1,
        "esports_unit": "rounds",
    }
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    first = obs._enqueue_exact_refresh(
        101, period=0, selection=selection, wait_sec=0.25,
    )
    assert first is not None
    first.candidate_keys = {first_key}
    first.candidate_refs = {first_key: dict(first_ref)}
    first.candidate_stable_since = time.monotonic() - 1.0
    first_ws = AsyncMock()
    first_ws.closed = False

    async def _block_receive():
        await asyncio.Event().wait()

    first_ws.receive = _block_receive
    first_ws.send_json = AsyncMock()
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(first_ws))
    bia = BiaSession(http)
    bia._token = "test-token"
    bia._login_ts = time.time()

    async def _enqueue_late():
        await asyncio.sleep(0.05)
        second = obs._enqueue_exact_refresh(
            102, period=0, selection=selection, wait_sec=0.25,
        )
        assert second is not None
        second.candidate_keys = {second_key}
        second.candidate_refs = {second_key: dict(second_ref)}
        second.candidate_stable_since = time.monotonic() - 1.0
        return second

    late_task = asyncio.create_task(_enqueue_late())
    try:
        await obs._run_exact_refresh_generation(
            bia,
            stats,
            [first],
            {first_key: [42, "esports", "shared-event"]},
        )
        second = await late_task

        assert first.result["found"] is False
        assert first.result["error_code"] == "BIA_OFFER_EVENT_COLLISION"
        assert second.result["found"] is False
        assert second.result["error_code"] == "BIA_OFFER_EVENT_COLLISION"
        assert http.ws_connect.call_count == 1
    finally:
        if not late_task.done():
            late_task.cancel()
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.asyncio
async def test_late_same_event_refresh_rolls_to_new_generation():
    import services.bia_observer as obs

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    watch_key = ("42", "esports", "event-a")
    event_ref = {
        "event_id": 101, "period": 0, "comp_id": "42",
        "sport_code": "esports", "event_key": "event-a", "swapped": False,
    }
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    first = obs._enqueue_exact_refresh(
        101,
        period=0,
        selection={
            "bet_type": 1, "team_select": 1, "map_number": 1,
            "esports_unit": "rounds",
        },
        wait_sec=0.25,
    )
    assert first is not None
    first.candidate_keys = {watch_key}
    first.candidate_refs = {watch_key: dict(event_ref)}
    first.candidate_stable_since = time.monotonic() - 1.0
    first_ws = AsyncMock()
    first_ws.closed = False

    async def _block_receive():
        await asyncio.Event().wait()

    first_ws.receive = _block_receive
    first_ws.send_json = AsyncMock()
    second_ws = _make_fake_ws([
        _text_msg(json.dumps([
            "offers_event", [42, "esports", "event-a"],
            {"time_win,tmap,1,ml": [None, [["h", 1.8], ["a", 2.1]]]},
        ])),
    ], stay_open=True)
    http = MagicMock()
    http.ws_connect = MagicMock(side_effect=[
        _FakeWSCtx(first_ws),
        _FakeWSCtx(second_ws),
    ])
    bia = BiaSession(http)
    bia._token = "test-token"
    bia._login_ts = time.time()

    async def _enqueue_late():
        await asyncio.sleep(0.05)
        second = obs._enqueue_exact_refresh(
            101,
            period=0,
            selection={
                "bet_type": 1, "team_select": 0, "map_number": 1,
                "esports_unit": "rounds",
            },
            wait_sec=0.25,
        )
        assert second is not None
        second.candidate_keys = {watch_key}
        second.candidate_refs = {watch_key: dict(event_ref)}
        second.candidate_stable_since = time.monotonic() - 1.0
        return second

    late_task = asyncio.create_task(_enqueue_late())
    try:
        await obs._run_exact_refresh_generation(
            bia,
            stats,
            [first],
            {watch_key: [42, "esports", "event-a"]},
        )
        second = await late_task
        assert not first.done.is_set()
        assert not second.done.is_set()
        assert not first.sent_keys

        await obs._run_exact_refresh_generation(
            bia,
            stats,
            [first, second],
            {watch_key: [42, "esports", "event-a"]},
        )

        assert first.result["found"] is True
        assert second.result["found"] is True
        assert http.ws_connect.call_count == 2
        second_ws.send_json.assert_any_await(
            ["watch_event", [42, "esports", "event-a"]]
        )
    finally:
        if not late_task.done():
            late_task.cancel()
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.asyncio
async def test_superseded_candidate_set_discards_prior_generation_proof():
    import services.bia_observer as obs

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    first_key = ("42", "esports", "event-a")
    second_key = ("43", "esports", "event-b")
    first_ref = {
        "event_id": 101, "period": 0, "comp_id": "42",
        "sport_code": "esports", "event_key": "event-a", "swapped": False,
    }
    second_ref = {
        "event_id": 101, "period": 0, "comp_id": "43",
        "sport_code": "esports", "event_key": "event-b", "swapped": False,
    }
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    request = obs._enqueue_exact_refresh(
        101,
        period=0,
        selection={
            "bet_type": 1, "team_select": 1, "map_number": 1,
            "esports_unit": "rounds",
        },
        wait_sec=0.7,
    )
    assert request is not None
    request.candidate_keys = {first_key}
    request.candidate_refs = {first_key: dict(first_ref)}
    request.candidate_stable_since = time.monotonic() - 1.0
    first_ws = _make_fake_ws([
        _text_msg(json.dumps([
            "offers_event", [42, "esports", "event-a"],
            {"time_win,tmap,1,ml": [None, [["a", 2.1]]]},
        ])),
    ], stay_open=True)
    second_ws = _make_fake_ws([
        _text_msg(json.dumps([
            "offers_event", [42, "esports", "event-a"],
            {"time_win,tmap,1,ml": None},
        ])),
    ], stay_open=True)
    http = MagicMock()
    http.ws_connect = MagicMock(side_effect=[
        _FakeWSCtx(first_ws),
        _FakeWSCtx(second_ws),
    ])
    bia = BiaSession(http)
    bia._token = "test-token"
    bia._login_ts = time.time()

    async def _add_candidate():
        await asyncio.sleep(0.05)
        request.candidate_keys = {first_key, second_key}
        request.candidate_refs = {
            first_key: dict(first_ref), second_key: dict(second_ref),
        }
        request.candidate_stable_since = time.monotonic()

    add_task = asyncio.create_task(_add_candidate())
    try:
        await obs._run_exact_refresh_generation(
            bia,
            stats,
            [request],
            {first_key: [42, "esports", "event-a"]},
        )
        await add_task
        assert not request.done.is_set()
        assert not request.sent_keys
        assert not request.fresh_proofs

        # Inventory correction removes the late duplicate.  The original A
        # proof must still be reacquired on a new isolated connection.
        request.candidate_keys = {first_key}
        request.candidate_refs = {first_key: dict(first_ref)}
        request.candidate_stable_since = time.monotonic() - 1.0
        await obs._run_exact_refresh_generation(
            bia,
            stats,
            [request],
            {first_key: [42, "esports", "event-a"]},
        )

        second_ws.send_json.assert_any_await(
            ["watch_event", [42, "esports", "event-a"]]
        )
        assert request.result["found"] is False
        assert request.result["error_code"] == "BIA_OFFER_MARKET_MISSING"
    finally:
        if not add_task.done():
            add_task.cancel()
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.asyncio
async def test_repeated_exact_refresh_uses_a_new_ws_generation():
    import services.bia_observer as obs

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    stats = BiaObserverStats()
    event_ref = {
        "event_id": 101,
        "period": 0,
        "comp_id": "42",
        "sport_code": "esports",
        "event_key": "event-a",
        "swapped": False,
    }
    stats.discovered_events.append([42, "esports", "event-a"])
    obs._current_stats = stats
    obs._lifecycle_state = "connected"
    frame = _text_msg(json.dumps([
        "offers_event",
        [42, "esports", "event-a"],
        {"time_win,tmap,1,ml": [None, [["a", 2.1]]]},
    ]))
    first_ws = _make_fake_ws([frame], stay_open=True)
    second_ws = _make_fake_ws([frame], stay_open=True)
    http = MagicMock()
    http.ws_connect = MagicMock(side_effect=[
        _FakeWSCtx(first_ws),
        _FakeWSCtx(second_ws),
    ])
    bia = BiaSession(http)
    bia._token = "test-token"
    bia._login_ts = time.time()
    main_ws = SimpleNamespace(send_json=AsyncMock())
    selection = {
        "bet_type": 1,
        "team_select": 1,
        "map_number": 1,
        "esports_unit": "rounds",
    }

    async def _run_one_request():
        request = obs._enqueue_exact_refresh(
            101,
            period=0,
            selection=selection,
            wait_sec=1.0,
        )
        assert request is not None
        await obs._drain_exact_refresh_requests(main_ws, stats, bia=bia)
        request.candidate_stable_since -= obs._EXACT_REFRESH_SETTLE_SEC + 0.01
        request.next_match_at = 0.0
        await obs._drain_exact_refresh_requests(main_ws, stats, bia=bia)
        assert obs._exact_refresh_generation_task is not None
        await obs._exact_refresh_generation_task
        assert request.result["found"] is True
        return request

    try:
        with patch(
            "services.bia_observer._matching_bia_event_refs_for_pid",
            return_value=[event_ref],
        ):
            first = await _run_one_request()
            second = await _run_one_request()

        assert http.ws_connect.call_count == 2
        assert first.sent_wall_at[("42", "esports", "event-a")] <= second.sent_wall_at[
            ("42", "esports", "event-a")
        ]
        first_ws.send_json.assert_any_await(
            ["watch_event", [42, "esports", "event-a"]]
        )
        second_ws.send_json.assert_any_await(
            ["watch_event", [42, "esports", "event-a"]]
        )
    finally:
        await obs._cancel_exact_refresh_generation()
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


@pytest.mark.asyncio
async def test_early_coalesced_waiter_does_not_finish_shared_refresh():
    import services.bia_observer as obs

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
        obs._exact_refresh_negative_until.clear()
    obs._current_stats = BiaObserverStats()
    obs._lifecycle_state = "connected"
    selection = {
        "bet_type": 1,
        "team_select": 1,
        "map_number": 1,
        "esports_unit": "rounds",
    }
    initial = {
        "found": False,
        "event_found": True,
        "event_id": 101,
        "period": 0,
        "error_code": "BIA_OFFER_PROOF_STALE",
    }

    try:
        with patch(
            "services.bia_observer.lookup_bia_selection_for_pid",
            return_value=initial,
        ):
            early_task = asyncio.create_task(
                obs.lookup_bia_selection_for_pid_with_refresh(
                    101,
                    period=0,
                    selection=selection,
                    wait_sec=0.05,
                )
            )
            await asyncio.sleep(0.02)
            late_task = asyncio.create_task(
                obs.lookup_bia_selection_for_pid_with_refresh(
                    101,
                    period=0,
                    selection=selection,
                    wait_sec=0.20,
                )
            )
            await asyncio.sleep(0.06)

            early_result = await early_task
            with obs._exact_refresh_lock:
                shared = next(iter(obs._exact_refresh_requests.values()))
            assert not shared.done.is_set()
            obs._finish_exact_refresh(
                shared,
                {
                    "found": True,
                    "event_found": True,
                    "event_id": 101,
                    "period": 0,
                    "offer_proof": {"bia_bet_type": "for,tmap,1,ml,a"},
                },
                negative_backoff=False,
            )
            late_result = await late_task

        assert early_result["found"] is False
        assert early_result["refresh_status"] == "timeout"
        assert late_result["found"] is True
    finally:
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle
        with obs._exact_refresh_lock:
            obs._exact_refresh_requests.clear()
            obs._exact_refresh_negative_until.clear()


def test_exact_refresh_is_not_enqueued_while_observer_disconnected():
    import services.bia_observer as obs

    orig_stats = obs._current_stats
    orig_lifecycle = obs._lifecycle_state
    with obs._exact_refresh_lock:
        obs._exact_refresh_requests.clear()
    try:
        obs._current_stats = BiaObserverStats()
        obs._lifecycle_state = "reconnecting"
        request = obs._enqueue_exact_refresh(
            101,
            period=0,
            selection={"bet_type": 1, "team_select": 0},
            wait_sec=1.0,
        )
        assert request is None
        assert obs._exact_refresh_requests == {}
    finally:
        obs._current_stats = orig_stats
        obs._lifecycle_state = orig_lifecycle


@pytest.mark.asyncio
async def test_run_observer_sets_running_flag():
    """run_bia_observer sets _observer_running=True while running, False on exit.
    Also verifies lifecycle state transitions: connecting → (observe) → stopped."""
    import services.bia_observer as obs

    running_states: list[bool] = []
    lifecycle_states: list[str] = []

    async def _fake_ensure(*_a, **_kw):
        lifecycle_states.append(obs._lifecycle_state)
        return "tok"

    async def _fake_observe(bia, stats):
        running_states.append(obs._observer_running)
        lifecycle_states.append(obs._lifecycle_state)
        raise asyncio.CancelledError  # break out

    with patch("services.bia_observer._cfg") as mock_cfg, \
         patch("services.bia_observer.aiohttp") as mock_aio, \
         patch("services.bia_observer._observe_ws", side_effect=_fake_observe):
        mock_cfg.BIA_ENABLED = True
        mock_cfg.BIA_RECONNECT_DELAY_SEC = 1.0
        mock_cfg.BIA_RECONNECT_MAX_DELAY_SEC = 10.0

        mock_http = AsyncMock()
        mock_aio.CookieJar.return_value = MagicMock()
        mock_aio.ClientSession.return_value.__aenter__ = AsyncMock(return_value=mock_http)
        mock_aio.ClientSession.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch.object(BiaSession, "ensure_token", new=_fake_ensure):
            with pytest.raises(asyncio.CancelledError):
                await run_bia_observer()

    assert running_states == [True]
    assert obs._observer_running is False
    assert obs._lifecycle_state == "stopped"
    # ensure_token sees "connecting", _observe_ws sees "connecting" (WS not yet opened)
    assert lifecycle_states[0] == "connecting"
    assert lifecycle_states[1] == "connecting"


@pytest.mark.asyncio
async def test_run_observer_exposes_current_stats():
    """run_bia_observer assigns _current_stats before calling _observe_ws."""
    import services.bia_observer as obs

    captured_stats: list = []

    async def _fake_ensure(*_a, **_kw):
        return "tok"

    async def _fake_observe(bia, stats):
        captured_stats.append(obs._current_stats)
        assert obs._current_stats is stats
        raise asyncio.CancelledError

    with patch("services.bia_observer._cfg") as mock_cfg, \
         patch("services.bia_observer.aiohttp") as mock_aio, \
         patch("services.bia_observer._observe_ws", side_effect=_fake_observe):
        mock_cfg.BIA_ENABLED = True
        mock_cfg.BIA_RECONNECT_DELAY_SEC = 1.0
        mock_cfg.BIA_RECONNECT_MAX_DELAY_SEC = 10.0

        mock_http = AsyncMock()
        mock_aio.CookieJar.return_value = MagicMock()
        mock_aio.ClientSession.return_value.__aenter__ = AsyncMock(return_value=mock_http)
        mock_aio.ClientSession.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch.object(BiaSession, "ensure_token", new=_fake_ensure):
            with pytest.raises(asyncio.CancelledError):
                await run_bia_observer()

    assert len(captured_stats) == 1
    assert captured_stats[0] is not None


# ── competition_id registry collision ───────────────────────────────────────


@pytest.mark.asyncio
async def test_event_registry_uses_comp_id_in_key():
    """Two events with the same sport+event_key but different competition_ids
    must NOT overwrite each other in the _event_registry."""
    event1 = json.dumps(["event", ["fb", "2026-04-05,1,1"], {
        "home": "TeamA", "away": "TeamB",
        "competition_id": 10, "competition_name": "Premier League",
        "start_ts": "2026-04-05T12:00:00Z",
    }])
    event2 = json.dumps(["event", ["fb", "2026-04-05,1,1"], {
        "home": "TeamX", "away": "TeamY",
        "competition_id": 20, "competition_name": "FA Cup",
    }])

    ws = _make_fake_ws([_text_msg(event1), _text_msg(event2), _close_msg()])
    http = MagicMock()
    http.ws_connect = MagicMock(return_value=_FakeWSCtx(ws))
    bia = BiaSession(http)
    bia._token = "test-tok"
    bia._login_ts = time.time()

    stats = BiaObserverStats()
    await _observe_ws(bia, stats)

    assert stats.events_seen == 2
    # Both events coexist in the registry (different comp_id)
    assert ("10", "fb", "2026-04-05,1,1") in stats._event_registry
    assert ("20", "fb", "2026-04-05,1,1") in stats._event_registry
    # Metadata is correct for each
    assert stats._event_registry[("10", "fb", "2026-04-05,1,1")]["home"] == "TeamA"
    assert stats._event_registry[("10", "fb", "2026-04-05,1,1")]["start_ts"] == "2026-04-05T12:00:00Z"
    assert stats._event_registry[("20", "fb", "2026-04-05,1,1")]["home"] == "TeamX"
