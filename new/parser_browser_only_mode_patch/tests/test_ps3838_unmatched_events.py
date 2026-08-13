import asyncio

import orjson

import ps3838_server
from state import ParserState


class _FakeBiaStats:
    def __init__(self):
        self._matched_event_cache = {
            ("stale-cache",): (999, False),
        }
        self._event_registry = {
            (1, "fb", "current"): {
                "home": "alpha",
                "away": "beta",
                "competition_name": "league-a",
            },
            (2, "fb", "stale"): {
                "home": "ghost",
                "away": "phantom",
                "competition_name": "league-b",
            },
        }


def test_unmatched_events_ignores_stale_matched_pids(monkeypatch):
    test_state = ParserState()
    test_state.events_data = {
        101: {
            "Pid": 101,
            "SportName": "Soccer",
            "LeagueName": "league-a",
            "homeName": "alpha",
            "awayName": "beta",
            "isLive": True,
        },
        202: {
            "Pid": 202,
            "SportName": "Soccer",
            "LeagueName": "league-c",
            "homeName": "gamma",
            "awayName": "delta",
            "isLive": False,
        },
    }

    def fake_match_bia_event_exact(bia_home, bia_away, sport_code, events_data, bia_league=None, exact_index=None):
        if bia_home == "alpha":
            return 101, False
        if bia_home == "ghost":
            return 999, False
        return None, False

    monkeypatch.setattr(ps3838_server, "state", test_state, raising=False)

    import services.bia_observer as bia_observer
    import services.bia_event_matcher as bia_event_matcher

    monkeypatch.setattr(bia_observer, "_current_stats", _FakeBiaStats(), raising=False)
    monkeypatch.setattr(bia_event_matcher, "build_exact_match_index", lambda _events: {"ok": True})
    monkeypatch.setattr(bia_event_matcher, "match_bia_event_exact", fake_match_bia_event_exact)
    monkeypatch.setattr(bia_event_matcher, "BIA_SPORT_MAP", {"fb": "Soccer"}, raising=False)

    status, _headers, body = asyncio.run(ps3838_server.process_request("/unmatched-events", {}))
    payload = orjson.loads(body)

    assert int(status) == 200
    assert payload["total_events"] == 2
    assert payload["cache_matched_pids"] == 0
    assert payload["full_matched_pids"] == 1
    assert payload["unmatched_total"] == 1
    assert payload["match_rate_pct"] == 50.0
    assert payload["samples"]["Soccer"][0]["pid"] == 202
