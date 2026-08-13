from __future__ import annotations


class _FakePage:
    def __init__(self, url: str, *, mode: str, auth_status: dict, games: int = 0, empty_state: bool = False):
        self.url = url
        self.mode = mode
        self.auth_status = auth_status
        self.games = games
        self.empty_state = empty_state

    def evaluate(self, _script):
        return {"ws": 0, "xhr": 2, "dom": 1, "fetch": 0}


class _FakeContext:
    def __init__(self, pages):
        self.pages = list(pages)


def test_inspect_expected_tabs_marks_missing_and_empty_state(monkeypatch):
    from core import tab_health

    pages = [
        _FakePage(
            "https://www.silverglow58.xyz/en/compact/sports/soccer",
            mode="today",
            auth_status={"logged_in": True},
            games=3,
        ),
        _FakePage(
            "https://www.silverglow58.xyz/en/compact/sports/tennis",
            mode="early",
            auth_status={"logged_in": True},
            games=0,
            empty_state=True,
        ),
    ]
    context = _FakeContext(pages)

    monkeypatch.setattr(tab_health, "detect_compact_mode", lambda page: page.mode)
    monkeypatch.setattr(tab_health, "check_login_status", lambda page: page.auth_status)
    monkeypatch.setattr(tab_health, "extract_compact_games_from_page", lambda page: [{}] * page.games)
    monkeypatch.setattr(tab_health, "has_compact_empty_state", lambda page: page.empty_state)

    report = tab_health.inspect_expected_tabs(context, sport_ids=[29, 33], modes=["today", "early"])

    by_key = {(row["sport_id"], row["mode"]): row for row in report["rows"]}

    assert by_key[(29, "today")]["ok"] is True
    assert by_key[(33, "early")]["ok"] is True
    assert by_key[(29, "early")]["reason"] == "missing"
    assert by_key[(33, "today")]["reason"] == "missing"
    assert report["totals"]["broken"] == 2
