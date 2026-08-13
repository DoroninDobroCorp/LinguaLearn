"""
Маппер строки исхода → параметры betslip PS3838.

Конвертирует ВСЕ внутренние форматы исходов в параметры API PS3838.

Стандартные рынки (betType 1-5) используют числовой формат oddsId:
  eventId|period|betType|teamSelect|isAlt|handicap

Спецрынки (BTTS, CS, OE, DC, DNB и т.д.) используют тип "special" с
поиском по имени участника — PS3838 betslip разрешает их по имени
внутри события.

PS3838 betType:    1=Монейлайн, 2=Гандикап, 3=Тотал, 4=ИТ1(хозяева), 5=ИТ2(гости)
PS3838 teamSelect:
  - Монейлайн/Гандикап: 0=Хозяева, 1=Гости, 2=Ничья
  - Тоталы матча (betType=3): 3=Больше, 4=Меньше
  - ИТ1 (betType=4): 5=Больше, 0=Меньше
  - ИТ2 (betType=5): 7=Больше, 1=Меньше
"""

import re
from typing import Any, Dict, Optional


def normalize_period_number(value: Any) -> int:
    """Return a non-negative Pinnacle period number.

    Period 0 is the full match. Positive values are preserved for downstream
    bookmaker-specific mapping; they must never be silently collapsed to 0.
    """
    try:
        period = int(value or 0)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid period: {value!r}") from exc
    if period < 0:
        raise ValueError(f"Invalid negative period: {period}")
    return period


def outcome_to_ps3838(
    outcome: str,
    handicap: Optional[float] = None,
    period: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Конвертация строки исхода в параметры PS3838.

    Возвращает словарь:
      Стандартные рынки: {bet_type, team_select, handicap, period, is_alt, market: "standard"}
      Спецрынки:        {market: "special", special_type, contestant, handicap, period}
    """
    raw = outcome.strip()
    result_period = normalize_period_number(period)

    # Извлечение префикса периода: P1, P2, P3, P4 и т.д.
    period_match = re.match(r"^P(\d+)\s+(.+)$", raw)
    if period_match:
        result_period = normalize_period_number(period_match.group(1))
        raw = period_match.group(2).strip()

    # ==================== СТАНДАРТНЫЕ РЫНКИ (betType 1-5) ====================

    # --- Монейлайн ---
    if raw == "1":
        return _std(1, 0, 0, result_period)
    if raw == "2":
        return _std(1, 1, 0, result_period)
    if raw in ("X", "x", "Draw"):
        return _std(1, 2, 0, result_period)

    # --- Tennis/TT Moneyline (match winner, separate from game handicaps) ---
    if raw == "ML 1":
        return _std(1, 0, 0, result_period)
    if raw == "ML 2":
        return _std(1, 1, 0, result_period)

    # --- Гандикап: H1 {значение} или H2 {значение} ---
    hdp_match = re.match(r"^H([12])\s+([-+]?\d+(?:\.\d+)?)$", raw)
    if hdp_match:
        team = 0 if hdp_match.group(1) == "1" else 1
        hdp_val = float(hdp_match.group(2))
        h = handicap if handicap is not None else hdp_val
        return _std(2, team, h, result_period)

    # --- Тотал Больше/Меньше ---
    total_match = re.match(r"^(?:T>|O|Over)\s*([-+]?\d+(?:\.\d+)?)$", raw, re.IGNORECASE)
    if total_match:
        h = handicap if handicap is not None else float(total_match.group(1))
        return _std(3, 3, h, result_period)

    total_under_match = re.match(r"^(?:T<|U|Under)\s*([-+]?\d+(?:\.\d+)?)$", raw, re.IGNORECASE)
    if total_under_match:
        h = handicap if handicap is not None else float(total_under_match.group(1))
        return _std(3, 4, h, result_period)

    # --- Индивидуальные тоталы команд: IT1> IT1< IT2> IT2< ---
    it_match = re.match(r"^IT([12])\s*([><])\s*([-+]?\d+(?:\.\d+)?)$", raw)
    if it_match:
        team_num = int(it_match.group(1))
        direction = it_match.group(2)
        h = handicap if handicap is not None else float(it_match.group(3))
        bet_type = 4 if team_num == 1 else 5
        # PS3838 betslip team_select: 0=HomeUnder, 1=AwayUnder, 5=HomeOver, 7=AwayOver
        if team_num == 1:
            team_select = 5 if direction == ">" else 0   # IT1: Over=5, Under=0
        else:
            team_select = 7 if direction == ">" else 1   # IT2: Over=7, Under=1
        return _std(bet_type, team_select, h, result_period)

    # ==================== СПЕЦРЫНКИ (поиск по имени) ====================

    # --- Обе забьют (BTTS) ---
    if raw == "BTTS Yes":
        return _special("btts", "Yes", 0, result_period)
    if raw == "BTTS No":
        return _special("btts", "No", 0, result_period)

    # --- Чёт/Нечёт ---
    if raw == "OE Odd":
        return _special("odd_even", "Odd", 0, result_period)
    if raw == "OE Even":
        return _special("odd_even", "Even", 0, result_period)

    # --- Чёт/Нечёт хозяев/гостей ---
    if raw == "HOE Odd":
        return _special("home_odd_even", "Odd", 0, result_period)
    if raw == "HOE Even":
        return _special("home_odd_even", "Even", 0, result_period)
    if raw == "AOE Odd":
        return _special("away_odd_even", "Odd", 0, result_period)
    if raw == "AOE Even":
        return _special("away_odd_even", "Even", 0, result_period)
    # --- Двойной шанс (DC 1X, DC X2, DC 12) ---
    if raw == "DC 1X":
        return _special("double_chance", "HomeOrDraw", 0, result_period)
    if raw == "DC X2":
        return _special("double_chance", "DrawOrAway", 0, result_period)
    if raw == "DC 12":
        return _special("double_chance", "HomeOrAway", 0, result_period)
    # --- Ставка без ничьей (DNB) ---
    if raw in ("DNB Home", "DNB 1"):
        return _special("draw_no_bet", "Home", 0, result_period)
    if raw in ("DNB Away", "DNB 2"):
        return _special("draw_no_bet", "Away", 0, result_period)

    # --- Точный счёт: CS H:A (например "CS 2:1", "CS 0:0") ---
    cs_match = re.match(r"^CS\s+(\d+)[:\-](\d+)$", raw)
    if cs_match:
        score = f"{cs_match.group(1)}:{cs_match.group(2)}"
        return _special("correct_score", score, 0, result_period)

    # --- Тайм/Матч: HT/FT X/Y ---
    htft_match = re.match(r"^HT/FT\s+(.+)$", raw)
    if htft_match:
        return _special("half_time_full_time", htft_match.group(1), 0, result_period)

    # --- Первая забьёт ---
    if raw == "FTS Home":
        return _special("first_team_to_score", "Home", 0, result_period)
    if raw == "FTS Away":
        return _special("first_team_to_score", "Away", 0, result_period)
    if raw == "FTS Neither":
        return _special("first_team_to_score", "Neither", 0, result_period)

    # --- Хозяева/Гости забьют ---
    if raw == "HTS Yes":
        return _special("home_team_to_score", "Yes", 0, result_period)
    if raw == "HTS No":
        return _special("home_team_to_score", "No", 0, result_period)
    if raw == "ATS Yes":
        return _special("away_team_to_score", "Yes", 0, result_period)
    if raw == "ATS No":
        return _special("away_team_to_score", "No", 0, result_period)

    # --- Любая забьёт ---
    if raw == "ETS Yes":
        return _special("either_team_to_score", "Yes", 0, result_period)
    if raw == "ETS No":
        return _special("either_team_to_score", "No", 0, result_period)

    # --- Победа всухую ---
    if raw == "HWN Yes":
        return _special("home_win_to_nil", "Yes", 0, result_period)
    if raw == "HWN No":
        return _special("home_win_to_nil", "No", 0, result_period)
    if raw == "AWN Yes":
        return _special("away_win_to_nil", "Yes", 0, result_period)
    if raw == "AWN No":
        return _special("away_win_to_nil", "No", 0, result_period)

    # --- Проход дальше ---
    if raw == "TQ Home":
        return _special("to_qualify", "Home", 0, result_period)
    if raw == "TQ Away":
        return _special("to_qualify", "Away", 0, result_period)

    # --- Трёхсторонний гандикап: 3WH {линия} {команда} ---
    twh_match = re.match(r"^3WH\s+([-+]?\d+(?:\.\d+)?)\s+([12X])$", raw)
    if twh_match:
        line = float(twh_match.group(1))
        team = twh_match.group(2)
        return _special("three_way_handicap", team, line, result_period)

    # --- Победный маржин: WM {ключ} ---
    wm_match = re.match(r"^WM\s+(.+)$", raw)
    if wm_match:
        return _special("winning_margin", wm_match.group(1), 0, result_period)

    # --- Точное кол-во голов: ETG {n} ---
    etg_match = re.match(r"^ETG\s+(.+)$", raw)
    if etg_match:
        return _special("exact_total_goals", etg_match.group(1), 0, result_period)

    # --- Диапазон голов: TGR {диапазон} ---
    tgr_match = re.match(r"^TGR\s+(.+)$", raw)
    if tgr_match:
        return _special("total_goals_range", tgr_match.group(1), 0, result_period)

    # --- Точные голы хозяев/гостей: HEG/AEG {n} ---
    heg_match = re.match(r"^HEG\s+(.+)$", raw)
    if heg_match:
        return _special("home_exact_goals", heg_match.group(1), 0, result_period)
    aeg_match = re.match(r"^AEG\s+(.+)$", raw)
    if aeg_match:
        return _special("away_exact_goals", aeg_match.group(1), 0, result_period)

    # --- Способ победы: MOV {ключ} ---
    mov_match = re.match(r"^MOV\s+(.+)$", raw)
    if mov_match:
        return _special("method_of_victory", mov_match.group(1), 0, result_period)

    # --- Комбо-ставки: WTC/BWC/BTC/OET {ключ} ---
    combo_match = re.match(r"^(WTC|BWC|BTC|OET)\s+(.+)$", raw)
    if combo_match:
        combo_type = {
            "WTC": "winner_total_combo",
            "BWC": "btts_winner_combo",
            "BTC": "btts_total_combo",
            "OET": "odd_even_total_combo",
        }[combo_match.group(1)]
        return _special(combo_type, combo_match.group(2), 0, result_period)

    # --- Угловые: CT>/CT< {линия}, CH1/CH2 {линия}, CIT1>/CIT2< {линия} ---
    ct_match = re.match(r"^CT([><])\s*([-+]?\d+(?:\.\d+)?)$", raw)
    if ct_match:
        direction = ct_match.group(1)
        h = float(ct_match.group(2))
        return _special("corners_total", "Over" if direction == ">" else "Under", h, result_period)
    ch_match = re.match(r"^CH([12])\s*([-+]?\d+(?:\.\d+)?)$", raw)
    if ch_match:
        team = "Home" if ch_match.group(1) == "1" else "Away"
        h = float(ch_match.group(2))
        return _special("corners_handicap", team, h, result_period)
    cit_match = re.match(r"^CIT([12])([><])\s*([-+]?\d+(?:\.\d+)?)$", raw)
    if cit_match:
        team = "Home" if cit_match.group(1) == "1" else "Away"
        direction = cit_match.group(2)
        h = float(cit_match.group(3))
        return _special(f"corners_{'home' if team == 'Home' else 'away'}_total",
                        "Over" if direction == ">" else "Under", h, result_period)

    # --- Карточки: BkT>/BkT< {линия}, BkH1/BkH2 {линия}, BkIT1>/BkIT2< {линия} ---
    bkt_match = re.match(r"^BkT([><])\s*([-+]?\d+(?:\.\d+)?)$", raw)
    if bkt_match:
        direction = bkt_match.group(1)
        h = float(bkt_match.group(2))
        return _special("bookings_total", "Over" if direction == ">" else "Under", h, result_period)
    bkh_match = re.match(r"^BkH([12])\s*([-+]?\d+(?:\.\d+)?)$", raw)
    if bkh_match:
        team = "Home" if bkh_match.group(1) == "1" else "Away"
        h = float(bkh_match.group(2))
        return _special("bookings_handicap", team, h, result_period)
    bkit_match = re.match(r"^BkIT([12])([><])\s*([-+]?\d+(?:\.\d+)?)$", raw)
    if bkit_match:
        team = "Home" if bkit_match.group(1) == "1" else "Away"
        direction = bkit_match.group(2)
        h = float(bkit_match.group(3))
        return _special(f"bookings_{'home' if team == 'Home' else 'away'}_total",
                        "Over" if direction == ">" else "Under", h, result_period)

    # --- Теннис сеты: Sets T>/T< {линия}, Sets H1/H2 {линия} ---
    sets_t_match = re.match(r"^Sets T([><])\s*([-+]?\d+(?:\.\d+)?)$", raw)
    if sets_t_match:
        direction = sets_t_match.group(1)
        h = float(sets_t_match.group(2))
        return _special("sets_total", "Over" if direction == ">" else "Under", h, result_period)
    sets_h_match = re.match(r"^Sets H([12])\s*([-+]?\d+(?:\.\d+)?)$", raw)
    if sets_h_match:
        team = "Home" if sets_h_match.group(1) == "1" else "Away"
        h = float(sets_h_match.group(2))
        return _special("sets_handicap", team, h, result_period)

    # --- Теннис/настольный теннис: гейм-виннер 1G/2G {номер_гейма} ---
    # "P3 1G 11" → Player 1 wins Game 11 in Set 3 (standard ML on child event)
    forted_game_win = re.match(r"^Game\s+(\d+)\s+Win([12])$", raw, re.IGNORECASE)
    if forted_game_win:
        game_number = int(forted_game_win.group(1))
        team = 0 if forted_game_win.group(2) == "1" else 1
        result = _std(1, team, 0, result_period)
        result["game_number"] = game_number
        return result

    games_win_match = re.match(r"^([12])G\s+(\d+)$", raw)
    if games_win_match:
        team = 0 if games_win_match.group(1) == "1" else 1
        game_number = int(games_win_match.group(2))
        result = _std(1, team, 0, result_period)
        result["game_number"] = game_number
        return result

    # --- Пропсы игроков: PP {имя} {рынок}> {линия} или PP {имя} {рынок}< {линия} ---
    pp_match = re.match(r"^PP\s+(.+?)\s+(\w+)([><])\s*([-+]?\d+(?:\.\d+)?)$", raw)
    if pp_match:
        player = pp_match.group(1)
        market = pp_match.group(2)
        direction = pp_match.group(3)
        h = float(pp_match.group(4))
        return _special("player_prop", f"{player}|{market}|{'Over' if direction == '>' else 'Under'}", h, result_period)

    raise ValueError(f"Unknown outcome format: '{outcome}'")


# ---------------------------------------------------------------------------
# Вспомогательные функции
# ---------------------------------------------------------------------------

def _std(bet_type: int, team_select: int, handicap: float, period: int) -> Dict[str, Any]:
    """Стандартный рынок (betType 1-5) — проверяется через числовой oddsId."""
    return {
        "market": "standard",
        "bet_type": bet_type,
        "team_select": team_select,
        "handicap": handicap,
        "period": period,
        "is_alt": 0,
    }


def _special(special_type: str, contestant: str, handicap: float, period: int) -> Dict[str, Any]:
    """Спецрынок — требует поиска по имени участника в betslip PS3838."""
    return {
        "market": "special",
        "special_type": special_type,
        "contestant": contestant,
        "handicap": handicap,
        "period": period,
        "bet_type": 0,
        "team_select": 0,
        "is_alt": 0,
    }


def is_standard_market(params: Dict[str, Any]) -> bool:
    """Проверяет, является ли исход стандартным betType PS3838 (проверяемым через числовой oddsId)."""
    return params.get("market") == "standard"


def build_odds_id(event_id: int, period: int, bet_type: int, team_select: int, is_alt: int, handicap: float) -> str:
    """Формирует строку oddsId для PS3838 betslip."""
    return f"{event_id}|{period}|{bet_type}|{team_select}|{is_alt}|{handicap}"
