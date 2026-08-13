"""
RobinArb Backend — FastAPI server for arb scanner + bet placement.

Data sources:
  1. Forted relay (live surebets from forted.ru relay servers) — primary
  2. Mock generator — fallback when Forted is unavailable

Integrations:
    - unified Pinnacle API for live price verification
"""

import base64
import csv
import gzip
import hashlib
import io
import asyncio
import ipaddress
import json
import logging
import math
import os
import secrets
import struct
import socket
import time
import uuid
import random
import re
import threading
import unicodedata
import zlib
from collections import deque
from difflib import SequenceMatcher
from typing import Any, Literal, Optional
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urljoin, urlparse

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

from forted_outcome import translate as _forted_translate_outcome
import storage as _storage
import robin_margin
import pinnacle_hub
import pinnacle_arcadia
import stats_collector
import betfair_executor
import paddy_sportsbook
import betfair_sportsbook_basket
import betfair_sportsbook_place_api
import onewin_sportsbook
import ladbrokes_sportsbook
import bcgame_sportsbook
from limits import MatchLimitsTracker
log = logging.getLogger("robinarb")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


def _split_env_values(raw: str) -> list[str]:
    return [item.strip() for item in raw.replace(",", ";").split(";") if item.strip()]


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _env_float(name: str, default: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
        return value if math.isfinite(value) else default
    except (TypeError, ValueError):
        return default


PINNACLE_API_BASE = os.getenv("PINNACLE_API_BASE", "").rstrip("/")
PINNACLE_API_TIMEOUT = float(os.getenv("PINNACLE_API_TIMEOUT", "10"))
PINNACLE_API_VERIFY_SSL = os.getenv("PINNACLE_API_VERIFY_SSL", "1").strip().lower() not in {"0", "false", "no"}
PINNACLE_ALLOW_INSECURE_HTTP = os.getenv("PINNACLE_ALLOW_INSECURE_HTTP", "0").strip().lower() not in {"0", "false", "no"}
PINNACLE_ALLOW_UNVERIFIED_TLS = os.getenv("PINNACLE_ALLOW_UNVERIFIED_TLS", "0").strip().lower() not in {"0", "false", "no"}
PINNACLE_API_TOKEN = (
    os.getenv("PINNACLE_API_TOKEN", "").strip()
    or os.getenv("PS3838_BETSLIP_API_KEY", "").strip()
)
PINNACLE_API_CONSUMER_ID = os.getenv("PINNACLE_API_CONSUMER_ID", "robinarb").strip() or "robinarb"
PINNACLE_LIVE_PLACE_ENABLED = os.getenv("PINNACLE_LIVE_PLACE_ENABLED", "0").strip().lower() in {"1", "true", "yes", "on"}
PINNACLE_CLIENT_RATE_LIMIT_PER_MIN = max(1, _env_int("ROBINARB_PINNACLE_CLIENT_RATE_LIMIT_PER_MIN", 30))
PINNACLE_CLIENT_MIN_INTERVAL_SEC = max(0.0, _env_float("ROBINARB_PINNACLE_CLIENT_MIN_INTERVAL_SEC", 0.0))
PINNACLE_CLIENT_429_COOLDOWN_SEC = max(1.0, _env_float("ROBINARB_PINNACLE_CLIENT_429_COOLDOWN_SEC", 60.0))
PINNACLE_CLIENT_LOW_PRIORITY_QUIET_SEC = max(
    0.0,
    _env_float("ROBINARB_PINNACLE_CLIENT_LOW_PRIORITY_QUIET_SEC", 2.1),
)
PINNACLE_MARKET_MARGIN_CACHE_TTL = max(1.0, _env_float("ROBINARB_PINNACLE_MARKET_MARGIN_CACHE_TTL", 30.0))
ROBINARB_STATS_BETSLIP_ENABLED = os.getenv(
    "ROBINARB_STATS_BETSLIP_ENABLED",
    "0",
).strip().lower() not in {"0", "false", "no", "off"}
PIN888_STREAM_CACHE_ENABLED = os.getenv("PIN888_STREAM_CACHE_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}
FORTED_ENABLED = os.getenv("FORTED_ENABLED", "1").strip().lower() not in {"0", "false", "no"}
FORTED_FEED_URL = os.getenv("FORTED_FEED_URL", "").strip()
FORTED_FEED_USE_SSE = os.getenv("FORTED_FEED_USE_SSE", "1").strip().lower() not in {"0", "false", "no"}
FORTED_ALLOW_INSECURE_HTTP = os.getenv("FORTED_ALLOW_INSECURE_HTTP", "0").strip().lower() not in {"0", "false", "no"}
FORTED_FEED_TIMEOUT = float(os.getenv("FORTED_FEED_TIMEOUT", "10"))
FORTED_FEED_POLL_INTERVAL = float(os.getenv("FORTED_FEED_POLL_INTERVAL", "1"))
FORTED_FEED_LIMIT = max(10, min(int(os.getenv("FORTED_FEED_LIMIT", "200")), 1000))
FORTED_FEED_KEY = os.getenv("FORTED_FEED_KEY", "").strip()
FORTED_FEED_BEARER_TOKEN = os.getenv("FORTED_FEED_BEARER_TOKEN", "").strip()
# Forted control endpoint for the bookmaker filter switch ("ручка").
FORTED_CONTROL_URL = (
    os.getenv("FORTED_CONTROL_URL")
    or os.getenv("FORTED_LWS_URL", "http://127.0.0.1:3055")
).strip().rstrip("/")
FORTED_LWS_URL = FORTED_CONTROL_URL
FORTED_LWS_TOKEN = (
    os.getenv("FORTED_CONTROL_TOKEN", "").strip()
    or os.getenv("FORTED_LWS_TOKEN", "").strip()
)
FORTED_CONTROL_TIMEOUT = max(1.0, _env_float("FORTED_CONTROL_TIMEOUT", 10.0))
FORTED_CONTROL_RETRIES = max(0, _env_int("FORTED_CONTROL_RETRIES", 2))
FORTED_CONTROL_RETRY_BACKOFF = max(0.05, _env_float("FORTED_CONTROL_RETRY_BACKOFF", 0.25))
FORTED_FEED_STREAM_URL = os.getenv("FORTED_FEED_STREAM_URL", "").strip()
if not FORTED_FEED_USE_SSE:
    FORTED_FEED_STREAM_URL = ""
if FORTED_FEED_USE_SSE and not FORTED_FEED_STREAM_URL and FORTED_FEED_URL:
    parsed_feed = urlparse(FORTED_FEED_URL)
    if parsed_feed.path.endswith("/api/forks/feed"):
        stream_path = parsed_feed.path[: -len("/api/forks/feed")] + "/stream/forks"
        FORTED_FEED_STREAM_URL = parsed_feed._replace(path=stream_path, query="", fragment="").geturl()
FORTED_FEED_ACCEPT_GZIP = os.getenv("FORTED_FEED_ACCEPT_GZIP", "1").strip().lower() not in {"0", "false", "no"}
FORTED_FEED_DEAD_TIMEOUT = max(5.0, float(os.getenv("FORTED_FEED_DEAD_TIMEOUT", "30")))
ROBINARB_FEED_MIN_PROFIT = float(os.getenv("ROBINARB_FEED_MIN_PROFIT", "-3.0"))
ROBINARB_FEED_MAX_PROFIT = max(1.0, float(os.getenv("ROBINARB_FEED_MAX_PROFIT", "100.0")))
ROBINARB_FEED_PROFIT_MISMATCH_TOLERANCE = max(
    0.01,
    float(os.getenv("ROBINARB_FEED_PROFIT_MISMATCH_TOLERANCE", "5.0")),
)
ROBINARB_FEED_ONLINE_ONLY = os.getenv("ROBINARB_FEED_ONLINE_ONLY", "0").strip().lower() not in {"0", "false", "no"}
ROBINARB_FEED_STALE_AFTER = max(10, int(os.getenv("ROBINARB_FEED_STALE_AFTER", "45")))
ROBINARB_LIVE_FEED_STALE_AFTER = max(1, int(os.getenv("ROBINARB_LIVE_FEED_STALE_AFTER", "3")))
ROBINARB_FEED_FUTURE_SKEW = max(1, int(os.getenv("ROBINARB_FEED_FUTURE_SKEW", "60")))
ROBINARB_PREMATCH_STREAM_LIVENESS_SEC = max(
    5.0,
    float(os.getenv("ROBINARB_PREMATCH_STREAM_LIVENESS_SEC", "") or FORTED_FEED_DEAD_TIMEOUT),
)
FORTED_NEGATIVE_LANE_SERVERS = set(_split_env_values(os.getenv(
    "FORTED_NEGATIVE_LANE_SERVERS",
    (
        "148.251.13.172:443;148.251.13.170:443;193.232.179.208:443;"
        "95.181.164.16:443;193.232.179.163:443;31.130.155.58:443"
    ),
)))
ROBINARB_ALLOW_MOCK_FALLBACK = os.getenv(
    "ROBINARB_ALLOW_MOCK_FALLBACK",
    "0" if (FORTED_ENABLED or FORTED_FEED_URL) else "1",
).strip().lower() not in {"0", "false", "no"}
ROBINARB_CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ROBINARB_CORS_ORIGINS", "").split(",")
    if origin.strip()
]
ROBINARB_FEED_KEYS = _split_env_values(os.getenv("ROBINARB_FEED_KEYS", ""))
FORTED_SOCKS5_HOST = os.getenv("FORTED_SOCKS5_HOST", "").strip()
FORTED_SOCKS5_PORT = int(os.getenv("FORTED_SOCKS5_PORT", "2080"))
FORTED_SOCKS5_USERNAME = os.getenv("FORTED_SOCKS5_USERNAME", "").strip() or None
FORTED_SOCKS5_PASSWORD = os.getenv("FORTED_SOCKS5_PASSWORD", "").strip() or None
FORTED_SOCKS5_RDNS = os.getenv("FORTED_SOCKS5_RDNS", "1").strip().lower() not in {"0", "false", "no"}
ROBINARB_ALLOW_DEMO_USERS = os.getenv(
    "ROBINARB_ALLOW_DEMO_USERS",
    "1" if not FORTED_ENABLED and not FORTED_FEED_URL else "0",
).strip().lower() not in {"0", "false", "no"}
ROBINARB_VERIFIED_ODDS_TTL = max(1, int(os.getenv("ROBINARB_VERIFIED_ODDS_TTL", "30")))
ROBINARB_ODDS_TOLERANCE = max(0.0001, float(os.getenv("ROBINARB_ODDS_TOLERANCE", "0.05")))
ROBINARB_VERIFY_MAX_UNTRUSTED_ODDS_DRIFT_RATIO = max(
    0.05,
    float(os.getenv("ROBINARB_VERIFY_MAX_UNTRUSTED_ODDS_DRIFT_RATIO", "0.75")),
)
ROBINARB_VERIFY_MAX_UNTRUSTED_ARB_PCT = max(
    1.0,
    float(os.getenv("ROBINARB_VERIFY_MAX_UNTRUSTED_ARB_PCT", "25.0")),
)
ROBINARB_VERIFY_MAX_UNTRUSTED_ARB_DELTA_PCT = max(
    1.0,
    float(os.getenv("ROBINARB_VERIFY_MAX_UNTRUSTED_ARB_DELTA_PCT", "15.0")),
)
VERIFY_STICKY_WINDOW_SEC = float(os.getenv("VERIFY_STICKY_WINDOW_SEC", "12.0"))
ROBINARB_VERIFY_PINNACLE_STREAM_FIRST = os.getenv(
    "ROBINARB_VERIFY_PINNACLE_STREAM_FIRST",
    os.getenv("ROBINARB_VERIFY_FEED_FIRST", "1"),
).strip().lower() not in {"0", "false", "no"}
ROBINARB_PINNACLE_STREAM_QUOTE_TTL = max(1.0, float(os.getenv(
    "ROBINARB_PINNACLE_STREAM_QUOTE_TTL",
    os.getenv("ROBINARB_FEED_QUOTE_TTL", "5.0"),
)))
ROBINARB_ROBIN_WORK_TOP_N = max(1, int(os.getenv("ROBINARB_ROBIN_WORK_TOP_N", "5")))
ROBINARB_ROBIN_WORK_CANDIDATE_N = max(
    ROBINARB_ROBIN_WORK_TOP_N,
    int(os.getenv("ROBINARB_ROBIN_WORK_CANDIDATE_N", "40")),
)
ROBINARB_HIDDEN_ARBS_TTL = max(60, int(os.getenv("ROBINARB_HIDDEN_ARBS_TTL", "86400")))
ROBINARB_CALCULATOR_VERIFY_WINDOW_SEC = max(5, int(os.getenv("ROBINARB_CALCULATOR_VERIFY_WINDOW_SEC", "180")))
ROBINARB_CALCULATOR_VERIFY_LOCK_SEC = max(5, int(os.getenv("ROBINARB_CALCULATOR_VERIFY_LOCK_SEC", "20")))
ROBINARB_PINNACLE_OVERVALUE_MAX = int(os.getenv("ROBINARB_PINNACLE_OVERVALUE_MAX", "140"))
ROBINARB_SESSION_TTL = max(60, int(os.getenv("ROBINARB_SESSION_TTL", "28800")))
ROBINARB_LOGIN_BACKOFF = max(1, int(os.getenv("ROBINARB_LOGIN_BACKOFF", "3")))
ROBINARB_LOGIN_ATTEMPT_KEY_LIMIT = max(100, int(os.getenv("ROBINARB_LOGIN_ATTEMPT_KEY_LIMIT", "2000")))
ROBINARB_BETFAIR_FIXED_STAKE = 1.0
ROBINARB_BETFAIR_MIN_STAKE = ROBINARB_BETFAIR_FIXED_STAKE
ROBINARB_BETFAIR_DEFAULT_STAKE = ROBINARB_BETFAIR_FIXED_STAKE
ROBINARB_BETFAIR_MAX_STAKE = ROBINARB_BETFAIR_FIXED_STAKE
ROBINARB_BETFAIR_ODDS_TOLERANCE = max(0.0, float(os.getenv("ROBINARB_BETFAIR_ODDS_TOLERANCE", "0.01")))
ROBINARB_BETFAIR_ATTEMPTS_DIR = os.getenv("ROBINARB_BETFAIR_ATTEMPTS_DIR", "").strip()
ROBINARB_BETFAIR_ROBIN_WORK_VERIFY_ENABLED = os.getenv(
    "ROBINARB_BETFAIR_ROBIN_WORK_VERIFY_ENABLED", "1"
).strip().lower() not in {"0", "false", "no", "off"}
ROBINARB_BETFAIR_LOW_PRIORITY_QUIET_SEC = max(
    0.0, float(os.getenv("ROBINARB_BETFAIR_LOW_PRIORITY_QUIET_SEC", "1.0"))
)
ROBINARB_BETFAIR_LIVE_QUOTE_TTL_SEC = max(
    1.0, float(os.getenv("ROBINARB_BETFAIR_LIVE_QUOTE_TTL_SEC", "10.0"))
)
# Фаза 3 (audit C, P0 live-placement hardening): the maximum age (wall-clock,
# from paddy_sportsbook's real snapshot fetch time -- see
# PaddySportsbookClient.resolve_live_quote / resolve_quote_from_snapshot's
# `snapshot_fetched_at`) a Betfair Sportsbook quote may have before
# _resolve_betfair_placement_odds refuses to use it to price a live
# placement. This is deliberately generous relative to the Paddy quote
# cache's own cache_ttl_sec (0.75s default) to tolerate normal request
# latency between resolving the quote and placing against it, while still
# rejecting a genuinely stale quote instead of trusting an unverified
# "timestamp" that is always ~now regardless of underlying data age.
ROBINARB_BETFAIR_PLACEMENT_MAX_QUOTE_AGE_SEC = max(
    0.0, float(os.getenv("ROBINARB_BETFAIR_PLACEMENT_MAX_QUOTE_AGE_SEC", "3.0"))
)
# ── Per-match stake limits (ported from big_value's LimitsManager) ──
# Mirrors maxBetsPerMatch / maxStakePerBet / maxStakePerStrategy semantics.
ROBINARB_LIMITS_ENABLED = os.getenv("ROBINARB_LIMITS_ENABLED", "1").strip().lower() not in {"0", "false", "no"}
ROBINARB_MAX_BETS_PER_MATCH = max(1, int(os.getenv("ROBINARB_MAX_BETS_PER_MATCH", "4")))


def _opt_float_env(name: str) -> Optional[float]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return None
    try:
        value = float(raw)
        if not math.isfinite(value) or value <= 0:
            return None
        return value
    except ValueError:
        return None


ROBINARB_MAX_STAKE_PER_BET = _opt_float_env("ROBINARB_MAX_STAKE_PER_BET")
ROBINARB_MAX_STAKE_LIMIT = _opt_float_env("ROBINARB_MAX_STAKE_LIMIT") or 50.0
# Per-match max stake - ported from big_value Kelly sizing (calculator
# service getBetSize, logs.go) with two bookmaker corrections:
#   1. edge/ROI is fixed at ROBINARB_TARGET_EDGE_PCT (our margin as the layer),
#      not a per-bet analyzer ROI.
#   2. big_value bet_size_pct is the fraction of bank put AT RISK on a back
#      bet. As the layer our risk per accepted EUR is (pin_odds - 1), so the
#      accepted-stake cap = bet_size_pct * bankroll / (pin_odds - 1). Worst-
#      case match loss = bet_size_pct * bankroll: it follows big_value proven
#      curve on the lay-equivalent odds O/(O-1) (tiny on favourites, larger
#      on longshots), hard-capped at
#      ROBINARB_KELLY_MAX_BET_PCT). NOTE: replaces the old flat "fixed 2.5 pct
#      of bank per match" behaviour.
ROBINARB_BANKROLL = _opt_float_env("ROBINARB_BANKROLL")
ROBINARB_TARGET_EDGE_PCT = max(0.0, float(os.getenv("ROBINARB_TARGET_EDGE_PCT", "2.5")))
# Kelly shape params mirrored from big_value (default_risk / max_bet_percent).
ROBINARB_KELLY_RISK = max(0.0, float(os.getenv("ROBINARB_KELLY_RISK", "15")))
ROBINARB_KELLY_MAX_BET_PCT = max(0.0, float(os.getenv("ROBINARB_KELLY_MAX_BET_PCT", "10")))
# Optional static hard cap on top of the Kelly cap. When set, the effective
# match cap = min(kelly_cap, ROBINARB_MAX_STAKE_PER_MATCH). Default unset so
# only the Kelly-style cap applies.
ROBINARB_MAX_STAKE_PER_MATCH = _opt_float_env("ROBINARB_MAX_STAKE_PER_MATCH")
# Per-source (per-user, per-side) cap — equivalent to big_value's
# maxStakePerStrategy. When None, sources have unlimited budget on a match
# (subject to the cross-source cap and bet-count cap).
ROBINARB_MAX_STAKE_PER_SOURCE = _opt_float_env("ROBINARB_MAX_STAKE_PER_SOURCE")
ROBINARB_LIMITS_HISTORY_HOURS = max(1.0, float(os.getenv("ROBINARB_LIMITS_HISTORY_HOURS", "24")))
ROBINARB_LIMITS_HISTORY_FILE = os.getenv(
    "ROBINARB_LIMITS_HISTORY_FILE",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), ".bet_match_history.json"),
)
# When True, an over-limit stake is silently capped at the remaining headroom
# (mirrors big_value autobetting). When False (default), the API rejects with
# 409 so the UI can show "ready to accept N EUR" instead of placing a smaller
# bet behind the user's back.
ROBINARB_LIMITS_AUTO_ADJUST = os.getenv(
    "ROBINARB_LIMITS_AUTO_ADJUST", "0"
).strip().lower() not in {"0", "false", "no"}
# When True, strict big_value semantics: a second bet from the same source on
# the same match is rejected unless ROBINARB_MAX_STAKE_PER_SOURCE is set.
# Default False — robinarb's manual-bet UX expects multiple bets from the
# same (user, side) on the same match.
ROBINARB_LIMITS_STRICT_MODE = os.getenv(
    "ROBINARB_LIMITS_STRICT_MODE", "0"
).strip().lower() not in {"0", "false", "no"}

PINNACLE_MARKET_FAMILIES = {"Moneyline", "Totals", "Handicap", "Game Winner", "Set Winner", "Odd/Even"}

# ── In-memory state ──
_DEFAULT_USERS = (
    {
        "username": "owner",
        "password": "pbkdf2_sha256$200000$521df3602c9ac5b0a71b91918df3bf4c$14285ad0c29129abb5b274f695c224e4835d0d3db2e9bbad3fedcf6d5d3668a8",
        "display_name": "Owner",
        "pinnacle_cashback": 20000.0,
        "robinbet": 12000.0,
    },
    {
        "username": "trader1",
        "password": "pbkdf2_sha256$200000$31d8eae017a1c036f5766cc441993209$23c5428590eff45ac9aedec8d0fb96a8ce22b8a3cdbfd82f9c40051ca5c54cde",
        "display_name": "Trader One",
        "pinnacle_cashback": 13500.0,
        "robinbet": 9500.0,
    },
    {
        "username": "trader2",
        "password": "pbkdf2_sha256$200000$d75e961b690a7f87ad34713f65154c08$b3145c19279d0adc3c0bc8876048bdc3109b57f7d9e5434d73417f78d4f28c4b",
        "display_name": "Trader Two",
        "pinnacle_cashback": 9000.0,
        "robinbet": 15500.0,
    },
    {
        "username": "vbet",
        "password": "pbkdf2_sha256$200000$321d0c5c7524dbe5c083a1c7a849e221$9533b3f2d4e120849d081c639a07aa5665278a4c9398de6a1a357abe8817461f",
        "display_name": "VBet",
        "pinnacle_cashback": 12000.0,
        "robinbet": 12000.0,
    },
    {
        "username": "testuser",
        "password": "pbkdf2_sha256$200000$7a41e835663e8b17b663d4f092288260$5c8edfb744fa623cf904a0ade1f61b53722e7313405ccc022ca20f114f96104e",
        "display_name": "Test User",
        "pinnacle_cashback": 100.0,
        "robinbet": 100.0,
    },
    {
        "username": "bumblebet",
        "password": "pbkdf2_sha256$200000$51c3aad714d41a61a5bd2c0d998f09dc$0af6becb56f27cf99c0c4a96643b42e12a8ffa71cfb0649a0d1e8a81bf05304d",
        "display_name": "BumbleBet",
        "pinnacle_cashback": 1000.0,
        "robinbet": 1000.0,
        "role": "superuser",
    },
)
_arbs_cache: list[dict] = []
_arbs_source: str = "none"
_arbs_updated_at: float = 0
_users_lock = threading.Lock()
_verified_quotes_lock = threading.Lock()
_verified_quotes: dict[str, dict[str, Any]] = {}
_calculator_verify_lock = threading.Lock()
_calculator_verify_claims: dict[str, dict[str, Any]] = {}
_stream_quotes_lock = threading.Lock()
_stream_quote_cache: dict[str, dict[str, Any]] = {}
_login_attempts: dict[str, list[float]] = {}


def _prune_login_attempts_locked(now: float, protected_keys: set[str] | None = None) -> None:
    protected = protected_keys or set()
    for key in list(_login_attempts.keys()):
        attempts = [attempt for attempt in _login_attempts.get(key, []) if now - attempt < 60]
        if attempts:
            _login_attempts[key] = attempts
        else:
            _login_attempts.pop(key, None)
    overflow = len(_login_attempts) - ROBINARB_LOGIN_ATTEMPT_KEY_LIMIT
    if overflow <= 0:
        return
    removable = sorted(
        (max(attempts), key)
        for key, attempts in _login_attempts.items()
        if key not in protected and attempts
    )
    for _, key in removable[:overflow]:
        _login_attempts.pop(key, None)

# Rolling buffer of recently observed arbs so the UI keeps a continuous stream
# even when the current upstream snapshot returns just one or two forks.
ROBINARB_ROLLING_TTL = max(30, int(os.getenv("ROBINARB_ROLLING_TTL", "300")))
ROBINARB_ROLLING_LIMIT = max(10, int(os.getenv("ROBINARB_ROLLING_LIMIT", "200")))
_rolling_arbs_lock = threading.Lock()
_rolling_arbs: dict[str, dict[str, Any]] = {}


# ── Match-stake limits tracker (per-match aggregator, ported from big_value) ──
# NOTE: max_stake_per_match is intentionally NOT set on the tracker itself —
# the cap is computed dynamically per arb (Kelly-style: bankroll × edge /
# (pin_odds − 1)) and passed as an override on every check_local_limits call
# via _arb_limits_snapshot / _resolve_match_cap_for_arb.
_match_limits: Optional[MatchLimitsTracker] = (
    MatchLimitsTracker(
        bookmaker="pinnacle",
        mode="live",
        max_bets_per_match=ROBINARB_MAX_BETS_PER_MATCH,
        max_stake_per_bet=ROBINARB_MAX_STAKE_PER_BET,
        max_stake_per_strategy=ROBINARB_MAX_STAKE_PER_SOURCE,
        history_retention_hours=ROBINARB_LIMITS_HISTORY_HOURS,
        history_file_path=ROBINARB_LIMITS_HISTORY_FILE,
        strict_mode=ROBINARB_LIMITS_STRICT_MODE,
        logger=log,
    )
    if ROBINARB_LIMITS_ENABLED
    else None
)


def _kelly_bet_size_percent(odds: float, edge_pct: float) -> float:
    """big_value getBetSize() bet-size fraction of bankroll (0..1).

    Exact port of calculator/internal/service/logs.go::getBetSize, minus the
    "* bank" and round-to-5 which the caller applies. ``edge_pct`` is our
    fixed margin (ROBINARB_TARGET_EDGE_PCT), capped at 8 pct like big_value.
    """
    edge = min(edge_pct, 8.0)
    if edge < 0 or odds <= 0 or ROBINARB_KELLY_RISK <= 0:
        return 0.0
    log_factor = 1.0 - (1.0 + edge / 100.0) / odds
    if log_factor <= 0 or not math.isfinite(log_factor):
        return 0.0
    pct = math.log10(log_factor) / math.log10(math.pow(10, -ROBINARB_KELLY_RISK))
    if not math.isfinite(pct) or pct < 0 or pct > 1:
        return 0.0
    max_pct = ROBINARB_KELLY_MAX_BET_PCT / 100.0
    return min(pct, max_pct)


def _kelly_match_cap(pin_odds: Optional[float]) -> Optional[float]:
    """Per-match max accepted stake: big_value Kelly + bookmaker correction.

    Accepting a bet at pin_odds is equivalent to backing the opposite outcome
    at lay-equivalent odds O' = pin_odds / (pin_odds - 1), so we size with
    big_value's curve on O'. risk_budget = bet_size_pct(edge, O') * bankroll
    is the liability we put at risk; the accepted-stake cap is::

        cap = bet_size_pct(edge, O') * bankroll / (pin_odds - 1)

    Worst-case match loss = cap * (pin_odds - 1) = bet_size_pct * bankroll,
    matching big_value proven risk fraction. Returns None when bankroll is
    unset or odds are not betting-grade.
    """
    if not ROBINARB_BANKROLL or ROBINARB_BANKROLL <= 0:
        return None
    if ROBINARB_TARGET_EDGE_PCT <= 0:
        return None
    if pin_odds is None or not math.isfinite(pin_odds) or pin_odds <= 1.0001:
        return None
    # Bookmaker inversion: accepting a bet at pin_odds == backing the opposite
    # outcome at lay-equivalent odds pin_odds/(pin_odds-1). Feeding raw pin_odds
    # would size UP on favourites (where we pay out almost always) -> ruin;
    # the lay-equivalent makes Kelly size DOWN on favourites, UP on longshots.
    lay_odds = float(pin_odds) / (float(pin_odds) - 1.0)
    pct = _kelly_bet_size_percent(lay_odds, ROBINARB_TARGET_EDGE_PCT)
    if pct <= 0:
        return None
    risk_budget = pct * float(ROBINARB_BANKROLL)
    cap = risk_budget / (float(pin_odds) - 1.0)
    return round(cap / 5.0) * 5.0


def _resolve_match_cap_for_arb(arb: dict[str, Any]) -> dict[str, Any]:
    """Return the dynamic per-match cap and its derivation for an arb.

    Output keys:
      - ``cap``           — effective max stake in EUR (Kelly cap intersected
        with the optional static hard cap), or ``None`` when no cap applies.
      - ``kelly_cap``     — the raw Kelly cap before the static intersect.
      - ``hard_cap``      — the static ROBINARB_MAX_STAKE_PER_MATCH if set.
      - ``pin_odds``      — odds used for the Kelly derivation.
      - ``bankroll`` / ``target_edge_pct`` — params used.
    """
    pin_odds = float(arb.get("bk1_odds") or 0) or None
    kelly = _kelly_match_cap(pin_odds)
    hard = ROBINARB_MAX_STAKE_PER_MATCH
    if kelly is None and hard is None:
        cap: Optional[float] = None
    elif kelly is None:
        cap = hard
    elif hard is None:
        cap = kelly
    else:
        cap = min(kelly, hard)
    return {
        "cap": cap,
        "kelly_cap": kelly,
        "hard_cap": hard,
        "pin_odds": pin_odds,
        "bankroll": ROBINARB_BANKROLL,
        "target_edge_pct": ROBINARB_TARGET_EDGE_PCT,
    }


def _arb_match_key(arb: dict[str, Any]) -> str:
    """Build the LimitsManager-style match key for a Robinarb arb.

    Strategy:
      1. If `event_id` is present (Pinnacle stable id), prefix the key with it
         so different markets/sides on the same event share the bucket.
      2. Otherwise fall back to normalized `home_away`.
      3. We do not have a reliable match start date in the relay payload, so
         no `_YYYYMMDD` suffix is appended; bets stay grouped by event_id /
         home+away across the 24h history retention window.
    """
    event_id = arb.get("event_id") or arb.get("pinnacle_event_id")
    home = arb.get("home") or ""
    away = arb.get("away") or ""
    if not home and not away:
        # last-resort: split "Home vs Away" string
        match_str = str(arb.get("match") or "")
        if " vs " in match_str:
            home, away = match_str.split(" vs ", 1)
        else:
            home = match_str
            away = ""
    return MatchLimitsTracker.generate_match_key(home, away, None, event_id=event_id)


def _limits_source(username: str, side: str) -> str:
    """Per-source key used for stake-budget tracking.

    Each (user, side) pair is treated as an independent strategy so the
    Pinnacle leg and the counter leg can both be placed against the same
    match without colliding on the per-strategy budget.
    """
    return f"{username}:{side}"


def _arb_limits_snapshot(arb: dict[str, Any], username: str) -> dict[str, Any]:
    """Build the match-limits payload returned by /api/calc and /api/match/limits.

    The per-match cap is computed dynamically per arb from the bankroll and
    target edge using the Kelly-style formula
    ``cap = bankroll × (edge / 100) / (pin_odds − 1)`` so our worst-case
    loss on this match is fixed at ``edge`` % of the bankroll regardless of
    odds. The same cap is then converted back to a donor-side maximum via
    the arbitrage equality ``donor_stake = pin_stake × leg_odds / donor_odds``
    so the calculator can show "поставь в донора не больше X, чтобы мы
    смогли принять плечо" before the user goes off to place the donor leg.
    """
    if _match_limits is None:
        return {"enabled": False}
    cap_info = _resolve_match_cap_for_arb(arb)
    cap = cap_info["cap"]
    match_key = _arb_match_key(arb)
    pin_source = _limits_source(username, "pinnacle")
    robin_source = _limits_source(username, "robinbet")
    # Probe with a tiny stake — adjusted_stake on success carries the headroom.
    pin_probe = _match_limits.check_local_limits(
        match_key, pin_source, 1.0, max_stake_per_match=cap
    )
    robin_probe = _match_limits.check_local_limits(
        match_key, robin_source, 1.0, max_stake_per_match=cap
    )

    def _ready(probe: dict[str, Any]) -> Optional[float]:
        if not probe.get("allowed"):
            return 0.0
        candidates: list[float] = []
        if probe.get("remaining") is not None:
            candidates.append(float(probe["remaining"]))
        if probe.get("max_stake_per_bet") is not None:
            candidates.append(float(probe["max_stake_per_bet"]))
        if not candidates:
            return None
        return round(min(candidates), 2)

    pin_ready = _ready(pin_probe)
    robin_ready = _ready(robin_probe)

    pin_odds = float(arb.get("bk1_odds") or 0)
    counter_odds = float(arb.get("bk2_odds") or 0)
    robin_odds = float(arb.get("robin_odds") or 0)

    def _donor_for(pin_leg_stake: Optional[float], leg_odds: float) -> Optional[float]:
        if pin_leg_stake is None or leg_odds <= 1 or counter_odds <= 1:
            return None
        # In a balanced arb both legs return the same payout:
        #   pin_leg_stake * leg_odds = donor_stake * counter_odds
        # so the donor stake that *exactly* uses up the remaining headroom on
        # our local-accepted leg is pin_leg_stake * leg_odds / counter_odds.
        return round(pin_leg_stake * leg_odds / counter_odds, 2)

    return {
        "enabled": True,
        "match_key": match_key,
        "pin": {
            "stats": pin_probe.get("stats"),
            "remaining": pin_probe.get("remaining"),
            "ready_to_accept": pin_ready,
            "allowed": pin_probe.get("allowed", True),
            "reason": pin_probe.get("reason"),
        },
        "robin": {
            "stats": robin_probe.get("stats"),
            "remaining": robin_probe.get("remaining"),
            "ready_to_accept": robin_ready,
            "allowed": robin_probe.get("allowed", True),
            "reason": robin_probe.get("reason"),
        },
        "max_stake_per_match": cap,
        "max_stake_per_bet": pin_probe.get("max_stake_per_bet"),
        "max_bets_per_match": pin_probe.get("max_bets_per_match")
        or ROBINARB_MAX_BETS_PER_MATCH,
        "max_donor_stake_for_pin": _donor_for(pin_ready, pin_odds),
        "max_donor_stake_for_robin": _donor_for(robin_ready, robin_odds),
        "auto_adjust": ROBINARB_LIMITS_AUTO_ADJUST,
        "strict_mode": ROBINARB_LIMITS_STRICT_MODE,
        # derivation — exposed so the frontend can label the cap precisely
        # (e.g. "60K × 2.5% / (1.91 − 1) = 1648 EUR @ PIN 1.91").
        "cap_derivation": {
            "bankroll": cap_info["bankroll"],
            "target_edge_pct": cap_info["target_edge_pct"],
            "pin_odds": cap_info["pin_odds"],
            "kelly_cap": cap_info["kelly_cap"],
            "hard_cap": cap_info["hard_cap"],
            "formula": "bet_size_pct(edge, pin_odds/(pin_odds-1)) * bankroll / (pin_odds - 1) [big_value Kelly, lay-inverted]",
        },
    }


def _seed_match_limits_from_storage() -> None:
    """Replay accepted bets from SQLite into the in-memory limits tracker.

    Only bets newer than the tracker's retention window are loaded. We attach
    them to a synthetic match key derived from the stored `match` field and
    `arb_id`; on a fresh deploy this prevents users from circumventing the
    per-match limit by simply restarting the service.
    """
    if _match_limits is None:
        return
    cutoff_sec = time.time() - (_match_limits.history_retention_ms / 1000.0)
    seeded = 0
    try:
        users = _storage.load_users()
    except Exception as exc:  # noqa: BLE001
        log.warning("seed: load_users failed: %s", exc)
        return
    for username, user in users.items():
        for bet in user.get("bets", []):
            placed_at = float(bet.get("placed_at") or 0)
            status = str(bet.get("status") or "accepted")
            stake = float(bet.get("stake") or 0)
            if placed_at < cutoff_sec or stake <= 0:
                continue
            # We only want bets that consumed budget; settled losers/winners
            # also count because they were once "accepted" — match the
            # big_value behavior of including them in the 24h window.
            match_str = str(bet.get("match") or "")
            home, away = ("", "")
            if " vs " in match_str:
                home, away = match_str.split(" vs ", 1)
            else:
                home = match_str
            arb_id = bet.get("arb_id") or ""
            # Best-effort match key — without event_id we fall back to home/away
            match_key = MatchLimitsTracker.generate_match_key(home, away)
            side = bet.get("side") or ""
            source = _limits_source(username, side)
            ts_ms = int(placed_at * 1000)
            record = {
                "outcome": bet.get("selection") or bet.get("side"),
                "source": source,
                "stake": stake,
                "bookmaker": "pinnacle",
                "mode": "live",
                "timestamp": ts_ms,
                "matchDate": None,
                "odds": float(bet.get("odds") or 0),
                "potential_return": float(bet.get("potential_return") or 0),
                "bet_id": bet.get("id"),
                "username": username,
                "side": side,
                "arb_id": arb_id,
                "match": match_str,
                "match_key": match_key,
                "status": status,
                "_seeded": True,
            }
            with _match_limits._lock:  # noqa: SLF001 — internal seeding is intentional
                bucket = _match_limits._bet_history.setdefault(match_key, [])  # noqa: SLF001
                # de-duplicate against an already-loaded entry from the JSON file
                if not any(
                    e.get("bet_id") == record["bet_id"]
                    or (e.get("timestamp") == ts_ms and e.get("source") == source)
                    for e in bucket
                ):
                    bucket.append(record)
                    seeded += 1
    if seeded:
        try:
            _match_limits._save_history()  # noqa: SLF001
        except Exception:
            pass
        log.info("match limits: seeded %d accepted bets from storage", seeded)


def _is_local_or_private_url(raw_url: str) -> bool:
    parsed = urlparse(raw_url)
    host = (parsed.hostname or "").lower()
    if host == "localhost":
        return True
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    return address.is_loopback or address.is_private


def _remote_plain_http_requires_opt_in(raw_url: str, allow_insecure_http: bool) -> bool:
    return urlparse(raw_url).scheme.lower() == "http" and not allow_insecure_http and not _is_local_or_private_url(raw_url)


if _remote_plain_http_requires_opt_in(PINNACLE_API_BASE, PINNACLE_ALLOW_INSECURE_HTTP):
    raise RuntimeError("Remote HTTP PINNACLE_API_BASE is disabled. Use HTTPS or set PINNACLE_ALLOW_INSECURE_HTTP=1 explicitly.")
if urlparse(PINNACLE_API_BASE).scheme.lower() == "https" and not PINNACLE_API_VERIFY_SSL and not PINNACLE_ALLOW_UNVERIFIED_TLS and not _is_local_or_private_url(PINNACLE_API_BASE):
    raise RuntimeError("Remote HTTPS PINNACLE_API_BASE with disabled TLS verification requires PINNACLE_ALLOW_UNVERIFIED_TLS=1.")
if _remote_plain_http_requires_opt_in(FORTED_FEED_URL, FORTED_ALLOW_INSECURE_HTTP):
    raise RuntimeError("Remote HTTP FORTED_FEED_URL is disabled. Use HTTPS or set FORTED_ALLOW_INSECURE_HTTP=1 explicitly.")
if _remote_plain_http_requires_opt_in(FORTED_FEED_STREAM_URL, FORTED_ALLOW_INSECURE_HTTP):
    raise RuntimeError("Remote HTTP FORTED_FEED_STREAM_URL is disabled. Use HTTPS or set FORTED_ALLOW_INSECURE_HTTP=1 explicitly.")
if _remote_plain_http_requires_opt_in(FORTED_CONTROL_URL, FORTED_ALLOW_INSECURE_HTTP):
    raise RuntimeError("Remote HTTP FORTED_CONTROL_URL is disabled. Use HTTPS or set FORTED_ALLOW_INSECURE_HTTP=1 explicitly.")


def _pinnacle_api_headers() -> dict[str, str]:
    headers = {"X-Consumer-Id": PINNACLE_API_CONSUMER_ID}
    if PINNACLE_API_TOKEN:
        headers["Authorization"] = f"Bearer {PINNACLE_API_TOKEN}"
    return headers


class _PinnacleClientRateLimited(Exception):
    def __init__(self, scope: str, retry_after: float, reason: str) -> None:
        super().__init__(reason)
        self.scope = scope
        self.retry_after = max(1, int(math.ceil(retry_after)))
        self.reason = reason


_PINNACLE_CLIENT_LOCK = asyncio.Lock()
_PINNACLE_CLIENT_HISTORY: deque[float] = deque()
_PINNACLE_CLIENT_BLOCKED_UNTIL = 0.0
_PINNACLE_CLIENT_HIGH_PRIORITY_WAITERS = 0
_PINNACLE_CLIENT_LAST_HIGH_PRIORITY_AT = 0.0
_PINNACLE_MARKET_MARGIN_CACHE: dict[str, tuple[float, tuple[float, str] | None]] = {}

_PINNACLE_CLIENT_HIGH_PRIORITY_SCOPES = frozenset({"verify", "place"})


def _pinnacle_retry_after_from_response(resp: Any, default: float) -> float:
    try:
        raw = getattr(resp, "headers", {}).get("Retry-After")
    except Exception:
        raw = None
    try:
        parsed = float(raw)
        return parsed if math.isfinite(parsed) and parsed > 0 else default
    except (TypeError, ValueError):
        return default


async def _reserve_pinnacle_client_slot(scope: str, *, wait: bool = False) -> None:
    """Reserve the shared PS3838 account, with basket verify/place taking priority.

    RobinWork market-margin lookups are deliberately best-effort. Once a basket
    request is waiting, and for a short quiet period after it is sent, background
    lookups are rejected locally instead of consuming the next account slot.
    """
    high_priority = scope in _PINNACLE_CLIENT_HIGH_PRIORITY_SCOPES
    registered_waiter = False
    try:
        while True:
            async with _PINNACLE_CLIENT_LOCK:
                global _PINNACLE_CLIENT_BLOCKED_UNTIL
                global _PINNACLE_CLIENT_HIGH_PRIORITY_WAITERS
                global _PINNACLE_CLIENT_LAST_HIGH_PRIORITY_AT
                if high_priority and not registered_waiter:
                    _PINNACLE_CLIENT_HIGH_PRIORITY_WAITERS += 1
                    registered_waiter = True

                now = time.time()
                while _PINNACLE_CLIENT_HISTORY and now - _PINNACLE_CLIENT_HISTORY[0] >= 60.0:
                    _PINNACLE_CLIENT_HISTORY.popleft()

                waits: list[float] = []
                if now < _PINNACLE_CLIENT_BLOCKED_UNTIL:
                    waits.append(_PINNACLE_CLIENT_BLOCKED_UNTIL - now)
                if PINNACLE_CLIENT_MIN_INTERVAL_SEC > 0 and _PINNACLE_CLIENT_HISTORY:
                    waits.append(PINNACLE_CLIENT_MIN_INTERVAL_SEC - (now - _PINNACLE_CLIENT_HISTORY[-1]))
                if len(_PINNACLE_CLIENT_HISTORY) >= PINNACLE_CLIENT_RATE_LIMIT_PER_MIN:
                    waits.append(60.0 - (now - _PINNACLE_CLIENT_HISTORY[0]))
                if not high_priority:
                    if _PINNACLE_CLIENT_HIGH_PRIORITY_WAITERS:
                        waits.append(max(0.1, PINNACLE_CLIENT_LOW_PRIORITY_QUIET_SEC))
                    quiet_remaining = (
                        PINNACLE_CLIENT_LOW_PRIORITY_QUIET_SEC
                        - (now - _PINNACLE_CLIENT_LAST_HIGH_PRIORITY_AT)
                    )
                    if quiet_remaining > 0:
                        waits.append(quiet_remaining)

                retry_after = max([value for value in waits if value > 0], default=0.0)
                if retry_after <= 0:
                    _PINNACLE_CLIENT_HISTORY.append(now)
                    if high_priority:
                        _PINNACLE_CLIENT_LAST_HIGH_PRIORITY_AT = now
                    return

            if not wait:
                raise _PinnacleClientRateLimited(
                    scope,
                    retry_after,
                    f"Pinnacle service local throttle for {scope}; retry after {math.ceil(retry_after)}s",
                )
            await asyncio.sleep(min(retry_after, 30.0))
    finally:
        if registered_waiter:
            async with _PINNACLE_CLIENT_LOCK:
                _PINNACLE_CLIENT_HIGH_PRIORITY_WAITERS = max(
                    0,
                    _PINNACLE_CLIENT_HIGH_PRIORITY_WAITERS - 1,
                )


async def _block_pinnacle_client_from_response(resp: Any, scope: str) -> None:
    retry_after = _pinnacle_retry_after_from_response(resp, PINNACLE_CLIENT_429_COOLDOWN_SEC)
    async with _PINNACLE_CLIENT_LOCK:
        global _PINNACLE_CLIENT_BLOCKED_UNTIL
        _PINNACLE_CLIENT_BLOCKED_UNTIL = max(_PINNACLE_CLIENT_BLOCKED_UNTIL, time.time() + retry_after)
    log.warning(
        "Pinnacle service returned 429 for %s; local cooldown %.0fs",
        scope,
        retry_after,
    )


async def _mark_pinnacle_high_priority_complete(scope: str) -> None:
    if scope not in _PINNACLE_CLIENT_HIGH_PRIORITY_SCOPES:
        return
    async with _PINNACLE_CLIENT_LOCK:
        global _PINNACLE_CLIENT_LAST_HIGH_PRIORITY_AT
        _PINNACLE_CLIENT_LAST_HIGH_PRIORITY_AT = time.time()


async def _pinnacle_service_get(
    path: str,
    *,
    scope: str,
    wait: bool = False,
) -> Any:
    """Authenticated GET against the pinnacle/betslip service (read-only)."""
    await _reserve_pinnacle_client_slot(scope, wait=wait)
    try:
        async with httpx.AsyncClient(timeout=PINNACLE_API_TIMEOUT, verify=PINNACLE_API_VERIFY_SSL) as client:
            resp = await client.get(
                f"{PINNACLE_API_BASE}{path}",
                headers=_pinnacle_api_headers(),
            )
    finally:
        await _mark_pinnacle_high_priority_complete(scope)
    if int(getattr(resp, "status_code", 0) or 0) == 429:
        await _block_pinnacle_client_from_response(resp, scope)
        raise _PinnacleClientRateLimited(
            scope,
            _pinnacle_retry_after_from_response(resp, PINNACLE_CLIENT_429_COOLDOWN_SEC),
            f"Pinnacle service remote 429 for {scope}",
        )
    return resp


async def _pinnacle_service_post(
    path: str,
    payload: dict[str, Any],
    *,
    scope: str,
    wait: bool = False,
) -> Any:
    await _reserve_pinnacle_client_slot(scope, wait=wait)
    try:
        async with httpx.AsyncClient(timeout=PINNACLE_API_TIMEOUT, verify=PINNACLE_API_VERIFY_SSL) as client:
            resp = await client.post(
                f"{PINNACLE_API_BASE}{path}",
                json=payload,
                headers=_pinnacle_api_headers(),
            )
    finally:
        await _mark_pinnacle_high_priority_complete(scope)
    if int(getattr(resp, "status_code", 0) or 0) == 429:
        await _block_pinnacle_client_from_response(resp, scope)
        raise _PinnacleClientRateLimited(
            scope,
            _pinnacle_retry_after_from_response(resp, PINNACLE_CLIENT_429_COOLDOWN_SEC),
            f"Pinnacle service remote 429 for {scope}",
        )
    return resp


def _market_margin_cache_key(payload: dict[str, Any], pin_odds: float) -> str:
    raw = json.dumps(
        {"payload": payload, "pin_odds": round(float(pin_odds or 0), 4)},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.blake2s(raw.encode("utf-8"), digest_size=16).hexdigest()


def _market_margin_cache_lookup(key: str) -> tuple[bool, tuple[float, str] | None]:
    now = time.time()
    if len(_PINNACLE_MARKET_MARGIN_CACHE) > 1000:
        for existing_key, (ts, value) in list(_PINNACLE_MARKET_MARGIN_CACHE.items()):
            ttl = 600.0 if value is not None else 15.0
            if now - ts > ttl:
                _PINNACLE_MARKET_MARGIN_CACHE.pop(existing_key, None)
    cached = _PINNACLE_MARKET_MARGIN_CACHE.get(key)
    if cached:
        ts, value = cached
        ttl = 600.0 if value is not None else 15.0
        if now - ts <= ttl:
            return True, value
        else:
            _PINNACLE_MARKET_MARGIN_CACHE.pop(key, None)
    return False, None


def _market_margin_cache_set(key: str, value: tuple[float, str] | None) -> None:
    _PINNACLE_MARKET_MARGIN_CACHE[key] = (time.time(), value)


def _pinnacle_client_limiter_status() -> dict[str, Any]:
    now = time.time()
    recent = [ts for ts in _PINNACLE_CLIENT_HISTORY if now - ts < 60.0]
    return {
        "limit_per_minute": PINNACLE_CLIENT_RATE_LIMIT_PER_MIN,
        "min_interval_sec": PINNACLE_CLIENT_MIN_INTERVAL_SEC,
        "low_priority_quiet_sec": PINNACLE_CLIENT_LOW_PRIORITY_QUIET_SEC,
        "high_priority_waiters": _PINNACLE_CLIENT_HIGH_PRIORITY_WAITERS,
        "last_high_priority_age_sec": (
            round(now - _PINNACLE_CLIENT_LAST_HIGH_PRIORITY_AT, 3)
            if _PINNACLE_CLIENT_LAST_HIGH_PRIORITY_AT
            else None
        ),
        "cooldown_sec": max(0.0, round(_PINNACLE_CLIENT_BLOCKED_UNTIL - now, 1)),
        "recent_count": len(recent),
        "market_margin_cache_entries": len(_PINNACLE_MARKET_MARGIN_CACHE),
        "stats_betslip_enabled": ROBINARB_STATS_BETSLIP_ENABLED,
    }


def _pinnacle_live_place_available() -> bool:
    return bool(PINNACLE_API_BASE and PINNACLE_LIVE_PLACE_ENABLED)


def _betfair_live_place_available() -> bool:
    return os.getenv("ROBINARB_BETFAIR_LIVE_PLACE_ENABLED", "0").strip().lower() in {"1", "true", "yes", "on"}


def _betfair_place_via_api_enabled() -> bool:
    return os.getenv("BETFAIR_PLACE_VIA_API", "0").strip().lower() in {"1", "true", "yes", "on"}


def _pinnacle_place_error_parts(body: Any) -> tuple[str, str]:
    if not isinstance(body, dict):
        return ("PINNACLE_PLACE_REJECTED", "Pinnacle place service did not accept the bet")

    nested = body.get("response") if isinstance(body.get("response"), dict) else {}
    verify = body.get("verify") if isinstance(body.get("verify"), dict) else {}
    reason_candidates = (
        body.get("detail"),
        body.get("error"),
        body.get("message"),
        body.get("reason"),
        nested.get("message"),
        nested.get("reason"),
        nested.get("description"),
        body.get("error_code"),
        nested.get("errorCode"),
        nested.get("error_code"),
        nested.get("code"),
        verify.get("error_code"),
        body.get("status"),
    )
    reason = next((str(value).strip() for value in reason_candidates if str(value or "").strip()), "")
    code = str(
        body.get("error_code")
        or nested.get("errorCode")
        or nested.get("error_code")
        or nested.get("code")
        or verify.get("error_code")
        or body.get("status")
        or "PINNACLE_PLACE_REJECTED"
    ).strip()
    return (code, reason or "Pinnacle place service did not accept the bet")


def _forted_stream_alive(now: float | None = None) -> bool:
    """Живость Forted SSE-потока: активный listener, connected, свежий кадр.

    Fail-closed: нет активного listener / нет кадров / поток мёртв → False.
    """
    relay = _relay_thread
    if relay is None:
        return False
    if not getattr(relay, "connected", False):
        return False
    last_frame_at = getattr(relay, "last_frame_at", None)
    if last_frame_at is None:
        return False
    checked_at = time.time() if now is None else now
    return checked_at - last_frame_at <= ROBINARB_PREMATCH_STREAM_LIVENESS_SEC


def _forted_delivery_alive(now: float | None = None) -> bool:
    """Fresh delivery can be proven by the SSE listener or its last snapshot.

    During a listener reconnect (and in the HTTP fallback path) the relay may
    temporarily be disconnected even though a fresh snapshot was just
    published. `_arbs_updated_at` is the wall-clock delivery time, unlike an
    arb's upstream `updated_at`, so it is the correct bounded fallback.
    """
    checked_at = time.time() if now is None else now
    if _forted_stream_alive(checked_at):
        return True
    return (
        _relay_thread is not None
        and _arbs_source in {"forted", "listener"}
        and _arbs_updated_at > 0
        and checked_at - _arbs_updated_at <= ROBINARB_PREMATCH_STREAM_LIVENESS_SEC
    )


def _live_arb_is_fresh(arb: dict[str, Any], now: float | None = None) -> bool:
    checked_at = time.time() if now is None else now
    updated_at = float(arb.get("updated_at") or 0)
    if updated_at > 0 and updated_at - checked_at > ROBINARB_FEED_FUTURE_SKEW:
        return False
    if _arb_is_live(arb):
        stale_after = _arb_freshness_window(arb)
        return updated_at > 0 and checked_at - updated_at <= stale_after
    # Прематч: цена может стоять минутами (updated_at = last_seen из upstream,
    # момент последнего ИЗМЕНЕНИЯ, не доставки) — свежесть по живости потока.
    if not _forted_delivery_alive(checked_at):
        return False
    # Живость потока — необходимое, но не достаточное условие: форк, ушедший
    # из текущего live snapshot, но ещё живущий в rolling-кеше (TTL=ROBINARB_ROLLING_TTL),
    # не должен считаться свежим только потому что поток жив ("призрачный" форк).
    # _snapshot_seen_at — wall-clock момент, когда именно ЭТОТ форк последний раз
    # реально присутствовал в live snapshot (см. _record_rolling_arbs). Отсутствие
    # поля значит арб не проходил через rolling-хранилище (например прямой снапшот
    # _arbs_cache) — тогда достаточно живости потока.
    snapshot_seen_at = arb.get("_snapshot_seen_at")
    if snapshot_seen_at is None:
        return True
    return checked_at - float(snapshot_seen_at) <= ROBINARB_FEED_STALE_AFTER


def _arb_is_live(arb: dict[str, Any]) -> bool:
    if _forted_live_activity_hint(arb.get("score"), arb.get("match_time")):
        return True
    raw_live = arb.get("is_live")
    if isinstance(raw_live, bool):
        return raw_live
    if raw_live is None or raw_live == "":
        return False
    return str(raw_live).strip().lower() in {"1", "true", "yes", "live"}


def _arb_freshness_window(arb: dict[str, Any]) -> int:
    return ROBINARB_LIVE_FEED_STALE_AFTER if _arb_is_live(arb) else ROBINARB_FEED_STALE_AFTER


def _forted_live_activity_hint(*values: Any) -> bool:
    text = " ".join(str(value or "").strip() for value in values if value not in (None, ""))
    if not text:
        return False
    if text.strip() == "+":
        return True
    if re.search(r"\d+\s*\+\s*\d+", text):
        return True
    return bool(re.search(r"\d+\s*:\s*\d+", text))


def _arb_requires_live_freshness(arb: dict[str, Any], source_fallback: str | None = None) -> bool:
    source = str(arb.get("_source") or source_fallback or "")
    return source in {"forted", "listener", "stale"}


def _arb_from_external_feed(arb: dict[str, Any], source_fallback: str | None = None) -> bool:
    source = str(arb.get("_source") or source_fallback or "")
    return source in {"forted", "listener", "stale"}


def _clear_rolling_arbs_for_source(source: str) -> None:
    with _rolling_arbs_lock:
        for key in list(_rolling_arbs.keys()):
            if _rolling_arbs[key].get("_source") == source:
                del _rolling_arbs[key]


def _clear_all_rolling_arbs() -> None:
    with _rolling_arbs_lock:
        _rolling_arbs.clear()


def _clear_live_feed_cache(source: str = "listener") -> None:
    global _arbs_cache, _arbs_source, _arbs_updated_at
    _arbs_cache = []
    _arbs_source = source
    _arbs_updated_at = time.time()
    _clear_all_rolling_arbs()
    with _stream_quotes_lock:
        _stream_quote_cache.clear()


def _rolling_key(arb: dict[str, Any]) -> str:
    parts = [
        str(arb.get("event_id") or ""),
        str(arb.get("match") or ""),
        str(arb.get("bk2") or ""),
        str(arb.get("market") or ""),
        str(arb.get("bk1_selection") or arb.get("side1") or ""),
        str(arb.get("bk2_selection") or arb.get("side2") or ""),
    ]
    return "|".join(parts)


def _record_rolling_arbs(arbs: list[dict[str, Any]]) -> None:
    if not arbs:
        return
    now = time.time()
    cutoff = now - ROBINARB_ROLLING_TTL
    with _rolling_arbs_lock:
        for arb in arbs:
            key = _rolling_key(arb)
            if not key:
                continue
            existing = _rolling_arbs.get(key)
            preserved_id = existing["id"] if existing else arb.get("id")
            stored = dict(arb)
            stored["id"] = preserved_id or arb.get("id")
            stored["_source"] = arb.get("_source") or _arbs_source
            if existing:
                for verified_key in (
                    "last_verified_pinnacle_odds",
                    "last_verified_pinnacle_at",
                    "last_verified_payload",
                    "last_verified_robin_odds",
                    "last_verified_robin_at",
                    "last_verified_robin_source",
                ):
                    if verified_key in existing and verified_key not in stored:
                        stored[verified_key] = existing[verified_key]
            stored["updated_at"] = float(arb.get("updated_at") or now)
            # Wall-clock момент записи в rolling — НЕ arb["updated_at"] (upstream last_seen).
            # Проставляется при КАЖДОМ вызове для форков текущего live snapshot, поэтому
            # присутствующие форки остаются "недавно виденными"; форк, переставший
            # приходить в _arbs_cache, просто перестаёт получать обновление этого поля
            # и через ROBINARB_FEED_STALE_AFTER секунд считается "призрачным" (см.
            # _live_arb_is_fresh), даже если сам глобальный поток ещё жив.
            stored["_snapshot_seen_at"] = now
            _rolling_arbs[key] = stored
        for key in list(_rolling_arbs.keys()):
            if _rolling_arbs[key].get("updated_at", 0) < cutoff:
                del _rolling_arbs[key]
        if len(_rolling_arbs) > ROBINARB_ROLLING_LIMIT:
            ordered = sorted(
                _rolling_arbs.items(),
                key=lambda item: item[1].get("updated_at", 0),
                reverse=True,
            )
            keep = dict(ordered[:ROBINARB_ROLLING_LIMIT])
            _rolling_arbs.clear()
            _rolling_arbs.update(keep)


def _rolling_arbs_snapshot() -> list[dict[str, Any]]:
    cutoff = time.time() - ROBINARB_ROLLING_TTL
    with _rolling_arbs_lock:
        snapshot = [arb for arb in _rolling_arbs.values() if arb.get("updated_at", 0) >= cutoff]
    snapshot.sort(key=lambda item: -float(item.get("profit_pct") or 0))
    return snapshot


def _stable_arb_id(*parts: Any) -> str:
    payload = "\x1f".join(("" if p is None else str(p)).strip().lower() for p in parts)
    return hashlib.blake2s(payload.encode("utf-8"), digest_size=4).hexdigest()


def _find_arb_by_id(arb_id: str) -> dict[str, Any] | None:
    for arb in _arbs_cache:
        if arb.get("id") == arb_id:
            return arb
    with _rolling_arbs_lock:
        for arb in _rolling_arbs.values():
            if arb.get("id") != arb_id:
                continue
            if _arb_requires_live_freshness(arb, _arbs_source) and not _live_arb_is_fresh(arb):
                continue
            if arb.get("id") == arb_id:
                return arb
    return None


def _hash_password(password: str, salt: str | None = None) -> str:
    if password.startswith("pbkdf2_sha256$"):
        return password
    password_salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), password_salt.encode("utf-8"), 200_000)
    return f"pbkdf2_sha256$200000${password_salt}${digest.hex()}"


def _verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations_raw, salt, expected = password_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_raw)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations).hex()
        return secrets.compare_digest(digest, expected)
    except Exception:
        return False


_DUMMY_PASSWORD_HASH = _hash_password("robinarb-invalid-login-dummy", "0" * 32)


def _build_initial_user_state() -> dict[str, dict[str, Any]]:
    configured = os.getenv("ROBINARB_DEMO_USERS", "").strip()
    specs: list[dict[str, Any]] = []
    if configured:
        for chunk in configured.split("|"):
            parts = [part.strip() for part in chunk.split(":")]
            if len(parts) < 4:
                continue
            username, password, pinnacle_raw, robin_raw, *display_parts = parts
            try:
                pinnacle_cashback = float(pinnacle_raw)
                robinbet = float(robin_raw)
            except ValueError:
                continue
            specs.append(
                {
                    "username": username,
                    "password": password,
                    "role": display_parts[1] if len(display_parts) > 1 else ("admin" if username.strip().lower() == "owner" else "trader"),
                    "display_name": display_parts[0] if display_parts else username,
                    "pinnacle_cashback": pinnacle_cashback,
                    "robinbet": robinbet,
                }
            )

    if not specs and ROBINARB_ALLOW_DEMO_USERS:
        specs = [dict(item) for item in _DEFAULT_USERS]
    elif not specs:
        log.warning("No ROBINARB_DEMO_USERS configured and demo users are disabled")

    users: dict[str, dict[str, Any]] = {}
    for spec in specs:
        username = spec["username"].strip().lower()
        if not username:
            continue
        users[username] = {
            "username": username,
            "display_name": spec.get("display_name") or username.title(),
            "password_hash": _hash_password(str(spec["password"])),
            "role": spec.get("role") or ("admin" if username == "owner" else "trader"),
            "balance": {
                "pinnacle_cashback": round(float(spec["pinnacle_cashback"]), 2),
                "robinbet": round(float(spec["robinbet"]), 2),
                "cashback_pl": 0.0,
            },
            "bets": [],
            "created_at": time.time(),
            "last_login_at": None,
            "forted_account_id": None,
            "forted_filters": None,
        }
    return users


def _load_or_seed_users() -> dict[str, dict[str, Any]]:
    _storage.initialize()
    persisted = _storage.load_users()
    if persisted:
        # Backfill any missing default users that may have been added in spec.
        seed = _build_initial_user_state()
        for username, user in seed.items():
            if username not in persisted:
                _storage.upsert_user(user)
                persisted[username] = user
        # Ensure every user has a cashback_pl key.
        for u in persisted.values():
            u["balance"].setdefault("cashback_pl", 0.0)
        return persisted
    seed = _build_initial_user_state()
    for user in seed.values():
        _storage.upsert_user(user)
    return seed


_users = _load_or_seed_users()
_sessions: dict[str, dict[str, Any]] = {}


def _public_user(user: dict[str, Any]) -> dict[str, str]:
    return {
        "username": user["username"],
        "display_name": user["display_name"],
        "role": user.get("role", "trader"),
    }


def _serialize_balance(balance: dict[str, float]) -> dict[str, float]:
    return {
        "pinnacle_cashback": round(balance["pinnacle_cashback"], 2),
        "robinbet": round(balance["robinbet"], 2),
        "cashback_pl": round(float(balance.get("cashback_pl", 0.0)), 2),
        "total": round(balance["pinnacle_cashback"] + balance["robinbet"], 2),
    }


def _compute_in_play(bets: list[dict[str, Any]]) -> dict[str, dict[str, float]]:
    pin_count = 0
    pin_sum = 0.0
    robin_count = 0
    robin_sum = 0.0
    for bet in bets:
        if str(bet.get("status") or "accepted") != "accepted":
            continue
        stake = float(bet.get("stake") or 0)
        if bet.get("side") == "pinnacle":
            pin_count += 1
            pin_sum += stake
        else:
            robin_count += 1
            robin_sum += stake
    return {
        "pinnacle": {"count": pin_count, "stake_sum": round(pin_sum, 2)},
        "robinbet": {"count": robin_count, "stake_sum": round(robin_sum, 2)},
        "total": {"count": pin_count + robin_count, "stake_sum": round(pin_sum + robin_sum, 2)},
    }


def _snapshot_user(username: str) -> dict[str, Any]:
    with _users_lock:
        user = _users.get(username)
        if not user:
            raise HTTPException(401, "Unauthorized")
        return {
            "user": _public_user(user),
            "balance": _serialize_balance(user["balance"]),
            "bets": list(user["bets"]),
            "bets_count": len(user["bets"]),
            "last_login_at": user["last_login_at"],
            "in_play": _compute_in_play(user["bets"]),
        }


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(401, "Unauthorized")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(401, "Unauthorized")
    return token.strip()


def _require_current_username(authorization: str | None = Header(default=None)) -> str:
    token = _extract_bearer_token(authorization)
    with _users_lock:
        session = _sessions.get(token)
        if not session or float(session.get("expires_at") or 0) <= time.time():
            _sessions.pop(token, None)
            raise HTTPException(401, "Unauthorized")
        session["expires_at"] = time.time() + ROBINARB_SESSION_TTL
        username = str(session.get("username") or "")
        if not username or username not in _users:
            raise HTTPException(401, "Unauthorized")
    return username


def _require_admin_username(current_username: str) -> None:
    with _users_lock:
        user = _users.get(current_username)
        if not user or user.get("role") != "admin":
            raise HTTPException(403, "Admin access required")


def _require_admin_or_superuser_username(current_username: str) -> None:
    with _users_lock:
        user = _users.get(current_username)
        if not user or user.get("role") not in {"admin", "superuser"}:
            raise HTTPException(403, "Admin or Superuser access required")


def _matches_feed_key(candidate: str | None) -> bool:
    if not candidate:
        return False
    value = candidate.strip()
    if not value:
        return False
    matched = False
    for configured in ROBINARB_FEED_KEYS:
        matched = secrets.compare_digest(value, configured) or matched
    return matched


def _require_feed_access(
    authorization: str | None = Header(default=None),
    x_robinarb_feed_key: str | None = Header(default=None),
) -> str:
    if authorization:
        try:
            return _require_current_username(authorization)
        except HTTPException:
            pass

    if _matches_feed_key(x_robinarb_feed_key):
        return "feed-key"

    raise HTTPException(401, "Unauthorized")

# ═══════════════════════════════════════════════════════════
# Forted relay integration
# ═══════════════════════════════════════════════════════════

FORTED_RELAY_SERVERS = [
    ("148.251.13.172", 443),
    ("148.251.13.170", 443),
    ("148.251.13.174", 443),
    ("148.251.14.122", 443),
]

FORTED_SEP = "\xae"

_DOTNET_CP1251: dict[int, str] = {}
for byte_value in range(256):
    try:
        _DOTNET_CP1251[byte_value] = bytes([byte_value]).decode("cp1251")
    except Exception:
        continue
_DOTNET_CP1251[0x98] = "\u0098"
_DOTNET_CP1251_REVERSE = {char: byte_value for byte_value, char in _DOTNET_CP1251.items()}
_DOTNET_CP1251_CODEPOINT_REVERSE = {ord(char): byte_value for char, byte_value in _DOTNET_CP1251_REVERSE.items()}


def _dedupe_keep_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        clean = value.strip()
        if not clean:
            continue
        key = clean.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(clean)
    return result


def _split_filter_values(value: str | None) -> list[str] | None:
    if value is None:
        return None
    return _dedupe_keep_order(value.replace(",", ";").split(";"))


def _env_or_default(name: str, default: str) -> str:
    value = os.getenv(name)
    if value is None:
        return default
    stripped = value.strip()
    return stripped or default


def _serialize_filter_values(values: list[str]) -> str:
    if not values:
        return ""
    return ";".join(values) + ";"


def _dotnet_gzip_compress(data: bytes) -> bytes:
    header = bytes([0x1F, 0x8B, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00])
    compressor = zlib.compressobj(6, zlib.DEFLATED, -zlib.MAX_WBITS)
    compressed = compressor.compress(data) + compressor.flush()
    trailer = struct.pack("<II", zlib.crc32(data) & 0xFFFFFFFF, len(data) & 0xFFFFFFFF)
    return header + compressed + trailer


def _gzip_bytes_to_forted_wire(gzip_bytes: bytes) -> bytes:
    return "".join(_DOTNET_CP1251[byte_value] for byte_value in gzip_bytes).encode("utf-8")


def _forted_wire_to_gzip_bytes(wire_bytes: bytes) -> bytes:
    raw = bytearray()
    idx = 0
    while idx < len(wire_bytes):
        first = wire_bytes[idx]
        if first < 0x80:
            codepoint = first
            idx += 1
        elif first < 0xE0 and idx + 1 < len(wire_bytes):
            codepoint = ((first & 0x1F) << 6) | (wire_bytes[idx + 1] & 0x3F)
            idx += 2
        elif first < 0xF0 and idx + 2 < len(wire_bytes):
            codepoint = (
                ((first & 0x0F) << 12)
                | ((wire_bytes[idx + 1] & 0x3F) << 6)
                | (wire_bytes[idx + 2] & 0x3F)
            )
            idx += 3
        elif idx + 3 < len(wire_bytes):
            codepoint = (
                ((first & 0x07) << 18)
                | ((wire_bytes[idx + 1] & 0x3F) << 12)
                | ((wire_bytes[idx + 2] & 0x3F) << 6)
                | (wire_bytes[idx + 3] & 0x3F)
            )
            idx += 4
        else:
            raw.append(0x3F)
            break

        raw.append(_DOTNET_CP1251_CODEPOINT_REVERSE.get(codepoint, 0x3F))

    return bytes(raw)


def _decode_forted_auth_fields(payload: bytes) -> list[str]:
    gzip_bytes = _forted_wire_to_gzip_bytes(payload)
    text = gzip.decompress(gzip_bytes).decode("cp1251", errors="replace")
    return text.split(FORTED_SEP)


def _parse_filter_values(fields: list[str] | None, index: int) -> list[str]:
    if not fields or len(fields) <= index:
        return []
    return _dedupe_keep_order(fields[index].split(";"))

# Load captured auth binary (from Forted Windows client via Frida capture).
# Our Python gzip.compress() produces different bytes than .NET's GZipStream,
# so we rebuild it byte-identically with a .NET-compatible gzip writer.
_auth_dir = os.path.join(os.path.dirname(__file__))
_auth_hdr_path = os.path.join(_auth_dir, "forted_auth_hdr.bin")
_auth_payload_path = os.path.join(_auth_dir, "forted_auth_payload.bin")
if os.path.exists(_auth_hdr_path) and os.path.exists(_auth_payload_path):
    _captured_auth_hdr = open(_auth_hdr_path, "rb").read()
    _captured_auth_payload = open(_auth_payload_path, "rb").read()
    FORTED_AUTH_FALLBACK_BINARY = _captured_auth_hdr + _captured_auth_payload
    try:
        FORTED_AUTH_TEMPLATE_FIELDS = _decode_forted_auth_fields(_captured_auth_payload)
        log.info(f"Loaded captured Forted auth template: {len(FORTED_AUTH_TEMPLATE_FIELDS)} fields")
    except Exception as exc:
        FORTED_AUTH_TEMPLATE_FIELDS = None
        log.warning(f"Failed to decode captured Forted auth template: {exc}")
else:
    FORTED_AUTH_TEMPLATE_FIELDS = None
    FORTED_AUTH_FALLBACK_BINARY = None
    log.warning("Forted auth binaries not found — relay will not work")

# Keepalive also needs the .NET-compatible encoding.
# From the captured keepalive binary, format is: creds + ® + "ref"
# We use the relay_client's encode_outgoing which matches what the server expects.
FORTED_CREDS = os.getenv("FORTED_CREDS", "").strip()
KEEPALIVE_TEXT = FORTED_CREDS + FORTED_SEP + "ref"

# Captured Forted keepalive/subscription message.
# Research confirmed the relay expects this static 72-byte payload shortly after
# auth, then every 30 seconds. The free tier still only exposes bookmaker status.
FORTED_KEEPALIVE_PAYLOAD = bytes.fromhex(
    "1fe280b90800000000000400d09bd09fd09c294e4d4de280b04f2e2a4d2d29"
    "d0a6c2b7d18429d09a0cd09d3455d2914c2cd09a745e57e2809dd19906001f"
    "d19bd0b5c2a020000000"
)
FORTED_KEEPALIVE_MESSAGE = b"00000000072" + FORTED_KEEPALIVE_PAYLOAD

_forted_filters_lock = threading.Lock()
_default_forted_bookmakers = _parse_filter_values(FORTED_AUTH_TEMPLATE_FIELDS, 6)
_default_forted_sports = _parse_filter_values(FORTED_AUTH_TEMPLATE_FIELDS, 8)
_default_forted_mode = (
    FORTED_AUTH_TEMPLATE_FIELDS[5]
    if FORTED_AUTH_TEMPLATE_FIELDS and len(FORTED_AUTH_TEMPLATE_FIELDS) > 5
    else "0"
)
_default_forted_filter_id = (
    FORTED_AUTH_TEMPLATE_FIELDS[28]
    if FORTED_AUTH_TEMPLATE_FIELDS and len(FORTED_AUTH_TEMPLATE_FIELDS) > 28
    else "5925"
)
_forted_filters: dict[str, Any] = {
    "bookmakers": _split_filter_values(os.getenv("FORTED_FILTER_BOOKMAKERS")) or _default_forted_bookmakers,
    "sports": _split_filter_values(os.getenv("FORTED_FILTER_SPORTS")) or _default_forted_sports,
    "mode": _env_or_default("FORTED_SERVER_MODE", _default_forted_mode),
    "filter_id": _env_or_default("FORTED_FILTER_ID", _default_forted_filter_id),
}


def _get_forted_filters_snapshot() -> dict[str, Any]:
    with _forted_filters_lock:
        snapshot = {
            "bookmakers": list(_forted_filters["bookmakers"]),
            "sports": [_translate_sport_label(value) for value in _forted_filters["sports"]],
            "available_sports": list(ALL_SUPPORTED_SPORTS),
            "mode": _forted_filters["mode"],
            "filter_id": _forted_filters["filter_id"],
        }
    snapshot["bookmakers_count"] = len(snapshot["bookmakers"])
    snapshot["sports_count"] = len(snapshot["sports"])
    snapshot["available_sports_count"] = len(snapshot["available_sports"])
    return snapshot


def _get_user_forted_filters(username: str) -> dict[str, Any]:
    with _users_lock:
        user = _users.get(username)
    if user and user.get("forted_filters"):
        try:
            custom = json.loads(user["forted_filters"])
            with _forted_filters_lock:
                merged = dict(_forted_filters)
            merged.update(custom)
            return merged
        except Exception as exc:
            log.warning("Failed to parse user %s custom forted filters: %s", username, exc)
    
    with _forted_filters_lock:
        return dict(_forted_filters)


def _update_user_forted_filters(
    username: str,
    bookmakers: Optional[list[str]] = None,
    sports: Optional[list[str]] = None,
    mode: Optional[str] = None,
    filter_id: Optional[str] = None,
) -> bool:
    global_changed = _update_forted_filters(bookmakers, sports, mode, filter_id)

    with _users_lock:
        user = _users.get(username)
    if not user:
        return global_changed
        
    custom = {}
    if user.get("forted_filters"):
        try:
            custom = json.loads(user["forted_filters"])
        except Exception:
            pass

    user_changed = False
    if bookmakers is not None:
        new_bks = _dedupe_keep_order(bookmakers) or _default_forted_bookmakers
        if custom.get("bookmakers") != new_bks:
            custom["bookmakers"] = new_bks
            user_changed = True
    if sports is not None:
        normalized_sports = [
            normalized
            for normalized in (_normalize_sport_filter_value(value) for value in sports)
            if normalized
        ]
        new_sports = _dedupe_keep_order(normalized_sports) or _default_forted_sports
        if custom.get("sports") != new_sports:
            custom["sports"] = new_sports
            user_changed = True
    if mode is not None:
        if custom.get("mode") != mode:
            custom["mode"] = mode
            user_changed = True
    if filter_id is not None:
        if custom.get("filter_id") != filter_id:
            custom["filter_id"] = filter_id
            user_changed = True

    if user_changed:
        user["forted_filters"] = json.dumps(custom)
        _storage.upsert_user(user)

    return global_changed or user_changed


def _save_user_target_profile(username: str, profile: str) -> None:
    with _users_lock:
        user = _users.get(username)
    if user:
        custom = {}
        if user.get("forted_filters"):
            try:
                custom = json.loads(user["forted_filters"])
            except Exception:
                pass
        custom["profile"] = profile
        user["forted_filters"] = json.dumps(custom)
        _storage.upsert_user(user)


def _update_forted_filters(
    bookmakers: Optional[list[str]] = None,
    sports: Optional[list[str]] = None,
    mode: Optional[str] = None,
    filter_id: Optional[str] = None,
) -> bool:
    changed = False
    with _forted_filters_lock:
        if bookmakers is not None:
            new_bookmakers = _dedupe_keep_order(bookmakers) or _default_forted_bookmakers
            if new_bookmakers != _forted_filters["bookmakers"]:
                _forted_filters["bookmakers"] = new_bookmakers
                changed = True
        if sports is not None:
            normalized_sports = [
                normalized
                for normalized in (_normalize_sport_filter_value(value) for value in sports)
                if normalized
            ]
            new_sports = _dedupe_keep_order(normalized_sports) or _default_forted_sports
            if new_sports != _forted_filters["sports"]:
                _forted_filters["sports"] = new_sports
                changed = True
        if mode is not None and mode != _forted_filters["mode"]:
            _forted_filters["mode"] = mode
            changed = True
        if filter_id is not None and filter_id != _forted_filters["filter_id"]:
            _forted_filters["filter_id"] = filter_id
            changed = True
    return changed


def _build_forted_auth_binary() -> bytes | None:
    if not FORTED_CREDS:
        log.error("FORTED_CREDS is required when the Forted relay is enabled")
        return None
    if not FORTED_AUTH_TEMPLATE_FIELDS:
        return FORTED_AUTH_FALLBACK_BINARY

    with _forted_filters_lock:
        filters = {
            "bookmakers": list(_forted_filters["bookmakers"]),
            "sports": list(_forted_filters["sports"]),
            "mode": _forted_filters["mode"],
            "filter_id": _forted_filters["filter_id"],
        }

    fields = list(FORTED_AUTH_TEMPLATE_FIELDS)
    fields[0] = FORTED_CREDS
    fields[5] = filters["mode"]
    fields[6] = _serialize_filter_values(filters["bookmakers"])
    fields[8] = _serialize_filter_values(filters["sports"])
    fields[28] = filters["filter_id"]

    payload_text = FORTED_SEP.join(fields)
    gzip_bytes = _dotnet_gzip_compress(payload_text.encode("cp1251", errors="replace"))
    payload = _gzip_bytes_to_forted_wire(gzip_bytes)
    return str(len(payload)).zfill(11).encode("ascii") + payload


def _forted_encode(text: str) -> bytes:
    """Encode text for sending to Forted relay (.NET GZipStream compatible)."""
    cp1251_bytes = text.encode("cp1251", errors="replace")
    compressed = gzip.compress(cp1251_bytes)
    wire = compressed.decode("cp1251", errors="surrogateescape")
    raw = wire.encode("utf-8", errors="surrogateescape")
    return str(len(raw)).zfill(11).encode("ascii") + raw


def _build_forted_socket() -> socket.socket:
    if not FORTED_SOCKS5_HOST:
        return socket.socket(socket.AF_INET, socket.SOCK_STREAM)

    try:
        import socks  # type: ignore[import-not-found]
    except ImportError as exc:
        raise RuntimeError(
            "FORTED_SOCKS5_HOST is set but PySocks is not installed"
        ) from exc

    sock = socks.socksocket()
    sock.set_proxy(
        socks.SOCKS5,
        FORTED_SOCKS5_HOST,
        FORTED_SOCKS5_PORT,
        rdns=FORTED_SOCKS5_RDNS,
        username=FORTED_SOCKS5_USERNAME,
        password=FORTED_SOCKS5_PASSWORD,
    )
    return sock


SPORT_MAP_RU_EN = {
    "Американский футбол": "American Football",
    "Атлетика": "Athletics",
    "Бадминтон": "Badminton",
    "Баскетбол": "Basketball",
    "Бейсбол": "Baseball",
    "Биатлон": "Biathlon",
    "Бокс": "Boxing",
    "Боулинг": "Bowling",
    "Велоспорт": "Cycling",
    "Водное поло": "Water Polo",
    "Волейбол": "Volleyball",
    "Гандбол": "Handball",
    "Гимнастика": "Gymnastics",
    "Гольф": "Golf",
    "Гребля": "Rowing",
    "Гэльский футбол": "Gaelic Football",
    "Дартс": "Darts",
    "Единоборства": "Combat Sports",
    "Керлинг": "Curling",
    "Кибербаскетбол": "Esports Basketball",
    "Киберволейбол": "Esports Volleyball",
    "Киберспорт": "Esports",
    "Кибертеннис": "Esports Tennis",
    "Киберфутбол": "Esports Soccer",
    "Киберхоккей": "Esports Hockey",
    "Крикет": "Cricket",
    "Лакросс": "Lacrosse",
    "Лыжи": "Skiing",
    "Мотоспорт": "Motorsport",
    "Настольный теннис": "Table Tennis",
    "Нетбол": "Netball",
    "Падел": "Padel",
    "Пелота": "Pelota",
    "Песапалло": "Pesapallo",
    "Плавание": "Swimming",
    "Пляжный волейбол": "Beach Volleyball",
    "Пляжный футбол": "Beach Soccer",
    "Регби": "Rugby",
    "Сквош": "Squash",
    "Снукер": "Snooker",
    "Софтбол": "Softball",
    "Сумо": "Sumo",
    "Теннис": "Tennis",
    "Фехтование": "Fencing",
    "Флорбол": "Floorball",
    "Формула 1": "Formula 1",
    "Футбол": "Soccer",
    "Футзал": "Futsal",
    "Хоккей": "Hockey",
    "Хоккей с мячом": "Bandy",
    "Шахматы": "Chess",
    "(Другие)": "Other",
}
SPORT_MAP_EN_RU = {translated.lower(): source for source, translated in SPORT_MAP_RU_EN.items()}
ALL_SUPPORTED_SPORTS = sorted({translated for translated in SPORT_MAP_RU_EN.values() if translated})


def _translate_sport_label(value: str) -> str:
    clean = value.strip()
    return SPORT_MAP_RU_EN.get(clean, clean)


def _normalize_sport_filter_value(value: str) -> str:
    clean = value.strip()
    if not clean:
        return ""
    if clean in SPORT_MAP_RU_EN:
        return clean
    return SPORT_MAP_EN_RU.get(clean.lower(), clean)


def _translate_selection_text(value: str) -> str:
    clean = str(value or "").strip()
    if not clean:
        return ""

    direct_map = {
        "1": "Home",
        "2": "Away",
        "П1": "Home",
        "П2": "Away",
        "Н": "Draw",
        "X": "Draw",
        "Ничья": "Draw",
    }
    if clean in direct_map:
        return direct_map[clean]

    translated = clean
    replacements = (
        ("ТБ(", "Over ("),
        ("ТМ(", "Under ("),
        ("Ф1(", "Handicap 1 ("),
        ("Ф2(", "Handicap 2 ("),
        ("гейм ", "Game "),
        ("Гейм ", "Game "),
        ("сет ", "Set "),
        ("Сет ", "Set "),
        ("нечёт", "Odd"),
        ("нечет", "Odd"),
        ("чёт", "Even"),
        ("чет", "Even"),
        ("П1", "Home"),
        ("П2", "Away"),
    )
    for source_text, target_text in replacements:
        translated = translated.replace(source_text, target_text)
    return translated


def _normalize_decimal_token(value: str | None) -> str | None:
    if value is None:
        return None
    clean = value.strip().replace(",", ".")
    return clean or None


def _extract_selection_line(selection: str) -> str | None:
    bracket_line_match = re.search(r"\(([-+]?\d+(?:[.,]\d+)?)\)", selection)
    if bracket_line_match:
        return _normalize_decimal_token(bracket_line_match.group(1))

    numeric_tokens = re.findall(r"[-+]?\d+(?:[.,]\d+)?", selection)
    if not numeric_tokens:
        return None
    return _normalize_decimal_token(numeric_tokens[-1])


def _extract_number_after_label(selection: str, labels: tuple[str, ...]) -> int | None:
    label_pattern = "|".join(re.escape(label) for label in labels)
    match = re.search(rf"\b(?:{label_pattern})\s*#?\s*(\d+)\b", selection, re.IGNORECASE)
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


_SELECTION_PERIOD_PREFIX_RE = re.compile(
    r"^\s*(?:p\s*(\d+)|(\d+)(?:\s*-(?:й|ый|ой|ий|st|nd|rd|th))?\s*(?:p|п|period|пер(?:иод)?|half|тайм|set|сет))\.?\s*[:;,\-/]?\s+",
    re.IGNORECASE,
)


def _strip_selection_period_prefix(selection: str) -> tuple[str, int | None]:
    clean = str(selection or "").strip()
    match = _SELECTION_PERIOD_PREFIX_RE.match(clean)
    if not match:
        return clean, None
    period_raw = match.group(1) or match.group(2)
    try:
        period = int(period_raw)
    except (TypeError, ValueError):
        return clean, None
    return clean[match.end():].strip(), period


def _extract_short_child_number(selection: str, label: str) -> int | None:
    match = re.search(rf"\b{re.escape(label)}#?(\d+)\b", selection, re.IGNORECASE)
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def _selection_team_number(selection: str, is_primary_side: bool) -> str:
    normalized = selection.strip().lower()
    if normalized in {"draw", "x", "н", "ничья"}:
        return "None"
    if normalized in {"1", "п1"}:
        return "1"
    if normalized in {"2", "п2"}:
        return "2"
    if re.search(r"\b(?:home|win\s*1|team\s*1|player\s*1)\b", normalized) or "п1" in normalized:
        return "1"
    if re.search(r"\b(?:away|win\s*2|team\s*2|player\s*2)\b", normalized) or "п2" in normalized:
        return "2"
    if re.search(r"\b(?:draw|win\s*none)\b", normalized):
        return "None"
    team_match = re.search(r"(?:handicap|ф|h)\s*([12])", normalized)
    if team_match:
        return team_match.group(1)
    # Forted individual-totals: "ИТ1Б(4,5)" / "ИТ2М(20,5)" / "IT1>", "IT2<".
    # Without this, primary-side default ("1") wins for ИТ2 too, so the
    # robinarb matcher rejects PS3838's correct ИТ2 quote ("Win2") as a
    # mismatch.
    it_match = re.search(r"\b(?:ит|it)\s*([12])", normalized)
    if it_match:
        return it_match.group(1)
    return "1" if is_primary_side else "2"


def _period_prefix_from_metadata(selection: str, metadata: dict[str, Any] | None = None) -> str:
    if metadata:
        period_number = metadata.get("period_number")
        if period_number:
            return f"P{period_number}"

    period_match = re.match(r"^\s*(P\d+)\b", selection.strip(), re.IGNORECASE)
    if period_match:
        return period_match.group(1).upper()
    _clean, period_number = _strip_selection_period_prefix(selection)
    return f"P{period_number}" if period_number else ""


def _parse_selection_market_metadata(selection: str, market: str, is_primary_side: bool) -> dict[str, Any]:
    clean_selection, period_number = _strip_selection_period_prefix(selection)
    normalized = clean_selection.strip().lower()
    line = _extract_selection_line(clean_selection) if market in {"Totals", "Handicap"} else None
    period_match = re.match(r"^\s*P(\d+)\b", clean_selection.strip(), re.IGNORECASE)
    if period_match:
        period_number = int(period_match.group(1))
    set_number = _extract_number_after_label(clean_selection, ("set", "сет")) or _extract_short_child_number(clean_selection, "S")
    game_number = _extract_number_after_label(clean_selection, ("game", "гейм")) or _extract_short_child_number(clean_selection, "G")

    family = market or "Moneyline"
    if market == "Moneyline":
        if set_number is not None:
            family = "Set Winner"
        elif game_number is not None:
            family = "Game Winner"

    metadata: dict[str, Any] = {
        "family": family,
        "raw_selection": selection,
        "team": _selection_team_number(clean_selection, is_primary_side),
    }
    if line is not None:
        metadata["line"] = line
    if period_number is not None:
        metadata["period_number"] = period_number
    if set_number is not None:
        metadata["set_number"] = set_number
    if game_number is not None:
        metadata["game_number"] = game_number
    if "over" in normalized or "тб" in normalized:
        metadata["direction"] = "Over"
    elif "under" in normalized or "тм" in normalized:
        metadata["direction"] = "Under"
    elif "odd" in normalized or "неч" in normalized:
        metadata["parity"] = "Odd"
    elif "even" in normalized or "чёт" in normalized or "чет" in normalized:
        metadata["parity"] = "Even"
    return metadata


def _infer_pinnacle_outcome(
    selection: str,
    market: str,
    is_primary_side: bool,
    metadata: dict[str, Any] | None = None,
) -> str:
    normalized = selection.strip().lower()
    market_metadata = metadata or _parse_selection_market_metadata(selection, market, is_primary_side)
    period_prefix = _period_prefix_from_metadata(selection, market_metadata)

    def with_period_prefix(value: str) -> str:
        if not period_prefix:
            return value
        return f"{period_prefix} {value}"

    raw_line = market_metadata.get("line")
    line = str(raw_line).strip() if raw_line not in (None, "") else None
    team = str(market_metadata.get("team") or _selection_team_number(selection, is_primary_side))

    child_prefix_parts: list[str] = []
    if market_metadata.get("set_number") is not None:
        child_prefix_parts.append(f"Set {market_metadata['set_number']}")
    if market_metadata.get("game_number") is not None:
        child_prefix_parts.append(f"Game {market_metadata['game_number']}")

    def with_child_prefix(value: str) -> str:
        if not child_prefix_parts:
            return with_period_prefix(value)
        child_outcome = " ".join([*child_prefix_parts, value])
        return with_period_prefix(child_outcome)

    if market == "Totals":
        direction = ""
        if "тб" in normalized or "over" in normalized:
            direction = "Over"
        elif "тм" in normalized or "under" in normalized:
            direction = "Under"
        else:
            metadata_direction = str(market_metadata.get("direction") or "").strip().lower()
            if metadata_direction in {"over", "under"}:
                direction = metadata_direction.title()
        if direction:
            return with_child_prefix(f"{direction} {line}" if line is not None else direction)

    if market == "Handicap":
        if line is not None:
            return with_child_prefix(f"H{team} {line}")

    if market == "Odd/Even":
        parity = str(market_metadata.get("parity") or "").strip()
        if parity:
            return with_child_prefix(parity)

    if market in {"Game Winner", "Set Winner"} or child_prefix_parts:
        return with_child_prefix(f"Win{team}")

    return with_period_prefix(f"Win{team}")


def _arb_matches_search(arb: dict, search: str) -> bool:
    needle = search.strip().lower()
    if not needle:
        return True
    haystack = " ".join(
        str(arb.get(key, ""))
        for key in ("match", "home", "away", "sport", "league", "market", "bk2", "side1", "side2")
    ).lower()
    return needle in haystack


def _arb_filter_facets(arbs: list[dict]) -> dict[str, list[str]]:
    return {
        "sports": sorted({arb["sport"] for arb in arbs if arb.get("sport")}),
        "markets": sorted({arb["market"] for arb in arbs if arb.get("market")}),
        "bookmakers": sorted({arb["bk2"] for arb in arbs if arb.get("bk2")}),
    }


def _visible_for_frontend_overvalue(arb: dict[str, Any]) -> bool:
    pin_overvalue = _to_int_or_none(arb.get("pin_overvalue"))
    return pin_overvalue is None or pin_overvalue <= ROBINARB_PINNACLE_OVERVALUE_MAX


_MARKET_CONTEXT_LABELS = {
    "corners": "Corners",
    "cards": "Cards",
    "bookings": "Cards",
    "free_kicks": "Free kicks",
    "shots": "Shots",
    "shots_on_target": "Shots on target",
    "offsides": "Offsides",
    "throw_ins": "Throw-ins",
}

_MARKET_CONTEXT_PATTERNS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("shots_on_target", ("shots on target", "shot on target", "sot", "удары в створ")),
    ("free_kicks", ("free kicks", "free kick", "штрафные", "штрафн")),
    ("throw_ins", ("throw-ins", "throw ins", "throwin", "вбрасывания", "ауты")),
    ("corners", ("corners", "corner", "угловые", "углов", "угл")),
    ("bookings", ("bookings", "booking", "cards", "card", "карточки", "карточ", "жк")),
    ("shots", ("shots", "shot", "удары", "удар")),
    ("offsides", ("offsides", "offside", "офсайды", "офсайд")),
)


def _market_context_from_text(*values: Any) -> str:
    haystack = " ".join(str(value or "") for value in values).strip().lower()
    if not haystack:
        return ""
    for context, patterns in _MARKET_CONTEXT_PATTERNS:
        if any(pattern in haystack for pattern in patterns):
            return context
    return ""


def _market_context_label(context: Any) -> str:
    clean = str(context or "").strip().lower()
    return _MARKET_CONTEXT_LABELS.get(clean, clean.replace("_", " ").title() if clean else "")


_FORTED_MARKET_PERIOD_RE = re.compile(r"(?:^|\s)(\d+)\s*([тпчс])(?:\s|$)", re.IGNORECASE)


def _forted_market_code_metadata(value: Any, sport: Any = "") -> dict[str, Any]:
    """Decode Forted's independent SB market code (1т/1п/1ч/1с)."""
    code = str(value or "").strip().lower().replace("ё", "е")
    match = _FORTED_MARKET_PERIOD_RE.search(code)
    if not match:
        return {}
    number = _to_int_or_none(match.group(1))
    if number is None or number <= 0:
        return {}
    marker = match.group(2).lower()
    sport_text = str(sport or "").lower()
    if marker == "с":
        return {"set_number": number, "period_type": "set"}
    if marker == "ч":
        return {"period_number": number, "period_type": "quarter"}
    if marker == "п" and any(token in sport_text for token in ("hockey", "хоккей")):
        return {"period_number": number, "period_type": "period"}
    return {"period_number": number, "period_type": "half"}


def _arb_market_context(arb: dict[str, Any]) -> str:
    metadata = arb.get("pinnacle_market_metadata") if isinstance(arb.get("pinnacle_market_metadata"), dict) else {}
    explicit = str(arb.get("market_context") or metadata.get("market_context") or "").strip().lower()
    if explicit:
        return explicit
    return _market_context_from_text(
        arb.get("bk1_event_name"),
        arb.get("bk2_event_name"),
        arb.get("market_name"),
        arb.get("display_market"),
    )


def _display_market_with_context(market: str, market_name: str, market_context: str) -> str:
    base = str(market_name or market or "").strip()
    label = _market_context_label(market_context)
    if not label:
        return base
    if label.lower() in base.lower():
        return base
    return f"{label} · {base}" if base else label


PINNACLE_WEB_BASE = "https://www.pinnacle888.com/en"
PINNACLE_MARKETS_FRAGMENT = "#:~:text=All%20Markets"
_PINNACLE_COMPACT_SPORT_SLUGS = {
    "soccer": "soccer",
    "football": "football",
    "american football": "football",
    "tennis": "tennis",
    "basketball": "basketball",
    "baseball": "baseball",
    "hockey": "hockey",
    "ice hockey": "hockey",
    "volleyball": "volleyball",
    "golf": "golf",
    "handball": "handball",
    "cricket": "cricket",
    "rugby league": "rugby-league",
    "rugby union": "rugby-union",
    "mixed martial arts": "mixed-martial-arts",
    "mma": "mixed-martial-arts",
    "boxing": "boxing",
}
_PINNACLE_COMPACT_STATS_SPORTS = {"soccer"}
_PINNACLE_TENNIS_MATCHUP_CACHE_TTL = float(os.getenv("PIN888_TENNIS_MATCHUP_URL_CACHE_TTL", "10"))
_PINNACLE_TENNIS_MATCHUP_LOOKUP_TIMEOUT = float(os.getenv("PIN888_TENNIS_MATCHUP_URL_TIMEOUT", "1.5"))
_pinnacle_tennis_matchup_cache_lock = threading.Lock()
_pinnacle_tennis_matchup_cache: tuple[float, dict[str, str]] = (0.0, {})


def _is_pinnacle_bookmaker(value: Any) -> bool:
    normalized = str(value or "").strip().lower()
    return "pinnacle" in normalized or "ps3838" in normalized


def _build_pinnacle_web_url(raw_link: Any = "") -> str:
    raw = str(raw_link or "").strip()
    base = PINNACLE_WEB_BASE.rstrip("/")
    if not raw:
        return base

    path = raw
    query = ""
    fragment = ""
    if _is_http_url(raw):
        parsed = urlparse(raw)
        path = parsed.path or ""
        query = parsed.query
        fragment = parsed.fragment
    elif raw.startswith("?"):
        path = ""
        query = raw[1:]
    elif raw.startswith("#"):
        path = ""
        fragment = raw[1:]

    path = unquote(path or "").strip()
    if path.lower() in {"", "/", "/en", "/en/"}:
        url = base
    else:
        if path.lower().startswith("/en/"):
            path = path[3:]
        elif path.lower() == "/en":
            path = ""
        safe_path = quote(path.lstrip("/"), safe="/:@")
        url = f"{base}/{safe_path}" if safe_path else base
    if query:
        url = f"{url}?{query}"
    if fragment:
        url = f"{url}#{fragment}"
    return url


def _pinnacle_event_id_from_link(raw_link: Any) -> str:
    raw = str(raw_link or "").strip()
    if not raw:
        return ""
    parsed = urlparse(raw) if _is_http_url(raw) else None
    path = parsed.path if parsed else raw.split("?", 1)[0].split("#", 1)[0]
    parts = [part for part in str(path or "").split("/") if part]
    for part in reversed(parts):
        if part.isdigit():
            return part
    query = parse_qs(parsed.query if parsed else raw.split("?", 1)[1] if "?" in raw else "")
    for key in ("eventId", "event_id", "matchupId", "matchup_id"):
        value = (query.get(key) or [""])[0]
        if str(value).isdigit():
            return str(value)
    return ""


def _pinnacle_slug_part(value: Any) -> str:
    text = str(value or "").strip()
    text = re.sub(r"\((?:games?|sets?|match)\)", "", text, flags=re.IGNORECASE)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[']", "", text)
    text = re.sub(r"[^A-Za-z0-9]+", "-", text)
    return text.strip("-")


def _pinnacle_sport_slug(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    return _PINNACLE_COMPACT_SPORT_SLUGS.get(normalized) or _pinnacle_slug_part(normalized).lower()


def _pinnacle_league_slug(sport: Any, event_name: Any, fallback_league: Any = "") -> str:
    raw = str(event_name or fallback_league or "").strip()
    sport_text = str(sport or "").strip()
    if " - " in raw:
        parts = [part.strip() for part in raw.split(" - ") if part.strip()]
        if parts and parts[0].lower() == sport_text.lower():
            parts = parts[1:]
        raw = " - ".join(parts)
    return _pinnacle_slug_part(raw)


def _pinnacle_snapshot_payload(snapshot: Any) -> dict[str, Any]:
    if not isinstance(snapshot, dict):
        return {}
    data = snapshot.get("data")
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError:
            return {}
    return data if isinstance(data, dict) else {}


def _pinnacle_event_team(event: list[Any], display_idx: int, base_idx: int) -> str:
    for idx in (base_idx, display_idx):
        value = event[idx] if idx < len(event) else None
        clean = str(value or "").strip()
        if clean:
            return clean
    return ""


def _pinnacle_event_type_rank(event: list[Any]) -> tuple[int, int, str]:
    label = str(event[27] if len(event) > 27 else "").strip().lower()
    event_id = str(event[0] if event else "").strip()
    event_num = _to_int_or_none(event_id) or 0
    if label == "sets":
        return (0, event_num, event_id)
    if label == "games":
        return (1, event_num, event_id)
    return (2, event_num, event_id)


def _build_pinnacle_tennis_matchup_index(snapshot: Any) -> dict[str, str]:
    payload = _pinnacle_snapshot_payload(snapshot)
    odds = payload.get("odds") if isinstance(payload.get("odds"), dict) else {}
    groups: dict[tuple[str, str, str, str, str], list[list[Any]]] = {}

    for section in ("n", "l"):
        sport_blocks = odds.get(section)
        if not isinstance(sport_blocks, list):
            continue
        for sport_block in sport_blocks:
            if not isinstance(sport_block, list) or len(sport_block) < 3:
                continue
            sport_id = str(sport_block[0] if len(sport_block) > 0 else "").strip()
            sport_name = str(sport_block[1] if len(sport_block) > 1 else "").strip().lower()
            if sport_id != "33" and "tennis" not in sport_name:
                continue
            leagues = sport_block[2]
            if not isinstance(leagues, list):
                continue
            for league in leagues:
                if not isinstance(league, list) or len(league) < 3:
                    continue
                league_id = str(league[0] if len(league) > 0 else "").strip()
                league_name = str(league[1] if len(league) > 1 else "").strip()
                events = league[2]
                if not league_id or not league_name or not isinstance(events, list):
                    continue
                for event in events:
                    if not isinstance(event, list) or len(event) < 3:
                        continue
                    event_id = str(event[0] if len(event) > 0 else "").strip()
                    if not event_id.isdigit():
                        continue
                    home = _pinnacle_event_team(event, 1, 24)
                    away = _pinnacle_event_team(event, 2, 25)
                    home_key = _pinnacle_slug_part(home).lower()
                    away_key = _pinnacle_slug_part(away).lower()
                    start_key = str(event[4] if len(event) > 4 else "").strip()
                    if not home_key or not away_key:
                        continue
                    groups.setdefault((league_id, league_name, start_key, home_key, away_key), []).append(event)

    index: dict[str, str] = {}
    for (league_id, league_name, _start_key, _home_key, _away_key), events in groups.items():
        ranked_events = sorted(events, key=_pinnacle_event_type_rank)
        ids: list[str] = []
        for event in ranked_events:
            event_id = str(event[0] if event else "").strip()
            if event_id.isdigit() and event_id not in ids:
                ids.append(event_id)
        if not ids:
            continue
        home = _pinnacle_event_team(ranked_events[0], 1, 24)
        away = _pinnacle_event_team(ranked_events[0], 2, 25)
        league_slug = _pinnacle_slug_part(league_name)
        home_slug = _pinnacle_slug_part(home)
        away_slug = _pinnacle_slug_part(away)
        if not (league_slug and home_slug and away_slug):
            continue
        match_slug = f"{home_slug}-vs-{away_slug}"
        ids_csv = ",".join(ids)
        league_id_path = quote(league_id, safe="")
        url = (
            f"{PINNACLE_WEB_BASE}/compact/sports/tennis/matchup/"
            f"{league_slug}/{match_slug}/{league_id_path}/{ids_csv}"
        )
        for event_id in ids:
            index[event_id] = url
    return index


def _pinnacle_tennis_matchup_url_for_event(event_id: Any) -> str:
    global _pinnacle_tennis_matchup_cache

    key = str(event_id or "").strip()
    if not key:
        return ""

    now = time.time()
    with _pinnacle_tennis_matchup_cache_lock:
        cached_at, cached_index = _pinnacle_tennis_matchup_cache
        if now - cached_at <= _PINNACLE_TENNIS_MATCHUP_CACHE_TTL:
            return cached_index.get(key, "")

    try:
        snapshot = pinnacle_hub._get("/snapshot?sport=tennis", timeout=_PINNACLE_TENNIS_MATCHUP_LOOKUP_TIMEOUT)  # noqa: SLF001
        index = _build_pinnacle_tennis_matchup_index(snapshot)
    except Exception as exc:
        log.debug("Failed to build Pinnacle tennis matchup URL index: %r", exc)
        with _pinnacle_tennis_matchup_cache_lock:
            return _pinnacle_tennis_matchup_cache[1].get(key, "")

    with _pinnacle_tennis_matchup_cache_lock:
        _pinnacle_tennis_matchup_cache = (time.time(), index)
    return index.get(key, "")


def _build_pinnacle_compact_stats_url(
    *,
    raw_link: Any = "",
    sport: Any = "",
    event_name: Any = "",
    league: Any = "",
    home: Any = "",
    away: Any = "",
    event_id: Any = "",
) -> str:
    raw = str(raw_link or "").strip()
    if raw:
        parsed = urlparse(raw) if _is_http_url(raw) else None
        raw_path = parsed.path if parsed else raw.split("?", 1)[0].split("#", 1)[0]
        raw_parts = [part for part in str(raw_path or "").split("/") if part]
        has_raw_suffix = bool(parsed.query or parsed.fragment) if parsed else ("?" in raw or "#" in raw)
        plain_event_hint = len(raw_parts) == 1 and raw_parts[0].isdigit() and not has_raw_suffix
        if not plain_event_hint:
            return _build_pinnacle_web_url(raw)

    event = str(event_id or "").strip() or _pinnacle_event_id_from_link(raw_link)
    sport_slug = _pinnacle_sport_slug(sport)
    league_slug = _pinnacle_league_slug(sport, event_name, league)
    home_slug = _pinnacle_slug_part(home)
    away_slug = _pinnacle_slug_part(away)
    if sport_slug == "tennis":
        matchup_url = _pinnacle_tennis_matchup_url_for_event(event)
        if matchup_url:
            return matchup_url
        direct_link = raw_link or (f"/{event}" if event else "")
        return _build_pinnacle_web_url(direct_link)
    if sport_slug not in _PINNACLE_COMPACT_STATS_SPORTS:
        direct_link = raw_link or (f"/{event}" if event else "")
        return _build_pinnacle_web_url(direct_link)
    if not (event and sport_slug and league_slug and home_slug and away_slug):
        return _build_pinnacle_web_url(raw_link)
    match_slug = f"{home_slug}-vs-{away_slug}"
    return f"{PINNACLE_WEB_BASE}/compact/sports/{sport_slug}/stats/{league_slug}/{match_slug}/{event}{PINNACLE_MARKETS_FRAGMENT}"


def _build_bookmaker_url(bookmaker: str) -> str:
    normalized = bookmaker.strip()
    if not normalized:
        return _build_pinnacle_web_url()
    parsed = urlparse(normalized)
    if _is_http_url(normalized) and _is_pinnacle_bookmaker(parsed.netloc):
        return _build_pinnacle_web_url(normalized)
    if _is_http_url(normalized):
        if parsed.query or parsed.fragment or parsed.path not in ("", "/"):
            return normalized
        return normalized if normalized.endswith("/") else f"{normalized}/"

    collapsed = normalized.lower().replace(" ", "")
    collapsed = collapsed.removeprefix("www.")
    if _is_pinnacle_bookmaker(collapsed):
        return _build_pinnacle_web_url()
    if "." in collapsed:
        return f"https://{collapsed}/"
    return f"https://www.{collapsed}.com/"


def _transliterate(text: str) -> str:
    cyrillic_translit = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
        'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
        'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
        'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
        'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch',
        'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
    }
    return "".join(cyrillic_translit.get(c, c) for c in text)


def _slugify_url_part(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    text = _transliterate(text)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("&", " and ")
    text = re.sub(r"(?i)\bvs?\.?\b", " v ", text)
    text = re.sub(r"[^A-Za-z0-9']+", "-", text.lower()).strip("-")
    text = re.sub(r"-{2,}", "-", text)
    return text


def _canonical_betfair_sportsbook_path(arb: dict[str, Any], event_id: str) -> str:
    """Reuse the bookmaker's canonical Latin event path when it is available."""
    wanted_id = str(event_id or "").strip()
    for key in ("bk2_url", "bk2_raw_link", "betfair_url", "bookmaker_url"):
        raw = str(arb.get(key) or "").strip()
        if not raw:
            continue
        parsed = urlparse(raw)
        host = parsed.hostname.lower() if parsed.hostname else ""
        path = unquote(parsed.path or "")
        if host in {"betfair.com", "www.betfair.com"} and "/betting/" in path.lower():
            if re.search(rf"/e-{re.escape(wanted_id)}(?:/|$)", path, flags=re.IGNORECASE):
                return f"{path.rstrip('/')}?tab=all-markets"
            continue
        if host not in {"paddypower.com", "www.paddypower.com"}:
            continue
        parts = [part for part in path.split("/") if part]
        if len(parts) < 3 or not parts[-1].endswith(f"-{wanted_id}"):
            continue
        sport_slug = _slugify_url_part(parts[-3])
        league_slug = _slugify_url_part(parts[-2])
        match_slug = _slugify_url_part(parts[-1][: -(len(wanted_id) + 1)])
        if sport_slug and league_slug and match_slug:
            return f"/betting/{sport_slug}/{league_slug}/{match_slug}/e-{wanted_id}?tab=all-markets"
    return ""


def _betfair_sportsbook_path(
    *,
    event_id: str,
    sport: Any = "",
    league: Any = "",
    event_name: Any = "",
    home: Any = "",
    away: Any = "",
) -> str:
    sport_slug = _slugify_url_part(sport) or "sport"
    if sport_slug in {"soccer", "futbol"}:
        sport_slug = "football"
    league_text = str(event_name or league or "").strip()
    league_parts = [part.strip() for part in re.split(r"\s+-\s+", league_text) if part.strip()]
    if league_parts and _slugify_url_part(league_parts[0]) == sport_slug:
        league_parts = league_parts[1:]
    # Betfair/Paddy URLs usually omit broad country buckets
    # ("Tennis - United Kingdom - ATP London 2026" -> "atp-london-2026").
    if len(league_parts) >= 2 and _slugify_url_part(league_parts[0]) in {
        "international", "united-kingdom", "great-britain", "england", "europe", "usa",
    }:
        league_parts = league_parts[1:]
    league_slug = _slugify_url_part(" ".join(league_parts) or league_text) or "event"

    home_slug = _slugify_url_part(re.sub(r"\s*\([^)]*\)\s*", " ", str(home or "")))
    away_slug = _slugify_url_part(re.sub(r"\s*\([^)]*\)\s*", " ", str(away or "")))
    match_slug = f"{home_slug}-v-{away_slug}".strip("-") if home_slug or away_slug else "event"
    return f"/betting/{sport_slug}/{league_slug}/{match_slug}/e-{event_id}?tab=all-markets"


def _build_betfair_bookmaker_url(
    raw_link: Any,
    fallback_bookmaker: str,
    *,
    sport: Any = "",
    league: Any = "",
    event_name: Any = "",
    home: Any = "",
    away: Any = "",
) -> str:
    raw = str(raw_link or "").strip()
    market_id = betfair_executor.extract_market_id(raw)
    if market_id:
        return f"https://www.betfair.com/exchange/plus/en/market/{market_id}"
    if _is_http_url(raw):
        return raw
    event_id = betfair_executor.extract_event_id(raw) or (raw if raw.isdigit() else "")
    if event_id:
        return urljoin(
            "https://www.betfair.com",
            _betfair_sportsbook_path(
                event_id=event_id,
                sport=sport,
                league=league,
                event_name=event_name,
                home=home,
                away=away,
            ),
        )
    base = _build_bookmaker_url(fallback_bookmaker or "betfair.com")
    if not raw:
        return base
    return urljoin(base, quote(raw.lstrip("/"), safe="/:@?&=%#"))


def _betfair_link_fields(raw_link: Any, url: Any = "", extra: dict[str, Any] | None = None) -> dict[str, Any]:
    probe = {
        "bk2_raw_link": str(raw_link or "").strip(),
        "bk2_url": str(url or "").strip(),
    }
    if extra:
        probe.update(extra)
    market_id = betfair_executor.extract_market_id(probe)
    selection_id = betfair_executor.extract_selection_id(probe)
    event_id = betfair_executor.extract_event_id(probe)
    # A sportsbook event id is authoritative for navigation.  A fixed-odds
    # market id must never be turned into an Exchange /market URL.
    betfair_url = (
        _build_betfair_bookmaker_url(
            event_id or raw_link,
            "betfair.com",
            sport=probe.get("sport"),
            league=probe.get("league"),
            event_name=probe.get("bk2_event_name") or probe.get("event_name"),
            home=probe.get("team1_en") or probe.get("home"),
            away=probe.get("team2_en") or probe.get("away"),
        ) if event_id else ""
    )
    return {
        "betfair_market_id": market_id,
        "betfair_selection_id": selection_id,
        "betfair_event_id": event_id,
        "betfair_url": betfair_url,
    }


def _is_vivaro_bookmaker(value: Any) -> bool:
    normalized = str(value or "").strip().lower()
    return "vivaro" in normalized or "vbet" in normalized


def _vbet_event_url_from_path(path: str, *, is_live: bool | None = None) -> str | None:
    parts = [unquote(part).strip() for part in path.strip("/").split("/") if part.strip()]
    if len(parts) < 6:
        return None
    competition_id = parts[2]
    game_id = parts[3]
    sport_alias = parts[4]
    region_alias = parts[5]
    if not (competition_id.isdigit() and game_id.isdigit() and sport_alias and region_alias):
        return None
    page_type = "live" if is_live else "pre-match"
    event_path = "/".join(
        quote(part, safe="")
        for part in (sport_alias, region_alias, competition_id, "x", game_id)
    )
    return f"https://www.vbet.ua/uk/sports/{page_type}/event-view/{event_path}"


def _build_deep_bookmaker_url(
    raw_link: Any,
    fallback_bookmaker: str,
    *,
    is_live: bool | None = None,
    sport: Any = "",
    league: Any = "",
    event_name: Any = "",
    home: Any = "",
    away: Any = "",
) -> str:
    raw = str(raw_link or "").strip()
    if _is_pinnacle_bookmaker(fallback_bookmaker) or (
        _is_http_url(raw) and _is_pinnacle_bookmaker(urlparse(raw).netloc)
    ):
        return _build_pinnacle_web_url(raw)
    if betfair_executor.is_betfair_bookmaker(fallback_bookmaker) or betfair_executor.is_betfair_bookmaker(raw):
        return _build_betfair_bookmaker_url(
            raw,
            fallback_bookmaker,
            sport=sport,
            league=league,
            event_name=event_name,
            home=home,
            away=away,
        )
    if _is_http_url(raw):
        parsed = urlparse(raw)
        if _is_vivaro_bookmaker(parsed.netloc):
            return _vbet_event_url_from_path(parsed.path, is_live=is_live) or _build_bookmaker_url(raw)
        return _build_bookmaker_url(raw)
    if _is_vivaro_bookmaker(fallback_bookmaker):
        deep_url = _vbet_event_url_from_path(raw, is_live=is_live)
        if deep_url:
            return deep_url
        return "https://www.vbet.ua/uk/sports/home"
    base = _build_bookmaker_url(fallback_bookmaker)
    if not raw:
        return base
    if "/" in raw:
        return urljoin(base, quote(raw.lstrip("/"), safe="/:@?&=%#"))
    return base


def _bcgame_counter_navigation(arb: dict[str, Any]) -> dict[str, Any] | None:
    """Return an unambiguous BC.Game provider hint when Forted identifies it."""
    if not bcgame_sportsbook.is_bcgame_fork(arb):
        return None

    raw_values = [
        str(arb.get(key) or "").strip()
        for key in ("bk2_raw_link", "bk2_url")
    ]
    raw_lower = " ".join(raw_values).lower()
    if any(value.startswith("=/") for value in raw_values) or "betby" in raw_lower or "sptpub.com" in raw_lower:
        provider_label = "Provider Betby"
        provider_short_label = "BC · Betby"
        avoid_provider_label = "Provider BTi"
    elif (
        "bti-sports.io" in raw_lower
        or "442hattrick.com" in raw_lower
        or any(re.search(r"(?:^|[/=])\d{12,}(?:$|[/?#])", value) for value in raw_values)
    ):
        provider_label = "Provider BTi"
        provider_short_label = "BC · BTi"
        avoid_provider_label = "Provider Betby"
    else:
        # A vague hint is worse than no hint: only mark forks whose provider is
        # deterministically encoded by Forted's compact or full event link.
        return None

    return {
        "code": "bcgame-provider",
        "bookmaker_label": "BC.Game",
        "provider_label": provider_label,
        "provider_short_label": provider_short_label,
        "avoid_provider_label": avoid_provider_label,
        "url": "https://bc.game/sports",
    }


_COUNTER_NAVIGATION_RESOLVERS = (
    _bcgame_counter_navigation,
)


def _counter_navigation_fields(arb: dict[str, Any]) -> dict[str, Any]:
    """Attach frontend navigation only for bookmakers registered above."""
    for resolver in _COUNTER_NAVIGATION_RESOLVERS:
        guidance = resolver(arb)
        if guidance:
            return {"counter_navigation": guidance}
    return {}


def _bookmaker_group_key(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    parsed = urlparse(raw if "://" in raw else f"//{raw}")
    host = (parsed.hostname or "").strip().lower()
    if host:
        key = host
    else:
        key = raw.split("/", 1)[0]
    key = key.removeprefix("www.")
    key = re.sub(r"\s+", "", key)
    return key.strip(".")


def _counter_bookmaker_group_key(arb: dict[str, Any]) -> str:
    for key in ("bk2_url", "bk2_raw_link", "bk2"):
        group_key = _bookmaker_group_key(arb.get(key))
        if group_key:
            return group_key
    return "unknown"


_PINNACLE_SELECTION_ID_KEYS = ("selection_id_sent", "selectionIdSent", "selection_id", "selectionId")
_PINNACLE_ODDS_ID_KEYS = ("odds_id", "oddsId", "odd_id", "oddId")
_PINNACLE_LINE_ID_KEYS = ("line_id", "lineId", "bet_id", "betId")
_PINNACLE_ANY_ID_KEYS = _PINNACLE_SELECTION_ID_KEYS + _PINNACLE_ODDS_ID_KEYS + _PINNACLE_LINE_ID_KEYS


def _is_http_url(value: Any) -> bool:
    return urlparse(str(value or "").strip()).scheme.lower() in {"http", "https"}


def _clean_pinnacle_identifier(value: Any) -> str | None:
    clean = str(value or "").strip()
    if not clean or clean.lower() in {"0", "none", "null", "undefined"}:
        return None
    return clean


def _format_ps3838_handicap(value: Any) -> str:
    parsed = _to_float_or_none(value)
    if parsed is None:
        return "0"
    if parsed == int(parsed):
        return str(int(parsed))
    return ("%g" % parsed)


def _build_ps3838_selection_ids(
    *,
    event_id: Any,
    period: Any,
    bet_type: Any,
    team_select: Any,
    is_alt: Any,
    handicap: Any,
    line_id: Any,
) -> dict[str, str] | None:
    event_num = _to_int_or_none(event_id)
    period_num = _to_int_or_none(period)
    bet_type_num = _to_int_or_none(bet_type)
    team_select_num = _to_int_or_none(team_select)
    is_alt_num = _to_int_or_none(is_alt) or 0
    line_id_clean = _clean_pinnacle_identifier(line_id)
    if (
        event_num is None
        or period_num is None
        or bet_type_num is None
        or team_select_num is None
        or line_id_clean is None
    ):
        return None
    odds_id = "|".join(
        (
            str(event_num),
            str(period_num),
            str(bet_type_num),
            str(team_select_num),
            str(is_alt_num),
            _format_ps3838_handicap(handicap),
        )
    )
    return {
        "odds_id": odds_id,
        "selection_id": f"{line_id_clean}|{odds_id}|0",
    }


def _extract_pinnacle_identifier(raw_link: str | None, keys: tuple[str, ...]) -> str | None:
    raw = str(raw_link or "").strip()
    if not raw:
        return None

    if _is_http_url(raw):
        parsed = urlparse(raw)
        query = parse_qs(parsed.query)
        for key in keys:
            values = query.get(key)
            if values:
                value = _clean_pinnacle_identifier(values[0])
                if value is not None:
                    return value

    key_pattern = "|".join(re.escape(key) for key in keys)
    match = re.search(rf"(?<![A-Za-z0-9_])(?:{key_pattern})[=:/-]([A-Za-z0-9_-]+)(?![A-Za-z0-9_])", raw)
    if match:
        return _clean_pinnacle_identifier(match.group(1))

    return None


def _extract_raw_pinnacle_identifier(raw_link: str | None) -> str | None:
    raw = str(raw_link or "").strip()
    return _clean_pinnacle_identifier(raw) if raw.isdigit() else None


def _pinnacle_event_id_for_arb(arb: dict[str, Any]) -> int:
    metadata = arb.get("pinnacle_market_metadata")
    if not isinstance(metadata, dict):
        metadata = {}

    candidates: list[Any] = [
        arb.get("pinnacle_stat_event_id"),
        arb.get("pinnacle_hub_event_id"),
        arb.get("pinnacle_event_id"),
        metadata.get("pinnacle_event_id"),
        metadata.get("pinnacleEventId"),
        metadata.get("pinnacle_matchup_id"),
        metadata.get("pinnacleMatchupId"),
        metadata.get("matchup_id"),
        metadata.get("matchupId"),
        metadata.get("eventId"),
        metadata.get("event_id"),
        metadata.get("stat_event_id"),
        arb.get("pinnacle_raw_id"),
    ]
    for key in ("bk1_raw_link", "bk1_url"):
        raw_link = str(arb.get(key) or "")
        extracted = robin_margin.extract_event_id(raw_link) or _pinnacle_event_id_from_link(raw_link)
        if extracted:
            candidates.append(extracted)
    candidates.append(arb.get("event_id"))

    for value in candidates:
        clean = _clean_pinnacle_identifier(value)
        if clean is None:
            continue
        try:
            event_id = int(clean)
        except (TypeError, ValueError):
            continue
        if event_id > 0:
            return event_id
    return 0


_CYRILLIC_TRANSLIT = str.maketrans({
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "i", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch",
    "ы": "y", "э": "e", "ю": "yu", "я": "ya", "ь": "", "ъ": "",
})


def _team_name_fingerprint(value: Any) -> str:
    text = str(value or "").strip().lower().replace("ё", "е")
    text = text.translate(_CYRILLIC_TRANSLIT)
    text = re.sub(r"\b(?:fc|cf|sc|bc|bk|club|women|woman|wom|u23|u21|u20|u19)\b", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _team_name_similarity(left: Any, right: Any) -> float:
    a = _team_name_fingerprint(left)
    b = _team_name_fingerprint(right)
    if not a or not b:
        return 0.0
    ratio = SequenceMatcher(None, a, b).ratio()
    left_tokens = set(a.split())
    right_tokens = set(b.split())
    token_overlap = (2 * len(left_tokens & right_tokens) / (len(left_tokens) + len(right_tokens))) if left_tokens and right_tokens else 0.0
    return max(ratio, token_overlap)


def _ordered_english_team_names(arb: dict[str, Any]) -> tuple[str, str]:
    feed_home = str(arb.get("home") or "").strip()
    feed_away = str(arb.get("away") or "").strip()
    team1_en = str(arb.get("team1_en") or "").strip()
    team2_en = str(arb.get("team2_en") or "").strip()
    if not (feed_home and feed_away and team1_en and team2_en):
        return team1_en, team2_en

    if _pinnacle_stream_teams_reversed(arb):
        return team2_en, team1_en
    return team1_en, team2_en


def _pinnacle_stream_teams_reversed(arb: dict[str, Any]) -> bool:
    """Whether Forted's displayed team order is opposite Pinnacle's order."""
    feed_home = str(arb.get("home") or "").strip()
    feed_away = str(arb.get("away") or "").strip()
    team1_en = str(arb.get("team1_en") or "").strip()
    team2_en = str(arb.get("team2_en") or "").strip()
    if not (feed_home and feed_away and team1_en and team2_en):
        return False
    forward = _team_name_similarity(feed_home, team1_en) + _team_name_similarity(feed_away, team2_en)
    reversed_score = _team_name_similarity(feed_home, team2_en) + _team_name_similarity(feed_away, team1_en)
    return reversed_score >= 1.05 and reversed_score >= forward + 0.35


def _forted_team_names_for_pinnacle(arb: dict[str, Any]) -> tuple[str, str]:
    team_home_en, team_away_en = _ordered_english_team_names(arb)
    home = str(team_home_en or arb.get("home") or "").strip()
    away = str(team_away_en or arb.get("away") or "").strip()
    if home or away:
        return home, away

    match_name = str(arb.get("match") or "").strip()
    if " vs " in match_name:
        home, away = match_name.split(" vs ", 1)
    elif " - " in match_name:
        home, away = match_name.split(" - ", 1)
    else:
        home, away = match_name, ""
    return home.strip(), away.strip()


def _period_prefix(outcome: str, period: int) -> str:
    return f"P{period} {outcome}" if period and period > 0 else outcome


def _forted_contextual_special_outcome(raw_selection: str, arb: dict[str, Any], period: int) -> str | None:
    context = _arb_market_context(arb)
    if not context:
        return None

    if context == "corners":
        prefix_total = "CT"
        prefix_handicap = "CH"
        prefix_individual = "CIT"
    elif context in {"cards", "bookings"}:
        prefix_total = "BkT"
        prefix_handicap = "BkH"
        prefix_individual = "BkIT"
    else:
        return None

    clean, explicit_period = _strip_selection_period_prefix(str(raw_selection or "").strip())
    if explicit_period is not None:
        period = explicit_period
    lower = clean.lower()
    line = _extract_selection_line(clean)
    if not line:
        return None

    if lower.startswith("ит1") or lower.startswith("it1"):
        direction = ">" if ("б" in lower or "over" in lower) else "<"
        return _period_prefix(f"{prefix_individual}1{direction} {line}", period)
    if lower.startswith("ит2") or lower.startswith("it2"):
        direction = ">" if ("б" in lower or "over" in lower) else "<"
        return _period_prefix(f"{prefix_individual}2{direction} {line}", period)
    if lower.startswith("тб") or lower.startswith("over"):
        return _period_prefix(f"{prefix_total}> {line}", period)
    if lower.startswith("тм") or lower.startswith("under"):
        return _period_prefix(f"{prefix_total}< {line}", period)
    if lower.startswith("ф1") or lower.startswith("handicap 1") or lower.startswith("hcap 1") or lower.startswith("h1"):
        return _period_prefix(f"{prefix_handicap}1 {line}", period)
    if lower.startswith("ф2") or lower.startswith("handicap 2") or lower.startswith("hcap 2") or lower.startswith("h2"):
        return _period_prefix(f"{prefix_handicap}2 {line}", period)
    return None


def _forted_translate_for_pinnacle_service(raw_selection: str, arb: dict[str, Any], period: int) -> str | None:
    metadata = arb.get("pinnacle_market_metadata") if isinstance(arb.get("pinnacle_market_metadata"), dict) else {}
    service_outcome = str(metadata.get("service_outcome") or arb.get("pinnacle_service_outcome") or "").strip()
    if service_outcome:
        return service_outcome
    if _canonical_market_family(str(metadata.get("family") or arb.get("market") or "")) == "Game Winner":
        set_number = _to_int_or_none(metadata.get("set_number"))
        game_number = _to_int_or_none(metadata.get("game_number"))
        team = str(metadata.get("team") or "").strip()
        if set_number and game_number and team in {"1", "2"}:
            return f"P{set_number} {team}G {game_number}"
        # BIA requires both set and game coordinates for `tgame`. Never guess.
        return None
    return _forted_contextual_special_outcome(raw_selection, arb, period) or _forted_translate_outcome(
        raw_selection,
        period,
    )


def _extract_pinnacle_selection_id(raw_link: str | None) -> str | None:
    return _extract_pinnacle_identifier(raw_link, _PINNACLE_SELECTION_ID_KEYS)


def _extract_pinnacle_odds_id(raw_link: str | None) -> str | None:
    return _extract_pinnacle_identifier(raw_link, _PINNACLE_ODDS_ID_KEYS)


def _extract_pinnacle_line_id(raw_link: str | None) -> str | None:
    return _extract_pinnacle_identifier(raw_link, _PINNACLE_LINE_ID_KEYS)


def _feed_identifier(
    fork: dict[str, Any],
    prefix: str,
    names: tuple[str, ...],
    raw_link: str | None,
) -> str | None:
    for name in names:
        for key in (f"{prefix}_{name}", name):
            value = _clean_pinnacle_identifier(fork.get(key))
            if value is not None:
                return value
    return _extract_pinnacle_identifier(raw_link, names)


def _format_pinnacle_error(result: dict[str, Any]) -> str:
    error_code = str(result.get("error_code") or "").strip()
    error_text = str(result.get("error") or result.get("message") or "").strip()
    if error_code == "BETSLIP_RATE_LIMIT_CIRCUIT_OPEN":
        return "Pinnacle gateway is rate-limited upstream right now (BETSLIP_RATE_LIMIT_CIRCUIT_OPEN). Feed odds are shown instead."
    if error_text and error_code:
        return f"{error_text} ({error_code})"
    return error_text or error_code


def _describe_pinnacle_verify_detail(arb: dict[str, Any], result: dict[str, Any]) -> str:
    detail = _format_pinnacle_error(result)
    if detail:
        return detail

    if str(result.get("status") or "").upper() != "UNAVAILABLE":
        return ""

    market_name = str(arb.get("market") or "").strip()
    if market_name in {"Game Winner", "Set Winner"}:
        metadata = arb.get("pinnacle_market_metadata") or {}
        child_bits = []
        if metadata.get("set_number") is not None:
            child_bits.append(f"set {metadata['set_number']}")
        if metadata.get("game_number") is not None:
            child_bits.append(f"game {metadata['game_number']}")
        if child_bits:
            return (
                f"Pinnacle returned no live quote for this {market_name} child market "
                f"({', '.join(child_bits)}). The Forted metadata was forwarded, "
                "but Pinnacle could not match an active line right now."
            )
        return (
            f"Pinnacle returned no live quote for this {market_name} market. "
            "The current Forted feed does not include the set/game metadata needed to resolve it further."
        )

    if not (arb.get("pinnacle_selection_id") or arb.get("pinnacle_odds_id") or arb.get("pinnacle_line_id")):
        return (
            "Pinnacle returned no live quote for this market, and the current Forted feed "
            "does not include enough metadata to resolve it further."
        )

    return "Pinnacle returned no live quote for this market."


def _build_pinnacle_service_place_payload(
    arb: dict[str, Any],
    quote: dict[str, Any],
    *,
    stake: float,
    expected_odds: float,
) -> dict[str, Any]:
    md = arb.get("pinnacle_market_metadata") if isinstance(arb.get("pinnacle_market_metadata"), dict) else {}
    raw_metadata_selection = str(md.get("raw_selection") or "").strip()
    raw_selection = raw_metadata_selection or str(arb.get("bk1_selection") or "").strip()
    try:
        period_hint = int(md.get("period_number") or 0) or 0
    except (TypeError, ValueError):
        period_hint = 0

    quoted_service_outcome = str(quote.get("service_outcome") or "").strip()
    service_outcome = quoted_service_outcome or (
        _forted_translate_for_pinnacle_service(raw_selection, arb, period_hint) if raw_selection else None
    )
    verify_payload = _build_pinnacle_verify_payload(arb)
    _normalize_verify_payload_for_service_outcome(
        verify_payload,
        raw_selection=raw_selection,
        service_outcome=service_outcome,
    )
    outcome = service_outcome or str(verify_payload.get("outcome") or "").strip()

    payload: dict[str, Any] = dict(verify_payload)
    if outcome:
        payload["outcome"] = outcome
    event_id = (
        _to_int_or_none(quote.get("verified_event_id"))
        or _to_int_or_none(quote.get("event_id"))
        or _to_int_or_none(verify_payload.get("event_id"))
    )
    if event_id:
        payload["event_id"] = event_id
    else:
        payload.pop("event_id", None)
    payload["period"] = int(md.get("period_number") or 0) or 0

    sport_label = str(arb.get("sport") or md.get("sport") or "").strip()
    if sport_label:
        payload["sport"] = sport_label
    line_val = md.get("line")
    if line_val is not None:
        try:
            payload["handicap"] = float(line_val)
        except (TypeError, ValueError):
            pass
    if raw_selection:
        payload["raw_selection"] = raw_selection
    quote_metadata = quote.get("market_metadata") if isinstance(quote.get("market_metadata"), dict) else {}
    if quote_metadata:
        payload_metadata = payload.get("market_metadata") if isinstance(payload.get("market_metadata"), dict) else {}
        payload["market_metadata"] = {**payload_metadata, **quote_metadata}

    market_context = str(quote.get("market_context") or _arb_market_context(arb) or "").strip()
    if market_context:
        payload["market_context"] = market_context
        payload["market_context_label"] = _market_context_label(market_context)
    parent_event_id = _to_int_or_none(quote.get("parent_event_id"))
    if parent_event_id:
        payload["parent_event_id"] = parent_event_id
    forted_home, forted_away = _forted_team_names_for_pinnacle(arb)
    if forted_home:
        payload["forted_home"] = forted_home
    if forted_away:
        payload["forted_away"] = forted_away

    line_id = (
        _clean_pinnacle_identifier(quote.get("verified_line_id"))
        or _clean_pinnacle_identifier(quote.get("line_id"))
        or _clean_pinnacle_identifier(verify_payload.get("line_id"))
        or _clean_pinnacle_identifier(arb.get("pinnacle_line_id"))
    )
    if line_id:
        payload["line_id"] = line_id
    for key, verified_key in (
        ("selection_id", "verified_selection_id"),
        ("odds_id", "verified_odds_id"),
    ):
        value = (
            _clean_pinnacle_identifier(quote.get(verified_key))
            or _clean_pinnacle_identifier(quote.get(key))
            or _clean_pinnacle_identifier(verify_payload.get(key))
            or _clean_pinnacle_identifier(arb.get(f"pinnacle_{key}"))
        )
        if value:
            payload[key] = value

    payload["stake"] = round(float(stake), 2)
    payload["expected_odds"] = float(expected_odds)
    payload["accept_better_odds"] = False
    payload["dry_run"] = False
    return payload



async def reconcile_pinnacle_live_place(order_id: str) -> dict[str, Any]:
    """Read-only reconciliation of a previously submitted betslip/BIA order.

    Never re-POSTs /place.  Used to resolve pending_reconciliation bets.
    """
    if not order_id:
        raise HTTPException(400, {"error": "order_id_required"})
    if not PINNACLE_API_BASE:
        raise HTTPException(409, {"error": "pinnacle_place_unavailable"})
    try:
        resp = await _pinnacle_service_get(f"/bia/orders/{order_id}", scope="place")
        try:
            body = resp.json()
        except Exception:
            body = {"body": resp.text}
        resp.raise_for_status()
    except Exception as exc:
        return {
            "status": "UNKNOWN",
            "error_code": "PINNACLE_RECONCILIATION_FAILED",
            "order_id": order_id,
            "reconciliation_required": True,
            "detail": type(exc).__name__,
        }
    status = str(body.get("status") or "").upper() if isinstance(body, dict) else "UNKNOWN"
    if status in {"UNKNOWN", "PENDING"}:
        if isinstance(body, dict):
            body["reconciliation_required"] = True
        return body if isinstance(body, dict) else {"status": "UNKNOWN", "order_id": order_id}
    return body if isinstance(body, dict) else {"status": status, "order_id": order_id}


async def reconcile_betfair_live_place(
    order_id: str = "",
    *,
    intent: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Resolve an uncertain Betfair placement through read-only Activity.

    Missing records and lookup failures remain UNKNOWN. Betfair's activity
    feed is eventually consistent, so absence is never affirmative proof
    that the original placement failed and can never authorize a refund.
    """
    identifier = str(order_id or "").strip()
    if not identifier and not intent:
        raise HTTPException(400, {"error": "order_id_or_intent_required"})
    try:
        return await betfair_sportsbook_basket.BetfairSportsbookBasketClient().reconcile(
            identifier,
            intent=intent,
        )
    except Exception as exc:  # noqa: BLE001 - read-only failure stays pending
        return {
            "status": "UNKNOWN",
            "provider": "betfair-sportsbook",
            "error_code": "BETFAIR_RECONCILIATION_FAILED",
            "order_id": identifier,
            "reconciliation_required": True,
            "detail": type(exc).__name__,
        }


async def _place_betfair_via_api(
    arb: dict[str, Any],
    quote: dict[str, Any],
    *,
    stake: float,
    expected_odds: float,
) -> dict[str, Any] | None:
    """Fast path for AC-6 (BETFAIR_PLACE_VIA_API): direct HTTP placement via
    betfair_sportsbook_place_api instead of the ~12s browser click flow.

    Story 2.2b: `quote.market_id` is the Paddy-namespace market_id (that is
    all paddy_sportsbook.resolve_live_quote can give us) -- implyBets rejects
    it with MARKET_NOT_FOUND. The real Betfair event_url is built and passed
    through to the client's place() so it always re-resolves the actual
    Betfair event/market/selection IDs through SearchView and market-card
    GraphQL requests before implyBets.

    Returns None for SESSION_UNAVAILABLE (worker not logged in /
    unreachable), IMPLY_NETWORK_FAILED (implyBets transport failure --
    pre-stake, no money moved yet), RESOLVE_FAILED (market_id resolution
    failed -- also pre-stake), or when the Betfair event_url itself cannot be
    built, so the caller can fall back to the browser worker. Any other
    outcome (PRICE_CHANGED, a clean PLACE_REJECTED, or PLACE_INDETERMINATE)
    is definitive and must not be retried through the browser worker -- that
    could double-place the same bet.
    """
    market_id = str(quote.get("market_id") or "").strip()
    selection_id = quote.get("selection_id")
    event_url = None
    try:
        event_url = _betfair_sportsbook_event_url(arb, quote)
    except Exception:
        pass
    if not event_url and (not market_id or not selection_id):
        return None
    market_name = str(quote.get("market_name") or arb.get("market") or "").strip()
    # Reconcile regress1 P1-3 (money-critical, final cross-family audit fix):
    # `selection` is the REAL bare runner name; the line-enriched intent
    # (e.g. "Under (93.5)") is threaded through SEPARATELY as
    # `selection_label`, plus the already-verified `expected_line` and raw
    # `market_type` -- previously this single `selection` variable carried
    # whichever of selection_label/selection/arb-fallback existed first, so
    # the worker's split-contract guard (resolveSelectionContract) never saw
    # a genuinely bare selection at all and its "expected_line required for
    # a line-bearing market" gate could never fire on this fast path. The
    # browser-worker basket path (betfair_sportsbook_basket.build_prepare_payload)
    # got the same fix.
    bare_selection = str(
        quote.get("selection")
        or arb.get("bk2_selection")
        or arb.get("side2")
        or ""
    ).strip()
    selection_label = str(quote.get("selection_label") or bare_selection or "").strip()
    expected_line = _to_float_or_none(quote.get("expected_line"))
    market_type = str(quote.get("market_type") or "").strip()
    try:
        event_url = _betfair_sportsbook_event_url(arb, quote)
    except Exception:
        # Without a real Betfair event_url the market_id cannot be resolved
        # and the raw Paddy market_id is guaranteed to fail implyBets --
        # fall back to the browser worker rather than surface a confusing
        # definitive reject for what is really a quote-building gap.
        return None
    try:
        res = await betfair_sportsbook_place_api.BetfairSportsbookPlaceApiClient().place(
            market_id=market_id,
            selection_id=selection_id,
            stake=stake,
            expected_odds=expected_odds,
            dry_run=False,
            event_url=event_url,
            market_name=market_name,
            selection=bare_selection,
            selection_label=selection_label,
            expected_line=expected_line,
            market_type=market_type,
        )
    except betfair_sportsbook_place_api.BetfairSportsbookPlaceApiError as exc:
        if exc.code in (
            betfair_sportsbook_place_api.SESSION_UNAVAILABLE,
            betfair_sportsbook_place_api.IMPLY_NETWORK_FAILED,
            betfair_sportsbook_place_api.RESOLVE_FAILED,
        ):
            return None
        # Reconcile regress1 P1-2 (money-critical): MARKET_REJECTED is a
        # DEFINITIVE semantic decision by the strict catalog matcher/evidence
        # gates -- deliberately NOT in the safe-fallback tuple above, so it
        # falls through to the generic `raise HTTPException(422, ...)` below
        # instead of ever reaching the permissive DOM basket path.
        if exc.code == betfair_sportsbook_place_api.PLACE_INDETERMINATE:
            # Mirror the browser worker's PLACE_INDETERMINATE contract below:
            # the bet may be live, the caller must not refund the stake.
            return {
                "status": "UNKNOWN",
                "error_code": "BETFAIR_PLACE_INDETERMINATE",
                "reconciliation_required": True,
                "detail": str(exc),
            }
        raise HTTPException(422, {"error": "betfair_place_rejected", "reason": f"{exc.code}: {exc}"})
    # Story 2.2b fix-2 (P1, money-critical): place() can return a
    # SUCCESS/BET_PLACED result that still carries
    # reconciliation_required=True (a divergent fill, or -- see
    # betfair_sportsbook_place_api.py's own money-safety fix -- an
    # unparseable fill price that must not be reported as the stale
    # pre-placement quote). Reporting a flat "ACCEPTED" here regardless
    # would lose that: the bet endpoint below only marks a bet
    # pending_reconciliation when status is UNKNOWN/PENDING, so a bet whose
    # real fill is unknown or divergent would otherwise be recorded as a
    # clean, already-reconciled "accepted" bet.
    reconciliation_required = bool(res.get("reconciliation_required"))
    return {
        "status": "UNKNOWN" if reconciliation_required else "ACCEPTED",
        "current_odds": res.get("odds"),
        "expected_odds": expected_odds,
        "wager_id": res.get("order_id"),
        "reconciliation_required": reconciliation_required,
        "reconciliation": {
            "betslip_id": res.get("selection_id"),
            "order_id": res.get("order_id"),
            "dry_run": False,
        },
    }


def _is_betfair_sportsbook_leg(arb: dict[str, Any]) -> bool:
    """Story reconcile Фаза3 (audit C, item 4 -- scoping): the ONLY forks
    that may ever reach the Betfair fixed-odds placement client
    (BetfairSportsbookPlaceApiClient / BetfairSportsbookBasketClient) are
    genuine Betfair *Sportsbook* forks. `betfair_executor.is_betfair_fork`
    alone also matches Betfair Exchange (same bookmaker keyword family);
    `paddy_sportsbook.is_sportsbook_fork` is what actually excludes
    `/exchange/` links. Requiring both here is the same test spec-C
    demanded for `_resolve_betfair_placement_odds` below, applied one layer
    higher so OneWin/Ladbrokes/BCGame/Exchange never even reach the
    Betfair-specific event_url/payload-building code, let alone the price
    guard.
    """
    return betfair_executor.is_betfair_fork(arb) and paddy_sportsbook.is_sportsbook_fork(arb)


def _resolve_betfair_placement_odds(
    arb: dict[str, Any],
    quote: dict[str, Any] | None,
) -> float | None:
    """Story 2.6 (P0 money-fix) + reconcile Фаза3 hardening (audit C): the
    expected_odds used to price-check a live Betfair Sportsbook placement
    (side=robinbet) must be the REAL, identity-bound Betfair quote for the
    exact selection being placed -- never the synthetic Robin offer price
    (`robin_odds` / `compute_robin_odds` in robin_margin.py, a
    Pinnacle-margin-derived internal ranking/display price that has never
    been calibrated against Betfair).

    Cross-family audit (2026-07-15, spec-C) found that passing robin_odds as
    expected_odds into the direct-API fast path (`_place_betfair_via_api` ->
    betfair_sportsbook_place_api.place()) made the live price-check reject
    Betfair's *correct* Forted-derived price as PRICE_CHANGED /
    REQUESTED_PRICE_NOT_AVAILABLE whenever it diverged from the synthetic
    robin_odds -- which is the normal case, not an edge case. robin_odds
    stays exactly as before for offer/ranking/display purposes; this helper
    only decides what gates live execution.

    `quote` MUST be the result of a *fresh* `_resolve_counter_bookmaker_quote`
    / `_resolve_betfair_quote` call made against this SAME `arb` --
    paddy_sportsbook's own semantic matching (event/market/selection) binds
    the quote to arb's identity. The event_id cross-check below is a
    defense-in-depth guard against a caller accidentally passing a quote
    resolved for a different arb, not the primary identity mechanism.

    Returns None (fail-closed) when no fresh, verified, identity-bound
    Betfair price is available for this exact selection; callers MUST reject
    the placement rather than silently fall back to robin_odds. Every check
    below is a hard requirement -- missing/partial data fails closed, it is
    never treated as "not applicable so skip this check" (that was the exact
    class of gap spec-C found in the pre-hardening version: an empty
    event_id on either side silently passed the mismatch check instead of
    being rejected).
    """
    if not _is_betfair_sportsbook_leg(arb):
        return None
    if not isinstance(quote, dict):
        return None
    if quote.get("verified") is not True or str(quote.get("status") or "") != "OK":
        return None
    if str(quote.get("source") or "") != "paddy-sportsbook-api":
        return None
    price = _to_float_or_none(quote.get("current_odds"))
    if price is None or not math.isfinite(price) or price <= 1:
        return None
    market_id = str(quote.get("market_id") or "").strip()
    selection_id = quote.get("selection_id")
    if not market_id or selection_id is None or str(selection_id).strip() == "":
        return None
    # Both event ids must be present AND equal -- a caller-supplied quote
    # with either side blank is not proof of anything and must fail closed
    # (pre-hardening, an empty id on either side skipped this check).
    expected_event_id = paddy_sportsbook.extract_event_id(arb)
    quote_event_id = quote.get("event_id")
    if not expected_event_id or not quote_event_id:
        return None
    if str(quote_event_id) != str(expected_event_id):
        return None
    # Freshness: prove the quote's underlying Paddy snapshot is actually
    # recent using the real fetch timestamp (paddy_sportsbook's
    # `snapshot_fetched_at`, set once per network fetch/cache-fill), not the
    # per-call "timestamp" field which is stamped at call time and is
    # therefore ~now on every cache hit regardless of how old the cached
    # snapshot actually is.
    fetched_at = _to_float_or_none(quote.get("snapshot_fetched_at"))
    if fetched_at is None:
        return None
    age = time.time() - fetched_at
    if age < -0.5 or age > ROBINARB_BETFAIR_PLACEMENT_MAX_QUOTE_AGE_SEC:
        return None
    # Line-bearing markets (selection_label enriched beyond the bare
    # selection, e.g. "Under (93.5)" vs "Under") must carry a proven numeric
    # expected_line -- otherwise the identity guard above is binding to a
    # market/runner pair without ever having confirmed the actual line, which
    # defeats the point for handicap/totals markets (Фаза2 left this
    # resolve-contract gap for the server side to close).
    bare_selection = str(quote.get("selection") or "").strip()
    label_selection = str(quote.get("selection_label") or "").strip()
    if label_selection and label_selection != bare_selection:
        expected_line = _to_float_or_none(quote.get("expected_line"))
        if expected_line is None or not math.isfinite(expected_line):
            return None
    return price


async def _place_betfair_via_service(
    arb: dict[str, Any],
    quote: dict[str, Any],
    *,
    stake: float,
    expected_odds: float,
) -> dict[str, Any]:
    is_betfair_leg = _is_betfair_sportsbook_leg(arb)
    if _betfair_place_via_api_enabled() and is_betfair_leg:
        try:
            fast_api_result = await _place_betfair_via_api(arb, quote, stake=stake, expected_odds=expected_odds)
            if fast_api_result is not None:
                rec_ctx = {
                    "event_id": str(quote.get("event_id") or arb.get("betfair_event_id") or "").strip(),
                    "selection_id": str(quote.get("selection_id") or "").strip(),
                    "stake": round(float(stake), 2),
                    "expected_odds": float(expected_odds),
                }
                existing = fast_api_result.get("reconciliation") if isinstance(fast_api_result.get("reconciliation"), dict) else {}
                fast_api_result["reconciliation"] = {**rec_ctx, **existing}
                return fast_api_result
            else:
                log.info("Fast Betfair API returned None, falling back to browser worker basket path")
        except Exception as exc:
            log.warning("Fast Betfair API placement failed (%s), falling back to browser worker basket path", exc)
    try:
        betfair_quote = await _resolve_counter_bookmaker_quote(arb)
    except Exception as exc:
        if is_betfair_leg:
            # Story reconcile Фаза3 (audit C, item 3): normalize resolver
            # exceptions for the Betfair leg to the same pre-submit 409 the
            # "no verified price" branch below uses, rather than a generic
            # 422 -- both mean the same thing to the caller (do not submit,
            # refund the reserve) and should be classified the same way.
            raise HTTPException(
                409,
                {
                    "error": "betfair_quote_unavailable",
                    "reason": f"Failed to resolve a fresh Betfair Sportsbook quote: {exc}",
                },
            )
        raise HTTPException(422, {"error": "betfair_place_rejected", "reason": f"Failed to verify Betfair quote: {exc}"})

    if not is_betfair_leg:
        # Story reconcile Фаза3 (audit C, item 4 -- scoping): this function is
        # historically named for Betfair but `_resolve_counter_bookmaker_quote`
        # dispatches it for OneWin/Ladbrokes/BCGame quotes too. None of those
        # bookmakers have a working fixed-odds placement client here --
        # building a Betfair-shaped event_url/basket payload from a foreign
        # quote below would either crash confusingly or, worse, silently bind
        # to the wrong market. Fail closed explicitly instead of relying on
        # incidental downstream errors. (The primary gate is the
        # `live_place_required` classifier check in /api/bet; this is
        # defense-in-depth for any other/future caller of this function.)
        raise HTTPException(
            409,
            {
                "error": "betfair_service_not_supported",
                "reason": (
                    "Live placement via the Betfair Sportsbook fixed-odds service is only "
                    "available for Betfair Sportsbook forks"
                ),
            },
        )

    # Story 2.6 (P0) / Фаза3 hardening: override the caller-supplied
    # (robin_odds-based) expected_odds with the REAL Betfair price we just
    # resolved -- see _resolve_betfair_placement_odds's docstring. This is
    # the single point both the direct-API fast path below AND the
    # browser-worker basket path (build_prepare_payload already reads
    # quote["current_odds"] independently) end up using, so both stay
    # consistent. Fail-closed: no fresh, verified, identity-bound Betfair
    # price -> refuse the placement before any submit, do NOT place against
    # the synthetic robin_odds. The reserved stake is refunded by the
    # endpoint's HTTPException handler.
    try:
        betfair_placement_odds = _resolve_betfair_placement_odds(arb, betfair_quote)
    except Exception as exc:  # noqa: BLE001 - never let a guard bug fall through to a submit
        raise HTTPException(
            409,
            {
                "error": "betfair_quote_unavailable",
                "reason": f"Betfair placement price validation failed: {exc}",
            },
        )
    if betfair_placement_odds is None:
        raise HTTPException(
            409,
            {
                "error": "betfair_quote_unavailable",
                "reason": (
                    (betfair_quote or {}).get("detail")
                    or "No fresh, verified Betfair Sportsbook price is available for this selection"
                ),
            },
        )
    expected_odds = betfair_placement_odds

    reconciliation_context = {
        "event_id": str(betfair_quote.get("event_id") or "").strip(),
        "selection_id": str(betfair_quote.get("selection_id") or "").strip(),
        "stake": round(float(stake), 2),
        "expected_odds": float(expected_odds),
    }

    def with_reconciliation_context(result: dict[str, Any]) -> dict[str, Any]:
        enriched = dict(result)
        existing = enriched.get("reconciliation") if isinstance(enriched.get("reconciliation"), dict) else {}
        enriched["reconciliation"] = {**reconciliation_context, **existing}
        return enriched

    if _betfair_place_via_api_enabled():
        try:
            api_result = await _place_betfair_via_api(arb, betfair_quote, stake=stake, expected_odds=expected_odds)
        except HTTPException:
            # A structured, definitive outcome (PRICE_CHANGED / PLACE_REJECTED
            # / a clean validation failure) -- propagate so the caller's
            # refund handler (except HTTPException) refunds the reserved
            # stake. Money-safety: never swallow this into the generic
            # except below.
            raise
        except Exception as exc:  # noqa: BLE001 - see money-safety note below
            # Anything else is NOT a structured BetfairSportsbookPlaceApiError
            # (e.g. a bad proxy kwarg blowing up httpx.AsyncClient
            # construction, or any other unanticipated bug). We cannot prove
            # whether placeBet was ever sent, so this must never crash past
            # the refund handler above (which only catches HTTPException) --
            # that would leave the stake reserved with nothing marking it
            # for reconciliation. Mirror the PLACE_INDETERMINATE contract:
            # hold the balance, flag reconciliation_required, do NOT fall
            # back to the browser worker (that could double-place a bet that
            # actually went through).
            log.error("betfair api placement raised an unexpected exception: %s", exc)
            return with_reconciliation_context({
                "status": "UNKNOWN",
                "error_code": "BETFAIR_PLACE_INDETERMINATE",
                "reconciliation_required": True,
                "detail": f"unexpected error in betfair API placement: {exc}",
            })
        if api_result is not None:
            return with_reconciliation_context(api_result)
        # SESSION_UNAVAILABLE / IMPLY_NETWORK_FAILED (pre-stake, no money at
        # risk) -- fall through to the browser worker path below.

    try:
        event_url = _betfair_sportsbook_event_url(arb, betfair_quote)
    except Exception as exc:
        raise HTTPException(400, {"error": "betfair_place_unavailable", "reason": f"Betfair event URL resolution failed: {exc}"})
    try:
        payload = betfair_sportsbook_basket.build_prepare_payload(
            arb=arb,
            quote=betfair_quote,
            event_url=event_url,
            stake=stake,
            dry_run=False,
        )
    except Exception as exc:
        raise HTTPException(
            422,
            {
                "error": "betfair_payload_failed",
                "reason": f"Failed to build Betfair placement payload: {exc}",
            }
        )
    try:
        res = await betfair_sportsbook_basket.BetfairSportsbookBasketClient().prepare(payload)
        status = res.get("status")
        if status == "BET_PLACED":
            return with_reconciliation_context({
                "status": "ACCEPTED",
                "current_odds": res.get("odds"),
                "expected_odds": expected_odds,
                "wager_id": f"bf-{int(time.time())}",
                "reconciliation": {
                    "betslip_id": res.get("selection_id"),
                    "order_id": f"bf-{int(time.time())}",
                    "dry_run": False,
                }
            })
        else:
            raise HTTPException(422, {"error": "betfair_place_rejected", "reason": f"Betfair worker returned status: {status}"})
    except Exception as exc:
        if isinstance(exc, HTTPException):
            raise
        reason = str(exc)
        # Story 2.2b fix-1 (P1): a typed BetfairSportsbookBasketIndeterminateError
        # means the POST /basket left this process and the worker's own queue
        # may still process/place it asynchronously even though this client
        # gave up waiting (transport read/write/protocol timeout AFTER send,
        # not a connect failure) -- proof of neither success nor failure.
        # Checked by isinstance first (robust); the substring fallback below
        # still covers the worker's own in-band PLACE_INDETERMINATE message
        # (the confirmation UI failing to render/match after a real click).
        # Mirrors the Pinnacle UNKNOWN/PENDING contract (see except-clauses
        # above in _place_pinnacle_via_service): the caller must NOT refund
        # the reserved stake on a bet that may be live.
        if isinstance(exc, betfair_sportsbook_basket.BetfairSportsbookBasketIndeterminateError) or "PLACE_INDETERMINATE" in reason:
            return with_reconciliation_context({
                "status": "UNKNOWN",
                "error_code": "BETFAIR_PLACE_INDETERMINATE",
                "reconciliation_required": True,
                "detail": reason,
            })
        raise HTTPException(
            422,
            {
                "error": "betfair_place_rejected",
                "reason": reason,
            }
        )


async def _place_pinnacle_via_service(
    arb: dict[str, Any],
    quote: dict[str, Any],
    *,
    stake: float,
    expected_odds: float,
) -> dict[str, Any]:
    if not PINNACLE_API_BASE:
        raise HTTPException(
            409,
            {
                "error": "pinnacle_place_unavailable",
                "reason": "PINNACLE_API_BASE is not configured",
            },
        )

    payload = _build_pinnacle_service_place_payload(
        arb,
        quote,
        stake=stake,
        expected_odds=expected_odds,
    )
    try:
        resp = await _pinnacle_service_post("/place", payload, scope="place", wait=True)
        try:
            body = resp.json()
        except Exception:
            body = {"body": resp.text}
        resp.raise_for_status()
    except _PinnacleClientRateLimited as exc:
        raise HTTPException(
            429,
            {
                "error": "pinnacle_place_rate_limited",
                "reason": exc.reason,
                "retry_after_seconds": exc.retry_after,
            },
            headers={"Retry-After": str(exc.retry_after)},
        ) from exc
    except httpx.HTTPStatusError as exc:
        try:
            body = exc.response.json()
        except Exception:
            body = {"error": exc.response.text}
        error_code, reason = _pinnacle_place_error_parts(body)
        # A 5xx after forwarding a place request is not proof that no wager
        # exists.  Keep the user's reserve until BIA reconciliation resolves it.
        if exc.response.status_code >= 500:
            return {
                "status": "UNKNOWN", "error_code": "PINNACLE_SERVICE_UNAVAILABLE",
                "reconciliation_required": True,
            }
        raise HTTPException(
            exc.response.status_code,
            {
                "error": "pinnacle_place_http_error",
                "reason": reason,
                "user_message": (
                    f"Pinnacle did not confirm the bet ({error_code}). "
                    "Balance was refunded in RobinArb; verify the price again before retrying."
                ),
                "pinnacle_error_code": error_code,
                "pinnacle_response": body,
            },
        ) from exc
    except Exception as exc:
        error_code = type(exc).__name__
        return {
            "status": "UNKNOWN", "error_code": "PINNACLE_SERVICE_REQUEST_UNKNOWN",
            "reconciliation_required": True,
        }

    status = str(body.get("status") or "").upper() if isinstance(body, dict) else ""
    if status in {"UNKNOWN", "PENDING"}:
        body["reconciliation_required"] = True
        return body
    if status != "PLACED":
        error_code, reason = _pinnacle_place_error_parts(body)
        raise HTTPException(
            409,
            {
                "error": "pinnacle_place_rejected",
                "reason": reason,
                "user_message": (
                    f"Pinnacle did not accept the bet ({error_code}). "
                    "Bet was not confirmed; verify the price again before retrying."
                ),
                "pinnacle_error_code": error_code,
                "pinnacle_response": body,
            },
        )
    return body


def _build_pinnacle_verify_payload(arb: dict) -> dict[str, Any]:
    selection = str(arb.get("bk1_selection") or arb.get("side1") or "").strip()
    market = str(arb.get("market") or "").strip()
    metadata = dict(arb.get("pinnacle_market_metadata") or {})
    is_primary_side = bool(arb.get("pinnacle_is_primary_side", True))
    if selection:
        reparsed_metadata = _parse_selection_market_metadata(selection, market, is_primary_side)
        for key, value in reparsed_metadata.items():
            if value not in (None, "") and key not in metadata:
                metadata[key] = value
    outcome = str(arb.get("bk1_outcome") or "").strip() or _infer_pinnacle_outcome(
        selection,
        market,
        is_primary_side,
        metadata,
    )
    payload: dict[str, Any] = {
        "outcome": outcome,
        "bookmaker2": "Pinnacle",
        "is_live": True,
        "expected_odds": float(arb.get("bk1_odds") or 0.0) or None,
    }
    event_id = _pinnacle_event_id_for_arb(arb)
    if event_id:
        payload["event_id"] = event_id
    if arb.get("bk2"):
        payload["bookmaker1"] = arb["bk2"]
    if arb.get("sport"):
        payload["sport_name"] = arb["sport"]
    if arb.get("pinnacle_selection_id"):
        payload["selection_id"] = arb["pinnacle_selection_id"]
    if arb.get("pinnacle_odds_id"):
        payload["odds_id"] = arb["pinnacle_odds_id"]
    if arb.get("pinnacle_line_id"):
        payload["line_id"] = arb["pinnacle_line_id"]
    if market:
        payload["market"] = market
    if selection:
        payload["selection"] = selection
    market_context = _arb_market_context(arb)
    if market_context:
        payload["market_context"] = market_context
        payload["market_context_label"] = _market_context_label(market_context)
    if metadata:
        payload["market_metadata"] = metadata
        for key in (
            "family",
            "line",
            "period_number",
            "set_number",
            "game_number",
            "team",
            "direction",
            "parity",
            "market_context",
            "market_context_label",
            "service_outcome",
            "stat_event_id",
        ):
            if key in metadata:
                payload[key] = metadata[key]
    return payload


def _normalize_verify_payload_for_service_outcome(
    payload: dict[str, Any],
    *,
    raw_selection: str,
    service_outcome: str | None,
) -> None:
    normalized_raw = str(raw_selection or "").strip().lower().replace("х", "x")
    moneyline_team: str | None = None
    if normalized_raw in {"1", "п1"}:
        moneyline_team = "1"
    elif normalized_raw in {"2", "п2"}:
        moneyline_team = "2"
    elif normalized_raw == "x":
        moneyline_team = "None"
    if moneyline_team is None:
        return

    payload["market"] = "Moneyline"
    payload["outcome"] = "WinNone" if moneyline_team == "None" else f"Win{moneyline_team}"
    payload["market_metadata"] = {
        "family": "Moneyline",
        "raw_selection": raw_selection,
        "team": moneyline_team,
    }
    for key in ("family", "line", "handicap", "direction", "period_number", "set_number", "game_number", "parity"):
        payload.pop(key, None)


def _normalize_outcome_core(value: str) -> str:
    normalized = re.sub(r"\s+", " ", str(value or "").strip().lower())
    normalized = re.sub(r"\bwin\s+([12])\b", r"win\1", normalized)
    normalized = re.sub(r"\bwin\s+(?:none|draw|x)\b", "winnone", normalized)
    normalized = normalized.replace("home team", "home").replace("away team", "away")
    normalized = re.sub(r"^(?:p\d+\s+)?(?:set\s+\d+\s+)?(?:game\s+\d+\s+)?", "", normalized)
    return normalized.strip()


_TEAM_OUTCOME_ALIASES = {
    "1": {"win1", "home", "1", "team 1", "player 1"},
    "2": {"win2", "away", "2", "team 2", "player 2"},
    "none": {"winnone", "draw", "x", "none"},
}


def _team_outcome_bucket(value: str) -> str | None:
    core = _normalize_outcome_core(value)
    for bucket, aliases in _TEAM_OUTCOME_ALIASES.items():
        if core in aliases:
            return bucket
    return None


def _normalize_market_name(value: str) -> str:
    compact = re.sub(r"[^a-z0-9]", "", str(value or "").strip().lower())
    aliases = {
        "1x2": "moneyline",
        "matchwinner": "moneyline",
        "moneyline": "moneyline",
        "gamewinner": "gamewinner",
        "setwinner": "setwinner",
        "totals": "totals",
        "total": "totals",
        "handicap": "handicap",
        "spreads": "handicap",
        "spread": "handicap",
        "oddeven": "oddeven",
        "evenodd": "oddeven",
    }
    return aliases.get(compact, compact)


def _metadata_team_applies(metadata: dict[str, Any], expected_market: str) -> bool:
    if _normalize_market_name(expected_market) != "totals":
        return True
    raw_selection = str(metadata.get("raw_selection") or "").strip().lower()
    if re.match(r"^(?:ит|it|cit|bkit)\s*[12]", raw_selection):
        return True
    return False


def _canonical_market_family(value: str) -> str | None:
    normalized = _normalize_market_name(value)
    for family in PINNACLE_MARKET_FAMILIES:
        if _normalize_market_name(family) == normalized:
            return family
    return None


def _outcome_matches_expected(expected_outcome: str, actual_outcome: str, metadata: dict[str, Any]) -> bool:
    expected_core = _normalize_outcome_core(expected_outcome)
    actual_core = _normalize_outcome_core(actual_outcome)
    if not expected_core or not actual_core:
        return False
    if actual_core == expected_core or expected_core.startswith(f"{actual_core} "):
        return True

    expected_bucket = _team_outcome_bucket(expected_outcome)
    actual_bucket = _team_outcome_bucket(actual_outcome)
    if expected_bucket and actual_bucket and expected_bucket == actual_bucket:
        return True

    direction = str(metadata.get("direction") or "").strip().lower()
    if direction and actual_core == direction and expected_core.startswith(direction):
        return True

    parity = str(metadata.get("parity") or "").strip().lower()
    if parity and actual_core == parity:
        return True

    team = str(metadata.get("team") or "").strip().lower()
    if team and actual_bucket == team:
        return True
    return False


def _result_metadata(result: dict[str, Any]) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for metadata_key in ("market_metadata", "marketMetadata"):
        nested = result.get(metadata_key)
        if not isinstance(nested, dict):
            continue
        for key, value in nested.items():
            if key not in merged or merged.get(key) in (None, ""):
                merged[key] = value
    return merged


def _identifier_metadata_from_parts(parts: list[str]) -> dict[str, Any]:
    if len(parts) < 6:
        return {}
    try:
        event_id = int(parts[0])
        period = int(parts[1])
        market_code = int(parts[2])
        designation_code = int(parts[3])
    except (TypeError, ValueError):
        return {}

    metadata: dict[str, Any] = {
        "event_id": event_id,
        "eventId": event_id,
        "period": period,
        "period_number": period,
        "periodNumber": period,
    }
    line = _to_float_or_none(parts[5] if len(parts) > 5 else None)
    if line is not None:
        metadata.update({"line": line, "handicap": line, "points": line})

    if market_code == 1:
        metadata.update({"market": "Moneyline", "family": "Moneyline"})
        if designation_code == 0:
            metadata.update({"team": "1", "side": "Win1", "outcome": "Win1"})
        elif designation_code == 1:
            metadata.update({"team": "2", "side": "Win2", "outcome": "Win2"})
        elif designation_code == 2:
            metadata.update({"team": "None", "side": "WinNone", "outcome": "WinNone"})
    elif market_code == 2:
        metadata.update({"market": "Handicap", "family": "Handicap"})
        if designation_code == 0:
            metadata.update({"team": "1", "side": "Win1"})
        elif designation_code == 1:
            metadata.update({"team": "2", "side": "Win2"})
    elif market_code == 3:
        metadata.update({"market": "Totals", "family": "Totals"})
        if designation_code == 3:
            metadata.update({"direction": "Over", "outcome": "Over"})
        elif designation_code == 4:
            metadata.update({"direction": "Under", "outcome": "Under"})
    elif market_code == 4:
        metadata.update({"market": "Totals", "family": "Totals", "team": "1"})
        if designation_code == 5:
            metadata.update({"direction": "Over", "outcome": "IT1> "})
        elif designation_code in {0, 6}:
            metadata.update({"direction": "Under", "outcome": "IT1< "})
    elif market_code == 5:
        metadata.update({"market": "Totals", "family": "Totals", "team": "2"})
        if designation_code == 7:
            metadata.update({"direction": "Over", "outcome": "IT2> "})
        elif designation_code in {1, 8}:
            metadata.update({"direction": "Under", "outcome": "IT2< "})
    return metadata


def _identifier_metadata_from_result(result: dict[str, Any]) -> dict[str, Any]:
    identifiers: list[str] = []
    nested_metadata = _result_metadata(result)
    for key in (*_PINNACLE_ODDS_ID_KEYS, *_PINNACLE_SELECTION_ID_KEYS):
        value = _clean_pinnacle_identifier(result.get(key)) or _clean_pinnacle_identifier(nested_metadata.get(key))
        if value and "|" in value:
            identifiers.append(value)

    merged: dict[str, Any] = {}
    for identifier in identifiers:
        parts = identifier.split("|")
        if len(parts) >= 8 and _to_int_or_none(parts[2]) is not None:
            parsed = _identifier_metadata_from_parts(parts[2:])
        else:
            parsed = _identifier_metadata_from_parts(parts)
        for key, value in parsed.items():
            if value not in (None, "") and key not in merged:
                merged[key] = value
    return merged


def _result_value(result: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = result.get(key)
        if value not in (None, ""):
            return value
    nested_metadata = _result_metadata(result)
    for key in keys:
        value = nested_metadata.get(key)
        if value not in (None, ""):
            return value
    identifier_metadata = _identifier_metadata_from_result(result)
    for key in keys:
        value = identifier_metadata.get(key)
        if value not in (None, ""):
            return value
    return None


def _to_int_or_none(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _to_float_or_none(value: Any) -> float | None:
    if value in (None, ""):
        return None
    if isinstance(value, str) and "," in value and "." not in value:
        value = value.replace(",", ".")
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _validated_fork_profit(reported: Any, odds1: float, odds2: float) -> float | None:
    """Return a sane two-way profit, correcting corrupted cached feed values."""
    if not (math.isfinite(odds1) and math.isfinite(odds2)) or odds1 < 1.01 or odds2 < 1.01:
        return None
    calculated = (1.0 / (1.0 / odds1 + 1.0 / odds2) - 1.0) * 100.0
    if not math.isfinite(calculated) or calculated > ROBINARB_FEED_MAX_PROFIT:
        return None
    reported_profit = _to_float_or_none(reported)
    if (
        reported_profit is None
        or reported_profit > ROBINARB_FEED_MAX_PROFIT
        or abs(reported_profit - calculated) > ROBINARB_FEED_PROFIT_MISMATCH_TOLERANCE
    ):
        return calculated
    return reported_profit


def _hidden_key_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _hidden_odds_text(value: Any) -> str:
    parsed = _to_float_or_none(value)
    return f"{parsed:.3f}" if parsed is not None else ""


def _arb_match_hide_key(arb: dict[str, Any]) -> str:
    for key in ("event_id", "pinnacle_hub_event_id"):
        value = str(arb.get(key) or "").strip()
        if value and value != "0":
            return f"evt:{value}"
    return "match:" + "|".join(
        _hidden_key_text(part)
        for part in (
            arb.get("sport"),
            arb.get("league"),
            arb.get("match"),
            arb.get("home"),
            arb.get("away"),
        )
    )


def _arb_fork_hide_key(arb: dict[str, Any]) -> str:
    stable = str(arb.get("id") or "").strip()
    if not stable:
        stable = "|".join(
            _hidden_key_text(part)
            for part in (
                arb.get("market"),
                arb.get("bk1_selection") or arb.get("side1"),
                arb.get("bk2_selection") or arb.get("side2"),
                arb.get("bk2"),
                _arb_match_hide_key(arb),
            )
        )
    return "fork:" + stable


def _hidden_item_id(username: str, scope: str, hide_key: str) -> str:
    payload = "\x1f".join((username, scope, hide_key))
    return hashlib.blake2s(payload.encode("utf-8"), digest_size=12).hexdigest()


def _hidden_item_from_arb(username: str, arb: dict[str, Any], scope: str) -> dict[str, Any]:
    now = time.time()
    match_key = _arb_match_hide_key(arb)
    hide_key = match_key if scope == "match" else _arb_fork_hide_key(arb)
    odds_label = " / ".join(
        part for part in (_hidden_odds_text(arb.get("bk1_odds")), _hidden_odds_text(arb.get("bk2_odds"))) if part
    )
    selection = " / ".join(
        part for part in (
            str(arb.get("bk1_selection") or arb.get("side1") or "").strip(),
            str(arb.get("bk2_selection") or arb.get("side2") or "").strip(),
        )
        if part
    )
    return {
        "id": _hidden_item_id(username, scope, hide_key),
        "scope": scope,
        "hide_key": hide_key,
        "match_key": match_key,
        "arb_id": str(arb.get("id") or ""),
        "match": str(arb.get("match") or ""),
        "sport": str(arb.get("sport") or ""),
        "market": str(arb.get("market") or ""),
        "selection": selection,
        "counter_bk": str(arb.get("bk2") or ""),
        "odds_label": odds_label,
        "created_at": now,
        "expires_at": now + ROBINARB_HIDDEN_ARBS_TTL,
    }


def _public_hidden_item(item: dict[str, Any]) -> dict[str, Any]:
    now = time.time()
    return {
        "id": item.get("id"),
        "scope": item.get("scope"),
        "arb_id": item.get("arb_id"),
        "match": item.get("match"),
        "sport": item.get("sport"),
        "market": item.get("market"),
        "selection": item.get("selection"),
        "counter_bk": item.get("counter_bk"),
        "odds_label": item.get("odds_label"),
        "created_at": item.get("created_at"),
        "expires_at": item.get("expires_at"),
        "ttl_sec": max(0, int(float(item.get("expires_at") or now) - now)),
    }


def _filter_hidden_arbs(arbs: list[dict[str, Any]], hidden_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not hidden_items:
        return arbs
    hidden_matches = {str(item.get("hide_key") or "") for item in hidden_items if item.get("scope") == "match"}
    hidden_forks = {str(item.get("hide_key") or "") for item in hidden_items if item.get("scope") == "fork"}
    if not hidden_matches and not hidden_forks:
        return arbs
    result = []
    for arb in arbs:
        if _arb_match_hide_key(arb) in hidden_matches:
            continue
        if _arb_fork_hide_key(arb) in hidden_forks:
            continue
        result.append(arb)
    return result


def _pinnacle_result_identifier(result: dict[str, Any], key: str) -> str | None:
    aliases = {
        "selection_id": _PINNACLE_SELECTION_ID_KEYS,
        "odds_id": _PINNACLE_ODDS_ID_KEYS,
        "line_id": _PINNACLE_LINE_ID_KEYS,
    }
    for alias in aliases.get(key, (key,)):
        value = _clean_pinnacle_identifier(result.get(alias))
        if value is not None:
            return value
    nested_metadata = _result_metadata(result)
    for alias in aliases.get(key, (key,)):
        value = _clean_pinnacle_identifier(nested_metadata.get(alias))
        if value is not None:
            return value
    return None


def _pinnacle_result_matches_request(payload: dict[str, Any], result: dict[str, Any]) -> bool:
    expected_ids = []
    for key in ("selection_id", "odds_id", "line_id"):
        expected = _clean_pinnacle_identifier(payload.get(key))
        if expected is None:
            continue
        expected_ids.append(key)
        actual = _pinnacle_result_identifier(result, key)
        if actual != expected:
            return False
    has_selection_specific_identifier = any(key in {"selection_id", "odds_id"} for key in expected_ids)
    if has_selection_specific_identifier:
        return True

    metadata = payload.get("market_metadata") if isinstance(payload.get("market_metadata"), dict) else {}
    expected_event = _to_int_or_none(payload.get("event_id")) or 0
    actual_event = _to_int_or_none(_result_value(result, ("event_id", "eventId"))) or 0
    if expected_event and actual_event and actual_event != expected_event and not has_selection_specific_identifier:
        return False
    if expected_event and not actual_event and not has_selection_specific_identifier:
        return False

    expected_outcome = str(payload.get("outcome") or "").strip().lower()
    actual_outcome = str(_result_value(result, ("outcome", "bet_type", "betType", "side")) or "").strip().lower()
    if expected_outcome and actual_outcome and not _outcome_matches_expected(expected_outcome, actual_outcome, metadata):
        return False
    if expected_outcome and not actual_outcome and not has_selection_specific_identifier:
        return False

    expected_market = str(payload.get("market") or metadata.get("family") or "").strip().lower()
    actual_market = str(_result_value(result, ("market", "market_type", "marketType", "family", "market_family", "marketFamily")) or "").strip().lower()
    if expected_market and actual_market and _normalize_market_name(actual_market) != _normalize_market_name(expected_market):
        return False
    if expected_market and not actual_market and not has_selection_specific_identifier:
        return False
    result_text_metadata = _parse_selection_market_metadata(
        actual_outcome,
        _canonical_market_family(expected_market) or expected_market,
        True,
    ) if actual_outcome else {}

    comparable_fields = (
        ("line", ("line", "handicap", "points")),
        ("period_number", ("period_number", "periodNumber", "period_num", "periodNum", "period")),
        ("set_number", ("set_number", "setNumber", "set")),
        ("game_number", ("game_number", "gameNumber", "game")),
        ("team", ("team", "side")),
        ("direction", ("direction",)),
        ("parity", ("parity",)),
    )
    for metadata_key, result_keys in comparable_fields:
        if metadata_key == "team" and not _metadata_team_applies(metadata, expected_market):
            continue
        expected_value = metadata.get(metadata_key)
        actual_value = _result_value(result, result_keys)
        if metadata_key != "team" and actual_value in (None, ""):
            actual_value = result_text_metadata.get(metadata_key)
        if expected_value in (None, ""):
            continue
        if metadata_key == "team" and actual_value in (None, "", 0):
            expected_team = str(expected_value).strip().lower()
            if _team_outcome_bucket(actual_outcome) == expected_team:
                continue
        if metadata_key == "team" and actual_value not in (None, "", 0):
            expected_team = str(expected_value).strip().lower()
            actual_team = _team_outcome_bucket(str(actual_value)) or str(actual_value).strip().lower()
            if actual_team == expected_team:
                continue
            return False
        if metadata_key in {"direction", "parity"} and actual_value in (None, ""):
            expected_core = str(expected_value).strip().lower()
            actual_core = _normalize_outcome_core(actual_outcome)
            if actual_core == expected_core or actual_core.startswith(f"{expected_core} "):
                continue
        if actual_value in (None, ""):
            if has_selection_specific_identifier:
                continue
            return False
        if metadata_key == "line":
            expected_line = _to_float_or_none(expected_value)
            actual_line = _to_float_or_none(actual_value)
            if expected_line is not None and actual_line is not None:
                if abs(expected_line - actual_line) <= ROBINARB_ODDS_TOLERANCE:
                    continue
                return False
        if str(actual_value).strip().lower() != str(expected_value).strip().lower():
            return False
    return True


def _payload_selection_specific_ids(payload: dict[str, Any]) -> dict[str, str | None]:
    return {
        "selection_id": _clean_pinnacle_identifier(payload.get("selection_id")),
        "odds_id": _clean_pinnacle_identifier(payload.get("odds_id")),
    }


def _payload_any_pin_ids(payload: dict[str, Any]) -> dict[str, str | None]:
    return {
        "selection_id": _clean_pinnacle_identifier(payload.get("selection_id")),
        "odds_id": _clean_pinnacle_identifier(payload.get("odds_id")),
        "line_id": _clean_pinnacle_identifier(payload.get("line_id")),
    }


def _stream_lookup_binding_is_trusted(payload: dict[str, Any], lookup: dict[str, Any]) -> bool:
    matched_by = str(lookup.get("matched_by") or "").strip().lower()
    selection_specific = any(_payload_selection_specific_ids(payload).values())
    any_expected_id = any(_payload_any_pin_ids(payload).values())
    if selection_specific:
        return matched_by in {"id", "id+selection"}
    if any_expected_id:
        return matched_by == "id+selection"
    return matched_by == "selection"


def _two_leg_profit_pct(primary_odds: Any, counter_odds: Any) -> float | None:
    primary = _to_float_or_none(primary_odds)
    counter = _to_float_or_none(counter_odds)
    if primary is None or counter is None or primary <= 1 or counter <= 1:
        return None
    inv_sum = (1.0 / primary) + (1.0 / counter)
    if inv_sum <= 0:
        return None
    return (1.0 / inv_sum - 1.0) * 100.0


def _untrusted_pinnacle_quote_suspicion(
    arb: dict[str, Any],
    current_odds: float,
    payload: dict[str, Any],
    result: dict[str, Any] | None = None,
) -> str | None:
    # If Forted/Pinnacle gave us a pre-known selection/odds id and the result
    # matched it, the quote is outcome-bound. Without that, large moves are
    # treated as unsafe rather than "verified": better to miss a live move than
    # to accidentally price the opposite side.
    if any(_payload_selection_specific_ids(payload).values()):
        return None

    metadata = payload.get("market_metadata") if isinstance(payload.get("market_metadata"), dict) else {}
    exact_tennis_game = (
        _canonical_market_family(str(metadata.get("family") or payload.get("market") or "")) == "Game Winner"
        and _to_int_or_none(metadata.get("set_number")) is not None
        and _to_int_or_none(metadata.get("game_number")) is not None
        and str(metadata.get("team") or "").strip() in {"1", "2"}
        and re.fullmatch(r"P\d+\s+[12]G\s+\d+", str(payload.get("outcome") or "").strip()) is not None
    )
    if exact_tennis_game:
        # BIA's tgame,set,game,side serializer binds the quote more precisely
        # than a generic selection id. Large in-game moves are legitimate and
        # must update the calculator instead of being mistaken for an opposite
        # side quote.
        return None
    resolved_tennis_game = (
        _canonical_market_family(str(metadata.get("family") or payload.get("market") or "")) == "Game Winner"
        and isinstance(result, dict)
        and str(result.get("source") or "").strip().lower() == "bia_placer"
        and _to_int_or_none(metadata.get("game_number")) is not None
        and _to_int_or_none(_result_value(result, ("set_number", "setNumber"))) is not None
        and _to_int_or_none(_result_value(result, ("game_number", "gameNumber")))
            == _to_int_or_none(metadata.get("game_number"))
        and str(_result_value(result, ("team", "side")) or "").strip()
            == str(metadata.get("team") or "").strip()
    )
    if resolved_tennis_game:
        # The gateway discovered the sole live tgame set offered by pin88 and
        # mirrored the resolved set/game/team in the result.
        return None

    feed_odds = _to_float_or_none(arb.get("bk1_odds"))
    if feed_odds is not None and feed_odds > 1 and current_odds > 1:
        drift_ratio = abs(current_odds - feed_odds) / feed_odds
        if (
            drift_ratio > ROBINARB_VERIFY_MAX_UNTRUSTED_ODDS_DRIFT_RATIO
            and abs(current_odds - feed_odds) > 0.25
        ):
            return (
                "Suspicious Pinnacle quote ignored: current odds "
                f"{current_odds:.3f} differ too much from Forted odds {feed_odds:.3f} "
                "without a pre-known selection/odds id."
            )

    implied_profit = _two_leg_profit_pct(current_odds, arb.get("bk2_odds"))
    feed_profit = _to_float_or_none(arb.get("profit_pct"))
    if implied_profit is not None and implied_profit > ROBINARB_VERIFY_MAX_UNTRUSTED_ARB_PCT:
        if feed_profit is None or implied_profit - feed_profit > ROBINARB_VERIFY_MAX_UNTRUSTED_ARB_DELTA_PCT:
            return (
                "Suspicious Pinnacle quote ignored: it would imply "
                f"{implied_profit:.2f}% two-leg profit without a pre-known selection/odds id."
            )
    return None


_DRAW_PRONE_MONEYLINE_SPORT_RE = re.compile(r"\b(?:soccer|football|futsal)\b|футбол|футзал", re.IGNORECASE)


def _is_draw_prone_moneyline_arb(arb: dict[str, Any]) -> bool:
    if _normalize_market_name(str(arb.get("market") or "")) != "moneyline":
        return False
    sport_text = " ".join(
        str(arb.get(key) or "")
        for key in ("sport", "league", "bk1_event_name", "bk2_event_name")
    )
    return bool(_DRAW_PRONE_MONEYLINE_SPORT_RE.search(sport_text))


def _canonical_quote_metadata_value(key: str, value: Any) -> Any:
    if value in (None, ""):
        return None
    if key == "line":
        numeric = _to_float_or_none(value)
        if numeric is not None:
            return format(numeric, ".12g")
    return str(value).strip().lower()


_QUOTE_BINDING_METADATA_IGNORE_KEYS = {
    "effective_ps3838_params",
    "pinnacle_actual_handicap",
    "pinnacle_away",
    "pinnacle_home",
    "pinnacle_lookup_matched_by",
    "pinnacle_reversed",
    "raw_stake_types",
    "requested_ps3838_params",
    "source_index",
}


def _quote_binding_snapshot_from_payload(payload: dict[str, Any]) -> dict[str, Any]:
    raw_metadata = payload.get("market_metadata") if isinstance(payload.get("market_metadata"), dict) else {}
    metadata = _normalize_market_metadata_keys(raw_metadata)
    return {
        "event_id": _to_int_or_none(payload.get("event_id")) or None,
        "market": str(payload.get("market") or "").strip().lower(),
        "outcome": str(payload.get("outcome") or "").strip().lower(),
        "market_metadata": {
            key: _canonical_quote_metadata_value(key, metadata.get(key))
            for key in sorted(str(key) for key in metadata.keys())
            if key not in _QUOTE_BINDING_METADATA_IGNORE_KEYS
        },
        "current_ids": {
            "selection_id": _clean_pinnacle_identifier(payload.get("selection_id")),
            "odds_id": _clean_pinnacle_identifier(payload.get("odds_id")),
            "line_id": _clean_pinnacle_identifier(payload.get("line_id")),
        },
    }


def _quote_binding_digest(snapshot: dict[str, Any]) -> str:
    return json.dumps(snapshot, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _normalize_market_metadata_keys(metadata: dict[str, Any]) -> dict[str, Any]:
    aliases = {
        "marketFamily": "family",
        "market_family": "family",
        "periodNumber": "period_number",
        "period_num": "period_number",
        "periodNum": "period_number",
        "setNumber": "set_number",
        "gameNumber": "game_number",
    }
    normalized: dict[str, Any] = {}
    for key, value in metadata.items():
        normalized_key = aliases.get(str(key), str(key))
        if normalized_key not in normalized or normalized.get(normalized_key) in (None, ""):
            normalized[normalized_key] = value
    return normalized


def _issue_verified_quote(
    username: str,
    arb_id: str,
    odds: float,
    payload: dict[str, Any],
    result: dict[str, Any],
    ttl_sec: float | None = None,
    arb_snapshot: dict[str, Any] | None = None,
) -> str:
    quote_id = secrets.token_urlsafe(18)
    now = time.time()
    binding_snapshot = _quote_binding_snapshot_from_payload(payload)
    payload_metadata = payload.get("market_metadata") if isinstance(payload.get("market_metadata"), dict) else {}
    ttl = ROBINARB_VERIFIED_ODDS_TTL if ttl_sec is None else max(1.0, float(ttl_sec))
    quote = {
        "user": username,
        "arb_id": arb_id,
        "odds": odds,
        "event_id": binding_snapshot["event_id"],
        "market": payload.get("market"),
        "market_metadata": dict(payload.get("market_metadata") or {}),
        "outcome": payload.get("outcome"),
        "service_outcome": payload.get("service_outcome") or payload_metadata.get("service_outcome"),
        "market_context": payload.get("market_context") or payload_metadata.get("market_context"),
        "parent_event_id": payload.get("parent_event_id") or payload_metadata.get("parent_event_id"),
        "binding_snapshot": binding_snapshot,
        "current_ids": dict(binding_snapshot["current_ids"]),
        "selection_id": payload.get("selection_id"),
        "odds_id": payload.get("odds_id"),
        "line_id": payload.get("line_id"),
        "verified_selection_id": _pinnacle_result_identifier(result, "selection_id"),
        "verified_odds_id": _pinnacle_result_identifier(result, "odds_id"),
        "verified_line_id": _pinnacle_result_identifier(result, "line_id"),
        "verified_event_id": _to_int_or_none(_result_value(result, ("event_id", "eventId"))),
        "verified_market": _result_value(result, ("market", "market_type", "marketType")),
        "expires_at": now + ttl,
    }
    if isinstance(arb_snapshot, dict):
        quote["arb_snapshot"] = dict(arb_snapshot)
    with _verified_quotes_lock:
        for existing_id, existing_quote in list(_verified_quotes.items()):
            if float(existing_quote.get("expires_at") or 0) <= now:
                del _verified_quotes[existing_id]
        _verified_quotes[quote_id] = quote
    return quote_id


def _consume_verified_quote(username: str, arb_id: str, quote_id: str | None) -> dict[str, Any] | None:
    if not quote_id:
        return None
    now = time.time()
    with _verified_quotes_lock:
        quote = _verified_quotes.get(quote_id)
        if not quote:
            return None
        if quote.get("user") != username or quote.get("arb_id") != arb_id:
            return None
        if float(quote.get("expires_at") or 0) <= now:
            _verified_quotes.pop(quote_id, None)
            return None
        return dict(quote)


def _verified_quote_matches_current_arb(quote: dict[str, Any], arb: dict[str, Any]) -> bool:
    payload = _build_pinnacle_verify_payload(arb)
    expected_snapshot = quote.get("binding_snapshot")
    quote_metadata = quote.get("market_metadata") if isinstance(quote.get("market_metadata"), dict) else {}
    quote_context = str(quote.get("market_context") or quote_metadata.get("market_context") or "").strip()
    if quote_context:
        current_event_id = _to_int_or_none(payload.get("event_id"))
        quote_event_id = _to_int_or_none(quote.get("event_id"))
        parent_event_id = _to_int_or_none(quote.get("parent_event_id")) or _to_int_or_none(quote_metadata.get("parent_event_id"))
        if quote_event_id and current_event_id in {quote_event_id, parent_event_id}:
            payload["event_id"] = quote_event_id
        if parent_event_id:
            payload["parent_event_id"] = parent_event_id
        if quote_metadata:
            payload_metadata = payload.get("market_metadata") if isinstance(payload.get("market_metadata"), dict) else {}
            payload["market_metadata"] = {**payload_metadata, **quote_metadata}

    quoted_outcome = str(quote.get("outcome") or "").strip()
    if quoted_outcome:
        payload["outcome"] = quoted_outcome
    quoted_service_outcome = str(quote.get("service_outcome") or quote_metadata.get("service_outcome") or "").strip()
    if quoted_service_outcome:
        payload["service_outcome"] = quoted_service_outcome

    id_snapshot = quote.get("current_ids") if isinstance(quote.get("current_ids"), dict) else {}
    for key in ("selection_id", "odds_id", "line_id"):
        quoted_id = _clean_pinnacle_identifier(id_snapshot.get(key)) or _clean_pinnacle_identifier(quote.get(key))
        if quoted_id:
            payload[key] = quoted_id

    if not isinstance(expected_snapshot, dict):
        id_snapshot = quote.get("current_ids") if isinstance(quote.get("current_ids"), dict) else {
            "selection_id": quote.get("selection_id"),
            "odds_id": quote.get("odds_id"),
            "line_id": quote.get("line_id"),
        }
        expected_snapshot = _quote_binding_snapshot_from_payload({
            "event_id": quote.get("event_id"),
            "market": quote.get("market"),
            "market_metadata": quote.get("market_metadata"),
            "outcome": quote.get("outcome"),
            "selection_id": id_snapshot.get("selection_id"),
            "odds_id": id_snapshot.get("odds_id"),
            "line_id": id_snapshot.get("line_id"),
        })
    current_snapshot = _quote_binding_snapshot_from_payload(payload)
    return secrets.compare_digest(_quote_binding_digest(expected_snapshot), _quote_binding_digest(current_snapshot))


def _stream_quote_cache_key(payload: dict[str, Any]) -> str:
    return hashlib.blake2s(
        _quote_binding_digest(_quote_binding_snapshot_from_payload(payload)).encode("utf-8"),
        digest_size=12,
    ).hexdigest()


def _stream_quote_result_from_lookup(lookup: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "event_id": lookup.get("event_id") or payload.get("event_id"),
        "market": payload.get("market"),
        "outcome": payload.get("outcome"),
        "selection_id": _clean_pinnacle_identifier(payload.get("selection_id"))
            or _clean_pinnacle_identifier(lookup.get("selection_id")),
        "odds_id": _clean_pinnacle_identifier(payload.get("odds_id"))
            or _clean_pinnacle_identifier(lookup.get("odds_id")),
        "line_id": _clean_pinnacle_identifier(payload.get("line_id"))
            or _clean_pinnacle_identifier(lookup.get("line_id")),
        "market_metadata": dict(payload.get("market_metadata") or {}),
        "source": "pinnacle-stream",
        "snapshot_ts": lookup.get("snapshot_ts"),
    }


def _stream_lookup_raw_selection(arb: dict[str, Any], payload: dict[str, Any]) -> str:
    metadata = payload.get("market_metadata") if isinstance(payload.get("market_metadata"), dict) else {}
    return str(
        metadata.get("raw_selection")
        or payload.get("selection")
        or arb.get("bk1_selection")
        or arb.get("side1")
        or ""
    ).strip()


def _standard_pinnacle_service_outcome(raw_selection: str, period: int) -> str | None:
    return _forted_translate_outcome(raw_selection, period) if raw_selection else None


def _stream_lookup_period(payload: dict[str, Any]) -> int:
    metadata = payload.get("market_metadata") if isinstance(payload.get("market_metadata"), dict) else {}
    # Forted reports tennis set markets as set_number without repeating the
    # period in raw_selection. Arcadia models Set N as period N.
    for value in (metadata.get("period_number"), metadata.get("set_number"), payload.get("period")):
        parsed = _to_int_or_none(value)
        if parsed is not None:
            return parsed
    return 0


async def _enrich_betslip_payload_from_more_bet(
    arb: dict[str, Any],
    verify_payload: dict[str, Any],
    bet_payload: dict[str, Any],
    *,
    raw_selection: str,
    period: int,
) -> dict[str, Any] | None:
    if _clean_pinnacle_identifier(bet_payload.get("line_id")):
        return None

    event_id = arb.get("pinnacle_hub_event_id") or bet_payload.get("event_id") or verify_payload.get("event_id")
    if not event_id:
        return None
    forted_home, forted_away = _forted_team_names_for_pinnacle(arb)

    lookup = await pinnacle_hub.lookup_more_bet_price(
        sport_label=str(arb.get("sport") or bet_payload.get("sport") or verify_payload.get("sport_name") or ""),
        event_id=event_id,
        raw_selection=raw_selection,
        market=str(verify_payload.get("market") or arb.get("market") or ""),
        outcome=str(verify_payload.get("outcome") or arb.get("bk1_outcome") or ""),
        period=period,
        market_context=_arb_market_context(arb),
        forted_home=forted_home,
        forted_away=forted_away,
        expected_decimal_odds=arb.get("bk1_odds"),
    )
    if not lookup:
        return None

    line_id = _clean_pinnacle_identifier(lookup.get("line_id"))
    if not line_id:
        return None

    resolved_event_id = _to_int_or_none(lookup.get("event_id")) or _to_int_or_none(event_id)
    parent_event_id = _to_int_or_none(lookup.get("parent_event_id")) or _to_int_or_none(event_id)
    standard_outcome = _standard_pinnacle_service_outcome(raw_selection, period)
    if isinstance(verify_payload.get("market_metadata"), dict):
        metadata = dict(verify_payload["market_metadata"])
    elif isinstance(arb.get("pinnacle_market_metadata"), dict):
        metadata = dict(arb["pinnacle_market_metadata"])
    else:
        metadata = {}
    if resolved_event_id and resolved_event_id != _to_int_or_none(event_id):
        arb["pinnacle_stat_event_id"] = resolved_event_id
        metadata["stat_event_id"] = resolved_event_id
        metadata["parent_event_id"] = parent_event_id
        metadata["market_context"] = str(lookup.get("market_context") or _arb_market_context(arb) or "")
        if standard_outcome:
            metadata["service_outcome"] = standard_outcome
            arb["pinnacle_service_outcome"] = standard_outcome
        arb["pinnacle_market_metadata"] = metadata
        verify_payload["market_metadata"] = dict(metadata)
        bet_payload["market_metadata"] = dict(metadata)
        verify_payload["event_id"] = resolved_event_id
        verify_payload["parent_event_id"] = parent_event_id
        bet_payload["event_id"] = resolved_event_id
        bet_payload["parent_event_id"] = parent_event_id
    if standard_outcome and _arb_market_context(arb):
        bet_payload["outcome"] = standard_outcome
        bet_payload["service_outcome"] = standard_outcome
        verify_payload["service_outcome"] = standard_outcome
    verify_payload["line_id"] = line_id
    bet_payload["line_id"] = line_id
    is_alt = _to_int_or_none(lookup.get("is_alt"))
    if is_alt is not None:
        bet_payload["is_alt"] = is_alt
    actual_handicap = _to_float_or_none(lookup.get("actual_handicap"))
    odds_id_handicap = _to_float_or_none(lookup.get("handicap"))
    if odds_id_handicap is not None:
        bet_payload["handicap"] = odds_id_handicap
        verify_payload["handicap"] = odds_id_handicap
    elif actual_handicap is not None:
        odds_id_handicap = actual_handicap
        bet_payload["handicap"] = actual_handicap
        verify_payload["handicap"] = actual_handicap
    metadata["pinnacle_home"] = lookup.get("home")
    metadata["pinnacle_away"] = lookup.get("away")
    metadata["pinnacle_reversed"] = bool(lookup.get("reversed"))
    metadata["pinnacle_actual_handicap"] = actual_handicap
    metadata["pinnacle_lookup_matched_by"] = lookup.get("matched_by")
    metadata["requested_ps3838_params"] = lookup.get("requested_params") if isinstance(lookup.get("requested_params"), dict) else None
    metadata["effective_ps3838_params"] = {
        "period": lookup.get("period", period),
        "bet_type": lookup.get("bet_type"),
        "team_select": lookup.get("team_select"),
        "handicap": odds_id_handicap if odds_id_handicap is not None else bet_payload.get("handicap", 0),
        "is_alt": is_alt or 0,
    }
    arb["pinnacle_market_metadata"] = metadata
    verify_payload["market_metadata"] = dict(metadata)
    bet_payload["market_metadata"] = dict(metadata)

    selection_ids = _build_ps3838_selection_ids(
        event_id=resolved_event_id or event_id,
        period=lookup.get("period", period),
        bet_type=lookup.get("bet_type"),
        team_select=lookup.get("team_select"),
        is_alt=is_alt or 0,
        handicap=odds_id_handicap if odds_id_handicap is not None else bet_payload.get("handicap", 0),
        line_id=line_id,
    )
    if selection_ids:
        bet_payload.update(selection_ids)
        verify_payload.update(selection_ids)
    return lookup


def _stream_quote_payload_from_lookup(
    arb: dict[str, Any],
    payload: dict[str, Any],
    lookup: dict[str, Any],
) -> dict[str, Any] | None:
    source = str(arb.get("_source") or _arbs_source or "").strip()
    if source not in {"forted", "listener"}:
        return None

    stream_odds = _to_float_or_none(lookup.get("decimal_odds"))
    if stream_odds is None or stream_odds <= 1:
        return None
    feed_odds = _to_float_or_none(arb.get("bk1_odds"))
    updated_at = _to_float_or_none(arb.get("updated_at"))
    result = _stream_quote_result_from_lookup(lookup, payload)
    raw_selection = _stream_lookup_raw_selection(arb, payload)
    robin_cache_event_id = str(lookup.get("event_id") or arb.get("pinnacle_hub_event_id") or arb.get("event_id") or "").strip()
    robin_odds = robin_margin.robin_odds_for(
        stream_odds,
        str(arb.get("pinnacle_hub_event_id") or lookup.get("event_id") or "").strip() or None,
        str(arb.get("sport") or ""),
        raw_selection,
        cache_key=robin_margin.stream_cache_key(
            robin_cache_event_id or None,
            str(arb.get("sport") or ""),
            raw_selection,
            str(arb.get("market") or payload.get("market") or ""),
        ),
        price_signature=str(lookup.get("market_signature") or ""),
    )
    base: dict[str, Any] = {
        "verified": True,
        "status": "OK",
        "current_odds": stream_odds,
        "feed_odds": feed_odds,
        "selection": arb.get("bk1_selection"),
        "outcome": result.get("outcome"),
        "source": "pinnacle-stream",
        "timestamp": time.time(),
        "detail": f"Pinnacle price taken from {lookup.get('slug') or 'hub'} stream snapshot",
        "live_place_supported": False,
        "event_id": result.get("event_id"),
        "selection_id": result.get("selection_id"),
        "odds_id": result.get("odds_id"),
        "line_id": result.get("line_id"),
        "quote_id": None,
        "market_metadata": dict(payload.get("market_metadata") or arb.get("pinnacle_market_metadata") or {}),
        "feed_updated_at": updated_at,
        "cache_ttl_sec": ROBINARB_PINNACLE_STREAM_QUOTE_TTL,
        "result_status": "STREAM",
        "stream_lookup": {
            key: lookup.get(key)
            for key in (
                "slug",
                "matched_by",
                "snapshot_ts",
                "period",
                "market_code",
                "designation_code",
                "points",
                "market_signature",
            )
        },
    }
    if robin_odds is not None and robin_odds > 1:
        base["robin_odds"] = round(robin_odds, 3)
    return base


async def _arcadia_quote_payload(
    arb: dict[str, Any],
    payload: dict[str, Any],
) -> dict[str, Any] | None:
    """Resolve an exact current quote from Pinnacle's public Arcadia API."""
    if _arb_market_context(arb):
        return None
    event_id = _pinnacle_event_id_for_arb(arb)
    if not event_id:
        return None
    metadata = payload.get("market_metadata") if isinstance(payload.get("market_metadata"), dict) else {}
    raw_selection = _stream_lookup_raw_selection(arb, payload)
    if not raw_selection:
        return None
    home, away = _forted_team_names_for_pinnacle(arb)
    if not (home and away):
        return None
    try:
        quote = await asyncio.to_thread(
            pinnacle_arcadia.lookup_pinnacle,
            sport_label=str(arb.get("sport") or payload.get("sport_name") or payload.get("sport") or ""),
            home=home,
            away=away,
            market_family=str(payload.get("market") or arb.get("market") or ""),
            bk1_outcome=str(payload.get("outcome") or arb.get("bk1_outcome") or ""),
            line=_to_float_or_none(metadata.get("line")),
            period=_stream_lookup_period(payload),
            live_only=_arb_is_live(arb),
            raw_selection=raw_selection,
            matchup_id=event_id,
            period_explicit=any(
                metadata.get(key) not in (None, "")
                for key in ("period_number", "set_number")
            ),
        )
    except Exception as exc:  # noqa: BLE001 - public quote failure falls through to stream
        log.debug("Arcadia quote failed for %s: %s", arb.get("id"), exc)
        return None
    current_odds = _to_float_or_none((quote or {}).get("decimal_odds"))
    if not quote or current_odds is None or current_odds <= 1:
        return None
    return {
        "verified": True,
        "status": "OK",
        "current_odds": current_odds,
        "feed_odds": _to_float_or_none(arb.get("bk1_odds")),
        "selection": arb.get("bk1_selection"),
        "outcome": payload.get("outcome") or arb.get("bk1_outcome"),
        "source": "pinnacle-arcadia",
        "timestamp": time.time(),
        "detail": (
            "Pinnacle public API verified "
            f"{quote.get('market_type')} / {quote.get('designation')} / {quote.get('points')}"
        ),
        "live_place_supported": False,
        "event_id": quote.get("matchup_id"),
        "parent_event_id": event_id,
        "selection_id": None,
        "odds_id": None,
        "line_id": None,
        "market_key": quote.get("market_key"),
        "market_margin": quote.get("market_margin"),
        "market_type": quote.get("market_type"),
        "designation": quote.get("designation"),
        "points": quote.get("points"),
        "period": quote.get("period"),
        "period_inferred": bool(quote.get("period_inferred")),
        "reversed": bool(quote.get("reversed")),
        "matched_home": quote.get("matched_home"),
        "matched_away": quote.get("matched_away"),
        "market_metadata": dict(metadata),
        "result_status": "ARCADIA",
        "cache_ttl_sec": pinnacle_arcadia.EVENT_CACHE_TTL_SEC,
        "quote_id": None,
    }


async def _cached_stream_quote_payload(arb: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any] | None:
    source = str(arb.get("_source") or _arbs_source or "").strip()
    if source not in {"forted", "listener"}:
        return None
    if _arb_market_context(arb):
        return None

    arcadia = await _arcadia_quote_payload(arb, payload)
    if arcadia is not None:
        return arcadia

    key = _stream_quote_cache_key(payload)
    now = time.time()

    with _stream_quotes_lock:
        for existing_key, cached_value in list(_stream_quote_cache.items()):
            if now - float(cached_value.get("_cached_at") or 0) > ROBINARB_PINNACLE_STREAM_QUOTE_TTL:
                del _stream_quote_cache[existing_key]

        cached = _stream_quote_cache.get(key)
        if cached and now - float(cached.get("_cached_at") or 0) <= ROBINARB_PINNACLE_STREAM_QUOTE_TTL:
            cached_odds = _to_float_or_none(cached.get("current_odds"))
            if cached_odds is not None and cached_odds > 1:
                response = {k: v for k, v in cached.items() if not k.startswith("_")}
                response["timestamp"] = now
                response["cached"] = True
                response["cache_age_sec"] = round(now - float(cached.get("_cached_at") or now), 3)
                return response

    stream_event_id = arb.get("pinnacle_hub_event_id") or payload.get("event_id") or arb.get("event_id")
    try:
        lookup = await pinnacle_hub.lookup_stream_price(
            sport_label=str(arb.get("sport") or payload.get("sport_name") or payload.get("sport") or ""),
            event_id=stream_event_id,
            raw_selection=_stream_lookup_raw_selection(arb, payload),
            market=str(payload.get("market") or arb.get("market") or ""),
            outcome=str(payload.get("outcome") or arb.get("bk1_outcome") or ""),
            selection_id=payload.get("selection_id") or arb.get("pinnacle_selection_id"),
            odds_id=payload.get("odds_id") or arb.get("pinnacle_odds_id"),
            line_id=payload.get("line_id") or arb.get("pinnacle_line_id"),
            period=_stream_lookup_period(payload),
            reverse_teams=_pinnacle_stream_teams_reversed(arb),
        )
    except Exception as exc:  # noqa: BLE001 - Arcadia may already have failed; keep quote failure isolated
        log.debug("Pinnacle stream quote failed for %s: %s", arb.get("id"), exc)
        return None
    if lookup is None:
        return None
    if not _stream_lookup_binding_is_trusted(payload, lookup):
        return None
    fresh = _stream_quote_payload_from_lookup(arb, payload, lookup)
    if fresh is None:
        return None
    suspicious_detail = _untrusted_pinnacle_quote_suspicion(
        arb,
        _to_float_or_none(fresh.get("current_odds")) or 0.0,
        payload,
    )
    if suspicious_detail:
        log.warning(
            "stream quote rejected as suspicious: arb=%s event=%s detail=%s lookup=%s",
            arb.get("id"),
            arb.get("pinnacle_hub_event_id") or arb.get("event_id"),
            suspicious_detail,
            {key: lookup.get(key) for key in ("matched_by", "slug", "event_id", "line_id", "odds_id")},
        )
        return None
    with _stream_quotes_lock:
        _stream_quote_cache[key] = {**fresh, "_cached_at": time.time()}
    return dict(fresh)


async def _stream_quote_response(
    username: str,
    arb_id: str,
    arb: dict[str, Any],
    payload: dict[str, Any],
) -> dict[str, Any] | None:
    response = await _cached_stream_quote_payload(arb, payload)
    if response is None:
        return None
    stream_odds = _to_float_or_none(response.get("current_odds"))
    if stream_odds is None or stream_odds <= 1:
        return None
    quote_id = _issue_verified_quote(
        username,
        arb_id,
        stream_odds,
        payload,
        {
            "event_id": response.get("event_id"),
            "market": response.get("market"),
            "outcome": response.get("outcome"),
            "selection_id": response.get("selection_id"),
            "odds_id": response.get("odds_id"),
            "line_id": response.get("line_id"),
            "market_metadata": dict(response.get("market_metadata") or {}),
        },
        ttl_sec=min(ROBINARB_VERIFIED_ODDS_TTL, ROBINARB_PINNACLE_STREAM_QUOTE_TTL),
        arb_snapshot=arb,
    )
    response["quote_id"] = quote_id
    arb["last_verified_pinnacle_odds"] = stream_odds
    arb["last_verified_pinnacle_at"] = time.time()
    arb["last_verified_payload"] = {k: v for k, v in response.items() if k != "quote_id"}
    return response


def _verify_mode(value: str | None) -> str:
    if value in {"demo", "stream", "betslip"}:
        return value
    return "stream" if ROBINARB_VERIFY_PINNACLE_STREAM_FIRST else "betslip"


def _calculator_verify_control(
    username: str,
    arb_id: str,
    client_id: str | None,
    verify_mode: str,
    verify_scope: str | None,
) -> dict[str, Any] | None:
    if verify_scope != "calculator" or verify_mode != "betslip":
        return None

    now = time.time()
    clean_client_id = str(client_id or "").strip()[:96]
    if not clean_client_id:
        return {
            "verified": False,
            "status": "CALCULATOR_LOCKED",
            "current_odds": None,
            "feed_odds": None,
            "selection": None,
            "source": "calculator-guard",
            "timestamp": now,
            "detail": "Calculator session is missing; choose fork again.",
            "live_place_supported": False,
            "quote_id": None,
            "calculator_guard": True,
        }

    expires_in = ROBINARB_CALCULATOR_VERIFY_WINDOW_SEC
    lock_ttl = min(expires_in, ROBINARB_CALCULATOR_VERIFY_LOCK_SEC)
    with _calculator_verify_lock:
        for claim_user, claim in list(_calculator_verify_claims.items()):
            if now - float(claim.get("updated_at") or claim.get("started_at") or 0) > lock_ttl:
                _calculator_verify_claims.pop(claim_user, None)

        claim = _calculator_verify_claims.get(username)
        if claim and now - float(claim.get("started_at") or 0) > expires_in:
            if claim.get("client_id") == clean_client_id:
                _calculator_verify_claims.pop(username, None)
                return {
                    "verified": False,
                    "status": "CALCULATOR_EXPIRED",
                    "current_odds": None,
                    "feed_odds": None,
                    "selection": None,
                    "source": "calculator-guard",
                    "timestamp": now,
                    "detail": "Please choose fork again.",
                    "live_place_supported": False,
                    "quote_id": None,
                    "calculator_guard": True,
                    "expired": True,
                }
            _calculator_verify_claims.pop(username, None)
            claim = None

        if claim and claim.get("client_id") != clean_client_id:
            last_heartbeat = float(claim.get("updated_at") or claim.get("started_at") or 0)
            if now - last_heartbeat <= lock_ttl:
                return {
                    "verified": False,
                    "status": "CALCULATOR_LOCKED",
                    "current_odds": None,
                    "feed_odds": None,
                    "selection": None,
                    "source": "calculator-guard",
                    "timestamp": now,
                    "detail": "Calculator betslip check is active in another tab.",
                    "live_place_supported": False,
                    "quote_id": None,
                    "calculator_guard": True,
                    "active_arb_id": claim.get("arb_id"),
                    "expires_in_sec": max(0, int(last_heartbeat + lock_ttl - now)),
                }
            _calculator_verify_claims.pop(username, None)
            claim = None

        if not claim or claim.get("arb_id") != arb_id or claim.get("client_id") != clean_client_id:
            _calculator_verify_claims[username] = {
                "arb_id": arb_id,
                "client_id": clean_client_id,
                "started_at": now,
                "updated_at": now,
            }
        else:
            claim["updated_at"] = now
    return None


def _demo_verify_response(arb: dict[str, Any]) -> dict[str, Any]:
    odds = _to_float_or_none(arb.get("bk1_odds")) or 0.0
    robin_odds = _to_float_or_none(arb.get("robin_odds"))
    payload = {
        "verified": True,
        "status": "OK",
        "current_odds": odds,
        "feed_odds": odds,
        "selection": arb.get("bk1_selection"),
        "outcome": arb.get("bk1_outcome"),
        "source": "demo-feed",
        "timestamp": time.time(),
        "detail": "Demo mode: Pinnacle basket verification skipped",
        "live_place_supported": False,
        "selection_id": _clean_pinnacle_identifier(arb.get("pinnacle_selection_id")),
        "odds_id": _clean_pinnacle_identifier(arb.get("pinnacle_odds_id")),
        "line_id": _clean_pinnacle_identifier(arb.get("pinnacle_line_id")),
        "quote_id": None,
        "market_metadata": dict(arb.get("pinnacle_market_metadata") or {}),
        "result_status": "DEMO",
        "demo": True,
    }
    if robin_odds is not None and robin_odds > 1:
        payload["robin_odds"] = robin_odds
    return payload


def _forted_parse_message(raw: bytes) -> dict:
    """Parse incoming relay message for surebets/fork data.
    
    Real Forted frame format (each fork is a block):
      surebets®{timestamp}®SB=;{sport};{profit};...  (first fork header+SB combined)
      ST={side1};{side2}
      S={event_name};{bookmaker_domain};
      M={player1_ru};{player2_ru};{date};{player1_en};{player2_en};...
      MOBL={link_or_id}
      S=...;{bookmaker2};
      M=...
      MOBL=...
      INF=...
      LIF=...
      SB=;{sport};{profit};...  (next fork)
      ...
    """
    sep = "\xae"
    try:
        txt = raw.decode("utf-8", errors="replace")
    except Exception:
        txt = raw.decode("cp1251", errors="replace")

    lines = txt.replace("\r\n", "\n").split("\n")
    result = {"timestamp": None, "fork_count": None, "surebets_frame": False, "bookmakers": [], "forks": []}

    current_fork = None
    current_source = None

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Header: surebets®timestamp®SB=...
        if line.startswith("surebets"):
            result["surebets_frame"] = True
            parts = line.split(sep)
            if len(parts) >= 2:
                result["timestamp"] = parts[1]
            if len(parts) >= 3 and "SB=" not in parts[2]:
                result["fork_count"] = parts[2]
            # Extract SB= from the same line
            if "SB=" in line:
                sb_part = line[line.index("SB="):]
                current_fork = {"SB": sb_part, "sources": [], "ST": ""}
                current_source = None
            continue

        # Free-tier status frames contain bookmaker activity lines like:
        # leonbets.ru=Леон;1;0;17.04.2026 16:49:48;;1
        if (
            "=" in line
            and not line.startswith(("AddNames=", "BetNames=", "BetEquals=", "SB=", "ST=", "S=", "M=", "MOBL=", "INF=", "LIF="))
        ):
            domain, _, payload = line.partition("=")
            if "." in domain and payload:
                parts = payload.split(";")
                result["bookmakers"].append(
                    {
                        "domain": domain.strip(),
                        "name": (parts[0].strip() if parts else "") or domain.strip(),
                        "active": len(parts) > 1 and parts[1].strip() == "1",
                        "commission": parts[2].strip() if len(parts) > 2 else "",
                        "updated_at": parts[3].strip() if len(parts) > 3 else "",
                        "currency": parts[4].strip() if len(parts) > 4 else "",
                        "enabled": len(parts) > 5 and parts[5].strip() == "1",
                    }
                )
            continue

        # New fork block
        if line.startswith("SB="):
            result["surebets_frame"] = True
            if current_fork:
                result["forks"].append(current_fork)
            current_fork = {"SB": line, "sources": [], "ST": ""}
            current_source = None
            continue

        if not current_fork:
            continue

        # Market/sides
        if line.startswith("ST="):
            current_fork["ST"] = line[3:]
            continue

        # Source (bookmaker + event)
        if line.startswith("S="):
            parts = line[2:].split(";")
            bk = ""
            event = parts[0] if parts else ""
            # Bookmaker is the second field (domain)
            if len(parts) >= 2:
                bk = parts[1].strip()
            current_source = {"event": event, "bk": bk, "match": "", "mobl": "", "lif": ""}
            current_fork["sources"].append(current_source)
            continue

        # Match details (players)
        if line.startswith("M=") and current_source is not None:
            parts = line[2:].split(";")
            # M= has: ru_name1;ru_name2;date;en_name1;en_name2;...
            if len(parts) >= 5:
                en1 = parts[3].strip()
                en2 = parts[4].strip()
                if en1 and en2:
                    current_source["match"] = f"{en1} vs {en2}"
                elif parts[0].strip() and parts[1].strip():
                    current_source["match"] = f"{parts[0].strip()} vs {parts[1].strip()}"
            elif len(parts) >= 2 and parts[0].strip():
                current_source["match"] = f"{parts[0].strip()} vs {parts[1].strip()}"
            continue

        # Mobile link
        if line.startswith("MOBL=") and current_source is not None:
            current_source["mobl"] = line[5:]
            continue

        if line.startswith("LIF=") and current_source is not None:
            current_source["lif"] = line[4:]
            continue

    if current_fork:
        result["forks"].append(current_fork)
    return result


def _fork_to_arb(fork: dict, idx: int) -> dict | None:
    """Convert a Forted fork dict to our arb format.
    
    SB= fields (semicolon-separated):
      [0]=SB=  [1]=sport  [2]=profit%  [3]=timestamp  [4-9]=flags
      [10]=odds1  [11]=odds2  [12-15]=extra  [16]=event_id  ...
    """
    try:
        sb = fork.get("SB", "")
        parts = sb.split(";")
        if len(parts) < 12:
            return None

        now = time.time()
        source_updated_at = _parse_feed_timestamp(parts[3] if len(parts) > 3 else None)
        if source_updated_at is None:
            return None
        if now - source_updated_at > ROBINARB_FEED_STALE_AFTER or source_updated_at - now > ROBINARB_FEED_FUTURE_SKEW:
            return None

        # Sport: "Теннис - ITF - Женщины" -> extract base sport
        sport_full = parts[1] if len(parts) > 1 else ""
        sport_base = sport_full.split(" - ")[0].strip() if sport_full else ""
        sport = _translate_sport_label(sport_base)

        # Odds
        try:
            odds1 = float(parts[10].replace(",", ".")) if parts[10] else 0
            odds2 = float(parts[11].replace(",", ".")) if parts[11] else 0
        except (ValueError, TypeError, IndexError):
            odds1, odds2 = 0, 0

        if odds1 < 1.01 or odds2 < 1.01:
            return None
        profit_str = parts[2] if len(parts) > 2 else None
        profit_pct = _validated_fork_profit(profit_str, odds1, odds2)
        if profit_pct is None:
            return None

        # Sources (bookmakers + match names)
        sources = fork.get("sources", [])
        bk1_name = sources[0].get("bk", "") if len(sources) > 0 else ""
        bk2_name = sources[1].get("bk", "") if len(sources) > 1 else ""
        
        # Match name from M= lines
        match1 = sources[0].get("match", "") if len(sources) > 0 else ""
        match2 = sources[1].get("match", "") if len(sources) > 1 else ""
        match_name = match1 or match2 or f"Event #{idx}"

        # MOBL links for direct URLs
        mobl1 = sources[0].get("mobl", "") if len(sources) > 0 else ""
        mobl2 = sources[1].get("mobl", "") if len(sources) > 1 else ""
        lif1 = sources[0].get("lif", "") if len(sources) > 0 else ""
        lif2 = sources[1].get("lif", "") if len(sources) > 1 else ""

        # Determine which is Pinnacle
        is_pin1 = "pinnacle" in bk1_name.lower()
        is_pin2 = "pinnacle" in bk2_name.lower()

        if not is_pin1 and not is_pin2:
            return None

        if is_pin1:
            pin_odds, counter_odds = odds1, odds2
            counter_bk = bk2_name
            pin_mobl, counter_mobl = mobl1, mobl2
            pin_lif = lif1
        else:
            pin_odds, counter_odds = odds2, odds1
            counter_bk = bk1_name
            pin_mobl, counter_mobl = mobl2, mobl1
            pin_lif = lif2

        # Event ID from SB fields
        event_id = 0
        if len(parts) > 16:
            try:
                event_id = int(parts[16])
            except (ValueError, TypeError):
                pass

        market, source1_side, source2_side, market_details = _derive_market_details(fork.get("ST", ""))

        pin_hub_event_id = robin_margin.extract_event_id(pin_mobl) or _pinnacle_event_id_from_link(pin_mobl)
        robin_odds = robin_margin.fallback_by_odds(pin_odds)
        if counter_odds > 1 and robin_odds > 1:
            robin_profit_pct = (1 / (1 / robin_odds + 1 / counter_odds) - 1) * 100
            pin_profit_pct = (1 / (1 / pin_odds + 1 / counter_odds) - 1) * 100
            robin_profit_pct = profit_pct + (robin_profit_pct - pin_profit_pct)
        else:
            robin_profit_pct = 0

        if is_pin1:
            pin_selection, counter_selection = source1_side, source2_side
            pinnacle_is_primary_side = True
        else:
            pin_selection, counter_selection = source2_side, source1_side
            pinnacle_is_primary_side = False

        pin_market_metadata = _parse_selection_market_metadata(pin_selection, market, pinnacle_is_primary_side)
        pin_market_metadata.update(
            {
                "raw_stake_types": fork.get("ST", ""),
                "source_index": 1 if is_pin1 else 2,
            }
        )
        raw_legacy_segments = [seg.strip() for seg in str(fork.get("ST", "")).split(";") if seg.strip()]
        if raw_legacy_segments:
            raw_pin_segment = raw_legacy_segments[0] if is_pin1 else (raw_legacy_segments[1] if len(raw_legacy_segments) > 1 else raw_legacy_segments[0])
            if raw_pin_segment:
                pin_market_metadata["raw_selection"] = raw_pin_segment
        for key, value in market_details.items():
            pin_market_metadata.setdefault(key, value)
        pin_outcome = _infer_pinnacle_outcome(
            pin_selection,
            market,
            pinnacle_is_primary_side,
            pin_market_metadata,
        )

        pin_selection_id = _extract_pinnacle_selection_id(pin_mobl)
        pin_odds_id = _extract_pinnacle_odds_id(pin_mobl)
        raw_lif_id = _clean_pinnacle_identifier(pin_lif)
        if raw_lif_id and not re.fullmatch(r"[A-Za-z0-9_-]+", raw_lif_id):
            raw_lif_id = None
        pin_line_id = _extract_pinnacle_line_id(pin_mobl) or _extract_pinnacle_line_id(pin_lif) or raw_lif_id
        pin_raw_id = _extract_raw_pinnacle_identifier(pin_mobl)
        has_pin_identifier = bool(pin_selection_id or pin_odds_id or pin_line_id)

        # Build URLs. Forted may send either full URLs or bookmaker-relative
        # paths such as "/1631732605" / "3/1510003/..."; preserve those paths.
        bk1_url = _build_deep_bookmaker_url(pin_mobl, "pinnacle.com")
        bk2_url = _build_deep_bookmaker_url(counter_mobl, counter_bk)

        # Split match name
        if " vs " in match_name:
            home, away = match_name.split(" vs ", 1)
        elif " - " in match_name:
            home, away = match_name.split(" - ", 1)
        else:
            home, away = match_name, ""

        # Live flag — Forted relay encodes is_live in parts[6]/parts[7]
        # (values "1"/"0"). Best-effort detection; fallback True for relays
        # that only ship live forks anyway.
        is_live_flag = True
        for live_idx in (6, 7, 8):
            if len(parts) > live_idx:
                val = (parts[live_idx] or "").strip()
                if val in {"0", "false", "False"}:
                    is_live_flag = False
                    break
                if val in {"1", "true", "True"}:
                    is_live_flag = True
                    break
        direct_score = str(fork.get("score") or "").strip()
        direct_match_time = str(fork.get("match_time") or "").strip()
        pin_event_name = (
            str(sources[0].get("event_name") or sources[0].get("event_bk") or "").strip()
            if len(sources) > 0 and is_pin1 else
            str(sources[1].get("event_name") or sources[1].get("event_bk") or "").strip()
            if len(sources) > 1 else ""
        )
        counter_event_name = (
            str(sources[1].get("event_name") or sources[1].get("event_bk") or "").strip()
            if len(sources) > 1 and is_pin1 else
            str(sources[0].get("event_name") or sources[0].get("event_bk") or "").strip()
            if len(sources) > 0 else ""
        )
        market_context = _market_context_from_text(pin_event_name, counter_event_name, sport_full)
        market_context_label = _market_context_label(market_context)
        if market_context:
            pin_market_metadata["market_context"] = market_context
            pin_market_metadata["market_context_label"] = market_context_label
        if _forted_live_activity_hint(direct_score, direct_match_time):
            is_live_flag = True
        pin_url_home, pin_url_away = _forted_team_names_for_pinnacle({
            "home": home,
            "away": away,
            "team1_en": str(fork.get("team1_en") or "").strip(),
            "team2_en": str(fork.get("team2_en") or "").strip(),
        })
        bk1_url = _build_pinnacle_compact_stats_url(
            raw_link=pin_mobl,
            sport=sport,
            event_name=pin_event_name,
            league=sport_full,
            home=pin_url_home,
            away=pin_url_away,
            event_id=pin_hub_event_id or event_id,
        )
        bk2_url = _build_deep_bookmaker_url(
            counter_mobl,
            counter_bk,
            is_live=is_live_flag,
            sport=sport,
            league=sport_full,
            event_name=counter_event_name,
            home=str(fork.get("team1_en") or home or "").strip(),
            away=str(fork.get("team2_en") or away or "").strip(),
        )
        betfair_fields = (
            _betfair_link_fields(counter_mobl, bk2_url, {
                "bk2": counter_bk,
                "sport": sport,
                "league": sport_full,
                "bk2_event_name": counter_event_name,
                "home": home,
                "away": away,
                "team1_en": str(fork.get("team1_en") or "").strip(),
                "team2_en": str(fork.get("team2_en") or "").strip(),
            })
            if betfair_executor.is_betfair_bookmaker(counter_bk) or betfair_executor.is_betfair_bookmaker(counter_mobl)
            else {}
        )
        counter_navigation_fields = _counter_navigation_fields({
            "bk2": counter_bk,
            "bk2_url": bk2_url,
            "bk2_raw_link": counter_mobl,
        })

        return {
            "id": _stable_arb_id(event_id, market, pin_selection, counter_selection, counter_bk),
            "sport": sport,
            "league": sport_full,
            "match": match_name,
            "home": home.strip(),
            "away": away.strip(),
            "market": market,
            "side1": pin_selection,
            "side2": counter_selection,
            "bk1_selection": pin_selection,
            "bk2_selection": counter_selection,
            "bk1_outcome": pin_outcome,
            "pinnacle_is_primary_side": pinnacle_is_primary_side,
            "pinnacle_source_index": 1 if is_pin1 else 2,
            "pinnacle_market_metadata": pin_market_metadata,
            "pinnacle_selection_id": pin_selection_id,
            "pinnacle_odds_id": pin_odds_id,
            "pinnacle_line_id": pin_line_id,
            "pinnacle_raw_id": pin_raw_id,
            "pinnacle_place_supported": has_pin_identifier,
            "_source": "forted",
            "bk1": "Pinnacle",
            "bk1_odds": round(pin_odds, 3),
            "bk2": counter_bk,
            "bk2_odds": round(counter_odds, 3),
            "robin_odds": round(robin_odds, 3),
            "profit_pct": round(profit_pct, 2),
            "robin_profit_pct": round(robin_profit_pct, 2),
            "age_sec": 0,
            "event_id": event_id,
            "pinnacle_hub_event_id": pin_hub_event_id,
            "is_live": is_live_flag,
            "market_context": market_context,
            "market_context_label": market_context_label,
            "display_market": _display_market_with_context(market, "", market_context),
            "bk1_event_name": pin_event_name,
            "bk2_event_name": counter_event_name,
            "bk1_url": bk1_url,
            "bk1_raw_link": pin_mobl,
            "bk2_url": bk2_url,
            "bk2_raw_link": counter_mobl,
            **counter_navigation_fields,
            **betfair_fields,
            "updated_at": source_updated_at,
        }
    except Exception as e:
        log.warning(f"Failed to parse fork #{idx}: {e}")
        return None


def _derive_market_details(st: str) -> tuple[str, str, str, dict[str, Any]]:
    market = "Moneyline"
    source1_side, source2_side = "Home", "Away"
    if not st:
        return market, source1_side, source2_side, {"family": market}

    st_parts = st.split(";")
    if len(st_parts) >= 2:
        source1_side = _translate_selection_text(st_parts[0] or "1")
        source2_side = _translate_selection_text(st_parts[1] or "2")

    st_lower = st.lower()
    if (
        "тм" in st_lower
        or "тб" in st_lower
        or "ит1" in st_lower
        or "ит2" in st_lower
        or "total" in st_lower
        or "over" in st_lower
        or "under" in st_lower
    ):
        market = "Totals"
    elif "ф1" in st_lower or "ф2" in st_lower or "фора" in st_lower or "handicap" in st_lower:
        market = "Handicap"
    elif "чёт" in st_lower or "нечёт" in st_lower or re.search(r"\b(?:odd|even)\b", st_lower):
        market = "Odd/Even"
    elif "гейм" in st_lower or "game" in st_lower:
        market = "Game Winner"
    elif "сет" in st_lower or "set" in st_lower:
        market = "Set Winner"

    source_metadata = _parse_selection_market_metadata(source1_side, market, True)
    for key, value in _parse_selection_market_metadata(source2_side, market, False).items():
        source_metadata.setdefault(key, value)
    source_metadata["family"] = market
    return market, source1_side, source2_side, source_metadata


def _derive_market_and_sides(st: str) -> tuple[str, str, str]:
    market, source1_side, source2_side, _metadata = _derive_market_details(st)
    return market, source1_side, source2_side


def _feed_iso_z(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _list_item(values: Any, idx: int) -> Any:
    if not isinstance(values, list) or idx >= len(values):
        return None
    return values[idx]


def _stable_feed_event_id(match_key: str) -> int:
    if not match_key:
        return 0
    digest = hashlib.blake2b(match_key.encode("utf-8"), digest_size=4).digest()
    return int.from_bytes(digest, "big") & 0x7FFFFFFF


def _state_fork_to_feed_fork(fork: dict[str, Any], idx: int) -> dict[str, Any] | None:
    """Translate Rust/Python Forted SSE state fork into RobinArb feed_fork wire."""
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
    coef1 = _to_float_or_none(_list_item(odds, 0)) or _to_float_or_none(fork.get("coef1"))
    coef2 = _to_float_or_none(_list_item(odds, 1)) or _to_float_or_none(fork.get("coef2"))
    if coef1 is None or coef2 is None or coef1 < 1.01 or coef2 < 1.01:
        return None

    if "pinnacle" not in bk1.lower() and "pinnacle" not in bk2.lower():
        return None

    last_seen = _to_float_or_none(fork.get("last_seen")) or time.time()
    team1 = str(fork.get("team1") or fork.get("team1_en") or s0.get("team1") or s0.get("team1_en") or "")
    team2 = str(fork.get("team2") or fork.get("team2_en") or s0.get("team2") or s0.get("team2_en") or "")
    event_name = f"{team1} vs {team2}" if team1 and team2 else (team1 or team2 or str(s0.get("event_name") or f"Event #{idx}"))

    is_live_raw = fork.get("is_live")
    if isinstance(is_live_raw, bool):
        is_live = "1" if is_live_raw else "0"
    else:
        is_live_str = str(is_live_raw or "0").strip().lower()
        is_live = "0" if is_live_str in {"0", "", "false", "no", "prematch"} else "1"

    match_key = str(fork.get("match_key") or "")
    server_name = str(fork.get("server") or "").strip()
    reported_profit = _to_float_or_none(fork.get("profit")) or 0.0
    profit_capped = False
    if reported_profit == 0.0:
        if coef1 > 1.0 and coef2 > 1.0:
            reported_profit = (1.0 / (1.0 / coef1 + 1.0 / coef2) - 1.0) * 100.0
        else:
            profit_capped = server_name in FORTED_NEGATIVE_LANE_SERVERS
    event_id = fork.get("inf_event_id") or fork.get("event_id") or _stable_feed_event_id(match_key)
    return {
        "fork_timestamp": _feed_iso_z(last_seen),
        "timestamp": _feed_iso_z(last_seen),
        "updated_at": last_seen,
        "sport": str(fork.get("sport") or ""),
        "profit": reported_profit,
        "profit_capped": profit_capped,
        "profit_range_min": -3.0 if profit_capped else None,
        "profit_range_max": 0.0 if profit_capped else None,
        "odds1": coef1,
        "odds2": coef2,
        "bk1": bk1,
        "bk2": bk2,
        "event_name": event_name,
        "stake_types": str(fork.get("stakes") or fork.get("stake_types") or ""),
        "bk1_link": str(s0.get("bet_link") or s0.get("mobl") or ""),
        "bk2_link": str(s1.get("bet_link") or s1.get("mobl") or ""),
        "event_id": event_id,
        "is_live": is_live,
        "score": fork.get("score") or "",
        "event_dt": fork.get("event_dt") or "",
        "server": server_name,
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
        "market_code": fork.get("market_code") or "",
        "market_hint": fork.get("market_hint"),
        "clone_count": fork.get("clone_count"),
        "match_time": fork.get("match_time") or "",
        "sport_id": fork.get("sport_id"),
        "inf_event_id": fork.get("inf_event_id"),
        "set_number": fork.get("set_number"),
        "game_number": fork.get("game_number"),
        "time_to_start_estimate_secs": fork.get("time_to_start_estimate_secs"),
        "bk1_label": s0.get("bk_label") or s0.get("bk") or "",
        "bk2_label": s1.get("bk_label") or s1.get("bk") or "",
    }


def _state_payload_to_feed_forks(payload: dict[str, Any]) -> list[dict[str, Any]]:
    forks_in = payload.get("forks") if isinstance(payload, dict) else None
    if not isinstance(forks_in, list):
        raise ValueError("SSE state payload must contain forks list")

    bk_status = payload.get("bk_status") if isinstance(payload.get("bk_status"), dict) else {}
    out: list[dict[str, Any]] = []
    for idx, fork in enumerate(forks_in):
        if not isinstance(fork, dict):
            continue
        feed_fork = _state_fork_to_feed_fork(fork, idx)
        if feed_fork is None:
            continue
        if bk_status:
            bk1 = str(feed_fork.get("bk1") or "")
            bk2 = str(feed_fork.get("bk2") or "")
            feed_fork["bk1_online"] = bk_status.get(bk1)
            feed_fork["bk2_online"] = bk_status.get(bk2)
        out.append(feed_fork)
    return out


def _parse_feed_timestamp(value: Any) -> float | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        timestamp = float(value)
        if timestamp > 10_000_000_000:
            timestamp = timestamp / 1000
        return timestamp
    raw = str(value).strip()
    if not raw:
        return None
    try:
        return _parse_feed_timestamp(float(raw))
    except ValueError:
        pass
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()
    except ValueError:
        pass
    for date_format in ("%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M"):
        try:
            parsed = datetime.strptime(raw, date_format).replace(tzinfo=timezone.utc)
            return parsed.timestamp()
        except ValueError:
            continue
    return None


def _feed_fork_to_arb(fork: dict[str, Any], idx: int) -> dict | None:
    try:
        now = time.time()
        timestamp_value = None
        for timestamp_key in ("fork_timestamp", "timestamp", "updated_at"):
            value = fork.get(timestamp_key)
            if value not in (None, ""):
                timestamp_value = value
                break
        source_updated_at = _parse_feed_timestamp(timestamp_value)
        if source_updated_at is None:
            return None
        if now - source_updated_at > ROBINARB_FEED_STALE_AFTER or source_updated_at - now > ROBINARB_FEED_FUTURE_SKEW:
            return None

        sport_full = str(fork.get("sport") or "")
        sport_base = sport_full.split(" - ", 1)[0].strip() if sport_full else ""
        sport = _translate_sport_label(sport_base)

        odds1 = _to_float_or_none(fork.get("odds1")) or 0.0
        odds2 = _to_float_or_none(fork.get("odds2")) or 0.0
        profit_capped = bool(fork.get("profit_capped"))
        if odds1 < 1.01 or odds2 < 1.01:
            return None
        profit_pct = _validated_fork_profit(fork.get("profit"), odds1, odds2)
        if profit_pct is None:
            return None
        if profit_capped:
            profit_capped = False

        bk1_name = str(fork.get("bk1") or "")
        bk2_name = str(fork.get("bk2") or "")
        is_pin1 = "pinnacle" in bk1_name.lower()
        is_pin2 = "pinnacle" in bk2_name.lower()
        if not is_pin1 and not is_pin2:
            return None

        match_name = str(fork.get("event_name") or f"Event #{idx}")
        stake_types = str(fork.get("stake_types") or "")
        market, source1_side, source2_side, market_details = _derive_market_details(stake_types)
        incoming_market_metadata_raw = _result_metadata(fork)
        market_code = str(fork.get("market_code") or "").strip()
        market_scope = "" if "market_code" not in fork else "full"
        for key, value in _forted_market_code_metadata(market_code, sport_full).items():
            incoming_market_metadata_raw.setdefault(key, value)
        if incoming_market_metadata_raw.get("set_number") is not None:
            market_scope = "set"
        elif incoming_market_metadata_raw.get("game_number") is not None:
            market_scope = "game"
        elif incoming_market_metadata_raw.get("period_number") is not None:
            market_scope = str(incoming_market_metadata_raw.get("period_type") or "period")
        for coordinate in ("set_number", "game_number"):
            coordinate_value = _to_int_or_none(fork.get(coordinate))
            if coordinate_value is not None:
                incoming_market_metadata_raw.setdefault(coordinate, coordinate_value)
        incoming_market_metadata = _normalize_market_metadata_keys(incoming_market_metadata_raw)
        incoming_family = _canonical_market_family(str(incoming_market_metadata.get("family") or ""))
        if incoming_family:
            market = incoming_family

        if is_pin1:
            pin_odds, counter_odds = odds1, odds2
            pin_selection, counter_selection = source1_side, source2_side
            counter_bk = bk2_name
            pin_link = str(fork.get("bk1_link") or "")
            counter_link = str(fork.get("bk2_link") or "")
            pin_prefix = "bk1"
            pinnacle_is_primary_side = True
        else:
            pin_odds, counter_odds = odds2, odds1
            pin_selection, counter_selection = source2_side, source1_side
            counter_bk = bk1_name
            pin_link = str(fork.get("bk2_link") or "")
            counter_link = str(fork.get("bk1_link") or "")
            pin_prefix = "bk2"
            pinnacle_is_primary_side = False

        pin_market_metadata = _parse_selection_market_metadata(pin_selection, market, pinnacle_is_primary_side)
        pin_market_metadata.update(
            {
                "raw_stake_types": stake_types,
                "source_index": 1 if is_pin1 else 2,
            }
        )
        raw_stake_segments = [seg.strip() for seg in stake_types.split(";") if seg.strip()]
        if raw_stake_segments:
            raw_pin_segment = raw_stake_segments[0] if is_pin1 else (raw_stake_segments[1] if len(raw_stake_segments) > 1 else raw_stake_segments[0])
            if raw_pin_segment:
                pin_market_metadata["raw_selection"] = raw_pin_segment
        for key, value in market_details.items():
            pin_market_metadata.setdefault(key, value)
        for key, value in incoming_market_metadata.items():
            if value not in (None, ""):
                pin_market_metadata[key] = value
        pin_market_metadata["family"] = market
        pin_outcome = _infer_pinnacle_outcome(
            pin_selection,
            market,
            pinnacle_is_primary_side,
            pin_market_metadata,
        )

        pin_selection_id = _feed_identifier(
            fork,
            pin_prefix,
            _PINNACLE_SELECTION_ID_KEYS,
            pin_link,
        ) or _extract_pinnacle_selection_id(pin_link)
        pin_odds_id = _feed_identifier(fork, pin_prefix, _PINNACLE_ODDS_ID_KEYS, pin_link)
        pin_line_id = _feed_identifier(fork, pin_prefix, _PINNACLE_LINE_ID_KEYS, pin_link)
        pin_raw_id = _extract_raw_pinnacle_identifier(pin_link)
        has_pin_identifier = bool(pin_selection_id or pin_odds_id or pin_line_id)

        event_id_raw = str(fork.get("event_id") or "").strip()
        try:
            event_id = int(event_id_raw) if event_id_raw else 0
        except ValueError:
            event_id = 0

        pin_hub_event_id = robin_margin.extract_event_id(pin_link) or _pinnacle_event_id_from_link(pin_link)
        robin_odds = robin_margin.fallback_by_odds(pin_odds)
        if counter_odds > 1 and robin_odds > 1:
            robin_profit_pct = (1 / (1 / robin_odds + 1 / counter_odds) - 1) * 100
            pin_profit_pct = (1 / (1 / pin_odds + 1 / counter_odds) - 1) * 100
            robin_profit_pct = profit_pct + (robin_profit_pct - pin_profit_pct)
        else:
            robin_profit_pct = 0

        if " vs " in match_name:
            home, away = match_name.split(" vs ", 1)
        elif " - " in match_name:
            home, away = match_name.split(" - ", 1)
        else:
            home, away = match_name, ""

        raw_is_live = fork.get("is_live")
        if isinstance(raw_is_live, bool):
            is_live_flag = raw_is_live
        elif raw_is_live is None or raw_is_live == "":
            is_live_flag = True
        else:
            is_live_flag = str(raw_is_live).strip().lower() in {"1", "true", "yes", "live"}

        overvalue_raw = fork.get("overvalue") or fork.get("ov_array") or []
        overvalue = []
        if isinstance(overvalue_raw, list):
            for value in overvalue_raw:
                try:
                    overvalue.append(int(value))
                except (TypeError, ValueError):
                    continue
        pin_source_index = 0 if is_pin1 else 1
        counter_source_index = 1 if is_pin1 else 0
        pin_overvalue = overvalue[pin_source_index] if pin_source_index < len(overvalue) else None
        counter_overvalue = overvalue[counter_source_index] if counter_source_index < len(overvalue) else None
        market_name = str(fork.get("market_name") or "").strip()
        match_time = str(fork.get("match_time") or "").strip()
        server_name = str(fork.get("server") or "").strip()
        score = str(fork.get("score") or "").strip()
        pin_event_name = str(fork.get(f"{pin_prefix}_event_name") or "").strip()
        counter_event_name = str(fork.get("bk2_event_name" if is_pin1 else "bk1_event_name") or "").strip()
        market_context = _market_context_from_text(
            pin_event_name, counter_event_name, sport_full, market_name, market_code,
        )
        market_context_label = _market_context_label(market_context)
        if market_context:
            pin_market_metadata["market_context"] = market_context
            pin_market_metadata["market_context_label"] = market_context_label
        event_dt = str(fork.get("event_dt") or "").strip()
        if _forted_live_activity_hint(score, match_time):
            is_live_flag = True
        pin_url_home, pin_url_away = _forted_team_names_for_pinnacle({
            "home": home,
            "away": away,
            "team1_en": str(fork.get("team1_en") or "").strip(),
            "team2_en": str(fork.get("team2_en") or "").strip(),
        })
        bk1_url = _build_pinnacle_compact_stats_url(
            raw_link=pin_link,
            sport=sport,
            event_name=pin_event_name,
            league=str(fork.get("sport") or ""),
            home=pin_url_home,
            away=pin_url_away,
            event_id=pin_hub_event_id or _pinnacle_event_id_from_link(pin_link) or event_id,
        )
        bk2_url = _build_deep_bookmaker_url(
            counter_link,
            counter_bk,
            is_live=is_live_flag,
            sport=sport,
            league=sport_full,
            event_name=counter_event_name,
            home=str(fork.get("team1_en") or home or "").strip(),
            away=str(fork.get("team2_en") or away or "").strip(),
        )
        betfair_fields = (
            _betfair_link_fields(counter_link, bk2_url, {
                "bk2": counter_bk,
                **fork,
                "sport": sport,
                "league": sport_full,
                "bk2_event_name": counter_event_name,
                "home": home,
                "away": away,
            })
            if betfair_executor.is_betfair_bookmaker(counter_bk) or betfair_executor.is_betfair_bookmaker(counter_link)
            else {}
        )
        counter_navigation_fields = _counter_navigation_fields({
            "bk2": counter_bk,
            "bk2_url": bk2_url,
            "bk2_raw_link": counter_link,
        })

        return {
            "id": _stable_arb_id(event_id, market, pin_selection, counter_selection, counter_bk),
            "sport": sport,
            "league": sport_full,
            "match": match_name,
            "home": home.strip(),
            "away": away.strip(),
            "market": market,
            "side1": pin_selection,
            "side2": counter_selection,
            "bk1_selection": pin_selection,
            "bk2_selection": counter_selection,
            "bk1_outcome": pin_outcome,
            "pinnacle_is_primary_side": pinnacle_is_primary_side,
            "pinnacle_source_index": 1 if is_pin1 else 2,
            "pinnacle_market_metadata": pin_market_metadata,
            "pinnacle_selection_id": pin_selection_id,
            "pinnacle_odds_id": pin_odds_id,
            "pinnacle_line_id": pin_line_id,
            "pinnacle_raw_id": pin_raw_id,
            "pinnacle_place_supported": has_pin_identifier,
            "_source": "listener",
            "bk1": "Pinnacle",
            "bk1_odds": round(pin_odds, 3),
            "bk2": counter_bk,
            "bk2_odds": round(counter_odds, 3),
            "robin_odds": round(robin_odds, 3),
            "profit_pct": round(profit_pct, 2),
            "profit_capped": profit_capped,
            "profit_range_min": _to_float_or_none(fork.get("profit_range_min")) if profit_capped else None,
            "profit_range_max": _to_float_or_none(fork.get("profit_range_max")) if profit_capped else None,
            "robin_profit_pct": round(robin_profit_pct, 2),
            "age_sec": 0,
            "event_id": event_id,
            "pinnacle_hub_event_id": pin_hub_event_id,
            "is_live": is_live_flag,
            "server": server_name,
            "score": score,
            "event_dt": event_dt,
            "match_time": match_time,
            "market_name": market_name,
            "market_code": market_code,
            "market_scope": market_scope,
            "market_context": market_context,
            "market_context_label": market_context_label,
            "display_market": _display_market_with_context(market, market_name, market_context),
            "team1_en": str(fork.get("team1_en") or "").strip(),
            "team2_en": str(fork.get("team2_en") or "").strip(),
            "bk1_event_name": pin_event_name,
            "bk2_event_name": counter_event_name,
            "overvalue": overvalue,
            "pin_overvalue": pin_overvalue,
            "counter_overvalue": counter_overvalue,
            "alt_count": _to_int_or_none(fork.get("alt_count")),
            "clone_count": _to_int_or_none(fork.get("clone_count")),
            "sport_id": str(fork.get("sport_id") or "").strip(),
            "inf_event_id": str(fork.get("inf_event_id") or "").strip(),
            "set_number": _to_int_or_none(pin_market_metadata.get("set_number")),
            "game_number": _to_int_or_none(pin_market_metadata.get("game_number")),
            "period_number": _to_int_or_none(pin_market_metadata.get("period_number")),
            "period_type": str(pin_market_metadata.get("period_type") or ""),
            "time_to_start_estimate_secs": _to_int_or_none(fork.get("time_to_start_estimate_secs")),
            "bk1_online": fork.get(f"{pin_prefix}_online"),
            "bk2_online": fork.get("bk2_online" if is_pin1 else "bk1_online"),
            "bk1_url": bk1_url,
            "bk1_raw_link": pin_link,
            "bk2_url": bk2_url,
            "bk2_raw_link": counter_link,
            **counter_navigation_fields,
            **betfair_fields,
            "updated_at": source_updated_at,
        }
    except Exception as exc:
        log.warning(f"Failed to convert feed fork #{idx}: {exc}")
        return None


def _arb_to_feed_fork(arb: dict[str, Any], idx: int) -> dict[str, Any]:
    updated_at = float(arb.get("updated_at") or time.time())
    event_id = arb.get("event_id")
    return {
        "id": arb.get("id") or f"fork-{idx}",
        "sport": arb.get("league") or arb.get("sport") or "",
        "profit": float(arb.get("profit_pct") or 0.0),
        "profit_capped": bool(arb.get("profit_capped")),
        "profit_range_min": _to_float_or_none(arb.get("profit_range_min")),
        "profit_range_max": _to_float_or_none(arb.get("profit_range_max")),
        "is_live": _arb_is_live(arb),
        "fork_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(updated_at)),
        "event_id": str(event_id) if event_id not in (None, "") else "",
        "stake_types": ";".join(
            value
            for value in [str(arb.get("bk1_selection") or "").strip(), str(arb.get("bk2_selection") or "").strip()]
            if value
        ),
        "bk1": "pinnaclesports.com",
        "bk2": str(arb.get("bk2") or ""),
        "event_name": str(arb.get("match") or f"Event #{idx}"),
        "bk1_link": str(arb.get("bk1_raw_link") or arb.get("bk1_url") or _build_bookmaker_url("pinnacle.com")),
        "bk1_selection_id": str(arb.get("pinnacle_selection_id") or ""),
        "bk1_odds_id": str(arb.get("pinnacle_odds_id") or ""),
        "bk1_line_id": str(arb.get("pinnacle_line_id") or ""),
        "market_metadata": dict(arb.get("pinnacle_market_metadata") or {}),
        "bk2_link": str(arb.get("bk2_raw_link") or arb.get("bk2_url") or _build_bookmaker_url(str(arb.get("bk2") or ""))),
        "bk2_market_id": str(arb.get("betfair_market_id") or ""),
        "bk2_selection_id": str(arb.get("betfair_selection_id") or ""),
        "odds1": float(arb.get("bk1_odds") or 0.0),
        "odds2": float(arb.get("bk2_odds") or 0.0),
        "server": str(arb.get("server") or ""),
        "score": str(arb.get("score") or ""),
        "event_dt": str(arb.get("event_dt") or ""),
        "match_time": str(arb.get("match_time") or ""),
        "market_name": str(arb.get("market_name") or ""),
        "market_context": str(arb.get("market_context") or ""),
        "team1_en": str(arb.get("team1_en") or ""),
        "team2_en": str(arb.get("team2_en") or ""),
        "bk1_event_name": str(arb.get("bk1_event_name") or ""),
        "bk2_event_name": str(arb.get("bk2_event_name") or ""),
        "overvalue": list(arb.get("overvalue") or []),
        "alt_count": arb.get("alt_count"),
        "clone_count": arb.get("clone_count"),
        "sport_id": str(arb.get("sport_id") or ""),
        "inf_event_id": str(arb.get("inf_event_id") or ""),
        "set_number": _to_int_or_none(
            arb.get("set_number")
            or (arb.get("pinnacle_market_metadata") or {}).get("set_number")
            if isinstance(arb.get("pinnacle_market_metadata"), dict)
            else arb.get("set_number")
        ),
        "game_number": _to_int_or_none(
            arb.get("game_number")
            or (arb.get("pinnacle_market_metadata") or {}).get("game_number")
            if isinstance(arb.get("pinnacle_market_metadata"), dict)
            else arb.get("game_number")
        ),
        "time_to_start_estimate_secs": arb.get("time_to_start_estimate_secs"),
    }


class FortedRelay(threading.Thread):
    """Background thread that connects to Forted relay and updates arb cache."""

    daemon = True

    def __init__(self):
        super().__init__(name="forted-relay")
        self.running = True
        self.connected = False
        self.frames_received = 0
        self.forks_total = 0
        self.refresh_requested = False
        self.sock: socket.socket | None = None
        self.bookmakers_total = 0
        self.bookmakers_active: list[str] = []
        self.last_frame_at: float | None = None
        self.last_error: str | None = None
        self.last_disconnect_reason: str | None = None

    def request_refresh(self):
        self.refresh_requested = True
        current_sock = self.sock
        if not current_sock:
            return
        try:
            current_sock.shutdown(socket.SHUT_RDWR)
        except Exception:
            pass
        try:
            current_sock.close()
        except Exception:
            pass

    def run(self):
        global _arbs_cache, _arbs_source, _arbs_updated_at
        if not _build_forted_auth_binary():
            log.error("No Forted auth binary — relay disabled")
            self.last_error = "No Forted auth binary"
            return
        while self.running:
            for host, port in FORTED_RELAY_SERVERS:
                if not self.running:
                    return
                try:
                    self._connect_and_recv(host, port)
                except Exception as e:
                    self.last_error = str(e)
                    log.warning(f"Forted relay {host}:{port} error: {e}")
                time.sleep(2)
            time.sleep(5)

    def _connect_and_recv(self, host: str, port: int):
        global _arbs_cache, _arbs_source, _arbs_updated_at
        sock = _build_forted_socket()
        self.sock = sock
        sock.settimeout(10)
        try:
            sock.connect((host, port))
            transport = f"SOCKS5 {FORTED_SOCKS5_HOST}:{FORTED_SOCKS5_PORT}" if FORTED_SOCKS5_HOST else "direct"
            log.info(f"Connected to Forted relay {host}:{port} via {transport}")
            self.connected = True
            self.last_disconnect_reason = None
        except Exception as e:
            self.last_error = str(e)
            log.warning(f"Cannot connect to {host}:{port}: {e}")
            sock.close()
            self.sock = None
            return

        auth_binary = _build_forted_auth_binary()
        if not auth_binary:
            sock.close()
            self.sock = None
            self.connected = False
            return

        sock.sendall(auth_binary)
        filters = _get_forted_filters_snapshot()
        log.info(
            "Auth sent to Forted relay (%sb, %s bookmakers, %s sports, mode=%s)",
            len(auth_binary),
            filters["bookmakers_count"],
            filters["sports_count"],
            filters["mode"],
        )

        # The relay expects a captured static subscription/keepalive payload
        # almost immediately after auth, otherwise some nodes close early.
        time.sleep(0.05)
        sock.sendall(FORTED_KEEPALIVE_MESSAGE)
        log.info("Initial Forted keepalive sent (%sb)", len(FORTED_KEEPALIVE_MESSAGE))

        buf = b""
        last_keepalive = time.time()
        sock.settimeout(5)

        try:
            while self.running and not self.refresh_requested:
                # Keepalive every 30s
                if time.time() - last_keepalive > 30:
                    try:
                        sock.sendall(FORTED_KEEPALIVE_MESSAGE)
                        last_keepalive = time.time()
                    except Exception:
                        break

                # Receive
                try:
                    chunk = sock.recv(65536)
                    if not chunk:
                        self.last_disconnect_reason = f"{host}:{port} closed connection"
                        log.info(f"Forted relay {host} closed connection")
                        break
                    buf += chunk
                except socket.timeout:
                    continue

                # Process frames
                while len(buf) >= 11:
                    # Skip "Connected.."
                    if buf[:11] == b"Connected..":
                        buf = buf[11:]
                        continue

                    try:
                        msg_len = int(buf[:11].decode("ascii").strip())
                    except (ValueError, UnicodeDecodeError):
                        buf = buf[1:]
                        continue

                    total = 11 + msg_len
                    if len(buf) < total:
                        break

                    payload = buf[11:total]
                    buf = buf[total:]

                    try:
                        raw = gzip.decompress(payload)
                    except Exception:
                        continue

                    self.frames_received += 1
                    msg = _forted_parse_message(raw)
                    self.last_frame_at = time.time()

                    if msg.get("bookmakers"):
                        active_names = sorted(
                            bk["name"]
                            for bk in msg["bookmakers"]
                            if bk.get("active")
                        )
                        self.bookmakers_total = len(msg["bookmakers"])
                        self.bookmakers_active = active_names
                        if self.frames_received % 20 == 1:
                            log.info(
                                "Forted status frame: %s bookmakers, %s active",
                                self.bookmakers_total,
                                len(self.bookmakers_active),
                            )

                    if _publish_direct_forted_snapshot(msg, self) and self.forks_total and self.frames_received % 30 == 1:
                        log.info(f"Forted: {self.forks_total} arbs (frame #{self.frames_received})")
        finally:
            sock.close()
            self.sock = None
            self.connected = False
            self.refresh_requested = False


def _publish_direct_forted_snapshot(msg: dict[str, Any], relay: FortedRelay) -> bool:
    global _arbs_cache, _arbs_source, _arbs_updated_at
    if not msg.get("surebets_frame"):
        return False

    arbs = []
    stats_candidates: list[dict[str, Any]] = []
    for idx, fork in enumerate(msg.get("forks") or []):
        arb = _fork_to_arb(fork, idx)
        if not arb:
            continue
        stats_candidates.append(arb)
        if arb["profit_pct"] > 0:
            arbs.append(arb)
    _observe_stats_candidates(stats_candidates, source="forted")
    arbs.sort(key=lambda item: -item["profit_pct"])
    _carry_sticky_verify_fields(arbs)
    _arbs_cache = arbs
    _arbs_source = "forted"
    _arbs_updated_at = time.time()
    relay.last_frame_at = _arbs_updated_at
    relay.last_error = None
    relay.last_disconnect_reason = None
    relay.forks_total = len(arbs)
    if arbs:
        _record_rolling_arbs(arbs)
    return True


def _carry_sticky_verify_fields(new_arbs: list[dict]) -> None:
    if not new_arbs:
        return
    prev_index: dict[str, dict[str, Any]] = {}
    for arb in _arbs_cache:
        aid = arb.get("id")
        if aid:
            prev_index[aid] = arb
    with _rolling_arbs_lock:
        for arb in _rolling_arbs.values():
            aid = arb.get("id")
            if aid and aid not in prev_index:
                prev_index[aid] = arb
    for arb in new_arbs:
        prev = prev_index.get(arb.get("id"))
        if not prev:
            continue
        for key in (
            "last_verified_pinnacle_odds",
            "last_verified_pinnacle_at",
            "last_verified_payload",
            "last_verified_robin_odds",
            "last_verified_robin_at",
            "last_verified_robin_source",
        ):
            if key in prev and key not in arb:
                arb[key] = prev[key]


def _publish_listener_snapshot(arbs: list[dict], relay: Any, bookmakers: set[str]) -> None:
    global _arbs_cache, _arbs_source, _arbs_updated_at
    if _lws_snapshot_stale_for_active_switch(arbs):
        arbs = []
        bookmakers = set()
    arbs.sort(key=lambda item: -item["profit_pct"])
    _carry_sticky_verify_fields(arbs)
    _arbs_cache = arbs
    _arbs_source = "listener"
    _arbs_updated_at = time.time()
    if arbs:
        _record_rolling_arbs(arbs)

    relay.connected = True
    relay.frames_received += 1
    relay.forks_total = len(arbs)
    relay.bookmakers_total = len(bookmakers)
    relay.bookmakers_active = sorted(bookmakers)
    relay.last_frame_at = _arbs_updated_at
    relay.last_error = None
    relay.last_disconnect_reason = None


class ExternalFeedRelay(threading.Thread):
    """Background thread that consumes Forted push feed, with HTTP polling fallback."""

    daemon = True

    def __init__(self):
        super().__init__(name="forted-feed-listener")
        self.running = True
        self.connected = False
        self.frames_received = 0
        self.forks_total = 0
        self.refresh_requested = False
        self.sock = None
        self.bookmakers_total = 0
        self.bookmakers_active: list[str] = []
        self.last_frame_at: float | None = None
        self.last_error: str | None = None
        self.last_disconnect_reason: str | None = None
        self.transport = "sse" if FORTED_FEED_STREAM_URL else "poll"
        self.proxy_host = None
        self.proxy_port = None

    def request_refresh(self):
        self.refresh_requested = True

    def run(self):
        global _arbs_cache, _arbs_source, _arbs_updated_at

        with httpx.Client(timeout=FORTED_FEED_TIMEOUT) as client:
            backoff = 1.0
            while self.running:
                if FORTED_FEED_STREAM_URL:
                    try:
                        self._consume_sse(client)
                        backoff = 1.0
                        self.refresh_requested = False
                        continue
                    except Exception as exc:
                        self.connected = False
                        self.last_error = str(exc)
                        self.last_disconnect_reason = f"feed SSE failed: {exc}"
                        log.warning("External Forted SSE error: %s", exc)
                        if FORTED_FEED_URL:
                            try:
                                self._poll_once(client)
                            except Exception as poll_exc:
                                self.last_error = str(poll_exc)
                                log.warning("External Forted poll fallback error: %s", poll_exc)
                        if _arbs_source == "listener" and time.time() - _arbs_updated_at > ROBINARB_FEED_STALE_AFTER:
                            _arbs_cache = []
                            _arbs_source = "stale"
                        self._sleep_interruptible(backoff)
                        backoff = min(backoff * 2, 30.0)
                        continue

                try:
                    self._poll_once(client)
                except Exception as exc:
                    self.connected = False
                    self.last_error = str(exc)
                    self.last_disconnect_reason = f"feed poll failed: {exc}"
                    if _arbs_source == "listener" and time.time() - _arbs_updated_at > ROBINARB_FEED_STALE_AFTER:
                        _arbs_cache = []
                        _arbs_source = "stale"
                    log.warning("External Forted feed error: %s", exc)

                self._sleep_interruptible(0.25 if self.refresh_requested else FORTED_FEED_POLL_INTERVAL)

    def _sleep_interruptible(self, seconds: float) -> None:
        self.refresh_requested = False
        deadline = time.time() + max(seconds, 0.1)
        while self.running and time.time() < deadline:
            if self.refresh_requested:
                break
            time.sleep(0.1)

    def _publish_feed_items(self, payload: list[dict[str, Any]]) -> None:
        arbs: list[dict] = []
        stats_candidates: list[dict[str, Any]] = []
        bookmakers: set[str] = set()
        for idx, item in enumerate(payload):
            if not isinstance(item, dict):
                continue
            arb = _feed_fork_to_arb(item, idx)
            if not arb:
                continue
            stats_candidates.append(arb)
            if arb["profit_pct"] < ROBINARB_FEED_MIN_PROFIT:
                continue
            if ROBINARB_FEED_ONLINE_ONLY and (
                arb.get("bk1_online") is False or arb.get("bk2_online") is False
            ):
                continue
            arbs.append(arb)
            bookmakers.add("Pinnacle")
            if arb.get("bk2"):
                bookmakers.add(str(arb["bk2"]))
        _observe_stats_candidates(stats_candidates, source="listener")
        _publish_listener_snapshot(arbs, self, bookmakers)

    def _auth_headers(self) -> dict[str, str]:
        headers: dict[str, str] = {}
        if FORTED_FEED_KEY:
            headers["X-Forted-Key"] = FORTED_FEED_KEY
        if FORTED_FEED_BEARER_TOKEN:
            headers["Authorization"] = f"Bearer {FORTED_FEED_BEARER_TOKEN}"
        return headers

    def _poll_once(self, client: httpx.Client) -> None:
        if not FORTED_FEED_URL:
            raise RuntimeError("FORTED_FEED_URL is not configured")
        self.transport = "poll"
        response = client.get(
            FORTED_FEED_URL,
            params={"limit": FORTED_FEED_LIMIT},
            headers=self._auth_headers(),
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, list):
            raise ValueError("Feed payload must be a list")
        self._publish_feed_items(payload)

    def _consume_sse(self, client: httpx.Client) -> None:
        self.transport = "sse"
        headers = {"Accept": "text/event-stream", **self._auth_headers()}
        if FORTED_FEED_ACCEPT_GZIP:
            headers["Accept-Encoding"] = "gzip"

        timeout_config = httpx.Timeout(
            FORTED_FEED_DEAD_TIMEOUT,
            connect=FORTED_FEED_TIMEOUT,
            read=FORTED_FEED_DEAD_TIMEOUT,
            write=FORTED_FEED_TIMEOUT,
            pool=FORTED_FEED_TIMEOUT,
        )
        with client.stream("GET", FORTED_FEED_STREAM_URL, headers=headers, timeout=timeout_config) as response:
            response.raise_for_status()
            gzip_chunked = response.headers.get("Content-Encoding", "").lower() == "x-sse-gzip-chunked"
            self.connected = True
            self.last_error = None
            self.last_disconnect_reason = None
            log.info("External Forted SSE connected: %s (gzip_chunked=%s)", FORTED_FEED_STREAM_URL, gzip_chunked)

            event_type = "message"
            data_lines: list[str] = []
            for line in response.iter_lines():
                if not self.running or self.refresh_requested:
                    break
                if line is None:
                    continue
                text = line.strip()
                if not text:
                    if data_lines:
                        self._handle_sse_event(event_type, "\n".join(data_lines), gzip_chunked)
                    event_type = "message"
                    data_lines = []
                    continue
                if text.startswith(":"):
                    continue
                if text.startswith("event:"):
                    event_type = text.split(":", 1)[1].strip() or "message"
                elif text.startswith("data:"):
                    data_lines.append(text.split(":", 1)[1].lstrip())
        self.connected = False

    def _handle_sse_event(self, event_type: str, raw_data: str, gzip_chunked: bool) -> None:
        if gzip_chunked:
            data = gzip.decompress(base64.b64decode(raw_data)).decode("utf-8", "replace")
        else:
            data = raw_data
        payload = json.loads(data)
        if event_type == "heartbeat":
            self.last_frame_at = time.time()
            return
        if event_type not in {"state", "message", ""}:
            return
        if not isinstance(payload, dict):
            raise ValueError("SSE state payload must be an object")
        feed_items = _state_payload_to_feed_forks(payload)
        self._publish_feed_items(feed_items)


# ═══════════════════════════════════════════════════════════
# Mock fallback
# ═══════════════════════════════════════════════════════════

_MOCK_SPORTS = ["Soccer", "Tennis", "Basketball", "Hockey", "Volleyball"]
_MOCK_MARKETS = ["1X2", "Totals", "Handicap", "Moneyline"]
_MOCK_BKS = [
    "Bet365", "1xBet", "Marathonbet", "Betfair", "William Hill",
    "Unibet", "Bwin", "888sport", "Betway", "Fonbet",
    "Parimatch", "Melbet", "Mostbet", "Leon", "Olimp",
]


def _current_mock_generation_pools() -> tuple[list[str], list[str]]:
    filters = _get_forted_filters_snapshot()
    sports_pool = _dedupe_keep_order([SPORT_MAP_RU_EN.get(sport, sport) for sport in filters["sports"]])
    bookmakers_pool = _dedupe_keep_order(filters["bookmakers"])
    return (sports_pool or list(_MOCK_SPORTS), bookmakers_pool or list(_MOCK_BKS))


def _generate_mock_arbs(
    count: int = 25,
    sports_pool: Optional[list[str]] = None,
    bookmakers_pool: Optional[list[str]] = None,
) -> list[dict]:
    sport_choices = sports_pool or list(_MOCK_SPORTS)
    bookmaker_choices = bookmakers_pool or list(_MOCK_BKS)
    arbs = []
    for i in range(count):
        sport = random.choice(sport_choices)
        home = f"Team {chr(65 + i % 26)}{i // 26 or ''}"
        away = f"Team {chr(90 - i % 26)}{i // 26 or ''}"
        pin_odds = round(random.uniform(1.4, 4.5), 3)
        arb_pct = random.uniform(0.01, 0.05)
        counter_odds = round(1 / (1 - 1/pin_odds + arb_pct), 3)
        if counter_odds < 1.01:
            counter_odds = round(random.uniform(1.5, 3.0), 3)
        profit_pct = round((1 / (1/pin_odds + 1/counter_odds) - 1) * 100, 2)
        if profit_pct <= 0:
            profit_pct = round(random.uniform(0.5, 5.0), 2)
        bk2 = random.choice(bookmaker_choices)
        market = random.choice(_MOCK_MARKETS)
        side1 = "Home" if random.random() > 0.5 else "Over 2.5"
        side2 = "Away" if side1 == "Home" else "Under 2.5"
        if market == "Handicap":
            hcap = random.choice([-2.5, -1.5, -0.5, 0.5, 1.5, 2.5])
            side1, side2 = f"Home {hcap:+}", f"Away {-hcap:+}"
        robin_odds = round(pin_odds + 0.04, 3)
        robin_pp = round((1 / (1/robin_odds + 1/counter_odds) - 1) * 100, 2)
        arbs.append({
            "id": str(uuid.uuid4())[:8], "sport": sport,
            "league": f"{sport} Live Board",
            "match": f"{home} vs {away}", "home": home, "away": away,
            "market": market, "side1": side1, "side2": side2,
            "bk1_selection": side1, "bk2_selection": side2,
            "bk1_outcome": _infer_pinnacle_outcome(side1, market, True),
            "bk1": "Pinnacle", "bk1_odds": pin_odds,
            "bk2": bk2, "bk2_odds": counter_odds,
            "robin_odds": robin_odds, "profit_pct": profit_pct,
            "robin_profit_pct": robin_pp,
            "age_sec": random.randint(5, 600),
            "event_id": random.randint(100000, 999999),
            "is_live": bool(random.getrandbits(1)),
            "bk1_url": _build_bookmaker_url("pinnacle.com"),
            "bk2_url": _build_bookmaker_url(bk2),
            "_source": "mock",
            "updated_at": time.time(),
        })
    arbs.sort(key=lambda x: -x["profit_pct"])
    return arbs


def _refresh_mock_arbs(count: int = 25) -> None:
    global _arbs_cache, _arbs_source, _arbs_updated_at
    sports_pool, bookmakers_pool = _current_mock_generation_pools()
    _arbs_cache = _generate_mock_arbs(count, sports_pool=sports_pool, bookmakers_pool=bookmakers_pool)
    _arbs_source = "mock"
    _arbs_updated_at = time.time()


# ═══════════════════════════════════════════════════════════
# FastAPI app
# ═══════════════════════════════════════════════════════════

_relay_thread: threading.Thread | None = None
_stats_collector: stats_collector.StatsCollector | None = None
_stats_stream_block_logged_at = 0.0


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _arbs_cache, _arbs_source, _arbs_updated_at, _relay_thread, _stats_collector

    # Start Forted relay in background when enabled.
    if FORTED_FEED_STREAM_URL or FORTED_FEED_URL:
        _relay_thread = ExternalFeedRelay()
        _relay_thread.start()
        log.info(
            "External Forted feed listener started: stream=%s poll_fallback=%s",
            FORTED_FEED_STREAM_URL or None,
            FORTED_FEED_URL or None,
        )
    elif FORTED_ENABLED:
        _relay_thread = FortedRelay()
        _relay_thread.start()
        log.info("Forted relay thread started")
    else:
        _relay_thread = None
        log.info("Forted relay disabled by env")

    if ROBINARB_ALLOW_MOCK_FALLBACK:
        _refresh_mock_arbs(25)

    stats_config = stats_collector.StatsConfig.from_env()
    _stats_collector = stats_collector.StatsCollector(
        stats_config,
        price_callback=_stats_price_for_arb,
        verify_callback=_stats_verify_betslip_price,
        monitor_callback=_stats_monitor_price,
        logger=log,
    )
    if stats_config.enabled:
        _stats_collector.start()
        log.info("RobinArb stats collector started: %s", stats_config.data_dir)
    else:
        log.info("RobinArb stats collector disabled")

    _margin_task = None
    if robin_margin.HUB_REFRESH_ENABLED:
        _margin_task = asyncio.create_task(robin_margin.refresh_loop(lambda: list(_arbs_cache)))
        log.info("Robin margin hub refresh task started")

    _pin888_stream_task = None
    if PIN888_STREAM_CACHE_ENABLED:
        _pin888_stream_task = asyncio.create_task(pinnacle_hub.stream_cache_loop(logger=log, max_size=None))
        log.info("pin888 accumulated stream cache started")
    else:
        log.info("pin888 accumulated stream cache disabled")

    # Seed the per-match limits tracker with any recent accepted bets from
    # SQLite so existing volume counts toward the limit immediately on
    # restart even if the JSON history file was wiped or rotated.
    if _match_limits is not None:
        try:
            _seed_match_limits_from_storage()
        except Exception as exc:  # noqa: BLE001
            log.warning("seed match limits from storage failed: %s", exc)

    yield

    if _stats_collector:
        await _stats_collector.stop()
    if _margin_task:
        _margin_task.cancel()
    if _pin888_stream_task:
        _pin888_stream_task.cancel()
        await asyncio.gather(_pin888_stream_task, return_exceptions=True)
    if _relay_thread:
        _relay_thread.running = False


app = FastAPI(title="RobinArb API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ROBINARB_CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CalcRequest(BaseModel):
    arb_id: str
    stake_total: float = 1000.0
    # Optional "donor-driven" mode: user inputs the stake they already placed
    # (or plan to place) on the counter-bookmaker. We then compute the matching
    # Pinnacle/Robin stake that closes the arbitrage at the live odds. If
    # counter_stake is provided, stake_total is ignored.
    counter_stake: Optional[float] = None
    counter_odds: Optional[float] = None
    live_pinnacle_odds: Optional[float] = None
    live_robin_odds: Optional[float] = None

class BetRequest(BaseModel):
    arb_id: str
    side: Literal["pinnacle", "robinbet"]
    stake: float = Field(gt=0)
    odds: float = Field(gt=1.0)
    quote_id: Optional[str] = None
    verify_mode: Optional[Literal["demo", "stream", "betslip"]] = None

class VerifyRequest(BaseModel):
    arb_id: str
    verify_mode: Optional[Literal["demo", "stream", "betslip"]] = None
    verify_scope: Optional[Literal["calculator"]] = None
    client_id: Optional[str] = None


class VerifyReleaseRequest(BaseModel):
    arb_id: str
    client_id: str


class HideArbRequest(BaseModel):
    arb_id: str
    scope: Literal["fork", "match"]


class LoginRequest(BaseModel):
    username: str
    password: str


class FortedFiltersRequest(BaseModel):
    bookmakers: Optional[list[str]] = None
    sports: Optional[list[str]] = None
    mode: Optional[str] = None
    filter_id: Optional[str] = None


class FortedBookmakerRequest(BaseModel):
    profile: str


class BetfairRunRequest(BaseModel):
    limit: int = Field(default=5, ge=1, le=25)
    stake: float = Field(default=ROBINARB_BETFAIR_DEFAULT_STAKE, gt=0)
    min_profit_pct: Optional[float] = None
    verify_pinnacle: bool = True
    verify_betfair: bool = True
    require_price_match: bool = True
    dry_run: bool = True


_LWS_PROFILE_CONFIGS = {
    "pin_vbet": "config_pin_vbet.toml",
    "pin_ladbrokes": "config_pin_ladbrokes.toml",
    "pin_paddy": "config_pin_paddy.toml",
    "pin_all3": "config_pin_all3.toml",
    "pin_betfair_ladbrokes_mand": "config_pin_betfair_ladbrokes_mand.toml",
    "pin_production": "config_pin_production.toml",
    "pin_bcgame": "config_pin_bcgame.toml",
    "pin_dafabet": "config_pin_dafabet.toml",
    "pin_1win": "config_pin_1win.toml",
    "pin_bc_dafa_1win": "config_pin_bc_dafa_1win.toml",
    "pin_6mix": "config_pin_6mix.toml",
}
_LWS_PROFILE_IDS = tuple(_LWS_PROFILE_CONFIGS.keys())
_LWS_CONFIG_PROFILES = {config: profile for profile, config in _LWS_PROFILE_CONFIGS.items()}
_LWS_LEGACY_PROFILE_ALIASES = {"pin_betfair": "pin_paddy"}
_LWS_PROFILE_BOOKMAKER_HINTS = {
    "pin_vbet": ("vivarobet", "vbet"),
    "pin_ladbrokes": ("ladbrokes",),
    "pin_all3": ("vivarobet", "vbet", "ladbrokes", "paddypower", "paddy"),
    "pin_paddy": ("paddypower", "paddy"),
    "pin_betfair_ladbrokes_mand": ("ladbrokes", "paddypower", "paddy"),
    "pin_bcgame": ("bc.game", "bcgame"),
    "pin_dafabet": ("12bet.com", "12bet", "dafabet"),
    "pin_1win": ("1win", "1win.pro"),
    "pin_bc_dafa_1win": ("bc.game", "bcgame", "12bet.com", "12bet", "dafabet", "1win", "1win.pro"),
    "pin_6mix": (),
}
_LWS_PROFILE_COUNTER_HINTS = {
    "pin_vbet": ("vivarobet",),
    "pin_ladbrokes": ("ladbrokes",),
    "pin_paddy": ("paddypower", "paddy"),
    "pin_all3": ("vivarobet", "ladbrokes", "paddypower", "paddy"),
    "pin_betfair_ladbrokes_mand": ("ladbrokes", "paddypower", "paddy"),
    "pin_bcgame": ("bc.game", "bcgame"),
    "pin_dafabet": ("12bet.com", "12bet", "dafabet"),
    "pin_1win": ("1win", "1win.pro"),
    "pin_bc_dafa_1win": ("bc.game", "bcgame", "12bet.com", "12bet", "dafabet", "1win", "1win.pro"),
    "pin_6mix": (),
}
_LWS_SWITCH_TIMEOUT = float(os.getenv("FORTED_LWS_SWITCH_TIMEOUT", "45"))
_lws_profile_lock = threading.Lock()


def _canonical_lws_profile(profile: str | None) -> str:
    value = str(profile or "").strip()
    return _LWS_LEGACY_PROFILE_ALIASES.get(value, value)


_lws_last_profile = _canonical_lws_profile(os.getenv("FORTED_LWS_PROFILE", "pin_vbet"))
_lws_switch_started_at = 0.0


def _arbs_match_lws_profile(arbs: list[dict[str, Any]], profile: str) -> bool:
    profile = _canonical_lws_profile(profile)
    hints = _LWS_PROFILE_BOOKMAKER_HINTS.get(profile) or ()
    if not hints:
        return True
    for arb in arbs:
        haystack = " ".join(
            str(arb.get(key) or "").lower()
            for key in (
                "bk1",
                "bk2",
                "bk1_raw_link",
                "bk2_raw_link",
                "bk1_event_name",
                "bk2_event_name",
            )
        )
        if any(hint in haystack for hint in hints):
            return True
    return False


def _infer_lws_profile_from_arbs(arbs: list[dict[str, Any]]) -> str | None:
    # Infer atomic bookmaker families first. Composite profiles intentionally
    # repeat those hints, so matching every profile directly makes a pure
    # Paddy or 1win feed look like an "all bookmakers" profile.
    atomic_profiles = (
        "pin_vbet",
        "pin_ladbrokes",
        "pin_paddy",
        "pin_bcgame",
        "pin_dafabet",
        "pin_1win",
    )
    matched: set[str] = set()
    for profile in atomic_profiles:
        hints = _LWS_PROFILE_BOOKMAKER_HINTS[profile]
        if any(
            any(hint in str(arb.get(key) or "").lower() for hint in hints)
            for arb in arbs
            for key in ("bk2", "bk2_raw_link", "bk2_event_name")
        ):
            matched.add(profile)

    if len(matched) == 1:
        return next(iter(matched))
    if matched and matched <= {"pin_vbet", "pin_ladbrokes", "pin_paddy"}:
        return "pin_all3"
    if matched and matched <= {"pin_bcgame", "pin_dafabet", "pin_1win"}:
        return "pin_bc_dafa_1win"
    if len(matched) > 1:
        return "pin_6mix"
    return None


def _arb_counter_matches_lws_profile(arb: dict[str, Any], profile: str | None) -> bool:
    profile = _canonical_lws_profile(profile)
    hints = _LWS_PROFILE_COUNTER_HINTS.get(profile) or ()
    if not hints:
        return True
    haystack = " ".join(
        str(arb.get(key) or "").lower()
        for key in ("bk2", "bk2_url", "bk2_raw_link", "counter_bk")
    )
    if not haystack.strip():
        return False
    return any(hint in haystack for hint in hints)


_lws_profile_cache_time = 0.0
_lws_profile_cached_val = None

_rust_status_cache_time = 0.0
_rust_status_cache_val = None
_rust_status_lock = asyncio.Lock()

async def _cached_rust_admin_status(force_refresh: bool = False) -> dict[str, Any]:
    global _rust_status_cache_time, _rust_status_cache_val
    async with _rust_status_lock:
        now = time.time()
        import sys
        is_testing = "pytest" in sys.modules or "unittest" in sys.modules
        if not is_testing and not force_refresh and _rust_status_cache_val and (now - _rust_status_cache_time < 2.0):
            return _rust_status_cache_val
        try:
            status = await asyncio.wait_for(_rust_admin_request("GET", "/admin/status"), timeout=1.5)
            _rust_status_cache_val = status
            _rust_status_cache_time = now
            return status
        except Exception:
            raise

async def _runtime_lws_profile_for_arbs_filter() -> str | None:
    global _lws_last_profile, _lws_profile_cache_time, _lws_profile_cached_val
    if not FORTED_LWS_TOKEN:
        return None

    # If currently switching, immediately trust the target profile
    with _lws_profile_lock:
        started_at = _lws_switch_started_at
        target_profile = _lws_last_profile
    if started_at and (time.time() - started_at <= _LWS_SWITCH_TIMEOUT):
        return target_profile

    now = time.time()
    import sys
    is_testing = "pytest" in sys.modules or "unittest" in sys.modules
    if not is_testing and now - _lws_profile_cache_time < 3.0:
        return _lws_profile_cached_val
    try:
        status = await _cached_rust_admin_status(force_refresh=False)
    except Exception:
        with _lws_profile_lock:
            val = _lws_last_profile
            _lws_profile_cached_val = val
            _lws_profile_cache_time = now
            return val
    profile = _lws_profile_from_runtime_status(status) or None
    if profile:
        with _lws_profile_lock:
            _lws_last_profile = profile
        _lws_profile_cached_val = profile
        _lws_profile_cache_time = now
        return profile
    inferred_profile = _infer_lws_profile_from_arbs(_arbs_cache)
    if inferred_profile:
        with _lws_profile_lock:
            _lws_last_profile = inferred_profile
        _lws_profile_cached_val = inferred_profile
        _lws_profile_cache_time = now
        return inferred_profile
    with _lws_profile_lock:
        val = _lws_last_profile
        _lws_profile_cached_val = val
        _lws_profile_cache_time = now
        return val


def _lws_snapshot_stale_for_active_switch(arbs: list[dict[str, Any]]) -> bool:
    if not arbs:
        return False
    with _lws_profile_lock:
        profile = _lws_last_profile
        started_at = _lws_switch_started_at
    if not started_at or time.time() - started_at > _LWS_SWITCH_TIMEOUT:
        return False
    stale = not _arbs_match_lws_profile(arbs, profile)
    if stale:
        log.info("Ignoring stale Forted snapshot while switching to %s", profile)
    return stale


def _mark_lws_profile_switch(profile: str) -> None:
    global _lws_last_profile, _lws_switch_started_at, _lws_profile_cache_time, _lws_profile_cached_val
    canonical = _canonical_lws_profile(profile)
    with _lws_profile_lock:
        _lws_last_profile = canonical
        _lws_switch_started_at = time.time()
    _lws_profile_cached_val = canonical
    _lws_profile_cache_time = time.time()
    _clear_live_feed_cache("listener")


def _lws_profile_switch_status() -> tuple[str, bool, int, int]:
    global _lws_switch_started_at
    with _lws_profile_lock:
        profile = _lws_last_profile
        started_at = _lws_switch_started_at
    if not started_at:
        return profile, False, 1, 1

    ready = (
        _arbs_source == "listener"
        and _arbs_updated_at >= started_at
        and bool(_arbs_cache)
        and _arbs_match_lws_profile(_arbs_cache, profile)
    )
    timed_out = time.time() - started_at > _LWS_SWITCH_TIMEOUT
    switching = not ready and not timed_out
    if not switching:
        with _lws_profile_lock:
            if _lws_switch_started_at == started_at:
                _lws_switch_started_at = 0.0
    return profile, switching, 1 if ready else 0, 1


def _lws_profile_from_runtime_status(status: dict[str, Any]) -> str | None:
    for key in ("active_config", "current_config", "config"):
        name = Path(str(status.get(key) or "")).name
        profile = _LWS_CONFIG_PROFILES.get(name)
        if profile:
            return profile
    return None


def _coerce_control_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return bool(value)
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "on", "switching", "pending", "busy"}:
        return True
    if normalized in {"0", "false", "no", "off", "ready", "active", "ok", "idle"}:
        return False
    return None


def _coerce_control_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _control_int_from_keys(data: dict[str, Any], keys: tuple[str, ...], fallback: int) -> int:
    for key in keys:
        value = _coerce_control_int(data.get(key))
        if value is not None:
            return max(0, value)
    return max(0, int(fallback))


def _control_allowed_profiles(data: dict[str, Any]) -> list[str]:
    for key in ("allowed", "profiles", "allowed_profiles"):
        values = data.get(key)
        if isinstance(values, list):
            profiles = []
            for value in values:
                raw_profile = (value.get("id") or value.get("profile")) if isinstance(value, dict) else value
                profile = _canonical_lws_profile(raw_profile)
                if profile in _LWS_PROFILE_CONFIGS:
                    profiles.append(profile)
            if profiles:
                return list(dict.fromkeys(profiles))
    return list(_LWS_PROFILE_IDS)


def _control_profile_from_status(data: Any) -> str | None:
    if not isinstance(data, dict):
        return None
    for key in ("active_profile", "profile", "current_profile", "selected_profile"):
        profile = _canonical_lws_profile(data.get(key))
        if profile in _LWS_PROFILE_CONFIGS:
            return profile
    profile = _lws_profile_from_runtime_status(data)
    if profile:
        return profile
    for key in ("runtime", "status", "sinks"):
        profile = _control_profile_from_status(data.get(key))
        if profile:
            return profile
    return None


def _control_switching_value(
    data: dict[str, Any],
    *,
    profile: str | None,
    memory_profile: str,
    fallback: bool,
    trust_active_profile: bool,
) -> bool:
    for key in ("switching", "is_switching", "pending", "busy"):
        parsed = _coerce_control_bool(data.get(key))
        if parsed is not None:
            return parsed
    parsed_status = _coerce_control_bool(data.get("status") or data.get("state"))
    if parsed_status is not None:
        return parsed_status
    ready = _coerce_control_int(data.get("servers_ready"))
    total = _coerce_control_int(data.get("servers_total"))
    if ready is not None and total is not None and total > 0:
        return ready < total
    if trust_active_profile and profile and profile == _canonical_lws_profile(memory_profile):
        return False
    return fallback


def _set_lws_profile_from_control(profile: str | None, switching: bool) -> None:
    if not profile:
        return
    global _lws_last_profile, _lws_switch_started_at, _lws_profile_cache_time, _lws_profile_cached_val
    canonical = _canonical_lws_profile(profile)
    with _lws_profile_lock:
        _lws_last_profile = canonical
        if not switching:
            _lws_switch_started_at = 0.0
    _lws_profile_cached_val = canonical
    _lws_profile_cache_time = time.time()


def _forted_control_status_payload(
    data: Any,
    *,
    inferred_profile: str | None,
    memory_profile: str,
    local_switching: bool,
    servers_ready: int,
    servers_total: int,
    runtime: str,
    trust_active_profile: bool,
    profile_override: str | None = None,
    force_switching: bool = False,
) -> dict[str, Any]:
    payload = dict(data) if isinstance(data, dict) else {}
    remote_profile = _control_profile_from_status(payload)
    profile = (
        _canonical_lws_profile(profile_override)
        if profile_override
        else remote_profile or _canonical_lws_profile(memory_profile)
    )
    ready = _control_int_from_keys(payload, ("servers_ready", "ready_servers", "ready"), servers_ready)
    total = _control_int_from_keys(payload, ("servers_total", "total_servers", "total"), servers_total)
    switching = _control_switching_value(
        payload,
        profile=remote_profile if trust_active_profile else profile,
        memory_profile=memory_profile,
        fallback=local_switching,
        trust_active_profile=trust_active_profile,
    )
    if force_switching:
        switching = True
    if total < ready:
        total = ready
    if not switching and profile:
        ready = max(ready, 1)
        total = max(total, ready, 1)

    _set_lws_profile_from_control(profile, switching)
    with _lws_profile_lock:
        synced_memory_profile = _lws_last_profile

    payload["profile"] = profile
    payload["active_profile"] = profile
    payload["memory_profile"] = synced_memory_profile
    payload["switching"] = switching
    payload["servers_ready"] = ready
    payload["servers_total"] = total
    payload["allowed"] = _control_allowed_profiles(payload)
    payload.setdefault("runtime", runtime)
    payload.setdefault("control_available", True)
    if inferred_profile:
        payload["inferred_profile"] = inferred_profile
    return payload


def _forted_control_memory_status_payload(
    *,
    inferred_profile: str | None,
    memory_profile: str,
    local_switching: bool,
    servers_ready: int,
    servers_total: int,
    control_error: Any,
) -> dict[str, Any]:
    profile = _canonical_lws_profile(memory_profile)
    payload = {
        "profile": profile,
        "active_profile": profile,
        "memory_profile": profile,
        "generation": 0,
        "switching": bool(local_switching),
        "servers_ready": max(0, int(servers_ready)),
        "servers_total": max(1, int(servers_total or 1)),
        "allowed": list(_LWS_PROFILE_IDS),
        "runtime": "memory",
        "control_available": False,
        "control_error": _safe_diag_text(control_error),
    }
    if inferred_profile:
        payload["inferred_profile"] = inferred_profile
    return payload


@app.post("/api/auth/login")
async def login(req: LoginRequest, request: Request):
    username = req.username.strip().lower()
    password = req.password
    now = time.time()
    client_host = request.client.host if request.client else "unknown"
    attempt_limits = {
        f"user:{username}": 5,
        f"combo:{client_host}:{username}": 5,
        f"ip:{client_host}": 20,
        "global": 100,
    }
    reservation_at = now
    with _users_lock:
        _prune_login_attempts_locked(now, set(attempt_limits))
        recent_by_key = {
            key: [attempt for attempt in _login_attempts.get(key, []) if now - attempt < 60]
            for key in attempt_limits
        }
        if any(len(recent_by_key[key]) >= limit for key, limit in attempt_limits.items()):
            raise HTTPException(429, "Too many login attempts")
        for key, limit in attempt_limits.items():
            _login_attempts[key] = [*recent_by_key[key], reservation_at][-limit:]
        _prune_login_attempts_locked(now, set(attempt_limits))
        user = _users.get(username)
        password_hash = str(user.get("password_hash") or "") if user else ""

    verification_hash = password_hash or _DUMMY_PASSWORD_HASH
    verified_password = await asyncio.to_thread(_verify_password, password, verification_hash)
    password_ok = bool(password_hash) and verified_password

    if not password_ok:
        await asyncio.sleep(min(ROBINARB_LOGIN_BACKOFF, 5) / 10)
        raise HTTPException(401, "Invalid username or password")

    now = time.time()
    with _users_lock:
        _prune_login_attempts_locked(now, set(attempt_limits))
        recent_by_key = {
            key: [attempt for attempt in _login_attempts.get(key, []) if now - attempt < 60 and attempt != reservation_at]
            for key in attempt_limits
        }
        if any(len(recent_by_key[key]) >= limit for key, limit in attempt_limits.items()):
            raise HTTPException(429, "Too many login attempts")
        user = _users.get(username)
        if not user or str(user.get("password_hash") or "") != password_hash:
            public_user = None
        else:
            _login_attempts.pop(f"user:{username}", None)
            _login_attempts.pop(f"combo:{client_host}:{username}", None)
            for key in (f"ip:{client_host}", "global"):
                attempts = list(_login_attempts.get(key, []))
                for index in range(len(attempts) - 1, -1, -1):
                    if attempts[index] == reservation_at:
                        del attempts[index]
                        break
                if attempts:
                    _login_attempts[key] = attempts
                else:
                    _login_attempts.pop(key, None)
            token = secrets.token_urlsafe(24)
            _sessions[token] = {"username": username, "expires_at": now + ROBINARB_SESSION_TTL}
            user["last_login_at"] = now
            try:
                _storage.update_user_login(username, now)
            except Exception as exc:
                log.warning("persist last_login failed: %s", exc)
            balance = _serialize_balance(user["balance"])
            bets_count = len(user["bets"])
            public_user = _public_user(user)

    if public_user is None:
        await asyncio.sleep(min(ROBINARB_LOGIN_BACKOFF, 5) / 10)
        raise HTTPException(401, "Invalid username or password")

    return {
        "token": token,
        "user": public_user,
        "balance": balance,
        "bets_count": bets_count,
    }


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class ImpersonateRequest(BaseModel):
    username: str


class AdminCreateUserRequest(BaseModel):
    username: str
    display_name: Optional[str] = None
    password: str
    role: Optional[str] = "trader"
    pinnacle_cashback: Optional[float] = 10000.0
    robinbet: Optional[float] = 10000.0


class AdminUpdateUserBalanceRequest(BaseModel):
    pinnacle_cashback: Optional[float] = None
    robinbet: Optional[float] = None


class AdminResetUserPasswordRequest(BaseModel):
    new_password: str


@app.post("/api/auth/password")
async def change_password(
    req: ChangePasswordRequest,
    current_username: str = Depends(_require_current_username),
):
    with _users_lock:
        user = _users.get(current_username)
        if not user:
            raise HTTPException(401, "Unauthorized")
        
        if not _verify_password(req.old_password, user["password_hash"]):
            raise HTTPException(400, "Incorrect old password")

        new_pwd = req.new_password
        if len(new_pwd) < 6:
            raise HTTPException(400, "New password must be at least 6 characters long")

        new_hash = _hash_password(new_pwd)
        user["password_hash"] = new_hash
        try:
            _storage.upsert_user(user)
        except Exception as exc:
            log.warning("persist password change failed: %s", exc)
            raise HTTPException(500, "Failed to persist new password") from exc
    return {"status": "success", "message": "Password changed successfully"}


@app.post("/api/auth/settle_cashback")
async def settle_cashback(
    current_username: str = Depends(_require_current_username),
):
    with _users_lock:
        user = _users.get(current_username)
        if not user:
            raise HTTPException(401, "Unauthorized")
        if user.get("role") not in {"admin", "superuser"}:
            raise HTTPException(403, "Only admins and superusers can settle their own cashback PnL")
        
        balance = user["balance"]
        cashback_pl = float(balance.get("cashback_pl", 0.0))
        if cashback_pl <= 0:
            raise HTTPException(400, "Cashback PnL must be positive to settle")
            
        balance["pinnacle_cashback"] = float(balance.get("pinnacle_cashback", 0.0)) + cashback_pl
        balance["cashback_pl"] = 0.0
        
        try:
            _storage.update_user_balance(current_username, balance)
        except Exception as exc:
            log.warning("persist cashback settlement failed: %s", exc)
            raise HTTPException(500, "Failed to persist balance updates") from exc
            
    return {
        "status": "success",
        "message": f"Successfully settled ${cashback_pl:.2f} cashback PnL to Pinnacle balance",
        "balance": _serialize_balance(balance)
    }


@app.post("/api/auth/reset_cashback")
async def reset_cashback(
    current_username: str = Depends(_require_current_username),
):
    with _users_lock:
        user = _users.get(current_username)
        if not user:
            raise HTTPException(401, "Unauthorized")
        if user.get("role") not in {"admin", "superuser"}:
            raise HTTPException(403, "Only admins and superusers can reset their own cashback PnL")
        
        balance = user["balance"]
        balance["cashback_pl"] = 0.0
        
        try:
            _storage.update_user_balance(current_username, balance)
        except Exception as exc:
            log.warning("persist cashback reset failed: %s", exc)
            raise HTTPException(500, "Failed to persist balance updates") from exc
            
    return {
        "status": "success",
        "message": "Successfully reset cashback PnL to 0.0",
        "balance": _serialize_balance(balance),
    }



@app.post("/api/admin/impersonate")
async def admin_impersonate(
    req: ImpersonateRequest,
    current_username: str = Depends(_require_current_username),
):
    _require_admin_username(current_username)
    target_username = req.username.strip().lower()
    with _users_lock:
        user = _users.get(target_username)
        if not user:
            raise HTTPException(404, f"User '{target_username}' not found")
        token = secrets.token_urlsafe(24)
        _sessions[token] = {"username": target_username, "expires_at": time.time() + ROBINARB_SESSION_TTL}
        balance = _serialize_balance(user["balance"])
        bets_count = len(user["bets"])
        public_user = _public_user(user)
    return {
        "token": token,
        "user": public_user,
        "balance": balance,
        "bets_count": bets_count,
    }


@app.post("/api/admin/users")
async def admin_create_user(
    req: AdminCreateUserRequest,
    current_username: str = Depends(_require_current_username),
):
    _require_admin_username(current_username)
    username = req.username.strip().lower()
    if not username:
        raise HTTPException(400, "Username cannot be empty")
    if len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters long")
    
    with _users_lock:
        if username in _users:
            raise HTTPException(400, f"User '{username}' already exists")
        
        user = {
            "username": username,
            "display_name": req.display_name.strip() if req.display_name else username.title(),
            "password_hash": _hash_password(req.password),
            "role": req.role if req.role in ("admin", "trader") else "trader",
            "balance": {
                "pinnacle_cashback": max(0.0, round(float(req.pinnacle_cashback or 0), 2)),
                "robinbet": max(0.0, round(float(req.robinbet or 0), 2)),
                "cashback_pl": 0.0,
            },
            "bets": [],
            "created_at": time.time(),
            "last_login_at": None,
            "forted_account_id": None,
            "forted_filters": None,
        }
        _users[username] = user
        _storage.upsert_user(user)
    
    return {"status": "success", "user": _public_user(user)}


@app.post("/api/admin/users/{target_username}/balance")
async def admin_update_user_balance(
    target_username: str,
    req: AdminUpdateUserBalanceRequest,
    current_username: str = Depends(_require_current_username),
):
    _require_admin_username(current_username)
    target_username = target_username.strip().lower()
    
    with _users_lock:
        user = _users.get(target_username)
        if not user:
            raise HTTPException(404, f"User '{target_username}' not found")
        
        if req.pinnacle_cashback is not None:
            user["balance"]["pinnacle_cashback"] = max(0.0, round(float(req.pinnacle_cashback), 2))
        if req.robinbet is not None:
            user["balance"]["robinbet"] = max(0.0, round(float(req.robinbet), 2))
            
        _storage.update_user_balance(target_username, user["balance"])
    
    return {"status": "success", "balance": _serialize_balance(user["balance"])}


@app.post("/api/admin/users/{target_username}/password")
async def admin_reset_user_password(
    target_username: str,
    req: AdminResetUserPasswordRequest,
    current_username: str = Depends(_require_current_username),
):
    _require_admin_username(current_username)
    target_username = target_username.strip().lower()
    if len(req.new_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters long")
        
    with _users_lock:
        user = _users.get(target_username)
        if not user:
            raise HTTPException(404, f"User '{target_username}' not found")
            
        user["password_hash"] = _hash_password(req.new_password)
        _storage.upsert_user(user)
        
    return {"status": "success", "message": f"Password for '{target_username}' successfully updated"}


@app.get("/api/auth/me")
async def auth_me(current_username: str = Depends(_require_current_username)):
    snapshot = _snapshot_user(current_username)
    return {
        "user": snapshot["user"],
        "balance": snapshot["balance"],
        "bets_count": snapshot["bets_count"],
        "last_login_at": snapshot["last_login_at"],
    }


@app.post("/api/auth/logout")
async def logout(
    authorization: str | None = Header(default=None),
    current_username: str = Depends(_require_current_username),
):
    token = _extract_bearer_token(authorization)
    with _users_lock:
        _sessions.pop(token, None)
    return {"ok": True, "user": current_username}


def _health_details_payload() -> dict[str, Any]:
    relay = _relay_thread
    relay_transport = getattr(relay, "transport", "socks5" if FORTED_SOCKS5_HOST else "direct")
    relay_proxy_host = getattr(relay, "proxy_host", FORTED_SOCKS5_HOST or None)
    relay_proxy_port = getattr(relay, "proxy_port", FORTED_SOCKS5_PORT if FORTED_SOCKS5_HOST else None)
    return {
        "status": "ok",
        "time": time.time(),
        "source": _arbs_source,
        "forted_enabled": FORTED_ENABLED,
        "forted_transport": relay_transport,
        "forted_proxy": {
            "host": relay_proxy_host,
            "port": relay_proxy_port,
        },
        "forted_connected": relay.connected if relay and hasattr(relay, "connected") else False,
        "arb_count": len(_arbs_cache),
        "forted_frames_received": relay.frames_received if relay and hasattr(relay, "frames_received") else 0,
        "forted_forks_total": relay.forks_total if relay and hasattr(relay, "forks_total") else 0,
        "forted_bookmakers_total": relay.bookmakers_total if relay and hasattr(relay, "bookmakers_total") else 0,
        "forted_active_bookmakers": relay.bookmakers_active if relay and hasattr(relay, "bookmakers_active") else [],
        "forted_last_frame_at": relay.last_frame_at if relay and hasattr(relay, "last_frame_at") else None,
        "forted_last_error": relay.last_error if relay and hasattr(relay, "last_error") else None,
        "forted_last_disconnect": relay.last_disconnect_reason if relay and hasattr(relay, "last_disconnect_reason") else None,
        "forted_feed_url": FORTED_FEED_URL or None,
        "forted_feed_stream_url": FORTED_FEED_STREAM_URL or None,
        "forted_feed_use_sse": bool(FORTED_FEED_STREAM_URL),
        "forted_feed_min_profit": ROBINARB_FEED_MIN_PROFIT,
        "forted_feed_online_only": ROBINARB_FEED_ONLINE_ONLY,
        "feed_key_enabled": bool(ROBINARB_FEED_KEYS),
        "mock_fallback_enabled": ROBINARB_ALLOW_MOCK_FALLBACK,
        "robin_margin": robin_margin.stats(),
        "pinnacle_client_limiter": _pinnacle_client_limiter_status(),
        "stats_collector": _stats_collector.status() if _stats_collector else None,
        "forted_capability": (
            "status-only"
            if relay and getattr(relay, "bookmakers_total", 0) and not getattr(relay, "forks_total", 0)
            else "forks"
            if relay and getattr(relay, "forks_total", 0)
            else "unknown"
        ),
        "forted_filters": _get_forted_filters_snapshot(),
    }


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "time": time.time(),
    }


@app.get("/api/health/details")
async def health_details(current_username: str = Depends(_require_current_username)):
    _require_admin_username(current_username)
    return _health_details_payload()


@app.get("/api/stats/status")
async def stats_status(current_username: str = Depends(_require_current_username)):
    _ = current_username
    return _stats_collector.status() if _stats_collector else {"enabled": False, "started": False}


@app.get("/api/hidden-arbs")
async def list_hidden_arbs(current_username: str = Depends(_require_current_username)):
    items = _storage.list_hidden_items(current_username)
    public_items = [_public_hidden_item(item) for item in items]
    return {"items": public_items, "count": len(public_items), "ttl_sec": ROBINARB_HIDDEN_ARBS_TTL}


@app.post("/api/hidden-arbs")
async def hide_arb(req: HideArbRequest, current_username: str = Depends(_require_current_username)):
    arb = _find_arb_by_id(req.arb_id)
    if not arb:
        raise HTTPException(404, "Arb not found")
    item = _hidden_item_from_arb(current_username, arb, req.scope)
    stored = _storage.upsert_hidden_item(current_username, item)
    return {"item": _public_hidden_item(stored), "ttl_sec": ROBINARB_HIDDEN_ARBS_TTL}


@app.delete("/api/hidden-arbs/{item_id}")
async def restore_hidden_arb(item_id: str, current_username: str = Depends(_require_current_username)):
    restored = _storage.delete_hidden_item(current_username, item_id)
    if not restored:
        raise HTTPException(404, "Hidden item not found")
    return {"restored": True, "id": item_id}


def _calc_robin_profit_pct(robin_odds: float, counter_odds: float) -> float:
    if robin_odds > 1 and counter_odds > 1:
        return (1 / (1 / robin_odds + 1 / counter_odds) - 1) * 100
    return 0.0


def _raw_selection_for_robin_work(arb: dict[str, Any]) -> str:
    metadata = arb.get("pinnacle_market_metadata") if isinstance(arb.get("pinnacle_market_metadata"), dict) else {}
    return str(
        metadata.get("raw_selection")
        or arb.get("bk1_selection")
        or arb.get("side1")
        or ""
    ).strip()


async def _stream_lookup_for_robin_work(
    arb: dict[str, Any],
    raw_selection: str,
    event_id: str | None,
) -> dict[str, Any] | None:
    source = str(arb.get("_source") or _arbs_source or "").strip()
    if source not in {"forted", "listener"}:
        return None
    if _arb_market_context(arb):
        return None
    try:
        return await pinnacle_hub.lookup_stream_price(
            sport_label=str(arb.get("sport") or ""),
            event_id=event_id or arb.get("event_id"),
            raw_selection=raw_selection,
            market=str(arb.get("market") or ""),
            outcome=str(arb.get("bk1_outcome") or ""),
            selection_id=arb.get("pinnacle_selection_id"),
            odds_id=arb.get("pinnacle_odds_id"),
            line_id=arb.get("pinnacle_line_id"),
            period=_stream_lookup_period({"market_metadata": arb.get("pinnacle_market_metadata") or {}}),
            reverse_teams=_pinnacle_stream_teams_reversed(arb),
        )
    except Exception as exc:
        log.debug("RobinWork stream lookup failed for %s: %s", arb.get("id"), exc)
        return None


def _build_pinnacle_market_margin_payload(arb: dict[str, Any], raw_selection: str) -> dict[str, Any]:
    md = arb.get("pinnacle_market_metadata") if isinstance(arb.get("pinnacle_market_metadata"), dict) else {}
    try:
        period_hint = int(md.get("period_number") or 0) or 0
    except (TypeError, ValueError):
        period_hint = 0
    service_outcome = _forted_translate_for_pinnacle_service(raw_selection, arb, period_hint) if raw_selection else None

    verify_payload = _build_pinnacle_verify_payload(arb)
    _normalize_verify_payload_for_service_outcome(
        verify_payload,
        raw_selection=raw_selection,
        service_outcome=service_outcome,
    )

    payload: dict[str, Any] = dict(verify_payload)
    outcome = service_outcome or str(verify_payload.get("outcome") or "").strip()
    if outcome:
        payload["outcome"] = outcome

    event_id = _to_int_or_none(verify_payload.get("event_id")) or _pinnacle_event_id_for_arb(arb)
    if event_id:
        payload["event_id"] = event_id
    else:
        payload.pop("event_id", None)

    payload["period"] = period_hint
    sport_label = str(arb.get("sport") or md.get("sport") or verify_payload.get("sport_name") or "").strip()
    if sport_label:
        payload["sport"] = sport_label
        payload["sport_name"] = sport_label
    if raw_selection:
        payload["raw_selection"] = raw_selection

    line_val = md.get("line")
    if line_val is not None:
        parsed_line = _to_float_or_none(line_val)
        if parsed_line is not None:
            payload["handicap"] = parsed_line

    forted_home, forted_away = _forted_team_names_for_pinnacle(arb)
    if forted_home:
        payload["forted_home"] = forted_home
    if forted_away:
        payload["forted_away"] = forted_away
    return payload


async def _pinnacle_compact_margin_price_for_robin_work(
    arb: dict[str, Any],
    *,
    raw_selection: str,
    pin_odds: float,
    cache_key: str,
    price_signature: str | None,
) -> tuple[float, str] | None:
    if not PINNACLE_API_BASE or pin_odds <= 1:
        return None
    payload = _build_pinnacle_market_margin_payload(arb, raw_selection)
    if not payload.get("event_id") or not payload.get("outcome"):
        return None
    cache_lookup_key = _market_margin_cache_key(payload, pin_odds)
    cache_hit, cached_margin = _market_margin_cache_lookup(cache_lookup_key)
    if cache_hit:
        return cached_margin

    try:
        resp = await _pinnacle_service_post(
            "/market-margin",
            payload,
            scope="market-margin",
            wait=False,
        )
        try:
            body = resp.json()
        except Exception:
            body = {"body": resp.text}
        resp.raise_for_status()
    except _PinnacleClientRateLimited as exc:
        log.debug("RobinWork PS3838 compact margin locally throttled for %s: %s", arb.get("id"), exc.reason)
        _market_margin_cache_set(cache_lookup_key, None)
        return None
    except Exception as exc:
        log.debug("RobinWork PS3838 compact margin lookup failed for %s: %s", arb.get("id"), exc)
        _market_margin_cache_set(cache_lookup_key, None)
        return None

    if not isinstance(body, dict) or str(body.get("status") or "").upper() != "OK":
        log.debug(
            "RobinWork PS3838 compact margin unavailable for %s: %s",
            arb.get("id"),
            body if isinstance(body, dict) else type(body).__name__,
        )
        _market_margin_cache_set(cache_lookup_key, None)
        return None

    margin = _to_float_or_none(body.get("margin"))
    if margin is None or margin < 0:
        _market_margin_cache_set(cache_lookup_key, None)
        return None
    robin_odds = robin_margin.compute_robin_odds(pin_odds, margin)
    signature = str(price_signature or body.get("price_signature") or "")
    body_source = str(body.get("source") or "").strip().lower()
    source = "ps3838-more-bet" if body_source in {"more_bet", "ps3838-more-bet"} else "ps3838-compact"
    robin_margin.cache_robin_odds(
        cache_key,
        pin_odds,
        robin_odds,
        source,
        price_signature=signature,
    )
    result = (robin_odds, source)
    _market_margin_cache_set(cache_lookup_key, result)
    log.debug(
        "RobinWork PS3838 margin arb=%s event=%s source=%s margin=%.4f pin=%.4f robin=%.4f",
        arb.get("id"),
        payload.get("event_id"),
        source,
        margin,
        pin_odds,
        robin_odds,
    )
    return result


def _fresh_betfair_live_odds(arb: dict[str, Any]) -> float | None:
    verified_at = _to_float_or_none(arb.get("betfair_verified_at")) or 0.0
    if not verified_at or time.time() - verified_at > ROBINARB_BETFAIR_LIVE_QUOTE_TTL_SEC:
        return None
    odds = _to_float_or_none(arb.get("betfair_live_odds"))
    return odds if odds is not None and odds > 1 else None


def _apply_robin_price(
    arb: dict[str, Any],
    robin_odds: float,
    *,
    source: str,
    robin_work_enabled: bool,
    selected: bool,
    rank: int | None = None,
    rank_profit_pct: float | None = None,
) -> None:
    # RobinWork refreshes the Betfair counter leg independently. Keep the
    # feed value intact for traceability, but calculate/rank with a fresh
    # exchange quote when one is available.
    counter_odds = (
        _fresh_betfair_live_odds(arb)
        if robin_work_enabled and betfair_executor.is_betfair_fork(arb)
        else None
    ) or _to_float_or_none(arb.get("bk2_odds")) or 0.0
    profit_pct = _calc_robin_profit_pct(robin_odds, counter_odds)
    arb["robin_odds"] = round(robin_odds, 3)
    arb["robin_profit_pct"] = round(profit_pct, 2)
    arb["robin_price_source"] = source
    arb["robin_work_enabled"] = bool(robin_work_enabled)
    arb["robin_work_selected"] = bool(selected)
    arb["robin_work_rank"] = rank
    if rank_profit_pct is not None:
        arb["robin_work_rank_profit_pct"] = round(rank_profit_pct, 2)


def _apply_default_robin_price(arb: dict[str, Any], robin_work_enabled: bool) -> float:
    pin_odds = _to_float_or_none(arb.get("bk1_odds")) or 0.0
    fallback_odds = robin_margin.fallback_by_odds(pin_odds) if pin_odds > 1 else pin_odds
    baseline_profit = _calc_robin_profit_pct(fallback_odds, _to_float_or_none(arb.get("bk2_odds")) or 0.0)
    _apply_robin_price(
        arb,
        fallback_odds,
        source="fallback-table",
        robin_work_enabled=robin_work_enabled,
        selected=False,
        rank_profit_pct=baseline_profit,
    )
    return baseline_profit


_PRICED_ARB_SYNC_FIELDS = (
    "robin_odds",
    "robin_profit_pct",
    "robin_price_source",
    "robin_work_enabled",
    "robin_work_selected",
    "robin_work_rank",
    "robin_work_rank_profit_pct",
    "market_context",
    "market_context_label",
    "display_market",
    "pinnacle_market_metadata",
    "pinnacle_service_outcome",
    "pinnacle_stat_event_id",
    "pinnacle_hub_event_id",
    "pinnacle_line_id",
    "robin_work_verification_blocked",
    "robin_work_verification_block_reason",
    "betfair_live_odds",
    "betfair_verified_at",
    "betfair_verify_status",
    "betfair_verify_detail",
)


def _copy_sync_value(value: Any) -> Any:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, list):
        return list(value)
    return value


def _sync_priced_arbs(arbs: list[dict[str, Any]]) -> None:
    by_id = {
        str(arb.get("id") or ""): arb
        for arb in arbs
        if str(arb.get("id") or "").strip()
    }
    if not by_id:
        return

    def apply(target: dict[str, Any], source: dict[str, Any]) -> None:
        for field in _PRICED_ARB_SYNC_FIELDS:
            if field in source:
                target[field] = _copy_sync_value(source[field])

    for cached in _arbs_cache:
        source = by_id.get(str(cached.get("id") or ""))
        if source is not None and source is not cached:
            apply(cached, source)

    with _rolling_arbs_lock:
        for cached in _rolling_arbs.values():
            source = by_id.get(str(cached.get("id") or ""))
            if source is not None and source is not cached:
                apply(cached, source)


async def _robin_work_price_for_arb(arb: dict[str, Any]) -> tuple[float, str]:
    pin_odds = _to_float_or_none(arb.get("bk1_odds")) or 0.0
    if pin_odds <= 1:
        return pin_odds, "fallback-table"

    raw_selection = _raw_selection_for_robin_work(arb)
    event_id = str(arb.get("pinnacle_hub_event_id") or "").strip()
    cache_event_id = event_id or str(arb.get("event_id") or "").strip() or None
    cache_key = robin_margin.stream_cache_key(
        cache_event_id,
        str(arb.get("sport") or ""),
        raw_selection,
        str(arb.get("market") or ""),
    )
    arcadia_margin = _to_float_or_none(arb.get("pinnacle_arcadia_market_margin"))
    if arcadia_margin is not None and arcadia_margin >= 0.0:
        signature = f"arcadia:{event_id}:{arb.get('pinnacle_arcadia_market_key') or ''}"
        robin_odds = robin_margin.compute_robin_odds(pin_odds, arcadia_margin)
        robin_margin.cache_robin_odds(
            cache_key,
            pin_odds,
            robin_odds,
            "pinnacle-arcadia",
            price_signature=signature,
        )
        return robin_odds, "pinnacle-arcadia"

    stream_lookup = await _stream_lookup_for_robin_work(arb, raw_selection, event_id or None)
    price_signature = ""
    if stream_lookup:
        # RobinWork needs the stream's complete market pair to calculate the
        # margin, but the selected-leg price must stay bound to the Forted
        # fork.  When Forted has no Pinnacle selection/odds id, the FULL_ODDS
        # lookup is selection-only and can resolve a neighbouring line whose
        # price is very different.  Replacing the fork price with that row
        # creates a large, non-executable ROI even though the exact betslip
        # still agrees with Forted.
        price_signature = str(stream_lookup.get("market_signature") or "")

    cached_robin_odds = robin_margin.cached_robin_odds(
        cache_key,
        pin_odds,
        price_signature=price_signature,
    )
    if cached_robin_odds is not None:
        entry = robin_margin.cached_price_entry(cache_key) or {}
        source = str(entry.get("source") or "cache")
        if robin_margin.is_authoritative_price_source(source) or not event_id:
            return cached_robin_odds, source

    stream_margin = _to_float_or_none(stream_lookup.get("market_margin") if stream_lookup else None)
    if stream_margin is not None and stream_margin >= 0.0:
        robin_odds = robin_margin.compute_robin_odds(pin_odds, stream_margin)
        robin_margin.cache_robin_odds(
            cache_key,
            pin_odds,
            robin_odds,
            "pinnacle-stream",
            price_signature=price_signature,
        )
        return robin_odds, "pinnacle-stream"

    market_context = _arb_market_context(arb)
    if event_id and market_context:
        compact_price = await _pinnacle_compact_margin_price_for_robin_work(
            arb,
            raw_selection=raw_selection,
            pin_odds=pin_odds,
            cache_key=cache_key,
            price_signature=price_signature,
        )
        if compact_price is not None:
            return compact_price

    if event_id and not market_context:
        await robin_margin.ensure_board(event_id)
    robin_odds = robin_margin.robin_odds_for(
        pin_odds,
        event_id or None,
        str(arb.get("sport") or ""),
        raw_selection,
        cache_key=cache_key,
        price_signature=price_signature,
    )
    entry = robin_margin.cached_price_entry(cache_key) or {}
    source = str(entry.get("source") or "stream-fallback")
    if event_id and entry.get("source") == "stream-fallback":
        compact_price = await _pinnacle_compact_margin_price_for_robin_work(
            arb,
            raw_selection=raw_selection,
            pin_odds=pin_odds,
            cache_key=cache_key,
            price_signature=price_signature,
        )
        if compact_price is not None:
            return compact_price
    return robin_odds, source


def _robin_work_verification_block_reason(arb: dict[str, Any]) -> str:
    metadata = arb.get("pinnacle_market_metadata") if isinstance(arb.get("pinnacle_market_metadata"), dict) else {}
    family = _canonical_market_family(str(metadata.get("family") or arb.get("market") or ""))
    if str(arb.get("sport") or "").strip().lower() == "tennis" and family == "Game Winner":
        if not _to_int_or_none(metadata.get("game_number")):
            return "Forted did not provide the tennis game number required for an exact BIA game quote"
    if str(arb.get("sport") or "").strip().lower() == "esports":
        raw_selection = str(metadata.get("raw_selection") or arb.get("bk1_selection") or "").strip().lower()
        if re.match(r"^(?:\d+\s*(?:к|карта|map)\b|(?:раунд|round)\s*\d+\b)", raw_selection):
            return "BIA has no confirmed exact serializer/event mapping for this esports map or round market"
    return ""


async def _apply_robin_work_pricing(arbs: list[dict[str, Any]], enabled: bool) -> list[str]:
    baselines_by_bookmaker: dict[str, list[tuple[float, float, str, dict[str, Any]]]] = {}
    for arb in arbs:
        baseline = _apply_default_robin_price(arb, enabled)
        block_reason = _robin_work_verification_block_reason(arb)
        arb["robin_work_verification_blocked"] = bool(block_reason)
        arb["robin_work_verification_block_reason"] = block_reason or None
        if enabled and block_reason:
            continue
        row = (baseline, float(arb.get("profit_pct") or 0.0), str(arb.get("id") or ""), arb)
        baselines_by_bookmaker.setdefault(_counter_bookmaker_group_key(arb), []).append(row)
    if not enabled:
        return []

    # Collect all arbs we need to price across all bookmakers to run them concurrently
    to_price_info: list[tuple[str, float, float, str, dict[str, Any]]] = []
    for bookmaker_key in sorted(baselines_by_bookmaker):
        baselines = baselines_by_bookmaker[bookmaker_key]
        baselines.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)
        for baseline, pin_profit, arb_id, arb in baselines[:ROBINARB_ROBIN_WORK_CANDIDATE_N]:
            to_price_info.append((bookmaker_key, baseline, pin_profit, arb_id, arb))

    if not to_price_info:
        return []

    # Run pricing and, for Betfair counter legs, a fresh Exchange quote in
    # parallel. The quote helper treats this as low-priority RobinWork traffic
    # and yields immediately whenever a basket check is waiting.
    pricing_tasks = [_robin_work_price_for_arb(item[4]) for item in to_price_info]
    pricing_results = await asyncio.gather(*pricing_tasks, return_exceptions=True)
    betfair_task_indexes = [
        index
        for index, item in enumerate(to_price_info)
        if ROBINARB_BETFAIR_ROBIN_WORK_VERIFY_ENABLED and betfair_executor.is_betfair_fork(item[4])
    ]
    betfair_results = await asyncio.gather(
        *[_resolve_betfair_quote(to_price_info[index][4], scope="robin-work", wait=False) for index in betfair_task_indexes],
        return_exceptions=True,
    )
    betfair_by_arb_id: dict[str, dict[str, Any]] = {}
    for task_index, result in zip(betfair_task_indexes, betfair_results):
        if isinstance(result, Exception):
            log.debug("RobinWork Betfair quote failed for %s: %s", to_price_info[task_index][3], result)
            continue
        if isinstance(result, dict):
            betfair_by_arb_id[to_price_info[task_index][3]] = result

    # Distribute the priced results back to their bookmaker groups
    candidates_by_bookmaker: dict[str, list[tuple[float, float, float, str, dict[str, Any], float, str]]] = {}
    for idx, (bookmaker_key, baseline, pin_profit, arb_id, arb) in enumerate(to_price_info):
        res = pricing_results[idx]
        if isinstance(res, Exception):
            log.error("Error in concurrent _robin_work_price_for_arb for %s: %s", arb_id, res)
            robin_odds, source = 1.0, "error"
        else:
            robin_odds, source = res
        betfair_quote = betfair_by_arb_id.get(arb_id)
        if betfair_quote:
            arb["betfair_verify_status"] = betfair_quote.get("status")
            arb["betfair_verify_detail"] = betfair_quote.get("detail")
            quote_odds = _to_float_or_none(betfair_quote.get("current_odds"))
            if betfair_quote.get("verified") and quote_odds is not None and quote_odds > 1:
                arb["betfair_live_odds"] = quote_odds
                arb["betfair_verified_at"] = time.time()
        counter_odds = (
            _fresh_betfair_live_odds(arb)
            if betfair_executor.is_betfair_fork(arb)
            else None
        ) or _to_float_or_none(arb.get("bk2_odds")) or 0.0
        actual_profit = _calc_robin_profit_pct(robin_odds, counter_odds)
        row = (actual_profit, baseline, pin_profit, arb_id, arb, robin_odds, source)
        candidates_by_bookmaker.setdefault(bookmaker_key, []).append(row)

    selected: list[str] = []
    for bookmaker_key in sorted(baselines_by_bookmaker):
        candidate_rows = candidates_by_bookmaker.get(bookmaker_key, [])
        candidate_rows.sort(key=lambda item: (item[0], item[1], item[2], item[3]), reverse=True)
        selected_rows = [
            row
            for row in candidate_rows
            if row[6] != "error"
        ][:ROBINARB_ROBIN_WORK_TOP_N]
        selected_rank = {
            arb_id: rank
            for rank, (_actual, _baseline, _pin_profit, arb_id, _arb, _odds, _source)
            in enumerate(selected_rows, start=1)
        }
        selected.extend(arb_id for _actual, _baseline, _pin_profit, arb_id, _arb, _odds, _source in selected_rows)

        for actual_profit, _baseline, _pin_profit, arb_id, arb, robin_odds, source in candidate_rows:
            is_selected = arb_id in selected_rank
            _apply_robin_price(
                arb,
                robin_odds,
                source=source,
                robin_work_enabled=True,
                selected=is_selected,
                rank=selected_rank.get(arb_id),
                rank_profit_pct=actual_profit,
            )
    return selected


def _observe_stats_candidates(arbs: list[dict[str, Any]], *, source: str) -> None:
    collector = _stats_collector
    if collector is None or not arbs:
        return
    arbs = [arb for arb in arbs if not _is_draw_prone_moneyline_arb(arb)]
    arbs = _filter_stats_candidates_with_fresh_pin888_stream(arbs)
    if not arbs:
        return
    collector.observe_snapshot(arbs, source=source)


def _filter_stats_candidates_with_fresh_pin888_stream(arbs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    global _stats_stream_block_logged_at
    if not PIN888_STREAM_CACHE_ENABLED or not arbs:
        return arbs
    status = pinnacle_hub.stream_cache_status()
    sports = status.get("sports") if isinstance(status, dict) else {}
    if not isinstance(sports, dict) or not sports:
        fresh: list[dict[str, Any]] = []
    else:
        max_age = float(getattr(pinnacle_hub, "STREAM_STATE_MAX_AGE_SEC", 15.0))
        fresh = []
        for arb in arbs:
            slug = pinnacle_hub.sport_slug_for_label(str(arb.get("sport") or ""))
            sport_state = sports.get(slug or "")
            if not isinstance(sport_state, dict):
                continue
            age = _to_float_or_none(sport_state.get("age_sec"))
            if age is not None and age <= max_age:
                fresh.append(arb)
    if not fresh:
        now = time.time()
        if now - _stats_stream_block_logged_at > 60.0:
            _stats_stream_block_logged_at = now
            log.warning("stats collector paused: pin888 stream cache is empty or stale")
    return fresh


async def _stats_price_for_arb(arb: dict[str, Any]) -> dict[str, Any] | None:
    pin_odds = _to_float_or_none(arb.get("bk1_odds")) or 0.0
    if pin_odds <= 1:
        return None
    working = dict(arb)
    if isinstance(working.get("pinnacle_market_metadata"), dict):
        working["pinnacle_market_metadata"] = dict(working["pinnacle_market_metadata"])
    robin_odds, source = await _robin_work_price_for_arb(working)
    counter_odds = _to_float_or_none(arb.get("bk2_odds")) or 0.0
    return {
        "robin_odds": robin_odds,
        "robin_profit_pct": _calc_robin_profit_pct(robin_odds, counter_odds),
        "source": source,
        "margin_calculated": robin_margin.is_authoritative_price_source(source),
        "target_margin": robin_margin.TARGET_MARGIN,
    }


async def _stats_monitor_price(arb: dict[str, Any]) -> dict[str, Any] | None:
    verify_payload = _build_pinnacle_verify_payload(arb)
    arcadia = await _arcadia_quote_payload(arb, verify_payload)
    if arcadia is not None:
        return arcadia
    stream_unavailable: dict[str, Any] | None = None
    market_context = _arb_market_context(arb)
    if market_context:
        lookup = None
        stream_unavailable = {
            "verified": False,
            "status": "UNAVAILABLE",
            "current_odds": None,
            "source": "pinnacle-stream",
            "timestamp": time.time(),
            "detail": f"Pinnacle FULL_ODDS stream cannot verify contextual market: {market_context}",
        }
    else:
        try:
            lookup = await pinnacle_hub.lookup_stream_price(
                sport_label=str(arb.get("sport") or verify_payload.get("sport_name") or verify_payload.get("sport") or ""),
                event_id=arb.get("pinnacle_hub_event_id") or verify_payload.get("event_id") or arb.get("event_id"),
                raw_selection=_stream_lookup_raw_selection(arb, verify_payload),
                market=str(verify_payload.get("market") or arb.get("market") or ""),
                outcome=str(verify_payload.get("outcome") or arb.get("bk1_outcome") or ""),
                selection_id=verify_payload.get("selection_id") or arb.get("pinnacle_selection_id"),
                odds_id=verify_payload.get("odds_id") or arb.get("pinnacle_odds_id"),
                line_id=verify_payload.get("line_id") or arb.get("pinnacle_line_id"),
                period=_stream_lookup_period(verify_payload),
                reverse_teams=_pinnacle_stream_teams_reversed(arb),
            )
        except Exception as exc:  # noqa: BLE001 - one source failure must not abort the monitor batch
            lookup = None
            stream_unavailable = {
                "verified": False,
                "status": "UNAVAILABLE",
                "current_odds": None,
                "source": "pinnacle-stream",
                "timestamp": time.time(),
                "detail": f"Pinnacle stream request failed: {type(exc).__name__}: {exc}",
            }
    if lookup is None:
        if stream_unavailable is None:
            stream_unavailable = {
                "verified": False,
                "status": "UNAVAILABLE",
                "current_odds": None,
                "source": "pinnacle-stream",
                "timestamp": time.time(),
                "detail": "Pinnacle stream has no matching price for this outcome",
            }
    else:
        if not _stream_lookup_binding_is_trusted(verify_payload, lookup):
            stream_unavailable = {
                "verified": False,
                "status": "UNAVAILABLE",
                "current_odds": None,
                "source": "pinnacle-stream",
                "timestamp": time.time(),
                "detail": "Pinnacle stream did not match the verified selection identifiers",
                "stream_lookup": {
                    key: lookup.get(key)
                    for key in ("slug", "matched_by", "snapshot_ts", "event_id", "line_id", "odds_id")
                },
            }
        else:
            payload = _stream_quote_payload_from_lookup(arb, verify_payload, lookup)
            payload_odds = _to_float_or_none((payload or {}).get("current_odds"))
            suspicious_detail = (
                _untrusted_pinnacle_quote_suspicion(arb, payload_odds, verify_payload)
                if payload is not None and payload_odds is not None
                else None
            )
            if payload is not None and not suspicious_detail:
                return payload
            stream_unavailable = {
                "verified": False,
                "status": "UNAVAILABLE",
                "current_odds": None,
                "source": "pinnacle-stream",
                "timestamp": time.time(),
                "detail": suspicious_detail or "Pinnacle stream lookup could not be converted to a quote",
            }

    betslip = await _stats_verify_betslip_price(arb)
    betslip_odds = _to_float_or_none((betslip or {}).get("current_odds"))
    if betslip and betslip.get("verified") and betslip_odds is not None and betslip_odds > 1:
        detail_parts = [str(betslip.get("detail") or "Pinnacle betslip monitor quote")]
        if stream_unavailable and stream_unavailable.get("detail"):
            detail_parts.append(f"stream fallback: {stream_unavailable['detail']}")
        payload = dict(betslip)
        payload["source"] = "pinnacle-betslip-monitor"
        payload["detail"] = "; ".join(detail_parts)
        if stream_unavailable and stream_unavailable.get("stream_lookup"):
            payload["stream_lookup"] = stream_unavailable.get("stream_lookup")
        return payload

    if betslip and not stream_unavailable:
        return betslip
    if stream_unavailable and betslip and betslip.get("detail"):
        stream_unavailable["detail"] = f"{stream_unavailable['detail']}; betslip fallback: {betslip.get('detail')}"
    return stream_unavailable or betslip


async def _stats_verify_betslip_price(arb: dict[str, Any]) -> dict[str, Any] | None:
    if not ROBINARB_STATS_BETSLIP_ENABLED:
        return {
            "verified": False,
            "status": "UNAVAILABLE",
            "current_odds": None,
            "feed_odds": arb.get("bk1_odds"),
            "selection": arb.get("bk1_selection"),
            "source": "pinnacle-betslip",
            "timestamp": time.time(),
            "detail": "Stats betslip verification is disabled",
        }

    md = arb.get("pinnacle_market_metadata") or {}
    raw_metadata_selection = str(md.get("raw_selection") or "").strip()
    raw_selection = raw_metadata_selection or str(arb.get("bk1_selection") or "").strip()
    try:
        period_hint = int(md.get("period_number") or 0) or 0
    except (TypeError, ValueError):
        period_hint = 0
    ps_outcome = _forted_translate_for_pinnacle_service(raw_selection, arb, period_hint) if raw_selection else None

    verify_payload = _build_pinnacle_verify_payload(arb)
    _normalize_verify_payload_for_service_outcome(
        verify_payload,
        raw_selection=raw_selection,
        service_outcome=ps_outcome,
    )
    event_id_int = _to_int_or_none(verify_payload.get("event_id")) or 0
    verify_outcome = str(verify_payload.get("outcome") or "").strip()
    service_outcome = ps_outcome or verify_outcome
    has_pinnacle_identifier = any(
        _clean_pinnacle_identifier(arb.get(key))
        for key in ("pinnacle_selection_id", "pinnacle_odds_id", "pinnacle_line_id")
    )
    if not PINNACLE_API_BASE:
        return {
            "verified": False,
            "status": "UNAVAILABLE",
            "current_odds": None,
            "feed_odds": arb.get("bk1_odds"),
            "selection": arb.get("bk1_selection"),
            "source": "pinnacle-betslip",
            "timestamp": time.time(),
            "detail": "PINNACLE_API_BASE is not configured",
        }
    if not service_outcome or not (event_id_int or has_pinnacle_identifier):
        return {
            "verified": False,
            "status": "UNAVAILABLE",
            "current_odds": None,
            "feed_odds": arb.get("bk1_odds"),
            "selection": arb.get("bk1_selection"),
            "source": "pinnacle-betslip",
            "timestamp": time.time(),
            "detail": "Cannot build a Pinnacle betslip verification payload for this fork",
        }

    bet_payload: dict[str, Any] = dict(verify_payload)
    bet_payload["outcome"] = service_outcome
    if event_id_int:
        bet_payload["event_id"] = event_id_int
    else:
        bet_payload.pop("event_id", None)
    bet_payload["period"] = period_hint
    sport_label = str(arb.get("sport") or md.get("sport") or "").strip()
    if sport_label:
        bet_payload["sport"] = sport_label
    line_val = md.get("line")
    if line_val is not None:
        parsed_line = _to_float_or_none(line_val)
        if parsed_line is not None:
            bet_payload["handicap"] = parsed_line
    if raw_selection:
        bet_payload["raw_selection"] = raw_selection
    forted_home, forted_away = _forted_team_names_for_pinnacle(arb)
    if forted_home:
        bet_payload["forted_home"] = forted_home
    if forted_away:
        bet_payload["forted_away"] = forted_away

    more_bet_lookup: dict[str, Any] | None = None
    family = _canonical_market_family(str(md.get("family") or arb.get("market") or ""))
    if not (str(arb.get("sport") or "").strip().lower() == "tennis" and family == "Game Winner"):
        try:
            more_bet_lookup = await _enrich_betslip_payload_from_more_bet(
                arb,
                verify_payload,
                bet_payload,
                raw_selection=raw_selection,
                period=period_hint,
            )
        except Exception as exc:
            log.debug("stats verify: pin888 MORE_BET line lookup failed for %s: %s", arb.get("id"), exc)

    bet_service_detail = ""
    try:
        resp = await _pinnacle_service_post("/verify", bet_payload, scope="stats-verify", wait=False)
        resp.raise_for_status()
        body = resp.json()
        results = body.get("results") or []
    except _PinnacleClientRateLimited as exc:
        results = []
        bet_service_detail = f"bet_service locally throttled: retry after {exc.retry_after}s"
    except Exception as exc:
        results = []
        exc_detail = str(exc).strip() or repr(exc)
        bet_service_detail = f"bet_service request failed: {type(exc).__name__}: {exc_detail}"

    status_priority = {"OK": 0, "ODDS_CHANGE": 1, "PROCESSING": 2}
    actionable: list[tuple[int, int, dict[str, Any], float, str]] = []
    unavailable_candidate: dict[str, Any] | None = None
    for idx, candidate in enumerate(results):
        status_raw = str(candidate.get("status") or "").upper()
        current_odds = _to_float_or_none(candidate.get("odds"))
        error_code = candidate.get("error_code")
        if (
            status_raw in status_priority
            and current_odds is not None
            and math.isfinite(current_odds)
            and current_odds > 1
        ):
            actionable.append((status_priority[status_raw], idx, candidate, current_odds, status_raw))
            continue
        if unavailable_candidate is None and status_raw:
            unavailable_candidate = candidate
        if status_raw and not bet_service_detail:
            bet_service_detail = f"bet_service status={status_raw}" + (f" ({error_code})" if error_code else "")

    actionable.sort(key=lambda item: (item[0], item[1]))
    for _prio, _idx, candidate, current_odds, status_raw in actionable:
        if not _pinnacle_result_matches_request(verify_payload, candidate):
            continue
        suspicious_detail = _untrusted_pinnacle_quote_suspicion(arb, current_odds, verify_payload)
        if suspicious_detail:
            return {
                "verified": False,
                "status": "MISMATCH",
                "current_odds": current_odds,
                "feed_odds": _to_float_or_none(arb.get("bk1_odds")),
                "selection": arb.get("bk1_selection"),
                "outcome": verify_outcome or service_outcome,
                "source": "pinnacle-betslip",
                "timestamp": time.time(),
                "detail": suspicious_detail,
                "event_id": event_id_int or None,
                "selection_id": _pinnacle_result_identifier(candidate, "selection_id"),
                "odds_id": _pinnacle_result_identifier(candidate, "odds_id"),
                "line_id": _pinnacle_result_identifier(candidate, "line_id"),
                "max_stake": candidate.get("max_stake"),
                "quote_id": None,
                "market_metadata": md,
                "error_code": "SUSPICIOUS_ODDS_MOVE",
            }
        response_payload = {
            "verified": True,
            "status": "OK",
            "current_odds": current_odds,
            "feed_odds": _to_float_or_none(arb.get("bk1_odds")),
            "selection": arb.get("bk1_selection"),
            "outcome": verify_outcome or service_outcome,
            "source": "pinnacle-betslip",
            "timestamp": time.time(),
            "detail": f"Pinnacle betslip verified at odds {current_odds}",
            "event_id": event_id_int or None,
            "selection_id": _pinnacle_result_identifier(candidate, "selection_id")
                or _clean_pinnacle_identifier(verify_payload.get("selection_id")),
            "odds_id": _pinnacle_result_identifier(candidate, "odds_id")
                or _clean_pinnacle_identifier(verify_payload.get("odds_id")),
            "line_id": _pinnacle_result_identifier(candidate, "line_id")
                or _clean_pinnacle_identifier(verify_payload.get("line_id")),
            "max_stake": candidate.get("max_stake"),
            "quote_id": None,
            "market_metadata": verify_payload.get("market_metadata") if isinstance(verify_payload.get("market_metadata"), dict) else md,
            "result_status": status_raw,
        }
        if more_bet_lookup:
            response_payload["line_source"] = str(more_bet_lookup.get("source") or "pinnacle-more-bet")
            response_payload["pin888_more_bet_cached"] = bool(more_bet_lookup.get("cached"))
        return response_payload

    if actionable:
        mismatch_candidate = actionable[0][2]
        mismatch_odds = actionable[0][3]
        return {
            "verified": False,
            "status": "MISMATCH",
            "current_odds": mismatch_odds,
            "feed_odds": _to_float_or_none(arb.get("bk1_odds")),
            "selection": arb.get("bk1_selection"),
            "outcome": verify_outcome or service_outcome,
            "source": "pinnacle-betslip",
            "timestamp": time.time(),
            "detail": bet_service_detail or "Pinnacle returned a quote that does not match the requested selection.",
            "event_id": event_id_int or None,
            "selection_id": _pinnacle_result_identifier(mismatch_candidate, "selection_id"),
            "odds_id": _pinnacle_result_identifier(mismatch_candidate, "odds_id"),
            "line_id": _pinnacle_result_identifier(mismatch_candidate, "line_id"),
            "max_stake": mismatch_candidate.get("max_stake"),
            "quote_id": None,
            "market_metadata": md,
        }

    if unavailable_candidate is not None:
        described = _describe_pinnacle_verify_detail(arb, unavailable_candidate)
        unavailable_status = str(unavailable_candidate.get("status") or "").upper() or "UNAVAILABLE"
        return {
            "verified": False,
            "status": unavailable_status,
            "current_odds": None,
            "feed_odds": _to_float_or_none(arb.get("bk1_odds")),
            "selection": arb.get("bk1_selection"),
            "outcome": verify_outcome or service_outcome,
            "source": "pinnacle-betslip",
            "timestamp": time.time(),
            "detail": described or bet_service_detail or "Pinnacle returned no live quote for this market.",
            "event_id": event_id_int or None,
            "selection_id": _clean_pinnacle_identifier(arb.get("pinnacle_selection_id")),
            "odds_id": _clean_pinnacle_identifier(arb.get("pinnacle_odds_id")),
            "line_id": _clean_pinnacle_identifier(verify_payload.get("line_id")) or _clean_pinnacle_identifier(arb.get("pinnacle_line_id")),
            "quote_id": None,
            "market_metadata": md,
            "error_code": unavailable_candidate.get("error_code"),
        }

    return {
        "verified": False,
        "status": "UNAVAILABLE",
        "current_odds": None,
        "feed_odds": _to_float_or_none(arb.get("bk1_odds")),
        "selection": arb.get("bk1_selection"),
        "outcome": verify_outcome or service_outcome,
        "source": "pinnacle-betslip",
        "timestamp": time.time(),
        "detail": bet_service_detail or "Pinnacle returned no live quote for this market.",
        "event_id": event_id_int or None,
        "selection_id": arb.get("pinnacle_selection_id"),
        "odds_id": arb.get("pinnacle_odds_id"),
        "line_id": _clean_pinnacle_identifier(verify_payload.get("line_id")) or arb.get("pinnacle_line_id"),
        "market_metadata": md,
    }


@app.get("/api/arbs")
async def get_arbs(
    sport: Optional[str] = None,
    market: Optional[str] = None,
    bookmaker: Optional[str] = None,
    search: Optional[str] = None,
    min_profit: float = 0.0,
    live: Optional[str] = None,
    refresh: bool = False,
    robin_work: bool = False,
    current_username: str = Depends(_require_current_username),
):
    global _arbs_cache, _arbs_source, _arbs_updated_at
    _ = current_username

    if refresh and _relay_thread and hasattr(_relay_thread, "request_refresh"):
        try:
            _relay_thread.request_refresh()
        except Exception as exc:
            log.warning("manual refresh trigger failed: %s", exc)
        else:
            await asyncio.sleep(0.5)

    # Refresh mock if no Forted data for > 120s
    if (
        ROBINARB_ALLOW_MOCK_FALLBACK
        and _arbs_source not in {"forted", "listener"}
        and time.time() - _arbs_updated_at > 30
    ):
        _refresh_mock_arbs(25)

    _record_rolling_arbs(_arbs_cache)
    if _arbs_source in {"forted", "listener", "stale"}:
        merged = {
            _rolling_key(arb): arb
            for arb in _rolling_arbs_snapshot()
            if _arb_from_external_feed(arb, _arbs_source)
        }
        for arb in _arbs_cache:
            merged[_rolling_key(arb)] = arb
        all_arbs = list(merged.values())
    else:
        rolling = [
            arb
            for arb in _rolling_arbs_snapshot()
            if not _arb_from_external_feed(arb, _arbs_source)
        ]
        all_arbs = rolling if rolling else list(_arbs_cache)
    now = time.time()
    all_arbs = [
        arb
        for arb in all_arbs
        if not _arb_requires_live_freshness(arb, _arbs_source) or _live_arb_is_fresh(arb, now)
    ]
    hidden_items = _storage.list_hidden_items(current_username, now=now)
    all_arbs = _filter_hidden_arbs(all_arbs, hidden_items)
    all_arbs = [arb for arb in all_arbs if not _is_draw_prone_moneyline_arb(arb)]
    all_arbs = [arb for arb in all_arbs if _visible_for_frontend_overvalue(arb)]
    runtime_profile = await _runtime_lws_profile_for_arbs_filter()
    if runtime_profile:
        all_arbs = [
            arb
            for arb in all_arbs
            if _arb_counter_matches_lws_profile(arb, runtime_profile)
        ]
    result = all_arbs
    if sport:
        result = [a for a in result if a["sport"].lower() == sport.lower()]
    if market:
        result = [a for a in result if a["market"].lower() == market.lower()]
    if bookmaker:
        bookmaker_lower = bookmaker.lower()
        result = [a for a in result if bookmaker_lower in a["bk2"].lower()]
    if search:
        result = [a for a in result if _arb_matches_search(a, search)]
    if min_profit != 0.0:
        result = [a for a in result if a["profit_pct"] >= min_profit]
    if live in {"live", "prematch"}:
        want_live = live == "live"
        result = [a for a in result if _arb_is_live(a) == want_live]

    robin_work_selected = await _apply_robin_work_pricing(result, bool(robin_work))
    _sync_priced_arbs(result)
    # НЕ вызывать _record_rolling_arbs(result) здесь: `result` — отфильтрованный ответ,
    # мержащий rolling-cache items (в т.ч. призрачные форки, прошедшие устаревшую проверку
    # свежести на момент начала запроса, но уже отсутствующие в _arbs_cache). Запись result
    # в rolling заново проставила бы _snapshot_seen_at=now для призраков при каждом poll'е
    # (P0: живой UI поллит быстрее ROBINARB_FEED_STALE_AFTER -> призрак никогда не тухнет).
    # Top-up присутствующих форков уже делает _record_rolling_arbs(_arbs_cache) выше (строка
    # ~8153); pricing/robin_work поля для присутствующих форков синхронизирует _sync_priced_arbs
    # (по id, без трогания _snapshot_seen_at); для призраков `result`-элемент — тот же объект,
    # что уже лежит в _rolling_arbs (см. merge выше), мутация уже отражена по ссылке.
    payload = [
        {
            **arb,
            "age_sec": max(0, int(now - arb.get("updated_at", _arbs_updated_at))),
        }
        for arb in result
    ]
    return {
        "arbs": payload,
        "count": len(payload),
        "total_count": len(all_arbs),
        "source": _arbs_source,
        "updated_at": _arbs_updated_at,
        "hidden_count": len(hidden_items),
        "filters": _arb_filter_facets(all_arbs),
        "forted_filters": _get_forted_filters_snapshot(),
        "robin_work": {
            "enabled": bool(robin_work),
            "top_n": ROBINARB_ROBIN_WORK_TOP_N,
            "selected": robin_work_selected,
        },
    }


@app.get("/api/forks/feed")
async def get_forks_feed(
    limit: int = FORTED_FEED_LIMIT,
    access_subject: str = Depends(_require_feed_access),
):
    _ = access_subject
    safe_limit = max(1, min(int(limit), 1000))
    now = time.time()
    _record_rolling_arbs(_arbs_cache)
    if _arbs_source in {"forted", "listener", "stale"}:
        merged = {
            _rolling_key(arb): arb
            for arb in _rolling_arbs_snapshot()
            if _arb_from_external_feed(arb, _arbs_source)
        }
        for arb in _arbs_cache:
            merged[_rolling_key(arb)] = arb
        arbs = list(merged.values())
    else:
        arbs = list(_arbs_cache)
    arbs = [arb for arb in arbs if not _arb_requires_live_freshness(arb, _arbs_source) or _live_arb_is_fresh(arb, now)]
    return [_arb_to_feed_fork(arb, idx) for idx, arb in enumerate(arbs[:safe_limit])]


@app.get("/api/forted/filters")
async def get_forted_filters(current_username: str = Depends(_require_current_username)):
    _require_admin_or_superuser_username(current_username)
    user_filters = _get_user_forted_filters(current_username)
    user_filters["sports"] = [_translate_sport_label(value) for value in user_filters.get("sports", [])]
    user_filters["available_sports"] = list(ALL_SUPPORTED_SPORTS)
    user_filters["bookmakers_count"] = len(user_filters.get("bookmakers", []))
    user_filters["sports_count"] = len(user_filters.get("sports", []))
    user_filters["available_sports_count"] = len(user_filters.get("available_sports", []))
    return {"filters": user_filters}


@app.post("/api/forted/filters")
async def update_forted_filters(
    req: FortedFiltersRequest,
    current_username: str = Depends(_require_current_username),
):
    _require_admin_or_superuser_username(current_username)
    changed = _update_user_forted_filters(
        current_username, req.bookmakers, req.sports, req.mode, req.filter_id
    )
    if changed and _relay_thread and hasattr(_relay_thread, "request_refresh"):
        _relay_thread.request_refresh()
    if changed and ROBINARB_ALLOW_MOCK_FALLBACK and _arbs_source not in {"forted", "listener"}:
        _refresh_mock_arbs(25)
    user_filters = _get_user_forted_filters(current_username)
    user_filters["sports"] = [_translate_sport_label(value) for value in user_filters.get("sports", [])]
    user_filters["available_sports"] = list(ALL_SUPPORTED_SPORTS)
    user_filters["bookmakers_count"] = len(user_filters.get("bookmakers", []))
    user_filters["sports_count"] = len(user_filters.get("sports", []))
    user_filters["available_sports_count"] = len(user_filters.get("available_sports", []))
    return {
        "updated": changed,
        "reconnecting": bool(changed and _relay_thread),
        "filters": user_filters,
    }


_FORTED_CONTROL_RETRYABLE_STATUSES = {408, 425, 429, 500, 502, 503, 504}


def _forted_control_headers() -> dict[str, str]:
    headers = {"Authorization": f"Bearer {FORTED_LWS_TOKEN}"} if FORTED_LWS_TOKEN else {}
    return headers


def _forted_control_retry_delay(attempt: int, response: httpx.Response | None = None) -> float:
    if response is not None:
        retry_after = response.headers.get("Retry-After")
        if retry_after:
            try:
                return max(0.05, min(float(retry_after), 5.0))
            except ValueError:
                pass
    return min(FORTED_CONTROL_RETRY_BACKOFF * (2 ** attempt), 5.0)


async def _forted_control_request(
    label: str,
    method: str,
    path: str,
    json_body: dict | None = None,
) -> dict:
    """Call an external Forted control endpoint with bounded retries."""
    url = f"{FORTED_CONTROL_URL}{path}"
    attempts = FORTED_CONTROL_RETRIES + 1
    last_error: httpx.HTTPError | None = None
    for attempt in range(attempts):
        try:
            async with httpx.AsyncClient(timeout=FORTED_CONTROL_TIMEOUT) as client:
                resp = await client.request(
                    method,
                    url,
                    json=json_body,
                    headers=_forted_control_headers(),
                )
        except httpx.HTTPError as exc:
            last_error = exc
            if attempt + 1 >= attempts:
                raise
            log.warning(
                "Forted %s %s %s failed (%s), retrying",
                label,
                method,
                path,
                exc,
            )
            await asyncio.sleep(_forted_control_retry_delay(attempt))
            continue

        if resp.status_code < 400:
            try:
                data = resp.json()
            except ValueError:
                return {}
            return data if isinstance(data, dict) else {}

        retryable = resp.status_code in _FORTED_CONTROL_RETRYABLE_STATUSES
        if retryable and attempt + 1 < attempts:
            log.warning(
                "Forted %s %s %s returned HTTP %s, retrying",
                label,
                method,
                path,
                resp.status_code,
            )
            await asyncio.sleep(_forted_control_retry_delay(attempt, resp))
            continue

        status_code = resp.status_code if 400 <= resp.status_code < 500 else 502
        raise HTTPException(status_code, f"forted {label} error {resp.status_code}: {resp.text[:200]}")

    if last_error is not None:
        raise last_error
    return {}


async def _lws_request(method: str, path: str, json_body: dict | None = None) -> dict:
    """Call the Forted live_web_server compatibility API."""
    return await _forted_control_request("control", method, path, json_body)


async def _rust_admin_request(method: str, path: str, json_body: dict | None = None) -> dict:
    """Call forted-client Rust admin API. Shares ACCESS_TOKEN with SSE."""
    return await _forted_control_request("rust admin", method, path, json_body)


def _should_try_rust_admin_fallback(exc: HTTPException) -> bool:
    return exc.status_code in {404, 502, 503, 504}


@app.get("/api/forted/bookmaker")
async def get_forted_bookmaker(current_username: str = Depends(_require_current_username)):
    """Current bookmaker profile + switching progress (admin Forted control)."""
    _require_admin_or_superuser_username(current_username)
    inferred_profile = _infer_lws_profile_from_arbs(_arbs_cache)
    memory_profile, switching, servers_ready, servers_total = _lws_profile_switch_status()
    try:
        data = await _lws_request("GET", "/api/profile")
        return _forted_control_status_payload(
            data,
            inferred_profile=inferred_profile,
            memory_profile=memory_profile,
            local_switching=switching,
            servers_ready=servers_ready,
            servers_total=servers_total,
            runtime="control",
            trust_active_profile=True,
        )
    except (HTTPException, httpx.HTTPError) as exc:
        if isinstance(exc, HTTPException) and not _should_try_rust_admin_fallback(exc):
            raise
        try:
            status = await _cached_rust_admin_status(force_refresh=False)
        except HTTPException as rust_exc:
            if switching:
                return _forted_control_memory_status_payload(
                    inferred_profile=inferred_profile,
                    memory_profile=memory_profile,
                    local_switching=switching,
                    servers_ready=servers_ready,
                    servers_total=servers_total,
                    control_error=f"{exc}; rust: {rust_exc.detail}",
                )
            raise HTTPException(502, f"forted control unavailable: {rust_exc.detail}") from rust_exc
        except httpx.HTTPError as rust_exc:
            if switching:
                return _forted_control_memory_status_payload(
                    inferred_profile=inferred_profile,
                    memory_profile=memory_profile,
                    local_switching=switching,
                    servers_ready=servers_ready,
                    servers_total=servers_total,
                    control_error=f"{exc}; rust: {rust_exc}",
                )
            raise HTTPException(502, f"forted control unreachable: {rust_exc}") from rust_exc
        runtime_profile = _lws_profile_from_runtime_status(status)
        runtime_active_config = _runtime_config_from_status(status)
        runtime_config_unknown = bool(runtime_active_config and not runtime_profile)
        if runtime_profile and runtime_profile == memory_profile:
            switching = False
            servers_ready = max(servers_ready, 1)
            servers_total = max(servers_total, servers_ready, 1)
        if runtime_profile:
            active_profile = runtime_profile
        elif runtime_config_unknown:
            active_profile = None
        elif switching:
            active_profile = memory_profile
        else:
            active_profile = inferred_profile or memory_profile
        if runtime_profile and not switching:
            _set_lws_profile_from_control(runtime_profile, False)
            memory_profile = runtime_profile
        elif inferred_profile and not switching and not runtime_config_unknown:
            _set_lws_profile_from_control(inferred_profile, False)
            memory_profile = inferred_profile
        return {
            "profile": active_profile,
            "active_profile": active_profile,
            "inferred_profile": inferred_profile,
            "memory_profile": memory_profile,
            "generation": 0,
            "switching": switching,
            "servers_ready": servers_ready,
            "servers_total": servers_total,
            "allowed": list(_LWS_PROFILE_IDS),
            "runtime": "rust",
            "control_available": True,
            "runtime_active_config": runtime_active_config,
            "runtime_config_unknown": runtime_config_unknown,
            "sinks": status,
        }


@app.post("/api/forted/bookmaker")
async def switch_forted_bookmaker(
    req: FortedBookmakerRequest,
    current_username: str = Depends(_require_current_username),
):
    """Switch the active bookmaker filter ('ручка'). Admin-only global control."""
    _require_admin_or_superuser_username(current_username)
    profile = _canonical_lws_profile(req.profile)
    config = _LWS_PROFILE_CONFIGS.get(profile)
    if not config:
        raise HTTPException(400, f"unknown profile: {req.profile}")
    try:
        data = await _lws_request("POST", "/api/switch_profile", {"profile": profile})
        _mark_lws_profile_switch(profile)
        _save_user_target_profile(current_username, profile)
        return _forted_control_status_payload(
            data,
            inferred_profile=None,
            memory_profile=profile,
            local_switching=True,
            servers_ready=0,
            servers_total=1,
            runtime="control",
            trust_active_profile=False,
            profile_override=profile,
            force_switching=True,
        )
    except (HTTPException, httpx.HTTPError) as exc:
        if isinstance(exc, HTTPException) and not _should_try_rust_admin_fallback(exc):
            raise
        try:
            await _rust_admin_request("POST", "/admin/profile", {"config": config})
        except HTTPException as rust_exc:
            raise HTTPException(502, f"forted control unavailable: {rust_exc.detail}") from rust_exc
        except httpx.HTTPError as rust_exc:
            raise HTTPException(502, f"forted control unreachable: {rust_exc}") from rust_exc
        _mark_lws_profile_switch(profile)
        _save_user_target_profile(current_username, profile)
        return {
            "profile": profile,
            "active_profile": profile,
            "memory_profile": profile,
            "generation": 0,
            "switching": True,
            "servers_ready": 0,
            "servers_total": 0,
            "allowed": list(_LWS_PROFILE_IDS),
            "runtime": "rust",
            "control_available": True,
            "config": config,
        }


def _betfair_attempt_data_dir() -> Path:
    if ROBINARB_BETFAIR_ATTEMPTS_DIR:
        return Path(ROBINARB_BETFAIR_ATTEMPTS_DIR)
    if _stats_collector is not None:
        return _stats_collector.csv_path.parent
    return stats_collector.StatsConfig.from_env().data_dir


def _forted_rust_config_dir() -> Path:
    return Path(os.getenv("FORTED_RUST_CONFIG_DIR", "/srv/forted-source/rust-client")).expanduser()


def _forted_rust_config_path(config_name: str) -> Path:
    return _forted_rust_config_dir() / config_name


def _safe_diag_text(value: Any, *, max_len: int = 220) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    text = re.sub(r"(?i)((?:session|token|password|pass|key|auth)[^=&]{0,24}=)[^&#\\s]+", r"\1<redacted>", text)
    if len(text) > max_len:
        return f"{text[:max_len - 3]}..."
    return text


def _betfair_resolvable_event_id(arb: dict[str, Any]) -> str | None:
    return betfair_executor.extract_event_id(arb) or paddy_sportsbook.extract_event_id(arb)


def _betfair_diag_sample(arb: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": _safe_diag_text(arb.get("id"), max_len=80),
        "match": _safe_diag_text(arb.get("match"), max_len=140),
        "market": _safe_diag_text(arb.get("market"), max_len=80),
        "bk2": _safe_diag_text(arb.get("bk2"), max_len=80),
        "bk2_url": _safe_diag_text(arb.get("bk2_url")),
        "bk2_raw_link": _safe_diag_text(arb.get("bk2_raw_link")),
        "betfair_market_id": betfair_executor.extract_market_id(arb),
        "betfair_event_id": _betfair_resolvable_event_id(arb),
        "betfair_selection_id": betfair_executor.extract_selection_id(arb),
        "updated_at": arb.get("updated_at"),
        "is_live": arb.get("is_live"),
        "source": arb.get("_source") or _arbs_source,
    }


def _betfair_feed_diagnostics(*, sample_limit: int = 5) -> dict[str, Any]:
    now = time.time()
    cached = list(_arbs_cache)
    fresh = [
        arb
        for arb in cached
        if not _arb_requires_live_freshness(arb, _arbs_source) or _live_arb_is_fresh(arb, now)
    ]
    all_raw_betfair = betfair_executor.filter_betfair_arbs(cached, limit=max(len(cached), 1), min_profit_pct=None)
    all_fresh_betfair = betfair_executor.filter_betfair_arbs(fresh, limit=max(len(fresh), 1), min_profit_pct=None)
    raw_betfair = [arb for arb in all_raw_betfair if paddy_sportsbook.is_sportsbook_fork(arb)]
    fresh_betfair = [arb for arb in all_fresh_betfair if paddy_sportsbook.is_sportsbook_fork(arb)]
    ignored_exchange = [arb for arb in all_fresh_betfair if arb not in fresh_betfair]
    stale_betfair = [arb for arb in raw_betfair if arb not in fresh_betfair]
    missing_market_id = [arb for arb in fresh_betfair if not betfair_executor.extract_market_id(arb)]
    missing_resolvable_id = [
        arb
        for arb in fresh_betfair
        if not betfair_executor.extract_market_id(arb) and not _betfair_resolvable_event_id(arb)
    ]
    with_market_id = [arb for arb in fresh_betfair if betfair_executor.extract_market_id(arb)]
    with_event_id = [arb for arb in fresh_betfair if _betfair_resolvable_event_id(arb)]
    memory_profile, switching, servers_ready, servers_total = _lws_profile_switch_status()
    inferred_profile = "pin_paddy" if fresh_betfair else _infer_lws_profile_from_arbs(fresh)
    diagnostic_profile = inferred_profile or memory_profile
    relay = _relay_thread
    relay_last_frame_at = getattr(relay, "last_frame_at", None) if relay is not None else None
    return {
        "total_cached": len(cached),
        "stream_alive": _forted_stream_alive(now),
        "stream_connected": bool(getattr(relay, "connected", False)) if relay is not None else False,
        "last_frame_age_sec": round(max(0.0, now - relay_last_frame_at), 3) if relay_last_frame_at else None,
        "fresh_cached": len(fresh),
        "stale_cached": max(0, len(cached) - len(fresh)),
        "betfair_raw_count": len(raw_betfair),
        "betfair_fresh_count": len(fresh_betfair),
        "betfair_stale_count": len(stale_betfair),
        "betfair_missing_market_id_count": len(missing_market_id),
        "betfair_missing_resolvable_id_count": len(missing_resolvable_id),
        "betfair_with_market_id_count": len(with_market_id),
        "betfair_with_event_id_count": len(with_event_id),
        "betfair_exchange_ignored_count": len(ignored_exchange),
        "non_betfair_fresh_count": max(0, len(fresh) - len(fresh_betfair)),
        "arbs_source": _arbs_source,
        "arbs_updated_at": _arbs_updated_at,
        "feed_age_sec": round(max(0.0, now - _arbs_updated_at), 3) if _arbs_updated_at else None,
        "memory_profile": diagnostic_profile,
        "memory_profile_source": "feed" if inferred_profile else "memory",
        "switching": switching,
        "servers_ready": servers_ready,
        "servers_total": servers_total,
        "profile_matches_fresh_cache": _arbs_match_lws_profile(fresh, diagnostic_profile) if fresh else None,
        "samples": [_betfair_diag_sample(arb) for arb in fresh_betfair[:sample_limit]],
        "missing_market_id_samples": [_betfair_diag_sample(arb) for arb in missing_market_id[:sample_limit]],
        "missing_resolvable_id_samples": [_betfair_diag_sample(arb) for arb in missing_resolvable_id[:sample_limit]],
    }


def _current_betfair_candidates(*, limit: int, min_profit_pct: float | None) -> list[dict[str, Any]]:
    now = time.time()
    arbs = [
        arb
        for arb in list(_arbs_cache)
        if not _arb_requires_live_freshness(arb, _arbs_source) or _live_arb_is_fresh(arb, now)
    ]
    sportsbook_arbs = [arb for arb in arbs if paddy_sportsbook.is_sportsbook_fork(arb)]
    return betfair_executor.filter_betfair_arbs(
        sportsbook_arbs,
        limit=limit,
        min_profit_pct=min_profit_pct,
    )


_BETFAIR_VERIFY_LOCK = asyncio.Lock()
_BETFAIR_VERIFY_STATE_LOCK = asyncio.Lock()
_BETFAIR_VERIFY_HIGH_PRIORITY_WAITERS = 0
_BETFAIR_VERIFY_LAST_HIGH_PRIORITY_AT = 0.0
_BETFAIR_VERIFY_HIGH_PRIORITY_SCOPES = frozenset({"basket"})
_PADDY_VERIFY_CLIENT: paddy_sportsbook.PaddySportsbookClient | None = None
_PADDY_VERIFY_CLIENT_FINGERPRINT = ""
_ONEWIN_VERIFY_CLIENT: onewin_sportsbook.OneWinSportsbookClient | None = None
_ONEWIN_VERIFY_CLIENT_FINGERPRINT = ""
_LADBROKES_VERIFY_CLIENT: ladbrokes_sportsbook.LadbrokesSportsbookClient | None = None
_LADBROKES_VERIFY_CLIENT_FINGERPRINT = ""
_BCGAME_VERIFY_CLIENT: bcgame_sportsbook.BCGameSportsbookClient | None = None
_BCGAME_VERIFY_CLIENT_FINGERPRINT = ""


def _shared_paddy_verify_client() -> paddy_sportsbook.PaddySportsbookClient:
    global _PADDY_VERIFY_CLIENT
    global _PADDY_VERIFY_CLIENT_FINGERPRINT
    cfg = paddy_sportsbook.PaddySportsbookConfig.from_env()
    fingerprint = "|".join((
        cfg.proxy_url, cfg.app_key, cfg.event_page_url, cfg.markets_url,
        str(cfg.timeout_sec), str(cfg.request_attempts), str(cfg.cache_ttl_sec), cfg.impersonate,
    ))
    if _PADDY_VERIFY_CLIENT is None or _PADDY_VERIFY_CLIENT_FINGERPRINT != fingerprint:
        _PADDY_VERIFY_CLIENT = paddy_sportsbook.PaddySportsbookClient(cfg)
        _PADDY_VERIFY_CLIENT_FINGERPRINT = fingerprint
    return _PADDY_VERIFY_CLIENT


def _shared_onewin_verify_client() -> onewin_sportsbook.OneWinSportsbookClient:
    global _ONEWIN_VERIFY_CLIENT
    global _ONEWIN_VERIFY_CLIENT_FINGERPRINT
    cfg = onewin_sportsbook.OneWinSportsbookConfig.from_env()
    fingerprint = "|".join((
        cfg.partner_id, cfg.push_url, cfg.origin, cfg.proxy_url,
        str(cfg.timeout_sec), str(cfg.cache_ttl_sec),
    ))
    if _ONEWIN_VERIFY_CLIENT is None or _ONEWIN_VERIFY_CLIENT_FINGERPRINT != fingerprint:
        _ONEWIN_VERIFY_CLIENT = onewin_sportsbook.OneWinSportsbookClient(cfg)
        _ONEWIN_VERIFY_CLIENT_FINGERPRINT = fingerprint
    return _ONEWIN_VERIFY_CLIENT


def _shared_ladbrokes_verify_client() -> ladbrokes_sportsbook.LadbrokesSportsbookClient:
    global _LADBROKES_VERIFY_CLIENT
    global _LADBROKES_VERIFY_CLIENT_FINGERPRINT
    cfg = ladbrokes_sportsbook.LadbrokesSportsbookConfig.from_env()
    fingerprint = "|".join((
        cfg.siteserver_url, cfg.proxy_url, str(cfg.timeout_sec),
        str(cfg.cache_ttl_sec), str(cfg.max_batch_size),
    ))
    if _LADBROKES_VERIFY_CLIENT is None or _LADBROKES_VERIFY_CLIENT_FINGERPRINT != fingerprint:
        _LADBROKES_VERIFY_CLIENT = ladbrokes_sportsbook.LadbrokesSportsbookClient(cfg)
        _LADBROKES_VERIFY_CLIENT_FINGERPRINT = fingerprint
    return _LADBROKES_VERIFY_CLIENT


def _shared_bcgame_verify_client() -> bcgame_sportsbook.BCGameSportsbookClient:
    global _BCGAME_VERIFY_CLIENT
    global _BCGAME_VERIFY_CLIENT_FINGERPRINT
    cfg = bcgame_sportsbook.BCGameSportsbookConfig.from_env()
    fingerprint = "|".join((
        cfg.base_url, cfg.betby_api_url, cfg.betby_brand_id, cfg.provider_support_url,
        str(cfg.discover_provider_settings), str(cfg.provider_settings_ttl_sec), cfg.proxy_url,
        str(cfg.timeout_sec), str(cfg.cache_ttl_sec), str(cfg.token_ttl_sec),
        str(cfg.max_concurrency),
    ))
    if _BCGAME_VERIFY_CLIENT is None or _BCGAME_VERIFY_CLIENT_FINGERPRINT != fingerprint:
        _BCGAME_VERIFY_CLIENT = bcgame_sportsbook.BCGameSportsbookClient(cfg)
        _BCGAME_VERIFY_CLIENT_FINGERPRINT = fingerprint
    return _BCGAME_VERIFY_CLIENT


async def _resolve_counter_bookmaker_quote(arb: dict[str, Any]) -> dict[str, Any]:
    if onewin_sportsbook.is_onewin_fork(arb):
        return await _shared_onewin_verify_client().resolve_live_quote(arb)
    if ladbrokes_sportsbook.is_ladbrokes_fork(arb):
        return await _shared_ladbrokes_verify_client().resolve_live_quote(arb)
    if bcgame_sportsbook.is_bcgame_fork(arb):
        return await _shared_bcgame_verify_client().resolve_live_quote(arb)
    if betfair_executor.is_betfair_fork(arb):
        quote = await _resolve_betfair_quote(arb, scope="basket", wait=True)
        return quote or {
            "verified": False,
            "status": "UNAVAILABLE",
            "detail": "Counter-bookmaker quote is unavailable",
            "current_odds": None,
        }
    return {
        "verified": False,
        "status": "UNSUPPORTED_BOOKMAKER",
        "detail": f"Independent price verification is not implemented for {arb.get('bk2') or 'this bookmaker'}",
        "current_odds": None,
    }


async def _reserve_betfair_verify_slot(scope: str, *, wait: bool) -> bool:
    """Reserve a Betfair quote slot without letting RobinWork delay a basket.

    RobinWork is best-effort: it never queues behind an active exchange lookup
    and backs off while an interactive basket quote is waiting or was just
    completed. Basket checks wait for the single in-flight lookup instead.
    """
    high_priority = scope in _BETFAIR_VERIFY_HIGH_PRIORITY_SCOPES
    registered_waiter = False
    global _BETFAIR_VERIFY_HIGH_PRIORITY_WAITERS
    global _BETFAIR_VERIFY_LAST_HIGH_PRIORITY_AT

    if high_priority:
        async with _BETFAIR_VERIFY_STATE_LOCK:
            _BETFAIR_VERIFY_HIGH_PRIORITY_WAITERS += 1
            registered_waiter = True
        await _BETFAIR_VERIFY_LOCK.acquire()
        return True

    async with _BETFAIR_VERIFY_STATE_LOCK:
        quiet_remaining = ROBINARB_BETFAIR_LOW_PRIORITY_QUIET_SEC - (
            time.time() - _BETFAIR_VERIFY_LAST_HIGH_PRIORITY_AT
        )
        busy = _BETFAIR_VERIFY_LOCK.locked()
        priority_waiting = _BETFAIR_VERIFY_HIGH_PRIORITY_WAITERS > 0
    if busy or priority_waiting or quiet_remaining > 0:
        return False

    # A basket request may arrive between the state check and lock acquisition.
    # Low-priority work never waits; once it loses that race it is skipped.
    if _BETFAIR_VERIFY_LOCK.locked():
        return False
    await _BETFAIR_VERIFY_LOCK.acquire()
    async with _BETFAIR_VERIFY_STATE_LOCK:
        if _BETFAIR_VERIFY_HIGH_PRIORITY_WAITERS > 0:
            _BETFAIR_VERIFY_LOCK.release()
            return False
    return True


async def _release_betfair_verify_slot(scope: str, *, registered_waiter: bool) -> None:
    global _BETFAIR_VERIFY_HIGH_PRIORITY_WAITERS
    global _BETFAIR_VERIFY_LAST_HIGH_PRIORITY_AT
    if _BETFAIR_VERIFY_LOCK.locked():
        _BETFAIR_VERIFY_LOCK.release()
    if registered_waiter:
        async with _BETFAIR_VERIFY_STATE_LOCK:
            _BETFAIR_VERIFY_HIGH_PRIORITY_WAITERS = max(0, _BETFAIR_VERIFY_HIGH_PRIORITY_WAITERS - 1)
            _BETFAIR_VERIFY_LAST_HIGH_PRIORITY_AT = time.time()


async def _resolve_betfair_quote(
    arb: dict[str, Any],
    *,
    scope: str,
    wait: bool,
) -> dict[str, Any] | None:
    """Read the mirrored fixed-odds Sportsbook quote with basket priority."""
    if not betfair_executor.is_betfair_fork(arb):
        return None
    sportsbook = paddy_sportsbook.is_sportsbook_fork(arb)
    if not sportsbook:
        return {
            "verified": False,
            "status": "WRONG_SOURCE_EXCHANGE",
            "detail": "Exchange forks are ignored; Betfair Sportsbook fixed odds are required",
            "current_odds": None,
        }

    high_priority = scope in _BETFAIR_VERIFY_HIGH_PRIORITY_SCOPES
    reserved = await _reserve_betfair_verify_slot(scope, wait=wait)
    if not reserved:
        return {
            "verified": False,
            "status": "SKIPPED_PRIORITY",
            "detail": "Betfair quote skipped so an interactive basket check keeps priority",
            "current_odds": None,
        }
    try:
        return await _shared_paddy_verify_client().resolve_live_quote(arb)
    except Exception as exc:  # noqa: BLE001 - a quote failure must not break RobinWork
        return {
            "verified": False,
            "status": "ERROR",
            "detail": _betfair_exception_detail(exc),
            "current_odds": None,
        }
    finally:
        await _release_betfair_verify_slot(scope, registered_waiter=high_priority)


def _runtime_config_from_status(data: Any) -> str:
    if not isinstance(data, dict):
        return ""
    for key in ("active_config", "current_config", "profile_config", "config"):
        value = str(data.get(key) or "").strip()
        if value:
            return value
    for key in ("runtime", "status", "sinks"):
        nested_config = _runtime_config_from_status(data.get(key))
        if nested_config:
            return nested_config
    return ""


def _runtime_status_summary(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        return {}
    summary: dict[str, Any] = {}
    for key in (
        "profile",
        "active_config",
        "current_config",
        "profile_config",
        "config",
        "generation",
        "switching",
        "servers_ready",
        "servers_total",
    ):
        if key in data:
            summary[key] = data.get(key)
    return summary


async def _forted_runtime_status() -> dict[str, Any]:
    try:
        data = await _lws_request("GET", "/api/profile")
        return {
            "source": "lws",
            "available": True,
            "profile": data.get("profile"),
            "active_config": _runtime_config_from_status(data),
            "summary": _runtime_status_summary(data),
        }
    except Exception as lws_exc:  # noqa: BLE001 - diagnostics must not fail status
        try:
            data = await _cached_rust_admin_status(force_refresh=False)
            return {
                "source": "rust",
                "available": True,
                "profile": data.get("profile"),
                "active_config": _runtime_config_from_status(data),
                "summary": _runtime_status_summary(data),
                "lws_error": str(lws_exc),
            }
        except Exception as rust_exc:  # noqa: BLE001
            return {
                "source": "memory",
                "available": False,
                "profile": None,
                "active_config": "",
                "summary": {},
                "lws_error": str(lws_exc),
                "rust_error": str(rust_exc),
            }


async def _betfair_profile_status() -> dict[str, Any]:
    config_name = _LWS_PROFILE_CONFIGS.get("pin_paddy", "")
    config_path = _forted_rust_config_path(config_name) if config_name else Path("")
    legacy_config_path = _forted_rust_config_path("config_pin_betfair.toml")
    sportsbook_config_path = _forted_rust_config_path("config_pin_paddy.toml")
    old_betbetting_config_path = _forted_rust_config_path("config_pin_betbetting.toml")
    exchange_config_path = _forted_rust_config_path("config_ms_exchanges_eu.toml")
    current_profile, switching, servers_ready, servers_total = _lws_profile_switch_status()
    runtime_status = await _forted_runtime_status()
    runtime_active_config = str(runtime_status.get("active_config") or "")
    runtime_config_profile = _LWS_CONFIG_PROFILES.get(runtime_active_config)
    effective_profile = str(runtime_status.get("profile") or runtime_config_profile or current_profile)
    if runtime_config_profile and effective_profile != current_profile:
        current_profile_source = "runtime_config"
    else:
        current_profile_source = runtime_status.get("source") if runtime_status.get("available") else "memory"
    return {
        "profile_available": "pin_paddy" in _LWS_PROFILE_CONFIGS,
        "profile_config": config_name,
        "profile_config_exists": bool(config_name and config_path.is_file()),
        "config_pin_betfair_exists": legacy_config_path.is_file(),
        "sportsbook_config_exists": sportsbook_config_path.is_file(),
        "old_betbetting_config_exists": old_betbetting_config_path.is_file(),
        "exchange_config_exists": exchange_config_path.is_file(),
        "current_profile": effective_profile,
        "current_profile_source": current_profile_source,
        "runtime_profile": runtime_status.get("profile"),
        "runtime_active_config": runtime_active_config,
        "runtime_status": runtime_status,
        "switching": switching,
        "servers_ready": servers_ready,
        "servers_total": servers_total,
        "allowed_profiles": list(_LWS_PROFILE_CONFIGS.keys()),
    }


def _betfair_pinnacle_result_status(pinnacle_verify: dict[str, Any] | None) -> str:
    return str((pinnacle_verify or {}).get("result_status") or "").strip().upper()


def _betfair_pinnacle_ready(
    pinnacle_verify: dict[str, Any] | None,
    pinnacle_match: dict[str, Any] | None,
) -> bool:
    if not ((pinnacle_verify or {}).get("verified") and (pinnacle_match or {}).get("ok")):
        return False
    result_status = _betfair_pinnacle_result_status(pinnacle_verify)
    return result_status in {"", "OK", "ODDS_CHANGE", "ARCADIA"}


def _betfair_pinnacle_failure_status(
    pinnacle_verify: dict[str, Any] | None,
    pinnacle_match: dict[str, Any] | None,
) -> str:
    if not (pinnacle_verify or {}).get("verified") or not (pinnacle_match or {}).get("ok"):
        return str((pinnacle_match or {}).get("status") or (pinnacle_verify or {}).get("status") or "UNVERIFIED")
    return _betfair_pinnacle_result_status(pinnacle_verify) or str((pinnacle_verify or {}).get("status") or "UNVERIFIED")


def _betfair_exception_detail(exc: Exception) -> str:
    detail = str(exc).strip()
    if detail:
        return detail
    return f"{type(exc).__name__}: {repr(exc)}"


def _betfair_sportsbook_event_url(arb: dict[str, Any], quote: dict[str, Any]) -> str:
    event_id = str(quote.get("event_id") or paddy_sportsbook.extract_event_id(arb) or "").strip()
    if not event_id:
        raise betfair_sportsbook_basket.BetfairSportsbookBasketError("sportsbook event id is unavailable")
    path = _canonical_betfair_sportsbook_path(arb, event_id) or _betfair_sportsbook_path(
        event_id=event_id,
        sport=arb.get("sport"),
        league=arb.get("league"),
        event_name=arb.get("event_name") or arb.get("league"),
        home=arb.get("home") or arb.get("team1") or arb.get("team1_en"),
        away=arb.get("away") or arb.get("team2") or arb.get("team2_en"),
    )
    return urljoin("https://www.betfair.com", path)


async def _prepare_betfair_sportsbook_basket(
    arb: dict[str, Any],
    quote: dict[str, Any],
    *,
    stake: float,
    event_url: str | None = None,
) -> dict[str, Any]:
    payload = betfair_sportsbook_basket.build_prepare_payload(
        arb=arb,
        quote=quote,
        event_url=event_url or _betfair_sportsbook_event_url(arb, quote),
        stake=stake,
    )
    return await betfair_sportsbook_basket.BetfairSportsbookBasketClient().prepare(payload)


async def _prepare_betfair_sportsbook_requests(
    arb: dict[str, Any],
    quote: dict[str, Any],
    *,
    stake: float,
) -> dict[str, Any]:
    """Validate the Betfair leg through requests and stop before placeBet.

    Story reconcile Фаза3 (audit C, "как слить" step 4): use the same
    validated placement price `_resolve_betfair_placement_odds` computes for
    the live `/api/bet` path instead of a bare `float(quote["current_odds"])`
    -- an unverified/stale/foreign quote must fail this dry-run request the
    same way it would fail a live placement, not silently trust
    `current_odds`.
    """
    placement_odds = _resolve_betfair_placement_odds(arb, quote)
    if placement_odds is None:
        raise ValueError(
            (quote or {}).get("detail")
            or "No fresh, verified Betfair Sportsbook price is available for this selection"
        )
    event_url = _betfair_sportsbook_event_url(arb, quote)
    # Reconcile regress1 P1-3 (money-critical, final cross-family audit fix):
    # split contract -- bare `selection` separate from the line-enriched
    # `selection_label`, plus the already-verified `expected_line` and raw
    # `market_type` -- mirrors the fix in _place_betfair_via_api /
    # betfair_sportsbook_basket.build_prepare_payload so this dry-run
    # request-only path never silently disables the worker's split-contract
    # guard either.
    bare_selection = str(
        quote.get("selection")
        or arb.get("bk2_selection")
        or arb.get("side2")
        or ""
    ).strip()
    selection_label = str(quote.get("selection_label") or bare_selection or "").strip()
    return await betfair_sportsbook_place_api.BetfairSportsbookPlaceApiClient().prepare(
        market_id=str(quote.get("market_id") or ""),
        selection_id=quote.get("selection_id"),
        stake=stake,
        expected_odds=placement_odds,
        event_url=event_url,
        market_name=str(quote.get("market_name") or arb.get("market") or ""),
        selection=bare_selection,
        selection_label=selection_label,
        expected_line=_to_float_or_none(quote.get("expected_line")),
        market_type=str(quote.get("market_type") or "").strip(),
    )


@app.get("/api/betfair/status")
async def betfair_status(current_username: str = Depends(_require_current_username)):
    _require_admin_username(current_username)
    sportsbook_cfg = paddy_sportsbook.PaddySportsbookConfig.from_env()
    basket_client = betfair_sportsbook_basket.BetfairSportsbookBasketClient()
    csv_path, jsonl_dir = betfair_executor.attempt_paths(_betfair_attempt_data_dir())
    candidates = _current_betfair_candidates(limit=100, min_profit_pct=None)
    diagnostics = _betfair_feed_diagnostics()
    return {
        "enabled": True,
        "mode": "sportsbook_betslip_dry_run",
        "provider": "betfair-sportsbook",
        "exchange_enabled": False,
        "live_place_enabled": False,
        "real_submit_allowed_by_env": False,
        "read_configured": sportsbook_cfg.configured(),
        "has_proxy": bool(sportsbook_cfg.proxy_url),
        "sportsbook_read_configured": sportsbook_cfg.configured(),
        "sportsbook_has_proxy": bool(sportsbook_cfg.proxy_url),
        "min_stake": ROBINARB_BETFAIR_MIN_STAKE,
        "default_stake": ROBINARB_BETFAIR_DEFAULT_STAKE,
        "max_stake": ROBINARB_BETFAIR_MAX_STAKE,
        "odds_tolerance": ROBINARB_BETFAIR_ODDS_TOLERANCE,
        "current_betfair_forks": len(candidates),
        "arbs_source": _arbs_source,
        "arbs_updated_at": _arbs_updated_at,
        "profile": await _betfair_profile_status(),
        "basket_worker": await basket_client.status(),
        "diagnostics": diagnostics,
        "attempts_csv": str(csv_path),
        "attempts_dir": str(jsonl_dir),
    }


@app.post("/api/betfair/run")
async def run_betfair_dry_run(
    req: BetfairRunRequest,
    current_username: str = Depends(_require_current_username),
):
    _require_admin_username(current_username)
    if not req.dry_run:
        raise HTTPException(
            403,
            "Real Betfair submit is disabled in this endpoint; run with dry_run=true.",
        )
    if not (req.verify_pinnacle and req.verify_betfair and req.require_price_match):
        raise HTTPException(
            400,
            "Betfair dry-run requires verify_pinnacle=true, verify_betfair=true, and require_price_match=true.",
        )
    stake_amount = round(float(req.stake), 2)
    if not math.isclose(stake_amount, float(req.stake), abs_tol=1e-9):
        raise HTTPException(400, "Betfair stake must use 2-decimal precision.")
    if not math.isclose(stake_amount, ROBINARB_BETFAIR_FIXED_STAKE, abs_tol=1e-9):
        raise HTTPException(
            400,
            f"Betfair dry-run stake is fixed at {ROBINARB_BETFAIR_FIXED_STAKE:.2f}.",
        )

    diagnostics = _betfair_feed_diagnostics()
    candidates = _current_betfair_candidates(limit=req.limit, min_profit_pct=req.min_profit_pct)
    data_dir = _betfair_attempt_data_dir()
    results: list[dict[str, Any]] = []
    successes = 0
    for arb in candidates:
            events: list[dict[str, Any]] = [{
                "event": "dry_run_started",
                "timestamp": time.time(),
                "arb_id": arb.get("id"),
                "stake": stake_amount,
                "verify_betfair": req.verify_betfair,
                "verify_pinnacle": req.verify_pinnacle,
            }]
            pricing: dict[str, Any] | None = None
            pinnacle_verify: dict[str, Any] | None = None
            betfair_quote: dict[str, Any] | None = None
            betfair_match: dict[str, Any] = {"ok": not req.verify_betfair, "status": "SKIPPED"}
            pinnacle_match: dict[str, Any] = {"ok": not req.verify_pinnacle, "status": "SKIPPED"}
            failure_reason = ""
            stake_plan: dict[str, Any] | None = None
            order_payload: dict[str, Any] | None = None
            request_prepare: dict[str, Any] | None = None


            if req.verify_pinnacle:
                try:
                    pinnacle_verify = await _stats_monitor_price(arb)
                except Exception as exc:  # noqa: BLE001
                    pinnacle_verify = {
                        "verified": False,
                        "status": "ERROR",
                        "detail": _betfair_exception_detail(exc),
                        "current_odds": None,
                    }
                pinnacle_match = betfair_executor.price_match(
                    arb.get("bk1_odds"),
                    (pinnacle_verify or {}).get("current_odds"),
                    tolerance=ROBINARB_BETFAIR_ODDS_TOLERANCE,
                )
                events.append({
                    "event": "pinnacle_verify",
                    "timestamp": time.time(),
                    "verify": pinnacle_verify,
                    "price_match": pinnacle_match,
                })

            # Resolve Pinnacle first. Forted rows frequently carry only the
            # bookmaker event link; the verified quote supplies the real
            # Pinnacle event id required for an authoritative market margin.
            pricing_arb = dict(arb)
            if pinnacle_verify and pinnacle_verify.get("verified"):
                verified_event_id = (
                    pinnacle_verify.get("parent_event_id")
                    or pinnacle_verify.get("event_id")
                )
                if verified_event_id:
                    pricing_arb["pinnacle_hub_event_id"] = str(verified_event_id)
                verified_pin_odds = _to_float_or_none(pinnacle_verify.get("current_odds"))
                if verified_pin_odds is not None and verified_pin_odds > 1:
                    pricing_arb["bk1_odds"] = verified_pin_odds
                pricing_arb["pinnacle_arcadia_market_margin"] = pinnacle_verify.get("market_margin")
                pricing_arb["pinnacle_arcadia_market_key"] = pinnacle_verify.get("market_key")

            try:
                pricing = await _stats_price_for_arb(pricing_arb)
                events.append({"event": "robin_pricing", "timestamp": time.time(), "pricing": pricing})
            except Exception as exc:  # noqa: BLE001 - dry-run should continue per fork
                pricing = None
                detail = _betfair_exception_detail(exc)
                failure_reason = f"robin_pricing_failed: {detail}"
                events.append({"event": "robin_pricing_error", "timestamp": time.time(), "error": detail})


            if req.verify_betfair:
                try:
                    betfair_quote = await _resolve_betfair_quote(arb, scope="basket", wait=True)
                except Exception as exc:  # noqa: BLE001
                    betfair_quote = {
                        "verified": False,
                        "status": "ERROR",
                        "detail": _betfair_exception_detail(exc),
                        "current_odds": None,
                    }
                betfair_match = betfair_executor.price_match(
                    arb.get("bk2_odds"),
                    (betfair_quote or {}).get("current_odds"),
                    tolerance=ROBINARB_BETFAIR_ODDS_TOLERANCE,
                )
                events.append({
                    "event": "betfair_quote",
                    "timestamp": time.time(),
                    "quote": betfair_quote,
                    "price_match": betfair_match,
                })

            try:
                live_robin_odds = (pricing or {}).get("robin_odds") if isinstance(pricing, dict) else None
                if live_robin_odds in (None, ""):
                    raise ValueError("live Robin odds are unavailable")
                if not bool((pricing or {}).get("margin_calculated")):
                    raise ValueError("live Robin odds are not authoritative")
                stake_arb = dict(arb)
                stake_arb["robin_odds"] = live_robin_odds
                stake_arb["betfair_side"] = (betfair_quote or {}).get("side") or "BACK"
                if (betfair_quote or {}).get("exchange_odds") not in (None, ""):
                    stake_arb["betfair_exchange_odds"] = (betfair_quote or {}).get("exchange_odds")
                stake_plan = betfair_executor.closing_stakes(stake_arb, betfair_stake=stake_amount)
                events.append({"event": "stake_plan", "timestamp": time.time(), "stake_plan": stake_plan})
            except Exception as exc:  # noqa: BLE001
                if not failure_reason:
                    failure_reason = f"stake_plan_failed: {exc}"
                events.append({"event": "stake_plan_error", "timestamp": time.time(), "error": str(exc)})

            pinnacle_ready = (not req.verify_pinnacle) or _betfair_pinnacle_ready(pinnacle_verify, pinnacle_match)
            betfair_ready = bool(betfair_quote and betfair_quote.get("verified") and betfair_match.get("ok"))

            if not failure_reason:
                failed: list[str] = []
                if req.verify_pinnacle and not pinnacle_ready:
                    failed.append(f"pinnacle_{_betfair_pinnacle_failure_status(pinnacle_verify, pinnacle_match)}")
                if req.verify_betfair and not ((betfair_quote or {}).get("verified") and betfair_match.get("ok")):
                    betfair_status = betfair_match.get("status")
                    if not (betfair_quote or {}).get("verified"):
                        betfair_status = (betfair_quote or {}).get("status") or betfair_status
                    failed.append(f"betfair_{betfair_status}")
                if failed:
                    failure_reason = ";".join(failed)

            if not failure_reason and pinnacle_ready and betfair_ready and stake_plan:
                try:
                    request_prepare = await _prepare_betfair_sportsbook_requests(
                        arb,
                        betfair_quote or {},
                        stake=stake_amount,
                    )
                    events.append({"event": "sportsbook_request_ready", "timestamp": time.time(), "result": request_prepare})
                    # The request-only flow has already resolved the exact
                    # Betfair runner, called implyBets, checked the current
                    # odds and stake bounds, and obtained a valid one-time
                    # coupon reference. That is the final safe pre-submit
                    # boundary. Do not repeat the work through Playwright:
                    # the UI scanner is slower and can reject a correctly
                    # resolved runner because of presentation-only labels.
                    order_payload = {
                        "provider": "betfair-sportsbook",
                        "action": "BETSLIP_READY_REQUESTS",
                        "resolution_mode": "graphql_requests",
                        "event_mapping_mode": request_prepare.get("event_mapping_mode"),
                        "event_url": request_prepare.get("event_url"),
                        "market_id": request_prepare.get("market_id"),
                        "selection_id": request_prepare.get("selection_id"),
                        "odds": request_prepare.get("odds"),
                        "stake": request_prepare.get("stake"),
                        "min_stake": request_prepare.get("min_stake"),
                        "max_stake": request_prepare.get("max_stake"),
                        "coupon_validated": request_prepare.get("coupon_validated"),
                        "screenshot": None,
                        "submit_blocked": True,
                    }
                    events.append({"event": "sportsbook_coupon_ready", "timestamp": time.time(), "result": order_payload})
                except Exception as exc:  # noqa: BLE001
                    failure_reason = f"sportsbook_request_failed: {_betfair_exception_detail(exc)}"
                    events.append({"event": "sportsbook_request_error", "timestamp": time.time(), "error": _betfair_exception_detail(exc)})

            status = "DRY_RUN_READY" if stake_plan and order_payload and not failure_reason else "REJECTED"
            if status == "DRY_RUN_READY":
                successes += 1
            events.append({
                "event": "completed",
                "timestamp": time.time(),
                "status": status,
                "failure_reason": failure_reason,
                "order_payload_built": order_payload is not None,
            })
            row = betfair_executor.build_attempt_record(
                arb,
                status=status,
                dry_run=True,
                stake_plan=stake_plan,
                pricing=pricing,
                pinnacle_verify=pinnacle_verify,
                betfair_quote=betfair_quote,
                match=betfair_match,
                failure_reason=failure_reason,
            )
            row = betfair_executor.write_attempt(data_dir, row, events)
            results.append({
                "record": row,
                "arb": {
                    "id": arb.get("id"),
                    "match": arb.get("match"),
                    "sport": arb.get("sport"),
                    "market": arb.get("market"),
                    "bk2": arb.get("bk2"),
                    "bk2_selection": arb.get("bk2_selection") or arb.get("side2"),
                    "bk2_odds": arb.get("bk2_odds"),
                    "bk1_odds": arb.get("bk1_odds"),
                    "robin_odds": arb.get("robin_odds"),
                    "profit_pct": arb.get("profit_pct"),
                    "robin_profit_pct": arb.get("robin_profit_pct"),
                    "betfair_market_id": betfair_executor.extract_market_id(arb),
                    "betfair_event_id": betfair_executor.extract_event_id(arb),
                    "betfair_selection_id": betfair_executor.extract_selection_id(arb),
                },
                "stake_plan": stake_plan,
                "pinnacle_verify": pinnacle_verify,
                "pinnacle_price_match": pinnacle_match,
                "betfair_quote": betfair_quote,
                "betfair_price_match": betfair_match,
                "order_payload": order_payload,
            })
    csv_path, jsonl_dir = betfair_executor.attempt_paths(data_dir)
    return {
        "requested": req.limit,
        "candidate_count": len(candidates),
        "success_count": successes,
        "dry_run": True,
        "arbs_source": _arbs_source,
        "arbs_updated_at": _arbs_updated_at,
        "profile": await _betfair_profile_status(),
        "diagnostics": diagnostics,
        "betfair_read_configured": paddy_sportsbook.PaddySportsbookConfig.from_env().configured(),
        "mode": "sportsbook_betslip_dry_run",
        "exchange_enabled": False,
        "attempts_csv": str(csv_path),
        "attempts_dir": str(jsonl_dir),
        "failure": None if candidates else "no_betfair_forks_in_current_feed",
        "results": results,
    }


@app.post("/api/calc")
async def calculate(req: CalcRequest, current_username: str = Depends(_require_current_username)):
    arb = _find_arb_by_id(req.arb_id)
    if not arb:
        raise HTTPException(404, "Arb not found, refresh scanner")

    odds1, odds2 = arb["bk1_odds"], arb["bk2_odds"]
    robin_odds = arb["robin_odds"]

    if req.live_pinnacle_odds is not None and req.live_pinnacle_odds > 1:
        odds1 = req.live_pinnacle_odds
    else:
        last_verified = arb.get("last_verified_pinnacle_odds")
        last_verified_at = arb.get("last_verified_pinnacle_at") or 0
        if last_verified and time.time() - last_verified_at <= 180.0:
            odds1 = last_verified

    if req.live_robin_odds is not None and req.live_robin_odds > 1:
        robin_odds = req.live_robin_odds
    else:
        last_verified_robin = arb.get("last_verified_robin_odds")
        last_verified_robin_at = arb.get("last_verified_robin_at") or 0
        if last_verified_robin and time.time() - last_verified_robin_at <= 180.0:
            robin_odds = last_verified_robin

    # Donor-driven mode: user enters counter (bk2) stake and (optionally) the
    # donor odds they took. We size the Pinnacle leg to equalise outcome
    # payouts and report the implied total stake / profit.
    if req.counter_stake is not None and math.isfinite(req.counter_stake) and req.counter_stake > 0:
        donor_odds = float(req.counter_odds) if (
            req.counter_odds is not None and math.isfinite(req.counter_odds) and req.counter_odds > 1
        ) else float(odds2)
        # Donor side is fixed by the user. We size PIN / Robin to LOCK the same
        # payout on both outcomes (true arb sizing). Vilka profit is then
        # min(payout) - total_stake; with equal payouts that equals
        # donor_return - (pin_stake + counter_stake), which is positive iff
        # 1/o1 + 1/donor_odds < 1.
        donor_return = req.counter_stake * donor_odds
        pin_stake = round(donor_return / odds1, 2)
        robin_stake = round(donor_return / robin_odds, 2)
        pin_total = pin_stake + req.counter_stake
        robin_total = robin_stake + req.counter_stake
        pin_profit = round(donor_return - pin_total, 2)
        robin_profit = round(donor_return - robin_total, 2)
        cashback = round(pin_stake * 0.5, 2)
        return {
            "arb_id": req.arb_id,
            "mode": "donor",
            "donor_stake": round(req.counter_stake, 2),
            "donor_odds": donor_odds,
            "donor_return": round(donor_return, 2),
            "total_stake": round(pin_total, 2),
            "pinnacle": {
                "stake": pin_stake, "odds": odds1, "return": round(pin_stake * odds1, 2),
                "profit": pin_profit,
                "cashback_50pct": cashback,
                "net_with_cashback": round(pin_profit + cashback, 2),
            },
            "counter": {"stake": round(req.counter_stake, 2), "odds": donor_odds, "return": round(donor_return, 2)},
            "robinbet": {
                "stake": robin_stake, "odds": robin_odds,
                "return": round(robin_stake * robin_odds, 2),
                "counter_stake": round(req.counter_stake, 2),
                "profit": robin_profit,
            },
            "match_limits": _arb_limits_snapshot(arb, current_username),
        }

    inv1, inv2 = 1 / odds1, 1 / odds2
    ti = inv1 + inv2
    s1 = round(req.stake_total * inv1 / ti, 2)
    s2 = round(req.stake_total * inv2 / ti, 2)
    profit_pin = round(s1 * odds1 - req.stake_total, 2)
    cashback = round(s1 * 0.5, 2)

    ri1, ri2 = 1 / robin_odds, 1 / odds2
    rt = ri1 + ri2
    rs1 = round(req.stake_total * ri1 / rt, 2)
    rs2 = round(req.stake_total * ri2 / rt, 2)
    rprofit = round(rs1 * robin_odds - req.stake_total, 2)

    return {
        "arb_id": req.arb_id, "total_stake": req.stake_total,
        "pinnacle": {
            "stake": s1, "odds": odds1, "return": round(s1 * odds1, 2),
            "profit": profit_pin, "cashback_50pct": cashback,
            "net_with_cashback": round(profit_pin + cashback, 2),
        },
        "counter": {"stake": s2, "odds": odds2, "return": round(s2 * odds2, 2)},
        "robinbet": {
            "stake": rs1, "odds": robin_odds, "return": round(rs1 * robin_odds, 2),
            "profit": rprofit, "counter_stake": rs2,
        },
        "profit_pct": arb["profit_pct"],
        "robin_profit_pct": arb["robin_profit_pct"],
        "match_limits": _arb_limits_snapshot(arb, current_username),
    }


@app.post("/api/counter/verify")
async def verify_counter_price(req: VerifyRequest, current_username: str = Depends(_require_current_username)):
    _ = current_username
    arb = _find_arb_by_id(req.arb_id)
    if not arb:
        return {
            "verified": False,
            "status": "UNAVAILABLE",
            "current_odds": None,
            "feed_odds": None,
            "selection": None,
            "source": "feed-blip",
            "timestamp": time.time(),
            "detail": "Arb temporarily missing from the latest feed snapshot",
            "price_match": {"ok": False, "status": "UNAVAILABLE"},
            "transient": True,
        }
    if _arb_requires_live_freshness(arb, _arbs_source) and not _live_arb_is_fresh(arb):
        return {
            "verified": False,
            "status": "STALE",
            "current_odds": None,
            "feed_odds": arb.get("bk2_odds"),
            "selection": arb.get("bk2_selection") or arb.get("side2"),
            "source": "forted-feed",
            "timestamp": time.time(),
            "detail": "Arb is stale; refresh the scanner before verifying counter-bookmaker price",
            "price_match": {"ok": False, "status": "STALE"},
        }
    quote = await _resolve_counter_bookmaker_quote(arb)
    price_match = betfair_executor.price_match(
        arb.get("bk2_odds"),
        quote.get("current_odds"),
        tolerance=ROBINARB_BETFAIR_ODDS_TOLERANCE,
    )
    return {
        **quote,
        "feed_odds": arb.get("bk2_odds"),
        "selection": quote.get("selection") or arb.get("bk2_selection") or arb.get("side2"),
        "timestamp": time.time(),
        "price_match": price_match,
    }


@app.post("/api/verify")
async def verify_price(req: VerifyRequest, current_username: str = Depends(_require_current_username)):
    arb = _find_arb_by_id(req.arb_id)
    if not arb:
        # The frontend can hold an arb_id whose underlying fork has briefly
        # disappeared from the feed (e.g. liquidity flicker on Pinnacle).
        # Returning 404 makes the chip jump to "no quote" even when the next
        # poll will re-add it. Instead, respond with a soft "feed-blip"
        # status so the UI can keep its previous verified state during the
        # sticky window.
        log.info("verify: arb %s not in cache; returning soft UNAVAILABLE", req.arb_id)
        return {
            "verified": False,
            "status": "UNAVAILABLE",
            "current_odds": None,
            "feed_odds": None,
            "selection": None,
            "source": "feed-blip",
            "timestamp": time.time(),
            "detail": "Arb temporarily missing from the latest feed snapshot",
            "live_place_supported": False,
            "selection_id": None,
            "odds_id": None,
            "line_id": None,
            "quote_id": None,
            "transient": True,
        }

    if _arb_requires_live_freshness(arb, _arbs_source) and not _live_arb_is_fresh(arb):
        return {
            "verified": False,
            "status": "STALE",
            "current_odds": arb["bk1_odds"],
            "feed_odds": arb["bk1_odds"],
            "selection": arb.get("bk1_selection"),
            "source": "forted-feed",
            "timestamp": time.time(),
            "detail": "Arb is stale; refresh the scanner before verifying Pinnacle price",
            "live_place_supported": False,
            "selection_id": arb.get("pinnacle_selection_id"),
            "odds_id": arb.get("pinnacle_odds_id"),
            "line_id": arb.get("pinnacle_line_id"),
            "quote_id": None,
        }

    bet_service_detail = ""
    md = arb.get("pinnacle_market_metadata") or {}
    raw_metadata_selection = str(md.get("raw_selection") or "").strip()
    raw_selection = raw_metadata_selection or str(arb.get("bk1_selection") or "").strip()
    period_hint = 0
    try:
        period_hint = int(md.get("period_number") or 0) or 0
    except (TypeError, ValueError):
        period_hint = 0
    ps_outcome = _forted_translate_for_pinnacle_service(raw_selection, arb, period_hint) if raw_selection else None

    verify_payload = _build_pinnacle_verify_payload(arb)
    _normalize_verify_payload_for_service_outcome(
        verify_payload,
        raw_selection=raw_selection,
        service_outcome=ps_outcome,
    )
    event_id_int = _to_int_or_none(verify_payload.get("event_id")) or 0
    verify_outcome = str(verify_payload.get("outcome") or "").strip()
    service_outcome = ps_outcome or verify_outcome
    has_actionable_candidates = False
    has_pinnacle_identifier = any(
        _clean_pinnacle_identifier(arb.get(key))
        for key in ("pinnacle_selection_id", "pinnacle_odds_id", "pinnacle_line_id")
    )
    unavailable_candidate: dict[str, Any] | None = None
    verify_mode = _verify_mode(req.verify_mode)
    calculator_guard = _calculator_verify_control(
        current_username,
        req.arb_id,
        req.client_id,
        verify_mode,
        req.verify_scope,
    )
    if calculator_guard is not None:
        calculator_guard["current_odds"] = arb.get("bk1_odds")
        calculator_guard["feed_odds"] = arb.get("bk1_odds")
        calculator_guard["selection"] = arb.get("bk1_selection")
        calculator_guard["event_id"] = event_id_int or None
        calculator_guard["selection_id"] = arb.get("pinnacle_selection_id")
        calculator_guard["odds_id"] = arb.get("pinnacle_odds_id")
        calculator_guard["line_id"] = arb.get("pinnacle_line_id")
        return calculator_guard

    if verify_mode in {"demo", "stream"}:
        stream_quote = await _stream_quote_response(current_username, req.arb_id, arb, verify_payload)
        if stream_quote is not None:
            return stream_quote
    if verify_mode == "demo":
        return _demo_verify_response(arb)

    if PINNACLE_API_BASE and service_outcome and (event_id_int or has_pinnacle_identifier):
        bet_payload: dict[str, Any] = dict(verify_payload)
        bet_payload["outcome"] = service_outcome
        if event_id_int:
            bet_payload["event_id"] = event_id_int
        else:
            bet_payload.pop("event_id", None)
        bet_payload["period"] = int(md.get("period_number") or 0) or 0
        sport_label = str(arb.get("sport") or md.get("sport") or "").strip()
        if sport_label:
            bet_payload["sport"] = sport_label
        line_val = md.get("line")
        if line_val is not None:
            try:
                bet_payload["handicap"] = float(line_val)
            except (TypeError, ValueError):
                pass
        if raw_selection:
            bet_payload["raw_selection"] = raw_selection
        forted_home, forted_away = _forted_team_names_for_pinnacle(arb)
        if forted_home:
            bet_payload["forted_home"] = forted_home
        if forted_away:
            bet_payload["forted_away"] = forted_away
        more_bet_lookup: dict[str, Any] | None = None
        family = _canonical_market_family(str(md.get("family") or arb.get("market") or ""))
        if not (str(arb.get("sport") or "").strip().lower() == "tennis" and family == "Game Winner"):
            try:
                more_bet_lookup = await _enrich_betslip_payload_from_more_bet(
                    arb,
                    verify_payload,
                    bet_payload,
                    raw_selection=raw_selection,
                    period=bet_payload["period"],
                )
                if more_bet_lookup:
                    event_id_int = _to_int_or_none(verify_payload.get("event_id")) or event_id_int
                    log.info(
                        "verify: resolved line_id=%s from pin888 MORE_BET for arb=%s event=%s",
                        more_bet_lookup.get("line_id"),
                        req.arb_id,
                        more_bet_lookup.get("event_id"),
                    )
            except Exception as exc:
                log.debug("verify: pin888 MORE_BET line lookup failed for %s: %s", req.arb_id, exc)
        try:
            resp = await _pinnacle_service_post("/verify", bet_payload, scope="verify", wait=True)
            resp.raise_for_status()
            body = resp.json()
            results = body.get("results") or []
        except _PinnacleClientRateLimited as exc:
            results = []
            bet_service_detail = f"bet_service locally throttled: retry after {exc.retry_after}s"
        except Exception as exc:
            results = []
            exc_detail = str(exc).strip() or repr(exc)
            bet_service_detail = f"bet_service request failed: {type(exc).__name__}: {exc_detail}"

        status_priority = {"OK": 0, "ODDS_CHANGE": 1, "PROCESSING": 2}
        actionable: list[tuple[int, int, dict[str, Any], float, str]] = []
        for idx, candidate in enumerate(results):
            status_raw = str(candidate.get("status") or "").upper()
            current_odds = _to_float_or_none(candidate.get("odds"))
            error_code = candidate.get("error_code")
            if (
                status_raw in status_priority
                and current_odds is not None
                and math.isfinite(current_odds)
                and current_odds > 1
            ):
                actionable.append((status_priority[status_raw], idx, candidate, current_odds, status_raw))
                continue
            if unavailable_candidate is None and status_raw:
                unavailable_candidate = candidate
            if status_raw and not bet_service_detail:
                bet_service_detail = f"bet_service status={status_raw}" + (f" ({error_code})" if error_code else "")

        has_actionable_candidates = bool(actionable)
        actionable.sort(key=lambda item: (item[0], item[1]))
        matched_candidate: dict[str, Any] | None = None
        matched_odds: float | None = None
        matched_status: str = ""
        suspicious_candidate: dict[str, Any] | None = None
        suspicious_odds: float | None = None
        suspicious_detail: str | None = None
        for _prio, _idx, candidate, current_odds, status_raw in actionable:
            if _pinnacle_result_matches_request(verify_payload, candidate):
                candidate_suspicion = _untrusted_pinnacle_quote_suspicion(
                    arb, current_odds, verify_payload, candidate,
                )
                if candidate_suspicion:
                    if suspicious_candidate is None:
                        suspicious_candidate = candidate
                        suspicious_odds = current_odds
                        suspicious_detail = candidate_suspicion
                    continue
                matched_candidate = candidate
                matched_odds = current_odds
                matched_status = status_raw
                break

        if matched_candidate is not None and matched_odds is not None:
            feed_odds = float(arb["bk1_odds"])
            arb["last_verified_pinnacle_odds"] = matched_odds
            arb["last_verified_pinnacle_at"] = time.time()

            # Recalculate Robin odds on live verified Pinnacle price FIRST,
            # so the updated arb (with correct robin_odds) is captured in the quote's arb_snapshot.
            working = dict(arb)
            working["bk1_odds"] = matched_odds
            if isinstance(working.get("pinnacle_market_metadata"), dict):
                working["pinnacle_market_metadata"] = dict(working["pinnacle_market_metadata"])
            try:
                robin_odds, source = await _robin_work_price_for_arb(working)
            except Exception as exc:
                log.warning("Failed to calculate robin odds during verify: %s", exc)
                robin_odds = None
                source = "verify-error"
            if robin_odds is not None and robin_odds > 1:
                arb["robin_odds"] = round(robin_odds, 3)
                arb["robin_price_source"] = source
                arb["last_verified_robin_odds"] = round(robin_odds, 3)
                arb["last_verified_robin_at"] = time.time()
                arb["last_verified_robin_source"] = source

            quote_id = _issue_verified_quote(
                current_username,
                req.arb_id,
                matched_odds,
                verify_payload,
                matched_candidate,
                arb_snapshot=arb,
            )
            response_payload = {
                "verified": True,
                "status": "OK",
                "current_odds": matched_odds,
                "feed_odds": feed_odds,
                "selection": arb.get("bk1_selection"),
                "outcome": verify_outcome or service_outcome,
                "source": "pinnacle-betslip",
                "timestamp": time.time(),
                "detail": f"Pinnacle betslip verified at odds {matched_odds}",
                "event_id": event_id_int or None,
                "live_place_supported": _pinnacle_live_place_available(),
                "selection_id": _pinnacle_result_identifier(matched_candidate, "selection_id")
                    or _clean_pinnacle_identifier(verify_payload.get("selection_id")),
                "odds_id": _pinnacle_result_identifier(matched_candidate, "odds_id")
                    or _clean_pinnacle_identifier(verify_payload.get("odds_id")),
                "line_id": _pinnacle_result_identifier(matched_candidate, "line_id")
                    or _clean_pinnacle_identifier(verify_payload.get("line_id")),
                "max_stake": matched_candidate.get("max_stake"),
                "quote_id": quote_id,
                "market_metadata": verify_payload.get("market_metadata") if isinstance(verify_payload.get("market_metadata"), dict) else md,
                "result_status": matched_status,
            }
            if more_bet_lookup:
                response_payload["line_source"] = str(more_bet_lookup.get("source") or "pinnacle-more-bet")
                response_payload["pin888_more_bet_cached"] = bool(more_bet_lookup.get("cached"))
                response_payload["pinnacle_home"] = more_bet_lookup.get("home")
                response_payload["pinnacle_away"] = more_bet_lookup.get("away")
                response_payload["pinnacle_reversed"] = bool(more_bet_lookup.get("reversed"))
                response_payload["effective_ps3838_params"] = response_payload["market_metadata"].get("effective_ps3838_params")

            if robin_odds is not None and robin_odds > 1:
                response_payload["robin_odds"] = round(robin_odds, 3)
                response_payload["robin_price_source"] = source

            arb["last_verified_payload"] = {k: v for k, v in response_payload.items() if k != "quote_id"}
            return response_payload

        if suspicious_candidate is not None and suspicious_odds is not None:
            log.warning(
                "betslip quote rejected as suspicious: arb=%s event=%s detail=%s candidate_ids=%s",
                req.arb_id,
                event_id_int or verify_payload.get("event_id"),
                suspicious_detail,
                {
                    "selection_id": _pinnacle_result_identifier(suspicious_candidate, "selection_id"),
                    "odds_id": _pinnacle_result_identifier(suspicious_candidate, "odds_id"),
                    "line_id": _pinnacle_result_identifier(suspicious_candidate, "line_id"),
                },
            )
            return {
                "verified": False,
                "status": "MISMATCH",
                "current_odds": suspicious_odds,
                "feed_odds": float(arb["bk1_odds"]),
                "selection": arb.get("bk1_selection"),
                "outcome": verify_outcome or service_outcome,
                "source": "pinnacle-betslip",
                "timestamp": time.time(),
                "detail": suspicious_detail or "Suspicious Pinnacle quote ignored.",
                "event_id": event_id_int or None,
                "live_place_supported": False,
                "selection_id": _pinnacle_result_identifier(suspicious_candidate, "selection_id"),
                "odds_id": _pinnacle_result_identifier(suspicious_candidate, "odds_id"),
                "line_id": _pinnacle_result_identifier(suspicious_candidate, "line_id"),
                "max_stake": suspicious_candidate.get("max_stake"),
                "quote_id": None,
                "market_metadata": md,
                "error_code": "SUSPICIOUS_ODDS_MOVE",
            }

        if has_actionable_candidates:
            mismatch_candidate = actionable[0][2]
            mismatch_odds = actionable[0][3]
            return {
                "verified": False,
                "status": "MISMATCH",
                "current_odds": mismatch_odds,
                "feed_odds": float(arb["bk1_odds"]),
                "selection": arb.get("bk1_selection"),
                "outcome": verify_outcome or service_outcome,
                "source": "pinnacle-betslip",
                "timestamp": time.time(),
                "detail": (
                    bet_service_detail
                    or "Pinnacle returned a quote that does not match the requested selection — verifier ignored it."
                ),
                "event_id": event_id_int or None,
                "live_place_supported": False,
                "selection_id": _pinnacle_result_identifier(mismatch_candidate, "selection_id"),
                "odds_id": _pinnacle_result_identifier(mismatch_candidate, "odds_id"),
                "line_id": _pinnacle_result_identifier(mismatch_candidate, "line_id"),
                "max_stake": mismatch_candidate.get("max_stake"),
                "quote_id": None,
                "market_metadata": md,
            }

        if unavailable_candidate is not None:
            described = _describe_pinnacle_verify_detail(arb, unavailable_candidate)
            unavailable_status = str(unavailable_candidate.get("status") or "").upper() or "UNAVAILABLE"
            return {
                "verified": False,
                "status": unavailable_status,
                "current_odds": arb["bk1_odds"],
                "feed_odds": arb["bk1_odds"],
                "selection": arb.get("bk1_selection"),
                "outcome": verify_outcome or service_outcome,
                "source": "pinnacle-betslip",
                "timestamp": time.time(),
                "detail": described or bet_service_detail or "Pinnacle returned no live quote for this market.",
                "event_id": event_id_int or None,
                "live_place_supported": False,
                "selection_id": _clean_pinnacle_identifier(arb.get("pinnacle_selection_id")),
                "odds_id": _clean_pinnacle_identifier(arb.get("pinnacle_odds_id")),
                "line_id": _clean_pinnacle_identifier(verify_payload.get("line_id"))
                    or _clean_pinnacle_identifier(arb.get("pinnacle_line_id")),
                "quote_id": None,
                "market_metadata": md,
                "error_code": unavailable_candidate.get("error_code"),
                "should_stop_refresh": bool(unavailable_candidate.get("should_stop_refresh")),
                "refresh_expired": bool(unavailable_candidate.get("refresh_expired")),
                "service_window_seconds": unavailable_candidate.get("window_seconds"),
                "service_idle_reset_seconds": unavailable_candidate.get("idle_reset_seconds"),
            }

    # NOTE: Arcadia fallback removed 2026-05-21 — the standalone PS3838
    # betslip microservice on :8770 is now the single source of truth.
    # If it returns UNAVAILABLE/ERROR we surface that honestly rather
    # than papering over with a different (often divergent) data source.

    # Sticky-OK smoothing window. If we previously verified this same arb
    # against PS3838 successfully within VERIFY_STICKY_WINDOW_SEC and the
    # feed price hasn't drifted beyond tolerance, replay that snapshot
    # rather than flickering the UI when PS3838 betslip briefly returns
    # UNAVAILABLE / PRICE_DIFF (line cycling, period rollover, etc.).
    sticky = arb.get("last_verified_payload")
    sticky_ts = float(arb.get("last_verified_pinnacle_at") or 0)
    if sticky and time.time() - sticky_ts <= VERIFY_STICKY_WINDOW_SEC:
        feed_odds_now = float(arb.get("bk1_odds") or 0)
        if feed_odds_now > 0:
            try:
                sticky_feed = float(sticky.get("feed_odds") or 0)
            except (TypeError, ValueError):
                sticky_feed = feed_odds_now
            tolerance_now = max(ROBINARB_ODDS_TOLERANCE, feed_odds_now * 0.02)
            sticky_binding_ok = True
            sticky_outcome = str(sticky.get("outcome") or "").strip()
            if ps_outcome and sticky_outcome and sticky_outcome != ps_outcome:
                sticky_binding_ok = False
            if sticky_binding_ok:
                current_snapshot = _quote_binding_snapshot_from_payload(verify_payload)
                sticky_payload_for_snapshot = {
                    "event_id": sticky.get("event_id") or arb.get("event_id"),
                    "market": sticky.get("market") or arb.get("market"),
                    "outcome": sticky_outcome or verify_payload.get("outcome"),
                    "market_metadata": sticky.get("market_metadata") or md,
                    "selection_id": sticky.get("selection_id"),
                    "odds_id": sticky.get("odds_id"),
                    "line_id": sticky.get("line_id"),
                }
                sticky_snapshot = _quote_binding_snapshot_from_payload(sticky_payload_for_snapshot)
                if (
                    current_snapshot.get("event_id")
                    and sticky_snapshot.get("event_id")
                    and current_snapshot["event_id"] != sticky_snapshot["event_id"]
                ):
                    sticky_binding_ok = False
                if (
                    sticky_binding_ok
                    and current_snapshot.get("market")
                    and sticky_snapshot.get("market")
                    and current_snapshot["market"] != sticky_snapshot["market"]
                ):
                    sticky_binding_ok = False
            if sticky_binding_ok and abs(sticky_feed - feed_odds_now) <= tolerance_now:
                cached = dict(sticky)
                cached["timestamp"] = time.time()
                cached["sticky"] = True
                cached["sticky_age_sec"] = round(time.time() - sticky_ts, 2)
                cached["feed_odds"] = feed_odds_now
                if bet_service_detail:
                    cached["live_detail"] = bet_service_detail
                return cached

    final_detail = bet_service_detail or (
        "Cannot translate Forted selection to Pinnacle outcome — selection format not supported yet."
        if raw_selection and not ps_outcome else
        "Pinnacle returned no live quote for this market."
    )
    return {
        "verified": False,
        "status": "UNAVAILABLE",
        "current_odds": arb["bk1_odds"],
        "feed_odds": arb["bk1_odds"],
        "selection": arb.get("bk1_selection"),
        "source": "forted-feed",
        "timestamp": time.time(),
        "detail": final_detail,
        "event_id": event_id_int or None,
        "live_place_supported": False,
        "selection_id": arb.get("pinnacle_selection_id"),
        "odds_id": arb.get("pinnacle_odds_id"),
        "line_id": _clean_pinnacle_identifier(verify_payload.get("line_id")) or arb.get("pinnacle_line_id"),
        "market_metadata": md,
    }


@app.post("/api/verify/calculator/release")
async def release_calculator_verify(
    req: VerifyReleaseRequest,
    current_username: str = Depends(_require_current_username),
):
    clean_client_id = str(req.client_id or "").strip()[:96]
    released = False
    with _calculator_verify_lock:
        claim = _calculator_verify_claims.get(current_username)
        if (
            claim
            and claim.get("client_id") == clean_client_id
            and str(claim.get("arb_id") or "") == str(req.arb_id)
        ):
            _calculator_verify_claims.pop(current_username, None)
            released = True
    return {"released": released}


@app.get("/api/balance")
async def get_balance(current_username: str = Depends(_require_current_username)):
    snapshot = _snapshot_user(current_username)
    return {
        **snapshot["balance"],
        "user": snapshot["user"],
        "in_play": snapshot["in_play"],
    }


@app.post("/api/bet")
async def place_bet(req: BetRequest, current_username: str = Depends(_require_current_username)):
    if not math.isfinite(req.stake) or not math.isfinite(req.odds):
        raise HTTPException(400, "Stake and odds must be finite numbers")

    verify_mode = _verify_mode(req.verify_mode)
    quote: dict[str, Any] | None = None
    current_arb = _find_arb_by_id(req.arb_id)
    if not req.quote_id and current_arb is None:
        raise HTTPException(404, "Arb not found")
    quote = _consume_verified_quote(current_username, req.arb_id, req.quote_id)
    if not quote:
        raise HTTPException(409, "Verify the live Pinnacle price before accepting this order")
    if quote and isinstance(quote.get("arb_snapshot"), dict):
        arb = dict(quote["arb_snapshot"])
    else:
        arb = current_arb
    if not arb:
        raise HTTPException(404, "Arb not found")
    if not quote.get("verified") and not _verified_quote_matches_current_arb(quote, arb):
        raise HTTPException(409, "Pinnacle identifiers changed; verify the live price again")
    if req.side == "pinnacle":
        expected_odds = float(quote.get("odds") or 0)
    else:
        snapshot = quote.get("arb_snapshot")
        expected_odds = float(
            (snapshot.get("robin_odds") if isinstance(snapshot, dict) else None)
            or (snapshot.get("bk2_odds") if isinstance(snapshot, dict) else None)
            or arb.get("robin_odds")
            or arb.get("bk2_odds")
            or 0
        )

    if current_arb is not None and _arb_requires_live_freshness(arb, _arbs_source) and not _live_arb_is_fresh(arb):
        raise HTTPException(409, "Arb is stale; refresh the scanner and verify the price again")

    if expected_odds <= 1 or abs(req.odds - expected_odds) > ROBINARB_ODDS_TOLERANCE:
        raise HTTPException(400, "Odds mismatch for this local order")

    # Keep the emergency per-order cap after identity, quote, freshness, and
    # odds validation so it cannot mask the more actionable 404/409 errors.
    if req.stake > ROBINARB_MAX_STAKE_LIMIT:
        raise HTTPException(
            400,
            f"Временный лимит на ставку {ROBINARB_MAX_STAKE_LIMIT:g} евро, "
            "изменится после успешной серии ставок без багов, очень скоро",
        )

    # ── Match-stake limits (per-match aggregator, ported from big_value) ──
    match_key = _arb_match_key(arb)
    limits_source = _limits_source(current_username, req.side)
    cap_info = _resolve_match_cap_for_arb(arb)
    cap = cap_info["cap"]
    limits_check: dict[str, Any] = {"allowed": True}
    # Allow Leg 2 (counter leg) of a verified quote to complete hedging even if Leg 1 reached the match limit cap
    skip_limit_for_counter_leg = (req.side == "robinbet" and quote is not None)
    if _match_limits is not None and not skip_limit_for_counter_leg:
        limits_check = _match_limits.check_local_limits(
            match_key,
            limits_source,
            float(req.stake),
            max_stake_per_match=cap,
        )
        if not limits_check.get("allowed"):
            raise HTTPException(
                409,
                {
                    "error": "match_limit_exceeded",
                    "reason": limits_check.get("reason"),
                    "stats": limits_check.get("stats"),
                    "remaining": limits_check.get("remaining"),
                },
            )
        adjusted = float(limits_check.get("adjusted_stake") or req.stake)
        if adjusted + 0.005 < float(req.stake):
            if ROBINARB_LIMITS_AUTO_ADJUST:
                # Mirror big_value autobetting: silently cap at remaining headroom.
                req.stake = round(adjusted, 2)
            else:
                raise HTTPException(
                    409,
                    {
                        "error": "stake_above_remaining",
                        "reason": (
                            f"Stake exceeds remaining headroom for this match. "
                            f"Ready to accept up to {adjusted:.2f}."
                        ),
                        "adjusted_stake": round(adjusted, 2),
                        "stats": limits_check.get("stats"),
                        "remaining": limits_check.get("remaining"),
                    },
                )

    account = "pinnacle_cashback" if req.side == "pinnacle" else "robinbet"
    cashback = round(req.stake * 0.5, 2) if req.side == "pinnacle" else 0.0
    live_place_required = (
        (req.side == "pinnacle" and verify_mode == "betslip" and _pinnacle_live_place_available())
        or (
            # Story reconcile Фаза3 (audit C, item 4 -- scoping): before this
            # fix, ANY side=robinbet fork routed into _place_betfair_via_service
            # whenever the Betfair live-place flag was on, regardless of
            # which counter-bookmaker the arb actually used. OneWin/Ladbrokes/
            # BCGame/Betfair-Exchange forks must never reach the Betfair
            # fixed-odds client -- only a genuine Betfair Sportsbook fork may.
            req.side == "robinbet"
            and verify_mode == "betslip"
            and _betfair_live_place_available()
            and _is_betfair_sportsbook_leg(arb)
        )
    ) and quote is not None
    live_place_reserved = False
    pinnacle_place_response: dict[str, Any] | None = None
    betfair_place_response: dict[str, Any] | None = None
    if live_place_required:
        with _users_lock:
            user = _users.get(current_username)
            if not user:
                raise HTTPException(401, "Unauthorized")
            balance = user["balance"]
            if balance[account] < req.stake:
                raise HTTPException(400, f"Insufficient balance: {balance[account]:.2f} < {req.stake:.2f}")
            balance[account] = max(0.0, round(balance[account] - req.stake, 2))
            live_place_reserved = True
            try:
                _storage.update_user_balance(current_username, balance)
            except Exception as exc:
                log.warning("persist live-place reserve failed: %s", exc)
        try:
            if req.side == "pinnacle":
                pinnacle_place_response = await _place_pinnacle_via_service(
                    arb,
                    quote,
                    stake=float(req.stake),
                    expected_odds=expected_odds,
                )
            else:
                betfair_place_response = await _place_betfair_via_service(
                    arb,
                    quote,
                    stake=float(req.stake),
                    expected_odds=expected_odds,
                )
        except HTTPException:
            with _users_lock:
                user = _users.get(current_username)
                if user:
                    user["balance"][account] += req.stake
                    try:
                        _storage.update_user_balance(current_username, user["balance"])
                    except Exception as exc:
                        log.warning("persist live-place reserve refund failed: %s", exc)
            raise

    with _users_lock:
        user = _users.get(current_username)
        if not user:
            raise HTTPException(401, "Unauthorized")

        balance = user["balance"]
        if not live_place_reserved and balance[account] < req.stake:
            raise HTTPException(400, f"Insufficient balance: {balance[account]:.2f} < {req.stake:.2f}")

        if not live_place_reserved:
            balance[account] = max(0.0, round(balance[account] - req.stake, 2))

        # PIN and RobinBet are both local accepts against the user's external
        # counter leg, so they must record the Pinnacle-leg outcome.
        selection = arb.get("bk1_outcome") or arb.get("bk1_selection") or arb["side1"]

        # New audit fields:
        pinnacle_odds_val = float(arb.get("bk1_odds") or 0)
        robin_odds_val = float(arb.get("robin_odds") or 0)
        pinnacle_verify_odds_val = float(quote.get("odds") or quote.get("current_odds") or 0) if quote else None
        pinnacle_hub_event_id_val = arb.get("pinnacle_hub_event_id")
        
        margin_val = None
        price_sig_val = None
        if pinnacle_hub_event_id_val:
            cached_board = robin_margin._board_cache.get(str(pinnacle_hub_event_id_val))
            if cached_board and cached_board[1] is not None:
                parsed_sel = robin_margin.parse_raw_selection(arb.get("bk1_selection") or "")
                if parsed_sel.get("market_type"):
                    margin_val = robin_margin.market_margin(cached_board[1], parsed_sel)
                    price_sig_val = robin_margin.market_price_signature(cached_board[1], parsed_sel)

        line_source_val = quote.get("line_source") if quote else None

        bet = {
            "id": str(uuid.uuid4())[:8], "arb_id": req.arb_id,
            "match": arb["match"], "sport": arb["sport"], "market": arb["market"],
            "side": req.side, "selection": selection,
            "odds": expected_odds, "stake": req.stake, "cashback": cashback,
            "potential_return": round(req.stake * expected_odds, 2),
            "fork_profit_pct": float(arb.get("profit_pct") or 0),
            "robin_profit_pct": float(arb.get("robin_profit_pct") or 0),
            "counter_bk": arb.get("bk2"),
            "counter_odds": float(arb.get("bk2_odds") or 0),
            "counter_selection": arb.get("bk2_selection") or arb.get("side2"),
            "bk2_url": arb.get("bk2_url"),
            "status": (
                "pending_reconciliation"
                if (
                    (pinnacle_place_response and str(pinnacle_place_response.get("status") or "").upper() in {"UNKNOWN", "PENDING"})
                    or (betfair_place_response and str(betfair_place_response.get("status") or "").upper() in {"UNKNOWN", "PENDING"})
                )
                else "accepted"
            ), "placed_at": time.time(),
            "settled_at": None, "payout": 0.0,
            "pinnacle_odds": pinnacle_odds_val,
            "robin_odds": robin_odds_val,
            "pinnacle_verify_odds": pinnacle_verify_odds_val,
            "pinnacle_hub_event_id": pinnacle_hub_event_id_val,
            "margin": margin_val,
            "price_signature": price_sig_val,
            "line_source": line_source_val,
        }
        if pinnacle_place_response is not None:
            recon = pinnacle_place_response.get("reconciliation") if isinstance(pinnacle_place_response.get("reconciliation"), dict) else {}
            order_id = (
                pinnacle_place_response.get("wager_id")
                or pinnacle_place_response.get("order_id")
                or recon.get("order_id")
            )
            bet["pinnacle_live_place"] = {
                "status": pinnacle_place_response.get("status"),
                "http_status": pinnacle_place_response.get("http_status"),
                "unique_request_id": pinnacle_place_response.get("unique_request_id"),
                "current_odds": pinnacle_place_response.get("current_odds") or pinnacle_place_response.get("odds"),
                "expected_odds": pinnacle_place_response.get("expected_odds"),
                "wager_id": order_id,
                "order_id": order_id,
                "betslip_id": recon.get("betslip_id"),
                "reconciliation": recon or None,
                "reconciliation_required": bool(
                    pinnacle_place_response.get("reconciliation_required")
                    or str(pinnacle_place_response.get("status") or "").upper() in {"UNKNOWN", "PENDING"}
                ),
            }
        if betfair_place_response is not None:
            recon = betfair_place_response.get("reconciliation") if isinstance(betfair_place_response.get("reconciliation"), dict) else {}
            order_id = (
                betfair_place_response.get("wager_id")
                or betfair_place_response.get("order_id")
                or recon.get("order_id")
            )
            bet["betfair_live_place"] = {
                "status": betfair_place_response.get("status"),
                "current_odds": betfair_place_response.get("current_odds"),
                "expected_odds": betfair_place_response.get("expected_odds"),
                "wager_id": order_id,
                "order_id": order_id,
                "reconciliation": recon or None,
                "reconciliation_required": bool(
                    betfair_place_response.get("reconciliation_required")
                    or str(betfair_place_response.get("status") or "").upper() in {"UNKNOWN", "PENDING"}
                ),
            }
        user["bets"].append(bet)
        balance_after = round(balance[account], 2)
        try:
            _storage.insert_bet(current_username, bet)
            _storage.update_user_balance(current_username, balance)
        except Exception as exc:
            log.warning("persist bet failed: %s", exc)

    if _match_limits is not None:
        try:
            _match_limits.record_bet(
                match_key,
                outcome=selection,
                source=limits_source,
                stake=float(req.stake),
                odds=expected_odds,
                extra={
                    "bet_id": bet["id"],
                    "username": current_username,
                    "side": req.side,
                    "arb_id": req.arb_id,
                    "match": arb.get("match"),
                    "match_key": match_key,
                },
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("record match-limit bet failed: %s", exc)

    return {"bet": bet, "balance_after": balance_after}


@app.post("/api/bet/reconcile")
async def api_reconcile_live_place(
    order_id: str = "",
    bet_id: str = "",
    current_username: str = Depends(_require_current_username),
):
    """Read-only: resolve a user's pending live order without re-placing."""
    identifier = str(order_id or "").strip()
    requested_bet_id = str(bet_id or "").strip()
    if not identifier and not requested_bet_id:
        raise HTTPException(400, {"error": "order_id_or_bet_id_required"})

    def live_identifiers(live: dict[str, Any]) -> set[str]:
        reconciliation = live.get("reconciliation") if isinstance(live.get("reconciliation"), dict) else {}
        return {
            str(value).strip()
            for value in (
                live.get("order_id"),
                live.get("wager_id"),
                live.get("entry_service_id"),
                live.get("bet_id"),
                live.get("receipt_bet_id"),
                reconciliation.get("order_id"),
            )
            if value is not None and str(value).strip()
        }

    with _users_lock:
        user = _users.get(current_username)
        matches: list[tuple[str, str]] = []
        target_snapshot: dict[str, Any] | None = None
        if user:
            for bet in user.get("bets") or []:
                for provider, key in (
                    ("pinnacle", "pinnacle_live_place"),
                    ("betfair", "betfair_live_place"),
                ):
                    live = bet.get(key) if isinstance(bet.get(key), dict) else {}
                    matches_order = bool(identifier) and identifier in live_identifiers(live)
                    matches_local_bet = (
                        not identifier
                        and provider == "betfair"
                        and str(bet.get("id") or "") == requested_bet_id
                        and bool(live)
                    )
                    if matches_order or matches_local_bet:
                        matches.append((str(bet.get("id") or ""), provider))
                        target_snapshot = dict(bet)
    if not matches:
        raise HTTPException(404, {"error": "reconciliation_order_not_found"})
    if len(matches) != 1:
        raise HTTPException(409, {"error": "reconciliation_order_ambiguous"})

    local_bet_id, provider = matches[0]
    reconciliation_intent = None
    if provider == "betfair" and not identifier and target_snapshot is not None:
        live = target_snapshot.get("betfair_live_place") if isinstance(target_snapshot.get("betfair_live_place"), dict) else {}
        recon = live.get("reconciliation") if isinstance(live.get("reconciliation"), dict) else {}
        reconciliation_intent = {
            "event_id": recon.get("event_id"),
            "selection_id": recon.get("selection_id") or live.get("betslip_id"),
            "stake": recon.get("stake") or target_snapshot.get("stake"),
            "expected_odds": recon.get("expected_odds") or live.get("expected_odds"),
        }
    result = (
        await reconcile_betfair_live_place(identifier, intent=reconciliation_intent)
        if provider == "betfair"
        else await reconcile_pinnacle_live_place(identifier)
    )
    status = str(result.get("status") or "").upper() if isinstance(result, dict) else ""
    with _users_lock:
        user = _users.get(current_username)
        if user:
            for bet in user.get("bets") or []:
                if str(bet.get("id") or "") != local_bet_id:
                    continue
                live_key = "betfair_live_place" if provider == "betfair" else "pinnacle_live_place"
                live = bet.get(live_key) if isinstance(bet.get(live_key), dict) else {}
                if status == "PLACED":
                    bet["status"] = "accepted"
                    live["status"] = "PLACED"
                    live["reconciliation_required"] = False
                    if result.get("odds") is not None:
                        live["current_odds"] = result.get("odds")
                    for key in ("entry_service_id", "bet_id", "receipt_bet_id"):
                        if result.get(key) is not None:
                            live[key] = result.get(key)
                elif status == "NOT_PLACED" and provider == "pinnacle":
                    if bet.get("status") == "pending_reconciliation":
                        account = "pinnacle_cashback" if bet.get("side") == "pinnacle" else "robinbet"
                        stake = float(bet.get("stake") or 0)
                        user["balance"][account] = round(float(user["balance"].get(account, 0)) + stake, 2)
                        bet["status"] = "rejected_reconciled"
                        try:
                            _storage.update_user_balance(current_username, user["balance"])
                        except Exception as exc:
                            log.warning("reconcile persist failed: %s", exc)
                    live["status"] = "NOT_PLACED"
                    live["reconciliation_required"] = False
                else:
                    # Betfair NOT_PLACED is deliberately impossible here:
                    # an absent Activity record is UNKNOWN and never refunds.
                    live["status"] = "UNKNOWN" if provider == "betfair" else (status or live.get("status"))
                    live["reconciliation_required"] = True
                bet[live_key] = live
                try:
                    _storage.update_bet_status(
                        local_bet_id,
                        str(bet.get("status") or "pending_reconciliation"),
                        bet.get("settled_at"),
                        float(bet.get("payout") or 0),
                    )
                except Exception as exc:
                    log.warning("reconcile status persist failed: %s", exc)
                break
    return {"order_id": identifier or None, "bet_id": local_bet_id, "provider": provider, "result": result}


@app.get("/api/match/limits")
async def match_limits(
    arb_id: str,
    side: Literal["pinnacle", "robinbet"] = "pinnacle",
    current_username: str = Depends(_require_current_username),
):
    """Return the per-match stake aggregator state for an arb.

    The frontend uses this (and the same `match_limits` block on /api/calc)
    to show the user how much is still "ready to accept" on the match before
    they place the donor leg externally.
    """
    arb = _find_arb_by_id(arb_id)
    if not arb:
        raise HTTPException(404, "Arb not found")
    snapshot = _arb_limits_snapshot(arb, current_username)
    snapshot["side"] = side
    return snapshot


class SettleRequest(BaseModel):
    outcome: Literal["won", "lost"]


class AdminSettleRequest(BaseModel):
    outcome: Literal["won", "lost", "accepted"]
    username: str


class StatsSettleRequest(BaseModel):
    result: Literal["pinnacle_win", "donor_win", "void", "clear"]


def _apply_settlement(user: dict, target: dict, outcome: str) -> tuple[float, float]:
    stake = float(target.get("stake") or 0)
    odds = float(target.get("odds") or 0)
    side = target.get("side")
    account = "pinnacle_cashback" if side == "pinnacle" else "robinbet"
    balance = user["balance"]
    prev_status = target.get("status") or "accepted"
    prev_payout = float(target.get("payout") or 0)

    # Reverse previous settlement effects, if any.
    if prev_status == "won":
        balance[account] = max(0.0, round(balance[account] - prev_payout, 2))
        if side == "pinnacle":
            balance["cashback_pl"] = float(balance.get("cashback_pl", 0.0)) - (-0.5 * (stake * (odds - 1)))
    elif prev_status == "lost":
        if side == "pinnacle":
            balance["cashback_pl"] = float(balance.get("cashback_pl", 0.0)) - (0.5 * stake)

    now = time.time()
    payout = 0.0
    cashback_pl_adjustment = 0.0

    if outcome == "won":
        payout = round(stake * odds, 2)
        balance[account] += payout
        if side == "pinnacle":
            profit = stake * (odds - 1)
            cashback_pl_adjustment = -0.5 * profit
    elif outcome == "lost":
        if side == "pinnacle":
            cashback_pl_adjustment = 0.5 * stake
    # outcome == "accepted" → revert only, no new effects.

    balance["cashback_pl"] = float(balance.get("cashback_pl", 0.0)) + cashback_pl_adjustment
    target["status"] = outcome
    target["settled_at"] = now if outcome != "accepted" else None
    target["payout"] = payout
    return round(balance[account], 2), float(balance.get("cashback_pl", 0.0))


@app.post("/api/bets/{bet_id}/settle")
async def settle_bet(bet_id: str, req: SettleRequest, current_username: str = Depends(_require_current_username)):
    # Self-settle path retained for completeness, but the UI no longer exposes it.
    with _users_lock:
        user = _users.get(current_username)
        if not user:
            raise HTTPException(401, "Unauthorized")
        target = next((b for b in user["bets"] if b["id"] == bet_id), None)
        if not target:
            raise HTTPException(404, "Bet not found")
        if target.get("status") != "accepted":
            raise HTTPException(409, f"Bet already settled as {target.get('status')}")
        balance_after, cashback_pl = _apply_settlement(user, target, req.outcome)
        try:
            _storage.update_bet_status(bet_id, req.outcome, target["settled_at"], target["payout"])
            _storage.update_user_balance(current_username, user["balance"])
        except Exception as exc:
            log.warning("persist settle failed: %s", exc)
    return {"bet": target, "balance_after": balance_after, "cashback_pl": round(cashback_pl, 2)}


@app.get("/api/admin/users")
async def admin_list_users(current_username: str = Depends(_require_current_username)):
    _require_admin_username(current_username)
    out = []
    with _users_lock:
        for uname, user in _users.items():
            out.append({
                "username": uname,
                "display_name": user.get("display_name"),
                "role": user.get("role"),
                "bet_count": len(user.get("bets", [])),
            })
    out.sort(key=lambda u: (u["role"] != "admin", u["username"]))
    return {"users": out}


@app.get("/api/admin/bets")
async def admin_list_bets(
    status: Optional[str] = None,
    username: Optional[str] = None,
    current_username: str = Depends(_require_current_username),
):
    _require_admin_username(current_username)
    result: list[dict] = []
    target_username = (username or "").strip().lower() or None
    with _users_lock:
        for uname, user in _users.items():
            if target_username and uname != target_username:
                continue
            for bet in user["bets"]:
                if status and status != "all" and (bet.get("status") or "accepted") != status:
                    continue
                enriched = dict(bet)
                enriched["username"] = uname
                result.append(enriched)
    result.sort(key=lambda b: b.get("placed_at", 0), reverse=True)
    return {"bets": result, "count": len(result)}


@app.post("/api/admin/bets/{bet_id}/settle")
async def admin_settle_bet(bet_id: str, req: AdminSettleRequest, current_username: str = Depends(_require_current_username)):
    _require_admin_username(current_username)
    target_username = req.username.strip().lower()
    if not target_username:
        raise HTTPException(400, "username required")
    with _users_lock:
        user = _users.get(target_username)
        if not user:
            raise HTTPException(404, "User not found")
        target = next((b for b in user["bets"] if b["id"] == bet_id), None)
        if not target:
            raise HTTPException(404, "Bet not found")
        balance_after, cashback_pl = _apply_settlement(user, target, req.outcome)
        try:
            settled_at = target.get("settled_at")
            _storage.update_bet_status(bet_id, target["status"], settled_at, target["payout"])
            _storage.update_user_balance(target_username, user["balance"])
        except Exception as exc:
            log.warning("persist admin settle failed: %s", exc)
    return {"bet": target, "username": target_username, "balance_after": balance_after, "cashback_pl": round(cashback_pl, 2)}


@app.get("/api/bets")
async def get_bets(
    side: Optional[str] = None,
    current_username: str = Depends(_require_current_username),
):
    snapshot = _snapshot_user(current_username)
    bets = snapshot["bets"]
    result = bets if not side else [b for b in bets if b["side"] == side]
    return {"bets": list(reversed(result)), "count": len(result)}


def _stats_csv_path() -> Path:
    if _stats_collector is not None:
        return _stats_collector.csv_path
    return stats_collector.StatsConfig.from_env().data_dir / "robinarb_stats.csv"


def _read_stats_rows() -> list[dict[str, str]]:
    path = _stats_csv_path()
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", newline="") as fh:
        return [dict(row) for row in csv.DictReader(fh)]


def _write_stats_rows(rows: list[dict[str, Any]]) -> None:
    path = _stats_csv_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".csv.tmp")
    with tmp.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=stats_collector.CSV_FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in stats_collector.CSV_FIELDS})
    os.replace(tmp, path)


def _stats_record_row(record_id: str) -> dict[str, str]:
    wanted = str(record_id or "").strip()
    if not wanted:
        raise HTTPException(404, "Stats record not found")
    for row in _read_stats_rows():
        if row.get("record_id") == wanted:
            return row
    raise HTTPException(404, "Stats record not found")


def _stats_record_file_path(row: dict[str, str]) -> Path:
    raw_path = str(row.get("file_path") or "").strip()
    if not raw_path:
        raise HTTPException(404, "Stats record file not found")
    root = _stats_csv_path().parent.resolve()
    path = Path(raw_path).resolve()
    try:
        allowed = path.is_relative_to(root)
    except AttributeError:
        allowed = str(path).startswith(str(root) + os.sep)
    if not allowed or not path.is_file():
        raise HTTPException(404, "Stats record file not found")
    return path


def _read_stats_record_events(row: dict[str, str], *, limit: int = 2000) -> tuple[list[dict[str, Any]], int, bool]:
    path = _stats_record_file_path(row)
    limit = max(1, min(int(limit or 2000), 5000))
    events: list[dict[str, Any]] = []
    total = 0
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            total += 1
            if len(events) >= limit:
                continue
            try:
                parsed = json.loads(line)
                events.append(parsed if isinstance(parsed, dict) else {"event": "raw", "value": parsed})
            except json.JSONDecodeError as exc:
                events.append({"event": "parse_error", "detail": str(exc), "raw": line[:1000]})
    return events, total, total > len(events)


def _stats_price_change_row(
    row: dict[str, str],
    *,
    timestamp: Any,
    elapsed_sec: Any,
    event: str,
    status: Any,
    price: Any,
    last_known_price: Any,
    source: Any,
    detail: Any,
) -> dict[str, Any]:
    price_text = stats_collector.format_odds3(price)
    last_known_text = stats_collector.format_odds3(last_known_price)
    return {
        "record_id": row.get("record_id"),
        "timestamp": timestamp or "",
        "elapsed_sec": elapsed_sec,
        "event": event,
        "status": status or "",
        "pinnacle_price": price_text,
        "pinnacle_last_known_price": last_known_text,
        "robin_offered_odds": row.get("robin_odds", ""),
        "counter_selection": row.get("counter_selection", ""),
        "counter_bookmaker": row.get("counter_bookmaker", ""),
        "counter_odds": row.get("counter_odds", ""),
        "forted_profit_pct": row.get("forted_profit_pct", ""),
        "robin_profit_pct": row.get("robin_profit_pct", ""),
        "price": price_text,
        "last_known_price": last_known_text,
        "source": source or "",
        "detail": detail or "",
    }


def _stats_price_changes_from_events(row: dict[str, str], events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    changes: list[dict[str, Any]] = []
    last_price = _stats_num(row, "pin_odds_verified") or _stats_num(row, "pin_odds_forted")
    last_emitted_price = stats_collector.format_odds3(last_price)
    last_emitted_closed = False
    initial_timestamp = row.get("created_at") or (events[0].get("timestamp") if events else "")
    changes.append(_stats_price_change_row(
        row,
        timestamp=initial_timestamp,
        elapsed_sec=0,
        event="initial",
        status=row.get("verify_status") or "OK",
        price=last_price,
        last_known_price=last_price,
        source=row.get("verify_source"),
        detail="Initial Pinnacle betslip verification",
    ))
    for event in events:
        if event.get("event") != "price_tick":
            continue
        current = event.get("price")
        current_float = _stats_num({"price": current}, "price")
        closed = current_float is None
        if current_float is not None:
            last_price = current_float
        current_text = stats_collector.format_odds3(current_float)
        price_changed = current_text and (not last_emitted_price or current_text != last_emitted_price)
        status_changed = closed != last_emitted_closed
        if not price_changed and not status_changed:
            continue
        changes.append(_stats_price_change_row(
            row,
            timestamp=event.get("timestamp"),
            elapsed_sec=event.get("elapsed_sec"),
            event="price_change" if price_changed else "availability_change",
            status=event.get("status"),
            price=current_float,
            last_known_price=last_price,
            source=event.get("source"),
            detail=event.get("detail"),
        ))
        if current_text:
            last_emitted_price = current_text
        last_emitted_closed = closed
    completed = next((event for event in reversed(events) if event.get("event") == "completed"), None)
    if completed:
        changes.append(_stats_price_change_row(
            row,
            timestamp=completed.get("timestamp"),
            elapsed_sec=completed.get("elapsed_sec") or "",
            event="completed",
            status="CLOSED" if completed.get("price_closed") else "OK",
            price="",
            last_known_price=completed.get("last_known_price") or last_price,
            source="",
            detail=f"Monitoring completed after {completed.get('ticks') or row.get('ticks') or 0} ticks",
        ))
    return changes


def _stats_record_completed(events: list[dict[str, Any]]) -> bool:
    return any(event.get("event") == "completed" for event in events)


def _stats_record_changes_path(row: dict[str, str]) -> Path:
    source_path = _stats_record_file_path(row)
    return source_path.parent.parent / "price_changes" / source_path.name.replace(".jsonl", ".csv")


def _stats_record_price_changes_ready(row: dict[str, str], events: list[dict[str, Any]]) -> bool:
    return _stats_record_changes_path(row).is_file() or _stats_record_completed(events)


def _stats_record_price_changes(row: dict[str, str], events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    changes_path = _stats_record_changes_path(row)
    if changes_path.is_file():
        with changes_path.open("r", encoding="utf-8", newline="") as fh:
            return [dict(item) for item in csv.DictReader(fh)]
    if _stats_record_completed(events):
        return _stats_price_changes_from_events(row, events)
    return []


def _stats_num(row: dict[str, str], field: str) -> float | None:
    try:
        return float(row.get(field) or "")
    except (TypeError, ValueError):
        return None


def _stats_metric(row: dict[str, Any], field: str, result: str | None = None) -> float:
    direct = _stats_num(row, field)
    if direct is not None:
        return direct
    projected = stats_collector.settlement_projection(row, result)
    try:
        return float(projected.get(field) or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _stats_settlement_summary(rows: list[dict[str, str]]) -> dict[str, Any]:
    settled = 0
    totals = {
        "client_arb_turnover": 0.0,
        "client_arb_profit": 0.0,
        "client_donor_only_turnover": 0.0,
        "client_donor_only_profit": 0.0,
        "robin_house_stake": 0.0,
        "robin_house_profit": 0.0,
        "robin_house_turnover": 0.0,
    }
    by_result: dict[str, int] = {}
    for row in rows:
        result = str(row.get("settlement_result") or "").strip().lower()
        if result not in stats_collector.SETTLEMENT_RESULTS:
            continue
        settled += 1
        by_result[result] = by_result.get(result, 0) + 1
        turnover = _stats_metric(row, "virtual_turnover", result) or stats_collector.VIRTUAL_TURNOVER
        robin_stake = _stats_metric(row, "robin_stake", result)
        totals["client_arb_turnover"] += turnover
        totals["client_arb_profit"] += _stats_metric(row, "client_arb_profit", result)
        totals["client_donor_only_turnover"] += turnover
        totals["client_donor_only_profit"] += _stats_metric(row, "client_donor_only_profit", result)
        totals["robin_house_stake"] += robin_stake
        totals["robin_house_profit"] += _stats_metric(row, "robin_house_profit", result)
        totals["robin_house_turnover"] += turnover

    def roi(profit: float, base: float) -> float | None:
        if not base:
            return None
        return round(profit / base * 100.0, 4)

    return {
        "settled": settled,
        "open": max(0, len(rows) - settled),
        "by_result": by_result,
        "client_arb_turnover": round(totals["client_arb_turnover"], 4),
        "client_arb_profit": round(totals["client_arb_profit"], 4),
        "client_arb_roi_pct": roi(totals["client_arb_profit"], totals["client_arb_turnover"]),
        "client_donor_only_turnover": round(totals["client_donor_only_turnover"], 4),
        "client_donor_only_profit": round(totals["client_donor_only_profit"], 4),
        "client_donor_only_roi_pct": roi(totals["client_donor_only_profit"], totals["client_donor_only_turnover"]),
        "robin_house_stake": round(totals["robin_house_stake"], 4),
        "robin_house_profit": round(totals["robin_house_profit"], 4),
        "robin_house_roi_pct": roi(totals["robin_house_profit"], totals["robin_house_stake"]),
        "robin_house_turnover_roi_pct": roi(totals["robin_house_profit"], totals["robin_house_turnover"]),
    }


def _append_stats_record_event(row: dict[str, Any], event: dict[str, Any]) -> None:
    try:
        path = _stats_record_file_path(row)
    except HTTPException:
        return
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(event, ensure_ascii=False, sort_keys=True))
        fh.write("\n")


def _settle_stats_record_fallback(record_id: str, result: str) -> dict[str, Any]:
    rows = _read_stats_rows()
    for idx, row in enumerate(rows):
        if row.get("record_id") != record_id:
            continue
        updated = stats_collector.settle_csv_row(row, result)
        rows[idx] = updated
        _write_stats_rows(rows)
        event_name = "settlement_cleared" if result == "clear" else "settlement_updated"
        _append_stats_record_event(
            updated,
            {
                "event": event_name,
                "record_id": record_id,
                "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "settlement_result": updated.get("settlement_result"),
                "metrics": {
                    field: updated.get(field, "")
                    for field in (
                        "virtual_turnover",
                        "robin_stake",
                        "donor_stake",
                        "client_arb_profit",
                        "client_arb_roi_pct",
                        "client_donor_only_profit",
                        "client_donor_only_roi_pct",
                        "robin_house_profit",
                        "robin_house_roi_pct",
                        "robin_house_turnover_roi_pct",
                    )
                },
            },
        )
        return {field: updated.get(field, "") for field in stats_collector.CSV_FIELDS}
    raise HTTPException(404, "Stats record not found")


def _stats_filtered_rows(
    rows: list[dict[str, str]],
    *,
    category: str | None = None,
    mode: str | None = None,
    margin: str | None = None,
    verify_status: str | None = None,
    search: str | None = None,
) -> list[dict[str, str]]:
    query = (search or "").strip().lower()
    out: list[dict[str, str]] = []
    for row in rows:
        if category and category != "all" and row.get("category") != category:
            continue
        if mode and mode != "all" and row.get("mode") != mode:
            continue
        if margin == "calculated" and row.get("margin_calculated") != "1":
            continue
        if margin == "fallback" and row.get("margin_calculated") == "1":
            continue
        if verify_status and verify_status != "all" and row.get("verify_status") != verify_status:
            continue
        if query:
            haystack = " ".join(
                str(row.get(field) or "")
                for field in ("sport", "league", "match", "market", "selection", "counter_selection", "counter_bookmaker")
            ).lower()
            if query not in haystack:
                continue
        out.append(row)
    return out


@app.get("/api/admin/stats/summary")
async def admin_stats_summary(current_username: str = Depends(_require_current_username)):
    _require_admin_username(current_username)
    rows = _read_stats_rows()
    by_category: dict[str, int] = {}
    by_mode: dict[str, int] = {}
    by_sport: dict[str, int] = {}
    by_verify_status: dict[str, int] = {}
    checkpoints = {
        "price_live_20s": 0,
        "price_live_2m": 0,
        "price_prematch_2m": 0,
        "price_prematch_20m": 0,
    }
    drift_samples: list[float] = []
    unique_matches: set[tuple[str, str, str]] = set()
    for row in rows:
        unique_matches.add((
            str(row.get("sport") or ""),
            str(row.get("league") or ""),
            str(row.get("match") or ""),
        ))
        for bucket, field in (
            (by_category, "category"),
            (by_mode, "mode"),
            (by_sport, "sport"),
            (by_verify_status, "verify_status"),
        ):
            key = str(row.get(field) or "unknown")
            bucket[key] = bucket.get(key, 0) + 1
        for field in checkpoints:
            if str(row.get(field) or "").strip():
                checkpoints[field] += 1
        initial = _stats_num(row, "pin_odds_verified") or _stats_num(row, "pin_odds_forted")
        last = _stats_num(row, "last_price")
        if initial and last:
            drift_samples.append((last / initial - 1.0) * 100.0)

    margin_calculated = sum(1 for row in rows if row.get("margin_calculated") == "1")
    return {
        "total_records": len(rows),
        "unique_matches": len(unique_matches),
        "csv_path": str(_stats_csv_path()),
        "data_dir": str(_stats_csv_path().parent),
        "by_category": by_category,
        "by_mode": by_mode,
        "by_sport": by_sport,
        "by_verify_status": by_verify_status,
        "margin_calculated": margin_calculated,
        "fallback": len(rows) - margin_calculated,
        "closed": sum(1 for row in rows if row.get("price_closed") == "1"),
        "checkpoints": checkpoints,
        "avg_last_price_drift_pct": round(sum(drift_samples) / len(drift_samples), 4) if drift_samples else None,
        "settlement": _stats_settlement_summary(rows),
        "collector": _stats_collector.status() if _stats_collector else {"enabled": False, "started": False},
        "pin888_stream_cache": pinnacle_hub.stream_cache_status(),
    }


@app.get("/api/admin/stats/records")
async def admin_stats_records(
    category: str | None = None,
    mode: str | None = None,
    margin: str | None = None,
    verify_status: str | None = None,
    search: str | None = None,
    limit: int = 250,
    current_username: str = Depends(_require_current_username),
):
    _require_admin_username(current_username)
    rows = _stats_filtered_rows(
        _read_stats_rows(),
        category=category,
        mode=mode,
        margin=margin,
        verify_status=verify_status,
        search=search,
    )
    limit = max(1, min(int(limit or 250), 1000))
    rows = list(reversed(rows))[:limit]
    return {"records": rows, "count": len(rows), "limit": limit}


@app.get("/api/admin/stats/records/{record_id}")
async def admin_stats_record_detail(
    record_id: str,
    limit: int = 2000,
    current_username: str = Depends(_require_current_username),
):
    _require_admin_username(current_username)
    row = _stats_record_row(record_id)
    events, total, truncated = _read_stats_record_events(row, limit=limit)
    price_changes = _stats_record_price_changes(row, events)
    price_changes_ready = _stats_record_price_changes_ready(row, events)
    return {
        "record": row,
        "price_changes": price_changes,
        "price_changes_ready": price_changes_ready,
        "monitoring_complete": _stats_record_completed(events),
        "events": events,
        "events_count": total,
        "truncated": truncated,
    }


@app.post("/api/admin/stats/records/{record_id}/settle")
async def admin_stats_record_settle(
    record_id: str,
    req: StatsSettleRequest,
    current_username: str = Depends(_require_current_username),
):
    _require_admin_username(current_username)
    try:
        if _stats_collector is not None and hasattr(_stats_collector, "settle_record"):
            row = _stats_collector.settle_record(record_id, req.result)
        else:
            row = _settle_stats_record_fallback(record_id, req.result)
    except KeyError:
        raise HTTPException(404, "Stats record not found")
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"record": row, "settlement": _stats_settlement_summary([row])}


@app.get("/api/admin/stats/records/{record_id}/download")
async def admin_stats_record_download(
    record_id: str,
    current_username: str = Depends(_require_current_username),
):
    _require_admin_username(current_username)
    row = _stats_record_row(record_id)
    path = _stats_record_file_path(row)
    return FileResponse(
        path,
        media_type="application/x-ndjson",
        filename=f"{record_id}.jsonl",
    )


@app.get("/api/admin/stats/records/{record_id}/price_changes.csv")
@app.get("/api/admin/stats/records/{record_id}/events.csv")
async def admin_stats_record_price_changes_csv(
    record_id: str,
    current_username: str = Depends(_require_current_username),
):
    _require_admin_username(current_username)
    row = _stats_record_row(record_id)
    events, _total, _truncated = _read_stats_record_events(row, limit=5000)
    if not _stats_record_price_changes_ready(row, events):
        raise HTTPException(409, "Price change CSV is not ready yet")
    changes = _stats_record_price_changes(row, events)
    fieldnames = stats_collector.PRICE_CHANGE_FIELDS
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for event in changes:
        writer.writerow({field: event.get(field, "") for field in fieldnames})
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{record_id}_price_changes.csv"'},
    )


@app.get("/api/admin/stats/download")
async def admin_stats_download(current_username: str = Depends(_require_current_username)):
    _require_admin_username(current_username)
    path = _stats_csv_path()
    if not path.exists():
        raise HTTPException(404, "Stats CSV not found")
    return FileResponse(
        path,
        media_type="text/csv",
        filename="robinarb_stats.csv",
    )


@app.get("/api/stats")
async def get_stats(current_username: str = Depends(_require_current_username)):
    _ = current_username
    try:
        house_pnl = _storage.aggregate_house_pnl()
    except Exception:
        house_pnl = 0.0
    return {"house_pnl": round(house_pnl, 2)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8899, reload=True)
