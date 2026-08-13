import asyncio
import json
import tempfile

import pytest

import services.bet_service as bet_service_module
from services.bet_service import PS3838BetClient, _assert_no_local_auth_env, _is_multiple_login_error


def test_bet_service_rejects_local_auth_env(monkeypatch):
    monkeypatch.setenv("PS3838_EMAIL", "acc")
    monkeypatch.setenv("PS3838_PASSWORD", "secret")

    with pytest.raises(RuntimeError, match="sole session owner"):
        _assert_no_local_auth_env()


def test_owned_session_mode_requires_prefixed_credentials(monkeypatch):
    monkeypatch.setattr(bet_service_module, "BET_SERVICE_OWN_SESSION", True)
    monkeypatch.setattr(bet_service_module, "BET_SERVICE_LOGIN_ID", "")
    monkeypatch.setattr(bet_service_module, "BET_SERVICE_LOGIN_PASSWORD", "")

    with pytest.raises(RuntimeError, match="PS3838_BET_LOGIN_ID"):
        bet_service_module._assert_owned_session_env()


def test_maybe_reload_session_owned_uses_fresh_local_file_without_login(monkeypatch):
    async def _run():
        client = PS3838BetClient("/tmp/owned-session.json", own_session=True)
        now = bet_service_module.time.time()
        valid_data = {
            "cookies": [{"name": "auth", "value": "ok"}],
            "v_hucode": "0123456789abcdef0123456789abcdef",
            "x_app_data": "k=v",
            "session_epoch": 1,
        }
        login_calls = {"count": 0}
        reload_calls = {"count": 0}

        def fake_read_session_file():
            return valid_data, now

        def fake_login_once():
            login_calls["count"] += 1
            return True

        async def fake_reload(allow_unchanged=False):
            reload_calls["count"] += 1
            assert allow_unchanged is False
            return True

        client._read_session_file = fake_read_session_file
        client._run_owned_login_once = fake_login_once
        client._reload_session_from_parser_file = fake_reload

        reloaded = await client._maybe_reload_session()
        assert reloaded is True
        assert login_calls["count"] == 0
        assert reload_calls["count"] == 1

    asyncio.run(_run())


def test_maybe_reload_session_owned_triggers_login_for_missing_file(monkeypatch):
    async def _run():
        client = PS3838BetClient("/tmp/owned-session.json", own_session=True)
        login_calls = {"count": 0}
        reload_calls = {"count": 0}

        def fake_read_session_file():
            return None, 0.0

        def fake_login_once():
            login_calls["count"] += 1
            return True

        async def fake_reload(allow_unchanged=False):
            reload_calls["count"] += 1
            assert allow_unchanged is True
            return True

        client._read_session_file = fake_read_session_file
        client._run_owned_login_once = fake_login_once
        client._reload_session_from_parser_file = fake_reload

        reloaded = await client._maybe_reload_session()
        assert reloaded is True
        assert login_calls["count"] == 1
        assert reload_calls["count"] == 1

    asyncio.run(_run())


def test_live_tennis_ml_retries_with_parent_line0():
    async def _run():
        client = PS3838BetClient("/tmp/unused-session.json")
        calls = []

        async def fake_send_verify_request(odds_selections):
            calls.append(odds_selections)
            if len(calls) == 1:
                return ([
                    {
                        "status": "UNAVAILABLE",
                        "odds": None,
                        "selectionId": None,
                        "lineId": 0,
                        "altLineId": 0,
                        "eventId": 1626660933,
                        "betType": 1,
                        "periodNum": 0,
                        "inplay": False,
                    }
                ], None)
            return ([
                {
                    "status": "OK",
                    "odds": "3.070",
                    "selectionId": "3513480830|0|1626690793|0|1|0|0|0.00|0",
                    "lineId": 3513480830,
                    "altLineId": 0,
                    "eventId": 1626690793,
                    "betType": 1,
                    "periodNum": 0,
                    "inplay": True,
                }
            ], None)

        client._send_verify_request = fake_send_verify_request

        result = await client.verify_betslip([
            {
                "event_id": 1626660933,
                "period": 0,
                "bet_type": 1,
                "team_select": 0,
                "handicap": 0,
                "line_id": 3513480830,
                "is_alt": 0,
                "sport": "Tennis",
            }
        ])

        assert len(calls) == 2
        assert calls[0][0]["selectionId"] == "3513480830|1626660933|0|1|0|0|0|0"
        assert calls[1][0]["selectionId"] == "0|1626660933|0|1|0|0|0|0"
        assert result[0]["status"] == "OK"
        assert result[0]["odds"] == "3.070"

    asyncio.run(_run())


def test_non_tennis_unavailable_does_not_retry_parent_line0():
    async def _run():
        client = PS3838BetClient("/tmp/unused-session.json")
        calls = []

        async def fake_send_verify_request(odds_selections):
            calls.append(odds_selections)
            return ([
                {
                    "status": "UNAVAILABLE",
                    "odds": None,
                    "selectionId": None,
                    "lineId": 0,
                    "altLineId": 0,
                    "eventId": 123456,
                    "betType": 1,
                    "periodNum": 0,
                    "inplay": True,
                }
            ], None)

        client._send_verify_request = fake_send_verify_request

        result = await client.verify_betslip([
            {
                "event_id": 123456,
                "period": 0,
                "bet_type": 1,
                "team_select": 0,
                "handicap": 0,
                "line_id": 987654321,
                "is_alt": 0,
                "sport": "Soccer",
            }
        ])

        assert len(calls) == 1
        assert result[0]["status"] == "UNAVAILABLE"

    asyncio.run(_run())


def test_precheck_does_not_block_when_parser_event_is_missing():
    async def _run():
        client = PS3838BetClient("/tmp/unused-session.json")

        async def fake_fetch_parser_event(event_id, force_refresh=False):
            return None

        client._fetch_parser_event = fake_fetch_parser_event

        blocked = await client._precheck_selection({
            "event_id": 1626660933,
            "period": 0,
            "bet_type": 1,
            "team_select": 0,
            "handicap": 0,
            "line_id": 3513480830,
            "is_alt": 0,
            "sport": "Tennis",
        })

        assert blocked is None

    asyncio.run(_run())


def test_multiple_login_error_detection():
    assert _is_multiple_login_error('{"error":"MULTIPLE_LOGIN"}') is True
    assert _is_multiple_login_error({"error": "MULTIPLE_LOGIN"}) is True
    assert _is_multiple_login_error("multiple login") is True
    assert _is_multiple_login_error({"error": "SOMETHING_ELSE"}) is False


def test_send_verify_request_stops_on_multiple_login_403_without_parser_session_reload():
    class _FakeResponse:
        def __init__(self, status, text):
            self.status = status
            self._text = text

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def text(self):
            return self._text

        async def json(self, content_type=None):
            raise AssertionError("json() must not be called for MULTIPLE_LOGIN 403")

    class _FakeSession:
        def __init__(self):
            self.calls = 0

        def post(self, url, json):
            self.calls += 1
            return _FakeResponse(403, '{"error":"MULTIPLE_LOGIN"}')

    async def _run():
        client = PS3838BetClient("/tmp/unused-session.json")
        fake_session = _FakeSession()
        client._session = fake_session
        reload_calls = {"count": 0}

        async def fake_reload():
            reload_calls["count"] += 1
            return False

        client._maybe_reload_session = fake_reload
        data, err = await client._send_verify_request([{"selectionId": "dummy"}])

        assert data is None
        assert err == [{"status": "ERROR", "error": "HTTP 403 MULTIPLE_LOGIN"}]
        assert fake_session.calls == 1
        assert reload_calls["count"] == 1

    asyncio.run(_run())


def test_send_verify_request_does_not_reload_on_multiple_login_403_second_attempt():
    class _FakeResponse:
        def __init__(self, status, text):
            self.status = status
            self._text = text

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def text(self):
            return self._text

        async def json(self, content_type=None):
            raise AssertionError("json() must not be called for MULTIPLE_LOGIN 403")

    class _FakeSession:
        def __init__(self):
            self.calls = 0

        def post(self, url, json):
            self.calls += 1
            if self.calls == 1:
                return _FakeResponse(403, '{"error":"TEMP_403"}')
            return _FakeResponse(403, '{"error":"MULTIPLE_LOGIN"}')

    async def _run():
        client = PS3838BetClient("/tmp/unused-session.json")
        fake_session = _FakeSession()
        client._session = fake_session
        reload_calls = {"count": 0}

        async def fake_reload():
            reload_calls["count"] += 1
            return True

        client._maybe_reload_session = fake_reload
        data, err = await client._send_verify_request([{"selectionId": "dummy"}])

        assert data is None
        assert err == [{"status": "ERROR", "error": "HTTP 403 MULTIPLE_LOGIN"}]
        assert fake_session.calls == 2
        assert reload_calls["count"] == 1

    asyncio.run(_run())


def test_maybe_reload_session_uses_parser_file_only():
    async def _run():
        with tempfile.NamedTemporaryFile("w+", suffix=".json", delete=True) as f:
            json.dump({
                "cookies": [{"name": "auth", "value": "old"}],
                "v_hucode": "0123456789abcdef0123456789abcdef",
                "x_app_data": "k=v",
                "session_epoch": 1,
            }, f)
            f.flush()

            client = PS3838BetClient(f.name)
            client._load_session()
            created = {"count": 0}

            async def fake_create_http_session():
                created["count"] += 1

            client._create_http_session = fake_create_http_session

            reloaded = await client._maybe_reload_session()
            assert reloaded is False
            assert created["count"] == 0

            f.seek(0)
            f.truncate()
            json.dump({
                "cookies": [{"name": "auth", "value": "new"}],
                "v_hucode": "fedcba9876543210fedcba9876543210",
                "x_app_data": "k=v2",
                "session_epoch": 2,
            }, f)
            f.flush()

            reloaded = await client._maybe_reload_session()
            assert reloaded is True
            assert created["count"] == 1
            assert client.cookies[0]["value"] == "new"
            assert client._session_epoch == 2

    asyncio.run(_run())


def test_send_verify_request_retries_multiple_login_after_parser_session_reload():
    class _FakeResponse:
        def __init__(self, status, text=None, payload=None):
            self.status = status
            self._text = text or ""
            self._payload = payload

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def text(self):
            return self._text

        async def json(self, content_type=None):
            if self._payload is None:
                raise AssertionError("json() unexpected")
            return self._payload

    class _FakeSession:
        def __init__(self):
            self.calls = 0

        def post(self, url, json):
            self.calls += 1
            if self.calls == 1:
                return _FakeResponse(403, '{"error":"MULTIPLE_LOGIN"}')
            return _FakeResponse(200, payload=[{"status": "OK", "odds": "1.950"}])

    async def _run():
        client = PS3838BetClient("/tmp/unused-session.json")
        fake_session = _FakeSession()
        client._session = fake_session
        reload_calls = {"count": 0}

        async def fake_reload():
            reload_calls["count"] += 1
            return True

        client._maybe_reload_session = fake_reload
        data, err = await client._send_verify_request([{"selectionId": "dummy"}])

        assert err is None
        assert data == [{"status": "OK", "odds": "1.950"}]
        assert fake_session.calls == 2
        assert reload_calls["count"] == 1

    asyncio.run(_run())


def test_send_verify_request_retries_transient_403_with_local_session_rebuild():
    class _FakeResponse:
        def __init__(self, status, text=None, payload=None):
            self.status = status
            self._text = text or ""
            self._payload = payload

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def text(self):
            return self._text

        async def json(self, content_type=None):
            if self._payload is None:
                raise AssertionError("json() unexpected")
            return self._payload

    class _FakeSession:
        def __init__(self):
            self.calls = 0

        def post(self, url, json):
            self.calls += 1
            if self.calls == 1:
                return _FakeResponse(403, '{"error":"TEMP_403"}')
            return _FakeResponse(200, payload=[{"status": "OK", "odds": "1.950"}])

    async def _run():
        client = PS3838BetClient("/tmp/unused-session.json")
        fake_session = _FakeSession()
        client._session = fake_session
        reload_calls = {"changed": 0, "rebuilt": 0}

        async def fake_reload():
            reload_calls["changed"] += 1
            return False

        async def fake_rebuild(allow_unchanged=False):
            reload_calls["rebuilt"] += 1
            assert allow_unchanged is True
            return True

        client._maybe_reload_session = fake_reload
        client._reload_session_from_parser_file = fake_rebuild
        data, err = await client._send_verify_request([{"selectionId": "dummy"}])

        assert err is None
        assert data == [{"status": "OK", "odds": "1.950"}]
        assert fake_session.calls == 2
        assert reload_calls == {"changed": 1, "rebuilt": 1}

    asyncio.run(_run())


def test_send_verify_request_rate_limit_backoff_then_success_resets_streak(monkeypatch):
    class _FakeResponse:
        def __init__(self, status, text=None, payload=None):
            self.status = status
            self._text = text or ""
            self._payload = payload

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def text(self):
            return self._text

        async def json(self, content_type=None):
            if self._payload is None:
                raise AssertionError("json() unexpected")
            return self._payload

    class _FakeSession:
        def __init__(self):
            self.calls = 0

        def post(self, url, json):
            self.calls += 1
            if self.calls == 1:
                return _FakeResponse(
                    429,
                    '{"title":"Error 1015: You are being rate limited","status":429}',
                )
            return _FakeResponse(200, payload=[{"status": "OK", "odds": "1.950"}])

    async def _run():
        now = {"value": 1000.0}
        sleeps = []

        def fake_time():
            return now["value"]

        async def fake_sleep(delay):
            sleeps.append(round(float(delay), 3))
            now["value"] += float(delay)

        monkeypatch.setattr(bet_service_module.time, "time", fake_time)
        monkeypatch.setattr(bet_service_module.asyncio, "sleep", fake_sleep)

        client = PS3838BetClient("/tmp/unused-session.json")
        client._session = _FakeSession()

        data1, err1 = await client._send_verify_request([{"selectionId": "dummy"}])
        assert data1 is None
        assert err1[0]["error_code"] == "BETSLIP_RATE_LIMIT"
        assert err1[0]["retry_after_sec"] == 1.0
        assert client._betslip_rate_limit_streak == 1

        data2, err2 = await client._send_verify_request([{"selectionId": "dummy"}])
        assert err2 is None
        assert data2 == [{"status": "OK", "odds": "1.950"}]
        assert client._betslip_rate_limit_streak == 0
        assert sleeps == [1.0]

    asyncio.run(_run())


def test_verify_rate_limit_ladder_opens_circuit_and_stops_browser(monkeypatch):
    async def _run():
        now = {"value": 2000.0}
        shutdown_calls = []

        def fake_time():
            return now["value"]

        async def fake_shutdown(reason):
            shutdown_calls.append(reason)

        monkeypatch.setattr(bet_service_module.time, "time", fake_time)

        client = PS3838BetClient("/tmp/unused-session.json")
        client._shutdown_cdp_browser = fake_shutdown

        expected_steps = [1.0, 3.0, 5.0, 10.0, 20.0, 60.0]
        for idx, step in enumerate(expected_steps, start=1):
            err = await client._record_verify_rate_limit(status=429, detail="Error 1015")
            assert err[0]["error_code"] == "BETSLIP_RATE_LIMIT"
            assert client._betslip_rate_limit_streak == idx
            assert client._betslip_block_until == pytest.approx(now["value"] + step)
            now["value"] += step + 0.1

        err = await client._record_verify_rate_limit(status=429, detail="Error 1015")
        assert err[0]["error_code"] == "BETSLIP_RATE_LIMIT_CIRCUIT_OPEN"
        assert client._betslip_rate_limit_circuit_open is True
        assert client._betslip_browser_stop_requested is True
        assert len(shutdown_calls) == 1

    asyncio.run(_run())


def test_maybe_attach_exact_price_adds_shadow_quote():
    async def _run():
        client = PS3838BetClient("/tmp/unused-session.json")
        client._exact_price_enabled = True
        client._exact_price_require_flag = True

        class _FakeExactClient:
            async def quote_pin88(self, event_ref, selection):
                assert event_ref["sport_code"] == "fb"
                assert selection["event_id"] == 321
                return {"status": "OK", "bookie": "pin88", "odds": 1.98}

        async def fake_fetch_bia_event_ref(event_id, period, force_refresh=False):
            assert event_id == 321
            assert period == 0
            return {
                "sport_code": "fb",
                "event_key": "2026-04-05,95,47",
                "period": 0,
                "swapped": False,
            }

        client._exact_price_client = _FakeExactClient()
        client._fetch_bia_event_ref = fake_fetch_bia_event_ref

        results = await client.maybe_attach_exact_price(
            [{"event_id": 321, "period": 0, "bet_type": 1, "team_select": 0, "handicap": 0}],
            [{"status": "OK", "event_id": 321, "period_num": 0, "odds": "2.05"}],
            requested=True,
        )

        assert results[0]["exact_price"]["status"] == "OK"
        assert results[0]["exact_price"]["event_ref"]["event_key"] == "2026-04-05,95,47"
        assert results[0]["exact_price"]["vs_verify_odds_delta"] == pytest.approx(-0.07)

    asyncio.run(_run())


def test_maybe_attach_exact_price_marks_requested_feature_disabled():
    async def _run():
        client = PS3838BetClient("/tmp/unused-session.json")
        client._exact_price_enabled = False

        results = await client.maybe_attach_exact_price(
            [{"event_id": 321, "period": 0}],
            [{"status": "OK", "event_id": 321, "period_num": 0, "odds": "2.05"}],
            requested=True,
        )

        assert results[0]["exact_price"]["status"] == "DISABLED"
        assert results[0]["exact_price"]["error_code"] == "EXACT_PRICE_DISABLED"

    asyncio.run(_run())


def test_apply_session_data_filters_illegal_and_cross_domain_cookies():
    async def _run():
        client = PS3838BetClient("/tmp/unused-session.json")
        client._apply_session_data(
            {
                "runtime_site_origin": "https://www.silentvoyage34.xyz",
                "session_epoch": 1,
                "cookies": [
                    {
                        "name": "JSESSIONID",
                        "value": "ok",
                        "domain": ".silentvoyage34.xyz",
                        "path": "/",
                    },
                    {
                        "name": "https://www.klm.com_bad$$session_state",
                        "value": "nope",
                        "domain": ".silentvoyage34.xyz",
                        "path": "/",
                    },
                    {
                        "name": "_ulp",
                        "value": "skip-cross-domain",
                        "domain": ".example.com",
                        "path": "/",
                    },
                ],
                "v_hucode": "0123456789abcdef0123456789abcdef",
                "x_app_data": "foo=bar",
            },
            mtime=1.0,
        )

        assert [cookie["name"] for cookie in client.cookies] == ["JSESSIONID"]

        await client._create_http_session()
        assert client._session is not None
        await client.close()

    asyncio.run(_run())
