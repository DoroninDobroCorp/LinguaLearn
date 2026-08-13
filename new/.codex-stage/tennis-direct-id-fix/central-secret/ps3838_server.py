#!/usr/bin/env python3
"""
PS3838 WebSocket-сервер — Все виды спорта.
Главная точка входа (рефакторенная). Вся логика вынесена в отдельные модули:

  config.py           — переменные окружения и константы
  state.py            — общее изменяемое состояние (ParserState)
  utils.py            — log(), allow_live(), split_sports()
  helpers.py          — общие хелперы (make_odd, float_to_line, ensure_map)
  normalizers.py      — нормализация имён команд и лиг по видам спорта
  parser.py           — парсинг котировок и слияние обновлений
  specials_parser.py  — парсинг спецрынков (BTTS, CS, OE и т.д.)
  event_store.py      — хранение raw-событий, применение дельт
  pid_mapper.py       — маппинг PID для downstream-потребителей
  stale_detector.py   — проверка тишины/свежести, статус stale
  broadcaster.py      — рассылка, send_state_loop, обработчик клиентов
  session_manager.py  — загрузка/обновление сессии, прокси, браузер
    subscription.py     — подписка/переподписка
    data_handler.py     — обработка FULL_ODDS, UPDATE_ODDS и связанных дельт
   connection.py       — WS-подключения (браузер / прямое)
   forwarder_smart.py  — умный WS-форвардер с фильтрацией и heartbeat
"""

import importlib
import os
import subprocess
import sys
from pathlib import Path


_RUNTIME_IMPORT_NAMES = {
    "python-dotenv": "dotenv",
    "PySocks": "socks",
    "playwright": "playwright",
    "websockets": "websockets",
    "requests": "requests",
    "aiohttp": "aiohttp",
    "yarl": "yarl",
    "orjson": "orjson",
}


def _env_flag(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes")


def _bootstrap_log(message: str) -> None:
    sys.stdout.write(f"{message}\n")
    sys.stdout.flush()


def _iter_requirement_specs(requirements_path: Path) -> list[str]:
    if not requirements_path.exists():
        return []
    specs: list[str] = []
    for raw_line in requirements_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if line:
            specs.append(line)
    return specs


def _requirement_import_name(requirement_spec: str) -> str:
    package_name = requirement_spec
    for delimiter in ("==", ">=", "<=", "~=", "!="):
        package_name = package_name.split(delimiter, 1)[0]
    package_name = package_name.split("[", 1)[0].strip()
    return _RUNTIME_IMPORT_NAMES.get(package_name, package_name.lower().replace("-", "_"))


def _missing_runtime_requirements(requirements_path: Path) -> list[str]:
    missing: list[str] = []
    for requirement_spec in _iter_requirement_specs(requirements_path):
        try:
            importlib.import_module(_requirement_import_name(requirement_spec))
        except ImportError:
            missing.append(requirement_spec)
    return missing


def _bootstrap_runtime_dependencies() -> None:
    """Best-effort bootstrap for direct script runs before importing project deps."""
    if not _env_flag("PS3838_AUTO_INSTALL_REQUIREMENTS", "0"):
        return
    requirements_path = Path(__file__).resolve().parent / "requirements.txt"
    missing = _missing_runtime_requirements(requirements_path)
    if not missing:
        return
    _bootstrap_log(f"⚙ Installing missing dependencies: {', '.join(missing)}")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", *missing])
    _bootstrap_log("✓ Dependencies installed")


if __name__ == "__main__":
    _bootstrap_runtime_dependencies()

import asyncio
import json
import orjson
import logging
import time
from http import HTTPStatus
from typing import Dict, List

logger = logging.getLogger(__name__)
_hybrid_runtime_runner = None


def _configure_logging() -> None:
    level_name = (
        os.getenv("PS3838_LOG_LEVEL", "").strip()
        or os.getenv("PIN888_LOG_LEVEL", "").strip()
        or "INFO"
    )
    level = getattr(logging, level_name.upper(), logging.INFO)
    root = logging.getLogger()
    if not root.handlers:
        logging.basicConfig(
            level=level,
            format="%(asctime)s %(name)s %(levelname)s %(message)s",
        )
    else:
        root.setLevel(level)

import websockets
from websockets.asyncio.server import serve
from websockets.datastructures import Headers
from websockets.http11 import Response

# ── Импорт модулей ─────────────────────────────────────────────────────────────

import config
from config import (
    SERVER_PORT, SESSION_FILE,
    PS3838_USE_BROWSER_WS, PS3838_SIMPLE_SUBSCRIBE,
    PS3838_BROWSER_SUBSCRIBE, PS3838_BROWSER_LV_EMPTY,
    PS3838_DROP_STALE_UPDATES, PS3838_AUTO_REFRESH_ON_STALE,
    PS3838_REFRESH_BACKOFF_SEC,
    PS3838_SPORT_FO_BTGS, PS3838_SPORT_FO_COMBINE_BTGS, PS3838_SPORT_FO_LANE_STAGGER_SEC,
    PS3838_SPORTS, PS3838_SPORTS_PER_CONN, PS3838_PID_MAP_PATH,

    EVENTS_DATA_TTL_LIVE_SEC, EVENTS_DATA_TTL_PREMATCH_SEC,
    PREMATCH_MAX_HOURS, PREMATCH_MAX_HOURS_ESPORTS,
    LIVE_LAG_MS, PREMATCH_LAG_MS,
    SPECIALS_KEYS,
)
from state import state
import infra.debug_trace as debug_trace
from utils.utils import log, allow_live, split_sports
from infra.pid_mapper import map_game_pid
from utils.market_ts import (
    _sanitize_game_for_output,
    _count_active_closed_markers,
    _summarize_live_base_market_ages,
)
from utils.runtime_alerts import (
    build_runtime_alerts,
    collect_live_market_outliers,
)
from core.stale_detector import (
    check_silence, set_status, should_drop_stale,

    select_lag_threshold, select_silence_threshold,
)
from core.broadcaster import broadcast, send_state_loop, rebroadcast_loop, client_handler
from core.session_manager import current_account_health_snapshot, refresh_session
from core.connection import (
    listen_browser,
    listen_group,
    listen_pinnacle,
    _start_hybrid_poll_loop,
    _stop_hybrid_poll_loop,
)
from utils.event_store import _extract_parent_id
from services.bia_observer import (
    run_bia_observer,
    bia_observer_snapshot,
    lookup_bia_event_for_pid,
    lookup_unique_bia_event_for_pid,
    lookup_bia_selection_for_pid,
    lookup_bia_selection_for_pid_with_refresh,
)
from services.bia_event_hydration import hydrate_bia_event_snapshot
from services.bia_pmm_hydration import hydrate_bia_supported_outcomes


def _transport_backend() -> str:
    backend = str(getattr(config, "PS3838_TRANSPORT_BACKEND", "legacy") or "legacy").strip().lower()
    if backend not in {"legacy", "hybrid_runner"}:
        log(f"[CONFIG] Unknown PS3838_TRANSPORT_BACKEND={backend!r}; falling back to legacy")
        return "legacy"
    return backend


def _bia_task_start_message() -> str:
    if str(getattr(config, "PS3838_SEND_MODE", "base_only") or "base_only").strip().lower() != "base_only":
        return "BIA observer task started (integration mode: specials baseline/fallback merge enabled)"
    return "BIA observer task started (observer-only mode: no state merge)"


def _hybrid_runner_modes() -> list[str]:
    modes = [
        mode
        for mode in getattr(config, "PS3838_HYBRID_RUNNER_MODES", ()) or ()
        if str(mode).strip().lower() in {"today", "early"}
    ]
    if not modes:
        return ["today", "early"]
    deduped: list[str] = []
    seen: set[str] = set()
    for mode in modes:
        normalized = str(mode).strip().lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
    return deduped


def _split_query_csv(values: list[str]) -> list[str]:
    parts: list[str] = []
    for raw in values or []:
        for part in str(raw).split(","):
            token = part.strip()
            if token:
                parts.append(token)
    return parts


def _parse_hybrid_runtime_sports(values: list[str]) -> list[int] | None:
    tokens = _split_query_csv(values)
    if not tokens:
        return None
    slug_map = {
        str(slug).strip().lower(): int(sport_id)
        for sport_id, slug in (getattr(config, "SPORT_SLUGS", {}) or {}).items()
    }
    deduped: list[int] = []
    seen: set[int] = set()
    for token in tokens:
        normalized = token.strip().lower()
        sport_id = int(normalized) if normalized.isdigit() else slug_map.get(normalized)
        if sport_id is None or sport_id not in slug_map.values():
            raise ValueError(f"invalid sport: {token}")
        if sport_id in seen:
            continue
        seen.add(sport_id)
        deduped.append(sport_id)
    if not deduped:
        raise ValueError("sports must not be empty")
    return deduped


def _parse_hybrid_runtime_modes(values: list[str]) -> list[str] | None:
    tokens = _split_query_csv(values)
    if not tokens:
        return None
    deduped: list[str] = []
    seen: set[str] = set()
    for token in tokens:
        normalized = token.strip().lower()
        if normalized not in {"today", "early"}:
            raise ValueError(f"invalid mode: {token}")
        if normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
    if not deduped:
        raise ValueError("modes must not be empty")
    return deduped


def _parse_optional_float_query(values: list[str], *, field_name: str) -> float | None:
    if not values:
        return None
    raw = str(values[-1]).strip()
    if not raw:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"invalid {field_name}: {raw}") from exc


def _parse_optional_int_query(values: list[str], *, field_name: str) -> int | None:
    if not values:
        return None
    raw = str(values[-1]).strip()
    if not raw:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"invalid {field_name}: {raw}") from exc


def _read_runtime_lock(lock_path: Path) -> dict:
    try:
        raw = lock_path.read_text().strip()
    except FileNotFoundError:
        return {}
    except OSError:
        return {}
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        try:
            return {"pid": int(raw)}
        except (TypeError, ValueError):
            return {}
    return data if isinstance(data, dict) else {}


def _runtime_lock_pid_alive(pid: int) -> bool:
    if int(pid or 0) <= 0:
        return False
    try:
        os.kill(int(pid), 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def _runtime_lock_pid_command(pid: int) -> str:
    if int(pid or 0) <= 0:
        return ""
    proc_cmdline = Path(f"/proc/{int(pid)}/cmdline")
    try:
        raw = proc_cmdline.read_bytes()
    except OSError:
        raw = b""
    if raw:
        text = raw.replace(b"\x00", b" ").decode("utf-8", errors="replace").strip()
        if text:
            return text
    try:
        return subprocess.check_output(
            ["ps", "-p", str(int(pid)), "-o", "command="],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=2.0,
        ).strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def _runtime_lock_pid_matches_current_runtime(pid: int) -> bool:
    command = _runtime_lock_pid_command(pid)
    if not command:
        return True
    return "ps3838_server.py" in command.lower()


def _ensure_playwright_browser() -> None:
    """Install Chromium when Playwright bootstrap is enabled and browser is missing."""
    if not config.PS3838_AUTO_INSTALL_PLAYWRIGHT:
        return
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        logger.debug("Playwright package is not installed; skipping Chromium bootstrap")
        return

    try:
        with sync_playwright() as p:
            chromium_path = Path(p.chromium.executable_path)
            if chromium_path.exists():
                return
    except Exception:
        logger.warning("Could not verify Playwright Chromium installation; attempting install", exc_info=True)

    log("⚙ Installing Playwright Chromium browser...")
    subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
    log("✓ Chromium installed")


def _acquire_runtime_lock() -> bool:
    if not config.PS3838_PROCESS_LOCK_ENABLED:
        return True
    lock_path = Path(config.PS3838_PROCESS_LOCK_FILE)
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "pid": os.getpid(),
        "started_at": time.time(),
        "hostname": os.getenv("HOSTNAME") or os.uname().nodename,
    }
    while True:
        try:
            fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
        except FileExistsError:
            lock_info = _read_runtime_lock(lock_path)
            other_pid = int(lock_info.get("pid") or 0)
            try:
                lock_age_sec = max(0.0, time.time() - lock_path.stat().st_mtime)
            except OSError:
                lock_age_sec = 0.0
            if other_pid > 0 and _runtime_lock_pid_alive(other_pid):
                if _runtime_lock_pid_matches_current_runtime(other_pid):
                    log(
                        f"✗ Runtime lock active: pid={other_pid}, file={lock_path}. "
                        f"Refusing second parser instance."
                    )
                    return False
                log(
                    f"⚠ Runtime lock pid reused by unrelated live process: pid={other_pid}, "
                    f"file={lock_path}. Treating lock as stale."
                )
            if other_pid <= 0 and lock_age_sec < float(config.PS3838_PROCESS_LOCK_TTL_SEC):
                log(
                    f"✗ Runtime lock present without live pid: file={lock_path}, "
                    f"age={lock_age_sec:.0f}s. Refusing duplicate start."
                )
                return False
            try:
                lock_path.unlink()
            except FileNotFoundError:
                continue
            except OSError as e:
                log(f"✗ Failed to clear stale runtime lock {lock_path}: {e}")
                return False
            log(
                f"⚠ Cleared stale runtime lock: pid={other_pid or 'unknown'}, "
                f"age={lock_age_sec:.0f}s, file={lock_path}"
            )
            continue
        with os.fdopen(fd, "w") as handle:
            json.dump(payload, handle)
        state.runtime_lock_acquired = True
        state.runtime_lock_path = str(lock_path)
        log(f"✓ Runtime lock acquired: {lock_path} (pid={os.getpid()})")
        return True


def _release_runtime_lock() -> None:
    if not state.runtime_lock_acquired:
        return
    lock_path = Path(state.runtime_lock_path or config.PS3838_PROCESS_LOCK_FILE)
    lock_info = _read_runtime_lock(lock_path)
    owner_pid = int(lock_info.get("pid") or 0)
    if owner_pid not in (0, os.getpid()):
        state.runtime_lock_acquired = False
        state.runtime_lock_path = ""
        return
    try:
        lock_path.unlink(missing_ok=True)
        log(f"✓ Runtime lock released: {lock_path}")
    except OSError as e:
        log(f"⚠ Failed to release runtime lock {lock_path}: {e}")
    state.runtime_lock_acquired = False
    state.runtime_lock_path = ""


def _debug_logical_event_id(raw_event_id, meta):
    if not isinstance(raw_event_id, (int, float)) or int(raw_event_id) <= 0:
        return None
    logical_event_id = int(raw_event_id)
    if isinstance(meta, dict):
        parent_id = meta.get("parent_id")
        if isinstance(parent_id, (int, float)) and int(parent_id) > 0:
            logical_event_id = int(parent_id)
        else:
            raw_event = meta.get("event")
            if (
                isinstance(raw_event, list)
                and len(raw_event) > 28
                and isinstance(raw_event[28], (int, float))
                and int(raw_event[28]) > 0
            ):
                logical_event_id = int(raw_event[28])
    return logical_event_id


def _debug_raw_candidate_row(logical_event_id: int, raw_event_id: int, meta: dict) -> dict:
    raw_event = meta.get("event") if isinstance(meta, dict) else None
    odds_block = raw_event[8] if isinstance(raw_event, list) and len(raw_event) > 8 and isinstance(raw_event[8], dict) else {}
    period_zero = odds_block.get("0") or odds_block.get(0)
    has_p0 = bool(isinstance(period_zero, list) and len(period_zero) > 0)
    has_p0_handicap = bool(
        isinstance(period_zero, list)
        and len(period_zero) > 0
        and isinstance(period_zero[0], list)
        and len(period_zero[0]) > 0
    )
    has_p0_totals = bool(
        isinstance(period_zero, list)
        and len(period_zero) > 1
        and isinstance(period_zero[1], list)
        and len(period_zero[1]) > 0
    )
    return {
        "raw_event_id": int(raw_event_id),
        "logical_event_id": int(logical_event_id),
        "sport_id": meta.get("sport_id") if isinstance(meta, dict) else None,
        "sport_name": meta.get("sport_name") if isinstance(meta, dict) else None,
        "is_live": bool(meta.get("is_live")) if isinstance(meta, dict) else False,
        "home_name": meta.get("home_name") if isinstance(meta, dict) else None,
        "away_name": meta.get("away_name") if isinstance(meta, dict) else None,
        "parent_id": meta.get("parent_id") if isinstance(meta, dict) else None,
        "event_type": raw_event[27] if isinstance(raw_event, list) and len(raw_event) > 27 else None,
        "period_keys": sorted(str(k) for k in odds_block.keys())[:12] if isinstance(odds_block, dict) else [],
        "has_p0": has_p0,
        "has_p0_handicap": has_p0_handicap,
        "has_p0_totals": has_p0_totals,
        "selected_by_event_raw": False,
    }


def _collect_raw_candidates_for_logical_event(logical_event_id: int) -> list[dict]:
    rows = []
    for raw_event_id, meta in (state.raw_events or {}).items():
        if not isinstance(raw_event_id, (int, float)) or int(raw_event_id) <= 0:
            continue
        if not isinstance(meta, dict):
            continue
        candidate_logical = _debug_logical_event_id(raw_event_id, meta)
        if candidate_logical != int(logical_event_id):
            continue
        rows.append(_debug_raw_candidate_row(int(logical_event_id), int(raw_event_id), meta))
    rows.sort(
        key=lambda row: (
            -int(bool(row.get("is_live"))),
            -int(bool(row.get("has_p0_totals"))),
            -int(bool(row.get("has_p0_handicap"))),
            -int(bool(row.get("has_p0"))),
            row.get("raw_event_id") or 0,
        )
    )
    return rows


def _raw_candidate_meta_map(logical_event_id: int) -> dict[int, dict]:
    items = {}
    for raw_event_id, meta in (state.raw_events or {}).items():
        if not isinstance(raw_event_id, (int, float)) or int(raw_event_id) <= 0:
            continue
        if not isinstance(meta, dict):
            continue
        candidate_logical = _debug_logical_event_id(raw_event_id, meta)
        if candidate_logical != int(logical_event_id):
            continue
        items[int(raw_event_id)] = meta
    return items


def _logical_event_sport_id(event_id: int) -> int | None:
    try:
        logical_event_id = int(event_id)
    except (TypeError, ValueError):
        return None
    if logical_event_id <= 0:
        return None

    direct_meta = state.raw_events.get(logical_event_id)
    if isinstance(direct_meta, dict):
        sport_id = direct_meta.get("sport_id")
        if isinstance(sport_id, (int, float)) and int(sport_id) > 0:
            return int(sport_id)

    for meta in _raw_candidate_meta_map(logical_event_id).values():
        sport_id = meta.get("sport_id") if isinstance(meta, dict) else None
        if isinstance(sport_id, (int, float)) and int(sport_id) > 0:
            return int(sport_id)
    return None


def _sport_ws_429_backoff_active(sport_id: int | None, *, now_ts: float) -> bool:
    if not isinstance(sport_id, (int, float)) or int(sport_id) <= 0:
        return False
    backoff_map = getattr(state, "sport_ws_429_backoff_until", None)
    if not isinstance(backoff_map, dict):
        return False
    return float(backoff_map.get(int(sport_id), 0.0) or 0.0) > float(now_ts)


def _normalize_tennis_raw_meta(raw_event_id: int, meta: dict, fallback_event: dict | None = None) -> dict | None:
    if not isinstance(meta, dict):
        return None
    raw_event = meta.get("event")
    if not isinstance(raw_event, list):
        raw_event = []
    fallback_event = fallback_event if isinstance(fallback_event, dict) else {}
    odds_block = meta.get("odds_block")
    if not isinstance(odds_block, dict):
        odds_block = raw_event[8] if len(raw_event) > 8 and isinstance(raw_event[8], dict) else {}
    parent_id = meta.get("parent_id")
    if not isinstance(parent_id, (int, float)) or int(parent_id) <= 0:
        parent_id = raw_event[28] if len(raw_event) > 28 and isinstance(raw_event[28], (int, float)) and int(raw_event[28]) > 0 else raw_event_id
    event_type = meta.get("event_type")
    if not isinstance(event_type, str) or not event_type:
        event_type = raw_event[27] if len(raw_event) > 27 and isinstance(raw_event[27], str) else None
    return {
        "event_id": int(raw_event_id),
        "parent_id": int(parent_id) if isinstance(parent_id, (int, float)) and int(parent_id) > 0 else int(raw_event_id),
        "sport_id": meta.get("sport_id"),
        "sport_name": meta.get("sport_name") or "Tennis",
        "league_name": meta.get("league_name") or fallback_event.get("LeagueName") or "",
        "event_type": event_type,
        "home_name": meta.get("home_name") or fallback_event.get("homeName") or "",
        "away_name": meta.get("away_name") or fallback_event.get("awayName") or "",
        "home_score": float(meta.get("home_score") or 0.0),
        "away_score": float(meta.get("away_score") or 0.0),
        "is_extra": bool(meta.get("is_extra")),
        "odds_block": odds_block if isinstance(odds_block, dict) else {},
    }


def _candidate_parse_row(parsed_game: dict) -> dict:
    periods = parsed_game.get("Periods") if isinstance(parsed_game, dict) else []
    p0 = periods[0] if isinstance(periods, list) and periods and isinstance(periods[0], dict) else {}
    return {
        "keys": sorted(k for k in p0.keys() if not str(k).startswith("_")),
        "has_win1x2": bool(p0.get("Win1x2")),
        "sets_handicap_count": len(p0.get("SetsHandicap") or {}),
        "sets_total_count": len(p0.get("SetsTotal") or {}),
        "handicap_count": len(p0.get("Handicap") or {}),
        "totals_count": len(p0.get("Totals") or {}),
        "games_count": len(p0.get("Games") or {}),
    }


def _event_debug_candidate_parse_summary(event_id: int, candidates: list[dict], fallback_event: dict | None = None) -> list[dict]:
    if not candidates:
        return []
    try:
        from parsing.sport_parsers import parse_tennis_events
    except ImportError:
        return []

    meta_map = _raw_candidate_meta_map(int(event_id))
    rows = []
    all_meta = []
    for candidate in candidates:
        raw_event_id = candidate.get("raw_event_id")
        meta = meta_map.get(int(raw_event_id)) if isinstance(raw_event_id, (int, float)) else None
        normalized = _normalize_tennis_raw_meta(int(raw_event_id), meta, fallback_event) if isinstance(raw_event_id, (int, float)) else None
        if not isinstance(normalized, dict):
            continue
        all_meta.append(normalized)
        parsed = parse_tennis_events([normalized], True).get(int(event_id)) or {}
        row = {
            "mode": f"single:{int(raw_event_id)}",
            "raw_event_id": int(raw_event_id),
            "event_type": candidate.get("event_type"),
        }
        row.update(_candidate_parse_row(parsed))
        rows.append(row)

    if len(all_meta) > 1:
        parsed = parse_tennis_events(all_meta, True).get(int(event_id)) or {}
        row = {
            "mode": "merged_all",
            "raw_event_id": None,
            "event_type": "merged",
        }
        row.update(_candidate_parse_row(parsed))
        rows.append(row)
    return rows


def _event_debug_payload(event_id: int, ev: dict) -> dict:
    now_ts = time.time()
    data = _sanitize_game_for_output(ev)
    periods = data.get("Periods") or []
    p0 = periods[0] if periods and isinstance(periods[0], dict) else {}
    raw_event_id = (data.get("Raw") or {}).get("event_id")
    child_origin = isinstance(raw_event_id, (int, float)) and int(raw_event_id) > 0 and int(raw_event_id) != int(event_id)
    tennis_watch = getattr(state, "tennis_pe_watch", {})
    tennis_row = tennis_watch.get(int(event_id)) if isinstance(tennis_watch, dict) else None
    candidates = _collect_raw_candidates_for_logical_event(int(event_id))
    candidate_parse = _event_debug_candidate_parse_summary(int(event_id), candidates, data)
    source_limited_until = ev.get("_tennis_sets_source_limited_until") if isinstance(ev, dict) else None
    source_limited_remaining = None
    if isinstance(source_limited_until, (int, float)) and source_limited_until > now_ts:
        source_limited_remaining = round(max(0.0, source_limited_until - now_ts), 3)
    if isinstance(raw_event_id, (int, float)) and int(raw_event_id) > 0:
        for row in candidates:
            if row.get("raw_event_id") == int(raw_event_id):
                row["selected_by_event_raw"] = True
                break

    def _age(key: str):
        ts_val = p0.get(f"_{key}_ts")
        if not isinstance(ts_val, (int, float)) or ts_val <= 0:
            return None
        return round(max(0.0, now_ts - ts_val), 3)

    return {
        "event_id": int(event_id),
        "sport": data.get("SportName"),
        "home": data.get("homeName"),
        "away": data.get("awayName"),
        "raw_event_id": raw_event_id,
        "child_origin": child_origin,
        "tennis_sets_source_limited": source_limited_remaining is not None,
        "tennis_sets_source_limited_remaining_sec": source_limited_remaining,
        "tennis_sets_source_limited_raw_event_id": ev.get("_tennis_sets_source_limited_raw_event_id") if isinstance(ev, dict) else None,
        "market_age_sec": {
            "Win1x2": _age("Win1x2"),
            "Handicap": _age("Handicap"),
            "Totals": _age("Totals"),
            "SetsHandicap": _age("SetsHandicap"),
            "SetsTotal": _age("SetsTotal"),
            "fo_Win1x2": _age("fo_Win1x2"),
            "fo_Handicap": _age("fo_Handicap"),
            "fo_Totals": _age("fo_Totals"),
            "fo_SetsHandicap": _age("fo_SetsHandicap"),
            "fo_SetsTotal": _age("fo_SetsTotal"),
        },
        "raw_candidates": candidates,
        "candidate_parse": candidate_parse,
        "data": data,
    }



# !!! REST API ЗАПРОСЫ К PS3838 ЗАПРЕЩЕНЫ !!!
# !!! Любые HTTP/REST запросы к PS3838 API приводят к БАНУ аккаунта !!!
# !!! Все данные получаем ТОЛЬКО через WebSocket (FULL_ODDS, UPDATE_ODDS и связанные WS-дельты) !!!
# !!! НИКОГДА не добавляй код с REST запросами к PS3838 !!!
# Удалён весь REST specials polling код (PinSpecialsCache, poll_pin_specials_loop, etc.)

# ── HTTP-эндпоинт для здоровья/статистики ─────────────────────────────────────

# ── HTTP helpers & route handlers ─────────────────────────────────────────────

def _count_specials_events(events_data: dict) -> int:
    """Count events that have at least one BIA special market with data."""
    count = 0
    specials_set = set(SPECIALS_KEYS)
    for ev in events_data.values():
        if not isinstance(ev, dict):
            continue
        periods = ev.get("Periods")
        if not isinstance(periods, list) or not periods:
            continue
        p0 = periods[0]
        if not isinstance(p0, dict):
            continue
        if any(k in specials_set and isinstance(p0.get(k), dict) and p0[k] for k in p0):
            count += 1
    return count


def _http_response(status, headers, body, *, connection=None):
    """Return a response compatible with old and new websockets process_request APIs."""
    if connection is None:
        return status, headers, body
    reason = HTTPStatus(int(status)).phrase
    ws_headers = Headers()
    for key, value in headers:
        ws_headers[key] = value
    return Response(int(status), reason, ws_headers, body)


def _json_ok(data, *, connection=None):
    """Build HTTP 200 JSON response."""
    body = orjson.dumps(data)
    return _http_response(
        HTTPStatus.OK,
        [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
        body,
        connection=connection,
    )


def _json_err(data, status=HTTPStatus.BAD_REQUEST, *, connection=None):
    """Build HTTP error JSON response."""
    body = orjson.dumps(data)
    return _http_response(
        status,
        [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
        body,
        connection=connection,
    )


def _current_health_reason(
    *,
    stale: bool,
    state_reason: str,
    last_data_age_sec: float | None,
    valid_data_age_sec: float | None,
    ws_activity_age_sec: float | None,
) -> str:
    """Build a live health reason without mutating stale-detector state."""
    reason = str(state_reason or "").strip()
    if stale:
        if reason:
            return reason
        if valid_data_age_sec is not None:
            return f"no valid data for {valid_data_age_sec:.1f}s"
        if last_data_age_sec is not None:
            return f"no data for {last_data_age_sec:.1f}s"
        if ws_activity_age_sec is not None:
            return f"transport idle for {ws_activity_age_sec:.1f}s"
        return "stale"
    if valid_data_age_sec is not None:
        return f"data fresh (age {valid_data_age_sec:.1f}s)"
    if last_data_age_sec is not None:
        return f"data received (age {last_data_age_sec:.1f}s)"
    if ws_activity_age_sec is not None:
        return f"transport active (age {ws_activity_age_sec:.1f}s)"
    return reason or "warming up"


def _current_health_status(
    *,
    stale: bool,
    logged_in: bool,
    account_health_state: str,
) -> str:
    state = str(account_health_state or "").strip().lower()
    if state in {"blocked", "manual_review"}:
        return "error"
    if not logged_in:
        return "error"
    if stale:
        return "stale"
    return "ok"


def _account_health_failure_reason(account_health: dict | None) -> str:
    if not isinstance(account_health, dict):
        return ""
    reasons = account_health.get("reasons")
    if isinstance(reasons, list):
        for item in reasons:
            text = str(item or "").strip()
            if text:
                return text
    recommended = str(account_health.get("recommended_action") or "").strip()
    if recommended and recommended != "keep_running":
        return recommended.replace("_", " ")
    state = str(account_health.get("state") or "").strip().lower()
    if state:
        return f"account health {state}"
    return ""


def _parse_query_bool(value):
    """Parse a query-string boolean flag into True/False/None."""
    if value is None:
        return None
    text = str(value).strip().lower()
    if not text:
        return None
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off"}:
        return False
    return None


def _purge_events_for_mode():
    """Remove cached events that don't match the active live/prematch mode."""
    if config.PS3838_ONLY_LIVE and not config.PS3838_ONLY_PREMATCH:
        to_del = [eid for eid, ev in state.events_data.items() if not ev.get("isLive")]
    elif config.PS3838_ONLY_PREMATCH and not config.PS3838_ONLY_LIVE:
        to_del = [eid for eid, ev in state.events_data.items() if ev.get("isLive")]
    else:
        return 0
    for eid in to_del:
        state.events_data.pop(eid, None)
        state.event_source.pop(eid, None)
        if hasattr(state, '_mb_specials_presence'):
            state._mb_specials_presence.pop(eid, None)
        if hasattr(state, "bia_specials_signature"):
            state.bia_specials_signature.pop(eid, None)
    if to_del:
        log(f"[API] Purged {len(to_del)} events not matching new mode")
    return len(to_del)


_EVENT_STATE_CACHE_NAMES = (
    "events_data",
    "event_source",
    "raw_events",
    "last_broadcast_ts",
    "bia_specials_signature",
    "last_u_touched_markets",
    "update_signal_ts",
    "board_signal_ts",
    "list_signal_event_ts",
)


def _raw_family_ids_for_event_ids(event_ids, *, live_flags_by_event_id: Dict[int, bool] | None = None) -> set[int]:
    normalized_ids: set[int] = set()
    for event_id in event_ids or ():
        try:
            current = int(event_id)
        except (TypeError, ValueError):
            continue
        if current > 0:
            normalized_ids.add(current)
    if not normalized_ids:
        return set()

    related_raw_ids: set[int] = set()
    for raw_id, meta in list(state.raw_events.items()):
        if not isinstance(meta, dict):
            continue
        parent_id = _extract_parent_id(meta.get("event"))
        if parent_id not in normalized_ids:
            continue
        expected_live = live_flags_by_event_id.get(parent_id) if isinstance(live_flags_by_event_id, dict) else None
        if expected_live is not None and bool(meta.get("is_live")) != bool(expected_live):
            continue
        try:
            raw_event_id = int(raw_id)
        except (TypeError, ValueError):
            continue
        if raw_event_id > 0:
            related_raw_ids.add(raw_event_id)
    return related_raw_ids


def _purge_event_state(event_ids) -> set[int]:
    normalized_ids: set[int] = set()
    live_flags: Dict[int, bool] = {}
    for event_id in event_ids or ():
        try:
            current = int(event_id)
        except (TypeError, ValueError):
            continue
        if current <= 0:
            continue
        normalized_ids.add(current)
        game = state.events_data.get(current)
        if isinstance(game, dict):
            live_flags[current] = game.get("isLive") is True
    if not normalized_ids:
        return set()

    purge_ids = normalized_ids | _raw_family_ids_for_event_ids(
        normalized_ids,
        live_flags_by_event_id=live_flags,
    )
    for purge_id in purge_ids:
        for attr_name in _EVENT_STATE_CACHE_NAMES:
            cache = getattr(state, attr_name, None)
            if isinstance(cache, dict):
                cache.pop(purge_id, None)
        mb_presence = getattr(state, "_mb_specials_presence", None)
        if isinstance(mb_presence, dict):
            mb_presence.pop(purge_id, None)
    return purge_ids


def _get_ws_sp_diag():
    try:
        from parsing.parser import _ws_sp_diag
        return dict(_ws_sp_diag)
    except Exception:
        return {}


async def process_request(path_or_connection, request_or_headers):
    """HTTP-обработчик для /health, /stats, /account-health, /verify-odds, /cookies, /event/<id>.
    Возвращает JSON со статусом сервера, данными события или экспортом куки."""
    connection = None
    if hasattr(request_or_headers, "path"):
        connection = path_or_connection
        path = str(request_or_headers.path or "")
    else:
        path = str(path_or_connection or "")
    route = path.split("?", 1)[0]

    if route.startswith("/event-debug/"):
        event_id = route[len("/event-debug/"):]
        ev = state.events_data.get(event_id) or state.events_data.get(int(event_id)) if event_id.isdigit() else state.events_data.get(event_id)
        if not ev:
            body = orjson.dumps({"error": "not found", "event_id": event_id})
            return _http_response(
                HTTPStatus.NOT_FOUND,
                [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
                body,
                connection=connection,
            )
        payload = _event_debug_payload(int(event_id), ev)
        body = orjson.dumps(payload)
        return _http_response(
            HTTPStatus.OK,
            [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
            body,
            connection=connection,
        )

    if route.startswith("/event/"):
        event_id = route[len("/event/"):]
        # Try both string and int keys
        ev = state.events_data.get(event_id) or state.events_data.get(int(event_id)) if event_id.isdigit() else state.events_data.get(event_id)
        if ev:
            body = orjson.dumps({"event_id": event_id, "data": _sanitize_game_for_output(ev)})
            return _http_response(
                HTTPStatus.OK,
                [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
                body,
                connection=connection,
            )
        else:
            body = orjson.dumps({"error": "not found", "event_id": event_id})
            return _http_response(
                HTTPStatus.NOT_FOUND,
                [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
                body,
                connection=connection,
            )

    # Search events by sport (e.g. /events?sport=Basketball&pp=1)
    if route == "/events":
        import urllib.parse as _up2
        qs2 = _up2.parse_qs(path.split("?", 1)[1] if "?" in path else "")
        sport_filter = qs2.get("sport", [""])[0].lower()
        live_filter = _parse_query_bool(qs2.get("live", [None])[0])
        prematch_filter = _parse_query_bool(qs2.get("prematch", [None])[0])
        pp_only = qs2.get("pp", [""])[0] == "1"
        try:
            limit = int(qs2.get("limit", ["50"])[0] or "50")
        except (TypeError, ValueError):
            limit = 50
        if limit < 0:
            limit = 50
        live_only = None
        if live_filter is True and prematch_filter is not True:
            live_only = True
        elif prematch_filter is True and live_filter is not True:
            live_only = False
        elif live_filter is False and prematch_filter is not False:
            live_only = False
        elif prematch_filter is False and live_filter is not False:
            live_only = True
        results = []
        for eid, ev in state.events_data.items():
            sn = ev.get("SportName", "")
            if sport_filter and sn.lower() != sport_filter:
                continue
            is_live = ev.get("isLive") is True
            if live_only is True and not is_live:
                continue
            if live_only is False and is_live:
                continue
            pp_count = 0
            # Soccer format: Period={0: {PlayerProps: [...]}}
            for _pn, _pd in (ev.get("Period", {}) or {}).items():
                if isinstance(_pd, dict):
                    pp_count += len(_pd.get("PlayerProps", []))
            # Simple sport format: Periods=[{PlayerProps: [...]}, ...]
            for _pd2 in (ev.get("Periods") or []):
                if isinstance(_pd2, dict):
                    pp_count += len(_pd2.get("PlayerProps", []))
            if pp_only and pp_count == 0:
                continue
            home = ev.get("Home") or ev.get("homeName") or ""
            away = ev.get("Away") or ev.get("awayName") or ""
            results.append({"eid": str(eid), "home": home, "away": away,
                            "sport": sn, "isLive": ev.get("isLive"), "pp_count": pp_count})
            if limit and len(results) >= limit:
                break
        return _json_ok({"total": len(results), "events": results}, connection=connection)

    if route == "/lookup-special":
        import urllib.parse as _up
        try:
            from special_ids_store import lookup_contestant_id, get_store_stats
        except ImportError:
            return _json_err({"error": "special_ids_store not available"}, status=HTTPStatus.NOT_IMPLEMENTED, connection=connection)
        qs = _up.parse_qs(path.split("?", 1)[1] if "?" in path else "")
        if qs.get("stats"):
            sample_type = qs.get("sample", [""])[0]
            return _json_ok(get_store_stats(sample_type=sample_type), connection=connection)
        event_id = int(qs.get("event_id", ["0"])[0])
        special_type = qs.get("type", [""])[0]
        contestant = _up.unquote(qs.get("contestant", [""])[0])
        period = int(qs.get("period", ["0"])[0])
        handicap = float(qs.get("handicap", ["0"])[0])
        result = lookup_contestant_id(event_id, special_type, contestant, period, handicap)
        if result:
            return _json_ok({"found": True, **result}, connection=connection)
        return _json_ok({"found": False}, connection=connection)

    if route == "/unmatched-events":
        from services.bia_observer import _current_stats as _bia_st
        from services.bia_event_matcher import match_bia_event_exact, match_bia_event, build_exact_match_index, BIA_SPORT_MAP
        from collections import Counter as _Ctr

        current_pids: set[int] = set()
        for eid in state.events_data.keys():
            try:
                eid_int = int(eid)
            except (TypeError, ValueError):
                continue
            if eid_int > 0:
                current_pids.add(eid_int)

        # 1) All PIDs already cached from BIA offer flow
        cache_pids: set[int] = set()
        if _bia_st:
            cache_pids = {pid for (_, (pid, _)) in _bia_st._matched_event_cache.items()}
        cache_pids &= current_pids

        # 2) Do a full match: iterate BIA registry, try to match each against ALL pin888 events
        full_matched: set[int] = set(cache_pids)
        if _bia_st and _bia_st._event_registry and state.events_data:
            exact_idx = build_exact_match_index(state.events_data)
            for (comp_id, sport_code, event_key), reg in _bia_st._event_registry.items():
                if sport_code not in BIA_SPORT_MAP:
                    continue
                bia_home = str(reg.get("home") or "")
                bia_away = str(reg.get("away") or "")
                bia_league = str(reg.get("competition_name") or "")
                pid, _ = match_bia_event_exact(bia_home, bia_away, sport_code, state.events_data,
                                               bia_league=bia_league, exact_index=exact_idx)
                if pid is not None:
                    full_matched.add(pid)
        full_matched &= current_pids

        by_sport = _Ctr()
        by_sport_live = _Ctr()
        by_sport_pre = _Ctr()
        samples: dict[str, list] = {}
        total_live = sum(1 for ev in state.events_data.values() if ev.get("isLive"))
        total_prematch = len(state.events_data) - total_live
        for eid, ev in state.events_data.items():
            eid_int = int(eid) if isinstance(eid, str) else eid
            if eid_int in full_matched:
                continue
            sport = ev.get("SportName", "unknown")
            is_live = ev.get("isLive", False)
            by_sport[sport] += 1
            if is_live:
                by_sport_live[sport] += 1
            else:
                by_sport_pre[sport] += 1
            if sport not in samples:
                samples[sport] = []
            if len(samples[sport]) < 10:
                samples[sport].append({
                    "pid": eid_int, "home": ev.get("homeName", "?"), "away": ev.get("awayName", "?"),
                    "isLive": is_live, "league": ev.get("LeagueName", "?"),
                })
        unmatched_live = sum(by_sport_live.values())
        unmatched_pre = sum(by_sport_pre.values())
        unmatched_total = sum(by_sport.values())
        matched_total = max(0, len(state.events_data) - unmatched_total)
        return _json_ok({
            "total_events": len(state.events_data),
            "total_live": total_live,
            "total_prematch": total_prematch,
            "cache_matched_pids": len(cache_pids),
            "full_matched_pids": len(full_matched),
            "unmatched_total": unmatched_total,
            "unmatched_live": unmatched_live,
            "unmatched_prematch": unmatched_pre,
            "prematch_match_rate_pct": round((total_prematch - unmatched_pre) / total_prematch * 100, 1) if total_prematch else 0,
            "match_rate_pct": round(matched_total / len(state.events_data) * 100, 1) if state.events_data else 0,
            "by_sport": dict(by_sport.most_common()),
            "by_sport_prematch": dict(by_sport_pre.most_common()),
            "by_sport_live": dict(by_sport_live.most_common()),
            "samples": samples,
            "bia_registry_size": len(_bia_st._event_registry) if _bia_st else 0,
        }, connection=connection)

    if route == "/match-debug":
        import urllib.parse as _up
        from services.bia_event_matcher import (
            _name_variants, match_bia_event_exact, build_exact_match_index, BIA_SPORT_MAP,
        )
        qs = _up.parse_qs(path.split("?", 1)[1] if "?" in path else "")
        bia_home = qs.get("home", [""])[0]
        bia_away = qs.get("away", [""])[0]
        bia_sport = qs.get("sport", ["fb"])[0]
        sport_name = BIA_SPORT_MAP.get(bia_sport, "")
        idx = build_exact_match_index(state.events_data)
        hv = sorted(_name_variants(bia_home))
        av = sorted(_name_variants(bia_away))
        # Find what pin888 events match this sport
        pin_events = []
        for eid, ev in state.events_data.items():
            if not isinstance(ev, dict):
                continue
            if sport_name and ev.get("SportName") != sport_name:
                continue
            ph = ev.get("homeName", "")
            pa = ev.get("awayName", "")
            if bia_home.lower()[:4] in (ph + pa).lower():
                pin_events.append({
                    "pid": int(eid), "home": ph, "away": pa,
                    "home_variants": sorted(_name_variants(ph)),
                    "away_variants": sorted(_name_variants(pa)),
                })
        pid, swapped = match_bia_event_exact(bia_home, bia_away, bia_sport, state.events_data)
        idx_keys_sample = [k for k in idx.keys() if sport_name and k[0] == sport_name and any(w in k[1] for w in bia_home.lower().split()[:1])][:10]
        return _json_ok({
            "bia_home": bia_home, "bia_away": bia_away, "bia_sport": bia_sport,
            "sport_name": sport_name,
            "bia_home_variants": hv, "bia_away_variants": av,
            "match_result": {"pid": pid, "swapped": swapped},
            "matching_pin_events": pin_events[:5],
            "index_keys_sample": [list(k) for k in idx_keys_sample],
            "events_data_size": len(state.events_data),
            "index_size": len(idx),
        }, connection=connection)

    if route == "/search-bia":
        import urllib.parse as _up
        qs = _up.parse_qs(path.split("?", 1)[1] if "?" in path else "")
        query = (qs.get("q", [""])[0] or "").strip()
        if not query:
            return _json_err({"error": "q parameter required"}, status=HTTPStatus.BAD_REQUEST, connection=connection)
        from services.bia_observer import search_bia_registry
        results = search_bia_registry(query)
        return _json_ok({"query": query, "count": len(results), "events": results}, connection=connection)

    if route == "/lookup-bia":
        import urllib.parse as _up

        qs = _up.parse_qs(path.split("?", 1)[1] if "?" in path else "")
        try:
            event_id = int(qs.get("event_id", ["0"])[0] or "0")
            period = int(qs.get("period", ["0"])[0] or "0")
        except (TypeError, ValueError):
            return _json_err(
                {"error": "event_id and period must be integers"},
                status=HTTPStatus.BAD_REQUEST,
                connection=connection,
            )
        if event_id <= 0:
            return _json_err(
                {"error": "event_id is required"},
                status=HTTPStatus.BAD_REQUEST,
                connection=connection,
            )
        proof_requested = str(qs.get("proof", [""])[0] or "").strip().lower() in {
            "1", "true", "yes",
        }
        if proof_requested:
            try:
                bet_type = int(qs.get("bet_type", [""])[0])
                team_select = int(qs.get("team_select", [""])[0])
                map_number = int(qs.get("map_number", ["0"])[0] or "0")
                game_number = int(qs.get("game_number", ["0"])[0] or "0")
                handicap = qs.get("handicap", [None])[0]
                if handicap is None:
                    raise ValueError("handicap is required")
            except (TypeError, ValueError):
                return _json_err(
                    {"error": "proof requires numeric bet_type, team_select, handicap, map_number, and game_number"},
                    status=HTTPStatus.BAD_REQUEST,
                    connection=connection,
                )
            result = await lookup_bia_selection_for_pid_with_refresh(
                event_id,
                period=period,
                selection={
                    "bet_type": bet_type,
                    "team_select": team_select,
                    "handicap": handicap,
                    "map_number": map_number,
                    "game_number": game_number,
                    "esports_unit": str(qs.get("esports_unit", [""])[0] or ""),
                    "tennis_unit": str(qs.get("tennis_unit", [""])[0] or ""),
                },
            )
            return _json_ok(result, connection=connection)
        result = lookup_unique_bia_event_for_pid(event_id, period=period)
        return _json_ok(result, connection=connection)

    if route == "/hydrate-bia-pmm":
        import urllib.parse as _up

        qs = _up.parse_qs(path.split("?", 1)[1] if "?" in path else "")
        try:
            event_id = int(qs.get("event_id", ["0"])[0] or "0")
            periods = tuple(
                int(raw_period)
                for raw_period in qs.get("period", [])
                if str(raw_period or "").strip() != ""
            )
        except (TypeError, ValueError):
            return _json_err(
                {"error": "event_id and period must be integers"},
                status=HTTPStatus.BAD_REQUEST,
                connection=connection,
            )
        if event_id <= 0:
            return _json_err(
                {"error": "event_id is required"},
                status=HTTPStatus.BAD_REQUEST,
                connection=connection,
            )
        result = await hydrate_bia_supported_outcomes(
            event_id,
            periods=periods or None,
        )
        if result.get("status") == "ok":
            return _json_ok(result, connection=connection)
        status = HTTPStatus.NOT_FOUND if result.get("error") == "event not found" else HTTPStatus.BAD_REQUEST
        return _json_err(
            {"error": result.get("error", "hydration failed"), "event_id": event_id},
            status=status,
            connection=connection,
        )

    if route == "/hydrate-bia-event":
        import urllib.parse as _up

        qs = _up.parse_qs(path.split("?", 1)[1] if "?" in path else "")
        try:
            event_id = int(qs.get("event_id", ["0"])[0] or "0")
            periods = tuple(
                int(raw_period)
                for raw_period in qs.get("period", [])
                if str(raw_period or "").strip() != ""
            )
        except (TypeError, ValueError):
            return _json_err(
                {"error": "event_id and period must be integers"},
                status=HTTPStatus.BAD_REQUEST,
                connection=connection,
            )
        if event_id <= 0:
            return _json_err(
                {"error": "event_id is required"},
                status=HTTPStatus.BAD_REQUEST,
                connection=connection,
            )
        result = await hydrate_bia_event_snapshot(
            event_id,
            periods=periods or None,
        )
        if result.get("status") == "ok":
            return _json_ok(result, connection=connection)
        status = HTTPStatus.NOT_FOUND if result.get("error") == "event not found" else HTTPStatus.BAD_REQUEST
        return _json_err(
            {"error": result.get("error", "hydration failed"), "event_id": event_id},
            status=status,
            connection=connection,
        )

    # ── POST: управление режимами live/prematch/send_mode в runtime ──
    if route == "/live":
        import urllib.parse as _up
        qs = _up.parse_qs(path.split("?", 1)[1] if "?" in path else "")
        live_on = qs.get("enabled", ["true"])[0].lower() in ("1", "true", "yes")
        pm_on = not config.PS3838_ONLY_LIVE or config.PS3838_ONLY_PREMATCH  # current prematch state
        if live_on and pm_on:
            config.PS3838_ONLY_LIVE = False
            config.PS3838_ONLY_PREMATCH = False
        elif live_on and not pm_on:
            config.PS3838_ONLY_LIVE = True
            config.PS3838_ONLY_PREMATCH = False
        elif not live_on and pm_on:
            config.PS3838_ONLY_LIVE = False
            config.PS3838_ONLY_PREMATCH = True
        else:
            config.PS3838_ONLY_LIVE = False
            config.PS3838_ONLY_PREMATCH = False
            live_on = True; pm_on = True  # can't disable both
        _purge_events_for_mode()
        log(f"[API] Live={live_on} (ONLY_LIVE={config.PS3838_ONLY_LIVE}, ONLY_PREMATCH={config.PS3838_ONLY_PREMATCH})")
        body = orjson.dumps({"ok": True, "live_enabled": live_on, "prematch_enabled": pm_on})
        return _http_response(
            HTTPStatus.OK,
            [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
            body,
            connection=connection,
        )

    if route == "/prematch":
        import urllib.parse as _up
        qs = _up.parse_qs(path.split("?", 1)[1] if "?" in path else "")
        pm_on = qs.get("enabled", ["true"])[0].lower() in ("1", "true", "yes")
        live_on = not config.PS3838_ONLY_PREMATCH or config.PS3838_ONLY_LIVE  # current live state
        if live_on and pm_on:
            config.PS3838_ONLY_LIVE = False
            config.PS3838_ONLY_PREMATCH = False
        elif live_on and not pm_on:
            config.PS3838_ONLY_LIVE = True
            config.PS3838_ONLY_PREMATCH = False
        elif not live_on and pm_on:
            config.PS3838_ONLY_LIVE = False
            config.PS3838_ONLY_PREMATCH = True
        else:
            config.PS3838_ONLY_LIVE = False
            config.PS3838_ONLY_PREMATCH = False
            live_on = True; pm_on = True  # can't disable both
        _purge_events_for_mode()
        log(f"[API] Prematch={pm_on} (ONLY_LIVE={config.PS3838_ONLY_LIVE}, ONLY_PREMATCH={config.PS3838_ONLY_PREMATCH})")
        body = orjson.dumps({"ok": True, "live_enabled": live_on, "prematch_enabled": pm_on})
        return _http_response(
            HTTPStatus.OK,
            [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
            body,
            connection=connection,
        )

    if route == "/send_mode":
        import urllib.parse as _up
        qs = _up.parse_qs(path.split("?", 1)[1] if "?" in path else "")
        mode = qs.get("mode", ["all"])[0].lower()
        if mode not in ("all", "base_only", "more_bets_only"):
            body = orjson.dumps({"error": f"invalid mode: {mode}"})
            return _http_response(
                HTTPStatus.BAD_REQUEST,
                [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
                body,
                connection=connection,
            )
        config.PS3838_SEND_MODE = mode
        log(f"[API] SEND_MODE set to {mode}")
        body = orjson.dumps({"ok": True, "send_mode": mode})
        return _http_response(
            HTTPStatus.OK,
            [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
            body,
            connection=connection,
        )

    if route == "/hybrid-runtime":
        import urllib.parse as _up

        if _transport_backend() != "hybrid_runner":
            return _json_err(
                {"error": "hybrid runtime control is unavailable for current transport backend"},
                status=HTTPStatus.CONFLICT,
                connection=connection,
            )

        runner = _hybrid_runtime_runner
        if runner is None:
            return _json_err(
                {"error": "hybrid runtime is not ready"},
                status=HTTPStatus.SERVICE_UNAVAILABLE,
                connection=connection,
            )

        qs = _up.parse_qs(path.split("?", 1)[1] if "?" in path else "")
        wants_update = any(
            key in qs
            for key in ("sports", "modes", "mb_target_rps", "mb_hard_cap_rps")
        )
        try:
            sports = _parse_hybrid_runtime_sports(qs.get("sports", []))
            modes = _parse_hybrid_runtime_modes(qs.get("modes", []))
            mb_target_rps = _parse_optional_float_query(
                qs.get("mb_target_rps", []),
                field_name="mb_target_rps",
            )
            mb_hard_cap_rps = _parse_optional_int_query(
                qs.get("mb_hard_cap_rps", []),
                field_name="mb_hard_cap_rps",
            )
            payload = (
                await runner.reconfigure_async(
                    sport_ids=sports,
                    modes=modes,
                    mb_target_rps=mb_target_rps,
                    mb_hard_cap_rps=mb_hard_cap_rps,
                )
                if wants_update
                else await runner.runtime_status_async()
            )
        except ValueError as exc:
            return _json_err({"error": str(exc)}, connection=connection)
        except Exception:
            logger.exception("hybrid runtime control failed")
            return _json_err(
                {"error": "hybrid runtime control failed"},
                status=HTTPStatus.INTERNAL_SERVER_ERROR,
                connection=connection,
            )
        return _json_ok(payload, connection=connection)


    if route == "/trace":
        import urllib.parse as _up2
        import infra.debug_trace
        qs = _up2.parse_qs(path.split("?", 1)[1] if "?" in path else "")
        team = qs.get("team", [""])[0]
        debug_trace.set_trace_team(team)
        status = "ON" if debug_trace.is_active() else "OFF"
        log(f"[API] TRACE {status}: team={debug_trace.get_trace_team()!r}")
        body = orjson.dumps({"ok": True, "trace_team": debug_trace.get_trace_team(), "active": debug_trace.is_active()})
        return _http_response(
            HTTPStatus.OK,
            [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
            body,
            connection=connection,
        )

    if route not in ("/health", "/healthz", "/stats", "/account-health", "/verify-odds", "/cookies", "/trace", "/hybrid-runtime"):
        return None

    # ── Экспорт куки браузера для bet_service ──────────────────────────
    if route == "/cookies":
        if not config.PS3838_COOKIES_ENDPOINT_ENABLED:
            body = orjson.dumps({"error": "endpoint disabled; set PS3838_COOKIES_ENDPOINT_ENABLED=1"})
            return _http_response(
                HTTPStatus.FORBIDDEN,
                [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
                body,
                connection=connection,
            )
        # Read directly from session file (avoids blocking page.evaluate/context.cookies)
        try:
            session_path = SESSION_FILE
            if not os.path.isabs(session_path):
                session_path = os.path.join(os.path.dirname(__file__), session_path)
            with open(session_path, "r") as _sf:
                _sd = json.load(_sf)
            cookies = _sd.get("cookies", [])
            v_hucode = _sd.get("v_hucode", "")
            x_app_data = _sd.get("x_app_data", "")
            body = orjson.dumps({"cookies": cookies, "v_hucode": v_hucode, "x_app_data": x_app_data})
            return _http_response(
                HTTPStatus.OK,
                [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
                body,
                connection=connection,
            )
        except (OSError, TypeError, ValueError, json.JSONDecodeError) as e:
            body = orjson.dumps({"error": str(e)})
            return _http_response(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                [("Content-Type", "application/json")],
                body,
                connection=connection,
            )

    if route in ("/health", "/healthz", "/stats", "/account-health"):
        await check_silence()

    if route == "/account-health":
        account_health = current_account_health_snapshot()
        account_health["delivery_guard"] = {
            "subscriptions_unchanged": True,
            "send_frequency_unchanged": True,
            "live_enabled": not config.PS3838_ONLY_PREMATCH or config.PS3838_ONLY_LIVE,
            "prematch_enabled": not config.PS3838_ONLY_LIVE or config.PS3838_ONLY_PREMATCH,
            "send_mode": config.PS3838_SEND_MODE,
        }
        return _json_ok(account_health, connection=connection)

    # ── Проверка коэффициентов — показывает raw + parsed данные для инспекции цен ──────
    if route == "/verify-odds":
        import urllib.parse
        qs = urllib.parse.parse_qs(path.split("?", 1)[1] if "?" in path else "")
        event_id = qs.get("event_id", [None])[0]
        bet_type = int(qs.get("bet_type", ["1"])[0])     # 1=ML, 2=Handicap, 3=Total, 4=IT1, 5=IT2
        team_select = int(qs.get("team", ["0"])[0])       # ML/HDP: 0/1/2; Total: 3=Over,4=Under; IT: 1=Over,0=Under (legacy 3/4 also accepted)
        period = int(qs.get("period", ["0"])[0])
        handicap = qs.get("handicap", ["0"])[0]
        if not event_id:
            body = orjson.dumps({"error": "event_id required"})
            return _http_response(
                HTTPStatus.BAD_REQUEST,
                [("Content-Type", "application/json")],
                body,
                connection=connection,
            )

        ev = state.events_data.get(event_id) or (state.events_data.get(int(event_id)) if event_id and event_id.isdigit() else None)
        if not ev:
            body = orjson.dumps({"error": "event not found", "event_id": event_id})
            return _http_response(
                HTTPStatus.NOT_FOUND,
                [("Content-Type", "application/json")],
                body,
                connection=connection,
            )
        view_ev = _sanitize_game_for_output(ev)

        # Extract raw and parsed prices for comparison
        raw = ev.get("Raw", {}) if isinstance(ev, dict) else {}
        odds_block = raw.get("odds_block", {}) if isinstance(raw, dict) else {}
        period_data = odds_block.get(str(period))

        line_id = 0
        is_alt = 0
        raw_price = None
        parsed_price = None
        try:
            handicap_f = float(handicap)
        except (TypeError, ValueError):
            logger.debug("Failed to convert handicap %r to float", handicap)
            handicap_f = None

        def _apply_parsed_line_entry(line_entry, side_key=None):
            nonlocal line_id, is_alt, parsed_price
            if not isinstance(line_entry, dict):
                return
            parsed_line_id = line_entry.get("LineId")
            if not line_id and isinstance(parsed_line_id, (int, float)) and int(parsed_line_id) > 0:
                line_id = int(parsed_line_id)
            if not is_alt:
                parsed_is_alt = line_entry.get("IsAlt")
                if isinstance(parsed_is_alt, (int, float)):
                    is_alt = int(parsed_is_alt)
                elif line_id >= 10_000_000_000:
                    is_alt = 1
            if side_key:
                side = line_entry.get(side_key, {})
                if isinstance(side, dict):
                    parsed_price = side.get("value")

        def _pick_line(market: dict):
            if not isinstance(market, dict):
                return None
            if handicap in market:
                return market.get(handicap)
            if handicap_f is not None:
                for k, v in market.items():
                    try:
                        if abs(float(k) - handicap_f) < 1e-6:
                            return v
                    except (TypeError, ValueError):
                        logger.debug("Failed to convert line key %r to float", k)
                        continue
            return None

        def _line_match(raw_line):
            try:
                return str(raw_line) == handicap or (handicap_f is not None and abs(float(raw_line) - handicap_f) < 1e-6)
            except (TypeError, ValueError):
                logger.debug("Failed to compare raw_line %r with handicap %r", raw_line, handicap)
                return str(raw_line) == handicap

        def _looks_like_row_block(block):
            return isinstance(block, list) and bool(block) and isinstance(block[0], list)

        def _looks_like_spread_block(block):
            if not _looks_like_row_block(block):
                return False
            sample = block[0]
            return (
                isinstance(sample, list)
                and len(sample) >= 5
                and isinstance(sample[0], (int, float))
                and isinstance(sample[1], (int, float))
            )

        def _looks_like_total_block(block):
            if not _looks_like_row_block(block):
                return False
            sample = block[0]
            return (
                isinstance(sample, list)
                and len(sample) >= 4
                and not isinstance(sample[0], (int, float))
                and isinstance(sample[1], (int, float))
            )

        def _looks_like_moneyline_block(block):
            if not isinstance(block, list) or len(block) < 2:
                return False
            sample = block[:3]
            return all(not isinstance(v, (list, dict)) for v in sample)

        if period_data and isinstance(period_data, list):
            spreads_block = None
            totals_block = None
            moneyline_block = None
            if len(period_data) > 0 and _looks_like_spread_block(period_data[0]):
                spreads_block = period_data[0]
            elif len(period_data) > 2 and _looks_like_spread_block(period_data[2]):
                spreads_block = period_data[2]
            if len(period_data) > 1 and _looks_like_total_block(period_data[1]):
                totals_block = period_data[1]
            elif len(period_data) > 3 and _looks_like_total_block(period_data[3]):
                totals_block = period_data[3]
            if len(period_data) > 2 and _looks_like_moneyline_block(period_data[2]):
                moneyline_block = period_data[2]
            elif len(period_data) > 4 and _looks_like_moneyline_block(period_data[4]):
                moneyline_block = period_data[4]
            elif len(period_data) > 0 and _looks_like_moneyline_block(period_data[0]):
                moneyline_block = period_data[0]

            if bet_type == 1 and moneyline_block:
                ml = moneyline_block
                if isinstance(ml, list) and len(ml) >= 4:
                    line_id = ml[3]
                    is_alt = ml[4] if len(ml) > 4 else 0
                    if team_select == 0: raw_price = ml[1]
                    elif team_select == 1: raw_price = ml[0]
                    elif team_select == 2: raw_price = ml[2]
            elif bet_type == 2 and spreads_block:
                for sp in (spreads_block or []):
                    if isinstance(sp, list) and len(sp) >= 8:
                        h_val = str(sp[0] if team_select == 0 else sp[1])
                        if h_val == handicap or str(float(handicap)) == h_val:
                            line_id, is_alt = sp[7], sp[8] if len(sp) > 8 else 0
                            raw_price = sp[3] if team_select == 0 else sp[4]
                            break
            elif bet_type == 3 and totals_block:
                for t in (totals_block or []):
                    if isinstance(t, list) and len(t) >= 4:
                        if _line_match(t[1]):
                            line_id, is_alt = (t[4] if len(t) > 4 else 0), (t[5] if len(t) > 5 else 0)
                            raw_price = t[2] if team_select == 3 else t[3]
                            break
            elif bet_type == 4 and len(period_data) > 3:
                # Home team total: period_data[3]
                for t in (period_data[3] or []):
                    if isinstance(t, list) and len(t) >= 4:
                        if _line_match(t[1]):
                            line_id, is_alt = (t[4] if len(t) > 4 else 0), (t[5] if len(t) > 5 else 0)
                            raw_price = t[2] if team_select in (1, 3) else t[3]
                            break
            elif bet_type == 5 and len(period_data) > 4:
                # Away team total: period_data[4]
                for t in (period_data[4] or []):
                    if isinstance(t, list) and len(t) >= 4:
                        if _line_match(t[1]):
                            line_id, is_alt = (t[4] if len(t) > 4 else 0), (t[5] if len(t) > 5 else 0)
                            raw_price = t[2] if team_select in (1, 3) else t[3]
                            break

        # Get parsed value from Periods
        periods = view_ev.get("Periods", [])
        if periods and period < len(periods):
            p = periods[period]
            if bet_type == 1:
                ml_data = p.get("Win1x2", {})
                if team_select == 0:
                    _apply_parsed_line_entry(ml_data, "Win1")
                elif team_select == 1:
                    _apply_parsed_line_entry(ml_data, "Win2")
                elif team_select == 2:
                    _apply_parsed_line_entry(ml_data, "WinNone")
            elif bet_type == 2:
                t = _pick_line(p.get("Handicap", {}))
                if isinstance(t, dict):
                    _apply_parsed_line_entry(t, "Win1" if team_select == 0 else "Win2")
            elif bet_type == 3:
                t = _pick_line(p.get("Totals", {}))
                if isinstance(t, dict):
                    _apply_parsed_line_entry(t, "WinMore" if team_select == 3 else "WinLess")
            elif bet_type == 4:
                t = _pick_line(p.get("FirstTeamTotals", {}))
                if isinstance(t, dict):
                    _apply_parsed_line_entry(t, "WinMore" if team_select in (1, 3) else "WinLess")
            elif bet_type == 5:
                t = _pick_line(p.get("SecondTeamTotals", {}))
                if isinstance(t, dict):
                    _apply_parsed_line_entry(t, "WinMore" if team_select in (1, 3) else "WinLess")

        result = {
            "event_id": event_id,
            "home": ev.get("homeName"),
            "away": ev.get("awayName"),
            "is_live": ev.get("isLive"),
            "bet_type": bet_type,
            "team_select": team_select,
            "period": period,
            "handicap": handicap,
            "line_id": line_id,
            "raw_price": raw_price,
            "parsed_price": parsed_price,
            "prices_match": abs(float(raw_price) - float(parsed_price)) < 0.001 if raw_price is not None and parsed_price is not None else None,
            "oddsId": f"{event_id}|{period}|{bet_type}|{team_select}|{is_alt}|{handicap}",
        }
        body = orjson.dumps(result)
        return _http_response(
            HTTPStatus.OK,
            [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
            body,
            connection=connection,
        )

    total_events = len(state.events_data)
    ps_events = sum(1 for k in state.events_data.keys() if state.event_source.get(k) == "ps3838")
    last_age = None
    if state.last_data_recv_time is not None:
        last_age = round(time.time() - state.last_data_recv_time, 3)

    live_enabled = not config.PS3838_ONLY_PREMATCH or config.PS3838_ONLY_LIVE
    prematch_enabled = not config.PS3838_ONLY_LIVE or config.PS3838_ONLY_PREMATCH

    if config.PS3838_ONLY_LIVE and not config.PS3838_ONLY_PREMATCH:
        mode = "live"
    elif config.PS3838_ONLY_PREMATCH and not config.PS3838_ONLY_LIVE:
        mode = "prematch"
    else:
        mode = "all"

    is_live_value = state.last_is_live
    if state.events_data:
        is_live_value = any(bool(event.get("isLive")) for event in state.events_data.values())
    if config.PS3838_ONLY_LIVE and not config.PS3838_ONLY_PREMATCH:
        is_live_value = True
    elif config.PS3838_ONLY_PREMATCH and not config.PS3838_ONLY_LIVE:
        is_live_value = False
    elif is_live_value is None:
        is_live_value = False

    now_ts = time.time()
    valid_data_age = None
    if state.last_valid_data_time is not None:
        valid_data_age = round(now_ts - state.last_valid_data_time, 3)
    ws_activity_age = None
    if state.last_ws_activity_time is not None:
        ws_activity_age = round(now_ts - state.last_ws_activity_time, 3)
    reconnect_count = max(state.ps3838_connect_count - 1, 0)
    active_closed_markers = _count_active_closed_markers(state.events_data)
    list_signal_last_age = None if not state.list_signal_last_ts else round(now_ts - state.list_signal_last_ts, 3)
    list_signal_active = sum(1 for ts in state.list_signal_event_ts.values() if now_ts - ts <= 20)
    update_signal_active = sum(1 for ts in state.update_signal_ts.values() if now_ts - ts <= 20)
    board_signal_last_age = None if not state.board_signal_last_ts else round(now_ts - state.board_signal_last_ts, 3)
    board_signal_active = sum(1 for ts in state.board_signal_ts.values() if now_ts - ts <= 20)
    live_market_age_p0 = _summarize_live_base_market_ages(state.events_data, now_ts=now_ts)
    soccer_market_outliers = {
        market_key: collect_live_market_outliers(
            state.events_data,
            now_ts=now_ts,
            sport_name="Soccer",
            market_key=market_key,
        )
        for market_key in ("Win1x2", "Handicap", "Totals")
    }
    runtime_alerts = build_runtime_alerts(
        stale=state.stale,
        logged_in=state.is_logged_in,
        delay_ms=int(state.last_msg_time_ms or 0),
        live_market_age_p0_by_sport=live_market_age_p0,
        soccer_market_outliers=soccer_market_outliers,
    )
    session_birth_age = None if not state.session_birth_ts else round(now_ts - state.session_birth_ts, 3)
    first_ws401_after_birth_sec = None
    if state.session_birth_ts and state.session_first_ws401_ts:
        first_ws401_after_birth_sec = round(state.session_first_ws401_ts - state.session_birth_ts, 3)
    last_ws401_age_sec = None if not state.session_last_ws401_ts else round(now_ts - state.session_last_ws401_ts, 3)
    last_soft_refresh_age_sec = None if not state.session_last_soft_refresh_ts else round(now_ts - state.session_last_soft_refresh_ts, 3)
    last_soft_refresh_fail_age_sec = None if not state.session_last_soft_refresh_fail_ts else round(now_ts - state.session_last_soft_refresh_fail_ts, 3)
    account_health = current_account_health_snapshot(now=now_ts)
    ws_429_sport_backoff = {
        str(int(sport_id)): round(float(until_ts) - now_ts, 3)
        for sport_id, until_ts in (getattr(state, "sport_ws_429_backoff_until", {}) or {}).items()
        if isinstance(sport_id, (int, float))
        and int(sport_id) > 0
        and float(until_ts or 0.0) > now_ts
    }
    ws_429_lane_streaks = {
        str(label): int(streak)
        for label, streak in (getattr(state, "lane_ws_429_streak", {}) or {}).items()
        if int(streak or 0) > 0
    }
    health_status = _current_health_status(
        stale=bool(state.stale),
        logged_in=bool(state.is_logged_in),
        account_health_state=str(account_health.get("state") or ""),
    )
    health_reason = _current_health_reason(
        stale=bool(state.stale),
        state_reason=state.stale_reason,
        last_data_age_sec=last_age,
        valid_data_age_sec=valid_data_age,
        ws_activity_age_sec=ws_activity_age,
    )
    if health_status == "error":
        health_reason = (
            _account_health_failure_reason(account_health)
            or ("runtime not logged in" if not state.is_logged_in else health_reason)
        )
    account_health["delivery_guard"] = {
        "subscriptions_unchanged": True,
        "send_frequency_unchanged": True,
        "live_enabled": live_enabled,
        "prematch_enabled": prematch_enabled,
        "send_mode": config.PS3838_SEND_MODE,
    }

    payload = {
        "source": "ps3838",
        "status": health_status,
        "config": {
            "live_enabled": live_enabled,
            "prematch_enabled": prematch_enabled,
            "send_mode": config.PS3838_SEND_MODE,
        },
        "stale": state.stale,
        "reason": health_reason,
        "logged_in": state.is_logged_in,
        "session_valid": health_status == "ok",
        "cf_ban_active": now_ts < state.cf_ban_until,
        "cf_consecutive_403": state.cf_consecutive_403,
        "is_live": is_live_value,
        "ssn": state.last_ssn,
        "last_msg_time_ms": state.last_msg_time_ms,
        "last_msg_age_sec": last_age,
        "mode": mode,
        "proxy": {
            "expected": bool(getattr(state, "proxy_expected", False)),
            "route_mode": getattr(state, "proxy_route_mode", "direct"),
            "route_reason": (getattr(state, "proxy_route_reason", "") or None),
        },
        "site": {
            "profile": config.PS3838_SITE_PROFILE,
            "host": config.PS3838_SITE_HOST,
            "auth_mode": config.PS3838_SITE_AUTH_MODE,
            "base_url": config.PS3838_SITE_BASE_URL,
        },
        "events_total": total_events,
        "events_ps3838": ps_events,
        "clients": len(state.clients),
        "updates_total": state.update_count,
        "updates_parsed": max(state.update_count - state.update_empty, 0),
        "pid_map_ids": len(state.pid_map),
        "pid_map_keys": len(state.pid_key_map),
        "specials_required": False,  # REST specials УДАЛЕНЫ (бан аккаунта)
        "specials_last_age_sec": None if state.specials_last_ts is None else round(now_ts - state.specials_last_ts, 3),
        "specials_events": _count_specials_events(state.events_data),
        "specials_count": state.specials_count,
        "last_refresh_age_sec": None if not state.last_refresh_ts else round(now_ts - state.last_refresh_ts, 3),
        "last_refresh_reason": state.last_refresh_reason,
        "session_lifecycle": {
            "birth_epoch": state.session_birth_epoch or None,
            "birth_age_sec": session_birth_age,
            "birth_source": state.session_birth_source or None,
            "birth_reason": state.session_birth_reason or None,
            "ws401_count": state.session_ws401_count,
            "first_ws401_after_birth_sec": first_ws401_after_birth_sec,
            "last_ws401_age_sec": last_ws401_age_sec,
            "soft_refresh_attempt_count": state.session_soft_refresh_attempt_count,
            "soft_refresh_success_count": state.session_soft_refresh_success_count,
            "soft_refresh_fail_count": state.session_soft_refresh_fail_count,
            "last_soft_refresh_age_sec": last_soft_refresh_age_sec,
            "last_soft_refresh_mode": state.session_last_soft_refresh_mode or None,
            "last_soft_refresh_reason": state.session_last_soft_refresh_reason or None,
            "last_soft_refresh_fail_age_sec": last_soft_refresh_fail_age_sec,
            "last_soft_refresh_fail_mode": state.session_last_soft_refresh_fail_mode or None,
            "last_soft_refresh_fail_reason": state.session_last_soft_refresh_fail_reason or None,
        },
        "freshness": {
            "valid_data_age_sec": valid_data_age,
            "ws_activity_age_sec": ws_activity_age,
            "live_lane_stale": bool(live_enabled and getattr(state, "stale_live", False)),
            "prematch_lane_stale": bool(prematch_enabled and getattr(state, "stale_prematch", False)),
            "consecutive_empty_updates": state.consecutive_empty_updates,
            "empty_full_odds_count": state.empty_full_odds_count,
        },
        "account_health": account_health,
        "observability": {
            "ps3838_connect_count": state.ps3838_connect_count,
            "ps3838_reconnect_count": reconnect_count,
            "session_refresh_attempt_count": state.session_refresh_attempt_count,
            "session_refresh_success_count": state.session_refresh_success_count,
            "startup": {
                "login_attempted": state.startup_login_attempted,
                "login_completed": state.startup_login_completed,
                "canary_label": state.startup_canary_label or None,
                "canary_success": state.startup_canary_success,
                "canary_abort_reason": state.startup_canary_abort_reason or None,
                "auth_failure_count": state.startup_auth_failure_count,
                "auth_circuit_open": state.startup_auth_circuit_open,
                "auth_circuit_reason": state.startup_auth_circuit_reason or None,
            },
            "ws_429": {
                "active_sports": ws_429_sport_backoff,
                "active_sport_count": len(ws_429_sport_backoff),
                "lane_streaks": ws_429_lane_streaks,
            },
            "selective_refresh": {
                "list_signal": {
                    "messages_total": state.list_signal_msg_total,
                    "updates_total": state.list_signal_update_total,
                    "full_total": state.list_signal_full_total,
                    "events_last": state.list_signal_events_last,
                    "events_total": state.list_signal_events_total,
                    "active_recent": list_signal_active,
                    "last_type": state.list_signal_last_type,
                    "last_age_sec": list_signal_last_age,
                },
                "board_signal": {
                    "events_last": state.board_signal_events_last,
                    "events_total": state.board_signal_events_total,
                    "active_recent": board_signal_active,
                    "last_age_sec": board_signal_last_age,
                },
                "update_signal_active_recent": update_signal_active,
            },
            "cached_fo_restore_blocks": {
                "total": state.fo_cached_restore_block_total,
                "by_reason": state.fo_cached_restore_block_by_reason,
            },
            "fo_empty_overwrite_blocked": getattr(state, "fo_empty_overwrite_blocked", 0),
            "odds_keys_seen": getattr(state, "odds_keys_seen", {}),
            "odds_keys_nonempty": getattr(state, "odds_keys_nonempty", {}),
            "ws_specials_diag": _get_ws_sp_diag(),
            "active_closed_markers": active_closed_markers,
            "live_market_age_p0_by_sport": live_market_age_p0,
            "live_market_age_outliers": {
                "Soccer": soccer_market_outliers
            },
            "alerts": runtime_alerts,
        },
        "bia": bia_observer_snapshot(now=now_ts),
        "chain_lag": {
            "recv_to_handler_ms": state.chain_recv_to_handler_ms,
            "handler_to_state_ms": state.chain_handler_to_state_ms,
            "total_lag_ms": state.chain_total_lag_ms,
            "fo_count": state.chain_fo_count,
            "uo_count": state.chain_uo_count,
            "last_state_update_age_sec": round(now_ts - state.chain_state_update_ts, 3) if state.chain_state_update_ts else None,
        },
    }
    body = orjson.dumps(payload)
    http_status = HTTPStatus.OK if route == "/stats" else (
        HTTPStatus.OK if health_status == "ok" else HTTPStatus.SERVICE_UNAVAILABLE
    )
    headers = [
        ("Content-Type", "application/json"),
        ("Content-Length", str(len(body))),
        ("Cache-Control", "no-store"),
    ]
    return _http_response(http_status, headers, body, connection=connection)


# ── Сборщик зомби-процессов ──────────────────────────────────────────────────

async def zombie_reaper():
    """Периодическая очистка завершённых дочерних процессов (zombie)
    через os.waitpid() для предотвращения утечки PID."""
    while state.running:
        try:
            while True:
                try:
                    pid, _status = os.waitpid(-1, os.WNOHANG)
                    if pid == 0:
                        break
                    logger.debug(f"Reaped zombie process PID {pid}")
                except ChildProcessError:
                    break
                except OSError:
                    logger.debug("Unexpected error in waitpid")
                    break
        except OSError:
            logger.warning("Error in zombie reaper loop")
        await asyncio.sleep(5)

# ── Очистка по TTL ────────────────────────────────────────────────────────────

async def events_data_ttl_cleanup():
    """Удаление устаревших событий, которые не обновлялись (матч завершён),
    и прематч-событий, начинающихся слишком далеко в будущем.
    Использует LastSeenAt (существование события) для TTL, НЕ CreatedAt (свежесть цены)."""
    prematch_max_ms = PREMATCH_MAX_HOURS * 3600 * 1000
    prematch_max_esports_ms = PREMATCH_MAX_HOURS_ESPORTS * 3600 * 1000
    while state.running:
        try:
            await asyncio.sleep(10)
            now = time.time()
            now_ms = int(now * 1000)
            stale_ids = []
            future_ids = []
            for eid, game in list(state.events_data.items()):
                sport_id = _logical_event_sport_id(eid)
                if _sport_ws_429_backoff_active(sport_id, now_ts=now):
                    continue
                # Use LastSeenAt for TTL (when was event last seen from PS3838).
                # Fall back to CreatedAt for backward compat.
                seen_str = game.get("LastSeenAt") or game.get("CreatedAt", "")
                if not seen_str:
                    continue
                try:
                    from datetime import datetime as _dt, timezone as _tz
                    clean = seen_str.replace("Z", "+00:00")
                    seen_dt = _dt.fromisoformat(clean)
                    age = now - seen_dt.timestamp()
                    is_live = game.get("isLive") is True
                    ttl = EVENTS_DATA_TTL_LIVE_SEC if is_live else EVENTS_DATA_TTL_PREMATCH_SEC
                    if age > ttl:
                        stale_ids.append(eid)
                        continue
                except Exception:
                    logger.debug("Failed to parse LastSeenAt for TTL cleanup of event %s", eid)
                    continue
                # Удаление прематч-событий, начинающихся слишком далеко в будущем
                if not (game.get("isLive") is True):
                    raw = state.raw_events.get(eid)
                    st_ms = raw.get("start_time_ms") if raw else None
                    sport_id = raw.get("sport_id") if raw else None
                    max_ms = prematch_max_esports_ms if sport_id == 12 else prematch_max_ms
                    if st_ms and st_ms > now_ms + max_ms:
                        future_ids.append(eid)
            removed = stale_ids + future_ids
            if removed:
                # Build tombstones before purging
                tombstones = []
                for eid in removed:
                    old = state.events_data.get(eid)
                    if old:
                        out = map_game_pid(old)
                        tombstones.append({"Pid": out.get("Pid", eid), "Removed": True,
                                           "homeName": old.get("homeName", ""),
                                           "awayName": old.get("awayName", ""),
                                           "isLive": old.get("isLive")})
                _purge_event_state(removed)
                parts = []
                if stale_ids:
                    parts.append(f"{len(stale_ids)} stale")
                if future_ids:
                    parts.append(f"{len(future_ids)} too-far-future (>{PREMATCH_MAX_HOURS}h)")
                log(f"[TTL_CLEANUP] Removed {' + '.join(parts)}")
                # Broadcast tombstones to WS clients
                for ts in tombstones:
                    await broadcast({"type": "update", "source": "ps3838", "data": ts})
        except Exception as e:
            log(f"[TTL_CLEANUP] Error: {e}")
            await asyncio.sleep(10)


# ── Главная функция ───────────────────────────────────────────────────────────

async def main():
    """Запуск сервера: создаёт WS-сервер, запускает все фоновые задачи
    (подключения к PS3838, рассылка, опрос спецрынков, очистка TTL)."""
    global _hybrid_runtime_runner
    state.running = True
    state.runtime_shutdown_reason = ""
    state.runtime_restart_scheduled = False
    state.runtime_restart_cooldown_sec = 0.0
    state.runtime_restart_requested_ts = 0.0
    log("=" * 60)
    log("PS3838 SERVER — All Sports (Refactored)")
    # Инициализация debug trace из ENV
    if config.PS3838_DEBUG_TRACE_TEAM:
        debug_trace.set_trace_team(config.PS3838_DEBUG_TRACE_TEAM)
        log(f"[TRACE] Init from ENV: team={debug_trace.get_trace_team()!r}")
    log("=" * 60)
    if not _acquire_runtime_lock():
        return
    transport_backend = _transport_backend()
    hybrid_backend_runner = None
    hybrid_backend_module = None
    try:
        if transport_backend == "hybrid_runner":
            from core import hybrid_runner as hybrid_runner_module

            hybrid_backend_module = hybrid_runner_module
            hybrid_backend_module._running = True
            hybrid_backend_runner = hybrid_runner_module.HybridRunner(
                [int(sport_id) for sport_id in PS3838_SPORTS],
                _hybrid_runner_modes(),
                dry_run=False,
                allow_http_fallback=False,
            )
            log(
                "Transport backend: HybridRunner "
                f"(sports={list(PS3838_SPORTS)}, modes={_hybrid_runner_modes()})"
            )
            log("Hybrid startup: preparing browser backend before binding facade server")
            await hybrid_backend_runner.setup_async()
            if not hybrid_backend_module._running:
                log("HybridRunner setup interrupted before loop start")
                return
            _hybrid_runtime_runner = hybrid_backend_runner

        async with serve(
            client_handler,
            "0.0.0.0",
            SERVER_PORT,
            process_request=process_request,
            open_timeout=180,
        ):
            log(f"✓ Server at ws://0.0.0.0:{SERVER_PORT}")
            log("Supports: Soccer, Tennis, Basketball, Hockey, Volleyball, Handball, ESports")
            log("")
            if config.PS3838_ONLY_LIVE and config.PS3838_ONLY_PREMATCH:
                log("WARNING: config.PS3838_ONLY_LIVE + config.PS3838_ONLY_PREMATCH both set; running in ALL mode.")
            elif config.PS3838_ONLY_PREMATCH:
                log("Mode: prematch-only")
            elif config.PS3838_ONLY_LIVE:
                log("Mode: live-only")
            else:
                log("Mode: live + prematch")
            log("REST specials DISABLED permanently (PS3838 bans accounts for REST requests).")
            if not PS3838_SIMPLE_SUBSCRIBE:
                log("NOTE: BTG/PIMO mode; use PS3838_SIMPLE_SUBSCRIBE=1 if live stalls.")
            if PS3838_BROWSER_SUBSCRIBE and PS3838_BROWSER_LV_EMPTY:
                log("NOTE: Browser LV empty mode (single SUBSCRIBE per sport).")
            if PS3838_DROP_STALE_UPDATES:
                log("Stale protection: dropping updates/state when stale.")
            if PS3838_AUTO_REFRESH_ON_STALE:
                log(f"Auto-refresh on stale enabled (backoff {PS3838_REFRESH_BACKOFF_SEC}s).")

            tasks = []
            tasks.append(asyncio.create_task(zombie_reaper()))
            tasks.append(asyncio.create_task(events_data_ttl_cleanup()))

            if transport_backend == "hybrid_runner":
                tasks.append(asyncio.create_task(hybrid_backend_runner.run()))
            else:
                if PS3838_USE_BROWSER_WS:
                    log("Browser WS mode enabled (Playwright).")
                    tasks.append(asyncio.create_task(listen_browser(PS3838_SPORTS)))
                else:
                    sport_fo_btgs = [int(btg) for btg in PS3838_SPORT_FO_BTGS if int(btg) > 0]
                    if not sport_fo_btgs:
                        sport_fo_btgs = [1, 100]
                    _ws_connect_semaphore = asyncio.Semaphore(config.PS3838_WS_MAX_CONCURRENT_CONNECTS)
                    log(f"WS connect semaphore: max {config.PS3838_WS_MAX_CONCURRENT_CONNECTS} concurrent, stagger {config.PS3838_SPORT_FO_LANE_STAGGER_SEC}s")
                    if PS3838_SPORT_FO_COMBINE_BTGS:
                        log(
                            "Sport-FO runtime: "
                            f"{len(PS3838_SPORTS)} sockets, logical_lanes={len(PS3838_SPORTS) * len(sport_fo_btgs)}, "
                            f"btgs={sport_fo_btgs}"
                        )
                        for lane_index, sport_id in enumerate(PS3838_SPORTS):
                            label = f"S{int(sport_id)}"
                            tasks.append(
                                asyncio.create_task(
                                    listen_group(
                                        [int(sport_id)],
                                        label,
                                        subscribe_btgs=list(sport_fo_btgs),
                                        connect_stagger_sec=max(0.0, PS3838_SPORT_FO_LANE_STAGGER_SEC * lane_index),
                                        connect_semaphore=_ws_connect_semaphore,
                                    )
                                )
                            )
                        lane_count = len(PS3838_SPORTS)
                    else:
                        log(
                            "Sport-FO runtime: "
                            f"{len(PS3838_SPORTS) * len(sport_fo_btgs)} lanes, btgs={sport_fo_btgs}"
                        )
                        lane_count = 0
                        for sport_id in PS3838_SPORTS:
                            for btg in sport_fo_btgs:
                                label = f"S{int(sport_id)}B{int(btg)}"
                                tasks.append(
                                    asyncio.create_task(
                                        listen_group(
                                            [int(sport_id)],
                                            label,
                                            btg=int(btg),
                                            connect_stagger_sec=max(0.0, PS3838_SPORT_FO_LANE_STAGGER_SEC * lane_count),
                                            connect_semaphore=_ws_connect_semaphore,
                                        )
                                    )
                                )
                                lane_count += 1
            tasks.append(asyncio.create_task(send_state_loop()))
            tasks.append(asyncio.create_task(rebroadcast_loop()))

            # ── BIA cpricefeed observer ───────────────────────────────────────
            if config.BIA_ENABLED:
                tasks.append(asyncio.create_task(run_bia_observer()))
                log(_bia_task_start_message())

            # ── Start hybrid HTTP poll loop (works alongside both browser and direct WS) ──
            if transport_backend != "hybrid_runner" and getattr(config, "PS3838_HYBRID_ENABLED", False):
                try:
                    await _start_hybrid_poll_loop(list(PS3838_SPORTS))
                    log("Hybrid transport poll loop started")
                except Exception as _he:
                    log(f"Hybrid transport poll loop failed to start: {_he}")

            try:
                await asyncio.gather(*tasks)
            except KeyboardInterrupt:
                state.running = False
            finally:
                if hybrid_backend_module is not None:
                    hybrid_backend_module._running = False
                if hybrid_backend_runner is not None:
                    await asyncio.to_thread(hybrid_backend_runner.shutdown)
                _hybrid_runtime_runner = None
                await _stop_hybrid_poll_loop()
    finally:
        _hybrid_runtime_runner = None
        _release_runtime_lock()


if __name__ == "__main__":
    try:
        _ensure_playwright_browser()
        _configure_logging()
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
