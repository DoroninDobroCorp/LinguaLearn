from __future__ import annotations

import json

import pytest

from core import session_bootstrap


class _FakePage:
    def __init__(
        self,
        *,
        url: str = "https://www.silverglow58.xyz/en/compact/sports/soccer",
        body: str = "",
        balance: str = "",
        login_btns: int = 0,
        auth_raw: str = "",
        goto_result: dict | None = None,
        runtime_owned: bool = False,
    ):
        self.url = url
        self.body = body
        self.balance = balance
        self.login_btns = login_btns
        self.auth_raw = auth_raw
        self.goto_result = goto_result
        self._pin888_runtime_owned = runtime_owned
        self._pin888_runtime_marker = "__pin888_runtime__:hybrid" if runtime_owned else ""
        self.goto_calls: list[str] = []
        self.wait_calls: list[int] = []
        self.closed = False

    def evaluate(self, script, *args):
        if "window.name = marker" in script:
            marker = str(args[0] if args else "")
            self._pin888_runtime_owned = True
            self._pin888_runtime_marker = marker
            return marker
        if "typeof window.name === 'string' ? window.name : ''" in script:
            return self._pin888_runtime_marker
        if "document.body ? document.body.innerText.substring(0, 500)" in script:
            return self.body[:500]
        if "document.querySelector('[class*=balance]" in script:
            return self.balance
        if "localStorage.getItem('a')" in script:
            return self.auth_raw
        if "document.querySelectorAll('[class*=login-btn]" in script:
            return self.login_btns
        raise AssertionError(f"Unexpected evaluate script: {script}")

    def goto(self, url, timeout=None):
        self.goto_calls.append(url)
        if self.goto_result:
            self.body = self.goto_result.get("body", self.body)
            self.balance = self.goto_result.get("balance", self.balance)
            self.login_btns = self.goto_result.get("login_btns", self.login_btns)
            self.auth_raw = self.goto_result.get("auth_raw", self.auth_raw)

    def wait_for_timeout(self, ms):
        self.wait_calls.append(ms)

    def close(self):
        self.closed = True

    def is_closed(self):
        return self.closed


class _FakeContext:
    def __init__(self, pages: list[_FakePage] | None = None, *, new_page: _FakePage | None = None):
        self.pages = list(pages or [])
        self._new_page = new_page or _FakePage(url="https://b.link/ukz4v32x")

    def new_page(self):
        self.pages.append(self._new_page)
        return self._new_page


class _FakeLocator:
    def __init__(self, page: "_FakeLoginPage", selector: str):
        self.page = page
        self.selector = selector

    @property
    def first(self):
        return self

    def click(self, timeout=None):
        handler = self.page.click_handlers.get(self.selector)
        if handler is None:
            raise RuntimeError(f"click unavailable for {self.selector}")
        self.page.click_calls.append(self.selector)
        handler()

    def fill(self, value, timeout=None):
        if self.selector not in self.page.fillable_selectors:
            raise RuntimeError(f"fill unavailable for {self.selector}")
        self.page.fill_calls.append((self.selector, value))
        self.page.filled_values[self.selector] = value

    def press(self, key, timeout=None):
        if self.selector not in self.page.pressable_selectors:
            raise RuntimeError(f"press unavailable for {self.selector}")
        self.page.press_calls.append((self.selector, key))
        if key == "Enter":
            self.page._complete_login()


class _FakeLoginPage(_FakePage):
    def __init__(
        self,
        *,
        fillable_selectors: set[str] | None = None,
        click_handlers: dict[str, callable] | None = None,
        pressable_selectors: set[str] | None = None,
    ):
        super().__init__(url="https://www.silverglow58.xyz/en/", body="SIGN IN", login_btns=1, auth_raw="")
        self.fillable_selectors = set(fillable_selectors or set())
        self.click_handlers = dict(click_handlers or {})
        self.pressable_selectors = set(pressable_selectors or set())
        self.click_calls: list[str] = []
        self.fill_calls: list[tuple[str, str]] = []
        self.press_calls: list[tuple[str, str]] = []
        self.filled_values: dict[str, str] = {}

    def locator(self, selector: str):
        return _FakeLocator(self, selector)

    def _complete_login(self):
        self.body = "DEPOSIT"
        self.login_btns = 0
        self.auth_raw = "fresh-auth"


def test_check_login_status_requires_positive_auth_markers():
    page = _FakePage(body="Sports and results only", balance="", login_btns=0, auth_raw="")

    status = session_bootstrap.check_login_status(page)

    assert status == {"logged_in": False, "reason": "no authenticated markers"}


def test_check_login_status_accepts_local_storage_auth_marker():
    page = _FakePage(body="Deposit Sports page", balance="", login_btns=0, auth_raw="tokenized-auth")

    status = session_bootstrap.check_login_status(page)

    assert status["logged_in"] is True
    assert status["auth_signal"] == "deposit+localStorage.a"


def test_check_login_status_rejects_stale_local_storage_when_sign_in_visible():
    page = _FakePage(body="SIGN IN Sports page", balance="", login_btns=0, auth_raw="tokenized-auth")

    status = session_bootstrap.check_login_status(page)

    assert status == {"logged_in": False, "reason": "sign-in controls visible"}


def test_ensure_logged_in_page_prefers_existing_authenticated_runtime_page():
    guest_page = _FakePage(body="Odds are delayed for guest users", login_btns=1)
    logged_in_page = _FakePage(body="Deposit Cashier", auth_raw="ok", runtime_owned=True)
    context = _FakeContext([guest_page, logged_in_page])

    page, status = session_bootstrap.ensure_logged_in_page(context, entry_url="https://b.link/ukz4v32x", login_wait_sec=5.0)

    assert page is logged_in_page
    assert status["logged_in"] is True
    assert guest_page.goto_calls == []


def test_ensure_logged_in_page_ignores_existing_authenticated_non_runtime_page():
    user_page = _FakePage(body="Deposit Cashier", auth_raw="ok", runtime_owned=False)
    runtime_page = _FakePage(
        url="https://b.link/ukz4v32x",
        runtime_owned=False,
        goto_result={"body": "Deposit Cashier", "auth_raw": "ok", "login_btns": 0},
    )
    context = _FakeContext([user_page], new_page=runtime_page)

    page, status = session_bootstrap.ensure_logged_in_page(context, entry_url="https://b.link/ukz4v32x", login_wait_sec=5.0)

    assert page is runtime_page
    assert status["logged_in"] is True
    assert runtime_page.goto_calls == ["https://b.link/ukz4v32x"]
    assert user_page.goto_calls == []
    assert runtime_page._pin888_runtime_owned is True


def test_ensure_logged_in_page_adopts_blank_launcher_page():
    launcher_page = _FakePage(
        url="about:blank",
        runtime_owned=False,
        goto_result={"body": "Deposit Cashier", "auth_raw": "ok", "login_btns": 0},
    )
    context = _FakeContext([launcher_page])

    page, status = session_bootstrap.ensure_logged_in_page(context, entry_url="https://b.link/ukz4v32x", login_wait_sec=5.0)

    assert page is launcher_page
    assert status["logged_in"] is True
    assert launcher_page.goto_calls == ["https://b.link/ukz4v32x"]
    assert launcher_page._pin888_runtime_owned is True


def test_ensure_logged_in_page_raises_after_failed_navigation():
    guest_page = _FakePage(
        body="Odds are delayed for guest users",
        login_btns=1,
        goto_result={"body": "Sign in now", "login_btns": 1, "auth_raw": ""},
        runtime_owned=True,
    )
    context = _FakeContext([guest_page])

    with pytest.raises(RuntimeError, match="Login failed after navigation"):
        session_bootstrap.ensure_logged_in_page(context, entry_url="https://b.link/ukz4v32x", login_wait_sec=5.0)

    assert guest_page.goto_calls == ["https://b.link/ukz4v32x"]
    assert guest_page.wait_calls == [5000]


def test_ensure_logged_in_page_attempts_browser_login(monkeypatch):
    stale_compact = _FakePage(
        url="https://www.silverglow58.xyz/en/compact/sports/soccer",
        body="SIGN IN",
        login_btns=1,
        auth_raw="stale-auth",
        runtime_owned=True,
    )
    login_page = _FakePage(
        url="https://www.silverglow58.xyz/en/",
        body="SIGN IN",
        login_btns=1,
        auth_raw="",
        goto_result={"body": "SIGN IN", "login_btns": 1, "auth_raw": ""},
        runtime_owned=True,
    )
    context = _FakeContext([stale_compact, login_page])

    def _fake_attempt_browser_login(page, *, login_wait_sec):
        page.body = "16.38EUR DEPOSIT IvanIvanovich8"
        page.login_btns = 0
        page.auth_raw = "fresh-auth"
        return {"ok": True, "source": "PIN888 env", "reason": ""}

    monkeypatch.setattr(session_bootstrap, "attempt_browser_login", _fake_attempt_browser_login)

    page, status = session_bootstrap.ensure_logged_in_page(context, entry_url="https://b.link/ukz4v32x", login_wait_sec=5.0)

    assert page is login_page
    assert status["logged_in"] is True
    assert stale_compact in context.pages
    assert stale_compact.goto_calls == []


def test_attempt_browser_login_does_not_preclick_submit_when_fields_are_visible(monkeypatch):
    page = _FakeLoginPage(
        fillable_selectors={'input[name="loginId"]', 'input[name="pass"]'},
        pressable_selectors={'input[name="pass"]'},
    )

    def _submit():
        page._complete_login()

    page.click_handlers = {
        'button[type="submit"]': _submit,
        'button:has-text("SIGN IN")': lambda: (_ for _ in ()).throw(RuntimeError("should not pre-click")),
        'text=SIGN IN': lambda: (_ for _ in ()).throw(RuntimeError("should not pre-click")),
    }

    monkeypatch.setattr(
        "core.session_manager.resolve_login_credentials",
        lambda: ("IvanIvanovich8", "secret", "PIN888 env"),
    )

    result = session_bootstrap.attempt_browser_login(page, login_wait_sec=1.0)

    assert result["ok"] is True
    assert ('input[name="loginId"]', 'IvanIvanovich8') in page.fill_calls
    assert ('input[name="pass"]', 'secret') in page.fill_calls
    assert page.click_calls == ['button[type="submit"]']


def test_attempt_browser_login_clicks_opener_when_fields_are_hidden(monkeypatch):
    page = _FakeLoginPage()

    def _sign_in():
        if not page.fillable_selectors:
            page.fillable_selectors.update({'input[name="loginId"]', 'input[name="pass"]'})
            page.pressable_selectors.add('input[name="pass"]')
            return
        page._complete_login()

    page.click_handlers = {
        'button:has-text("SIGN IN")': _sign_in,
        'button[type="submit"]': _sign_in,
    }

    monkeypatch.setattr(
        "core.session_manager.resolve_login_credentials",
        lambda: ("IvanIvanovich8", "secret", "PIN888 env"),
    )

    result = session_bootstrap.attempt_browser_login(page, login_wait_sec=1.0)

    assert result["ok"] is True
    assert page.click_calls == ['button:has-text("SIGN IN")', 'button[type="submit"]']


def test_attempt_browser_login_dismisses_stale_error_dialog(monkeypatch):
    page = _FakeLoginPage(
        fillable_selectors={'input[name="loginId"]', 'input[name="pass"]'},
        pressable_selectors={'input[name="pass"]'},
    )

    dismissed = {"ok": False}

    def _dismiss_ok():
        dismissed["ok"] = True

    def _submit():
        if not dismissed["ok"]:
            raise RuntimeError("dialog still blocking submit")
        page._complete_login()

    page.click_handlers = {
        ".okBtn": _dismiss_ok,
        'button[type="submit"]': _submit,
    }

    monkeypatch.setattr(
        "core.session_manager.resolve_login_credentials",
        lambda: ("IvanIvanovich8", "secret", "PIN888 env"),
    )

    result = session_bootstrap.attempt_browser_login(page, login_wait_sec=1.0)

    assert result["ok"] is True
    assert page.click_calls == [".okBtn", ".okBtn", 'button[type="submit"]']


def test_save_session_populates_ws_url_from_cookies_when_missing(tmp_path, monkeypatch):
    session_file = tmp_path / "session.json"
    session = {
        "runtime_site_host": "www.quietthunder61.xyz",
        "cookies": [
            {"name": "_ulp", "value": "ULP123", "domain": ".pinnacle888.com", "path": "/"},
            {"name": "JSESSIONID", "value": "js", "domain": ".pinnacle888.com", "path": "/"},
        ],
        "ws_url": "",
    }

    monkeypatch.setattr("core.session_manager.fetch_fresh_ws_token", lambda cookies: "NEW_TOKEN")

    session_bootstrap.save_session(session, str(session_file))

    persisted = json.loads(session_file.read_text())
    assert "NEW_TOKEN" in persisted["ws_url"]
    assert "ULP123" in persisted["ws_url"]
