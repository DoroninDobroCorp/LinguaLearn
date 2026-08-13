import asyncio
import json
import logging
from websockets.client import connect
from typing import Optional
from urllib.parse import urlsplit, urlunsplit

logger = logging.getLogger(__name__)


def safe_endpoint(url: str) -> str:
    """Return a connection endpoint that is safe to include in logs.

    Analyzer credentials are passed in the WebSocket query string.  Logging the
    configured URL verbatim therefore leaks the credential into container logs.
    User info, query parameters and fragments are never needed for diagnostics.
    """
    parts = urlsplit(url)
    hostname = parts.hostname or ""
    if ":" in hostname and not hostname.startswith("["):
        hostname = f"[{hostname}]"
    netloc = hostname
    if parts.port is not None:
        netloc = f"{netloc}:{parts.port}"
    return urlunsplit((parts.scheme, netloc, parts.path, "", ""))


class SenderToAnalyzer:
    """Send data to analyzer via WebSocket"""

    def __init__(self, analyzer_url: str, parser_name: str = "GGBet"):
        self.analyzer_url = analyzer_url
        self.log_endpoint = safe_endpoint(analyzer_url)
        self.parser_name = parser_name
        self.websocket: Optional[object] = None
        self.stats = {"sent": 0, "errors": 0, "reconnects": 0, "dropped": 0}

    async def connect(self, max_retries: int = 10, retry_delay: int = 2) -> bool:
        for attempt in range(1, max_retries + 1):
            try:
                logger.info(
                    "[%s] Connecting to analyzer: %s (attempt %s/%s)",
                    self.parser_name,
                    self.log_endpoint,
                    attempt,
                    max_retries,
                )
                self.websocket = await connect(self.analyzer_url)
                logger.info(f"[{self.parser_name}] ✅ Connected to analyzer")
                return True
            except Exception as e:
                logger.error(f"[{self.parser_name}] Connection failed: {e}")
                if attempt < max_retries:
                    await asyncio.sleep(retry_delay * attempt)
                else:
                    logger.error(f"[{self.parser_name}] Failed after {max_retries} attempts")
                    return False
        return False

    async def send_game(self, game_data: dict) -> bool:
        if not self.websocket:
            logger.warning(f"[{self.parser_name}] WS not connected, reconnecting...")
            self.stats["reconnects"] += 1
            if not await self.connect():
                self.stats["dropped"] += 1
                return False
        try:
            message = json.dumps(game_data)
            await self.websocket.send(message)
            self.stats["sent"] += 1
            return True
        except Exception as e:
            logger.error(f"[{self.parser_name}] Send error: {e}")
            self.stats["errors"] += 1
            self.websocket = None
            return False

    async def close(self):
        if self.websocket:
            await self.websocket.close()
            logger.info(f"[{self.parser_name}] Stats: {self.stats}")
