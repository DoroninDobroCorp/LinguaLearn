"""
Forted feed shim.

This process exposes the local Rust Forted web feed (:3055 by default) as a
consumer-facing service on :9015:

  - GET /stream/forks       raw SSE passthrough for latency-sensitive consumers
  - GET /api/forks/feed     normalized HTTP snapshot for legacy consumers
  - GET /health             monitoring metadata

It is intentionally Forted-owned and consumer-neutral. Downstream services
should consume this API rather than reaching into the Rust process directly.
"""
from __future__ import annotations

import base64
import gzip
import hashlib
import json
import logging
import os
import secrets
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse


UPSTREAM_URL = (
    os.environ.get("FORTED_LWS_URL")
    or os.environ.get("LWS_URL")
    or "http://127.0.0.1:3055"
).rstrip("/")
UPSTREAM_TOKEN = (
    os.environ.get("FORTED_LWS_TOKEN")
    or os.environ.get("LWS_TOKEN")
    or os.environ.get("ACCESS_TOKEN")
    or ""
)
FEED_BIND = os.environ.get("FORTED_FEED_BIND") or "127.0.0.1"
FEED_PORT = int(
    os.environ.get("FORTED_FEED_PORT")
    or os.environ.get("FORTED_SOURCE_PORT")
    or "9015"
)
SNAPSHOT_LIMIT = max(1, min(int(os.environ.get("FORTED_SOURCE_LIMIT", "200")), 1000))
UPSTREAM_TIMEOUT = float(os.environ.get("FORTED_LWS_TIMEOUT") or os.environ.get("LWS_TIMEOUT", "5"))
UPSTREAM_STREAM_TIMEOUT = float(
    os.environ.get("FORTED_LWS_STREAM_TIMEOUT")
    or os.environ.get("LWS_STREAM_TIMEOUT")
    or "30"
)
FEED_CACHE_TTL = max(
    0.0,
    float(os.environ.get("FORTED_FEED_CACHE_TTL", "0")),
)


def _split_env_values(raw: str) -> list[str]:
    return [item.strip() for item in raw.replace(",", ";").split(";") if item.strip()]


FEED_KEYS = _split_env_values(
    os.environ.get("FORTED_FEED_KEYS")
    or os.environ.get("FORTED_SOURCE_KEYS")
    or ""
)

_feed_cache_lock = threading.Lock()
_feed_cache_until = 0.0
_feed_cache_items: list[dict[str, Any]] = []

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("forted_feed_shim")


def _iso_z(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _stable_event_id(match_key: str) -> int:
    if not match_key:
        return 0
    digest = hashlib.blake2b(match_key.encode("utf-8"), digest_size=4).digest()
    return int.from_bytes(digest, "big") & 0x7FFFFFFF


def _to_float(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        if isinstance(value, str):
            value = value.replace(",", ".").strip()
            if not value:
                return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _list_value(values: Any, idx: int) -> Any:
    if not isinstance(values, list) or idx >= len(values):
        return None
    return values[idx]


def _state_fork_to_snapshot_item(fork: dict[str, Any], idx: int) -> dict[str, Any] | None:
    sources = fork.get("sources") or []
    if len(sources) < 2:
        return None
    s0, s1 = sources[0], sources[1]
    if not isinstance(s0, dict) or not isinstance(s1, dict):
        return None

    bk1 = str(s0.get("bk") or s0.get("bookmaker") or "")
    bk2 = str(s1.get("bk") or s1.get("bookmaker") or "")
    if not bk1 or not bk2:
        return None

    odds = fork.get("odds")
    coef1 = _to_float(_list_value(odds, 0)) or _to_float(fork.get("coef1"))
    coef2 = _to_float(_list_value(odds, 1)) or _to_float(fork.get("coef2"))
    if coef1 is None or coef2 is None or coef1 < 1.01 or coef2 < 1.01:
        return None

    last_seen = _to_float(fork.get("last_seen")) or time.time()
    team1 = str(fork.get("team1") or fork.get("team1_en") or s0.get("team1") or s0.get("team1_en") or "")
    team2 = str(fork.get("team2") or fork.get("team2_en") or s0.get("team2") or s0.get("team2_en") or "")
    event_name = (
        str(fork.get("event_name") or "")
        or (f"{team1} vs {team2}" if team1 and team2 else "")
        or team1
        or team2
        or str(s0.get("event_name") or f"Event #{idx}")
    )

    is_live_raw = fork.get("is_live")
    if isinstance(is_live_raw, bool):
        is_live = "1" if is_live_raw else "0"
    else:
        is_live_str = str(is_live_raw or "0").strip().lower()
        is_live = "0" if is_live_str in {"0", "", "false", "no", "prematch"} else "1"

    match_key = str(fork.get("match_key") or "")
    reported_profit = _to_float(fork.get("profit")) or 0.0
    stake_types = str(fork.get("stakes") or fork.get("stake_types") or "")
    selections = [part.strip() for part in stake_types.split(";") if part.strip()]
    parsed_odds = [
        _to_float(raw)
        for raw in (odds if isinstance(odds, list) else [])
    ]
    legs = []
    for leg_idx in range(min(len(selections), len(sources), len(parsed_odds))):
        source = sources[leg_idx]
        if not isinstance(source, dict):
            break
        legs.append({
            "index": leg_idx,
            "selection": selections[leg_idx],
            "odds": parsed_odds[leg_idx],
            "bk": str(source.get("bk") or source.get("bookmaker") or ""),
            "bk_label": str(source.get("bk_label") or source.get("bk") or source.get("bookmaker") or ""),
            "link": str(source.get("bet_link") or source.get("mobl") or ""),
            "event_name": str(source.get("event_name") or source.get("event_bk") or ""),
        })
    multi_leg_complete = (
        len(selections) >= 2
        and len(selections) == len(sources) == len(parsed_odds) == len(legs)
        and all(leg["bk"] and leg["odds"] is not None and leg["odds"] >= 1.01 for leg in legs)
    )
    if reported_profit <= 0.0 and len(legs) == 2:
        calculated_profit = (1.0 / (1.0 / coef1 + 1.0 / coef2) - 1.0) * 100.0
        if calculated_profit < 0.0:
            reported_profit = calculated_profit

    return {
        "fork_timestamp": _iso_z(last_seen),
        "timestamp": _iso_z(last_seen),
        "updated_at": last_seen,
        "sport": str(fork.get("sport") or ""),
        "profit": reported_profit,
        "odds1": coef1,
        "odds2": coef2,
        "bk1": bk1,
        "bk2": bk2,
        "event_name": event_name,
        "stake_types": stake_types,
        "legs": legs,
        "multi_leg_complete": multi_leg_complete,
        "outcome_count": len(selections),
        "source_count": len(sources),
        "odds_count": len(parsed_odds),
        "market_code": str(fork.get("market_code") or ""),
        "bk1_link": str(s0.get("bet_link") or s0.get("mobl") or ""),
        "bk2_link": str(s1.get("bet_link") or s1.get("mobl") or ""),
        "event_id": fork.get("inf_event_id") or fork.get("event_id") or _stable_event_id(match_key),
        "is_live": is_live,
        "score": fork.get("score") or "",
        "event_dt": fork.get("event_dt") or "",
        "server": fork.get("server") or "",
        "match_key": match_key,
        "team1": team1,
        "team2": team2,
        "team1_en": fork.get("team1_en") or s0.get("team1_en") or "",
        "team2_en": fork.get("team2_en") or s0.get("team2_en") or "",
        "bk1_event_name": s0.get("event_name") or s0.get("event_bk") or "",
        "bk2_event_name": s1.get("event_name") or s1.get("event_bk") or "",
        "overvalue": fork.get("overvalue") or fork.get("ov_array") or [],
        "alt_count": fork.get("alt_count"),
        "market_name": fork.get("market_name"),
        "market_hint": fork.get("market_hint"),
        "clone_count": fork.get("clone_count"),
        "match_time": fork.get("match_time") or "",
        "sport_id": fork.get("sport_id"),
        "inf_event_id": fork.get("inf_event_id"),
        "set_number": fork.get("set_number"),
        "game_number": fork.get("game_number"),
        "time_to_start_estimate_secs": fork.get("time_to_start_estimate_secs"),
    }


def _upstream_request(url: str) -> urllib.request.Request:
    req = urllib.request.Request(url)
    if UPSTREAM_TOKEN:
        req.add_header("Authorization", f"Bearer {UPSTREAM_TOKEN}")
    return req


def _fetch_http_state() -> dict[str, Any]:
    with urllib.request.urlopen(_upstream_request(f"{UPSTREAM_URL}/api/state"), timeout=UPSTREAM_TIMEOUT) as resp:
        payload = json.loads(resp.read())
    if not isinstance(payload, dict):
        raise ValueError("upstream /api/state must return an object")
    return payload


def _decode_sse_payload(data: str, gzip_chunked: bool) -> dict[str, Any] | None:
    if gzip_chunked:
        raw = gzip.decompress(base64.b64decode(data)).decode("utf-8", "replace")
    else:
        raw = data
    payload = json.loads(raw)
    return payload if isinstance(payload, dict) else None


def _fetch_sse_state() -> dict[str, Any]:
    req = _upstream_request(f"{UPSTREAM_URL}/stream/forks")
    req.add_header("Accept", "text/event-stream")
    with urllib.request.urlopen(req, timeout=UPSTREAM_TIMEOUT) as resp:
        gzip_chunked = resp.headers.get("Content-Encoding") == "x-sse-gzip-chunked"
        event_type = "message"
        data_lines: list[str] = []
        deadline = time.time() + UPSTREAM_TIMEOUT
        while time.time() < deadline:
            line = resp.readline()
            if not line:
                break
            text = line.decode("utf-8", "replace").rstrip("\r\n")
            if text == "":
                if event_type == "state" and data_lines:
                    decoded = _decode_sse_payload("\n".join(data_lines), gzip_chunked)
                    if decoded is not None:
                        return decoded
                event_type = "message"
                data_lines = []
                continue
            if text.startswith("event:"):
                event_type = text.split(":", 1)[1].strip()
            elif text.startswith("data:"):
                data_lines.append(text.split(":", 1)[1].lstrip())
    raise RuntimeError("no state event from SSE")


def _fetch_upstream_state() -> dict[str, Any]:
    try:
        return _fetch_http_state()
    except urllib.error.HTTPError as exc:
        if exc.code not in {404, 405}:
            raise
    return _fetch_sse_state()


def _matches_feed_key(candidate: str | None) -> bool:
    if not candidate:
        return False
    value = candidate.strip()
    if not value:
        return False
    matched = False
    for configured in FEED_KEYS:
        matched = secrets.compare_digest(value, configured) or matched
    return matched


def _extract_bearer(header_value: str | None) -> str | None:
    if not header_value:
        return None
    scheme, _, token = header_value.partition(" ")
    if scheme.lower() != "bearer":
        return None
    return token.strip() or None


def _is_direct_loopback(handler: BaseHTTPRequestHandler) -> bool:
    client_host = handler.client_address[0] if handler.client_address else ""
    return (
        client_host in {"127.0.0.1", "::1", "localhost"}
        and not handler.headers.get("X-Forwarded-For")
        and not handler.headers.get("X-Real-IP")
    )


def _has_feed_access(handler: BaseHTTPRequestHandler, parsed) -> bool:
    if _is_direct_loopback(handler):
        return True
    if not FEED_KEYS:
        return False
    qs = parse_qs(parsed.query)
    candidates = [
        handler.headers.get("X-Forted-Key"),
        handler.headers.get("X-Feed-Key"),
        _extract_bearer(handler.headers.get("Authorization")),
        qs.get("key", [""])[0],
        qs.get("token", [""])[0],
    ]
    return any(_matches_feed_key(candidate) for candidate in candidates)


def _feed_snapshot() -> list[dict[str, Any]]:
    global _feed_cache_items, _feed_cache_until

    now = time.time()
    with _feed_cache_lock:
        if FEED_CACHE_TTL > 0 and now < _feed_cache_until:
            return list(_feed_cache_items)

        try:
            state = _fetch_upstream_state()
        except Exception:
            if _feed_cache_items:
                log.warning(
                    "Upstream %s unavailable; serving stale feed cache items=%d",
                    UPSTREAM_URL,
                    len(_feed_cache_items),
                )
                return list(_feed_cache_items)
            raise
        forks_in = state.get("forks") or []
        bk_status = state.get("bk_status") if isinstance(state.get("bk_status"), dict) else {}
        out: list[dict[str, Any]] = []
        for idx, fork in enumerate(forks_in):
            if not isinstance(fork, dict):
                continue
            item = _state_fork_to_snapshot_item(fork, idx)
            if item is None:
                continue
            if bk_status:
                bk1 = str(item.get("bk1") or "")
                bk2 = str(item.get("bk2") or "")
                item["bk1_online"] = bk_status.get(bk1)
                item["bk2_online"] = bk_status.get(bk2)
            out.append(item)

        _feed_cache_items = out
        _feed_cache_until = time.time() + FEED_CACHE_TTL
        return list(out)


def _accepts_gzip(header_value: str | None) -> bool:
    if not header_value:
        return False
    return any(
        token.strip().split(";", 1)[0].lower() == "gzip"
        for token in header_value.split(",")
    )


def _wants_sse_gzip(handler: BaseHTTPRequestHandler) -> bool:
    opt_in = handler.headers.get("X-Forted-SSE-Gzip", "").strip().lower()
    return opt_in in {"1", "true", "yes"} and _accepts_gzip(handler.headers.get("Accept-Encoding"))


def _filtered_feed_snapshot(min_profit: float | None, online_only: bool) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in _feed_snapshot():
        if min_profit is not None:
            profit = _to_float(item.get("profit"))
            if profit is None or profit < min_profit:
                continue
        if online_only and (item.get("bk1_online") is False or item.get("bk2_online") is False):
            continue
        out.append(item)
    return out


class FeedHandler(BaseHTTPRequestHandler):
    server_version = "FortedFeedShim/1.0"

    def log_message(self, format: str, *args) -> None:  # noqa: A002
        return

    def _send_json(self, status: int, body: Any) -> None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _stream_forks(self) -> None:
        req = _upstream_request(f"{UPSTREAM_URL}/stream/forks")
        req.add_header("Accept", "text/event-stream")
        if _wants_sse_gzip(self):
            req.add_header("Accept-Encoding", "gzip")

        try:
            with urllib.request.urlopen(req, timeout=UPSTREAM_STREAM_TIMEOUT) as resp:
                content_encoding = resp.headers.get("Content-Encoding", "")
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "keep-alive")
                self.send_header("X-Accel-Buffering", "no")
                if content_encoding:
                    self.send_header("Content-Encoding", content_encoding)
                self.end_headers()

                while True:
                    line = resp.readline()
                    if not line:
                        break
                    self.wfile.write(line)
                    self.wfile.flush()
        except urllib.error.HTTPError as exc:
            if not self.wfile.closed:
                self._send_json(exc.code, {"error": "upstream_http_error", "detail": str(exc)})
        except urllib.error.URLError as exc:
            if not self.wfile.closed:
                self._send_json(502, {"error": "upstream_unreachable", "detail": str(exc)})
        except (BrokenPipeError, ConnectionResetError, OSError):
            return

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/health":
            self._send_json(
                200,
                {
                    "status": "ok",
                    "time": time.time(),
                    "upstream": UPSTREAM_URL,
                    "stream_path": "/stream/forks",
                    "snapshot_path": "/api/forks/feed",
                    "snapshot_contract": "raw_by_default; use min_profit=0 and online=1 for executable-only snapshots",
                    "feed_auth_required": bool(FEED_KEYS),
                    "feed_auth_keys_configured": len(FEED_KEYS),
                    "cache_ttl_sec": FEED_CACHE_TTL,
                    "cache_items": len(_feed_cache_items),
                },
            )
            return
        if path == "/stream/forks":
            if not _has_feed_access(self, parsed):
                self._send_json(401, {"error": "unauthorized"})
                return
            self._stream_forks()
            return
        if path == "/api/forks/feed":
            if not _has_feed_access(self, parsed):
                self._send_json(401, {"error": "unauthorized"})
                return
            qs = parse_qs(parsed.query)
            try:
                limit = max(1, min(int(qs.get("limit", [str(SNAPSHOT_LIMIT)])[0]), 1000))
            except ValueError:
                limit = SNAPSHOT_LIMIT
            min_profit = None
            if qs.get("min_profit", [""])[0] not in {"", None}:
                min_profit = _to_float(qs.get("min_profit", [""])[0])
            online_only = qs.get("online", [""])[0].strip().lower() in {"1", "true", "yes"}
            try:
                out = _filtered_feed_snapshot(min_profit, online_only)
            except urllib.error.URLError as exc:
                log.warning("Upstream %s unreachable: %s", UPSTREAM_URL, exc)
                self._send_json(502, {"error": "upstream_unreachable", "detail": str(exc)})
                return
            except Exception as exc:
                log.exception("Upstream fetch failed")
                self._send_json(502, {"error": "upstream_error", "detail": str(exc)})
                return
            self._send_json(200, out[:limit])
            return
        self._send_json(404, {"error": "not_found", "path": path})


def main() -> None:
    log.info(
        "Forted feed shim listening on %s:%d -> upstream %s (token=%s)",
        FEED_BIND,
        FEED_PORT,
        UPSTREAM_URL,
        "yes" if UPSTREAM_TOKEN else "NO",
    )
    log.info(
        "Forted feed auth: keys=%d, cache_ttl=%.3fs",
        len(FEED_KEYS),
        FEED_CACHE_TTL,
    )
    httpd = ThreadingHTTPServer((FEED_BIND, FEED_PORT), FeedHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
