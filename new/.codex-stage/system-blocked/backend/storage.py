"""SQLite-backed persistence for RobinArb users + bets.

Uses stdlib sqlite3 only (no new deps). All access is guarded by a single
re-entrant lock since we're called from FastAPI threads.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from typing import Any, Optional


_DB_PATH = os.getenv("ROBINARB_STATE_DB", os.path.join(os.path.dirname(__file__), "state.db"))
_DIAGNOSTICS_DB_PATH = os.getenv(
    "ROBINARB_VERIFICATION_DB",
    os.path.join(os.path.dirname(__file__), "stats_data", "verification_diagnostics.db"),
)
_lock = threading.RLock()
_conn: sqlite3.Connection | None = None
_diagnostics_lock = threading.RLock()
_diagnostics_conn: sqlite3.Connection | None = None


def _connect() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        os.makedirs(os.path.dirname(_DB_PATH) or ".", exist_ok=True)
        _conn = sqlite3.connect(_DB_PATH, check_same_thread=False, isolation_level=None)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute("PRAGMA synchronous=NORMAL")
        _init_schema(_conn)
    return _conn


def _connect_diagnostics() -> sqlite3.Connection:
    global _diagnostics_conn
    if _diagnostics_conn is None:
        os.makedirs(os.path.dirname(_DIAGNOSTICS_DB_PATH) or ".", exist_ok=True)
        conn = sqlite3.connect(
            _DIAGNOSTICS_DB_PATH,
            check_same_thread=False,
            isolation_level=None,
        )
        try:
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute("PRAGMA busy_timeout=5000")
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS system_rejections (
                    id TEXT PRIMARY KEY,
                    category TEXT NOT NULL,
                    arb_id TEXT,
                    match TEXT,
                    sport TEXT,
                    league TEXT,
                    market TEXT,
                    selection TEXT,
                    counter_bk TEXT,
                    counter_selection TEXT,
                    odds_label TEXT,
                    error_code TEXT NOT NULL,
                    reason TEXT,
                    stage TEXT,
                    source TEXT,
                    context_json TEXT,
                    first_seen REAL NOT NULL,
                    last_seen REAL NOT NULL,
                    occurrences INTEGER NOT NULL DEFAULT 1,
                    expires_at REAL NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_system_rejections_last_seen
                    ON system_rejections(last_seen DESC);
                CREATE INDEX IF NOT EXISTS idx_system_rejections_expires
                    ON system_rejections(expires_at);
                CREATE INDEX IF NOT EXISTS idx_system_rejections_category_seen
                    ON system_rejections(category, last_seen DESC);
                """
            )
        except Exception:
            conn.close()
            raise
        _diagnostics_conn = conn
        try:
            os.chmod(_DIAGNOSTICS_DB_PATH, 0o660)
        except OSError:
            pass
    return _diagnostics_conn


def _init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            role TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            pinnacle_cashback REAL NOT NULL DEFAULT 0,
            robinbet REAL NOT NULL DEFAULT 0,
            cashback_pl REAL NOT NULL DEFAULT 0,
            created_at REAL NOT NULL,
            last_login_at REAL
        );

        CREATE TABLE IF NOT EXISTS bets (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            arb_id TEXT,
            match TEXT,
            sport TEXT,
            market TEXT,
            side TEXT,
            selection TEXT,
            odds REAL,
            stake REAL,
            cashback REAL,
            potential_return REAL,
            fork_profit_pct REAL,
            robin_profit_pct REAL,
            counter_bk TEXT,
            counter_odds REAL,
            counter_selection TEXT,
            bk2_url TEXT,
            status TEXT NOT NULL DEFAULT 'accepted',
            placed_at REAL NOT NULL,
            settled_at REAL,
            payout REAL DEFAULT 0,
            FOREIGN KEY(username) REFERENCES users(username)
        );

        CREATE INDEX IF NOT EXISTS idx_bets_user ON bets(username);
        CREATE INDEX IF NOT EXISTS idx_bets_status ON bets(status);

        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS hidden_arbs (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            scope TEXT NOT NULL,
            hide_key TEXT NOT NULL,
            match_key TEXT,
            arb_id TEXT,
            match TEXT,
            sport TEXT,
            market TEXT,
            selection TEXT,
            counter_bk TEXT,
            odds_label TEXT,
            created_at REAL NOT NULL,
            expires_at REAL NOT NULL,
            FOREIGN KEY(username) REFERENCES users(username)
        );

        CREATE INDEX IF NOT EXISTS idx_hidden_arbs_user_expires
            ON hidden_arbs(username, expires_at);
        CREATE INDEX IF NOT EXISTS idx_hidden_arbs_key
            ON hidden_arbs(username, scope, hide_key);

        """
    )
    # Database migration: add columns if they do not exist
    try:
        conn.execute("ALTER TABLE users ADD COLUMN forted_account_id TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE users ADD COLUMN forted_filters TEXT")
    except sqlite3.OperationalError:
        pass

    # Alter tables to add new columns if they do not exist
    for col_name, col_type in [
        ("pinnacle_odds", "REAL"),
        ("robin_odds", "REAL"),
        ("pinnacle_verify_odds", "REAL"),
        ("pinnacle_hub_event_id", "TEXT"),
        ("margin", "REAL"),
        ("price_signature", "TEXT"),
        ("line_source", "TEXT"),
        ("pinnacle_live_place", "TEXT"),
    ]:
        try:
            conn.execute(f"ALTER TABLE bets ADD COLUMN {col_name} {col_type}")
        except sqlite3.OperationalError:
            pass # column already exists



def initialize() -> sqlite3.Connection:
    with _lock:
        # Verification diagnostics are intentionally lazy/best-effort. A
        # damaged or unwritable optional log must never prevent the betting
        # service and its primary state database from starting.
        return _connect()


def load_users() -> dict[str, dict[str, Any]]:
    with _lock:
        conn = _connect()
        rows = conn.execute("SELECT * FROM users").fetchall()
        bets_by_user: dict[str, list[dict[str, Any]]] = {}
        for row in conn.execute("SELECT * FROM bets ORDER BY placed_at ASC").fetchall():
            bets_by_user.setdefault(row["username"], []).append(_row_to_bet(row))
        users: dict[str, dict[str, Any]] = {}
        for row in rows:
            username = row["username"]
            users[username] = {
                "username": username,
                "display_name": row["display_name"],
                "role": row["role"],
                "password_hash": row["password_hash"],
                "balance": {
                    "pinnacle_cashback": float(row["pinnacle_cashback"]),
                    "robinbet": float(row["robinbet"]),
                    "cashback_pl": float(row["cashback_pl"]),
                },
                "bets": bets_by_user.get(username, []),
                "created_at": float(row["created_at"]),
                "last_login_at": float(row["last_login_at"]) if row["last_login_at"] is not None else None,
                "forted_account_id": row["forted_account_id"] if "forted_account_id" in row.keys() else None,
                "forted_filters": row["forted_filters"] if "forted_filters" in row.keys() else None,
            }
        return users


def _row_to_bet(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "arb_id": row["arb_id"],
        "match": row["match"],
        "sport": row["sport"],
        "market": row["market"],
        "side": row["side"],
        "selection": row["selection"],
        "odds": float(row["odds"]) if row["odds"] is not None else 0.0,
        "stake": float(row["stake"]) if row["stake"] is not None else 0.0,
        "cashback": float(row["cashback"]) if row["cashback"] is not None else 0.0,
        "potential_return": float(row["potential_return"]) if row["potential_return"] is not None else 0.0,
        "fork_profit_pct": float(row["fork_profit_pct"]) if row["fork_profit_pct"] is not None else None,
        "robin_profit_pct": float(row["robin_profit_pct"]) if row["robin_profit_pct"] is not None else None,
        "counter_bk": row["counter_bk"],
        "counter_odds": float(row["counter_odds"]) if row["counter_odds"] is not None else None,
        "counter_selection": row["counter_selection"],
        "bk2_url": row["bk2_url"],
        "status": row["status"],
        "placed_at": float(row["placed_at"]),
        "settled_at": float(row["settled_at"]) if row["settled_at"] is not None else None,
        "payout": float(row["payout"]) if row["payout"] is not None else 0.0,
        "pinnacle_odds": float(row["pinnacle_odds"]) if "pinnacle_odds" in row.keys() and row["pinnacle_odds"] is not None else None,
        "robin_odds": float(row["robin_odds"]) if "robin_odds" in row.keys() and row["robin_odds"] is not None else None,
        "pinnacle_verify_odds": float(row["pinnacle_verify_odds"]) if "pinnacle_verify_odds" in row.keys() and row["pinnacle_verify_odds"] is not None else None,
        "pinnacle_hub_event_id": row["pinnacle_hub_event_id"] if "pinnacle_hub_event_id" in row.keys() else None,
        "margin": float(row["margin"]) if "margin" in row.keys() and row["margin"] is not None else None,
        "price_signature": row["price_signature"] if "price_signature" in row.keys() else None,
        "line_source": row["line_source"] if "line_source" in row.keys() else None,
        "pinnacle_live_place": json.loads(row["pinnacle_live_place"]) if "pinnacle_live_place" in row.keys() and row["pinnacle_live_place"] is not None else None,
    }


def upsert_user(user: dict[str, Any]) -> None:
    with _lock:
        conn = _connect()
        balance = user.get("balance", {})
        conn.execute(
            """
            INSERT INTO users(username, display_name, role, password_hash,
                              pinnacle_cashback, robinbet, cashback_pl,
                              created_at, last_login_at, forted_account_id, forted_filters)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(username) DO UPDATE SET
                display_name=excluded.display_name,
                role=excluded.role,
                password_hash=excluded.password_hash,
                pinnacle_cashback=excluded.pinnacle_cashback,
                robinbet=excluded.robinbet,
                cashback_pl=excluded.cashback_pl,
                last_login_at=excluded.last_login_at,
                forted_account_id=excluded.forted_account_id,
                forted_filters=excluded.forted_filters
            """,
            (
                user["username"],
                user["display_name"],
                user.get("role", "trader"),
                user["password_hash"],
                float(balance.get("pinnacle_cashback", 0)),
                float(balance.get("robinbet", 0)),
                float(balance.get("cashback_pl", 0)),
                float(user.get("created_at") or time.time()),
                user.get("last_login_at"),
                user.get("forted_account_id"),
                user.get("forted_filters"),
            ),
        )


def update_user_balance(username: str, balance: dict[str, float]) -> None:
    with _lock:
        conn = _connect()
        conn.execute(
            """
            UPDATE users SET pinnacle_cashback=?, robinbet=?, cashback_pl=?
            WHERE username=?
            """,
            (
                float(balance.get("pinnacle_cashback", 0)),
                float(balance.get("robinbet", 0)),
                float(balance.get("cashback_pl", 0)),
                username,
            ),
        )


def update_user_login(username: str, login_at: float) -> None:
    with _lock:
        conn = _connect()
        conn.execute("UPDATE users SET last_login_at=? WHERE username=?", (login_at, username))


def insert_bet(username: str, bet: dict[str, Any]) -> None:
    with _lock:
        conn = _connect()
        pinnacle_live_place_json = json.dumps(bet.get("pinnacle_live_place")) if bet.get("pinnacle_live_place") is not None else None
        conn.execute(
            """
            INSERT INTO bets(
                id, username, arb_id, match, sport, market, side, selection,
                odds, stake, cashback, potential_return,
                fork_profit_pct, robin_profit_pct, counter_bk, counter_odds, counter_selection,
                bk2_url, status, placed_at, settled_at, payout,
                pinnacle_odds, robin_odds, pinnacle_verify_odds, pinnacle_hub_event_id,
                margin, price_signature, line_source, pinnacle_live_place
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                bet["id"], username, bet.get("arb_id"), bet.get("match"),
                bet.get("sport"), bet.get("market"), bet.get("side"), bet.get("selection"),
                float(bet.get("odds") or 0), float(bet.get("stake") or 0),
                float(bet.get("cashback") or 0), float(bet.get("potential_return") or 0),
                bet.get("fork_profit_pct"), bet.get("robin_profit_pct"),
                bet.get("counter_bk"), bet.get("counter_odds"), bet.get("counter_selection"),
                bet.get("bk2_url"),
                bet.get("status", "accepted"), float(bet.get("placed_at") or time.time()),
                bet.get("settled_at"), float(bet.get("payout") or 0),
                bet.get("pinnacle_odds"), bet.get("robin_odds"), bet.get("pinnacle_verify_odds"),
                bet.get("pinnacle_hub_event_id"), bet.get("margin"), bet.get("price_signature"),
                bet.get("line_source"), pinnacle_live_place_json
            ),
        )


def update_bet_status(bet_id: str, status: str, settled_at: Optional[float], payout: float) -> None:
    with _lock:
        conn = _connect()
        conn.execute(
            "UPDATE bets SET status=?, settled_at=?, payout=? WHERE id=?",
            (status, settled_at, float(payout), bet_id),
        )


def aggregate_house_pnl() -> float:
    """Sum of cashback the house captured across ALL users (positive = robinarb earned)."""
    with _lock:
        conn = _connect()
        row = conn.execute("SELECT COALESCE(SUM(cashback_pl), 0) AS total FROM users").fetchone()
        return -float(row["total"] or 0)


def meta_get(key: str) -> Optional[str]:
    with _lock:
        conn = _connect()
        row = conn.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return row["value"] if row else None


def meta_set(key: str, value: str) -> None:
    with _lock:
        conn = _connect()
        conn.execute(
            "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )


def _row_to_hidden_item(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "scope": row["scope"],
        "hide_key": row["hide_key"],
        "match_key": row["match_key"],
        "arb_id": row["arb_id"],
        "match": row["match"],
        "sport": row["sport"],
        "market": row["market"],
        "selection": row["selection"],
        "counter_bk": row["counter_bk"],
        "odds_label": row["odds_label"],
        "created_at": float(row["created_at"]),
        "expires_at": float(row["expires_at"]),
    }


def list_hidden_items(username: str, now: float | None = None) -> list[dict[str, Any]]:
    ts = time.time() if now is None else float(now)
    with _lock:
        conn = _connect()
        conn.execute("DELETE FROM hidden_arbs WHERE expires_at<=?", (ts,))
        rows = conn.execute(
            """
            SELECT * FROM hidden_arbs
            WHERE username=? AND expires_at>?
            ORDER BY created_at DESC
            """,
            (username, ts),
        ).fetchall()
        return [_row_to_hidden_item(row) for row in rows]


def upsert_hidden_item(username: str, item: dict[str, Any]) -> dict[str, Any]:
    now = float(item.get("created_at") or time.time())
    expires_at = float(item.get("expires_at") or now)
    with _lock:
        conn = _connect()
        conn.execute(
            """
            INSERT INTO hidden_arbs(
                id, username, scope, hide_key, match_key, arb_id, match, sport,
                market, selection, counter_bk, odds_label, created_at, expires_at
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                scope=excluded.scope,
                hide_key=excluded.hide_key,
                match_key=excluded.match_key,
                arb_id=excluded.arb_id,
                match=excluded.match,
                sport=excluded.sport,
                market=excluded.market,
                selection=excluded.selection,
                counter_bk=excluded.counter_bk,
                odds_label=excluded.odds_label,
                created_at=excluded.created_at,
                expires_at=excluded.expires_at
            """,
            (
                item["id"], username, item["scope"], item["hide_key"], item.get("match_key"),
                item.get("arb_id"), item.get("match"), item.get("sport"), item.get("market"),
                item.get("selection"), item.get("counter_bk"), item.get("odds_label"),
                now, expires_at,
            ),
        )
    stored = dict(item)
    stored["created_at"] = now
    stored["expires_at"] = expires_at
    return stored


def delete_hidden_item(username: str, item_id: str) -> bool:
    with _lock:
        conn = _connect()
        cur = conn.execute("DELETE FROM hidden_arbs WHERE username=? AND id=?", (username, item_id))
        return cur.rowcount > 0


def delete_hidden_items_for_user(username: str) -> None:
    with _lock:
        conn = _connect()
        conn.execute("DELETE FROM hidden_arbs WHERE username=?", (username,))


def _row_to_system_rejection(row: sqlite3.Row) -> dict[str, Any]:
    try:
        context = json.loads(row["context_json"] or "{}")
    except (TypeError, ValueError, json.JSONDecodeError):
        context = {}
    if not isinstance(context, dict):
        context = {}
    return {
        "id": row["id"],
        "category": row["category"],
        "arb_id": row["arb_id"],
        "match": row["match"],
        "sport": row["sport"],
        "league": row["league"],
        "market": row["market"],
        "selection": row["selection"],
        "counter_bk": row["counter_bk"],
        "counter_selection": row["counter_selection"],
        "odds_label": row["odds_label"],
        "error_code": row["error_code"],
        "reason": row["reason"],
        "stage": row["stage"],
        "source": row["source"],
        "context": context,
        "first_seen": float(row["first_seen"]),
        "last_seen": float(row["last_seen"]),
        "occurrences": int(row["occurrences"] or 0),
        "expires_at": float(row["expires_at"]),
    }


def upsert_system_rejection(item: dict[str, Any]) -> dict[str, Any]:
    upsert_system_rejections([item])
    with _diagnostics_lock:
        row = _connect_diagnostics().execute(
            "SELECT * FROM system_rejections WHERE id=?",
            (item["id"],),
        ).fetchone()
    if row is None:
        raise RuntimeError("system rejection was not persisted")
    return _row_to_system_rejection(row)


def upsert_system_rejections(
    items: list[dict[str, Any]],
    *,
    max_rows: int = 5000,
) -> None:
    if not items:
        return
    bounded_max_rows = max(100, min(int(max_rows), 50000))
    newest_seen = max(float(item.get("last_seen") or time.time()) for item in items)
    with _diagnostics_lock:
        conn = _connect_diagnostics()
        conn.execute("BEGIN IMMEDIATE")
        try:
            conn.execute("DELETE FROM system_rejections WHERE expires_at<=?", (newest_seen,))
            for item in items:
                now = float(item.get("last_seen") or newest_seen)
                first_seen = float(item.get("first_seen") or now)
                expires_at = float(item.get("expires_at") or now)
                context_json = json.dumps(
                    item.get("context") if isinstance(item.get("context"), dict) else {},
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                )
                conn.execute(
                    """
                    INSERT INTO system_rejections(
                        id, category, arb_id, match, sport, league, market, selection,
                        counter_bk, counter_selection, odds_label, error_code, reason,
                        stage, source, context_json, first_seen, last_seen,
                        occurrences, expires_at
                    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        category=excluded.category,
                        arb_id=excluded.arb_id,
                        match=excluded.match,
                        sport=excluded.sport,
                        league=excluded.league,
                        market=excluded.market,
                        selection=excluded.selection,
                        counter_bk=excluded.counter_bk,
                        counter_selection=excluded.counter_selection,
                        odds_label=excluded.odds_label,
                        error_code=excluded.error_code,
                        reason=excluded.reason,
                        stage=excluded.stage,
                        source=excluded.source,
                        context_json=excluded.context_json,
                        first_seen=MIN(system_rejections.first_seen, excluded.first_seen),
                        last_seen=MAX(system_rejections.last_seen, excluded.last_seen),
                        occurrences=system_rejections.occurrences + 1,
                        expires_at=MAX(system_rejections.expires_at, excluded.expires_at)
                    """,
                    (
                        item["id"], item.get("category") or "verification",
                        item.get("arb_id"), item.get("match"), item.get("sport"),
                        item.get("league"), item.get("market"), item.get("selection"),
                        item.get("counter_bk"), item.get("counter_selection"),
                        item.get("odds_label"), item["error_code"], item.get("reason"),
                        item.get("stage"), item.get("source"), context_json,
                        first_seen, now, expires_at,
                    ),
                )
            conn.execute(
                """
                DELETE FROM system_rejections
                WHERE id IN (
                    SELECT id FROM system_rejections
                    ORDER BY
                        CASE category
                            WHEN 'verification' THEN 0
                            WHEN 'safety_filter' THEN 1
                            ELSE 2
                        END,
                        last_seen DESC
                    LIMIT -1 OFFSET ?
                )
                """,
                (bounded_max_rows,),
            )
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise


def list_system_rejections(
    *,
    now: float | None = None,
    limit: int = 200,
    category: str | None = None,
) -> list[dict[str, Any]]:
    rows, _total = get_system_rejections_page(now=now, limit=limit, category=category)
    return rows


def get_system_rejections_page(
    *,
    now: float | None = None,
    limit: int = 200,
    category: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    ts = time.time() if now is None else float(now)
    bounded_limit = max(1, min(int(limit), 1000))
    safe_category = str(category or "").strip() or None
    with _diagnostics_lock:
        conn = _connect_diagnostics()
        conn.execute("DELETE FROM system_rejections WHERE expires_at<=?", (ts,))
        where_sql = "expires_at>?"
        params: list[Any] = [ts]
        if safe_category:
            where_sql += " AND category=?"
            params.append(safe_category)
        total = int(conn.execute(
            f"SELECT COUNT(*) FROM system_rejections WHERE {where_sql}",
            tuple(params),
        ).fetchone()[0])
        rows = conn.execute(
            f"""
            SELECT * FROM system_rejections
            WHERE {where_sql}
            ORDER BY
                CASE category
                    WHEN 'verification' THEN 0
                    WHEN 'safety_filter' THEN 1
                    ELSE 2
                END,
                last_seen DESC
            LIMIT ?
            """,
            (*params, bounded_limit),
        ).fetchall()
    return [_row_to_system_rejection(row) for row in rows], total


def delete_system_rejections() -> None:
    with _diagnostics_lock:
        _connect_diagnostics().execute("DELETE FROM system_rejections")


__all__ = [
    "initialize",
    "load_users",
    "upsert_user",
    "update_user_balance",
    "update_user_login",
    "insert_bet",
    "update_bet_status",
    "aggregate_house_pnl",
    "meta_get",
    "meta_set",
    "list_hidden_items",
    "upsert_hidden_item",
    "delete_hidden_item",
    "delete_hidden_items_for_user",
    "upsert_system_rejection",
    "upsert_system_rejections",
    "list_system_rejections",
    "get_system_rejections_page",
    "delete_system_rejections",
]
