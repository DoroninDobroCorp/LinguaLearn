#!/usr/bin/env python3
"""fleet_calc: расчёт размера фермы из измеренного юнита (Story 27.30 AC-6).

Чистые функции (без I/O) — вход для калькулятора фермы.
Юнит-числа берутся из Story 27.29 probe-прогонов:
  - per_acct_morebet_rps: безопасный порог MORE_BET на 1 аккаунт (≤1.0, из exp_unit_429)
  - per_socket_events: потолок событий основной линии на 1 push-сокет (из exp_unit_pushcap)

Бизнес-контекст: ферма привязана к событиям С ВИЛКАМИ Forted (+linger-хвост),
НЕ ко всем событиям. Основная линия = PUSH (дёшево), MORE_BET = PULL (бутылочное горло).
"""
from __future__ import annotations

import math

# Жёсткий анти-бан потолок (см. project_ws_morebet_ceiling): ≤1 r/s на аккаунт.
HARD_MOREBET_RPS_CAP: float = 1.0


def required_morebet_rps(events_with_arbs: int, refresh_sec: float) -> float:
    """Сколько MORE_BET-запросов/сек нужно, чтобы освежать N событий каждые refresh_sec.

    events_with_arbs — размер активного watchlist (вилки + linger-хвост).
    refresh_sec — целевая свежесть (лайв ~2с, прематч ~12с).
    """
    if refresh_sec <= 0:
        raise ValueError("refresh_sec must be > 0")
    if events_with_arbs < 0:
        raise ValueError("events_with_arbs must be >= 0")
    return events_with_arbs / refresh_sec


def morebet_accounts(
    events_with_arbs: int,
    refresh_sec: float,
    per_acct_rps: float = HARD_MOREBET_RPS_CAP,
) -> int:
    """Сколько аккаунтов нужно на MORE_BET под events_with_arbs при целевой свежести.

    per_acct_rps клампится к HARD_MOREBET_RPS_CAP (анти-бан): нельзя закладывать >1 r/s.
    """
    if per_acct_rps <= 0:
        raise ValueError("per_acct_rps must be > 0")
    safe_rps = min(per_acct_rps, HARD_MOREBET_RPS_CAP)
    need = required_morebet_rps(events_with_arbs, refresh_sec)
    return math.ceil(need / safe_rps)


def pushline_accounts(total_events: int, per_socket_events: int) -> int:
    """Сколько аккаунтов/сокетов нужно на основную линию (PUSH) под total_events.

    per_socket_events — измеренный потолок событий на 1 сокет (exp_unit_pushcap).
    """
    if per_socket_events <= 0:
        raise ValueError("per_socket_events must be > 0")
    if total_events < 0:
        raise ValueError("total_events must be >= 0")
    if total_events == 0:
        return 0
    return math.ceil(total_events / per_socket_events)


def fleet_size(
    events_with_arbs: int,
    total_line_events: int,
    live_refresh_sec: float = 2.0,
    prematch_refresh_sec: float = 12.0,
    live_fraction: float = 0.3,
    per_acct_rps: float = HARD_MOREBET_RPS_CAP,
    per_socket_events: int = 800,
) -> dict[str, float | int]:
    """Полный расчёт фермы.

    Разделяет watchlist на лайв/прематч (live_fraction) с разной свежестью,
    считает MORE_BET-аккаунты для каждой части + push-аккаунты основной линии.
    Возвращает разбивку и суммарное число аккаунтов.
    """
    if not 0.0 <= live_fraction <= 1.0:
        raise ValueError("live_fraction must be in [0, 1]")
    live_events = round(events_with_arbs * live_fraction)
    prematch_events = events_with_arbs - live_events
    acc_live = morebet_accounts(live_events, live_refresh_sec, per_acct_rps)
    acc_prematch = morebet_accounts(prematch_events, prematch_refresh_sec, per_acct_rps)
    acc_push = pushline_accounts(total_line_events, per_socket_events)
    morebet_total = acc_live + acc_prematch
    return dict(
        events_with_arbs=events_with_arbs,
        live_events=live_events,
        prematch_events=prematch_events,
        morebet_accounts_live=acc_live,
        morebet_accounts_prematch=acc_prematch,
        morebet_accounts_total=morebet_total,
        pushline_accounts=acc_push,
        fleet_accounts_total=morebet_total + acc_push,
    )
