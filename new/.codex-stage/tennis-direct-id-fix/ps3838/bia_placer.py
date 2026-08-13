import aiohttp
import asyncio
import logging
import math
import time
from typing import Any

log = logging.getLogger(__name__)


class BiaOrderUncertain(RuntimeError):
    """The order POST may have reached BIA; it is unsafe to retry it."""


def unwrap_bia_payload(body: Any) -> dict:
    """BIA wraps business payloads as {"status":"ok","data":{...}}."""
    if not isinstance(body, dict):
        raise RuntimeError(f"BIA response is not a dict (type={type(body).__name__})")
    if body.get("status") == "error":
        raise RuntimeError(f"BIA business error code={body.get('code') or 'unknown'}")
    data = body.get("data")
    if isinstance(data, dict):
        return data
    # Some endpoints already return the business object at the top level.
    return body


def _format_line(value) -> str:
    try:
        line = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"invalid handicap format: {value}") from exc
    if not math.isfinite(line):
        raise ValueError("invalid non-finite handicap")
    if line.is_integer():
        return str(int(line))
    return f"{line:g}"


def _format_asian_code(value) -> str:
    """Encode a human Asian line using BIA's exact quarter-unit contract."""
    try:
        line = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"invalid handicap format: {value}") from exc
    if not math.isfinite(line):
        raise ValueError("invalid non-finite handicap")
    scaled = line * 4.0
    code = round(scaled)
    if not math.isclose(scaled, code, rel_tol=0.0, abs_tol=1e-7):
        raise ValueError("BIA_ASIAN_LINE_NOT_QUARTER")
    return str(int(code))


def _swapped_side(side: str, swapped: bool) -> str:
    if not swapped:
        return side
    if side == "h":
        return "a"
    if side == "a":
        return "h"
    if side == "p1":
        return "p2"
    if side == "p2":
        return "p1"
    return side


def bia_bet_type_matches_exact(requested: str, returned: Any) -> bool:
    """Compare BIA identity, allowing only its explicit live-score wrapper."""
    requested = str(requested or "")
    returned = str(returned or "")
    if not requested or not returned:
        return False
    if returned == requested:
        return True
    parts = returned.split(",")
    if len(parts) < 6 or parts[:2] != ["for", "ir"]:
        return False
    try:
        int(parts[2])
        int(parts[3])
    except (TypeError, ValueError):
        return False
    return "for," + ",".join(parts[4:]) == requested


def map_selection_to_bia_bet_type(
    bet_type: int,
    team_select: int,
    handicap: float,
    swapped: bool,
    is_soccer: bool,
    period: int = 0,
    sport_code: str = "",
    game_number: int | None = None,
    map_number: int | None = None,
    esports_unit: str = "",
) -> str:
    # bet_type: 1=Moneyline, 2=Handicap, 3=Total, 4=IT1, 5=IT2
    # team_select: 0=Home/Over, 1=Away/Under, 2=Draw
    try:
        period = int(period or 0)
    except (TypeError, ValueError) as exc:
        raise ValueError("BIA_INVALID_PERIOD") from exc
    if period < 0:
        raise ValueError("BIA_INVALID_PERIOD")
    sport_code = str(sport_code or "").strip().lower()
    try:
        game_number = int(game_number or 0)
    except (TypeError, ValueError) as exc:
        raise ValueError("BIA_INVALID_GAME_NUMBER") from exc
    if game_number < 0:
        raise ValueError("BIA_INVALID_GAME_NUMBER")
    try:
        map_number = int(map_number or 0)
    except (TypeError, ValueError) as exc:
        raise ValueError("BIA_INVALID_MAP_NUMBER") from exc
    if map_number < 0 or map_number > 5:
        raise ValueError("BIA_INVALID_MAP_NUMBER")
    if map_number and sport_code not in {"esports", "e-sports"}:
        raise ValueError("BIA_MAP_REQUIRES_ESPORTS")
    esports_unit = str(esports_unit or "").strip().lower()
    if esports_unit not in {"", "rounds", "kills"}:
        raise ValueError("BIA_UNSUPPORTED_ESPORTS_UNIT")
    if esports_unit and sport_code not in {"esports", "e-sports"}:
        raise ValueError("BIA_ESPORTS_UNIT_REQUIRES_ESPORTS")

    def esports_prefix() -> str:
        if map_number:
            prefix = f"for,tmap,{map_number},"
        else:
            prefix = "for,tp,all,"
        if esports_unit == "kills":
            prefix += "sub,kills,"
        return prefix

    if sport_code == "tennis" and game_number:
        if period <= 0 or period > 5:
            raise ValueError("BIA_TENNIS_GAME_REQUIRES_SET")
        if bet_type != 1 or team_select not in (0, 1):
            raise ValueError("BIA_UNSUPPORTED_TENNIS_GAME_MARKET")
        side = _swapped_side("p1" if team_select == 0 else "p2", swapped=swapped)
        return f"for,tgame,{period},{game_number},vwhatever,{side}"

    # BIA tennis uses the root ``tennis`` event and serializes both full-match
    # and individual-set markets as tset.  The full match is set ``all``;
    # numbered periods are individual sets.  Do not fall through to the
    # generic ml/ah/over serializers: BIA rejects those for tennis with
    # validation_error.bet_type=invalid_bet_type.
    #
    # These mappings mirror the BIA frontend serializers for offers
    # tennis_match,{set}, tennis_ah,{set},game and
    # tennis_ahou,{set},game.
    if sport_code == "tennis":
        if period > 5:
            raise ValueError("BIA_UNSUPPORTED_TENNIS_PERIOD")
        set_no: int | str = period if period > 0 else "all"
        if bet_type == 1:
            if team_select not in (0, 1):
                raise ValueError("UNSUPPORTED_MONEYLINE_TEAM")
            side = _swapped_side("p1" if team_select == 0 else "p2", swapped=swapped)
            return f"for,tset,{set_no},vwhatever,{side}"
        if bet_type == 2:
            if team_select not in (0, 1):
                raise ValueError("UNSUPPORTED_HANDICAP_TEAM")
            side = _swapped_side("p1" if team_select == 0 else "p2", swapped=swapped)
            return f"for,tset,{set_no},vwhatever,game,ah,{side},{_format_asian_code(handicap)}"
        if bet_type == 3:
            if team_select not in (3, 4):
                raise ValueError("UNSUPPORTED_TOTALS_TEAM")
            direction = "ahover" if team_select == 3 else "ahunder"
            return f"for,tset,{set_no},vwhatever,game,{direction},{_format_asian_code(handicap)}"
        if bet_type in (4, 5):
            valid_team_selects = {
                4: {5: "tahover", 0: "tahunder"},
                5: {7: "tahover", 1: "tahunder"},
            }
            direction = valid_team_selects[bet_type].get(team_select)
            if direction is None:
                raise ValueError("UNSUPPORTED_TEAM_TOTAL_TEAM")
            side = "p1" if bet_type == 4 else "p2"
            side = _swapped_side(side, swapped=swapped)
            return (
                f"for,tset,{set_no},vwhole,game,{direction},{side},"
                f"{_format_asian_code(handicap)}"
            )
        raise ValueError("UNSUPPORTED_STANDARD_MARKET")

    # Basketball and soccer sub-periods are separate BIA sport namespaces.
    # Validate the lookup result so a missing/incorrect namespace cannot turn
    # a period leg into a full-match order.
    if period > 0:
        expected_basket = {
            1: "basket_q1", 2: "basket_q2", 3: "basket_q3", 4: "basket_q4",
            5: "basket_ht",
        }.get(period)
        if sport_code.startswith("basket"):
            if not expected_basket or sport_code != expected_basket:
                raise ValueError("BIA_UNSUPPORTED_BASKETBALL_PERIOD")
        elif sport_code.startswith("fb"):
            if period != 1 or sport_code not in {"fb_ht", "fb_corn_ht"}:
                raise ValueError("BIA_UNSUPPORTED_SOCCER_PERIOD")
        else:
            raise ValueError("BIA_UNSUPPORTED_PERIOD")

    if bet_type == 1:
        team_map = {
            0: _swapped_side("h", swapped=swapped),
            1: _swapped_side("a", swapped=swapped),
            2: "d",
        }
        side = team_map.get(team_select)
        if not side:
            raise ValueError("UNSUPPORTED_MONEYLINE_TEAM")
        if sport_code in {"esports", "e-sports"}:
            if team_select == 2:
                raise ValueError("UNSUPPORTED_ESPORTS_MAP_DRAW")
            return f"{esports_prefix()}ml,{side}"
        if is_soccer:
            return f"for,tp,reg,wdw,{side}"
        if team_select == 2:
            return "for,tp,reg,wdw,d"
        return f"for,ml,{side}"

    if bet_type == 2:
        if team_select not in (0, 1):
            raise ValueError("UNSUPPORTED_HANDICAP_TEAM")
        side = _swapped_side("h" if team_select == 0 else "a", swapped=swapped)
        code = _format_asian_code(handicap)
        if sport_code in {"esports", "e-sports"}:
            return f"{esports_prefix()}ah,{side},{code}"
        if is_soccer:
            return f"for,ah,{side},{code}"
        return f"for,ah,{side},{code}"

    if bet_type == 3:
        code = _format_asian_code(handicap)
        prefix = (
            esports_prefix()
            if sport_code in {"esports", "e-sports"}
            else "for,"
        )
        if team_select == 3:
            return f"{prefix}ahover,{code}"
        if team_select == 4:
            return f"{prefix}ahunder,{code}"
        raise ValueError("UNSUPPORTED_TOTALS_TEAM")

    if bet_type in (4, 5):
        valid_team_selects = {
            4: {5: "tahover", 0: "tahunder"},
            5: {7: "tahover", 1: "tahunder"},
        }
        direction = valid_team_selects[bet_type].get(team_select)
        if direction is None:
            raise ValueError("UNSUPPORTED_TEAM_TOTAL_TEAM")
        natural_side = "h" if bet_type == 4 else "a"
        side = _swapped_side(natural_side, swapped=swapped)
        code = _format_asian_code(handicap)
        prefix = (
            esports_prefix()
            if sport_code in {"esports", "e-sports"}
            else "for,"
        )
        return f"{prefix}{direction},{side},{code}"

    raise ValueError("UNSUPPORTED_STANDARD_MARKET")


def _money_pair(value: Any) -> tuple[str | None, float | None]:
    """Parse BIA money fields: ["GBP", 10.5] or bare number."""
    if value is None:
        return None, None
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        try:
            amount = float(value[1])
        except (TypeError, ValueError):
            return str(value[0]) if value[0] is not None else None, None
        if not math.isfinite(amount):
            return str(value[0]), None
        return str(value[0]), amount
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return None, None
    if not math.isfinite(amount):
        return None, None
    return None, amount


def extract_pin88_quote(
    accounts: Any,
    *,
    expected_bet_type: str | None = None,
) -> dict[str, Any] | None:
    """Extract pin88 price/min/max from create or GET betslip accounts.

    Live BIA shape:
      {"bookie":"pin88","status":"success",
       "price_list":[{"effective":{"price":1.78,"min":["GBP",0.85],"max":["GBP",800]}}]}
    Legacy/flat shape used by unit tests:
      {"bookie":"pin88","price":1.78,"min":10,"max":1000}
    """
    if not isinstance(accounts, list):
        return None
    for acc in accounts:
        if not isinstance(acc, dict):
            continue
        if str(acc.get("bookie", "")).strip().lower() != "pin88":
            continue
        if expected_bet_type is not None and not bia_bet_type_matches_exact(
            expected_bet_type, acc.get("bet_type"),
        ):
            continue

        price = acc.get("price")
        min_raw = acc.get("min")
        max_raw = acc.get("max")
        currency = acc.get("currency")

        price_list = acc.get("price_list")
        if isinstance(price_list, list) and price_list:
            effective = None
            for entry in price_list:
                if isinstance(entry, dict) and isinstance(entry.get("effective"), dict):
                    effective = entry["effective"]
                    break
            if effective is None and isinstance(price_list[0], dict):
                effective = price_list[0].get("effective") or price_list[0]
            if isinstance(effective, dict):
                if effective.get("price") is not None:
                    price = effective.get("price")
                if effective.get("min") is not None:
                    min_raw = effective.get("min")
                if effective.get("max") is not None:
                    max_raw = effective.get("max")

        cur_min, min_stake = _money_pair(min_raw)
        cur_max, max_stake = _money_pair(max_raw)
        if currency is None:
            currency = cur_min or cur_max

        try:
            price_f = float(price) if price is not None else None
        except (TypeError, ValueError):
            price_f = None
        if price_f is None or not math.isfinite(price_f):
            # Account present but quote not ready yet.
            return None

        return {
            "bookie": "pin88",
            "price": price_f,
            "min": min_stake,
            "max": max_stake,
            "currency": currency,
            "status": acc.get("status"),
            "raw_account_keys": sorted(acc.keys()),
        }
    return None




def classify_bia_order(order_data: Any, *, http_status: int = 200) -> dict[str, Any]:
    """Map BIA order payload to PLACED / PENDING / UNKNOWN / NOT_PLACED.

    Live BIA observed:
      - immediately after POST: status often "OPEN"/"open", closed=false, order_id present
      - after fill: status "done", closed=true, close_reason="order_filled", bets[].got_price
    """
    if not isinstance(order_data, dict):
        return {
            "status": "UNKNOWN",
            "error_code": "BIA_ORDER_RECONCILIATION_REQUIRED",
            "order_id": None,
            "bia_status": None,
            "close_reason": None,
        }

    order_id = order_data.get("order_id") or order_data.get("id")
    raw_status = order_data.get("status")
    bia_status = str(raw_status or "").strip().upper()
    close_reason = str(order_data.get("close_reason") or "").strip().lower()
    closed = order_data.get("closed")

    # Explicit failures
    fail_statuses = {"REJECTED", "FAILED", "CANCELLED", "DECLINED", "EXPIRED", "ERROR"}
    fail_reasons = {
        "order_rejected", "rejected", "cancelled", "canceled", "expired",
        "failed", "declined", "unplaced", "order_expired", "order_cancelled",
    }
    if bia_status in fail_statuses or close_reason in fail_reasons:
        return {
            "status": "NOT_PLACED",
            "error_code": "BIA_ORDER_REJECTED",
            "order_id": str(order_id) if order_id is not None else None,
            "bia_status": bia_status or None,
            "close_reason": close_reason or None,
        }

    success_statuses = {"PLACED", "CONFIRMED", "EXECUTED", "DONE", "FILLED", "MATCHED", "SUCCESS"}
    success_reasons = {"order_filled", "filled", "matched", "executed", "done"}
    if (
        bia_status in success_statuses
        or close_reason in success_reasons
        or (closed is True and close_reason == "order_filled")
    ):
        if order_id is None:
            return {
                "status": "UNKNOWN",
                "error_code": "BIA_ORDER_RECONCILIATION_REQUIRED",
                "order_id": None,
                "bia_status": bia_status or None,
                "close_reason": close_reason or None,
            }
        return {
            "status": "PLACED",
            "error_code": None,
            "order_id": str(order_id),
            "bia_status": bia_status or None,
            "close_reason": close_reason or None,
        }

    pending_statuses = {"OPEN", "PENDING", "PROCESSING", "ACCEPTED", "LIVE", "ACTIVE", "NEW"}
    if http_status == 202 or bia_status in pending_statuses or closed is False:
        return {
            "status": "PENDING" if order_id is not None or bia_status in pending_statuses else "UNKNOWN",
            "error_code": "BIA_ORDER_RECONCILIATION_REQUIRED",
            "order_id": str(order_id) if order_id is not None else None,
            "bia_status": bia_status or None,
            "close_reason": close_reason or None,
        }

    # Unknown shape — never claim PLACED without confirmation.
    return {
        "status": "UNKNOWN",
        "error_code": "BIA_ORDER_RECONCILIATION_REQUIRED",
        "order_id": str(order_id) if order_id is not None else None,
        "bia_status": bia_status or None,
        "close_reason": close_reason or None,
    }


class BiaPlacer:
    def __init__(self, username, password, base_url="https://black.betinasia.com"):
        self.username = username
        self.password = password
        self.base_url = base_url.rstrip("/")
        self.token = None
        self._session = None
        self._lock = asyncio.Lock()

    async def start(self):
        if not self._session or self._session.closed:
            self._session = aiohttp.ClientSession()

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None

    def _clear_token(self) -> None:
        self.token = None

    async def ensure_token(self):
        await self.start()
        if self.token:
            return self.token
        async with self._lock:
            if self.token:
                return self.token
            url = f"{self.base_url}/web/sessions/"
            headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Origin": self.base_url,
                "Referer": self.base_url + "/",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            }
            payload = {"username": self.username, "password": self.password}
            timeout = aiohttp.ClientTimeout(total=5.0)
            async with self._session.post(url, json=payload, headers=headers, timeout=timeout) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    payload_data = unwrap_bia_payload(data) if isinstance(data, dict) and "data" in data else data
                    if not isinstance(payload_data, dict) or "session_id" not in payload_data:
                        # legacy nested shape: data.session_id
                        if isinstance(data, dict) and isinstance(data.get("data"), dict) and "session_id" in data["data"]:
                            payload_data = data["data"]
                        else:
                            keys = sorted(data.keys()) if isinstance(data, dict) else []
                            raise RuntimeError(f"Invalid BIA session response keys={keys}")
                    self.token = payload_data["session_id"]
                    log.info("Successfully logged in to BIA")
                    return self.token
                await resp.read()
                raise RuntimeError(f"BIA login failed: HTTP {resp.status}")

    async def _headers(self, *, content_json: bool = False) -> dict:
        token = await self.ensure_token()
        headers = {
            "Accept": "application/json",
            "Origin": self.base_url,
            "Referer": self.base_url + "/",
            "session": token,
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        }
        if content_json:
            headers["Content-Type"] = "application/json"
        return headers

    async def _auth_retry_once(self, do_request):
        """Retry once after clearing an expired session token.

        Only for safe/idempotent calls — never for order placement.
        """
        resp_status, body = await do_request()
        if resp_status != 401:
            return resp_status, body
        log.warning("BIA session expired (HTTP 401); refreshing token once")
        self._clear_token()
        return await do_request()

    async def create_betslip(self, sport, event_id, bet_type):
        payload = {
            "sport": sport,
            "event_id": event_id,
            "bet_type": bet_type,
            "equivalent_bets": False,
            "want_bookies": ["pin88"],
        }
        url = f"{self.base_url}/v1/betslips/"
        timeout = aiohttp.ClientTimeout(total=5.0)

        async def _once():
            headers = await self._headers(content_json=True)
            async with self._session.post(url, json=payload, headers=headers, timeout=timeout) as resp:
                try:
                    body = await resp.json()
                except aiohttp.ContentTypeError:
                    body = await resp.text()
                return resp.status, body

        status, body = await self._auth_retry_once(_once)
        if status in (200, 201, 202):
            data = unwrap_bia_payload(body) if isinstance(body, dict) else body
            if not isinstance(data, dict):
                raise RuntimeError("BIA betslip response is not a dict")
            if str(data.get("bet_type") or "") != str(bet_type):
                betslip_id = str(data.get("betslip_id") or "")
                if betslip_id:
                    await self.delete_betslip(betslip_id)
                raise RuntimeError("BIA_BET_TYPE_MISMATCH")
            if data.get("equivalent_bets") is not False:
                betslip_id = str(data.get("betslip_id") or "")
                if betslip_id:
                    await self.delete_betslip(betslip_id)
                raise RuntimeError("BIA_EQUIVALENT_BETS_NOT_DISABLED")
            # Normalize to flat business object for callers.
            return data
        # BIA returns actionable validation details for malformed/unsupported
        # bet types.  Preserve a bounded representation so callers and logs can
        # distinguish a mapping bug from a genuinely unavailable line.
        body_summary = repr(body)
        if len(body_summary) > 600:
            body_summary = body_summary[:597] + "..."
        raise RuntimeError(f"BIA create betslip failed: HTTP {status}; body={body_summary}")

    async def discover_tennis_game_set(
        self,
        event_id: str,
        game_number: int,
        side: str,
        *,
        max_sets: int = 5,
        cache_ttl_sec: float = 45.0,
    ) -> tuple[int, dict[str, Any] | None]:
        """Disabled: market availability/price must never discover identity.

        Returns ``(set_number, created_betslip)``. On a cache hit the second
        item is None; on discovery it is the already-created winning betslip,
        so the caller can use it for the quote instead of creating it again.
        All non-winning probes are deleted. Ambiguous/no-offer results fail
        closed and are never cached.
        """
        raise RuntimeError("BIA_TENNIS_GAME_SET_DISCOVERY_DISABLED")

        # Kept temporarily below as unreachable rollback context; production
        # callers must use central raw-offer proof with explicit set+game.
        game_number = int(game_number)
        side = str(side or "").strip().lower()
        if game_number <= 0 or side not in {"p1", "p2"}:
            raise ValueError("BIA_INVALID_TENNIS_GAME_DISCOVERY")
        key = (str(event_id), game_number)
        cached = self._tennis_game_set_cache.get(key)
        now = time.monotonic()
        if cached and cached[1] > now:
            return cached[0], None
        self._tennis_game_set_cache.pop(key, None)

        event_key = str(event_id)
        event_cached = self._tennis_event_set_cache.get(event_key)
        if event_cached and event_cached[1] > now:
            cached_set = event_cached[0]
            expected_bet_type = f"for,tgame,{cached_set},{game_number},vwhatever,{side}"
            created = await self.create_betslip(
                "tennis",
                event_id,
                expected_bet_type,
            )
            offered = {
                str(bookie or "").strip().lower()
                for bookie in (created.get("bookies_with_offers") or [])
            }
            has_pin_account = any(
                isinstance(account, dict)
                and str(account.get("bookie") or "").strip().lower() == "pin88"
                and bia_bet_type_matches_exact(expected_bet_type, account.get("bet_type"))
                for account in (created.get("accounts") or [])
            )
            pin_accounts_present = any(
                isinstance(account, dict)
                and str(account.get("bookie") or "").strip().lower() == "pin88"
                for account in (created.get("accounts") or [])
            )
            if has_pin_account or ("pin88" in offered and not pin_accounts_present):
                self._tennis_game_set_cache[key] = (
                    cached_set,
                    now + max(1.0, float(cache_ttl_sec)),
                )
                return cached_set, created
            if created.get("betslip_id"):
                await self.delete_betslip(str(created["betslip_id"]))
            self._tennis_event_set_cache.pop(event_key, None)
        elif event_cached:
            self._tennis_event_set_cache.pop(event_key, None)

        candidates: list[tuple[int, dict[str, Any]]] = []
        created_for_cleanup: list[dict[str, Any]] = []
        try:
            set_numbers = list(range(1, max(1, int(max_sets)) + 1))
            probes = await asyncio.gather(*(
                self.create_betslip(
                    "tennis",
                    event_id,
                    f"for,tgame,{set_number},{game_number},vwhatever,{side}",
                )
                for set_number in set_numbers
            ), return_exceptions=True)
            probe_errors: list[BaseException] = []
            for set_number, probe in zip(set_numbers, probes):
                if isinstance(probe, BaseException):
                    probe_errors.append(probe)
                    continue
                created = probe
                created_for_cleanup.append(created)
                offered = {
                    str(bookie or "").strip().lower()
                    for bookie in (created.get("bookies_with_offers") or [])
                }
                accounts = created.get("accounts") or []
                expected_bet_type = f"for,tgame,{set_number},{game_number},vwhatever,{side}"
                has_pin_account = any(
                    isinstance(account, dict)
                    and str(account.get("bookie") or "").strip().lower() == "pin88"
                    and bia_bet_type_matches_exact(expected_bet_type, account.get("bet_type"))
                    for account in accounts
                )
                pin_accounts_present = any(
                    isinstance(account, dict)
                    and str(account.get("bookie") or "").strip().lower() == "pin88"
                    for account in accounts
                )
                if has_pin_account or ("pin88" in offered and not pin_accounts_present):
                    candidates.append((set_number, created))

            if probe_errors:
                raise RuntimeError(
                    "BIA_TENNIS_GAME_SET_PROBE_FAILED "
                    f"count={len(probe_errors)} first={probe_errors[0]}"
                )

            if len(candidates) != 1:
                raise RuntimeError(
                    "BIA_TENNIS_GAME_SET_NOT_UNIQUE "
                    f"candidates={[item[0] for item in candidates]}"
                )

            selected_set, selected = candidates[0]
            self._tennis_game_set_cache[key] = (
                selected_set,
                now + max(1.0, float(cache_ttl_sec)),
            )
            # A live tennis event remains in the same set across several
            # games. Revalidate this hint on every new game; discard it as
            # soon as BIA no longer offers that set (set transition).
            self._tennis_event_set_cache[event_key] = (selected_set, now + 900.0)
            selected_id = selected.get("betslip_id")
            await asyncio.gather(*(
                self.delete_betslip(str(created["betslip_id"]))
                for created in created_for_cleanup
                if created.get("betslip_id") and created.get("betslip_id") != selected_id
            ), return_exceptions=True)
            return selected_set, selected
        except Exception:
            await asyncio.gather(*(
                self.delete_betslip(str(created["betslip_id"]))
                for created in created_for_cleanup
                if created.get("betslip_id")
            ), return_exceptions=True)
            raise

    async def get_betslip(self, betslip_id: str) -> dict:
        if not betslip_id:
            raise ValueError("betslip_id is required")
        url = f"{self.base_url}/v1/betslips/{betslip_id}/"
        timeout = aiohttp.ClientTimeout(total=5.0)

        async def _once():
            headers = await self._headers()
            async with self._session.get(url, headers=headers, timeout=timeout) as resp:
                try:
                    body = await resp.json()
                except aiohttp.ContentTypeError:
                    body = await resp.text()
                return resp.status, body

        status, body = await self._auth_retry_once(_once)
        if status == 200 and isinstance(body, dict):
            return unwrap_bia_payload(body)
        raise RuntimeError(f"BIA get betslip failed: HTTP {status} - {body}")

    async def refresh_betslip(self, betslip_id: str) -> None:
        """Best-effort POST refresh; prices still come from subsequent GET."""
        if not betslip_id:
            return
        url = f"{self.base_url}/v1/betslips/{betslip_id}/refresh/"
        timeout = aiohttp.ClientTimeout(total=5.0)
        try:
            async def _once():
                headers = await self._headers(content_json=True)
                async with self._session.post(url, headers=headers, json={}, timeout=timeout) as resp:
                    await resp.read()
                    return resp.status, None
            await self._auth_retry_once(_once)
        except Exception as exc:
            log.warning("BIA refresh betslip %s failed: %s", betslip_id, exc)

    async def wait_for_pin88_quote(
        self,
        betslip_id: str,
        *,
        expected_bet_type: str,
        attempts: int = 6,
        delay_sec: float = 0.35,
    ) -> dict[str, Any]:
        """Poll GET betslip until pin88 publishes an effective price, or fail."""
        last_accounts = None
        for i in range(max(1, attempts)):
            if i == 1:
                await self.refresh_betslip(betslip_id)
            data = await self.get_betslip(betslip_id)
            last_accounts = data.get("accounts")
            quote = extract_pin88_quote(
                last_accounts,
                expected_bet_type=expected_bet_type,
            )
            if quote is not None:
                return quote
            await asyncio.sleep(delay_sec)
        raise RuntimeError("Pinnacle target account not offered in BIA betslip (no pin88 price)")

    async def delete_betslip(self, betslip_id):
        if not betslip_id:
            return
        url = f"{self.base_url}/v1/betslips/{betslip_id}/"
        timeout = aiohttp.ClientTimeout(total=5.0)
        try:
            async def _once():
                headers = await self._headers()
                async with self._session.delete(url, headers=headers, timeout=timeout) as resp:
                    await resp.read()
                    return resp.status, None

            await self._auth_retry_once(_once)
        except Exception as e:
            log.warning("BIA delete betslip %s failed: %s", betslip_id, e)

    async def place_order(self, betslip_id, price, stake_amount, currency="EUR"):
        """Submit exactly once; callers must reconcile any non-final response.

        Never auto-retries on auth failure: a second POST could create a second wager.
        """
        headers = await self._headers(content_json=True)
        payload = {
            "betslip_id": betslip_id,
            "price": price,
            "stake": [currency, stake_amount],
        }
        url = f"{self.base_url}/v1/orders/"
        timeout = aiohttp.ClientTimeout(total=10.0)
        async with self._session.post(url, json=payload, headers=headers, timeout=timeout) as resp:
            try:
                body = await resp.json()
            except aiohttp.ContentTypeError:
                body = None
            if resp.status in (200, 201, 202):
                if not isinstance(body, dict):
                    raise RuntimeError("BIA place order response is not a dict")
                if body.get("status") == "error":
                    raise RuntimeError(f"BIA order business error: {body.get('message') or body.get('code')}")
                # Preserve transport status; unwrap business payload when present.
                data = unwrap_bia_payload(body) if "data" in body else body
                return {"_bia_http_status": resp.status, "data": data if isinstance(data, dict) else body}
            if resp.status == 401:
                self._clear_token()
                raise RuntimeError("BIA place order auth failed: HTTP 401")
            if resp.status >= 500:
                raise BiaOrderUncertain(f"BIA order response HTTP {resp.status}")
            raise RuntimeError(f"BIA place order failed: HTTP {resp.status}")

    async def get_order(self, order_id):
        """Read a previously submitted BIA order; never submits a new wager."""
        if not order_id:
            raise ValueError("order_id is required for reconciliation")
        timeout = aiohttp.ClientTimeout(total=5.0)
        url = f"{self.base_url}/v1/orders/{order_id}/"

        async def _once():
            headers = await self._headers()
            async with self._session.get(url, headers=headers, timeout=timeout) as resp:
                try:
                    body = await resp.json()
                except aiohttp.ContentTypeError:
                    body = None
                return resp.status, body

        status, body = await self._auth_retry_once(_once)
        if status == 200 and isinstance(body, dict):
            return unwrap_bia_payload(body)
        if status >= 500:
            raise BiaOrderUncertain(f"BIA order lookup HTTP {status}")
        raise RuntimeError(f"BIA order lookup failed: HTTP {status}")
