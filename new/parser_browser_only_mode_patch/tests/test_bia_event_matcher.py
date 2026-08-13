"""Tests for BIA event matcher (services/bia_event_matcher.py)."""

from __future__ import annotations

import pytest

from services.bia_event_matcher import (
    BIA_SPORT_MAP,
    build_exact_match_index,
    _name_variants,
    _normalize_name,
    _similarity,
    _match_score,
    match_bia_event,
    match_bia_event_exact,
)
from services.bia_neural_matcher import BiaNeuralCandidate, BiaNeuralDecision


class FakeNeuralMatcher:
    def __init__(self, decision: BiaNeuralDecision | None):
        self.decision = decision
        self.calls: list[list[BiaNeuralCandidate]] = []

    def match(self, **kwargs):
        self.calls.append(kwargs["candidates"])
        return self.decision


# ── Normalize name ──────────────────────────────────────────────────────────

class TestNormalizeName:
    def test_lowercase_strip(self):
        assert _normalize_name("  Arsenal FC  ") == "arsenal"

    def test_removes_fc_suffix(self):
        assert _normalize_name("Manchester United FC") == "manchester united"

    def test_removes_sc_prefix(self):
        assert _normalize_name("SC Freiburg") == "freiburg"

    def test_removes_women_suffix(self):
        assert _normalize_name("Barcelona Women") == "barcelona"

    def test_removes_special_chars(self):
        assert _normalize_name("Atlético Madrid") == "atletico madrid"

    def test_removes_youth_reserve(self):
        assert _normalize_name("Chelsea U21 Reserves") == "chelsea"

    def test_name_variants_add_connector_free_exact_form(self):
        assert "abejas leon" in _name_variants("Abejas de Leon")
        assert "astros jalisco" in _name_variants("Astros de Jalisco")
        assert "real madrid" not in _name_variants("Real Sociedad")

    def test_brazilian_association_prefix_is_an_exact_alternative(self):
        assert "ponte preta" in _name_variants("AA Ponte Preta (SP)")

    def test_corner_scope_matches_bia_club_names_exactly(self):
        events = {
            1633197947: {
                "Pid": 1633197947,
                "SportName": "Soccer",
                "homeName": "Ceara (Corners)",
                "awayName": "Ponte Preta (Corners)",
                "LeagueName": "Brazil - Serie B",
            }
        }
        assert match_bia_event_exact(
            "Ceará SC (CE)",
            "AA Ponte Preta (SP)",
            "fb_corn",
            events,
            exact_index=build_exact_match_index(events),
        ) == (1633197947, False)

    def test_ldu_quito_expansion_is_an_exact_club_alias(self):
        assert _similarity("LDU de Quito", "LD Universitaria Quito") == 1.0

    def test_altach_sponsor_spellings_match_the_same_fixture_exactly(self):
        events = {
            1633117112: {
                "Pid": 1633117112,
                "SportName": "Soccer",
                "homeName": "SCR Altach",
                "awayName": "WSG Tirol",
                "LeagueName": "Soccer - Austria - Bundesliga Corners",
            }
        }
        assert match_bia_event_exact(
            "SC Rheindorf Altach",
            "WSG Swarovski Tirol",
            "fb_corn",
            events,
            exact_index=build_exact_match_index(events),
        ) == (1633117112, False)

    def test_brazilian_ec_suffix_matches_corner_fixture_exactly(self):
        events = {
            1633177789: {
                "Pid": 1633177789,
                "SportName": "Soccer",
                "homeName": "Operario Ferroviario (Corners)",
                "awayName": "Sao Bernardo (Corners)",
                "LeagueName": "Soccer - Brazil - Serie B Corners",
            }
        }
        assert match_bia_event_exact(
            "Operário Ferroviário EC (PR)",
            "Sao Bernardo FC (SP)",
            "fb_corn",
            events,
            exact_index=build_exact_match_index(events),
        ) == (1633177789, False)

    def test_exact_translated_forted_names_match_bia_fixture(self):
        events = {
            1632442598: {
                "Pid": 1632442598,
                "SportName": "Soccer",
                "homeName": "ПСВ Эйндховен",
                "awayName": "Фортуна Ситтард",
                "LeagueName": "Soccer - Netherlands - Eredivisie",
            }
        }
        assert match_bia_event_exact(
            "PSV Eindhoven",
            "Fortuna Sittard Combinatie",
            "fb",
            events,
            exact_index=build_exact_match_index(events),
        ) == (1632442598, False)

    def test_uruguay_city_suffixes_match_same_corner_fixture_exactly(self):
        events = {
            1633338900: {
                "Pid": 1633338900,
                "SportName": "Soccer",
                "homeName": "Danubio FC",
                "awayName": "Club Atletico Cerro",
                "LeagueName": "Soccer - Uruguay - Primera Division Corners",
            }
        }
        assert match_bia_event_exact(
            "Danubio Montevideo",
            "CA Cerro Montevideo",
            "fb_corn",
            events,
            exact_index=build_exact_match_index(events),
        ) == (1633338900, False)

    def test_brazil_state_suffixes_match_same_corner_fixture_exactly(self):
        events = {
            1632998982: {
                "Pid": 1632998982,
                "SportName": "Soccer",
                "homeName": "Regatas Flamengo RJ",
                "awayName": "EC Vitoria BA",
                "LeagueName": "Soccer - Brazil - Serie A Corners",
            }
        }
        assert match_bia_event_exact(
            "CR Flamengo (RJ)",
            "EC Vitória (BA)",
            "fb_corn",
            events,
            exact_index=build_exact_match_index(events),
        ) == (1632998982, False)

    def test_arges_city_suffix_matches_same_corner_fixture_exactly(self):
        events = {
            1632971047: {
                "Pid": 1632971047,
                "SportName": "Soccer",
                "homeName": "Universitatea Craiova",
                "awayName": "FC Arges",
                "LeagueName": "Soccer - Romania - Liga 1 Corners",
            }
        }
        assert match_bia_event_exact(
            "CS Universitatea Craiova",
            "FC Argeş Piteşti",
            "fb_corn",
            events,
            exact_index=build_exact_match_index(events),
        ) == (1632971047, False)

    @pytest.mark.parametrize(
        ("pid", "sport", "home", "away", "bia_home", "bia_away", "bia_code"),
        [
            (1633334097, "Basketball", "Verdirrojo BBC", "Club Atletico Olimpia", "Verdirrojo BC", "CA Olimpia", "basket"),
            (1632977890, "Soccer", "RSC Anderlecht", "RAAL La Louviere", "RSC Anderlecht", "UR La Louviere Centre", "fb_corn"),
            (1633265664, "Soccer", "Austria Vienna (Corners)", "LASK Linz (Corners)", "FK Austria Wien", "LASK", "fb_corn"),
            (1633059274, "Soccer", "Vitoria Guimaraes (Corners)", "Arouca (Corners)", "Vitória SC de Guimarães", "FC Arouca", "fb_corn"),
            (1632941972, "Soccer", "CF Estrela da Amadora", "Sporting Lisbon", "CF Estrela da Amadora", "Sporting CP", "fb_corn"),
            (1633265693, "Soccer", "Coquimbo Unido (Corners)", "Deportes La Serena (Corners)", "Coquimbo Unido", "CD La Serena", "fb_corn"),
            (1633236764, "Soccer", "Nagoya Grampus (Corners)", "Shimizu S-Pulse (Corners)", "Nagoya Grampus Eight", "Shimizu S-Pulse", "fb_corn"),
            (1633338899, "Soccer", "Liverpool Montevideo (Corners)", "Albion (Corners)", "Liverpool FC Montevideo", "Albion FC Montevideo", "fb_corn"),
            (1632442596, "Soccer", "PEC Zwolle (Corners)", "Ajax (Corners)", "FC Zwolle", "Ajax", "fb_corn"),
            (1632864952, "Soccer", "Sandefjord (Corners)", "KFUM Oslo (Corners)", "Sandefjord Fotball", "KFUM-Kameratene Oslo", "fb_corn"),
            (1633230218, "Soccer", "Sanfrecce Hiroshima (Corners)", "JEF United Chiba (Corners)", "Hiroshima Sanfrecce FC", "JEF United Ichihara Chiba", "fb_corn"),
            (1632442600, "Soccer", "Sparta Rotterdam", "Feyenoord Rotterdam", "Sparta Rotterdam", "Feyenoord", "fb_corn"),
            (1633316614, "Soccer", "FC Cincinnati", "Pumas de la UNAM", "FC Cincinnati", "Club Universidad Nacional (Pumas UNAM)", "fb_corn"),
            (1632977529, "Soccer", "Krylia Sovetov Samara", "FC Baltika Kaliningrad", "PFK Krylya Sovetov Samara", "FK Baltika Kaliningrad", "fb_corn"),
            (1632971050, "Soccer", "FC Farul Constanta", "AFK Csikszereda Miercurea Ciuc", "FC Farul Constanţa", "FC Csikszereda Miercurea Ciuc", "fb_corn"),
            (1633197924, "Soccer", "Jeonbuk Motors", "Jeju United FC", "Jeonbuk Hyundai Motors FC", "Jeju United FC", "fb_corn"),
            (1633338898, "Soccer", "Montevideo City Torque", "CA Penarol Montevideo", "CA Torque", "CA Peñarol", "fb_corn"),
            (1632934803, "Soccer", "FC Yenisey Krasnoyarsk", "Tekstilschik-M Ivanovo", "FK Yenisey Krasnoyarsk", "FC Tekstilshchik Ivanovo", "fb"),
            (1633178263, "Soccer", "LDU Quito", "Independiente del Valle", "LD Universitaria Quito", "CSD Independiente Del Valle", "fb_corn"),
            (1633294696, "Soccer", "Мачва", "ИМТ Нови-Белград", "FK Macva Sabac", "FK IMT Novi Beograd", "fb"),
            (1633304573, "Soccer", "СКА-Хабаровск", "Спартак Кострома", "FK SKA-Energiya Khabarovsk", "FC Spartak Kostroma", "fb_corn"),
            (1633456118, "Volleyball", "Estudiantil Porteno W", "Клуб Гимнасия и Эсгрима Буэнос-Айрес (GEBA) W", "Estudiantil Porteno Women", "Gimnasia Esgrima Women", "volley"),
            (1633462024, "Volleyball", "Мупол В", "Сьюдад-де-Буэнос-Айрес В", "Mupol Women", "Ciudad Women", "volley"),
        ],
    )
    def test_exact_provider_club_forms_cover_morning_fixtures(
        self, pid, sport, home, away, bia_home, bia_away, bia_code
    ):
        events = {
            pid: {
                "Pid": pid,
                "SportName": sport,
                "homeName": home,
                "awayName": away,
                "LeagueName": "fixture Women" if sport == "Volleyball" else "fixture",
            }
        }
        assert match_bia_event_exact(
            bia_home,
            bia_away,
            bia_code,
            events,
            exact_index=build_exact_match_index(events),
        ) == (pid, False)


# ── Similarity ──────────────────────────────────────────────────────────────

class TestSimilarity:
    def test_identical_names(self):
        assert _similarity("Arsenal", "Arsenal") == 1.0

    def test_similar_names(self):
        assert _similarity("Arsenal FC", "Arsenal") > 0.85

    def test_different_names(self):
        assert _similarity("Arsenal", "Barcelona") < 0.7

    @pytest.mark.parametrize(
        ("left", "right"),
        [
            ("West Ham", "West Ham United"),
            ("Wolverhampton", "Wolverhampton Wanderers"),
            ("Roma", "AS Roma"),
            ("Pisa", "Pisa Sporting Club"),
        ],
    )
    def test_alias_variants_score_as_exact(self, left, right):
        assert _similarity(left, right) == 1.0

    def test_non_alias_names_remain_distinct(self):
        assert _similarity("Manchester United", "Manchester City") < 0.9


# ── Match score ─────────────────────────────────────────────────────────────

class TestMatchScore:
    def test_normal_match(self):
        score, swapped = _match_score("Arsenal", "Chelsea", "Arsenal", "Chelsea")
        assert score > 0.9
        assert swapped is False

    def test_swapped_match(self):
        score, swapped = _match_score("Arsenal", "Chelsea", "Chelsea", "Arsenal")
        assert score > 0.9
        assert swapped is True

    def test_no_match(self):
        score, swapped = _match_score("Arsenal", "Chelsea", "Barcelona", "Real Madrid")
        assert score < 0.5


# ── match_bia_event ─────────────────────────────────────────────────────────

class TestMatchBiaEvent:
    @pytest.fixture
    def events_data(self):
        return {
            1001: {
                "Pid": 1001,
                "SportName": "Soccer",
                "homeName": "Arsenal",
                "awayName": "Chelsea",
                "Periods": [{}],
            },
            1002: {
                "Pid": 1002,
                "SportName": "Tennis",
                "homeName": "Djokovic N.",
                "awayName": "Nadal R.",
                "Periods": [{}],
            },
        }

    def test_exact_match(self, events_data):
        pid, swapped = match_bia_event("Arsenal", "Chelsea", "fb", events_data)
        assert pid == 1001
        assert swapped is False

    def test_swapped_match(self, events_data):
        pid, swapped = match_bia_event("Chelsea", "Arsenal", "fb", events_data)
        assert pid == 1001
        assert swapped is True

    def test_no_match_different_teams(self, events_data):
        pid, swapped = match_bia_event("Barcelona", "Real Madrid", "fb", events_data)
        assert pid is None

    def test_empty_names_no_match(self, events_data):
        pid, swapped = match_bia_event("", "Chelsea", "fb", events_data)
        assert pid is None

    def test_sport_filter(self, events_data):
        """BIA sport 'tennis' should not match Soccer events."""
        pid, swapped = match_bia_event("Arsenal", "Chelsea", "tennis", events_data)
        assert pid is None

    def test_tennis_match(self, events_data):
        pid, swapped = match_bia_event("Djokovic N.", "Nadal R.", "tennis", events_data)
        assert pid == 1002
        assert swapped is False

    def test_empty_events_data(self):
        pid, swapped = match_bia_event("Arsenal", "Chelsea", "fb", {})
        assert pid is None

    def test_fuzzy_match_with_suffix(self, events_data):
        """BIA may report 'Arsenal FC' vs our 'Arsenal'."""
        pid, swapped = match_bia_event("Arsenal FC", "Chelsea FC", "fb", events_data)
        assert pid == 1001

    def test_matches_west_ham_and_wolverhampton_aliases(self):
        data = {
            1101: {
                "Pid": 1101,
                "SportName": "Soccer",
                "homeName": "West Ham United",
                "awayName": "Wolverhampton Wanderers",
                "LeagueName": "Premier League",
                "Periods": [{}],
            },
        }
        pid, swapped = match_bia_event("West Ham", "Wolverhampton", "fb", data)
        assert pid == 1101
        assert swapped is False

    def test_matches_roma_and_pisa_aliases(self):
        data = {
            1102: {
                "Pid": 1102,
                "SportName": "Soccer",
                "homeName": "Roma",
                "awayName": "Pisa",
                "LeagueName": "Coppa Italia",
                "Periods": [{}],
            },
        }
        pid, swapped = match_bia_event("AS Roma", "Pisa Sporting Club", "fb", data)
        assert pid == 1102
        assert swapped is False

    def test_ambiguous_duplicate_fixtures_no_match(self):
        """Two events with identical team names → ambiguous, must not match."""
        data = {
            2001: {
                "Pid": 2001,
                "SportName": "Soccer",
                "homeName": "Arsenal",
                "awayName": "Chelsea",
                "Periods": [{}],
            },
            2002: {
                "Pid": 2002,
                "SportName": "Soccer",
                "homeName": "Arsenal",
                "awayName": "Chelsea",
                "Periods": [{}],
            },
        }
        pid, swapped = match_bia_event("Arsenal", "Chelsea", "fb", data)
        assert pid is None, "Ambiguous same-name fixtures must not silently match"

    def test_ambiguous_near_identical_fixtures_no_match(self):
        """Near-identical team names that score within the ambiguity gap."""
        data = {
            3001: {
                "Pid": 3001,
                "SportName": "Soccer",
                "homeName": "Arsenal FC",
                "awayName": "Chelsea FC",
                "Periods": [{}],
            },
            3002: {
                "Pid": 3002,
                "SportName": "Soccer",
                "homeName": "Arsenal",
                "awayName": "Chelsea",
                "Periods": [{}],
            },
        }
        pid, swapped = match_bia_event("Arsenal", "Chelsea", "fb", data)
        assert pid is None, "Near-duplicate fixtures must not silently pick one"

    def test_ambiguous_fixture_can_use_injected_neural_matcher(self):
        data = {
            3101: {
                "Pid": 3101,
                "SportName": "Soccer",
                "homeName": "Arsenal FC",
                "awayName": "Chelsea FC",
                "LeagueName": "League A",
                "Periods": [{}],
            },
            3102: {
                "Pid": 3102,
                "SportName": "Soccer",
                "homeName": "Arsenal",
                "awayName": "Chelsea",
                "LeagueName": "League B",
                "Periods": [{}],
            },
        }
        fake = FakeNeuralMatcher(BiaNeuralDecision(pid=3102, confidence=0.94, reason="exact teams"))

        pid, swapped = match_bia_event(
            "Arsenal",
            "Chelsea",
            "fb",
            data,
            neural_matcher=fake,
        )

        assert pid == 3102
        assert swapped is False
        assert [candidate.pid for candidate in fake.calls[0]] == [3101, 3102]

    def test_neural_matcher_cannot_pick_pid_outside_shortlist(self):
        data = {
            3101: {
                "Pid": 3101,
                "SportName": "Soccer",
                "homeName": "Arsenal FC",
                "awayName": "Chelsea FC",
                "LeagueName": "League A",
                "Periods": [{}],
            },
            3102: {
                "Pid": 3102,
                "SportName": "Soccer",
                "homeName": "Arsenal",
                "awayName": "Chelsea",
                "LeagueName": "League B",
                "Periods": [{}],
            },
        }
        fake = FakeNeuralMatcher(BiaNeuralDecision(pid=9999, confidence=0.99, reason="hallucinated"))

        pid, _ = match_bia_event(
            "Arsenal",
            "Chelsea",
            "fb",
            data,
            neural_matcher=fake,
        )

        assert pid is None

    def test_reserve_mismatch_rejected_even_if_normalized_names_match(self):
        data = {
            3201: {
                "Pid": 3201,
                "SportName": "Soccer",
                "homeName": "Chelsea",
                "awayName": "Arsenal",
                "LeagueName": "Premier League",
                "Periods": [{}],
            },
        }
        index = build_exact_match_index(data)

        pid, _ = match_bia_event_exact(
            "Chelsea U21",
            "Arsenal",
            "fb",
            data,
            bia_league="Premier League",
            exact_index=index,
        )

        assert pid is None

    def test_tennis_singles_doubles_mismatch_rejected_before_neural(self):
        data = {
            3301: {
                "Pid": 3301,
                "SportName": "Tennis",
                "homeName": "Bondioli",
                "awayName": "Cadenasso",
                "LeagueName": "ATP Challenger",
                "Periods": [{}],
            },
        }
        fake = FakeNeuralMatcher(BiaNeuralDecision(pid=3301, confidence=0.99, reason="bad"))

        pid, _ = match_bia_event(
            "Bondioli/Cadenasso",
            "Other/Player",
            "tennis",
            data,
            neural_matcher=fake,
        )

        assert pid is None
        assert fake.calls == []

    def test_unique_fixture_still_matches(self):
        """Single fixture with high score should still match fine."""
        data = {
            4001: {
                "Pid": 4001,
                "SportName": "Soccer",
                "homeName": "Arsenal",
                "awayName": "Chelsea",
                "Periods": [{}],
            },
            4002: {
                "Pid": 4002,
                "SportName": "Soccer",
                "homeName": "Barcelona",
                "awayName": "Real Madrid",
                "Periods": [{}],
            },
        }
        pid, swapped = match_bia_event("Arsenal", "Chelsea", "fb", data)
        assert pid == 4001

    def test_league_disambiguates_duplicate_fixtures(self):
        """When two events have identical teams but different leagues,
        bia_league should break the tie."""
        data = {
            5001: {
                "Pid": 5001,
                "SportName": "Soccer",
                "homeName": "Arsenal",
                "awayName": "Chelsea",
                "LeagueName": "Premier League",
                "Periods": [{}],
            },
            5002: {
                "Pid": 5002,
                "SportName": "Soccer",
                "homeName": "Arsenal",
                "awayName": "Chelsea",
                "LeagueName": "FA Cup",
                "Periods": [{}],
            },
        }
        # Without league → ambiguous
        pid, _ = match_bia_event("Arsenal", "Chelsea", "fb", data)
        assert pid is None, "Without league hint, should remain ambiguous"

        # With matching league → disambiguated
        pid, swapped = match_bia_event(
            "Arsenal", "Chelsea", "fb", data, bia_league="Premier League",
        )
        assert pid == 5001
        assert swapped is False

        # Other league resolves to the other event
        pid, swapped = match_bia_event(
            "Arsenal", "Chelsea", "fb", data, bia_league="FA Cup",
        )
        assert pid == 5002

    def test_league_disambiguation_refuses_when_leagues_also_similar(self):
        """If both candidate leagues are equally similar to bia_league,
        disambiguation should still refuse the match."""
        data = {
            6001: {
                "Pid": 6001,
                "SportName": "Soccer",
                "homeName": "Arsenal",
                "awayName": "Chelsea",
                "LeagueName": "League A",
                "Periods": [{}],
            },
            6002: {
                "Pid": 6002,
                "SportName": "Soccer",
                "homeName": "Arsenal",
                "awayName": "Chelsea",
                "LeagueName": "League A",
                "Periods": [{}],
            },
        }
        pid, _ = match_bia_event(
            "Arsenal", "Chelsea", "fb", data, bia_league="League A",
        )
        assert pid is None, "Identical leagues cannot disambiguate"


class TestExactMatchIndex:
    def test_build_exact_match_index_groups_by_sport_and_normalized_names(self):
        events_data = {
            1001: {
                "Pid": 1001,
                "SportName": "Soccer",
                "homeName": "Arsenal FC",
                "awayName": "Chelsea FC",
            },
            1002: {
                "Pid": 1002,
                "SportName": "Tennis",
                "homeName": "Djokovic N.",
                "awayName": "Nadal R.",
            },
        }
        index = build_exact_match_index(events_data)
        assert index[("soccer", "arsenal", "chelsea")] == [(1001, "")]
        assert index[("tennis", "djokovic n", "nadal r")] == [(1002, "")]

    def test_match_bia_event_exact_matches_forward_and_swapped(self):
        events_data = {
            1001: {
                "Pid": 1001,
                "SportName": "Soccer",
                "homeName": "Arsenal",
                "awayName": "Chelsea",
                "LeagueName": "Premier League",
            },
        }
        index = build_exact_match_index(events_data)
        pid, swapped = match_bia_event_exact(
            "Arsenal FC", "Chelsea FC", "fb", events_data, exact_index=index,
        )
        assert pid == 1001
        assert swapped is False

        pid, swapped = match_bia_event_exact(
            "Chelsea", "Arsenal", "fb", events_data, exact_index=index,
        )
        assert pid == 1001
        assert swapped is True

    def test_match_bia_event_exact_handles_realistic_alias_variants(self):
        events_data = {
            1003: {
                "Pid": 1003,
                "SportName": "Soccer",
                "homeName": "West Ham United",
                "awayName": "Wolverhampton Wanderers",
                "LeagueName": "Premier League",
            },
            1004: {
                "Pid": 1004,
                "SportName": "Soccer",
                "homeName": "Roma",
                "awayName": "Pisa",
                "LeagueName": "Coppa Italia",
            },
        }
        index = build_exact_match_index(events_data)

        pid, swapped = match_bia_event_exact(
            "West Ham", "Wolverhampton", "fb", events_data, exact_index=index,
        )
        assert pid == 1003
        assert swapped is False

        pid, swapped = match_bia_event_exact(
            "AS Roma", "Pisa Sporting Club", "fb", events_data, exact_index=index,
        )
        assert pid == 1004
        assert swapped is False

    def test_match_bia_event_exact_handles_grounded_atletico_mineiro_abbreviation(self):
        events_data = {
            1005: {
                "Pid": 1005,
                "SportName": "Soccer",
                "homeName": "Atletico Mineiro",
                "awayName": "Bahia",
                "LeagueName": "Brazil Brasileiro Women",
            },
        }
        index = build_exact_match_index(events_data)

        pid, swapped = match_bia_event_exact(
            "CA Mineiro (MG) Women",
            "EC Bahia (BA) Women",
            "fb",
            events_data,
            bia_league="Brazil Campeonato Brasileiro Women",
            exact_index=index,
        )

        assert pid == 1005
        assert swapped is False

    @pytest.mark.parametrize(
        ("pin_home", "pin_away", "bia_home", "bia_away", "sport", "bia_sport"),
        [
            (
                "VHK Vsetin", "HC RT Torax Poruba",
                "VHK Vsetín", "Poruba", "Hockey", "ih",
            ),
            (
                "Salzburg", "Pafos",
                "FC Red Bull Salzburg", "AEP Paphos FC", "Soccer", "fb",
            ),
            (
                "Paris Saint Germain", "Aston Villa",
                "PSG", "Aston Villa", "Soccer", "fb",
            ),
            (
                "Zvezda Moscow", "HK Ryazan",
                "Zvezda Chekhov", "HK Ryazan", "Hockey", "ih",
            ),
        ],
    )
    def test_match_bia_event_exact_handles_grounded_provider_aliases(
        self, pin_home, pin_away, bia_home, bia_away, sport, bia_sport,
    ):
        events_data = {
            1006: {
                "Pid": 1006,
                "SportName": sport,
                "homeName": pin_home,
                "awayName": pin_away,
                "LeagueName": "Grounded regression",
            },
        }

        pid, swapped = match_bia_event_exact(
            bia_home,
            bia_away,
            bia_sport,
            events_data,
            exact_index=build_exact_match_index(events_data),
        )

        assert pid == 1006
        assert swapped is False

    def test_match_bia_event_exact_refuses_ambiguous_duplicates_without_league(self):
        events_data = {
            2001: {
                "Pid": 2001,
                "SportName": "Soccer",
                "homeName": "Arsenal",
                "awayName": "Chelsea",
                "LeagueName": "Premier League",
            },
            2002: {
                "Pid": 2002,
                "SportName": "Soccer",
                "homeName": "Arsenal",
                "awayName": "Chelsea",
                "LeagueName": "FA Cup",
            },
        }
        index = build_exact_match_index(events_data)
        pid, swapped = match_bia_event_exact(
            "Arsenal", "Chelsea", "fb", events_data, exact_index=index,
        )
        assert pid is None
        assert swapped is False

    def test_match_bia_event_exact_uses_league_to_break_exact_tie(self):
        events_data = {
            3001: {
                "Pid": 3001,
                "SportName": "Soccer",
                "homeName": "Arsenal",
                "awayName": "Chelsea",
                "LeagueName": "Premier League",
            },
            3002: {
                "Pid": 3002,
                "SportName": "Soccer",
                "homeName": "Arsenal",
                "awayName": "Chelsea",
                "LeagueName": "FA Cup",
            },
        }
        index = build_exact_match_index(events_data)
        pid, swapped = match_bia_event_exact(
            "Arsenal", "Chelsea", "fb", events_data,
            bia_league="Premier League", exact_index=index,
        )
        assert pid == 3001
        assert swapped is False


# ── BIA_SPORT_MAP ───────────────────────────────────────────────────────────

class TestBiaSportMap:
    def test_fb_maps_to_soccer(self):
        assert BIA_SPORT_MAP["fb"] == "Soccer"

    def test_fb_htft_maps_to_soccer(self):
        assert BIA_SPORT_MAP["fb_htft"] == "Soccer"

    def test_tennis_maps(self):
        assert BIA_SPORT_MAP["tennis"] == "Tennis"

    def test_basket_maps(self):
        assert BIA_SPORT_MAP["basket"] == "Basketball"

    def test_unknown_sport_returns_empty(self):
        assert BIA_SPORT_MAP.get("sepaktakraw") is None
