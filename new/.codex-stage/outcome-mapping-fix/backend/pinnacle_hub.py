"""Client for the pin888 fan-out hub (runs on the Mac, reached via the reverse
SSH tunnel at dev:19100).

Uses HTTP request/response (no per-call WebSocket handshake) to avoid the
connection churn that previously caused handshake resets:
  - get_status()              — hub/WS health (alive + uptime hours per sport)
  - get_snapshot(slug)        — latest FULL_ODDS frame for one sport (raw)
  - get_more_bets(event_id)   — on-demand MORE_BET specials for one match
  - stream(on_frame, ...)     — ONE persistent WS for the live feed (optional)

Frame envelope (stream / snapshot):
  {"t":"frame"|"snapshot","sport":29,"slug":"soccer","scope":"live"|"prematch",
   "op":1,"ts":<ms>,"data":"<raw pin888 frame>"}
  - scope="live"     → live + moving-line updates (mk=1 tab)
  - scope="prematch" → early/prematch listing (mk=0 tab) — separate per-sport tab
  ⚠️ In the raw `data` (pin888): l=live, n=prematch, u=update frames. A parser MUST
     read `n` to get prematch — reading only l/u loses prematch (proven 2026-06-01).

MORE_BET is rate-limited to 1 req/s PER ACCOUNT on the hub (extra requests queue,
PROMOTED priority — Story 27.5). Event ids appear as trailing 1631xxxxxx numbers.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import threading
import time
import urllib.parse
import urllib.request
from difflib import SequenceMatcher
from typing import Any

from websockets.asyncio.client import connect

from pinnacle_arcadia import parse_raw_selection

HUB_HTTP = os.getenv("PIN888_HUB_HTTP", "http://127.0.0.1:19100")
HUB_WS = os.getenv("PIN888_HUB_WS", "ws://127.0.0.1:19100")
SPORTS = {
    "soccer": 29,
    "tennis": 33,
    "basketball": 4,
    "hockey": 19,
    "volleyball": 34,
    "e-sports": 12,
}
_ID2SLUG = {v: k for k, v in SPORTS.items()}
SNAPSHOT_CACHE_TTL = float(os.getenv("PIN888_SNAPSHOT_CACHE_TTL", "1.0"))
MORE_BET_CACHE_TTL = float(os.getenv("PIN888_MORE_BET_CACHE_TTL", "8.0"))
STREAM_STATE_MAX_AGE_SEC = float(os.getenv("PIN888_STREAM_STATE_MAX_AGE_SEC", "15.0"))
STRUCTURAL_LINE_EPSILON = 1e-6

_snapshot_cache_lock = threading.Lock()
_snapshot_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_more_bet_cache_lock = threading.Lock()
_more_bet_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_stream_state_lock = threading.Lock()
_stream_rows_by_slug: dict[str, dict[tuple[Any, ...], list[Any]]] = {}
_stream_meta_by_slug: dict[str, dict[str, Any]] = {}
_stream_updated_at: dict[str, float] = {}


def _get(path: str, timeout: float) -> dict:
    with urllib.request.urlopen(HUB_HTTP + path, timeout=timeout) as r:
        return json.loads(r.read())


def get_status(timeout: float = 5.0) -> dict:
    """Hub health: per-sport alive + uptime_h, consumer count. Sync (HTTP)."""
    return _get("/health", timeout)


async def get_snapshot(slug: str = "soccer", timeout: float = 6.0) -> dict:
    """Latest cached FULL_ODDS frame for a sport (raw). HTTP, no WS."""
    q = urllib.parse.urlencode({"sport": slug})
    return await asyncio.to_thread(_get, f"/snapshot?{q}", timeout)


async def get_sport(slug: str | None = None, sport: int | None = None, **_) -> dict:
    """Alias for get_snapshot (accepts slug or numeric sport id)."""
    return await get_snapshot(slug or _ID2SLUG.get(sport, "soccer"))


async def get_cached_snapshot(slug: str = "soccer", timeout: float = 3.0) -> dict:
    """Latest hub snapshot with a tiny local TTL.

    This still reads the hub's stream cache, not Pinnacle's rate-limited
    per-bet/per-more-bet endpoint.
    """
    now = time.time()
    with _snapshot_cache_lock:
        cached = _snapshot_cache.get(slug)
        if cached and now - cached[0] <= SNAPSHOT_CACHE_TTL:
            return cached[1]
    snapshot = await get_snapshot(slug, timeout=timeout)
    with _snapshot_cache_lock:
        _snapshot_cache[slug] = (time.time(), snapshot)
    return snapshot


async def get_more_bets(event_id, timeout: float = 12.0) -> dict:
    """Request MORE_BET specials for one match over HTTP (no WS handshake).
    Returns {"ok":bool,"event_id":str,"data":<raw frame>|absent,"error":...}."""
    q = urllib.parse.urlencode({"event_id": str(event_id)})
    try:
        return await asyncio.to_thread(_get, f"/more_bet?{q}", timeout)
    except Exception as e:
        return {"ok": False, "error": repr(e), "event_id": str(event_id)}


async def get_cached_more_bets(event_id, timeout: float = 12.0) -> dict:
    """Short local cache for MORE_BET boards.

    The hub already serializes/rate-limits MORE_BET requests, but the RobinArb
    UI can ask the same selection repeatedly. Cache the board briefly so one
    fork verification does not enqueue multiple identical pin888 requests.
    """
    key = str(event_id or "").strip()
    if not key:
        return {"ok": False, "error": "missing_event_id", "event_id": key}
    now = time.time()
    with _more_bet_cache_lock:
        cached = _more_bet_cache.get(key)
        if cached and now - cached[0] <= MORE_BET_CACHE_TTL:
            body = dict(cached[1])
            body["cached"] = True
            body["cache_age_sec"] = round(now - cached[0], 3)
            return body
    board = await get_more_bets(key, timeout=timeout)
    if board.get("ok"):
        with _more_bet_cache_lock:
            _more_bet_cache[key] = (time.time(), dict(board))
    return board


def sport_slug_for_label(label: str) -> str | None:
    s = (label or "").strip().lower()
    base = s.split(" - ", 1)[0].strip()
    if base in {"футбол", "soccer", "football"} or "soccer" in s or "футбол" in s:
        return "soccer"
    if base in {"теннис", "tennis"} or "tennis" in s or "теннис" in s:
        return "tennis"
    if base in {"баскетбол", "баскет", "basketball"} or "basket" in s or "баскет" in s:
        return "basketball"
    if base in {"хоккей", "hockey", "ice hockey", "ice-hockey"} or "hockey" in s or "хоккей" in s:
        return "hockey"
    if base in {"волейбол", "volleyball", "volley"} or "volley" in s or "волейбол" in s:
        return "volleyball"
    if base in {"esports", "e-sports", "киберспорт", "cybersport"} or "esport" in s or "кибер" in s:
        return "e-sports"
    return None


def _to_float(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed == parsed else None


def _to_int(value: Any) -> int | None:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _american_to_decimal(price: Any) -> float | None:
    p = _to_float(price)
    if p is None or p == 0:
        return None
    if p >= 100:
        return round(p / 100.0 + 1.0, 4)
    if p <= -100:
        return round(100.0 / abs(p) + 1.0, 4)
    return None


def _decimal_from_stream_row(row: list[Any]) -> float | None:
    if len(row) < 6:
        return None
    american = _american_to_decimal(row[4])
    if american is not None:
        return american
    shown = _to_float(row[5])
    if shown is None:
        return None
    # FULL_ODDS uses decimal strings for 1X2 and HK-style strings for asian
    # lines. The American price above is preferred when present.
    decimal = shown if shown >= 1.01 else shown + 1.0
    return round(decimal, 4) if decimal >= 1.01 else None


def _frame_payload(snapshot: dict[str, Any]) -> dict[str, Any] | None:
    data = snapshot.get("data")
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError:
            return None
    return data if isinstance(data, dict) else None


def _looks_like_stream_row(value: Any) -> bool:
    return (
        isinstance(value, list)
        and len(value) >= 13
        and _to_int(value[0]) is not None
        and _to_int(value[1]) is not None
        and _to_int(value[-1]) is not None
    )


def _walk_stream_rows(value: Any):
    if _looks_like_stream_row(value):
        yield value
        return
    if isinstance(value, list):
        for item in value:
            yield from _walk_stream_rows(item)


def _snapshot_rows(snapshot: dict[str, Any]) -> list[list[Any]]:
    payload = _frame_payload(snapshot)
    if not payload:
        return []
    odds = payload.get("odds") if isinstance(payload.get("odds"), dict) else {}
    # FULL_ODDS boards can contain several successive copies of the same
    # market coordinate with new ids/prices.  Lists are chronological, while
    # ``u`` contains updates and must win over the live/prematch baselines.
    # Keeping every copy makes lookup return the oldest matching quote.
    latest: dict[tuple[Any, ...], list[Any]] = {}
    for key in ("l", "n", "u"):
        for row in _walk_stream_rows(odds.get(key)):
            latest[_stream_row_key(row)] = row
    return list(latest.values())


def _stream_row_key(row: list[Any]) -> tuple[Any, ...]:
    line = _to_float(row[3] if len(row) > 3 else None)
    line_key = round(line, 4) if line is not None else None
    return (
        _row_event_id(row),
        _to_int(row[0] if len(row) > 0 else None),
        _to_int(row[1] if len(row) > 1 else None),
        _to_int(row[2] if len(row) > 2 else None),
        line_key,
    )


def _stream_frame_refreshes_all(frame: dict[str, Any]) -> bool:
    payload = _frame_payload(frame) or {}
    odds = payload.get("odds") if isinstance(payload.get("odds"), dict) else {}
    return bool(odds.get("refreshAll") or payload.get("refreshAll") or frame.get("t") == "snapshot")


def _stream_frame_source_time(frame: dict[str, Any]) -> float | None:
    ts = _to_float(frame.get("ts"))
    if ts is None:
        return None
    if ts > 1_000_000_000_000:
        return ts / 1000.0
    if ts > 1_000_000_000:
        return ts
    return None


def _stream_frame_age_sec(frame: dict[str, Any], *, now: float | None = None) -> float | None:
    source_time = _stream_frame_source_time(frame)
    if source_time is None:
        return None
    current = time.time() if now is None else now
    return max(0.0, current - source_time)


def _stream_frame_updated_at(frame: dict[str, Any]) -> float:
    source_time = _stream_frame_source_time(frame)
    now = time.time()
    if source_time is None or source_time > now + 60.0:
        return now
    return source_time


def apply_stream_frame(frame: dict[str, Any]) -> int:
    """Merge one pin888 frame into a local accumulated row cache."""
    slug = str(frame.get("slug") or _ID2SLUG.get(_to_int(frame.get("sport")) or -1) or "").strip()
    if not slug:
        return 0
    rows = _snapshot_rows(frame)
    if not rows:
        return 0
    refresh_all = _stream_frame_refreshes_all(frame)
    with _stream_state_lock:
        state = _stream_rows_by_slug.setdefault(slug, {})
        if refresh_all:
            state.clear()
        for row in rows:
            state[_stream_row_key(row)] = list(row)
        _stream_meta_by_slug[slug] = {
            "t": "state",
            "sport": frame.get("sport"),
            "slug": slug,
            "scope": frame.get("scope"),
            "mk": frame.get("mk"),
            "op": frame.get("op"),
            "ts": frame.get("ts"),
        }
        _stream_updated_at[slug] = _stream_frame_updated_at(frame)
    return len(rows)


def clear_stream_cache() -> None:
    with _stream_state_lock:
        _stream_rows_by_slug.clear()
        _stream_meta_by_slug.clear()
        _stream_updated_at.clear()


def accumulated_stream_snapshot(slug: str) -> tuple[dict[str, Any], list[list[Any]], float] | None:
    with _stream_state_lock:
        state = _stream_rows_by_slug.get(slug)
        if not state:
            return None
        meta = dict(_stream_meta_by_slug.get(slug) or {"t": "state", "slug": slug})
        age = time.time() - float(_stream_updated_at.get(slug) or 0)
        return meta, [list(row) for row in state.values()], age


def stream_cache_status() -> dict[str, Any]:
    now = time.time()
    with _stream_state_lock:
        return {
            "sports": {
                slug: {
                    "rows": len(rows),
                    "age_sec": round(now - float(_stream_updated_at.get(slug) or 0), 3),
                    "meta": dict(_stream_meta_by_slug.get(slug) or {}),
                }
                for slug, rows in sorted(_stream_rows_by_slug.items())
            }
        }


def _row_event_id(row: list[Any]) -> str:
    event_id = _to_int(row[-1])
    return str(event_id) if event_id else ""


def _row_ids(row: list[Any]) -> set[str]:
    ids: set[str] = set()
    for idx in (6, 7):
        if len(row) > idx and row[idx] not in (None, "", 0, "0"):
            ids.add(str(row[idx]).strip())
    return ids


def _row_is_open(row: list[Any]) -> bool:
    return len(row) <= 10 or str(row[10] or "").upper() in {"", "O", "OPEN"}


def _line_matches(row_line: Any, want_line: Any) -> bool:
    if want_line is None:
        return True
    row_value = _to_float(row_line)
    want_value = _to_float(want_line)
    if row_value is None or want_value is None:
        return False
    return abs(abs(row_value) - abs(want_value)) <= STRUCTURAL_LINE_EPSILON


def _signed_line_matches(row_line: Any, want_line: Any) -> bool:
    """Match a selection's own handicap, preserving its sign.

    Opposing spread runners use opposite signs in FULL_ODDS.  Ignoring the
    sign here lets an Away +1.5 request bind to Away -1.5 when both alternate
    lines are present, which returns the price for a different bet.
    """
    row_value = _to_float(row_line)
    want_value = _to_float(want_line)
    if row_value is None or want_value is None:
        return False
    return abs(row_value - want_value) <= STRUCTURAL_LINE_EPSILON


def _moneyline_code_for(designation: str | None, event_rows: list[list[Any]], period: int) -> int | None:
    designation = (designation or "").lower()
    if designation == "home":
        return 0
    codes = {
        _to_int(row[2])
        for row in event_rows
        if _to_int(row[0]) == period and _to_int(row[1]) == 1
    }
    has_draw = 2 in codes
    if designation == "draw":
        return 1 if has_draw else None
    if designation == "away":
        return 2 if has_draw else 1
    return None


def _row_matches_parsed(row: list[Any], parsed: dict[str, Any], event_rows: list[list[Any]]) -> bool:
    if not _row_is_open(row) or _decimal_from_stream_row(row) is None:
        return False
    period = _to_int(parsed.get("period")) or 0
    if _to_int(row[0]) != period:
        return False
    market_code = _to_int(row[1])
    designation_code = _to_int(row[2])
    market_type = parsed.get("market_type")
    designation = parsed.get("designation")
    side = parsed.get("side")
    line = parsed.get("line")

    if market_type == "moneyline":
        return market_code == 1 and designation_code == _moneyline_code_for(designation, event_rows, period)
    if market_type == "spread":
        want_code = 0 if side == "home" else 1 if side == "away" else None
        return market_code == 2 and designation_code == want_code and _signed_line_matches(row[3], line)
    if market_type == "total":
        want_code = 3 if designation == "over" else 4 if designation == "under" else None
        return market_code == 3 and designation_code == want_code and _line_matches(row[3], line)
    if market_type == "team_total":
        if side == "home":
            want_market, over_code, under_code = 4, 5, 6
        elif side == "away":
            want_market, over_code, under_code = 5, 7, 8
        else:
            return False
        want_code = over_code if designation == "over" else under_code if designation == "under" else None
        return market_code == want_market and designation_code == want_code and _line_matches(row[3], line)
    return False


def _fallback_parsed_selection(selection: str, outcome: str, market: str) -> dict[str, Any]:
    parsed = parse_raw_selection(selection or "")
    if parsed.get("market_type") and not parsed.get("_unknown"):
        return parsed
    # An explicit but unsupported Forted selection must stay unsupported.
    # Falling back to the generic outcome here can turn e.g. "К1 пройдёт"
    # (team to qualify) into the regular match moneyline for team 1.
    if str(selection or "").strip() and parsed.get("_unknown"):
        return parsed

    outcome_l = (outcome or "").strip().lower()
    market_l = (market or "").strip().lower()
    if outcome_l in {"win1", "1", "home"}:
        return {"market_type": "moneyline", "designation": "home", "side": None, "line": None, "period": 0}
    if outcome_l in {"win2", "2", "away"}:
        return {"market_type": "moneyline", "designation": "away", "side": None, "line": None, "period": 0}
    if outcome_l in {"winnone", "x", "draw"}:
        return {"market_type": "moneyline", "designation": "draw", "side": None, "line": None, "period": 0}
    if market_l in {"moneyline", "1x2", "match winner"}:
        return {"market_type": "moneyline", "designation": "home", "side": None, "line": None, "period": 0}
    return parsed


def _reverse_parsed_teams(parsed: dict[str, Any]) -> dict[str, Any]:
    reversed_parsed = dict(parsed)
    side = str(reversed_parsed.get("side") or "").lower()
    if side == "home":
        reversed_parsed["side"] = "away"
    elif side == "away":
        reversed_parsed["side"] = "home"
    designation = str(reversed_parsed.get("designation") or "").lower()
    if designation == "home":
        reversed_parsed["designation"] = "away"
    elif designation == "away":
        reversed_parsed["designation"] = "home"
    return reversed_parsed


def _same_stream_market_group(row: list[Any], candidate: list[Any]) -> bool:
    """Return whether two runners belong to the same exact market pair.

    Alternate spreads can have the same absolute handicap, so period, market
    and absolute line are not enough. Prefer the feed's shared line/odds IDs;
    when IDs are unavailable, require the structurally mirrored signed lines.
    """
    if not _row_is_open(candidate):
        return False
    market_code = _to_int(row[1])
    if _to_int(candidate[0]) != _to_int(row[0]) or _to_int(candidate[1]) != market_code:
        return False
    if market_code == 1:
        return True
    if not _line_matches(candidate[3], row[3]):
        return False

    row_ids = _row_ids(row)
    candidate_ids = _row_ids(candidate)
    if row_ids and candidate_ids:
        return bool(row_ids & candidate_ids)

    row_line = _to_float(row[3])
    candidate_line = _to_float(candidate[3])
    if row_line is None or candidate_line is None:
        return False
    if market_code == 2:
        same_runner = _to_int(candidate[2]) == _to_int(row[2])
        return (
            _signed_line_matches(candidate_line, row_line)
            if same_runner
            else abs(candidate_line + row_line) <= STRUCTURAL_LINE_EPSILON
        )
    return _signed_line_matches(candidate_line, row_line)


def _row_group_signature(row: list[Any], event_rows: list[list[Any]]) -> str:
    rows = _stream_group_rows(row, event_rows)
    if not rows:
        rows = [row]
    parts = []
    for candidate in rows:
        decimal = _decimal_from_stream_row(candidate)
        if decimal is None:
            continue
        parts.append((
            _to_int(candidate[0]),
            _to_int(candidate[1]),
            _to_int(candidate[2]),
            _to_float(candidate[3]),
            round(decimal, 6),
            str(candidate[10] if len(candidate) > 10 else ""),
        ))
    return json.dumps(sorted(parts), separators=(",", ":"), ensure_ascii=True)


def _stream_group_rows(row: list[Any], event_rows: list[list[Any]]) -> list[list[Any]]:
    return [candidate for candidate in event_rows if _same_stream_market_group(row, candidate)]


def _stream_market_margin(row: list[Any], event_rows: list[list[Any]]) -> dict[str, Any] | None:
    market_code = _to_int(row[1])
    selected_code = _to_int(row[2])
    grouped_rows = _stream_group_rows(row, event_rows)
    if not grouped_rows:
        return None

    if market_code == 1:
        expected_codes = {
            _to_int(candidate[2])
            for candidate in grouped_rows
            if _decimal_from_stream_row(candidate) is not None
        }
        expected_codes.discard(None)
    else:
        expected_codes = {
            2: {0, 1},   # spread
            3: {3, 4},   # total
            4: {5, 6},   # team 1 total
            5: {7, 8},   # team 2 total
        }.get(market_code, set())
    if not expected_codes or selected_code not in expected_codes:
        return None

    by_code: dict[int, list[Any]] = {}
    selected_ids = _row_ids(row)
    for candidate in grouped_rows:
        code = _to_int(candidate[2])
        if code not in expected_codes:
            continue
        decimal = _decimal_from_stream_row(candidate)
        if decimal is None:
            continue
        current = by_code.get(code)
        if current is None:
            by_code[code] = candidate
            continue
        if code == selected_code and selected_ids and selected_ids & _row_ids(candidate):
            by_code[code] = candidate

    if market_code == 1:
        if len(by_code) < 2:
            return None
    elif set(by_code) != expected_codes:
        return None

    outcomes = []
    for code in sorted(by_code):
        candidate = by_code[code]
        decimal = _decimal_from_stream_row(candidate)
        if decimal is None:
            return None
        outcomes.append({
            "designation_code": code,
            "decimal_odds": decimal,
            "line_id": str(candidate[6]).strip() if len(candidate) > 6 and candidate[6] not in (None, "") else None,
            "odds_id": str(candidate[7]).strip() if len(candidate) > 7 and candidate[7] not in (None, "") else None,
            "points": _to_float(candidate[3]),
        })
    margin = sum(1.0 / item["decimal_odds"] for item in outcomes) - 1.0
    return {
        "market_margin": margin,
        "market_outcomes": outcomes,
        "market_margin_source": "pinnacle-stream",
    }


def _row_result(row: list[Any], snapshot: dict[str, Any], slug: str, event_rows: list[list[Any]] | None = None) -> dict[str, Any] | None:
    decimal = _decimal_from_stream_row(row)
    if decimal is None:
        return None
    row_event_id = _row_event_id(row)
    grouped_rows = event_rows or [row]
    result = {
        "source": "pinnacle-stream",
        "slug": slug,
        "decimal_odds": decimal,
        "american_price": row[4] if len(row) > 4 else None,
        "hk_or_decimal": row[5] if len(row) > 5 else None,
        "line_id": str(row[6]).strip() if len(row) > 6 and row[6] not in (None, "") else None,
        "odds_id": str(row[7]).strip() if len(row) > 7 and row[7] not in (None, "") else None,
        "period": _to_int(row[0]),
        "market_code": _to_int(row[1]),
        "designation_code": _to_int(row[2]),
        "points": _to_float(row[3]),
        "event_id": row_event_id or None,
        "market_signature": _row_group_signature(row, grouped_rows),
        "snapshot_ts": snapshot.get("ts"),
        "status": row[10] if len(row) > 10 else None,
    }
    margin = _stream_market_margin(row, grouped_rows)
    if margin:
        result.update(margin)
    return result


def _more_bet_payload(data: Any) -> dict[str, Any] | None:
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError:
            return None
    return data if isinstance(data, dict) else None


def _looks_like_more_bet_event(value: Any) -> bool:
    return (
        isinstance(value, list)
        and len(value) >= 9
        and _to_int(value[0]) is not None
        and isinstance(value[1] if len(value) > 1 else None, str)
        and isinstance(value[2] if len(value) > 2 else None, str)
        and any(isinstance(cell, dict) for cell in value)
    )


def _walk_more_bet_events(value: Any):
    if _looks_like_more_bet_event(value):
        yield value
        return
    if isinstance(value, list):
        for item in value:
            yield from _walk_more_bet_events(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from _walk_more_bet_events(item)


_MORE_BET_CONTEXT_PATTERNS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("corners", ("corner", "corners")),
    ("bookings", ("booking", "bookings", "card", "cards")),
)


def _more_bet_event_context(event_dict: dict[str, Any]) -> str:
    text = f"{event_dict.get('home') or ''} {event_dict.get('away') or ''}".lower()
    for context, patterns in _MORE_BET_CONTEXT_PATTERNS:
        if any(pattern in text for pattern in patterns):
            return context
    return ""


def _more_bet_context_matches(actual: str, desired: str) -> bool:
    actual = str(actual or "").strip().lower()
    desired = str(desired or "").strip().lower()
    if not desired:
        return not actual
    if desired in {"cards", "bookings"}:
        return actual in {"cards", "bookings"}
    return actual == desired


def _more_bet_event_from_raw(raw_event: list[Any], *, league_id: Any = None) -> dict[str, Any]:
    return {
        "raw": raw_event,
        "league_id": league_id,
        "home": raw_event[1] if len(raw_event) > 1 else "",
        "away": raw_event[2] if len(raw_event) > 2 else "",
    }


def _more_bet_event(data: Any, event_id: str | int | None, market_context: str = "") -> dict[str, Any] | None:
    payload = _more_bet_payload(data)
    if not payload:
        return None
    odds = payload.get("odds") if isinstance(payload.get("odds"), dict) else {}
    event_key = str(event_id or "").strip()
    desired_context = str(market_context or "").strip().lower()
    fallback_parent: dict[str, Any] | None = None
    candidates: list[dict[str, Any]] = []
    for raw_event in _walk_more_bet_events([
        odds.get("e"),
        odds.get("e1"),
        odds.get("ce"),
        odds.get("ce1"),
    ]):
        raw_id = str(raw_event[0]).strip()
        event = _more_bet_event_from_raw(raw_event)
        context = _more_bet_event_context(event)
        event["market_context"] = context
        if event_key and raw_id == event_key:
            fallback_parent = event
        if desired_context:
            if _more_bet_context_matches(context, desired_context):
                candidates.append(event)
        elif event_key and raw_id == event_key:
            return event
    if desired_context and candidates:
        candidates.sort(key=lambda item: 0 if str(item["raw"][0]).strip() != event_key else 1)
        return candidates[0]
    if desired_context:
        return None
    return fallback_parent


def _more_bet_periods(event_dict: dict[str, Any]) -> dict[str, Any]:
    raw = event_dict.get("raw") or []
    if not isinstance(raw, list):
        return {}
    for cell in raw:
        if isinstance(cell, dict):
            return cell
    return {}


def _approx_eq(a: Any, b: Any, tol: float = STRUCTURAL_LINE_EPSILON) -> bool:
    fa = _to_float(a)
    fb = _to_float(b)
    return fa is not None and fb is not None and abs(fa - fb) <= tol


def _more_bet_decimal(price: Any) -> float | None:
    value = _to_float(price)
    if value is None or value <= 0:
        return None
    # Older MORE_BET boards carried HK-style prices (0.862 -> 1.862), while the
    # current boards carry decimal prices directly (1.862). PS3838 betslip still
    # remains the source of truth for the final quote.
    if value > 1:
        return round(value, 4)
    return round(value + 1.0, 4)


def _ps3838_params_from_parsed(parsed: dict[str, Any]) -> dict[str, Any] | None:
    market_type = parsed.get("market_type")
    designation = parsed.get("designation")
    side = parsed.get("side")
    line = _to_float(parsed.get("line")) or 0.0
    period = _to_int(parsed.get("period")) or 0

    if market_type == "moneyline":
        team_select = {"home": 0, "away": 1, "draw": 2}.get(str(designation or "").lower())
        if team_select is None:
            return None
        return {"period": period, "bet_type": 1, "team_select": team_select, "handicap": 0.0}
    if market_type == "spread":
        team_select = 0 if side == "home" else 1 if side == "away" else None
        if team_select is None:
            return None
        return {"period": period, "bet_type": 2, "team_select": team_select, "handicap": line}
    if market_type == "total":
        team_select = 3 if designation == "over" else 4 if designation == "under" else None
        if team_select is None:
            return None
        return {"period": period, "bet_type": 3, "team_select": team_select, "handicap": line}
    if market_type == "team_total":
        if side == "home":
            team_select = 5 if designation == "over" else 0 if designation == "under" else None
            bet_type = 4
        elif side == "away":
            team_select = 7 if designation == "over" else 1 if designation == "under" else None
            bet_type = 5
        else:
            return None
        if team_select is None:
            return None
        return {"period": period, "bet_type": bet_type, "team_select": team_select, "handicap": line}
    return None


def _team_name_key(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"\b(?:fc|cf|sc|bc|bk|club|women|woman|wom|u23|u21|u20|u19)\b", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _name_share(left: Any, right: Any) -> float:
    a = _team_name_key(left)
    b = _team_name_key(right)
    if not a or not b:
        return 0.0
    ratio = SequenceMatcher(None, a, b).ratio()
    at = set(a.split())
    bt = set(b.split())
    overlap = (2 * len(at & bt) / (len(at) + len(bt))) if at and bt else 0.0
    return max(ratio, overlap)


def _effective_more_bet_params(
    event_dict: dict[str, Any],
    params: dict[str, Any],
    *,
    forted_home: str = "",
    forted_away: str = "",
) -> tuple[dict[str, Any], bool]:
    effective = dict(params)
    if not (forted_home and forted_away):
        return effective, False

    ps_home = str(event_dict.get("home") or "").strip()
    ps_away = str(event_dict.get("away") or "").strip()
    fwd = (_name_share(ps_home, forted_home) + _name_share(ps_away, forted_away)) / 2
    rev = (_name_share(ps_home, forted_away) + _name_share(ps_away, forted_home)) / 2
    if not (rev > fwd and (rev - fwd) >= 0.25):
        return effective, False

    bet_type = int(effective.get("bet_type") or 0)
    team_select = int(effective.get("team_select") or 0)
    if bet_type in (1, 2):
        if team_select == 0:
            effective["team_select"] = 1
        elif team_select == 1:
            effective["team_select"] = 0
    elif bet_type == 4:
        effective["bet_type"] = 5
        effective["team_select"] = 7 if team_select == 5 else (1 if team_select == 0 else team_select)
    elif bet_type == 5:
        effective["bet_type"] = 4
        effective["team_select"] = 5 if team_select == 7 else (0 if team_select == 1 else team_select)
    return effective, True


def _more_bet_line_result(line_id: Any, price: Any, *, is_alt: Any = 0, actual_handicap: Any = None) -> dict[str, Any] | None:
    parsed_line_id = _to_int(line_id)
    if not parsed_line_id:
        return None
    result = {
        "line_id": str(parsed_line_id),
        "decimal_odds": _more_bet_decimal(price),
        "raw_price": price,
        "is_alt": _to_int(is_alt) or 0,
    }
    actual = _to_float(actual_handicap)
    if actual is not None:
        result["actual_handicap"] = actual
    return result


def _with_more_bet_market(
    result: dict[str, Any] | None,
    prices: list[Any],
    *,
    signature: tuple[Any, ...],
) -> dict[str, Any] | None:
    """Attach an exact paired-market margin without consulting Forted odds."""
    if result is None:
        return None
    outcomes = [_more_bet_decimal(price) for price in prices]
    if len(outcomes) < 2 or any(price is None for price in outcomes):
        return result
    decimal_outcomes = [float(price) for price in outcomes if price is not None]
    margin = sum(1.0 / price for price in decimal_outcomes) - 1.0
    result.update({
        "market_margin": margin,
        "market_margin_source": "pinnacle-more-bet",
        "market_outcomes": decimal_outcomes,
        "market_signature": json.dumps(signature, ensure_ascii=True, separators=(",", ":")),
        "structural_match_count": 1,
    })
    return result


def _resolve_more_bet_line_meta(
    event_dict: dict[str, Any],
    *,
    period: int,
    bet_type: int,
    team_select: int,
    handicap: float,
) -> dict[str, Any] | None:
    periods = _more_bet_periods(event_dict)
    p = periods.get(str(int(period)))
    if not isinstance(p, list):
        return None

    # pin888 MORE_BET uses a richer period layout than compact/events:
    #   2 = handicap, 3 = totals, 4 = moneyline.
    bt = int(bet_type)
    ts = int(team_select)
    h = float(handicap or 0)

    if bt == 1:
        ml_block = p[4] if len(p) > 4 else None
        if not isinstance(ml_block, list) or len(ml_block) < 4:
            return None
        odds_map = {
            0: ml_block[1] if len(ml_block) > 1 else None,
            1: ml_block[0] if len(ml_block) > 0 else None,
            2: ml_block[2] if len(ml_block) > 2 else None,
        }
        available_prices = [price for price in (
            ml_block[1] if len(ml_block) > 1 else None,
            ml_block[0] if len(ml_block) > 0 else None,
            ml_block[2] if len(ml_block) > 2 else None,
        ) if _more_bet_decimal(price) is not None]
        return _with_more_bet_market(
            _more_bet_line_result(
                ml_block[3],
                odds_map.get(ts),
                is_alt=ml_block[4] if len(ml_block) > 4 else 0,
            ),
            available_prices,
            signature=(period, bt, 0.0, ml_block[3], available_prices),
        )

    if bt == 2:
        hcp_block = p[2] if len(p) > 2 else None
        if not isinstance(hcp_block, list):
            return None
        candidates: list[tuple[int, dict[str, Any], list[Any], tuple[Any, ...]]] = []
        for line in hcp_block:
            if not isinstance(line, list) or len(line) < 8:
                continue
            raw_handicap = _to_float(line[0])
            mirrored_handicap = _to_float(line[1])
            # MORE_BET's standard spread tuple is
            # [raw_hdp, -raw_hdp, label, home_price, away_price, ...].
            # Pinnacle displays the raw handicap on the away runner and its
            # mirror on the home runner.  The central parser uses the same
            # contract (home_hcp=-raw_hdp, away_hcp=raw_hdp).
            actual = mirrored_handicap if ts == 0 else raw_handicap if ts == 1 else None
            if actual is None:
                continue
            if _approx_eq(actual, h):
                priority = 0
            else:
                continue
            odds_idx = 3 if ts == 0 else 4
            result = _more_bet_line_result(
                line[7],
                line[odds_idx] if len(line) > odds_idx else None,
                is_alt=line[8] if len(line) > 8 else 0,
                actual_handicap=actual,
            )
            if result:
                candidates.append((
                    priority,
                    result,
                    [line[3], line[4]],
                    (period, bt, h, line[7], line[3], line[4]),
                ))
        if len(candidates) != 1:
            return None
        _priority, selected_result, market_prices, signature = candidates[0]
        return _with_more_bet_market(selected_result, market_prices, signature=signature)

    if bt == 3:
        total_block = p[3] if len(p) > 3 else None
        if not isinstance(total_block, list):
            return None
        candidates = []
        for line in total_block:
            if not isinstance(line, list) or len(line) < 5:
                continue
            if not _approx_eq(line[1], h):
                continue
            odds_idx = 2 if ts == 3 else 3
            selected = _more_bet_line_result(
                line[4], line[odds_idx] if len(line) > odds_idx else None,
                is_alt=line[5] if len(line) > 5 else 0,
            )
            if selected:
                candidates.append((selected, [line[2], line[3]], (period, bt, h, line[4], line[2], line[3])))
        if len(candidates) != 1:
            return None
        selected, market_prices, signature = candidates[0]
        return _with_more_bet_market(selected, market_prices, signature=signature)

    if bt in (4, 5):
        it_block = p[0] if len(p) > 0 else None
        if not isinstance(it_block, list) or len(it_block) < 2:
            return None
        side_block = it_block[0] if bt == 4 else it_block[1]
        if not isinstance(side_block, list):
            return None
        candidates = []
        for line in side_block:
            if not isinstance(line, list) or len(line) < 5:
                continue
            if not _approx_eq(line[1], h):
                continue
            if bt == 4:
                odds_idx = 2 if ts == 5 else 3
            else:
                odds_idx = 2 if ts == 7 else 3
            selected = _more_bet_line_result(
                line[4], line[odds_idx] if len(line) > odds_idx else None,
                is_alt=line[5] if len(line) > 5 else 0,
            )
            if selected:
                candidates.append((selected, [line[2], line[3]], (period, bt, h, line[4], line[2], line[3])))
        if len(candidates) != 1:
            return None
        selected, market_prices, signature = candidates[0]
        return _with_more_bet_market(selected, market_prices, signature=signature)

    return None


async def lookup_more_bet_price(
    *,
    sport_label: str = "",
    event_id: str | int | None = None,
    raw_selection: str = "",
    market: str = "",
    outcome: str = "",
    period: int = 0,
    market_context: str = "",
    forted_home: str = "",
    forted_away: str = "",
    esports_unit: str = "",
    timeout: float = 12.0,
) -> dict[str, Any] | None:
    """Resolve a Pinnacle line id from the pin888 MORE_BET board.

    This uses the pin888 parser/hub account, not the PS3838 betslip account.
    Callers should still send the resolved line id to PS3838 betslip for the
    final live cart check.
    """
    if not event_id:
        return None
    parsed = _fallback_parsed_selection(raw_selection, outcome, market)
    if not parsed.get("market_type") or parsed.get("_unknown"):
        return None
    parsed["period"] = period or parsed.get("period") or 0
    params = _ps3838_params_from_parsed(parsed)
    if not params:
        return None

    board = await get_cached_more_bets(event_id, timeout=timeout)
    if not board.get("ok"):
        return None
    event = _more_bet_event(board.get("data"), event_id, market_context=market_context)
    if not event:
        return None
    effective_params, reversed_flag = _effective_more_bet_params(
        event,
        params,
        forted_home=forted_home,
        forted_away=forted_away,
    )
    inferred_map_number = 0
    result = _resolve_more_bet_line_meta(event, **effective_params)
    if (
        result is None
        and str(esports_unit or "").strip().lower() == "kills"
        and int(effective_params.get("period") or 0) == 0
    ):
        # Forted labels Pinnacle's dedicated "(Kills)" child as a whole-match
        # market and often omits its map.  Resolve the coordinate from the exact
        # Pinnacle board itself, accepting it only when one numbered period
        # contains the requested family/side/line.
        candidates = []
        for raw_period in sorted(_more_bet_periods(event), key=lambda value: int(value) if str(value).isdigit() else 999):
            candidate_period = _to_int(raw_period)
            if candidate_period is None or candidate_period <= 0:
                continue
            candidate_params = {**effective_params, "period": candidate_period}
            candidate = _resolve_more_bet_line_meta(event, **candidate_params)
            if candidate is not None:
                candidates.append((candidate_period, candidate, candidate_params))
        if len(candidates) == 1:
            inferred_map_number, result, effective_params = candidates[0]
    if not result:
        return None
    result.update({
        "source": "pinnacle-more-bet",
        "event_id": str(event["raw"][0] if event.get("raw") else event_id),
        "parent_event_id": str(event_id),
        "slug": sport_slug_for_label(sport_label),
        "matched_by": result.get("matched_by") or "more_bet_selection",
        "parsed": dict(parsed),
        "market_context": str(event.get("market_context") or market_context or ""),
        "period": effective_params["period"],
        "bet_type": effective_params["bet_type"],
        "team_select": effective_params["team_select"],
        "handicap": effective_params["handicap"],
        "requested_params": dict(params),
        "reversed": reversed_flag,
        "home": event.get("home"),
        "away": event.get("away"),
        "cached": bool(board.get("cached")),
        "cache_age_sec": board.get("cache_age_sec"),
        "esports_unit": str(esports_unit or "").strip().lower() or None,
        "map_number": inferred_map_number or None,
    })
    return result


async def lookup_stream_price(
    *,
    sport_label: str,
    event_id: str | int | None = None,
    raw_selection: str = "",
    market: str = "",
    outcome: str = "",
    selection_id: str | int | None = None,
    odds_id: str | int | None = None,
    line_id: str | int | None = None,
    period: int = 0,
    reverse_teams: bool = False,
    timeout: float = 3.0,
) -> dict[str, Any] | None:
    """Find a Pinnacle price in the hub's FULL_ODDS stream snapshot.

    Returns None when the stream does not currently contain the requested row;
    callers may then use the more expensive betslip/MORE_BET request path.
    """
    slug = sport_slug_for_label(sport_label)
    if not slug:
        return None
    cached = accumulated_stream_snapshot(slug)
    if cached is not None:
        snapshot, rows, age = cached
        if age > STREAM_STATE_MAX_AGE_SEC:
            cached = None
    if cached is None:
        snapshot = await get_cached_snapshot(slug, timeout=timeout)
        snapshot_age = _stream_frame_age_sec(snapshot)
        if snapshot_age is not None and snapshot_age > STREAM_STATE_MAX_AGE_SEC:
            return None
        if _stream_frame_refreshes_all(snapshot):
            apply_stream_frame(snapshot)
        rows = _snapshot_rows(snapshot)
        if not rows:
            return None

    event_key = str(event_id or "").strip()
    event_rows = [row for row in rows if not event_key or _row_event_id(row) == event_key]
    search_rows = event_rows or rows
    parsed = _fallback_parsed_selection(raw_selection, outcome, market)
    parsed_valid = bool(parsed.get("market_type") and not parsed.get("_unknown"))
    if parsed_valid:
        parsed["period"] = period or parsed.get("period") or 0
        if reverse_teams:
            parsed = _reverse_parsed_teams(parsed)

    selection_specific_ids = {
        str(value).strip()
        for value in (selection_id, odds_id)
        if value not in (None, "", 0, "0")
    }
    wanted_ids = {
        str(value).strip()
        for value in (selection_id, odds_id, line_id)
        if value not in (None, "", 0, "0")
    }
    if wanted_ids:
        id_rows = [
            row for row in search_rows
            if _row_is_open(row) and wanted_ids & _row_ids(row)
        ]
        if parsed_valid:
            context_rows = event_rows or id_rows
            for row in id_rows:
                if _row_matches_parsed(row, parsed, context_rows):
                    result = _row_result(row, snapshot, slug, context_rows)
                    if result:
                        result["matched_by"] = "id+selection"
                        result["parsed"] = dict(parsed)
                        return result
        if len(id_rows) == 1 and selection_specific_ids:
            result = _row_result(id_rows[0], snapshot, slug, event_rows or id_rows)
            if result:
                result["matched_by"] = "id"
                return result
        return None

    if not event_rows:
        return None

    if not parsed_valid:
        return None

    matching_rows = [row for row in event_rows if _row_matches_parsed(row, parsed, event_rows)]
    # Event id + the complete structural coordinate is a valid exact binding,
    # but only while it selects one open FULL_ODDS row.  Returning the first of
    # several matches would silently turn a structural lookup into a guess.
    if len(matching_rows) != 1:
        return None

    # Forted odds are deliberately absent from this resolver.  The exact event
    # id and the complete structural coordinate must identify one row.
    selected = matching_rows[0]
    matched_by = "event+selection"

    result = _row_result(selected, snapshot, slug, event_rows)
    if not result:
        return None
    result["matched_by"] = matched_by
    result["structural_match_count"] = 1
    result["parsed"] = dict(parsed)
    return result


async def stream(on_frame, sports=None, scopes=None, max_size=None):
    """One PERSISTENT WS for the feed (no per-call reconnects). `on_frame` may be
    sync or async; `sports` filters by slug/id, `scopes` by {"live","prematch"}
    (None = all). Each frame carries `scope`; prematch odds live in raw field `n`."""
    want = set(sports or [])
    want_scope = set(scopes or [])
    async with connect(HUB_WS, max_size=max_size) as ws:
        async for raw in ws:
            m = json.loads(raw)
            if want and m.get("slug") not in want and m.get("sport") not in want:
                continue
            if want_scope and m.get("scope") not in want_scope:
                continue
            if asyncio.iscoroutinefunction(on_frame):
                await on_frame(m)
            else:
                on_frame(m)


async def stream_cache_loop(sports=None, scopes=None, max_size=None, reconnect_delay: float = 2.0, logger=None):
    """Maintain an accumulated FULL_ODDS row cache from the persistent hub stream."""
    while True:
        try:
            await stream(
                lambda frame: apply_stream_frame(frame),
                sports=sports,
                scopes=scopes,
                max_size=max_size,
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            if logger:
                logger.warning("pin888 stream cache disconnected: %s", exc)
            await asyncio.sleep(reconnect_delay)


if __name__ == "__main__":
    print("status:", json.dumps(get_status(), ensure_ascii=False))
