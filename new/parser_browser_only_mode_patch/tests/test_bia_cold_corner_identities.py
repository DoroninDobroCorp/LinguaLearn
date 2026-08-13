"""Exact regressions for identities previously delayed by fuzzy rematching."""

import pytest

from services.bia_event_matcher import (
    _TEAM_ALIASES,
    _TEAM_ALIASES_REV,
    _has_explicit_team_identity_conflict,
    _name_variants,
    _similarity,
    _try_neural_match,
    build_exact_match_index,
    match_bia_event,
    match_bia_event_exact,
)
from services.bia_neural_matcher import BiaNeuralDecision
from services.bia_observer import (
    BiaObserverStats,
    _filter_bia_event_refs_for_market_context,
    _matching_bia_event_refs_for_pid,
)


@pytest.mark.parametrize(
    (
        "event_id",
        "period",
        "sport_code",
        "pin_home",
        "pin_away",
        "bia_home",
        "bia_away",
    ),
    [
        (
            1,
            0,
            "fb_corn",
            "Universidad de Chile (Corners)",
            "Palestino (Corners)",
            "CFP Universidad de Chile",
            "CD Palestino",
        ),
        (
            2,
            1,
            "fb_corn_ht",
            "Waterford FC",
            "Bohemian FC Dublin",
            "Waterford United",
            "Bohemians Dublin FC",
        ),
    ],
)
def test_cold_corner_identity_is_exact_before_periodic_fuzzy_rematch(
    monkeypatch,
    event_id,
    period,
    sport_code,
    pin_home,
    pin_away,
    bia_home,
    bia_away,
):
    from state import state

    event_key = f"2026-08-09,{event_id},fixture"
    registry_key = ("competition", sport_code, event_key)
    stats = BiaObserverStats()
    stats._event_registry[registry_key] = {
        "competition_name": "Grounded Premier Division",
        "home": bia_home,
        "away": bia_away,
        "start_ts": "2026-08-09T12:00:00Z",
    }
    monkeypatch.setattr(
        state,
        "events_data",
        {
            event_id: {
                "Pid": event_id,
                "Home": pin_home,
                "Away": pin_away,
                "SportName": "Soccer",
                "LeagueName": "Soccer - Grounded Premier Division Corners",
            }
        },
        raising=False,
    )

    refs = _matching_bia_event_refs_for_pid(event_id, period=period, stats=stats)
    corner_refs = _filter_bia_event_refs_for_market_context(
        refs,
        market_context="corners",
        period=period,
    )

    assert [(ref["sport_code"], ref["event_key"]) for ref in corner_refs] == [
        (sport_code, event_key)
    ]
    assert stats._matched_event_cache[registry_key] == (event_id, False)


@pytest.mark.parametrize(
    ("pin_home", "pin_away", "bia_home", "bia_away", "sport_code"),
    [
        (
            "Universidad Nacional",
            "Palestino",
            "CFP Universidad de Chile",
            "CD Palestino",
            "fb_corn",
        ),
        (
            "Waterford FC",
            "Bohemian Prague",
            "Waterford United",
            "Bohemians Dublin FC",
            "fb_corn_ht",
        ),
    ],
)
def test_cold_corner_aliases_do_not_expand_to_unrelated_clubs(
    pin_home,
    pin_away,
    bia_home,
    bia_away,
    sport_code,
):
    events = {
        99: {
            "Home": pin_home,
            "Away": pin_away,
            "SportName": "Soccer",
            "LeagueName": "Grounded Premier Division",
        }
    }

    assert match_bia_event_exact(
        bia_home,
        bia_away,
        sport_code,
        events,
        bia_league="Grounded Premier Division",
    ) == (None, False)


@pytest.mark.parametrize(
    (
        "event_id",
        "comp_id",
        "event_key",
        "start_ts",
        "pin_home",
        "pin_away",
        "pin_league",
        "bia_home",
        "bia_away",
        "bia_league",
    ),
    [
        (
            1632977458,
            "130",
            "2026-08-09,935,38636",
            "2026-08-09T17:00:00Z",
            "Porto",
            "FC Alverca",
            "Soccer - Portugal - Primeira Liga Corners",
            "FC do Porto",
            "Alverca",
            "Portugal Primeira Liga",
        ),
        (
            1633292446,
            "76",
            "2026-08-10,337,339",
            "2026-08-10T17:00:00Z",
            "Silkeborg IF",
            "Odense BK",
            "Soccer - Denmark - Superliga Corners",
            "Silkeborg IF",
            "OB Odense BK",
            "Denmark Superliga (SAS Ligaen)",
        ),
    ],
)
def test_current_corner_residue_is_exact_before_periodic_fuzzy_rematch(
    monkeypatch,
    event_id,
    comp_id,
    event_key,
    start_ts,
    pin_home,
    pin_away,
    pin_league,
    bia_home,
    bia_away,
    bia_league,
):
    """Ground the aliases in the two physical BIA fixtures seen in production."""
    from state import state

    events = {
        event_id: {
            "Pid": event_id,
            "Home": pin_home,
            "Away": pin_away,
            "SportName": "Soccer",
            "LeagueName": pin_league,
            "start_time_ms": start_ts,
        }
    }
    assert match_bia_event_exact(
        bia_home,
        bia_away,
        "fb_corn",
        events,
        bia_league=bia_league,
        exact_index=build_exact_match_index(events),
    ) == (event_id, False)

    registry_key = (comp_id, "fb_corn", event_key)
    stats = BiaObserverStats()
    stats._event_registry[registry_key] = {
        "competition_name": bia_league,
        "home": bia_home,
        "away": bia_away,
        "start_ts": start_ts,
    }
    monkeypatch.setattr(state, "events_data", events, raising=False)

    refs = _matching_bia_event_refs_for_pid(event_id, period=0, stats=stats)

    assert [(ref["sport_code"], ref["event_key"]) for ref in refs] == [
        ("fb_corn", event_key)
    ]
    assert stats._matched_event_cache[registry_key] == (event_id, False)


@pytest.mark.parametrize(
    ("short_name", "bia_name"),
    [
        ("porto", "fc do porto"),
        ("odense bk", "ob odense bk"),
    ],
)
def test_current_corner_alias_reverse_index_is_unique_and_bidirectional(
    short_name,
    bia_name,
):
    assert _TEAM_ALIASES[short_name] == bia_name
    assert _TEAM_ALIASES_REV[bia_name] == short_name
    assert bia_name in _name_variants(short_name)
    assert short_name in _name_variants(bia_name)


@pytest.mark.parametrize(
    (
        "pin_home",
        "pin_away",
        "bia_home",
        "bia_away",
        "bia_league",
    ),
    [
        # The bare Porto alias must not erase explicit reserve/youth/women
        # evidence in either provider direction.
        ("Porto II", "FC Alverca", "FC do Porto", "Alverca", "Portugal Primeira Liga"),
        ("Porto U19", "FC Alverca U19", "FC do Porto", "Alverca", "Portugal Primeira Liga"),
        ("Porto Women", "FC Alverca Women", "FC do Porto", "Alverca", "Portugal Primeira Liga"),
        ("Porto", "FC Alverca", "FC do Porto II", "Alverca", "Portugal Primeira Liga"),
        # A different club containing the city token remains unrelated.
        ("Porto Velho", "FC Alverca", "FC do Porto", "Alverca", "Portugal Primeira Liga"),
        # The full Odense alias is subject to the same category guards.
        ("Silkeborg IF", "Odense BK U19", "Silkeborg IF", "OB Odense BK", "Denmark Superliga"),
        ("Silkeborg IF", "Odense BK", "Silkeborg IF", "OB Odense BK Women", "Denmark Superliga"),
    ],
)
def test_current_corner_aliases_preserve_category_and_other_club_guards(
    pin_home,
    pin_away,
    bia_home,
    bia_away,
    bia_league,
):
    events = {
        1: {
            "Pid": 1,
            "Home": pin_home,
            "Away": pin_away,
            "SportName": "Soccer",
            "LeagueName": bia_league,
        }
    }

    assert match_bia_event_exact(
        bia_home,
        bia_away,
        "fb_corn",
        events,
        bia_league=bia_league,
        exact_index=build_exact_match_index(events),
    ) == (None, False)
    assert match_bia_event(
        bia_home,
        bia_away,
        "fb_corn",
        events,
        bia_league=bia_league,
        use_neural=False,
    ) == (None, False)


@pytest.mark.parametrize(
    ("bia_name", "parser_name"),
    [
        ("FC do Porto", "Porto Velho"),
        ("Porto Velho", "FC do Porto"),
        ("Porto", "Porto Velho"),
        ("Porto Velho", "Porto"),
    ],
)
def test_fc_do_porto_and_porto_velho_conflict_blocks_fuzzy_both_directions(
    bia_name,
    parser_name,
):
    events = {
        1: {
            "Pid": 1,
            "Home": parser_name,
            "Away": "Alverca",
            "SportName": "Soccer",
            "LeagueName": "Grounded senior league",
        }
    }

    assert _has_explicit_team_identity_conflict(bia_name, parser_name) is True
    assert match_bia_event(
        bia_name,
        "Alverca",
        "fb",
        events,
        bia_league="Grounded senior league",
        use_neural=False,
    ) == (None, False)


@pytest.mark.parametrize(
    ("pin_home", "pin_away", "bia_home", "bia_away", "bia_league"),
    [
        ("Porto", "FC Alverca", "FC do Porto", "Alverca", "Portugal Primeira Liga"),
        ("Silkeborg IF", "Odense BK", "Silkeborg IF", "OB Odense BK", "Denmark Superliga"),
    ],
)
def test_current_corner_aliases_do_not_choose_an_ambiguous_parser_duplicate(
    pin_home,
    pin_away,
    bia_home,
    bia_away,
    bia_league,
):
    events = {
        event_id: {
            "Pid": event_id,
            "Home": pin_home,
            "Away": pin_away,
            "SportName": "Soccer",
            "LeagueName": bia_league,
        }
        for event_id in (1, 2)
    }

    assert match_bia_event_exact(
        bia_home,
        bia_away,
        "fb_corn",
        events,
        bia_league=bia_league,
        exact_index=build_exact_match_index(events),
    ) == (None, False)


def test_porto_alias_keeps_structural_start_guard_for_repeated_bia_fixtures(
    monkeypatch,
):
    from state import state

    event_id = 1632977458
    expected_key = ("130", "fb_corn", "2026-08-09,935,38636")
    later_key = ("130", "fb_corn", "2026-08-16,935,38636")
    stats = BiaObserverStats()
    stats._event_registry[expected_key] = {
        "competition_name": "Portugal Primeira Liga",
        "home": "FC do Porto",
        "away": "Alverca",
        "start_ts": "2026-08-09T17:00:00Z",
    }
    stats._event_registry[later_key] = {
        "competition_name": "Portugal Primeira Liga",
        "home": "FC do Porto",
        "away": "Alverca",
        "start_ts": "2026-08-16T17:00:00Z",
    }
    monkeypatch.setattr(
        state,
        "events_data",
        {
            event_id: {
                "Pid": event_id,
                "Home": "Porto",
                "Away": "FC Alverca",
                "SportName": "Soccer",
                "LeagueName": "Soccer - Portugal - Primeira Liga Corners",
                "start_time_ms": "2026-08-09T17:00:00Z",
            }
        },
        raising=False,
    )

    refs = _matching_bia_event_refs_for_pid(event_id, period=0, stats=stats)

    assert [(ref["comp_id"], ref["event_key"]) for ref in refs] == [
        (expected_key[0], expected_key[2])
    ]
    assert expected_key in stats._matched_event_cache
    assert later_key not in stats._matched_event_cache


def test_porto_alias_without_parser_start_rejects_repeated_bia_fixtures(
    monkeypatch,
):
    from state import state

    event_id = 1632977458
    stats = BiaObserverStats()
    for day in ("2026-08-09", "2026-08-16"):
        stats._event_registry[("130", "fb_corn", f"{day},935,38636")] = {
            "competition_name": "Portugal Primeira Liga",
            "home": "FC do Porto",
            "away": "Alverca",
            "start_ts": f"{day}T17:00:00Z",
        }
    monkeypatch.setattr(
        state,
        "events_data",
        {
            event_id: {
                "Pid": event_id,
                "Home": "Porto",
                "Away": "FC Alverca",
                "SportName": "Soccer",
                "LeagueName": "Soccer - Portugal - Primeira Liga Corners",
            }
        },
        raising=False,
    )

    assert _matching_bia_event_refs_for_pid(
        event_id,
        period=0,
        stats=stats,
    ) == []


@pytest.mark.parametrize(
    (
        "event_id",
        "sport_code",
        "pin_home",
        "pin_away",
        "pin_league",
        "bia_home",
        "bia_away",
        "bia_league",
    ),
    [
        (
            1632971047,
            "fb_corn",
            "Университатя Крайова",
            "Арджеш",
            "Soccer - Romania - Liga 1 Corners",
            "CS Universitatea Craiova",
            "FC Argeş Piteşti",
            "Romania Division 1",
        ),
        (
            1633295666,
            "fb",
            "Ареццо",
            "Унион Брешиа",
            "Soccer - Italy - Cup",
            "US Arezzo",
            "Union Brescia",
            "Italy Coppa Italia",
        ),
    ],
)
def test_current_cyrillic_provider_spellings_match_only_the_grounded_bia_pair(
    event_id,
    sport_code,
    pin_home,
    pin_away,
    pin_league,
    bia_home,
    bia_away,
    bia_league,
):
    events = {
        event_id: {
            "Pid": event_id,
            "Home": pin_home,
            "Away": pin_away,
            "SportName": "Soccer",
            "LeagueName": pin_league,
        }
    }

    assert match_bia_event_exact(
        bia_home,
        bia_away,
        sport_code,
        events,
        bia_league=bia_league,
        exact_index=build_exact_match_index(events),
    ) == (event_id, False)


def test_union_brescia_translation_never_selects_parallel_plain_brescia_board(
    monkeypatch,
):
    """The two live BIA boards share Arezzo, league and start; away is identity."""
    from state import state

    event_id = 1633295666
    union_key = ("173", "fb", "2026-08-09,288,10084914")
    plain_key = ("173", "fb", "2026-08-09,288,241")
    stats = BiaObserverStats()
    for key, away in ((union_key, "Union Brescia"), (plain_key, "Brescia")):
        stats._event_registry[key] = {
            "competition_name": "Italy Coppa Italia",
            "home": "US Arezzo",
            "away": away,
            "start_ts": "2026-08-09T17:45:00Z",
        }
    events = {
        event_id: {
            "Pid": event_id,
            "Home": "Ареццо",
            "Away": "Унион Брешиа",
            "SportName": "Soccer",
            "LeagueName": "Soccer - Italy - Cup",
            "start_time_ms": "2026-08-09T17:45:00Z",
        }
    }
    monkeypatch.setattr(state, "events_data", events, raising=False)

    refs = _matching_bia_event_refs_for_pid(event_id, period=0, stats=stats)

    assert [(ref["comp_id"], ref["event_key"]) for ref in refs] == [
        (union_key[0], union_key[2])
    ]
    assert stats._matched_event_cache[union_key] == (event_id, False)
    assert plain_key not in stats._matched_event_cache
    assert match_bia_event_exact(
        "US Arezzo",
        "Brescia",
        "fb",
        events,
        bia_league="Italy Coppa Italia",
        exact_index=build_exact_match_index(events),
    ) == (None, False)
    assert _name_variants("Унион Брешиа").isdisjoint(_name_variants("Brescia"))


@pytest.mark.parametrize(
    ("bia_away", "pin_away"),
    [
        ("Union Brescia", "Brescia"),
        ("Brescia", "Унион Брешиа"),
    ],
)
def test_union_and_plain_brescia_conflict_blocks_forward_and_reverse_fuzzy(
    bia_away,
    pin_away,
):
    """The generic 0.91 containment score cannot merge two physical boards."""
    events = {
        1633295666: {
            "Pid": 1633295666,
            "Home": "Ареццо",
            "Away": pin_away,
            "SportName": "Soccer",
            "LeagueName": "Soccer - Italy - Cup",
        }
    }

    assert _similarity(bia_away, pin_away) == 0.91
    assert _has_explicit_team_identity_conflict(bia_away, pin_away) is True
    assert match_bia_event(
        "US Arezzo",
        bia_away,
        "fb",
        events,
        bia_league="Italy Coppa Italia",
        use_neural=False,
    ) == (None, False)


@pytest.mark.parametrize(
    ("bia_away", "pin_away"),
    [
        ("Union Brescia", "Brescia"),
        ("Brescia", "Унион Брешиа"),
    ],
)
def test_neural_acceptance_cannot_override_union_brescia_identity_conflict(
    bia_away,
    pin_away,
):
    class AcceptingNeuralMatcher:
        def __init__(self):
            self.calls = 0

        def match(self, **_kwargs):
            self.calls += 1
            return BiaNeuralDecision(
                pid=1633295666,
                confidence=0.99,
                reason="forced test decision",
            )

    events = {
        1633295666: {
            "Pid": 1633295666,
            "Home": "Ареццо",
            "Away": pin_away,
            "SportName": "Soccer",
            "LeagueName": "Soccer - Italy - Cup",
        }
    }
    neural = AcceptingNeuralMatcher()

    result = _try_neural_match(
        bia_home="US Arezzo",
        bia_away=bia_away,
        bia_sport="fb",
        bia_league="Italy Coppa Italia",
        sport_name="Soccer",
        candidates=[(1633295666, 0.80, False, "Soccer - Italy - Cup")],
        events_data=events,
        neural_matcher=neural,
        use_neural=True,
    )

    assert neural.calls == 1
    assert result == (None, False)


def test_union_brescia_exact_identity_remains_accepted():
    events = {
        1633295666: {
            "Pid": 1633295666,
            "Home": "Ареццо",
            "Away": "Унион Брешиа",
            "SportName": "Soccer",
            "LeagueName": "Soccer - Italy - Cup",
        }
    }

    assert _has_explicit_team_identity_conflict(
        "Union Brescia",
        "Унион Брешиа",
    ) is False
    assert match_bia_event_exact(
        "US Arezzo",
        "Union Brescia",
        "fb",
        events,
        bia_league="Italy Coppa Italia",
        exact_index=build_exact_match_index(events),
    ) == (1633295666, False)


@pytest.mark.parametrize(
    ("pin_home", "pin_away", "bia_home", "bia_away", "sport_code", "league"),
    [
        (
            "Университатя Крайова",
            "Арджеш U19",
            "CS Universitatea Craiova",
            "FC Argeş Piteşti",
            "fb_corn",
            "Romania Division 1",
        ),
        (
            "Университатя Крайова",
            "Арджеш",
            "CS Universitatea Craiova",
            "FC Argeş Piteşti II",
            "fb_corn",
            "Romania Division 1",
        ),
        (
            "Ареццо U19",
            "Унион Брешиа U19",
            "US Arezzo",
            "Union Brescia",
            "fb",
            "Italy Coppa Italia",
        ),
    ],
)
def test_current_cyrillic_translations_preserve_explicit_age_categories(
    pin_home,
    pin_away,
    bia_home,
    bia_away,
    sport_code,
    league,
):
    events = {
        1: {
            "Pid": 1,
            "Home": pin_home,
            "Away": pin_away,
            "SportName": "Soccer",
            "LeagueName": league,
        }
    }

    assert match_bia_event_exact(
        bia_home,
        bia_away,
        sport_code,
        events,
        bia_league=league,
        exact_index=build_exact_match_index(events),
    ) == (None, False)
