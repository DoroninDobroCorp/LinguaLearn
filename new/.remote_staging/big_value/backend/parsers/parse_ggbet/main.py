"""
GGBet.ua Parser - connects to GraphQL WebSocket, fetches all events periodically,
transforms to analyzer format, sends via WebSocket.

Architecture:
1. Get auth token via Playwright (en locale for English team names)
2. Connect to wss://gg-b-gql.ggbet.ua/graphql
3. Every FETCH_INTERVAL seconds: fetch ALL events for ALL sports with full markets
4. Transform market data to analyzer format
5. Send via WebSocket to analyzer
"""

import asyncio
import json
import logging
import os
import time
import signal
import ssl
from datetime import datetime, timezone
from typing import Dict, Optional
from aiohttp import web
import websockets

from sender_analyzer import SenderToAnalyzer
from market_mapper import (
    SPORT_MAP, TARGET_SPORTS,
    transform_event_to_analyzer,
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)

# === Configuration ===
SENDER_URL = os.getenv("SENDER_URL", "ws://analyzer:7100?api_key=ggbet_secret_key")
GGBET_GQL_WS = os.getenv("GGBET_GQL_WS", "wss://gg-b-gql.ggbet.ua/graphql")
HEALTH_PORT = int(os.getenv("PORT", "9030"))
FETCH_INTERVAL = int(os.getenv("FETCH_INTERVAL", "3"))
PARSE_LIVE = os.getenv("PARSE_LIVE", "TRUE").upper() == "TRUE"
PARSE_PREMATCH = os.getenv("PARSE_PREMATCH", "FALSE").upper() == "TRUE"
# GGBet stops answering WebSocket keepalives while a prematch subscription is
# idle.  A one-minute empty-feed poll is the longest interval verified stable;
# it is still slower than the normal 30-second prematch cadence.
EMPTY_FETCH_INTERVAL = int(os.getenv("EMPTY_FETCH_INTERVAL", "60"))
SOURCE_NAME = os.getenv("SOURCE_NAME", "GGBet")
EVENT_LIST_LIMIT = int(os.getenv("EVENT_LIST_LIMIT", "100"))

# Persisted query hashes
HASH_GET_SPORT_EVENT_LIST = os.getenv(
    "HASH_GET_SPORT_EVENT_LIST",
    "f2256425ca4ed923b432987dc5b4fe7c7b5ee7788756b4b8eaca92c4b3160023"
)
HASH_ON_UPDATE_SPORT_EVENT = os.getenv(
    "HASH_ON_UPDATE_SPORT_EVENT",
    "0417ea329ff39df318f87f6f51e72e244bb7c149cc2a556a12b9394ee5c068cc"
)


def _events_from_graphql_message(message: dict) -> tuple[list, Optional[object]]:
    """Extract events without letting a partial GraphQL error break the stream.

    GGBet occasionally responds with ``payload.data = null`` for one sport while
    the other concurrent sport queries are still valid.  Treat that response as
    an upstream query error and keep draining the multiplexed WebSocket.
    """
    payload = message.get("payload") or {}
    if not isinstance(payload, dict):
        return [], "invalid payload"

    errors = payload.get("errors")
    data = payload.get("data") or {}
    if not isinstance(data, dict):
        return [], errors or "invalid data payload"

    matches = data.get("matches") or {}
    if not isinstance(matches, dict):
        return [], errors or "invalid matches payload"

    events = matches.get("sportEvents") or []
    if not isinstance(events, list):
        return [], errors or "invalid sportEvents payload"
    return events, errors


class GGBetParser:
    def __init__(self):
        self.sender = SenderToAnalyzer(SENDER_URL, SOURCE_NAME)
        self.running = False
        self.auth_token = None
        self.stats = {
            "connected": False,
            "events_tracked": 0,
            "events_sent": 0,
            "cycles": 0,
            "errors": 0,
            "last_update": None,
            "sports": {},
            "ws_reconnects": 0,
            "avg_cycle_ms": 0,
            "consecutive_empty_cycles": 0,
        }

    async def _get_token_via_playwright(self) -> str:
        """Use Playwright to capture the auth token with English locale"""
        try:
            from playwright.async_api import async_playwright
            captured_token = {"value": None}

            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True, args=['--no-sandbox'])
                context = await browser.new_context(
                    user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
                    locale="en-US"
                )
                page = await context.new_page()

                def on_ws(ws):
                    if 'gg-b-gql' in ws.url:
                        def on_sent(msg):
                            try:
                                data = json.loads(msg)
                                if data.get("type") == "connection_init":
                                    t = data.get("payload", {}).get("headers", {}).get("X-Auth-Token", "")
                                    if t:
                                        captured_token["value"] = t
                            except:
                                pass
                        ws.on("framesent", on_sent)

                page.on("websocket", on_ws)
                await page.goto("https://ggbet.ua/en", timeout=30000)
                await asyncio.sleep(8)
                await browser.close()

            if captured_token["value"]:
                logger.info(f"Got token via Playwright (len={len(captured_token['value'])})")
                return captured_token["value"]
            else:
                logger.error("Failed to capture token via Playwright")
                return ""
        except Exception as e:
            logger.error(f"Playwright token capture failed: {e}")
            return ""

    async def _connect_ws(self) -> Optional[websockets.WebSocketClientProtocol]:
        """Connect to GGBet GraphQL WS and return connection"""
        if not self.auth_token:
            logger.info("Getting auth token...")
            self.auth_token = await self._get_token_via_playwright()
            if not self.auth_token:
                return None

        try:
            ws = await websockets.connect(
                GGBET_GQL_WS,
                ssl=ssl.create_default_context(),
                additional_headers={
                    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
                    "Origin": "https://ggbet.ua",
                },
                subprotocols=["graphql-transport-ws", "graphql-ws"],
                ping_interval=20,
                ping_timeout=10,
                max_size=50 * 1024 * 1024,
            )
            await ws.send(json.dumps({
                "type": "connection_init",
                "payload": {"headers": {"X-Auth-Token": self.auth_token}}
            }))
            resp = await asyncio.wait_for(ws.recv(), timeout=10)
            data = json.loads(resp)
            if data.get("type") == "connection_ack":
                return ws
            logger.error(f"WS init failed: {data}")
            return None
        except Exception as e:
            logger.error(f"WS connect failed: {e}")
            return None

    async def _fetch_all_events(self, ws) -> list:
        """Fetch ALL events for ALL target sports with full markets in one shot"""
        match_statuses = []
        if PARSE_LIVE:
            match_statuses = ["LIVE", "SUSPENDED"]
        if PARSE_PREMATCH:
            match_statuses = ["NOT_STARTED"]

        # Send queries for all sports concurrently
        sport_list = [s for s in TARGET_SPORTS if SPORT_MAP.get(s)]
        for i, sport_id in enumerate(sport_list, 1):
            await ws.send(json.dumps({
                "id": str(i), "type": "start",
                "payload": {
                    "variables": {
                        "marketLimit": 200, "isTopMarkets": False, "isClient": True,
                        "favorite": False, "order": "RANK_RECOMMENDED",
                        "offset": 0, "limit": EVENT_LIST_LIMIT,
                        "sportEventTypes": ["MATCH"],
                        "marketStatuses": ["ACTIVE", "SUSPENDED"],
                        "marketStatusesForSportEvent": ["ACTIVE", "SUSPENDED"],
                        "matchStatuses": match_statuses,
                        "sportIds": [sport_id],
                    },
                    "extensions": {"persistedQuery": {"version": 1, "sha256Hash": HASH_GET_SPORT_EVENT_LIST}},
                    "operationName": "GetSportEventListByFilters"
                }
            }))

        # Collect all results
        all_events = []
        completed = 0
        target = len(sport_list)
        while completed < target:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=15)
                msg = json.loads(raw)
                if msg.get("type") in ("data", "next"):
                    events, response_error = _events_from_graphql_message(msg)
                    all_events.extend(events)
                    if response_error:
                        self.stats["errors"] += 1
                        logger.warning("GraphQL sport query returned partial error: %s", response_error)
                elif msg.get("type") in ("complete", "error"):
                    if msg.get("type") == "error":
                        self.stats["errors"] += 1
                        logger.warning("GraphQL sport query failed: %s", msg.get("payload"))
                    completed += 1
                elif msg.get("type") == "ka":
                    continue
            except asyncio.TimeoutError:
                break

        return all_events

    async def _fetch_cycle(self, ws) -> int:
        """Run one fetch cycle: get all events, transform, send. Returns events sent count."""
        events = await self._fetch_all_events(ws)
        sent = 0
        sport_counts = {}

        for event in events:
            if event.get("betStop"):
                continue
            game_data = transform_event_to_analyzer(event, SOURCE_NAME)
            if game_data:
                await self.sender.send_game(game_data)
                sent += 1
                sport = game_data.get("SportName", "unknown")
                sport_counts[sport] = sport_counts.get(sport, 0) + 1

        self.stats["sports"] = sport_counts
        return sent

    async def run(self):
        """Main polling loop"""
        self.running = True

        # Connect to analyzer
        if not await self.sender.connect():
            logger.error("Failed to connect to analyzer, retrying in 10s...")
            await asyncio.sleep(10)
            if not await self.sender.connect():
                logger.error("Failed to connect to analyzer after retry")
                return

        while self.running:
            ws = None
            try:
                # Connect to GGBet
                ws = await self._connect_ws()
                if not ws:
                    logger.error("GGBet WS connect failed, retrying in 10s...")
                    self.auth_token = None
                    self.stats["ws_reconnects"] += 1
                    await asyncio.sleep(10)
                    continue

                self.stats["connected"] = True
                logger.info("✅ Connected to GGBet, starting fetch loop")

                # Polling loop - reuse WS connection
                consecutive_errors = 0
                while self.running and consecutive_errors < 3:
                    try:
                        cycle_start = time.time()
                        sent = await self._fetch_cycle(ws)
                        cycle_ms = (time.time() - cycle_start) * 1000

                        self.stats["events_sent"] += sent
                        self.stats["events_tracked"] = sent
                        self.stats["cycles"] += 1
                        self.stats["avg_cycle_ms"] = round(cycle_ms)
                        self.stats["last_update"] = datetime.now(timezone.utc).isoformat()

                        if sent > 0:
                            logger.info(f"Cycle #{self.stats['cycles']}: sent {sent} events in {cycle_ms:.0f}ms | {self.stats['sports']}")
                            consecutive_errors = 0
                            self.stats["consecutive_empty_cycles"] = 0
                        else:
                            logger.warning(f"Cycle #{self.stats['cycles']}: 0 events")
                            # An empty official feed is not a transport error.
                            # Stay connected and poll slowly instead of launching a
                            # new Chromium login every few seconds.
                            self.stats["consecutive_empty_cycles"] += 1

                        # Wait before next cycle
                        elapsed = time.time() - cycle_start
                        interval = EMPTY_FETCH_INTERVAL if sent == 0 else FETCH_INTERVAL
                        wait = max(0.5, interval - elapsed)
                        await asyncio.sleep(wait)

                    except websockets.ConnectionClosed as e:
                        logger.warning(f"WS closed during cycle: {e}")
                        break
                    except Exception as e:
                        logger.error(f"Cycle error: {e}")
                        self.stats["errors"] += 1
                        consecutive_errors += 1
                        await asyncio.sleep(2)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Main loop error: {e}")
            finally:
                if ws:
                    try:
                        await ws.close()
                    except:
                        pass
                self.stats["connected"] = False

            # Reconnect delay
            self.stats["ws_reconnects"] += 1
            # A transport/idle close does not invalidate the captured token.
            # Reuse it on the next socket; _connect_ws() clears it through the
            # explicit connection-failure branch above if authentication is
            # actually rejected.  This avoids launching Chromium on every
            # harmless idle timeout while the official feed is empty.
            logger.info("Reconnecting in 5s...")
            await asyncio.sleep(5)

    async def stop(self):
        self.running = False
        await self.sender.close()


# === Health endpoint ===
parser_instance: Optional[GGBetParser] = None


async def health_handler(request):
    if parser_instance:
        stats = parser_instance.stats
        last_update = stats.get("last_update")
        last_update_age = None
        if last_update:
            try:
                last_update_age = (datetime.now(timezone.utc) - datetime.fromisoformat(last_update)).total_seconds()
            except (TypeError, ValueError):
                pass

        update_is_fresh = last_update_age is not None and last_update_age <= max(30, FETCH_INTERVAL * 5)
        ready = (
            stats["connected"]
            and update_is_fresh
            and stats["events_tracked"] > 0
            and stats["consecutive_empty_cycles"] < 3
        )
        payload = {
            "status": "ok" if ready else "degraded",
            "parser": SOURCE_NAME,
            "mode": "live" if PARSE_LIVE else "prematch",
            "stats": stats,
            "sender": parser_instance.sender.stats,
            "last_update_age_seconds": last_update_age,
        }
        return web.json_response(payload, status=200 if ready else 503)
    return web.json_response({"status": "starting"}, status=503)


async def start_health_server():
    app = web.Application()
    app.router.add_get("/health", health_handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", HEALTH_PORT)
    await site.start()
    logger.info(f"Health endpoint on :{HEALTH_PORT}/health")


async def main():
    global parser_instance

    logger.info(f"=== GGBet Parser starting ===")
    logger.info(f"Mode: {'LIVE' if PARSE_LIVE else 'PREMATCH'}")
    logger.info(f"Sender URL: {SENDER_URL}")
    logger.info(f"Fetch interval: {FETCH_INTERVAL}s")
    logger.info(f"Health port: {HEALTH_PORT}")
    logger.info(f"Target sports: {len(TARGET_SPORTS)}")

    parser_instance = GGBetParser()
    await start_health_server()

    loop = asyncio.get_event_loop()
    def shutdown_handler():
        logger.info("Shutdown signal received")
        asyncio.create_task(parser_instance.stop())
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, shutdown_handler)

    await parser_instance.run()


if __name__ == "__main__":
    asyncio.run(main())
