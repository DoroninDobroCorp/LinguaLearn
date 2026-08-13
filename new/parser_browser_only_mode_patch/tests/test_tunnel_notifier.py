"""Unit tests for ``infra/dev/notify_tunnel_down.py`` (Story 27.2, AC-4 / DOD-6, DOD-7, DOD-13a).

Covers the pure decision path (``decide_action``), log parsing, state
persistence, dispatcher misconfiguration, and channel dispatch via fake
transports. No real Telegram/SMTP traffic.
"""

from __future__ import annotations

import importlib.util
import json
import sys
import time
from pathlib import Path
from typing import Any

import pytest

# Load the notifier module from its on-disk path — the file lives under
# `infra/dev/` which is not a standard Python package root, so we import it
# via spec_from_file_location to avoid shipping a fake package.
_REPO_ROOT = Path(__file__).resolve().parents[1]
_MODULE_PATH = _REPO_ROOT / "infra" / "dev" / "notify_tunnel_down.py"

_spec = importlib.util.spec_from_file_location("notify_tunnel_down", _MODULE_PATH)
assert _spec is not None and _spec.loader is not None, "notifier module must exist"
notify_tunnel_down = importlib.util.module_from_spec(_spec)
sys.modules["notify_tunnel_down"] = notify_tunnel_down
_spec.loader.exec_module(notify_tunnel_down)


# ---------------------------------------------------------------------------
# read_health_log
# ---------------------------------------------------------------------------


def test_read_health_log_returns_empty_list_when_file_missing(tmp_path: Path) -> None:
    missing = tmp_path / "nope.log"
    assert notify_tunnel_down.read_health_log(missing) == []


def test_read_health_log_parses_valid_lines_and_skips_garbage(tmp_path: Path) -> None:
    log = tmp_path / "health.log"
    log.write_text(
        "\n".join(
            [
                "1700000000 ok",
                "invalid line here",
                "1700000030 down",
                "1700000060 weird",  # unknown status — skipped
                "abc down",  # non-int ts — skipped
                "1700000090 ok",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    entries = notify_tunnel_down.read_health_log(log)
    assert [(e.ts, e.status) for e in entries] == [
        (1700000000, "ok"),
        (1700000030, "down"),
        (1700000090, "ok"),
    ]


def test_read_health_log_tails_n_lines(tmp_path: Path) -> None:
    log = tmp_path / "health.log"
    log.write_text("\n".join(f"{1700000000 + i} ok" for i in range(500)) + "\n", encoding="utf-8")

    entries = notify_tunnel_down.read_health_log(log, tail_lines=3)
    assert len(entries) == 3
    assert entries[0].ts == 1700000000 + 497


# ---------------------------------------------------------------------------
# compute_down_since
# ---------------------------------------------------------------------------


def _entry(ts: int, status: str) -> Any:
    return notify_tunnel_down.HealthEntry(ts=ts, status=status)


def test_compute_down_since_returns_zero_when_last_entry_ok() -> None:
    entries = [_entry(100, "down"), _entry(130, "ok")]
    assert notify_tunnel_down.compute_down_since(entries) == 0


def test_compute_down_since_returns_first_ts_in_trailing_down_streak() -> None:
    entries = [
        _entry(100, "ok"),
        _entry(130, "down"),
        _entry(160, "down"),
        _entry(190, "down"),
    ]
    assert notify_tunnel_down.compute_down_since(entries) == 130


def test_compute_down_since_empty_list_is_zero() -> None:
    assert notify_tunnel_down.compute_down_since([]) == 0


def test_compute_down_since_drops_future_entries_when_now_ts_given() -> None:
    # Clock skew / corrupted log: a "down" entry with a timestamp 1 hour ahead
    # of the current wall clock must not be treated as a valid member of the
    # trailing down-streak — otherwise downtime = now - future = negative and
    # the alert threshold is silently never reached.
    entries = [
        _entry(100, "down"),
        _entry(130, "down"),
        _entry(1700003600, "down"),  # far future
    ]
    # Without clamp: returns 100 which is fine here, but if ALL entries are
    # future — or the streak's tail is future — it breaks the decide_action
    # downtime calculation. Test both shapes.
    assert notify_tunnel_down.compute_down_since(entries, now_ts=200) == 100

    all_future = [_entry(1700003600, "down"), _entry(1700003700, "down")]
    # All entries dropped → no streak → return 0 (treated as "nothing to decide").
    assert notify_tunnel_down.compute_down_since(all_future, now_ts=200) == 0


# ---------------------------------------------------------------------------
# decide_action
# ---------------------------------------------------------------------------


def _state(**overrides: Any) -> Any:
    base = {"last_alert_status": "", "last_down_alert_ts": 0, "down_since_ts": 0}
    base.update(overrides)
    return notify_tunnel_down.NotifyState(**base)


def test_decide_action_no_entries_returns_none() -> None:
    action, new_state = notify_tunnel_down.decide_action(
        entries=[], state=_state(), now_ts=1700000200
    )
    # No entries → nothing to alert on. Fresh-state treated as "ok" so we
    # record "ok" as last_alert_status to arm future down→up edge detection.
    assert action is None
    assert new_state.last_alert_status == "ok"
    assert new_state.down_since_ts == 0


def test_decide_action_tunnel_up_no_prior_alert_no_action() -> None:
    entries = [_entry(100, "ok"), _entry(130, "ok")]
    action, new_state = notify_tunnel_down.decide_action(
        entries=entries, state=_state(), now_ts=200
    )
    assert action is None
    # first run with up — we record "ok" so that later down/up edges are detected
    assert new_state.last_alert_status == "ok"
    assert new_state.down_since_ts == 0


def test_decide_action_tunnel_up_after_down_alert_sends_recovery() -> None:
    entries = [_entry(100, "down"), _entry(160, "ok")]
    action, new_state = notify_tunnel_down.decide_action(
        entries=entries,
        state=_state(last_alert_status="down", last_down_alert_ts=120, down_since_ts=100),
        now_ts=200,
    )
    assert action == "up"
    assert new_state.last_alert_status == "up"
    assert new_state.last_down_alert_ts == 0
    assert new_state.down_since_ts == 0


def test_decide_action_down_below_threshold_no_alert() -> None:
    # Tunnel went down 60s ago, below the 120s threshold — no alert yet.
    entries = [_entry(100, "ok"), _entry(140, "down")]
    action, new_state = notify_tunnel_down.decide_action(
        entries=entries, state=_state(), now_ts=200
    )
    assert action is None
    assert new_state.down_since_ts == 140


def test_decide_action_down_over_threshold_sends_alert() -> None:
    entries = [_entry(100, "ok"), _entry(140, "down"), _entry(170, "down")]
    action, new_state = notify_tunnel_down.decide_action(
        entries=entries, state=_state(), now_ts=300
    )
    assert action == "down"
    assert new_state.last_alert_status == "down"
    assert new_state.last_down_alert_ts == 300
    assert new_state.down_since_ts == 140


def test_decide_action_down_alert_respects_retry_cooldown() -> None:
    # Tunnel stayed down, last DOWN alert was 100s ago (cooldown=300s) — no re-alert.
    entries = [_entry(140, "down"), _entry(200, "down")]
    action, new_state = notify_tunnel_down.decide_action(
        entries=entries,
        state=_state(last_alert_status="down", last_down_alert_ts=200, down_since_ts=140),
        now_ts=300,
    )
    assert action is None
    # State kept — we don't refresh last_down_alert_ts without dispatch.
    assert new_state.last_down_alert_ts == 200


def test_decide_action_down_alert_re_sends_after_cooldown() -> None:
    entries = [_entry(140, "down"), _entry(600, "down")]
    action, new_state = notify_tunnel_down.decide_action(
        entries=entries,
        state=_state(last_alert_status="down", last_down_alert_ts=200, down_since_ts=140),
        now_ts=700,
    )
    assert action == "down"
    assert new_state.last_down_alert_ts == 700


def test_decide_action_future_timestamp_does_not_silently_suppress_alerts() -> None:
    # Regression guard: a single corrupted log line with a future timestamp
    # (e.g. NTP step, VM resume, local clock skew) must not poison the entire
    # down-streak. Without the guard, down_since > now_ts → downtime negative
    # → threshold never satisfied → DOWN alert suppressed forever.
    entries = [
        _entry(140, "down"),  # real down start, 160s ago from now_ts=300
        _entry(170, "down"),
        _entry(200, "down"),
        _entry(1700003600, "down"),  # corrupted: far future
    ]
    action, new_state = notify_tunnel_down.decide_action(
        entries=entries, state=_state(), now_ts=300
    )
    # Real downtime is 300-140 = 160s ≥ threshold → alert must fire.
    assert action == "down"
    assert new_state.last_alert_status == "down"
    # down_since computed over sane entries only — not the future-stamped one.
    assert new_state.down_since_ts == 140


# ---------------------------------------------------------------------------
# dispatch / channel selection
# ---------------------------------------------------------------------------


def test_dispatch_stderr_writes_message(capsys: pytest.CaptureFixture[str]) -> None:
    notify_tunnel_down.dispatch("hello", channel="stderr", env={})
    captured = capsys.readouterr()
    assert "hello" in captured.err


def test_dispatch_unknown_channel_raises() -> None:
    with pytest.raises(RuntimeError, match="unknown notify channel"):
        notify_tunnel_down.dispatch("x", channel="carrier-pigeon", env={})


def test_dispatch_telegram_missing_credentials_raises() -> None:
    with pytest.raises(RuntimeError, match="telegram channel requires"):
        notify_tunnel_down.dispatch("x", channel="telegram", env={})


def test_dispatch_email_missing_credentials_raises() -> None:
    with pytest.raises(RuntimeError, match="email channel requires"):
        notify_tunnel_down.dispatch("x", channel="email", env={})


def test_dispatch_telegram_calls_urlopen_with_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    class FakeResp:
        def __enter__(self) -> "FakeResp":
            return self

        def __exit__(self, *_: Any) -> None:
            return None

        def read(self) -> bytes:
            return b""

    def fake_urlopen(req: Any, timeout: float = 5.0) -> FakeResp:  # noqa: ARG001
        captured["url"] = req.full_url
        captured["data"] = req.data
        return FakeResp()

    monkeypatch.setattr(notify_tunnel_down.urllib.request, "urlopen", fake_urlopen)
    notify_tunnel_down.dispatch(
        "msg",
        channel="telegram",
        env={
            "PIN888_NOTIFY_TELEGRAM_TOKEN": "TOKEN",
            "PIN888_NOTIFY_TELEGRAM_CHAT_ID": "CHAT",
        },
    )
    assert captured["url"].endswith("/botTOKEN/sendMessage")
    assert b"chat_id=CHAT" in captured["data"]
    assert b"text=msg" in captured["data"]


# ---------------------------------------------------------------------------
# state persistence
# ---------------------------------------------------------------------------


def test_load_state_returns_defaults_when_missing(tmp_path: Path) -> None:
    state = notify_tunnel_down.load_state(tmp_path / "state.json")
    assert state.last_alert_status == ""
    assert state.last_down_alert_ts == 0
    assert state.down_since_ts == 0


def test_load_state_handles_corrupt_json(tmp_path: Path) -> None:
    state_file = tmp_path / "state.json"
    state_file.write_text("{not json", encoding="utf-8")
    state = notify_tunnel_down.load_state(state_file)
    assert state.last_alert_status == ""


def test_save_state_roundtrip(tmp_path: Path) -> None:
    state_file = tmp_path / "state.json"
    notify_tunnel_down.save_state(
        state_file,
        notify_tunnel_down.NotifyState(
            last_alert_status="down", last_down_alert_ts=1234, down_since_ts=1000
        ),
    )
    with state_file.open(encoding="utf-8") as fh:
        loaded = json.load(fh)
    assert loaded == {
        "last_alert_status": "down",
        "last_down_alert_ts": 1234,
        "down_since_ts": 1000,
    }


# ---------------------------------------------------------------------------
# run_once — integration of parts above
# ---------------------------------------------------------------------------


def test_read_health_log_returns_empty_on_os_error(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    log = tmp_path / "locked.log"
    log.write_text("1700000000 ok\n", encoding="utf-8")

    def _explode(self: Any, *args: Any, **kwargs: Any) -> Any:  # noqa: ANN401
        raise OSError("permission denied")

    monkeypatch.setattr(Path, "open", _explode)
    assert notify_tunnel_down.read_health_log(log) == []


def test_dispatch_email_calls_smtp(monkeypatch: pytest.MonkeyPatch) -> None:
    sent_messages: list[Any] = []

    class FakeSMTP:
        def __init__(self, host: str, port: int, timeout: float = 5.0) -> None:  # noqa: ARG002
            self.host = host

        def __enter__(self) -> "FakeSMTP":
            return self

        def __exit__(self, *_: Any) -> None:
            return None

        def send_message(self, msg: Any) -> None:
            sent_messages.append(msg)

    monkeypatch.setattr(notify_tunnel_down.smtplib, "SMTP", FakeSMTP)
    notify_tunnel_down.dispatch(
        "alert body",
        channel="email",
        env={
            "PIN888_NOTIFY_EMAIL_TO": "ops@example.com, alt@example.com",
            "PIN888_NOTIFY_EMAIL_FROM": "bot@example.com",
            "PIN888_NOTIFY_EMAIL_SMTP_HOST": "smtp.example.com",
        },
    )
    assert len(sent_messages) == 1
    msg = sent_messages[0]
    assert msg["From"] == "bot@example.com"
    assert "ops@example.com" in msg["To"]


def test_main_returns_2_on_config_error(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    health = tmp_path / "health.log"
    state = tmp_path / "state.json"
    # Ensure continuous down long enough to trigger alert (past-dated entries).
    health.write_text(
        "\n".join(f"{int(time.time()) - (8 - i) * 30} down" for i in range(8)) + "\n",
        encoding="utf-8",
    )

    monkeypatch.setenv("PIN888_TUNNEL_HEALTH_LOG", str(health))
    monkeypatch.setenv("PIN888_TUNNEL_NOTIFY_STATE_FILE", str(state))
    monkeypatch.setenv("PIN888_NOTIFY_CHANNEL", "telegram")
    monkeypatch.delenv("PIN888_NOTIFY_TELEGRAM_TOKEN", raising=False)
    monkeypatch.delenv("PIN888_NOTIFY_TELEGRAM_CHAT_ID", raising=False)

    assert notify_tunnel_down.main([]) == 2


def test_main_returns_0_on_successful_dispatch(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    health = tmp_path / "health.log"
    state = tmp_path / "state.json"
    health.write_text(f"{int(time.time())} ok\n", encoding="utf-8")
    monkeypatch.setenv("PIN888_TUNNEL_HEALTH_LOG", str(health))
    monkeypatch.setenv("PIN888_TUNNEL_NOTIFY_STATE_FILE", str(state))
    monkeypatch.setenv("PIN888_NOTIFY_CHANNEL", "stderr")
    monkeypatch.setenv("PIN888_TUNNEL_DOWN_THRESHOLD_S", "notanint")  # graceful default
    assert notify_tunnel_down.main([]) == 0


def test_run_once_dispatches_down_then_up_sequence(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    health = tmp_path / "health.log"
    state = tmp_path / "state.json"

    # Phase A: 3 minutes of continuous down → first alert dispatched.
    health.write_text(
        "\n".join(f"{1700000000 + i * 30} down" for i in range(8)) + "\n", encoding="utf-8"
    )
    action = notify_tunnel_down.run_once(
        health_log=health,
        state_file=state,
        channel="stderr",
        now_ts=1700000000 + 8 * 30,
    )
    assert action == "down"
    captured_down = capsys.readouterr().err
    assert "DOWN" in captured_down

    # Phase B: tunnel recovers, notifier sends single UP alert.
    health.write_text(
        "\n".join(f"{1700000000 + i * 30} down" for i in range(8))
        + f"\n{1700000000 + 9 * 30} ok\n",
        encoding="utf-8",
    )
    action = notify_tunnel_down.run_once(
        health_log=health,
        state_file=state,
        channel="stderr",
        now_ts=1700000000 + 9 * 30,
    )
    assert action == "up"
    captured_up = capsys.readouterr().err
    assert "UP" in captured_up

    # Phase C: still up — no repeat UP alert.
    health.write_text(
        "\n".join(f"{1700000000 + i * 30} down" for i in range(8))
        + "\n"
        + "\n".join(f"{1700000000 + (9 + j) * 30} ok" for j in range(5))
        + "\n",
        encoding="utf-8",
    )
    action = notify_tunnel_down.run_once(
        health_log=health,
        state_file=state,
        channel="stderr",
        now_ts=1700000000 + 14 * 30,
    )
    assert action is None
