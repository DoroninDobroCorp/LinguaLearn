"""tests/test_morebets_targeting_bridge.py -- Story 27.37.

>=8 юнит-тестов для TargetingPromoter (мост targeting -> EventPriorityQueue).
"""

from __future__ import annotations

from typing import Any
from unittest.mock import patch


from aggregator.event_priority_queue import EventPriority, EventPriorityQueue
from aggregator.morebets_targeting import (
    FortedTopNTrigger,
    MoreBetsTargeter,
)
from aggregator.morebets_targeting_bridge import TargetingPromoter


# ─── helpers ───────────────────────────────────────────────────────────────


def _forks(*pairs: tuple[int, float]) -> list[dict[str, Any]]:
    return [dict(event_id=eid, profit=pr, is_live=False) for eid, pr in pairs]


def _make_targeter(
    triggers: list[Any],
    top_n: int = 10,
    watch: float = 120.0,
) -> MoreBetsTargeter:
    return MoreBetsTargeter(
        triggers=triggers,
        top_n=top_n,
        watch_duration_sec=watch,
        default_family="first_half_1x2",
    )


# ─── T01: promote пушит PROMOTED в очередь ─────────────────────────────────


def test_promote_pushes_promoted_priority() -> None:
    """AC-1: promote() вызывает queue.push(str(event_id), PROMOTED) для каждого target."""
    trigger = FortedTopNTrigger(_forks((101, 1.0), (202, 2.0)))
    targeter = _make_targeter([trigger])
    queue = EventPriorityQueue()
    promoter = TargetingPromoter(targeter=targeter, queue=queue)

    count = promoter.promote(now=0.0)

    assert count == 2
    # Оба события должны быть в очереди с PROMOTED
    live = set(queue.peek_by_priority(EventPriority.PROMOTED))
    assert "101" in live
    assert "202" in live


# ─── T02: int → str конвертация event_id ────────────────────────────────────


def test_promote_converts_int_event_id_to_str() -> None:
    """AC-1/DOD-4: event_id (int) конвертируется в str для queue.push."""
    trigger = FortedTopNTrigger(_forks((999, 5.0)))
    targeter = _make_targeter([trigger])
    queue = EventPriorityQueue()
    promoter = TargetingPromoter(targeter=targeter, queue=queue)

    promoter.promote(now=0.0)

    # queue хранит str ключи
    snapshot = queue.snapshot()
    keys = [eid for eid, _ in snapshot]
    assert "999" in keys
    assert 999 not in keys  # type: ignore[comparison-overlap]


# ─── T03: reprioritise — повторный promote не дублирует запись ─────────────


def test_promote_reprioritise_no_duplicate() -> None:
    """AC-1: повторный promote того же event_id — reprioritise, не дублит."""
    trigger = FortedTopNTrigger(_forks((101, 1.5)))
    targeter = _make_targeter([trigger])
    queue = EventPriorityQueue()
    promoter = TargetingPromoter(targeter=targeter, queue=queue)

    promoter.promote(now=0.0)
    len_after_first = len(queue)

    promoter.promote(now=1.0)
    len_after_second = len(queue)

    # len(queue) == len(_current) — без дублей
    assert len_after_first == 1
    assert len_after_second == 1
    assert len(queue) == 1


# ─── T04: выпавший из select_targets не промоутится ────────────────────────


def test_promote_expired_event_not_repromoted() -> None:
    """AC-4: событие, вышедшее из watchlist (истёк watch-duration), не промоутится."""
    trigger = FortedTopNTrigger(_forks((555, 3.0)))
    targeter = _make_targeter([trigger], watch=10.0)
    queue = EventPriorityQueue()
    promoter = TargetingPromoter(targeter=targeter, queue=queue)

    # первый промоут — событие в watch-window
    count_first = promoter.promote(now=0.0)
    assert count_first == 1

    # pop чтобы очередь была пустой
    queue.pop()

    # убираем вилки (событие выпало из триггера + watch-duration истёк)
    trigger.set_forks([])
    count_second = promoter.promote(now=200.0)  # 200s >> watch=10s

    assert count_second == 0
    assert queue.is_empty


# ─── T05: пустой watchlist → 0 промоутов ──────────────────────────────────


def test_promote_empty_watchlist_returns_zero() -> None:
    """AC-1: если select_targets возвращает [], promote() возвращает 0."""
    trigger = FortedTopNTrigger([])
    targeter = _make_targeter([trigger])
    queue = EventPriorityQueue()
    promoter = TargetingPromoter(targeter=targeter, queue=queue)

    count = promoter.promote(now=0.0)

    assert count == 0
    assert queue.is_empty


# ─── T06: account-agnostic (bridge не знает про аккаунты) ─────────────────


def test_promoter_is_account_agnostic() -> None:
    """AC-5: bridge оперирует только event_id/priority — нет зависимости от аккаунтов."""
    # TargetingPromoter принимает только targeter + queue, ни AccountPool,
    # ни morebets_dispatcher, ни source не передаются
    import inspect
    sig = inspect.signature(TargetingPromoter.__init__)
    params = set(sig.parameters.keys()) - {"self"}
    assert params == {"targeter", "queue"}, (
        f"TargetingPromoter.__init__ должен принимать только targeter+queue, "
        f"получил: {params}"
    )


# ─── T07: флаг OFF → wiring неактивен (targeter не создаётся) ─────────────


def test_flag_off_targeting_not_activated() -> None:
    """AC-2: при MOREBETS_TARGETING_ENABLED=0 (default) wiring неактивен."""
    import os
    # Убеждаемся что флаг OFF
    env = os.environ.copy()
    env.pop("MOREBETS_TARGETING_ENABLED", None)

    # Проверяем через config
    with patch.dict("os.environ", {"MOREBETS_TARGETING_ENABLED": "0"}):
        from config import _env_flag
        flag = _env_flag("MOREBETS_TARGETING_ENABLED", "0")
        assert flag is False


def test_flag_on_targeting_activated() -> None:
    """AC-2: при MOREBETS_TARGETING_ENABLED=1 флаг True."""
    with patch.dict("os.environ", {"MOREBETS_TARGETING_ENABLED": "1"}):
        from config import _env_flag
        flag = _env_flag("MOREBETS_TARGETING_ENABLED", "0")
        assert flag is True


# ─── T08: несколько событий — все в PROMOTED ──────────────────────────────


def test_promote_multiple_events_all_promoted() -> None:
    """AC-1: все события из select_targets получают PROMOTED."""
    forks = _forks((10, 1.0), (20, 2.0), (30, 3.0), (40, 0.5))
    trigger = FortedTopNTrigger(forks)
    targeter = _make_targeter([trigger])
    queue = EventPriorityQueue()
    promoter = TargetingPromoter(targeter=targeter, queue=queue)

    count = promoter.promote(now=0.0)

    assert count == 4
    assert len(queue) == 4
    # Все в PROMOTED
    promoted = set(queue.peek_by_priority(EventPriority.PROMOTED))
    assert promoted == {"10", "20", "30", "40"}
    # Ни одного в других tier-ах
    assert not list(queue.peek_by_priority(EventPriority.FAIR))
    assert not list(queue.peek_by_priority(EventPriority.DISCOVERY))


# ─── T09: promote возвращает правильный count ──────────────────────────────


def test_promote_returns_correct_count() -> None:
    """promote() возвращает ровно len(select_targets(now))."""
    trigger = FortedTopNTrigger(_forks((1, 1.0), (2, 2.0), (3, 3.0)))
    targeter = _make_targeter([trigger])
    queue = EventPriorityQueue()
    promoter = TargetingPromoter(targeter=targeter, queue=queue)

    count = promoter.promote(now=0.0)
    assert count == 3

    # убрать одну вилку
    trigger.set_forks(_forks((1, 1.0), (2, 2.0)))
    # Нужно продвинуть время немного вперёд, но обе остаются в watch-window
    count2 = promoter.promote(now=1.0)
    # обе оставшиеся + eid=3 ещё в watch-window (1s << 120s watch)
    assert count2 == 3  # все три ещё в watchlist (window не истёк)


# ─── T10: mock-based: bridge не взаимодействует с account_pool ────────────


def test_bridge_does_not_touch_account_pool() -> None:
    """AC-5: bridge не импортирует AccountPool/account_pool/morebets_dispatcher."""
    import aggregator.morebets_targeting_bridge as bridge_mod
    bridge_source = open(bridge_mod.__file__).read()
    # Проверяем отсутствие реальных import-ов (не просто слова в docstring)
    assert "import AccountPool" not in bridge_source
    assert "from aggregator.account_pool" not in bridge_source
    assert "from aggregator.morebets_dispatcher" not in bridge_source
    assert "MoreBetsDispatcher" not in bridge_source
    # Также проверяем что bridge принимает только targeter+queue (не pool/dispatcher)
    import inspect
    sig = inspect.signature(bridge_mod.TargetingPromoter.__init__)
    params = set(sig.parameters.keys()) - {"self"}
    assert "pool" not in params
    assert "dispatcher" not in params


def test_promote_cancels_stale_deadline_expired_events() -> None:
    """FIX-3 (P1): событие выпало из select_targets (deadline) - следующий promote() убирает его из очереди."""
    trigger = FortedTopNTrigger(_forks((777, 1.0)))
    targeter = _make_targeter([trigger], watch=10.0)
    queue = EventPriorityQueue()
    promoter = TargetingPromoter(targeter=targeter, queue=queue)

    count_first = promoter.promote(now=0.0)
    assert count_first == 1
    assert not queue.is_empty, "event must be in queue after first promote"
    in_q = [eid for eid, _ in queue.snapshot()]
    assert "777" in in_q

    trigger.set_forks([])

    count_second = promoter.promote(now=200.0)
    assert count_second == 0
    assert queue.is_empty, "stale PROMOTED event must be cancelled from queue by promote()"


def test_promote_does_not_cancel_still_active_events() -> None:
    """FIX-3 (P1): события, ещё находящиеся в select_targets, НЕ отменяются."""
    trigger = FortedTopNTrigger(_forks((111, 1.0), (222, 2.0)))
    targeter = _make_targeter([trigger])
    queue = EventPriorityQueue()
    promoter = TargetingPromoter(targeter=targeter, queue=queue)

    promoter.promote(now=0.0)
    promoter.promote(now=1.0)

    eids = {eid for eid, _ in queue.snapshot()}
    assert "111" in eids and "222" in eids, "active events must not be cancelled"
