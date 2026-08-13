import tools.run_guarded_from_dotenv as runner


def test_build_guarded_runner_cmd_injects_guard_overrides(monkeypatch):
    monkeypatch.setenv("PIN888_GUARD_RESTART_DELAY_SEC", "45")
    monkeypatch.setenv("PIN888_GUARD_HEALTH_STARTUP_GRACE_SEC", "120")
    monkeypatch.setenv("PIN888_GUARD_STALE_GRACE_SEC", "180")

    cmd = runner.build_guarded_runner_cmd(["--port", "9888"])

    assert cmd[:3] == [runner.sys.executable, "-m", "tools.guarded_runner"]
    assert "--restart-delay-sec" in cmd
    assert "--health-startup-grace-sec" in cmd
    assert "--stale-grace-sec" in cmd
    assert cmd[-2:] == ["--port", "9888"]


def test_build_guarded_runner_cmd_skips_empty_overrides(monkeypatch):
    monkeypatch.delenv("PIN888_GUARD_RESTART_DELAY_SEC", raising=False)
    monkeypatch.delenv("PIN888_GUARD_HEALTH_STARTUP_GRACE_SEC", raising=False)
    monkeypatch.delenv("PIN888_GUARD_STALE_GRACE_SEC", raising=False)

    cmd = runner.build_guarded_runner_cmd(["--port", "9888"])

    assert cmd == [runner.sys.executable, "-m", "tools.guarded_runner", "--port", "9888"]
