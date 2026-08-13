import asyncio
import sys
from collections import deque
from pathlib import Path

from tools.guarded_runner import (
    GuardConfig,
    ParserGuard,
    _ensure_repo_root_on_sys_path,
    classify_log_line,
    health_has_active_ws_429_backoff,
    health_is_stale,
    manual_hold_reason_allows_auto_rotate,
    should_enter_manual_hold_from_account_health,
    should_restart_now,
)


def test_classify_log_line_flags_auth_hold_patterns():
    action, reason = classify_log_line("[S29] WS 401: entering manual auth hold (no auto-login)")

    assert action == "manual_hold"
    assert "WS 401" in reason


def test_classify_log_line_does_not_hold_on_plain_ws401():
    action, reason = classify_log_line("[S29] WS 401: soft refresh succeeded, reconnecting")

    assert action is None
    assert reason is None


def test_classify_log_line_restarts_on_startup_circuit_open():
    action, reason = classify_log_line(
        "[AUTH] startup canary S29 received no WS frames within 25s; startup circuit open"
    )

    assert action == "restart"
    assert "startup circuit open" in reason


def test_classify_log_line_does_not_hold_on_generic_auth_cooldown_active():
    action, reason = classify_log_line(
        "[S29] startup canary S29 received no WS frames within 25s; auth cooldown active"
    )

    assert action is None
    assert reason is None


def test_classify_log_line_flags_non_restartable_lock():
    action, reason = classify_log_line("Refusing second parser instance.")

    assert action == "stop"
    assert "Refusing second parser instance" in reason


def test_should_restart_now_respects_budget_window():
    history = deque([100.0])

    assert should_restart_now(history, now_ts=150.0, window_sec=120.0, max_restarts=1) is False
    assert should_restart_now(history, now_ts=250.1, window_sec=120.0, max_restarts=1) is True


def test_ensure_repo_root_on_sys_path_reinserts_repo_root(monkeypatch):
    repo_root = str(Path(__file__).resolve().parents[1])
    trimmed = [entry for entry in sys.path if entry != repo_root]
    monkeypatch.setattr(sys, "path", list(trimmed))

    inserted = _ensure_repo_root_on_sys_path()

    assert inserted == repo_root
    assert sys.path[0] == repo_root


def test_account_health_manual_hold_for_blocked_and_cooldown():
    should_hold, reason = should_enter_manual_hold_from_account_health(
        {"state": "blocked", "auth": {}, "signals": {}}
    )
    assert should_hold is True
    assert "blocked" in reason

    should_hold, reason = should_enter_manual_hold_from_account_health(
        {
            "state": "healthy",
            "auth": {"cooldown": {"reason": "MB ws expired 401; waiting for manual session rotation"}},
            "signals": {},
        }
    )
    assert should_hold is True
    assert "manual session rotation" in reason


def test_account_health_manual_review_preserves_rotatable_reason():
    should_hold, reason = should_enter_manual_hold_from_account_health(
        {
            "state": "manual_review",
            "auth": {
                "cooldown": {
                    "manual": True,
                    "reason": "S29 ws expired 401; waiting for manual session rotation",
                }
            },
            "signals": {},
        }
    )

    assert should_hold is True
    assert "manual session rotation" in reason


def test_account_health_recovered_ws401_does_not_force_manual_hold():
    should_hold, reason = should_enter_manual_hold_from_account_health(
        {
            "state": "healthy",
            "auth": {},
            "signals": {
                "session_ws401_count": 1,
                "soft_refresh_success_count": 1,
                "soft_refresh_fail_count": 0,
            },
        }
    )
    assert should_hold is False
    assert reason == ""


def test_account_health_startup_circuit_open_does_not_force_manual_hold():
    should_hold, reason = should_enter_manual_hold_from_account_health(
        {
            "state": "healthy",
            "auth": {
                "startup_auth_circuit_open": True,
                "startup_auth_circuit_reason": "startup canary S29 received no WS frames within 25s",
            },
            "signals": {},
        }
    )

    assert should_hold is False
    assert reason == ""


def test_account_health_non_manual_startup_cooldown_does_not_force_manual_hold():
    should_hold, reason = should_enter_manual_hold_from_account_health(
        {
            "state": "degraded",
            "auth": {
                "cooldown": {
                    "manual": False,
                    "reason": "startup canary S29 received no WS frames within 25s",
                }
            },
            "signals": {},
        }
    )

    assert should_hold is False
    assert reason == ""


def test_health_is_stale_understands_status_and_flag():
    assert health_is_stale({"stale": True}) is True
    assert health_is_stale({"status": "stale"}) is True
    assert health_is_stale({"status": "ok", "stale": False}) is False
    # None = health timeout (asyncio hang) → treat as stale so grace timer fires
    assert health_is_stale(None) is True
    assert health_is_stale("bad") is True


def test_health_has_active_ws_429_backoff_understands_health_payload():
    assert health_has_active_ws_429_backoff(
        {
            "observability": {
                "ws_429": {
                    "active_sport_count": 1,
                    "active_sports": {"29": 123.0},
                }
            }
        }
    )
    assert not health_has_active_ws_429_backoff(
        {"observability": {"ws_429": {"active_sport_count": 0, "active_sports": {}}}}
    )


def test_manual_hold_reason_allows_auto_rotate_only_for_session_recovery_reasons():
    assert manual_hold_reason_allows_auto_rotate("MB ws expired 401; waiting for manual session rotation")
    assert manual_hold_reason_allows_auto_rotate("session revalidation pending; waiting for manual session rotation")
    assert manual_hold_reason_allows_auto_rotate(
        "[S29] startup canary S29 received no WS frames within 25s; auth cooldown active"
    )
    assert manual_hold_reason_allows_auto_rotate("account health cooldown")
    assert not manual_hold_reason_allows_auto_rotate("login rate-limited by Cloudflare (429)")


def test_guarded_runner_child_env_sets_safe_defaults(monkeypatch, tmp_path):
    monkeypatch.delenv("PS3838_AUTO_REFRESH_ON_STALE", raising=False)
    monkeypatch.delenv("PS3838_STARTUP_RELOGIN_ON_STALE", raising=False)
    monkeypatch.setenv("PORT", "9012")
    monkeypatch.setenv("PS3838_SERVER_PORT", "9012")
    monkeypatch.setenv("PIN888_HTTP_PORT", "9012")
    guard = ParserGuard(
        GuardConfig(
            cwd=Path(tmp_path),
            port=9888,
        )
    )

    env = guard._child_env()

    assert env["PYTHONUNBUFFERED"] == "1"
    assert env["PS3838_AUTO_REFRESH_ON_STALE"] == "0"
    assert env["PS3838_STARTUP_RELOGIN_ON_STALE"] == "0"
    assert env["PORT"] == "9888"
    assert env["PS3838_SERVER_PORT"] == "9888"
    assert env["PIN888_HTTP_PORT"] == "9888"


def test_guarded_runner_auto_session_rotation_clears_manual_hold(monkeypatch, tmp_path):
    guard = ParserGuard(
        GuardConfig(
            cwd=Path(tmp_path),
            port=9888,
            session_file=Path(tmp_path) / "pin888_ws_session.json",
            auto_session_rotate_attempts_per_hold=1,
        )
    )
    guard._manual_hold_reason = "MB ws expired 401; waiting for manual session rotation"
    guard._manual_hold_session_mtime = 100.0

    mtimes = iter([150.0])

    monkeypatch.setattr(guard, "_session_mtime", lambda: next(mtimes))

    async def _ok():
        return True

    monkeypatch.setattr(guard, "_run_auto_session_rotation", _ok)

    import asyncio

    cleared = asyncio.run(guard._maybe_auto_clear_manual_hold())

    assert cleared is True
    assert guard._manual_hold_reason == ""
    assert guard._manual_hold_session_mtime == 150.0
    assert guard._manual_hold_auto_rotate_attempts == 0


def test_guarded_runner_auto_session_rotation_attempt_is_bounded(monkeypatch, tmp_path):
    guard = ParserGuard(
        GuardConfig(
            cwd=Path(tmp_path),
            port=9888,
            session_file=Path(tmp_path) / "pin888_ws_session.json",
            auto_session_rotate_attempts_per_hold=1,
        )
    )
    guard._manual_hold_reason = "MB ws expired 401; waiting for manual session rotation"
    guard._manual_hold_session_mtime = 100.0

    calls = {"count": 0}

    async def _fail():
        calls["count"] += 1
        return False

    monkeypatch.setattr(guard, "_run_auto_session_rotation", _fail)
    monkeypatch.setattr(guard, "_session_mtime", lambda: 100.0)

    import asyncio

    assert asyncio.run(guard._maybe_auto_clear_manual_hold()) is False
    assert asyncio.run(guard._maybe_auto_clear_manual_hold()) is False
    assert calls["count"] == 1
    assert guard._manual_hold_reason != ""


def test_run_child_once_manual_hold_does_not_cancel_wait_task(tmp_path):
    guard = ParserGuard(
        GuardConfig(
            cwd=Path(tmp_path),
            port=9888,
            child_cmd=[
                sys.executable,
                "-u",
                "-c",
                (
                    "import sys,time; "
                    "print('multiple login'); "
                    "sys.stdout.flush(); "
                    "time.sleep(0.2)"
                ),
            ],
            terminate_grace_sec=1.0,
        )
    )

    async def _fake_monitor(decision_q):
        await asyncio.sleep(60)

    guard._monitor_health = _fake_monitor

    decision = asyncio.run(guard._run_child_once())

    assert decision.action == "manual_hold"
    assert "multiple login" in decision.reason


def test_run_child_once_restarts_on_startup_circuit_open(tmp_path):
    guard = ParserGuard(
        GuardConfig(
            cwd=Path(tmp_path),
            port=9888,
            child_cmd=[
                sys.executable,
                "-u",
                "-c",
                (
                    "import sys,time; "
                    "print('[AUTH] startup canary S29 received no WS frames within 25s; startup circuit open'); "
                    "sys.stdout.flush(); "
                    "time.sleep(0.2)"
                ),
            ],
            terminate_grace_sec=1.0,
        )
    )

    async def _fake_monitor(decision_q):
        await asyncio.sleep(60)

    guard._monitor_health = _fake_monitor

    decision = asyncio.run(guard._run_child_once())

    assert decision.action == "restart"
    assert "startup circuit open" in decision.reason


def test_monitor_health_skips_restart_while_stale_under_active_ws429(monkeypatch, tmp_path):
    guard = ParserGuard(
        GuardConfig(
            cwd=Path(tmp_path),
            port=9888,
            health_poll_sec=0.01,
            health_startup_grace_sec=0.0,
            stale_grace_sec=0.0,
        )
    )

    class _Child:
        returncode = None

    guard._child = _Child()
    guard._child_started_ts = 0.0

    async def _fetch_json(url):
        if url == guard.config.account_health_url:
            return {"state": "healthy", "auth": {}, "signals": {}}
        return {
            "status": "stale",
            "stale": True,
            "observability": {
                "ws_429": {
                    "active_sport_count": 1,
                    "active_sports": {"29": 123.0},
                }
            },
        }

    async def _sleep(_delay):
        guard._child.returncode = 0

    monkeypatch.setattr(guard, "_fetch_json", _fetch_json)
    monkeypatch.setattr(asyncio, "sleep", _sleep)

    decision_q = asyncio.Queue()
    asyncio.run(guard._monitor_health(decision_q))

    assert decision_q.empty()


def test_monitor_health_restarts_on_stale_without_active_ws429(monkeypatch, tmp_path):
    guard = ParserGuard(
        GuardConfig(
            cwd=Path(tmp_path),
            port=9888,
            health_poll_sec=0.01,
            health_startup_grace_sec=0.0,
            stale_grace_sec=0.0,
        )
    )

    class _Child:
        returncode = None

    guard._child = _Child()
    guard._child_started_ts = 0.0

    async def _fetch_json(url):
        if url == guard.config.account_health_url:
            return {"state": "healthy", "auth": {}, "signals": {}}
        return {
            "status": "stale",
            "stale": True,
            "observability": {
                "ws_429": {
                    "active_sport_count": 0,
                    "active_sports": {},
                }
            },
        }

    monkeypatch.setattr(guard, "_fetch_json", _fetch_json)

    decision_q = asyncio.Queue()
    asyncio.run(guard._monitor_health(decision_q))

    decision = decision_q.get_nowait()
    assert decision.action == "restart"
    assert "health stale" in decision.reason
