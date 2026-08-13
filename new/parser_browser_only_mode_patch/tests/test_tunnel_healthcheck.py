"""Unit tests for ``infra/dev/check_tunnel_19012.sh`` (Story 27.2, AC-3, DOD-13a).

Invokes the real script via subprocess so the tested contract (exit codes,
log-line format) matches production. Uses an ephemeral TCP listener as a
stand-in for the tunnel, and an isolated log file per test so runs are
independent.
"""

from __future__ import annotations

import os
import shutil
import socket
import subprocess
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[1]
_SCRIPT = _REPO_ROOT / "infra" / "dev" / "check_tunnel_19012.sh"


requires_bash = pytest.mark.skipif(
    shutil.which("bash") is None, reason="bash not available"
)


@contextmanager
def _tcp_listener(port: int) -> Iterator[socket.socket]:
    """Bind a loopback listener on *port* long enough for the probe's 2s timeout."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("127.0.0.1", port))
    sock.listen(1)

    stop = threading.Event()

    def _accept() -> None:
        sock.settimeout(0.25)
        while not stop.is_set():
            try:
                client, _ = sock.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            client.close()

    thread = threading.Thread(target=_accept, daemon=True)
    thread.start()
    try:
        yield sock
    finally:
        stop.set()
        sock.close()
        thread.join(timeout=1.0)


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _run(env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(_SCRIPT)],
        env={**os.environ, **env},
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )


@requires_bash
def test_check_tunnel_exit_0_when_port_listening(tmp_path: Path) -> None:
    port = _free_port()
    log = tmp_path / "tunnel-health.log"

    with _tcp_listener(port):
        # Give the kernel a moment to register the listen backlog.
        time.sleep(0.05)
        result = _run(
            {
                "PIN888_TUNNEL_HEALTH_PORT": str(port),
                "PIN888_TUNNEL_HEALTH_HOST": "127.0.0.1",
                "PIN888_TUNNEL_HEALTH_LOG": str(log),
            }
        )

    assert result.returncode == 0, result.stderr
    assert log.exists()
    line = log.read_text(encoding="utf-8").strip().splitlines()[-1]
    ts, status = line.split()
    assert status == "ok"
    assert ts.isdigit()


@requires_bash
def test_check_tunnel_exit_1_when_port_closed(tmp_path: Path) -> None:
    port = _free_port()
    log = tmp_path / "tunnel-health.log"

    # No listener — expect DOWN.
    result = _run(
        {
            "PIN888_TUNNEL_HEALTH_PORT": str(port),
            "PIN888_TUNNEL_HEALTH_HOST": "127.0.0.1",
            "PIN888_TUNNEL_HEALTH_LOG": str(log),
        }
    )

    assert result.returncode == 1, result.stderr
    line = log.read_text(encoding="utf-8").strip().splitlines()[-1]
    _, status = line.split()
    assert status == "down"


@requires_bash
def test_check_tunnel_appends_log_lines(tmp_path: Path) -> None:
    port = _free_port()
    log = tmp_path / "tunnel-health.log"

    # Two DOWN ticks should append two lines.
    for _ in range(2):
        result = _run(
            {
                "PIN888_TUNNEL_HEALTH_PORT": str(port),
                "PIN888_TUNNEL_HEALTH_HOST": "127.0.0.1",
                "PIN888_TUNNEL_HEALTH_LOG": str(log),
            }
        )
        assert result.returncode == 1

    lines = log.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2
    for line in lines:
        parts = line.split()
        assert len(parts) == 2
        assert parts[1] == "down"


@requires_bash
def test_check_tunnel_creates_log_dir_if_missing(tmp_path: Path) -> None:
    port = _free_port()
    log = tmp_path / "nested" / "sub" / "health.log"

    result = _run(
        {
            "PIN888_TUNNEL_HEALTH_PORT": str(port),
            "PIN888_TUNNEL_HEALTH_HOST": "127.0.0.1",
            "PIN888_TUNNEL_HEALTH_LOG": str(log),
        }
    )

    assert result.returncode == 1
    assert log.exists()
