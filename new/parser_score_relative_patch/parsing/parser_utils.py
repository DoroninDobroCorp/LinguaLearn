"""
Утилиты парсера PS3838 — вспомогательные функции для парсинга данных WebSocket.
"""

import logging
import orjson
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

import config as _cfg

logger = logging.getLogger(__name__)
_TOTALS_DIAG_INTERVAL_SEC = 60.0
_raw_total_diag_last_ts = 0.0
_idx5_diag_state: Dict[str, Any] = {
    "0": 0,
    "1": 0,
    "other": 0,
    "samples0": [],
    "samples1": [],
    "last_ts": 0.0,
}

from parsing.helpers import make_odd, float_to_line, ensure_map, ps3838_raw
import infra.debug_trace as debug_trace
from parsing.normalizers import get_sport_name, normalize_names, normalize_all_name, base_team_key
from utils.utils import log


def _maybe_log_raw_totals_diagnostic(totals: List[Any], target_key: str, event_id: int) -> None:
    global _raw_total_diag_last_ts

    if not _cfg.PS3838_DEBUG_TOTALS_DIAGNOSTICS or target_key != "Totals" or not totals:
        return
    now_ts = time.time()
    if now_ts - _raw_total_diag_last_ts <= _TOTALS_DIAG_INTERVAL_SEC:
        return
    _raw_total_diag_last_ts = now_ts
    sample = totals[0] if totals else []
    log(f"[DIAG_RAW_TOTAL] eid={event_id} len={len(sample)} raw={str(sample)[:300]}")


def _record_total_idx5_diagnostic(total: List[Any]) -> None:
    if not _cfg.PS3838_DEBUG_TOTALS_DIAGNOSTICS or len(total) <= 5:
        return

    idx5_value = total[5]
    if idx5_value == 0:
        bucket = "0"
        samples_key = "samples0"
    elif idx5_value == 1:
        bucket = "1"
        samples_key = "samples1"
    else:
        bucket = "other"
        samples_key = None
    _idx5_diag_state[bucket] += 1
    if samples_key and len(_idx5_diag_state[samples_key]) < 3:
        _idx5_diag_state[samples_key].append(str(total))

    now_ts = time.time()
    if now_ts - float(_idx5_diag_state["last_ts"]) <= _TOTALS_DIAG_INTERVAL_SEC:
        return

    log(
        "[DIAG_IDX5] idx5=0: "
        f"{_idx5_diag_state['0']}, idx5=1: {_idx5_diag_state['1']}, other: {_idx5_diag_state['other']}"
    )
    for sample in _idx5_diag_state["samples0"][:2]:
        log(f"[DIAG_IDX5_SAMPLE_0] {sample}")
    for sample in _idx5_diag_state["samples1"][:2]:
        log(f"[DIAG_IDX5_SAMPLE_1] {sample}")
    _idx5_diag_state.update(
        {"0": 0, "1": 0, "other": 0, "samples0": [], "samples1": [], "last_ts": now_ts}
    )


def extract_moneyline_values(ml):
    """PS3838 format: [away, home, draw] -> (home, away, draw)."""
    if not isinstance(ml, list) or not ml:
        return 0.0, 0.0, 0.0
    away = to_float(ml[0]) if len(ml) > 0 else 0.0
    home = to_float(ml[1]) if len(ml) > 1 else 0.0
    draw = to_float(ml[2]) if len(ml) > 2 else 0.0
    return home, away, draw


def extract_moneyline_values_home_first(ml):
    """Format: [home, away, draw] -> (home, away, draw)."""
    if not isinstance(ml, list) or not ml:
        return 0.0, 0.0, 0.0
    home = to_float(ml[0]) if len(ml) > 0 else 0.0
    away = to_float(ml[1]) if len(ml) > 1 else 0.0
    draw = to_float(ml[2]) if len(ml) > 2 else 0.0
    return home, away, draw

_event_id_sports_env = os.getenv("PS3838_EVENT_ID_SPORTS", "29,4,19,18").strip()  # ESports(12) removed: needs parent_id for kills sub-events
PS3838_EVENT_ID_SPORTS = {
    int(x)
    for x in _event_id_sports_env.split(",")
    if x.strip().lstrip("-").isdigit()
}


# make_odd, float_to_line — imported from helpers.py


def format_created_at(ts_ns: Optional[int] = None) -> str:
    """Форматирование времени как Go time.Time JSON (RFC3339Nano с локальным сдвигом)."""
    if ts_ns is None:
        ts_ns = time.time_ns()
    sec, nsec = divmod(ts_ns, 1_000_000_000)
    dt = datetime.fromtimestamp(sec).astimezone()
    base = dt.strftime("%Y-%m-%dT%H:%M:%S")
    offset = dt.strftime("%z")
    if offset in ("+0000", "-0000"):
        offset_str = "Z"
    else:
        offset_str = f"{offset[:3]}:{offset[3:]}" if offset else ""
    if nsec == 0:
        return f"{base}{offset_str}"
    frac = f"{nsec:09d}".rstrip("0")
    return f"{base}.{frac}{offset_str}"


def make_win1x2_zero() -> Dict[str, Dict[str, float]]:
    return {
        "Win1": make_odd(0),
        "WinNone": make_odd(0),
        "Win2": make_odd(0),
    }


def new_period() -> Dict[str, Any]:
    """Создание пустого периода в формате parse_serge newPeriod()."""
    return {
        "Win1x2": make_win1x2_zero(),
        "Games": {},
        "Totals": {},
        "Handicap": {},
        "FirstTeamTotals": {},
        "SecondTeamTotals": {},
    }


def make_zero_period() -> Dict[str, Any]:
    """Нулевой период (аналог nil -> JSON null)."""
    return {
        "Win1x2": make_win1x2_zero(),
        "Games": None,
        "Totals": None,
        "Handicap": None,
        "FirstTeamTotals": None,
        "SecondTeamTotals": None,
    }


def ensure_base_maps(period: Dict[str, Any], include_games: bool = False) -> None:
    """Инициализация базовых карт рынков в периоде (аналог Go newPeriod или теннис/волейбол)."""
    if period.get("Totals") is None:
        period["Totals"] = {}
    if period.get("Handicap") is None:
        period["Handicap"] = {}
    if period.get("FirstTeamTotals") is None:
        period["FirstTeamTotals"] = {}
    if period.get("SecondTeamTotals") is None:
        period["SecondTeamTotals"] = {}
    if include_games and period.get("Games") is None:
        period["Games"] = {}


# ensure_map — imported from helpers.py

def ensure_winhandicap(target: Dict[str, Any], line: str) -> Dict[str, Any]:
    if line not in target:
        target[line] = {"Win1": make_odd(0), "Win2": make_odd(0)}
    return target[line]


def ensure_yesno(period: Dict[str, Any], key: str) -> Dict[str, Any]:
    """Гарантирует наличие структуры Да/Нет рынка в периоде."""
    if key not in period:
        period[key] = {}
    return period[key]


def set_win1x2(period: Dict[str, Any], home: float, away: float, draw: float = 0, line_id: int = 0, event_id: int = 0, ps_period: int = 0) -> None:
    period["Win1x2"]["Win1"] = make_odd(home, ps3838_raw(1, 0, 0, ps_period, line_id, event_id))
    period["Win1x2"]["Win2"] = make_odd(away, ps3838_raw(1, 1, 0, ps_period, line_id, event_id))
    period["Win1x2"]["WinNone"] = make_odd(draw, ps3838_raw(1, 2, 0, ps_period, line_id, event_id) if draw else None)
    if line_id:
        period["Win1x2"]["LineId"] = line_id
    if event_id:
        period["Win1x2"]["LineEventId"] = event_id


def to_float(value: Any) -> float:
    if value is None or value == "":
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        logger.warning("to_float: cannot convert %r to float", value)
        return 0.0


MIN_VALID_ODD = 1.001
MAX_VALID_ODD = 100.0


def normalize_odd(value: Any) -> float:
    odd = to_float(value)
    if odd < MIN_VALID_ODD or odd > MAX_VALID_ODD:
        return 0.0
    return odd


def extract_period_status(period_data: List[Any]) -> Optional[int]:
    """Извлечение статуса периода из массива PS3838 (индекс 11 или 5)."""
    if len(period_data) > 11 and isinstance(period_data[11], (int, float)):
        return int(period_data[11])
    if len(period_data) > 5 and isinstance(period_data[5], (int, float)):
        return int(period_data[5])
    return None


def extract_score(event: List[Any], odds_block: Optional[Dict[str, Any]] = None) -> Tuple[float, float, bool]:
    """Извлечение счёта из массива события PS3838 (event[9] или period[9]).
    Returns (home_score, away_score, has_score) where has_score indicates
    whether real score data was found (vs default zeros)."""
    if len(event) > 9 and isinstance(event[9], list) and len(event[9]) >= 2:
        return to_float(event[9][0]), to_float(event[9][1]), True
    if isinstance(odds_block, dict):
        period0 = odds_block.get("0")
        if isinstance(period0, list) and len(period0) > 9 and isinstance(period0[9], list) and len(period0[9]) >= 2:
            return to_float(period0[9][0]), to_float(period0[9][1]), True
    return 0.0, 0.0, False


def parse_total_fields(total: List[Any]) -> Tuple[float, float, float]:
    """Парсинг записи тотала в (points, over, under) с поддержкой форматов PS3838."""
    if not isinstance(total, list) or len(total) < 2:
        return 0.0, 0.0, 0.0
        
    # Standard format: [line_str, points, over, under, ...]
    if len(total) >= 4 and isinstance(total[0], str) and isinstance(total[1], (int, float)):
        return to_float(total[1]), normalize_odd(total[2]), normalize_odd(total[3])
    
    # Simple format: [points, over, under]
    if len(total) >= 3 and isinstance(total[0], (int, float)) and isinstance(total[1], (int, float)):
        return to_float(total[0]), normalize_odd(total[1]), normalize_odd(total[2])
    
    # String points at index 0: ["2.5", over, under]
    if len(total) >= 3 and isinstance(total[0], str):
        try:
            pts = float(total[0])
            return pts, normalize_odd(total[1]), normalize_odd(total[2])
        except Exception:
            logger.warning("Failed to parse total points from %r", total[:3])

    # Fallback / Alt format
    if len(total) >= 4:
        points = to_float(total[1])
        if points == 0.0:
            points = to_float(total[0])
        return points, normalize_odd(total[2]), normalize_odd(total[3])

    if len(total) >= 3:
        points = to_float(total[0])
        return points, normalize_odd(total[1]), normalize_odd(total[2])
    
    return 0.0, 0.0, 0.0


def _extract_total_line_id(total: List[Any]) -> int:
    """Extract lineId from raw total entry.

    Handles several observed formats:
      [line_str, points, over, under, lineId, ...]
      [points, over, under, lineId, ...]
            and nested extra-line variants where lineId is near the tail.
    """
    try:
        if not isinstance(total, list):
            return 0
        if len(total) >= 5:
            lid = int(total[4])
            if lid > 0:
                return lid
        if len(total) >= 4 and isinstance(total[3], (int, float)):
            lid = int(total[3])
            if lid > 1_000_000:
                return lid
        # Fallback: scan tail for a plausible numeric lineId.
        for v in reversed(total):
            if not isinstance(v, (int, float, str)):
                continue
            try:
                lid = int(float(v))
            except (ValueError, TypeError):
                continue
            if lid > 1_000_000:
                return lid
    except (ValueError, TypeError):
        pass
    return 0


def _upsert_winlessmore_line(target: Dict[str, Any], line: str, over_price: float, under_price: float, line_id: int = 0, event_id: int = 0, bet_type: int = 3, ps_period: int = 0) -> None:
    """Обновление/вставка линии WinMore/WinLess с сохранением существующего LineId."""
    prev = target.get(line)
    prev_lid = prev.get("LineId") if isinstance(prev, dict) else 0
    prev_leid = prev.get("LineEventId") if isinstance(prev, dict) else 0
    hdp = 0.0
    try:
        hdp = float(line)
    except (ValueError, TypeError):
        pass
    # bet_type: 3=Total, 4=IT1, 5=IT2; team_select: 3=Over, 4=Under (total), 5/0 or 7/1 (IT)
    if bet_type == 4:
        over_ts, under_ts = 5, 0  # IT1: Over=5, Under=0
    elif bet_type == 5:
        over_ts, under_ts = 7, 1  # IT2: Over=7, Under=1
    else:
        over_ts, under_ts = 3, 4  # Total: Over=3, Under=4
    entry = {
        "WinMore": make_odd(over_price, ps3838_raw(bet_type, over_ts, hdp, ps_period, line_id, event_id)),
        "WinLess": make_odd(under_price, ps3838_raw(bet_type, under_ts, hdp, ps_period, line_id, event_id)),
    }
    if line_id:
        entry["LineId"] = int(line_id)
    elif prev_lid:
        entry["LineId"] = int(prev_lid)
    if event_id:
        entry["LineEventId"] = int(event_id)
    elif prev_leid:
        entry["LineEventId"] = int(prev_leid)
    target[line] = entry


def _extract_spread_line_id(spread: List[Any]) -> int:
    """Извлечение lineId из сырого спреда. Формат: [..., lineId, isAlt, maxStake] в индексе 7."""
    try:
        if isinstance(spread, list) and len(spread) >= 8:
            return int(spread[7])
    except (ValueError, TypeError):
        pass
    return 0


def _extract_ml_line_id(ml: List[Any]) -> int:
    """Извлечение lineId из сырого монейлайна. Формат: [away, home, draw, lineId, ...]."""
    try:
        if isinstance(ml, list) and len(ml) >= 4:
            return int(ml[3])
    except (ValueError, TypeError):
        pass
    return 0


# get_sport_name, normalize_* — imported from normalizers.py

def build_game_data(
    parent_event: Dict[str, Any],
    sport_name: str,
    period_count: int,
    is_live: bool,
    set_scores: bool = True,
    pid: Optional[int] = None,
) -> Dict[str, Any]:
    league_name, home_name, away_name = normalize_names(
        sport_name, parent_event["league_name"], parent_event["home_name"], parent_event["away_name"]
    )
    event_id = pid if pid is not None else parent_event["event_id"]
    resolved_is_live = parent_event.get("is_live")
    if resolved_is_live is None:
        resolved_is_live = is_live
    starts_at = parent_event.get("starts_at")
    sport_id = parent_event.get("sport_id")
    game = {
        "Pid": event_id,
        "MatchId": str(event_id),
        "LeagueName": league_name,
        "homeName": home_name,
        "awayName": away_name,
        "isLive": bool(resolved_is_live),
        "HomeScore": parent_event["home_score"] if set_scores else 0.0,
        "AwayScore": parent_event["away_score"] if set_scores else 0.0,
        "HasScore": parent_event.get("has_score", False) if set_scores else False,
        "sport_id": int(sport_id) if isinstance(sport_id, (int, float)) else None,
        "starts_at": str(starts_at) if starts_at else None,
        "is_live": bool(resolved_is_live),
        "Periods": [make_zero_period() for _ in range(period_count)],
        "Source": "Pinnacle",
        "SportName": sport_name,
        "CreatedAt": format_created_at(),
        "PriceConfirmedAt": format_created_at(),
        "trace_id": str(uuid.uuid4()),
        "Raw": orjson.loads(orjson.dumps(parent_event)),
    }
    # CLV: propagate match start time for closing line capture
    st_ms = parent_event.get("start_time_ms")
    if st_ms and isinstance(st_ms, (int, float)) and st_ms > 1_600_000_000_000:
        game["matchDate"] = datetime.fromtimestamp(st_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return game


def iter_periods(odds_block: Dict[str, Any]) -> Iterable[Tuple[int, List[Any]]]:
    """Итерация по периодам из odds_block (ключ=номер периода, значение=данные)."""
    for period_key, period_data in odds_block.items():
        try:
            period_num = int(period_key)
        except (TypeError, ValueError):
            continue
        if not isinstance(period_data, list):
            continue
        yield period_num, period_data



def _remap_mb_period_data(period_data: List[Any]) -> List[Any]:
    """Remap e-key period_data to FO-compatible index layout.

    E-key:    [0]=team_totals, [1]=specials, [2]=handicaps, [3]=totals, [4]=moneyline
    FO:       [0]=spreads,     [1]=totals,   [2]=moneyline, [3]=home_TT, [4]=away_TT

    Returns a new list with e-key data in FO positions so standard parse_*
    functions work correctly.  Items beyond [4] are status/metadata and
    are kept in their original positions (appended).
    """
    if len(period_data) < 5:
        return period_data
    # No sanity check needed: this function is only called when is_extra=True,
    # which guarantees the nested e-key layout.
    #
    # Team totals at [0] are nested: [[home_lines], [away_lines], ...]
    # FO expects flat lists: [3]=home_TT_flat, [4]=away_TT_flat
    # Split nested structure into two separate flat lists.
    tt_raw = period_data[0]
    home_tt = []
    away_tt = []
    if isinstance(tt_raw, list) and len(tt_raw) >= 2:
        if isinstance(tt_raw[0], list):
            home_tt = tt_raw[0]
        if isinstance(tt_raw[1], list):
            away_tt = tt_raw[1]
    return [
        period_data[2],  # [0] handicaps -> FO spreads position
        period_data[3],  # [1] totals -> FO totals position
        period_data[4],  # [2] moneyline -> FO ML position
        home_tt,         # [3] home team totals (flat list)
        away_tt,         # [4] away team totals (flat list)
    ] + period_data[5:]  # preserve status/metadata tail


def _looks_like_moneyline_block(block: Any) -> bool:
    if not isinstance(block, list) or not block:
        return False
    sample = block[:3]
    return all(not isinstance(v, (list, dict)) for v in sample)


def parse_moneyline(period_data: List[Any]) -> Tuple[Optional[int], Optional[List[Any]]]:
    """Извлечение монейлайна из данных периода.

    Поддерживает:
      - standard/MB remapped layout: moneyline at [2]
      - observed live soccer layout: moneyline at [4]
      - compact prematch layout: moneyline at [0]
    """
    status = extract_period_status(period_data)
    # Standard / remapped e-key layout.
    if len(period_data) > 2 and _looks_like_moneyline_block(period_data[2]):
        return status, period_data[2]
    # Live soccer regular layout can place spreads/totals at [2]/[3] and the
    # flat moneyline price block at [4].
    if len(period_data) > 4 and _looks_like_moneyline_block(period_data[4]):
        return status, period_data[4]
    # Compact prematch format.
    if len(period_data) > 0 and _looks_like_moneyline_block(period_data[0]):
        return status, period_data[0]
    return status, None


def parse_totals_into(period: Dict[str, Any], period_data: List[Any], target_key: str, event_id: int = 0, ps_period: int = 0) -> None:
    """Парсинг тоталов из period_data в period[target_key].
    PS3838 использует абсолютные линии для лайв-событий — корректировка счёта не нужна."""
    if len(period_data) > 1 and isinstance(period_data[1], list):
        totals = period_data[1]
        _maybe_log_raw_totals_diagnostic(totals, target_key, event_id)
        for total in totals:
            if not isinstance(total, list) or len(total) < 3:
                continue
            points, over_price, under_price = parse_total_fields(total)
            _record_total_idx5_diagnostic(total)
            if points <= 0.0 and over_price == 0.0 and under_price == 0.0:
                continue
            if points <= 0.0:
                continue
            line = float_to_line(points)
            target = ensure_map(period, target_key)
            lid = _extract_total_line_id(total)
            _upsert_winlessmore_line(target, line, over_price, under_price, lid, event_id, bet_type=3, ps_period=ps_period)


def parse_spreads_into(
    period: Dict[str, Any],
    period_data: List[Any],
    target_key: str,
    sign_is_home: bool = False,
    event_id: int = 0,
    ps_period: int = 0,
    home_score: float = 0.0,
    away_score: float = 0.0,
    score_relative: bool = False,
    score_relative_hdp_is_home_signed: bool = True,
) -> None:
    """Парсинг гандикапов (спредов) из period_data в period[target_key].
    sign_is_home=True означает, что сырой hdp уже signed для домашней команды
    (CornersHandicap, BookingsHandicap в футболе). False — стандартное зеркалирование.

    score_relative=True converts a live remaining-time handicap into the
    absolute full-match line by applying the current score. Set
    score_relative_hdp_is_home_signed=False when the raw hdp is mirrored
    (positive raw hdp belongs to the away-side display line).
    """
    if len(period_data) > 0 and isinstance(period_data[0], list):
        spreads = period_data[0]
        # Guard: skip if [0] contains nested team totals from e-key payloads.
        # Team totals format: [[home_entries], [away_entries]] where entries are lists.
        # Normal spreads: [flat_entry, flat_entry, ...] where each entry[0] is a number.
        if (spreads
                and isinstance(spreads[0], list)
                and spreads[0]
                and isinstance(spreads[0][0], list)):
            return  # team totals in [0] — not handicaps, skip
        for spread in spreads:
            if not isinstance(spread, list) or len(spread) < 3:
                continue
            
            # Standard: [hdp, -hdp, line_str, home_price, away_price, ...]
            # Some alt formats: [hdp, home_price, away_price]
            if len(spread) >= 5 and isinstance(spread[2], str):
                hdp = to_float(spread[0])
                home_price = normalize_odd(spread[3])
                away_price = normalize_odd(spread[4])
            else:
                hdp = to_float(spread[0])
                home_price = normalize_odd(spread[1])
                away_price = normalize_odd(spread[2])

            if hdp == 0.0 and len(spread) > 1 and not isinstance(spread[1], (int, float)):
                 # Probably already have hdp but it's 0.0, and next is price
                 pass

            if score_relative:
                home_relative_hcp = hdp if score_relative_hdp_is_home_signed else -hdp
                home_hcp = (away_score - home_score) + home_relative_hcp
                away_hcp = (home_score - away_score) - home_relative_hcp
            elif sign_is_home:
                home_hcp = hdp
                away_hcp = -hdp
            else:
                home_hcp = -hdp
                away_hcp = hdp
            home_line = float_to_line(home_hcp)
            away_line = float_to_line(away_hcp)
            
            target = ensure_map(period, target_key)
            # Each spread entry creates two mirrored lines.
            # Win1 goes on home_line, Win2 goes on away_line.
            home_entry = ensure_winhandicap(target, home_line)
            away_entry = ensure_winhandicap(target, away_line)
            lid = _extract_spread_line_id(spread)
            # Raw handicap must use display line (matches outcome_mapper convention)
            home_entry["Win1"] = make_odd(home_price, ps3838_raw(2, 0, home_hcp, ps_period, lid, event_id))
            away_entry["Win2"] = make_odd(away_price, ps3838_raw(2, 1, away_hcp, ps_period, lid, event_id))
            # TRACE: запись Handicap
            if debug_trace.is_active():
                debug_trace.trace("PARSE_HANDICAP", 0, f"H line={home_line}/{away_line} W1={home_price} W2={away_price}")
            if lid:
                home_entry["LineId"] = lid
                away_entry["LineId"] = lid
                if event_id:
                    home_entry["LineEventId"] = event_id
                    away_entry["LineEventId"] = event_id




def parse_team_totals_into(period: Dict[str, Any], period_data: List[Any], home_key: str, away_key: str, event_id: int = 0, ps_period: int = 0) -> None:
    """Парсинг индивидуальных тоталов команд. PS3838 использует абсолютные линии."""
    # Standard FULL_ODDS format: team totals in [3] (home) and [4] (away)
    if len(period_data) > 3 and isinstance(period_data[3], list):
        for tt in period_data[3]:
            if not isinstance(tt, list) or len(tt) < 3:
                continue
            points, over_price, under_price = parse_total_fields(tt)
            line = float_to_line(points)
            if line == "0.0":
                continue
            target = ensure_map(period, home_key)
            lid = _extract_total_line_id(tt)
            # TRACE: запись FTT из FULL_ODDS [3]
            if debug_trace.is_active():
                debug_trace.trace_ftt("PARSE_FTT_STANDARD", 0, line, over_price, under_price, f"home/{home_key}/[3]")
            _upsert_winlessmore_line(target, line, over_price, under_price, lid, event_id, bet_type=4, ps_period=ps_period)
    if len(period_data) > 4 and isinstance(period_data[4], list):
        for tt in period_data[4]:
            if not isinstance(tt, list) or len(tt) < 3:
                continue
            points, over_price, under_price = parse_total_fields(tt)
            line = float_to_line(points)
            if line == "0.0":
                continue
            target = ensure_map(period, away_key)
            lid = _extract_total_line_id(tt)
            _upsert_winlessmore_line(target, line, over_price, under_price, lid, event_id, bet_type=5, ps_period=ps_period)
    # --- FIX: If standard block with [3]/[4] found, do NOT parse [0] as team totals ---
    # Standard FULL_ODDS blocks have >5 elements where [0] contains Spreads not Team Totals.
    # However some e-key events ALSO have >5 elements while [0] is team totals.
    # Distinguish by checking if [0] contains nested lists (team totals) vs flat spread entries.
    if len(period_data) > 5:
        if (len(period_data) > 0 and isinstance(period_data[0], list) and len(period_data[0]) >= 2
                and isinstance(period_data[0][0], list) and isinstance(period_data[0][1], list)
                and period_data[0][0] and isinstance(period_data[0][0][0], list)):
            pass  # Nested team totals format — continue to parse below
        else:
            return
    # Nested extra-line format: team totals in [0] as [[home_lines], [away_lines], ...]
    if len(period_data) > 0 and isinstance(period_data[0], list) and len(period_data[0]) >= 2:
        first_elem = period_data[0]
        # Check if this is the nested extra-line format.
        if isinstance(first_elem[0], list) and isinstance(first_elem[1], list):
            # [0][0] = home team totals, [0][1] = away team totals
            home_totals = first_elem[0]
            away_totals = first_elem[1]
            for tt in home_totals:
                if not isinstance(tt, list) or len(tt) < 4:
                    continue
                # Nested team-total format: [line_str, line_float, over, under, lineId, isAlt]
                # Same order as standard totals: tt[2]=over, tt[3]=under
                try:
                    points = float(tt[1]) if isinstance(tt[1], (int, float)) else float(tt[0])
                    over_price = normalize_odd(tt[2])
                    under_price = normalize_odd(tt[3])
                except (ValueError, IndexError):
                    continue
                if points <= 0.0:
                    continue
                line = float_to_line(points)
                if line == "0.0":
                    continue
                target = ensure_map(period, home_key)
                lid = _extract_total_line_id(tt)
                # TRACE: запись FTT из nested extra-line payload
                if debug_trace.is_active():
                    debug_trace.trace_ftt("PARSE_FTT_MOREBET", 0, line, over_price, under_price, f"home/{home_key}")
                _upsert_winlessmore_line(target, line, over_price, under_price, lid, event_id, bet_type=4, ps_period=ps_period)
            for tt in away_totals:
                if not isinstance(tt, list) or len(tt) < 4:
                    continue
                try:
                    points = float(tt[1]) if isinstance(tt[1], (int, float)) else float(tt[0])
                    over_price = normalize_odd(tt[2])
                    under_price = normalize_odd(tt[3])
                except (ValueError, IndexError):
                    continue
                if points <= 0.0:
                    continue
                line = float_to_line(points)
                if line == "0.0":
                    continue
                target = ensure_map(period, away_key)
                lid = _extract_total_line_id(tt)
                # TRACE: запись STT из nested extra-line payload
                if debug_trace.is_active():
                    debug_trace.trace_ftt("PARSE_STT_MOREBET", 0, line, over_price, under_price, f"away/{away_key}")
                _upsert_winlessmore_line(target, line, over_price, under_price, lid, event_id, bet_type=5, ps_period=ps_period)


def map_tennis_period(period_num: int) -> Tuple[int, Optional[str]]:
    if period_num == 0:
        return 0, None
    if 1 <= period_num <= 5:
        return period_num, None
    if period_num > 5:
        set_num = (period_num - 6) // 13 + 1
        game_num = (period_num - 6) % 13 + 1
        if set_num <= 5:
            return set_num, str(game_num)
    return -1, None


# base_team_key — imported from normalizers.py
