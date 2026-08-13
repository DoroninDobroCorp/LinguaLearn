#!/usr/bin/env python3
"""forted_targeting: выбор СОБЫТИЙ для MORE_BET по вилкам Forted (top-N + linger).

Канонический dispatcher (morebets_dispatcher) выбирает ИСТОЧНИК per (event, family),
но НЕ решает по каким событиям тянуть доп-рынки. Этот модуль — недостающий вход:
из фида вилок Forted строит приоритетный watchlist (top-N по профиту + linger-хвост),
который драйвит, для каких событий запрашивать MORE_BET. Чистые функции (без I/O).

Перенесено из эксперимента docs/night-experiments-2026-05-28/aggregator/morebet_scheduler.py
(Story 27.29-31, Gate A/B validated). Анти-бан инвариант: ≤1 r/s/аккаунт.
"""

from __future__ import annotations

from typing import Any

HARD_MOREBET_RPS_CAP: float = 1.0


def active_watchlist(now: float, seen: dict[int, float], linger_sec: float) -> list[int]:
    """eventId, ещё живущие в TTL (first_seen + linger_sec > now). Сортировка по first_seen."""
    items = [(eid, t) for eid, t in seen.items() if now - t < linger_sec]
    items.sort(key=lambda x: x[1])
    return [eid for eid, _ in items]


def partition_watchlist(watchlist: list[int], n_workers: int) -> list[list[int]]:
    """Round-robin распределение событий по воркерам (балансировка размера)."""
    if n_workers <= 0:
        raise ValueError("n_workers must be > 0")
    buckets: list[list[int]] = [[] for _ in range(n_workers)]
    for i, eid in enumerate(watchlist):
        buckets[i % n_workers].append(eid)
    return buckets


def worker_capacity(refresh_sec: float, per_acct_rps: float = HARD_MOREBET_RPS_CAP) -> int:
    """Сколько событий 1 воркер успевает освежать каждые refresh_sec при ≤1 r/s."""
    if refresh_sec <= 0:
        raise ValueError("refresh_sec must be > 0")
    safe_rps = min(per_acct_rps, HARD_MOREBET_RPS_CAP)
    return int(refresh_sec * safe_rps)


def fits_in_time(events_per_worker: int, refresh_sec: float,
                 per_acct_rps: float = HARD_MOREBET_RPS_CAP) -> bool:
    """Укладывается ли воркер: events_per_worker <= worker_capacity(refresh)."""
    return events_per_worker <= worker_capacity(refresh_sec, per_acct_rps)


def schedule_due(now: float, due: dict[int, float]) -> list[int]:
    """eventId, у которых наступил срок (due_time <= now), от самого просроченного."""
    ready = [(eid, t) for eid, t in due.items() if t <= now]
    ready.sort(key=lambda x: x[1])
    return [eid for eid, _ in ready]


def next_interval(per_acct_rps: float = HARD_MOREBET_RPS_CAP) -> float:
    """Минимальный интервал между запросами одного воркера (анти-бан ≤1 r/s)."""
    safe_rps = min(per_acct_rps, HARD_MOREBET_RPS_CAP)
    if safe_rps <= 0:
        raise ValueError("per_acct_rps must be > 0")
    return 1.0 / safe_rps


# ---------------------------------------------------------------------------
# Top-N вилок: следим не за всеми, а за top-N по профиту (+ linger-хвост)
# ---------------------------------------------------------------------------


def rank_top_n(forks: list[dict[str, Any]], n: int, rank_key: str = "profit") -> list[int]:
    """Топ-N event_id из вилок Forted, отсортированных по rank_key (профит) убыв.

    forks: [{"event_id": int, "profit": float, ...}, ...].
    Пропускает записи без валидного event_id. n<=0 -> [].
    """
    if n <= 0:
        return []
    valid = [f for f in forks if isinstance(f.get("event_id"), int)]
    valid.sort(key=lambda f: float(f.get(rank_key, 0.0) or 0.0), reverse=True)
    seen: set[int] = set()
    out: list[int] = []
    for f in valid:
        eid = int(f["event_id"])
        if eid in seen:
            continue
        seen.add(eid)
        out.append(eid)
        if len(out) >= n:
            break
    return out


def topn_watchlist(forks: list[dict[str, Any]], n: int, last_top: dict[int, float],
                   now: float, linger_sec: float, rank_key: str = "profit") -> list[int]:
    """Watchlist = top-N сейчас ∪ linger-хвост (event'ы, выпавшие из топа < linger_sec назад).

    Мутирует last_top: проставляет now для текущего top-N. Возвращает активный список
    (top-N + те, кто ещё в окне linger). Так событие наблюдается ещё ~2 мин после ухода из топа.
    """
    top = rank_top_n(forks, n, rank_key)
    for eid in top:
        last_top[eid] = now
    active = [eid for eid, t in last_top.items() if now - t < linger_sec]
    # подчистить совсем протухшие, чтобы dict не рос
    for eid in [e for e, t in last_top.items() if now - t >= linger_sec]:
        del last_top[eid]
    return active
