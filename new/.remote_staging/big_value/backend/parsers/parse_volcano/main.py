import asyncio
import copy
import logging
import time
import os
import hashlib
import datetime
from typing import List
from aiohttp import web
from dotenv import load_dotenv

load_dotenv()

from parser import ParserService
from volcano import VolcanoMe
from volcano_live_signalr import VolcanoLiveSignalR
from sender_analyzer import SenderToAnalyzer

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s,%(msecs)d %(levelname)-8s [%(filename)s:%(lineno)d] %(message)s',
    datefmt='%Y-%m-%d:%H:%M:%S'
)

bookmaker = 'Volcano'

# Use SignalR for live (real-time odds) or REST API (prematch odds only)
USE_SIGNALR_LIVE = os.getenv('USE_SIGNALR_LIVE', 'true').lower() == 'true'
PARSE_LIVE = os.getenv('PARSE_LIVE', 'TRUE').upper() == 'TRUE'

# Use correct service based on PARSE_LIVE env
parser_service = ParserService.live if PARSE_LIVE else ParserService.prematch
parser = VolcanoMe(service=parser_service)
signalr_parser = None  # Will be initialized in run() if USE_SIGNALR_LIVE

# WebSocket sender для отправки в analyzer
analyzer_url = os.getenv('SENDER_URL', 'ws://analyzer:7101?api_key=volcano_secret_key_change_in_production')
sender = SenderToAnalyzer(analyzer_url, parser_name="Volcano")

# Health endpoint
async def health_handler(request):
    """Health check endpoint для Docker healthcheck"""
    signalr_status = "enabled" if USE_SIGNALR_LIVE else "disabled"
    signalr_games = len(signalr_parser.games) if signalr_parser else 0
    signalr_reconnects = signalr_parser.reconnect_count if signalr_parser else 0
    signalr_connected = signalr_parser.signalr.running if signalr_parser else False
    return web.json_response({
        "status": "ok",
        "parser": "Volcano",
        "bookmaker": bookmaker,
        "sender_stats": sender.stats,
        "signalr_live": signalr_status,
        "signalr_games": signalr_games,
        "signalr_connected": signalr_connected,
        "signalr_reconnects": signalr_reconnects
    })

async def start_health_server():
    """Запуск HTTP сервера для healthcheck"""
    port = int(os.getenv('PORT', 9010))
    app = web.Application()
    app.router.add_get('/health', health_handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', port)
    await site.start()
    logging.info(f"✅ Health check server started on port {port}")

def response_period_to_dict(period) -> dict:
    """Конвертация ResponsePeriod в dict для analyzer"""
    result = {
        "Win1x2": {},
        "Totals": {},
        "Handicap": {},
        "FirstTeamTotals": {},
        "SecondTeamTotals": {}
    }
    
    # Win1x2
    if period.win1x2:
        if period.win1x2.win1:
            result['Win1x2']['Win1'] = {"value": period.win1x2.win1.value}
        if period.win1x2.win_none:
            result['Win1x2']['WinNone'] = {"value": period.win1x2.win_none.value}
        if period.win1x2.win2:
            result['Win1x2']['Win2'] = {"value": period.win1x2.win2.value}
    
    # Totals
    for line, wlm in period.totals.items():
        result['Totals'][line] = {}
        if wlm.win_more:
            result['Totals'][line]['WinMore'] = {"value": wlm.win_more.value}
        if wlm.win_less:
            result['Totals'][line]['WinLess'] = {"value": wlm.win_less.value}
    
    # FirstTeamTotals (IT1)
    for line, wlm in period.first_team_totals.items():
        result['FirstTeamTotals'][line] = {}
        if wlm.win_more:
            result['FirstTeamTotals'][line]['WinMore'] = {"value": wlm.win_more.value}
        if wlm.win_less:
            result['FirstTeamTotals'][line]['WinLess'] = {"value": wlm.win_less.value}
    
    # SecondTeamTotals (IT2)
    for line, wlm in period.second_team_totals.items():
        result['SecondTeamTotals'][line] = {}
        if wlm.win_more:
            result['SecondTeamTotals'][line]['WinMore'] = {"value": wlm.win_more.value}
        if wlm.win_less:
            result['SecondTeamTotals'][line]['WinLess'] = {"value": wlm.win_less.value}
    
    # Handicap
    for line, wh in period.handicap.items():
        result['Handicap'][line] = {}
        if wh.win1:
            result['Handicap'][line]['Win1'] = {"value": wh.win1.value}
        if wh.win2:

            result['Handicap'][line]['Win2'] = {"value": wh.win2.value}
    
    # ========== SPECIALS ==========
    # BTTS (Both Teams To Score)
    if period.btts:
        result['BTTS'] = {}
        if period.btts.yes:
            result['BTTS']['Yes'] = {"value": period.btts.yes.value}
        if period.btts.no:
            result['BTTS']['No'] = {"value": period.btts.no.value}
    
    # Odd/Even - analyzer expects Yes/No format (Yes=Odd, No=Even)
    if period.odd_even:
        result['OddEven'] = {}
        if period.odd_even.yes:
            result['OddEven']['Yes'] = {"value": period.odd_even.yes.value}
        if period.odd_even.no:
            result['OddEven']['No'] = {"value": period.odd_even.no.value}
    
    # Double Chance - analyzer expects W1X/WX2/W12 format
    if period.double_chance:
        result['DoubleChance'] = {}
        if period.double_chance.home_draw:
            result['DoubleChance']['W1X'] = {"value": period.double_chance.home_draw.value}
        if period.double_chance.away_draw:
            result['DoubleChance']['WX2'] = {"value": period.double_chance.away_draw.value}
        if period.double_chance.home_away:
            result['DoubleChance']['W12'] = {"value": period.double_chance.home_away.value}
    
    # Draw No Bet - V2: Store as-is (Home=Yes, Away=No)
    if period.draw_no_bet:
        result['DrawNoBet'] = {}
        if period.draw_no_bet.yes:
            result['DrawNoBet']['Home'] = {"value": period.draw_no_bet.yes.value}
        if period.draw_no_bet.no:
            result['DrawNoBet']['Away'] = {"value": period.draw_no_bet.no.value}
    
    # Either Team To Score - V2: Store as-is (Yes=AtLeastOneScores, No=NoGoal)
    if period.either_team_to_score:
        result['EitherTeamToScore'] = {}
        if period.either_team_to_score.yes:
            result['EitherTeamToScore']['Yes'] = {"value": period.either_team_to_score.yes.value}
        if period.either_team_to_score.no:
            result['EitherTeamToScore']['No'] = {"value": period.either_team_to_score.no.value}
    
    # Home Team To Score (Yes/No)
    if period.home_team_to_score:
        result['HomeTeamToScore'] = {}
        if period.home_team_to_score.yes:
            result['HomeTeamToScore']['Yes'] = {"value": period.home_team_to_score.yes.value}
        if period.home_team_to_score.no:
            result['HomeTeamToScore']['No'] = {"value": period.home_team_to_score.no.value}
    
    # Away Team To Score (Yes/No)
    if period.away_team_to_score:
        result['AwayTeamToScore'] = {}
        if period.away_team_to_score.yes:
            result['AwayTeamToScore']['Yes'] = {"value": period.away_team_to_score.yes.value}
        if period.away_team_to_score.no:
            result['AwayTeamToScore']['No'] = {"value": period.away_team_to_score.no.value}
    
    # ========== CORNERS ==========
    # Corners Total
    if period.corners_total:
        result['CornersTotal'] = {}
        for line, wlm in period.corners_total.items():
            result['CornersTotal'][line] = {}
            if wlm.win_more:
                result['CornersTotal'][line]['WinMore'] = {"value": wlm.win_more.value}
            if wlm.win_less:
                result['CornersTotal'][line]['WinLess'] = {"value": wlm.win_less.value}
    
    # Corners Handicap
    if period.corners_handicap:
        result['CornersHandicap'] = {}
        for line, wh in period.corners_handicap.items():
            result['CornersHandicap'][line] = {}
            if wh.win1:
                result['CornersHandicap'][line]['Win1'] = {"value": wh.win1.value}
            if wh.win2:
                result['CornersHandicap'][line]['Win2'] = {"value": wh.win2.value}
    
    # Corners First Team Total
    if period.corners_first_team_total:
        result['CornersFirstTeamTotal'] = {}
        for line, wlm in period.corners_first_team_total.items():
            result['CornersFirstTeamTotal'][line] = {}
            if wlm.win_more:
                result['CornersFirstTeamTotal'][line]['WinMore'] = {"value": wlm.win_more.value}
            if wlm.win_less:
                result['CornersFirstTeamTotal'][line]['WinLess'] = {"value": wlm.win_less.value}
    
    # Corners Second Team Total
    if period.corners_second_team_total:
        result['CornersSecondTeamTotal'] = {}
        for line, wlm in period.corners_second_team_total.items():
            result['CornersSecondTeamTotal'][line] = {}
            if wlm.win_more:
                result['CornersSecondTeamTotal'][line]['WinMore'] = {"value": wlm.win_more.value}
            if wlm.win_less:
                result['CornersSecondTeamTotal'][line]['WinLess'] = {"value": wlm.win_less.value}
    
    # ========== BOOKINGS ==========
    if period.bookings_total:
        result['BookingsTotal'] = {}
        for line, wlm in period.bookings_total.items():
            result['BookingsTotal'][line] = {}
            if wlm.win_more:
                result['BookingsTotal'][line]['WinMore'] = {"value": wlm.win_more.value}
            if wlm.win_less:
                result['BookingsTotal'][line]['WinLess'] = {"value": wlm.win_less.value}
    
    if period.bookings_handicap:
        result['BookingsHandicap'] = {}
        for line, wh in period.bookings_handicap.items():
            result['BookingsHandicap'][line] = {}
            if wh.win1:
                result['BookingsHandicap'][line]['Win1'] = {"value": wh.win1.value}
            if wh.win2:
                result['BookingsHandicap'][line]['Win2'] = {"value": wh.win2.value}
    
    if period.bookings_first_team_total:
        result['BookingsFirstTeamTotal'] = {}
        for line, wlm in period.bookings_first_team_total.items():
            result['BookingsFirstTeamTotal'][line] = {}
            if wlm.win_more:
                result['BookingsFirstTeamTotal'][line]['WinMore'] = {"value": wlm.win_more.value}
            if wlm.win_less:
                result['BookingsFirstTeamTotal'][line]['WinLess'] = {"value": wlm.win_less.value}
    
    if period.bookings_second_team_total:
        result['BookingsSecondTeamTotal'] = {}
        for line, wlm in period.bookings_second_team_total.items():
            result['BookingsSecondTeamTotal'][line] = {}
            if wlm.win_more:
                result['BookingsSecondTeamTotal'][line]['WinMore'] = {"value": wlm.win_more.value}
            if wlm.win_less:
                result['BookingsSecondTeamTotal'][line]['WinLess'] = {"value": wlm.win_less.value}
    
    # ========== EXTENDED SPECIALS ==========
    # Home/Away Odd/Even
    if period.home_odd_even:
        result['HomeOddEven'] = {}
        if period.home_odd_even.yes:
            result['HomeOddEven']['Yes'] = {"value": period.home_odd_even.yes.value}
        if period.home_odd_even.no:
            result['HomeOddEven']['No'] = {"value": period.home_odd_even.no.value}
    
    if period.away_odd_even:
        result['AwayOddEven'] = {}
        if period.away_odd_even.yes:
            result['AwayOddEven']['Yes'] = {"value": period.away_odd_even.yes.value}
        if period.away_odd_even.no:
            result['AwayOddEven']['No'] = {"value": period.away_odd_even.no.value}
    
    # First Team To Score
    if period.first_team_to_score:
        result['FirstTeamToScore'] = {}
        if period.first_team_to_score.win1:
            result['FirstTeamToScore']['Home'] = {"value": period.first_team_to_score.win1.value}
        if period.first_team_to_score.win2:
            result['FirstTeamToScore']['Away'] = {"value": period.first_team_to_score.win2.value}
        if period.first_team_to_score.win_none:
            result['FirstTeamToScore']['Neither'] = {"value": period.first_team_to_score.win_none.value}
    
    # To Qualify
    if period.to_qualify:
        result['ToQualify'] = {}
        if period.to_qualify.win1:
            result['ToQualify']['Home'] = {"value": period.to_qualify.win1.value}
        if period.to_qualify.win2:
            result['ToQualify']['Away'] = {"value": period.to_qualify.win2.value}

    # Tennis/Volleyball Sets
    if period.sets_total:
        result['SetsTotal'] = {}
        for line, wlm in period.sets_total.items():
            result['SetsTotal'][line] = {}
            if wlm.win_more: result['SetsTotal'][line]['WinMore'] = {"value": wlm.win_more.value}
            if wlm.win_less: result['SetsTotal'][line]['WinLess'] = {"value": wlm.win_less.value}
    
    if period.sets_handicap:
        result['SetsHandicap'] = {}
        for line, wh in period.sets_handicap.items():
            result['SetsHandicap'][line] = {}
            if wh.win1: result['SetsHandicap'][line]['Win1'] = {"value": wh.win1.value}
            if wh.win2: result['SetsHandicap'][line]['Win2'] = {"value": wh.win2.value}
            
    if period.exact_sets:
        result['ExactSets'] = {}
        for count, odd in period.exact_sets.items():
            result['ExactSets'][count] = {"value": odd.value}

    # Total Goals Range
    if period.total_goals_range:
        result['TotalGoalsRange'] = {}
        for r, odd in period.total_goals_range.items():
            result['TotalGoalsRange'][r] = {"value": odd.value}
            
    # Exact Total Goals
    if period.exact_total_goals:
        result['ExactTotalGoals'] = {}
        for count, odd in period.exact_total_goals.items():
            result['ExactTotalGoals'][count] = {"value": odd.value}

    # Correct Score
    if period.correct_score:
        result['CorrectScore'] = {}
        for score, odd in period.correct_score.items():
            result['CorrectScore'][score] = {"value": odd.value}
    
    # Half Time / Full Time
    if period.half_time_full_time:
        result['HalfTimeFullTime'] = {}
        for combo, odd in period.half_time_full_time.items():
            result['HalfTimeFullTime'][combo] = {"value": odd.value}
    
    # Winning Margin
    if period.winning_margin:
        result['WinningMargin'] = {}
        for margin, odd in period.winning_margin.items():
            result['WinningMargin'][margin] = {"value": odd.value}
    
    # Three Way Handicap (European Handicap) - stored as-is, NOT converted to Asian
    if period.three_way_handicap:
        result['ThreeWayHandicap'] = {}
        for line, outcomes in period.three_way_handicap.items():
            result['ThreeWayHandicap'][line] = {}
            for outcome_name, odd in outcomes.items():
                result['ThreeWayHandicap'][line][outcome_name] = {"value": odd.value}
    
    # Win To Nil
    if period.home_win_to_nil:
        result['HomeWinToNil'] = {}
        if period.home_win_to_nil.yes:
            result['HomeWinToNil']['Yes'] = {"value": period.home_win_to_nil.yes.value}
        if period.home_win_to_nil.no:
            result['HomeWinToNil']['No'] = {"value": period.home_win_to_nil.no.value}
    
    if period.away_win_to_nil:
        result['AwayWinToNil'] = {}
        if period.away_win_to_nil.yes:
            result['AwayWinToNil']['Yes'] = {"value": period.away_win_to_nil.yes.value}
        if period.away_win_to_nil.no:
            result['AwayWinToNil']['No'] = {"value": period.away_win_to_nil.no.value}
    
    # ========== PLAYER PROPS ==========
    if period.player_props:
        result['PlayerProps'] = []
        for prop in period.player_props:
            prop_dict = {
                "PlayerName": prop.player_name,
                "Market": prop.market,
                "Line": prop.line,
                "Over": {"value": prop.over.value} if prop.over else None,
                "Under": {"value": prop.under.value} if prop.under else None
            }
            result['PlayerProps'].append(prop_dict)
    
    # ========== MISSING FIELDS (added) ==========
    # Games (Tennis)
    if period.games:
        result['Games'] = {}
        for game_key, w1x2 in period.games.items():
            result['Games'][game_key] = {}
            if w1x2.win1:
                result['Games'][game_key]['Win1'] = {"value": w1x2.win1.value}
            if w1x2.win_none:
                result['Games'][game_key]['WinNone'] = {"value": w1x2.win_none.value}
            if w1x2.win2:
                result['Games'][game_key]['Win2'] = {"value": w1x2.win2.value}
    
    # Home Exact Goals
    if period.home_exact_goals:
        result['HomeExactGoals'] = {}
        for count, odd in period.home_exact_goals.items():
            result['HomeExactGoals'][count] = {"value": odd.value}
    
    # Away Exact Goals
    if period.away_exact_goals:
        result['AwayExactGoals'] = {}
        for count, odd in period.away_exact_goals.items():
            result['AwayExactGoals'][count] = {"value": odd.value}
    
    # Method of Victory
    if period.method_of_victory:
        result['MethodOfVictory'] = {}
        for method, odd in period.method_of_victory.items():
            result['MethodOfVictory'][method] = {"value": odd.value}
    
    # ========== COMBO MARKETS ==========
    # Winner & Total Combo
    if period.winner_total_combo:
        result['WinnerTotalCombo'] = {}
        for combo, odd in period.winner_total_combo.items():
            result['WinnerTotalCombo'][combo] = {"value": odd.value}
    
    # BTTS & Winner Combo
    if period.btts_winner_combo:
        result['BTTSWinnerCombo'] = {}
        for combo, odd in period.btts_winner_combo.items():
            result['BTTSWinnerCombo'][combo] = {"value": odd.value}
    
    # BTTS & Total Combo
    if period.btts_total_combo:
        result['BTTSTotalCombo'] = {}
        for combo, odd in period.btts_total_combo.items():
            result['BTTSTotalCombo'][combo] = {"value": odd.value}
    
    # Odd/Even & Total Combo
    if period.odd_even_total_combo:
        result['OddEvenTotalCombo'] = {}
        for combo, odd in period.odd_even_total_combo.items():
            result['OddEvenTotalCombo'][combo] = {"value": odd.value}
    
    return result


def response_game_to_analyzer_format(game) -> dict:
    """Конвертация ResponseGame напрямую в формат analyzer (с ВСЕМИ периодами)"""
    # Конвертируем ВСЕ периоды (0=матч, 1=1й тайм/сет, 2=2й тайм/сет, ...)
    periods = []
    for period in game.periods:
        periods.append(response_period_to_dict(period))
    
    # Если периодов нет - добавляем пустой
    if not periods:
        periods = [{"Win1x2": {}, "Totals": {}, "Handicap": {}, "FirstTeamTotals": {}, "SecondTeamTotals": {}}]
    
    # SportName
    sport_name = game.sport_name.value if hasattr(game.sport_name, 'value') else str(game.sport_name).split('.')[-1]
    if sport_name and sport_name[0].islower():
        sport_name = sport_name.capitalize()
    
    # LeagueName в lowercase - НИКОГДА не ставим 'unknown'!
    # Если league_name пустой, используем "International {sport}" как fallback
    if game.league_name and game.league_name.lower() != 'unknown':
        league_name = game.league_name.lower()
    else:
        sport_str = sport_name if sport_name else 'Soccer'
        league_name = f"international {sport_str}".lower()
    
    # Генерируем стабильный Pid (hashlib.md5 даёт одинаковый результат между перезапусками)
    match_id_str = str(game.match_id)
    pid = int(hashlib.md5(match_id_str.encode()).hexdigest()[:8], 16) % 1000000
    
    result = {
        "Source": bookmaker,
        "Pid": pid,
        "SportName": sport_name,
        "LeagueName": league_name,
        "HomeName": game.home_name,
        "AwayName": game.away_name,
        "MatchId": match_id_str,
        "IsLive": game.is_live,
        "StartAt": game.start_at,
        "Country": game.country,
        "HomeScore": game.home_score,
        "AwayScore": game.away_score,
        "CreatedAt": datetime.datetime.utcnow().isoformat() + "Z",
        "Periods": periods,  # ВСЕ периоды!
        "Raw": {
            "match_id": game.match_id,
            "sport_name": str(game.sport_name),
            "league_name": game.league_name,
            "home_name": game.home_name,
            "away_name": game.away_name,
            "is_live": game.is_live,
            "home_score": game.home_score,
            "away_score": game.away_score,
            "start_at": game.start_at,
            "country": game.country,
            "periods_count": len(game.periods) if game.periods else 0
        }
    }

    # Analyzer's prematch expiry guard reads the canonical matchDate field;
    # StartAt is retained for compatibility but is otherwise ignored by the Go
    # receiver.  Emit RFC3339 only when Volcano supplied a valid timestamp.
    if game.start_at and game.start_at > 0:
        result["matchDate"] = datetime.datetime.fromtimestamp(
            game.start_at, datetime.timezone.utc
        ).isoformat().replace("+00:00", "Z")

    return result


async def send_structured_games_to_analyzer(games):
    """Отправка ResponseGame в analyzer с ВСЕМИ периодами (таймы, сеты)"""
    sent_count = 0
    total_periods = 0
    
    for game in games:
        try:
            # Send ALL games with live scores (analyzer will filter by common outcomes)
            # This ensures score is always updated in analyzer cache
            game_data = response_game_to_analyzer_format(game)
            total_periods += len(game_data.get('Periods', []))
            success = await sender.send_game(game_data)
            if success:
                sent_count += 1
        except Exception as e:
            logging.error(f"Error sending game {game.match_id}: {e}")
    
    # Summary log: count by sport
    sport_counts = {}
    for game in games:
        sport = game.sport_name.value if hasattr(game.sport_name, 'value') else str(game.sport_name)
        sport_counts[sport] = sport_counts.get(sport, 0) + 1
    logging.info(f"📤 Sent {sent_count}/{len(games)} games ({total_periods} periods) {sport_counts}")

async def run():
    """Основной цикл парсера"""
    global signalr_parser
    
    # Подключение к analyzer
    logging.info("🔌 Connecting to analyzer...")
    connected = await sender.connect()
    if not connected:
        logging.error("❌ Failed to connect to analyzer, will retry in loop")
    
    # Initialize SignalR parser for real-time live odds
    if USE_SIGNALR_LIVE:
        logging.info("🚀 Starting SignalR live parser (real-time odds)...")
        signalr_parser = VolcanoLiveSignalR()
        if await signalr_parser.start():
            logging.info("✅ SignalR live parser started successfully")
        else:
            logging.error("❌ SignalR failed to start, falling back to REST API")
            signalr_parser = None
    else:
        logging.info("ℹ️ Using REST API for live (prematch odds only)")
    
    # Get fetch interval from env (default 5s for live, 30s for prematch)
    fetch_interval = int(os.getenv('FETCH_INTERVAL', '5'))
    logging.info(f"⏱️ Fetch interval: {fetch_interval}s")
    
    time_ = time.time() - 500
    
    while True:
        try:
            # Регулярная отправка данных (используем FETCH_INTERVAL из .env)
            if time.time() - time_ > fetch_interval:
                logging.debug("🔄 Regular update cycle...")
                
                # Use SignalR for live (real-time) or REST API (prematch only)
                if signalr_parser:
                    # SignalR: get real-time live odds
                    structured_games = signalr_parser.get_all_games()
                    # Log match count every 60 seconds (names only at debug level)
                    if int(time.time()) % 60 < fetch_interval + 1:
                        logging.info(f"📊 SignalR: {len(structured_games)} live games")
                        for g in structured_games:
                            logging.debug(f"  🎮 {g.sport_name.value}: {g.home_name} vs {g.away_name}")
                else:
                    # REST API fallback (prematch odds only for live matches!)
                    # Use 24 hours for prematch (reduced from 72 to lower CPU)
                    hours = 24
                    try:
                        # Add timeout for entire parsing cycle (max 25 seconds for prematch)
                        structured_games = await asyncio.wait_for(
                            parser.get_all_matches_structured(hours=hours),
                            timeout=max(1, fetch_interval - 5)  # Ensure positive timeout
                        )
                    except asyncio.TimeoutError:
                        logging.error(f"⏱️ Parsing timeout after {max(1, fetch_interval-5)}s, skipping this cycle")
                        time_ = time.time()
                        continue
                
                # 📤 ГЛАВНОЕ: Отправка в analyzer с ВСЕМИ периодами!
                await send_structured_games_to_analyzer(structured_games)
                
                time_ = time.time()
        except Exception as e:
            logging.error(f"Error in main loop: {e}")
            await asyncio.sleep(2)
        
        await asyncio.sleep(0.1)

async def main():
    """Entry point с health server"""
    # Запуск health endpoint в фоне
    await start_health_server()
    
    # Запуск основного цикла
    await run()

if __name__ == "__main__":
    asyncio.run(main())
