from __future__ import annotations

from argparse import Namespace
from pathlib import Path

from tools import launch_pin888_cdp_chrome


def test_build_command_uses_open_new_instance_on_macos(monkeypatch, tmp_path):
    chrome_bin = tmp_path / "Google Chrome.app" / "Contents" / "MacOS" / "Google Chrome"
    chrome_bin.parent.mkdir(parents=True)
    chrome_bin.write_text("", encoding="utf-8")
    user_data_dir = tmp_path / "profile"
    args = Namespace(
        chrome_path=str(chrome_bin),
        port=9224,
        user_data_dir=str(user_data_dir),
        profile_directory="Default",
        url="https://b.link/ukz4v32x",
    )

    monkeypatch.setattr(launch_pin888_cdp_chrome, "_chrome_binary", lambda _explicit: chrome_bin)
    monkeypatch.setattr(launch_pin888_cdp_chrome.sys, "platform", "darwin")

    command = launch_pin888_cdp_chrome._build_command(args)

    assert command[:4] == ["open", "-na", str(chrome_bin.parents[2]), "--args"]
    assert str(chrome_bin) not in command
    assert f"--remote-debugging-port={args.port}" in command
    assert f"--user-data-dir={user_data_dir}" in command
    assert "--new-window" in command
    assert args.url in command


def test_build_command_uses_binary_directly_off_macos(monkeypatch, tmp_path):
    chrome_bin = tmp_path / "chrome"
    chrome_bin.write_text("", encoding="utf-8")
    user_data_dir = tmp_path / "profile"
    args = Namespace(
        chrome_path=str(chrome_bin),
        port=9224,
        user_data_dir=str(user_data_dir),
        profile_directory="Default",
        url="https://example.test",
    )

    monkeypatch.setattr(launch_pin888_cdp_chrome, "_chrome_binary", lambda _explicit: chrome_bin)
    monkeypatch.setattr(launch_pin888_cdp_chrome.sys, "platform", "linux")

    command = launch_pin888_cdp_chrome._build_command(args)

    assert command[0] == str(chrome_bin)
    assert "open" not in command
    assert f"--remote-debugging-port={args.port}" in command
    assert f"--user-data-dir={user_data_dir}" in command
    assert args.url == command[-1]
