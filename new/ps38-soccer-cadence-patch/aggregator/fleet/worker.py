"""worker: fleet Worker per-account browser-WS (Story 27.40 port).

Race-safe cfg-dict, no global os.environ reads, <=1 r/s MORE_BET.
Failure isolated. Pure normalize_full_odds/sub_body testable without network.
"""
from __future__ import annotations

import asyncio
import copy
import json
import math
import os
import shutil
import subprocess
import time
from typing import Any, Callable, cast

try:
    import orjson as _jmod
except ImportError:
    import json as _jmod  # type: ignore[no-redef]

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)
WS_INT = (
    "window.__fr=[];window.__ws=null;"
    "(function(){const O=window.WebSocket;window.WebSocket=function(...a){"
    "const w=new O(...a);window.__ws=w;"
    "w.addEventListener('message',e=>{"
    "try{window.__fr.push(e.data)}catch(_){}});return w};"
    "window.WebSocket.prototype=O.prototype})();"
)
MIN_INTERVAL = 1.0
_BO = chr(123)
_BC = chr(125)
DEFAULT_SILENT_DROP_MIN_SENT = 10
DEFAULT_SILENT_DROP_MIN_RATIO = 0.5
DEFAULT_RESNAPSHOT_SEC = 60.0
SOCCER_SPORT_ID = 29
MAX_BROWSER_FRAME_FUTURE_SKEW_SEC = 5.0
CONFIRMED_BASE_MARKET_KEYS = (
    "Win1x2",
    "Totals",
    "Handicap",
    "FirstTeamTotals",
    "SecondTeamTotals",
)
SPORT_MK_OVERRIDE = {
    19: 0,  # Hockey: historical EXP31.8 found mk=0 as the only populated lane.
}
SIDEBAR_FALLBACK_LABELS = {
    # Story 27.27 P4 confirmed that sidebar navigation can activate sports
    # whose direct compact URL leaves the app on the default feed.
    "hockey": ("Hockey", "Ice Hockey"),
    "table-tennis": ("Table Tennis", "Table tennis", "Table-Tennis"),
}


def _fatal_auth_marker(body_text: Any) -> str:
    """Return a terminal account state that positive UI markers must not mask."""
    body_lower = str(body_text or "").lower()
    if (
        "your account has been suspended" in body_lower
        or "account has been suspended" in body_lower
        or "you are not permitted to see this page" in body_lower
    ):
        return "account suspended"
    if "account has been closed" in body_lower:
        return "account closed"
    return ""


def _browser_executable() -> str | None:
    """Resolve browser executable for the CDP-launched fleet worker."""
    configured = os.environ.get("PS3838_BROWSER_EXECUTABLE_PATH", "").strip()
    if configured:
        return configured
    return (
        shutil.which("google-chrome")
        or shutil.which("chromium")
        or shutil.which("chromium-browser")
    )


def silent_drop_alert(
    *,
    sent: int,
    answered: int,
    min_sent: int = DEFAULT_SILENT_DROP_MIN_SENT,
    min_ratio: float = DEFAULT_SILENT_DROP_MIN_RATIO,
) -> bool:
    """True when MORE_BET responses fall below the expected answer ratio."""
    if sent < min_sent:
        return False
    ratio = answered / sent if sent > 0 else 0.0
    return ratio < min_ratio


def _iter_raw_events_for_key(odds: dict[str, Any], sport: int, key: str) -> list[list[Any]]:
    """Return raw event rows for one odds key and subscribed sport."""
    events: list[list[Any]] = []
    node = odds.get(key)
    if not isinstance(node, list):
        return events
    for sp in node:
        if not (isinstance(sp, list) and len(sp) >= 3 and sp[0] == sport):
            continue
        if not isinstance(sp[2], list):
            continue
        for lg in sp[2]:
            if not (isinstance(lg, list) and len(lg) >= 3 and isinstance(lg[2], list)):
                continue
            for ev in lg[2]:
                if isinstance(ev, list):
                    events.append(ev)
    return events


def _iter_raw_events(odds: dict[str, Any], sport: int) -> list[list[Any]]:
    """Return raw event rows for the subscribed sport from FULL_ODDS-like odds."""
    events: list[list[Any]] = []
    for tk in ("l", "n", "u"):
        events.extend(_iter_raw_events_for_key(odds, sport, tk))
    return events


def raw_event_counts_by_key(odds: dict[str, Any], sport: int) -> dict[str, int]:
    """Diagnostics: count raw events for subscribed sport under l/n/u."""
    return {
        key: len(_iter_raw_events_for_key(odds, sport, key))
        for key in ("l", "n", "u")
        if isinstance(odds.get(key), list)
    }


def _browser_frame_timestamp(
    frame: dict[str, Any], *, now: float | None = None
) -> float | None:
    """Return the browser WS frame timestamp in Unix seconds, fail-closed."""
    raw = frame.get("time")
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        return None
    timestamp = float(raw) / 1000.0
    current = time.time() if now is None else float(now)
    if (
        not math.isfinite(timestamp)
        or timestamp <= 0
        or timestamp > current + MAX_BROWSER_FRAME_FUTURE_SKEW_SEC
    ):
        return None
    return timestamp


def _has_positive_price(value: Any) -> bool:
    """Whether a market group contains an observed decimal-odds leaf."""
    if isinstance(value, list):
        return any(_has_positive_price(item) for item in value)
    if not isinstance(value, dict):
        return False
    if "value" in value:
        try:
            price = float(value["value"])
        except (TypeError, ValueError):
            price = 0.0
        if math.isfinite(price) and price > 1.0:
            return True
    return any(
        _has_positive_price(item) for key, item in value.items() if key != "value"
    )


def _stamp_confirmed_market_ts(event: dict[str, Any], timestamp: float | None) -> None:
    """Stamp only base groups physically present in this browser WS frame."""
    if timestamp is None or not math.isfinite(timestamp) or timestamp <= 0:
        return
    periods = event.get("Periods")
    if not isinstance(periods, list):
        return
    for period in periods:
        if not isinstance(period, dict):
            continue
        existing = period.get("_market_ts")
        market_ts = dict(existing) if isinstance(existing, dict) else {}
        for market_key in CONFIRMED_BASE_MARKET_KEYS:
            if not _has_positive_price(period.get(market_key)):
                continue
            previous = market_ts.get(market_key)
            if (
                isinstance(previous, (int, float))
                and not isinstance(previous, bool)
                and math.isfinite(float(previous))
                and float(previous) > timestamp
            ):
                continue
            market_ts[market_key] = timestamp
        if market_ts:
            period["_market_ts"] = market_ts


def _exact_u_int(value: Any) -> int | None:
    """Return one finite integral WS coordinate, otherwise fail closed."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(float(value)) or int(value) != value:
        return None
    return int(value)


def _exact_u_handicap(value: Any, bet_type: int) -> float | None:
    """Normalize the only wire/canonical representation difference for 1X2.

    Complete snapshots provenance 1X2 leaves with ``handicap=0`` whereas the
    compact browser delta has ``null`` in that slot.  All other values must be
    finite numeric values; no guessed line lookup is allowed.
    """
    if value is None and bet_type == 1:
        return 0.0
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    result = float(value)
    return result if math.isfinite(result) else None


def _u_row_coordinate(row: Any) -> tuple[int, int, int, float, int, int, int] | None:
    """Decode the observed compact ``UPDATE_ODDS.odds.u`` row identity.

    Browser evidence is a flat row:
    ``[period, bet_type, team_select, handicap, _, price, line_id, ...,
    ..., ..., ..., is_alt, event_id]``.  Every coordinate is required so a
    delta can only mutate a leaf explicitly proven by a complete snapshot.
    """
    if not isinstance(row, list) or len(row) <= 12:
        return None
    period = _exact_u_int(row[0])
    bet_type = _exact_u_int(row[1])
    team_select = _exact_u_int(row[2])
    line_id = _exact_u_int(row[6])
    event_id = _exact_u_int(row[12])
    is_alt = _exact_u_int(row[11])
    if None in (period, bet_type, team_select, line_id, event_id, is_alt):
        return None
    handicap = _exact_u_handicap(row[3], bet_type)
    if handicap is None or line_id <= 0 or event_id <= 1_500_000_000:
        return None
    return (period, bet_type, team_select, handicap, line_id, is_alt, event_id)


def _u_row_price(row: Any) -> float | None:
    """Return an observed open decimal price from an exact compact row."""
    if not isinstance(row, list) or len(row) <= 5:
        return None
    try:
        price = float(row[5])
    except (TypeError, ValueError):
        return None
    return price if math.isfinite(price) and price > 1.0 else None


def _price_confirmed_at(timestamp: float) -> str | None:
    """Format only a browser-frame timestamp with the parser's canonical clock."""
    try:
        from parsing.parser_utils import format_created_at  # noqa: PLC0415

        return format_created_at(int(timestamp * 1_000_000_000))
    except (ImportError, OverflowError, ValueError):
        return None


class NormalizedEventDeltaCache:
    """Worker-local full-snapshot cache for compact browser WS price deltas.

    The cache deliberately indexes *canonical leaves*, not raw event arrays.
    A compact delta may update an existing, fully normalized leaf only when
    its complete browser provenance tuple matches exactly.  New markets,
    unknown events, missing line ids and malformed rows all fail closed.
    """

    def __init__(self) -> None:
        self._events: dict[tuple[int, int], dict[str, Any]] = {}
        self._leaves: dict[
            tuple[int, int],
            dict[tuple[int, int, int, float, int, int, int], tuple[dict[str, Any], dict[str, Any], str]],
        ] = {}
        self._row_lookup: dict[
            tuple[int, tuple[int, int, int, float, int, int, int]],
            tuple[tuple[int, int], tuple[dict[str, Any], dict[str, Any], str]],
        ] = {}

    @staticmethod
    def _leaf_coordinate(raw: Any) -> tuple[int, int, int, float, int, int, int] | None:
        if not isinstance(raw, dict):
            return None
        period = _exact_u_int(raw.get("period"))
        bet_type = _exact_u_int(raw.get("bet_type"))
        team_select = _exact_u_int(raw.get("team_select"))
        line_id = _exact_u_int(raw.get("line_id"))
        event_id = _exact_u_int(raw.get("event_id"))
        is_alt = _exact_u_int(raw.get("is_alt", 0))
        if None in (period, bet_type, team_select, line_id, event_id, is_alt):
            return None
        handicap = _exact_u_handicap(raw.get("handicap"), bet_type)
        if handicap is None or line_id <= 0 or event_id <= 1_500_000_000:
            return None
        return (period, bet_type, team_select, handicap, line_id, is_alt, event_id)

    @classmethod
    def _index_event(
        cls, event: dict[str, Any]
    ) -> dict[tuple[int, int, int, float, int, int, int], tuple[dict[str, Any], dict[str, Any], str]]:
        indexed: dict[
            tuple[int, int, int, float, int, int, int], tuple[dict[str, Any], dict[str, Any], str]
        ] = {}
        periods = event.get("Periods")
        if not isinstance(periods, list):
            return indexed
        for period in periods:
            if not isinstance(period, dict):
                continue
            for market_key in CONFIRMED_BASE_MARKET_KEYS:
                market = period.get(market_key)
                if not isinstance(market, dict):
                    continue
                # Win1x2 is a flat map; the remaining base groups are line maps.
                candidates: list[Any]
                if market_key == "Win1x2":
                    candidates = list(market.values())
                else:
                    candidates = [
                        selection
                        for line in market.values()
                        if isinstance(line, dict)
                        for selection in line.values()
                    ]
                for leaf in candidates:
                    if not isinstance(leaf, dict):
                        continue
                    coordinate = cls._leaf_coordinate(leaf.get("raw"))
                    if coordinate is not None:
                        indexed[coordinate] = (leaf, period, market_key)
        return indexed

    def seed(self, sport: int, events: list[dict[str, Any]]) -> None:
        """Replace cached events only with complete normalized snapshots."""
        for incoming in events:
            pid = _exact_u_int(incoming.get("Pid"))
            if pid is None or pid <= 1_500_000_000:
                continue
            cached = copy.deepcopy(incoming)
            key = (int(sport), pid)
            for coordinate in self._leaves.get(key, {}):
                lookup_key = (int(sport), coordinate)
                if self._row_lookup.get(lookup_key, (None, None))[0] == key:
                    self._row_lookup.pop(lookup_key, None)
            self._events[key] = cached
            leaves = self._index_event(cached)
            self._leaves[key] = leaves
            for coordinate, target in leaves.items():
                self._row_lookup[(int(sport), coordinate)] = (key, target)

    def apply(self, frame: dict[str, Any], sport: int) -> list[dict[str, Any]]:
        """Apply proven compact ``odds.u`` prices and return changed snapshots."""
        timestamp = _browser_frame_timestamp(frame)
        odds = frame.get("odds")
        if timestamp is None or not isinstance(odds, dict):
            return []
        groups = odds.get("u")
        if not isinstance(groups, list):
            return []
        changed: dict[tuple[int, int], set[tuple[int, str]]] = {}
        for group in groups:
            if not (isinstance(group, list) and len(group) == 2 and group[0] == sport):
                continue
            rows = group[1]
            if not isinstance(rows, list):
                continue
            for row in rows:
                coordinate = _u_row_coordinate(row)
                price = _u_row_price(row)
                if coordinate is None or price is None:
                    continue
                cached_target = self._row_lookup.get((int(sport), coordinate))
                if cached_target is None:
                    continue
                key, target = cached_target
                leaf, period, market_key = target
                leaf["value"] = price
                periods = self._events[key].get("Periods")
                if isinstance(periods, list):
                    try:
                        period_index = periods.index(period)
                    except ValueError:
                        continue
                    changed.setdefault(key, set()).add((period_index, market_key))
        confirmed_at = _price_confirmed_at(timestamp)
        out: list[dict[str, Any]] = []
        for key, touched in changed.items():
            event = self._events[key]
            periods = event.get("Periods")
            if not isinstance(periods, list):
                continue
            for period_index, market_key in touched:
                if period_index >= len(periods) or not isinstance(periods[period_index], dict):
                    continue
                market_ts = dict(periods[period_index].get("_market_ts") or {})
                market_ts[market_key] = timestamp
                periods[period_index]["_market_ts"] = market_ts
            if confirmed_at is not None:
                event["PriceConfirmedAt"] = confirmed_at
            # The poster may retain an envelope after this worker receives the
            # next WS frame, so never hand it the mutable cache object itself.
            out.append(copy.deepcopy(event))
        return out


def normalize_browser_ws_frame(
    frame: dict[str, Any], sport: int, cache: NormalizedEventDeltaCache
) -> list[dict[str, Any]]:
    """Normalize a complete frame, or patch a proven cached event from ``u``."""
    odds = frame.get("odds")
    compact_u = (
        frame.get("type") == "UPDATE_ODDS"
        and isinstance(odds, dict)
        and isinstance(odds.get("u"), list)
        and any(
            isinstance(group, list) and len(group) == 2 and group[0] == sport
            for group in odds["u"]
        )
    )
    if compact_u:
        return cache.apply(frame, sport)
    complete = normalize_full_odds(frame, sport)
    if complete:
        cache.seed(sport, complete)
        return complete
    if frame.get("type") == "UPDATE_ODDS":
        return cache.apply(frame, sport)
    return []


def _minimal_raw_events(frame: dict[str, Any], sport: int, version: float) -> list[dict[str, Any]]:
    """Backward-compatible Pid-only fallback for malformed test/edge frames."""
    odds = frame.get("odds")
    if not isinstance(odds, dict):
        return []
    out: list[dict[str, Any]] = []
    seen: set[int] = set()
    for ev in _iter_raw_events(odds, sport):
        if not (ev and isinstance(ev[0], int)):
            continue
        pid = ev[0]
        if pid <= 1_500_000_000 or pid in seen:
            continue
        seen.add(pid)
        out.append(dict(Pid=pid, SportId=sport, _v=version, raw=ev))
    return out


def normalize_full_odds(frame: dict[str, Any], sport: int) -> list[dict[str, Any]]:
    """FULL_ODDS/UPDATE_ODDS frame -> parsed GameData events.

    Walks odds.l / odds.n (live/prematch):
      [sport, [..., [league, [..., [event...]]]]]
    """
    odds = frame.get("odds")
    if not isinstance(odds, dict):
        return []
    btg = frame.get("btg")
    try:
        version = float(btg) if btg is not None else 0.0
    except (TypeError, ValueError):
        version = 0.0

    raw_by_pid: dict[int, list[Any]] = {}
    for ev in _iter_raw_events(odds, sport):
        if ev and isinstance(ev[0], int):
            raw_by_pid.setdefault(ev[0], ev)

    parsed: list[dict[str, Any]] = []
    confirmed_market_ts = _browser_frame_timestamp(frame)
    source_time_ms = frame.get("time")
    if not isinstance(source_time_ms, int):
        source_time_ms = None

    from parsing.parser import parse_ps3838_all_sports  # noqa: PLC0415

    for key, is_live in (("l", True), ("n", False), ("u", True)):
        node = odds.get(key)
        if not isinstance(node, list) or not node:
            continue
        parsed.extend(
            parse_ps3838_all_sports(
                {"odds": {key: node}},
                is_live=is_live,
                source_time_ms=source_time_ms,
            )
        )

    if not parsed and any(isinstance(odds.get(key), list) for key in ("e", "e1")):
        parsed.extend(
            parse_ps3838_all_sports(
                {"odds": {key: odds[key] for key in ("e", "e1") if isinstance(odds.get(key), list)}},
                is_live=True,
                source_time_ms=source_time_ms,
            )
        )

    out: list[dict[str, Any]] = []
    seen: set[int] = set()
    for game in parsed:
        pid = game.get("Pid")
        if not isinstance(pid, int) or pid <= 1_500_000_000 or pid in seen:
            continue
        if game.get("sport_id") not in (None, sport):
            continue
        seen.add(pid)
        event = dict(game)
        _stamp_confirmed_market_ts(event, confirmed_market_ts)
        event.setdefault("SportId", sport)
        event["_v"] = version
        if pid in raw_by_pid:
            event.setdefault("raw", raw_by_pid[pid])
        out.append(event)
    if out:
        return out
    return _minimal_raw_events(frame, sport, version)


def mk_for_sport(sport: int) -> int:
    """Per-sport mk from the confirmed PS3838 transport matrix."""
    return SPORT_MK_OVERRIDE.get(int(sport), 3)


def sub_body(sport: int) -> dict[str, Any]:
    """SUBSCRIBE body v=0 snapshot; mk=3 union except known sport overrides."""
    return dict(
        sp=sport, lg="", ev="", mk=mk_for_sport(sport), btg="1", ot=1,
        d="", o=1, l=3, v="0", lv="0", me=0,
        more=False, lang="", tm=0, pa=0, c="", g="",
    )


def _parse(m: str) -> dict[str, Any] | None:
    try:
        obj = _jmod.loads(m)
        return obj if isinstance(obj, dict) else None
    except Exception:
        return None


def _resnapshot_interval(cfg: dict[str, Any], sport: int | None = None) -> float:
    """Return the site-WS full-snapshot cadence for one sport.

    An explicit worker config remains authoritative.  The Soccer-only env
    override is opt-in so shared fleet consumers and all other sports keep the
    existing prematch cadence by default.
    """
    raw = cfg.get("resnapshot_sec")
    if raw is None and sport == SOCCER_SPORT_ID:
        raw = os.environ.get("PS3838_RESUBSCRIBE_SOCCER_SEC")
    if raw is None:
        raw = os.environ.get("PS3838_RESUBSCRIBE_PREMATCH_SEC", str(DEFAULT_RESNAPSHOT_SEC))
    try:
        return max(0.0, float(raw))
    except (TypeError, ValueError):
        return DEFAULT_RESNAPSHOT_SEC


async def _send_subscribe(pg: Any, sport: int, *, clear_frames: bool = False) -> bool:
    """Send the proven v=0 sport snapshot subscribe through the page WS."""
    prefix = "window.__fr=[];" if clear_frames else ""
    return bool(
        await seval(
            pg,
            "(m)=>"
            + _BO
            + prefix
            + "if(window.__ws&&window.__ws.readyState===1){window.__ws.send(m);return true}"
            + "return false"
            + _BC,
            json.dumps(dict(type="SUBSCRIBE", destination="ODDS", body=sub_body(sport))),
            default=False,
        )
    )


async def _click_sidebar_sport_if_needed(pg: Any, slug: str) -> bool:
    """Activate compact sport via sidebar for slugs with known direct-URL drift."""
    labels = SIDEBAR_FALLBACK_LABELS.get(slug)
    if not labels:
        return False
    for attempt in range(8):
        clicked = await seval(
            pg,
            """
            (labels) => {
                const normalizedLabels = labels.map((value) => String(value).trim().toLowerCase());
                const candidates = Array.from(document.querySelectorAll(
                    "div.sport-name, li.sport-name, [data-sport-name], li, a, span, button"
                ));
                const norm = (value) => String(value || "").replace(/\\s+/g, " ").trim().toLowerCase();
                const isMatch = (text, label) => (
                    text === label || text.startsWith(label + " ") || text.startsWith(label + "\\n")
                );
                for (const label of normalizedLabels) {
                    const match = candidates.find((el) => {
                        const text = norm(el.textContent);
                        return text && text.length <= label.length + 24 && isMatch(text, label);
                    });
                    if (match) {
                        try { match.scrollIntoView({block: "center", inline: "nearest"}); } catch (_) {}
                        match.click();
                        return true;
                    }
                }
                return false;
            }
            """,
            list(labels),
            default=False,
        )
        if clicked:
            await pg.wait_for_timeout(3000)
            return True
        if attempt < 7:
            await pg.wait_for_timeout(1000)
    return False


async def _open_sport_page(pg: Any, domain: str, slug: str, sport: int, *, timeout: int = 45000) -> None:
    """Open compact sport page, then apply known sidebar activation fallback."""
    await pg.goto(
        "https://%s/en/compact/sports/%s/%d/" % (domain, slug, sport),
        wait_until="domcontentloaded",
        timeout=timeout,
    )
    await _click_sidebar_sport_if_needed(pg, slug)


class _RelayServer:
    """Wrapper around asyncio.AbstractServer с трекингом in-flight _handle задач.

    P2-1: при close() отменяем все активные _handle (и вложенные _pipe) задачи,
    ждём их завершения (с таймаутом). Это гарантирует, что in-flight задачи не
    копятся в event loop после завершения воркера.
    """

    def __init__(self, server: asyncio.AbstractServer, tasks: set["asyncio.Task[None]"]) -> None:
        self._server = server
        self._tasks = tasks

    def close(self) -> None:
        self._server.close()
        # Отменить все in-flight _handle задачи.
        for t in list(self._tasks):
            t.cancel()

    async def wait_closed(self) -> None:
        await self._server.wait_closed()
        if self._tasks:
            # Снять снимок: done_callback (tasks.discard) убирает задачи по мере завершения.
            pending = list(self._tasks)
            # Дать event loop возможность обработать pending cancellations:
            # — sleep(0) #1: задача (если ещё не стартовала) получает первый шанс запуститься;
            # — sleep(0) #2: доставляет CancelledError на первый await внутри задачи.
            await asyncio.sleep(0)
            await asyncio.sleep(0)
            await asyncio.gather(*pending, return_exceptions=True)
        self._tasks.clear()


async def socks5_relay(
    lp: int, ip: str, pt: int, u: str, pw: str
) -> _RelayServer:
    """Local SOCKS5 proxy -> upstream proxy with auth (async relay).

    Возвращает _RelayServer, который поддерживает close()/wait_closed() и
    отменяет in-flight задачи при остановке (P2-1).
    """
    # Множество активных _handle задач — трекается для отмены при close().
    _active_tasks: set[asyncio.Task[None]] = set()

    async def _pipe(r: asyncio.StreamReader, w: asyncio.StreamWriter) -> None:
        try:
            while True:
                d = await r.read(65536)
                if not d:
                    break
                w.write(d)
                await w.drain()
        except Exception:
            pass
        finally:
            try:
                w.close()
            except Exception:
                pass

    async def _handle(cr: asyncio.StreamReader, cw: asyncio.StreamWriter) -> None:
        try:
            dt = await cr.readexactly(2)
            await cr.readexactly(dt[1])
            cw.write(bytes([5, 0]))
            await cw.drain()
            hd = await cr.readexactly(4)
            at = hd[3]
            if at == 1:
                ds = await cr.readexactly(4)
            elif at == 3:
                nlen = await cr.readexactly(1)
                ds = nlen + await cr.readexactly(nlen[0])
            elif at == 4:
                ds = await cr.readexactly(16)
            else:
                cw.close()
                return
            ps = await cr.readexactly(2)
            rr, rw = await asyncio.open_connection(ip, pt)
            rw.write(bytes([5, 1, 2]))
            await rw.drain()
            await rr.readexactly(2)
            ub = u.encode()
            pb = pw.encode()
            rw.write(bytes([1]) + bytes([len(ub)]) + ub + bytes([len(pb)]) + pb)
            await rw.drain()
            ar = await rr.readexactly(2)
            if ar[1] != 0:
                cw.close()
                rw.close()
                return
            rw.write(hd + ds + ps)
            await rw.drain()
            rp = await rr.readexactly(4)
            ra = rp[3]
            if ra == 1:
                rb: bytes = await rr.readexactly(4)
            elif ra == 3:
                nlen2 = await rr.readexactly(1)
                rb = nlen2 + await rr.readexactly(nlen2[0])
            elif ra == 4:
                rb = await rr.readexactly(16)
            else:
                rb = b""
            rp2 = await rr.readexactly(2)
            cw.write(rp + rb + rp2)
            await cw.drain()
            await asyncio.gather(_pipe(cr, rw), _pipe(rr, cw))
        except Exception as exc:
            # Do not include proxy credentials or request payloads in logs.
            print("[fleet] socks relay error=%s" % type(exc).__name__, flush=True)
            try:
                cw.close()
            except Exception:
                pass

    def _tracked_handle(cr: asyncio.StreamReader, cw: asyncio.StreamWriter) -> None:
        """Обёртка: создаёт Task для _handle и регистрирует её в _active_tasks."""
        loop = asyncio.get_event_loop()
        task: asyncio.Task[None] = loop.create_task(_handle(cr, cw))
        _active_tasks.add(task)
        task.add_done_callback(_active_tasks.discard)

    raw_server = await asyncio.start_server(_tracked_handle, "127.0.0.1", lp)
    return _RelayServer(raw_server, _active_tasks)


async def _wcdp(p: int, t: float = 75.0) -> bool:
    """Wait for CDP on port p to respond (max t seconds)."""
    import urllib.request  # noqa: PLC0415
    t0 = time.time()
    while time.time() - t0 < t:
        try:
            urllib.request.urlopen("http://localhost:%d/json/version" % p, timeout=2)
            return True
        except Exception:
            await asyncio.sleep(0.5)
    return False


async def seval(
    pg: Any, js: str, arg: Any = None, default: Any = None, tries: int = 5
) -> Any:
    """Safe evaluate: retry on navigation/context errors."""
    for _ in range(tries):
        try:
            return await (pg.evaluate(js, arg) if arg is not None else pg.evaluate(js))
        except Exception as ex:
            if "context" in str(ex) or "navigation" in str(ex):
                await pg.wait_for_timeout(1500)
                continue
            return default
    return default


async def _drain(pg: Any) -> list[str]:
    """Drain accumulated WebSocket frames from window.__fr."""
    val = await seval(
        pg,
        "()=>" + _BO + "const f=window.__fr.slice();window.__fr=[];return f" + _BC,
        default=[],
    )
    return cast(list[str], val or [])


class Worker:
    """Single account -> normalised event stream via on_event callback.

    cfg-dict overrides os.environ -- race-safe for parallel N workers.
    cfg keys: proxy_host/proxy_port/proxy_user/proxy_pass/cdp/socks/profile/
    user/password/domain.
    """

    def __init__(
        self,
        label: str,
        sport: int,
        slug: str,
        on_event: Callable[[dict[str, Any]], None],
        cfg: dict[str, Any] | None = None,
        reserve_morebet: Callable[[str], bool] | None = None,
        on_raw_frame: Callable[[dict[str, Any]], None] | None = None,
        next_morebet_target: Callable[[], int | None] | None = None,
    ) -> None:
        self.label = label
        self.sport = sport
        self.slug = slug
        self.on_event = on_event
        self.cfg: dict[str, Any] = cfg or {}
        self.events_emitted = 0
        self._live_delta_cache = NormalizedEventDeltaCache()
        self.odds_frames_seen = 0
        self.odds_raw_events_seen = 0
        self.odds_key_counts: dict[str, int] = {}
        self.morebet_raw_events_seen = 0
        self.morebet_sent = 0
        self.morebet_answered = 0
        self.reconnects = 0
        self.alive = False
        self._http_429_count = 0
        self._got_429 = False
        self._last_http_429_at: float | None = None
        self._reserve_morebet = reserve_morebet
        self._on_raw_frame = on_raw_frame
        self._next_morebet_target = next_morebet_target
        self._pending_morebet_event_ids: list[int] = []

    def _c(self, key: str, env_key: str, default: str = "") -> str:
        """cfg[key] -> os.environ[env_key] -> default (race-safe per-worker)."""
        v = self.cfg.get(key)
        if v is not None:
            return str(v)
        import os  # noqa: PLC0415
        return os.environ.get(env_key, default)

    def _domain(self) -> str:
        return self._c("domain", "W_DOMAIN", "www.ps3838.com")

    def _record_http_429(self) -> None:
        """Rate-limit MORE_BET briefly without disabling the worker run.

        Browser pages can emit an unrelated HTTP 429 while their odds WebSocket
        remains healthy.  The previous latch disabled MORE_BET until the whole
        worker rotated (normally ten minutes) and, worse, kept claiming queued
        targets without sending them.  Remember the latest signal so callers
        can pause target acquisition for a bounded cooldown instead.
        """
        self._http_429_count += 1
        self._got_429 = True
        self._last_http_429_at = time.monotonic()

    def _morebet_429_cooldown_active(self, now: float | None = None) -> bool:
        if self._last_http_429_at is None:
            return False
        cooldown = max(
            1.0,
            float(self.cfg.get("morebet_429_cooldown_sec", 30.0)),
        )
        current = time.monotonic() if now is None else now
        return current - self._last_http_429_at < cooldown

    async def run(
        self, run_sec: float, watchlist: list[int] | None = None
    ) -> dict[str, Any]:
        """Run worker for run_sec. Isolated: exceptions not propagated."""
        proxy_host = self._c("proxy_host", "W_PROXY_HOST") or self._c(
            "proxy_host", "W_PROXY_IP"
        )
        direct_mode = str(self.cfg.get("direct_mode", "")).lower() in {"1", "true", "yes"}
        if not proxy_host and not direct_mode:
            return dict(label=self.label, status="FAIL: NO_PROXY")
        socks_port_raw = self._c("socks", "W_SOCKS")
        cdp_port_raw = self._c("cdp", "W_CDP")
        if not cdp_port_raw or (proxy_host and not socks_port_raw):
            return dict(label=self.label, status="FAIL: NO_PORTS")
        socks_port = int(socks_port_raw) if socks_port_raw else 0
        cdp_port = int(cdp_port_raw)
        ud = self._c("profile", "W_PROFILE", "/tmp/fleet-worker-%s" % self.label)
        ch: subprocess.Popen[bytes] | None = None
        relay: _RelayServer | None = None
        # Fix #1: инициализировать до try-блока, чтобы finally видел их
        # даже при раннем исключении (до момента создания).
        br: Any = None
        pw: Any = None
        try:
            if proxy_host:
                relay = await socks5_relay(
                    socks_port, proxy_host,
                    int(self._c("proxy_port", "W_PROXY_PORT")),
                    self._c("proxy_user", "W_PROXY_USER"),
                    self._c("proxy_pass", "W_PROXY_PASS"),
                )
            shutil.rmtree(ud, ignore_errors=True)
            from pathlib import Path  # noqa: PLC0415
            Path(ud).mkdir(parents=True, exist_ok=True)
            browser_executable = _browser_executable()
            if not browser_executable:
                return dict(label=self.label, status="FAIL: NO_BROWSER")
            args = [
                browser_executable,
                "--remote-debugging-port=%d" % cdp_port,
                "--user-data-dir=%s" % ud,
                "--headless=new", "--disable-gpu", "--no-sandbox",
                "--disable-dev-shm-usage", "--user-agent=%s" % UA,
                "--lang=en-US",
            ]
            if proxy_host:
                args.append("--proxy-server=socks5://127.0.0.1:%d" % socks_port)
            args.append("about:blank")
            ch = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if not await _wcdp(cdp_port):
                return dict(label=self.label, status="FAIL: CDP")
            from playwright.async_api import async_playwright  # noqa: PLC0415
            pw = await async_playwright().start()
            br = await pw.chromium.connect_over_cdp(
                "http://localhost:%d" % cdp_port, timeout=30000
            )
            ctx = br.contexts[0]
            pg = ctx.pages[0]
            await pg.add_init_script(WS_INT)
            await self._login(pg)
            await _open_sport_page(pg, self._domain(), self.slug, self.sport)
            if not await self._wait_ws(pg):
                return dict(label=self.label, status="FAIL: NO_WS")
            await _send_subscribe(pg, self.sport, clear_frames=True)
            self.alive = True
            await self._loop(pg, run_sec, watchlist or [])
            return dict(
                label=self.label, status="DONE",
                events_emitted=self.events_emitted,
                odds_frames_seen=self.odds_frames_seen,
                odds_raw_events_seen=self.odds_raw_events_seen,
                odds_key_counts=dict(self.odds_key_counts),
                morebet_raw_events_seen=self.morebet_raw_events_seen,
                morebet_sent=self.morebet_sent,
                morebet_answered=self.morebet_answered,
                morebet_answer_ratio=(
                    self.morebet_answered / self.morebet_sent
                    if self.morebet_sent
                    else 0.0
                ),
                silent_drop_alert=silent_drop_alert(
                    sent=self.morebet_sent,
                    answered=self.morebet_answered,
                    min_sent=int(self.cfg.get("silent_drop_min_sent", DEFAULT_SILENT_DROP_MIN_SENT)),
                    min_ratio=float(self.cfg.get("silent_drop_min_ratio", DEFAULT_SILENT_DROP_MIN_RATIO)),
                ),
                reconnects=self.reconnects,
                got_429=self._got_429,
            )
        except Exception as ex:
            return dict(label=self.label, status="FAIL: %s" % str(ex)[:120])
        finally:
            # Fix #1 (v2): закрывать browser и playwright-driver при каждом завершении.
            # Порядок: browser → playwright driver → Chrome process → relay.
            # Каждый шаг в своём try/except с таймаутом — зависание одного не блокирует
            # остальные. ch.terminate()/kill() выполняются даже если br/pw зависли.
            _CLOSE_TIMEOUT = 5.0  # секунд на graceful close каждого ресурса
            if br is not None:
                try:
                    await asyncio.wait_for(br.close(), timeout=_CLOSE_TIMEOUT)
                except asyncio.TimeoutError:
                    import logging as _logging  # noqa: PLC0415
                    _logging.getLogger(__name__).warning(
                        "worker %s: br.close() timed out after %.1fs, continuing teardown",
                        self.label, _CLOSE_TIMEOUT,
                    )
                except Exception:
                    pass
            if pw is not None:
                try:
                    await asyncio.wait_for(pw.stop(), timeout=_CLOSE_TIMEOUT)
                except asyncio.TimeoutError:
                    import logging as _logging  # noqa: PLC0415
                    _logging.getLogger(__name__).warning(
                        "worker %s: pw.stop() timed out after %.1fs, continuing teardown",
                        self.label, _CLOSE_TIMEOUT,
                    )
                except Exception:
                    pass
            if ch is not None:
                try:
                    ch.terminate()
                    ch.wait(timeout=5)
                except Exception:
                    try:
                        ch.kill()
                    except Exception:
                        pass
            if relay is not None:
                try:
                    relay.close()
                    # Fix #3: дождаться завершения in-flight _pipe() задач.
                    await asyncio.wait_for(relay.wait_closed(), timeout=2.0)
                except Exception:
                    pass

    async def _login_status(self, pg: Any) -> dict[str, Any]:
        """Async mirror of core.session_bootstrap.check_login_status."""
        body = await seval(
            pg,
            "() => document.body ? document.body.innerText.substring(0, 500) : ''",
            default="",
        ) or ""
        body_lower = str(body).lower()
        fatal_marker = _fatal_auth_marker(body_lower)
        if fatal_marker:
            return {"logged_in": False, "reason": fatal_marker}
        if "delayed for guest" in body_lower or "odds are delayed" in body_lower:
            return {"logged_in": False, "reason": "guest mode"}
        if (
            "signed out due to multiple logins" in body_lower
            or "multiple login" in body_lower
            or ("sign in again" in body_lower and "signed out" in body_lower)
        ):
            return {"logged_in": False, "reason": "multiple login"}
        balance = await seval(
            pg,
            """() => {
                const el = document.querySelector('[class*=balance], [class*=Balance], [class*=user-info]');
                return el ? el.innerText.substring(0, 80) : '';
            }""",
            default="",
        ) or ""
        auth_raw = await seval(pg, "() => localStorage.getItem('a') || ''", default="") or ""
        login_btns = await seval(
            pg,
            "() => document.querySelectorAll('[class*=login-btn], [data-test*=login]').length",
            default=0,
        ) or 0
        if balance and any(ch.isdigit() for ch in str(balance)):
            return {"logged_in": True, "balance_text": str(balance).strip()}
        if int(login_btns or 0) > 0 or "sign in" in body_lower:
            return {"logged_in": False, "reason": "sign-in controls visible"}
        if "deposit" in body_lower and auth_raw:
            return {"logged_in": True, "auth_signal": "deposit+localStorage.a"}
        if "deposit" in body_lower:
            return {"logged_in": True, "auth_signal": "deposit marker"}
        return {"logged_in": False, "reason": "no authenticated markers"}

    async def _fill_first(self, pg: Any, selectors: tuple[str, ...], value: str, *, timeout: int) -> str:
        for selector in selectors:
            try:
                await pg.locator(selector).first.fill(value, timeout=timeout)
                return selector
            except Exception:
                continue
        return ""

    async def _click_first(self, pg: Any, selectors: tuple[str, ...], *, timeout: int) -> str:
        for selector in selectors:
            try:
                await pg.locator(selector).first.click(timeout=timeout)
                return selector
            except Exception:
                continue
        return ""

    async def _dismiss_known_login_dialogs(self, pg: Any) -> None:
        await self._click_first(
            pg,
            (
                "button.okBtn",
                ".okBtn",
                'button:has-text("OK")',
                'button:has-text("Sign In Again")',
                'button:has-text("Sign in again")',
            ),
            timeout=500,
        )

    async def _login_form_diagnostic(self, pg: Any) -> dict[str, Any]:
        """Safe failure evidence: never include entered values or credentials."""
        return {
            "url": await seval(pg, "() => location.href", default=""),
            "title": await seval(pg, "() => document.title", default=""),
            "inputs": await seval(
                pg,
                """() => Array.from(document.querySelectorAll('input')).map((el) => ({
                    name: el.getAttribute('name') || '', id: el.id || '',
                    type: el.getAttribute('type') || '', autocomplete: el.getAttribute('autocomplete') || ''
                })).slice(0, 12)""",
                default=[],
            ),
        }

    async def _attempt_browser_login(self, pg: Any, *, login_wait_sec: float = 12.0) -> dict[str, Any]:
        login_id = self._c("user", "W_USER")
        password = self._c("password", "W_PASS")
        if not login_id or not password:
            return {"ok": False, "reason": "credentials not set"}
        await self._dismiss_known_login_dialogs(pg)
        login_selector = await self._fill_first(
            pg,
            ('input[name="loginId"]', 'input[name="username"]', "#loginId"),
            login_id,
            timeout=3000,
        )
        if not login_selector:
            await self._click_first(
                pg,
                (
                    'button:has-text("Sign In")',
                    'button:has-text("SIGN IN")',
                    'a:has-text("Sign In")',
                    'a:has-text("SIGN IN")',
                    "text=Sign In",
                    "text=SIGN IN",
                ),
                timeout=2000,
            )
            await self._dismiss_known_login_dialogs(pg)
            login_selector = await self._fill_first(
                pg,
                ('input[name="loginId"]', 'input[name="username"]', "#loginId"),
                login_id,
                timeout=3000,
            )
        if not login_selector:
            diagnostic = await self._login_form_diagnostic(pg)
            print("[fleet] login form not found diagnostic=%s" % diagnostic, flush=True)
            return {
                "ok": False, "reason": "login field not found",
                "diagnostic": diagnostic,
            }
        password_selector = await self._fill_first(
            pg,
            ('input[type="password"]', 'input[name="password"]', 'input[name="pass"]', "#password"),
            password,
            timeout=3000,
        )
        if not password_selector:
            return {"ok": False, "reason": "password field not found"}
        await self._dismiss_known_login_dialogs(pg)
        clicked_submit = bool(
            await self._click_first(
                pg,
                (
                    'button[type="submit"]',
                    'button:has-text("Login")',
                    'button:has-text("Sign In")',
                    'button:has-text("Log In")',
                ),
                timeout=3000,
            )
        )
        if not clicked_submit:
            try:
                await pg.locator(password_selector).first.press("Enter", timeout=1000)
                clicked_submit = True
            except Exception:
                pass
        if not clicked_submit:
            return {"ok": False, "reason": "submit button not found"}
        await pg.wait_for_timeout(max(3000, int(login_wait_sec * 1000)))
        status = await self._login_status(pg)
        return {"ok": bool(status.get("logged_in")), "reason": status.get("reason", ""), "status": status}

    async def _login(self, pg: Any) -> None:
        entry_url = "https://%s/en/compact/sports/%s/%d/" % (
            self._domain(),
            self.slug,
            self.sport,
        )
        for _ in range(5):
            try:
                await pg.goto(entry_url, wait_until="domcontentloaded", timeout=60000)
                break
            except Exception:
                await pg.wait_for_timeout(5000)
        await pg.wait_for_timeout(6000)
        status = await self._login_status(pg)
        if status.get("logged_in"):
            return
        login_result = await self._attempt_browser_login(pg)
        if not login_result.get("ok"):
            raise RuntimeError("LOGIN: %s" % (login_result.get("reason") or status.get("reason") or "failed"))

    async def _wait_ws(self, pg: Any) -> bool:
        for _ in range(35):
            if (await seval(pg, "()=>window.__ws&&window.__ws.readyState===1?1:0", default=0) == 1):
                return True
            await pg.wait_for_timeout(1000)
        return False

    async def _loop(self, pg: Any, run_sec: float, watchlist: list[int]) -> None:
        """Main loop: drain WS frames + MORE_BET per watchlist (<=1 r/s).

        A page HTTP 429 pauses MORE_BET target acquisition for a short cooldown;
        the base odds WebSocket keeps flowing and exact checks recover without
        waiting for the full worker rotation.
        """
        def _on_response(resp: Any) -> None:
            try:
                if getattr(resp, "status", None) == 429:
                    self._record_http_429()
            except Exception:
                pass

        try:
            pg.on("response", _on_response)
        except Exception:
            pass

        start = time.time()
        last_send = start - MIN_INTERVAL
        resnapshot_interval = _resnapshot_interval(self.cfg, sport=self.sport)
        last_resnapshot = start
        widx = 0
        while time.time() - start < run_sec:
            for m in await _drain(pg):
                fr = _parse(m)
                if fr and fr.get("type") in ("FULL_ODDS", "UPDATE_ODDS"):
                    self.odds_frames_seen += 1
                    odds = fr.get("odds") or {}
                    counts = raw_event_counts_by_key(odds, self.sport) if isinstance(odds, dict) else {}
                    self.odds_raw_events_seen += sum(counts.values())
                    for key, count in counts.items():
                        self.odds_key_counts[key] = self.odds_key_counts.get(key, 0) + count
                    self._emit_raw_frame(fr)
                    for ev in normalize_browser_ws_frame(
                        fr, self.sport, self._live_delta_cache
                    ):
                        ev["_account"] = self.label
                        self.on_event(ev)
                        self.events_emitted += 1
                elif fr and fr.get("type") == "MORE_BET":
                    self.morebet_raw_events_seen += len(
                        _iter_raw_events(fr.get("odds") or {}, self.sport)
                    )
                    if self._pending_morebet_event_ids:
                        fr["_requested_event_id"] = self._pending_morebet_event_ids.pop(0)
                    self._emit_raw_frame(fr)
                    self.morebet_answered += 1
                    for ev in normalize_full_odds(fr, self.sport):
                        ev["market_class"] = "more_bets"
                        ev["_account"] = self.label
                        self.on_event(ev)
                        self.events_emitted += 1
            now = time.time()
            if resnapshot_interval > 0 and now - last_resnapshot >= resnapshot_interval:
                if not await _send_subscribe(pg, self.sport) and not await self._recover_sport_page(
                    pg, self.sport, self.slug
                ):
                    break
                last_resnapshot = now
            rate_limited = self._morebet_429_cooldown_active()
            next_target = None if rate_limited else self._pull_next_morebet_target()
            has_static_watchlist = bool(watchlist)
            if (
                not rate_limited
                and (next_target is not None or has_static_watchlist)
                and now - last_send >= MIN_INTERVAL
            ):
                if self._reserve_morebet is not None and not self._reserve_morebet(self.label):
                    await asyncio.sleep(0.5)
                    continue
                if next_target is not None:
                    eid = next_target
                else:
                    eid = watchlist[widx % len(watchlist)]
                    widx += 1
                try:
                    await pg.evaluate(
                        "(m)=>window.__ws&&window.__ws.readyState===1&&window.__ws.send(m)",
                        json.dumps(dict(type="MORE_BET", destination="ODDS", eventId=eid)),
                    )
                    self._pending_morebet_event_ids.append(int(eid))
                    self.morebet_sent += 1
                    last_send = now
                except Exception:
                    pass
            await asyncio.sleep(0.5)

    async def _recover_sport_page(self, pg: Any, sport: int, slug: str) -> bool:
        """Reload a sport tab and resend its snapshot subscription after WS close."""
        try:
            self.reconnects += 1
            await _open_sport_page(pg, self._domain(), slug, sport)
            if not await self._wait_ws(pg):
                return False
            return await _send_subscribe(pg, sport, clear_frames=True)
        except Exception:
            return False

    def _emit_raw_frame(self, frame: dict[str, Any]) -> None:
        if self._on_raw_frame is None:
            return
        out = dict(frame)
        out["_account"] = self.label
        out["_sport"] = self.sport
        out["_slug"] = self.slug
        try:
            self._on_raw_frame(out)
        except Exception:
            pass

    def _pull_next_morebet_target(self) -> int | None:
        if self._next_morebet_target is None:
            return None
        try:
            target = self._next_morebet_target()
        except Exception:
            return None
        try:
            return int(target) if target is not None else None
        except (TypeError, ValueError):
            return None


class MultiSportWorker(Worker):
    """One account/browser with several sport tabs.

    This matches the proven mk=3 multi-socket shape: one login/session can keep
    multiple sport WebSockets warm, while MORE_BET spending remains account-wide.
    """

    def __init__(
        self,
        label: str,
        sports: list[Any],
        on_event: Callable[[dict[str, Any]], None],
        cfg: dict[str, Any] | None = None,
        reserve_morebet: Callable[[str], bool] | None = None,
        on_raw_frame: Callable[[dict[str, Any]], None] | None = None,
        next_morebet_target: Callable[[], int | None] | None = None,
    ) -> None:
        if not sports:
            raise ValueError("MultiSportWorker requires at least one sport")
        first = sports[0]
        super().__init__(
            label=label,
            sport=int(first.sport_id),
            slug=str(first.slug),
            on_event=on_event,
            cfg=cfg,
            reserve_morebet=reserve_morebet,
            on_raw_frame=on_raw_frame,
            next_morebet_target=next_morebet_target,
        )
        self.sports = list(sports)
        self.odds_key_counts_by_sport: dict[str, dict[str, int]] = {}

    async def run(
        self, run_sec: float, watchlist: list[int] | None = None
    ) -> dict[str, Any]:
        """Run all assigned sport tabs inside one browser profile."""
        proxy_host = self._c("proxy_host", "W_PROXY_HOST") or self._c(
            "proxy_host", "W_PROXY_IP"
        )
        direct_mode = str(self.cfg.get("direct_mode", "")).lower() in {"1", "true", "yes"}
        if not proxy_host and not direct_mode:
            return dict(label=self.label, status="FAIL: NO_PROXY")
        socks_port_raw = self._c("socks", "W_SOCKS")
        cdp_port_raw = self._c("cdp", "W_CDP")
        if not cdp_port_raw or (proxy_host and not socks_port_raw):
            return dict(label=self.label, status="FAIL: NO_PORTS")
        socks_port = int(socks_port_raw) if socks_port_raw else 0
        cdp_port = int(cdp_port_raw)
        ud = self._c("profile", "W_PROFILE", "/tmp/fleet-worker-%s" % self.label)
        ch: subprocess.Popen[bytes] | None = None
        relay: _RelayServer | None = None
        br: Any = None
        pw: Any = None
        try:
            if proxy_host:
                relay = await socks5_relay(
                    socks_port, proxy_host,
                    int(self._c("proxy_port", "W_PROXY_PORT")),
                    self._c("proxy_user", "W_PROXY_USER"),
                    self._c("proxy_pass", "W_PROXY_PASS"),
                )
            from pathlib import Path  # noqa: PLC0415

            shutil.rmtree(ud, ignore_errors=True)
            Path(ud).mkdir(parents=True, exist_ok=True)
            browser_executable = _browser_executable()
            if not browser_executable:
                return dict(label=self.label, status="FAIL: NO_BROWSER")
            args = [
                browser_executable,
                "--remote-debugging-port=%d" % cdp_port,
                "--user-data-dir=%s" % ud,
                "--headless=new", "--disable-gpu", "--no-sandbox",
                "--disable-dev-shm-usage", "--user-agent=%s" % UA,
                "--lang=en-US",
            ]
            if proxy_host:
                args.append("--proxy-server=socks5://127.0.0.1:%d" % socks_port)
            args.append("about:blank")
            ch = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if not await _wcdp(cdp_port):
                return dict(label=self.label, status="FAIL: CDP")
            from playwright.async_api import async_playwright  # noqa: PLC0415

            pw = await async_playwright().start()
            br = await pw.chromium.connect_over_cdp(
                "http://localhost:%d" % cdp_port, timeout=30000
            )
            ctx = br.contexts[0]
            try:
                await ctx.add_init_script(WS_INT)
            except Exception:
                pass
            login_page = ctx.pages[0]
            await login_page.add_init_script(WS_INT)
            await self._login(login_page)
            self.alive = True
            max_tabs = max(
                1,
                int(
                    self.cfg.get("multi_sport_max_tabs")
                    or os.environ.get("PS3838_MULTI_SPORT_MAX_TABS", "3")
                ),
            )
            batch_sec = max(
                15.0,
                float(
                    self.cfg.get("multi_sport_batch_sec")
                    or os.environ.get("PS3838_MULTI_SPORT_BATCH_SEC", "45")
                ),
            )
            sport_batches = [
                self.sports[index : index + max_tabs]
                for index in range(0, len(self.sports), max_tabs)
            ]
            started_at = time.time()
            batch_index = 0
            attempted_without_ws = 0
            visited_sports: set[str] = set()
            login_page_closed = False
            while time.time() - started_at < run_sec:
                batch = sport_batches[batch_index]
                batch_index = (batch_index + 1) % len(sport_batches)
                pages: list[tuple[Any, int, str]] = []
                for sport in batch:
                    pg = None
                    sid = int(sport.sport_id)
                    slug = str(sport.slug)
                    try:
                        pg = await ctx.new_page()
                        await pg.add_init_script(WS_INT)
                        await _open_sport_page(pg, self._domain(), slug, sid)
                        if not await self._wait_ws(pg):
                            await pg.close()
                            continue
                        await _send_subscribe(pg, sid, clear_frames=True)
                        pages.append((pg, sid, slug))
                        visited_sports.add(slug)
                    except Exception:
                        try:
                            if pg is not None:
                                await pg.close()
                        except Exception:
                            pass
                if pages and not login_page_closed:
                    try:
                        await login_page.close()
                    except Exception:
                        pass
                    login_page_closed = True
                if not pages:
                    attempted_without_ws += len(batch)
                    if not visited_sports and attempted_without_ws >= len(self.sports):
                        return dict(label=self.label, status="FAIL: NO_WS")
                    await asyncio.sleep(1.0)
                    continue
                attempted_without_ws = 0
                remaining_sec = run_sec - (time.time() - started_at)
                await self._loop_multi(
                    pages,
                    min(batch_sec, max(0.0, remaining_sec)),
                    watchlist or [],
                )
                for pg, _sid, _slug in pages:
                    try:
                        await pg.close()
                    except Exception:
                        pass
            return dict(
                label=self.label, status="DONE",
                sports=sorted(visited_sports),
                events_emitted=self.events_emitted,
                odds_frames_seen=self.odds_frames_seen,
                odds_raw_events_seen=self.odds_raw_events_seen,
                odds_key_counts=dict(self.odds_key_counts),
                odds_key_counts_by_sport=dict(self.odds_key_counts_by_sport),
                morebet_raw_events_seen=self.morebet_raw_events_seen,
                morebet_sent=self.morebet_sent,
                morebet_answered=self.morebet_answered,
                morebet_answer_ratio=(
                    self.morebet_answered / self.morebet_sent
                    if self.morebet_sent
                    else 0.0
                ),
                silent_drop_alert=silent_drop_alert(
                    sent=self.morebet_sent,
                    answered=self.morebet_answered,
                    min_sent=int(self.cfg.get("silent_drop_min_sent", DEFAULT_SILENT_DROP_MIN_SENT)),
                    min_ratio=float(self.cfg.get("silent_drop_min_ratio", DEFAULT_SILENT_DROP_MIN_RATIO)),
                ),
                reconnects=self.reconnects,
                got_429=self._got_429,
            )
        except Exception as ex:
            return dict(label=self.label, status="FAIL: %s" % str(ex)[:120])
        finally:
            _CLOSE_TIMEOUT = 5.0
            if br is not None:
                try:
                    await asyncio.wait_for(br.close(), timeout=_CLOSE_TIMEOUT)
                except Exception:
                    pass
            if pw is not None:
                try:
                    await asyncio.wait_for(pw.stop(), timeout=_CLOSE_TIMEOUT)
                except Exception:
                    pass
            if ch is not None:
                try:
                    ch.terminate()
                    ch.wait(timeout=5)
                except Exception:
                    try:
                        ch.kill()
                    except Exception:
                        pass
            if relay is not None:
                try:
                    relay.close()
                    await asyncio.wait_for(relay.wait_closed(), timeout=2.0)
                except Exception:
                    pass

    async def _loop_multi(
        self,
        pages: list[tuple[Any, int, str]],
        run_sec: float,
        watchlist: list[int],
    ) -> None:
        def _on_response(resp: Any) -> None:
            try:
                if getattr(resp, "status", None) == 429:
                    self._record_http_429()
            except Exception:
                pass

        for pg, _sid, _slug in pages:
            try:
                pg.on("response", _on_response)
            except Exception:
                pass

        start = time.time()
        last_send = start - MIN_INTERVAL
        resnapshot_interval_by_page: dict[int, float] = {
            id(pg): _resnapshot_interval(self.cfg, sport=sid)
            for pg, sid, _slug in pages
        }
        last_resnapshot_by_page: dict[int, float] = {
            id(pg): start for pg, _sid, _slug in pages
        }
        widx = 0
        morebet_page = pages[0][0]
        while time.time() - start < run_sec:
            for pg, sid, slug in pages:
                for m in await _drain(pg):
                    fr = _parse(m)
                    if fr and fr.get("type") in ("FULL_ODDS", "UPDATE_ODDS"):
                        self.odds_frames_seen += 1
                        odds = fr.get("odds") or {}
                        counts = raw_event_counts_by_key(odds, sid) if isinstance(odds, dict) else {}
                        self.odds_raw_events_seen += sum(counts.values())
                        sport_counts = self.odds_key_counts_by_sport.setdefault(slug, {})
                        for key, count in counts.items():
                            self.odds_key_counts[key] = self.odds_key_counts.get(key, 0) + count
                            sport_counts[key] = sport_counts.get(key, 0) + count
                        self._emit_raw_frame_for(fr, sid, slug)
                        for ev in normalize_browser_ws_frame(
                            fr, sid, self._live_delta_cache
                        ):
                            ev["_account"] = self.label
                            self.on_event(ev)
                            self.events_emitted += 1
                    elif fr and fr.get("type") == "MORE_BET":
                        if self._pending_morebet_event_ids:
                            fr["_requested_event_id"] = self._pending_morebet_event_ids.pop(0)
                        self._emit_raw_frame_for(fr, sid, slug)
                        self.morebet_answered += 1
            now = time.time()
            for pg, sid, _slug in pages:
                page_key = id(pg)
                resnapshot_interval = resnapshot_interval_by_page[page_key]
                if resnapshot_interval <= 0:
                    continue
                if now - last_resnapshot_by_page.get(page_key, start) < resnapshot_interval:
                    continue
                if await _send_subscribe(pg, sid) or await self._recover_sport_page(pg, sid, _slug):
                    last_resnapshot_by_page[page_key] = now
                else:
                    last_resnapshot_by_page[page_key] = now
            rate_limited = self._morebet_429_cooldown_active()
            next_target = None if rate_limited else self._pull_next_morebet_target()
            has_static_watchlist = bool(watchlist)
            if (
                not rate_limited
                and (next_target is not None or has_static_watchlist)
                and now - last_send >= MIN_INTERVAL
            ):
                if self._reserve_morebet is not None and not self._reserve_morebet(self.label):
                    await asyncio.sleep(0.5)
                    continue
                if next_target is not None:
                    eid = next_target
                else:
                    eid = watchlist[widx % len(watchlist)]
                    widx += 1
                try:
                    await morebet_page.evaluate(
                        "(m)=>window.__ws&&window.__ws.readyState===1&&window.__ws.send(m)",
                        json.dumps(dict(type="MORE_BET", destination="ODDS", eventId=eid)),
                    )
                    self._pending_morebet_event_ids.append(int(eid))
                    self.morebet_sent += 1
                    last_send = now
                except Exception:
                    pass
            await asyncio.sleep(0.5)

    def _emit_raw_frame_for(self, frame: dict[str, Any], sport: int, slug: str) -> None:
        if self._on_raw_frame is None:
            return
        out = dict(frame)
        out["_account"] = self.label
        out["_sport"] = sport
        out["_slug"] = slug
        try:
            self._on_raw_frame(out)
        except Exception:
            pass
