"""Regression coverage for the live MiBR / Fluxo W7M BIA fixture."""

import inspect

import services.bia_event_matcher as matcher

from services.bia_event_matcher import (
    _similarity,
    build_exact_match_index,
    match_bia_event,
    match_bia_event_exact,
)


PID = 1632983548
EVENTS = {
    PID: {
        "Pid": PID,
        "SportName": "ESports",
        "Home": "MiBR",
        "Away": "Fluxo W7M",
        "LeagueName": "CS2 - Starladder Starseries South America Qualifier",
    },
}


def _fuzzy(home: str, away: str, events=EVENTS, **kwargs):
    if "use_neural" in inspect.signature(match_bia_event).parameters:
        kwargs.setdefault("use_neural", False)
    return match_bia_event(home, away, "esports", events, **kwargs)


def _match_with_both_paths(home: str, away: str):
    exact = match_bia_event_exact(
        home,
        away,
        "esports",
        EVENTS,
        bia_league="CS2 - StarLadder StarSeries",
        exact_index=build_exact_match_index(EVENTS),
    )
    fuzzy = _fuzzy(
        home,
        away,
        bia_league="CS2 - StarLadder StarSeries",
    )
    return exact, fuzzy


def test_mibr_academy_cannot_impersonate_main_mibr_team():
    assert _similarity("Fluxo W7M", "CS2 - Fluxo") == 1.0
    assert _match_with_both_paths(
        "CS2 - MIBR Academy",
        "CS2 - Fluxo",
    ) == ((None, False), (None, False))


def test_w7m_candidate_cannot_impersonate_fluxo_w7m_in_either_path(monkeypatch):
    assert _similarity("Fluxo W7M", "CS2 - w7m eSports") < 0.7
    assert _match_with_both_paths(
        "CS2 - w7m eSports",
        "CS2 - MIBR Academy",
    ) == ((None, False), (None, False))

    class RejectNeuralCall:
        def match(self, **_kwargs):
            raise AssertionError("identity-conflicting candidate reached neural fallback")

    if "use_neural" in inspect.signature(match_bia_event).parameters:
        monkeypatch.setattr(matcher, "_neural_matcher_settings", lambda: (8, 0.0))
        assert match_bia_event(
            "CS2 - w7m eSports",
            "CS2 - MIBR Academy",
            "esports",
            EVENTS,
            bia_league="CS2 - StarLadder StarSeries",
            neural_matcher=RejectNeuralCall(),
            use_neural=True,
        ) == (None, False)


def test_generic_academy_guard_rejects_other_reserve_teams_too():
    events = {
        1: {
            "SportName": "ESports",
            "Home": "Alpha",
            "Away": "Beta",
            "LeagueName": "CS2 League",
        },
    }
    assert match_bia_event_exact(
        "CS2 - Alpha Academy",
        "CS2 - Beta",
        "esports",
        events,
        exact_index=build_exact_match_index(events),
    ) == (None, False)
    assert _fuzzy(
        "CS2 - Alpha Academy",
        "CS2 - Beta",
        events,
    ) == (None, False)


def test_academy_guard_is_also_applied_outside_esports():
    events = {
        1: {
            "SportName": "Soccer",
            "Home": "MIBR",
            "Away": "Fluxo W7M",
            "LeagueName": "League",
        },
    }
    assert match_bia_event_exact(
        "MIBR Academy",
        "Fluxo",
        "fb",
        events,
        exact_index=build_exact_match_index(events),
    ) == (None, False)
    fuzzy_kwargs = {}
    if "use_neural" in inspect.signature(match_bia_event).parameters:
        fuzzy_kwargs["use_neural"] = False
    assert match_bia_event(
        "MIBR Academy",
        "Fluxo",
        "fb",
        events,
        **fuzzy_kwargs,
    ) == (None, False)


def test_observed_exact_brand_aliases_match_without_price_or_fuzzy_identity():
    pairs = (
        ("paiN Academy", "CS2 - paiN Acad"),
        ("BC Lions", "British Columbia Lions"),
        ("Athletics", "The Athletics"),
        ("ThunderTalk", "LoL - TT"),
        ("Hanwha Life Challengers", "LoL - Hanwha Life Esports Challengers"),
        ("Kiwoom DRX", "LoL - DRX Challengers"),
        ("Kiwoom DRX Challengers", "LoL - DRX Challengers"),
        ("BIG", "LoL - Berlin International Gaming"),
        ("Mark Seban", "Mark Ceban"),
        ("Ferdinand Livet Novkirichka", "Ferdinand L Novkirichka"),
        ("Montevideo B.B.C", "Montevideo Basket Ball Club"),
        ("Unicorns of Love Sexy Edition", "LoL - Unicorns of Love SE"),
        ("Lokomotiv Moscow", "FK Lokomotiv Moskva"),
        ("Akron Togliatti", "FK Akron Tolyatti"),
        ("Belgrano", "CA Belgrano de Córdoba"),
        ("Blooming", "CSCD Blooming"),
    )
    for left, right in pairs:
        assert _similarity(left, right) == 1.0
