"""FastAPI: проверка цен в корзине PS3838."""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import os
import re
import time
from collections import deque
from typing import Any, NamedTuple, Optional

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field

from forted_outcome import translate as forted_translate
from outcome_mapper import outcome_to_ps3838, is_standard_market
from session import PS3838Session
from line_resolver import CompactCache, SPORT_ID_MAP, normalize_sport, resolve_line_meta, _periods_dict
from verifier import Verifier, internal_to_ps3838_period, _name_share


# Map PS3838 internal bet_type to a generic market family expected by API
# consumers (Moneyline / Totals / Handicap / Game Winner / Set Winner / Odd/Even).
def _market_family_for_bet_type(bet_type: int, outcome_str: str) -> str:
    bt = int(bet_type or 0)
    if bt == 1:
        # Tennis "P1 1G 11" — Game winner on a per-game child event.
        if re.search(r"\bG\s*\d+\b", outcome_str or "", re.IGNORECASE):
            return "Game Winner"
        # Per-set winner: forted feed sometimes uses "Set 3 1" -> translate keeps
        # the leading P{n} only; we can't reliably detect set-level here.
        return "Moneyline"
    if bt == 2:
        return "Handicap"
    if bt in (3, 4, 5):
        # Individual totals are returned as Totals so consumers can compare them
        # against their own parent market family.
        return "Totals"
    return "Moneyline"


def _direction_for_outcome(outcome_str: str) -> Optional[str]:
    """Return consumer-friendly direction: 'Over' or 'Under' for totals."""
    if not outcome_str:
        return None
    s = outcome_str.lower()
    if re.search(r"\b(?:t|it[12])\s*>", s) or "over" in s:
        return "Over"
    if re.search(r"\b(?:t|it[12])\s*<", s) or "under" in s:
        return "Under"
    return None


def _team_for_outcome(bet_type: int, team_select: int, outcome_str: str) -> Optional[str]:
    """Return consumer-friendly team: '1', '2' or 'None' (draw)."""
    bt = int(bet_type or 0)
    ts = int(team_select or 0)
    if bt == 1:
        if ts == 0:
            return "1"
        if ts == 1:
            return "2"
        if ts == 2:
            return "None"
    if bt == 2:
        return "1" if ts == 0 else "2"
    if bt == 3:
        # Plain match totals are side-agnostic; return a stable value for
        # consumers that still require a team bucket.
        return "1"
    if bt == 4:
        return "1"
    if bt == 5:
        return "2"
    return None


def _canonical_outcome_for_match(bet_type: int, team_select: int, outcome_str: str) -> str:
    """Return a canonical actual_outcome string for downstream matchers.

    Many consumers do not understand PS3838 shorthand ("T> 8.5", "H1 -0.5",
    "IT1< 4.5"), so map bet_type+team_select onto Over/Under/Win1/Win2/WinNone
    plus optional direction/team metadata.
    """
    bt = int(bet_type or 0)
    ts = int(team_select or 0)
    if bt == 1:
        if ts == 0:
            return "Win1"
        if ts == 1:
            return "Win2"
        if ts == 2:
            return "WinNone"
    if bt == 2:
        return "Win1" if ts == 0 else "Win2"
    if bt == 3:
        return "Over" if ts == 3 else "Under"
    if bt == 4:
        # Match individual team totals through the team bucket.
        return "Win1"
    if bt == 5:
        return "Win2"
    return outcome_str


def _period_number_from_outcome(outcome_str: str, fallback: int) -> int:
    """Respect P{n} prefix from forted_outcome.translate(), otherwise request hint."""
    if outcome_str:
        m = re.match(r"^P(\d+)\b", outcome_str.strip(), re.IGNORECASE)
        if m:
            try:
                return int(m.group(1))
            except ValueError:
                pass
    try:
        return int(fallback or 0)
    except (TypeError, ValueError):
        return 0


def _enrich_result(
    result: dict[str, Any],
    *,
    event_id: int,
    outcome_str: str,
    params: dict[str, Any],
    request_period: int,
    request_market: Optional[str] = None,
) -> dict[str, Any]:
    """Add stable fields consumers can use to bind a quote to the requested leg.

    Some feeds do not carry selection_id/odds_id, so consumers often fall back
    to event_id/outcome/market/line equality.
    """
    bt = int(params.get("bet_type") or 0)
    ts = int(params.get("team_select") or 0)
    handicap = float(params.get("handicap") or 0)
    period_num = _period_number_from_outcome(outcome_str, request_period or params.get("period") or 0)

    enriched = dict(result)
    enriched.setdefault("event_id", int(event_id))
    enriched.setdefault("outcome", _canonical_outcome_for_match(bt, ts, outcome_str))
    # Mirror caller's market when supplied. The caller may know both sides of
    # the arbitrage while this service only knows the PS3838 side.
    if request_market and str(request_market).strip():
        enriched.setdefault("market", str(request_market).strip())
    else:
        enriched.setdefault("market", _market_family_for_bet_type(bt, outcome_str))
    enriched.setdefault("bet_type", bt)
    enriched.setdefault("team_select", ts)
    enriched.setdefault("period_number", int(period_num))
    enriched.setdefault("period", int(period_num))
    game_number = params.get("game_number")
    if game_number not in (None, ""):
        enriched.setdefault("set_number", int(period_num))
        enriched.setdefault("game_number", int(game_number))
    if bt in (2, 3, 4, 5):
        enriched.setdefault("line", handicap)
        enriched.setdefault("handicap", handicap)
    direction = _direction_for_outcome(outcome_str)
    if direction:
        enriched.setdefault("direction", direction)
    team = _team_for_outcome(bt, ts, outcome_str)
    if team is not None:
        enriched.setdefault("team", team)
    # Keep the raw PS3838-shorthand for diagnostics — we surface it under a
    # different key so the matcher uses the canonical "outcome" above.
    enriched.setdefault("ps_outcome", outcome_str)
    return enriched

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
log = logging.getLogger("ps3838_betslip")


def _split_env_values(raw: str) -> list[str]:
    return [item.strip() for item in raw.replace(",", ";").split(";") if item.strip()]


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        return default


_API_KEYS = frozenset(_split_env_values(";".join([
    os.environ.get("PS3838_BETSLIP_API_KEY", ""),
    os.environ.get("PS3838_BETSLIP_API_KEYS", ""),
    os.environ.get("PS3838_API_KEYS", ""),
])))
_API_RATE_LIMIT_PER_MIN = max(1, _env_int("PS3838_API_RATE_LIMIT_PER_MIN", 30))
_ACCOUNT_RATE_LIMIT_PER_MIN = max(
    1,
    _env_int("PS3838_ACCOUNT_RATE_LIMIT_PER_MIN", _API_RATE_LIMIT_PER_MIN),
)
_VERIFY_RATE_LIMIT_PER_MIN = max(
    0,
    _env_int("PS3838_VERIFY_RATE_LIMIT_PER_MIN", _API_RATE_LIMIT_PER_MIN),
)
_MARKET_MARGIN_RATE_LIMIT_PER_MIN = max(
    0,
    _env_int("PS3838_MARKET_MARGIN_RATE_LIMIT_PER_MIN", max(1, min(_API_RATE_LIMIT_PER_MIN, 10))),
)
_BALANCE_RATE_LIMIT_PER_MIN = max(
    0,
    _env_int("PS3838_BALANCE_RATE_LIMIT_PER_MIN", max(1, min(_API_RATE_LIMIT_PER_MIN, 6))),
)
_CLEAR_RATE_LIMIT_PER_MIN = max(
    0,
    _env_int("PS3838_CLEAR_RATE_LIMIT_PER_MIN", max(1, min(_API_RATE_LIMIT_PER_MIN, 6))),
)
_PLACE_RATE_LIMIT_PER_MIN = max(1, _env_int("PS3838_PLACE_RATE_LIMIT_PER_MIN", 6))
_RELOGIN_RATE_LIMIT_PER_MIN = max(1, _env_int("PS3838_RELOGIN_RATE_LIMIT_PER_MIN", 2))
_ACCOUNT_MIN_INTERVAL_SEC = max(0.0, _env_float("PS3838_ACCOUNT_MIN_INTERVAL_SEC", 0.0))
_VERIFY_WINDOW_SEC = max(0.0, _env_float("PS3838_VERIFY_WINDOW_SEC", 300.0))
_VERIFY_WINDOW_IDLE_RESET_SEC = max(1.0, _env_float("PS3838_VERIFY_WINDOW_IDLE_RESET_SEC", 30.0))
_VERIFY_WINDOW_PRUNE_SEC = max(
    _VERIFY_WINDOW_SEC + _VERIFY_WINDOW_IDLE_RESET_SEC + 60.0,
    _env_float("PS3838_VERIFY_WINDOW_PRUNE_SEC", 900.0),
)
_RATE_HISTORY_WINDOW_SEC = 60.0
_RATE_HISTORY_PRUNE_INTERVAL_SEC = 30.0
_ACCOUNT_RATE_ID = hashlib.sha256(
    (os.environ.get("PS3838_ACCOUNT_RATE_ID") or os.environ.get("PS3838_LOGIN_ID") or "default").encode("utf-8")
).hexdigest()[:16]

_state_lock = asyncio.Lock()
_rate_history: dict[tuple[str, str], deque[float]] = {}
_verify_windows: dict[tuple[str, str], tuple[float, float]] = {}
_last_rate_history_prune_ts = 0.0
_ACCOUNT_SCOPE = "__account__"


class _AuthContext(NamedTuple):
    consumer_id: str
    rate_identity: str

app = FastAPI(title="PS3838 Betslip Microservice")
session = PS3838Session()
cache: Optional[CompactCache] = None
verifier: Optional[Verifier] = None
_COMPACT_SCAN_SPORT_IDS = tuple(dict.fromkeys((
    29, 33, 4, 19, 3, 15, 34, 18, 6, 32, *SPORT_ID_MAP.values()
)))
_SPORT_NAME_BY_ID = {sport_id: name for name, sport_id in SPORT_ID_MAP.items()}


def _extract_api_token(request: Request) -> str:
    authorization = request.headers.get("Authorization") or ""
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return (request.headers.get("X-API-Key") or request.headers.get("X-PS3838-API-Key") or "").strip()


def _consumer_id(request: Request) -> str:
    explicit = (request.headers.get("X-Consumer-Id") or "").strip()
    if explicit:
        return explicit[:96]
    if request.client and request.client.host:
        return "ip:" + request.client.host
    return "anonymous"


def _account_rate_identity() -> str:
    return f"account:{_ACCOUNT_RATE_ID}"


def _scope_limit(scope: str) -> int:
    if scope == "verify":
        return _VERIFY_RATE_LIMIT_PER_MIN
    if scope == "market-margin":
        return _MARKET_MARGIN_RATE_LIMIT_PER_MIN
    if scope == "balance":
        return _BALANCE_RATE_LIMIT_PER_MIN
    if scope == "clear":
        return _CLEAR_RATE_LIMIT_PER_MIN
    if scope == "place":
        return _PLACE_RATE_LIMIT_PER_MIN
    if scope == "relogin":
        return _RELOGIN_RATE_LIMIT_PER_MIN
    return _API_RATE_LIMIT_PER_MIN


def _retry_after_seconds(value: float) -> int:
    return max(1, int(math.ceil(max(0.0, value))))


def _rate_limited(
    *,
    consumer: str,
    rate_identity: str,
    scope: str,
    limit: int,
    retry_after: int,
    error_code: str = "RATE_LIMITED",
) -> HTTPException:
    detail = {
        "error_code": error_code,
        "consumer_id": consumer,
        "rate_identity": rate_identity,
        "scope": scope,
        "limit_per_minute": limit,
        "retry_after_seconds": retry_after,
    }
    return HTTPException(
        status_code=429,
        detail=detail,
        headers={"Retry-After": str(retry_after)},
    )


def _prune_rate_history(now: float) -> None:
    global _last_rate_history_prune_ts
    if now - _last_rate_history_prune_ts < _RATE_HISTORY_PRUNE_INTERVAL_SEC:
        return
    _last_rate_history_prune_ts = now
    for key, history in list(_rate_history.items()):
        while history and now - history[0] >= _RATE_HISTORY_WINDOW_SEC:
            history.popleft()
        if not history:
            _rate_history.pop(key, None)


async def _authorize_and_rate_limit(request: Request, scope: str) -> _AuthContext:
    token = _extract_api_token(request)
    if _API_KEYS and token not in _API_KEYS:
        raise HTTPException(status_code=401, detail="missing or invalid API token")

    consumer = _consumer_id(request)
    rate_identity = _account_rate_identity()
    scope_limit = _scope_limit(scope)
    now = time.time()
    account_key = (rate_identity, _ACCOUNT_SCOPE)
    scope_key = (rate_identity, scope)
    async with _state_lock:
        _prune_rate_history(now)

        account_history = _rate_history.get(account_key)
        if account_history is None:
            account_history = deque()
            _rate_history[account_key] = account_history
        scope_history = _rate_history.get(scope_key)
        if scope_history is None:
            scope_history = deque()
            _rate_history[scope_key] = scope_history

        for history in (account_history, scope_history):
            while history and now - history[0] >= _RATE_HISTORY_WINDOW_SEC:
                history.popleft()

        if scope_limit <= 0:
            raise _rate_limited(
                consumer=consumer,
                rate_identity=rate_identity,
                scope=scope,
                limit=0,
                retry_after=60,
                error_code="SCOPE_DISABLED",
            )

        if account_history and _ACCOUNT_MIN_INTERVAL_SEC > 0:
            wait = _ACCOUNT_MIN_INTERVAL_SEC - (now - account_history[-1])
            if wait > 0:
                raise _rate_limited(
                    consumer=consumer,
                    rate_identity=rate_identity,
                    scope=_ACCOUNT_SCOPE,
                    limit=_ACCOUNT_RATE_LIMIT_PER_MIN,
                    retry_after=_retry_after_seconds(wait),
                    error_code="ACCOUNT_THROTTLED",
                )

        if len(account_history) >= _ACCOUNT_RATE_LIMIT_PER_MIN:
            retry_after = _retry_after_seconds(_RATE_HISTORY_WINDOW_SEC - (now - account_history[0]))
            raise _rate_limited(
                consumer=consumer,
                rate_identity=rate_identity,
                scope=_ACCOUNT_SCOPE,
                limit=_ACCOUNT_RATE_LIMIT_PER_MIN,
                retry_after=retry_after,
            )

        if len(scope_history) >= scope_limit:
            retry_after = _retry_after_seconds(_RATE_HISTORY_WINDOW_SEC - (now - scope_history[0]))
            raise _rate_limited(
                consumer=consumer,
                rate_identity=rate_identity,
                scope=scope,
                limit=scope_limit,
                retry_after=retry_after,
            )
        account_history.append(now)
        scope_history.append(now)
    return _AuthContext(consumer_id=consumer, rate_identity=rate_identity)


def _request_fingerprint(req: "VerifyRequest", outcome_str: str) -> str:
    raw = {
        "event_id": int(req.event_id),
        "outcome": outcome_str,
        "handicap": req.handicap,
        "period": req.period,
        "sport": req.sport,
        "is_alt": req.is_alt,
        "market": req.market,
        "market_context": req.market_context,
        "forted_home": req.forted_home,
        "forted_away": req.forted_away,
        "selection_id": req.selection_id,
        "odds_id": req.odds_id,
        "line_id": req.line_id,
    }
    encoded = json.dumps(raw, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _stop_refresh_body(
    req: "VerifyRequest",
    *,
    consumer: str,
    outcome_str: str,
    params: dict[str, Any],
    age_seconds: float,
) -> dict[str, Any]:
    body = {
        "status": "EXPIRED",
        "error_code": "VERIFY_WINDOW_EXPIRED",
        "detail": (
            "Same verify request has been refreshed for too long. Stop polling this "
            "selection and request a new verification before placing."
        ),
        "outcome": outcome_str,
        "consumer_id": consumer,
        "should_stop_refresh": True,
        "refresh_expired": True,
        "age_seconds": round(age_seconds, 2),
        "window_seconds": _VERIFY_WINDOW_SEC,
        "idle_reset_seconds": _VERIFY_WINDOW_IDLE_RESET_SEC,
        "timestamp": time.time(),
    }
    body_with_match_fields = _enrich_result(
        dict(body),
        event_id=int(req.event_id),
        outcome_str=outcome_str,
        params=params,
        request_period=int(req.period or 0),
        request_market=req.market,
    )
    return {**body, "results": [body_with_match_fields]}


async def _check_verify_refresh_window(
    req: "VerifyRequest",
    *,
    auth: _AuthContext,
    outcome_str: str,
    params: dict[str, Any],
) -> dict[str, Any] | None:
    if _VERIFY_WINDOW_SEC <= 0:
        return None
    now = time.time()
    fingerprint = _request_fingerprint(req, outcome_str)
    key = (auth.rate_identity, fingerprint)
    async with _state_lock:
        stale_keys = [
            item_key
            for item_key, (_first_seen, last_seen) in _verify_windows.items()
            if now - last_seen > _VERIFY_WINDOW_PRUNE_SEC
        ]
        for item_key in stale_keys:
            _verify_windows.pop(item_key, None)

        first_seen, last_seen = _verify_windows.get(key, (now, now))
        if now - last_seen > _VERIFY_WINDOW_IDLE_RESET_SEC:
            first_seen = now
        _verify_windows[key] = (first_seen, now)
        age = now - first_seen
        if age <= _VERIFY_WINDOW_SEC:
            return None

    return _stop_refresh_body(req, consumer=auth.consumer_id, outcome_str=outcome_str, params=params, age_seconds=age)


def _decimal_odds(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) and parsed > 1.0 else None


async def _compact_event_for_market_margin(
    event_id: int,
    sport: str | None,
) -> tuple[int | None, str, dict[str, Any] | None]:
    assert cache is not None
    sport_id = normalize_sport(sport or "") if sport else None
    if sport_id is not None:
        return sport_id, (sport or _SPORT_NAME_BY_ID.get(sport_id, "")).strip(), await cache.get_event(sport_id, event_id)

    for candidate in _COMPACT_SCAN_SPORT_IDS:
        ev = await cache.get_event(candidate, event_id)
        if ev:
            return candidate, _SPORT_NAME_BY_ID.get(candidate, ""), ev
    return None, "", None


async def _more_bet_event_for_market_margin(
    sport_id: int | None,
    event_id: int,
) -> dict[str, Any] | None:
    if sport_id is None or verifier is None:
        return None
    try:
        return await verifier._ws.get_event(int(sport_id), int(event_id))
    except Exception as exc:
        log.debug("market-margin MORE_BET lookup failed ev=%s sport=%s: %s", event_id, sport_id, exc)
        return None


_MARKET_CONTEXT_ALIASES = {
    "corner": "corners",
    "corners": "corners",
    "угловые": "corners",
    "card": "bookings",
    "cards": "bookings",
    "booking": "bookings",
    "bookings": "bookings",
    "карточки": "bookings",
}


def _normalize_market_context(value: Any) -> str:
    raw = str(value or "").strip().lower().replace("-", "_")
    return _MARKET_CONTEXT_ALIASES.get(raw, raw)


def _market_context_from_special_params(params: dict[str, Any]) -> str:
    special_type = str(params.get("special_type") or "").strip().lower()
    if special_type.startswith("corners_") or special_type == "corners_total":
        return "corners"
    if special_type.startswith("bookings_") or special_type == "bookings_total":
        return "bookings"
    return ""


def _event_market_context(event: dict[str, Any] | None) -> str:
    if not event:
        return ""
    text = f"{event.get('home') or ''} {event.get('away') or ''} {event.get('league_name') or ''}".lower()
    if "corner" in text:
        return "corners"
    if "booking" in text or "card" in text:
        return "bookings"
    return ""


def _select_market_context_event(event: dict[str, Any] | None, context: str) -> dict[str, Any] | None:
    context = _normalize_market_context(context)
    if not event or not context:
        return event
    children = event.get("children") if isinstance(event.get("children"), list) else []
    candidates = [*children]
    if _event_market_context(event) == context:
        candidates.append(event)
    for candidate in candidates:
        if isinstance(candidate, dict) and _event_market_context(candidate) == context:
            return candidate
    return None


def _normalize_market_scope(value: Any) -> str:
    raw = str(value or "").strip().lower()
    return raw if raw in {"sets", "games"} else ""


def _event_is_games_scope(event: dict[str, Any] | None) -> bool:
    if not event:
        return False
    text = f"{event.get('home') or ''} {event.get('away') or ''} {event.get('league_name') or ''}".lower()
    return "(games)" in text or " games" in text or text.startswith("games ")


def _select_tennis_scope_event(event: dict[str, Any] | None, scope: str) -> dict[str, Any] | None:
    """Select the exact related tennis board without consulting any price."""
    scope = _normalize_market_scope(scope)
    if not event or not scope:
        return event
    children = event.get("children") if isinstance(event.get("children"), list) else []
    candidates = [event, *[child for child in children if isinstance(child, dict)]]
    wanted_games = scope == "games"
    matches = [candidate for candidate in candidates if _event_is_games_scope(candidate) == wanted_games]
    return matches[0] if len(matches) == 1 else None


def _format_line_value(value: Any) -> str:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = 0.0
    if parsed == int(parsed):
        return str(int(parsed))
    return f"{parsed:.2f}".rstrip("0").rstrip(".")


def _standard_outcome_from_contextual_special(outcome_str: str, params: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
    if is_standard_market(params):
        return outcome_str, params
    context = _market_context_from_special_params(params)
    if context not in {"corners", "bookings"}:
        return None

    special_type = str(params.get("special_type") or "").strip().lower()
    contestant = str(params.get("contestant") or "").strip().lower()
    line = _format_line_value(params.get("handicap"))
    period = int(params.get("period") or 0)
    standard: str | None = None
    if special_type.endswith("_home_total"):
        direction = ">" if contestant == "over" else "<"
        standard = f"IT1{direction} {line}"
    elif special_type.endswith("_away_total"):
        direction = ">" if contestant == "over" else "<"
        standard = f"IT2{direction} {line}"
    elif special_type.endswith("_total"):
        direction = ">" if contestant == "over" else "<"
        standard = f"T{direction} {line}"
    elif special_type.endswith("_handicap"):
        team = "1" if contestant == "home" else "2" if contestant == "away" else ""
        if team:
            standard = f"H{team} {line}"
    if not standard:
        return None
    return standard, outcome_to_ps3838(standard, None, period)


async def _resolve_contextual_market_request(
    req: "VerifyRequest",
    outcome_str: str,
    params: dict[str, Any],
) -> dict[str, Any] | None:
    context = _normalize_market_context(req.market_context) or _market_context_from_special_params(params)
    if not context:
        return None
    if context not in {"corners", "bookings"}:
        return {
            "error_code": "UNSUPPORTED_MARKET_CONTEXT",
            "detail": f"Market context {context!r} is not supported for child-event verification yet",
        }

    standard_pair = _standard_outcome_from_contextual_special(outcome_str, params)
    if standard_pair is None:
        return {
            "error_code": "UNSUPPORTED_MARKET_CONTEXT",
            "detail": f"Cannot map {outcome_str!r} to a standard child-event market for {context}",
        }
    standard_outcome, standard_params = standard_pair
    sport_hint = req.sport or req.sport_name or _outcome_implies_sport(standard_outcome)
    sport_id = normalize_sport(sport_hint or "")
    if sport_id is None:
        sport_id, sport_label, _event = await _compact_event_for_market_margin(int(req.event_id), sport_hint)
    else:
        sport_label = sport_hint or _SPORT_NAME_BY_ID.get(sport_id, "")
    more_bet_event = await _more_bet_event_for_market_margin(sport_id, int(req.event_id))
    context_event = _select_market_context_event(more_bet_event, context)
    if not context_event:
        return {
            "error_code": "MARKET_CONTEXT_EVENT_NOT_FOUND",
            "detail": f"PS3838 MORE_BET did not return a {context} child event for {req.event_id}",
            "sport_id": sport_id,
            "sport": sport_label or sport_hint,
        }

    child_event_id = int(context_event["raw"][0])
    period = int(standard_params["period"])
    ps_period = internal_to_ps3838_period(period, sport_label or sport_hint or "")
    bet_type, team_select, handicap, reversed_flag = _effective_market_params(
        context_event,
        standard_params,
        forted_home=req.forted_home,
        forted_away=req.forted_away,
    )
    line_meta = resolve_line_meta(
        context_event,
        period=ps_period,
        bet_type=bet_type,
        team_select=team_select,
        handicap=handicap,
    )
    return {
        "context": context,
        "parent_event_id": int(req.event_id),
        "event_id": child_event_id,
        "event": context_event,
        "sport_id": sport_id,
        "sport": sport_label or sport_hint,
        "outcome": standard_outcome,
        "params": standard_params,
        "period": period,
        "ps_period": ps_period,
        "effective_params": {
            "period": period,
            "bet_type": bet_type,
            "team_select": team_select,
            "handicap": handicap,
            "is_alt": int((line_meta or {}).get("is_alt") or standard_params.get("is_alt") or 0),
        },
        "line_id": (line_meta or {}).get("line_id"),
        "line_meta": line_meta,
        "reversed": reversed_flag,
        "home_team": context_event.get("home"),
        "away_team": context_event.get("away"),
    }


def _effective_market_params(
    event: dict[str, Any],
    params: dict[str, Any],
    *,
    forted_home: str | None,
    forted_away: str | None,
) -> tuple[int, int, float, bool]:
    bet_type = int(params["bet_type"])
    team_select = int(params["team_select"])
    handicap = float(params["handicap"])

    reversed_flag = False
    if forted_home and forted_away:
        ps_home = event.get("home") or ""
        ps_away = event.get("away") or ""
        fwd = (_name_share(ps_home, forted_home) + _name_share(ps_away, forted_away)) / 2
        rev = (_name_share(ps_home, forted_away) + _name_share(ps_away, forted_home)) / 2
        reversed_flag = rev > fwd and (rev - fwd) >= 0.25

    if not reversed_flag:
        return bet_type, team_select, handicap, False

    if bet_type in (1, 2):
        if team_select == 0:
            team_select = 1
        elif team_select == 1:
            team_select = 0
    elif bet_type == 4:
        bet_type = 5
        team_select = 7 if team_select == 5 else (1 if team_select == 0 else team_select)
    elif bet_type == 5:
        bet_type = 4
        team_select = 5 if team_select == 7 else (0 if team_select == 1 else team_select)
    return bet_type, team_select, handicap, True


async def _effective_request_params_for_event_order(
    req: "VerifyRequest",
    *,
    event_id: int,
    sport: str,
    params: dict[str, Any],
) -> tuple[dict[str, Any], bool, dict[str, Any] | None]:
    effective = dict(params)
    if not is_standard_market(params) or not (req.forted_home and req.forted_away):
        return effective, False, None

    event: dict[str, Any] | None = None
    sport_id: int | None = normalize_sport(sport or "") if sport else None
    if cache is not None:
        sport_id, _sport_label, event = await _compact_event_for_market_margin(event_id, sport)
    if event is None:
        event = await _more_bet_event_for_market_margin(sport_id, event_id)
    if event is None:
        return effective, False, None

    bet_type, team_select, handicap, reversed_flag = _effective_market_params(
        event,
        params,
        forted_home=req.forted_home,
        forted_away=req.forted_away,
    )
    effective.update({
        "bet_type": bet_type,
        "team_select": team_select,
        "handicap": handicap,
    })
    return effective, reversed_flag, event


def _opposite_selection_for_margin(
    *,
    bet_type: int,
    team_select: int,
    handicap: float,
    actual_handicap: Any = None,
) -> tuple[int, float] | None:
    if bet_type == 2:
        if team_select not in (0, 1):
            return None
        actual = _decimal_or_raw_float(actual_handicap)
        selected_hcp = actual if actual is not None else float(handicap)
        return (1 - team_select, -selected_hcp)
    if bet_type == 3:
        if team_select == 3:
            return (4, float(handicap))
        if team_select == 4:
            return (3, float(handicap))
        return None
    if bet_type == 4:
        if team_select == 5:
            return (0, float(handicap))
        if team_select == 0:
            return (5, float(handicap))
        return None
    if bet_type == 5:
        if team_select == 7:
            return (1, float(handicap))
        if team_select == 1:
            return (7, float(handicap))
        return None
    return None


def _decimal_or_raw_float(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _market_margin_signature(body: dict[str, Any]) -> str:
    outcomes = body.get("outcomes")
    if isinstance(outcomes, list):
        compact_outcomes = [
            {
                "team_select": item.get("team_select"),
                "line_id": item.get("line_id"),
                "odds": round(float(item["odds"]), 6),
            }
            for item in outcomes
            if isinstance(item, dict) and _decimal_odds(item.get("odds")) is not None
        ]
    else:
        compact_outcomes = [
            {
                "team_select": body.get("team_select"),
                "line_id": body.get("line_id"),
                "odds": round(float(body["selected_odds"]), 6),
            },
            {
                "team_select": body.get("opposite_team_select"),
                "line_id": body.get("opposite_line_id"),
                "odds": round(float(body["opposite_odds"]), 6),
            },
        ]
    payload = {
        "source": body.get("source"),
        "period": body.get("period"),
        "bet_type": body.get("bet_type"),
        "handicap": body.get("handicap"),
        "outcomes": sorted(compact_outcomes, key=lambda item: str(item.get("team_select"))),
    }
    return json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def _compact_market_margin_from_event(
    event: dict[str, Any],
    *,
    period: int,
    bet_type: int,
    team_select: int,
    handicap: float,
    source: str = "compact",
) -> dict[str, Any] | None:
    selected = resolve_line_meta(
        event,
        period=period,
        bet_type=bet_type,
        team_select=team_select,
        handicap=handicap,
    )
    if not selected:
        return None
    selected_odds = _decimal_odds(selected.get("odds"))
    if selected_odds is None:
        return None

    if bet_type == 1:
        outcomes: list[dict[str, Any]] = []
        for candidate_team in (0, 1, 2):
            meta = resolve_line_meta(
                event,
                period=period,
                bet_type=1,
                team_select=candidate_team,
                handicap=0.0,
            )
            odds = _decimal_odds(meta.get("odds") if meta else None)
            if odds is None:
                continue
            outcomes.append({
                "team_select": candidate_team,
                "line_id": meta.get("line_id"),
                "odds": odds,
            })
        if len(outcomes) < 2:
            return None
        margin = sum(1.0 / item["odds"] for item in outcomes) - 1.0
        if not math.isfinite(margin):
            return None
        body = {
            "status": "OK",
            "source": source,
            "margin": margin,
            "margin_type": "moneyline",
            "selected_odds": selected_odds,
            "line_id": selected.get("line_id"),
            "selected_line_id": selected.get("line_id"),
            "is_alt": int(selected.get("is_alt") or 0),
            "period": int(period),
            "bet_type": int(bet_type),
            "team_select": int(team_select),
            "handicap": float(handicap),
            "outcomes": outcomes,
            "opposite_odds": [
                item["odds"]
                for item in outcomes
                if int(item.get("team_select")) != int(team_select)
            ],
        }
        body["price_signature"] = _market_margin_signature(body)
        return body

    opposite = _opposite_selection_for_margin(
        bet_type=bet_type,
        team_select=team_select,
        handicap=handicap,
        actual_handicap=selected.get("actual_handicap"),
    )
    if opposite is None:
        return None
    opposite_team, opposite_handicap = opposite
    opposite_meta = resolve_line_meta(
        event,
        period=period,
        bet_type=bet_type,
        team_select=opposite_team,
        handicap=opposite_handicap,
    )
    if not opposite_meta:
        return None
    opposite_odds = _decimal_odds(opposite_meta.get("odds"))
    if opposite_odds is None:
        return None

    margin = 1.0 / selected_odds + 1.0 / opposite_odds - 1.0
    if not math.isfinite(margin):
        return None
    body = {
        "status": "OK",
        "source": source,
        "margin": margin,
        "margin_type": "two_way",
        "selected_odds": selected_odds,
        "opposite_odds": opposite_odds,
        "line_id": selected.get("line_id"),
        "selected_line_id": selected.get("line_id"),
        "opposite_line_id": opposite_meta.get("line_id"),
        "is_alt": int(selected.get("is_alt") or 0),
        "opposite_is_alt": int(opposite_meta.get("is_alt") or 0),
        "actual_handicap": selected.get("actual_handicap"),
        "opposite_actual_handicap": opposite_meta.get("actual_handicap"),
        "period": int(period),
        "bet_type": int(bet_type),
        "team_select": int(team_select),
        "opposite_team_select": int(opposite_team),
        "handicap": float(handicap),
        "opposite_handicap": float(opposite_handicap),
    }
    body["price_signature"] = _market_margin_signature(body)
    return body


def _sample_selection_payload(
    *,
    event_id: int,
    sport_id: int,
    sport: str,
    event: dict[str, Any],
    period: int,
    market: str,
    outcome: str,
    bet_type: int,
    team_select: int,
    handicap: float,
    line_meta: dict[str, Any],
) -> dict[str, Any] | None:
    odds = _decimal_odds(line_meta.get("odds") if line_meta else None)
    line_id = line_meta.get("line_id") if line_meta else None
    if odds is None or not line_id:
        return None

    verify_payload: dict[str, Any] = {
        "event_id": int(event_id),
        "sport": sport,
        "period": int(period),
        "market": market,
        "outcome": outcome,
        "line_id": str(line_id),
        "fresh": False,
    }
    if int(line_meta.get("is_alt") or 0):
        verify_payload["is_alt"] = int(line_meta.get("is_alt") or 0)
    if bet_type in (2, 3, 4, 5):
        verify_payload["handicap"] = float(handicap)

    return {
        "event_id": int(event_id),
        "sport_id": int(sport_id),
        "sport": sport,
        "period": int(period),
        "market": market,
        "outcome": outcome,
        "bet_type": int(bet_type),
        "team_select": int(team_select),
        "handicap": float(handicap),
        "line_id": int(line_id),
        "is_alt": int(line_meta.get("is_alt") or 0),
        "pin_odds": odds,
        "home_team": event.get("home"),
        "away_team": event.get("away"),
        "league": event.get("league_name"),
        "is_live": bool(event.get("is_live")),
        "verify_payload": verify_payload,
    }


def _period_sort_key(item: tuple[str, Any]) -> tuple[int, str]:
    try:
        return (int(item[0]), item[0])
    except (TypeError, ValueError):
        return (9999, str(item[0]))


def _candidate_samples_for_period(
    *,
    event_id: int,
    sport_id: int,
    sport: str,
    event: dict[str, Any],
    period: int,
    period_block: Any,
) -> list[dict[str, Any]]:
    if not isinstance(period_block, list) or len(period_block) < 3:
        return []

    samples: list[dict[str, Any]] = []

    for outcome, team_select in (("1", 0), ("2", 1), ("X", 2)):
        meta = resolve_line_meta(
            event,
            period=period,
            bet_type=1,
            team_select=team_select,
            handicap=0.0,
        )
        sample = _sample_selection_payload(
            event_id=event_id,
            sport_id=sport_id,
            sport=sport,
            event=event,
            period=period,
            market="Moneyline",
            outcome=outcome,
            bet_type=1,
            team_select=team_select,
            handicap=0.0,
            line_meta=meta or {},
        )
        if sample:
            samples.append(sample)

    total_block = period_block[1] if len(period_block) > 1 else None
    if isinstance(total_block, list):
        for line in total_block:
            if not isinstance(line, list) or len(line) < 5:
                continue
            try:
                total = float(line[1])
            except (TypeError, ValueError):
                continue
            for outcome, team_select in ((f"T> {_format_handicap(total)}", 3), (f"T< {_format_handicap(total)}", 4)):
                meta = resolve_line_meta(
                    event,
                    period=period,
                    bet_type=3,
                    team_select=team_select,
                    handicap=total,
                )
                sample = _sample_selection_payload(
                    event_id=event_id,
                    sport_id=sport_id,
                    sport=sport,
                    event=event,
                    period=period,
                    market="Totals",
                    outcome=outcome,
                    bet_type=3,
                    team_select=team_select,
                    handicap=total,
                    line_meta=meta or {},
                )
                if sample:
                    samples.append(sample)
            break

    handicap_block = period_block[0] if period_block else None
    if isinstance(handicap_block, list):
        for line in handicap_block:
            if not isinstance(line, list) or len(line) < 8:
                continue
            try:
                h1 = float(line[0])
                h2 = float(line[1])
            except (TypeError, ValueError):
                continue
            for outcome, team_select, handicap in (
                (f"H1 {_format_handicap(h1)}", 0, h1),
                (f"H2 {_format_handicap(h2)}", 1, h2),
            ):
                meta = resolve_line_meta(
                    event,
                    period=period,
                    bet_type=2,
                    team_select=team_select,
                    handicap=handicap,
                )
                sample = _sample_selection_payload(
                    event_id=event_id,
                    sport_id=sport_id,
                    sport=sport,
                    event=event,
                    period=period,
                    market="Handicap",
                    outcome=outcome,
                    bet_type=2,
                    team_select=team_select,
                    handicap=handicap,
                    line_meta=meta or {},
                )
                if sample:
                    samples.append(sample)
            break

    return samples


def _public_session_info() -> dict[str, Any]:
    pinnacle_disabled = not session.login_id or not session.login_password or session.login_id.lower() in ("disabled", "none", "")
    info = session.info()
    info.pop("login_id", None)

    bia_enabled = os.environ.get("BIA_ENABLED") in ("1", "true", "yes")
    if pinnacle_disabled:
        info["mode"] = "bia_only" if bia_enabled else "disabled"
        info["pinnacle_enabled"] = False
        info["pinnacle_state"] = "disabled"
        info["login_error"] = False
    else:
        info["mode"] = "hybrid" if bia_enabled else "pinnacle_only"
        info["pinnacle_enabled"] = True
        info["pinnacle_state"] = "active"
        info["login_error"] = bool(info.get("login_error"))

    info["bia_enabled"] = bia_enabled
    info["default_bet_engine"] = "bia"
    if line_worker is not None:
        info["pinnacle_line_worker"] = line_worker.info()
    return info



maintenance_mode = False
active_places = 0
active_places_lock: asyncio.Lock | None = None
active_places_changed: asyncio.Condition | None = None
bia_placer_client = None
line_worker = None


def _ensure_active_places_sync() -> asyncio.Condition:
    """Create lock/condition on the running event loop (not at import time)."""
    global active_places_lock, active_places_changed
    loop = asyncio.get_running_loop()
    # Recreate if missing or bound to a different loop (unit tests / reloads).
    bound = getattr(active_places_changed, "_loop", None) if active_places_changed is not None else None
    if active_places_changed is None or (bound is not None and bound is not loop):
        active_places_lock = asyncio.Lock()
        active_places_changed = asyncio.Condition(active_places_lock)
    return active_places_changed


async def _register_place() -> None:
    """Atomically reject new work once drain begins, otherwise count it."""
    global active_places
    cv = _ensure_active_places_sync()
    async with cv:
        if maintenance_mode:
            raise HTTPException(status_code=503, detail="MAINTENANCE_MODE_ACTIVE")
        active_places += 1


async def _finish_place() -> None:
    global active_places
    cv = _ensure_active_places_sync()
    async with cv:
        active_places = max(0, active_places - 1)
        cv.notify_all()

@app.on_event("startup")
async def _startup() -> None:
    global cache, verifier, bia_placer_client, line_worker
    log.info("Starting PS3838 session")

    # Initialize BIA client if enabled
    bia_enabled = os.environ.get("BIA_ENABLED") in ("1", "true", "yes")
    bia_login = os.environ.get("BIA_LOGIN", "").strip()
    bia_password = os.environ.get("BIA_PASSWORD", "").strip()
    bia_base_url = os.environ.get("BIA_BASE_URL", "https://black.betinasia.com").strip()
    if bia_enabled and bia_login and bia_password:
        from bia_placer import BiaPlacer
        bia_placer_client = BiaPlacer(bia_login, bia_password, base_url=bia_base_url)
        await bia_placer_client.start()
        log.info("BIA Placer client initialized")

    if not _API_KEYS:
        log.warning("API key auth is disabled; keep the service bound to localhost or a private interface")
    await session.start()
    cache = CompactCache(session)
    verifier = Verifier(session, cache)
    from pinnacle_worker import PinnacleLineWorker
    line_worker = PinnacleLineWorker(session)
    await line_worker.start()
    log.info("Session started")


@app.on_event("shutdown")
async def _shutdown() -> None:
    global bia_placer_client, line_worker
    if line_worker:
        await line_worker.stop()
        line_worker = None
    await session.stop()
    if bia_placer_client:
        await bia_placer_client.close()
        log.info("BIA Placer client closed")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", **_public_session_info()}


@app.get("/sample-selection")
async def sample_selection(request: Request, sport: str | None = None, limit: int = 5) -> dict:
    pinnacle_disabled = not session.login_id or not session.login_password or session.login_id.lower() in ("disabled", "none", "")
    if pinnacle_disabled:
        raise HTTPException(status_code=400, detail="PINNACLE_DISABLED")
    """Return read-only live compact selections that can be used for smoke tests."""
    assert cache is not None
    auth = await _authorize_and_rate_limit(request, "market-margin")
    sample_limit = max(1, min(int(limit or 5), 20))

    if sport:
        sport_id = normalize_sport(sport)
        if sport_id is None:
            raise HTTPException(status_code=400, detail=f"unsupported sport: {sport}")
        sport_ids = (sport_id,)
    else:
        sport_ids = _COMPACT_SCAN_SPORT_IDS

    samples: list[dict[str, Any]] = []
    scanned: list[dict[str, Any]] = []
    for sport_id in sport_ids:
        sport_label = _SPORT_NAME_BY_ID.get(int(sport_id), str(sport_id))
        events = await cache._fetch(int(sport_id))
        scanned.append({
            "sport_id": int(sport_id),
            "sport": sport_label,
            "events": len(events),
        })
        for event_id, event in events.items():
            periods = _periods_dict(event)
            for period_raw, period_block in sorted(periods.items(), key=_period_sort_key):
                try:
                    period = int(period_raw)
                except (TypeError, ValueError):
                    continue
                samples.extend(_candidate_samples_for_period(
                    event_id=int(event_id),
                    sport_id=int(sport_id),
                    sport=sport_label,
                    event=event,
                    period=period,
                    period_block=period_block,
                ))
                if len(samples) >= sample_limit:
                    break
            if len(samples) >= sample_limit:
                break
        if len(samples) >= sample_limit:
            break

    return {
        "status": "OK" if samples else "UNAVAILABLE",
        "consumer_id": auth.consumer_id,
        "limit": sample_limit,
        "count": min(len(samples), sample_limit),
        "scanned": scanned,
        "samples": samples[:sample_limit],
        "timestamp": time.time(),
    }


@app.get("/balance")
async def balance(request: Request) -> dict:
    pinnacle_disabled = not session.login_id or not session.login_password or session.login_id.lower() in ("disabled", "none", "")
    if pinnacle_disabled:
        raise HTTPException(status_code=400, detail="PINNACLE_DISABLED")
    await _authorize_and_rate_limit(request, "balance")
    return await session.get_balance()


@app.post("/relogin")
async def relogin(request: Request) -> dict:
    pinnacle_disabled = not session.login_id or not session.login_password or session.login_id.lower() in ("disabled", "none", "")
    if pinnacle_disabled:
        raise HTTPException(status_code=400, detail="PINNACLE_DISABLED")
    await _authorize_and_rate_limit(request, "relogin")
    await session.relogin()
    return {"ok": True, **_public_session_info()}


class VerifyRequest(BaseModel):
    event_id: int
    outcome: str | None = None
    raw_selection: str | None = None
    handicap: float | None = None
    period: int | None = 0
    sport: str | None = None
    is_alt: int = 0
    fresh: bool = False
    expected_odds: float | None = None
    # Forted home/away — used to detect when PS3838 reversed team order.
    # When provided we flip the team bucket to match PS3838's event order.
    # The handicap sign remains attached to the same real team's line.
    forted_home: str | None = None
    forted_away: str | None = None
    # Market family ("Moneyline" / "Totals" / "Handicap" / etc.) classified
    # by the caller. We mirror it back into each `results[i].market`.
    market: str | None = None
    # Optional statistics market context for child-event markets, e.g.
    # "corners" or "bookings". Consumers may send either this field with a
    # regular raw_selection, or a contextual outcome such as "CIT2> 2.5".
    market_context: str | None = None
    # Tennis related-matchup identity: Forted distinguishes match/set markets
    # from the ``(Games)`` child board.  This is structural, never price-based.
    market_scope: str | None = None
    # Extra caller fields we do not need for PS3838; accept and ignore so
    # Pydantic does not raise on validation.
    bookmaker1: str | None = None
    bookmaker2: str | None = None
    sport_name: str | None = None
    selection: str | None = None
    selection_id: str | None = None
    odds_id: str | None = None
    line_id: str | None = None
    is_live: bool | None = None
    # BIA is the default engine. Only the explicit value "pinnacle" opts into
    # direct placement/verification through the shared browser session.
    side: str | None = None

    model_config = {"extra": "ignore"}


class PlaceRequest(VerifyRequest):
    stake: float = Field(default=1.0, gt=0)
    expected_odds: float | None = Field(default=None, gt=1)
    odds_tolerance: float | None = Field(default=None, ge=0)
    accept_better_odds: bool = False
    odds_format: int = 1
    wager_type: str = "NORMAL"
    win_risk_stake: str | None = None
    dry_run: bool = False


def _resolve_outcome_and_params(req: VerifyRequest) -> tuple[str, dict[str, Any]]:
    outcome_str = req.outcome
    if not outcome_str and req.raw_selection:
        outcome_str = forted_translate(req.raw_selection, int(req.period or 0))
    if not outcome_str:
        raise HTTPException(400, "outcome or raw_selection required")
    try:
        params = outcome_to_ps3838(outcome_str, req.handicap, req.period)
    except Exception as exc:
        raise HTTPException(400, f"outcome map failed: {exc}")
    return outcome_str, params


def _format_handicap(value: Any) -> str:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return "0"
    if parsed == int(parsed):
        return str(int(parsed))
    return ("%g" % parsed)


def _parse_ps3838_odds_id(value: Any) -> dict[str, Any] | None:
    parts = str(value or "").strip().split("|")
    if len(parts) != 6:
        return None
    try:
        return {
            "event_id": int(parts[0]),
            "period": int(parts[1]),
            "bet_type": int(parts[2]),
            "team_select": int(parts[3]),
            "is_alt": int(parts[4]),
            "handicap": float(parts[5]),
        }
    except (TypeError, ValueError):
        return None


def _selection_id_for_exact_verify(req: VerifyRequest) -> str:
    selection_id = str(req.selection_id or "").strip()
    if selection_id:
        return selection_id
    odds_id = str(req.odds_id or "").strip()
    line_id = str(req.line_id or "").strip()
    if odds_id and line_id:
        return f"{line_id}|{odds_id}|0"
    return ""


def _exact_contextual_standard_request(
    req: VerifyRequest,
    outcome_str: str,
    params: dict[str, Any],
    *,
    exact_odds_id: str,
    exact_selection_id: str,
) -> dict[str, Any] | None:
    if not (exact_odds_id or exact_selection_id):
        return None
    context = _normalize_market_context(req.market_context) or _market_context_from_special_params(params)
    if not context:
        return None
    standard_pair = _standard_outcome_from_contextual_special(outcome_str, params)
    if standard_pair is None:
        return None
    standard_outcome, standard_params = standard_pair
    return {
        "context": context,
        "outcome": standard_outcome,
        "params": standard_params,
    }


def _exact_ids_mismatch_reason(
    *,
    req: VerifyRequest,
    odds_id: str,
    selection_id: str,
    event_id: int,
    sport: str,
    params: dict[str, Any],
) -> str | None:
    parsed = _parse_ps3838_odds_id(odds_id)
    if not parsed:
        return "odds_id is not a PS3838 standard market tuple"
    expected_period = internal_to_ps3838_period(int(params["period"]), sport or "")
    expected = {
        "event_id": int(event_id),
        "period": int(expected_period),
        "bet_type": int(params["bet_type"]),
        "team_select": int(params["team_select"]),
        "is_alt": int(req.is_alt or params.get("is_alt", 0)),
        "handicap": float(params["handicap"]),
    }
    for key in ("event_id", "period", "bet_type", "team_select"):
        if parsed[key] != expected[key]:
            return f"odds_id {key}={parsed[key]} does not match request {expected[key]}"
    if expected["is_alt"] and parsed["is_alt"] != expected["is_alt"]:
        return f"odds_id is_alt={parsed['is_alt']} does not match request {expected['is_alt']}"
    if not math.isclose(float(parsed["handicap"]), float(expected["handicap"]), abs_tol=0.0001):
        return f"odds_id handicap={parsed['handicap']} does not match request {expected['handicap']}"
    if not selection_id:
        return "selection_id is required for exact-id verification"
    if str(req.line_id or "").strip() and not selection_id.startswith(f"{str(req.line_id).strip()}|"):
        parts = selection_id.split("|")
        if len(parts) < 2 or parts[1] != str(req.line_id).strip():
            return "selection_id does not include the requested line_id"
    return None


def _looks_like_soccer(outcome: str) -> bool:
    return False


def _outcome_implies_sport(outcome: str | None) -> str:
    if not outcome:
        return "Soccer"
    return "Soccer"


def _direct_pinnacle_requested(req: VerifyRequest) -> bool:
    return str(req.side or "").strip().lower() == "pinnacle"


@app.post("/verify")
async def verify(request: Request, req: VerifyRequest) -> dict:
    """Verify a single selection.

    Returns a response in two shapes:
      - Top-level fields (status, odds, etc.) — used by direct callers.
      - `results: [...]` array — kept for compatibility with matcher-style consumers.
    """
    assert verifier is not None
    auth = await _authorize_and_rate_limit(request, "verify")
    pinnacle_disabled = not session.login_id or not session.login_password or session.login_id.lower() in ("disabled", "none", "")
    if not _direct_pinnacle_requested(req):
        return await handle_fallback_verify(req)
    if pinnacle_disabled:
        body = {"status": "UNAVAILABLE", "error_code": "PINNACLE_DISABLED", "error": "Direct Pinnacle was requested but is disabled."}
        return {**body, "results": [dict(body, event_id=int(req.event_id), market=req.market)]}
    if session.login_error:
        body = {
            "status": "ERROR",
            "error_code": "PS3838_AUTH_FAILED",
            "error": session.login_error,
            "outcome": req.outcome or req.raw_selection,
        }
        return {**body, "results": [dict(body, event_id=int(req.event_id), market=req.market)]}

    outcome_str, params = _resolve_outcome_and_params(req)
    expired = await _check_verify_refresh_window(req, auth=auth, outcome_str=outcome_str, params=params)
    if expired is not None:
        return expired

    exact_odds_id = str(req.odds_id or "").strip()
    exact_selection_id = _selection_id_for_exact_verify(req)
    exact_context = _exact_contextual_standard_request(
        req,
        outcome_str,
        params,
        exact_odds_id=exact_odds_id,
        exact_selection_id=exact_selection_id,
    )
    context_resolution = None
    if exact_context:
        outcome_str = str(exact_context["outcome"])
        params = dict(exact_context["params"])
    else:
        context_resolution = await _resolve_contextual_market_request(req, outcome_str, params)

    if context_resolution and context_resolution.get("error_code"):
        body = {
            "status": "UNAVAILABLE",
            "error_code": context_resolution["error_code"],
            "detail": context_resolution.get("detail"),
            "outcome": outcome_str,
            "outcome_params": params,
            "market_context": _normalize_market_context(req.market_context) or _market_context_from_special_params(params),
        }
        body_with_match_fields = _enrich_result(
            body,
            event_id=int(req.event_id),
            outcome_str=outcome_str,
            params=params,
            request_period=int(req.period or 0),
            request_market=req.market,
        )
        return {**body, "results": [body_with_match_fields]}
    if context_resolution:
        outcome_str = str(context_resolution["outcome"])
        params = dict(context_resolution["params"])

    if not is_standard_market(params):
        body = {
            "status": "UNAVAILABLE",
            "error_code": "NON_STANDARD_MARKET",
            "outcome": outcome_str,
            "outcome_params": params,
        }
        body_with_match_fields = _enrich_result(
            body,
            event_id=int(req.event_id),
            outcome_str=outcome_str,
            params=params,
            request_period=int(req.period or 0),
            request_market=req.market,
        )
        return {**body, "results": [body_with_match_fields]}

    sport = req.sport or _outcome_implies_sport(outcome_str)
    verify_event_id = int(context_resolution["event_id"]) if context_resolution else int(req.event_id)
    verifier_params = dict(context_resolution.get("effective_params") or params) if context_resolution else params
    line_id_hint = (
        context_resolution.get("line_id")
        if context_resolution and context_resolution.get("line_id") else req.line_id
    )
    if exact_odds_id or exact_selection_id:
        exact_params = verifier_params
        exact_reversed = False
        exact_order_event = None
        if not context_resolution:
            exact_params, exact_reversed, exact_order_event = await _effective_request_params_for_event_order(
                req,
                event_id=verify_event_id,
                sport=sport,
                params=verifier_params,
            )
        mismatch_reason = _exact_ids_mismatch_reason(
            req=req,
            odds_id=exact_odds_id,
            selection_id=exact_selection_id,
            event_id=verify_event_id,
            sport=sport,
            params=exact_params,
        )
        if mismatch_reason:
            body = {
                "status": "MISMATCH",
                "error_code": "SELECTION_ID_MISMATCH",
                "detail": mismatch_reason,
                "outcome": outcome_str,
                "outcome_params": exact_params,
                "reversed": exact_reversed,
                "home_team": exact_order_event.get("home") if exact_order_event else None,
                "away_team": exact_order_event.get("away") if exact_order_event else None,
                "odds_id": exact_odds_id or None,
                "selection_id": exact_selection_id or None,
            }
            body_with_match_fields = _enrich_result(
                body,
                event_id=verify_event_id,
                outcome_str=outcome_str,
                params=params,
                request_period=int(req.period or 0),
                request_market=req.market,
            )
            return {**body, "results": [body_with_match_fields]}
        res = await verifier.verify_by_ids(
            odds_id=exact_odds_id,
            selection_id=exact_selection_id,
            fresh=bool(req.fresh),
            line_id_hint=line_id_hint,
        )
    else:
        res = await verifier.verify_one(
            event_id=verify_event_id,
            sport=sport,
            period=int(verifier_params["period"]),
            bet_type=int(verifier_params["bet_type"]),
            team_select=int(verifier_params["team_select"]),
            handicap=float(verifier_params["handicap"]),
            is_alt=int(req.is_alt or verifier_params.get("is_alt", 0)),
            fresh=bool(req.fresh),
            forted_home=req.forted_home,
            forted_away=req.forted_away,
            line_id_hint=line_id_hint,
        )
    res["request_outcome"] = outcome_str
    res["request_params"] = params
    if context_resolution:
        res["market_context"] = context_resolution.get("context")
        res["parent_event_id"] = context_resolution.get("parent_event_id")
        res["resolved_event_id"] = verify_event_id
    elif exact_context:
        res["market_context"] = exact_context.get("context")
    res["timestamp"] = time.time()
    requested_line_id = res.get("compact_line_id") or res.get("line_id")
    requested_selection_id = res.get("selection_id_sent") or res.get("selection_id")
    base_result = {
        "status": res.get("status"),
        "odds": res.get("odds"),
        "error_code": res.get("error_code"),
        "max_stake": res.get("max_stake"),
        "min_stake": res.get("min_stake"),
        "selection_id": requested_selection_id,
        "selection_id_sent": res.get("selection_id_sent"),
        "ps_selection_id": res.get("selection_id"),
        # PS3838 sometimes echoes a parent/base line id in the cart response
        # while the sent selection id contains the requested alt line id. For
        # caller binding, the requested line is the authoritative identity.
        "line_id": requested_line_id,
        "ps_line_id": res.get("line_id"),
        "odds_id": res.get("odds_id"),
        "current_score": res.get("current_score"),
        "home_team": res.get("home_team"),
        "away_team": res.get("away_team"),
        "league": res.get("league"),
        "fresh": res.get("fresh", True),
        "age_seconds": res.get("age_seconds", 0.0),
        "parent_event_id": res.get("parent_event_id"),
        "market_context": res.get("market_context"),
    }
    res["results"] = [
        _enrich_result(
            base_result,
            event_id=verify_event_id,
            outcome_str=outcome_str,
            params=params,
            request_period=int(req.period or 0),
            request_market=req.market,
        )
    ]
    return res


@app.post("/market-margin")
async def market_margin(request: Request, req: VerifyRequest) -> dict:
    """Return Pinnacle market margin from compact/events without touching betslip."""
    assert cache is not None
    auth = await _authorize_and_rate_limit(request, "market-margin")
    if session.login_error:
        return {
            "status": "ERROR",
            "error_code": "PS3838_AUTH_FAILED",
            "error": session.login_error,
            "consumer_id": auth.consumer_id,
            "outcome": req.outcome or req.raw_selection,
            "timestamp": time.time(),
        }

    outcome_str, params = _resolve_outcome_and_params(req)
    context_resolution = await _resolve_contextual_market_request(req, outcome_str, params)
    if context_resolution and context_resolution.get("error_code"):
        return {
            "status": "UNAVAILABLE",
            "error_code": context_resolution["error_code"],
            "detail": context_resolution.get("detail"),
            "event_id": int(req.event_id),
            "outcome": outcome_str,
            "outcome_params": params,
            "market_context": _normalize_market_context(req.market_context) or _market_context_from_special_params(params),
            "consumer_id": auth.consumer_id,
            "timestamp": time.time(),
        }
    if context_resolution:
        outcome_str = str(context_resolution["outcome"])
        params = dict(context_resolution["params"])

    if not is_standard_market(params):
        return {
            "status": "UNAVAILABLE",
            "error_code": "NON_STANDARD_MARKET",
            "outcome": outcome_str,
            "outcome_params": params,
            "consumer_id": auth.consumer_id,
            "timestamp": time.time(),
        }

    sport_hint = req.sport or req.sport_name or _outcome_implies_sport(outcome_str)
    market_scope = _normalize_market_scope(req.market_scope)
    resolved_event_id = int(req.event_id)
    if context_resolution:
        sport_id = context_resolution.get("sport_id")
        sport_label = str(context_resolution.get("sport") or sport_hint or "")
        event = context_resolution.get("event")
        source = "more_bet"
        resolved_event_id = int(context_resolution["event_id"])
    elif market_scope:
        sport_id, sport_label, _compact_event = await _compact_event_for_market_margin(int(req.event_id), sport_hint)
        parent_event = await _more_bet_event_for_market_margin(sport_id, int(req.event_id))
        event = _select_tennis_scope_event(parent_event, market_scope)
        source = "more_bet"
        if event:
            raw_event = event.get("raw") if isinstance(event.get("raw"), list) else []
            try:
                resolved_event_id = int(raw_event[0])
            except (IndexError, TypeError, ValueError):
                resolved_event_id = int(req.event_id)
    else:
        sport_id, sport_label, event = await _compact_event_for_market_margin(int(req.event_id), sport_hint)
        source = "compact"
    if not event and not context_resolution:
        more_bet_event = await _more_bet_event_for_market_margin(sport_id, int(req.event_id))
        if more_bet_event:
            event = more_bet_event
            source = "more_bet"
    if not event:
        return {
            "status": "UNAVAILABLE",
            "error_code": "EVENT_NOT_FOUND",
            "event_id": resolved_event_id,
            "parent_event_id": context_resolution.get("parent_event_id") if context_resolution else None,
            "sport": sport_hint,
            "consumer_id": auth.consumer_id,
            "timestamp": time.time(),
        }

    period = int(params["period"])
    ps_period = internal_to_ps3838_period(period, sport_label or sport_hint or "")
    bet_type, team_select, handicap, reversed_flag = _effective_market_params(
        event,
        params,
        forted_home=req.forted_home,
        forted_away=req.forted_away,
    )
    body = _compact_market_margin_from_event(
        event,
        period=ps_period,
        bet_type=bet_type,
        team_select=team_select,
        handicap=handicap,
        source=source,
    )
    if not body and source != "more_bet":
        more_bet_event = await _more_bet_event_for_market_margin(sport_id, int(req.event_id))
        if market_scope:
            more_bet_event = _select_tennis_scope_event(more_bet_event, market_scope)
        if more_bet_event:
            mb_bet_type, mb_team_select, mb_handicap, mb_reversed_flag = _effective_market_params(
                more_bet_event,
                params,
                forted_home=req.forted_home,
                forted_away=req.forted_away,
            )
            mb_body = _compact_market_margin_from_event(
                more_bet_event,
                period=ps_period,
                bet_type=mb_bet_type,
                team_select=mb_team_select,
                handicap=mb_handicap,
                source="more_bet",
            )
            if mb_body:
                event = more_bet_event
                source = "more_bet"
                bet_type = mb_bet_type
                team_select = mb_team_select
                handicap = mb_handicap
                reversed_flag = mb_reversed_flag
                body = mb_body
    if not body:
        return {
            "status": "UNAVAILABLE",
            "error_code": "MARKET_PAIR_NOT_FOUND",
            "event_id": resolved_event_id,
            "parent_event_id": context_resolution.get("parent_event_id") if context_resolution else None,
            "sport_id": sport_id,
            "sport": sport_label or sport_hint,
            "market_context": context_resolution.get("context") if context_resolution else _normalize_market_context(req.market_context),
            "market_scope": market_scope or None,
            "outcome": outcome_str,
            "request_params": params,
            "requested_period": period,
            "period": ps_period,
            "effective_bet_type": bet_type,
            "effective_team_select": team_select,
            "effective_handicap": handicap,
            "reversed": reversed_flag,
            "home_team": event.get("home"),
            "away_team": event.get("away"),
            "consumer_id": auth.consumer_id,
            "timestamp": time.time(),
        }

    body.update({
        "status": "OK",
        "source": body.get("source") or source,
        "event_id": resolved_event_id,
        "parent_event_id": context_resolution.get("parent_event_id") if context_resolution else None,
        "sport_id": sport_id,
        "sport": sport_label or sport_hint,
        "market": req.market,
        "market_context": context_resolution.get("context") if context_resolution else _normalize_market_context(req.market_context),
        "market_scope": market_scope or None,
        "outcome": outcome_str,
        "request_outcome": outcome_str,
        "request_params": params,
        "requested_period": period,
        "effective_bet_type": bet_type,
        "effective_team_select": team_select,
        "effective_handicap": handicap,
        "reversed": reversed_flag,
        "home_team": event.get("home"),
        "away_team": event.get("away"),
        "consumer_id": auth.consumer_id,
        "timestamp": time.time(),
    })
    return body


@app.post("/place")
async def place(request: Request, req: PlaceRequest) -> dict:
    """Verify a selection fresh, then submit a live PS3838 bet."""
    assert verifier is not None
    auth = await _authorize_and_rate_limit(request, "place")
    await _register_place()
    try:
        return await _place_registered(req, auth)
    finally:
        await _finish_place()


async def _place_registered(req: PlaceRequest, auth: _AuthContext) -> dict:
    """The place implementation, after its atomic drain registration."""
    pinnacle_disabled = not session.login_id or not session.login_password or session.login_id.lower() in ("disabled", "none", "")
    if not _direct_pinnacle_requested(req):
        return await handle_fallback_place(req, auth)
    if pinnacle_disabled:
        return {
            "status": "NOT_PLACED",
            "error_code": "PINNACLE_DISABLED",
            "error": "Direct Pinnacle was requested but is disabled.",
            "consumer_id": auth.consumer_id,
        }
    if session.login_error:
        return {
            "status": "NOT_PLACED",
            "error_code": "PS3838_AUTH_FAILED",
            "error": session.login_error,
            "consumer_id": auth.consumer_id,
            "outcome": req.outcome or req.raw_selection,
        }

    outcome_str, params = _resolve_outcome_and_params(req)
    context_resolution = await _resolve_contextual_market_request(req, outcome_str, params)
    if context_resolution and context_resolution.get("error_code"):
        body = {
            "status": "NOT_PLACED",
            "error_code": context_resolution["error_code"],
            "detail": context_resolution.get("detail"),
            "outcome": outcome_str,
            "outcome_params": params,
            "consumer_id": auth.consumer_id,
            "market_context": _normalize_market_context(req.market_context) or _market_context_from_special_params(params),
        }
        body_with_match_fields = _enrich_result(
            body,
            event_id=int(req.event_id),
            outcome_str=outcome_str,
            params=params,
            request_period=int(req.period or 0),
            request_market=req.market,
        )
        return {**body, "results": [body_with_match_fields]}
    if context_resolution:
        outcome_str = str(context_resolution["outcome"])
        params = dict(context_resolution["params"])

    if not is_standard_market(params):
        body = {
            "status": "NOT_PLACED",
            "error_code": "NON_STANDARD_MARKET",
            "outcome": outcome_str,
            "outcome_params": params,
            "consumer_id": auth.consumer_id,
        }
        body_with_match_fields = _enrich_result(
            body,
            event_id=int(req.event_id),
            outcome_str=outcome_str,
            params=params,
            request_period=int(req.period or 0),
            request_market=req.market,
        )
        return {**body, "results": [body_with_match_fields]}

    sport = req.sport or _outcome_implies_sport(outcome_str)
    place_event_id = int(context_resolution["event_id"]) if context_resolution else int(req.event_id)
    verifier_params = dict(context_resolution.get("effective_params") or params) if context_resolution else params
    line_id_hint = (
        context_resolution.get("line_id")
        if context_resolution and context_resolution.get("line_id") else req.line_id
    )
    res = await verifier.place_one(
        event_id=place_event_id,
        sport=sport,
        period=int(verifier_params["period"]),
        bet_type=int(verifier_params["bet_type"]),
        team_select=int(verifier_params["team_select"]),
        handicap=float(verifier_params["handicap"]),
        is_alt=int(req.is_alt or verifier_params.get("is_alt", 0)),
        forted_home=req.forted_home,
        forted_away=req.forted_away,
        line_id_hint=line_id_hint,
        stake=float(req.stake),
        expected_odds=req.expected_odds,
        odds_tolerance=req.odds_tolerance,
        accept_better_odds=bool(req.accept_better_odds),
        odds_format=int(req.odds_format or 1),
        wager_type=req.wager_type or "NORMAL",
        win_risk_stake=req.win_risk_stake,
        dry_run=bool(req.dry_run),
    )
    res["request_outcome"] = outcome_str
    res["request_params"] = params
    if context_resolution:
        res["market_context"] = context_resolution.get("context")
        res["parent_event_id"] = context_resolution.get("parent_event_id")
        res["resolved_event_id"] = place_event_id
    res["consumer_id"] = auth.consumer_id
    res["timestamp"] = time.time()
    return res


@app.post("/clear")
async def clear(request: Request) -> dict:
    pinnacle_disabled = not session.login_id or not session.login_password or session.login_id.lower() in ("disabled", "none", "")
    if pinnacle_disabled:
        raise HTTPException(status_code=400, detail="PINNACLE_DISABLED")
    auth = await _authorize_and_rate_limit(request, "clear")
    async with _state_lock:
        for key in list(_verify_windows.keys()):
            if key[0] == auth.rate_identity:
                _verify_windows.pop(key, None)
    if verifier is not None:
        verifier.clear_runtime_state()
    return {
        "status": "CLEARED",
        "ok": True,
        "consumer_id": auth.consumer_id,
        "timestamp": time.time(),
    }


# ==================== DRAIN & FALLBACK INTEGRATION ====================

async def _authorize_drain(request: Request) -> _AuthContext:
    """Drain is administrative even when normal API-key auth is disabled."""
    admin_keys = frozenset(_split_env_values(os.environ.get("PS3838_DRAIN_API_KEYS", "")))
    token = _extract_api_token(request)
    if not admin_keys or token not in admin_keys:
        raise HTTPException(status_code=401, detail="missing or invalid drain admin token")
    return await _authorize_and_rate_limit(request, "drain")


@app.post("/drain")
async def drain(request: Request) -> dict:
    global maintenance_mode
    await _authorize_drain(request)
    cv = _ensure_active_places_sync()
    async with cv:
        maintenance_mode = True
        log.info("Drain requested. Active places: %s", active_places)
        await cv.wait_for(lambda: active_places == 0)
    log.info("Drained successfully.")
    return {"status": "drained", "active_places": 0}


@app.get("/bia/orders/{order_id}")
async def reconcile_bia_order(request: Request, order_id: str) -> dict:
    """Read-only reconciliation for an already submitted BIA order."""
    from bia_placer import BiaOrderUncertain
    auth = await _authorize_and_rate_limit(request, "place")
    if not bia_placer_client:
        raise HTTPException(status_code=503, detail="BIA_RECONCILIATION_UNAVAILABLE")
    try:
        raw = await bia_placer_client.get_order(order_id)
    except BiaOrderUncertain as exc:
        return {
            "status": "UNKNOWN", "error_code": "BIA_RECONCILIATION_UNAVAILABLE",
            "order_id": order_id, "consumer_id": auth.consumer_id,
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail="BIA_RECONCILIATION_FAILED") from exc
    from bia_placer import classify_bia_order, unwrap_bia_payload
    data = raw if isinstance(raw, dict) else {}
    # get_order already unwraps; tolerate nested just in case
    if isinstance(data.get("data"), dict) and (data["data"].get("order_id") or data["data"].get("status")):
        data = data["data"]
    classified = classify_bia_order(data, http_status=200)
    return {
        "status": classified["status"],
        "bia_status": classified.get("bia_status"),
        "close_reason": classified.get("close_reason"),
        "error_code": classified.get("error_code"),
        "order_id": classified.get("order_id") or order_id,
        "wager_id": classified.get("order_id") or order_id,
        "consumer_id": auth.consumer_id,
        "reconciliation_required": classified["status"] in {"UNKNOWN", "PENDING"},
    }


async def handle_fallback_verify(req: VerifyRequest) -> dict:
    bia_enabled = os.environ.get("BIA_ENABLED") in ("1", "true", "yes")
    bia_login = os.environ.get("BIA_LOGIN", "").strip()
    bia_password = os.environ.get("BIA_PASSWORD", "").strip()
    dev_simulation = os.environ.get("DEV_SIMULATION_MODE") in ("1", "true", "yes")

    try:
        outcome_str, params = _resolve_outcome_and_params(req)
    except HTTPException as exc:
        body = {
            "status": "UNAVAILABLE",
            "error_code": "BIA_OUTCOME_MAP_FAILED",
            "error": str(exc.detail),
        }
        return {**body, "results": [dict(body, event_id=int(req.event_id), market=req.market)]}
    effective_period = int(params.get("period") or 0)

    event_ref = None
    if bia_enabled and bia_login and bia_password:
        import urllib.parse
        import aiohttp
        try:
            url = f"http://127.0.0.1:19100/lookup-bia?event_id={req.event_id}&period={effective_period}"
            timeout = aiohttp.ClientTimeout(total=2.0)
            async with aiohttp.ClientSession(timeout=timeout) as sess:
                async with sess.get(url) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        if data.get("found"):
                            event_ref = data
        except Exception as e:
            log.warning("BIA lookup-bia failed for event_id=%s: %s", req.event_id, e)

    if event_ref:
        try:
            global bia_placer_client
            if not bia_placer_client:
                raise RuntimeError("BIA placer client is not initialized")

            from bia_placer import map_selection_to_bia_bet_type, BiaOrderUncertain

            sport = req.sport or _outcome_implies_sport(outcome_str)
            sport_code = event_ref["sport_code"]
            event_key = event_ref["event_key"]
            swapped = bool(event_ref.get("swapped"))

            bet_type_val = int(params["bet_type"])
            team_select_val = int(params["team_select"])
            handicap_val = float(params.get("handicap") or 0.0)
            is_soccer = sport_code.startswith("fb")
            created = None
            game_number = int(params.get("game_number") or 0)
            if sport_code == "tennis" and game_number and effective_period <= 0:
                discovery_side = "p1" if team_select_val == 0 else "p2"
                if swapped:
                    discovery_side = "p2" if discovery_side == "p1" else "p1"
                effective_period, created = await bia_placer_client.discover_tennis_game_set(
                    event_key, game_number, discovery_side,
                )
                params = dict(params)
                params["period"] = effective_period

            bia_bet_type = map_selection_to_bia_bet_type(
                bet_type_val,
                team_select_val,
                handicap_val,
                swapped,
                is_soccer,
                period=effective_period,
                sport_code=sport_code,
                game_number=params.get("game_number"),
            )

            from bia_placer import extract_pin88_quote

            log.info("Querying BIA betslip for event %s, type %s", event_key, bia_bet_type)
            if created is None:
                created = await bia_placer_client.create_betslip(sport_code, event_key, bia_bet_type)
            betslip_id = created.get("betslip_id")

            try:
                if not betslip_id:
                    raise RuntimeError(f"Invalid BIA betslip response: missing betslip_id")

                # Create often returns pin88 without price; poll GET until quote is ready.
                pin88_quote = extract_pin88_quote(created.get("accounts"))
                if pin88_quote is None:
                    pin88_quote = await bia_placer_client.wait_for_pin88_quote(str(betslip_id))

                if pin88_quote.get("min") is None or pin88_quote.get("max") is None:
                    raise RuntimeError("BIA quote has no explicit stake limits")
                price = float(pin88_quote["price"])
                max_val = float(pin88_quote["max"])
                min_val = float(pin88_quote["min"])
                if (not all(math.isfinite(value) for value in (price, min_val, max_val))
                        or price <= 1.0 or min_val <= 0 or max_val < min_val):
                    raise RuntimeError("Invalid BIA quote")

                log.info("BIA verify success: price=%s, max=%s", price, max_val)
                body = {
                    "status": "OK",
                    "odds": price,
                    "max_stake": max_val,
                    "min_stake": min_val,
                    "currency": pin88_quote.get("currency"),
                    # Pass through caller IDs only; never invent production mock IDs.
                    "selection_id": req.selection_id,
                    "line_id": req.line_id,
                    "odds_id": req.odds_id,
                    "fresh": True,
                    "age_seconds": 0.0,
                    "home_team": event_ref.get("home"),
                    "away_team": event_ref.get("away"),
                    "league": event_ref.get("competition_name"),
                    "source": "bia_placer",
                    "reconciliation": {"betslip_id": str(betslip_id)},
                }
                return {**body, "results": [_enrich_result(body, event_id=int(req.event_id), outcome_str=outcome_str, params=params, request_period=int(req.period or 0), request_market=req.market)]}
            finally:
                if betslip_id:
                    asyncio.create_task(bia_placer_client.delete_betslip(betslip_id))
        except Exception as e:
            log.warning("BIA verify failed: %s", e)

    if dev_simulation:
        log.info("Using simulation verify fallback for event_id=%s, expected_odds=%s", req.event_id, req.expected_odds)
        odds_val = req.expected_odds or 1.95
        body = {
            "status": "OK",
            "odds": odds_val,
            "max_stake": 500.0,
            "min_stake": 1.0,
            # Explicit simulation-only placeholders; never used as production IDs.
            "selection_id": req.selection_id or "sim_selection_id",
            "line_id": req.line_id or "sim_line_id",
            "odds_id": req.odds_id or "sim_odds_id",
            "fresh": True,
            "age_seconds": 0.0,
            "source": "simulation",
            "simulation": True,
        }
        return {**body, "results": [_enrich_result(body, event_id=int(req.event_id), outcome_str=outcome_str, params=params, request_period=int(req.period or 0), request_market=req.market)]}

    body = {
        "status": "UNAVAILABLE",
        "error_code": "BIA_VERIFY_UNAVAILABLE",
        "error": "BIA price is unavailable and dev_simulation is disabled.",
        "outcome": req.outcome or req.raw_selection or "1",
    }
    return {**body, "results": [dict(body, event_id=int(req.event_id), market=req.market)]}


async def handle_fallback_place(req: PlaceRequest, auth) -> dict:
    bia_enabled = os.environ.get("BIA_ENABLED") in ("1", "true", "yes")
    bia_login = os.environ.get("BIA_LOGIN", "").strip()
    bia_password = os.environ.get("BIA_PASSWORD", "").strip()

    try:
        outcome_str, params = _resolve_outcome_and_params(req)
    except HTTPException as exc:
        return {
            "status": "NOT_PLACED",
            "error_code": "BIA_OUTCOME_MAP_FAILED",
            "error": str(exc.detail),
            "consumer_id": auth.consumer_id,
        }
    effective_period = int(params.get("period") or 0)

    event_ref = None
    if bia_enabled and bia_login and bia_password:
        import urllib.parse
        import aiohttp
        try:
            url = f"http://127.0.0.1:19100/lookup-bia?event_id={req.event_id}&period={effective_period}"
            timeout = aiohttp.ClientTimeout(total=2.0)
            async with aiohttp.ClientSession(timeout=timeout) as sess:
                async with sess.get(url) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        if data.get("found"):
                            event_ref = data
        except Exception as e:
            log.warning("BIA lookup-bia failed for event_id=%s: %s", req.event_id, e)

    if event_ref:
        try:
            global bia_placer_client
            if not bia_placer_client:
                raise RuntimeError("BIA placer client is not initialized")

            from bia_placer import map_selection_to_bia_bet_type, BiaOrderUncertain

            sport = req.sport or _outcome_implies_sport(outcome_str)
            sport_code = event_ref["sport_code"]
            event_key = event_ref["event_key"]
            swapped = bool(event_ref.get("swapped"))

            bet_type_val = int(params["bet_type"])
            team_select_val = int(params["team_select"])
            handicap_val = float(params.get("handicap") or 0.0)
            is_soccer = sport_code.startswith("fb")
            created = None
            game_number = int(params.get("game_number") or 0)
            if sport_code == "tennis" and game_number and effective_period <= 0:
                discovery_side = "p1" if team_select_val == 0 else "p2"
                if swapped:
                    discovery_side = "p2" if discovery_side == "p1" else "p1"
                effective_period, created = await bia_placer_client.discover_tennis_game_set(
                    event_key, game_number, discovery_side,
                )
                params = dict(params)
                params["period"] = effective_period

            bia_bet_type = map_selection_to_bia_bet_type(
                bet_type_val,
                team_select_val,
                handicap_val,
                swapped,
                is_soccer,
                period=effective_period,
                sport_code=sport_code,
                game_number=params.get("game_number"),
            )

            from bia_placer import extract_pin88_quote

            log.info("Creating BIA betslip for order: %s, type %s", event_key, bia_bet_type)
            if created is None:
                created = await bia_placer_client.create_betslip(sport_code, event_key, bia_bet_type)
            betslip_id = created.get("betslip_id")
            delete_betslip = True

            try:
                if not betslip_id:
                    raise RuntimeError("Invalid BIA betslip response: missing betslip_id")

                pin88_quote = extract_pin88_quote(created.get("accounts"))
                if pin88_quote is None:
                    pin88_quote = await bia_placer_client.wait_for_pin88_quote(str(betslip_id))

                price = float(pin88_quote["price"])
                if not math.isfinite(price) or price <= 1.0:
                    raise RuntimeError("Invalid BIA price")
                if pin88_quote.get("min") is None or pin88_quote.get("max") is None:
                    raise RuntimeError("BIA quote has no explicit stake limits")
                min_stake = float(pin88_quote["min"])
                max_stake = float(pin88_quote["max"])
                currency = str(pin88_quote.get("currency") or "EUR")
                stake_to_use = float(req.stake)
                expected = req.expected_odds
                tolerance = float(req.odds_tolerance or 0.0)
                if (expected is None or not math.isfinite(float(expected))
                        or float(expected) <= 1.0):
                    raise RuntimeError("BIA_EXPECTED_ODDS_REQUIRED")
                expected = float(expected)
                if not all(math.isfinite(value) for value in (min_stake, max_stake, stake_to_use, tolerance)):
                    raise RuntimeError("Non-finite BIA price, stake, limit, or tolerance")
                if min_stake <= 0 or max_stake < min_stake or stake_to_use <= 0 or tolerance < 0:
                    raise RuntimeError("Invalid BIA stake limits or tolerance")

                # PRICE PROTECTION — same policy as Verifier.
                if abs(price - expected) > tolerance:
                    if not (bool(req.accept_better_odds) and price > expected):
                        raise RuntimeError(
                            f"Price protection triggered: BIA price {price} does not match expected {expected} within {tolerance}"
                        )

                if stake_to_use < min_stake:
                    raise RuntimeError(f"Stake {stake_to_use} is below minimum allowed {min_stake}")
                if stake_to_use > max_stake:
                    raise RuntimeError(f"Stake {stake_to_use} exceeds maximum allowed {max_stake}")

                # dry_run: full quote/protection path, never submit an order.
                if getattr(req, "dry_run", False) is True:
                    return {
                        "status": "DRY_RUN",
                        "error_code": None,
                        "odds": price,
                        "stake": stake_to_use,
                        "currency": currency,
                        "consumer_id": auth.consumer_id,
                        "timestamp": time.time(),
                        "reconciliation": {
                            "betslip_id": str(betslip_id),
                            "order_id": None,
                            "retry_order": False,
                            "dry_run": True,
                        },
                    }

                log.info("Placing BIA order: betslip_id=%s, price=%s, stake=%s, ccy=%s", betslip_id, price, stake_to_use, currency)

                try:
                    order_res = await bia_placer_client.place_order(
                        betslip_id, price, stake_to_use, currency=currency
                    )
                except (asyncio.TimeoutError, aiohttp.ClientError, BiaOrderUncertain) as e:
                    log.error("Network/Timeout error during BIA order placement: %s", e)
                    delete_betslip = False
                    return {
                        "status": "UNKNOWN",
                        "error_code": "BIA_PLACE_TIMEOUT",
                        "error": f"Timeout or network error during order placement: {e}",
                        "consumer_id": auth.consumer_id,
                        "timestamp": time.time(),
                        "reconciliation": {
                            "betslip_id": str(betslip_id),
                            "order_id": None,
                            "retry_order": False,
                        },
                    }

                # Do not log full order bodies (sensitive).
                from bia_placer import classify_bia_order
                http_status = order_res.get("_bia_http_status", 200) if isinstance(order_res, dict) else 0
                order_data = order_res.get("data", order_res) if isinstance(order_res, dict) else {}
                if isinstance(order_data, dict):
                    nested = order_data.get("data")
                    if isinstance(nested, dict) and (
                        nested.get("order_id") or nested.get("id") or nested.get("status")
                    ):
                        order_data = nested
                classified = classify_bia_order(order_data, http_status=http_status)
                order_id = classified.get("order_id")
                order_status = classified.get("bia_status")

                if classified["status"] == "NOT_PLACED":
                    raise RuntimeError(
                        f"BIA order placement rejected with status: {order_status or classified.get('close_reason')}"
                    )
                if classified["status"] != "PLACED":
                    # OPEN/PENDING/UNKNOWN: keep betslip for reconciliation; never re-POST.
                    delete_betslip = False
                    return {
                        "status": classified["status"],
                        "error_code": classified.get("error_code") or "BIA_ORDER_RECONCILIATION_REQUIRED",
                        "error": "BIA did not provide a final confirmed order; do not retry placement.",
                        "odds": price,
                        "stake": stake_to_use,
                        "currency": currency,
                        "consumer_id": auth.consumer_id,
                        "timestamp": time.time(),
                        "wager_id": order_id,
                        "reconciliation": {
                            "betslip_id": str(betslip_id),
                            "order_id": order_id,
                            "bia_status": order_status,
                            "close_reason": classified.get("close_reason"),
                            "http_status": http_status,
                            "retry_order": False,
                        },
                    }
                body = {
                    "status": "PLACED",
                    "error_code": None,
                    "wager_id": order_id,
                    "odds": price,
                    "stake": stake_to_use,
                    "currency": currency,
                    "consumer_id": auth.consumer_id,
                    "timestamp": time.time(),
                    "reconciliation": {
                        "betslip_id": str(betslip_id),
                        "order_id": order_id,
                        "bia_status": order_status,
                        "close_reason": classified.get("close_reason"),
                        "retry_order": False,
                    },
                }
                return body
            finally:
                if betslip_id and delete_betslip:
                    asyncio.create_task(bia_placer_client.delete_betslip(betslip_id))
        except Exception as e:
            log.exception("BIA place order failed: %s", e)
            body = {
                "status": "NOT_PLACED",
                "error_code": "BIA_PLACE_FAILED",
                "error": str(e),
                "consumer_id": auth.consumer_id,
                "timestamp": time.time(),
            }
            return body

    if dev_simulation:
        log.info("dev_simulation active: Returning simulated PLACED for event_id=%s", req.event_id)
        return {
            "status": "PLACED",
            "error_code": None,
            "wager_id": f"sim-pin-{int(time.time()*1000)}",
            "odds": req.odds,
            "stake": req.stake,
            "currency": "EUR",
            "consumer_id": auth.consumer_id,
            "timestamp": time.time(),
        }
    log.warning("No BIA credentials or matching event found for place request on event_id=%s", req.event_id)
    body = {
        "status": "NOT_PLACED",
        "error_code": "BET_PLACEMENT_NOT_CONFIGURED",
        "error": "No BIA credentials or matching event found, and Pinnacle is disabled.",
        "consumer_id": auth.consumer_id,
        "timestamp": time.time(),
    }
    return body
