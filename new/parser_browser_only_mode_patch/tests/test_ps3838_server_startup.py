import asyncio
from http import HTTPStatus

import orjson
import pytest

import ps3838_server
from state import ParserState


def test_requirement_import_name_maps_pip_names_to_import_names():
    assert ps3838_server._requirement_import_name("python-dotenv==1.0.1") == "dotenv"
    assert ps3838_server._requirement_import_name("PySocks==1.7.1") == "socks"
    assert ps3838_server._requirement_import_name("custom-package>=2.0") == "custom_package"


def test_missing_runtime_requirements_skips_comments_and_uses_mapping(tmp_path, monkeypatch):
    requirements_path = tmp_path / "requirements.txt"
    requirements_path.write_text(
        "\n".join(
            [
                "# comment",
                "python-dotenv==1.0.1",
                "orjson==3.10.15",
                "",
            ]
        ),
        encoding="utf-8",
    )
    imported_names = []

    def fake_import_module(module_name: str):
        imported_names.append(module_name)
        if module_name == "dotenv":
            raise ImportError("missing")
        return object()

    monkeypatch.setattr(ps3838_server.importlib, "import_module", fake_import_module)

    missing = ps3838_server._missing_runtime_requirements(requirements_path)

    assert imported_names == ["dotenv", "orjson"]
    assert missing == ["python-dotenv==1.0.1"]


def test_bootstrap_runtime_dependencies_respects_disable_flag(monkeypatch, tmp_path):
    monkeypatch.setenv("PS3838_AUTO_INSTALL_REQUIREMENTS", "0")
    monkeypatch.setattr(ps3838_server, "__file__", str(tmp_path / "ps3838_server.py"))
    monkeypatch.setattr(ps3838_server, "_missing_runtime_requirements", lambda _path: ["orjson==3.10.15"])

    called = False

    def fake_check_call(_args):
        nonlocal called
        called = True

    monkeypatch.setattr(ps3838_server.subprocess, "check_call", fake_check_call)

    ps3838_server._bootstrap_runtime_dependencies()

    assert called is False


def test_bootstrap_disabled_by_default_without_env_var(monkeypatch, tmp_path):
    """Auto-install is opt-in: with no env var set, bootstrap must not run pip."""
    monkeypatch.delenv("PS3838_AUTO_INSTALL_REQUIREMENTS", raising=False)
    monkeypatch.setattr(ps3838_server, "__file__", str(tmp_path / "ps3838_server.py"))
    monkeypatch.setattr(ps3838_server, "_missing_runtime_requirements", lambda _path: ["orjson==3.10.15"])

    called = False

    def fake_check_call(_args):
        nonlocal called
        called = True

    monkeypatch.setattr(ps3838_server.subprocess, "check_call", fake_check_call)

    ps3838_server._bootstrap_runtime_dependencies()

    assert called is False


def test_bootstrap_runs_when_explicitly_enabled(monkeypatch, tmp_path):
    """Auto-install runs when PS3838_AUTO_INSTALL_REQUIREMENTS=1 is set."""
    monkeypatch.setenv("PS3838_AUTO_INSTALL_REQUIREMENTS", "1")
    monkeypatch.setattr(ps3838_server, "__file__", str(tmp_path / "ps3838_server.py"))
    req_file = tmp_path / "requirements.txt"
    req_file.write_text("orjson==3.10.15\n", encoding="utf-8")
    monkeypatch.setattr(ps3838_server, "_missing_runtime_requirements", lambda _path: ["orjson==3.10.15"])

    installed = []

    def fake_check_call(args):
        installed.extend(args)

    monkeypatch.setattr(ps3838_server.subprocess, "check_call", fake_check_call)

    ps3838_server._bootstrap_runtime_dependencies()

    assert "orjson==3.10.15" in installed


def test_cookies_endpoint_disabled_by_default(monkeypatch):
    """With PS3838_COOKIES_ENDPOINT_ENABLED unset (default=0), /cookies returns 403."""
    monkeypatch.setattr(ps3838_server.config, "PS3838_COOKIES_ENDPOINT_ENABLED", False, raising=False)

    status, _headers, body = asyncio.run(ps3838_server.process_request("/cookies", {}))
    payload = orjson.loads(body)

    assert status == HTTPStatus.FORBIDDEN
    assert "disabled" in payload["error"]


def test_cookies_endpoint_serves_when_enabled(monkeypatch, tmp_path):
    """With PS3838_COOKIES_ENDPOINT_ENABLED=1 and a valid session file, /cookies returns data."""
    import json as _json

    session_file = tmp_path / "session.json"
    session_file.write_text(
        _json.dumps({"cookies": [{"name": "test", "value": "v"}], "v_hucode": "abc", "x_app_data": "xyz"}),
        encoding="utf-8",
    )

    monkeypatch.setattr(ps3838_server.config, "PS3838_COOKIES_ENDPOINT_ENABLED", True, raising=False)
    monkeypatch.setattr(ps3838_server, "SESSION_FILE", str(session_file))

    status, _headers, body = asyncio.run(ps3838_server.process_request("/cookies", {}))
    payload = orjson.loads(body)

    assert status == HTTPStatus.OK
    assert payload["v_hucode"] == "abc"
    assert len(payload["cookies"]) == 1


def test_lookup_bia_endpoint_returns_match(monkeypatch):
    def fake_lookup(event_id: int, *, period: int = 0):
        assert event_id == 123
        assert period == 1
        return {
            "event_id": 123,
            "period": 1,
            "sport_code": "fb_ht",
            "event_key": "2026-04-05,95,47",
            "swapped": True,
        }

    monkeypatch.setattr(ps3838_server, "lookup_bia_event_for_pid", fake_lookup)

    status, _headers, body = asyncio.run(ps3838_server.process_request("/lookup-bia?event_id=123&period=1", {}))
    payload = orjson.loads(body)

    assert status == HTTPStatus.OK
    assert payload["found"] is True
    assert payload["sport_code"] == "fb_ht"
    assert payload["swapped"] is True


def test_lookup_bia_endpoint_requires_event_id():
    status, _headers, body = asyncio.run(ps3838_server.process_request("/lookup-bia", {}))
    payload = orjson.loads(body)

    assert status == HTTPStatus.BAD_REQUEST
    assert "event_id" in payload["error"]


def test_hydrate_bia_pmm_endpoint_returns_summary(monkeypatch):
    async def fake_hydrate(event_id: int, *, periods=None, client=None):
        assert event_id == 123
        assert periods == (1,)
        return {
            "status": "ok",
            "event_id": 123,
            "supported_only": True,
            "updated_total": 2,
        }

    monkeypatch.setattr(ps3838_server, "hydrate_bia_supported_outcomes", fake_hydrate)

    status, _headers, body = asyncio.run(
        ps3838_server.process_request("/hydrate-bia-pmm?event_id=123&period=1", {})
    )
    payload = orjson.loads(body)

    assert status == HTTPStatus.OK
    assert payload["event_id"] == 123
    assert payload["updated_total"] == 2


def test_hydrate_bia_pmm_endpoint_requires_event_id():
    status, _headers, body = asyncio.run(ps3838_server.process_request("/hydrate-bia-pmm", {}))
    payload = orjson.loads(body)

    assert status == HTTPStatus.BAD_REQUEST
    assert "event_id" in payload["error"]


def test_hydrate_bia_event_endpoint_returns_summary(monkeypatch):
    async def fake_hydrate(event_id: int, *, periods=None, timeout_sec=None):
        assert event_id == 123
        assert periods == (0,)
        return {
            "status": "ok",
            "event_id": 123,
            "updated_periods": 1,
        }

    monkeypatch.setattr(ps3838_server, "hydrate_bia_event_snapshot", fake_hydrate)

    status, _headers, body = asyncio.run(
        ps3838_server.process_request("/hydrate-bia-event?event_id=123&period=0", {})
    )
    payload = orjson.loads(body)

    assert status == HTTPStatus.OK
    assert payload["event_id"] == 123
    assert payload["updated_periods"] == 1


def test_hydrate_bia_event_endpoint_requires_event_id():
    status, _headers, body = asyncio.run(ps3838_server.process_request("/hydrate-bia-event", {}))
    payload = orjson.loads(body)

    assert status == HTTPStatus.BAD_REQUEST
    assert "event_id" in payload["error"]


@pytest.mark.asyncio
async def test_main_hybrid_setup_completes_before_server_bind(monkeypatch):
    import core.hybrid_runner as hybrid_runner_module

    order = []

    class _FakeServe:
        async def __aenter__(self):
            order.append("serve-enter")
            return self

        async def __aexit__(self, exc_type, exc, tb):
            order.append("serve-exit")

    class _FakeRunner:
        def __init__(self, *args, **kwargs):
            order.append("runner-init")

        async def setup_async(self):
            order.append("setup")

        async def run(self):
            order.append("run")

        def shutdown(self):
            order.append("shutdown")

    async def _done(name):
        order.append(name)

    monkeypatch.setattr(ps3838_server, "_acquire_runtime_lock", lambda: True)
    monkeypatch.setattr(ps3838_server, "_release_runtime_lock", lambda: order.append("release"))
    monkeypatch.setattr(ps3838_server, "serve", lambda *args, **kwargs: _FakeServe())
    monkeypatch.setattr(ps3838_server, "_transport_backend", lambda: "hybrid_runner")
    monkeypatch.setattr(ps3838_server, "log", lambda _msg: None)
    monkeypatch.setattr(ps3838_server.config, "BIA_ENABLED", False, raising=False)
    monkeypatch.setattr(ps3838_server.state, "running", True, raising=False)
    monkeypatch.setattr(ps3838_server, "zombie_reaper", lambda: _done("zombie"))
    monkeypatch.setattr(ps3838_server, "events_data_ttl_cleanup", lambda: _done("ttl"))
    monkeypatch.setattr(ps3838_server, "send_state_loop", lambda: _done("send-state"))
    monkeypatch.setattr(ps3838_server, "rebroadcast_loop", lambda: _done("rebroadcast"))
    monkeypatch.setattr(ps3838_server, "_stop_hybrid_poll_loop", lambda: _done("stop-poll"))
    monkeypatch.setattr(hybrid_runner_module, "HybridRunner", _FakeRunner)
    monkeypatch.setattr(hybrid_runner_module, "_running", True, raising=False)

    await ps3838_server.main()

    assert order.index("setup") < order.index("serve-enter")
    assert order.index("setup") < order.index("zombie")


def _stub_health_dependencies(monkeypatch):
    async def _noop_check_silence():
        return False

    monkeypatch.setattr(ps3838_server.config, "PS3838_ONLY_LIVE", False, raising=False)
    monkeypatch.setattr(ps3838_server.config, "PS3838_ONLY_PREMATCH", False, raising=False)
    monkeypatch.setattr(ps3838_server, "check_silence", _noop_check_silence)
    monkeypatch.setattr(
        ps3838_server,
        "current_account_health_snapshot",
        lambda now=None: {
            "state": "healthy",
            "score": 100,
            "recommended_action": "keep_running",
            "reasons": [],
        },
    )
    monkeypatch.setattr(
        ps3838_server,
        "build_runtime_alerts",
        lambda **kwargs: {"active": [], "count": 0, "highest_severity": None},
    )
    monkeypatch.setattr(ps3838_server, "_count_active_closed_markers", lambda _events: {"total": 0, "by_market": {}})
    monkeypatch.setattr(ps3838_server, "_summarize_live_base_market_ages", lambda _events, now_ts=None: {})
    monkeypatch.setattr(ps3838_server, "collect_live_market_outliers", lambda *args, **kwargs: [])
    monkeypatch.setattr(ps3838_server, "_get_ws_sp_diag", lambda: {})
    monkeypatch.setattr(
        ps3838_server,
        "bia_observer_snapshot",
        lambda now=None: {"enabled": False, "running": False, "phase": "observer-only",
                          "state": "idle",
                          "connected": False, "ws_uptime_sec": None, "last_msg_age_sec": None,
                          "subscribed": False, "counters": {"events": 0, "offers": 0, "pmm": 0, "info": 0, "other": 0},
                          "sports_seen": [], "discovered_events": 0, "errors": 0},
    )


def test_health_reason_uses_current_valid_data_age_when_fresh(monkeypatch):
    test_state = ParserState()
    test_state.stale = False
    test_state.stale_reason = "old stale marker"
    test_state.is_logged_in = True
    test_state.last_data_recv_time = 79.0
    test_state.last_valid_data_time = 80.0
    test_state.last_ws_activity_time = 70.0

    monkeypatch.setattr(ps3838_server, "state", test_state, raising=False)
    monkeypatch.setattr(ps3838_server.time, "time", lambda: 100.0)
    _stub_health_dependencies(monkeypatch)

    status, _headers, body = asyncio.run(ps3838_server.process_request("/health", {}))
    payload = orjson.loads(body)

    assert status == HTTPStatus.OK
    assert payload["status"] == "ok"
    assert payload["reason"] == "data fresh (age 20.0s)"
    assert payload["last_msg_age_sec"] == 21.0
    assert payload["freshness"]["valid_data_age_sec"] == 20.0
    assert payload["freshness"]["ws_activity_age_sec"] == 30.0


def test_health_refreshes_stale_state_before_building_payload(monkeypatch):
    test_state = ParserState()
    test_state.stale = True
    test_state.stale_reason = "connected, waiting for data"
    test_state.is_logged_in = True
    test_state.last_data_recv_time = 99.0
    test_state.last_valid_data_time = 99.0
    test_state.last_ws_activity_time = 99.0

    async def _fake_check_silence():
        test_state.stale = False
        test_state.stale_reason = "data fresh (age 1.0s)"
        test_state.stale_live = False
        test_state.stale_prematch = False
        return False

    monkeypatch.setattr(ps3838_server, "state", test_state, raising=False)
    monkeypatch.setattr(ps3838_server, "check_silence", _fake_check_silence)
    monkeypatch.setattr(ps3838_server.time, "time", lambda: 100.0)
    _stub_health_dependencies(monkeypatch)
    monkeypatch.setattr(ps3838_server, "check_silence", _fake_check_silence)

    status, _headers, body = asyncio.run(ps3838_server.process_request("/health", {}))
    payload = orjson.loads(body)

    assert status == HTTPStatus.OK
    assert payload["status"] == "ok"
    assert payload["stale"] is False
    assert payload["reason"] == "data fresh (age 1.0s)"


def test_health_exposes_partial_lane_stale_flags(monkeypatch):
    test_state = ParserState()
    test_state.stale = False
    test_state.stale_live = False
    test_state.stale_prematch = True
    test_state.is_logged_in = True
    test_state.last_data_recv_time = 89.0
    test_state.last_valid_data_time = 90.0
    test_state.last_ws_activity_time = 95.0

    monkeypatch.setattr(ps3838_server, "state", test_state, raising=False)
    monkeypatch.setattr(ps3838_server.time, "time", lambda: 100.0)
    _stub_health_dependencies(monkeypatch)

    status, _headers, body = asyncio.run(ps3838_server.process_request("/health", {}))
    payload = orjson.loads(body)

    assert status == HTTPStatus.OK
    assert payload["stale"] is False
    assert payload["reason"] == "data fresh (age 10.0s)"
    assert payload["freshness"]["live_lane_stale"] is False
    assert payload["freshness"]["prematch_lane_stale"] is True


def test_health_reports_error_when_account_health_requires_manual_review(monkeypatch):
    test_state = ParserState()
    test_state.stale = False
    test_state.is_logged_in = True
    test_state.last_data_recv_time = 95.0
    test_state.last_valid_data_time = 95.0
    test_state.last_ws_activity_time = 95.0

    monkeypatch.setattr(ps3838_server, "state", test_state, raising=False)
    monkeypatch.setattr(ps3838_server.time, "time", lambda: 100.0)
    _stub_health_dependencies(monkeypatch)
    monkeypatch.setattr(
        ps3838_server,
        "current_account_health_snapshot",
        lambda now=None: {
            "state": "manual_review",
            "score": 40,
            "recommended_action": "rotate_session_manually",
            "reasons": ["S29 ws expired 401; waiting for manual session rotation"],
        },
    )

    status, _headers, body = asyncio.run(ps3838_server.process_request("/health", {}))
    payload = orjson.loads(body)

    assert status == HTTPStatus.SERVICE_UNAVAILABLE
    assert payload["status"] == "error"
    assert payload["session_valid"] is False
    assert "manual session rotation" in payload["reason"]


def test_health_is_live_reflects_cached_live_events(monkeypatch):
    test_state = ParserState()
    test_state.stale = False
    test_state.is_logged_in = True
    test_state.last_data_recv_time = 95.0
    test_state.last_valid_data_time = 95.0
    test_state.last_ws_activity_time = 95.0
    test_state.last_is_live = False
    test_state.events_data = {
        101: {"isLive": False},
        202: {"isLive": True},
    }

    monkeypatch.setattr(ps3838_server, "state", test_state, raising=False)
    monkeypatch.setattr(ps3838_server.time, "time", lambda: 100.0)
    _stub_health_dependencies(monkeypatch)

    status, _headers, body = asyncio.run(ps3838_server.process_request("/health", {}))
    payload = orjson.loads(body)

    assert status == HTTPStatus.OK
    assert payload["is_live"] is True


def test_hybrid_runtime_status_endpoint_returns_live_runner_status(monkeypatch):
    class _FakeRunner:
        async def runtime_status_async(self):
            return {"ok": True, "config": {"sports": [4], "modes": ["today"]}}

    monkeypatch.setattr(ps3838_server, "_transport_backend", lambda: "hybrid_runner")
    monkeypatch.setattr(ps3838_server, "_hybrid_runtime_runner", _FakeRunner(), raising=False)

    status, _headers, body = asyncio.run(ps3838_server.process_request("/hybrid-runtime", {}))
    payload = orjson.loads(body)

    assert status == HTTPStatus.OK
    assert payload["config"]["sports"] == [4]
    assert payload["config"]["modes"] == ["today"]


def test_hybrid_runtime_reconfigure_endpoint_passes_scope_and_rates(monkeypatch):
    calls = []

    class _FakeRunner:
        async def runtime_status_async(self):
            raise AssertionError("status call should not be used for reconfigure")

        async def reconfigure_async(self, **kwargs):
            calls.append(kwargs)
            return {"ok": True, "applied": {"rate_changes": {"target_rps": {"to": 1.0}}}}

    monkeypatch.setattr(ps3838_server, "_transport_backend", lambda: "hybrid_runner")
    monkeypatch.setattr(ps3838_server, "_hybrid_runtime_runner", _FakeRunner(), raising=False)
    monkeypatch.setattr(
        ps3838_server.config,
        "SPORT_SLUGS",
        {29: "soccer", 4: "basketball"},
        raising=False,
    )

    status, _headers, body = asyncio.run(
        ps3838_server.process_request(
            "/hybrid-runtime?sports=basketball&modes=today&mb_target_rps=1&mb_hard_cap_rps=1",
            {},
        )
    )
    payload = orjson.loads(body)

    assert status == HTTPStatus.OK
    assert calls == [
        {
            "sport_ids": [4],
            "modes": ["today"],
            "mb_target_rps": 1.0,
            "mb_hard_cap_rps": 1,
        }
    ]
    assert payload["applied"]["rate_changes"]["target_rps"]["to"] == 1.0


# ── BIA observer integration tests ──────────────────────────────────────────


def test_health_includes_bia_snapshot(monkeypatch):
    """The /health payload must contain a 'bia' section with observer snapshot."""
    test_state = ParserState()
    test_state.stale = False
    test_state.is_logged_in = True
    test_state.last_data_recv_time = 95.0
    test_state.last_valid_data_time = 95.0
    test_state.last_ws_activity_time = 95.0

    monkeypatch.setattr(ps3838_server, "state", test_state, raising=False)
    monkeypatch.setattr(ps3838_server.time, "time", lambda: 100.0)
    _stub_health_dependencies(monkeypatch)

    status, _headers, body = asyncio.run(ps3838_server.process_request("/health", {}))
    payload = orjson.loads(body)

    assert status == HTTPStatus.OK
    assert "bia" in payload
    bia = payload["bia"]
    assert bia["enabled"] is False
    assert bia["running"] is False
    assert bia["phase"] == "observer-only"
    assert "counters" in bia
    assert "errors" in bia


def test_stats_includes_bia_snapshot(monkeypatch):
    """The /stats payload must contain a 'bia' section with observer snapshot."""
    test_state = ParserState()
    test_state.stale = False
    test_state.is_logged_in = True
    test_state.last_data_recv_time = 95.0
    test_state.last_valid_data_time = 95.0
    test_state.last_ws_activity_time = 95.0

    monkeypatch.setattr(ps3838_server, "state", test_state, raising=False)
    monkeypatch.setattr(ps3838_server.time, "time", lambda: 100.0)
    _stub_health_dependencies(monkeypatch)

    status, _headers, body = asyncio.run(ps3838_server.process_request("/stats", {}))
    payload = orjson.loads(body)

    assert status == HTTPStatus.OK
    assert "bia" in payload
    assert payload["bia"]["phase"] == "observer-only"


def test_bia_task_start_message_reflects_send_mode(monkeypatch):
    monkeypatch.setattr(ps3838_server.config, "PS3838_SEND_MODE", "all", raising=False)
    assert "integration mode" in ps3838_server._bia_task_start_message()
    monkeypatch.setattr(ps3838_server.config, "PS3838_SEND_MODE", "base_only", raising=False)
    assert "observer-only mode" in ps3838_server._bia_task_start_message()


def test_health_bia_snapshot_with_active_observer(monkeypatch):
    """When BIA is enabled and has live stats, /health reflects them."""
    from services.bia_observer import BiaObserverStats

    stats = BiaObserverStats()
    stats.ws_connect_ts = 50.0
    stats.last_msg_ts = 98.0
    stats.events_seen = 42
    stats.offers_count = 7
    stats.subscribed = True
    stats.sports_seen = {"fb", "tennis"}
    stats.discovered_events = [[1, "fb", "x"]] * 3

    monkeypatch.setattr(
        ps3838_server,
        "bia_observer_snapshot",
        lambda now=None: {
            "enabled": True,
            "running": True,
            "phase": "observer-only",
            "state": "connected",
            **stats.runtime_snapshot(now=now or 100.0),
        },
    )

    test_state = ParserState()
    test_state.stale = False
    test_state.is_logged_in = True
    test_state.last_data_recv_time = 95.0
    test_state.last_valid_data_time = 95.0
    test_state.last_ws_activity_time = 95.0

    monkeypatch.setattr(ps3838_server, "state", test_state, raising=False)
    monkeypatch.setattr(ps3838_server.time, "time", lambda: 100.0)
    # Stub everything except bia_observer_snapshot (already done above)
    monkeypatch.setattr(ps3838_server.config, "PS3838_ONLY_LIVE", False, raising=False)
    monkeypatch.setattr(ps3838_server.config, "PS3838_ONLY_PREMATCH", False, raising=False)
    monkeypatch.setattr(
        ps3838_server, "current_account_health_snapshot",
        lambda now=None: {"state": "healthy", "score": 100, "recommended_action": "keep_running", "reasons": []},
    )
    monkeypatch.setattr(ps3838_server, "build_runtime_alerts", lambda **kwargs: {"active": [], "count": 0, "highest_severity": None})
    monkeypatch.setattr(ps3838_server, "_count_active_closed_markers", lambda _events: {"total": 0, "by_market": {}})
    monkeypatch.setattr(ps3838_server, "_summarize_live_base_market_ages", lambda _events, now_ts=None: {})
    monkeypatch.setattr(ps3838_server, "collect_live_market_outliers", lambda *args, **kwargs: [])
    monkeypatch.setattr(ps3838_server, "_get_ws_sp_diag", lambda: {})

    status, _headers, body = asyncio.run(ps3838_server.process_request("/health", {}))
    payload = orjson.loads(body)

    bia = payload["bia"]
    assert bia["enabled"] is True
    assert bia["running"] is True
    assert bia["connected"] is True
    assert bia["counters"]["events"] == 42
    assert bia["counters"]["offers"] == 7
    assert bia["subscribed"] is True
    assert "fb" in bia["sports_seen"]
    assert bia["discovered_events"] == 3


@pytest.mark.asyncio
async def test_main_starts_bia_task_when_enabled(monkeypatch):
    """When BIA_ENABLED=1, main() creates a BIA observer task."""
    import core.hybrid_runner as hybrid_runner_module

    task_names = []

    class _FakeServe:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

    async def _done(name):
        task_names.append(name)

    async def _fake_bia():
        task_names.append("bia_observer")

    monkeypatch.setattr(ps3838_server, "_acquire_runtime_lock", lambda: True)
    monkeypatch.setattr(ps3838_server, "_release_runtime_lock", lambda: None)
    monkeypatch.setattr(ps3838_server, "serve", lambda *args, **kwargs: _FakeServe())
    monkeypatch.setattr(ps3838_server, "_transport_backend", lambda: "hybrid_runner")
    monkeypatch.setattr(ps3838_server, "log", lambda _msg: None)
    monkeypatch.setattr(ps3838_server.state, "running", True, raising=False)
    monkeypatch.setattr(ps3838_server, "zombie_reaper", lambda: _done("zombie"))
    monkeypatch.setattr(ps3838_server, "events_data_ttl_cleanup", lambda: _done("ttl"))
    monkeypatch.setattr(ps3838_server, "send_state_loop", lambda: _done("send-state"))
    monkeypatch.setattr(ps3838_server, "rebroadcast_loop", lambda: _done("rebroadcast"))
    monkeypatch.setattr(ps3838_server, "_stop_hybrid_poll_loop", lambda: _done("stop-poll"))
    monkeypatch.setattr(ps3838_server, "run_bia_observer", _fake_bia)
    monkeypatch.setattr(ps3838_server.config, "BIA_ENABLED", True, raising=False)

    class _FakeRunner:
        def __init__(self, *a, **kw):
            pass
        async def setup_async(self):
            pass
        async def run(self):
            task_names.append("hybrid-run")
        def shutdown(self):
            pass

    monkeypatch.setattr(hybrid_runner_module, "HybridRunner", _FakeRunner)
    monkeypatch.setattr(hybrid_runner_module, "_running", True, raising=False)

    await ps3838_server.main()

    assert "bia_observer" in task_names


@pytest.mark.asyncio
async def test_main_does_not_start_bia_task_when_disabled(monkeypatch):
    """When BIA_ENABLED=0, main() must NOT create a BIA observer task."""
    import core.hybrid_runner as hybrid_runner_module

    task_names = []

    class _FakeServe:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

    async def _done(name):
        task_names.append(name)

    async def _fake_bia():
        task_names.append("bia_observer")

    monkeypatch.setattr(ps3838_server, "_acquire_runtime_lock", lambda: True)
    monkeypatch.setattr(ps3838_server, "_release_runtime_lock", lambda: None)
    monkeypatch.setattr(ps3838_server, "serve", lambda *args, **kwargs: _FakeServe())
    monkeypatch.setattr(ps3838_server, "_transport_backend", lambda: "hybrid_runner")
    monkeypatch.setattr(ps3838_server, "log", lambda _msg: None)
    monkeypatch.setattr(ps3838_server.state, "running", True, raising=False)
    monkeypatch.setattr(ps3838_server, "zombie_reaper", lambda: _done("zombie"))
    monkeypatch.setattr(ps3838_server, "events_data_ttl_cleanup", lambda: _done("ttl"))
    monkeypatch.setattr(ps3838_server, "send_state_loop", lambda: _done("send-state"))
    monkeypatch.setattr(ps3838_server, "rebroadcast_loop", lambda: _done("rebroadcast"))
    monkeypatch.setattr(ps3838_server, "_stop_hybrid_poll_loop", lambda: _done("stop-poll"))
    monkeypatch.setattr(ps3838_server, "run_bia_observer", _fake_bia)
    monkeypatch.setattr(ps3838_server.config, "BIA_ENABLED", False, raising=False)

    class _FakeRunner:
        def __init__(self, *a, **kw):
            pass
        async def setup_async(self):
            pass
        async def run(self):
            task_names.append("hybrid-run")
        def shutdown(self):
            pass

    monkeypatch.setattr(hybrid_runner_module, "HybridRunner", _FakeRunner)
    monkeypatch.setattr(hybrid_runner_module, "_running", True, raising=False)

    await ps3838_server.main()

    assert "bia_observer" not in task_names
