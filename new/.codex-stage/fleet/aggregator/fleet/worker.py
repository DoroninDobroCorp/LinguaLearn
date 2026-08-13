"""worker: fleet Worker per-account browser-WS (Story 27.40 port).

Race-safe cfg-dict, no global os.environ reads, <=1 r/s MORE_BET.
Failure isolated. Pure normalize_full_odds/sub_body testable without network.
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Callable, cast
from urllib.parse import urlparse

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
DEFAULT_DOM_FALLBACK_SEC = 15.0
DEFAULT_AUTH_CHECK_SEC = 30.0
SPORT_MK_OVERRIDE = {
    19: 0,  # Hockey: historical EXP31.8 found mk=0 as the only populated lane.
}
SIDEBAR_FALLBACK_LABELS = {
    # Story 27.27 P4 confirmed that sidebar navigation can activate sports
    # whose direct compact URL leaves the app on the default feed.
    "hockey": ("Hockey", "Ice Hockey"),
    "table-tennis": ("Table Tennis", "Table tennis", "Table-Tennis"),
}


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


def _resnapshot_interval(cfg: dict[str, Any]) -> float:
    """Existing PS3838 cadence for dormant prematch full snapshots."""
    raw = cfg.get("resnapshot_sec")
    if raw is None:
        raw = os.environ.get("PS3838_RESUBSCRIBE_PREMATCH_SEC", str(DEFAULT_RESNAPSHOT_SEC))
    try:
        return max(0.0, float(raw))
    except (TypeError, ValueError):
        return DEFAULT_RESNAPSHOT_SEC


def _dom_fallback_interval(cfg: dict[str, Any]) -> float:
    """Interval for tab/DOM extraction when a sport tab has no WS odds."""
    raw = cfg.get("dom_fallback_sec")
    if raw is None:
        raw = os.environ.get("PS3838_DOM_FALLBACK_SEC", str(DEFAULT_DOM_FALLBACK_SEC))
    try:
        return max(0.0, float(raw))
    except (TypeError, ValueError):
        return DEFAULT_DOM_FALLBACK_SEC


def _worker_tick_interval(cfg: dict[str, Any]) -> float:
    raw = cfg.get("worker_tick_sec")
    if raw is None:
        raw = os.environ.get("PS3838_WORKER_TICK_SEC", "0.5")
    try:
        return max(0.05, float(raw))
    except (TypeError, ValueError):
        return 0.5


def _auth_check_interval(cfg: dict[str, Any]) -> float:
    """Interval for in-run negative auth-marker checks; 0 disables it."""
    raw = cfg.get("auth_check_sec")
    if raw is None:
        raw = os.environ.get("PS3838_AUTH_CHECK_SEC", str(DEFAULT_AUTH_CHECK_SEC))
    try:
        return max(0.0, float(raw))
    except (TypeError, ValueError):
        return DEFAULT_AUTH_CHECK_SEC


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


async def _extract_dom_events(pg: Any, sport: int) -> list[dict[str, Any]]:
    """Read already-rendered compact page tables as the established tab fallback."""
    try:
        from core.compact_dom_snapshot import _TABLES_JS, _games_from_tables  # noqa: PLC0415
    except Exception:
        return []
    tables = await seval(pg, _TABLES_JS, default=[])
    if not isinstance(tables, list):
        return []
    try:
        games = _games_from_tables(tables)
    except Exception:
        return []
    out: list[dict[str, Any]] = []
    for game in games:
        if not isinstance(game, dict):
            continue
        raw = game.get("Raw") if isinstance(game.get("Raw"), dict) else {}
        sport_id = raw.get("sport_id") or game.get("SportId") or game.get("sport_id")
        try:
            if int(sport_id) != int(sport):
                continue
        except (TypeError, ValueError):
            continue
        event = dict(game)
        event["SportId"] = int(sport)
        event["_dom_fallback"] = True
        out.append(event)
    return out


def _overlay_dom_live_state(event: dict[str, Any], marker: dict[str, Any] | None) -> dict[str, Any]:
    """Overlay only authoritative live state/score, never DOM market prices."""
    if not marker or not marker.get("isLive"):
        return event
    event["isLive"] = True
    event["HasScore"] = bool(marker.get("HasScore"))
    if marker.get("HasScore"):
        event["HomeScore"] = marker.get("HomeScore", event.get("HomeScore", 0))
        event["AwayScore"] = marker.get("AwayScore", event.get("AwayScore", 0))
    raw = event.get("Raw")
    if not isinstance(raw, dict):
        raw = {}
        event["Raw"] = raw
    raw["is_live"] = True
    if marker.get("HasScore"):
        raw["home_score"] = event.get("HomeScore", 0)
        raw["away_score"] = event.get("AwayScore", 0)
        raw["has_score"] = True
    event["_live_state_source"] = "logged_in_dom"
    return event


async def _wait_ws_or_dom_events(
    pg: Any,
    sport: int,
    *,
    max_wait_sec: int = 35,
    dom_probe_after_sec: int = 6,
) -> tuple[bool, list[dict[str, Any]]]:
    """Wait for WS, but accept rendered compact rows as tab fallback."""
    last_dom_events: list[dict[str, Any]] = []
    for attempt in range(max(1, int(max_wait_sec))):
        if (await seval(pg, "()=>window.__ws&&window.__ws.readyState===1?1:0", default=0) == 1):
            return True, []
        if attempt >= dom_probe_after_sec and (attempt - dom_probe_after_sec) % 3 == 0:
            last_dom_events = await _extract_dom_events(pg, sport)
            if last_dom_events:
                return False, last_dom_events
        await pg.wait_for_timeout(1000)
    if not last_dom_events:
        last_dom_events = await _extract_dom_events(pg, sport)
    return False, last_dom_events


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
        except Exception:
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


async def export_parser_owned_session(pg: Any, context: Any, path: str) -> dict[str, Any]:
    """Atomically export the authenticated parser session for bet_service.

    The parser remains the only login owner.  bet_service only reads this
    snapshot, so the same credential isn't logged in by a second browser.
    """
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    cookies = await context.cookies()
    v_hucode = await seval(pg, "() => localStorage.getItem('v-hucode') || ''", default="")
    x_app_data = await seval(pg, "() => localStorage.getItem('x-app-data') || ''", default="")
    host = urlparse(str(getattr(pg, "url", "") or "")).hostname or ""
    payload: dict[str, Any] = {
        "session_epoch": int(time.time()),
        "cookies": cookies if isinstance(cookies, list) else [],
        "v_hucode": str(v_hucode or ""),
        "x_app_data": str(x_app_data or ""),
        "runtime_site_host": host,
        "runtime_site_origin": f"https://{host}" if host else "",
        "session_created_ts": time.time(),
        "session_created_source": "remote_fleet_parser",
    }
    tmp = target.with_name(f".{target.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    os.chmod(tmp, 0o600)
    os.replace(tmp, target)
    return payload


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
        self._reserve_morebet = reserve_morebet
        self._on_raw_frame = on_raw_frame
        self._next_morebet_target = next_morebet_target
        self._pending_morebet_event_ids: list[int] = []
        self._last_bet_session_export = 0.0

    def _c(self, key: str, env_key: str, default: str = "") -> str:
        """cfg[key] -> os.environ[env_key] -> default (race-safe per-worker)."""
        v = self.cfg.get(key)
        if v is not None:
            return str(v)
        import os  # noqa: PLC0415
        return os.environ.get(env_key, default)

    def _domain(self) -> str:
        return self._c("domain", "W_DOMAIN", "www.ps3838.com")

    async def _maybe_export_bet_session(self, pg: Any, context: Any, *, force: bool = False) -> bool:
        account = self._c("bet_session_account", "REMOTE_FLEET_BET_SESSION_ACCOUNT")
        path = self._c("bet_session_file", "REMOTE_FLEET_BET_SESSION_FILE")
        if not path or account != self.label:
            return False
        if context is None:
            return False
        refresh_sec = max(
            15.0,
            float(self._c("bet_session_refresh_sec", "REMOTE_FLEET_BET_SESSION_REFRESH_SEC", "60")),
        )
        now = time.time()
        if not force and now - self._last_bet_session_export < refresh_sec:
            return False
        await export_parser_owned_session(pg, context, path)
        self._last_bet_session_export = now
        return True

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
            from core.session_manager import browser_stealth_init_script  # noqa: PLC0415
            stealth_js = browser_stealth_init_script()
            try:
                await ctx.add_init_script(stealth_js)
            except Exception:
                pass
            pg = ctx.pages[0]
            try:
                await pg.add_init_script(stealth_js)
            except Exception:
                pass
            await pg.add_init_script(WS_INT)
            await self._login(pg)
            await self._maybe_export_bet_session(pg, ctx, force=True)
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

    async def _runtime_auth_issue(self, pg: Any) -> str:
        """Return a negative auth marker seen mid-run, without requiring positive markers."""
        body = await seval(
            pg,
            "() => document.body ? document.body.innerText.substring(0, 800) : ''",
            default="",
        ) or ""
        body_lower = str(body).lower()
        if "delayed for guest" in body_lower or "odds are delayed" in body_lower:
            return "guest mode"
        if (
            "signed out due to multiple logins" in body_lower
            or "multiple login" in body_lower
            or ("sign in again" in body_lower and "signed out" in body_lower)
        ):
            return "multiple login"
        login_btns = await seval(
            pg,
            "() => document.querySelectorAll('[class*=login-btn], [data-test*=login]').length",
            default=0,
        ) or 0
        if int(login_btns or 0) > 0 or "sign in" in body_lower:
            return "sign-in controls visible"
        return ""

    async def _raise_if_runtime_auth_lost(self, pg: Any, slug: str = "") -> None:
        reason = await self._runtime_auth_issue(pg)
        if reason:
            where = "%s: " % slug if slug else ""
            raise RuntimeError("AUTH_LOST: %s%s" % (where, reason))

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
            return {"ok": False, "reason": "login field not found"}
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

        FIX-4 (P1): registers a page.on(response) listener at loop start to
        count HTTP 429 responses.  Before each MORE_BET send the counter is
        checked; when >0 the MORE_BET send-path is disabled for the rest of
        this worker run, but the base odds WS keeps flowing.
        """
        def _on_response(resp: Any) -> None:
            try:
                if getattr(resp, "status", None) == 429:
                    self._http_429_count += 1
            except Exception:
                pass

        try:
            pg.on("response", _on_response)
        except Exception:
            pass

        start = time.time()
        last_send = start - MIN_INTERVAL
        resnapshot_interval = _resnapshot_interval(self.cfg)
        auth_check_interval = _auth_check_interval(self.cfg)
        last_auth_check = start - auth_check_interval if auth_check_interval > 0 else start
        last_resnapshot = start
        widx = 0
        while time.time() - start < run_sec:
            now = time.time()
            await self._maybe_export_bet_session(pg, getattr(pg, "context", None))
            if auth_check_interval > 0 and now - last_auth_check >= auth_check_interval:
                await self._raise_if_runtime_auth_lost(pg, self.slug)
                last_auth_check = now
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
                    for ev in normalize_full_odds(fr, self.sport):
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
            next_target = self._pull_next_morebet_target()
            has_static_watchlist = bool(watchlist)
            if (next_target is not None or has_static_watchlist) and now - last_send >= MIN_INTERVAL:
                if self._http_429_count > 0:
                    self._got_429 = True
                else:
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
            from core.session_manager import browser_stealth_init_script  # noqa: PLC0415
            stealth_js = browser_stealth_init_script()
            try:
                await ctx.add_init_script(stealth_js)
            except Exception:
                pass
            try:
                await ctx.add_init_script(WS_INT)
            except Exception:
                pass
            login_page = ctx.pages[0]
            try:
                await login_page.add_init_script(stealth_js)
            except Exception:
                pass
            await login_page.add_init_script(WS_INT)
            await self._login(login_page)
            await self._maybe_export_bet_session(login_page, ctx, force=True)
            pages: list[tuple[Any, int, str]] = []
            startup_failures: list[str] = []
            for sport in self.sports:
                sid = int(sport.sport_id)
                slug = str(sport.slug)
                pg = None
                try:
                    pg = await ctx.new_page()
                    try:
                        await pg.add_init_script(stealth_js)
                    except Exception:
                        pass
                    await pg.add_init_script(WS_INT)
                    await _open_sport_page(pg, self._domain(), slug, sid)
                    ws_ready, dom_events = await _wait_ws_or_dom_events(pg, sid)
                    if ws_ready:
                        await _send_subscribe(pg, sid, clear_frames=True)
                    for ev in dom_events:
                        ev["_account"] = self.label
                        ev["_slug"] = slug
                        ev["_transport"] = "authenticated_dom"
                        self.on_event(ev)
                        self.events_emitted += 1
                    pages.append((pg, sid, slug))
                except Exception as exc:
                    startup_failures.append("%s:%s" % (slug, str(exc)[:80]))
                    if pg is not None:
                        try:
                            await pg.close()
                        except Exception:
                            pass
            try:
                await login_page.close()
            except Exception:
                pass
            if not pages:
                suffix = "; ".join(startup_failures[:4])
                return dict(label=self.label, status="FAIL: NO_SPORT_PAGES %s" % suffix)
            self.alive = True
            await self._loop_multi(pages, run_sec, watchlist or [])
            return dict(
                label=self.label, status="DONE",
                sports=[slug for _pg, _sid, slug in pages],
                startup_failures=startup_failures,
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
                    self._http_429_count += 1
            except Exception:
                pass

        for pg, _sid, _slug in pages:
            try:
                pg.on("response", _on_response)
            except Exception:
                pass

        start = time.time()
        last_send = start - MIN_INTERVAL
        resnapshot_interval = _resnapshot_interval(self.cfg)
        dom_fallback_interval = _dom_fallback_interval(self.cfg)
        worker_tick_interval = _worker_tick_interval(self.cfg)
        auth_check_interval = _auth_check_interval(self.cfg)
        last_resnapshot_by_page: dict[int, float] = {
            id(pg): start for pg, _sid, _slug in pages
        }
        last_event_by_page: dict[int, float] = {
            id(pg): 0.0 for pg, _sid, _slug in pages
        }
        last_dom_fallback_by_page: dict[int, float] = {
            id(pg): start - dom_fallback_interval for pg, _sid, _slug in pages
        }
        last_dom_prematch_by_page: dict[int, float] = {
            id(pg): start - 15.0 for pg, _sid, _slug in pages
        }
        last_auth_check = start - auth_check_interval if auth_check_interval > 0 else start
        tennis_dom_live: dict[int, dict[str, Any]] = {}
        last_tennis_dom_probe = 0.0
        widx = 0
        morebet_page = pages[0][0]
        while time.time() - start < run_sec:
            now = time.time()
            await self._maybe_export_bet_session(
                morebet_page, getattr(morebet_page, "context", None)
            )
            # Pinnacle's tennis WS can keep a newly-live match marked prematch
            # while the logged-in compact page already has a live score. Probe
            # that visible state quickly, then force a WS snapshot on transition.
            if now - last_tennis_dom_probe >= 1.0:
                for pg, sid, slug in pages:
                    if slug != "tennis":
                        continue
                    dom_events = await _extract_dom_events(pg, sid)
                    next_live = {
                        int(ev.get("Pid") or 0): ev
                        for ev in dom_events
                        if int(ev.get("Pid") or 0) > 0 and ev.get("isLive")
                    }
                    if set(next_live) - set(tennis_dom_live):
                        await _send_subscribe(pg, sid)
                    tennis_dom_live = next_live
                last_tennis_dom_probe = now
            if auth_check_interval > 0 and now - last_auth_check >= auth_check_interval:
                for pg, _sid, slug in pages:
                    await self._raise_if_runtime_auth_lost(pg, slug)
                last_auth_check = now
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
                        emitted_for_page = 0
                        for ev in normalize_full_odds(fr, sid):
                            if slug == "tennis":
                                _overlay_dom_live_state(
                                    ev,
                                    tennis_dom_live.get(int(ev.get("Pid") or 0)),
                                )
                            ev["_account"] = self.label
                            self.on_event(ev)
                            self.events_emitted += 1
                            emitted_for_page += 1
                        if emitted_for_page:
                            last_event_by_page[id(pg)] = time.time()
                    elif fr and fr.get("type") == "MORE_BET":
                        if self._pending_morebet_event_ids:
                            fr["_requested_event_id"] = self._pending_morebet_event_ids.pop(0)
                        self._emit_raw_frame_for(fr, sid, slug)
                        self.morebet_answered += 1
            now = time.time()
            if dom_fallback_interval > 0:
                for pg, sid, slug in pages:
                    page_key = id(pg)
                    if now - last_dom_fallback_by_page.get(page_key, 0.0) < dom_fallback_interval:
                        continue
                    dom_events = await _extract_dom_events(pg, sid)
                    last_dom_fallback_by_page[page_key] = now
                    if not dom_events:
                        continue
                    ws_is_fresh = now - last_event_by_page.get(page_key, 0.0) < dom_fallback_interval
                    # Even with a healthy WS, visible live prices are the
                    # latency authority. Prematch DOM stays a fallback only.
                    live_events = [ev for ev in dom_events if ev.get("isLive")]
                    emit_events = live_events
                    # A stale WS may need a DOM prematch seed, but sending the
                    # whole prematch page every second creates a FIFO backlog
                    # that delays live prices.  Refresh that fallback slowly.
                    if (
                        not ws_is_fresh
                        and now - last_dom_prematch_by_page.get(page_key, 0.0) >= 15.0
                    ):
                        emit_events = dom_events
                        last_dom_prematch_by_page[page_key] = now
                    for ev in emit_events:
                        ev["_account"] = self.label
                        ev["_slug"] = slug
                        ev["_transport"] = "authenticated_dom"
                        self.on_event(ev)
                        self.events_emitted += 1
                    last_event_by_page[page_key] = now
            if resnapshot_interval > 0:
                for pg, sid, _slug in pages:
                    page_key = id(pg)
                    if now - last_resnapshot_by_page.get(page_key, start) < resnapshot_interval:
                        continue
                    if await _send_subscribe(pg, sid) or await self._recover_sport_page(pg, sid, _slug):
                        last_resnapshot_by_page[page_key] = now
                    else:
                        last_resnapshot_by_page[page_key] = now
            next_target = self._pull_next_morebet_target()
            has_static_watchlist = bool(watchlist)
            if (next_target is not None or has_static_watchlist) and now - last_send >= MIN_INTERVAL:
                if self._http_429_count > 0:
                    self._got_429 = True
                else:
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
            await asyncio.sleep(worker_tick_interval)

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
