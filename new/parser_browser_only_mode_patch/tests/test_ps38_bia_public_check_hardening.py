"""Tests for timeout wrapper and cleanup hardening in ps38_bia_public_check."""
from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ── timeout wrapper ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_amain_returns_3_on_timeout(tmp_path, monkeypatch):
    """When _run_check exceeds the timeout, amain() writes TIMEOUT status and exits 3."""
    import tools.ps38_bia_public_check as checker

    status_file = tmp_path / "status"
    monkeypatch.setattr(checker, "STATUS", status_file)
    monkeypatch.setattr(checker, "LOG", tmp_path / "log")
    monkeypatch.setattr(checker, "BIA_CHECK_TIMEOUT_SEC", 1)  # 1 second timeout

    async def slow_run(args):
        await asyncio.sleep(10)  # will be cancelled by timeout
        return 0

    with patch.object(checker, "_run_check", side_effect=slow_run):
        with patch.object(checker, "_kill_leftover_chrome_for_profile"):
            # Provide dummy argv
            with patch("sys.argv", ["ps38_bia_public_check.py"]):
                result = await checker.amain()

    assert result == 3
    assert status_file.read_text() == "TIMEOUT"


@pytest.mark.asyncio
async def test_amain_returns_0_on_success(tmp_path, monkeypatch):
    """When _run_check succeeds within timeout, result is forwarded."""
    import tools.ps38_bia_public_check as checker

    monkeypatch.setattr(checker, "STATUS", tmp_path / "status")
    monkeypatch.setattr(checker, "LOG", tmp_path / "log")
    monkeypatch.setattr(checker, "BIA_CHECK_TIMEOUT_SEC", 30)

    async def fast_run(args):
        return 0

    with patch.object(checker, "_run_check", side_effect=fast_run):
        with patch("sys.argv", ["ps38_bia_public_check.py"]):
            result = await checker.amain()

    assert result == 0


# ── cleanup / kill leftover chrome ────────────────────────────────────────────

def test_kill_leftover_chrome_calls_pgrep_and_kills(monkeypatch):
    """_kill_leftover_chrome_for_profile runs pgrep and sends SIGKILL to found pids."""
    import tools.ps38_bia_public_check as checker

    profile_dir = "/home/user/.cache/ps38-bia-portal-profile"

    mock_run = MagicMock()
    mock_run.return_value = MagicMock(stdout="12345\n67890\n")

    with patch("tools.ps38_bia_public_check.subprocess.run", mock_run):
        with patch("tools.ps38_bia_public_check.os.kill") as mock_kill:
            checker._kill_leftover_chrome_for_profile(profile_dir)

    mock_run.assert_called_once()
    # Both pids should have been killed
    killed_pids = {call.args[0] for call in mock_kill.call_args_list}
    assert 12345 in killed_pids
    assert 67890 in killed_pids


def test_kill_leftover_chrome_is_noop_when_pgrep_finds_nothing(monkeypatch):
    """No kill calls if pgrep returns empty stdout."""
    import tools.ps38_bia_public_check as checker

    mock_run = MagicMock()
    mock_run.return_value = MagicMock(stdout="")

    with patch("tools.ps38_bia_public_check.subprocess.run", mock_run):
        with patch("tools.ps38_bia_public_check.os.kill") as mock_kill:
            checker._kill_leftover_chrome_for_profile("/some/profile")

    mock_kill.assert_not_called()


def test_kill_leftover_chrome_silences_pgrep_error():
    """Subprocess error is swallowed (best-effort), no exception propagates."""
    import tools.ps38_bia_public_check as checker

    with patch(
        "tools.ps38_bia_public_check.subprocess.run",
        side_effect=OSError("no pgrep"),
    ):
        # Must not raise
        checker._kill_leftover_chrome_for_profile("/some/profile")


# ── finally closes context ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_extract_black_closes_context_on_login_failure(tmp_path, monkeypatch):
    """ctx.close() is called even when portal login fails."""
    import tools.ps38_bia_public_check as checker

    monkeypatch.setattr(
        checker,
        "PORTAL_ENV",
        _make_portal_env(tmp_path),
    )

    mock_ctx = AsyncMock()
    mock_ctx.pages = []
    mock_page = AsyncMock()
    mock_ctx.new_page = AsyncMock(return_value=mock_page)
    # ensure_portal_login returns False → raises portal_login_failed
    mock_page.goto = AsyncMock()
    mock_page.url = "https://portal.betinasia.com/Account/Login"
    mock_page.title = AsyncMock(return_value="Login")

    mock_chromium = AsyncMock()
    mock_chromium.launch_persistent_context = AsyncMock(return_value=mock_ctx)

    mock_playwright_instance = AsyncMock()
    mock_playwright_instance.chromium = mock_chromium
    mock_playwright_instance.__aenter__ = AsyncMock(return_value=mock_playwright_instance)
    mock_playwright_instance.__aexit__ = AsyncMock(return_value=False)

    with patch("tools.ps38_bia_public_check.async_playwright", return_value=mock_playwright_instance):
        with patch.object(checker, "_kill_leftover_chrome_for_profile"):
            with patch.object(
                checker,
                "ensure_portal_login",
                new_callable=lambda: lambda *a, **kw: _coro_false(),
            ):
                with pytest.raises(RuntimeError, match="portal_login_failed"):
                    await checker.extract_black_from_portal()

    mock_ctx.close.assert_called_once()


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_portal_env(tmp_path: Path) -> Path:
    f = tmp_path / "ps38_bia_portal.env"
    f.write_text(
        "export BIA_PORTAL_EMAIL=test@example.com\n"
        "export BIA_PORTAL_PASSWORD=secret\n"
    )
    return f


async def _coro_false() -> bool:
    return False
