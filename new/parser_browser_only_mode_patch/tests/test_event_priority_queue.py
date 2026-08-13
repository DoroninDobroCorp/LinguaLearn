"""Tests for Story 27.5.B — event-level priority queue (AC-6 / DOD-8)."""

from __future__ import annotations

from aggregator.event_priority_queue import EventPriority, EventPriorityQueue


def test_empty_queue_pop_returns_none() -> None:
    q = EventPriorityQueue()
    assert q.is_empty
    assert q.pop() is None


def test_higher_priority_pops_first() -> None:
    q = EventPriorityQueue()
    q.push("a", EventPriority.FAIR)
    q.push("b", EventPriority.PROMOTED)
    q.push("c", EventPriority.DISCOVERY)
    assert q.pop() == ("b", EventPriority.PROMOTED)
    assert q.pop() == ("a", EventPriority.FAIR)
    assert q.pop() == ("c", EventPriority.DISCOVERY)


def test_fifo_tie_break_within_same_priority() -> None:
    q = EventPriorityQueue()
    q.push("first", EventPriority.FAIR)
    q.push("second", EventPriority.FAIR)
    q.push("third", EventPriority.FAIR)
    assert q.pop() == ("first", EventPriority.FAIR)
    assert q.pop() == ("second", EventPriority.FAIR)
    assert q.pop() == ("third", EventPriority.FAIR)


def test_reprioritise_replaces_existing_entry() -> None:
    q = EventPriorityQueue()
    q.push("x", EventPriority.DISCOVERY)
    q.push("x", EventPriority.PROMOTED)  # upgrade
    assert q.pop() == ("x", EventPriority.PROMOTED)
    assert q.pop() is None


def test_cancel_removes_entry() -> None:
    q = EventPriorityQueue()
    q.push("x", EventPriority.FAIR)
    q.push("y", EventPriority.FAIR)
    assert q.cancel("x") is True
    assert q.pop() == ("y", EventPriority.FAIR)
    assert q.pop() is None


def test_cancel_unknown_returns_false() -> None:
    q = EventPriorityQueue()
    assert q.cancel("nothing") is False


def test_len_reflects_live_entries_only() -> None:
    q = EventPriorityQueue()
    q.push("a", EventPriority.FAIR)
    q.push("b", EventPriority.FAIR)
    q.cancel("a")
    assert len(q) == 1


def test_snapshot_returns_priority_sorted_pairs() -> None:
    q = EventPriorityQueue()
    q.push("low", EventPriority.DISCOVERY)
    q.push("hi", EventPriority.PROMOTED)
    q.push("mid", EventPriority.FAIR)
    snap = q.snapshot()
    assert snap == [
        ("hi", EventPriority.PROMOTED),
        ("mid", EventPriority.FAIR),
        ("low", EventPriority.DISCOVERY),
    ]


def test_peek_by_priority_filters() -> None:
    q = EventPriorityQueue()
    q.push("a", EventPriority.FAIR)
    q.push("b", EventPriority.PROMOTED)
    q.push("c", EventPriority.FAIR)
    assert set(q.peek_by_priority(EventPriority.FAIR)) == {"a", "c"}
    assert set(q.peek_by_priority(EventPriority.PROMOTED)) == {"b"}


def test_priority_values_match_spec() -> None:
    assert EventPriority.PROMOTED == 100
    assert EventPriority.FRESH_BASE == 75
    assert EventPriority.FAIR == 50
    assert EventPriority.DISCOVERY == 10


def test_stale_tombstone_skipped_correctly() -> None:
    """Reprioritise then ensure the stale heap entry is skipped on pop."""
    q = EventPriorityQueue()
    q.push("x", EventPriority.FAIR)  # heap entry 1 (priority 50)
    q.push("y", EventPriority.DISCOVERY)  # heap entry 2 (priority 10)
    q.push("x", EventPriority.PROMOTED)  # x upgraded; heap entry 3 (100)

    # pop should return x at PROMOTED (highest), then y at DISCOVERY.
    # The stale heap entry for x@FAIR must be skipped.
    assert q.pop() == ("x", EventPriority.PROMOTED)
    assert q.pop() == ("y", EventPriority.DISCOVERY)
    assert q.pop() is None


# ---------------------------------------------------------------------------
# FIX P1-3: reschedule tests (2 new)
# ---------------------------------------------------------------------------

def test_reschedule_preserves_higher_priority_on_concurrent_promotion() -> None:
    """FIX P1-3: reschedule сохраняет PROMOTED когда concurrent push уже промоутил.

    Сценарий: consumer popped event at FAIR, meanwhile promoter push(PROMOTED).
    Consumer reschedule(FAIR) — should not demote; queue must pop at PROMOTED.
    """
    q = EventPriorityQueue()
    # Concurrent promoter already pushed PROMOTED
    q.push("e1", EventPriority.PROMOTED)
    # Consumer tries to put back at old FAIR priority
    q.reschedule("e1", EventPriority.FAIR)
    # Must pop at PROMOTED (higher value preserved)
    result = q.pop()
    assert result == ("e1", EventPriority.PROMOTED), (
        "reschedule must not demote an already-promoted event"
    )
    assert q.pop() is None


def test_reschedule_new_event_uses_given_priority() -> None:
    """FIX P1-3: reschedule нового события (нет в очереди) использует данный приоритет."""
    q = EventPriorityQueue()
    q.reschedule("new-evt", EventPriority.FAIR)
    result = q.pop()
    assert result == ("new-evt", EventPriority.FAIR)
    assert q.pop() is None
