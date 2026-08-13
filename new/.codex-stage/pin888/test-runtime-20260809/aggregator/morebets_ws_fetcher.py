"""morebets_ws_fetcher: реальный MORE_BET pull-фрейм (Story 27.39).

WsMoreBetFetcher реализует MoreBetFetcher (Protocol из 27.38) и строит
проверенный фрейм PS3838::

    type: MORE_BET, destination: ODDS, eventId: int(pid)

Только ОТПРАВКА фрейма.  Ответ-снимок MORE_BET приходит в существующий
recv->ingest pipeline реактивно (morebets_dispatcher) - fetcher его НЕ ловит
и НЕ ждёт.  Транспорт инъектируется через FrameSender (DIP) -
BrowserWSProxy-мост подключается в story 27.40.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Protocol

from aggregator.morebets_active_fetcher import FetchResult, FetchStatus

_log = logging.getLogger(__name__)


class FrameSender(Protocol):
    """Транспортный интерфейс (инъектируется в WsMoreBetFetcher).

    Реализация BrowserWSProxy-мост появится в story 27.40.
    В тестах используется фейковый sender.
    """

    def send(self, account: Any, frame: dict[str, Any]) -> bool:
        """Отправить JSON-фрейм на WS указанного аккаунта.

        Возвращает True при успехе, False при неудаче (не бросает).
        """
        ...


class WsMoreBetFetcher:
    """Реальный MORE_BET pull-фрейм (fetch_fn для MoreBetsActiveFetcher, 27.38).

    Только ОТПРАВКА фрейма; ответ-снимок идёт в существующий recv->ingest
    реактивно.

    Анти-бан:
    - Темп <=1 r/s гарантируется вызывающим MoreBetsActiveFetcher.
    - Дополнительно: если account.last_429_at в окне backoff_sec -> RATE_LIMITED
      без отправки (не усугубляем 429).
    """

    def __init__(self, sender: FrameSender, *, backoff_sec: float = 1.0) -> None:
        self._sender = sender
        self._backoff_sec = backoff_sec

    def fetch(self, event_id: str, account: Any) -> FetchResult:
        """Построить и отправить MORE_BET pull-фрейм.

        AC-4: анти-бан - не дёргать 429-аккаунт в окне backoff.
        AC-3: eventId - int (проверенная форма фрейма PS3838).
        NOTE: Ответ-снимок (type=MORE_BET) обрабатывается recv->ingest
              реактивно - fetcher его НЕ ловит и НЕ ждёт.
        """
        last_429 = getattr(account, 'last_429_at', None)
        if last_429 is not None:
            try:
                elapsed = time.time() - last_429.timestamp()
                if elapsed < self._backoff_sec:
                    _log.debug(
                        'WsMoreBetFetcher: RATE_LIMITED acct=%s event=%s '
                        '(last_429 %.1fs ago < backoff %.1fs)',
                        getattr(account, 'account_id', '?'),
                        event_id,
                        elapsed,
                        self._backoff_sec,
                    )
                    return FetchResult(FetchStatus.RATE_LIMITED, 'account in 429 backoff')
            except Exception:  # noqa: BLE001
                # FIX P2-A: fail-CLOSED — невалидный last_429_at != None
                # не должен пропускать запрос (ban-sensitive). RATE_LIMITED.
                _log.warning(
                    'WsMoreBetFetcher: unparseable last_429_at=%r, RATE_LIMITED',
                    last_429,
                )
                return FetchResult(FetchStatus.RATE_LIMITED, 'unparseable last_429_at')

        try:
            event_id_int = int(event_id)
        except (ValueError, TypeError):
            _log.warning('WsMoreBetFetcher: bad event_id=%r', event_id)
            return FetchResult(FetchStatus.ERROR, f'bad event_id: {repr(event_id)}')

        frame: dict[str, Any] = {
            'type': 'MORE_BET',
            'destination': 'ODDS',
            'eventId': event_id_int,
        }

        try:
            ok = self._sender.send(account, frame)
        except Exception as exc:  # noqa: BLE001
            _log.warning('WsMoreBetFetcher.send raised: %s', exc)
            return FetchResult(FetchStatus.ERROR, str(exc))

        if ok:
            return FetchResult(FetchStatus.OK)
        return FetchResult(FetchStatus.ERROR, 'sender returned False')


__all__ = ['FrameSender', 'WsMoreBetFetcher']
