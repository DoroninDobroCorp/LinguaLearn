from services.bia_event_matcher import match_bia_event, match_bia_event_exact


def test_unknown_bia_sport_cannot_cross_match_by_team_names():
    events = {
        101: {
            "Home": "Same Team A",
            "Away": "Same Team B",
            "SportName": "Baseball",
        },
    }

    assert match_bia_event_exact(
        "Same Team A", "Same Team B", "unknown-sport", events,
    ) == (None, False)
    assert match_bia_event(
        "Same Team A", "Same Team B", "unknown-sport", events,
    ) == (None, False)


def test_major_bia_sports_keep_exact_sport_identity():
    events = {
        101: {
            "Home": "Same Team A",
            "Away": "Same Team B",
            "SportName": "Baseball",
        },
        202: {
            "Home": "Same Team A",
            "Away": "Same Team B",
            "SportName": "Cricket",
        },
    }

    assert match_bia_event_exact(
        "Same Team A", "Same Team B", "baseball", events,
    ) == (101, False)
    assert match_bia_event_exact(
        "Same Team A", "Same Team B", "cricket", events,
    ) == (202, False)


def test_american_football_uses_parser_canonical_sport_name():
    events = {
        101: {
            "Home": "Kansas City Chiefs",
            "Away": "Denver Broncos",
            "SportName": "AmericanFootball",
        },
    }

    assert match_bia_event_exact(
        "Kansas City Chiefs", "Denver Broncos", "af", events,
    ) == (101, False)


def test_sport_label_case_and_separator_variants_keep_exact_identity():
    events = {
        101: {
            "Home": "NRG (Kills)",
            "Away": "Cupid (Kills)",
            "SportName": "Esports",
        },
        202: {
            "Home": "Western Bulldogs",
            "Away": "North Melbourne Kangaroos",
            "SportName": "Aussie Rules",
        },
    }

    assert match_bia_event_exact(
        "LoL - NRG", "LoL - Cupid eSports", "esports", events,
    ) == (101, False)
    assert match_bia_event_exact(
        "Western Bulldogs", "North Melbourne Kangaroos", "arf", events,
    ) == (202, False)
