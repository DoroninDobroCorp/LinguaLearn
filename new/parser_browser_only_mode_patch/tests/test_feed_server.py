"""Phase 7: feed server tests."""

from __future__ import annotations

import json
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

from aggregator.feed_server import FeedServer, v2_feed_enabled
from aggregator.types import PublishedQuote, SystemState


def _utc():
    return datetime.now(timezone.utc)


def _make_quote(event_id="ev1"):
    """Minimal PublishedQuote for testing."""
    return PublishedQuote(
        event_id=event_id,
        payload={"event_id": event_id, "price": 1.85},
        source_used_for_publish="pin888:acct-1:browser_ws",
        freshness_ms=50.0,
        degraded=False,
        system_state_snapshot=SystemState.NORMAL,
        is_tombstone=False,
        outcomes=[],
        received_at=_utc(),
    )


# ── flag tests ────────────────────────────────────────────────────


def test_v2_feed_disabled_by_default(monkeypatch):
    monkeypatch.delenv("MSP_V2_FEED_ENABLED", raising=False)
    assert v2_feed_enabled() is False


def test_v2_feed_enabled_when_set(monkeypatch):
    monkeypatch.setenv("MSP_V2_FEED_ENABLED", "1")
    assert v2_feed_enabled() is True


# ── server lifecycle ──────────────────────────────────────────────


def test_server_does_not_start_when_flag_off(monkeypatch):
    monkeypatch.delenv("MSP_V2_FEED_ENABLED", raising=False)
    server = FeedServer(port=19013)
    server.start()
    assert not server.is_running
    server.stop()


def test_server_starts_and_serves_snapshot(monkeypatch):
    monkeypatch.setenv("MSP_V2_FEED_ENABLED", "1")
    quotes = [_make_quote("ev1"), _make_quote("ev2")]
    server = FeedServer(quote_provider=lambda: quotes, port=19014)
    try:
        server.start()
        assert server.is_running
        time.sleep(0.1)

        url = "http://127.0.0.1:19014/snapshot?profile=lightweight"
        with urllib.request.urlopen(url, timeout=2) as resp:
            data = json.loads(resp.read())
        assert data["type"] == "snapshot"
        assert data["profile"] == "lightweight"
        assert data["count"] == 2
        assert len(data["events"]) == 2
    finally:
        server.stop()


def test_server_serves_analytics_profile(monkeypatch):
    monkeypatch.setenv("MSP_V2_FEED_ENABLED", "1")
    quotes = [_make_quote()]
    server = FeedServer(quote_provider=lambda: quotes, port=19015)
    try:
        server.start()
        time.sleep(0.1)

        url = "http://127.0.0.1:19015/snapshot?profile=analytics"
        with urllib.request.urlopen(url, timeout=2) as resp:
            data = json.loads(resp.read())
        assert data["profile"] == "analytics"
        # Analytics has extra fields.
        event = data["events"][0]
        assert "publish_authority_class" in event
    finally:
        server.stop()


def test_server_health_endpoint(monkeypatch):
    monkeypatch.setenv("MSP_V2_FEED_ENABLED", "1")
    server = FeedServer(port=19016)
    try:
        server.start()
        time.sleep(0.1)
        url = "http://127.0.0.1:19016/health"
        with urllib.request.urlopen(url, timeout=2) as resp:
            data = json.loads(resp.read())
        assert data["status"] == "ok"
    finally:
        server.stop()


def test_server_monitoring_endpoint(monkeypatch):
    monkeypatch.setenv("MSP_V2_FEED_ENABLED", "1")
    server = FeedServer(
        monitoring_provider=lambda: {"system_mode": "normal", "stale_rate": 0.0},
        port=19020,
    )
    try:
        server.start()
        time.sleep(0.1)
        url = "http://127.0.0.1:19020/monitoring"
        with urllib.request.urlopen(url, timeout=2) as resp:
            data = json.loads(resp.read())
        assert data["system_mode"] == "normal"
        assert data["stale_rate"] == 0.0
    finally:
        server.stop()


def test_server_sse_events_endpoint(monkeypatch):
    monkeypatch.setenv("MSP_V2_FEED_ENABLED", "1")
    quotes = [_make_quote()]
    server = FeedServer(quote_provider=lambda: quotes, port=19017)
    try:
        server.start()
        time.sleep(0.1)
        url = "http://127.0.0.1:19017/events?profile=lightweight"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=2) as resp:
            # Read up to 4096 bytes — SSE sends data then we parse.
            raw = resp.read(4096).decode("utf-8")
        # SSE format: "data: {...}\n\n"
        assert raw.startswith("data: ")
        payload = json.loads(raw.replace("data: ", "").strip())
        assert payload["type"] == "delta"
    finally:
        server.stop()


def test_server_404_for_unknown_path(monkeypatch):
    monkeypatch.setenv("MSP_V2_FEED_ENABLED", "1")
    server = FeedServer(port=19018)
    try:
        server.start()
        time.sleep(0.1)
        url = "http://127.0.0.1:19018/unknown"
        try:
            urllib.request.urlopen(url, timeout=2)
            assert False, "Should have raised"
        except urllib.error.HTTPError as e:
            assert e.code == 404
    finally:
        server.stop()


# ── Bug fix: naive timestamp in SSE endpoint ──────────────────────


def test_sse_naive_timestamp_does_not_crash(monkeypatch):
    """SSE endpoint normalizes naive since_ts to UTC instead of crashing."""
    monkeypatch.setenv("MSP_V2_FEED_ENABLED", "1")
    quotes = [_make_quote()]
    server = FeedServer(quote_provider=lambda: quotes, port=19019)
    try:
        server.start()
        time.sleep(0.1)
        # Send a naive ISO timestamp (no +00:00 suffix).
        naive_ts = "2020-01-01T00:00:00"
        url = f"http://127.0.0.1:19019/events?profile=lightweight&since_ts={naive_ts}"
        with urllib.request.urlopen(url, timeout=2) as resp:
            raw = resp.read(4096).decode("utf-8")
        assert raw.startswith("data: ")
        payload = json.loads(raw.replace("data: ", "").strip())
        assert payload["type"] == "delta"
    finally:
        server.stop()


# ── Remote fleet endpoints ────────────────────────────────────────


def _post_json(url: str, payload: dict, *, token: str = "") -> dict:
    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["X-PS38-Remote-Token"] = token
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=2) as resp:
        return json.loads(resp.read())


def test_remote_fleet_events_endpoint_batches_to_handler(monkeypatch):
    monkeypatch.setenv("MSP_V2_FEED_ENABLED", "1")
    seen: list[dict] = []
    server = FeedServer(remote_event_handler=lambda item: seen.append(item), port=19021)
    try:
        server.start()
        time.sleep(0.1)
        payload = {"events": [{"Pid": 1}, {"Pid": 2}]}
        data = _post_json("http://127.0.0.1:19021/fleet/events", payload)
        assert data["ok"] is True
        assert data["accepted"] == 2
        assert seen == [{"Pid": 1}, {"Pid": 2}]
    finally:
        server.stop()


def test_remote_fleet_token_guard(monkeypatch):
    monkeypatch.setenv("MSP_V2_FEED_ENABLED", "1")
    monkeypatch.setenv("MSP_REMOTE_FLEET_TOKEN", "secret-token")
    server = FeedServer(remote_event_handler=lambda _item: None, port=19022)
    try:
        server.start()
        time.sleep(0.1)
        try:
            _post_json("http://127.0.0.1:19022/fleet/events", {"Pid": 1})
            assert False, "missing token should be rejected"
        except urllib.error.HTTPError as exc:
            assert exc.code == 401
        data = _post_json(
            "http://127.0.0.1:19022/fleet/events",
            {"Pid": 1},
            token="secret-token",
        )
        assert data["accepted"] == 1
    finally:
        server.stop()
        monkeypatch.delenv("MSP_REMOTE_FLEET_TOKEN", raising=False)


def test_remote_fleet_watchlist_and_morebet_next(monkeypatch):
    monkeypatch.setenv("MSP_V2_FEED_ENABLED", "1")
    server = FeedServer(
        remote_watchlist_provider=lambda: [11, 22],
        remote_morebet_target_provider=lambda: 33,
        port=19023,
    )
    try:
        server.start()
        time.sleep(0.1)
        with urllib.request.urlopen("http://127.0.0.1:19023/fleet/watchlist", timeout=2) as resp:
            watchlist = json.loads(resp.read())
        assert watchlist == {"ok": True, "watchlist": [11, 22]}
        data = _post_json("http://127.0.0.1:19023/fleet/morebet/next", {})
        assert data == {"ok": True, "event_id": 33}
    finally:
        server.stop()
