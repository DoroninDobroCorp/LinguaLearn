"""Unit tests for tools.ps38_load_watchdog — threshold logic, cooldown, fail-safe."""
from __future__ import annotations

import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from tools import ps38_load_watchdog as wd


# ── helpers ───────────────────────────────────────────────────────────────────

def _set_env(monkeypatch, *, load_max="8.0", mem_min="300", cooldown="600"):
    monkeypatch.setenv("PS38_WD_LOAD_MAX", str(load_max))
    monkeypatch.setenv("PS38_WD_MEM_MIN_MB", str(mem_min))
    monkeypatch.setenv("PS38_WD_COOLDOWN_SEC", str(cooldown))


# ── read_load1 ────────────────────────────────────────────────────────────────

def test_read_load1_parses_first_field(tmp_path):
    f = tmp_path / "loadavg"
    f.write_text("3.14 1.20 0.80 1/512 12345\n")
    with patch.object(Path, "read_text", return_value=f.read_text()):
        with patch("tools.ps38_load_watchdog.Path") as mock_path_cls:
            mock_path_cls.return_value.read_text.return_value = "3.14 1.20 0.80 1/512 12345\n"
            # Direct test: patch built-in open at module level
    # Simpler: patch the read_text method on the specific Path object
    with patch("tools.ps38_load_watchdog.Path") as MockPath:
        mock_instance = MagicMock()
        mock_instance.read_text.return_value = "3.14 1.20 0.80 1/512 12345\n"
        MockPath.return_value = mock_instance
        result = wd.read_load1()
    assert result == pytest.approx(3.14)


def test_read_load1_returns_none_on_error():
    with patch("tools.ps38_load_watchdog.Path") as MockPath:
        MockPath.return_value.read_text.side_effect = OSError("no proc")
        result = wd.read_load1()
    assert result is None


# ── read_mem_available_mb ─────────────────────────────────────────────────────

_MEMINFO_SAMPLE = (
    "MemTotal:       16384000 kB\n"
    "MemFree:         5120000 kB\n"
    "MemAvailable:     512000 kB\n"  # 512000 KiB = 500 MiB
    "Buffers:          204800 kB\n"
)


def test_read_mem_available_mb_parses_correctly():
    with patch("tools.ps38_load_watchdog.Path") as MockPath:
        mock_instance = MagicMock()
        mock_instance.read_text.return_value = _MEMINFO_SAMPLE
        MockPath.return_value = mock_instance
        result = wd.read_mem_available_mb()
    assert result == pytest.approx(500.0)


def test_read_mem_available_mb_returns_none_on_error():
    with patch("tools.ps38_load_watchdog.Path") as MockPath:
        MockPath.return_value.read_text.side_effect = OSError("no proc")
        result = wd.read_mem_available_mb()
    assert result is None


# ── cooldown helpers ──────────────────────────────────────────────────────────

def test_cooldown_remaining_zero_when_no_file(tmp_path):
    missing = tmp_path / "no_such_file"
    with patch.object(wd, "LAST_RESTART_FILE", missing):
        remaining = wd.cooldown_remaining_sec(time.time())
    # File doesn't exist → last_restart_ts() returns 0.0 → elapsed is huge → remaining=0
    assert remaining == 0.0


def test_cooldown_remaining_positive_when_recent(tmp_path):
    f = tmp_path / "last_restart"
    now = time.time()
    f.write_text(str(now - 100.0))  # restarted 100 seconds ago
    with patch.object(wd, "LAST_RESTART_FILE", f):
        with patch.object(wd, "COOLDOWN_SEC", 600.0):
            remaining = wd.cooldown_remaining_sec(now)
    assert remaining == pytest.approx(500.0, abs=1.0)


def test_cooldown_zero_when_cooldown_elapsed(tmp_path):
    f = tmp_path / "last_restart"
    now = time.time()
    f.write_text(str(now - 700.0))  # restarted 700 seconds ago, cooldown=600
    with patch.object(wd, "LAST_RESTART_FILE", f):
        with patch.object(wd, "COOLDOWN_SEC", 600.0):
            remaining = wd.cooldown_remaining_sec(now)
    assert remaining == 0.0


# ── check_and_act: normal conditions ─────────────────────────────────────────

def test_no_action_when_below_thresholds(monkeypatch, tmp_path):
    _set_env(monkeypatch)
    monkeypatch.setattr(wd, "LOAD_MAX", 8.0)
    monkeypatch.setattr(wd, "MEM_MIN_MB", 300.0)
    monkeypatch.setattr(wd, "LAST_RESTART_FILE", tmp_path / "lr")

    with patch.object(wd, "read_load1", return_value=2.5):
        with patch.object(wd, "read_mem_available_mb", return_value=1024.0):
            with patch.object(wd, "restart_service") as mock_restart:
                result = wd.check_and_act()

    assert result == 0
    mock_restart.assert_not_called()


# ── check_and_act: load exceeded ─────────────────────────────────────────────

def test_restart_triggered_on_high_load(monkeypatch, tmp_path):
    monkeypatch.setattr(wd, "LOAD_MAX", 8.0)
    monkeypatch.setattr(wd, "MEM_MIN_MB", 300.0)
    monkeypatch.setattr(wd, "COOLDOWN_SEC", 600.0)
    monkeypatch.setattr(wd, "LAST_RESTART_FILE", tmp_path / "lr")

    with patch.object(wd, "read_load1", return_value=12.0):
        with patch.object(wd, "read_mem_available_mb", return_value=1024.0):
            with patch.object(wd, "restart_service", return_value=True) as mock_restart:
                with patch.object(wd, "send_watchdog_alert"):
                    result = wd.check_and_act()

    assert result == 1
    mock_restart.assert_called_once()


# ── check_and_act: low memory ────────────────────────────────────────────────

def test_restart_triggered_on_low_memory(monkeypatch, tmp_path):
    monkeypatch.setattr(wd, "LOAD_MAX", 8.0)
    monkeypatch.setattr(wd, "MEM_MIN_MB", 300.0)
    monkeypatch.setattr(wd, "COOLDOWN_SEC", 600.0)
    monkeypatch.setattr(wd, "LAST_RESTART_FILE", tmp_path / "lr")

    with patch.object(wd, "read_load1", return_value=1.0):
        with patch.object(wd, "read_mem_available_mb", return_value=150.0):
            with patch.object(wd, "restart_service", return_value=True) as mock_restart:
                with patch.object(wd, "send_watchdog_alert"):
                    result = wd.check_and_act()

    assert result == 1
    mock_restart.assert_called_once()


# ── check_and_act: cooldown suppresses restart ───────────────────────────────

def test_cooldown_suppresses_restart(monkeypatch, tmp_path):
    monkeypatch.setattr(wd, "LOAD_MAX", 8.0)
    monkeypatch.setattr(wd, "MEM_MIN_MB", 300.0)
    monkeypatch.setattr(wd, "COOLDOWN_SEC", 600.0)

    # Write a last-restart timestamp 60 seconds ago (well within 600s cooldown).
    lr_file = tmp_path / "lr"
    lr_file.write_text(str(time.time() - 60.0))
    monkeypatch.setattr(wd, "LAST_RESTART_FILE", lr_file)

    with patch.object(wd, "read_load1", return_value=15.0):
        with patch.object(wd, "read_mem_available_mb", return_value=50.0):
            with patch.object(wd, "restart_service") as mock_restart:
                result = wd.check_and_act()

    # High load + low mem, but cooldown is active → no restart
    assert result == 0
    mock_restart.assert_not_called()


# ── check_and_act: fail-safe when /proc unreadable ───────────────────────────

def test_no_restart_when_both_proc_reads_fail(monkeypatch, tmp_path):
    monkeypatch.setattr(wd, "LOAD_MAX", 8.0)
    monkeypatch.setattr(wd, "MEM_MIN_MB", 300.0)
    monkeypatch.setattr(wd, "LAST_RESTART_FILE", tmp_path / "lr")

    with patch.object(wd, "read_load1", return_value=None):
        with patch.object(wd, "read_mem_available_mb", return_value=None):
            with patch.object(wd, "restart_service") as mock_restart:
                result = wd.check_and_act()

    assert result == 2  # error exit code
    mock_restart.assert_not_called()


def test_partial_proc_read_load_only_uses_available_data(monkeypatch, tmp_path):
    """If only load can be read, threshold decision uses only load."""
    monkeypatch.setattr(wd, "LOAD_MAX", 8.0)
    monkeypatch.setattr(wd, "MEM_MIN_MB", 300.0)
    monkeypatch.setattr(wd, "COOLDOWN_SEC", 600.0)
    monkeypatch.setattr(wd, "LAST_RESTART_FILE", tmp_path / "lr")

    with patch.object(wd, "read_load1", return_value=2.0):   # below threshold
        with patch.object(wd, "read_mem_available_mb", return_value=None):
            with patch.object(wd, "restart_service") as mock_restart:
                result = wd.check_and_act()

    assert result == 0
    mock_restart.assert_not_called()


def test_partial_proc_read_triggers_on_mem_when_load_unavailable(monkeypatch, tmp_path):
    """If load unreadable but mem is critically low, restart fires."""
    monkeypatch.setattr(wd, "LOAD_MAX", 8.0)
    monkeypatch.setattr(wd, "MEM_MIN_MB", 300.0)
    monkeypatch.setattr(wd, "COOLDOWN_SEC", 600.0)
    monkeypatch.setattr(wd, "LAST_RESTART_FILE", tmp_path / "lr")

    with patch.object(wd, "read_load1", return_value=None):
        with patch.object(wd, "read_mem_available_mb", return_value=100.0):
            with patch.object(wd, "restart_service", return_value=True) as mock_restart:
                with patch.object(wd, "send_watchdog_alert"):
                    result = wd.check_and_act()

    assert result == 1
    mock_restart.assert_called_once()


# ── record_restart writes timestamp ──────────────────────────────────────────

def test_record_restart_writes_current_timestamp(tmp_path):
    lr_file = tmp_path / "last_restart"
    before = time.time()
    with patch.object(wd, "LAST_RESTART_FILE", lr_file):
        wd.record_restart()
    after = time.time()

    written = float(lr_file.read_text())
    assert before <= written <= after
