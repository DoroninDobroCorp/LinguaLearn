"""Unit tests for the LaunchAgent plist template + install.sh
(Story 27.2, AC-1/AC-6, DOD-1/DOD-2/DOD-10/DOD-13a).

Covers:
- plist XML is well-formed.
- Template contains the canonical SSH keepalive values (15 × 3) and the
  `__USER_HOME__` placeholder, not bare `~` — launchd does not expand `~`.
- install.sh substitutes `__USER_HOME__` and refuses to install if the
  placeholder leaks through.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[1]
_TEMPLATE = _REPO_ROOT / "infra" / "launchagent" / "com.pin888.tunnel.9012.plist.template"
_NEWSYSLOG_TEMPLATE = (
    _REPO_ROOT / "infra" / "launchagent" / "com.pin888.tunnel.9012.newsyslog.conf"
)
_INSTALL = _REPO_ROOT / "infra" / "launchagent" / "install.sh"


requires_bash = pytest.mark.skipif(
    shutil.which("bash") is None, reason="bash not available"
)


def test_plist_template_is_well_formed_xml() -> None:
    # ElementTree accepts plist as plain XML (ignores the DOCTYPE).
    tree = ET.parse(_TEMPLATE)
    root = tree.getroot()
    assert root.tag == "plist"


def test_plist_template_contains_canonical_keepalive_values() -> None:
    text = _TEMPLATE.read_text(encoding="utf-8")
    assert "ServerAliveInterval=15" in text, "AC-2 requires canonical 15s keepalive"
    assert "ServerAliveCountMax=3" in text, "AC-2 requires count=3"
    assert "ExitOnForwardFailure=yes" in text


def test_plist_template_contains_autossh_monitoring_disabled() -> None:
    text = _TEMPLATE.read_text(encoding="utf-8")
    # AC-2: autossh must run with -M 0 (monitoring port OFF); rely on SSH keepalive.
    assert "<string>-M</string>" in text
    assert "<string>0</string>" in text


def test_plist_template_uses_placeholder_not_tilde() -> None:
    text = _TEMPLATE.read_text(encoding="utf-8")
    assert "__USER_HOME__" in text, "template must use __USER_HOME__ placeholder"
    # Accept the tilde inside free-form comment text but not inside path keys.
    # A simple lint: no path key value should start with '~/'.
    assert "<string>~/" not in text, "launchd does not expand ~ inside plist path keys"


def test_plist_template_uses_autossh_path_placeholder_not_hardcoded() -> None:
    # Regression guard: brew installs autossh at /opt/homebrew/bin on Apple
    # Silicon and /usr/local/bin on Intel. Hardcoding either path breaks the
    # LaunchAgent on the other arch silently (launchd only logs via Console).
    text = _TEMPLATE.read_text(encoding="utf-8")
    assert "__AUTOSSH_PATH__" in text, "template must use __AUTOSSH_PATH__ placeholder"
    # Strictly reject either hardcoded absolute autossh path inside <string>…</string>.
    assert "<string>/usr/local/bin/autossh</string>" not in text
    assert "<string>/opt/homebrew/bin/autossh</string>" not in text


def test_plist_template_has_keep_alive_and_run_at_load() -> None:
    tree = ET.parse(_TEMPLATE)
    root = tree.getroot()
    top_dict = root.find("dict")
    assert top_dict is not None
    keys = [el.text for el in top_dict if el.tag == "key"]
    for required in ("Label", "ProgramArguments", "RunAtLoad", "KeepAlive", "StandardOutPath"):
        assert required in keys, f"plist missing required key: {required}"


@requires_bash
def test_install_script_substitutes_placeholder(tmp_path: Path) -> None:
    fake_home = tmp_path / "home"
    fake_home.mkdir()
    env = {
        **os.environ,
        "HOME": str(fake_home),
        "PIN888_TUNNEL_SKIP_LAUNCHCTL": "1",
    }

    result = subprocess.run(
        ["bash", str(_INSTALL)],
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, f"install.sh failed: {result.stderr}"

    installed = fake_home / "Library" / "LaunchAgents" / "com.pin888.tunnel.9012.plist"
    assert installed.exists(), "plist was not installed"
    content = installed.read_text(encoding="utf-8")
    assert "__USER_HOME__" not in content, "placeholder leaked into deployed plist"
    assert "__AUTOSSH_PATH__" not in content, "__AUTOSSH_PATH__ leaked into deployed plist"
    assert str(fake_home) in content, "HOME not substituted into the plist"


@requires_bash
def test_install_script_honors_autossh_path_override(tmp_path: Path) -> None:
    # Guards AC-1 on Apple Silicon: installer must respect PIN888_AUTOSSH_PATH
    # and bake the exact binary path into the plist (launchd ProgramArguments
    # takes absolute paths only).
    fake_home = tmp_path / "home-arm"
    fake_home.mkdir()
    env = {
        **os.environ,
        "HOME": str(fake_home),
        "PIN888_TUNNEL_SKIP_LAUNCHCTL": "1",
        "PIN888_AUTOSSH_PATH": "/opt/homebrew/bin/autossh",
    }

    result = subprocess.run(
        ["bash", str(_INSTALL)],
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, f"install.sh failed: {result.stderr}"

    installed = fake_home / "Library" / "LaunchAgents" / "com.pin888.tunnel.9012.plist"
    content = installed.read_text(encoding="utf-8")
    assert "<string>/opt/homebrew/bin/autossh</string>" in content, (
        "PIN888_AUTOSSH_PATH override not applied"
    )
    assert "__AUTOSSH_PATH__" not in content


@requires_bash
def test_install_script_creates_log_directory(tmp_path: Path) -> None:
    fake_home = tmp_path / "home2"
    fake_home.mkdir()
    env = {
        **os.environ,
        "HOME": str(fake_home),
        "PIN888_TUNNEL_SKIP_LAUNCHCTL": "1",
    }

    result = subprocess.run(
        ["bash", str(_INSTALL)],
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0
    assert (fake_home / "Library" / "Logs" / "pin888-tunnel-9012").is_dir()


@requires_bash
def test_install_script_refuses_to_run_with_empty_home(tmp_path: Path) -> None:
    env = {
        **{k: v for k, v in os.environ.items() if k != "HOME"},
        "HOME": "",
        "PIN888_TUNNEL_SKIP_LAUNCHCTL": "1",
    }

    result = subprocess.run(
        ["bash", str(_INSTALL)],
        env=env,
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )
    assert result.returncode == 2, f"expected exit 2 on empty HOME, got {result.returncode}"
    assert "HOME is empty" in result.stderr


@requires_bash
def test_install_script_fails_when_placeholder_still_present(tmp_path: Path) -> None:
    # Build a broken template that doesn't use the placeholder at all — it
    # must still NOT trip the placeholder guard, so this test inverts: create
    # a template WITH an additional __USER_HOME__ that sed can't reach because
    # we monkey-patch the template with a suspicious sibling marker.
    fake_home = tmp_path / "home3"
    fake_home.mkdir()

    broken_template = tmp_path / "broken.plist.template"
    broken_template.write_text(
        "<?xml version='1.0'?>\n<!-- __USERHOME_ evil -->\n<plist><dict/></plist>\n",
        encoding="utf-8",
    )
    # Inject a literal `__USER_HOME__` that sed() handles correctly, then a
    # BROKEN duplicate that we hack in afterward. The purpose of this test is
    # simpler than it looks: if for any reason substitution misses a token, the
    # installer must abort instead of silently shipping a broken plist.
    broken_template.write_text(
        "<?xml version='1.0'?>\n<plist><dict>\n"
        "<key>Label</key><string>test.placeholder</string>\n"
        "<key>Bad</key><string>still __USER_HOME__ here</string>\n"
        "</dict></plist>\n",
        encoding="utf-8",
    )

    # sed WILL substitute the placeholder; to exercise the guard we instead
    # give sed nothing to touch by setting HOME to the placeholder itself —
    # the guard then sees the placeholder left after "substitution".
    env = {
        **os.environ,
        "HOME": "__USER_HOME__",  # sed replaces __USER_HOME__ with __USER_HOME__ → placeholder remains
        "PIN888_TUNNEL_SKIP_LAUNCHCTL": "1",
        "PIN888_TUNNEL_TEMPLATE": str(broken_template),
    }

    result = subprocess.run(
        ["bash", str(_INSTALL)],
        env=env,
        cwd=str(tmp_path),  # relative $HOME path must NOT leak into repo
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )
    assert result.returncode == 3, (
        f"installer must refuse when placeholder remains (got {result.returncode}): "
        f"{result.stderr}"
    )
    assert "not substituted" in result.stderr


def test_newsyslog_template_has_canonical_rotation_params() -> None:
    # AC-6 / DOD-11: size cap 10 MiB (10240 KB), retention 7 generations,
    # bzip2 compression (flag J), two log streams (tunnel.log + tunnel.err).
    text = _NEWSYSLOG_TEMPLATE.read_text(encoding="utf-8")
    non_comment = [
        ln for ln in text.splitlines() if ln.strip() and not ln.lstrip().startswith("#")
    ]
    # Directive lines for the two log streams.
    assert any("tunnel.log" in ln for ln in non_comment), "tunnel.log directive missing"
    assert any("tunnel.err" in ln for ln in non_comment), "tunnel.err directive missing"
    # Every directive must carry retention=7, size=10240, flag=J.
    for ln in non_comment:
        parts = ln.split()
        assert "10240" in parts, f"directive missing 10240 KB size cap: {ln!r}"
        assert "7" in parts, f"directive missing retention=7: {ln!r}"
        assert parts[-1] == "J", f"directive must end with flag=J (bzip2): {ln!r}"


def test_newsyslog_template_uses_placeholder_not_tilde() -> None:
    text = _NEWSYSLOG_TEMPLATE.read_text(encoding="utf-8")
    assert "__USER_HOME__" in text, "newsyslog template must use __USER_HOME__ placeholder"
    # Ignore comments (#-lines); directives must not start with `~/`.
    for ln in text.splitlines():
        stripped = ln.strip()
        if not stripped or stripped.startswith("#"):
            continue
        assert not stripped.startswith("~/"), (
            f"newsyslog does not expand ~ in path fields: {ln!r}"
        )


@requires_bash
def test_install_script_renders_newsyslog_config(tmp_path: Path) -> None:
    # AC-6 / DOD-11: installer must stage a rendered newsyslog.conf with the
    # placeholder substituted, ready for `sudo install` by the operator.
    fake_home = tmp_path / "home_newsyslog"
    fake_home.mkdir()
    env = {
        **os.environ,
        "HOME": str(fake_home),
        "PIN888_TUNNEL_SKIP_LAUNCHCTL": "1",
    }

    result = subprocess.run(
        ["bash", str(_INSTALL)],
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, f"install.sh failed: {result.stderr}"

    staged = _INSTALL.parent / ".staged-newsyslog.conf"
    assert staged.exists(), "newsyslog config not staged by installer"
    content = staged.read_text(encoding="utf-8")
    assert "__USER_HOME__" not in content, "placeholder leaked into newsyslog config"
    assert str(fake_home) in content, "HOME not substituted in newsyslog config"
    # stdout should instruct the operator how to activate.
    assert "sudo install" in result.stdout
    assert "newsyslog.d" in result.stdout
    # Cleanup — staged file is a side effect of the installer.
    staged.unlink(missing_ok=True)


@requires_bash
def test_install_script_rejects_missing_newsyslog_template(tmp_path: Path) -> None:
    fake_home = tmp_path / "home_missing_newsyslog"
    fake_home.mkdir()
    env = {
        **os.environ,
        "HOME": str(fake_home),
        "PIN888_TUNNEL_SKIP_LAUNCHCTL": "1",
        "PIN888_TUNNEL_NEWSYSLOG_TEMPLATE": str(tmp_path / "does-not-exist.conf"),
    }

    result = subprocess.run(
        ["bash", str(_INSTALL)],
        env=env,
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )
    assert result.returncode == 2, (
        f"expected exit 2 on missing newsyslog template, got {result.returncode}: "
        f"{result.stderr}"
    )
    assert "newsyslog template not found" in result.stderr


@requires_bash
def test_install_script_fails_on_newsyslog_placeholder_leak(tmp_path: Path) -> None:
    # Same trick as the plist-leak test: set HOME to the placeholder literal
    # so sed "substitution" is a no-op and the guard must abort.
    fake_home = tmp_path / "home_newsyslog_leak"
    fake_home.mkdir()

    # Use the real plist template (so plist guard passes only because HOME is
    # also placeholder — but wait: that would fail on plist guard first).
    # To isolate the newsyslog guard, give a plist template with NO placeholder
    # (so sed output has no leak), and a newsyslog template with one.
    plist_no_placeholder = tmp_path / "plist-clean.template"
    plist_no_placeholder.write_text(
        "<?xml version='1.0'?>\n<plist><dict>\n"
        "<key>Label</key><string>test</string>\n"
        "</dict></plist>\n",
        encoding="utf-8",
    )
    newsyslog_with_placeholder = tmp_path / "newsyslog-with-ph.conf"
    newsyslog_with_placeholder.write_text(
        "# test\n__USER_HOME__/Library/Logs/x/y.log  644  7  10240  *  J\n",
        encoding="utf-8",
    )

    env = {
        **os.environ,
        "HOME": "__USER_HOME__",  # leaves placeholder intact after sed
        "PIN888_TUNNEL_SKIP_LAUNCHCTL": "1",
        "PIN888_TUNNEL_TEMPLATE": str(plist_no_placeholder),
        "PIN888_TUNNEL_NEWSYSLOG_TEMPLATE": str(newsyslog_with_placeholder),
    }

    result = subprocess.run(
        ["bash", str(_INSTALL)],
        env=env,
        cwd=str(tmp_path),  # relative $HOME path must NOT leak into repo
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )
    assert result.returncode == 5, (
        f"installer must abort with exit 5 on newsyslog leak, got {result.returncode}: "
        f"{result.stderr}"
    )
    assert "newsyslog" in result.stderr.lower()
