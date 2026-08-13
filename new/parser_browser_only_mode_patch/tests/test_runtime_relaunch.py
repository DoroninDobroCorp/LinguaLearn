from core.runtime_relaunch import build_stack_relaunch_command, build_stack_restart_plan
from tools.runtime_stack_relaunch import (
    _build_launch_chrome_cmd,
    _build_runtime_env,
    _pid_belongs_to_project,
    _relaunch_token_is_current,
    _write_schedule_token,
    build_arg_parser,
)


def test_build_stack_restart_plan_uses_current_env_values():
    env = {
        "PS3838_SERVER_PORT": "9012",
        "BET_SERVICE_PORT": "8769",
        "PS3838_BROWSER_CDP_URL": "http://127.0.0.1:9224",
        "SESSION_FILE": "/tmp/pin888-session.json",
    }

    plan = build_stack_restart_plan(cooldown_sec=900.0, reason="cloudflare-1015", env=env)

    assert plan.cooldown_sec == 900.0
    assert plan.parser_port == 9012
    assert plan.chrome_port == 9224
    assert plan.bet_service_port == 8769
    assert plan.session_file == "/tmp/pin888-session.json"
    assert plan.reason == "cloudflare-1015"


def test_build_stack_relaunch_command_includes_stop_and_restart_flags():
    plan = build_stack_restart_plan(
        cooldown_sec=900.0,
        reason="cloudflare-1015",
        env={
            "PS3838_SERVER_PORT": "9012",
            "BET_SERVICE_PORT": "8769",
            "PS3838_BROWSER_CDP_URL": "http://127.0.0.1:9224",
            "SESSION_FILE": "/tmp/pin888-session.json",
        },
    )

    command = build_stack_relaunch_command(plan)

    assert "--cooldown-sec" in command
    assert "900.0" in command
    assert "--parser-port" in command
    assert "9012" in command
    assert "--chrome-port" in command
    assert "9224" in command
    assert "--bet-service-port" in command
    assert "8769" in command
    assert "--session-file" in command
    assert "/tmp/pin888-session.json" in command
    assert "--reason" in command
    assert "cloudflare-1015" in command
    assert "--stop-chrome" in command
    assert "--stop-bet-service" in command
    assert "--restart-bet-service" in command


def test_runtime_stack_relaunch_env_preserves_current_transport_settings():
    """Relaunch must NOT force hybrid_runner mode; it should preserve whatever
    the environment already has (or let config.py defaults apply).
    When --stop-chrome is used, CDP URL must be set."""
    parser = build_arg_parser()
    args = parser.parse_args(
        [
            "--cooldown-sec",
            "900",
            "--parser-port",
            "9012",
            "--chrome-port",
            "9224",
            "--bet-service-port",
            "8769",
            "--session-file",
            "/tmp/pin888-session.json",
            "--stop-chrome",
        ]
    )

    env = _build_runtime_env(args)

    assert env["PORT"] == "9012"
    assert env["PS3838_SERVER_PORT"] == "9012"
    assert env["BET_SERVICE_PORT"] == "8769"
    assert env["SESSION_FILE"] == "/tmp/pin888-session.json"
    assert env["PS3838_SESSION_FILE"] == "/tmp/pin888-session.json"
    assert env["PS3838_BROWSER_CDP_URL"] == "http://127.0.0.1:9224"
    assert env["PS3838_SITE_PROFILE"] == "pin888"
    # Transport backend and hybrid flag must NOT be forced
    assert "PS3838_TRANSPORT_BACKEND" not in env or env.get("PS3838_TRANSPORT_BACKEND") != "hybrid_runner"
    assert "PS3838_HYBRID_ENABLED" not in env or env.get("PS3838_HYBRID_ENABLED") != "1"
    assert env.get("PS3838_HYBRID_RUNNER_MODES", "today,early") == "today,early"


def test_runtime_stack_relaunch_env_applies_sport_scope_and_more_bet_caps():
    parser = build_arg_parser()
    args = parser.parse_args(
        [
            "--cooldown-sec",
            "0",
            "--parser-port",
            "9012",
            "--chrome-port",
            "9224",
            "--bet-service-port",
            "8769",
            "--session-file",
            "/tmp/pin888-session.json",
            "--sports",
            "29",
            "--modes",
            "today,early",
            "--mb-target-rps",
            "10",
            "--mb-hard-cap-rps",
            "15",
        ]
    )

    env = _build_runtime_env(args)

    assert env["PS3838_SPORTS"] == "29"
    assert env["PS3838_HYBRID_HTTP_SPORTS"] == "29"
    assert env["PS3838_HYBRID_RUNNER_MODES"] == "today,early"
    assert env["PS3838_HYBRID_MORE_BET_TARGET_RPS"] == "10.0"
    assert env["PS3838_HYBRID_MORE_BET_HARD_CAP_RPS"] == "15"


def test_runtime_stack_relaunch_env_can_disable_1015_auto_relaunch():
    parser = build_arg_parser()
    args = parser.parse_args(
        [
            "--cooldown-sec",
            "0",
            "--disable-1015-auto-relaunch",
        ]
    )

    env = _build_runtime_env(args)

    assert env["PS3838_HYBRID_DISABLE_1015_AUTO_RELAUNCH"] == "1"


def test_runtime_stack_relaunch_env_can_disable_fatal_1015_force_exit():
    parser = build_arg_parser()
    args = parser.parse_args(
        [
            "--cooldown-sec",
            "0",
            "--disable-fatal-1015-force-exit",
        ]
    )

    env = _build_runtime_env(args)

    assert env["PS3838_HYBRID_FORCE_EXIT_ON_FATAL_1015"] == "0"


def test_runtime_stack_relaunch_token_keeps_only_latest_schedule(tmp_path, monkeypatch):
    import tools.runtime_stack_relaunch as relaunch

    monkeypatch.setattr(relaunch, "SCHEDULE_TOKEN_PATH", tmp_path / "runtime_stack_relaunch.token.json")
    parser = build_arg_parser()
    args1 = parser.parse_args(["--cooldown-sec", "900"])
    args2 = parser.parse_args(
        [
            "--cooldown-sec",
            "0",
            "--sports",
            "33",
            "--modes",
            "today,early",
            "--mb-target-rps",
            "10",
            "--mb-hard-cap-rps",
            "15",
        ]
    )

    token1 = _write_schedule_token(args1)
    assert _relaunch_token_is_current(token1) is True

    token2 = _write_schedule_token(args2)
    assert token1 != token2
    assert _relaunch_token_is_current(token1) is False
    assert _relaunch_token_is_current(token2) is True


def test_build_launch_chrome_cmd_uses_blank_launcher_tab():
    command = _build_launch_chrome_cmd(chrome_port=9224)

    assert command[1:] == [
        "tools/launch_pin888_cdp_chrome.py",
        "--port",
        "9224",
        "--url",
        "about:blank",
    ]


def test_build_stack_restart_plan_defaults_to_8765_without_env():
    """When no PORT/PS3838_SERVER_PORT is in env, parser_port should default to 8765."""
    env = {"_PLACEHOLDER": "1"}  # non-empty env without port keys
    plan = build_stack_restart_plan(cooldown_sec=60.0, reason="test", env=env)
    assert plan.parser_port == 8765


def test_relaunch_argparser_reads_port_from_env(monkeypatch):
    """When PORT is set in env, --parser-port default should reflect it."""
    monkeypatch.setenv("PORT", "9999")
    import importlib
    import tools.runtime_stack_relaunch as relaunch_mod
    importlib.reload(relaunch_mod)
    parser = relaunch_mod.build_arg_parser()
    args = parser.parse_args(["--cooldown-sec", "0"])
    assert args.parser_port == 9999


def test_pid_belongs_to_project_matches_project_dir(monkeypatch):
    """_pid_belongs_to_project accepts PIDs whose cmdline contains the project dir."""
    import subprocess

    fake_cmdline = "/usr/bin/python3 /home/user/pin888/ps3838_server.py"
    monkeypatch.setattr(
        subprocess,
        "check_output",
        lambda *a, **kw: fake_cmdline,
    )
    assert _pid_belongs_to_project(12345, "/home/user/pin888") is True


def test_pid_belongs_to_project_rejects_unrelated(monkeypatch):
    """_pid_belongs_to_project rejects PIDs that don't match."""
    import subprocess

    fake_cmdline = "/usr/bin/nginx -g daemon off;"
    monkeypatch.setattr(
        subprocess,
        "check_output",
        lambda *a, **kw: fake_cmdline,
    )
    assert _pid_belongs_to_project(12345, "/home/user/pin888") is False


def test_pid_belongs_to_project_accepts_chrome(monkeypatch):
    """Chrome processes are accepted only when they use our dedicated pin888 profile."""
    import subprocess

    fake_cmdline = "/opt/google/chrome --remote-debugging-port=9224 --user-data-dir=/home/user/.runtime/chrome-cdp-pin888"
    monkeypatch.setattr(
        subprocess,
        "check_output",
        lambda *a, **kw: fake_cmdline,
    )
    assert _pid_belongs_to_project(12345, "/home/user/pin888") is True


def test_pid_belongs_to_project_rejects_unrelated_chrome(monkeypatch):
    """Chrome without the pin888 profile marker must NOT be claimed as ours."""
    import subprocess

    fake_cmdline = "/opt/google/chrome --remote-debugging-port=9222 --user-data-dir=/home/user/.config/google-chrome"
    monkeypatch.setattr(
        subprocess,
        "check_output",
        lambda *a, **kw: fake_cmdline,
    )
    assert _pid_belongs_to_project(12345, "/some/other/project") is False


def test_build_runtime_env_omits_cdp_url_without_stop_chrome():
    """Without --stop-chrome, PS3838_BROWSER_CDP_URL must NOT be forced into env."""
    import os as _os

    parser = build_arg_parser()
    args = parser.parse_args(
        [
            "--cooldown-sec",
            "0",
            "--chrome-port",
            "9224",
        ]
    )

    # Remove from env if present to verify it stays absent
    old = _os.environ.pop("PS3838_BROWSER_CDP_URL", None)
    try:
        env = _build_runtime_env(args)
        assert "PS3838_BROWSER_CDP_URL" not in env
    finally:
        if old is not None:
            _os.environ["PS3838_BROWSER_CDP_URL"] = old


def test_build_runtime_env_sets_cdp_url_with_stop_chrome():
    """With --stop-chrome, PS3838_BROWSER_CDP_URL must be set to chrome_port."""
    parser = build_arg_parser()
    args = parser.parse_args(
        [
            "--cooldown-sec",
            "0",
            "--chrome-port",
            "9224",
            "--stop-chrome",
        ]
    )

    env = _build_runtime_env(args)
    assert env["PS3838_BROWSER_CDP_URL"] == "http://127.0.0.1:9224"
