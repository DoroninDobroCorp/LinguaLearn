from __future__ import annotations

from core.tab_manager import TabManager


class _FakePage:
    def __init__(self, url: str, *, mode: str, auth_status: dict, runtime_owned: bool = False):
        self.url = url
        self.mode = mode
        self.auth_status = auth_status
        self._pin888_runtime_owned = runtime_owned
        self._pin888_runtime_marker = "__pin888_runtime__:hybrid" if runtime_owned else ""
        self.closed = False
        self.goto_calls: list[str] = []
        self.eval_calls: list[tuple[str, tuple]] = []

    def close(self):
        self.closed = True

    def goto(self, url, timeout=None):
        self.goto_calls.append(url)
        self.url = url

    def wait_for_timeout(self, _ms):
        return None

    def evaluate(self, script, *args):
        self.eval_calls.append((script, args))
        if "window.name = marker" in script:
            marker = str(args[0] if args else "")
            self._pin888_runtime_owned = True
            self._pin888_runtime_marker = marker
            return marker
        if "typeof window.name === 'string' ? window.name : ''" in script:
            return self._pin888_runtime_marker
        return None

    def title(self):
        return "Fake title"


class _FakeContext:
    def __init__(self, pages: list[_FakePage], new_pages: list[_FakePage]):
        self.pages = list(pages)
        self._new_pages = list(new_pages)
        self.new_page_calls = 0

    def new_page(self):
        self.new_page_calls += 1
        page = self._new_pages.pop(0)
        self.pages.append(page)
        return page


class _ExpectedPageResult:
    def __init__(self, page: _FakePage):
        self.value = page

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class _FakeContextWithExpectPage(_FakeContext):
    def __init__(self, pages: list[_FakePage], new_pages: list[_FakePage], *, expected_page: _FakePage):
        super().__init__(pages, new_pages)
        self._expected_page = expected_page
        self.expect_page_calls = 0

    def expect_page(self):
        self.expect_page_calls += 1
        self.pages.append(self._expected_page)
        return _ExpectedPageResult(self._expected_page)


def test_open_all_tabs_closes_unauthenticated_compact_candidates(monkeypatch):
    seed_page = _FakePage(
        "https://www.silverglow58.xyz/en/home",
        mode="",
        auth_status={"logged_in": True},
        runtime_owned=True,
    )
    stale_compact = _FakePage(
        "https://www.silverglow58.xyz/en/compact/sports/soccer",
        mode="today",
        auth_status={"logged_in": False, "reason": "guest mode"},
        runtime_owned=True,
    )
    fresh_compact = _FakePage(
        "about:blank",
        mode="today",
        auth_status={"logged_in": True},
    )
    context = _FakeContext([seed_page, stale_compact], [fresh_compact])
    mgr = TabManager()

    monkeypatch.setattr("core.tab_manager.check_login_status", lambda page: page.auth_status)
    monkeypatch.setattr(TabManager, "_detect_mode", lambda self, page: getattr(page, "mode", ""))
    monkeypatch.setattr(TabManager, "_switch_mode", lambda self, page, mode: setattr(page, "mode", mode) or True)

    opened = mgr.open_all_tabs(
        context,
        sport_ids=[29],
        modes=["today"],
        tab_delay_sec=0.0,
        should_continue=lambda: True,
    )

    assert len(opened) == 1
    assert opened[0].page is fresh_compact
    assert stale_compact.closed is True
    assert fresh_compact.goto_calls == ["https://www.silverglow58.xyz/en/compact/sports/soccer"]


def test_open_all_tabs_closes_unmanaged_compact_tabs(monkeypatch):
    seed_page = _FakePage(
        "https://www.silverglow58.xyz/en/home",
        mode="",
        auth_status={"logged_in": True},
        runtime_owned=True,
    )
    foreign_compact = _FakePage(
        "https://www.silverglow58.xyz/en/compact/sports/baseball",
        mode="today",
        auth_status={"logged_in": True},
        runtime_owned=True,
    )
    target_compact = _FakePage(
        "https://www.silverglow58.xyz/en/compact/sports/soccer",
        mode="today",
        auth_status={"logged_in": True},
        runtime_owned=True,
    )
    context = _FakeContext([seed_page, foreign_compact, target_compact], [])
    mgr = TabManager()

    monkeypatch.setattr("core.tab_manager.check_login_status", lambda page: page.auth_status)
    monkeypatch.setattr(TabManager, "_detect_mode", lambda self, page: getattr(page, "mode", ""))
    monkeypatch.setattr(TabManager, "_switch_mode", lambda self, page, mode: setattr(page, "mode", mode) or True)

    opened = mgr.open_all_tabs(
        context,
        sport_ids=[29],
        modes=["today"],
        tab_delay_sec=0.0,
        should_continue=lambda: True,
    )

    assert len(opened) == 1
    assert opened[0].page is target_compact
    assert foreign_compact.closed is True


def test_open_all_tabs_closes_unmanaged_noncompact_site_tabs(monkeypatch):
    seed_page = _FakePage(
        "https://www.silverglow58.xyz/en/home",
        mode="",
        auth_status={"logged_in": True},
        runtime_owned=True,
    )
    live_casino = _FakePage(
        "https://www.silverglow58.xyz/en/live-casino",
        mode="",
        auth_status={"logged_in": True},
        runtime_owned=True,
    )
    target_compact = _FakePage(
        "https://www.silverglow58.xyz/en/compact/sports/soccer",
        mode="today",
        auth_status={"logged_in": True},
        runtime_owned=True,
    )
    foreign_page = _FakePage(
        "https://admin.ibet.team/pinnacle-monitor",
        mode="",
        auth_status={"logged_in": True},
    )
    context = _FakeContext([seed_page, live_casino, target_compact, foreign_page], [])
    mgr = TabManager()

    monkeypatch.setattr("core.tab_manager.check_login_status", lambda page: page.auth_status)
    monkeypatch.setattr(TabManager, "_detect_mode", lambda self, page: getattr(page, "mode", ""))
    monkeypatch.setattr(TabManager, "_switch_mode", lambda self, page, mode: setattr(page, "mode", mode) or True)

    opened = mgr.open_all_tabs(
        context,
        sport_ids=[29],
        modes=["today"],
        tab_delay_sec=0.0,
        should_continue=lambda: True,
    )

    assert len(opened) == 1
    assert opened[0].page is target_compact
    assert seed_page.closed is True
    assert live_casino.closed is True
    assert foreign_page.closed is False


def test_open_all_tabs_closes_unmanaged_noncompact_runtime_related_tabs_on_other_dynamic_host(monkeypatch):
    seed_page = _FakePage(
        "https://www.silverglow58.xyz/en/home",
        mode="",
        auth_status={"logged_in": True},
        runtime_owned=True,
    )
    stale_login = _FakePage(
        "https://www.crimsonhaven46.xyz/en/",
        mode="",
        auth_status={"logged_in": False, "reason": "sign-in controls visible"},
        runtime_owned=True,
    )
    target_compact = _FakePage(
        "https://www.silverglow58.xyz/en/compact/sports/basketball",
        mode="today",
        auth_status={"logged_in": True},
        runtime_owned=True,
    )
    context = _FakeContext([seed_page, stale_login, target_compact], [])
    mgr = TabManager()

    monkeypatch.setattr("core.tab_manager.check_login_status", lambda page: page.auth_status)
    monkeypatch.setattr(TabManager, "_detect_mode", lambda self, page: getattr(page, "mode", ""))
    monkeypatch.setattr(TabManager, "_switch_mode", lambda self, page, mode: setattr(page, "mode", mode) or True)

    opened = mgr.open_all_tabs(
        context,
        sport_ids=[4],
        modes=["today"],
        tab_delay_sec=0.0,
        should_continue=lambda: True,
    )

    assert len(opened) == 1
    assert opened[0].page is target_compact
    assert stale_login.closed is True


def test_reopen_tab_replaces_target_mode_only(monkeypatch):
    seed_page = _FakePage(
        "https://www.silverglow58.xyz/en/home",
        mode="",
        auth_status={"logged_in": True},
        runtime_owned=True,
    )
    today_page = _FakePage(
        "https://www.silverglow58.xyz/en/compact/sports/soccer",
        mode="today",
        auth_status={"logged_in": True},
        runtime_owned=True,
    )
    early_page = _FakePage(
        "https://www.silverglow58.xyz/en/compact/sports/soccer",
        mode="early",
        auth_status={"logged_in": True},
        runtime_owned=True,
    )
    replacement_page = _FakePage(
        "about:blank",
        mode="today",
        auth_status={"logged_in": True},
    )
    context = _FakeContext([seed_page, today_page, early_page], [replacement_page])
    mgr = TabManager()
    mgr.tabs[(29, "today")] = type("FakeTab", (), {"page": today_page})()

    monkeypatch.setattr("core.tab_manager.check_login_status", lambda page: page.auth_status)
    monkeypatch.setattr(TabManager, "_detect_mode", lambda self, page: getattr(page, "mode", ""))
    monkeypatch.setattr(TabManager, "_switch_mode", lambda self, page, mode: setattr(page, "mode", mode) or True)

    tab = mgr.reopen_tab(context, 29, "today", tab_delay_sec=0.0)

    assert tab is not None
    assert today_page.closed is True
    assert early_page.closed is False
    assert replacement_page.goto_calls == ["https://www.silverglow58.xyz/en/compact/sports/soccer"]
    assert mgr.get_tab(29, "today").page is replacement_page


def test_open_all_tabs_ignores_non_runtime_compact_tabs(monkeypatch):
    user_compact = _FakePage(
        "https://www.silverglow58.xyz/en/compact/sports/soccer",
        mode="today",
        auth_status={"logged_in": True},
        runtime_owned=False,
    )
    runtime_seed = _FakePage(
        "https://www.silverglow58.xyz/en/home",
        mode="",
        auth_status={"logged_in": True},
        runtime_owned=True,
    )
    replacement_page = _FakePage(
        "about:blank",
        mode="today",
        auth_status={"logged_in": True},
    )
    context = _FakeContext([user_compact, runtime_seed], [replacement_page])
    mgr = TabManager()
    mgr._host = "www.silverglow58.xyz"

    monkeypatch.setattr("core.tab_manager.check_login_status", lambda page: page.auth_status)
    monkeypatch.setattr(TabManager, "_detect_mode", lambda self, page: getattr(page, "mode", ""))
    monkeypatch.setattr(TabManager, "_switch_mode", lambda self, page, mode: setattr(page, "mode", mode) or True)

    opened = mgr.open_all_tabs(
        context,
        sport_ids=[29],
        modes=["today"],
        tab_delay_sec=0.0,
        should_continue=lambda: True,
    )

    assert len(opened) == 1
    assert opened[0].page is replacement_page
    assert replacement_page.goto_calls == ["https://www.silverglow58.xyz/en/compact/sports/soccer"]
    assert user_compact.closed is False


def test_new_runtime_page_uses_runtime_owned_opener_window():
    user_page = _FakePage(
        "https://www.silverglow58.xyz/en/compact/sports/soccer",
        mode="today",
        auth_status={"logged_in": True},
        runtime_owned=False,
    )
    runtime_opener = _FakePage(
        "https://www.silverglow58.xyz/en/home",
        mode="",
        auth_status={"logged_in": True},
        runtime_owned=True,
    )
    opened_page = _FakePage(
        "about:blank",
        mode="",
        auth_status={"logged_in": True},
    )
    fallback_page = _FakePage(
        "about:blank",
        mode="",
        auth_status={"logged_in": True},
    )
    context = _FakeContextWithExpectPage(
        [user_page, runtime_opener],
        [fallback_page],
        expected_page=opened_page,
    )
    mgr = TabManager()

    page = mgr._new_runtime_page(context)

    assert page is opened_page
    assert context.expect_page_calls == 1
    assert context.new_page_calls == 0
    assert any("window.open('about:blank', '_blank')" in script for script, _args in runtime_opener.eval_calls)
    assert not any("window.open('about:blank', '_blank')" in script for script, _args in user_page.eval_calls)
    assert opened_page._pin888_runtime_owned is True
