"""
Парсеры видов спорта PS3838 — функции парсинга событий для каждого вида спорта.
"""

import orjson
from typing import Any, Dict, List

from parsing.helpers import make_odd, float_to_line, ensure_map, ps3838_raw
from parsing.normalizers import base_team_key
from parsing.parser_utils import (
    extract_moneyline_values,
    ensure_base_maps,
    ensure_winhandicap,
    set_win1x2,
    new_period,
    parse_total_fields,
    _extract_total_line_id,
    _extract_ml_line_id,
    build_game_data,
    iter_periods,
    _remap_mb_period_data,
    parse_moneyline,
    parse_totals_into,
    parse_spreads_into,
    parse_team_totals_into,
    map_tennis_period,
    to_float,
)


def _has_positive_odd(value: Any) -> bool:
    try:
        return float(value) > 0.0
    except Exception:
        return False


def _tennis_period_has_live_prices(period_data: List[Any]) -> bool:
    status, ml = parse_moneyline(period_data)
    _ = status
    if ml and len(ml) >= 2:
        home_price, away_price, draw_price = extract_moneyline_values(ml)
        if home_price > 0.0 or away_price > 0.0 or draw_price > 0.0:
            return True

    if len(period_data) > 1 and isinstance(period_data[1], list):
        for total in period_data[1]:
            if not isinstance(total, list) or len(total) < 3:
                continue
            points, over_price, under_price = parse_total_fields(total)
            if points > 0.0 and (over_price > 0.0 or under_price > 0.0):
                return True

    if len(period_data) > 0 and isinstance(period_data[0], list):
        spreads = period_data[0]
        if spreads and isinstance(spreads[0], list) and spreads[0] and isinstance(spreads[0][0], list):
            return False
        for spread in spreads:
            if not isinstance(spread, list) or len(spread) < 3:
                continue
            if len(spread) >= 5 and isinstance(spread[2], str):
                if _has_positive_odd(spread[3]) or _has_positive_odd(spread[4]):
                    return True
            elif _has_positive_odd(spread[1]) or _has_positive_odd(spread[2]):
                return True

    return False


def _grouped_market_touch_seq(ev: Dict[str, Any], raw_period_num: int, market_key: str) -> int:
    touches = ev.get("_market_touch_seq")
    if isinstance(touches, dict):
        fallbacks = [market_key]
        if market_key == "SetsHandicap":
            fallbacks.append("Handicap")
        elif market_key == "SetsTotal":
            fallbacks.append("Totals")
        for candidate in fallbacks:
            touch_seq = touches.get(f"{int(raw_period_num)}:{candidate}")
            if isinstance(touch_seq, (int, float)) and int(touch_seq) > 0:
                return int(touch_seq)
    for fallback_key in ("_touch_seq", "_source_seq"):
        value = ev.get(fallback_key)
        if isinstance(value, (int, float)) and int(value) > 0:
            return int(value)
    return 0


def _grouped_market_seq_map(period: Dict[str, Any]) -> Dict[str, int]:
    seq_map = period.get("_grouped_market_touch_seq")
    if not isinstance(seq_map, dict):
        seq_map = {}
        period["_grouped_market_touch_seq"] = seq_map
    return seq_map


def _commit_grouped_market(period: Dict[str, Any], source_period: Dict[str, Any], market_key: str, ev: Dict[str, Any], raw_period_num: int) -> None:
    value = source_period.get(market_key)
    if value in (None, {}, []):
        return
    # Win1x2 is initialised with all-zero placeholders by new_period(); skip
    # the commit when no real prices were written so a child sub-event with
    # only spreads/totals does not overwrite the parent's moneyline.
    if market_key == "Win1x2" and isinstance(value, dict):
        has_price = False
        for side_key in ("Win1", "Win2", "WinNone"):
            side = value.get(side_key)
            if isinstance(side, dict) and to_float(side.get("value")) > 0:
                has_price = True
                break
        if not has_price:
            return
    touch_seq = _grouped_market_touch_seq(ev, raw_period_num, market_key)
    seq_map = _grouped_market_seq_map(period)
    current_seq = int(seq_map.get(market_key, 0) or 0)
    if touch_seq < current_seq:
        return
    period[market_key] = orjson.loads(orjson.dumps(value))
    seq_map[market_key] = touch_seq


def _commit_grouped_games(period: Dict[str, Any], source_period: Dict[str, Any], ev: Dict[str, Any], raw_period_num: int) -> None:
    source_games = source_period.get("Games")
    if not isinstance(source_games, dict) or not source_games:
        return
    target_games = ensure_map(period, "Games")
    seq_map = _grouped_market_seq_map(period)
    touch_seq = _grouped_market_touch_seq(ev, raw_period_num, "Games")
    for game_key, game_entry in source_games.items():
        map_key = f"Games:{game_key}"
        current_seq = int(seq_map.get(map_key, 0) or 0)
        if touch_seq < current_seq:
            continue
        target_games[game_key] = orjson.loads(orjson.dumps(game_entry))
        seq_map[map_key] = touch_seq


def _grouped_event_sort_key(ev: Dict[str, Any]) -> tuple:
    parent_id = int(ev.get("parent_id") or ev.get("event_id") or 0)
    event_id = int(ev.get("event_id") or 0)
    event_type = str(ev.get("event_type") or "").lower()
    home_name = str(ev.get("home_name") or "").lower()
    is_child = int(parent_id > 0 and event_id > 0 and parent_id != event_id)
    is_special_child = int(
        "games" in event_type
        or "games" in home_name
        or "points" in event_type
        or "(points)" in home_name
        or "kills" in event_type
        or "kills" in home_name
    )
    source_seq = int(ev.get("_source_seq", 0) or 0)
    return (parent_id, source_seq, is_child, is_special_child, event_id)

def parse_soccer_events(events: List[Dict[str, Any]], is_live: bool) -> Dict[int, Dict[str, Any]]:
    """Парсинг футбольных событий PS3838 в формат GameData."""
    results: Dict[int, Dict[str, Any]] = {}
    regular_events: Dict[int, Dict[str, Any]] = {}
    name_to_id: Dict[str, int] = {}

    for ev in events:
        home_lower = (ev["home_name"] or "").lower()
        if "(corners)" in home_lower or "(bookings)" in home_lower:
            continue
        parent_id = ev["parent_id"] or ev["event_id"]
        current = regular_events.get(parent_id)
        if current is None:
            regular_events[parent_id] = ev
        elif current.get("is_extra") and not ev.get("is_extra"):
            regular_events[parent_id] = ev
        elif not current.get("is_extra") and ev.get("is_extra"):
            continue
        else:
            regular_events[parent_id] = ev
        key = f"{base_team_key(ev['home_name'])} vs {base_team_key(ev['away_name'])}"
        name_to_id[key] = parent_id

    for ev in events:
        home_lower = (ev["home_name"] or "").lower()
        is_corners = "(corners)" in home_lower
        is_bookings = "(bookings)" in home_lower
        is_regular = not is_corners and not is_bookings

        parent_id = ev["parent_id"] or ev["event_id"]
        if not is_regular and parent_id not in regular_events:
            key = f"{base_team_key(ev['home_name'])} vs {base_team_key(ev['away_name'])}"
            parent_id = name_to_id.get(key, ev["event_id"])

        parent_event = regular_events.get(parent_id, ev)
        if parent_id not in results:
            game = build_game_data(parent_event, "Soccer", 3, is_live, set_scores=True, pid=parent_id)
            results[parent_id] = game
        game = results[parent_id]

        # Merge child event odds_block into Raw for lineId resolution
        raw_odds = game["Raw"].setdefault("odds_block", {})
        period_event_ids = game["Raw"].setdefault("period_event_ids", {})
        for pk, pv in ev.get("odds_block", {}).items():
            raw_key = pk
            if is_corners:
                raw_key = f"corners_{pk}"
            elif is_bookings:
                raw_key = f"bookings_{pk}"
            if raw_key not in raw_odds or (is_regular and not ev.get("is_extra")):
                raw_odds[raw_key] = orjson.loads(orjson.dumps(pv))
            period_event_ids[raw_key] = ev["event_id"]

        for period_num, period_data in iter_periods(ev["odds_block"]):
            # Pinnacle Soccer Period Mapping (live WS + REST API):
            # 0: Full Match
            # 1: 1st Half (main data block — Win1x2, Totals, Handicap)
            # 2: 2nd Half
            # 8: To Qualify — match winner including OT + penalties (2-way, no draw)
            # Evidence: Pinnacle period_num=1 odds match Volcano/Sansabet P1 (1st Half)
            if period_num == 0:
                target_period = 0
            elif period_num == 1:
                target_period = 1
            elif period_num == 8:
                target_period = 0
            elif period_num == 2:
                target_period = 2
            else:
                continue

            is_ws_child_layout = bool(
                period_data
                and isinstance(period_data[0], list)
                and period_data[0]
                and not isinstance(period_data[0][0], list)
            )
            
            if is_corners and target_period < len(game["Periods"]):
                if is_ws_child_layout and period_data[0] is not None:
                    # btg=4: team totals in [0] as nested [[home], [away], ...]
                    # Wrap in single-element list so parse_team_totals_into uses
                    # the nested extra-line path instead of standard [3]/[4].
                    parse_team_totals_into(game["Periods"][target_period], [period_data[0]], "CornersFirstTeamTotal", "CornersSecondTeamTotal", event_id=ev.get("event_id", 0), ps_period=period_num)
                elif not is_ws_child_layout:
                    parse_team_totals_into(game["Periods"][target_period], period_data, "CornersFirstTeamTotal", "CornersSecondTeamTotal", event_id=ev.get("event_id", 0), ps_period=period_num)
            elif is_bookings and target_period < len(game["Periods"]):
                if is_ws_child_layout and period_data[0] is not None:
                    parse_team_totals_into(game["Periods"][target_period], [period_data[0]], "BookingsFirstTeamTotal", "BookingsSecondTeamTotal", event_id=ev.get("event_id", 0), ps_period=period_num)
                elif not is_ws_child_layout:
                    parse_team_totals_into(game["Periods"][target_period], period_data, "BookingsFirstTeamTotal", "BookingsSecondTeamTotal", event_id=ev.get("event_id", 0), ps_period=period_num)

            if ev.get("is_extra"):
                period_data = _remap_mb_period_data(period_data)
            status, ml = parse_moneyline(period_data)
            # Skip closed/suspended periods (status != 1) to avoid stale odds.
            # Extra e-key events can report status=0 for open markets, so those
            # payloads keep the relaxed guard below.
            if status is not None and status != 1 and is_regular and not ev.get("is_extra"):
                continue
            if target_period >= len(game["Periods"]):
                continue
            
            period = game["Periods"][target_period]

            if is_regular:
                ensure_base_maps(period)
                if target_period == 0:
                    game["HomeScore"] = ev["home_score"]
                    game["AwayScore"] = ev["away_score"]
                
                if ml and len(ml) >= 2:
                    home_price, away_price, draw_price = extract_moneyline_values(ml)
                    if home_price != 0.0 or away_price != 0.0 or draw_price != 0.0:
                        if draw_price == 0.0 and (home_price != 0.0 or away_price != 0.0):
                            # No-draw market.
                            # Period 8 moneyline may have [favorite, underdog] order
                            # instead of [away, home]. Validate against Win1x2 if available.
                            actual_home, actual_away = home_price, away_price
                            if period_num == 8 and actual_home != 0 and actual_away != 0:
                                # Period 8 (To Qualify) ML may use [favorite, underdog] order.
                                # Determine real orientation from full-match Win1x2.
                                w1_val, w2_val = 0, 0
                                for src in (period, game["Periods"][0]):
                                    w1x2 = src.get("Win1x2", {})
                                    w1_val = (w1x2.get("Win1") or {}).get("value", 0)
                                    w2_val = (w1x2.get("Win2") or {}).get("value", 0)
                                    if w1_val > 0 and w2_val > 0:
                                        break
                                if w1_val > 0 and w2_val > 0 and abs(w1_val - w2_val) > 0.01:
                                    w1x2_home_fav = w1_val < w2_val
                                    dnb_home_fav = actual_home < actual_away
                                    if w1x2_home_fav != dnb_home_fav:
                                        actual_home, actual_away = actual_away, actual_home
                            if period_num == 8:
                                # Period 8 = "To Qualify" (match winner incl. OT + penalties).
                                # 2-way market, no draw. Store in period 0 as ToQualify.
                                tq = ensure_map(game["Periods"][0], "ToQualify")
                                if actual_home != 0.0:
                                    tq["Home"] = make_odd(actual_home, ps3838_raw(1, 0, 0, period_num))
                                if actual_away != 0.0:
                                    tq["Away"] = make_odd(actual_away, ps3838_raw(1, 1, 0, period_num))
                            else:
                                dnb = ensure_map(period, "DrawNoBet")
                                if actual_home != 0.0:
                                    dnb["Home"] = make_odd(actual_home, ps3838_raw(2, 0, 0, period_num))
                                if actual_away != 0.0:
                                    dnb["Away"] = make_odd(actual_away, ps3838_raw(2, 1, 0, period_num))
                            # Do NOT zero Win1x2 here — a different btg response
                            # (btg=2) may have already set the real 3-way odds.
                        else:
                            set_win1x2(period, home_price, away_price, draw_price,
                                       line_id=_extract_ml_line_id(ml), event_id=ev.get("event_id", 0), ps_period=period_num)
                
                # PS3838 soccer spreads come in the opposite sign orientation
                # from the betslip-facing home/away handicap labels. Keep the
                # raw price pairing, but mirror the sign so H1/H2 verify
                # against the same line ids on both live and prematch.
                parse_spreads_into(
                    period,
                    period_data,
                    "Handicap",
                    sign_is_home=False,
                    event_id=ev.get("event_id", 0),
                    ps_period=period_num,
                    home_score=float(ev.get("home_score") or 0.0),
                    away_score=float(ev.get("away_score") or 0.0),
                    score_relative=is_live,
                    score_relative_hdp_is_home_signed=False,
                )
                parse_totals_into(period, period_data, "Totals", event_id=ev.get("event_id", 0), ps_period=period_num)
                parse_team_totals_into(period, period_data, "FirstTeamTotals", "SecondTeamTotals", event_id=ev.get("event_id", 0), ps_period=period_num)
            elif is_corners:
                # Corners sub-events: [moneyline, None, spreads, totals, None, status, ...]
                # Standard parser expects [spreads, totals, ...] at positions [0], [1]
                cpd = period_data
                if is_ws_child_layout and len(cpd) > 3 and isinstance(cpd[2], list):
                    totals_val = cpd[3] if isinstance(cpd[3], list) else None
                    cpd = [cpd[2], totals_val] + list(cpd[4:])
                parse_totals_into(period, cpd, "CornersTotal", event_id=ev.get("event_id", 0), ps_period=period_num)
                parse_spreads_into(period, cpd, "CornersHandicap", sign_is_home=True, event_id=ev.get("event_id", 0), ps_period=period_num)
                # Team totals handled in pre-status path (above) — NOT here,
                # because btg=4 period_data[3] is CornersTotal, not team totals.
            elif is_bookings:
                # Bookings sub-events: same format as corners
                # [moneyline, None, spreads, totals, None, status, ...]
                bpd = period_data
                if is_ws_child_layout and len(bpd) > 3 and isinstance(bpd[2], list):
                    totals_val = bpd[3] if isinstance(bpd[3], list) else None
                    bpd = [bpd[2], totals_val] + list(bpd[4:])
                parse_totals_into(period, bpd, "BookingsTotal", event_id=ev.get("event_id", 0), ps_period=period_num)
                parse_spreads_into(period, bpd, "BookingsHandicap", sign_is_home=True, event_id=ev.get("event_id", 0), ps_period=period_num)
                # Team totals handled in pre-status path (above) — NOT here.

    return results


def parse_tennis_events(events: List[Dict[str, Any]], is_live: bool) -> Dict[int, Dict[str, Any]]:
    """Парсинг теннисных событий PS3838 в формат GameData (сеты, геймы)."""
    results: Dict[int, Dict[str, Any]] = {}
    parents: Dict[int, Dict[str, Any]] = {}
    ordered_events = sorted(events, key=_grouped_event_sort_key)
    for ev in ordered_events:
        parent_id = ev["parent_id"] or ev["event_id"]
        event_type = (ev.get("event_type") or "").lower()
        is_games_event = "games" in event_type or "games" in (ev["home_name"] or "").lower()
        if parent_id not in parents:
            parents[parent_id] = ev
        else:
            current_type = (parents[parent_id].get("event_type") or "").lower()
            current_is_games = "games" in current_type or "games" in (parents[parent_id]["home_name"] or "").lower()
            if current_is_games and not is_games_event:
                parents[parent_id] = ev

    for ev in ordered_events:
        parent_id = ev["parent_id"] or ev["event_id"]
        parent_event = parents.get(parent_id, ev)
        if parent_id not in results:
            game = build_game_data(parent_event, "Tennis", 6, is_live, set_scores=True, pid=parent_id)
            results[parent_id] = game
        game = results[parent_id]

        event_type = (ev.get("event_type") or "").lower()
        is_games_event = "games" in event_type or "games" in (ev["home_name"] or "").lower()

        # Merge child event odds_block into Raw for lineId resolution
        raw_odds = game["Raw"].setdefault("odds_block", {})
        period_event_ids = game["Raw"].setdefault("period_event_ids", {})
        for pk, pv in ev.get("odds_block", {}).items():
            if pk not in raw_odds:
                raw_odds[pk] = orjson.loads(orjson.dumps(pv))
            period_event_ids[pk] = ev["event_id"]

        for period_num, period_data in iter_periods(ev["odds_block"]):
            if period_num > 80:
                continue
            target_period, game_number = map_tennis_period(period_num)
            if target_period < 0 or target_period >= 6:
                continue
            if ev.get("is_extra"):
                period_data = _remap_mb_period_data(period_data)
            status, ml = parse_moneyline(period_data)
            # Extra e-key events can report status=0 for open markets.
            ev_is_live = bool(ev.get("is_live")) if ev.get("is_live") is not None else bool(is_live)
            if status is not None and status != 1 and not ev.get("is_extra"):
                # Live Tennis "Sets" children can carry real odds with status=2.
                # Skipping them drops valid SetsHandicap/SetsTotal lines and leaves
                # the parent stuck in force_stale.
                if not (ev_is_live and status == 2 and _tennis_period_has_live_prices(period_data)):
                    continue

            period = game["Periods"][target_period]
            source_period = new_period()

            if ml and len(ml) >= 2:
                home_price, away_price, draw_price = extract_moneyline_values(ml)
                if home_price == 0.0 and away_price == 0.0 and draw_price == 0.0:
                    home_price = away_price = draw_price = 0.0
                if game_number:
                    games_map = ensure_map(source_period, "Games")
                    games_map[game_number] = {
                        "Win1": make_odd(home_price, ps3838_raw(1, 0, 0, period_num)),
                        "WinNone": make_odd(draw_price),
                        "Win2": make_odd(away_price, ps3838_raw(1, 1, 0, period_num)),
                    }
                    lid = _extract_ml_line_id(ml)
                    if lid:
                        games_map[game_number]["LineId"] = lid
                        games_map[game_number]["LineEventId"] = ev["event_id"]
                else:
                    set_win1x2(source_period, home_price, away_price, draw_price, line_id=_extract_ml_line_id(ml), event_id=ev["event_id"], ps_period=period_num)

            _eid = ev["event_id"]
            if len(period_data) > 1 and isinstance(period_data[1], list):
                for total in period_data[1]:
                    if not isinstance(total, list) or len(total) < 3:
                        continue
                    points, over_price, under_price = parse_total_fields(total)
                    line = float_to_line(points)
                    if target_period == 0 and points < 5.0:
                        target = ensure_map(source_period, "SetsTotal")
                    else:
                        target = ensure_map(source_period, "Totals")
                    target[line] = {
                        "WinMore": make_odd(over_price, ps3838_raw(3, 3, points, period_num)),
                        "WinLess": make_odd(under_price, ps3838_raw(3, 4, points, period_num)),
                    }
                    lid = _extract_total_line_id(total)
                    if lid:
                        target[line]["LineId"] = lid
                    target[line]["LineEventId"] = _eid

            parse_team_totals_into(source_period, period_data, "FirstTeamTotals", "SecondTeamTotals", event_id=_eid, ps_period=period_num)

            _from_api = bool(ev.get("from_pinnacle_api"))
            _hs = float(ev.get("home_score") or 0.0)
            _as = float(ev.get("away_score") or 0.0)
            if is_games_event:
                parse_spreads_into(
                    source_period,
                    period_data,
                    "Handicap",
                    sign_is_home=_from_api,
                    event_id=_eid,
                    ps_period=period_num,
                    home_score=_hs,
                    away_score=_as,
                    score_relative=_from_api,
                )
            else:
                parse_spreads_into(
                    source_period,
                    period_data,
                    "SetsHandicap",
                    sign_is_home=_from_api,
                    event_id=_eid,
                    ps_period=period_num,
                    home_score=_hs,
                    away_score=_as,
                    score_relative=_from_api,
                )

            _commit_grouped_market(period, source_period, "Win1x2", ev, period_num)
            _commit_grouped_market(period, source_period, "Totals", ev, period_num)
            _commit_grouped_market(period, source_period, "SetsTotal", ev, period_num)
            _commit_grouped_market(period, source_period, "FirstTeamTotals", ev, period_num)
            _commit_grouped_market(period, source_period, "SecondTeamTotals", ev, period_num)
            _commit_grouped_market(period, source_period, "Handicap", ev, period_num)
            _commit_grouped_market(period, source_period, "SetsHandicap", ev, period_num)
            _commit_grouped_games(period, source_period, ev, period_num)

    return results


def parse_volleyball_events(events: List[Dict[str, Any]], is_live: bool) -> Dict[int, Dict[str, Any]]:
    """Парсинг волейбольных событий PS3838 в формат GameData."""
    results: Dict[int, Dict[str, Any]] = {}
    parents: Dict[int, Dict[str, Any]] = {}
    ordered_events = sorted(events, key=_grouped_event_sort_key)
    for ev in ordered_events:
        parent_id = ev["parent_id"] or ev["event_id"]
        event_type = (ev.get("event_type") or "").lower()
        is_points_event = "points" in event_type or "(points)" in (ev["home_name"] or "").lower()
        if parent_id not in parents:
            parents[parent_id] = ev
        else:
            current_type = (parents[parent_id].get("event_type") or "").lower()
            current_is_points = "points" in current_type or "(points)" in (parents[parent_id]["home_name"] or "").lower()
            if current_is_points and not is_points_event:
                parents[parent_id] = ev

    for ev in ordered_events:
        parent_id = ev["parent_id"] or ev["event_id"]
        parent_event = parents.get(parent_id, ev)
        if parent_id not in results:
            game = build_game_data(parent_event, "Volleyball", 6, is_live, set_scores=True, pid=parent_id)
            results[parent_id] = game
        game = results[parent_id]

        event_type = (ev.get("event_type") or "").lower()
        is_points_event = "points" in event_type or "(points)" in (ev["home_name"] or "").lower()

        # Merge child event odds_block into Raw for lineId resolution
        raw_odds = game["Raw"].setdefault("odds_block", {})
        period_event_ids = game["Raw"].setdefault("period_event_ids", {})
        for pk, pv in ev.get("odds_block", {}).items():
            if pk not in raw_odds:
                raw_odds[pk] = orjson.loads(orjson.dumps(pv))
            period_event_ids[pk] = ev["event_id"]

        for period_num, period_data in iter_periods(ev["odds_block"]):
            if period_num < 0 or period_num > 5:
                continue
            if ev.get("is_extra"):
                period_data = _remap_mb_period_data(period_data)
            status, ml = parse_moneyline(period_data)
            # Extra e-key events can report status=0 for open markets.
            if status is not None and status != 1 and not ev.get("is_extra"):
                continue
            if period_num >= len(game["Periods"]):
                continue
            period = game["Periods"][period_num]
            source_period = new_period()

            _from_api_v = bool(ev.get("from_pinnacle_api"))
            _hs_v = float(ev.get("home_score") or 0.0)
            _as_v = float(ev.get("away_score") or 0.0)
            if is_points_event:
                parse_spreads_into(
                    source_period,
                    period_data,
                    "Handicap",
                    sign_is_home=_from_api_v,
                    event_id=ev["event_id"],
                    ps_period=period_num,
                    home_score=_hs_v,
                    away_score=_as_v,
                    score_relative=_from_api_v,
                )
                parse_totals_into(source_period, period_data, "Totals", event_id=ev["event_id"], ps_period=period_num)
                parse_team_totals_into(source_period, period_data, "FirstTeamTotals", "SecondTeamTotals", event_id=ev["event_id"], ps_period=period_num)
            else:
                game["HomeScore"] = ev["home_score"]
                game["AwayScore"] = ev["away_score"]
                if ml and len(ml) >= 2:
                    home_price, away_price, draw_price = extract_moneyline_values(ml)
                    if home_price != 0.0 or away_price != 0.0 or draw_price != 0.0:
                        set_win1x2(source_period, home_price, away_price, draw_price, line_id=_extract_ml_line_id(ml), event_id=ev["event_id"], ps_period=period_num)
                if period_num == 0:
                    # P[0]: match-level sets handicap/total
                    parse_spreads_into(
                        source_period,
                        period_data,
                        "SetsHandicap",
                        sign_is_home=_from_api_v,
                        event_id=ev["event_id"],
                        ps_period=period_num,
                        home_score=_hs_v,
                        away_score=_as_v,
                        score_relative=_from_api_v,
                    )
                    parse_totals_into(source_period, period_data, "SetsTotal", event_id=ev["event_id"], ps_period=period_num)
                else:
                    # P[1]+: per-set points handicap/total (not sets)
                    parse_spreads_into(
                        source_period,
                        period_data,
                        "Handicap",
                        sign_is_home=_from_api_v,
                        event_id=ev["event_id"],
                        ps_period=period_num,
                        home_score=_hs_v,
                        away_score=_as_v,
                        score_relative=_from_api_v,
                    )
                    parse_totals_into(source_period, period_data, "Totals", event_id=ev["event_id"], ps_period=period_num)
                parse_team_totals_into(source_period, period_data, "FirstTeamTotals", "SecondTeamTotals", event_id=ev["event_id"], ps_period=period_num)

            _commit_grouped_market(period, source_period, "Win1x2", ev, period_num)
            _commit_grouped_market(period, source_period, "Handicap", ev, period_num)
            _commit_grouped_market(period, source_period, "Totals", ev, period_num)
            _commit_grouped_market(period, source_period, "SetsHandicap", ev, period_num)
            _commit_grouped_market(period, source_period, "SetsTotal", ev, period_num)
            _commit_grouped_market(period, source_period, "FirstTeamTotals", ev, period_num)
            _commit_grouped_market(period, source_period, "SecondTeamTotals", ev, period_num)

    return results


def parse_hockey_events(events: List[Dict[str, Any]], is_live: bool) -> Dict[int, Dict[str, Any]]:
    """Парсинг хоккейных событий PS3838 в формат GameData.

    Period mapping:
      PS3838 period 0 (Game/Including OT, 2-way) → Periods[0]  — ML + totals/handicaps WITH OT
      PS3838 period 1 (P1)                        → Periods[1]
      PS3838 period 2 (P2)                        → Periods[2]
      PS3838 period 3 (P3)                        → Periods[3]
      PS3838 period 6 (Regulation Time, 3-way)    → Periods[4]  — ML + totals/handicaps REGULATION

    Totals/Handicaps:
      period 0 → P[0]: including OT (rare but exists in PS3838)
      period 6 → P[4]: regulation only (main flow)
      Donors (Sansabet/Volcano) put regulation totals in P[4] to match.
    """
    results: Dict[int, Dict[str, Any]] = {}
    for ev in events:
        pid = ev["parent_id"] or ev["event_id"]
        game = build_game_data(ev, "Hockey", 5, is_live, set_scores=True, pid=pid)
        for period_num, period_data in iter_periods(ev["odds_block"]):
            if period_num in (0, 1, 2, 3):
                target_period = period_num
            elif period_num == 6:
                target_period = 4
            else:
                continue
            if ev.get("is_extra"):
                period_data = _remap_mb_period_data(period_data)
            status, ml = parse_moneyline(period_data)
            # Extra e-key events can report status=0 for open markets.
            if status is not None and status != 1 and not ev.get("is_extra"):
                continue
            if target_period >= len(game["Periods"]):
                continue
            period = game["Periods"][target_period]
            ensure_base_maps(period)

            if period_num >= 1 and period_num <= 3:
                # Periods 1-3: ML is handicap 0 (push on draw, 2-way).
                # Store BOTH Win1x2 (for equivalences.go twoWayIsH0 → "1" source → betslip ML verify)
                # AND Handicap["0"] with LineId (for H0→ML fallback in bet_service).
                if ml and len(ml) >= 2:
                    home_price, away_price, _ = extract_moneyline_values(ml)
                    if home_price > 0 or away_price > 0:
                        _lid = _extract_ml_line_id(ml)
                        _eid = ev.get("event_id", 0)
                        set_win1x2(period, home_price, away_price, 0, line_id=_lid, event_id=_eid, ps_period=period_num)
                        handicap = ensure_map(period, "Handicap")
                        h0 = {
                            "Win1": make_odd(home_price, ps3838_raw(2, 0, 0, period_num, _lid, _eid)),
                            "Win2": make_odd(away_price, ps3838_raw(2, 1, 0, period_num, _lid, _eid)),
                        }
                        if _lid:
                            h0["LineId"] = _lid
                        if _eid:
                            h0["LineEventId"] = _eid
                        handicap["0"] = h0
            else:
                if ml and len(ml) >= 2:
                    home_price, away_price, draw_price = extract_moneyline_values(ml)
                    if home_price != 0.0 or away_price != 0.0 or draw_price != 0.0:
                        set_win1x2(period, home_price, away_price, draw_price, line_id=_extract_ml_line_id(ml), event_id=ev.get("event_id", 0), ps_period=period_num)

            _eid = ev.get("event_id", 0)
            # Hockey uses absolute handicap convention (like basketball), NOT remaining (like soccer)
            parse_spreads_into(
                period,
                period_data,
                "Handicap",
                event_id=_eid,
                ps_period=period_num,
                home_score=float(ev.get("home_score") or 0.0),
                away_score=float(ev.get("away_score") or 0.0),
                score_relative=True,
            )
            parse_totals_into(period, period_data, "Totals", event_id=_eid, ps_period=period_num)
            parse_team_totals_into(period, period_data, "FirstTeamTotals", "SecondTeamTotals", event_id=_eid, ps_period=period_num)

        results[pid] = game
    return results


def _parse_simple_sport(
    events: List[Dict[str, Any]],
    is_live: bool,
    sport_name: str,
    n_periods: int,
    period_map,  # callable: period_num -> target_period or None
    spread_signed: bool = False,
    score_relative_spreads: bool = False,
    half_period_map: dict = None,  # remap 1→5, 2→6 for sports with non-standard half indices
) -> Dict[int, Dict[str, Any]]:
    """Generic parser for sports with simple single-event structure.
    Used by: Basketball, Handball, TableTennis, ESports, AmericanFootball, Baseball."""
    results: Dict[int, Dict[str, Any]] = {}
    for ev in events:
        pid = ev["parent_id"] or ev["event_id"]
        if pid not in results:
            game = build_game_data(ev, sport_name, n_periods, is_live, set_scores=True, pid=pid)
            results[pid] = game
        game = results[pid]
        for period_num, period_data in iter_periods(ev["odds_block"]):
            target_period = period_map(period_num)
            if target_period is None:
                continue
            if target_period >= n_periods:
                continue
            if ev.get("is_extra"):
                period_data = _remap_mb_period_data(period_data)
            status, ml = parse_moneyline(period_data)
            if status is not None and status != 1 and not ev.get("is_extra"):
                continue
            period = game["Periods"][target_period]
            ensure_base_maps(period)
            if ml and len(ml) >= 2:
                home_price, away_price, draw_price = extract_moneyline_values(ml)
                if home_price != 0.0 or away_price != 0.0 or draw_price != 0.0:
                    set_win1x2(period, home_price, away_price, draw_price, line_id=_extract_ml_line_id(ml), event_id=ev.get("event_id", 0), ps_period=period_num)
            _eid = ev.get("event_id", 0)
            parse_spreads_into(
                period,
                period_data,
                "Handicap",
                sign_is_home=spread_signed,
                event_id=_eid,
                ps_period=period_num,
                home_score=float(ev.get("home_score") or 0.0),
                away_score=float(ev.get("away_score") or 0.0),
                score_relative=score_relative_spreads,
            )
            parse_totals_into(period, period_data, "Totals", event_id=_eid, ps_period=period_num)
            parse_team_totals_into(period, period_data, "FirstTeamTotals", "SecondTeamTotals", event_id=_eid, ps_period=period_num)
    return results


# ── Sport-specific period mappings ─────────────────────────────────────────────

def _basketball_period_map(p):
    if p == 0: return 0
    if p == 1: return 5
    if p == 2: return 6  # 2nd Half
    if 3 <= p <= 6: return p - 2
    return None

def _amfootball_period_map(p):
    if p == 0: return 0
    if p == 1: return 5
    if p == 2: return 6
    if 3 <= p <= 6: return p - 2
    return None

def _range_period_map(max_period):
    """Returns a period map that accepts 0..max_period (identity mapping)."""
    def _map(p):
        return p if 0 <= p <= max_period else None
    return _map


# ── Simple sport parser wrappers ───────────────────────────────────────────────

def parse_basketball_events(events: List[Dict[str, Any]], is_live: bool) -> Dict[int, Dict[str, Any]]:
    """Парсинг баскетбольных событий PS3838 в формат GameData."""
    return _parse_simple_sport(events, is_live, "Basketball", 7, _basketball_period_map,
                               spread_signed=False, score_relative_spreads=True, half_period_map={1: 5, 2: 6})


def parse_handball_events(events: List[Dict[str, Any]], is_live: bool) -> Dict[int, Dict[str, Any]]:
    """Парсинг гандбольных событий PS3838 в формат GameData."""
    return _parse_simple_sport(events, is_live, "Handball", 3, _range_period_map(2), spread_signed=False, score_relative_spreads=True)


def parse_table_tennis_events(events: List[Dict[str, Any]], is_live: bool) -> Dict[int, Dict[str, Any]]:
    """Парсинг событий настольного тенниса PS3838 в формат GameData."""
    return _parse_simple_sport(events, is_live, "TableTennis", 8, _range_period_map(7), spread_signed=True)


def parse_esports_events(events: List[Dict[str, Any]], is_live: bool) -> Dict[int, Dict[str, Any]]:
    """Парсинг киберспортивных событий PS3838 в формат GameData.

    Группирует по parent_id (как теннис): основной матч + kills-суб-ивенты
    сливаются в один GameData. Kills-данные записываются в period["Kills"].
    """
    results: Dict[int, Dict[str, Any]] = {}
    parents: Dict[int, Dict[str, Any]] = {}
    n_periods = 8
    period_map = _range_period_map(7)

    # Pass 1: выбираем parent-event для каждой группы (предпочитаем основной матч, не kills)
    ordered_events = sorted(events, key=_grouped_event_sort_key)
    for ev in ordered_events:
        parent_id = ev["parent_id"] or ev["event_id"]
        is_kills = "kills" in (ev["home_name"] or "").lower()
        if parent_id not in parents:
            parents[parent_id] = ev
        elif is_kills:
            pass  # keep existing non-kills parent
        else:
            # текущий parent — kills, заменяем на основной матч
            current_is_kills = "kills" in (parents[parent_id]["home_name"] or "").lower()
            if current_is_kills:
                parents[parent_id] = ev

    # Pass 2: парсим все events, группируя по parent_id
    for ev in ordered_events:
        parent_id = ev["parent_id"] or ev["event_id"]
        parent_event = parents.get(parent_id, ev)
        is_kills = "kills" in (ev["home_name"] or "").lower()

        if parent_id not in results:
            game = build_game_data(parent_event, "ESports", n_periods, is_live, set_scores=True, pid=parent_id)
            results[parent_id] = game
        game = results[parent_id]

        # Merge child odds_block into Raw (для lineId resolution)
        raw_odds = game["Raw"].setdefault("odds_block", {})
        period_event_ids = game["Raw"].setdefault("period_event_ids", {})
        for pk, pv in ev.get("odds_block", {}).items():
            key_prefix = f"kills_{pk}" if is_kills else pk
            if key_prefix not in raw_odds:
                raw_odds[key_prefix] = orjson.loads(orjson.dumps(pv))
            period_event_ids[key_prefix] = ev["event_id"]

        for period_num, period_data in iter_periods(ev["odds_block"]):
            target_period = period_map(period_num)
            if target_period is None or target_period >= n_periods:
                continue

            if ev.get("is_extra"):
                period_data = _remap_mb_period_data(period_data)
            status, ml = parse_moneyline(period_data)
            if status is not None and status != 1 and not ev.get("is_extra"):
                continue

            period = game["Periods"][target_period]
            _eid = ev.get("event_id", 0)
            source_period: Dict[str, Any] = {}

            if is_kills:
                # Kills sub-event: данные → period["Kills"]
                kills = ensure_map(source_period, "Kills")
                if ml and len(ml) >= 2:
                    home_price, away_price, draw_price = extract_moneyline_values(ml)
                    if home_price != 0.0 or away_price != 0.0:
                        kills["Win1x2"] = {
                            "Win1": make_odd(home_price, ps3838_raw(1, 0, 0, period_num)),
                            "WinNone": make_odd(draw_price),
                            "Win2": make_odd(away_price, ps3838_raw(1, 1, 0, period_num)),
                        }
                        lid = _extract_ml_line_id(ml)
                        if lid:
                            kills["Win1x2"]["LineId"] = lid
                            kills["Win1x2"]["LineEventId"] = _eid
                # Kills totals
                if len(period_data) > 1 and isinstance(period_data[1], list):
                    kills_totals = ensure_map(kills, "Totals")
                    for total in period_data[1]:
                        if not isinstance(total, list) or len(total) < 3:
                            continue
                        points, over_price, under_price = parse_total_fields(total)
                        line = float_to_line(points)
                        kills_totals[line] = {
                            "WinMore": make_odd(over_price, ps3838_raw(3, 3, points, period_num)),
                            "WinLess": make_odd(under_price, ps3838_raw(3, 4, points, period_num)),
                        }
                        lid = _extract_total_line_id(total)
                        if lid:
                            kills_totals[line]["LineId"] = lid
                        kills_totals[line]["LineEventId"] = _eid
                # Kills handicaps
                if len(period_data) > 0 and isinstance(period_data[0], list):
                    kills_hdp = ensure_map(kills, "Handicap")
                    for spread in period_data[0]:
                        if not isinstance(spread, list) or len(spread) < 3:
                            continue
                        points = spread[0]
                        if not isinstance(points, (int, float)):
                            continue
                        h_price = float(spread[1] or 0)
                        a_price = float(spread[2] or 0)
                        line = float_to_line(points)
                        neg_line = float_to_line(-points)
                        if h_price > 0:
                            kills_hdp.setdefault(line, {})["Win1"] = make_odd(h_price, ps3838_raw(2, 0, points, period_num))
                        if a_price > 0:
                            kills_hdp.setdefault(neg_line, {})["Win2"] = make_odd(a_price, ps3838_raw(2, 1, -points, period_num))
                        lid = spread[3] if len(spread) > 3 and isinstance(spread[3], (int, float)) else None
                        if lid:
                            if line in kills_hdp:
                                kills_hdp[line]["LineId"] = int(lid)
                                kills_hdp[line]["LineEventId"] = _eid
                            if neg_line in kills_hdp:
                                kills_hdp[neg_line]["LineId"] = int(lid)
                                kills_hdp[neg_line]["LineEventId"] = _eid
                _commit_grouped_market(period, source_period, "Kills", ev, period_num)
            else:
                # Основной матч: стандартный парсинг
                source_period = new_period()
                if ml and len(ml) >= 2:
                    home_price, away_price, draw_price = extract_moneyline_values(ml)
                    if home_price != 0.0 or away_price != 0.0 or draw_price != 0.0:
                        set_win1x2(source_period, home_price, away_price, draw_price, line_id=_extract_ml_line_id(ml), event_id=_eid, ps_period=period_num)
                parse_spreads_into(source_period, period_data, "Handicap", event_id=_eid, ps_period=period_num)
                parse_totals_into(source_period, period_data, "Totals", event_id=_eid, ps_period=period_num)
                parse_team_totals_into(source_period, period_data, "FirstTeamTotals", "SecondTeamTotals", event_id=_eid, ps_period=period_num)
                _commit_grouped_market(period, source_period, "Win1x2", ev, period_num)
                _commit_grouped_market(period, source_period, "Handicap", ev, period_num)
                _commit_grouped_market(period, source_period, "Totals", ev, period_num)
                _commit_grouped_market(period, source_period, "FirstTeamTotals", ev, period_num)
                _commit_grouped_market(period, source_period, "SecondTeamTotals", ev, period_num)

    # ESports: no draws → Hdp 0 = moneyline. Remove to avoid confusing display.
    for game in results.values():
        for period in game.get("Periods", []):
            hdp = period.get("Handicap")
            if hdp:
                for zero_key in ("0", "0.0", "-0", "-0.0"):
                    hdp.pop(zero_key, None)

    return results


def parse_american_football_events(events: List[Dict[str, Any]], is_live: bool) -> Dict[int, Dict[str, Any]]:
    """Парсинг событий американского футбола PS3838 в формат GameData."""
    return _parse_simple_sport(events, is_live, "AmericanFootball", 7, _amfootball_period_map,
                               spread_signed=False, score_relative_spreads=True, half_period_map={1: 5, 2: 6})


def parse_baseball_events(events: List[Dict[str, Any]], is_live: bool) -> Dict[int, Dict[str, Any]]:
    """Парсинг бейсбольных событий PS3838 в формат GameData."""
    return _parse_simple_sport(events, is_live, "Baseball", 10, _range_period_map(9), spread_signed=True)
