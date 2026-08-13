from __future__ import annotations

from core.compact_dom_snapshot import _games_from_tables, has_compact_empty_state


class _FakePage:
    def __init__(self, body: str, *, has_tabs: bool = True):
        self.body = body
        self.has_tabs = has_tabs

    def evaluate(self, script):
        if "document.readyState" not in script:
            raise AssertionError(f"Unexpected evaluate script: {script}")
        body_text = self.body.lower()
        outright_only = any(
            token in body_text
            for token in ("live outright", "today outright", "early outright")
        )
        return self.has_tabs and (
            "no event available" in body_text
            or "no events available" in body_text
            or "no events" in body_text
            or outright_only
        )


def test_has_compact_empty_state_accepts_no_events_marker():
    page = _FakePage("No events available for the selected market")

    assert has_compact_empty_state(page) is True


def test_has_compact_empty_state_accepts_outright_only_page():
    page = _FakePage("VOLLEYBALL EARLY OUTRIGHT")

    assert has_compact_empty_state(page) is True


def test_games_from_tables_does_not_treat_live_badge_only_as_inplay():
    games = _games_from_tables(
        [
            {
                "eventId": 1626745129,
                "parentId": 1626745129,
                "sportName": "Soccer",
                "leagueName": "Spain - Segunda Division",
                "home": "Almeria",
                "away": "Real Sociedad II",
                "dataLive": "0",
                "liveTmText": "Live",
                "liveScore": "",
                "liveInfo": "",
                "scores": {"home_sets": "", "away_sets": ""},
                "odds": [],
            }
        ]
    )

    assert len(games) == 1
    assert games[0]["isLive"] is False
    assert games[0]["HasScore"] is False


def test_games_from_tables_uses_generic_live_score_and_live_info_for_inplay():
    games = _games_from_tables(
        [
            {
                "eventId": 1627064387,
                "parentId": 1627064387,
                "sportName": "Soccer",
                "leagueName": "Italy - Serie C",
                "home": "Gubbio",
                "away": "Ravenna",
                "dataLive": "0",
                "liveTmText": "",
                "liveScore": "0-0",
                "liveInfo": "1H 21'",
                "scores": {"home_sets": "", "away_sets": ""},
                "odds": [],
            }
        ]
    )

    assert len(games) == 1
    assert games[0]["isLive"] is True
    assert games[0]["HomeScore"] == 0.0
    assert games[0]["AwayScore"] == 0.0
    assert games[0]["HasScore"] is True
    assert games[0]["Raw"]["has_score"] is True


def test_games_from_tables_treats_tennis_score_container_as_live_in_today_rows():
    games = _games_from_tables(
        [
            {
                "eventId": 1627071945,
                "parentId": 1627062854,
                "sportName": "Tennis",
                "leagueName": "ATP Bucharest - Qualifiers",
                "home": "Billy Harris",
                "away": "Alex Molcan",
                "dataLive": "0",
                "liveTmText": "",
                "liveScore": "",
                "liveInfo": "",
                "hasLiveScore": True,
                "scores": {
                    "home_sets": "0",
                    "away_sets": "1",
                    "home_games": "2",
                    "away_games": "1",
                    "home_points": "15",
                    "away_points": "15",
                },
                "odds": [],
            }
        ]
    )

    assert len(games) == 1
    assert games[0]["isLive"] is True
    assert games[0]["HomeScore"] == 0.0
    assert games[0]["AwayScore"] == 1.0
    assert games[0]["HasScore"] is True
    assert games[0]["Raw"]["has_score"] is True


def test_games_from_tables_extracts_more_bet_count_from_more_text():
    games = _games_from_tables(
        [
            {
                "eventId": 1627116095,
                "parentId": 1627116095,
                "sportName": "Tennis",
                "leagueName": "ITF Live",
                "home": "Giannicola Misasi",
                "away": "Ergi Kirkin",
                "dataLive": "1",
                "liveTmText": "2nd Set",
                "liveScore": "",
                "liveInfo": "",
                "hasLiveScore": True,
                "scores": {
                    "home_sets": "1",
                    "away_sets": "0",
                    "home_games": "3",
                    "away_games": "2",
                    "home_points": "",
                    "away_points": "",
                },
                "moreText": "+33",
                "moreCount": 33,
                "odds": [],
            }
        ]
    )

    assert len(games) == 1
    assert games[0]["MoreBetCount"] == 33
    assert games[0]["Raw"]["more_count"] == 33
