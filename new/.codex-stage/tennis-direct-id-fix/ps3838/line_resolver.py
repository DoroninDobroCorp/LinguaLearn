"""Резолв lineId через compact/events PS3838.

PS3838 SPA каждые ~3с фетчит /sports-service/sv/compact/events?sp={sport_id}&more=false
и получает всю live-витрину спорта с актуальными ценами и lineId. Парсим её сами.

Структура события (упрощённо):
  e = [event_id, home, away, ?, kickoff_ts, ?, ?, ?, periods_dict, ?, ?, ?, status_flags, status_min, ...,
       home_name_again, away_name_again, ?, "Regular", parent_id?, ?, ?, ?, "Goals", ...]

periods_dict = {
  "0": [HCP, TOT, ML, ...],   # full match
  "1": [HCP, TOT, ML, ...],   # H1
  ...
}

HCP line = [hcp1, hcp2, hcp_label, odds1, odds2, ?, isAlt, lineId, ?, max, ?]
TOT line = [total_label, total_num, odds_over, odds_under, lineId, ?, max, ?]
ML       = [odds1, oddsX_or_null, odds2, lineId, ?, max, ?]
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, Optional

log = logging.getLogger(__name__)

# https://www.ps3838.com sport ids (proven via compact/events sp=XX)
SPORT_ID_MAP = {
    "soccer": 29,
    "tennis": 33,
    "basketball": 4,
    "hockey": 19,
    "baseball": 3,
    "volleyball": 34,
    "handball": 18,
    "table tennis": 32,
    "esports": 12,
    "american football": 15,
    "rugby": 27,
    "mma": 22,
    "boxing": 6,
    "darts": 10,
    "snooker": 28,
    "futsal": 16,
    "cricket": 8,
    "beach volleyball": 5,
    "lacrosse": 21,
    "water polo": 36,
    "padel tennis": 37,
}

CACHE_TTL_SEC = 4.0
NEGATIVE_EVENT_TTL_SEC = float(os.environ.get("PS3838_NEGATIVE_EVENT_TTL_SEC", "8.0"))
EVENT_STATE_PRUNE_INTERVAL_SEC = float(os.environ.get("PS3838_EVENT_STATE_PRUNE_INTERVAL_SEC", "30.0"))
STRUCTURAL_LINE_EPSILON = 1e-6


def normalize_sport(name: str) -> Optional[int]:
    if not name:
        return None
    s = name.lower().strip()
    if s in SPORT_ID_MAP:
        return SPORT_ID_MAP[s]
    # Russian labels frequently come as "Футбол - США - Кубок"
    base = s.split(" - ", 1)[0].strip()
    return SPORT_ID_MAP.get(base)


class CompactCache:
    """Sport-wide live cache + per-event fallback fetch.

    - Per-sport live snapshot is fetched once per CACHE_TTL_SEC.
    - When a requested event is missing from the live snapshot (typical for
      prematch events not currently broadcast as live), we fall back to the
      single-event variant `compact/events?ev=<id>&sp=<sport>` which the SPA
      itself uses when opening an event card. Single-event responses are
      cached for a shorter window to keep odds reasonably fresh.
    """

    EVENT_TTL_SEC = 4.0

    SPORT_QUERY: dict[int, dict[str, str]] = {
        29: {"pimo": "0,1,8,39,2,3,6,7,4,5", "inl": "false"},   # Soccer
        4:  {"pimo": "0,1,2", "inl": "false"},                   # Basketball
        19: {"pimo": "0,1", "inl": "false"},                     # Hockey
        33: {"pimo": "0,1", "inl": "true"},                      # Tennis
        7:  {"pimo": "0,1", "inl": "false"},                     # Volleyball
        9:  {"pimo": "0,1", "inl": "false"},                     # Handball
        3:  {"pimo": "0,1,2,3,4,5,6,7,8,9", "inl": "false"},     # Baseball
        15: {"pimo": "0,1,2,3,4,5", "inl": "false"},             # American football
    }
    DEFAULT_QUERY = {"pimo": "0,1", "inl": "false"}

    def __init__(self, session) -> None:
        self._session = session
        self._lock = asyncio.Lock()
        self._cache: dict[int, dict[str, Any]] = {}  # sport_id -> {ts, events:{event_id:event_dict}}
        self._event_cache: dict[tuple[int, int], tuple[float, Optional[dict[str, Any]]]] = {}
        self._event_locks: dict[tuple[int, int], asyncio.Lock] = {}
        self._last_event_prune_ts = 0.0

    def _prune_event_state(self, now: float) -> None:
        if now - self._last_event_prune_ts < EVENT_STATE_PRUNE_INTERVAL_SEC:
            return
        self._last_event_prune_ts = now
        for key, (ts, value) in list(self._event_cache.items()):
            ttl = self.EVENT_TTL_SEC if value is not None else NEGATIVE_EVENT_TTL_SEC
            if now - ts >= ttl:
                self._event_cache.pop(key, None)
        for key, lock in list(self._event_locks.items()):
            if key not in self._event_cache and not lock.locked():
                self._event_locks.pop(key, None)

    def _build_path(self, sport_id: int, event_id: int = 0) -> str:
        ts = int(time.time() * 1000)
        ev_param = str(event_id) if event_id else ""
        q = self.SPORT_QUERY.get(int(sport_id), self.DEFAULT_QUERY)
        from urllib.parse import quote
        pimo_enc = quote(q["pimo"], safe="")
        inl = q["inl"]
        return (
            "/sports-service/sv/compact/events?"
            f"btg=1&c=&cl=3&d=&ec=&ev={ev_param}&g=QQ%3D%3D&hle=false&ic=false&ice=false&inl={inl}&"
            "l=3&lang=&lg=&lv=0&me=0&me01=&mk=1&more=false&o=1&ot=1&pa=0&"
            f"pimo={pimo_enc}&pn=-1&pv=1&"
            f"sp={sport_id}&tm=0&v=0&locale=en_US&_={ts}&withCredentials=true"
        )

    def _parse_body(self, body: Any) -> dict[int, Any]:
        out: dict[int, Any] = {}
        if not isinstance(body, dict):
            return out
        # PS3838 splits the response into two top-level buckets:
        #   "l" — live events that are in-play right now
        #   "n" — prematch (non-live) events scheduled for later today/tomorrow
        # We need both: most arbs in the feed are prematch.
        for bucket_key in ("l", "n"):
            leagues = body.get(bucket_key) or []
            for sport_entry in leagues:
                if not isinstance(sport_entry, list) or len(sport_entry) < 3:
                    continue
                for league_entry in sport_entry[2] or []:
                    if not isinstance(league_entry, list) or len(league_entry) < 3:
                        continue
                    league_id = league_entry[0]
                    league_name = league_entry[1]
                    for ev in league_entry[2] or []:
                        if not isinstance(ev, list) or len(ev) < 9:
                            continue
                        try:
                            eid = int(ev[0])
                        except Exception:
                            continue
                        out[eid] = {
                            "raw": ev,
                            "league_id": league_id,
                            "league_name": league_name,
                            "home": ev[1],
                            "away": ev[2],
                            "is_live": bucket_key == "l",
                        }
        return out

    async def _fetch(self, sport_id: int) -> dict[int, Any]:
        path = self._build_path(sport_id, 0)
        status, body = await self._session.request_json("GET", path)
        if status != 200:
            log.warning("compact/events sp=%d → status=%s", sport_id, status)
            return {}
        return self._parse_body(body)

    async def _fetch_event(self, sport_id: int, event_id: int) -> Optional[dict[str, Any]]:
        path = self._build_path(sport_id, event_id)
        status, body = await self._session.request_json("GET", path)
        if status != 200:
            log.warning("compact/events ev=%d → status=%s", event_id, status)
            return None
        parsed = self._parse_body(body)
        return parsed.get(int(event_id))

    async def get_event(self, sport_id: int, event_id: int) -> Optional[dict[str, Any]]:
        now = time.time()
        async with self._lock:
            self._prune_event_state(now)
            entry = self._cache.get(sport_id)
            if not entry or now - entry["ts"] >= CACHE_TTL_SEC:
                events = await self._fetch(sport_id)
                entry = {"ts": time.time(), "events": events}
                self._cache[sport_id] = entry
        ev = entry["events"].get(int(event_id))
        if ev:
            return ev

        # Per-event fallback (typical for prematch events not in live snapshot).
        # Keyed by (sport_id, event_id) since the same event_id with the wrong
        # sport hint returns empty and would otherwise poison the cache.
        # Cache negative responses briefly too. Without this, a UI that polls
        # a missing/unsupported prematch event can hammer the single-event
        # compact endpoint every render. The key includes sport_id, so a later
        # request with the right sport hint still reaches the network.
        key = (int(sport_id), int(event_id))
        cached = self._event_cache.get(key)
        if cached:
            ttl = self.EVENT_TTL_SEC if cached[1] is not None else NEGATIVE_EVENT_TTL_SEC
            if now - cached[0] < ttl:
                return cached[1]
            self._event_cache.pop(key, None)
        lock = self._event_locks.setdefault(key, asyncio.Lock())
        async with lock:
            cached = self._event_cache.get(key)
            if cached:
                ttl = self.EVENT_TTL_SEC if cached[1] is not None else NEGATIVE_EVENT_TTL_SEC
                if time.time() - cached[0] < ttl:
                    return cached[1]
                self._event_cache.pop(key, None)
            ev = await self._fetch_event(sport_id, event_id)
            self._event_cache[key] = (time.time(), ev)
            return ev


# ──────────────────────────────────────────────────────────────────────────────
# Резолвер lineId внутри одного события


def _periods_dict(event_dict: dict[str, Any]) -> dict[str, Any]:
    raw = event_dict.get("raw") or []
    if not isinstance(raw, list):
        return {}
    for cell in raw:
        if isinstance(cell, dict):
            return cell
    return {}


def _approx_eq(a: float, b: float, tol: float = STRUCTURAL_LINE_EPSILON) -> bool:
    return abs(float(a) - float(b)) <= tol


def resolve_line_meta(
    event_dict: dict[str, Any],
    *,
    period: int,
    bet_type: int,
    team_select: int,
    handicap: float,
) -> Optional[dict[str, Any]]:
    """Resolve {line_id, odds, is_alt} for given selection.

    Encapsulates the per-bet-type lookup logic. Each line entry in PS3838's
    compact payload has an `is_alt` flag at index 8/5; we propagate it so the
    `oddsId` is built correctly (PS3838 betslip requires `is_alt=1` for
    alternative lines).
    """
    periods = _periods_dict(event_dict)
    if not periods:
        return None
    p = periods.get(str(int(period)))
    if not isinstance(p, list) or len(p) < 3:
        return None

    hcp_block = p[0] if len(p) > 0 else None
    tot_block = p[1] if len(p) > 1 else None
    ml_block = p[2] if len(p) > 2 else None

    bt = int(bet_type)
    h = float(handicap or 0)

    if bt == 1:
        if not isinstance(ml_block, list) or len(ml_block) < 4:
            return None
        try:
            line_id = int(ml_block[3])
        except Exception:
            return None
        odds_map = {
            0: ml_block[1] if len(ml_block) > 1 else None,
            1: ml_block[0] if len(ml_block) > 0 else None,
            2: ml_block[2] if len(ml_block) > 2 else None,
        }
        odds_val = odds_map.get(int(team_select))
        try:
            odds_f = float(odds_val) if odds_val is not None else None
        except Exception:
            odds_f = None
        if not line_id or odds_f is None or odds_f <= 1.0:
            return None
        return {"line_id": line_id, "odds": odds_f, "is_alt": 0}

    if bt == 2:
        if not isinstance(hcp_block, list):
            return None
        # Exact signed match on the requested side.  The sign is part of the
        # selection identity and must never be inferred from a nearby price.
        want = float(h)
        candidates = []
        for line in hcp_block:
            if not isinstance(line, list) or len(line) < 8:
                continue
            try:
                h1 = float(line[0])
                h2 = float(line[1])
                lid = int(line[7])
            except Exception:
                continue
            actual = h1 if int(team_select) == 0 else h2
            if _approx_eq(actual, want):
                priority = 0
            else:
                continue
            odds_idx = 3 if int(team_select) == 0 else 4
            try:
                odds_val = float(line[odds_idx])
            except Exception:
                odds_val = None
            is_alt = 0
            if len(line) > 8:
                try:
                    is_alt = int(line[8])
                except Exception:
                    is_alt = 0
            candidates.append((priority, {
                "line_id": lid,
                "odds": odds_val,
                "is_alt": is_alt,
                "actual_handicap": actual,
            }))
        if not candidates:
            return None
        candidates.sort(key=lambda x: x[0])
        return candidates[0][1]

    if bt == 3:
        if not isinstance(tot_block, list):
            return None
        for line in tot_block:
            if not isinstance(line, list) or len(line) < 5:
                continue
            try:
                total_num = float(line[1])
                lid = int(line[4])
            except Exception:
                continue
            if not _approx_eq(total_num, h):
                continue
            odds_idx = 2 if int(team_select) == 3 else 3
            try:
                odds_val = float(line[odds_idx])
            except Exception:
                odds_val = None
            is_alt = 0
            if len(line) > 5:
                try:
                    is_alt = int(line[5])
                except Exception:
                    is_alt = 0
            return {"line_id": lid, "odds": odds_val, "is_alt": is_alt}
        return None

    # Individual totals (IT1=4 home, IT2=5 away). Compact `pimo=0,1,...` for soccer
    # includes IT blocks at index 4 (home IT) and 5 (away IT) when requested. The
    # block shape mirrors the main totals: [label, line, over_odds, under_odds,
    # line_id, is_alt?, max?, ...].
    if bt in (4, 5):
        block_idx = 4 if bt == 4 else 5
        if len(p) <= block_idx:
            return None
        it_block = p[block_idx]
        if not isinstance(it_block, list):
            return None
        for line in it_block:
            if not isinstance(line, list) or len(line) < 5:
                continue
            try:
                total_num = float(line[1])
                lid = int(line[4])
            except Exception:
                continue
            if not _approx_eq(total_num, h):
                continue
            # team_select per IT block (calibrated from betslip clicks):
            #   IT1 (bt=4): 5=Over, 0=Under
            #   IT2 (bt=5): 7=Over, 1=Under
            if bt == 4:
                odds_idx = 2 if int(team_select) == 5 else 3
            else:
                odds_idx = 2 if int(team_select) == 7 else 3
            try:
                odds_val = float(line[odds_idx])
            except Exception:
                odds_val = None
            is_alt = 0
            if len(line) > 5:
                try:
                    is_alt = int(line[5])
                except Exception:
                    is_alt = 0
            return {"line_id": lid, "odds": odds_val, "is_alt": is_alt}
        return None

    return None


def resolve_line_id(
    event_dict: dict[str, Any],
    *,
    period: int,
    bet_type: int,
    team_select: int,
    handicap: float,
) -> tuple[int, Optional[float]]:
    """Legacy 2-tuple wrapper around resolve_line_meta."""
    meta = resolve_line_meta(
        event_dict,
        period=period,
        bet_type=bet_type,
        team_select=team_select,
        handicap=handicap,
    )
    if not meta:
        return 0, None
    return int(meta["line_id"]), meta.get("odds")
