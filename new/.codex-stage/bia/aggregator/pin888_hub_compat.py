"""pin888 hub compatibility surface for legacy consumers.

RobinArb already knows the old Mac ``pin888 hub`` contract:

* ``GET /health``
* ``GET /snapshot?sport=soccer|tennis|basketball|...``
* ``GET /more_bet?event_id=...``
* one persistent WebSocket stream on the same port

The central aggregator stores normalized PS3838 events, not that exact hub
shape.  This module keeps the consumer contract stable by exposing a tiny
adapter over fleet worker events and raw MORE_BET responses.  It is opt-in and
has no import-time side effects.
"""

from __future__ import annotations

import asyncio
import json
import os
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable

from aiohttp import web


SPORTS: dict[str, int] = {
    "soccer": 29,
    "tennis": 33,
    "basketball": 4,
    "hockey": 19,
    "volleyball": 34,
    "handball": 18,
    "table-tennis": 32,
    "e-sports": 12,
    "baseball": 3,
    "cricket": 8,
    "american-football": 15,
    "aussie-rules": 39,
    "combat-sports": 22,
}
_SPORT_ALIASES: dict[str, str] = {
    "esports": "e-sports",
    "e sports": "e-sports",
    "ice-hockey": "hockey",
    "ice_hockey": "hockey",
    "tabletennis": "table-tennis",
    "table_tennis": "table-tennis",
    "table tennis": "table-tennis",
    "american_football": "american-football",
    "american football": "american-football",
    "football-us": "american-football",
    "af": "american-football",
    "aussie_rules": "aussie-rules",
    "aussie rules": "aussie-rules",
    "australian-rules": "aussie-rules",
    "arf": "aussie-rules",
    "combat_sports": "combat-sports",
    "combat sports": "combat-sports",
    "mma": "combat-sports",
    "boxing": "combat-sports",
}
_SPORT_SLUGS = {v: k for k, v in SPORTS.items()}
_CACHE_TTL_SEC = 30.0
_BIA_PROOF_IDENTITY_TTL_SEC = 15 * 60.0


def seed_bia_proof_identity(
    events_data: dict[int, dict[str, Any]],
    event_id: Any,
    *,
    home: Any,
    away: Any,
    sport: Any,
    league: Any = "",
    start: Any = None,
    now: float | None = None,
) -> bool:
    """Seed one exact MORE_BET child identity for the read-only BIA proof."""
    normalized_event_id = _to_int(event_id)
    home_name = str(home or "").strip()[:200]
    away_name = str(away or "").strip()[:200]
    sport_name = str(sport or "").strip()[:100]
    sport_token = sport_name.lower().replace("_", " ")
    sport_slug = _SPORT_ALIASES.get(sport_token, sport_token.replace(" ", "-"))
    if (
        not normalized_event_id
        or not home_name
        or not away_name
        or sport_slug not in SPORTS
    ):
        return False
    timestamp = float(now if now is not None else time.time())
    for pid, game in list(events_data.items()):
        if not isinstance(game, dict) or not game.get("_bia_proof_identity_only"):
            continue
        try:
            expired = timestamp - float(game.get("_bia_proof_identity_seen_at") or 0) > _BIA_PROOF_IDENTITY_TTL_SEC
        except (TypeError, ValueError):
            expired = True
        if expired:
            events_data.pop(pid, None)
    existing = events_data.get(normalized_event_id)
    if isinstance(existing, dict) and not existing.get("_bia_proof_identity_only"):
        has_identity = bool(
            existing.get("homeName") or existing.get("Home") or existing.get("home")
        ) and bool(
            existing.get("awayName") or existing.get("Away") or existing.get("away")
        ) and bool(existing.get("SportName") or existing.get("sport"))
        if has_identity:
            if start not in (None, "") and existing.get("start_time_ms") in (None, ""):
                existing["start_time_ms"] = start
            return True
        existing = None
    if isinstance(existing, dict):
        same_identity = (
            str(existing.get("Home") or "").strip() == home_name
            and str(existing.get("Away") or "").strip() == away_name
            and str(existing.get("SportName") or "").strip().lower() == sport_name.lower()
        )
        if not same_identity:
            return False
    events_data[normalized_event_id] = {
        "Pid": normalized_event_id,
        "Home": home_name,
        "Away": away_name,
        "SportName": sport_name,
        "LeagueName": str(league or "").strip()[:250],
        "start_time_ms": start if start not in (None, "") else None,
        "_bia_proof_identity_only": True,
        "_bia_proof_identity_seen_at": timestamp,
    }
    return True


def pin888_hub_compat_enabled() -> bool:
    return os.environ.get("MSP_PIN888_HUB_COMPAT_ENABLED", "0").strip() in (
        "1",
        "true",
        "True",
        "yes",
    )


def _hub_host() -> str:
    return os.environ.get("MSP_PIN888_HUB_COMPAT_HOST", "127.0.0.1")


def _hub_port() -> int:
    try:
        return int(os.environ.get("MSP_PIN888_HUB_COMPAT_PORT", "19100"))
    except (TypeError, ValueError):
        return 19100


def _to_int(value: Any) -> int | None:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _to_float(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed == parsed else None


def bia_lookup_payload(
    event_id_raw: Any,
    period_raw: Any = 0,
    *,
    proof_raw: Any = None,
    bet_type_raw: Any = None,
    team_select_raw: Any = None,
    handicap_raw: Any = None,
    map_number_raw: Any = 0,
    game_number_raw: Any = 0,
    esports_unit_raw: Any = "",
    tennis_unit_raw: Any = "",
    market_context_raw: Any = "",
    period_type_raw: Any = "",
    inning_number_raw: Any = 0,
    half_number_raw: Any = 0,
    lookup: Callable[..., dict[str, Any] | None] | None = None,
    selection_lookup: Callable[..., dict[str, Any]] | None = None,
) -> tuple[dict[str, Any], int]:
    """Expose the existing BIA→Pinnacle matcher without owning BIA state."""
    try:
        event_id = int(event_id_raw)
        period = int(period_raw or 0)
    except (TypeError, ValueError):
        return {"error": "event_id and period must be integers"}, 400
    if event_id <= 0:
        return {"error": "event_id is required"}, 400
    proof_requested = str(proof_raw or "").strip().lower() in {"1", "true", "yes"}
    if proof_requested:
        try:
            bet_type = int(bet_type_raw)
            team_select = int(team_select_raw)
            map_number = int(map_number_raw or 0)
            game_number = int(game_number_raw or 0)
            inning_number = int(inning_number_raw or 0)
            half_number = int(half_number_raw or 0)
            if handicap_raw is None:
                raise ValueError("handicap is required")
        except (TypeError, ValueError):
            return {
                "error": "proof requires numeric selection and structural coordinates"
            }, 400
        if selection_lookup is None:
            from services.bia_observer import lookup_bia_selection_for_pid
            selection_lookup = lookup_bia_selection_for_pid
        selection = {
            "bet_type": bet_type,
            "team_select": team_select,
            "handicap": handicap_raw,
            "map_number": map_number,
            "game_number": game_number,
            "esports_unit": str(esports_unit_raw or ""),
            "period_type": str(period_type_raw or "").strip().lower(),
            "inning_number": inning_number,
            "half_number": half_number,
        }
        tennis_unit = str(tennis_unit_raw or "").strip().lower()
        if tennis_unit:
            selection["tennis_unit"] = tennis_unit
        market_context = str(market_context_raw or "").strip().lower()
        if market_context:
            selection["market_context"] = market_context
        return selection_lookup(
            event_id,
            period=period,
            selection=selection,
        ), 200
    if lookup is None:
        # Lazy import keeps the hub usable when BIA support is disabled.
        from services.bia_observer import lookup_unique_bia_event_for_pid
        lookup = lookup_unique_bia_event_for_pid
    result = lookup(event_id, period=period)
    if isinstance(result, dict) and "found" in result:
        return result, 200
    return ({"found": True, **result} if result else {"found": False}), 200


def _positive_price(value: Any) -> float | None:
    parsed = _to_float(value)
    if parsed is None or parsed <= 1.0:
        return None
    return round(parsed, 4)


def _raw_meta(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        raw = value.get("raw")
        return raw if isinstance(raw, dict) else {}
    return {}


def _price_value(value: Any) -> float | None:
    if isinstance(value, dict):
        return _positive_price(value.get("value") or value.get("price") or value.get("odds"))
    return _positive_price(value)


def _line_value(value: Any) -> float:
    parsed = _to_float(value)
    return float(parsed or 0.0)


def _line_id(*values: Any) -> int:
    for value in values:
        if isinstance(value, dict):
            value = value.get("line_id") or value.get("LineId")
        parsed = _to_int(value)
        if parsed and parsed > 0:
            return parsed
    return 0


def _iter_raw_periods(event: dict[str, Any]) -> list[tuple[int, list[Any]]]:
    raw = event.get("raw")
    if not isinstance(raw, list) or len(raw) <= 8:
        return []
    odds_block = raw[8]
    if not isinstance(odds_block, dict):
        return []
    out: list[tuple[int, list[Any]]] = []
    for key, value in odds_block.items():
        try:
            period = int(key)
        except (TypeError, ValueError):
            continue
        if isinstance(value, list):
            out.append((period, value))
    return out


def _raw_total_rows(
    *,
    totals: Any,
    period: int,
    market_code: int,
    over_code: int,
    under_code: int,
    event_id: int,
) -> list[list[Any]]:
    from parsing.parser_utils import _extract_total_line_id, parse_total_fields  # noqa: PLC0415

    if not isinstance(totals, list):
        return []
    rows: list[list[Any]] = []
    for total in totals:
        if not isinstance(total, list) or len(total) < 3:
            continue
        line, over_price, under_price = parse_total_fields(total)
        if line <= 0.0:
            continue
        line_id = _extract_total_line_id(total)
        if over_price > 1.0:
            rows.append(
                _stream_row(
                    period=period,
                    market_code=market_code,
                    designation_code=over_code,
                    line=line,
                    price=over_price,
                    line_id=line_id,
                    event_id=event_id,
                )
            )
        if under_price > 1.0:
            rows.append(
                _stream_row(
                    period=period,
                    market_code=market_code,
                    designation_code=under_code,
                    line=line,
                    price=under_price,
                    line_id=line_id,
                    event_id=event_id,
                )
            )
    return rows


def _raw_event_to_stream_rows(event: dict[str, Any]) -> list[list[Any]]:
    """Best-effort hub rows for parser fallback events that only carry raw WS."""
    event_id = _to_int(event.get("Pid"))
    if not event_id:
        return []

    from parsing.parser_utils import (  # noqa: PLC0415
        _extract_ml_line_id,
        _extract_spread_line_id,
        extract_moneyline_values,
        normalize_odd,
        parse_moneyline,
        to_float,
    )

    rows: list[list[Any]] = []
    for period, period_data in _iter_raw_periods(event):
        _status, ml = parse_moneyline(period_data)
        if isinstance(ml, list) and len(ml) >= 2:
            home_price, away_price, draw_price = extract_moneyline_values(ml)
            line_id = _extract_ml_line_id(ml)
            if home_price > 1.0:
                rows.append(
                    _stream_row(
                        period=period,
                        market_code=1,
                        designation_code=0,
                        line=0.0,
                        price=home_price,
                        line_id=line_id,
                        event_id=event_id,
                    )
                )
            if draw_price > 1.0:
                rows.append(
                    _stream_row(
                        period=period,
                        market_code=1,
                        designation_code=1,
                        line=0.0,
                        price=draw_price,
                        line_id=line_id,
                        event_id=event_id,
                    )
                )
            away_code = 2 if draw_price > 1.0 else 1
            if away_price > 1.0:
                rows.append(
                    _stream_row(
                        period=period,
                        market_code=1,
                        designation_code=away_code,
                        line=0.0,
                        price=away_price,
                        line_id=line_id,
                        event_id=event_id,
                    )
                )

        spreads = period_data[0] if len(period_data) > 0 else None
        if isinstance(spreads, list) and not (
            spreads
            and isinstance(spreads[0], list)
            and spreads[0]
            and isinstance(spreads[0][0], list)
        ):
            for spread in spreads:
                if not isinstance(spread, list) or len(spread) < 3:
                    continue
                if len(spread) >= 5 and isinstance(spread[2], str):
                    hdp = to_float(spread[0])
                    home_price = normalize_odd(spread[3])
                    away_price = normalize_odd(spread[4])
                else:
                    hdp = to_float(spread[0])
                    home_price = normalize_odd(spread[1])
                    away_price = normalize_odd(spread[2])
                line_id = _extract_spread_line_id(spread)
                home_line = -hdp
                away_line = hdp
                if home_price > 1.0:
                    rows.append(
                        _stream_row(
                            period=period,
                            market_code=2,
                            designation_code=0,
                            line=home_line,
                            price=home_price,
                            line_id=line_id,
                            event_id=event_id,
                        )
                    )
                if away_price > 1.0:
                    rows.append(
                        _stream_row(
                            period=period,
                            market_code=2,
                            designation_code=1,
                            line=away_line,
                            price=away_price,
                            line_id=line_id,
                            event_id=event_id,
                        )
                    )

        rows.extend(
            _raw_total_rows(
                totals=period_data[1] if len(period_data) > 1 else None,
                period=period,
                market_code=3,
                over_code=3,
                under_code=4,
                event_id=event_id,
            )
        )
        rows.extend(
            _raw_total_rows(
                totals=period_data[3] if len(period_data) > 3 else None,
                period=period,
                market_code=4,
                over_code=5,
                under_code=6,
                event_id=event_id,
            )
        )
        rows.extend(
            _raw_total_rows(
                totals=period_data[4] if len(period_data) > 4 else None,
                period=period,
                market_code=5,
                over_code=7,
                under_code=8,
                event_id=event_id,
            )
        )
    return rows


def _stream_row(
    *,
    period: int,
    market_code: int,
    designation_code: int,
    line: float,
    price: float,
    line_id: int,
    event_id: int,
) -> list[Any]:
    """Return the flat row shape expected by RobinArb's old hub client."""
    return [
        int(period),
        int(market_code),
        int(designation_code),
        float(line),
        0,
        float(price),
        int(line_id or 0),
        int(line_id or 0),
        None,
        None,
        "O",
        None,
        int(event_id),
    ]


def event_to_stream_rows(event: dict[str, Any]) -> list[list[Any]]:
    """Convert one normalized PS3838 GameData payload to old hub stream rows."""
    event_id = _to_int(event.get("Pid"))
    if not event_id:
        return []
    periods = event.get("Periods")
    if not isinstance(periods, list):
        return _raw_event_to_stream_rows(event)

    rows: list[list[Any]] = []
    for period in periods:
        if not isinstance(period, dict):
            continue
        pnum = _to_int(period.get("Number")) or 0

        win = period.get("Win1x2")
        if isinstance(win, dict):
            draw_price = _price_value(win.get("WinNone"))
            mapping: list[tuple[str, int]] = [("Win1", 0)]
            if draw_price is not None:
                mapping.append(("WinNone", 1))
                mapping.append(("Win2", 2))
            else:
                mapping.append(("Win2", 1))
            for side, code in mapping:
                price = _price_value(win.get(side))
                if price is None:
                    continue
                raw = _raw_meta(win.get(side))
                rows.append(
                    _stream_row(
                        period=pnum,
                        market_code=1,
                        designation_code=code,
                        line=0.0,
                        price=price,
                        line_id=_line_id(raw, win.get("LineId")),
                        event_id=event_id,
                    )
                )

        for market_name, market_code, side_map in (
            ("Handicap", 2, {"Win1": 0, "Win2": 1}),
            ("Totals", 3, {"WinMore": 3, "WinLess": 4}),
            ("FirstTeamTotals", 4, {"WinMore": 5, "WinLess": 6}),
            ("SecondTeamTotals", 5, {"WinMore": 7, "WinLess": 8}),
        ):
            market = period.get(market_name)
            if not isinstance(market, dict):
                continue
            for line_key, line_payload in market.items():
                if str(line_key).startswith("_") or line_key in ("LineId", "LineEventId"):
                    continue
                if not isinstance(line_payload, dict):
                    continue
                line = _line_value(line_key)
                for side, code in side_map.items():
                    price = _price_value(line_payload.get(side))
                    if price is None:
                        continue
                    raw = _raw_meta(line_payload.get(side))
                    rows.append(
                        _stream_row(
                            period=pnum,
                            market_code=market_code,
                            designation_code=code,
                            line=line,
                            price=price,
                            line_id=_line_id(raw, line_payload.get("LineId")),
                            event_id=event_id,
                        )
                    )
    return rows


def _slug_for_sport(value: Any) -> str:
    sport_id = _to_int(value)
    return _SPORT_SLUGS.get(sport_id or 0, "soccer")


def _sport_for_slug(slug: str) -> int:
    cleaned = (slug or "soccer").strip().lower()
    cleaned = _SPORT_ALIASES.get(cleaned, cleaned)
    return SPORTS.get(cleaned, 29)


def _frame_data(
    rows: list[list[Any]] | None = None,
    *,
    frame_type: str = "UPDATE_ODDS",
    scope: str = "live",
    live_rows: list[list[Any]] | None = None,
    prematch_rows: list[list[Any]] | None = None,
) -> dict[str, Any]:
    if live_rows is not None or prematch_rows is not None:
        odds: dict[str, list[list[Any]]] = {}
        if live_rows:
            odds["l"] = live_rows
        if prematch_rows:
            odds["n"] = prematch_rows
        return {"type": frame_type, "odds": odds}
    key = "n" if scope == "prematch" else ("l" if frame_type == "FULL_ODDS" else "u")
    return {"type": frame_type, "odds": {key: rows or []}}


def _envelope(
    *,
    slug: str,
    sport: int,
    rows: list[list[Any]],
    kind: str = "frame",
    frame_type: str = "UPDATE_ODDS",
    scope: str = "live",
    live_rows: list[list[Any]] | None = None,
    prematch_rows: list[list[Any]] | None = None,
) -> dict[str, Any]:
    return {
        "t": kind,
        "sport": int(sport),
        "slug": slug,
        "scope": scope,
        "op": 1,
        "ts": int(time.time() * 1000),
        "data": json.dumps(
            _frame_data(
                rows,
                frame_type=frame_type,
                scope=scope,
                live_rows=live_rows,
                prematch_rows=prematch_rows,
            ),
            separators=(",", ":"),
        ),
    }


def _clean_raw_frame(frame: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in frame.items() if not str(k).startswith("_")}


@dataclass
class _PendingMoreBet:
    requested_at: float
    last_dispatched_at: float = 0.0


class Pin888HubCompatState:
    """Thread-safe state shared by fleet workers and the aiohttp server."""

    def __init__(self, *, cache_ttl_sec: float = _CACHE_TTL_SEC) -> None:
        self.cache_ttl_sec = float(cache_ttl_sec)
        self._lock = threading.RLock()
        self._condition = threading.Condition(self._lock)
        self._rows_by_slug: dict[str, dict[tuple[Any, ...], list[Any]]] = {}
        self._rows_by_slug_scope: dict[str, dict[str, dict[tuple[Any, ...], list[Any]]]] = {}
        self._updated_at: dict[str, float] = {}
        self._updated_at_by_scope: dict[str, dict[str, float]] = {}
        self._more_bet_cache: dict[str, tuple[float, dict[str, Any]]] = {}
        self._pending_more_bets: dict[str, _PendingMoreBet] = {}

    def ingest_event(self, event: dict[str, Any]) -> list[list[Any]]:
        rows = event_to_stream_rows(event)
        if not rows:
            return []
        slug = _slug_for_sport(event.get("SportId"))
        scope = self._event_scope(event)
        now = time.time()
        with self._condition:
            bucket = self._rows_by_slug.setdefault(slug, {})
            scoped = self._rows_by_slug_scope.setdefault(slug, {"live": {}, "prematch": {}})
            target = scoped.setdefault(scope, {})
            opposite = scoped.setdefault("prematch" if scope == "live" else "live", {})
            for row in rows:
                key = self._row_key(row)
                bucket[key] = row
                target[key] = row
                opposite.pop(key, None)
            self._updated_at[slug] = now
            self._updated_at_by_scope.setdefault(slug, {})[scope] = now
            self._condition.notify_all()
        return rows

    def ingest_raw_frame(self, frame: dict[str, Any]) -> None:
        if frame.get("type") != "MORE_BET":
            return
        event_id = _to_int(frame.get("_requested_event_id")) or _extract_more_bet_event_id(frame)
        if not event_id:
            return
        key = str(event_id)
        clean = _clean_raw_frame(frame)
        now = time.time()
        with self._condition:
            self._more_bet_cache[key] = (now, clean)
            self._pending_more_bets.pop(key, None)
            self._condition.notify_all()

    def snapshot(self, slug: str) -> dict[str, Any]:
        slug = (slug or "soccer").strip().lower()
        sport = _sport_for_slug(slug)
        with self._lock:
            scopes = self._rows_by_slug_scope.get(slug) or {}
            live_rows = list((scopes.get("live") or {}).values())
            prematch_rows = list((scopes.get("prematch") or {}).values())
            rows = live_rows + prematch_rows
        return _envelope(
            slug=slug,
            sport=sport,
            rows=rows,
            kind="snapshot",
            frame_type="FULL_ODDS",
            scope="mixed" if live_rows and prematch_rows else ("prematch" if prematch_rows else "live"),
            live_rows=live_rows,
            prematch_rows=prematch_rows,
        )

    def health(self, *, consumers: int = 0) -> dict[str, Any]:
        now = time.time()
        with self._lock:
            sports = {
                slug: self._sport_health(slug, rows, now)
                for slug, rows in sorted(self._rows_by_slug.items())
            }
            pending = len(self._pending_more_bets)
            cached_more_bets = len(self._more_bet_cache)
        return {
            "ok": True,
            "source": "central-ps3838-hub-compat",
            "sports": sports,
            "consumers": consumers,
            "pending_more_bets": pending,
            "cached_more_bets": cached_more_bets,
        }

    def request_more_bet(self, event_id: Any, *, timeout: float) -> dict[str, Any]:
        key = str(event_id or "").strip()
        if not key:
            return {"ok": False, "error": "missing_event_id", "event_id": key}
        deadline = time.time() + max(0.0, float(timeout or 0.0))
        with self._condition:
            cached = self._fresh_more_bet_locked(key)
            if cached is not None:
                body = dict(cached)
                body["cached"] = True
                return body
            self._queue_morebet_locked(key)
            while True:
                remaining = deadline - time.time()
                if remaining <= 0:
                    return {"ok": False, "error": "timeout", "event_id": key}
                self._condition.wait(timeout=min(remaining, 1.0))
                cached = self._fresh_more_bet_locked(key)
                if cached is not None:
                    body = dict(cached)
                    body["cached"] = False
                    return body

    def queue_morebet_target(self, event_id: Any) -> bool:
        key = str(event_id or "").strip()
        if not key:
            return False
        with self._condition:
            self._queue_morebet_locked(key)
            return True

    def next_morebet_target(self) -> int | None:
        now = time.time()
        with self._condition:
            for key, pending in sorted(
                self._pending_more_bets.items(),
                key=lambda item: item[1].requested_at,
            ):
                if self._fresh_more_bet_locked(key) is not None:
                    self._pending_more_bets.pop(key, None)
                    continue
                if now - pending.last_dispatched_at < 1.0:
                    continue
                pending.last_dispatched_at = now
                return _to_int(key)
        return None

    def _queue_morebet_locked(self, key: str) -> None:
        self._pending_more_bets.setdefault(key, _PendingMoreBet(requested_at=time.time()))
        self._condition.notify_all()

    def _fresh_more_bet_locked(self, key: str) -> dict[str, Any] | None:
        cached = self._more_bet_cache.get(key)
        if cached is None:
            return None
        ts, frame = cached
        if time.time() - ts > self.cache_ttl_sec:
            self._more_bet_cache.pop(key, None)
            return None
        return {"ok": True, "event_id": key, "data": frame}

    @staticmethod
    def _row_key(row: list[Any]) -> tuple[Any, ...]:
        return (row[-1], row[0], row[1], row[2], row[3], row[6], row[7])

    @staticmethod
    def _event_scope(event: dict[str, Any]) -> str:
        if event.get("isLive") is False or event.get("is_live") is False:
            return "prematch"
        return "live"

    def _sport_health(
        self,
        slug: str,
        rows: dict[tuple[Any, ...], list[Any]],
        now: float,
    ) -> dict[str, Any]:
        scopes = self._rows_by_slug_scope.get(slug) or {}
        live_rows = scopes.get("live") or {}
        prematch_rows = scopes.get("prematch") or {}
        scope_times = self._updated_at_by_scope.get(slug) or {}
        return {
            "rows": len(rows),
            "events": self._event_count(rows.values()),
            "live_rows": len(live_rows),
            "live_events": self._event_count(live_rows.values()),
            "prematch_rows": len(prematch_rows),
            "prematch_events": self._event_count(prematch_rows.values()),
            "age_sec": round(now - self._updated_at.get(slug, 0.0), 3)
            if slug in self._updated_at
            else None,
            "live_age_sec": round(now - scope_times.get("live", 0.0), 3)
            if "live" in scope_times
            else None,
            "prematch_age_sec": round(now - scope_times.get("prematch", 0.0), 3)
            if "prematch" in scope_times
            else None,
        }

    @staticmethod
    def _event_count(rows: Any) -> int:
        event_ids = {_to_int(row[-1]) for row in rows if isinstance(row, list) and row}
        event_ids.discard(None)
        return len(event_ids)


def _extract_more_bet_event_id(frame: dict[str, Any]) -> int | None:
    odds = frame.get("odds") if isinstance(frame.get("odds"), dict) else {}
    for key in ("e", "e1", "ce", "ce1"):
        event_id = _walk_more_bet_event_id(odds.get(key))
        if event_id:
            return event_id
    return None


def _walk_more_bet_event_id(value: Any) -> int | None:
    if isinstance(value, list) and len(value) >= 9:
        event_id = _to_int(value[0])
        if event_id and event_id > 1_500_000_000 and isinstance(value[1], str):
            return event_id
    if isinstance(value, list):
        for item in value:
            found = _walk_more_bet_event_id(item)
            if found:
                return found
    if isinstance(value, dict):
        for item in value.values():
            found = _walk_more_bet_event_id(item)
            if found:
                return found
    return None


class Pin888HubCompatServer:
    """A small aiohttp HTTP+WS server implementing the old hub contract."""

    def __init__(
        self,
        *,
        host: str | None = None,
        port: int | None = None,
        state: Pin888HubCompatState | None = None,
    ) -> None:
        self.host = host or _hub_host()
        self.port = port if port is not None else _hub_port()
        self.state = state or Pin888HubCompatState()
        self._thread: threading.Thread | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._runner: web.AppRunner | None = None
        self._clients: set[web.WebSocketResponse] = set()
        self._ready = threading.Event()

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(target=self._run, daemon=True, name="pin888-hub-compat")
        self._thread.start()
        self._ready.wait(timeout=5.0)

    def stop(self) -> None:
        loop = self._loop
        if loop is None:
            return

        async def _cleanup() -> None:
            clients = list(self._clients)
            self._clients.clear()
            if clients:
                await asyncio.gather(
                    *(ws.close(code=1001, message=b"server shutdown") for ws in clients),
                    return_exceptions=True,
                )
            if self._runner is not None:
                await self._runner.cleanup()
                self._runner = None

        try:
            asyncio.run_coroutine_threadsafe(_cleanup(), loop).result(timeout=5.0)
        except Exception:
            pass
        if loop.is_running():
            loop.call_soon_threadsafe(loop.stop)
        if self._thread is not None:
            self._thread.join(timeout=5.0)
        self._thread = None

    def ingest_event(self, event: dict[str, Any]) -> None:
        rows = self.state.ingest_event(event)
        if not rows:
            return
        slug = _slug_for_sport(event.get("SportId"))
        sport = _sport_for_slug(slug)
        scope = Pin888HubCompatState._event_scope(event)
        self._publish(_envelope(slug=slug, sport=sport, rows=rows, scope=scope))

    def ingest_raw_frame(self, frame: dict[str, Any]) -> None:
        self.state.ingest_raw_frame(frame)

    def next_morebet_target(self) -> int | None:
        return self.state.next_morebet_target()

    def _run(self) -> None:
        loop = asyncio.new_event_loop()
        self._loop = loop
        asyncio.set_event_loop(loop)
        app = web.Application()
        app.router.add_get("/health", self._handle_health)
        app.router.add_get("/snapshot", self._handle_snapshot)
        app.router.add_get("/more_bet", self._handle_more_bet)
        app.router.add_get("/lookup-bia", self._handle_lookup_bia)
        app.router.add_get("/search-bia", self._handle_search_bia)
        app.router.add_get("/debug-event", self._handle_debug_event)
        app.router.add_get("/", self._handle_ws)
        app.router.add_get("/ws", self._handle_ws)
        self._runner = web.AppRunner(app)
        loop.run_until_complete(self._runner.setup())
        site = web.TCPSite(self._runner, self.host, self.port)
        loop.run_until_complete(site.start())
        self._ready.set()
        try:
            loop.run_forever()
        finally:
            pending = [task for task in asyncio.all_tasks(loop) if not task.done()]
            for task in pending:
                task.cancel()
            if pending:
                loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
            loop.run_until_complete(loop.shutdown_asyncgens())
            loop.close()
            self._loop = None
            self._ready.clear()

    async def _handle_health(self, _request: web.Request) -> web.Response:
        return web.json_response(self.state.health(consumers=len(self._clients)))

    async def _handle_snapshot(self, request: web.Request) -> web.Response:
        slug = request.query.get("sport", "soccer")
        return web.json_response(self.state.snapshot(slug))

    async def _handle_more_bet(self, request: web.Request) -> web.Response:
        event_id = request.query.get("event_id", "")
        timeout = _to_float(request.query.get("timeout")) or 12.0
        body = await asyncio.to_thread(self.state.request_more_bet, event_id, timeout=timeout)
        return web.json_response(body)

    async def _handle_search_bia(self, request: web.Request) -> web.Response:
        """Bounded loopback diagnostics for deterministic mapping coverage."""
        query = str(request.query.get("q") or "").strip()
        if len(query) < 2 or len(query) > 100:
            return web.json_response(
                {"error": "q must contain 2-100 characters"}, status=400
            )
        from services.bia_observer import search_bia_registry

        events = await asyncio.to_thread(search_bia_registry, query, 20)
        return web.json_response({"query": query, "count": len(events), "events": events})

    async def _handle_debug_event(self, request: web.Request) -> web.Response:
        """Return only structural identity fields from the loopback event index."""
        try:
            event_id = int(request.query.get("event_id") or 0)
        except (TypeError, ValueError):
            event_id = 0
        if event_id <= 0:
            return web.json_response({"error": "event_id is required"}, status=400)
        from state import state
        from services.bia_event_matcher import (
            _name_variants,
            _normalize_sport_name,
            build_exact_match_index,
        )
        from services import bia_observer
        from services.bia_observer import _matching_bia_event_refs_for_pid

        game = state.events_data.get(event_id)
        if not isinstance(game, dict):
            return web.json_response({"found": False, "event_id": event_id})
        sport_key = _normalize_sport_name(game.get("SportName") or game.get("sport") or "")
        home_variants = _name_variants(
            str(game.get("homeName") or game.get("Home") or game.get("home") or "")
        )
        away_variants = _name_variants(
            str(game.get("awayName") or game.get("Away") or game.get("away") or "")
        )
        index = build_exact_match_index(state.events_data)
        same_identity_ids: set[int] = set()
        for home in home_variants:
            for away in away_variants:
                same_identity_ids.update(
                    pid for pid, _league in index.get((sport_key, home, away), [])
                )
                same_identity_ids.update(
                    pid for pid, _league in index.get((sport_key, away, home), [])
                )
        bia_refs = _matching_bia_event_refs_for_pid(event_id)
        ref_identities = {
            (str(item.get("sport_code") or ""), str(item.get("event_key") or ""))
            for item in bia_refs
        }
        offer_groups = []
        raw_offer_groups = []
        stats = bia_observer._current_stats
        if stats is not None:
            for identity in sorted(ref_identities):
                names = stats._raw_offer_groups.get(identity)
                if names:
                    raw_offer_groups.append({
                        "sport_code": identity[0],
                        "event_key": identity[1],
                        "groups": sorted(names),
                    })
            for offer_event in stats._offer_proofs.snapshot().get("events", []):
                identity = (
                    str(offer_event.get("sport_code") or ""),
                    str(offer_event.get("event_key") or ""),
                )
                if identity in ref_identities:
                    offer_groups.append({
                        "sport_code": identity[0],
                        "event_key": identity[1],
                        "groups": offer_event.get("groups") or {},
                        "invalid_groups": offer_event.get("invalid_groups") or [],
                    })
        return web.json_response({
            "found": True,
            "event_id": event_id,
            "home": game.get("homeName") or game.get("Home") or game.get("home"),
            "away": game.get("awayName") or game.get("Away") or game.get("away"),
            "sport": game.get("SportName") or game.get("sport"),
            "league": game.get("LeagueName") or game.get("league"),
            "start_time_ms": game.get("start_time_ms"),
            "is_live": game.get("isLive"),
            "same_identity_event_ids": sorted(same_identity_ids)[:50],
            "bia_refs": bia_refs,
            "bia_offer_groups": offer_groups,
            "bia_raw_offer_groups": raw_offer_groups,
        })

    async def _handle_lookup_bia(self, request: web.Request) -> web.Response:
        pinnacle_home = str(request.query.get("pinnacle_home") or "").strip()
        pinnacle_away = str(request.query.get("pinnacle_away") or "").strip()
        pinnacle_sport = str(request.query.get("pinnacle_sport") or "").strip()
        if pinnacle_home and pinnacle_away and pinnacle_sport:
            from state import state

            seed_bia_proof_identity(
                state.events_data,
                request.query.get("event_id"),
                home=pinnacle_home,
                away=pinnacle_away,
                sport=pinnacle_sport,
                league=request.query.get("pinnacle_league") or "",
                start=request.query.get("pinnacle_start") or None,
            )
        body, status = bia_lookup_payload(
            request.query.get("event_id"),
            request.query.get("period", "0"),
            proof_raw=request.query.get("proof"),
            bet_type_raw=request.query.get("bet_type"),
            team_select_raw=request.query.get("team_select"),
            handicap_raw=request.query.get("handicap"),
            map_number_raw=request.query.get("map_number", "0"),
            game_number_raw=request.query.get("game_number", "0"),
            esports_unit_raw=request.query.get("esports_unit", ""),
            tennis_unit_raw=request.query.get("tennis_unit", ""),
            market_context_raw=request.query.get("market_context", ""),
            period_type_raw=request.query.get("period_type", ""),
            inning_number_raw=request.query.get("inning_number", "0"),
            half_number_raw=request.query.get("half_number", "0"),
        )
        proof_requested = str(request.query.get("proof") or "").strip().lower() in {
            "1", "true", "yes",
        }
        if status == 200 and proof_requested and not body.get("found"):
            try:
                from services.bia_observer import (
                    lookup_bia_selection_for_pid_with_refresh,
                )

                body = await lookup_bia_selection_for_pid_with_refresh(
                    int(request.query.get("event_id") or 0),
                    period=int(request.query.get("period") or 0),
                    selection={
                        "bet_type": int(request.query.get("bet_type") or 0),
                        "team_select": int(request.query.get("team_select") or 0),
                        "handicap": request.query.get("handicap"),
                        "map_number": int(request.query.get("map_number") or 0),
                        "game_number": int(request.query.get("game_number") or 0),
                        "esports_unit": str(request.query.get("esports_unit") or ""),
                        "tennis_unit": str(request.query.get("tennis_unit") or ""),
                        "market_context": str(request.query.get("market_context") or ""),
                        "period_type": str(request.query.get("period_type") or ""),
                        "inning_number": int(request.query.get("inning_number") or 0),
                        "half_number": int(request.query.get("half_number") or 0),
                    },
                )
            except (TypeError, ValueError):
                # The synchronous parser above already returned the canonical
                # 400 body for malformed coordinates.
                pass
        return web.json_response(body, status=status)

    async def _handle_ws(self, request: web.Request) -> web.StreamResponse:
        ws = web.WebSocketResponse(heartbeat=20.0, max_msg_size=8 * 1024 * 1024)
        await ws.prepare(request)
        self._clients.add(ws)
        try:
            for slug in SPORTS:
                await ws.send_str(json.dumps(self.state.snapshot(slug), separators=(",", ":")))
            async for _msg in ws:
                pass
        finally:
            self._clients.discard(ws)
        return ws

    def _publish(self, envelope: dict[str, Any]) -> None:
        loop = self._loop
        if loop is None or not loop.is_running() or not self._clients:
            return
        payload = json.dumps(envelope, separators=(",", ":"))
        loop.call_soon_threadsafe(lambda: asyncio.create_task(self._broadcast(payload)))

    async def _broadcast(self, payload: str) -> None:
        dead: list[web.WebSocketResponse] = []
        for ws in list(self._clients):
            try:
                await ws.send_str(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._clients.discard(ws)


__all__ = [
    "Pin888HubCompatServer",
    "Pin888HubCompatState",
    "event_to_stream_rows",
    "pin888_hub_compat_enabled",
]
