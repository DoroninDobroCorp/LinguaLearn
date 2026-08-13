import asyncio
import json
import os
import sys
import threading
import time
import types

import pytest

import core.connection as connection
import ps3838_server
import core.session_manager as session_manager
import core.stale_detector as stale_detector
from state import state


def _auth_state_snapshot():
    return {
        "login_fatal": state.login_fatal,
        "login_fatal_reason": state.login_fatal_reason,
        "session_revalidation_required": state.session_revalidation_required,
        "session_revalidation_baseline_mtime": state.session_revalidation_baseline_mtime,
        "auth_block_reason": state.auth_block_reason,
        "auth_block_until": state.auth_block_until,
        "auth_block_manual": state.auth_block_manual,
        "auth_block_last_log_ts": state.auth_block_last_log_ts,
        "auth_block_last_marker": state.auth_block_last_marker,
        "startup_login_attempted": state.startup_login_attempted,
        "startup_login_completed": state.startup_login_completed,
        "runtime_401_relogin_epoch": state.runtime_401_relogin_epoch,
        "runtime_401_relogin_ts": state.runtime_401_relogin_ts,
        "runtime_401_relogin_reason": state.runtime_401_relogin_reason,
        "runtime_lock_acquired": state.runtime_lock_acquired,
        "runtime_lock_path": state.runtime_lock_path,
        "browser_page": state.browser_page,
        "startup_canary_label": state.startup_canary_label,
        "startup_canary_started_ts": state.startup_canary_started_ts,
        "startup_canary_success": state.startup_canary_success,
        "startup_canary_abort_reason": state.startup_canary_abort_reason,
        "startup_auth_failure_count": state.startup_auth_failure_count,
        "startup_auth_circuit_open": state.startup_auth_circuit_open,
        "startup_auth_circuit_reason": state.startup_auth_circuit_reason,
        "force_v_hucode_browser": state.force_v_hucode_browser,
        "force_clean_session": state.force_clean_session,
        "ps3838_connect_count": state.ps3838_connect_count,
        "last_refresh_ts": state.last_refresh_ts,
        "last_refresh_reason": state.last_refresh_reason,
        "session_refresh_attempt_count": state.session_refresh_attempt_count,
        "multiple_login_refresh_attempt_ts": list(state.multiple_login_refresh_attempt_ts),
        "running": state.running,
        "is_logged_in": state.is_logged_in,
        "stale": state.stale,
        "stale_reason": state.stale_reason,
        "cf_consecutive_403": state.cf_consecutive_403,
        "session_ws401_count": state.session_ws401_count,
        "session_first_ws401_ts": state.session_first_ws401_ts,
        "session_last_ws401_ts": state.session_last_ws401_ts,
        "session_soft_refresh_attempt_count": state.session_soft_refresh_attempt_count,
        "session_soft_refresh_success_count": state.session_soft_refresh_success_count,
        "session_soft_refresh_fail_count": state.session_soft_refresh_fail_count,
        "session_last_soft_refresh_ts": state.session_last_soft_refresh_ts,
        "session_last_soft_refresh_mode": state.session_last_soft_refresh_mode,
        "session_last_soft_refresh_reason": state.session_last_soft_refresh_reason,
        "session_last_soft_refresh_fail_ts": state.session_last_soft_refresh_fail_ts,
        "session_last_soft_refresh_fail_mode": state.session_last_soft_refresh_fail_mode,
        "session_last_soft_refresh_fail_reason": state.session_last_soft_refresh_fail_reason,
        "account_incidents": list(state.account_incidents),
        "account_incident_seq": state.account_incident_seq,
        "account_last_incident_ts": state.account_last_incident_ts,
        "account_route_mismatch_count": state.account_route_mismatch_count,
        "account_last_route_mismatch_reason": state.account_last_route_mismatch_reason,
        "sport_ws_429_backoff_until": dict(getattr(state, "sport_ws_429_backoff_until", {})),
        "lane_ws_429_streak": dict(getattr(state, "lane_ws_429_streak", {})),
        "lane_ws_429_last_ts": dict(getattr(state, "lane_ws_429_last_ts", {})),
        "proxy_expected": getattr(state, "proxy_expected", False),
        "proxy_route_mode": getattr(state, "proxy_route_mode", "direct"),
        "proxy_route_reason": getattr(state, "proxy_route_reason", ""),
    }


def _restore_auth_state(snapshot):
    state.login_fatal = snapshot["login_fatal"]
    state.login_fatal_reason = snapshot["login_fatal_reason"]
    state.session_revalidation_required = snapshot["session_revalidation_required"]
    state.session_revalidation_baseline_mtime = snapshot["session_revalidation_baseline_mtime"]
    state.auth_block_reason = snapshot["auth_block_reason"]
    state.auth_block_until = snapshot["auth_block_until"]
    state.auth_block_manual = snapshot["auth_block_manual"]
    state.auth_block_last_log_ts = snapshot["auth_block_last_log_ts"]
    state.auth_block_last_marker = snapshot["auth_block_last_marker"]
    state.startup_login_attempted = snapshot["startup_login_attempted"]
    state.startup_login_completed = snapshot["startup_login_completed"]
    state.runtime_401_relogin_epoch = snapshot["runtime_401_relogin_epoch"]
    state.runtime_401_relogin_ts = snapshot["runtime_401_relogin_ts"]
    state.runtime_401_relogin_reason = snapshot["runtime_401_relogin_reason"]
    state.runtime_lock_acquired = snapshot["runtime_lock_acquired"]
    state.runtime_lock_path = snapshot["runtime_lock_path"]
    state.browser_page = snapshot["browser_page"]
    state.startup_canary_label = snapshot["startup_canary_label"]
    state.startup_canary_started_ts = snapshot["startup_canary_started_ts"]
    state.startup_canary_success = snapshot["startup_canary_success"]
    state.startup_canary_abort_reason = snapshot["startup_canary_abort_reason"]
    state.startup_auth_failure_count = snapshot["startup_auth_failure_count"]
    state.startup_auth_circuit_open = snapshot["startup_auth_circuit_open"]
    state.startup_auth_circuit_reason = snapshot["startup_auth_circuit_reason"]
    state.force_v_hucode_browser = snapshot["force_v_hucode_browser"]
    state.force_clean_session = snapshot["force_clean_session"]
    state.ps3838_connect_count = snapshot["ps3838_connect_count"]
    state.last_refresh_ts = snapshot["last_refresh_ts"]
    state.last_refresh_reason = snapshot["last_refresh_reason"]
    state.session_refresh_attempt_count = snapshot["session_refresh_attempt_count"]
    state.multiple_login_refresh_attempt_ts = list(snapshot["multiple_login_refresh_attempt_ts"])
    state.running = snapshot["running"]
    state.is_logged_in = snapshot["is_logged_in"]
    state.stale = snapshot["stale"]
    state.stale_reason = snapshot["stale_reason"]
    state.cf_consecutive_403 = snapshot["cf_consecutive_403"]
    state.session_ws401_count = snapshot["session_ws401_count"]
    state.session_first_ws401_ts = snapshot["session_first_ws401_ts"]
    state.session_last_ws401_ts = snapshot["session_last_ws401_ts"]
    state.session_soft_refresh_attempt_count = snapshot["session_soft_refresh_attempt_count"]
    state.session_soft_refresh_success_count = snapshot["session_soft_refresh_success_count"]
    state.session_soft_refresh_fail_count = snapshot["session_soft_refresh_fail_count"]
    state.session_last_soft_refresh_ts = snapshot["session_last_soft_refresh_ts"]
    state.session_last_soft_refresh_mode = snapshot["session_last_soft_refresh_mode"]
    state.session_last_soft_refresh_reason = snapshot["session_last_soft_refresh_reason"]
    state.session_last_soft_refresh_fail_ts = snapshot["session_last_soft_refresh_fail_ts"]
    state.session_last_soft_refresh_fail_mode = snapshot["session_last_soft_refresh_fail_mode"]
    state.session_last_soft_refresh_fail_reason = snapshot["session_last_soft_refresh_fail_reason"]
    state.account_incidents = list(snapshot["account_incidents"])
    state.account_incident_seq = snapshot["account_incident_seq"]
    state.account_last_incident_ts = snapshot["account_last_incident_ts"]
    state.account_route_mismatch_count = snapshot["account_route_mismatch_count"]
    state.account_last_route_mismatch_reason = snapshot["account_last_route_mismatch_reason"]
    state.sport_ws_429_backoff_until = dict(snapshot["sport_ws_429_backoff_until"])
    state.lane_ws_429_streak = dict(snapshot["lane_ws_429_streak"])
    state.lane_ws_429_last_ts = dict(snapshot["lane_ws_429_last_ts"])
    state.proxy_expected = snapshot["proxy_expected"]
    state.proxy_route_mode = snapshot["proxy_route_mode"]
    state.proxy_route_reason = snapshot["proxy_route_reason"]


def _patch_listen_group_gates(monkeypatch):
    async def _false(*args, **kwargs):
        return False

    async def _true(*args, **kwargs):
        return True

    monkeypatch.setattr(connection, "_wait_if_auth_blocked", _false)
    monkeypatch.setattr(connection, "_maybe_startup_login", _true)
    monkeypatch.setattr(connection, "_await_startup_canary_gate", _true)
    monkeypatch.setattr(connection, "_throttled_status_log", lambda *args, **kwargs: None)


def _patch_invalid_status_runtime(monkeypatch, status_code: int, *, refresh_result=None):
    sleep_calls = []
    statuses = []
    broadcasts = []

    class _FakeInvalidStatus(Exception):
        def __init__(self, code):
            self.response = types.SimpleNamespace(status_code=code)
            super().__init__(f"status {code}")

    class _FailingConnect:
        async def __aenter__(self):
            raise _FakeInvalidStatus(status_code)

        async def __aexit__(self, exc_type, exc, tb):
            return False

    async def _open_proxy_socket(_ws_url):
        return None

    async def _set_status(*args, **kwargs):
        statuses.append((args, kwargs))

    async def _broadcast(payload):
        broadcasts.append(payload)

    async def _sleep(delay):
        sleep_calls.append(delay)
        state.running = False

    monkeypatch.setattr(connection.websockets.exceptions, "InvalidStatus", _FakeInvalidStatus)
    monkeypatch.setattr(connection.websockets, "connect", lambda *args, **kwargs: _FailingConnect())
    monkeypatch.setattr(connection, "load_session", lambda refresh_ws_token=True: ("wss://example.test/ws", {"Origin": "https://example.test"}, 100.0))
    monkeypatch.setattr(connection, "open_proxy_socket", _open_proxy_socket)
    monkeypatch.setattr(connection, "set_status", _set_status)
    monkeypatch.setattr(connection, "broadcast", _broadcast)
    monkeypatch.setattr(connection, "_close_socket_safely", lambda *args, **kwargs: None)
    monkeypatch.setattr(connection, "_auth_wait_interval", lambda *_args, **_kwargs: 0.0)
    monkeypatch.setattr(connection.asyncio, "sleep", _sleep)
    if refresh_result is not None:
        monkeypatch.setattr(connection, "_refresh_ws_url_from_current_session", lambda *args, **kwargs: refresh_result)
    return sleep_calls, statuses, broadcasts


class _IdleTask:
    def __init__(self, name: str = "fake-task"):
        self._name = name
        self._cancelled = False

    def cancel(self):
        self._cancelled = True

    def get_name(self):
        return self._name

    def __await__(self):
        async def _wait():
            if self._cancelled:
                raise asyncio.CancelledError
            return None

        return _wait().__await__()


class _FakeBrowserWS:
    def __init__(self, url: str, *, close_code: int | None = None):
        self.url = url
        self._close_code = close_code
        self._handlers = {}

    def on(self, event, handler):
        self._handlers[event] = handler

    def emit_close(self):
        handler = self._handlers.get("close")
        if not handler:
            return
        if self._close_code is not None and getattr(handler, "__closure__", None):
            for cell in handler.__closure__:
                maybe_callable = getattr(cell, "cell_contents", None)
                if callable(maybe_callable):
                    maybe_callable(self._close_code)
                    return
        handler(self)


class _GuardProbePage:
    def __init__(self, *, cookie_values=None, body_values=None):
        self.cookie_values = list(cookie_values or [])
        self.body_values = list(body_values or [])

    async def evaluate(self, script, *_args):
        if "document.cookie || ''" in script:
            if not self.cookie_values:
                return ""
            if len(self.cookie_values) > 1:
                return self.cookie_values.pop(0)
            return self.cookie_values[0]
        if "document.body && document.body.innerText" in script:
            if not self.body_values:
                return ""
            if len(self.body_values) > 1:
                return self.body_values.pop(0)
            return self.body_values[0]
        return ""


class _FakeBrowserPage:
    def __init__(
        self,
        *,
        guest_mode: bool = False,
        ws_url: str = "",
        close_code: int | None = None,
        browser_cookies: list | None = None,
        v_hucode: str = "",
        x_app_data: str = "",
        url: str = "",
    ):
        self.guest_mode = guest_mode
        self.ws_url = ws_url
        self.close_code = close_code
        self.browser_cookies = list(browser_cookies or [])
        self.v_hucode = v_hucode
        self.x_app_data = x_app_data
        self.url = url
        self.goto_urls = []
        self.reload_calls = 0
        self._handlers = {}
        self._emitted_ws = False
        self.context = None

    def on(self, event, handler):
        self._handlers.setdefault(event, []).append(handler)

    def _emit_ws(self):
        if self.ws_url and not self._emitted_ws:
            fake_ws = _FakeBrowserWS(self.ws_url, close_code=self.close_code)
            for handler in self._handlers.get("websocket", []):
                handler(fake_ws)
            self._emitted_ws = True
            if self.close_code is not None:
                fake_ws.emit_close()

    async def goto(self, _url, timeout=None):
        self.url = _url
        self.goto_urls.append(_url)
        self._emit_ws()

    async def reload(self, timeout=None):
        self.reload_calls += 1
        self._emit_ws()

    async def wait_for_timeout(self, _ms):
        return None

    async def wait_for_function(self, *_args, **_kwargs):
        return None

    async def route(self, *_args, **_kwargs):
        return None

    async def evaluate(self, script, *_args):
        if "document.cookie || '').length" in script:
            return 0
        if "Odds are delayed for guest users" in script:
            return self.guest_mode
        if "(window.__ps_ws_instances || []).length" in script:
            return 1 if self.ws_url else 0
        if "(window.__ps_ws_instances || []).map(ws => ws.readyState)" in script:
            return [1] if self.ws_url else []
        if "localStorage.getItem('v-hucode')" in script:
            return self.v_hucode
        if "localStorage.getItem('x-app-data')" in script:
            return self.x_app_data
        if "(window.__ps_ws_messages || []).length" in script:
            return 0
        if "(window.__ps_ws_sent || []).length" in script:
            return 0
        if "document.cookie || ''" in script:
            return ""
        if "document.body && document.body.innerText" in script:
            return ""
        return None


def _patch_fake_browser_runtime(monkeypatch, page: _FakeBrowserPage):
    class _FakePlaywrightError(Exception):
        pass

    class _FakeContext:
        def __init__(self, fake_page):
            self._page = fake_page
            self._page.context = self

        async def add_init_script(self, *_args, **_kwargs):
            return None

        async def add_cookies(self, cookies):
            self._page.browser_cookies = list(cookies)

        async def new_page(self):
            return self._page

        async def cookies(self):
            return list(self._page.browser_cookies)

    class _FakeBrowser:
        def __init__(self, fake_page):
            self._page = fake_page
            self.closed = False

        async def new_context(self, **_kwargs):
            return _FakeContext(self._page)

        async def close(self):
            self.closed = True

    class _FakeChromium:
        def __init__(self, fake_page):
            self._page = fake_page

        async def launch(self, **_kwargs):
            return _FakeBrowser(self._page)

    class _FakePlaywrightManager:
        def __init__(self, fake_page):
            self.chromium = _FakeChromium(fake_page)

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

    fake_async_api = types.ModuleType("playwright.async_api")
    fake_async_api.Error = _FakePlaywrightError
    fake_async_api.async_playwright = lambda: _FakePlaywrightManager(page)
    fake_playwright = types.ModuleType("playwright")
    fake_playwright.async_api = fake_async_api
    monkeypatch.setitem(sys.modules, "playwright", fake_playwright)
    monkeypatch.setitem(sys.modules, "playwright.async_api", fake_async_api)

    monkeypatch.setattr(connection, "validate_browser_fingerprint_config", lambda: [])
    monkeypatch.setattr(connection, "browser_proxy_settings", lambda: (None, False))
    monkeypatch.setattr(connection, "clean_cookies", lambda cookies: list(cookies or []))
    monkeypatch.setattr(connection, "browser_launch_kwargs", lambda **_kwargs: {})
    monkeypatch.setattr(connection, "browser_context_kwargs", lambda: {})
    monkeypatch.setattr(connection, "browser_stealth_init_script", lambda: "")
    monkeypatch.setattr(connection, "browser_ws_send", lambda *args, **kwargs: asyncio.sleep(0))
    monkeypatch.setattr(connection, "browser_ws_send_raw", lambda *args, **kwargs: asyncio.sleep(0))
    monkeypatch.setattr(connection, "desired_lv_values", lambda: ["1"])
    monkeypatch.setattr(connection, "PS3838_BROWSER_MANUAL_WS", False)
    monkeypatch.setattr(connection, "PS3838_BROWSER_SESSION_CHECK_SEC", 3600)


def _patch_fake_browser_runtime_cdp(monkeypatch, page: _FakeBrowserPage):
    class _FakePlaywrightError(Exception):
        pass

    counters = {
        "launch_calls": 0,
        "connect_over_cdp_calls": 0,
        "close_calls": 0,
        "last_cdp_url": None,
        "add_cookies_calls": 0,
        "last_added_cookies": None,
        "new_page_calls": 0,
    }

    class _FakeContext:
        def __init__(self, fake_page):
            self._page = fake_page
            self._page.context = self
            self.pages = [fake_page]

        async def add_init_script(self, *_args, **_kwargs):
            return None

        async def add_cookies(self, cookies):
            counters["add_cookies_calls"] += 1
            counters["last_added_cookies"] = list(cookies)
            self._page.browser_cookies = list(cookies)

        async def new_page(self):
            counters["new_page_calls"] += 1
            return self._page

        async def cookies(self):
            return list(self._page.browser_cookies)

    class _FakeBrowser:
        def __init__(self, fake_page):
            self._context = _FakeContext(fake_page)
            self.contexts = [self._context]

        async def close(self):
            counters["close_calls"] += 1

    class _FakeChromium:
        def __init__(self, fake_page):
            self._page = fake_page

        async def launch(self, **_kwargs):
            counters["launch_calls"] += 1
            return _FakeBrowser(self._page)

        async def connect_over_cdp(self, cdp_url):
            counters["connect_over_cdp_calls"] += 1
            counters["last_cdp_url"] = cdp_url
            return _FakeBrowser(self._page)

    class _FakePlaywrightManager:
        def __init__(self, fake_page):
            self.chromium = _FakeChromium(fake_page)

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

    fake_async_api = types.ModuleType("playwright.async_api")
    fake_async_api.Error = _FakePlaywrightError
    fake_async_api.async_playwright = lambda: _FakePlaywrightManager(page)
    fake_playwright = types.ModuleType("playwright")
    fake_playwright.async_api = fake_async_api
    monkeypatch.setitem(sys.modules, "playwright", fake_playwright)
    monkeypatch.setitem(sys.modules, "playwright.async_api", fake_async_api)

    monkeypatch.setattr(connection, "validate_browser_fingerprint_config", lambda: [])
    monkeypatch.setattr(connection, "browser_proxy_settings", lambda: (None, False))
    monkeypatch.setattr(connection, "clean_cookies", lambda cookies: list(cookies or []))
    monkeypatch.setattr(connection, "browser_launch_kwargs", lambda **_kwargs: {})
    monkeypatch.setattr(connection, "browser_context_kwargs", lambda: {})
    monkeypatch.setattr(connection, "browser_stealth_init_script", lambda: "")
    monkeypatch.setattr(connection, "browser_ws_send", lambda *args, **kwargs: asyncio.sleep(0))
    monkeypatch.setattr(connection, "browser_ws_send_raw", lambda *args, **kwargs: asyncio.sleep(0))
    monkeypatch.setattr(connection, "desired_lv_values", lambda: ["1"])
    monkeypatch.setattr(connection, "PS3838_BROWSER_MANUAL_WS", False)
    monkeypatch.setattr(connection, "PS3838_BROWSER_SESSION_CHECK_SEC", 3600)
    monkeypatch.setattr(connection._cfg, "PS3838_BROWSER_CDP_URL", "http://127.0.0.1:9224")
    monkeypatch.setattr(connection._cfg, "PS3838_BROWSER_ENTRY_URL", "https://b.link/ukz4v32x")
    return counters


def _patch_browser_background_tasks(monkeypatch):
    def _create_task(coro):
        try:
            coro.close()
        except Exception:
            pass
        return _IdleTask()

    monkeypatch.setattr(connection.asyncio, "create_task", _create_task)


def _patch_listen_browser_gates(monkeypatch):
    async def _false(*args, **kwargs):
        return False

    async def _true(*args, **kwargs):
        return True

    monkeypatch.setattr(connection, "_wait_if_auth_blocked", _false)
    monkeypatch.setattr(connection, "_maybe_startup_login", _true)
    monkeypatch.setattr(connection, "_startup_session_action", lambda *_args, **_kwargs: ("connect", ""))
    monkeypatch.setattr(connection, "_throttled_status_log", lambda *args, **kwargs: None)


def test_startup_session_action_old_session_prefers_passive_connect(monkeypatch):
    snapshot = _auth_state_snapshot()
    try:
        state.session_revalidation_required = False
        monkeypatch.setattr(connection, "session_too_old", lambda _: True)
        action, reason = connection._startup_session_action(100.0)
        assert action == "passive_connect"
        assert "without login" in reason
    finally:
        _restore_auth_state(snapshot)


def test_startup_session_action_revalidation_waits_for_rotation(monkeypatch):
    snapshot = _auth_state_snapshot()
    try:
        state.session_revalidation_required = True
        state.session_revalidation_baseline_mtime = 200.0
        monkeypatch.setattr(connection, "session_too_old", lambda _: False)
        action, reason = connection._startup_session_action(150.0)
        assert action == "await_session_rotation"
        assert "manual session rotation" in reason
    finally:
        _restore_auth_state(snapshot)


def test_maybe_startup_login_skips_relogin_when_live_browser_cdp_attach_enabled(monkeypatch):
    snapshot = _auth_state_snapshot()
    refresh_calls = []

    async def _fake_refresh_session(reason=""):
        refresh_calls.append(reason)
        return True

    try:
        state.startup_login_completed = False
        state.startup_login_attempted = False
        state.ps3838_connect_count = 0
        monkeypatch.setattr(connection._cfg, "PS3838_BROWSER_CDP_URL", "http://127.0.0.1:9224")
        monkeypatch.setattr(connection, "refresh_session", _fake_refresh_session)

        result = asyncio.run(connection._maybe_startup_login("BROWSER"))

        assert result is True
        assert state.startup_login_completed is True
        assert refresh_calls == []
    finally:
        monkeypatch.setattr(connection._cfg, "PS3838_BROWSER_CDP_URL", "")
        _restore_auth_state(snapshot)


def test_requests_proxy_url_builds_valid_http_proxy_url(monkeypatch):
    monkeypatch.setattr(session_manager, "PS3838_PROXY_SERVER", "proxy.local:8080")
    monkeypatch.setattr(session_manager, "PS3838_PROXY_SCHEME", "http")
    monkeypatch.setattr(session_manager, "PS3838_PROXY_USER", "alice")
    monkeypatch.setattr(session_manager, "PS3838_PROXY_PASS", "s:ec/ret")

    assert session_manager._requests_proxy_url() == "http://alice:s%3Aec%2Fret@proxy.local:8080"


def test_proxy_config_reads_embedded_socks_credentials(monkeypatch):
    monkeypatch.setattr(
        session_manager,
        "PS3838_PROXY_SERVER",
        "socks5://bob:pa%3Ass@proxy.example:1081",
    )
    monkeypatch.setattr(session_manager, "PS3838_PROXY_SCHEME", "http")
    monkeypatch.setattr(session_manager, "PS3838_PROXY_USER", "")
    monkeypatch.setattr(session_manager, "PS3838_PROXY_PASS", "")

    cfg = session_manager._proxy_config()

    assert cfg["scheme"] == "socks5"
    assert cfg["host"] == "proxy.example"
    assert cfg["port"] == 1081
    assert cfg["username"] == "bob"
    assert cfg["password"] == "pa:ss"
    assert session_manager._requests_proxy_url(cfg) == "socks5h://bob:pa%3Ass@proxy.example:1081"


def test_proxy_config_rejects_invalid_proxy_server(monkeypatch):
    monkeypatch.setattr(session_manager, "PS3838_PROXY_SERVER", "http://")

    with pytest.raises(ValueError, match="cannot parse host"):
        session_manager._proxy_config()


def test_browser_proxy_settings_fails_closed_for_socks_auth_without_tunnel(monkeypatch):
    snapshot = _auth_state_snapshot()
    try:
        monkeypatch.setattr(session_manager, "PS3838_PROXY_SERVER", "proxy.local:1080")
        monkeypatch.setattr(session_manager, "PS3838_PROXY_SCHEME", "socks5")
        monkeypatch.setattr(session_manager, "PS3838_PROXY_USER", "alice")
        monkeypatch.setattr(session_manager, "PS3838_PROXY_PASS", "secret")
        monkeypatch.setattr(session_manager, "PS3838_PROXY_TUNNEL", False)

        with pytest.raises(RuntimeError, match="PS3838_PROXY_TUNNEL=1"):
            session_manager.browser_proxy_settings()

        assert state.proxy_expected is True
        assert state.proxy_route_mode == "socks_tunnel"
    finally:
        _restore_auth_state(snapshot)


def test_open_proxy_socket_fails_closed_for_unsupported_proxy_scheme(monkeypatch):
    snapshot = _auth_state_snapshot()
    try:
        monkeypatch.setattr(session_manager, "PS3838_PROXY_SERVER", "proxy.local:9000")
        monkeypatch.setattr(session_manager, "PS3838_PROXY_SCHEME", "ftp")

        with pytest.raises(RuntimeError, match="Unsupported proxy scheme 'ftp'"):
            asyncio.run(session_manager.open_proxy_socket("wss://example.com/ws"))

        assert state.proxy_expected is True
        assert state.proxy_route_mode == "ftp_proxy"
    finally:
        _restore_auth_state(snapshot)


def test_session_route_binding_requires_bound_proxy_session(tmp_path, monkeypatch):
    session_file = tmp_path / "session.json"
    session_file.write_text(
        json.dumps(
            {
                "ws_url": "wss://www.ps3838.com/sports-websocket/ws?token=OLD&ulp=OLDULP",
                "cookies": [{"name": "_ulp", "value": "ULP123", "domain": ".ps3838.com", "path": "/"}],
            }
        )
    )
    monkeypatch.setattr(session_manager, "SESSION_FILE", str(session_file))
    monkeypatch.setattr(session_manager, "PS3838_SESSION_ROUTE_BINDING", True)
    monkeypatch.setattr(session_manager, "PS3838_PROXY_SERVER", "proxy.local:8080")
    monkeypatch.setattr(session_manager, "PS3838_PROXY_SCHEME", "http")
    monkeypatch.setattr(session_manager, "PS3838_PROXY_USER", "")
    monkeypatch.setattr(session_manager, "PS3838_PROXY_PASS", "")

    with pytest.raises(session_manager.SessionRouteMismatchError, match="binding missing"):
        session_manager.load_session_raw()


def test_stamp_session_metadata_binds_session_to_current_route(monkeypatch):
    monkeypatch.setattr(session_manager, "PS3838_PROXY_SERVER", "proxy.local:8080")
    monkeypatch.setattr(session_manager, "PS3838_PROXY_SCHEME", "http")
    monkeypatch.setattr(session_manager, "PS3838_PROXY_USER", "")
    monkeypatch.setattr(session_manager, "PS3838_PROXY_PASS", "")

    stamped = session_manager.stamp_session_metadata({"ws_url": "wss://example.com"})

    assert stamped["session_route_binding"] == {
        "mode": "http_proxy",
        "scheme": "http",
        "proxy_server": "http://proxy.local:8080",
    }


def test_session_route_binding_allows_legacy_direct_session(tmp_path, monkeypatch):
    session_file = tmp_path / "session.json"
    session_file.write_text(
        json.dumps(
            {
                "ws_url": "wss://www.ps3838.com/sports-websocket/ws?token=OLD&ulp=OLDULP",
                "cookies": [{"name": "_ulp", "value": "ULP123", "domain": ".ps3838.com", "path": "/"}],
            }
        )
    )
    monkeypatch.setattr(session_manager, "SESSION_FILE", str(session_file))
    monkeypatch.setattr(session_manager, "PS3838_SESSION_ROUTE_BINDING", True)
    monkeypatch.setattr(session_manager, "PS3838_PROXY_SERVER", "")
    monkeypatch.setattr(session_manager, "PS3838_SITE_HOST", "www.ps3838.com")

    session = session_manager.load_session_raw()

    assert session["ws_url"].startswith("wss://www.ps3838.com/")


def test_session_site_binding_rejects_different_site_profile(tmp_path, monkeypatch):
    session_file = tmp_path / "session.json"
    session_file.write_text(
        json.dumps(
            {
                "ws_url": "wss://www.ps3838.com/sports-websocket/ws?token=OLD&ulp=OLDULP",
                "cookies": [{"name": "_ulp", "value": "ULP123", "domain": ".ps3838.com", "path": "/"}],
                "session_site_binding": {
                    "profile": "ps3838",
                    "host": "www.ps3838.com",
                    "auth_mode": "rest",
                },
            }
        )
    )
    monkeypatch.setattr(session_manager, "SESSION_FILE", str(session_file))
    monkeypatch.setattr(session_manager, "PS3838_SITE_PROFILE", "pin888")
    monkeypatch.setattr(session_manager, "PS3838_SITE_HOST", "www.pinnacle888.com")
    monkeypatch.setattr(session_manager, "PS3838_SITE_AUTH_MODE", "browser")
    monkeypatch.setattr(session_manager, "PS3838_PROXY_SERVER", "")

    with pytest.raises(session_manager.SessionRouteMismatchError, match="site mismatch"):
        session_manager.load_session_raw()


def test_resolve_login_credentials_prefers_pin888_env_for_pin888_profile(monkeypatch):
    monkeypatch.setattr(session_manager, "PS3838_SITE_PROFILE", "pin888")
    monkeypatch.setenv("PIN888_USERNAME", "pin-user")
    monkeypatch.setenv("PIN888_PASSWORD", "pin-pass")
    monkeypatch.setenv("PS3838_EMAIL", "legacy-user")
    monkeypatch.setenv("PS3838_PASSWORD", "legacy-pass")

    login_id, password, source = session_manager.resolve_login_credentials()

    assert login_id == "pin-user"
    assert password == "pin-pass"
    assert source == "PIN888 env"


def test_refresh_ws_url_from_current_session_reuses_cookies_without_login(tmp_path, monkeypatch):
    session_file = tmp_path / "session.json"
    session_file.write_text(
        json.dumps(
            {
                "ws_url": "wss://www.ps3838.com/sports-websocket/ws?token=OLD&ulp=OLDULP",
                "cookies": [{"name": "_ulp", "value": "ULP123", "domain": ".ps3838.com", "path": "/"}],
            }
        )
    )
    monkeypatch.setattr(connection, "SESSION_FILE", str(session_file))
    monkeypatch.setattr(connection, "load_session_raw", lambda: json.loads(session_file.read_text()))
    monkeypatch.setattr(connection, "fetch_fresh_ws_token", lambda cookies: "NEW_TOKEN")
    monkeypatch.setattr(connection, "PS3838_SITE_AUTH_MODE", "rest")
    monkeypatch.setattr(connection, "_WS_SOFT_REFRESH_LAST_ATTEMPT_TS", 0.0)
    monkeypatch.setattr(connection, "_WS_SOFT_REFRESH_LAST_RESULT", False)
    monkeypatch.setattr(connection, "_WS_SOFT_REFRESH_LAST_SESSION_PATH", "")
    monkeypatch.setattr(connection, "_WS_SOFT_REFRESH_LAST_SESSION_MTIME", 0.0)

    assert connection._refresh_ws_url_from_current_session() is True

    data = json.loads(session_file.read_text())
    assert "NEW_TOKEN" in data["ws_url"]
    assert "ULP123" in data["ws_url"]


def test_refresh_ws_url_from_current_session_deduplicates_concurrent_refresh(tmp_path, monkeypatch):
    snapshot = _auth_state_snapshot()
    session_file = tmp_path / "session.json"
    session_file.write_text(
        json.dumps(
            {
                "ws_url": "wss://www.ps3838.com/sports-websocket/ws?token=OLD&ulp=OLDULP",
                "cookies": [{"name": "_ulp", "value": "ULP123", "domain": ".ps3838.com", "path": "/"}],
            }
        )
    )

    try:
        monkeypatch.setattr(connection, "SESSION_FILE", str(session_file))
        monkeypatch.setattr(connection, "load_session_raw", lambda: json.loads(session_file.read_text()))
        monkeypatch.setattr(connection, "PS3838_SITE_AUTH_MODE", "rest")
        monkeypatch.setattr(connection, "_WS_SOFT_REFRESH_LAST_ATTEMPT_TS", 0.0)
        monkeypatch.setattr(connection, "_WS_SOFT_REFRESH_LAST_RESULT", False)
        monkeypatch.setattr(connection, "_WS_SOFT_REFRESH_LAST_SESSION_PATH", "")
        monkeypatch.setattr(connection, "_WS_SOFT_REFRESH_LAST_SESSION_MTIME", 0.0)

        fetch_started = threading.Event()
        fetch_calls = 0

        def _fake_fetch(_cookies):
            nonlocal fetch_calls
            fetch_calls += 1
            fetch_started.set()
            time.sleep(0.1)
            return "NEW_TOKEN"

        monkeypatch.setattr(connection, "fetch_fresh_ws_token", _fake_fetch)

        observed_session_mtime = os.path.getmtime(session_file)
        results = [None, None]

        def _worker(slot: int) -> None:
            results[slot] = connection._refresh_ws_url_from_current_session(
                observed_session_mtime=observed_session_mtime
            )

        first = threading.Thread(target=_worker, args=(0,))
        second = threading.Thread(target=_worker, args=(1,))

        first.start()
        assert fetch_started.wait(timeout=1.0) is True
        second.start()
        first.join(timeout=1.0)
        second.join(timeout=1.0)

        assert results == [True, True]
        assert fetch_calls == 1
        assert state.session_soft_refresh_attempt_count == snapshot["session_soft_refresh_attempt_count"] + 1
        assert state.session_soft_refresh_success_count == snapshot["session_soft_refresh_success_count"] + 1

        data = json.loads(session_file.read_text())
        assert "NEW_TOKEN" in data["ws_url"]
        assert "ULP123" in data["ws_url"]
    finally:
        _restore_auth_state(snapshot)


def test_apply_browser_session_state_merges_browser_cookies_and_refreshes_ws_url(monkeypatch):
    session = {
        "ws_url": "wss://www.ps3838.com/sports-websocket/ws?token=OLD&ulp=OLDULP",
        "cookies": [
            {"name": "JSESSIONID", "value": "old-js", "domain": ".ps3838.com", "path": "/"},
            {"name": "_ulp", "value": "OLDULP", "domain": ".ps3838.com", "path": "/"},
            {"name": "_sig", "value": "old-sig", "domain": ".ps3838.com", "path": "/"},
        ],
        "v_hucode": "",
        "x_app_data": "",
    }
    browser_cookies = [
        {"name": "JSESSIONID", "value": "new-js", "domain": ".ps3838.com", "path": "/"},
        {"name": "_ulp", "value": "NEWULP", "domain": ".ps3838.com", "path": "/"},
        {"name": "_apt", "value": "apt-cookie", "domain": ".ps3838.com", "path": "/"},
    ]
    monkeypatch.setattr(session_manager, "fetch_fresh_ws_token", lambda cookies: "NEW_TOKEN")

    updated = session_manager._apply_browser_session_state(
        session,
        browser_cookies=browser_cookies,
        v_hucode="abc123" * 5 + "ab",
        x_app_data_header="k=v",
    )

    names = {c["name"]: c["value"] for c in updated["cookies"]}
    assert names["JSESSIONID"] == "new-js"
    assert names["_ulp"] == "NEWULP"
    assert names["_apt"] == "apt-cookie"
    assert names["_sig"] == "old-sig"
    assert updated["v_hucode"]
    assert updated["x_app_data"] == "k=v"
    assert "NEW_TOKEN" in updated["ws_url"]
    assert "NEWULP" in updated["ws_url"]


def test_load_session_refreshes_ws_token_and_persists_ws_url(tmp_path, monkeypatch):
    ws_host = session_manager.PS3838_SITE_HOST
    cookie_domain = ws_host[4:] if ws_host.startswith("www.") else ws_host
    session_file = tmp_path / "session.json"
    session_file.write_text(
        json.dumps(
            {
                "ws_url": f"wss://{ws_host}/sports-websocket/ws?token=OLD&ulp=OLDULP",
                "cookies": [
                    {"name": "_ulp", "value": "ULP123", "domain": f".{cookie_domain}", "path": "/"},
                    {"name": "JSESSIONID", "value": "js", "domain": f".{cookie_domain}", "path": "/"},
                    {"name": "NID", "value": "google-cookie", "domain": ".google.com", "path": "/"},
                ],
            }
        )
    )
    monkeypatch.setattr(session_manager, "SESSION_FILE", str(session_file))
    monkeypatch.setattr(session_manager, "fetch_fresh_ws_token", lambda cookies: "NEW_TOKEN")

    ws_url, headers, _ = session_manager.load_session(refresh_ws_token=True)

    assert "NEW_TOKEN" in ws_url
    assert "ULP123" in ws_url
    assert "Cookie" in headers
    assert "NID=google-cookie" not in headers["Cookie"]
    persisted = json.loads(session_file.read_text())
    assert "NEW_TOKEN" in persisted["ws_url"]


def test_load_session_recovers_missing_ws_url_from_cookies(tmp_path, monkeypatch):
    ws_host = session_manager.PS3838_SITE_HOST
    cookie_domain = ws_host[4:] if ws_host.startswith("www.") else ws_host
    session_file = tmp_path / "session.json"
    session_file.write_text(
        json.dumps(
            {
                "ws_url": "",
                "cookies": [
                    {"name": "_ulp", "value": "ULP123", "domain": f".{cookie_domain}", "path": "/"},
                    {"name": "JSESSIONID", "value": "js", "domain": f".{cookie_domain}", "path": "/"},
                ],
                "session_route_binding": {"mode": "direct"},
                "session_site_binding": {
                    "profile": session_manager.PS3838_SITE_PROFILE,
                    "host": session_manager.PS3838_SITE_HOST,
                    "auth_mode": session_manager.PS3838_SITE_AUTH_MODE,
                },
            }
        )
    )
    monkeypatch.setattr(session_manager, "SESSION_FILE", str(session_file))
    monkeypatch.setattr(session_manager, "fetch_fresh_ws_token", lambda cookies: "NEW_TOKEN")

    ws_url, headers, _ = session_manager.load_session()

    assert "NEW_TOKEN" in ws_url
    assert "ULP123" in ws_url
    assert "Cookie" in headers
    persisted = json.loads(session_file.read_text())
    assert "NEW_TOKEN" in persisted["ws_url"]


def test_auth_cooldown_clears_when_session_file_rotates(tmp_path, monkeypatch):
    snapshot = _auth_state_snapshot()
    session_file = tmp_path / "session.json"
    session_file.write_text("{}")
    cooldown_file = tmp_path / "auth_cooldown.json"
    monkeypatch.setattr(session_manager, "SESSION_FILE", str(session_file))
    monkeypatch.setattr(session_manager, "PS3838_AUTH_COOLDOWN_FILE", str(cooldown_file))
    try:
        session_manager.arm_auth_cooldown("login rate-limited", cooldown_sec=300, now=100.0)
        active = session_manager.auth_cooldown_status(now=150.0)
        assert active is not None
        assert active["manual"] is False

        current_stat = session_file.stat()
        os.utime(session_file, (current_stat.st_atime, current_stat.st_mtime + 10))
        assert session_manager.auth_cooldown_status(now=150.0) is None
        assert cooldown_file.exists() is False
    finally:
        session_manager.clear_auth_cooldown()
        _restore_auth_state(snapshot)


def test_refresh_session_respects_persisted_auth_cooldown(tmp_path, monkeypatch):
    snapshot = _auth_state_snapshot()
    session_file = tmp_path / "session.json"
    session_file.write_text("{}")
    cooldown_file = tmp_path / "auth_cooldown.json"
    monkeypatch.setattr(session_manager, "SESSION_FILE", str(session_file))
    monkeypatch.setattr(session_manager, "PS3838_AUTH_COOLDOWN_FILE", str(cooldown_file))
    monkeypatch.setattr(session_manager, "_http_login", lambda: (_ for _ in ()).throw(AssertionError("_http_login should not run")))
    try:
        session_manager.arm_auth_cooldown("login rate-limited", cooldown_sec=300, now=time.time())
        assert asyncio.run(session_manager.refresh_session("manual test")) is False
    finally:
        session_manager.clear_auth_cooldown()
        _restore_auth_state(snapshot)


def test_maybe_refresh_does_not_login_on_lag(monkeypatch):
    called = []

    def _arm(*args, **kwargs):
        called.append((args, kwargs))
        return {}

    monkeypatch.setattr(stale_detector, "PS3838_AUTO_REFRESH_ON_STALE", True)
    monkeypatch.setattr(session_manager, "arm_auth_cooldown", _arm)

    assert asyncio.run(stale_detector.maybe_refresh("lag 12000ms > 3000ms")) is False
    assert called == []


def test_maybe_refresh_guest_mode_enters_manual_auth_hold(monkeypatch):
    called = []

    def _arm(*args, **kwargs):
        called.append((args, kwargs))
        return {}

    monkeypatch.setattr(stale_detector, "PS3838_AUTO_REFRESH_ON_STALE", True)
    monkeypatch.setattr(session_manager, "arm_auth_cooldown", _arm)

    assert asyncio.run(stale_detector.maybe_refresh("guest mode detected")) is False
    assert len(called) == 1
    assert called[0][0][0] == "guest mode detected"
    assert called[0][1]["manual"] is True


def test_startup_login_skips_relogin_when_session_is_fresh(monkeypatch):
    snapshot = _auth_state_snapshot()
    calls = []

    async def _refresh(reason):
        calls.append(reason)
        return True

    try:
        state.ps3838_connect_count = 0
        state.startup_login_attempted = False
        state.startup_login_completed = False
        monkeypatch.setattr(connection, "PS3838_STARTUP_RELOGIN_ON_STALE", True)
        monkeypatch.setattr(connection, "session_too_old", lambda _: False)
        monkeypatch.setattr(connection.os.path, "getmtime", lambda _: 100.0)
        monkeypatch.setattr(connection, "refresh_session", _refresh)

        assert asyncio.run(connection._maybe_startup_login("S4")) is True
        assert asyncio.run(connection._maybe_startup_login("S4")) is True
        assert calls == []
        assert state.startup_login_attempted is True
        assert state.startup_login_completed is True
    finally:
        _restore_auth_state(snapshot)


def test_startup_login_relogs_once_for_stale_session(monkeypatch):
    snapshot = _auth_state_snapshot()
    calls = []

    async def _refresh(reason):
        calls.append(reason)
        return True

    try:
        state.ps3838_connect_count = 0
        state.startup_login_attempted = False
        state.startup_login_completed = False
        monkeypatch.setattr(connection, "PS3838_STARTUP_RELOGIN_ON_STALE", True)
        monkeypatch.setattr(connection, "session_too_old", lambda _: True)
        monkeypatch.setattr(connection.os.path, "getmtime", lambda _: 100.0)
        monkeypatch.setattr(connection._time_mod, "time", lambda: 200.0)
        monkeypatch.setattr(connection, "refresh_session", _refresh)

        assert asyncio.run(connection._maybe_startup_login("S4")) is True
        assert calls == ["S4 startup stale session"]
        assert state.startup_login_attempted is True
        assert state.startup_login_completed is True
    finally:
        _restore_auth_state(snapshot)


def test_startup_login_short_circuits_after_gate_completed():
    snapshot = _auth_state_snapshot()

    try:
        state.startup_login_attempted = True
        state.startup_login_completed = True
        assert asyncio.run(connection._maybe_startup_login("S4")) is True
    finally:
        _restore_auth_state(snapshot)


def test_startup_canary_gate_claims_first_lane_and_releases_waiters(monkeypatch):
    snapshot = _auth_state_snapshot()

    async def _set_status(*args, **kwargs):
        return None

    try:
        state.ps3838_connect_count = 0
        state.startup_canary_label = ""
        state.startup_canary_started_ts = 0.0
        state.startup_canary_success = False
        state.startup_canary_abort_reason = ""
        monkeypatch.setattr(connection, "PS3838_STARTUP_CANARY_ENABLED", True)
        monkeypatch.setattr(connection, "set_status", _set_status)
        monkeypatch.setattr(connection, "auth_cooldown_status", lambda: None)

        assert asyncio.run(connection._await_startup_canary_gate("S4", [4])) is True
        assert state.startup_canary_label == "S4"
        state.startup_canary_success = True
        assert asyncio.run(connection._await_startup_canary_gate("S33", [33])) is True
    finally:
        _restore_auth_state(snapshot)


def test_startup_canary_repeated_401_opens_manual_auth_circuit(monkeypatch):
    snapshot = _auth_state_snapshot()
    calls = []

    def _arm(reason, **kwargs):
        calls.append((reason, kwargs))
        return {}

    try:
        state.startup_canary_label = "S4"
        state.startup_canary_success = False
        state.startup_auth_failure_count = 0
        state.startup_canary_abort_reason = ""
        state.startup_auth_circuit_open = False
        state.startup_auth_circuit_reason = ""
        monkeypatch.setattr(connection, "PS3838_STARTUP_AUTH_FAILURES_MAX", 2)
        monkeypatch.setattr(connection, "arm_auth_cooldown", _arm)

        connection._record_startup_auth_failure("S4", 401)
        assert calls == []
        connection._record_startup_auth_failure("S4", 401)

        assert len(calls) == 1
        assert calls[0][0] == "S4 startup canary ws 401 x2"
        assert calls[0][1]["manual"] is True
        assert state.startup_auth_circuit_open is True
        assert state.startup_canary_abort_reason == "S4 startup canary ws 401 x2"
    finally:
        _restore_auth_state(snapshot)


def test_startup_canary_timeout_waits_for_active_429_cooldown(monkeypatch):
    snapshot = _auth_state_snapshot()
    statuses = []
    cooldown_calls = []

    async def _set_status(*args):
        statuses.append(args)

    async def _sleep(_delay):
        cooldown_calls.append(_delay)
        state.running = False

    try:
        state.running = True
        state.ps3838_connect_count = 0
        state.startup_canary_label = "S29"
        state.startup_canary_started_ts = 100.0
        state.startup_canary_success = False
        state.startup_canary_abort_reason = ""
        state.startup_auth_circuit_open = False
        state.startup_auth_circuit_reason = ""
        state.sport_ws_429_backoff_until = {29: 220.0}

        monkeypatch.setattr(connection, "PS3838_STARTUP_CANARY_ENABLED", True)
        monkeypatch.setattr(connection, "set_status", _set_status)
        monkeypatch.setattr(connection, "_throttled_status_log", lambda *args, **kwargs: None)
        monkeypatch.setattr(connection, "_time_mod", types.SimpleNamespace(time=lambda: 200.0))
        monkeypatch.setattr(connection.asyncio, "sleep", _sleep)

        assert asyncio.run(connection._await_startup_canary_gate("S4", [4])) is False
        assert state.startup_auth_circuit_open is False
        assert state.startup_auth_circuit_reason == ""
        assert state.startup_canary_abort_reason == ""
        assert state.startup_canary_started_ts == 200.0
        assert cooldown_calls
        assert any("WS 429 cooldown" in str(args[1]) for args in statuses if len(args) >= 2)
    finally:
        _restore_auth_state(snapshot)


def test_startup_canary_timeout_waits_for_recent_ws429_recovery(monkeypatch):
    snapshot = _auth_state_snapshot()
    statuses = []
    cooldown_calls = []

    async def _set_status(*args):
        statuses.append(args)

    async def _sleep(_delay):
        cooldown_calls.append(_delay)
        state.running = False

    try:
        state.running = True
        state.ps3838_connect_count = 0
        state.startup_canary_label = "S29"
        state.startup_canary_started_ts = 100.0
        state.startup_canary_success = False
        state.startup_canary_abort_reason = ""
        state.startup_auth_circuit_open = False
        state.startup_auth_circuit_reason = ""
        state.sport_ws_429_backoff_until = {}
        state.lane_ws_429_streak = {"S29": 4}
        state.lane_ws_429_last_ts = {"S29": 75.0}

        monkeypatch.setattr(connection, "PS3838_STARTUP_CANARY_ENABLED", True)
        monkeypatch.setattr(connection, "set_status", _set_status)
        monkeypatch.setattr(connection, "_throttled_status_log", lambda *args, **kwargs: None)
        monkeypatch.setattr(connection, "_time_mod", types.SimpleNamespace(time=lambda: 200.0))
        monkeypatch.setattr(connection.asyncio, "sleep", _sleep)

        assert asyncio.run(connection._await_startup_canary_gate("S4", [4])) is False
        assert state.startup_auth_circuit_open is False
        assert state.startup_auth_circuit_reason == ""
        assert state.startup_canary_abort_reason == ""
        assert state.startup_canary_started_ts == 200.0
        assert cooldown_calls == [5.0]
        assert any("recent WS 429 recovery" in str(args[1]) for args in statuses if len(args) >= 2)
    finally:
        _restore_auth_state(snapshot)


def test_ws_403_circuit_breaker_threshold(monkeypatch):
    monkeypatch.setattr(connection, "PS3838_WS_403_CIRCUIT_BREAKER_STREAK", 4)

    assert connection._should_trip_ws_403_circuit(3) is False
    assert connection._should_trip_ws_403_circuit(4) is True


def test_runtime_lock_rejects_duplicate_live_pid(tmp_path, monkeypatch):
    snapshot = _auth_state_snapshot()
    lock_path = tmp_path / "ps3838.lock"
    lock_path.write_text(json.dumps({"pid": 4242}))

    try:
        monkeypatch.setattr(ps3838_server.config, "PS3838_PROCESS_LOCK_ENABLED", True)
        monkeypatch.setattr(ps3838_server.config, "PS3838_PROCESS_LOCK_FILE", str(lock_path))
        monkeypatch.setattr(ps3838_server.config, "PS3838_PROCESS_LOCK_TTL_SEC", 300.0)
        monkeypatch.setattr(ps3838_server, "_runtime_lock_pid_alive", lambda pid: True)
        monkeypatch.setattr(ps3838_server, "_runtime_lock_pid_matches_current_runtime", lambda pid: True)

        assert ps3838_server._acquire_runtime_lock() is False
        assert state.runtime_lock_acquired is False
    finally:
        _restore_auth_state(snapshot)


def test_runtime_lock_clears_reused_pid_from_unrelated_live_process(tmp_path, monkeypatch):
    snapshot = _auth_state_snapshot()
    lock_path = tmp_path / "ps3838.lock"
    lock_path.write_text(json.dumps({"pid": 4242}))

    try:
        monkeypatch.setattr(ps3838_server.config, "PS3838_PROCESS_LOCK_ENABLED", True)
        monkeypatch.setattr(ps3838_server.config, "PS3838_PROCESS_LOCK_FILE", str(lock_path))
        monkeypatch.setattr(ps3838_server.config, "PS3838_PROCESS_LOCK_TTL_SEC", 300.0)
        monkeypatch.setattr(ps3838_server, "_runtime_lock_pid_alive", lambda pid: True)
        monkeypatch.setattr(ps3838_server, "_runtime_lock_pid_matches_current_runtime", lambda pid: False)

        assert ps3838_server._acquire_runtime_lock() is True
        assert state.runtime_lock_acquired is True
        assert json.loads(lock_path.read_text())["pid"] == os.getpid()
    finally:
        ps3838_server._release_runtime_lock()
        _restore_auth_state(snapshot)


def test_browser_launch_kwargs_hide_enable_automation_and_set_lang(monkeypatch):
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_IGNORE_ENABLE_AUTOMATION", True)
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_LANGUAGE", "en-US")
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_LOCALE", "en-US")
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_VIEWPORT_WIDTH", 1440)
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_VIEWPORT_HEIGHT", 900)
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_CHANNEL", "chrome")
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_EXECUTABLE_PATH", "")

    kwargs = session_manager.browser_launch_kwargs(headless=True, proxy_cfg={"server": "http://proxy.local:8080"})

    assert kwargs["headless"] is True
    assert kwargs["proxy"]["server"] == "http://proxy.local:8080"
    assert "--enable-automation" in kwargs["ignore_default_args"]
    assert "--lang=en-US" in kwargs["args"]
    assert "--window-size=1440,900" in kwargs["args"]
    assert kwargs["channel"] == "chrome"


def test_browser_launch_kwargs_prefers_executable_path_over_channel(monkeypatch):
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_IGNORE_ENABLE_AUTOMATION", False)
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_LANGUAGE", "en-US")
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_LOCALE", "en-US")
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_VIEWPORT_WIDTH", 1440)
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_VIEWPORT_HEIGHT", 900)
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_CHANNEL", "chrome")
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_EXECUTABLE_PATH", "/usr/bin/chromium-browser")

    kwargs = session_manager.browser_launch_kwargs(headless=True)

    assert kwargs["executable_path"] == "/usr/bin/chromium-browser"
    assert "channel" not in kwargs


def test_validate_browser_fingerprint_config_accepts_consistent_linux_profile(tmp_path, monkeypatch):
    executable = tmp_path / "chromium-browser"
    executable.write_text("")
    snapshot = _auth_state_snapshot()
    try:
        monkeypatch.setattr(session_manager.sys, "platform", "linux")
        monkeypatch.setattr(session_manager, "PS3838_BROWSER_EXECUTABLE_PATH", str(executable))
        monkeypatch.setattr(session_manager, "PS3838_BROWSER_CHANNEL", "")
        monkeypatch.setattr(
            session_manager,
            "PS3838_WS_USER_AGENT",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.7680.80 Safari/537.36",
        )
        monkeypatch.setattr(session_manager, "PS3838_BROWSER_PLATFORM", "Linux x86_64")
        monkeypatch.setattr(session_manager, "PS3838_BROWSER_COUNTRY", "US")
        monkeypatch.setattr(session_manager, "PS3838_BROWSER_TIMEZONE_ID", "America/New_York")
        monkeypatch.setattr(session_manager, "PS3838_BROWSER_LOCALE", "en-US")
        monkeypatch.setattr(session_manager, "PS3838_BROWSER_LANGUAGE", "en-US")
        monkeypatch.setattr(session_manager, "PS3838_WS_ACCEPT_LANGUAGE", "en-US,en;q=0.9")
        monkeypatch.setattr(session_manager, "_browser_binary_major_version", lambda _: "146")

        warnings = session_manager.validate_browser_fingerprint_config()

        assert warnings == []
    finally:
        _restore_auth_state(snapshot)


def test_validate_browser_fingerprint_config_rejects_linux_browser_with_mac_mask(tmp_path, monkeypatch):
    executable = tmp_path / "chromium-browser"
    executable.write_text("")
    snapshot = _auth_state_snapshot()
    try:
        monkeypatch.setattr(session_manager.sys, "platform", "linux")
        monkeypatch.setattr(session_manager, "PS3838_BROWSER_EXECUTABLE_PATH", str(executable))
        monkeypatch.setattr(
            session_manager,
            "PS3838_WS_USER_AGENT",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        monkeypatch.setattr(session_manager, "PS3838_BROWSER_PLATFORM", "MacIntel")
        monkeypatch.setattr(session_manager, "_browser_binary_major_version", lambda _: "146")

        with pytest.raises(RuntimeError, match="Linux browser executable requires Linux UA"):
            session_manager.validate_browser_fingerprint_config()
    finally:
        _restore_auth_state(snapshot)


def test_browser_context_kwargs_uses_stable_fingerprint(monkeypatch):
    monkeypatch.setattr(session_manager, "PS3838_WS_USER_AGENT", "UA")
    monkeypatch.setattr(session_manager, "PS3838_WS_ACCEPT_LANGUAGE", "en-US,en;q=0.9")
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_LOCALE", "en-US")
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_TIMEZONE_ID", "Europe/Podgorica")
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_VIEWPORT_WIDTH", 1440)
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_VIEWPORT_HEIGHT", 900)
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_COLOR_SCHEME", "light")
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_REDUCED_MOTION", "no-preference")

    kwargs = session_manager.browser_context_kwargs()

    assert kwargs["user_agent"] == "UA"
    assert kwargs["locale"] == "en-US"
    assert kwargs["timezone_id"] == "Europe/Podgorica"
    assert kwargs["viewport"] == {"width": 1440, "height": 900}
    assert kwargs["screen"] == {"width": 1440, "height": 900}
    assert kwargs["extra_http_headers"]["Accept-Language"] == "en-US,en;q=0.9"


def test_browser_stealth_init_script_masks_webdriver_and_sets_platform(monkeypatch):
    monkeypatch.setattr(
        session_manager,
        "PS3838_WS_USER_AGENT",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.6943.54 Safari/537.36",
    )
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_LANGUAGE", "en-US")
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_LANGUAGES", "en-US,en")
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_PLATFORM", "MacIntel")
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_HARDWARE_CONCURRENCY", 8)
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_DEVICE_MEMORY_GB", 8)
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_WEBGL_VENDOR", "Intel Inc.")
    monkeypatch.setattr(session_manager, "PS3838_BROWSER_WEBGL_RENDERER", "Intel Iris OpenGL Engine")

    script = session_manager.browser_stealth_init_script()

    assert "webdriver" in script
    assert "MacIntel" in script
    assert "Google Chrome" in script
    assert "Intel Iris OpenGL Engine" in script
    assert "133.0.6943.54" in script
    assert 'version: "133"' in script


def test_connection_fetch_fresh_ws_token_uses_proxy_and_configured_language(monkeypatch):
    captured = {}

    class _FakeResponse:
        status_code = 200

        @staticmethod
        def json():
            return {"token": "NEW_TOKEN"}

    class _FakeCookies:
        def set(self, name, value, domain="", path="/"):
            captured.setdefault("cookies", []).append((name, value, domain, path))

    class _FakeSession:
        def __init__(self):
            self.headers = {}
            self.proxies = {}
            self.cookies = _FakeCookies()

        def get(self, url, params=None, timeout=None):
            captured["url"] = url
            captured["params"] = params
            captured["timeout"] = timeout
            captured["headers"] = dict(self.headers)
            captured["proxies"] = dict(self.proxies)
            return _FakeResponse()

    import requests as _real_requests
    monkeypatch.setattr(_real_requests, "Session", _FakeSession)
    monkeypatch.setattr(session_manager, "current_site_uses_rest_auth", lambda: True)
    monkeypatch.setattr(session_manager, "_requests_proxy_url", lambda: "http://proxy.local:8080")
    monkeypatch.setattr(session_manager, "PS3838_WS_USER_AGENT", "UA")
    monkeypatch.setattr(session_manager, "PS3838_WS_ACCEPT_LANGUAGE", "fr-FR,fr;q=0.9")
    monkeypatch.setattr(session_manager, "current_site_headers", lambda: {"Origin": "https://test", "Referer": "https://test/"})

    token = session_manager.fetch_fresh_ws_token(
        [{"name": "_ulp", "value": "ULP123", "domain": ".ps3838.com", "path": "/"}]
    )

    assert token == "NEW_TOKEN"
    assert captured["headers"]["User-Agent"] == "UA"
    assert captured["headers"]["Accept-Language"] == "fr-FR,fr;q=0.9"
    assert captured["proxies"] == {
        "https": "http://proxy.local:8080",
        "http": "http://proxy.local:8080",
    }


def test_maybe_xvfb_noop_when_headless(monkeypatch):
    calls = []

    def _popen(*args, **kwargs):
        calls.append((args, kwargs))
        raise AssertionError("Xvfb should not start in headless mode")

    monkeypatch.setattr(session_manager, "PS3838_USE_XVFB", True)
    monkeypatch.setattr(session_manager.subprocess, "Popen", _popen)

    with session_manager.maybe_xvfb(True):
        pass

    assert calls == []


def test_maybe_xvfb_starts_and_restores_display(monkeypatch):
    snapshot_display = os.environ.get("DISPLAY")
    events = []

    class _Proc:
        returncode = None

        def poll(self):
            return None

        def terminate(self):
            events.append("terminate")

        def wait(self, timeout=None):
            events.append(f"wait:{timeout}")
            return 0

    monkeypatch.setattr(session_manager, "PS3838_USE_XVFB", True)
    monkeypatch.setattr(session_manager, "PS3838_XVFB_DISPLAY", ":99")
    monkeypatch.setattr(session_manager, "PS3838_XVFB_SCREEN", "0 1440x900x24")
    monkeypatch.setattr(session_manager, "PS3838_XVFB_WAIT_MS", 100)
    monkeypatch.setattr(session_manager.time, "sleep", lambda *_: None)
    monkeypatch.setattr(session_manager.subprocess, "Popen", lambda *args, **kwargs: _Proc())

    try:
        with session_manager.maybe_xvfb(False):
            assert os.environ.get("DISPLAY") == ":99"
        assert "terminate" in events
    finally:
        if snapshot_display is None:
            os.environ.pop("DISPLAY", None)
        else:
            os.environ["DISPLAY"] = snapshot_display


def test_open_startup_auth_circuit_for_403_schedules_browser_artifact_refresh():
    snapshot = _auth_state_snapshot()

    try:
        state.force_v_hucode_browser = False
        state.startup_auth_circuit_open = False
        state.startup_auth_circuit_reason = ""
        connection._open_startup_auth_circuit(
            "S4 ws 403 x3",
            manual=False,
            schedule_artifact_refresh=True,
        )

        assert state.startup_auth_circuit_open is True
        assert state.force_v_hucode_browser is True
        assert state.account_incidents[-1]["kind"] == "startup_auth_circuit"
        assert state.account_incidents[-1]["details"]["schedule_artifact_refresh"] is True
    finally:
        _restore_auth_state(snapshot)


def test_browser_session_guard_reason_detects_auth_cookie_loss():
    page = _GuardProbePage(cookie_values=["auth=1", ""], body_values=["", ""])

    had_auth_cookie, reason = asyncio.run(
        connection._browser_session_guard_reason(
            page,
            had_auth_cookie=None,
            page_error_type=RuntimeError,
        )
    )
    assert had_auth_cookie is True
    assert reason is None

    had_auth_cookie, reason = asyncio.run(
        connection._browser_session_guard_reason(
            page,
            had_auth_cookie=had_auth_cookie,
            page_error_type=RuntimeError,
        )
    )
    assert had_auth_cookie is True
    assert reason == "session cookies cleared"


def test_browser_session_guard_reason_detects_multiple_login_banner():
    page = _GuardProbePage(
        cookie_values=["auth=1"],
        body_values=["Signed out due to multiple logins"],
    )

    had_auth_cookie, reason = asyncio.run(
        connection._browser_session_guard_reason(
            page,
            had_auth_cookie=True,
            page_error_type=RuntimeError,
        )
    )

    assert had_auth_cookie is True
    assert reason == "multiple logins detected"


def test_apply_browser_session_guard_reason_sets_manual_hold_and_reconnect(monkeypatch):
    snapshot = _auth_state_snapshot()
    status_calls = []
    cooldown_calls = []
    force_reconnect = asyncio.Event()

    async def _set_status(*args, **kwargs):
        status_calls.append((args, kwargs))

    def _arm(reason, **kwargs):
        cooldown_calls.append((reason, kwargs))
        return {}

    try:
        state.is_logged_in = True
        monkeypatch.setattr(connection, "set_status", _set_status)
        monkeypatch.setattr(connection, "arm_auth_cooldown", _arm)

        asyncio.run(
            connection._apply_browser_session_guard_reason(
                "multiple logins detected",
                force_reconnect=force_reconnect,
            )
        )

        assert state.is_logged_in is False
        assert force_reconnect.is_set() is True
        assert any(args[1] == "multiple logins detected" for args, _kwargs in status_calls)
        assert cooldown_calls == [("multiple logins detected", {"manual": True})]
    finally:
        _restore_auth_state(snapshot)


def test_route_binding_mismatch_records_account_incident(monkeypatch):
    snapshot = _auth_state_snapshot()

    try:
        before_count = state.account_route_mismatch_count
        monkeypatch.setattr(session_manager, "PS3838_SESSION_ROUTE_BINDING", True)
        monkeypatch.setattr(session_manager, "PS3838_PROXY_SERVER", "proxy.local:8080")
        monkeypatch.setattr(session_manager, "PS3838_PROXY_SCHEME", "http")
        monkeypatch.setattr(session_manager, "PS3838_PROXY_USER", "")
        monkeypatch.setattr(session_manager, "PS3838_PROXY_PASS", "")
        monkeypatch.setattr(session_manager, "PS3838_SITE_PROFILE", "ps3838")
        monkeypatch.setattr(session_manager, "PS3838_SITE_HOST", "www.ps3838.com")
        monkeypatch.setattr(session_manager, "PS3838_SITE_AUTH_MODE", "rest")

        with pytest.raises(session_manager.SessionRouteMismatchError, match="route mismatch"):
            session_manager.ensure_session_route_binding(
                {
                    "session_site_binding": {
                        "profile": "ps3838",
                        "host": "www.ps3838.com",
                        "auth_mode": "rest",
                    },
                    "session_route_binding": {
                        "mode": "direct",
                    }
                }
            )

        assert state.account_route_mismatch_count == before_count + 1
        assert state.account_last_route_mismatch_reason.startswith("session route mismatch")
        assert state.account_incidents[-1]["kind"] == "session_route_binding"
    finally:
        _restore_auth_state(snapshot)


def test_account_health_endpoint_reports_session_artifacts_and_delivery_guard(tmp_path, monkeypatch):
    snapshot = _auth_state_snapshot()
    session_file = tmp_path / "session.json"
    session_file.write_text(
        json.dumps(
            {
                "ws_url": "wss://www.ps3838.com/sports-websocket/ws?token=NEW&ulp=ULP123",
                "cookies": [
                    {"name": "_ulp", "value": "ULP123", "domain": ".ps3838.com", "path": "/"},
                    {"name": "JSESSIONID", "value": "js", "domain": ".ps3838.com", "path": "/"},
                ],
                "v_hucode": "abc123xyz",
                "x_app_data": "_ulp=ULP123;foo=bar",
                "session_epoch": 7,
                "session_route_binding": {"mode": "direct"},
                "session_site_binding": {
                    "profile": "ps3838",
                    "host": "www.ps3838.com",
                    "auth_mode": "rest",
                },
                "anti_bot_artifacts_updated_ts": 150.0,
                "anti_bot_artifacts_source": "browser_capture",
            }
        )
    )

    try:
        async def _noop_check_silence():
            return False

        monkeypatch.setattr(session_manager, "SESSION_FILE", str(session_file))
        monkeypatch.setattr(session_manager, "PS3838_SITE_PROFILE", "ps3838")
        monkeypatch.setattr(session_manager, "PS3838_SITE_HOST", "www.ps3838.com")
        monkeypatch.setattr(session_manager, "PS3838_SITE_AUTH_MODE", "rest")
        monkeypatch.setattr(session_manager, "PS3838_PROXY_SERVER", "")
        monkeypatch.setattr(ps3838_server, "check_silence", _noop_check_silence)
        state.is_logged_in = True
        state.stale = False
        state.stale_reason = ""
        state.account_incidents = []
        state.account_incident_seq = 0
        state.record_account_incident(
            kind="auth_cooldown_armed",
            severity="warning",
            summary="cooldown test",
        )

        status, _headers, body = asyncio.run(ps3838_server.process_request("/account-health", {}))
        payload = json.loads(body)

        assert status == 200
        assert payload["state"] in {"healthy", "observing"}
        assert payload["session"]["artifacts"]["capture_source"] == "browser_capture"
        assert payload["session"]["artifacts"]["capture_age_sec"] is not None
        assert payload["session"]["artifacts"]["x_app_data_has_ulp"] is True
        assert payload["delivery_guard"]["subscriptions_unchanged"] is True
        assert payload["delivery_guard"]["send_frequency_unchanged"] is True
        assert payload["recent_incidents"][0]["kind"] == "auth_cooldown_armed"
    finally:
        _restore_auth_state(snapshot)


def test_listen_group_401_soft_refresh_recovers_without_manual_hold(monkeypatch):
    snapshot = _auth_state_snapshot()

    try:
        state.running = True
        state.is_logged_in = True
        state.auth_block_reason = ""
        state.auth_block_until = 0.0
        state.auth_block_manual = False
        state.startup_canary_label = "S4"
        state.startup_canary_started_ts = 100.0
        state.startup_canary_success = False
        state.startup_canary_abort_reason = "old canary state"
        state.startup_auth_failure_count = 0
        state.startup_auth_circuit_open = True
        state.startup_auth_circuit_reason = "old canary state"
        now = {"ts": 150.0}
        monkeypatch.setattr(connection._time_mod, "time", lambda: now["ts"])
        monkeypatch.setattr(connection, "auth_cooldown_status", lambda: None)
        monkeypatch.setattr(connection, "PS3838_STARTUP_AUTH_FAILURES_MAX", 1)
        _patch_listen_group_gates(monkeypatch)
        sleep_calls, statuses, broadcasts = _patch_invalid_status_runtime(monkeypatch, 401)
        monkeypatch.setattr(
            connection,
            "_refresh_ws_url_from_current_session",
            lambda *args, **kwargs: now.__setitem__("ts", 250.0) or True,
        )

        asyncio.run(connection.listen_group([4], "S4"))

        assert state.session_ws401_count == 1
        assert state.auth_block_manual is False
        assert state.auth_block_reason == ""
        assert state.startup_canary_started_ts == 250.0
        assert state.startup_canary_abort_reason == ""
        assert state.startup_auth_failure_count == 0
        assert state.startup_auth_circuit_open is False
        assert state.startup_auth_circuit_reason == ""
        assert len(sleep_calls) == 1 and 4.0 <= sleep_calls[0] <= 6.0  # jittered ±15% around 5
        assert any(args[1] == "expired 401" for args, _kwargs in statuses)
        assert broadcasts == [{"type": "status", "source": "ps3838", "status": "expired"}]
    finally:
        _restore_auth_state(snapshot)


def test_account_health_single_recovered_ws401_stays_healthy(monkeypatch):
    snapshot = _auth_state_snapshot()

    try:
        state.running = True
        state.is_logged_in = True
        state.stale = False
        state.stale_reason = ""
        state.cf_consecutive_403 = 0
        state.startup_auth_circuit_open = False
        state.startup_auth_circuit_reason = ""
        state.force_v_hucode_browser = False
        state.session_ws401_count = 1
        state.session_first_ws401_ts = 100.0
        state.session_last_ws401_ts = 100.0
        state.session_soft_refresh_attempt_count = 1
        state.session_soft_refresh_success_count = 1
        state.session_soft_refresh_fail_count = 0
        state.session_last_soft_refresh_ts = 101.0
        state.session_last_soft_refresh_mode = "browser_ws"
        state.session_last_soft_refresh_reason = "wstoken refreshed from current cookies"
        monkeypatch.setattr(
            session_manager,
            "current_session_health_snapshot",
            lambda now=None: {
                "file": {"read_error": None},
                "route_binding": {"status": "ok", "reason": None},
                "site_binding": {"status": "ok", "reason": None},
                "artifacts": {
                    "v_hucode_present": True,
                    "x_app_data_present": True,
                },
            },
        )
        monkeypatch.setattr(session_manager, "auth_cooldown_status", lambda now=None: None)

        health = session_manager.current_account_health_snapshot(now=102.0)

        assert health["state"] == "healthy"
        assert health["score"] == 100
        assert health["recommended_action"] == "keep_running"
        assert all("ws 401" not in reason for reason in health["reasons"])
    finally:
        _restore_auth_state(snapshot)


def test_listen_group_401_runtime_relogin_recovers_without_manual_hold(monkeypatch):
    snapshot = _auth_state_snapshot()

    try:
        state.running = True
        state.is_logged_in = True
        state.auth_block_reason = ""
        state.auth_block_until = 0.0
        state.auth_block_manual = False
        state.startup_canary_label = "S4"
        state.startup_canary_started_ts = 100.0
        state.startup_canary_success = False
        state.startup_canary_abort_reason = "old canary state"
        state.startup_auth_failure_count = 0
        state.startup_auth_circuit_open = True
        state.startup_auth_circuit_reason = "old canary state"
        now = {"ts": 150.0}
        monkeypatch.setattr(connection._time_mod, "time", lambda: now["ts"])
        monkeypatch.setattr(connection, "auth_cooldown_status", lambda: None)
        monkeypatch.setattr(connection, "PS3838_STARTUP_AUTH_FAILURES_MAX", 1)
        _patch_listen_group_gates(monkeypatch)
        sleep_calls, statuses, broadcasts = _patch_invalid_status_runtime(
            monkeypatch,
            401,
            refresh_result=False,
        )
        relogin_calls = []

        async def _fake_refresh_session(reason=""):
            relogin_calls.append(reason)
            now["ts"] = 250.0
            return True

        monkeypatch.setattr(connection, "current_session_epoch", lambda: 7)
        monkeypatch.setattr(connection, "session_updated", lambda _mtime: False)
        monkeypatch.setattr(connection, "refresh_session", _fake_refresh_session)

        asyncio.run(connection.listen_group([4], "S4"))

        assert relogin_calls == ["S4 ws expired 401"]
        assert state.runtime_401_relogin_epoch == 7
        assert state.auth_block_manual is False
        assert state.auth_block_reason == ""
        assert state.startup_canary_started_ts == 250.0
        assert state.startup_canary_abort_reason == ""
        assert state.startup_auth_failure_count == 0
        assert state.startup_auth_circuit_open is False
        assert state.startup_auth_circuit_reason == ""
        assert len(sleep_calls) == 1 and 4.0 <= sleep_calls[0] <= 6.0
        assert any(args[1] == "expired 401" for args, _kwargs in statuses)
        assert broadcasts == [{"type": "status", "source": "ps3838", "status": "expired"}]
    finally:
        _restore_auth_state(snapshot)


def test_listen_group_401_failure_enters_manual_auth_hold_without_real_runtime(tmp_path, monkeypatch):
    snapshot = _auth_state_snapshot()
    session_file = tmp_path / "session.json"
    session_file.write_text("{}")
    cooldown_file = tmp_path / "auth_cooldown.json"

    try:
        state.running = True
        state.is_logged_in = True
        monkeypatch.setattr(session_manager, "SESSION_FILE", str(session_file))
        monkeypatch.setattr(session_manager, "PS3838_AUTH_COOLDOWN_FILE", str(cooldown_file))
        _patch_listen_group_gates(monkeypatch)
        sleep_calls, statuses, broadcasts = _patch_invalid_status_runtime(
            monkeypatch,
            401,
            refresh_result=False,
        )
        relogin_calls = []

        async def _fake_refresh_session(reason=""):
            relogin_calls.append(reason)
            return False

        monkeypatch.setattr(connection, "current_session_epoch", lambda: 7)
        monkeypatch.setattr(connection, "session_updated", lambda _mtime: False)
        monkeypatch.setattr(connection, "refresh_session", _fake_refresh_session)

        asyncio.run(connection.listen_group([4], "S4"))
        health = session_manager.current_account_health_snapshot()

        assert relogin_calls == ["S4 ws expired 401"]
        assert state.session_ws401_count == 1
        assert state.runtime_401_relogin_epoch == 7
        assert state.auth_block_manual is True
        assert "ws expired 401" in state.auth_block_reason
        assert cooldown_file.exists() is True
        assert sleep_calls == [0.0]
        assert any(args[1] == "expired 401" for args, _kwargs in statuses)
        assert broadcasts == [{"type": "status", "source": "ps3838", "status": "expired"}]
        assert health["state"] == "manual_review"
        assert health["recommended_action"] == "rotate_session_manually"
    finally:
        session_manager.clear_auth_cooldown()
        _restore_auth_state(snapshot)


def test_runtime_ws401_relogin_budget_allows_only_one_attempt_per_epoch(monkeypatch):
    snapshot = _auth_state_snapshot()

    try:
        state.running = True
        state.is_logged_in = True
        state.runtime_401_relogin_epoch = 7
        _patch_listen_group_gates(monkeypatch)
        sleep_calls, statuses, broadcasts = _patch_invalid_status_runtime(
            monkeypatch,
            401,
            refresh_result=False,
        )
        relogin_calls = []

        async def _fake_refresh_session(reason=""):
            relogin_calls.append(reason)
            return True

        monkeypatch.setattr(connection, "current_session_epoch", lambda: 7)
        monkeypatch.setattr(connection, "session_updated", lambda _mtime: False)
        monkeypatch.setattr(connection, "refresh_session", _fake_refresh_session)

        asyncio.run(connection.listen_group([4], "S4"))

        assert relogin_calls == []
        assert state.auth_block_manual is True
        assert "ws expired 401" in state.auth_block_reason
        assert sleep_calls == [0.0]
        assert any(args[1] == "expired 401" for args, _kwargs in statuses)
        assert broadcasts == [{"type": "status", "source": "ps3838", "status": "expired"}]
    finally:
        session_manager.clear_auth_cooldown()
        _restore_auth_state(snapshot)


def test_listen_group_403_circuit_schedules_artifact_refresh_without_real_ws(tmp_path, monkeypatch):
    snapshot = _auth_state_snapshot()
    session_file = tmp_path / "session.json"
    session_file.write_text(
        json.dumps(
            {
                "ws_url": "wss://www.ps3838.com/sports-websocket/ws?token=NEW&ulp=ULP123",
                "cookies": [
                    {"name": "_ulp", "value": "ULP123", "domain": ".ps3838.com", "path": "/"},
                ],
                "session_epoch": 3,
                "session_route_binding": {"mode": "direct"},
                "session_site_binding": {
                    "profile": "ps3838",
                    "host": "www.ps3838.com",
                    "auth_mode": "rest",
                },
            }
        )
    )
    cooldown_file = tmp_path / "auth_cooldown.json"

    try:
        state.running = True
        state.is_logged_in = True
        monkeypatch.setattr(session_manager, "SESSION_FILE", str(session_file))
        monkeypatch.setattr(session_manager, "PS3838_AUTH_COOLDOWN_FILE", str(cooldown_file))
        monkeypatch.setattr(session_manager, "PS3838_SITE_PROFILE", "ps3838")
        monkeypatch.setattr(session_manager, "PS3838_SITE_HOST", "www.ps3838.com")
        monkeypatch.setattr(session_manager, "PS3838_SITE_AUTH_MODE", "rest")
        monkeypatch.setattr(session_manager, "PS3838_PROXY_SERVER", "")
        monkeypatch.setattr(connection, "PS3838_WS_403_CIRCUIT_BREAKER_STREAK", 1)
        _patch_listen_group_gates(monkeypatch)
        sleep_calls, statuses, broadcasts = _patch_invalid_status_runtime(monkeypatch, 403)

        asyncio.run(connection.listen_group([4], "S4"))
        health = session_manager.current_account_health_snapshot()

        assert state.cf_consecutive_403 == 1
        assert state.startup_auth_circuit_open is True
        assert state.force_v_hucode_browser is True
        assert state.auth_block_manual is False
        assert "ws 403 x1" in state.auth_block_reason
        assert cooldown_file.exists() is True
        assert len(sleep_calls) == 1 and 25.0 <= sleep_calls[0] <= 35.0  # jittered ±15% around 30
        assert any(args[1] == "WS 403 cooldown 30s" for args, _kwargs in statuses)
        assert broadcasts == [{"type": "status", "source": "ps3838", "status": "disconnected"}]
        assert health["state"] == "degraded"
        assert health["recommended_action"] == "refresh_antibot_artifacts"
    finally:
        session_manager.clear_auth_cooldown()
        _restore_auth_state(snapshot)


def test_listen_group_route_mismatch_triggers_refresh_without_manual_runtime(monkeypatch):
    snapshot = _auth_state_snapshot()
    refresh_calls = []

    async def _refresh(reason):
        refresh_calls.append(reason)
        state.running = False
        return True

    try:
        state.running = True
        _patch_listen_group_gates(monkeypatch)
        monkeypatch.setattr(
            connection,
            "load_session",
            lambda refresh_ws_token=True: (_ for _ in ()).throw(
                connection.SessionRouteMismatchError("route mismatch")
            ),
        )
        monkeypatch.setattr(connection, "refresh_session", _refresh)
        monkeypatch.setattr(connection, "_await_manual_session", lambda *args, **kwargs: pytest.fail("manual session should not be required"))

        asyncio.run(connection.listen_group([4], "S4"))

        assert refresh_calls == ["S4 route change: route mismatch"]
    finally:
        _restore_auth_state(snapshot)


def test_listen_browser_route_mismatch_triggers_refresh_without_real_browser(monkeypatch):
    snapshot = _auth_state_snapshot()
    refresh_calls = []

    async def _refresh(reason):
        refresh_calls.append(reason)
        state.running = False
        return True

    try:
        state.running = True
        _patch_listen_browser_gates(monkeypatch)
        monkeypatch.setattr(
            connection,
            "load_session_raw",
            lambda: (_ for _ in ()).throw(
                connection.SessionRouteMismatchError("route mismatch")
            ),
        )
        monkeypatch.setattr(connection, "refresh_session", _refresh)
        monkeypatch.setattr(connection, "_await_manual_session", lambda *args, **kwargs: pytest.fail("manual session should not be required"))

        asyncio.run(connection.listen_browser([4]))

        assert refresh_calls == ["BROWSER route change: route mismatch"]
    finally:
        _restore_auth_state(snapshot)


def test_listen_browser_initial_guest_mode_enters_manual_hold_without_real_playwright(tmp_path, monkeypatch):
    snapshot = _auth_state_snapshot()
    session_file = tmp_path / "session.json"
    session_file.write_text(json.dumps({"cookies": [], "ws_url": "wss://www.ps3838.com/sports-websocket/ws?token=NEW&ulp=ULP123"}))
    cooldown_file = tmp_path / "auth_cooldown.json"
    maybe_refresh_calls = []
    sleep_calls = []
    fake_page = _FakeBrowserPage(guest_mode=True)

    async def _maybe_refresh(reason):
        maybe_refresh_calls.append(reason)
        return False

    async def _sleep(delay):
        sleep_calls.append(delay)
        if delay >= 4:  # jittered: ±15% of 5s = 4.25..5.75
            state.running = False

    try:
        state.running = True
        state.is_logged_in = True
        monkeypatch.setattr(session_manager, "SESSION_FILE", str(session_file))
        monkeypatch.setattr(session_manager, "PS3838_AUTH_COOLDOWN_FILE", str(cooldown_file))
        monkeypatch.setattr(connection, "SESSION_FILE", str(session_file))
        monkeypatch.setattr(connection.os.path, "getmtime", lambda _path: 100.0)
        monkeypatch.setattr(connection, "load_session_raw", lambda: {"cookies": [], "ws_url": "wss://www.ps3838.com/sports-websocket/ws?token=NEW&ulp=ULP123"})
        monkeypatch.setattr(connection, "maybe_refresh", _maybe_refresh)
        monkeypatch.setattr(connection, "jitter_sleep", _sleep)
        _patch_listen_browser_gates(monkeypatch)
        _patch_fake_browser_runtime(monkeypatch, fake_page)

        asyncio.run(connection.listen_browser([4]))

        assert state.auth_block_manual is True
        assert state.auth_block_reason == "guest mode detected"
        assert cooldown_file.exists() is True
        assert maybe_refresh_calls == ["initial page load failed"]
        assert len(sleep_calls) == 1 and 4.0 <= sleep_calls[0] <= 6.0  # jittered ±15% around 5
    finally:
        session_manager.clear_auth_cooldown()
        _restore_auth_state(snapshot)


def test_listen_browser_abnormal_ws_close_requests_refresh_without_real_playwright(tmp_path, monkeypatch):
    snapshot = _auth_state_snapshot()
    session_file = tmp_path / "session.json"
    session_file.write_text(
        json.dumps(
            {
                "cookies": [],
                "ws_url": "wss://www.ps3838.com/sports-websocket/ws?token=NEW&ulp=ULP123",
                "session_epoch": 4,
                "session_route_binding": {"mode": "direct"},
                "session_site_binding": {
                    "profile": "ps3838",
                    "host": "www.ps3838.com",
                    "auth_mode": "rest",
                },
            }
        )
    )
    maybe_refresh_calls = []
    sleep_calls = []
    status_calls = []
    fake_page = _FakeBrowserPage(
        guest_mode=False,
        ws_url="wss://www.ps3838.com/sports-websocket/ws?token=NEW&ulp=ULP123",
        close_code=1006,
        browser_cookies=[
            {"name": "_ulp", "value": "ULP123", "domain": ".ps3838.com", "path": "/"},
        ],
    )

    async def _maybe_refresh(reason):
        maybe_refresh_calls.append(reason)
        return False

    async def _sleep(delay):
        sleep_calls.append(delay)
        if delay >= 0.4:  # jittered: ±15% of 0.5s = 0.425..0.575
            state.running = False

    async def _set_status(*args, **kwargs):
        status_calls.append((args, kwargs))

    try:
        state.running = True
        state.is_logged_in = True
        monkeypatch.setattr(connection, "SESSION_FILE", str(session_file))
        monkeypatch.setattr(connection.os.path, "getmtime", lambda _path: 100.0)
        monkeypatch.setattr(connection, "load_session_raw", lambda: json.loads(session_file.read_text()))
        monkeypatch.setattr(connection, "maybe_refresh", _maybe_refresh)
        monkeypatch.setattr(connection, "set_status", _set_status)
        monkeypatch.setattr(connection.asyncio, "sleep", _sleep)
        _patch_listen_browser_gates(monkeypatch)
        _patch_browser_background_tasks(monkeypatch)
        _patch_fake_browser_runtime(monkeypatch, fake_page)

        asyncio.run(connection.listen_browser([4]))

        assert maybe_refresh_calls == ["browser ws close code=1006"]
        assert 0.4 <= sleep_calls[-1] <= 0.6  # jittered ±15% around 0.5
        assert any(args[1] == "browser ws close code=1006" for args, _kwargs in status_calls)
    finally:
        _restore_auth_state(snapshot)


def test_listen_browser_cdp_attach_uses_live_browser_without_launch_or_close(tmp_path, monkeypatch):
    snapshot = _auth_state_snapshot()
    session_file = tmp_path / "session.json"
    session_file.write_text(
        json.dumps(
            {
                "cookies": [
                    {"name": "_ulp", "value": "ULP123", "domain": ".ps3838.com", "path": "/"},
                ],
                "ws_url": "wss://www.ps3838.com/sports-websocket/ws?token=NEW&ulp=ULP123",
            }
        )
    )
    maybe_refresh_calls = []
    sleep_calls = []
    fake_page = _FakeBrowserPage(
        guest_mode=False,
        ws_url="wss://www.ps3838.com/sports-websocket/ws?token=NEW&ulp=ULP123",
        close_code=1000,
        url="about:blank",
    )

    async def _maybe_refresh(reason):
        maybe_refresh_calls.append(reason)
        return False

    async def _sleep(delay):
        sleep_calls.append(delay)
        if delay >= 0.4:
            state.running = False

    try:
        state.running = True
        state.is_logged_in = True
        monkeypatch.setattr(connection, "SESSION_FILE", str(session_file))
        monkeypatch.setattr(connection.os.path, "getmtime", lambda _path: 100.0)
        monkeypatch.setattr(connection, "load_session_raw", lambda: json.loads(session_file.read_text()))
        monkeypatch.setattr(connection, "maybe_refresh", _maybe_refresh)
        monkeypatch.setattr(connection, "jitter_sleep", _sleep)
        _patch_listen_browser_gates(monkeypatch)
        _patch_browser_background_tasks(monkeypatch)
        counters = _patch_fake_browser_runtime_cdp(monkeypatch, fake_page)

        asyncio.run(connection.listen_browser([4]))

        assert counters["connect_over_cdp_calls"] == 1
        assert counters["last_cdp_url"] == "http://127.0.0.1:9224"
        assert counters["launch_calls"] == 0
        assert counters["close_calls"] == 0
        assert counters["add_cookies_calls"] == 1
        assert counters["last_added_cookies"][0]["name"] == "_ulp"
        assert counters["new_page_calls"] == 0
        assert fake_page.goto_urls == ["https://www.ps3838.com/en/compact/sports/basketball/4/"]
        assert fake_page.goto_urls[0] != "about:blank"
        assert fake_page.reload_calls == 0
        assert maybe_refresh_calls == []
        assert sleep_calls
        assert 0.4 <= sleep_calls[-1] <= 0.6
    finally:
        monkeypatch.setattr(connection._cfg, "PS3838_BROWSER_CDP_URL", "")
        _restore_auth_state(snapshot)


@pytest.mark.timeout(30)
def test_listen_browser_cdp_attach_keeps_live_browser_open_on_initial_page_load_fail(tmp_path, monkeypatch):
    snapshot = _auth_state_snapshot()
    session_file = tmp_path / "session.json"
    session_file.write_text(
        json.dumps(
            {
                "cookies": [
                    {"name": "_ulp", "value": "ULP123", "domain": ".ps3838.com", "path": "/"},
                ],
                "ws_url": "wss://www.ps3838.com/sports-websocket/ws?token=NEW&ulp=ULP123",
            }
        )
    )
    maybe_refresh_calls = []
    sleep_calls = []
    fake_page = _FakeBrowserPage(
        guest_mode=False,
        ws_url="",
        url="about:blank",
    )

    async def _maybe_refresh(reason):
        maybe_refresh_calls.append(reason)
        return False

    async def _sleep(delay):
        sleep_calls.append(delay)
        if delay >= 4.0:
            state.running = False

    try:
        state.running = True
        state.is_logged_in = True
        monkeypatch.setattr(connection, "SESSION_FILE", str(session_file))
        monkeypatch.setattr(connection.os.path, "getmtime", lambda _path: 100.0)
        monkeypatch.setattr(connection, "load_session_raw", lambda: json.loads(session_file.read_text()))
        monkeypatch.setattr(connection, "maybe_refresh", _maybe_refresh)
        monkeypatch.setattr(connection, "jitter_sleep", _sleep)
        _patch_listen_browser_gates(monkeypatch)
        counters = _patch_fake_browser_runtime_cdp(monkeypatch, fake_page)

        asyncio.run(connection.listen_browser([4]))

        assert counters["connect_over_cdp_calls"] == 1
        assert counters["launch_calls"] == 0
        assert counters["close_calls"] == 0
        assert maybe_refresh_calls == ["initial page load failed"]
        assert len(sleep_calls) == 1 and 4.0 <= sleep_calls[0] <= 6.0
    finally:
        monkeypatch.setattr(connection._cfg, "PS3838_BROWSER_CDP_URL", "")
        _restore_auth_state(snapshot)


def test_pick_cdp_page_reuses_blank_tab_before_opening_new_one():
    blank_page = types.SimpleNamespace(url="about:blank")
    unrelated_page = types.SimpleNamespace(url="https://example.test/")
    context = types.SimpleNamespace(pages=[unrelated_page, blank_page])

    picked = connection._pick_cdp_page(context, [29])

    assert picked is blank_page


def test_pick_cdp_page_reuses_same_site_home_tab_before_opening_new_one():
    home_page = types.SimpleNamespace(url="https://www.frozensunset88.xyz/en/")
    unrelated_page = types.SimpleNamespace(url="https://example.test/")
    context = types.SimpleNamespace(pages=[unrelated_page, home_page])
    session = {"ws_url": "wss://www.ps3838.com/sports-websocket/ws?token=NEW&ulp=ULP123"}

    picked = connection._pick_cdp_page(context, [29], session=session)

    assert picked is home_page
