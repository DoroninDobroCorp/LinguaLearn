"""RobinArb BIA gateway: exact quote verification and order placement."""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import os
import secrets
import threading
import time
import urllib.parse
from collections import deque
from typing import Any, NamedTuple, Optional

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field, StrictInt

from forted_outcome import translate as forted_translate
from outcome_mapper import outcome_to_ps3838, is_standard_market
from bia_lookup_diagnostics import (
    attach_lookup_diagnostics as _attach_bia_lookup_diagnostics,
    sanitize_lookup_failure as _sanitize_bia_lookup_failure,
)
from bia_result_contract import (
    # Keep the former app-level private helpers import-compatible while their
    # implementation lives in the pure result-contract module.
    canonical_outcome_for_match as _canonical_outcome_for_match,  # noqa: F401
    direction_for_outcome as _direction_for_outcome,  # noqa: F401
    enrich_result as _enrich_result,
    is_contextual_special_outcome as _is_contextual_special_outcome,  # noqa: F401
    market_family_for_bet_type as _market_family_for_bet_type,  # noqa: F401
    period_number_from_outcome as _period_number_from_outcome,  # noqa: F401
    team_for_outcome as _team_for_outcome,  # noqa: F401
)
from line_resolver import CompactCache, SPORT_ID_MAP, normalize_sport, resolve_line_meta, _periods_dict
from verifier import internal_to_ps3838_period, _name_share


_PREPARED_QUOTE_TTL_SEC = max(
    3.0,
    min(float(os.getenv("BIA_PREPARED_QUOTE_TTL_SEC", "12")), 30.0),
)
_PREPARED_REFRESH_POST_INTERVAL_SEC = max(
    0.25,
    min(float(os.getenv("BIA_PREPARED_REFRESH_POST_INTERVAL_SEC", "0.8")), 5.0),
)
_prepared_quotes_lock = threading.Lock()
_prepared_quotes: dict[str, dict[str, Any]] = {}
_prepared_refresh_locks_lock = threading.Lock()
_prepared_refresh_locks: dict[str, asyncio.Lock] = {}
_VERIFY_RESULT_CACHE_TTL_SEC = max(
    0.0,
    min(float(os.getenv("PS3838_VERIFY_SELECTION_CACHE_TTL_SEC", "2.5")), 10.0),
)
_verify_result_cache_lock = threading.Lock()
_verify_result_cache: dict[str, tuple[float, dict[str, Any]]] = {}


logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
log = logging.getLogger("robinarb_bia_gateway")


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


def _dev_simulation_requested() -> bool:
    return os.environ.get("DEV_SIMULATION_MODE", "").strip().lower() in {"1", "true", "yes"}


def _dev_simulation_enabled() -> bool:
    """Simulation is opt-in twice and can never activate in production by typo."""
    runtime = os.environ.get("PS3838_RUNTIME_ENV", "").strip().lower()
    return _dev_simulation_requested() and runtime in {"dev", "development", "test"}


def _validate_runtime_safety() -> None:
    if _dev_simulation_requested() and not _dev_simulation_enabled():
        raise RuntimeError(
            "DEV_SIMULATION_MODE requires PS3838_RUNTIME_ENV=development or test; "
            "simulation is forbidden in production"
        )


def _simulation_place_result(req: "PlaceRequest", auth: "_AuthContext") -> dict[str, Any]:
    """Return a diagnostic result before any live placement engine is touched."""
    log.info("dev_simulation active: Returning dry-run result for event_id=%s", req.event_id)
    return {
        "status": "SIMULATED",
        "error_code": "DRY_RUN_ONLY",
        "wager_id": None,
        "odds": req.expected_odds,
        "stake": req.stake,
        "currency": "EUR",
        "consumer_id": auth.consumer_id,
        "timestamp": time.time(),
        "simulation": True,
    }


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
_PROOF_RATE_LIMIT_PER_MIN = max(
    1,
    # Structural proof is read-only, creates no betslip and does not consume
    # the shared Pinnacle account budget.  One Robin refresh can legitimately
    # cover 50-100 distinct outcomes; the previous default of 60 made the tail
    # of that same refresh fail with 429 even though the central lookup work is
    # separately concurrency-bounded by the caller.
    _env_int("PS3838_PROOF_RATE_LIMIT_PER_MIN", max(240, _API_RATE_LIMIT_PER_MIN)),
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

app = FastAPI(title="RobinArb BIA Gateway")
cache: Optional[CompactCache] = None
verifier = None
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
    if scope == "proof":
        return _PROOF_RATE_LIMIT_PER_MIN
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


async def _authorize_and_rate_limit(
    request: Request,
    scope: str,
    *,
    ignore_account_min_interval: bool = False,
) -> _AuthContext:
    token = _extract_api_token(request)
    if _API_KEYS and token not in _API_KEYS:
        raise HTTPException(status_code=401, detail="missing or invalid API token")

    consumer = _consumer_id(request)
    rate_identity = _account_rate_identity()
    scope_limit = _scope_limit(scope)
    now = time.time()
    # Structural BIA proof only reads the central in-memory offer index.  It
    # never logs into Pinnacle, creates a betslip, or consumes account quota,
    # so keep its own bounded rate bucket without starving verify/place calls.
    account_scoped = scope != "proof"
    account_key = (rate_identity, _ACCOUNT_SCOPE)
    scope_key = (rate_identity, scope)
    async with _state_lock:
        _prune_rate_history(now)

        account_history = _rate_history.get(account_key) if account_scoped else None
        if account_scoped and account_history is None:
            account_history = deque()
            _rate_history[account_key] = account_history
        scope_history = _rate_history.get(scope_key)
        if scope_history is None:
            scope_history = deque()
            _rate_history[scope_key] = scope_history

        histories = (account_history, scope_history) if account_history is not None else (scope_history,)
        for history in histories:
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

        if (
            account_history is not None
            and account_history
            and _ACCOUNT_MIN_INTERVAL_SEC > 0
            and not ignore_account_min_interval
        ):
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

        if account_history is not None and len(account_history) >= _ACCOUNT_RATE_LIMIT_PER_MIN:
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
        if account_history is not None:
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
        "pinnacle_home": req.pinnacle_home,
        "pinnacle_away": req.pinnacle_away,
        "pinnacle_sport": req.pinnacle_sport,
        "pinnacle_start": req.pinnacle_start,
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


def _bia_tennis_unit(req: "VerifyRequest") -> str:
    """Return BIA's raw unit token without consulting line or price."""
    raw_explicit = getattr(req, "tennis_unit", None)
    explicit = (
        str(raw_explicit).strip().lower()
        if isinstance(raw_explicit, str)
        else ""
    )
    if explicit and explicit not in {"game", "set"}:
        raise ValueError("BIA_TENNIS_UNIT_INVALID")
    scope_unit = {"sets": "set", "games": "game"}.get(
        _normalize_market_scope(req.market_scope), "",
    )
    if explicit and scope_unit and explicit != scope_unit:
        raise ValueError("BIA_TENNIS_SCOPE_CONFLICT")
    return explicit or scope_unit


def _period_from_exact_tennis_game_proof(
    bia_bet_type: str,
    *,
    expected_set: int,
    game_number: int,
    team_select: int,
    swapped: bool,
) -> int:
    """Validate and return the raw set encoded by an exact tgame proof."""
    parts = str(bia_bet_type or "").strip().lower().split(",")
    try:
        set_number = int(parts[2])
        proven_game = int(parts[3])
    except (IndexError, TypeError, ValueError):
        raise RuntimeError("BIA_TENNIS_GAME_PROOF_INVALID") from None
    expected_side = "p1" if int(team_select) == 0 else "p2"
    if bool(swapped):
        expected_side = "p2" if expected_side == "p1" else "p1"
    if (
        len(parts) != 6
        or parts[0:2] != ["for", "tgame"]
        or parts[4] != "vwhatever"
        or parts[5] != expected_side
        or set_number < 1
        or set_number > 5
        or set_number != int(expected_set)
        or proven_game != int(game_number)
    ):
        raise RuntimeError("BIA_TENNIS_GAME_PROOF_INVALID")
    return set_number


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


def _bia_only_mode() -> bool:
    """Compatibility helper for callers that still expose the old mode flag.

    Direct Pinnacle transport has been removed from the runtime.  This is a
    compile-time policy now: no environment variable can turn it back on.
    """
    return True


def _public_session_info() -> dict[str, Any]:
    bia_enabled = os.environ.get("BIA_ENABLED") in ("1", "true", "yes")
    return {
        "mode": "bia_only" if bia_enabled else "disabled",
        "bia_enabled": bia_enabled,
        "bia_only_policy": True,
        "default_bet_engine": "bia",
        "direct_pinnacle_removed": True,
        "pinnacle_enabled": False,
        "pinnacle_state": "removed",
        "login_error": False,
    }



maintenance_mode = False
active_places = 0
active_places_lock: asyncio.Lock | None = None
active_places_changed: asyncio.Condition | None = None
bia_placer_client = None


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
    global bia_placer_client
    log.info("Starting RobinArb BIA gateway")

    _validate_runtime_safety()

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
    log.info("BIA-only runtime active; direct Pinnacle transport is not part of this service")


@app.on_event("shutdown")
async def _shutdown() -> None:
    global bia_placer_client
    if bia_placer_client:
        await bia_placer_client.close()
        bia_placer_client = None
        log.info("BIA Placer client closed")


@app.get("/health")
async def health() -> dict:
    now = time.time()
    with _prepared_quotes_lock:
        live_prepared = [
            entry
            for entry in _prepared_quotes.values()
            if float(entry.get("expires_at") or 0) > now
        ]
    with _verify_result_cache_lock:
        live_cache_count = sum(
            1 for expires_at, _result in _verify_result_cache.values()
            if float(expires_at or 0) > now
        )
    return {
        "status": "ok",
        "dev_simulation_enabled": _dev_simulation_enabled(),
        "prepared_single_baskets": len(live_prepared),
        "prepared_single_intents": len({
            (str(entry.get("consumer_id") or ""), str(entry.get("intent_id") or ""))
            for entry in live_prepared
            if entry.get("intent_id")
        }),
        "verify_cache_entries": live_cache_count,
        **_public_session_info(),
    }





class VerifyRequest(BaseModel):
    event_id: StrictInt
    outcome: str | None = None
    raw_selection: str | None = None
    handicap: float | None = None
    period: StrictInt | None = 0
    sport: str | None = None
    is_alt: int = 0
    fresh: bool = False
    expected_odds: float | None = None
    # Forted home/away — used to detect when PS3838 reversed team order.
    # When provided we flip the team bucket to match PS3838's event order.
    # The handicap sign remains attached to the same real team's line.
    forted_home: str | None = None
    forted_away: str | None = None
    # Participant identity read from Pinnacle's exact MORE_BET child board.
    # This may seed a missing child event in the central read-only proof index;
    # it is never derived from Forted prices.
    pinnacle_home: str | None = None
    pinnacle_away: str | None = None
    pinnacle_sport: str | None = None
    pinnacle_start: str | int | float | None = None
    pinnacle_league: str | None = None
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
    # Singular cpricefeed line unit (`game` / `set`).
    tennis_unit: str | None = None
    # Exact esports map scope.  BIA represents map markets inside bet_type
    # (tmap,N), while PS3838 exposes them as related child events.
    map_number: StrictInt | None = None
    esports_unit: str | None = None
    # Exact root-event subperiod coordinates used by BIA raw groups.
    period_type: str | None = None
    inning_number: StrictInt | None = None
    half_number: StrictInt | None = None
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
    # Kept temporarily for compatibility so legacy callers receive an
    # explicit fail-closed error. It can no longer select another engine.
    side: str | None = None
    # Opaque one-time handle returned by BIA /verify.  /place can reuse the
    # exact prepared betslip instead of performing a second lookup/create.
    prepared_quote_id: str | None = None
    # Opaque RobinArb calculator intent. It isolates two users/tabs asking for
    # the same market so they can never share one consumable prepared basket.
    intent_id: str | None = None

    model_config = {"extra": "ignore"}


def _bia_identity_lookup_params(req: VerifyRequest) -> dict[str, str]:
    """Provide a price-free event proposal for BIA's exact-name matcher.

    Canonical Pinnacle participants remain preferred when MORE_BET/Arcadia
    supplied them.  During a parser-account outage Forted's participant names
    may still propose the event id, but they can never prove a quote: the
    independent BIA registry must match the event and return the exact raw
    market coordinate (and /verify must still create a real BIA betslip).
    """
    return {
        "pinnacle_home": str(req.pinnacle_home or req.forted_home or ""),
        "pinnacle_away": str(req.pinnacle_away or req.forted_away or ""),
        "pinnacle_sport": str(req.pinnacle_sport or req.sport or req.sport_name or ""),
        "pinnacle_league": str(req.pinnacle_league or ""),
        "pinnacle_start": str(req.pinnacle_start or ""),
    }


class PlaceRequest(VerifyRequest):
    stake: float = Field(default=1.0, gt=0)
    expected_odds: float | None = Field(default=None, gt=1)
    odds_tolerance: float | None = Field(default=None, ge=0)
    accept_better_odds: bool = False
    odds_format: int = 1
    wager_type: str = "NORMAL"
    win_risk_stake: str | None = None
    dry_run: bool = False


class VerifyReleaseRequest(BaseModel):
    intent_id: str = Field(min_length=16, max_length=128)

    model_config = {"extra": "forbid"}


def _bia_verify_cache_key(req: VerifyRequest, consumer_id: str) -> str:
    request_data = req.model_dump(exclude={"expected_odds", "prepared_quote_id"})
    raw = json.dumps(
        {"consumer_id": consumer_id, "request": request_data},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        default=str,
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def _bia_verify_cache_get(key: str) -> dict[str, Any] | None:
    now = time.time()
    with _verify_result_cache_lock:
        cached = _verify_result_cache.get(key)
        if cached is None:
            return None
        expires_at, result = cached
        if expires_at <= now:
            _verify_result_cache.pop(key, None)
            return None
    prepared_token = str(result.get("prepared_quote_id") or "").strip()
    if prepared_token:
        with _prepared_quotes_lock:
            prepared = _prepared_quotes.get(prepared_token)
            prepared_valid = bool(prepared and float(prepared.get("expires_at") or 0) > now)
        if not prepared_valid:
            with _verify_result_cache_lock:
                _verify_result_cache.pop(key, None)
            return None
    cached_result = {
        **result,
        "cached": True,
        "cache_age_sec": round(max(0.0, now - float(result.get("timestamp") or now)), 3),
    }
    if prepared_token:
        return await _refresh_cached_prepared_quote(key, cached_result)
    return cached_result


def _bia_verify_cache_set(key: str, result: dict[str, Any]) -> None:
    if _VERIFY_RESULT_CACHE_TTL_SEC <= 0 or str(result.get("status") or "").upper() != "OK":
        return
    expires_at = time.time() + _VERIFY_RESULT_CACHE_TTL_SEC
    prepared_expiry = result.get("prepared_quote_expires_at")
    if isinstance(prepared_expiry, (int, float)) and math.isfinite(float(prepared_expiry)):
        # A prepared BIA Single basket is a live monitor, not a 2.5-second
        # immutable snapshot. Cache it for its lease lifetime; every cache hit
        # below reads the same basket and returns its latest account price.
        expires_at = float(prepared_expiry)
    with _verify_result_cache_lock:
        if len(_verify_result_cache) > 1000:
            now = time.time()
            for existing_key, (existing_expiry, _value) in list(_verify_result_cache.items()):
                if existing_expiry <= now:
                    _verify_result_cache.pop(existing_key, None)
        _verify_result_cache[key] = (expires_at, dict(result))


def _prepared_quote_fingerprint(
    req: VerifyRequest,
    outcome_str: str,
    params: dict[str, Any],
) -> str:
    """Bind a prepared betslip to exact, price-independent market identity."""
    period_type, inning_number, half_number = _bia_period_scope(req)
    identity = {
        "event_id": int(req.event_id),
        "outcome": str(outcome_str or "").strip().lower(),
        "bet_type": int(params.get("bet_type") or 0),
        "team_select": int(params.get("team_select") or 0),
        "handicap": format(float(params.get("handicap") or 0), ".12g"),
        # Bind to the caller's structural period. Internal tennis-game proof
        # may later resolve that request to a BIA-specific set coordinate, but
        # the same caller request must still be able to consume the lease.
        "period": int(req.period or 0),
        "game_number": int(params.get("game_number") or 0),
        "map_number": int(req.map_number or params.get("map_number") or 0),
        "market_context": _normalize_market_context(req.market_context),
        "market_scope": _normalize_market_scope(req.market_scope),
        "tennis_unit": str(req.tennis_unit or "").strip().lower(),
        "esports_unit": str(req.esports_unit or "").strip().lower(),
        "period_type": period_type,
        "inning_number": inning_number,
        "half_number": half_number,
    }
    raw = json.dumps(identity, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _prepared_refresh_lock(token: str) -> asyncio.Lock:
    with _prepared_refresh_locks_lock:
        lock = _prepared_refresh_locks.get(token)
        if lock is None:
            lock = asyncio.Lock()
            _prepared_refresh_locks[token] = lock
        return lock


async def _expire_prepared_quote(token: str, expires_at: float) -> None:
    next_expiry = float(expires_at)
    while True:
        await asyncio.sleep(max(0.0, next_expiry - time.time()))
        with _prepared_quotes_lock:
            entry = _prepared_quotes.get(token)
            if entry is None:
                return
            current_expiry = float(entry.get("expires_at") or 0)
            if current_expiry > time.time():
                next_expiry = current_expiry
                continue
            entry = _prepared_quotes.pop(token, None)
        with _prepared_refresh_locks_lock:
            _prepared_refresh_locks.pop(token, None)
        if entry and bia_placer_client and entry.get("betslip_id"):
            await bia_placer_client.delete_betslip(str(entry["betslip_id"]))
        return


def _store_prepared_quote(
    *,
    req: VerifyRequest,
    auth: Any,
    outcome_str: str,
    params: dict[str, Any],
    betslip_id: str,
    event_ref: dict[str, Any],
    bia_bet_type: str,
) -> tuple[str, float]:
    token = secrets.token_urlsafe(24)
    expires_at = time.time() + _PREPARED_QUOTE_TTL_SEC
    entry = {
        "consumer_id": str(getattr(auth, "consumer_id", "") or ""),
        "intent_id": str(req.intent_id or "").strip() or None,
        "fingerprint": _prepared_quote_fingerprint(req, outcome_str, params),
        "betslip_id": str(betslip_id),
        "event_ref": dict(event_ref),
        "bia_bet_type": str(bia_bet_type),
        "expires_at": expires_at,
        "revision": 1,
        "last_refresh_post_at": 0.0,
    }
    retired: list[dict[str, Any]] = []
    now = time.time()
    with _prepared_quotes_lock:
        for existing_token, existing in list(_prepared_quotes.items()):
            expired = float(existing.get("expires_at") or 0) <= now
            same_intent = bool(
                entry["intent_id"]
                and str(existing.get("consumer_id") or "") == entry["consumer_id"]
                and str(existing.get("intent_id") or "") == entry["intent_id"]
            )
            if expired or same_intent:
                retired.append(_prepared_quotes.pop(existing_token))
        _prepared_quotes[token] = entry
    # One consumer intent owns at most one retained Single. A cache miss or a
    # retry may create a replacement, but it must retire the preceding basket
    # immediately instead of waiting for the lease TTL.
    for old in retired:
        if bia_placer_client and old.get("betslip_id"):
            asyncio.create_task(bia_placer_client.delete_betslip(str(old["betslip_id"])))
    asyncio.create_task(_expire_prepared_quote(token, expires_at))
    return token, expires_at


async def _release_prepared_intent(consumer_id: str, intent_id: str) -> dict[str, Any]:
    """Delete only this consumer's retained Single basket and cache entry."""
    clean_intent = str(intent_id or "").strip()
    tokens: set[str] = set()
    # The prepared registry is authoritative. The verify cache is only an
    # acceleration layer and may already have expired or been evicted.
    with _prepared_quotes_lock:
        for token, prepared in _prepared_quotes.items():
            if (
                str(prepared.get("consumer_id") or "") == consumer_id
                and str(prepared.get("intent_id") or "") == clean_intent
            ):
                tokens.add(str(token))

    with _verify_result_cache_lock:
        for cache_key, (_expires_at, result) in list(_verify_result_cache.items()):
            if not isinstance(result, dict):
                continue
            token = str(result.get("prepared_quote_id") or "").strip()
            if token in tokens:
                _verify_result_cache.pop(cache_key, None)

    deleted_betslips = 0
    for token in tokens:
        async with _prepared_refresh_lock(token):
            with _prepared_quotes_lock:
                prepared = _prepared_quotes.get(token)
                if not prepared or str(prepared.get("consumer_id") or "") != consumer_id:
                    continue
                prepared = _prepared_quotes.pop(token, None)
            with _prepared_refresh_locks_lock:
                _prepared_refresh_locks.pop(token, None)
            betslip_id = str((prepared or {}).get("betslip_id") or "").strip()
            if betslip_id and bia_placer_client:
                try:
                    await bia_placer_client.delete_betslip(betslip_id)
                    deleted_betslips += 1
                except Exception as exc:
                    log.warning("BIA intent release failed for basket %s: %s", betslip_id, exc)
    return {
        "released": bool(tokens),
        "released_count": len(tokens),
        "deleted_betslips": deleted_betslips,
    }


def _prepared_refresh_pending_result(
    result: dict[str, Any],
    *,
    detail: str,
) -> dict[str, Any]:
    pending = {
        **result,
        "status": "PROCESSING",
        "odds": None,
        "fresh": False,
        "error_code": "BIA_PREPARED_REFRESH_PENDING",
        "detail": detail,
        "cached": True,
        "basket_reused": True,
    }
    pending["results"] = [
        {
            **candidate,
            "status": "PROCESSING",
            "odds": None,
            "fresh": False,
            "error_code": "BIA_PREPARED_REFRESH_PENDING",
            "detail": detail,
            "basket_reused": True,
        }
        for candidate in (result.get("results") or [])
        if isinstance(candidate, dict)
    ]
    return pending


async def _refresh_cached_prepared_quote(
    cache_key: str,
    result: dict[str, Any],
) -> dict[str, Any] | None:
    """Refresh one retained BIA Single basket without recreating it."""
    token = str(result.get("prepared_quote_id") or "").strip()
    if not token or bia_placer_client is None:
        return None
    async with _prepared_refresh_lock(token):
        now = time.time()
        with _prepared_quotes_lock:
            entry = _prepared_quotes.get(token)
            if entry is None or float(entry.get("expires_at") or 0) <= now:
                return None
            betslip_id = str(entry.get("betslip_id") or "").strip()
            bia_bet_type = str(entry.get("bia_bet_type") or "").strip()
            should_post_refresh = (
                now - float(entry.get("last_refresh_post_at") or 0)
                >= _PREPARED_REFRESH_POST_INTERVAL_SEC
            )
            if should_post_refresh:
                entry["last_refresh_post_at"] = now
        if not betslip_id or not bia_bet_type.startswith("for,"):
            return None

        try:
            if should_post_refresh:
                await bia_placer_client.refresh_betslip(betslip_id)
            data = await bia_placer_client.get_betslip(betslip_id)
            from bia_placer import extract_pin88_quote
            pin88_quote = extract_pin88_quote(
                data.get("accounts"),
                expected_bet_type=bia_bet_type,
            )
        except Exception as exc:
            log.warning("BIA prepared basket refresh failed token=%s: %s", token[:8], exc)
            return _prepared_refresh_pending_result(
                result,
                detail="The selected BIA Single basket is refreshing; no stale price is executable",
            )

        if pin88_quote is None:
            return _prepared_refresh_pending_result(
                result,
                detail="Pinnacle is temporarily not quoting the selected BIA Single basket",
            )
        price = float(pin88_quote.get("price") or 0)
        min_stake = float(pin88_quote.get("min") or 0)
        max_stake = float(pin88_quote.get("max") or 0)
        if (
            not all(math.isfinite(value) for value in (price, min_stake, max_stake))
            or price <= 1
            or min_stake <= 0
            or max_stake < min_stake
        ):
            return _prepared_refresh_pending_result(
                result,
                detail="BIA returned an incomplete current quote for the selected Single basket",
            )

        renewed_expires_at = time.time() + _PREPARED_QUOTE_TTL_SEC
        with _prepared_quotes_lock:
            live_entry = _prepared_quotes.get(token)
            if live_entry is None:
                return None
            live_entry["expires_at"] = renewed_expires_at
            live_entry["revision"] = int(live_entry.get("revision") or 0) + 1
            revision = int(live_entry["revision"])
        updates = {
            "status": "OK",
            "odds": price,
            "max_stake": max_stake,
            "min_stake": min_stake,
            "currency": pin88_quote.get("currency"),
            "fresh": True,
            "age_seconds": 0.0,
            "timestamp": time.time(),
            "prepared_quote_expires_at": renewed_expires_at,
            "prepared_quote_ttl_sec": _PREPARED_QUOTE_TTL_SEC,
            "cached": True,
            "basket_reused": True,
            "basket_revision": revision,
        }
        refreshed = {**result, **updates}
        refreshed["results"] = [
            {**candidate, **updates}
            for candidate in (result.get("results") or [])
            if isinstance(candidate, dict)
        ]
        with _verify_result_cache_lock:
            _verify_result_cache[cache_key] = (renewed_expires_at, dict(refreshed))
        return refreshed


async def _consume_prepared_quote(
    req: PlaceRequest,
    auth: Any,
    outcome_str: str,
    params: dict[str, Any],
) -> tuple[dict[str, Any] | None, str | None]:
    raw_token = getattr(req, "prepared_quote_id", None)
    token = raw_token.strip() if isinstance(raw_token, str) else ""
    if not token:
        return None, None
    lock = _prepared_refresh_lock(token)
    async with lock:
        with _prepared_quotes_lock:
            entry = _prepared_quotes.pop(token, None)
        if entry is None:
            result = (None, "BIA_PREPARED_QUOTE_INVALID")
        elif float(entry.get("expires_at") or 0) <= time.time():
            result = (entry, "BIA_PREPARED_QUOTE_EXPIRED")
        else:
            expected_consumer = str(entry.get("consumer_id") or "")
            current_consumer = str(getattr(auth, "consumer_id", "") or "")
            if expected_consumer and expected_consumer != current_consumer:
                result = (entry, "BIA_PREPARED_QUOTE_CONSUMER_MISMATCH")
            elif entry.get("fingerprint") != _prepared_quote_fingerprint(req, outcome_str, params):
                result = (entry, "BIA_PREPARED_QUOTE_SELECTION_MISMATCH")
            else:
                result = (entry, None)
    with _prepared_refresh_locks_lock:
        if _prepared_refresh_locks.get(token) is lock:
            _prepared_refresh_locks.pop(token, None)
    return result


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


def _bia_period_scope(req: VerifyRequest) -> tuple[str, int, int]:
    """Return explicit, price-independent BIA root-event subperiod scope."""
    raw_period_type = getattr(req, "period_type", None)
    period_type = raw_period_type.strip().lower() if isinstance(raw_period_type, str) else ""
    raw_inning = getattr(req, "inning_number", None)
    raw_half = getattr(req, "half_number", None)
    inning_number = int(raw_inning) if isinstance(raw_inning, int) and not isinstance(raw_inning, bool) else 0
    half_number = int(raw_half) if isinstance(raw_half, int) and not isinstance(raw_half, bool) else 0
    if period_type == "half" and half_number == 0:
        half_number = int(req.period or 0)
    return period_type, inning_number, half_number


async def _lookup_bia_offer_proof(
    req: VerifyRequest,
) -> tuple[str, dict[str, Any], dict[str, Any] | None, dict[str, Any]]:
    """Resolve one outcome to an exact central BIA offer without requesting a price."""
    outcome_str, params = _resolve_outcome_and_params(req)
    # Corners/bookings are expressed as contextual special outcomes by the
    # caller (for example ``CIT2> 3.5``), while the BIA offer registry proves
    # them with the ordinary team-total coordinates inside an explicitly
    # selected child namespace.  Convert only the coordinates and preserve the
    # original outcome string for the response binding.  Market context, side
    # and exact line remain mandatory; no price participates in this mapping.
    contextual_standard = _standard_outcome_from_contextual_special(outcome_str, params)
    if contextual_standard is not None:
        _standard_outcome, params = contextual_standard
    elif not is_standard_market(params):
        special_ref, failure = await _lookup_pinnacle_special_selection(req, params)
        return outcome_str, dict(params), special_ref, failure
    params = dict(params)
    effective_period = int(params.get("period") or 0)
    map_number = int(req.map_number or 0)
    game_number = int(params.get("game_number") or 0)
    if map_number:
        params["map_number"] = map_number
    if str(req.esports_unit or "").strip():
        params["esports_unit"] = str(req.esports_unit).strip().lower()
    tennis_unit = _bia_tennis_unit(req)
    if tennis_unit:
        params["tennis_unit"] = tennis_unit
    period_type, inning_number, half_number = _bia_period_scope(req)
    params.update({
        "period_type": period_type,
        "inning_number": inning_number,
        "half_number": half_number,
    })

    lookup_params: dict[str, Any] = {
        "event_id": req.event_id,
        "period": 0 if map_number or period_type in {"inning", "half"} else effective_period,
        "proof": 1,
        # A stale structural proof is only an address candidate. This service
        # still requires a brand-new BIA betslip whose returned account echoes
        # the exact bet type before a quote can become verified/placeable.
        "stale_candidate": 1,
        "bet_type": int(params["bet_type"]),
        "team_select": int(params["team_select"]),
        "handicap": str(params.get("handicap") or 0),
        "map_number": map_number,
        "game_number": game_number,
        "esports_unit": str(req.esports_unit or ""),
        "tennis_unit": tennis_unit,
        "market_context": _normalize_market_context(req.market_context),
        "period_type": period_type,
        "inning_number": inning_number,
        "half_number": half_number,
    }
    lookup_params.update(_bia_identity_lookup_params(req))
    import aiohttp

    url = "http://127.0.0.1:19100/lookup-bia?" + urllib.parse.urlencode(lookup_params)
    # A cold exact BIA subscription can legitimately need several seconds to
    # receive its first complete raw market snapshot.  Keep this timeout above
    # the observer's bounded 7.5s proof window; otherwise an existing exact
    # line is reported as missing just before its structural proof arrives.
    timeout = aiohttp.ClientTimeout(total=8.50)
    async with aiohttp.ClientSession(timeout=timeout) as sess:
        async with sess.get(url) as response:
            if response.status != 200:
                return outcome_str, params, None, {
                    "error_code": "BIA_LOOKUP_HTTP_ERROR",
                    "refresh_status": "unavailable",
                }
            data = await response.json()
    if not isinstance(data, dict) or data.get("found") is not True:
        return outcome_str, params, None, _sanitize_bia_lookup_failure(data)
    offer_proof = data.get("offer_proof")
    bia_bet_type = str(
        offer_proof.get("bia_bet_type") if isinstance(offer_proof, dict) else ""
    ).strip()
    if not bia_bet_type.startswith("for,"):
        return outcome_str, params, None, {
            "error_code": "BIA_OFFER_PROOF_MISSING",
            "event_found": True,
        }
    return outcome_str, params, data, {}


async def _lookup_pinnacle_special_selection(
    req: VerifyRequest,
    params: dict[str, Any],
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    """Resolve a special by its exact central Pinnacle parser identity."""
    special_type = str(params.get("special_type") or "").strip().lower()
    contestant = str(params.get("contestant") or "").strip()
    try:
        period = int(params.get("period") or req.period or 0)
        handicap = float(params.get("handicap") or 0)
    except (TypeError, ValueError):
        return None, {"error_code": "BIA_SPECIAL_SELECTOR_INVALID"}
    if not special_type or not contestant or not math.isfinite(handicap):
        return None, {"error_code": "BIA_SPECIAL_SELECTOR_INVALID"}

    import aiohttp

    query_params: dict[str, Any] = {
        "event_id": int(req.event_id),
        "type": special_type,
        "contestant": contestant,
        "period": period,
        "handicap": str(handicap),
        # Skip legacy price-bearing parser/normalized-state shortcuts. The
        # central service must return only a raw BIA structural proof; the
        # current executable price is obtained from the BIA betslip below.
        "proof": 1,
        # A stale central proof is structural permission only. The live BIA
        # betslip below must still return this exact h/a qualify selection.
        "stale_candidate": 1,
    }
    # Special lookup uses the same price-free identity proposal as standard
    # markets.  The central BIA registry plus the raw special group remain the
    # independent proof; participant metadata alone can never return a quote.
    query_params.update(_bia_identity_lookup_params(req))
    query = urllib.parse.urlencode(query_params)
    url = "http://127.0.0.1:19100/lookup-special?" + query
    # Central exact refresh is bounded at 7.5 seconds. Cutting this request at
    # 2.5 seconds turned valid cold `qualify` markets into the generic
    # BIA_VERIFY_UNAVAILABLE before their first rich snapshot arrived.
    timeout = aiohttp.ClientTimeout(total=8.50)
    async with aiohttp.ClientSession(timeout=timeout) as sess:
        async with sess.get(url) as response:
            if response.status != 200:
                return None, {
                    "error_code": "BIA_SPECIAL_LOOKUP_HTTP_ERROR",
                    "refresh_status": "unavailable",
                }
            data = await response.json()
    if not isinstance(data, dict) or data.get("found") is not True:
        failure = _sanitize_bia_lookup_failure(data)
        if not failure:
            failure = {
                "error_code": "BIA_SPECIAL_SELECTION_NOT_FOUND",
                "event_found": data.get("event_found") if isinstance(data, dict) else None,
            }
        return None, failure
    if str(data.get("source") or "") != "bia_special_offer_proof":
        return None, {
            "error_code": "BIA_SPECIAL_PROOF_SOURCE_INVALID",
            "event_found": True,
        }
    offer_proof = data.get("offer_proof")
    bia_bet_type = str(
        offer_proof.get("bia_bet_type")
        if isinstance(offer_proof, dict)
        else ""
    ).strip()
    raw_offer_group = str(
        offer_proof.get("raw_offer_group")
        if isinstance(offer_proof, dict)
        else ""
    ).strip().lower()
    raw_outcome = str(
        (offer_proof.get("raw_outcome") or offer_proof.get("direction"))
        if isinstance(offer_proof, dict)
        else ""
    ).strip().lower()
    swapped = data.get("swapped")
    expected_raw_outcome = "h" if contestant.lower() == "home" else "a"
    if swapped is True:
        expected_raw_outcome = "a" if expected_raw_outcome == "h" else "h"
    if (
        not str(data.get("event_key") or "").strip()
        or not str(data.get("sport_code") or "").strip()
        or not isinstance(swapped, bool)
        or special_type != "to_qualify"
        or raw_offer_group != "qualify"
        or raw_outcome != expected_raw_outcome
        or bia_bet_type != f"for,qualify,{expected_raw_outcome}"
    ):
        return None, {"error_code": "BIA_SPECIAL_OFFER_PROOF_INVALID"}
    return data, {}


@app.post("/proof")
async def prove_selection(request: Request, req: VerifyRequest) -> dict:
    """Prove exact event/market/outcome identity without creating a betslip."""
    await _authorize_and_rate_limit(request, "proof")
    try:
        outcome_str, params, event_ref, failure = await _lookup_bia_offer_proof(req)
    except HTTPException as exc:
        body = {
            "status": "UNAVAILABLE",
            "found": False,
            "error_code": "BIA_OUTCOME_MAP_FAILED",
            "error": str(exc.detail),
        }
        return {**body, "results": [dict(body, event_id=int(req.event_id), market=req.market)]}
    except ValueError as exc:
        body = {
            "status": "UNAVAILABLE",
            "found": False,
            "error_code": str(exc),
            "error": str(exc),
        }
        return {**body, "results": [dict(body, event_id=int(req.event_id), market=req.market)]}
    except Exception as exc:
        log.warning("BIA structural proof failed for event_id=%s: %s", req.event_id, exc)
        body = {
            "status": "UNAVAILABLE",
            "found": False,
            "error_code": "BIA_PROOF_UNAVAILABLE",
            "error": "The central BIA offer index is unavailable.",
        }
        return {**body, "results": [dict(body, event_id=int(req.event_id), market=req.market)]}

    if event_ref is None:
        body = {
            "status": "UNAVAILABLE",
            "found": False,
            "error_code": failure.get("error_code") or "BIA_OFFER_NOT_FOUND",
            "event_found": failure.get("event_found"),
            "candidate_count": failure.get("candidate_count"),
            "refresh_status": failure.get("refresh_status"),
        }
        _attach_bia_lookup_diagnostics(body, failure)
        return {**body, "results": [dict(body, event_id=int(req.event_id), market=req.market)]}

    offer_proof = event_ref.get("offer_proof") if isinstance(event_ref.get("offer_proof"), dict) else {}
    special_source = (
        str(event_ref.get("source") or "") == "bia_special_offer_proof"
    )
    direct_special_id = str(event_ref.get("cid") or "").strip()
    body = {
        "status": "OK",
        "found": True,
        "fresh": True,
        "source": str(event_ref.get("source") or "bia_offer_proof") if special_source else "bia_offer_proof",
        "bia_event_key": str(event_ref.get("event_key") or ""),
        "bia_sport_code": str(event_ref.get("sport_code") or ""),
        "bia_bet_type": str(offer_proof.get("bia_bet_type") or ""),
        "bia_swapped": bool(event_ref.get("swapped")),
        "home_team": event_ref.get("home"),
        "away_team": event_ref.get("away"),
        "league": event_ref.get("competition_name"),
        "selection_id": direct_special_id if direct_special_id else req.selection_id,
        "line_id": str(event_ref.get("special_id") or "") if special_source and event_ref.get("special_id") else req.line_id,
        "odds_id": req.odds_id,
    }
    enriched = _enrich_result(
        body,
        event_id=int(req.event_id),
        outcome_str=outcome_str,
        params=params,
        request_period=int(req.period or 0),
        request_market=req.market,
    )
    return {**body, "results": [enriched]}


@app.post("/verify")
async def verify(request: Request, req: VerifyRequest) -> dict:
    """Verify a single selection.

    Returns a response in two shapes:
      - Top-level fields (status, odds, etc.) — used by direct callers.
      - `results: [...]` array — kept for compatibility with matcher-style consumers.
    """
    if _direct_pinnacle_requested(req):
        body = {
            "status": "UNAVAILABLE",
            "error_code": "DIRECT_PINNACLE_REMOVED",
            "error": "Direct Pinnacle verification is not part of the BIA gateway.",
        }
        return {**body, "results": [dict(body, event_id=int(req.event_id), market=req.market)]}

    bia_cache_key = ""
    # Serve a still-live prepared BIA quote before spending another account
    # rate-limit slot. Authentication remains mandatory on cache hits.
    token = _extract_api_token(request)
    if _API_KEYS and token not in _API_KEYS:
        raise HTTPException(status_code=401, detail="missing or invalid API token")
    bia_cache_key = _bia_verify_cache_key(req, _consumer_id(request))
    cached_bia = await _bia_verify_cache_get(bia_cache_key)
    if cached_bia is not None:
        return cached_bia
    auth = await _authorize_and_rate_limit(request, "verify")
    result = await handle_fallback_verify(req, auth)
    _bia_verify_cache_set(bia_cache_key, result)
    return result



@app.post("/verify/release")
async def release_verify_intent(request: Request, req: VerifyReleaseRequest) -> dict:
    token = _extract_api_token(request)
    if _API_KEYS and token not in _API_KEYS:
        raise HTTPException(status_code=401, detail="missing or invalid API token")
    return await _release_prepared_intent(_consumer_id(request), req.intent_id)





@app.post("/place")
async def place(request: Request, req: PlaceRequest) -> dict:
    """Verify an exact BIA selection, then submit it through BIA."""
    auth = await _authorize_and_rate_limit(
        request,
        "place",
        # Reusing a one-time prepared basket does not create a second basket.
        # Keep the per-minute and place limits, but let the user's immediate
        # accept action bypass the generic inter-request delay.
        ignore_account_min_interval=bool(str(req.prepared_quote_id or "").strip()),
    )
    await _register_place()
    try:
        return await _place_registered(req, auth)
    finally:
        await _finish_place()


async def _place_registered(req: PlaceRequest, auth: _AuthContext) -> dict:
    """The place implementation, after its atomic drain registration."""
    # Simulation is a global no-write boundary, not a fallback after trying
    # real engines.  Short-circuit before both direct Pinnacle and BIA paths.
    if _dev_simulation_enabled():
        return _simulation_place_result(req, auth)
    if _direct_pinnacle_requested(req):
        return {
            "status": "NOT_PLACED",
            "error_code": "DIRECT_PINNACLE_REMOVED",
            "error": "Direct Pinnacle placement is not part of the BIA gateway.",
            "consumer_id": auth.consumer_id,
        }
    return await handle_fallback_place(req, auth)



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
    except BiaOrderUncertain:
        return {
            "status": "UNKNOWN", "error_code": "BIA_RECONCILIATION_UNAVAILABLE",
            "order_id": order_id, "consumer_id": auth.consumer_id,
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail="BIA_RECONCILIATION_FAILED") from exc
    from bia_placer import classify_bia_order
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


async def handle_fallback_verify(req: VerifyRequest, auth: Any = None) -> dict:
    bia_enabled = os.environ.get("BIA_ENABLED") in ("1", "true", "yes")
    bia_login = os.environ.get("BIA_LOGIN", "").strip()
    bia_password = os.environ.get("BIA_PASSWORD", "").strip()
    dev_simulation = _dev_simulation_enabled()

    try:
        outcome_str, params = _resolve_outcome_and_params(req)
    except HTTPException as exc:
        body = {
            "status": "UNAVAILABLE",
            "error_code": "BIA_OUTCOME_MAP_FAILED",
            "error": str(exc.detail),
        }
        return {**body, "results": [dict(body, event_id=int(req.event_id), market=req.market)]}
    contextual_standard = _standard_outcome_from_contextual_special(outcome_str, params)
    if contextual_standard is not None:
        _standard_outcome, params = contextual_standard
    effective_period = int(params.get("period") or 0)
    params = dict(params)
    if req.map_number not in (None, 0):
        params["map_number"] = int(req.map_number)
    if str(req.esports_unit or "").strip():
        params["esports_unit"] = str(req.esports_unit).strip().lower()
    try:
        tennis_unit = _bia_tennis_unit(req)
    except ValueError as exc:
        body = {
            "status": "UNAVAILABLE",
            "error_code": str(exc),
            "error": str(exc),
        }
        return {**body, "results": [dict(body, event_id=int(req.event_id), market=req.market)]}
    if tennis_unit:
        params["tennis_unit"] = tennis_unit
    period_type, inning_number, half_number = _bia_period_scope(req)
    params.update({
        "period_type": period_type,
        "inning_number": inning_number,
        "half_number": half_number,
    })

    event_ref = None
    lookup_failure: dict[str, Any] = {}
    if bia_enabled and bia_login and bia_password:
        import aiohttp
        try:
            if not is_standard_market(params):
                event_ref, lookup_failure = await _lookup_pinnacle_special_selection(req, params)
            else:
                game_number = int(params.get("game_number") or 0)
                map_number = int(req.map_number or 0)
                lookup_period = 0 if map_number > 0 or period_type in {"inning", "half"} else effective_period
                lookup_params: dict[str, Any] = {
                    "event_id": req.event_id,
                    "period": lookup_period,
                }
                lookup_params.update({
                    "proof": 1,
                    "stale_candidate": 1,
                    "bet_type": int(params["bet_type"]),
                    "team_select": int(params["team_select"]),
                    "handicap": str(params.get("handicap") or 0),
                    "map_number": map_number,
                    "game_number": game_number,
                    "esports_unit": str(req.esports_unit or ""),
                    "tennis_unit": tennis_unit,
                    "market_context": _normalize_market_context(req.market_context),
                    "period_type": period_type,
                    "inning_number": inning_number,
                    "half_number": half_number,
                })
                lookup_params.update(_bia_identity_lookup_params(req))
                url = "http://127.0.0.1:19100/lookup-bia?" + urllib.parse.urlencode(lookup_params)
                timeout = aiohttp.ClientTimeout(total=8.50)
                async with aiohttp.ClientSession(timeout=timeout) as sess:
                    async with sess.get(url) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            if data.get("found"):
                                event_ref = data
                            else:
                                lookup_failure = _sanitize_bia_lookup_failure(data)
        except Exception as e:
            lookup_kind = "special" if not is_standard_market(params) else "offer"
            log.warning(
                "BIA %s lookup failed for event_id=%s: %s",
                lookup_kind,
                req.event_id,
                e,
            )
            lookup_failure = {
                "error_code": (
                    "BIA_SPECIAL_LOOKUP_UNAVAILABLE"
                    if not is_standard_market(params)
                    else "BIA_LOOKUP_UNAVAILABLE"
                ),
                "refresh_status": "unavailable",
            }

    if event_ref:
        try:
            global bia_placer_client
            if not bia_placer_client:
                raise RuntimeError("BIA placer client is not initialized")

            sport_code = event_ref["sport_code"]
            event_key = event_ref["event_key"]
            swapped = bool(event_ref.get("swapped"))

            created = None
            offer_proof = event_ref.get("offer_proof")
            bia_bet_type = str(
                offer_proof.get("bia_bet_type")
                if isinstance(offer_proof, dict) else ""
            ).strip()
            if not bia_bet_type.startswith("for,"):
                raise RuntimeError("BIA_OFFER_PROOF_MISSING")
            game_number = int(params.get("game_number") or 0)
            if game_number:
                effective_period = _period_from_exact_tennis_game_proof(
                    bia_bet_type,
                    expected_set=effective_period,
                    game_number=game_number,
                    team_select=int(params["team_select"]),
                    swapped=swapped,
                )
                params = dict(params)
                params["period"] = effective_period

            from bia_placer import extract_pin88_quote

            log.info("Querying BIA betslip for event %s, type %s", event_key, bia_bet_type)
            if created is None:
                created = await bia_placer_client.create_betslip(sport_code, event_key, bia_bet_type)
            betslip_id = created.get("betslip_id")
            keep_prepared_betslip = False

            try:
                if not betslip_id:
                    raise RuntimeError("Invalid BIA betslip response: missing betslip_id")

                # Create often returns pin88 without price; poll GET until quote is ready.
                pin88_quote = extract_pin88_quote(
                    created.get("accounts"), expected_bet_type=bia_bet_type,
                )
                if pin88_quote is None:
                    pin88_quote = await bia_placer_client.wait_for_pin88_quote(
                        str(betslip_id), expected_bet_type=bia_bet_type,
                    )

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
                    "bia_bet_type": bia_bet_type,
                    "bia_event_key": str(event_key),
                    "bia_sport_code": str(sport_code),
                    "bia_swapped": bool(swapped),
                    "reconciliation": {"betslip_id": str(betslip_id)},
                    "intent_id": str(req.intent_id or "").strip() or None,
                }
                # Public authenticated verification keeps the exact BIA basket
                # briefly so a subsequent /place can reuse it.  Direct helper
                # calls (mainly tests/tools without auth context) retain the old
                # create-and-delete behaviour.
                if auth is not None:
                    prepared_quote_id, prepared_expires_at = _store_prepared_quote(
                        req=req,
                        auth=auth,
                        outcome_str=outcome_str,
                        params=params,
                        betslip_id=str(betslip_id),
                        event_ref=event_ref,
                        bia_bet_type=bia_bet_type,
                    )
                    keep_prepared_betslip = True
                    body["prepared_quote_id"] = prepared_quote_id
                    body["prepared_quote_expires_at"] = prepared_expires_at
                    body["prepared_quote_ttl_sec"] = _PREPARED_QUOTE_TTL_SEC
                return {**body, "results": [_enrich_result(body, event_id=int(req.event_id), outcome_str=outcome_str, params=params, request_period=int(req.period or 0), request_market=req.market)]}
            finally:
                if betslip_id and not keep_prepared_betslip:
                    asyncio.create_task(bia_placer_client.delete_betslip(betslip_id))
        except Exception as e:
            log.warning("BIA verify failed: %s", e)

    if dev_simulation:
        log.info("Using simulation verify fallback for event_id=%s, expected_odds=%s", req.event_id, req.expected_odds)
        odds_val = req.expected_odds or 1.95
        body = {
            # This is diagnostic output, never a verified/placement-capable quote.
            "status": "SIMULATED",
            "odds": odds_val,
            "max_stake": 500.0,
            "min_stake": 1.0,
            "selection_id": None,
            "line_id": None,
            "odds_id": None,
            "fresh": True,
            "age_seconds": 0.0,
            "source": "simulation",
            "simulation": True,
        }
        return {**body, "results": [_enrich_result(body, event_id=int(req.event_id), outcome_str=outcome_str, params=params, request_period=int(req.period or 0), request_market=req.market)]}

    lookup_error_code = lookup_failure.get("error_code")
    body = {
        "status": "UNAVAILABLE",
        "error_code": lookup_error_code or "BIA_VERIFY_UNAVAILABLE",
        "error": "BIA price is unavailable and dev_simulation is disabled.",
        "outcome": req.outcome or req.raw_selection or "1",
    }
    if lookup_error_code:
        body["lookup_error_code"] = lookup_error_code
    _attach_bia_lookup_diagnostics(body, lookup_failure)
    return {**body, "results": [dict(body, event_id=int(req.event_id), market=req.market)]}


async def handle_fallback_place(req: PlaceRequest, auth) -> dict:
    global bia_placer_client
    bia_enabled = os.environ.get("BIA_ENABLED") in ("1", "true", "yes")
    bia_login = os.environ.get("BIA_LOGIN", "").strip()
    bia_password = os.environ.get("BIA_PASSWORD", "").strip()
    dev_simulation = _dev_simulation_enabled()

    # Keep this helper safe when called directly by tests or internal tools.
    # The public /place path already enforces the same boundary above.
    if dev_simulation:
        return _simulation_place_result(req, auth)

    try:
        outcome_str, params = _resolve_outcome_and_params(req)
    except HTTPException as exc:
        return {
            "status": "NOT_PLACED",
            "error_code": "BIA_OUTCOME_MAP_FAILED",
            "error": str(exc.detail),
            "consumer_id": auth.consumer_id,
        }
    contextual_standard = _standard_outcome_from_contextual_special(outcome_str, params)
    if contextual_standard is not None:
        _standard_outcome, params = contextual_standard
    effective_period = int(params.get("period") or 0)
    params = dict(params)
    if req.map_number not in (None, 0):
        params["map_number"] = int(req.map_number)
    if str(req.esports_unit or "").strip():
        params["esports_unit"] = str(req.esports_unit).strip().lower()
    try:
        tennis_unit = _bia_tennis_unit(req)
    except ValueError as exc:
        return {
            "status": "NOT_PLACED",
            "error_code": str(exc),
            "error": str(exc),
            "consumer_id": auth.consumer_id,
        }
    if tennis_unit:
        params["tennis_unit"] = tennis_unit
    period_type, inning_number, half_number = _bia_period_scope(req)
    params.update({
        "period_type": period_type,
        "inning_number": inning_number,
        "half_number": half_number,
    })

    prepared_entry, prepared_error = await _consume_prepared_quote(
        req, auth, outcome_str, params,
    )
    if prepared_error:
        if prepared_entry and bia_placer_client and prepared_entry.get("betslip_id"):
            asyncio.create_task(
                bia_placer_client.delete_betslip(str(prepared_entry["betslip_id"]))
            )
        return {
            "status": "NOT_PLACED",
            "error_code": prepared_error,
            "error": "The prepared BIA quote expired or no longer matches this exact selection; verify again.",
            "consumer_id": auth.consumer_id,
            "timestamp": time.time(),
        }

    event_ref = dict(prepared_entry.get("event_ref") or {}) if prepared_entry else None
    if event_ref is None and bia_enabled and bia_login and bia_password:
        import aiohttp
        try:
            game_number = int(params.get("game_number") or 0)
            map_number = int(req.map_number or 0)
            lookup_period = 0 if map_number > 0 or period_type in {"inning", "half"} else effective_period
            lookup_params: dict[str, Any] = {
                "event_id": req.event_id,
                "period": lookup_period,
            }
            lookup_params.update({
                "proof": 1,
                "stale_candidate": 1,
                "bet_type": int(params["bet_type"]),
                "team_select": int(params["team_select"]),
                "handicap": str(params.get("handicap") or 0),
                "map_number": map_number,
                "game_number": game_number,
                "esports_unit": str(req.esports_unit or ""),
                "tennis_unit": tennis_unit,
                "market_context": _normalize_market_context(req.market_context),
                "period_type": period_type,
                "inning_number": inning_number,
                "half_number": half_number,
            })
            lookup_params.update(_bia_identity_lookup_params(req))
            url = "http://127.0.0.1:19100/lookup-bia?" + urllib.parse.urlencode(lookup_params)
            timeout = aiohttp.ClientTimeout(total=8.50)
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
            if not bia_placer_client:
                raise RuntimeError("BIA placer client is not initialized")

            from bia_placer import BiaOrderUncertain

            sport_code = event_ref["sport_code"]
            event_key = event_ref["event_key"]
            swapped = bool(event_ref.get("swapped"))

            created = (
                {"betslip_id": str(prepared_entry["betslip_id"]), "accounts": None}
                if prepared_entry else None
            )
            offer_proof = event_ref.get("offer_proof")
            bia_bet_type = str(
                offer_proof.get("bia_bet_type")
                if isinstance(offer_proof, dict) else ""
            ).strip()
            if prepared_entry:
                prepared_bet_type = str(prepared_entry.get("bia_bet_type") or "").strip()
                if prepared_bet_type != bia_bet_type:
                    raise RuntimeError("BIA_PREPARED_QUOTE_SELECTION_MISMATCH")
            if not bia_bet_type.startswith("for,"):
                raise RuntimeError("BIA_OFFER_PROOF_MISSING")
            game_number = int(params.get("game_number") or 0)
            if game_number:
                effective_period = _period_from_exact_tennis_game_proof(
                    bia_bet_type,
                    expected_set=effective_period,
                    game_number=game_number,
                    team_select=int(params["team_select"]),
                    swapped=swapped,
                )
                params = dict(params)
                params["period"] = effective_period

            from bia_placer import extract_pin88_quote

            log.info("Creating BIA betslip for order: %s, type %s", event_key, bia_bet_type)
            if created is None:
                created = await bia_placer_client.create_betslip(sport_code, event_key, bia_bet_type)
            betslip_id = created.get("betslip_id")
            delete_betslip = True

            try:
                if not betslip_id:
                    raise RuntimeError("Invalid BIA betslip response: missing betslip_id")

                pin88_quote = extract_pin88_quote(
                    created.get("accounts"), expected_bet_type=bia_bet_type,
                )
                if pin88_quote is None:
                    pin88_quote = await bia_placer_client.wait_for_pin88_quote(
                        str(betslip_id), expected_bet_type=bia_bet_type,
                    )

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

    log.warning("No BIA credentials or matching event found for place request on event_id=%s", req.event_id)
    body = {
        "status": "NOT_PLACED",
        "error_code": "BET_PLACEMENT_NOT_CONFIGURED",
        "error": "No BIA credentials or matching event found, and Pinnacle is disabled.",
        "consumer_id": auth.consumer_id,
        "timestamp": time.time(),
    }
    return body
