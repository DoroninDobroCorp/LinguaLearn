#!/usr/bin/env python3
"""
Сервис ставок PS3838 — централизованный HTTP API для верификации betslip и размещения ставок.

Эндпоинты:
  GET  /health          → здоровье сервиса + валидность сессии
  POST /verify          → верификация betslip (только чтение, безопасно)
  POST /place           → размещение реальной ставки (требует ENABLE_BETTING=true)
  GET  /balance         → текущий баланс аккаунта

Запускается на порту BET_SERVICE_PORT (по умолчанию 8769).
"""

import asyncio
import copy
import http.cookies
import json
import logging
import os
import re
import subprocess
import sys
import time
import uuid
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import aiohttp
from aiohttp import web
from yarl import URL

import urllib.parse

import config
from services.bia_exact_price import BiaExactPriceClient
from services.outcome_mapper import outcome_to_ps3838, is_standard_market

_STRUCTURAL_LINE_EPSILON = 1e-6

# ── Reverse period mapping: internal (Sansabet model) → PS3838 native ──────────
# Forward (sport_parsers.py): PS3838→internal
#   Basketball:     0→0, 1→5(half), 3→1(Q1), 4→2(Q2), 5→3(Q3), 6→4(Q4)
#   AmFootball:     0→0, 1→5(H1), 2→6(H2), 3→1(Q1), 4→2(Q2), 5→3(Q3), 6→4(Q4)
# Reverse: internal→PS3838
_BASKETBALL_PERIOD_REVERSE = {0: 0, 1: 3, 2: 4, 3: 5, 4: 6, 5: 1, 6: 2}
_AMFOOTBALL_PERIOD_REVERSE = {0: 0, 1: 3, 2: 4, 3: 5, 4: 6, 5: 1, 6: 2}
_HOCKEY_PERIOD_REVERSE = {0: 0, 1: 1, 2: 2, 3: 3, 4: 6}  # P0=incl OT→ps0, P4=regulation→ps6
_VERIFY_SPECIAL_DIAG_TYPES = {
    "double_chance",
    "draw_no_bet",
    "total_goals_range",
    "exact_total_goals",
    "home_exact_goals",
    "away_exact_goals",
    "three_way_handicap",
}
_VERIFY_SPECIAL_DIAG_RATE_LIMIT_SEC = 20.0
_VERIFY_SPECIAL_DIAG_MAX_KEYS = 5000
_verify_special_diag_last: Dict[str, float] = {}
_BETSLIP_RATE_LIMIT_BACKOFF_STEPS_SEC = tuple(
    float(chunk.strip())
    for chunk in os.environ.get("PS3838_BETSLIP_RATE_LIMIT_BACKOFF_STEPS_SEC", "1,3,5,10,20,60").split(",")
    if chunk.strip()
) or (1.0, 3.0, 5.0, 10.0, 20.0, 60.0)
_BETSLIP_RATE_LIMIT_KILL_BROWSER = os.environ.get("PS3838_BETSLIP_RATE_LIMIT_KILL_BROWSER", "1").strip().lower() not in {
    "0", "false", "no", "off"
}


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _exact_price_requested(body: Dict[str, Any]) -> bool:
    raw = body.get("exact_price")
    if isinstance(raw, dict):
        return _truthy(raw.get("enabled", raw.get("requested")))
    return _truthy(raw)


def _exact_structural_int(value: Any, *, default: int | None = None) -> int:
    if value is None or value == "":
        if default is not None:
            return default
        raise ValueError("BIA_STANDARD_SELECTION_INVALID")
    if isinstance(value, bool):
        raise ValueError("BIA_STANDARD_SELECTION_INVALID")
    try:
        parsed = Decimal(str(value).strip())
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError("BIA_STANDARD_SELECTION_INVALID") from None
    if not parsed.is_finite() or parsed != parsed.to_integral_value():
        raise ValueError("BIA_STANDARD_SELECTION_INVALID")
    return int(parsed)


def _bia_lookup_proof_params(
    period: int,
    selection: Optional[Dict[str, Any]],
) -> Tuple[int, Dict[str, Any], str]:
    """Build a selection-aware, price-free lookup identity and cache suffix."""
    selection = selection if isinstance(selection, dict) else {}
    lookup_period = _exact_structural_int(period, default=0)
    proof_params: Dict[str, Any] = {}
    if selection.get("bet_type") is not None:
        bet_type = _exact_structural_int(selection.get("bet_type"))
        team_select = _exact_structural_int(selection.get("team_select"))
        map_number = _exact_structural_int(selection.get("map_number"), default=0)
        game_number = _exact_structural_int(selection.get("game_number"), default=0)
        if (
            bet_type not in {1, 2, 3, 4, 5}
            or lookup_period < 0
            or map_number < 0
            or game_number < 0
            or (bet_type != 1 and selection.get("handicap") is None)
        ):
            raise ValueError("BIA_STANDARD_SELECTION_INVALID")
        lookup_period = 0 if map_number > 0 else lookup_period
        proof_params = {
            "proof": 1,
            "bet_type": bet_type,
            "team_select": team_select,
            "handicap": str(
                0 if bet_type == 1 and selection.get("handicap") is None
                else selection.get("handicap")
            ),
            "map_number": map_number,
            "game_number": game_number,
            "esports_unit": str(selection.get("esports_unit") or ""),
        }
        tennis_unit = str(selection.get("tennis_unit") or "").strip().lower()
        if tennis_unit:
            proof_params["tennis_unit"] = tennis_unit
    cache_suffix = json.dumps(proof_params, sort_keys=True, separators=(",", ":"))
    return lookup_period, proof_params, cache_suffix


def _should_log_verify_special_diag(action: str, event_id: int, special_type: str,
                                    contestant: str, period: int) -> bool:
    rate_key = f"{action}|{event_id}|{special_type}|{contestant}|{period}"
    now = time.time()
    last = _verify_special_diag_last.get(rate_key, 0.0)
    if now - last < _VERIFY_SPECIAL_DIAG_RATE_LIMIT_SEC:
        return False
    _verify_special_diag_last[rate_key] = now
    if len(_verify_special_diag_last) > _VERIFY_SPECIAL_DIAG_MAX_KEYS:
        cutoff = now - _VERIFY_SPECIAL_DIAG_RATE_LIMIT_SEC * 2
        stale = [k for k, v in _verify_special_diag_last.items() if v < cutoff]
        for k in stale:
            del _verify_special_diag_last[k]
    return True

def _internal_to_ps3838_period(internal_period: int, sport_name: str) -> int:
    """Convert internal period number (Sansabet model) to PS3838 native period."""
    if sport_name == "Basketball":
        return _BASKETBALL_PERIOD_REVERSE.get(internal_period, internal_period)
    if sport_name == "AmericanFootball":
        return _AMFOOTBALL_PERIOD_REVERSE.get(internal_period, internal_period)
    if sport_name == "Hockey":
        return _HOCKEY_PERIOD_REVERSE.get(internal_period, internal_period)
    return internal_period


def _is_multiple_login_error(payload: Any) -> bool:
    if isinstance(payload, dict):
        payload = payload.get("error")
    if payload is None:
        return False
    text = str(payload).upper()
    return "MULTIPLE_LOGIN" in text or "MULTIPLE LOGIN" in text


def _is_rate_limit_error(payload: Any) -> bool:
    if payload is None:
        return False
    if isinstance(payload, (dict, list)):
        try:
            text = json.dumps(payload, ensure_ascii=False)
        except Exception:
            text = str(payload)
    else:
        text = str(payload)
    lowered = text.lower()
    return (
        "error 1015" in lowered
        or "rate limit" in lowered
        or "rate-limited" in lowered
        or "being rate limited" in lowered
        or '"status":429' in lowered
    )


def _cdp_browser_kill_patterns() -> List[str]:
    patterns: List[str] = []
    cdp_url = str(getattr(config, "PS3838_BROWSER_CDP_URL", "") or "").strip()
    if cdp_url:
        try:
            parsed = urllib.parse.urlparse(cdp_url)
            if parsed.port:
                patterns.append(f"remote-debugging-port={int(parsed.port)}")
        except Exception:
            pass
    patterns.append("launch_pin888_cdp_chrome.py")
    return patterns





def _find_line_id_in_map(market_map: dict, handicap: float) -> int:
    """Поиск LineId в распарсенной карте рынков (Totals/Handicap) по значению гандикапа."""
    if not market_map or not isinstance(market_map, dict):
        return 0
    h = float(handicap)
    # Точное совпадение строки (например "2.5", "3.0")
    for key_fmt in (f"{h:g}",):
        entry = market_map.get(key_fmt)
        if isinstance(entry, dict) and entry.get("LineId"):
            return int(entry["LineId"])
    # Numeric fallback is representation-only ("2,5" vs "2.5"), never fuzzy.
    for line_str, entry in market_map.items():
        if not isinstance(entry, dict):
            continue
        try:
            if abs(float(line_str.replace(",", ".")) - h) <= _STRUCTURAL_LINE_EPSILON:
                lid = entry.get("LineId", 0)
                if lid:
                    return int(lid)
        except (ValueError, TypeError):
            continue
    return 0


def _find_line_id_event_id_in_map(market_map: dict, handicap: float) -> tuple:
    """Поиск (LineId, LineEventId) в распарсенной карте рынков по значению гандикапа."""
    if not market_map or not isinstance(market_map, dict):
        return (0, 0)
    h = float(handicap)
    for key_fmt in (f"{h:g}",):
        entry = market_map.get(key_fmt)
        if isinstance(entry, dict) and entry.get("LineId"):
            return (int(entry["LineId"]), int(entry.get("LineEventId", 0)))
    for line_str, entry in market_map.items():
        if not isinstance(entry, dict):
            continue
        try:
            if abs(float(line_str.replace(",", ".")) - h) <= _STRUCTURAL_LINE_EPSILON:
                lid = entry.get("LineId", 0)
                if lid:
                    return (int(lid), int(entry.get("LineEventId", 0)))
        except (ValueError, TypeError):
            continue
    return (0, 0)


def _find_line_entry_in_map(market_map: dict, handicap: float) -> Optional[Dict[str, Any]]:
    """Lookup full parsed line entry by exact handicap value."""
    if not market_map or not isinstance(market_map, dict):
        return None
    h = float(handicap)
    for key_fmt in (f"{h:g}",):
        entry = market_map.get(key_fmt)
        if isinstance(entry, dict):
            return entry
    for line_str, entry in market_map.items():
        if not isinstance(entry, dict):
            continue
        try:
            if abs(float(line_str.replace(",", ".")) - h) <= _STRUCTURAL_LINE_EPSILON:
                return entry
        except (ValueError, TypeError):
            continue
    return None


def _selection_market_spec(selection: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    bet_type = int(selection.get("bet_type", 0) or 0)
    team_select = int(selection.get("team_select", 0) or 0)
    if bet_type == 1:
        return "Win1x2", {0: "Win1", 1: "Win2", 2: "WinNone"}.get(team_select)
    if bet_type == 2:
        return "Handicap", {0: "Win1", 1: "Win2"}.get(team_select)
    if bet_type == 3:
        return "Totals", {3: "WinMore", 4: "WinLess"}.get(team_select)
    if bet_type == 4:
        return "FirstTeamTotals", {5: "WinMore", 0: "WinLess"}.get(team_select)
    if bet_type == 5:
        return "SecondTeamTotals", {7: "WinMore", 1: "WinLess"}.get(team_select)
    return None, None


def _find_period_entry(ev: dict, period: int) -> Optional[Dict[str, Any]]:
    periods = ev.get("Periods") or []
    for candidate in periods:
        if isinstance(candidate, dict) and candidate.get("PeriodNumber") == period:
            return candidate
    if 0 <= period < len(periods) and isinstance(periods[period], dict):
        return periods[period]
    if period == 0 and periods and isinstance(periods[0], dict):
        return periods[0]
    return None


def _inspect_standard_selection(ev: dict, selection: Dict[str, Any], now_ts: Optional[float] = None) -> Dict[str, Any]:
    """Inspect exact parsed market/line/side before hitting expensive verify REST."""
    if not isinstance(ev, dict):
        return {"ok": False, "reason": "EVENT_MISSING"}

    market_key, side_key = _selection_market_spec(selection)
    if not market_key or not side_key:
        return {"ok": False, "reason": "UNSUPPORTED_SELECTION"}

    period_num = int(selection.get("period", 0) or 0)
    period = _find_period_entry(ev, period_num)
    if not isinstance(period, dict):
        return {"ok": False, "reason": "PERIOD_MISSING", "market_key": market_key}

    market_ts = 0.0
    mts = period.get("_market_ts")
    if isinstance(mts, dict):
        market_ts = float(mts.get(market_key) or 0.0)
    if market_ts <= 0:
        ts_val = period.get(f"_{market_key}_ts")
        if isinstance(ts_val, (int, float)):
            market_ts = float(ts_val)

    age_sec = None
    if now_ts is not None and market_ts > 0:
        age_sec = max(0.0, now_ts - market_ts)

    market = period.get(market_key)
    bet_type = int(selection.get("bet_type", 0) or 0)
    requested_line_id = int(selection.get("line_id", 0) or 0)

    if bet_type == 1:
        if not isinstance(market, dict):
            return {"ok": False, "reason": "MARKET_MISSING", "market_key": market_key, "age_sec": age_sec}
        side = market.get(side_key)
        if not isinstance(side, dict) or float(side.get("value") or 0) <= 1.0:
            return {"ok": False, "reason": "SIDE_MISSING", "market_key": market_key, "age_sec": age_sec}
        line_id = int(market.get("LineId", 0) or 0)
        if requested_line_id and line_id and requested_line_id != line_id:
            return {
                "ok": False,
                "reason": "LINE_ID_MISMATCH",
                "market_key": market_key,
                "age_sec": age_sec,
                "line_id": line_id,
                "parser_odds": side.get("value"),
            }
        return {
            "ok": True,
            "market_key": market_key,
            "age_sec": age_sec,
            "line_id": line_id,
            "parser_odds": side.get("value"),
        }

    if not isinstance(market, dict) or not market:
        return {"ok": False, "reason": "MARKET_MISSING", "market_key": market_key, "age_sec": age_sec}

    handicap = float(selection.get("handicap", 0) or 0)
    line_entry = _find_line_entry_in_map(market, handicap)
    if not isinstance(line_entry, dict):
        return {"ok": False, "reason": "LINE_MISSING", "market_key": market_key, "age_sec": age_sec}

    line_id = int(line_entry.get("LineId", 0) or 0)
    if requested_line_id and line_id and requested_line_id != line_id:
        return {
            "ok": False,
            "reason": "LINE_ID_MISMATCH",
            "market_key": market_key,
            "age_sec": age_sec,
            "line_id": line_id,
            "parser_odds": None,
        }

    side = line_entry.get(side_key)
    if not isinstance(side, dict) or float(side.get("value") or 0) <= 1.0:
        return {
            "ok": False,
            "reason": "SIDE_MISSING",
            "market_key": market_key,
            "age_sec": age_sec,
            "line_id": line_id,
        }

    return {
        "ok": True,
        "market_key": market_key,
        "age_sec": age_sec,
        "line_id": line_id,
        "line_event_id": int(line_entry.get("LineEventId", 0) or 0),
        "parser_odds": side.get("value"),
    }

SESSION_FILE = os.environ.get("SESSION_FILE", "pin888_ws_session.json")


def _default_owned_bet_session_file() -> str:
    session_path = Path(SESSION_FILE)
    return str(session_path.with_name(f"{session_path.stem}_bet_service{session_path.suffix}"))


BET_SERVICE_OWN_SESSION = _truthy(os.environ.get("PS3838_BET_SERVICE_OWN_SESSION", "0"))
BET_SERVICE_SESSION_FILE = os.environ.get(
    "PS3838_BET_SERVICE_SESSION_FILE",
    _default_owned_bet_session_file(),
)
BET_SERVICE_LOGIN_ID = os.environ.get("PS3838_BET_LOGIN_ID", "").strip()
BET_SERVICE_LOGIN_PASSWORD = os.environ.get("PS3838_BET_LOGIN_PASSWORD", "").strip()
BET_SERVICE_SITE_PROFILE = os.environ.get(
    "PS3838_BET_SITE_PROFILE",
    os.environ.get("PS3838_SITE_PROFILE", "pin888"),
).strip() or "pin888"
BET_SERVICE_SESSION_MAX_AGE_SEC = float(
    os.environ.get("PS3838_BET_SESSION_MAX_AGE_SEC", "1800")
)
BET_SERVICE_LOGIN_TIMEOUT_SEC = float(
    os.environ.get("PS3838_BET_LOGIN_TIMEOUT_SEC", "180")
)
BET_SERVICE_PORT = int(os.environ.get("BET_SERVICE_PORT", "8769"))
ENABLE_BETTING = os.environ.get("ENABLE_BETTING", "false").lower() == "true"
DRY_RUN = os.environ.get("DRY_RUN", "false").lower() == "true"
MAX_ALLOWED_STAKE = float(os.environ.get("MAX_ALLOWED_STAKE", "100"))
MIN_BET_INTERVAL_SEC = float(os.environ.get("MIN_BET_INTERVAL_SEC", "5"))

PS3838_BASE = config.PS3838_SITE_BASE_URL
PS3838_PARSER_URL = os.environ.get("PS3838_PARSER_URL", "http://parse_ps3838:8765")
VERIFY_CACHE_OK_SEC = float(os.environ.get("PS3838_VERIFY_CACHE_OK_SEC", "0.75"))
VERIFY_CACHE_MISS_SEC = float(os.environ.get("PS3838_VERIFY_CACHE_MISS_SEC", "2.5"))
VERIFY_PARSER_CACHE_SEC = float(os.environ.get("PS3838_VERIFY_PARSER_CACHE_SEC", "0.5"))
VERIFY_RECHECK_DELAY_SEC = float(os.environ.get("PS3838_VERIFY_RECHECK_DELAY_SEC", "0.15"))
VERIFY_LIVE_RECHECK_AGE_SEC = float(os.environ.get("PS3838_VERIFY_LIVE_RECHECK_AGE_SEC", "6"))
VERIFY_PREMATCH_RECHECK_AGE_SEC = float(os.environ.get("PS3838_VERIFY_PREMATCH_RECHECK_AGE_SEC", "30"))
_VALID_COOKIE_NAME_RE = re.compile(r"^[!#$%&'*+.^_`|~0-9A-Za-z-]+$")

def _runtime_base_url_from_session(data: Dict[str, Any]) -> str:
    origin = str(data.get("runtime_site_origin") or "").strip().rstrip("/")
    if origin.startswith("http://") or origin.startswith("https://"):
        return origin
    host = str(data.get("runtime_site_host") or "").strip()
    if host:
        return f"https://{host}"
    return PS3838_BASE


def _cookie_matches_host(cookie: Dict[str, Any], host: str) -> bool:
    normalized_host = str(host or "").strip().lower()
    if not normalized_host:
        return True
    domain = str(cookie.get("domain") or "").strip().lower().lstrip(".")
    if not domain:
        return True
    bare_host = normalized_host[4:] if normalized_host.startswith("www.") else normalized_host
    return (
        normalized_host == domain
        or normalized_host.endswith(f".{domain}")
        or domain == bare_host
        or domain.endswith(f".{bare_host}")
    )


def _filtered_session_cookies(cookies: List[Dict[str, Any]], base_url: str) -> List[Dict[str, Any]]:
    host = urllib.parse.urlparse(str(base_url or "").strip()).hostname or ""
    filtered: List[Dict[str, Any]] = []
    for cookie in cookies or []:
        if not isinstance(cookie, dict):
            continue
        name = str(cookie.get("name") or "").strip()
        if not name or not _VALID_COOKIE_NAME_RE.fullmatch(name):
            continue
        if not _cookie_matches_host(cookie, host):
            continue
        filtered.append(cookie)
    return filtered


def _required_headers(base_url: str) -> Dict[str, str]:
    root = str(base_url or PS3838_BASE).strip().rstrip("/") or PS3838_BASE
    return {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "Referer": f"{root}/en/sports/soccer",
    }


def _parser_ws_url() -> str:
    parsed = urllib.parse.urlparse(PS3838_PARSER_URL)
    scheme = "wss" if parsed.scheme == "https" else "ws"
    netloc = parsed.netloc or parsed.path
    return f"{scheme}://{netloc}"

log = logging.getLogger("bet_service")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [BET_SERVICE] %(message)s",
    datefmt="%H:%M:%S",
)


def _assert_no_local_auth_env() -> None:
    forbidden = [
        name
        for name in (
            "PS3838_EMAIL",
            "PS3838_PASSWORD",
            "PS3838_LOGIN_ID",
            "PS3838_LOGIN_PASSWORD",
            "PIN888_USERNAME",
            "PIN888_PASSWORD",
        )
        if str(os.environ.get(name, "")).strip()
    ]
    if forbidden:
        raise RuntimeError(
            "bet_service must not receive PS3838 auth env; parser is the sole session owner"
        )


def _scrub_local_auth_env() -> None:
    for name in (
        "PS3838_EMAIL",
        "PS3838_PASSWORD",
        "PS3838_LOGIN_ID",
        "PS3838_LOGIN_PASSWORD",
        "PIN888_USERNAME",
        "PIN888_PASSWORD",
    ):
        os.environ.pop(name, None)


def _assert_owned_session_env() -> None:
    if not BET_SERVICE_OWN_SESSION:
        return
    if not BET_SERVICE_LOGIN_ID or not BET_SERVICE_LOGIN_PASSWORD:
        raise RuntimeError(
            "PS3838_BET_SERVICE_OWN_SESSION=1 requires PS3838_BET_LOGIN_ID and PS3838_BET_LOGIN_PASSWORD"
        )

# ---------------------------------------------------------------------------
# Клиент ставок PS3838
# ---------------------------------------------------------------------------

class PS3838BetClient:
    """Клиент для взаимодействия с PS3838: верификация betslip, размещение ставок,
    получение баланса. Не логинится сам: только перечитывает обновлённую
    parser-сессию из SESSION_FILE."""
    def __init__(self, session_file: str, *, own_session: bool = False):
        self.session_file = session_file
        self._own_session = bool(own_session)
        self.cookies: List[Dict] = []
        self.v_hucode: Optional[str] = None
        self.directus_token: Optional[str] = None
        self.x_app_data: Optional[str] = None
        self._base_url: str = PS3838_BASE
        self._session: Optional[aiohttp.ClientSession] = None
        self._parser_session: Optional[aiohttp.ClientSession] = None  # shared session for parser HTTP calls
        self._bet_lock = asyncio.Lock()  # only for place_bet (real bets must be serialized)
        self._last_bet_ts: float = 0.0
        self._verify_min_interval: float = 0.5  # min 500ms between PS3838 verify calls
        self._started = time.time()
        self._session_mtime: float = 0.0
        self._session_epoch: int = 0
        self._verify_cache_ok_sec: float = VERIFY_CACHE_OK_SEC
        self._verify_cache_miss_sec: float = VERIFY_CACHE_MISS_SEC
        self._verify_parser_cache_sec: float = VERIFY_PARSER_CACHE_SEC
        self._verify_recheck_delay_sec: float = VERIFY_RECHECK_DELAY_SEC
        self._verify_live_recheck_age_sec: float = VERIFY_LIVE_RECHECK_AGE_SEC
        self._verify_prematch_recheck_age_sec: float = VERIFY_PREMATCH_RECHECK_AGE_SEC
        self._verify_result_cache: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
        self._verify_inflight: Dict[str, asyncio.Future] = {}
        self._parser_event_cache: Dict[int, Tuple[float, Dict[str, Any]]] = {}
        self._parser_bia_cache: Dict[Tuple[int, int, str], Tuple[float, Dict[str, Any]]] = {}
        self._cache_max_size: int = 2000  # hard cap for unbounded caches
        self._verify_gate_lock = asyncio.Lock()
        self._last_verify_dispatch_ts: float = 0.0
        self._betslip_rate_limit_streak: int = 0
        self._betslip_block_until: float = 0.0
        self._betslip_rate_limit_circuit_open: bool = False
        self._betslip_last_rate_limit_reason: str = ""
        self._betslip_browser_stop_requested: bool = False
        self._exact_price_enabled: bool = bool(getattr(config, "PS3838_VERIFY_EXACT_PRICE_ENABLED", False))
        self._exact_price_require_flag: bool = bool(getattr(config, "PS3838_VERIFY_EXACT_PRICE_REQUIRE_FLAG", True))
        self._exact_price_client: Optional[BiaExactPriceClient] = None
        self._owned_session_max_age_sec: float = BET_SERVICE_SESSION_MAX_AGE_SEC
        self._owned_login_timeout_sec: float = BET_SERVICE_LOGIN_TIMEOUT_SEC

    async def start(self):
        """Инициализация клиента: загрузка сессии и создание HTTP-сессии."""
        if self._own_session:
            refreshed = await self._ensure_owned_session(force=False, allow_unchanged=True)
            if not refreshed:
                self._load_session()
        else:
            self._load_session()
        # v-hucode должен быть 32-char hex (из localStorage). Cookie "u" — base64, не работает.
        if not self._is_valid_v_hucode(self.v_hucode):
            if self._own_session:
                log.warning("v-hucode looks invalid, forcing owned-session refresh...")
                await self._ensure_owned_session(force=True, allow_unchanged=True)
            else:
                log.warning("v-hucode looks invalid (not 32-char hex), attempting browser capture...")
                await asyncio.to_thread(self._capture_v_hucode)
            self._load_session()  # перечитываем после обновления файла
        await self._create_http_session()
        # Create shared session for parser HTTP calls eagerly
        self._parser_session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=2),
        )
        log.info("Client started, cookies=%d, v_hucode=%s", len(self.cookies), bool(self.v_hucode))
        # Try to get fresh cookies from browser immediately
        await self._maybe_reload_session()
        if self._exact_price_enabled:
            if config.BIA_LOGIN and config.BIA_PASSWORD:
                self._exact_price_client = BiaExactPriceClient()
                await self._exact_price_client.start()
            else:
                log.warning(
                    "Exact-price shadow is enabled but BIA credentials are missing; exact_price requests will be unavailable"
                )

    def exact_price_state(self) -> Dict[str, Any]:
        return {
            "enabled": self._exact_price_enabled,
            "require_flag": self._exact_price_require_flag,
            "available": self._exact_price_client is not None,
            "want_bookies": list(getattr(config, "PS3838_VERIFY_EXACT_PRICE_WANT_BOOKIES", ["pin88"])),
        }

    def session_owner_state(self) -> Dict[str, Any]:
        return {
            "mode": "owned" if self._own_session else "parser",
            "session_file": self.session_file,
            "site_profile": BET_SERVICE_SITE_PROFILE if self._own_session else None,
            "max_age_sec": self._owned_session_max_age_sec if self._own_session else None,
        }

    def _betslip_rate_limit_state(self) -> Dict[str, Any]:
        now = time.time()
        remaining = max(0.0, self._betslip_block_until - now)
        return {
            "streak": int(self._betslip_rate_limit_streak),
            "paused": remaining > 0.0,
            "pause_remaining_sec": round(remaining, 3),
            "circuit_open": bool(self._betslip_rate_limit_circuit_open),
            "browser_stop_requested": bool(self._betslip_browser_stop_requested),
            "last_reason": self._betslip_last_rate_limit_reason or None,
            "backoff_steps_sec": list(_BETSLIP_RATE_LIMIT_BACKOFF_STEPS_SEC),
        }

    async def _wait_for_verify_slot(self) -> Optional[List[Dict[str, Any]]]:
        while True:
            wait_for = 0.0
            async with self._verify_gate_lock:
                if self._betslip_rate_limit_circuit_open:
                    return [{
                        "status": "ERROR",
                        "error": "BETSLIP_RATE_LIMIT_CIRCUIT_OPEN",
                        "error_code": "BETSLIP_RATE_LIMIT_CIRCUIT_OPEN",
                    }]
                now = time.time()
                if self._betslip_block_until > now:
                    wait_for = self._betslip_block_until - now
                else:
                    gap = now - self._last_verify_dispatch_ts
                    if gap < self._verify_min_interval:
                        wait_for = self._verify_min_interval - gap
                    else:
                        self._last_verify_dispatch_ts = now
                        return None
            await asyncio.sleep(max(0.05, wait_for))

    async def _record_verify_rate_limit(self, *, status: int, detail: str) -> List[Dict[str, Any]]:
        shutdown_browser = False
        async with self._verify_gate_lock:
            self._betslip_rate_limit_streak += 1
            streak = int(self._betslip_rate_limit_streak)
            self._betslip_last_rate_limit_reason = (detail or f"HTTP {status}")[:300]
            if streak <= len(_BETSLIP_RATE_LIMIT_BACKOFF_STEPS_SEC):
                delay = float(_BETSLIP_RATE_LIMIT_BACKOFF_STEPS_SEC[streak - 1])
                self._betslip_block_until = max(self._betslip_block_until, time.time() + delay)
                log.warning(
                    "Betslip verify rate-limited: streak=%d http=%d backoff=%.0fs detail=%s",
                    streak,
                    status,
                    delay,
                    (detail or "")[:180],
                )
                return [{
                    "status": "ERROR",
                    "error": f"HTTP {status} RATE_LIMITED",
                    "error_code": "BETSLIP_RATE_LIMIT",
                    "retry_after_sec": delay,
                }]
            self._betslip_rate_limit_circuit_open = True
            self._betslip_block_until = float("inf")
            shutdown_browser = not self._betslip_browser_stop_requested
            self._betslip_browser_stop_requested = True
            log.error(
                "Betslip verify circuit opened after %d consecutive rate-limit blocks",
                streak,
            )
        if shutdown_browser:
            await self._shutdown_cdp_browser("betslip verify rate-limit circuit opened")
        return [{
            "status": "ERROR",
            "error": "BETSLIP_RATE_LIMIT_CIRCUIT_OPEN",
            "error_code": "BETSLIP_RATE_LIMIT_CIRCUIT_OPEN",
        }]

    async def _record_verify_success(self) -> None:
        async with self._verify_gate_lock:
            if (
                self._betslip_rate_limit_streak <= 0
                and self._betslip_block_until <= time.time()
                and not self._betslip_rate_limit_circuit_open
            ):
                return
            prev_streak = int(self._betslip_rate_limit_streak)
            self._betslip_rate_limit_streak = 0
            self._betslip_block_until = 0.0
            self._betslip_last_rate_limit_reason = ""
            self._betslip_rate_limit_circuit_open = False
        log.info("Betslip verify recovered: reset rate-limit streak from %d", prev_streak)

    async def _shutdown_cdp_browser(self, reason: str) -> None:
        if not _BETSLIP_RATE_LIMIT_KILL_BROWSER:
            log.error("Betslip browser shutdown skipped (disabled): %s", reason)
            return

        def _kill() -> None:
            for pattern in _cdp_browser_kill_patterns():
                try:
                    subprocess.run(["pkill", "-f", pattern], check=False, capture_output=True, text=True)
                except Exception:
                    log.exception("Failed to run pkill for pattern %r", pattern)

        log.error("Stopping CDP browser due to betslip rate-limit circuit: %s", reason)
        await asyncio.to_thread(_kill)

    @staticmethod
    def _is_valid_v_hucode(val: str) -> bool:
        """Корректный v-hucode — 32-символьная hex-строка из localStorage."""
        if not val or len(val) != 32:
            return False
        try:
            int(val, 16)
            return True
        except ValueError:
            return False

    def _capture_v_hucode(self):
        """Захват v-hucode через Playwright (headless browser)."""
        try:
            from core.session_manager import _capture_v_hucode_via_browser
            _capture_v_hucode_via_browser()
        except Exception as e:
            log.error("v-hucode capture failed: %s", e)

    def _load_session(self):
        """Загрузка куки и токенов из файла parser-сессии."""
        data, mtime = self._read_session_file()
        if data is None:
            log.warning("Cannot load session from %s — file missing or corrupted", self.session_file)
            return
        self._apply_session_data(data, mtime=mtime)

    def _apply_session_data(self, data: Dict[str, Any], mtime: Optional[float] = None) -> None:
        """Apply parser-owned session snapshot to current client state."""
        self._base_url = _runtime_base_url_from_session(data)
        self.cookies = _filtered_session_cookies(data.get("cookies", []), self._base_url)
        self.v_hucode = data.get("v_hucode") or os.environ.get("V_HUCODE", "")
        self.x_app_data = data.get("x_app_data") or os.environ.get("X_APP_DATA", "")
        self._session_epoch = int(data.get("session_epoch", 0) or 0)
        if not self.v_hucode or not self.x_app_data:
            log.warning("v_hucode or x_app_data not set — check session file or env vars V_HUCODE / X_APP_DATA")
        if mtime is None:
            try:
                mtime = os.path.getmtime(self.session_file)
            except OSError:
                mtime = 0.0
        self._session_mtime = float(mtime or 0.0)

    def _read_session_file(self) -> tuple[Optional[Dict[str, Any]], float]:
        try:
            mtime = os.path.getmtime(self.session_file)
        except OSError:
            return None, 0.0
        try:
            with open(self.session_file, "r") as f:
                data = json.load(f)
        except Exception as e:
            log.warning("Failed to read parser session file: %s", e)
            return None, 0.0
        return data, mtime

    async def _create_http_session(self):
        """Создание aiohttp-сессии с текущими куки и заголовками."""
        old_session = self._session
        headers = _required_headers(self._base_url)
        # Не отправляем пустые анти-бот заголовки: пустые значения вызывают HTTP 400
        if self.v_hucode:
            headers["v-hucode"] = self.v_hucode
        if self.x_app_data:
            headers["x-app-data"] = self.x_app_data
        jar = aiohttp.CookieJar(unsafe=True)
        new_session = aiohttp.ClientSession(headers=headers, cookie_jar=jar)
        response_url = URL(f"{self._base_url}/")
        for c in self.cookies:
            name = str(c.get("name") or "").strip()
            if not name:
                continue
            value = str(c.get("value") or "")
            simple_cookie = http.cookies.SimpleCookie()
            simple_cookie[name] = value
            morsel = simple_cookie[name]
            domain = str(c.get("domain") or "").strip()
            path = str(c.get("path") or "/").strip() or "/"
            if domain:
                morsel["domain"] = domain
            morsel["path"] = path
            jar.update_cookies(simple_cookie, response_url=response_url)
        # Swap atomically: in-flight requests on old session can finish
        self._session = new_session
        if old_session and not old_session.closed:
            # Grace period for in-flight requests to complete
            await asyncio.sleep(0.5)
            try:
                await old_session.close()
            except Exception:
                pass  # noqa: BLE001 — best effort cleanup

    def _get_parser_session(self) -> aiohttp.ClientSession:
        """Lazy-init shared session for parser HTTP calls."""
        if self._parser_session is None or self._parser_session.closed:
            self._parser_session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=2),
            )
        return self._parser_session

    def _evict_if_over(self, cache: dict) -> None:
        """Evict oldest entries if cache exceeds max size."""
        if len(cache) <= self._cache_max_size:
            return
        # Sort by timestamp (first element of tuple value) and remove oldest half
        to_remove = len(cache) - self._cache_max_size // 2
        entries = sorted(cache.items(), key=lambda kv: kv[1][0])
        for key, _ in entries[:to_remove]:
            cache.pop(key, None)

    async def close(self):
        """Закрытие HTTP-сессии."""
        if self._session and not self._session.closed:
            await self._session.close()
        if self._parser_session and not self._parser_session.closed:
            await self._parser_session.close()
        if self._exact_price_client is not None:
            await self._exact_price_client.close()

    async def _maybe_reload_session(self) -> bool:
        """Reload parser-owned or owned session depending on runtime mode."""
        if self._own_session:
            return await self._ensure_owned_session(force=False, allow_unchanged=False)
        return await self._reload_session_from_parser_file()

    def _session_snapshot_usable(self, data: Dict[str, Any]) -> bool:
        if not isinstance(data, dict):
            return False
        cookies = data.get("cookies")
        if not isinstance(cookies, list) or not cookies:
            return False
        return bool(data.get("v_hucode") and data.get("x_app_data"))

    def _owned_session_is_fresh(self, mtime: float) -> bool:
        if mtime <= 0:
            return False
        return (time.time() - float(mtime)) <= self._owned_session_max_age_sec

    def _build_owned_login_env(self) -> Dict[str, str]:
        env = dict(os.environ)
        for name in (
            "PS3838_EMAIL",
            "PS3838_PASSWORD",
            "PS3838_LOGIN_ID",
            "PS3838_LOGIN_PASSWORD",
            "PIN888_USERNAME",
            "PIN888_PASSWORD",
        ):
            env.pop(name, None)

        env["SESSION_FILE"] = self.session_file
        env["PS3838_SESSION_FILE"] = self.session_file
        env["PS3838_SITE_PROFILE"] = BET_SERVICE_SITE_PROFILE
        env["PS3838_LOGIN_ID"] = BET_SERVICE_LOGIN_ID
        env["PS3838_LOGIN_PASSWORD"] = BET_SERVICE_LOGIN_PASSWORD
        env["PS3838_EMAIL"] = BET_SERVICE_LOGIN_ID
        env["PS3838_PASSWORD"] = BET_SERVICE_LOGIN_PASSWORD
        env["PIN888_USERNAME"] = BET_SERVICE_LOGIN_ID
        env["PIN888_PASSWORD"] = BET_SERVICE_LOGIN_PASSWORD
        return env

    def _run_owned_login_once(self) -> bool:
        cmd = [
            sys.executable,
            "-c",
            (
                "from core.session_manager import perform_site_login_once; "
                "import sys; "
                "sys.exit(0 if perform_site_login_once() else 1)"
            ),
        ]
        try:
            proc = subprocess.run(
                cmd,
                cwd=str(Path(__file__).resolve().parents[1]),
                env=self._build_owned_login_env(),
                capture_output=True,
                text=True,
                timeout=self._owned_login_timeout_sec,
            )
        except subprocess.TimeoutExpired:
            log.error("Owned-session login timed out after %.1fs", self._owned_login_timeout_sec)
            return False
        if proc.returncode == 0:
            return True
        stderr = (proc.stderr or "").strip()
        stdout = (proc.stdout or "").strip()
        detail = stderr or stdout or f"exit {proc.returncode}"
        log.error("Owned-session login failed: %s", detail)
        return False

    async def _ensure_owned_session(
        self,
        *,
        force: bool,
        allow_unchanged: bool,
    ) -> bool:
        data, mtime = self._read_session_file()
        if (
            not force
            and self._session_snapshot_usable(data or {})
            and self._owned_session_is_fresh(mtime)
        ):
            return await self._reload_session_from_parser_file(allow_unchanged=allow_unchanged)

        if not await asyncio.to_thread(self._run_owned_login_once):
            return False
        return await self._reload_session_from_parser_file(allow_unchanged=True)

    async def _reload_session_from_parser_file(self, allow_unchanged: bool = False) -> bool:
        data, mtime = self._read_session_file()
        if not isinstance(data, dict):
            return False
        next_epoch = int(data.get("session_epoch", 0) or 0)
        changed = mtime > self._session_mtime or next_epoch > self._session_epoch
        if not changed and not allow_unchanged:
            return False
        prev_mtime = self._session_mtime
        prev_epoch = self._session_epoch
        self._apply_session_data(data, mtime=mtime)
        await self._create_http_session()
        if changed:
            log.info(
                "Session reloaded from parser file: cookies=%d epoch=%d→%d mtime=%.0f→%.0f",
                len(self.cookies), prev_epoch, self._session_epoch, prev_mtime, self._session_mtime
            )
        else:
            log.info(
                "Session rebuilt from unchanged parser file: cookies=%d epoch=%d mtime=%.0f",
                len(self.cookies), self._session_epoch, self._session_mtime
            )
        return True

    # -----------------------------------------------------------------------
    # Получение LineId из внутреннего состояния parse_ps3838
    # -----------------------------------------------------------------------

    async def _fetch_line_id(self, event_id: int, period: int, bet_type: int,
                              team_select: int, handicap: float,
                              game_number: int = 0) -> tuple:
        """Получение lineId из parse_ps3838.
        Возвращает (line_id, betslip_event_id, ps3838_period, sport_name).
        
        betslip_event_id logic (Tennis/TableTennis child events):
        - ML (bet_type 1): PARENT event_id (match winner is on parent)
          Exception: game-level ML (game_number > 0) uses child event_id
        - Totals/Handicaps (bet_type 2,3,4,5): child event_id из period_event_ids
          (Games totals/handicaps живут на child event в PS3838)
        - Для спортов без child events (Soccer, Basketball, etc.): всегда parent
        
        period — внутренний номер периода (модель Sansabet: Q1=1, Q2=2, ... Half=5).
        ps3838_period — нативный номер PS3838 (Q1=3, Q2=4, ... Half=1)."""
        try:
            ev = await self._fetch_parser_event(event_id)
            if not ev:
                return 0, event_id, period, ""
        except Exception as e:
            log.debug("Failed to fetch lineId from parser: %s", e)
            return 0, event_id, period, ""
        raw = ev.get("Raw", {})
        sport_name = ev.get("SportName", "")
        ps3838_period = _internal_to_ps3838_period(period, sport_name)
        if ps3838_period != period:
            log.info("Period remap: internal=%d → ps3838=%d (sport=%s, event=%s)",
                     period, ps3838_period, sport_name, event_id)

        # Определяем event_id для betslip:
        # ML → parent (кроме game-level ML где game_number > 0), Totals/Handicaps → child (если есть)
        period_event_ids = raw.get("period_event_ids", {}) if isinstance(raw, dict) else {}
        child_eid = period_event_ids.get(str(ps3838_period))
        # Fallback: game-level period (e.g. 22 for S2G4) may not be in period_event_ids,
        # but the set-level period (e.g. "2" for Set 2) should map to the correct child event
        if not child_eid and game_number:
            set_period = (ps3838_period - 6) // 13 + 1 if ps3838_period >= 6 else period
            child_eid = period_event_ids.get(str(set_period))
            if child_eid:
                log.info("Game period %d not in period_event_ids, falling back to set %d → child %s",
                         ps3838_period, set_period, child_eid)
        if child_eid and int(child_eid) != event_id and (bet_type != 1 or game_number):
            betslip_eid = int(child_eid)
            log.info("Using child event_id=%d for bet_type=%d game_number=%d (parent=%d)",
                     betslip_eid, bet_type, game_number, event_id)
        else:
            betslip_eid = event_id

        # --- Основной метод: чтение LineId из распарсенных данных периода ---
        lid, line_event_id = self._extract_line_id_parsed(ev, period, bet_type, team_select, handicap)
        if lid:
            if line_event_id:
                betslip_eid = line_event_id
            return lid, betslip_eid, ps3838_period, sport_name

        # --- Фоллбэк: парсинг сырого odds_block (использует PS3838 native period) ---
        odds_block = raw.get("odds_block", {}) if isinstance(raw, dict) else {}
        period_data = odds_block.get(str(ps3838_period))
        if period_data and isinstance(period_data, list):
            lid = self._extract_line_id(period_data, bet_type, team_select, handicap)
            if lid:
                return lid, betslip_eid, ps3838_period, sport_name

        return 0, betslip_eid, ps3838_period, sport_name

    async def _fetch_special_ids(self, event_id: int, special_type: str,
                                  contestant: str, period: int,
                                  handicap: float) -> Optional[Dict[str, Any]]:
        """Lookup special market contestant_id via parser HTTP (in-memory, no file)."""
        qs = urllib.parse.urlencode({
            "event_id": event_id, "type": special_type,
            "contestant": contestant, "period": period, "handicap": handicap,
        })
        url = f"{PS3838_PARSER_URL}/lookup-special?{qs}"
        try:
            sess = self._get_parser_session()
            async with sess.get(url) as resp:
                if resp.status != 200:
                    return None
                data = await resp.json()
                return data if data.get("found") else None
        except Exception as e:
            log.debug("Failed to fetch special IDs from parser: %s", e)
            return None

    async def _fetch_special_stats(self) -> Dict[str, int]:
        """Fetch special IDs store stats from parser HTTP."""
        try:
            sess = self._get_parser_session()
            url = f"{PS3838_PARSER_URL}/lookup-special?stats=1"
            async with sess.get(url) as resp:
                if resp.status == 200:
                    return await resp.json()
        except Exception:
            log.warning("Failed to fetch special lookup stats")
        return {"events": 0, "entries": 0}

    async def _fetch_parser_event(self, event_id: int, force_refresh: bool = False) -> Optional[Dict[str, Any]]:
        now = time.time()
        cached = self._parser_event_cache.get(event_id)
        if (
            not force_refresh
            and cached is not None
            and now - cached[0] <= self._verify_parser_cache_sec
        ):
            return copy.deepcopy(cached[1])

        url = f"{PS3838_PARSER_URL}/event/{event_id}"
        try:
            sess = self._get_parser_session()
            async with sess.get(url) as resp:
                if resp.status != 200:
                    return None
                data = await resp.json()
        except Exception as e:
            log.debug("Failed to fetch parser event %s: %s", event_id, e)
            return None

        ev = data.get("data")
        if not isinstance(ev, dict):
            return None
        self._parser_event_cache[event_id] = (now, ev)
        self._evict_if_over(self._parser_event_cache)
        return copy.deepcopy(ev)

    async def _fetch_bia_event_ref(
        self,
        event_id: int,
        period: int,
        selection: Optional[Dict[str, Any]] = None,
        force_refresh: bool = False,
    ) -> Optional[Dict[str, Any]]:
        lookup_period, proof_params, proof_cache_key = _bia_lookup_proof_params(period, selection)
        cache_key = (int(event_id), lookup_period, proof_cache_key)
        now = time.time()
        cached = self._parser_bia_cache.get(cache_key)
        if (
            not force_refresh
            and cached is not None
            and now - cached[0] <= self._verify_parser_cache_sec
        ):
            return copy.deepcopy(cached[1])

        qs = urllib.parse.urlencode({
            "event_id": event_id,
            "period": lookup_period,
            **proof_params,
        })
        url = f"{PS3838_PARSER_URL}/lookup-bia?{qs}"
        try:
            sess = self._get_parser_session()
            async with sess.get(url) as resp:
                if resp.status != 200:
                    return None
                data = await resp.json()
        except Exception as e:
            log.debug("Failed to fetch BIA event ref for %s period=%s: %s", event_id, lookup_period, e)
            return None

        if not data.get("found"):
            return None
        self._parser_bia_cache[cache_key] = (now, data)
        self._evict_if_over(self._parser_bia_cache)
        return copy.deepcopy(data)

    async def maybe_attach_exact_price(
        self,
        selections: List[Dict[str, Any]],
        results: List[Dict[str, Any]],
        *,
        requested: bool,
    ) -> List[Dict[str, Any]]:
        if not results:
            return results
        if not self._exact_price_enabled:
            if not requested:
                return results
            enriched = copy.deepcopy(results)
            for item in enriched:
                item["exact_price"] = {
                    "status": "DISABLED",
                    "error_code": "EXACT_PRICE_DISABLED",
                    "bookie": "pin88",
                }
            return enriched
        if self._exact_price_require_flag and not requested:
            return results

        enriched = copy.deepcopy(results)
        for idx, result in enumerate(enriched):
            selection = selections[idx] if idx < len(selections) else {}
            raw_event_id = selection.get("event_id", result.get("event_id"))
            try:
                event_id = int(raw_event_id)
            except (TypeError, ValueError):
                result["exact_price"] = {
                    "status": "UNAVAILABLE",
                    "error_code": "EVENT_ID_MISSING",
                    "bookie": "pin88",
                }
                continue
            period = selection.get("period", result.get("period_num", 0))
            try:
                event_ref = await self._fetch_bia_event_ref(event_id, period, selection=selection)
            except ValueError as exc:
                result["exact_price"] = {
                    "status": "UNAVAILABLE",
                    "error_code": str(exc) or "BIA_STANDARD_SELECTION_INVALID",
                    "bookie": "pin88",
                }
                continue
            if not event_ref:
                result["exact_price"] = {
                    "status": "UNAVAILABLE",
                    "error_code": "BIA_EVENT_NOT_FOUND",
                    "bookie": "pin88",
                }
                continue
            if self._exact_price_client is None:
                result["exact_price"] = {
                    "status": "UNAVAILABLE",
                    "error_code": "EXACT_PRICE_CLIENT_UNAVAILABLE",
                    "bookie": "pin88",
                }
                continue
            quote = await self._exact_price_client.quote_pin88(event_ref, selection)
            quote["event_ref"] = {
                "sport_code": event_ref.get("sport_code"),
                "event_key": event_ref.get("event_key"),
                "period": event_ref.get("period"),
                "swapped": event_ref.get("swapped"),
            }
            if quote.get("status") == "OK":
                try:
                    quote["vs_verify_odds_delta"] = round(float(quote["odds"]) - float(result.get("odds")), 4)
                except (TypeError, ValueError):
                    pass
            result["exact_price"] = quote
        return enriched

    @staticmethod
    def _verify_cache_key(selections: List[Dict[str, Any]]) -> str:
        return json.dumps(selections, sort_keys=True, separators=(",", ":"), ensure_ascii=True)

    def _get_cached_verify_result(self, cache_key: str) -> Optional[List[Dict[str, Any]]]:
        cached = self._verify_result_cache.get(cache_key)
        if not cached:
            return None
        expires_at, results = cached
        if time.time() >= expires_at:
            self._verify_result_cache.pop(cache_key, None)
            return None
        return copy.deepcopy(results)

    def _store_verify_result(self, cache_key: str, results: List[Dict[str, Any]]) -> None:
        if not results:
            return
        statuses = {str(item.get("status", "")) for item in results if isinstance(item, dict)}
        ttl = self._verify_cache_ok_sec
        if statuses and statuses.issubset({"UNAVAILABLE", "ERROR"}):
            ttl = self._verify_cache_miss_sec
        elif "UNAVAILABLE" in statuses:
            ttl = max(self._verify_cache_ok_sec, min(self._verify_cache_miss_sec, 1.5))
        self._verify_result_cache[cache_key] = (time.time() + ttl, copy.deepcopy(results))
        self._evict_if_over(self._verify_result_cache)

    def _should_recheck_parser_view(self, ev: Optional[Dict[str, Any]], inspection: Dict[str, Any]) -> bool:
        if not isinstance(ev, dict):
            return False
        if not inspection.get("ok"):
            return ev.get("isLive") is True
        age_sec = inspection.get("age_sec")
        if age_sec is None:
            return False
        threshold = (
            self._verify_live_recheck_age_sec
            if ev.get("isLive") is True
            else self._verify_prematch_recheck_age_sec
        )
        return age_sec >= threshold > 0

    @staticmethod
    def _blocked_verify_result(
        selection: Dict[str, Any],
        inspection: Dict[str, Any],
    ) -> Dict[str, Any]:
        result = {
            "status": "UNAVAILABLE",
            "odds": inspection.get("parser_odds"),
            "selection_id": None,
            "line_id": inspection.get("line_id"),
            "alt_line_id": None,
            "current_score": None,
            "event_id": selection.get("event_id"),
            "bet_type": selection.get("bet_type"),
            "handicap": selection.get("handicap"),
            "period_num": selection.get("period"),
            "error_code": inspection.get("reason", "PARSER_PRECHECK_FAILED"),
            "parser_market": inspection.get("market_key"),
        }
        age_sec = inspection.get("age_sec")
        if isinstance(age_sec, (int, float)):
            result["parser_age_sec"] = round(age_sec, 3)
        return result

    async def _precheck_selection(self, selection: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if selection.get("is_outright"):
            return None
        if int(selection.get("game_number", 0) or 0) > 0:
            return None

        bet_type = int(selection.get("bet_type", 0) or 0)
        if bet_type not in (1, 2, 3, 4, 5):
            return None

        sport_name = str(selection.get("sport", "") or "")
        handicap = float(selection.get("handicap", 0) or 0)
        if bet_type == 2 and handicap == 0 and any(s in sport_name.lower() for s in ("hockey", "handball")):
            return None

        event_id = int(selection.get("event_id", 0) or 0)
        if event_id <= 0:
            return self._blocked_verify_result(selection, {"reason": "EVENT_MISSING"})

        ev = await self._fetch_parser_event(event_id)
        inspection = _inspect_standard_selection(ev, selection, time.time())
        if self._should_recheck_parser_view(ev, inspection):
            await asyncio.sleep(self._verify_recheck_delay_sec)
            ev = await self._fetch_parser_event(event_id, force_refresh=True)
            inspection = _inspect_standard_selection(ev, selection, time.time())

        # Parser-side event lookup is only a cheap guard. If it is missing or
        # transiently unavailable, do not hard-block the expensive truth-path.
        if ev is None:
            return None

        if inspection.get("ok"):
            return None
        if inspection.get("reason") == "UNSUPPORTED_SELECTION":
            return None
        return self._blocked_verify_result(selection, inspection)

    async def verify_betslip_guarded(self, selections: List[Dict]) -> List[Dict]:
        """Guarded verify: exact-line precheck + dedupe/debounce + short miss cache."""
        cache_key = self._verify_cache_key(selections)
        cached = self._get_cached_verify_result(cache_key)
        if cached is not None:
            return cached

        inflight = self._verify_inflight.get(cache_key)
        if inflight is not None:
            return copy.deepcopy(await asyncio.shield(inflight))

        loop = asyncio.get_running_loop()
        future: asyncio.Future = loop.create_future()
        self._verify_inflight[cache_key] = future
        try:
            results: List[Optional[Dict[str, Any]]] = [None] * len(selections)
            forwarded: List[Dict[str, Any]] = []
            forwarded_indices: List[int] = []

            for idx, sel in enumerate(selections):
                blocked = await self._precheck_selection(sel)
                if blocked is not None:
                    results[idx] = blocked
                else:
                    forwarded_indices.append(idx)
                    forwarded.append(sel)

            if forwarded:
                verified = await self.verify_betslip(forwarded)
                for res_idx, result in zip(forwarded_indices, verified):
                    results[res_idx] = result
                if len(verified) < len(forwarded_indices):
                    for res_idx in forwarded_indices[len(verified):]:
                        results[res_idx] = {
                            "status": "ERROR",
                            "error": "verify result count mismatch",
                            "event_id": selections[res_idx].get("event_id"),
                        }

            final_results = [
                result if result is not None else {"status": "ERROR", "error": "verify result missing"}
                for result in results
            ]
            self._store_verify_result(cache_key, final_results)
            future.set_result(copy.deepcopy(final_results))
            return final_results
        except Exception as exc:
            future.set_exception(exc)
            raise
        finally:
            self._verify_inflight.pop(cache_key, None)

    @staticmethod
    def _extract_line_id_parsed(ev: dict, period: int, bet_type: int,
                                 team_select: int, handicap: float) -> tuple:
        """Извлечение (LineId, LineEventId) из распарсенных данных периода.
        Более надёжный метод, т.к. парсер уже обработал все вариации формата."""
        periods = ev.get("Periods", [])
        if not periods:
            return (0, 0)
        # Find matching period
        target = None
        for p in periods:
            if not isinstance(p, dict):
                continue
            pn = p.get("PeriodNumber")
            if pn == period or (pn is None and period == 0):
                target = p
                break
        if not target:
            # Fallback to index if PeriodNumber not set
            if period < len(periods) and isinstance(periods[period], dict):
                target = periods[period]
            elif period > 5:
                # Game-level period (Tennis/TT): decompose and look in Games map
                set_num = (period - 6) // 13 + 1
                game_num = (period - 6) % 13 + 1
                if 1 <= set_num <= 5 and set_num < len(periods) and isinstance(periods[set_num], dict):
                    games = periods[set_num].get("Games", {})
                    game_entry = games.get(str(game_num)) or games.get(game_num)
                    if game_entry and isinstance(game_entry, dict) and bet_type == 1:
                        return (int(game_entry.get("LineId", 0)),
                                int(game_entry.get("LineEventId", 0)))
                return (0, 0)
            else:
                return (0, 0)

        try:
            if bet_type == 1:
                # Монейлайн
                w = target.get("Win1x2", {})
                return (int(w.get("LineId", 0)), int(w.get("LineEventId", 0)))
            elif bet_type == 2:
                # Гандикап — поиск совпадающей линии
                hdp = target.get("Handicap", {})
                return _find_line_id_event_id_in_map(hdp, handicap)
            elif bet_type == 3:
                # Тотал
                totals = target.get("Totals", {})
                return _find_line_id_event_id_in_map(totals, handicap)
            elif bet_type == 4:
                # Индивидуальный тотал хозяев
                tt = target.get("FirstTeamTotals", {})
                return _find_line_id_event_id_in_map(tt, handicap)
            elif bet_type == 5:
                # Индивидуальный тотал гостей
                tt = target.get("SecondTeamTotals", {})
                return _find_line_id_event_id_in_map(tt, handicap)
        except (ValueError, TypeError, KeyError):
            pass
        return (0, 0)

    @staticmethod
    def _extract_line_id(period_data: list, bet_type: int, team_select: int, handicap: float) -> int:
        """Извлечение lineId из сырых данных котировок периода.
        
        Формат period_data варьируется:
          Полный: [spreads, totals, moneyline, homeTT, awayTT, ...]
          Минимальный: [moneyline, 0, None, 1, ...]
        Монейлайн — плоский список [home, away, draw, lineId, isAlt, maxStake, ...]
        Спреды — список подсписков (вложенные списки).
        """
        try:
            # Определение расположения монейлайна: плоский список (не список-списков)
            ml_data = None
            spreads_data = None
            totals_data = None
            home_tt_data = None
            away_tt_data = None

            if len(period_data) > 2 and isinstance(period_data[2], list) and period_data[2]:
                # Полный формат: [spreads, totals, moneyline, ...]
                if not isinstance(period_data[2][0], list):
                    ml_data = period_data[2]
                    spreads_data = period_data[0] if isinstance(period_data[0], list) else None
                    totals_data = period_data[1] if isinstance(period_data[1], list) else None
                    home_tt_data = period_data[3] if len(period_data) > 3 and isinstance(period_data[3], list) else None
                    away_tt_data = period_data[4] if len(period_data) > 4 and isinstance(period_data[4], list) else None

            if ml_data is None and len(period_data) > 0 and isinstance(period_data[0], list) and period_data[0]:
                # Минимальный формат: монейлайн в [0] (плоский список, не вложенный)
                if not isinstance(period_data[0][0], list):
                    ml_data = period_data[0]

            if bet_type == 1 and ml_data and len(ml_data) >= 4:
                return int(ml_data[3])
            elif bet_type == 2 and spreads_data:
                for sp in spreads_data:
                    if isinstance(sp, list) and len(sp) >= 8:
                        h_val = float(sp[0] if team_select == 0 else sp[1])
                        if abs(h_val - float(handicap)) <= _STRUCTURAL_LINE_EPSILON:
                            return int(sp[7])
            elif bet_type == 3 and totals_data:
                for t in totals_data:
                    if isinstance(t, list) and len(t) >= 5:
                        if abs(float(t[1]) - float(handicap)) <= _STRUCTURAL_LINE_EPSILON:
                            return int(t[4])
            elif bet_type == 4 and home_tt_data:
                for t in home_tt_data:
                    if isinstance(t, list) and len(t) >= 5:
                        if abs(float(t[1]) - float(handicap)) <= _STRUCTURAL_LINE_EPSILON:
                            return int(t[4])
            elif bet_type == 5 and away_tt_data:
                for t in away_tt_data:
                    if isinstance(t, list) and len(t) >= 5:
                        if abs(float(t[1]) - float(handicap)) <= _STRUCTURAL_LINE_EPSILON:
                            return int(t[4])
        except (ValueError, TypeError, IndexError):
            pass
        return 0

    # -----------------------------------------------------------------------
    # Верификация Betslip (только чтение, безопасно)
    # -----------------------------------------------------------------------

    async def verify_betslip(self, selections: List[Dict]) -> List[Dict]:
        """
        Верификация выборок betslip через API PS3838.
        Автоматически перезагружает сессию при HTTP 403 и повторяет попытку.
        
        Каждая выборка: {event_id, period, bet_type, team_select, is_alt, handicap, line_id}
        Или OUTRIGHT: {is_outright: True, special_id, contestant_id, period}
        Возвращает список результатов верификации от PS3838.
        """
        odds_selections = []
        sel_metadata = []  # parallel list for hockey H0→ML fallback
        for sel in selections:
            if sel.get("is_outright"):
                # OUTRIGHT формат для спецрынков
                special_id = sel["special_id"]
                contestant_id = sel["contestant_id"]
                period = sel.get("period", 0)
                odds_id = f"{special_id}|0|99|10|0|0|{contestant_id}"  # period always 0 for specials (period encoded in special_id)
                selection_id = f"0|{odds_id}|0"

                odds_selections.append({
                    "oddsFormat": 1,
                    "oddsId": odds_id,
                    "oddsSelectionsType": "OUTRIGHT",
                    "selectionId": selection_id,
                })
                sel_metadata.append(None)
                continue

            event_id = sel["event_id"]
            period = sel.get("period", 0)
            bet_type = sel["bet_type"]
            team_select = sel["team_select"]
            is_alt = sel.get("is_alt", 0)
            handicap = sel.get("handicap", 0)
            line_id = sel.get("line_id", 0)
            game_number = sel.get("game_number", 0)

            # For game-level markets (Tennis/TT game winners), compute PS3838 native period
            # Formula: 6 + 13*(set-1) + (game-1), e.g. Set 3 Game 11 → period 42
            if game_number and period:
                effective_period = 6 + 13 * (int(period) - 1) + (int(game_number) - 1)
            else:
                effective_period = period

            # Автоматическое получение lineId из parse_ps3838, если не указан
            betslip_eid = event_id  # default: parent event
            ps3838_period = int(effective_period)  # use game-level period when available
            sport_name = sel.get("sport", "")
            if not line_id:
                line_id, betslip_eid, ps3838_period, sport_name = await self._fetch_line_id(
                    int(event_id), int(effective_period), int(bet_type),
                    int(team_select), float(handicap or 0),
                    game_number=int(game_number)
                )
                # Фоллбэк: lineId монейлайна периода 0 (только для betType 1, НЕ game-level)
                if not line_id and int(bet_type) == 1 and not game_number:
                    fallback_lid, _, _, _ = await self._fetch_line_id(
                        int(event_id), 0, 1, 0, 0
                    )
                    if fallback_lid:
                        line_id = fallback_lid
                if line_id:
                    log.info("Auto-resolved lineId=%d betslip_eid=%s for event=%s period=%d→%d bet_type=%d game=%d",
                             line_id, betslip_eid, event_id, period, ps3838_period, bet_type, game_number)
                else:
                    log.warning("Could not resolve lineId for event=%s bet_type=%d game=%d — using 0",
                                event_id, bet_type, game_number)

            odds_id = f"{betslip_eid}|{ps3838_period}|{bet_type}|{team_select}|{is_alt}|{handicap}"
            selection_id = f"{line_id}|{odds_id}|0"

            odds_selections.append({
                "oddsFormat": 1,
                "oddsId": odds_id,
                "oddsSelectionsType": "NORMAL",
                "selectionId": selection_id,
            })
            # Save metadata for fallback retries (H0→ML, Tennis IT→parent)
            sel_metadata.append({
                "sport_name": sport_name,
                "bet_type": int(bet_type),
                "handicap": float(handicap or 0),
                "handicap_raw": handicap,
                "betslip_eid": betslip_eid,
                "parent_eid": int(event_id),
                "ps3838_period": ps3838_period,
                "team_select": int(team_select),
                "is_alt": int(is_alt),
                "line_id": line_id,
                "game_number": int(game_number or 0),
            })

        log.debug("PS3838 request: odds_selections=%s", odds_selections)
        data, err = await self._send_verify_request(odds_selections)
        if err:
            return err

        results = self._parse_verify_response(data)

        # H0→ML fallback: if betType=2/handicap=0 returned UNAVAILABLE
        # and sport is hockey or handball, retry as betType=1 (moneyline).
        # These sports use 2-way moneyline (draw=push), but PS3838
        # betslip doesn't support betType=2 for them — use betType=1 instead.
        retry_indices = []
        for i, (res, meta) in enumerate(zip(results, sel_metadata)):
            if (meta is not None
                    and res.get("status") == "UNAVAILABLE"
                    and meta["bet_type"] == 2
                    and meta["handicap"] == 0
                    and any(s in meta["sport_name"].lower() for s in ("hockey", "handball"))):
                retry_indices.append(i)

        if retry_indices:
            retry_odds = []
            for i in retry_indices:
                m = sel_metadata[i]
                oid = f"{m['betslip_eid']}|{m['ps3838_period']}|1|{m['team_select']}|{m['is_alt']}|0"
                sid = f"{m['line_id']}|{oid}|0"
                retry_odds.append({
                    "oddsFormat": 1,
                    "oddsId": oid,
                    "oddsSelectionsType": "NORMAL",
                    "selectionId": sid,
                })
            retry_data, retry_err = await self._send_verify_request(retry_odds)
            if not retry_err:
                retry_results = self._parse_verify_response(retry_data)
                if len(retry_results) != len(retry_indices):
                    log.warning("H0→ML retry returned %d results, expected %d",
                                len(retry_results), len(retry_indices))
                for j, idx in enumerate(retry_indices):
                    if j < len(retry_results) and retry_results[j].get("status") != "UNAVAILABLE":
                        log.info("H0→ML fallback OK: event=%s period=%d odds=%s sport=%s",
                                 sel_metadata[idx]["betslip_eid"],
                                 sel_metadata[idx]["ps3838_period"],
                                 retry_results[j].get("odds"),
                                 sel_metadata[idx]["sport_name"])
                        results[idx] = retry_results[j]
                    elif j < len(retry_results):
                        log.info("H0→ML fallback also UNAVAILABLE: event=%s period=%d sport=%s",
                                 sel_metadata[idx]["betslip_eid"],
                                 sel_metadata[idx]["ps3838_period"],
                                 sel_metadata[idx]["sport_name"])

        # Tennis/TT fallback: retry with parent event_id and lineId=0.
        # Proven live cases:
        # - match-winner ML (betType=1, period 0) may be UNAVAILABLE with explicit lineId,
        #   but succeeds when PS3838 auto-resolves the line from parent event.
        # - child-event totals/handicaps (betType 2/3/4/5) may be UNAVAILABLE on child
        #   in live Tennis/TableTennis and succeed on parent auto-resolve.
        tennis_retry_indices = []
        for i, (res, meta) in enumerate(zip(results, sel_metadata)):
            if meta is None or res.get("status") != "UNAVAILABLE":
                continue
            sport_name_lc = meta["sport_name"].lower()
            if not any(s in sport_name_lc for s in ("tennis", "table tennis")):
                continue

            is_match_winner_ml = (
                meta["bet_type"] == 1
                and meta["ps3838_period"] == 0
                and meta["game_number"] == 0
            )
            is_child_market = (
                meta["bet_type"] in (2, 3, 4, 5)
                and meta["betslip_eid"] != meta["parent_eid"]
            )
            if is_match_winner_ml or is_child_market:
                tennis_retry_indices.append(i)

        if tennis_retry_indices:
            retry_odds = []
            for i in tennis_retry_indices:
                m = sel_metadata[i]
                oid = f"{m['parent_eid']}|{m['ps3838_period']}|{m['bet_type']}|{m['team_select']}|{m['is_alt']}|{m['handicap_raw']}"
                sid = f"0|{oid}|0"  # lineId=0: let PS3838 auto-resolve
                retry_odds.append({
                    "oddsFormat": 1,
                    "oddsId": oid,
                    "oddsSelectionsType": "NORMAL",
                    "selectionId": sid,
                })
            retry_data, retry_err = await self._send_verify_request(retry_odds)
            if not retry_err:
                retry_results = self._parse_verify_response(retry_data)
                if len(retry_results) != len(tennis_retry_indices):
                    log.warning("Tennis child→parent retry returned %d results, expected %d",
                                len(retry_results), len(tennis_retry_indices))
                for j, idx in enumerate(tennis_retry_indices):
                    if j < len(retry_results) and retry_results[j].get("status") != "UNAVAILABLE":
                        log.info("Tennis child→parent fallback OK: parent=%s child=%s period=%d bt=%d odds=%s",
                                 sel_metadata[idx]["parent_eid"],
                                 sel_metadata[idx]["betslip_eid"],
                                 sel_metadata[idx]["ps3838_period"],
                                 sel_metadata[idx]["bet_type"],
                                 retry_results[j].get("odds"))
                        results[idx] = retry_results[j]
                    elif j < len(retry_results):
                        log.info("Tennis child→parent fallback also UNAVAILABLE: parent=%s child=%s bt=%d",
                                 sel_metadata[idx]["parent_eid"],
                                 sel_metadata[idx]["betslip_eid"],
                                 sel_metadata[idx]["bet_type"])

        return results

    # -----------------------------------------------------------------------
    # Размещение ставки (РЕАЛЬНЫЕ ДЕНЬГИ — с защитой)
    # -----------------------------------------------------------------------
    # Вспомогательные методы betslip HTTP
    # -----------------------------------------------------------------------

    async def _send_verify_request(self, odds_selections: List[Dict]) -> tuple:
        """Send betslip verification request to PS3838.
        Returns (data, error_list). On success error_list is None.
        On failure data is None and error_list is a list with one error dict."""
        gate_err = await self._wait_for_verify_slot()
        if gate_err is not None:
            return None, gate_err

        ts = int(time.time() * 1000)
        url = f"{self._base_url}/member-betslip/v2/all-odds-selections?locale=en_US&_={ts}&withCredentials=true"

        async def _refresh_verify_session_for_retry(allow_unchanged: bool) -> bool:
            reloaded = await self._maybe_reload_session()
            if reloaded:
                return True
            if not allow_unchanged:
                return False
            rebuilt = await self._reload_session_from_parser_file(allow_unchanged=True)
            if rebuilt:
                log.warning("Session file unchanged, retrying verify with rebuilt local HTTP session")
                return True
            return False

        for attempt in range(2):
            # Verify is read-only — no lock needed, PS3838 handles parallel requests
            async with self._session.post(url, json={"oddsSelections": odds_selections}) as resp:
                if resp.status == 403:
                    text = await resp.text()
                    if _is_multiple_login_error(text):
                        if attempt == 0:
                            reloaded = await _refresh_verify_session_for_retry(allow_unchanged=False)
                            if reloaded:
                                log.warning("Betslip verify HTTP 403 MULTIPLE_LOGIN, parser session rotated, retrying once")
                                continue
                        log.warning("Betslip verify HTTP 403 MULTIPLE_LOGIN, parser session unchanged: %s", text[:200])
                        return None, [{"status": "ERROR", "error": "HTTP 403 MULTIPLE_LOGIN"}]
                    if attempt == 0:
                        reloaded = await _refresh_verify_session_for_retry(allow_unchanged=True)
                        if reloaded:
                            log.warning("Betslip verify HTTP 403 (attempt %d), will retry once: %s", attempt + 1, text[:200])
                            continue
                        log.warning("Parser session file unavailable, cannot refresh verify session for retry")
                        return None, [{"status": "ERROR", "error": "Verify retry aborted: parser session unavailable"}]
                if resp.status != 200:
                    text = await resp.text()
                    if resp.status == 429 or _is_rate_limit_error(text):
                        return None, await self._record_verify_rate_limit(status=resp.status, detail=text[:200])
                    log.warning("Betslip verify HTTP %d: %s", resp.status, text[:200])
                    return None, [{"status": "ERROR", "error": f"HTTP {resp.status}"}]
                try:
                    data = await resp.json(content_type=None)
                except Exception:
                    text = await resp.text()
                    if attempt == 0:
                        reloaded = await _refresh_verify_session_for_retry(allow_unchanged=True)
                        if reloaded:
                            log.warning("Betslip verify non-JSON response (session expired?), retrying once: %s", text[:200])
                            continue
                        log.warning("Parser session file unavailable, cannot refresh verify session after non-JSON response")
                        return None, [{"status": "ERROR", "error": "Verify retry aborted: parser session unavailable"}]
                    return None, [{"status": "ERROR", "error": "Non-JSON response after retry"}]
                if isinstance(data, dict) and "error" in data and not isinstance(data.get("error"), list):
                    err = data["error"]
                    if _is_rate_limit_error(err):
                        return None, await self._record_verify_rate_limit(status=429, detail=str(err))
                    if _is_multiple_login_error(err):
                        if attempt == 0:
                            reloaded = await _refresh_verify_session_for_retry(allow_unchanged=False)
                            if reloaded:
                                log.warning("Betslip verify PS3838 error MULTIPLE_LOGIN, parser session rotated, retrying once")
                                continue
                        log.warning("Betslip verify PS3838 error MULTIPLE_LOGIN, parser session unchanged")
                        return None, [{"status": "ERROR", "error": "PS3838 error: MULTIPLE_LOGIN"}]
                    if attempt == 0:
                        reloaded = await _refresh_verify_session_for_retry(allow_unchanged=True)
                        if reloaded:
                            log.warning("Betslip verify PS3838 error '%s' (attempt %d), retrying once", err, attempt + 1)
                            continue
                        log.warning("Parser session file unavailable, cannot refresh verify session after PS3838 error '%s'", err)
                        return None, [{"status": "ERROR", "error": "Verify retry aborted: parser session unavailable"}]
                    return None, [{"status": "ERROR", "error": f"PS3838 error: {err}"}]
                await self._record_verify_success()
                return data, None
        return None, [{"status": "ERROR", "error": "HTTP 403 — session expired after retry"}]

    @staticmethod
    def _parse_verify_response(data) -> List[Dict]:
        """Parse raw PS3838 betslip verification response into result dicts."""
        results = []
        if isinstance(data, list):
            log.debug("PS3838 raw response: %s", str(data)[:500])
            for item in data:
                results.append({
                    "status": item.get("status", "UNKNOWN"),
                    "odds": item.get("odds"),
                    "selection_id": item.get("selectionId"),
                    "line_id": item.get("lineId"),
                    "alt_line_id": item.get("altLineId"),
                    "min_stake": item.get("minStake"),
                    "max_stake": item.get("maxStake"),
                    "max_bet_per_match": item.get("maxBetPerMatch"),
                    "current_score": item.get("currentScore"),
                    "home_team": item.get("homeTeam"),
                    "away_team": item.get("awayTeam"),
                    "league": item.get("league"),
                    "sport_id": item.get("sportId"),
                    "bet_type": item.get("betType"),
                    "handicap": item.get("handicap"),
                    "period_num": item.get("periodNum"),
                    "inplay": item.get("inplay"),
                    "event_id": item.get("eventId"),
                    "error_code": item.get("errorCode"),
                })
        return results

    # -----------------------------------------------------------------------

    async def place_bet(
        self,
        selection_id: str,
        odds: str,
        odds_id: str,
        stake: float,
        accept_better_odds: bool = True,
    ) -> Dict[str, Any]:
        """Размещение реальной ставки через PS3838 buyV4."""
        if not ENABLE_BETTING:
            return {"status": "BLOCKED", "error": "ENABLE_BETTING is false"}
        if stake > MAX_ALLOWED_STAKE:
            return {"status": "BLOCKED", "error": f"Stake {stake} > MAX_ALLOWED_STAKE {MAX_ALLOWED_STAKE}"}
        if stake <= 0:
            return {"status": "BLOCKED", "error": "Stake must be positive"}

        if DRY_RUN:
            log.info("DRY RUN: would place bet sel=%s odds=%s stake=%.2f", selection_id, odds, stake)
            return {"status": "DRY_RUN", "selection_id": selection_id, "odds": odds, "stake": stake}

        req_uuid = str(uuid.uuid4())
        sel_uuid = str(uuid.uuid4())

        url = f"{self._base_url}/bet-placement/buyV4?uniqueRequestId={req_uuid}"
        payload = {
            "acceptBetterOdds": accept_better_odds,
            "oddsFormat": 1,
            "selections": [{
                "odds": str(odds),
                "oddsId": odds_id,
                "selectionId": selection_id,
                "stake": stake,
                "uniqueRequestId": sel_uuid,
                "wagerType": "NORMAL",
                "winRiskStake": "RISK",
                "betLocationTracking": None,
            }],
        }

        async with self._bet_lock:
            # Rate-limit check INSIDE the lock to prevent concurrent bypass
            now = time.time()
            elapsed = now - self._last_bet_ts
            if elapsed < MIN_BET_INTERVAL_SEC:
                wait = MIN_BET_INTERVAL_SEC - elapsed
                log.info("Rate limit: waiting %.1fs before bet", wait)
                await asyncio.sleep(wait)
            self._last_bet_ts = time.time()
            async with self._session.post(url, json=payload) as resp:
                text = await resp.text()
                log.info("BuyV4 HTTP %d: %s", resp.status, text[:500])

        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return {"status": "ERROR", "error": f"Invalid JSON: {text[:200]}"}

        # Ошибка верхнего уровня
        if "errorCode" in data and data["errorCode"]:
            return {
                "status": "ERROR",
                "error_code": data["errorCode"],
                "error_message": data.get("errorMessage", ""),
            }

        # Результат по каждой выборке
        responses = data.get("response", [])
        if responses:
            r = responses[0]
            result = {
                "status": r.get("status", "UNKNOWN"),
                "wager_id": r.get("wagerId"),
                "bet_id": r.get("betId"),
                "selection_id": r.get("selectionId"),
                "error_code": r.get("errorCode"),
                "unique_request_id": r.get("uniqueRequestId"),
                "better_line_accepted": r.get("betterLineWasAccepted", False),
            }
            # Парсинг jsonString для дополнительных деталей
            js = r.get("jsonString")
            if js:
                try:
                    parsed = json.loads(js)
                    bets = parsed.get("bets", [])
                    if bets:
                        b = bets[0]
                        result["actual_odds"] = b.get("price")
                        result["win"] = b.get("win")
                        result["risk"] = b.get("risk")
                        result["points"] = b.get("points")
                except (json.JSONDecodeError, KeyError):
                    pass
            return result

        return {"status": "UNKNOWN", "raw": text[:500]}

    # -----------------------------------------------------------------------
    # Баланс
    # -----------------------------------------------------------------------

    async def get_balance(self) -> Dict[str, Any]:
        """Получение текущего баланса аккаунта PS3838."""
        ts = int(time.time() * 1000)
        url = f"{self._base_url}/member-service/v2/account-balance?locale=en_US&_={ts}&withCredentials=true"
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
        }
        async with self._session.post(url, headers=headers) as resp:
            if resp.status != 200:
                return {"error": f"HTTP {resp.status}"}
            return await resp.json()

    async def is_session_valid(self) -> bool:
        """Проверка валидности сессии через запрос баланса."""
        try:
            await self._maybe_reload_session()
            bal = await self.get_balance()
            return "betCredit" in bal
        except Exception:
            log.warning("Session validity check failed")
            return False


# ---------------------------------------------------------------------------
# HTTP-обработчики
# ---------------------------------------------------------------------------

async def health_handler(request: web.Request) -> web.Response:
    """GET /health — статус сервиса (lightweight, без REST API вызовов).
    НЕ вызывает is_session_valid() — тот делал HTTP login + get_balance к PS3838
    каждые 30с (healthcheck interval), что: 1) рисковал баном аккаунта,
    2) перезаписывал session file → парсер reconnect каждые 30с вместо 3.5мин."""
    client: PS3838BetClient = request.app["client"]
    stats = await client._fetch_special_stats()
    return web.json_response({
        "status": "ok",
        "enable_betting": ENABLE_BETTING,
        "dry_run": DRY_RUN,
        "max_stake": MAX_ALLOWED_STAKE,
        "uptime": round(time.time() - client._started, 1),
        "session_owner": client.session_owner_state(),
        "special_ids": stats,
        "betslip_rate_limit": client._betslip_rate_limit_state(),
        "exact_price": client.exact_price_state(),
    })


async def verify_handler(request: web.Request) -> web.Response:
    """
    POST /verify — верификация betslip.
    Тело: {"selections": [{"event_id":..., "period":..., "bet_type":..., "team_select":..., "handicap":..., "line_id":...}]}
    Или:  {"event_id":..., "outcome":..., "handicap":..., "period":...}  (авто-маппинг)
    """
    client: PS3838BetClient = request.app["client"]
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid JSON"}, status=400)
    exact_price_requested = _exact_price_requested(body)

    # Поддержка простого формата со строкой исхода
    if "outcome" in body and "selections" not in body:
        log.info("Verify request: event_id=%s outcome=%s handicap=%s period=%s",
                 body.get("event_id"), body.get("outcome"), body.get("handicap"), body.get("period"))
        verify_special_diag: Optional[Dict[str, Any]] = None
        try:
            params = outcome_to_ps3838(body["outcome"], body.get("handicap"), body.get("period"))

            if is_standard_market(params):
                # Стандартный рынок: используем числовой формат oddsId
                selections = [{
                    "event_id": body["event_id"],
                    "period": params["period"],
                    "bet_type": params["bet_type"],
                    "team_select": params["team_select"],
                    "market": params.get("market"),
                    "is_alt": params.get("is_alt", 0),
                    "handicap": params["handicap"],
                    "line_id": body.get("line_id", 0),
                    "game_number": params.get("game_number", 0),
                    "map_number": body.get("map_number", 0),
                    "esports_unit": body.get("esports_unit", ""),
                    "tennis_unit": body.get("tennis_unit", ""),
                }]
            else:
                # Спецрынок: поиск contestant_id + special_id через HTTP к парсеру
                special_type = params.get("special_type", "")
                contestant = params.get("contestant", "")
                period = params.get("period", 0)
                event_id = body.get("event_id")
                handicap = float(params.get("handicap") or body.get("handicap") or 0)

                cached = await client._fetch_special_ids(
                    int(event_id), special_type, contestant, period, handicap
                ) if event_id else None
                if special_type in _VERIFY_SPECIAL_DIAG_TYPES and event_id:
                    verify_special_diag = {
                        "event_id": int(event_id),
                        "outcome": body.get("outcome"),
                        "special_type": special_type,
                        "contestant": contestant,
                        "period": period,
                        "handicap": handicap,
                    }
                    if _should_log_verify_special_diag(
                        "lookup", int(event_id), special_type, contestant, period
                    ):
                        log.warning(
                            "[VERIFY_SPECIAL_LOOKUP] event_id=%s outcome=%r type=%s contestant=%r "
                            "period=%s handicap=%s cached=%s",
                            event_id,
                            body.get("outcome"),
                            special_type,
                            contestant,
                            period,
                            handicap,
                            {
                                "cid": cached.get("cid") if cached else None,
                                "price": cached.get("price") if cached else None,
                                "special_id": cached.get("special_id") if cached else None,
                                "ts": cached.get("ts") if cached else None,
                            },
                        )

                if not cached or not cached.get("cid") or not cached.get("special_id"):
                    return web.json_response({
                        "results": [{
                            "status": "UNAVAILABLE",
                            "odds": None,
                            "selection_id": None,
                            "event_id": event_id,
                            "error_code": "NO_SPECIAL_DATA",
                        }]
                    })

                selections = [{
                    "event_id": event_id,
                    "is_outright": True,
                    "special_id": cached["special_id"],
                    "contestant_id": cached["cid"],
                    "special_type": special_type,
                    "contestant": contestant,
                    "handicap": handicap,
                    "period": period,
                }]
        except (KeyError, ValueError) as e:
            return web.json_response({"error": f"Outcome mapping failed: {e}"}, status=400)
    else:
        selections = body.get("selections", [])

    if not selections:
        return web.json_response({"error": "No selections"}, status=400)

    results = await client.verify_betslip_guarded(selections)
    results = await client.maybe_attach_exact_price(
        selections,
        results,
        requested=exact_price_requested,
    )
    if results:
        log.info("Verify result: event_id=%s status=%s odds=%s",
                 body.get("event_id", "?"), results[0].get("status"), results[0].get("odds"))
        if (
            "verify_special_diag" in locals()
            and verify_special_diag
            and _should_log_verify_special_diag(
                "result",
                int(verify_special_diag["event_id"]),
                verify_special_diag["special_type"],
                verify_special_diag["contestant"],
                int(verify_special_diag["period"]),
            )
        ):
            log.warning(
                "[VERIFY_SPECIAL_RESULT] event_id=%s outcome=%r type=%s contestant=%r period=%s "
                "handicap=%s status=%s odds=%s",
                verify_special_diag["event_id"],
                verify_special_diag["outcome"],
                verify_special_diag["special_type"],
                verify_special_diag["contestant"],
                verify_special_diag["period"],
                verify_special_diag["handicap"],
                results[0].get("status"),
                results[0].get("odds"),
            )
    return web.json_response({"results": results})


async def place_handler(request: web.Request) -> web.Response:
    """
    POST /place — размещение ставки.
    Тело: {"selection_id":..., "odds":..., "odds_id":..., "stake":...}
    """
    if not ENABLE_BETTING and not DRY_RUN:
        return web.json_response({"error": "Betting disabled (ENABLE_BETTING=false)"}, status=403)

    client: PS3838BetClient = request.app["client"]
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid JSON"}, status=400)

    required = ["selection_id", "odds", "odds_id", "stake"]
    for field in required:
        if field not in body:
            return web.json_response({"error": f"Missing field: {field}"}, status=400)

    result = await client.place_bet(
        selection_id=body["selection_id"],
        odds=str(body["odds"]),
        odds_id=body["odds_id"],
        stake=float(body["stake"]),
        accept_better_odds=body.get("accept_better_odds", True),
    )

    log.info("PLACE result: %s", json.dumps(result)[:300])
    return web.json_response(result)


async def balance_handler(request: web.Request) -> web.Response:
    """GET /balance — текущий баланс аккаунта."""
    client: PS3838BetClient = request.app["client"]
    result = await client.get_balance()
    return web.json_response(result)


async def selftest_handler(request: web.Request) -> web.Response:
    """GET /selftest — находит событие из parse_ps3838 и верифицирует его.
    Подключается к WS, берёт первое событие с котировками и проверяет betslip."""
    client: PS3838BetClient = request.app["client"]
    try:
        # Подключение к WS и получение первого события с котировками
        import websockets
        test_event = None
        test_market = None  # (bet_type, team_select, handicap)
        try:
            ws = await asyncio.wait_for(
                websockets.connect(_parser_ws_url(), max_size=5_000_000),
                timeout=5,
            )
        except Exception as e:
            return web.json_response({"error": f"WS connect error: {e}"}, status=502)
        try:
            for _ in range(30):
                msg = await asyncio.wait_for(ws.recv(), timeout=3)
                data = json.loads(msg)
                dtype = data.get("type")

                events = []
                if dtype == "state":
                    events = data.get("events", [])
                elif dtype == "update":
                    d = data.get("data")
                    if isinstance(d, dict):
                        events = [d]

                for ev in events:
                    periods = ev.get("Periods", [])
                    if not periods:
                        continue
                    p0 = periods[0]
                    # Try moneyline
                    w = p0.get("Win1x2", {})
                    win1 = w.get("Win1", {}).get("value", 0)
                    if win1 and win1 > 1:
                        test_event = ev
                        test_market = (1, 0, 0)
                        break
                    # Try totals
                    totals = p0.get("Totals") or {}
                    for line, vals in totals.items():
                        over = vals.get("WinMore", {}).get("value", 0)
                        if over and over > 1:
                            test_event = ev
                            test_market = (3, 3, float(line.replace(",", ".")))
                            break
                    if test_event:
                        break

                if test_event:
                    break
            await ws.close()
        except Exception as e:
            try:
                await ws.close()
            except Exception:
                pass
            return web.json_response({"error": f"WS error: {e}"}, status=502)

        if not test_event:
            return web.json_response({"error": "No event with markets found"}, status=503)

        pid = test_event["Pid"]
        home = test_event.get("homeName", "?")
        away = test_event.get("awayName", "?")
        is_live = test_event.get("isLive", False)
        bt, ts_val, hcap = test_market

        results = await client.verify_betslip_guarded([{
            "event_id": pid,
            "period": 0,
            "bet_type": bt,
            "team_select": ts_val,
            "handicap": hcap,
            "line_id": 0,
        }])

        r = results[0] if results else {}
        ok = r.get("status") in ("OK", "ODDS_CHANGE", "PROCESSING")

        return web.json_response({
            "selftest": "PASS" if ok else "FAIL",
            "event_id": pid,
            "match": f"{home} vs {away}",
            "is_live": is_live,
            "market": f"bet_type={bt} team_select={ts_val} handicap={hcap}",
            "status": r.get("status"),
            "odds": r.get("odds"),
            "home_team": r.get("home_team"),
            "away_team": r.get("away_team"),
            "max_stake": r.get("max_stake"),
            "inplay": r.get("inplay"),
        })

    except Exception as e:
        log.exception("Selftest failed")
        return web.json_response({"error": str(e)}, status=500)


# ---------------------------------------------------------------------------
# Жизненный цикл приложения
# ---------------------------------------------------------------------------

async def on_startup(app: web.Application):
    """Инициализация при запуске: создание клиента."""
    _scrub_local_auth_env()
    _assert_no_local_auth_env()
    _assert_owned_session_env()
    session_file = BET_SERVICE_SESSION_FILE if BET_SERVICE_OWN_SESSION else SESSION_FILE
    client = PS3838BetClient(session_file, own_session=BET_SERVICE_OWN_SESSION)
    await client.start()
    app["client"] = client
    log.info(
        "Bet service started on port %d | ENABLE_BETTING=%s DRY_RUN=%s MAX_STAKE=%.0f | session_owner=%s | specials via HTTP to parser | exact_price=%s require_flag=%s",
        BET_SERVICE_PORT,
        ENABLE_BETTING,
        DRY_RUN,
        MAX_ALLOWED_STAKE,
        client.session_owner_state()["mode"],
        client.exact_price_state()["enabled"],
        client.exact_price_state()["require_flag"],
    )


async def on_cleanup(app: web.Application):
    """Очистка при завершении: закрытие клиента."""
    client: PS3838BetClient = app.get("client")
    if client:
        await client.close()


def create_app() -> web.Application:
    """Создание aiohttp-приложения с маршрутами и обработчиками жизненного цикла."""
    app = web.Application()
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    app.router.add_get("/health", health_handler)
    app.router.add_post("/verify", verify_handler)
    app.router.add_post("/place", place_handler)
    app.router.add_get("/balance", balance_handler)
    app.router.add_get("/selftest", selftest_handler)
    return app


if __name__ == "__main__":
    web.run_app(create_app(), port=BET_SERVICE_PORT)
