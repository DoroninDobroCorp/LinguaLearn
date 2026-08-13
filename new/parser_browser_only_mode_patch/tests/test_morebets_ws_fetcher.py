"""tests/test_morebets_ws_fetcher.py -- юнит-тесты WsMoreBetFetcher (Story 27.39).

БЕЗ сети. Фейковый FrameSender + фейковый account.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any


from aggregator.morebets_ws_fetcher import WsMoreBetFetcher
from aggregator.morebets_active_fetcher import (
    FetchStatus,
    MoreBetsActiveFetcher,
)

class FakeSender:
    """Фейковый FrameSender: записывает вызовы, может бросать / возвращать False."""

    def __init__(self, ok: bool = True, raise_exc: Exception | None = None) -> None:
        self.ok = ok
        self.raise_exc = raise_exc
        self.calls: list[tuple[Any, dict[str, Any]]] = []

    def send(self, account: Any, frame: dict[str, Any]) -> bool:
        self.calls.append((account, frame))
        if self.raise_exc is not None:
            raise self.raise_exc
        return self.ok


class FakeAccount:
    """Фейковый Account с account_id и last_429_at."""

    def __init__(
        self,
        account_id: str = "ACC001",
        last_429_at: datetime | None = None,
    ) -> None:
        self.account_id = account_id
        self.last_429_at = last_429_at

def test_frame_shape_exact() -> None:
    """AC-3: фрейм РОВНО type=MORE_BET destination=ODDS eventId=int."""
    sender = FakeSender()
    fetcher = WsMoreBetFetcher(sender)
    acc = FakeAccount()
    fetcher.fetch("1234567", acc)
    assert len(sender.calls) == 1
    _, frame = sender.calls[0]
    assert frame["type"] == "MORE_BET"
    assert frame["destination"] == "ODDS"
    assert frame["eventId"] == 1234567
    assert isinstance(frame["eventId"], int)
    assert set(frame.keys()) == {"type", "destination", "eventId"}


def test_ok_on_successful_send() -> None:
    """AC-1: при успешном send -> FetchResult(OK)."""
    sender = FakeSender(ok=True)
    fetcher = WsMoreBetFetcher(sender)
    result = fetcher.fetch("999", FakeAccount())
    assert result.status == FetchStatus.OK


def test_error_on_sender_raises() -> None:
    """AC-1: при исключении от sender -> FetchResult(ERROR) с деталью."""
    exc = RuntimeError("ws closed")
    sender = FakeSender(raise_exc=exc)
    fetcher = WsMoreBetFetcher(sender)
    result = fetcher.fetch("100", FakeAccount())
    assert result.status == FetchStatus.ERROR
    assert "ws closed" in result.detail


def test_error_on_sender_returns_false() -> None:
    """AC-1: при sender возвращает False -> FetchResult(ERROR)."""
    sender = FakeSender(ok=False)
    fetcher = WsMoreBetFetcher(sender)
    result = fetcher.fetch("100", FakeAccount())
    assert result.status == FetchStatus.ERROR
    assert len(sender.calls) == 1

def test_rate_limited_for_fresh_429_account() -> None:
    """AC-4: аккаунт с недавним last_429_at -> RATE_LIMITED БЕЗ вызова send."""
    sender = FakeSender()
    fetcher = WsMoreBetFetcher(sender, backoff_sec=60.0)
    now_dt = datetime.now(timezone.utc)
    acc = FakeAccount(last_429_at=now_dt)
    result = fetcher.fetch("42", acc)
    assert result.status == FetchStatus.RATE_LIMITED
    assert len(sender.calls) == 0, "send должен быть НЕ вызван"


def test_no_rate_limit_for_old_429() -> None:
    """AC-4: last_429_at давно (> backoff_sec) -> отправка идёт."""
    sender = FakeSender()
    fetcher = WsMoreBetFetcher(sender, backoff_sec=1.0)
    old_dt = datetime.fromtimestamp(time.time() - 5.0, tz=timezone.utc)
    acc = FakeAccount(last_429_at=old_dt)
    result = fetcher.fetch("42", acc)
    assert result.status == FetchStatus.OK
    assert len(sender.calls) == 1


def test_no_rate_limit_when_last_429_is_none() -> None:
    """AC-4: last_429_at=None -> отправка идёт без проверки backoff."""
    sender = FakeSender()
    fetcher = WsMoreBetFetcher(sender)
    acc = FakeAccount(last_429_at=None)
    result = fetcher.fetch("77", acc)
    assert result.status == FetchStatus.OK
    assert len(sender.calls) == 1


def test_event_id_cast_to_int() -> None:
    """AC-3: event_id типа str кастуется в int для eventId."""
    sender = FakeSender()
    WsMoreBetFetcher(sender).fetch("1800000001", FakeAccount())
    assert sender.calls[0][1]["eventId"] == 1800000001
    assert isinstance(sender.calls[0][1]["eventId"], int)


def test_invalid_event_id_returns_error() -> None:
    """DoD-7: невалидный event_id -> ERROR, не падать."""
    sender = FakeSender()
    result = WsMoreBetFetcher(sender).fetch("abc", FakeAccount())
    assert result.status == FetchStatus.ERROR
    assert len(sender.calls) == 0


def test_empty_event_id_returns_error() -> None:
    """DoD-7: пустой event_id -> ERROR."""
    sender = FakeSender()
    result = WsMoreBetFetcher(sender).fetch("", FakeAccount())
    assert result.status == FetchStatus.ERROR
    assert len(sender.calls) == 0

def test_account_agnostic_different_ids() -> None:
    """DoD-7: разные account_id -> оба отправляют корректно."""
    sender = FakeSender()
    fetcher = WsMoreBetFetcher(sender)
    acc1 = FakeAccount("AC001")
    acc2 = FakeAccount("AC002")
    r1 = fetcher.fetch("100", acc1)
    r2 = fetcher.fetch("200", acc2)
    assert r1.status == FetchStatus.OK
    assert r2.status == FetchStatus.OK
    assert sender.calls[0][0] is acc1
    assert sender.calls[1][0] is acc2
    assert sender.calls[0][1]["eventId"] == 100
    assert sender.calls[1][1]["eventId"] == 200


def test_frame_sent_to_correct_account() -> None:
    """AC-1: sender получает именно тот account объект, что передан в fetch."""
    sender = FakeSender()
    fetcher = WsMoreBetFetcher(sender)
    acc = FakeAccount("TARGET_ACC")
    fetcher.fetch("55", acc)
    assert sender.calls[0][0] is acc


def test_rate_limited_not_sending_when_backoff_500ms() -> None:
    """AC-4: backoff_sec=0.5, last_429_at=0.1s ago -> RATE_LIMITED."""
    sender = FakeSender()
    fetcher = WsMoreBetFetcher(sender, backoff_sec=0.5)
    recent_dt = datetime.fromtimestamp(time.time() - 0.1, tz=timezone.utc)
    acc = FakeAccount(last_429_at=recent_dt)
    result = fetcher.fetch("1", acc)
    assert result.status == FetchStatus.RATE_LIMITED
    assert not sender.calls


def test_backoff_expired_sends() -> None:
    """AC-4: backoff_sec=0.1, last_429_at=0.5s ago -> отправка идёт."""
    sender = FakeSender()
    fetcher = WsMoreBetFetcher(sender, backoff_sec=0.1)
    old_dt = datetime.fromtimestamp(time.time() - 0.5, tz=timezone.utc)
    acc = FakeAccount(last_429_at=old_dt)
    result = fetcher.fetch("1", acc)
    assert result.status == FetchStatus.OK
    assert len(sender.calls) == 1

def test_integration_as_fetch_fn_in_active_fetcher() -> None:
    """DoD-7 integration: WsMoreBetFetcher as fetch_fn in MoreBetsActiveFetcher.
    run_once returns True and frame is sent (fake-pool + fake-sender)."""
    from aggregator.event_priority_queue import EventPriorityQueue
    from aggregator.account_pool import AccountPool, Account

    sender = FakeSender()
    fetcher = WsMoreBetFetcher(sender)

    queue: EventPriorityQueue = EventPriorityQueue()
    queue.push("1599000001", priority=1.0)

    pool = AccountPool()
    acc = Account(
        account_id="ACTEST",
        family="ps3838",
    )
    pool.register(acc)

    maf = MoreBetsActiveFetcher(
        queue=queue,
        pool=pool,
        fetch_fn=fetcher,
        min_interval_sec=0.0001,
    )

    import time as _time
    ran = maf.run_once(_time.time())
    assert ran is True
    assert len(sender.calls) == 1
    _, frame = sender.calls[0]
    assert frame["type"] == "MORE_BET"
    assert frame["eventId"] == 1599000001


def test_malformed_last_429_at_fails_closed() -> None:
    """FIX P2-A: last_429_at невалидный (не datetime/нет .timestamp) -> RATE_LIMITED, send НЕ вызван.

    Fail-closed: ban-sensitive логика — при непарсируемом last_429_at
    безопаснее заблокировать запрос, чем пропустить.
    """
    sender = FakeSender()
    fetcher = WsMoreBetFetcher(sender, backoff_sec=60.0)

    class _BadTimestamp:
        """Объект с last_429_at есть (не None), но .timestamp() бросает."""
        def timestamp(self) -> float:
            raise AttributeError("no timestamp")

    acc_bad_str = FakeAccount()
    acc_bad_str.last_429_at = "garbage"  # type: ignore[assignment]
    result = fetcher.fetch("42", acc_bad_str)
    assert result.status == FetchStatus.RATE_LIMITED, (
        f"ожидали RATE_LIMITED, получили {result.status}"
    )
    assert len(sender.calls) == 0, "send не должен вызываться при невалидном last_429_at"

    acc_bad_obj = FakeAccount()
    acc_bad_obj.last_429_at = _BadTimestamp()  # type: ignore[assignment]
    result2 = fetcher.fetch("99", acc_bad_obj)
    assert result2.status == FetchStatus.RATE_LIMITED
    assert len(sender.calls) == 0
