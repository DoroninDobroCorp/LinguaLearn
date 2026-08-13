"""Tests for tab page lifecycle: loading detection, grace periods, repair gating."""
from __future__ import annotations

import time

import pytest


# ---------------------------------------------------------------------------
# Fake page / context helpers
# ---------------------------------------------------------------------------

class _FakePage:
    """Fake Playwright page for testing page state classification."""

    def __init__(
        self,
        url: str = "https://host/en/compact/sports/soccer",
        *,
        mode: str = "today",
        auth_status: dict | None = None,
        games: int = 0,
        empty_state: bool = False,
        loading: bool = False,
    ):
        self.url = url
        self.mode = mode
        self.auth_status = auth_status or {"logged_in": True}
        self.games = games
        self.empty_state = empty_state
        self.loading = loading

    def evaluate(self, _script):
        return {"ws": 0, "xhr": 2, "dom": 1, "fetch": 0}

    def wait_for_load_state(self, *_a, **_kw):
        pass

    def wait_for_timeout(self, _ms):
        pass


class _FakeContext:
    def __init__(self, pages):
        self.pages = list(pages)


# ---------------------------------------------------------------------------
# 1. classify_compact_page_state — loading, loaded, empty, broken
# ---------------------------------------------------------------------------

class TestClassifyCompactPageState:
    """Verify the new page state classifier."""

    def test_loading_page_returns_loading(self, monkeypatch):
        from core.compact_dom_snapshot import TabPageState, classify_compact_page_state

        page = _FakePage(loading=True)
        monkeypatch.setattr(
            "core.compact_dom_snapshot.has_compact_loading_state",
            lambda p: p.loading,
        )
        assert classify_compact_page_state(page) == TabPageState.LOADING

    def test_page_with_games_returns_loaded(self, monkeypatch):
        from core.compact_dom_snapshot import TabPageState, classify_compact_page_state

        page = _FakePage(games=5)
        monkeypatch.setattr("core.compact_dom_snapshot.has_compact_loading_state", lambda p: False)
        monkeypatch.setattr(
            "core.compact_dom_snapshot.extract_compact_games_from_page",
            lambda p: [{}] * p.games,
        )
        assert classify_compact_page_state(page) == TabPageState.LOADED_WITH_GAMES

    def test_page_with_games_precomputed(self, monkeypatch):
        from core.compact_dom_snapshot import TabPageState, classify_compact_page_state

        page = _FakePage()
        monkeypatch.setattr("core.compact_dom_snapshot.has_compact_loading_state", lambda p: False)
        assert classify_compact_page_state(page, games=[{"Pid": 1}]) == TabPageState.LOADED_WITH_GAMES

    def test_empty_valid_page(self, monkeypatch):
        from core.compact_dom_snapshot import TabPageState, classify_compact_page_state

        page = _FakePage(empty_state=True)
        monkeypatch.setattr("core.compact_dom_snapshot.has_compact_loading_state", lambda p: False)
        monkeypatch.setattr("core.compact_dom_snapshot.extract_compact_games_from_page", lambda p: [])
        monkeypatch.setattr("core.compact_dom_snapshot.has_compact_empty_state", lambda p: p.empty_state)
        assert classify_compact_page_state(page) == TabPageState.EMPTY_BUT_VALID

    def test_broken_page_no_games_no_empty(self, monkeypatch):
        from core.compact_dom_snapshot import TabPageState, classify_compact_page_state

        page = _FakePage()
        monkeypatch.setattr("core.compact_dom_snapshot.has_compact_loading_state", lambda p: False)
        monkeypatch.setattr("core.compact_dom_snapshot.extract_compact_games_from_page", lambda p: [])
        monkeypatch.setattr("core.compact_dom_snapshot.has_compact_empty_state", lambda p: False)
        assert classify_compact_page_state(page) == TabPageState.BROKEN

    def test_extract_exception_returns_broken(self, monkeypatch):
        from core.compact_dom_snapshot import TabPageState, classify_compact_page_state

        page = _FakePage()
        monkeypatch.setattr("core.compact_dom_snapshot.has_compact_loading_state", lambda p: False)
        monkeypatch.setattr(
            "core.compact_dom_snapshot.extract_compact_games_from_page",
            lambda p: (_ for _ in ()).throw(RuntimeError("boom")),
        )
        assert classify_compact_page_state(page) == TabPageState.BROKEN

    def test_loading_check_exception_returns_broken(self, monkeypatch):
        from core.compact_dom_snapshot import TabPageState, classify_compact_page_state

        page = _FakePage()

        def blow_up(p):
            raise RuntimeError("CDP lost")

        monkeypatch.setattr("core.compact_dom_snapshot.has_compact_loading_state", blow_up)
        assert classify_compact_page_state(page) == TabPageState.BROKEN


# ---------------------------------------------------------------------------
# 2. inspect_expected_tabs — loading pages are NOT marked broken
# ---------------------------------------------------------------------------

class TestInspectLoadingNotBroken:
    """The central bug: loading pages must NOT appear in broken_keys."""

    def test_loading_page_is_ok(self, monkeypatch):
        from core import tab_health
        from core.compact_dom_snapshot import TabPageState

        page = _FakePage(
            "https://host/en/compact/sports/soccer",
            mode="early",
            auth_status={"logged_in": True},
            games=0,
            loading=True,
        )
        context = _FakeContext([page])

        monkeypatch.setattr(tab_health, "detect_compact_mode", lambda p: p.mode)
        monkeypatch.setattr(tab_health, "check_login_status", lambda p: p.auth_status)
        monkeypatch.setattr(tab_health, "extract_compact_games_from_page", lambda p: [])
        monkeypatch.setattr(tab_health, "has_compact_empty_state", lambda p: False)
        monkeypatch.setattr(
            tab_health,
            "classify_compact_page_state",
            lambda p, games=None: TabPageState.LOADING if p.loading else TabPageState.BROKEN,
        )

        report = tab_health.inspect_expected_tabs(context, sport_ids=[29], modes=["early"])
        assert report["broken_keys"] == []
        row = report["rows"][0]
        assert row["ok"] is True
        assert row["page_state"] == "loading"

    def test_loaded_page_still_ok(self, monkeypatch):
        from core import tab_health
        from core.compact_dom_snapshot import TabPageState

        page = _FakePage(
            "https://host/en/compact/sports/soccer",
            mode="early",
            auth_status={"logged_in": True},
            games=3,
        )
        context = _FakeContext([page])

        monkeypatch.setattr(tab_health, "detect_compact_mode", lambda p: p.mode)
        monkeypatch.setattr(tab_health, "check_login_status", lambda p: p.auth_status)
        monkeypatch.setattr(tab_health, "extract_compact_games_from_page", lambda p: [{}] * p.games)
        monkeypatch.setattr(tab_health, "has_compact_empty_state", lambda p: False)
        monkeypatch.setattr(
            tab_health,
            "classify_compact_page_state",
            lambda p, games=None: TabPageState.LOADED_WITH_GAMES if (games or p.games) else TabPageState.BROKEN,
        )

        report = tab_health.inspect_expected_tabs(context, sport_ids=[29], modes=["early"])
        assert report["broken_keys"] == []
        assert report["rows"][0]["ok"] is True

    def test_broken_page_still_broken(self, monkeypatch):
        from core import tab_health
        from core.compact_dom_snapshot import TabPageState

        page = _FakePage(
            "https://host/en/compact/sports/soccer",
            mode="early",
            auth_status={"logged_in": True},
            games=0,
        )
        context = _FakeContext([page])

        monkeypatch.setattr(tab_health, "detect_compact_mode", lambda p: p.mode)
        monkeypatch.setattr(tab_health, "check_login_status", lambda p: p.auth_status)
        monkeypatch.setattr(tab_health, "extract_compact_games_from_page", lambda p: [])
        monkeypatch.setattr(tab_health, "has_compact_empty_state", lambda p: False)
        monkeypatch.setattr(
            tab_health,
            "classify_compact_page_state",
            lambda p, games=None: TabPageState.BROKEN,
        )

        report = tab_health.inspect_expected_tabs(context, sport_ids=[29], modes=["early"])
        assert report["broken_keys"] == [(29, "early")]
        assert report["rows"][0]["ok"] is False


# ---------------------------------------------------------------------------
# 3. Transport tick() — freshly opened streams should not instantly stall
# ---------------------------------------------------------------------------

class TestTransportGrace:
    """Streams with opened_ts should not STALL prematurely."""

    def test_fresh_stream_does_not_stall_immediately(self):
        from core.hybrid_transport import HybridTransportManager

        mgr = HybridTransportManager(stall_threshold_sec=30.0)
        now = time.time()
        mgr.register_stream(29, "early", opened_ts=now)

        # Tick immediately after registration — should NOT stall
        stalled = mgr.tick(now=now + 5)
        assert stalled == []

    def test_fresh_stream_stalls_after_threshold(self):
        from core.hybrid_transport import HybridTransportManager

        mgr = HybridTransportManager(stall_threshold_sec=30.0)
        now = time.time()
        mgr.register_stream(29, "early", opened_ts=now)

        stalled = mgr.tick(now=now + 31)
        assert stalled == [(29, "early")]

    def test_stream_with_data_uses_data_ts_not_opened(self):
        from core.hybrid_transport import HybridTransportManager

        mgr = HybridTransportManager(stall_threshold_sec=30.0)
        now = time.time()
        mgr.register_stream(29, "early", opened_ts=now - 100)
        mgr.report_ws_data(29, "early", now=now)

        # 20s after last data — should not stall
        stalled = mgr.tick(now=now + 20)
        assert stalled == []

        # 31s after last data — should stall
        stalled = mgr.tick(now=now + 31)
        # stream already transitioned in first tick? No — first tick didn't stall.
        # But now 31s since last data
        assert (29, "early") in stalled or mgr.streams[(29, "early")].transport.value == "stalled"

    def test_reopened_stream_resets_grace(self):
        from core.hybrid_transport import HybridTransportManager, Transport

        mgr = HybridTransportManager(stall_threshold_sec=30.0)
        now = time.time()
        mgr.register_stream(29, "early", opened_ts=now - 100)
        mgr.report_ws_data(29, "early", now=now - 50)

        # Force stall
        mgr.tick(now=now)
        ss = mgr.streams[(29, "early")]
        assert ss.transport == Transport.STALLED

        # Simulate reopen: reset transport + update opened_ts
        ss.transport = Transport.BROWSER_WS
        ss.last_data_ts = 0.0
        ss.opened_ts = now

        # Tick 10s later — should not stall because opened_ts is fresh
        stalled = mgr.tick(now=now + 10)
        assert (29, "early") not in stalled


# ---------------------------------------------------------------------------
# 4. Auto-repair constants sanity
# ---------------------------------------------------------------------------

class TestAutoRepairConstants:
    def test_startup_grace_is_at_least_60(self):
        from core.hybrid_runner import AUTO_REPAIR_STARTUP_GRACE_SEC
        assert AUTO_REPAIR_STARTUP_GRACE_SEC >= 60.0

    def test_cooldown_is_at_least_90(self):
        from core.hybrid_runner import AUTO_REPAIR_COOLDOWN_SEC
        assert AUTO_REPAIR_COOLDOWN_SEC >= 90.0

    def test_tab_grace_is_at_least_60(self):
        from core.hybrid_runner import AUTO_REPAIR_TAB_GRACE_SEC
        assert AUTO_REPAIR_TAB_GRACE_SEC >= 60.0


# ---------------------------------------------------------------------------
# 5. TabPageState enum
# ---------------------------------------------------------------------------

class TestTabPageStateEnum:
    def test_values(self):
        from core.compact_dom_snapshot import TabPageState
        assert TabPageState.LOADING.value == "loading"
        assert TabPageState.LOADED_WITH_GAMES.value == "loaded_with_games"
        assert TabPageState.EMPTY_BUT_VALID.value == "empty_but_valid"
        assert TabPageState.BROKEN.value == "broken"

    def test_is_str_enum(self):
        from core.compact_dom_snapshot import TabPageState
        assert isinstance(TabPageState.LOADING, str)
        assert TabPageState.LOADING == "loading"


# ---------------------------------------------------------------------------
# 6. TabInfo reload tracking
# ---------------------------------------------------------------------------

class TestTabInfoReload:
    """TabInfo now tracks reload_count and last_reload_ts."""

    def test_initial_reload_count_is_zero(self):
        from core.tab_manager import TabInfo

        class FakePage:
            url = "https://host/en/compact/sports/soccer"

        tab = TabInfo(FakePage(), 29, "today", "host")
        assert tab.reload_count == 0
        assert tab.last_reload_ts == 0.0

    def test_reload_count_increments(self):
        from core.tab_manager import TabInfo

        class FakePage:
            url = "https://host/en/compact/sports/soccer"

        tab = TabInfo(FakePage(), 29, "today", "host")
        tab.reload_count += 1
        assert tab.reload_count == 1
        tab.reload_count += 1
        assert tab.reload_count == 2


# ---------------------------------------------------------------------------
# 7. reload_tab method
# ---------------------------------------------------------------------------

class TestReloadTab:
    """TabManager.reload_tab should reload without close+reopen."""

    def test_reload_nonexistent_tab_returns_false(self):
        from core.tab_manager import TabManager
        mgr = TabManager()
        assert mgr.reload_tab(29, "today") is False

    def test_reload_existing_tab_succeeds(self):
        from core.tab_manager import TabInfo, TabManager

        reload_called = []

        class FakePage:
            url = "https://host/en/compact/sports/soccer"
            def reload(self, **kw):
                reload_called.append(kw)
            def wait_for_timeout(self, ms):
                pass

        mgr = TabManager()
        tab = TabInfo(FakePage(), 29, "today", "host")
        mgr.tabs[(29, "today")] = tab
        old_ts = tab.open_ts

        result = mgr.reload_tab(29, "today")
        assert result is True
        assert len(reload_called) == 1
        assert tab.reload_count == 1
        assert tab.last_reload_ts > 0
        assert tab.open_ts >= old_ts  # grace period reset

    def test_reload_exception_returns_false(self):
        from core.tab_manager import TabInfo, TabManager

        class FakePage:
            url = "https://host/en/compact/sports/soccer"
            def reload(self, **kw):
                raise RuntimeError("page crashed")
            def wait_for_timeout(self, ms):
                pass

        mgr = TabManager()
        tab = TabInfo(FakePage(), 29, "today", "host")
        mgr.tabs[(29, "today")] = tab

        result = mgr.reload_tab(29, "today")
        assert result is False
        assert tab.reload_count == 0  # not incremented on failure


# ---------------------------------------------------------------------------
# 8. MAX_RELOAD_BEFORE_REOPEN constant
# ---------------------------------------------------------------------------

class TestMaxReloadConstant:
    def test_max_reload_exists_and_positive(self):
        from core.hybrid_runner import MAX_RELOAD_BEFORE_REOPEN
        assert MAX_RELOAD_BEFORE_REOPEN >= 1
        assert MAX_RELOAD_BEFORE_REOPEN <= 5
