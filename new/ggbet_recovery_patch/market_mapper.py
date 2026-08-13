"""
GGBet market type mappings.
Maps GGBet typeId -> analyzer format fields.
"""

# GGBet sport ID -> analyzer sport name
SPORT_MAP = {
    "football": "Soccer",
    "basketball": "Basketball",
    "tennis": "Tennis",
    "volleyball": "Volleyball",
    "ice_hockey": "Hockey",
    "handball": "Handball",
    "esports_counter_strike": "ESports",
    "esports_dota_2": "ESports",
    "esports_league_of_legends": "ESports",
    "esports_valorant": "ESports",
    "esports_call_of_duty": "ESports",
    "esports_overwatch": "ESports",
    "esports_starcraft": "ESports",
    "esports_king_of_glory": "ESports",
    "esports_rainbow_six": "ESports",
    "esports_rocket_league": "ESports",
    "table_tennis": "TableTennis",
    "american_football": "AmericanFootball",
    "baseball": "Baseball",
    "beach_volleyball": "Volleyball",
    "futsal": "Soccer",
    "indoor_soccer": "Soccer",
    "esports_basketball": "ESports",
    "esports_fifa": "ESports",
    "esports_soccer_mythical": "ESports",
    "mma": "MMA",
    "boxing": "Boxing",
    "cricket": "Cricket",
}

# Target sports we care about
TARGET_SPORTS = [
    "football", "basketball", "tennis", "volleyball",
    "ice_hockey", "handball",
    "esports_counter_strike", "esports_dota_2", "esports_league_of_legends",
    "esports_valorant", "esports_call_of_duty",
    "table_tennis",
    "esports_basketball", "esports_fifa", "esports_soccer_mythical",
]

# GGBet actual market typeIds (verified from live API)
# typeId -> handler identifier
MARKET_TYPE_MAP = {
    # === Main markets (football/hockey/handball) ===
    20: "win1x2",             # 1x2 (3-way)
    240: "handicap",          # Asian Handicap
    831: "handicap",          # Asian handicap (alt typeId)
    398: "total",             # Total (Over/Under)
    830: "total",             # Asian total (alt typeId)

    # === 2-way winner ===
    1: "winner",              # Winner (2-way, tennis/esports/basketball)
    186: "winner",            # Winner (alternative)

    # === Team totals ===
    399: "first_team_total",  # Home total
    400: "second_team_total", # Away total

    # === Double Chance, DNB ===
    42: "double_chance",      # Double chance
    208: "double_chance",     # Double chance (alt typeId)
    236: "draw_no_bet",       # Draw no bet
    204: "draw_no_bet",       # Draw no bet (alt typeId)

    # === BTTS ===
    72: "btts",               # Both teams to score
    201: "btts",              # Both teams to score (alt typeId)

    # === Odd/Even ===
    238: "odd_even",          # Odd/Even
    239: "odd_even",          # Odd/Even (alt typeId)
    292: "odd_even",          # Odd/Even maps (esports)

    # === Correct Score ===
    258: "correct_score",     # Correct score
    296: "correct_score",     # Correct score (alt typeId)

    # === Half/Period markets ===
    68: "win1x2_half",        # 1st Half 1x2
    453: "win1x2_half",       # 1st Half 1x2 (alt typeId)
    241: "handicap_half",     # 1st Half Handicap
    444: "handicap_half",     # 1st Half Handicap (alt typeId)
    401: "total_half",        # 1st Half Total
    445: "total_half",        # 1st Half Total (alt typeId)
    463: "dc_half",           # 1st Half Double Chance
    464: "dnb_half",          # 1st Half Draw No Bet
    508: "btts_half",         # 1st Half BTTS
    512: "odd_even_half",     # 1st Half Odd/Even
    603: "correct_score_half", # 1st Half Correct Score
    446: "first_team_total_half",  # 1st Half Home total
    447: "second_team_total_half", # 1st Half Away total

    # === Half-time / Full-time ===
    490: "htft",              # HT/FT

    # === Sets/Maps ===
    14: "total_maps",         # Total maps/sets
    17: "handicap_maps",      # Handicap maps/sets
    50: "map_winner",         # Map N - Winner
    27: "map_event_winner",   # Map N - Event winner
    96: "map_odd_even",       # Map N - Odd/Even

    # === Tennis/Volleyball ===
    302: "sets_total",        # Sets total
    303: "sets_handicap",     # Sets handicap
    304: "exact_sets",        # Exact set score
    300: "games_total",       # Games total
    301: "games_handicap",    # Games handicap

    # === Basketball ===
    410: "quarter_winner",    # Quarter winner
    411: "quarter_total",     # Quarter total
    412: "quarter_handicap",  # Quarter handicap

    # === Hockey ===
    405: "period_total_team", # Period team total

    # === Corners ===
    685: "corners_total",           # Corners Total
    687: "corners_handicap",        # Corners Handicap
    689: "corners_first_team_total",  # Corners Home total
    690: "corners_second_team_total", # Corners Away total

    # === Bookings/Cards ===
    672: "bookings_total",            # Yellow cards Total
    674: "bookings_handicap",         # Yellow cards Handicap
    676: "bookings_first_team_total", # Yellow cards Home total
    677: "bookings_second_team_total", # Yellow cards Away total

    # === Next goal ===
    356: "next_goal",         # Next goal

    # === Team odd/even ===
    504: "home_odd_even",     # Home Odd/Even
    505: "away_odd_even",     # Away Odd/Even

    # === Exact total goals (N-way) ===
    565: "total_3way",        # Total goals (3 way) - maps to ExactTotalGoals
    568: "total_5way",        # Total goals (5 way) - maps to ExactTotalGoals
    569: "total_6way",        # Total goals (6 way) - maps to ExactTotalGoals

    # === To qualify ===
    249: "to_qualify",        # To qualify
}


def get_specifier(market: dict, name: str) -> str:
    """Extract specifier value from market"""
    for spec in market.get("specifiers", []):
        if spec.get("name") == name:
            return spec.get("value", "")
    return ""


def get_period_from_market(market: dict) -> int:
    """Determine period number from market specifiers/tags"""
    period_spec = get_specifier(market, "period")
    if period_spec:
        try:
            return int(period_spec)
        except ValueError:
            pass

    halfnr_spec = get_specifier(market, "halfnr")
    if halfnr_spec:
        try:
            return int(halfnr_spec)
        except ValueError:
            pass

    half_spec = get_specifier(market, "half")
    if half_spec:
        try:
            return int(half_spec)
        except ValueError:
            pass

    quarter_spec = get_specifier(market, "quarter")
    if quarter_spec:
        try:
            return int(quarter_spec)
        except ValueError:
            pass

    set_spec = get_specifier(market, "set")
    if set_spec:
        try:
            return int(set_spec)
        except ValueError:
            pass

    map_spec = get_specifier(market, "map") or get_specifier(market, "mapnr")
    if map_spec:
        try:
            return int(map_spec)
        except ValueError:
            pass

    return 0  # Full match


def parse_odds_value(value_str) -> float:
    """Parse odds value from string to float"""
    try:
        return float(value_str)
    except (ValueError, TypeError):
        return 0.0


def get_competitor_side(odd: dict, competitors: list) -> str:
    """Determine if odd is for home or away team"""
    comp_ids = odd.get("competitorIds", [])
    if not comp_ids or not competitors:
        return "unknown"
    odd_comp_id = comp_ids[0] if comp_ids else ""
    for comp in competitors:
        if comp.get("id") == odd_comp_id:
            return comp.get("homeAway", "unknown").lower()
    return "unknown"


def build_empty_period():
    return {}


def transform_event_to_analyzer(event: dict, source: str = "GGBet") -> dict:
    """Transform GGBet sport event to analyzer format"""
    fixture = event.get("fixture", {})
    competitors = fixture.get("competitors", [])
    sport_id = fixture.get("sportId", "")
    sport_name = SPORT_MAP.get(sport_id, "")

    if not sport_name:
        return None

    home_name = ""
    away_name = ""
    for comp in competitors:
        ha = comp.get("homeAway", "")
        if ha == "HOME":
            home_name = comp.get("name", "")
        elif ha == "AWAY":
            away_name = comp.get("name", "")

    if not home_name or not away_name:
        return None

    # Parse score
    score_str = fixture.get("score", "0:0")
    home_score = 0.0
    away_score = 0.0
    if score_str and ":" in score_str:
        parts = score_str.split(":")
        try:
            home_score = float(parts[0])
            away_score = float(parts[1])
        except (ValueError, IndexError):
            pass

    # Event ID
    event_id = event.get("id", "")
    raw_id = event_id.replace("13:", "")

    # Is live
    status = fixture.get("status", "")
    is_live = status in ("LIVE", "SUSPENDED")

    # Start time
    start_time = fixture.get("startTime", "")
    start_at = 0
    if start_time:
        from datetime import datetime, timezone
        try:
            dt = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
            start_at = int(dt.timestamp())
        except:
            pass

    # Tournament
    tournament = fixture.get("tournament", {})
    league_name = tournament.get("name", "").lower()
    country = tournament.get("countryCode", "")

    # Parse markets into periods
    periods = {}
    markets = event.get("markets", [])

    for market in markets:
        if market.get("status") not in ("ACTIVE", "SUSPENDED"):
            continue

        type_id = market.get("typeId", 0)
        odds = market.get("odds", [])

        if not odds:
            continue

        period_num = get_period_from_market(market)
        handler = MARKET_TYPE_MAP.get(type_id, "")
        # TypeIds that are inherently half-time markets (no specifier needed)
        HALF_HANDLERS = {"correct_score_half", "win1x2_half", "total_half", "first_team_total_half",
                         "second_team_total_half", "handicap_half", "dc_half", "dnb_half", "btts_half", "odd_even_half"}
        if handler in HALF_HANDLERS and period_num == 0:
            period_num = 1
        if period_num not in periods:
            periods[period_num] = {}
        period = periods[period_num]

        _map_market_to_period(type_id, market, odds, period, competitors, sport_name)

    # Build periods array
    max_period = max(periods.keys()) if periods else 0
    periods_array = []
    for i in range(max_period + 1):
        periods_array.append(periods.get(i, {}))

    if not periods_array:
        periods_array = [{}]

    # CreatedAt
    from datetime import datetime, timezone
    created_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

    # Generate stable Pid from event_id
    import hashlib
    pid_hash = hashlib.md5(raw_id.encode()).hexdigest()
    pid = int(pid_hash[:6], 16) % 1000000

    result = {
        "Source": source,
        "Pid": pid,
        "SportName": sport_name,
        "LeagueName": league_name,
        "homeName": home_name,
        "awayName": away_name,
        "MatchId": raw_id,
        "isLive": is_live,
        "matchDate": start_time if start_time else "",
        "Country": country,
        "HomeScore": home_score,
        "AwayScore": away_score,
        "HasScore": is_live,
        "CreatedAt": created_at,
        "Periods": periods_array,
    }

    return result


def _map_market_to_period(type_id: int, market: dict, odds: list, period: dict, competitors: list, sport_name: str = ""):
    """Map a single market to the period dict"""
    handler = MARKET_TYPE_MAP.get(type_id)
    if not handler:
        return

    # Sports where 3-way 1x2 is the standard market (draw is normal)
    THREE_WAY_SPORTS = {"Soccer", "Handball"}

    # === 1x2 (3-way) ===
    if handler in ("win1x2", "win1x2_half"):
        has_draw = any(
            not o.get("competitorIds") and o.get("isActive")
            for o in odds
        )
        # Skip 3-way 1x2 for sports where moneyline (2-way) is standard
        if has_draw and sport_name not in THREE_WAY_SPORTS:
            return
        win1x2 = {}
        for o in odds:
            if not o.get("isActive"):
                continue
            val = parse_odds_value(o.get("value"))
            if val <= 1.0:
                continue
            side = get_competitor_side(o, competitors)
            name_lower = o.get("name", "").lower()
            if side == "home":
                win1x2["Win1"] = {"value": val}
            elif side == "away":
                win1x2["Win2"] = {"value": val}
            elif "draw" in name_lower or "нічия" in name_lower:
                win1x2["WinNone"] = {"value": val}
            elif not o.get("competitorIds"):
                win1x2["WinNone"] = {"value": val}
        if win1x2:
            period["Win1x2"] = win1x2

    # === Winner 2-way ===
    elif handler in ("winner", "map_winner", "map_event_winner", "quarter_winner"):
        w = {}
        for o in odds:
            if not o.get("isActive"):
                continue
            val = parse_odds_value(o.get("value"))
            if val <= 1.0:
                continue
            side = get_competitor_side(o, competitors)
            if side == "home":
                w["Win1"] = {"value": val}
            elif side == "away":
                w["Win2"] = {"value": val}
        if w:
            period["Win1x2"] = w

    # === Handicap (all types) ===
    elif handler in ("handicap", "handicap_half", "handicap_maps",
                     "games_handicap", "quarter_handicap"):
        hcp_value = get_specifier(market, "hcp")
        if not hcp_value:
            return
        field = "Handicap"
        if handler == "games_handicap":
            field = "GamesHandicap"
        if field not in period:
            period[field] = {}
        results = _parse_handicap_odds(odds, competitors, hcp_value)
        for partial_entry, key in results:
            if key in period[field]:
                period[field][key].update(partial_entry)
            else:
                period[field][key] = partial_entry
    elif handler in ("total", "total_half", "total_maps",
                     "games_total", "quarter_total"):
        total_value = get_specifier(market, "total")
        if not total_value:
            return
        field = "Totals"
        if handler == "games_total":
            field = "GamesTotal"
        if field not in period:
            period[field] = {}
        total_entry = _parse_over_under_odds(odds)
        if total_entry:
            period[field][total_value] = total_entry

    # === Team totals ===
    elif handler in ("first_team_total", "second_team_total",
                     "first_team_total_half", "second_team_total_half",
                     "period_total_team"):
        total_value = get_specifier(market, "total")
        if not total_value:
            return
        field = "FirstTeamTotals" if "first" in handler or type_id in (399, 405, 446) else "SecondTeamTotals"
        comp_spec = get_specifier(market, "competitor")
        if comp_spec == "2":
            field = "SecondTeamTotals"
        elif comp_spec == "1":
            field = "FirstTeamTotals"
        if field not in period:
            period[field] = {}
        total_entry = _parse_over_under_odds(odds)
        if total_entry:
            period[field][total_value] = total_entry

    # === Sets total ===
    elif handler == "sets_total":
        total_value = get_specifier(market, "total")
        if not total_value:
            return
        if "SetsTotal" not in period:
            period["SetsTotal"] = {}
        total_entry = _parse_over_under_odds(odds)
        if total_entry:
            period["SetsTotal"][total_value] = total_entry

    # === Sets handicap ===
    elif handler in ("sets_handicap",):
        hcp_value = get_specifier(market, "hcp")
        if not hcp_value:
            return
        if "SetsHandicap" not in period:
            period["SetsHandicap"] = {}
        results = _parse_handicap_odds(odds, competitors, hcp_value)
        for partial_entry, key in results:
            if key in period["SetsHandicap"]:
                period["SetsHandicap"][key].update(partial_entry)
            else:
                period["SetsHandicap"][key] = partial_entry

    # === Double Chance ===
    elif handler in ("double_chance", "dc_half"):
        dc = {}
        home_name = ""
        away_name = ""
        for comp in competitors:
            ha = comp.get("homeAway", "").upper()
            if ha == "HOME":
                home_name = comp.get("name", "").lower()
            elif ha == "AWAY":
                away_name = comp.get("name", "").lower()
        for o in odds:
            if not o.get("isActive"):
                continue
            val = parse_odds_value(o.get("value"))
            if val <= 1.0:
                continue
            name_lower = o.get("name", "").lower()
            has_home = home_name and home_name in name_lower
            has_away = away_name and away_name in name_lower
            has_draw = "draw" in name_lower or "нічия" in name_lower or "ничья" in name_lower
            if has_home and has_away and not has_draw:
                dc["W12"] = {"value": val}
            elif has_home and has_draw and not has_away:
                dc["W1X"] = {"value": val}
            elif has_away and has_draw and not has_home:
                dc["WX2"] = {"value": val}
            elif has_home and not has_away:
                dc["W1X"] = {"value": val}
            elif has_away and not has_home:
                dc["WX2"] = {"value": val}
        if dc:
            period["DoubleChance"] = dc

    # === Draw No Bet ===
    elif handler in ("draw_no_bet", "dnb_half"):
        dnb = {}
        for o in odds:
            if not o.get("isActive"):
                continue
            val = parse_odds_value(o.get("value"))
            if val <= 1.0:
                continue
            side = get_competitor_side(o, competitors)
            if side == "home":
                dnb["Home"] = {"value": val}
            elif side == "away":
                dnb["Away"] = {"value": val}
        if dnb:
            period["DrawNoBet"] = dnb

    # === To Qualify ===
    elif handler == "to_qualify":
        tq = {}
        for o in odds:
            if not o.get("isActive"):
                continue
            val = parse_odds_value(o.get("value"))
            if val <= 1.0:
                continue
            side = get_competitor_side(o, competitors)
            if side == "home":
                tq["Home"] = {"value": val}
            elif side == "away":
                tq["Away"] = {"value": val}
        if tq:
            period["ToQualify"] = tq

    # === BTTS ===
    elif handler in ("btts", "btts_half"):
        btts = _parse_yes_no_odds(odds)
        if btts:
            period["BTTS"] = btts

    # === Odd/Even ===
    elif handler in ("odd_even", "odd_even_half", "map_odd_even"):
        oe = {}
        for o in odds:
            if not o.get("isActive"):
                continue
            val = parse_odds_value(o.get("value"))
            if val <= 1.0:
                continue
            name_lower = o.get("name", "").lower()
            oid = o.get("id", "")
            if oid == "1" or "odd" in name_lower or "непарн" in name_lower:
                oe["Yes"] = {"value": val}
            elif oid == "2" or "even" in name_lower or "парн" in name_lower:
                oe["No"] = {"value": val}
        if oe:
            period["OddEven"] = oe

    # === Home/Away Odd/Even ===
    elif handler == "home_odd_even":
        oe = {}
        for o in odds:
            if not o.get("isActive"):
                continue
            val = parse_odds_value(o.get("value"))
            if val <= 1.0:
                continue
            oid = o.get("id", "")
            if oid == "1":
                oe["Yes"] = {"value": val}
            elif oid == "2":
                oe["No"] = {"value": val}
        if oe:
            period["HomeOddEven"] = oe

    elif handler == "away_odd_even":
        oe = {}
        for o in odds:
            if not o.get("isActive"):
                continue
            val = parse_odds_value(o.get("value"))
            if val <= 1.0:
                continue
            oid = o.get("id", "")
            if oid == "1":
                oe["Yes"] = {"value": val}
            elif oid == "2":
                oe["No"] = {"value": val}
        if oe:
            period["AwayOddEven"] = oe

    # === Correct Score ===
    elif handler in ("correct_score", "correct_score_half"):
        import re
        cs = {}
        for o in odds:
            if not o.get("isActive"):
                continue
            val = parse_odds_value(o.get("value"))
            if val <= 1.0:
                continue
            name = o.get("name", "")
            m = re.search(r'(\d+)\s*[:\-]\s*(\d+)', name)
            if m:
                score_key = f"{m.group(1)}:{m.group(2)}"
                cs[score_key] = {"value": val}
        if cs:
            period["CorrectScore"] = cs

    # === Exact Sets ===
    elif handler == "exact_sets":
        import re
        es = {}
        for o in odds:
            if not o.get("isActive"):
                continue
            val = parse_odds_value(o.get("value"))
            if val <= 1.0:
                continue
            name = o.get("name", "")
            m = re.search(r'(\d+)\s*[:\-]\s*(\d+)', name)
            if m:
                es[f"{m.group(1)}:{m.group(2)}"] = {"value": val}
        if es:
            period["ExactSets"] = es

    # === HT/FT ===
    elif handler == "htft":
        import re
        htft = {}
        for o in odds:
            if not o.get("isActive"):
                continue
            val = parse_odds_value(o.get("value"))
            if val <= 1.0:
                continue
            name = o.get("name", "").strip()
            # Parse "1/1", "1/X", "X/2" etc.
            m = re.match(r'([1X2])\s*/\s*([1X2])', name, re.IGNORECASE)
            if m:
                key = f"{m.group(1).upper()}/{m.group(2).upper()}"
                htft[key] = {"value": val}
        if htft:
            period["HalfTimeFullTime"] = htft

    # === Corners Total ===
    elif handler == "corners_total":
        total_value = get_specifier(market, "total")
        if not total_value:
            return
        if "CornersTotal" not in period:
            period["CornersTotal"] = {}
        total_entry = _parse_over_under_odds(odds)
        if total_entry:
            period["CornersTotal"][total_value] = total_entry

    # === Corners Handicap ===
    elif handler == "corners_handicap":
        hcp_value = get_specifier(market, "hcp")
        if not hcp_value:
            return
        if "CornersHandicap" not in period:
            period["CornersHandicap"] = {}
        results = _parse_handicap_odds(odds, competitors, hcp_value)
        for partial_entry, key in results:
            if key in period["CornersHandicap"]:
                period["CornersHandicap"][key].update(partial_entry)
            else:
                period["CornersHandicap"][key] = partial_entry

    # === Corners Team Totals ===
    elif handler == "corners_first_team_total":
        total_value = get_specifier(market, "total")
        if not total_value:
            return
        if "CornersFirstTeamTotal" not in period:
            period["CornersFirstTeamTotal"] = {}
        total_entry = _parse_over_under_odds(odds)
        if total_entry:
            period["CornersFirstTeamTotal"][total_value] = total_entry

    elif handler == "corners_second_team_total":
        total_value = get_specifier(market, "total")
        if not total_value:
            return
        if "CornersSecondTeamTotal" not in period:
            period["CornersSecondTeamTotal"] = {}
        total_entry = _parse_over_under_odds(odds)
        if total_entry:
            period["CornersSecondTeamTotal"][total_value] = total_entry

    # === Bookings/Cards Total ===
    elif handler == "bookings_total":
        total_value = get_specifier(market, "total")
        if not total_value:
            return
        if "BookingsTotal" not in period:
            period["BookingsTotal"] = {}
        total_entry = _parse_over_under_odds(odds)
        if total_entry:
            period["BookingsTotal"][total_value] = total_entry

    # === Bookings/Cards Handicap ===
    elif handler == "bookings_handicap":
        hcp_value = get_specifier(market, "hcp")
        if not hcp_value:
            return
        if "BookingsHandicap" not in period:
            period["BookingsHandicap"] = {}
        results = _parse_handicap_odds(odds, competitors, hcp_value)
        for partial_entry, key in results:
            if key in period["BookingsHandicap"]:
                period["BookingsHandicap"][key].update(partial_entry)
            else:
                period["BookingsHandicap"][key] = partial_entry

    # === Bookings Team Totals ===
    elif handler == "bookings_first_team_total":
        total_value = get_specifier(market, "total")
        if not total_value:
            return
        if "BookingsFirstTeamTotal" not in period:
            period["BookingsFirstTeamTotal"] = {}
        total_entry = _parse_over_under_odds(odds)
        if total_entry:
            period["BookingsFirstTeamTotal"][total_value] = total_entry

    elif handler == "bookings_second_team_total":
        total_value = get_specifier(market, "total")
        if not total_value:
            return
        if "BookingsSecondTeamTotal" not in period:
            period["BookingsSecondTeamTotal"] = {}
        total_entry = _parse_over_under_odds(odds)
        if total_entry:
            period["BookingsSecondTeamTotal"][total_value] = total_entry

    # === Exact Total Goals (N-way) → ExactTotalGoals ===
    elif handler in ("total_3way", "total_5way", "total_6way"):
        if "ExactTotalGoals" not in period:
            period["ExactTotalGoals"] = {}
        for o in odds:
            if not o.get("isActive"):
                continue
            val = parse_odds_value(o.get("value"))
            if val <= 1.0:
                continue
            name = o.get("name", "").strip()
            # "0", "1", "2", "3", "4+", "2+", "over 2", etc.
            key = name.replace("+", "+").strip()
            if key:
                period["ExactTotalGoals"][key] = {"value": val}

    # === Next Goal ===
    elif handler == "next_goal":
        pass  # Not supported by analyzer struct


def _parse_two_way_odds(odds: list, competitors: list) -> dict:
    """Parse handicap-style two-way odds (Win1/Win2) using competitorIds"""
    entry = {}
    for o in odds:
        if not o.get("isActive"):
            continue
        val = parse_odds_value(o.get("value"))
        if val <= 1.0:
            continue
        side = get_competitor_side(o, competitors)
        if side == "home":
            entry["Win1"] = {"value": val}
        elif side == "away":
            entry["Win2"] = {"value": val}
    return entry


def _parse_handicap_odds(odds: list, competitors: list, hcp_value: str):
    """Parse handicap odds and return list of (partial_entry, key) tuples.
    GGBet stores complementary handicap values (e.g., home -1.5 and away +1.5) in the same market.
    The analyzer expects Win1 and Win2 at the same key to represent the SAME handicap direction.
    So we split: home value goes to home's key as Win1, away value goes to away's key as Win2.
    """
    import re
    home_val = None
    away_val = None
    home_hcp = None
    away_hcp = None
    for o in odds:
        if not o.get("isActive"):
            continue
        val = parse_odds_value(o.get("value"))
        if val <= 1.0:
            continue
        side = get_competitor_side(o, competitors)
        name = o.get("name", "")
        m = re.search(r'[(\s]([+-]?\d+\.?\d*)\)?', name)
        if side == "home":
            home_val = val
            if m:
                home_hcp = float(m.group(1))
        elif side == "away":
            away_val = val
            if m:
                away_hcp = float(m.group(1))

    results = []
    if home_val is not None and home_hcp is not None:
        key = _format_hcp(home_hcp)
        results.append(({"Win1": {"value": home_val}}, key))
    if away_val is not None and away_hcp is not None:
        key = _format_hcp(away_hcp)
        results.append(({"Win2": {"value": away_val}}, key))

    # Fallback: if we couldn't extract handicap from names, use hcp_value as before
    if not results:
        entry = {}
        for o in odds:
            if not o.get("isActive"):
                continue
            val = parse_odds_value(o.get("value"))
            if val <= 1.0:
                continue
            side = get_competitor_side(o, competitors)
            if side == "home":
                entry["Win1"] = {"value": val}
            elif side == "away":
                entry["Win2"] = {"value": val}
        if entry:
            results.append((entry, hcp_value))

    return results


def _format_hcp(h: float) -> str:
    """Format handicap value consistently: -1.5, 0.0, 2.0, -0.5 etc."""
    if h == int(h):
        return f"{int(h)}.0"
    return f"{h:g}"


def _parse_over_under_odds(odds: list) -> dict:
    """Parse over/under (total-style) odds"""
    entry = {}
    for o in odds:
        if not o.get("isActive"):
            continue
        val = parse_odds_value(o.get("value"))
        if val <= 1.0:
            continue
        name_lower = o.get("name", "").lower()
        oid = o.get("id", "")
        if oid == "1" or "over" in name_lower or "більше" in name_lower or "бол" in name_lower:
            entry["WinMore"] = {"value": val}
        elif oid == "2" or "under" in name_lower or "менше" in name_lower or "мен" in name_lower:
            entry["WinLess"] = {"value": val}
    return entry


def _parse_yes_no_odds(odds: list) -> dict:
    """Parse yes/no odds"""
    entry = {}
    for o in odds:
        if not o.get("isActive"):
            continue
        val = parse_odds_value(o.get("value"))
        if val <= 1.0:
            continue
        name_lower = o.get("name", "").lower()
        oid = o.get("id", "")
        if oid == "1" or "yes" in name_lower or "так" in name_lower:
            entry["Yes"] = {"value": val}
        elif oid == "2" or "no" in name_lower or "ні" in name_lower:
            entry["No"] = {"value": val}
    return entry
