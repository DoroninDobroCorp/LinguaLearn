"""Unit tests for the legacy manual tunnel script + dev-side systemd units
(Story 27.2, AC-2/AC-3, DOD-5/DOD-13).

These are static-assertion tests: we don't execute the shell script or load
the systemd units, we just verify they carry the canonical configuration
values declared in the story. This catches regressions where someone changes
the script or a unit file without updating the other side.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
_LEGACY_SCRIPT = _REPO_ROOT / "tools" / "open_dev_9012_tunnel.sh"
_HEALTHCHECK_SERVICE = (
    _REPO_ROOT / "infra" / "dev" / "systemd" / "tunnel-19012-healthcheck.service"
)
_HEALTHCHECK_TIMER = (
    _REPO_ROOT / "infra" / "dev" / "systemd" / "tunnel-19012-healthcheck.timer"
)
_NOTIFIER_SERVICE = (
    _REPO_ROOT / "infra" / "dev" / "systemd" / "tunnel-19012-notifier.service"
)
_NOTIFIER_TIMER = _REPO_ROOT / "infra" / "dev" / "systemd" / "tunnel-19012-notifier.timer"


# ---------------------------------------------------------------------------
# legacy script (tools/open_dev_9012_tunnel.sh) — DOD-13
# ---------------------------------------------------------------------------


def test_legacy_script_uses_canonical_keepalive() -> None:
    text = _LEGACY_SCRIPT.read_text(encoding="utf-8")
    # Must match AC-2 canonical values so diagnostic sessions reproduce the
    # same dead-forward detection cadence as the LaunchAgent.
    assert re.search(r"ServerAliveInterval=15\b", text), (
        "legacy script must carry ServerAliveInterval=15 (AC-2 canonical value)"
    )
    assert re.search(r"ServerAliveCountMax=3\b", text), "legacy script must carry CountMax=3"
    assert re.search(r"ExitOnForwardFailure=yes\b", text), (
        "ExitOnForwardFailure=yes required"
    )


def test_legacy_script_declares_deprecated_in_header() -> None:
    text = _LEGACY_SCRIPT.read_text(encoding="utf-8")
    head = text[: 800]
    assert "DEPRECATED" in head or "deprecated" in head, (
        "legacy script must flag deprecation vs the LaunchAgent supervisor"
    )


def test_legacy_script_does_not_advertise_ServerAliveInterval_30() -> None:
    # Catches accidental rollback to the pre-Epic-27 30s value.
    text = _LEGACY_SCRIPT.read_text(encoding="utf-8")
    assert "ServerAliveInterval=30" not in text, (
        "legacy script reintroduced stale 30s value — update AC-2 canonical 15s"
    )


def test_legacy_script_rejects_option_smuggle_in_host_argument() -> None:
    # A caller passing `-o ProxyCommand=...` as $1 must be rejected before
    # reaching `exec ssh`. The script exits 2 with an explanatory error on stderr.
    result = subprocess.run(
        ["bash", str(_LEGACY_SCRIPT), "-o ProxyCommand=evil"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 2, f"expected exit 2, got {result.returncode}: {result.stderr!r}"
    assert "invalid REMOTE_HOST" in result.stderr


def test_legacy_script_rejects_non_numeric_port() -> None:
    result = subprocess.run(
        ["bash", str(_LEGACY_SCRIPT), "dev", "19012 -o BatchMode=no"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 2, f"expected exit 2, got {result.returncode}: {result.stderr!r}"
    assert "ports must be numeric" in result.stderr


# ---------------------------------------------------------------------------
# systemd healthcheck — DOD-4, DOD-5
# ---------------------------------------------------------------------------


def test_healthcheck_timer_uses_30s_cadence_not_cron() -> None:
    text = _HEALTHCHECK_TIMER.read_text(encoding="utf-8")
    assert "OnUnitActiveSec=30s" in text, "AC-3 requires 30s cadence"
    # systemd timer file must NOT declare cron-based invocation. We allow the
    # word "cron" inside explanatory comments (e.g. documenting why cron is
    # unsuitable for 30s cadence), but reject any uncommented `cron` token
    # such as `Type=cron` or a bare `cron` unit directive.
    directive_lines = [
        ln.strip()
        for ln in text.splitlines()
        if ln.strip() and not ln.strip().startswith(("#", ";"))
    ]
    for line in directive_lines:
        assert "cron" not in line.lower(), (
            f"non-comment line references cron (should use systemd timer only): {line!r}"
        )


def test_healthcheck_service_accepts_exit_1_as_success() -> None:
    # The probe uses exit 1 to signal "tunnel down"; systemd must not treat
    # that as a unit failure so the timer keeps firing.
    text = _HEALTHCHECK_SERVICE.read_text(encoding="utf-8")
    assert "SuccessExitStatus=0 1" in text, "probe exit 1 must be treated as success"


def test_healthcheck_service_defines_install_root() -> None:
    text = _HEALTHCHECK_SERVICE.read_text(encoding="utf-8")
    assert "Environment=INSTALL_ROOT=" in text, "must define INSTALL_ROOT for drop-ins"
    assert "${INSTALL_ROOT}/infra/dev/check_tunnel_19012.sh" in text


# ---------------------------------------------------------------------------
# systemd notifier — DOD-6, DOD-7
# ---------------------------------------------------------------------------


def test_notifier_service_sources_optional_env_file() -> None:
    text = _NOTIFIER_SERVICE.read_text(encoding="utf-8")
    # Leading dash = optional file. Story explicitly says missing env is OK,
    # the notifier will exit 2 with a journal message instead of crashing.
    assert "EnvironmentFile=-/etc/pin888/notify.env" in text


def test_notifier_timer_fires_every_minute() -> None:
    text = _NOTIFIER_TIMER.read_text(encoding="utf-8")
    assert "OnUnitActiveSec=60s" in text, (
        "notifier cadence must be 60s so 120s down threshold is respected"
    )


def test_notifier_service_uses_python3_and_absolute_path() -> None:
    text = _NOTIFIER_SERVICE.read_text(encoding="utf-8")
    assert "ExecStart=/usr/bin/env python3" in text
    assert "${INSTALL_ROOT}/infra/dev/notify_tunnel_down.py" in text
