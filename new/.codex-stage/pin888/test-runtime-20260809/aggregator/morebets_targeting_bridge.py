"""morebets_targeting_bridge -- мост MoreBetsTargeter -> EventPriorityQueue.

Story 27.37: каждый тик watchlist-а промоутит events в EventPriorityQueue с
приоритетом PROMOTED (100). Account/source-agnostic: bridge знает только
event_id и priority, не зная какой аккаунт/источник используется.
"""

from __future__ import annotations

import logging

from aggregator.event_priority_queue import EventPriority, EventPriorityQueue
from aggregator.morebets_targeting import MoreBetsTargeter

log = logging.getLogger(__name__)

__all__ = ["TargetingPromoter"]


class TargetingPromoter:
    """Мост: для каждого MoreBetTarget из targeter.select_targets(now)
    вызывает queue.push(str(event_id), EventPriority.PROMOTED).

    Account/source-agnostic -- bridge оперирует только event_id и priority.
    Выбор аккаунта/источника -- ответственность dispatcher/account_pool.

    Повторный вызов promote() с тем же event_id -- reprioritise (не дублит):
    EventPriorityQueue.push() обновляет priority существующей записи.

    Если событие выпало из select_targets (watch-duration истёк) --
    оно автоматически перестаёт промоутиться; очередь сама дегрейдит
    по FAIR/DISCOVERY-логике.
    """

    def __init__(
        self,
        targeter: MoreBetsTargeter,
        queue: EventPriorityQueue,
    ) -> None:
        self._targeter = targeter
        self._queue = queue

    def promote(self, now: float) -> int:
        """Промоутит все активные targets в очередь.

        FIX-3 (P1): перед пушем отменяет из очереди события, которых больше
        нет в select_targets (watch-duration истёк по мнению таргетера).
        Отменяются только PROMOTED-записи (наши); чужие приоритеты не трогаем.

        Returns:
            Количество промоутнутых событий (len(select_targets(now))).
        """
        targets = self._targeter.select_targets(now)
        cur_eids = {str(t.event_id) for t in targets}

        for eid, prio in self._queue.snapshot():
            if prio == EventPriority.PROMOTED and eid not in cur_eids:
                self._queue.cancel(eid)
                log.debug("morebets_targeting_bridge: cancelled deadline-expired %s", eid)

        count = 0
        for target in targets:
            eid_str = str(target.event_id)
            self._queue.push(eid_str, EventPriority.PROMOTED)
            count += 1
        if count:
            log.debug("morebets_targeting_bridge: promoted %d events", count)
        return count
