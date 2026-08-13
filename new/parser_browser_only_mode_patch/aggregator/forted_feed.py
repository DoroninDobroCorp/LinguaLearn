#!/usr/bin/env python3
"""forted_feed: HTTP поллер /api/signals/feed -> FortedTopNTrigger.set_forks.

Story 27.45. Инъектируемый транспорт (ForkFetcher Protocol) - тест без сети.
Апстрим down -> не падает, держит прошлый набор форков, логирует degraded.

Контракт форка на выходе: {event_id: int (pin pid), profit: float, is_live: bool}.
Форки без валидного pin-pid пропускаются (финансовая безопасность).
"""

from __future__ import annotations

import logging
import threading
from typing import Any, Protocol
from urllib.parse import parse_qs, urlparse

log = logging.getLogger(__name__)


class ForkFetcher(Protocol):
    """Транспортный интерфейс источника форков. Инъектируется в FortedFeedPoller."""

    def fetch(self) -> list[dict[str, Any]]:
        """Вернуть список сырых форков. Бросать исключение при ошибке."""
        ...  # pragma: no cover


class _TriggerSink(Protocol):
    """Минимальный интерфейс триггера, нужный поллеру."""

    def set_forks(self, forks: list[dict[str, Any]]) -> None:
        ...  # pragma: no cover


class RealForkFetcher:
    """Получает форки с реального /api/signals/feed?limit=N."""

    def __init__(
        self,
        url: str,
        *,
        limit: int = 100,
        timeout: float = 8.0,
        key: str = "",
    ) -> None:
        self._url = url
        self._limit = limit
        self._timeout = timeout
        self._key = key

    def fetch(self) -> list[dict[str, Any]]:
        import requests  # type: ignore[import-untyped]

        params: dict[str, int] = {"limit": self._limit}
        headers: dict[str, str] = {}
        if self._key:
            headers["X-Forted-Key"] = self._key
        resp = requests.get(
            self._url, params=params, timeout=self._timeout, headers=headers
        )
        resp.raise_for_status()
        data: Any = resp.json()
        # Релей 80 (2026-06-10) заворачивает форки в {"items": [...], "count": N}.
        if isinstance(data, dict) and isinstance(data.get("items"), list):
            data = data["items"]
        if not isinstance(data, list):
            raise ValueError(
                "upstream returned non-list type=" + type(data).__name__
            )
        return list(data)


def _extract_pin_candidates(url: str) -> set[int]:
    """Вернуть все all-digit path/query токены длиной >= 9 из URL.

    Pinnacle pid ~9-10 цифр (пример из прода: 1631757397).
    Дата YYYYMMDD = 8 цифр, поэтому порог >= 9 исключает даты.
    """
    candidates: set[int] = set()
    try:
        parsed = urlparse(url)
        for seg in parsed.path.split("/"):
            if seg.isdigit() and len(seg) >= 9:
                candidates.add(int(seg))
        for vals in parse_qs(parsed.query).values():
            for v in vals:
                if v.isdigit() and len(v) >= 9:
                    candidates.add(int(v))
    except Exception:  # noqa: BLE001
        pass
    return candidates


def extract_pin_pid(fork: dict[str, Any]) -> int | None:
    """Извлечь Pinnacle pid (int) из сырого форка.

    Стратегия (финансовая безопасность: при неоднозначности форк пропускается):
    1. bk2_link (Pinnacle URL): найти все all-digit токены len>=9 в path-сегментах
       и query-значениях.
       - Ровно один уникальный -> pid.
       - Несколько разных ИЛИ ни одного -> None (пропустить, не угадывать).
       - При непустом bk2_link event_id НЕ используется как запасной вариант.
    2. Fallback на int(event_id) -- только если bk2_link отсутствует/пустой
       И event_id само является числом с len>=9.
    3. None -> форк пропускается.

    # TODO: сверить стратегию на живом фиде когда апстрим будет доступен.
    """
    bk2_link = fork.get("bk2_link")
    if isinstance(bk2_link, str) and bk2_link:
        candidates = _extract_pin_candidates(bk2_link)
        if len(candidates) == 1:
            return next(iter(candidates))
        # 0 (нет подходящих) или >1 (неоднозначно) -- пропустить форк
        return None
    # bk2_link отсутствует или пустой -> fallback на event_id len>=9
    event_id = fork.get("event_id")
    if event_id is not None:
        s = str(event_id).strip()
        if s.isdigit() and len(s) >= 9:
            try:
                return int(s)
            except (ValueError, TypeError):
                pass
    return None


def extract_pin_pid_raw(fork: dict[str, Any]) -> int | None:
    """Извлечь Pinnacle pid (int) из форка СЫРОГО dev-фида (27.47).

    Алгоритм (финансовая безопасность -- event_id НИКОГДА не используется):
    1. Определить сторону pinnaclesports.com: bk1 ИЛИ bk2.
    2. Взять соответствующий bkN_link (raw-формат "/XXXXXXXXXX").
    3. Извлечь ровно один digit-only токен len>=9 -> pid.
       Неоднозначность (>1) или отсутствие (0) -> None (форк пропустить).
    4. Если ни bk1 ни bk2 != pinnaclesports.com -> None (форк пропустить).
    5. НИКОГДА не фоллбэчить на int(event_id) -- в raw-фиде event_id != pin-pid.
    """
    bk1 = fork.get("bk1", "")
    bk2 = fork.get("bk2", "")

    if bk1 == "pinnaclesports.com":
        link = fork.get("bk1_link", "")
    elif bk2 == "pinnaclesports.com":
        link = fork.get("bk2_link", "")
    else:
        return None

    if not isinstance(link, str) or not link:
        return None

    candidates = _extract_pin_candidates(link)
    if len(candidates) == 1:
        return next(iter(candidates))
    return None


def _parse_is_live(raw_live: Any) -> bool:
    """Парсить is_live из строки/bool в bool. None/неизвестное -> False (безопасный дефолт)."""
    if raw_live is None:
        return False
    return str(raw_live).strip().lower() not in {"", "0", "false", "no", "none", "prematch"}


def map_forks(
    raw: list[dict[str, Any]],
    fmt: str = "sanitized",
) -> list[dict[str, Any]]:
    """Смапить сырые форки -> [{"event_id":int, "profit":float, "is_live":bool}].

    Форки без валидного pin-pid молча пропускаются.
    """
    out: list[dict[str, Any]] = []
    for fork in raw:
        if fmt == "raw":
            pid = extract_pin_pid_raw(fork)
        else:
            pid = extract_pin_pid(fork)
        if pid is None:
            continue
        profit_raw = fork.get("profit")
        try:
            profit = float(profit_raw)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            profit = 0.0
        is_live = _parse_is_live(fork.get("is_live", False))
        out.append({"event_id": pid, "profit": profit, "is_live": is_live})
    return out


class FortedFeedPoller:
    """Периодически получает форки и проталкивает их в FortedTopNTrigger.

    Транспорт инъектируется (fetcher: ForkFetcher) -> юнит-тесты без сети.
    При ошибке фетчера или non-list ответе предыдущий набор форков сохраняется
    (set_forks НЕ вызывается), лог throttled без стектрейса и без URL.

    Args:
        trigger:      Триггер, принимающий смапированные форки.
        fetcher:      Объект, выполняющий HTTP-запрос.
        interval_sec: Интервал между опросами (секунды).
        limit:        Подсказка лимита для реального фетчера.
    """

    def __init__(
        self,
        trigger: _TriggerSink,
        fetcher: ForkFetcher,
        *,
        interval_sec: float = 5.0,
        limit: int = 100,
        fmt: str = "sanitized",
    ) -> None:
        self._trigger = trigger
        self._fetcher = fetcher
        self._interval_sec = interval_sec
        self._limit = limit
        self._fmt = fmt
        self._fail_count: int = 0  # throttle деградированных логов

    def _log_degraded(self, reason: str) -> None:
        """Throttled warning: первый фейл + каждый 10-й; без exc_info, без URL."""
        if self._fail_count == 1 or self._fail_count % 10 == 0:
            log.warning(
                "forted_feed: upstream degraded (fail #%d) %s"
                " - keeping previous fork set",
                self._fail_count,
                reason[:120],
            )

    def poll_once(self) -> None:
        """Один опрос: fetch -> map -> trigger.set_forks.

        При исключении фетчера или non-list ответе: throttled лог + прошлый набор
        форков сохраняется (set_forks НЕ вызывается). При успехе _fail_count сбрасывается.
        """
        try:
            raw = self._fetcher.fetch()
        except Exception as exc:
            self._fail_count += 1
            self._log_degraded(str(exc))
            return

        # P1b: runtime-проверка типа -- non-list ответ не затирает форки
        if not isinstance(raw, list):
            self._fail_count += 1
            self._log_degraded("non-list type=" + type(raw).__name__)
            return

        self._fail_count = 0
        mapped = map_forks(raw, fmt=self._fmt)
        self._trigger.set_forks(mapped)
        log.debug("forted_feed: %d forks pushed to trigger", len(mapped))

    def run_forever(self, stop_event: threading.Event) -> None:
        """Цикл опроса. Выходит когда stop_event установлен."""
        while not stop_event.is_set():
            self.poll_once()
            stop_event.wait(timeout=self._interval_sec)
