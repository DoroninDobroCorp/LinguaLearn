"""Phase 7: migration / DualPublisher tests."""

from __future__ import annotations

from datetime import datetime, timezone

from aggregator.migration import DualPublisher, dual_publish_enabled


def _utc():
    return datetime.now(timezone.utc)


# ── flag tests ────────────────────────────────────────────────────


def test_dual_publish_disabled_by_default(monkeypatch):
    monkeypatch.delenv("MSP_DUAL_PUBLISH_ENABLED", raising=False)
    assert dual_publish_enabled() is False


def test_dual_publish_enabled_when_set(monkeypatch):
    monkeypatch.setenv("MSP_DUAL_PUBLISH_ENABLED", "1")
    assert dual_publish_enabled() is True


# ── publishing ────────────────────────────────────────────────────


def test_dual_publisher_publishes_both_when_enabled(monkeypatch):
    monkeypatch.setenv("MSP_DUAL_PUBLISH_ENABLED", "1")
    legacy_payloads = []
    v2_payloads = []

    dp = DualPublisher(
        legacy_publisher=legacy_payloads.append,
        v2_publisher=v2_payloads.append,
    )
    dp.publish({"a": 1}, {"b": 2})
    assert legacy_payloads == [{"a": 1}]
    assert v2_payloads == [{"b": 2}]


def test_dual_publisher_only_legacy_when_disabled(monkeypatch):
    monkeypatch.delenv("MSP_DUAL_PUBLISH_ENABLED", raising=False)
    legacy_payloads = []
    v2_payloads = []

    dp = DualPublisher(
        legacy_publisher=legacy_payloads.append,
        v2_publisher=v2_payloads.append,
    )
    dp.publish({"a": 1}, {"b": 2})
    assert legacy_payloads == [{"a": 1}]
    assert v2_payloads == []


# ── comparison mode ───────────────────────────────────────────────


def test_comparison_mode_detects_divergence(monkeypatch):
    monkeypatch.setenv("MSP_DUAL_PUBLISH_ENABLED", "1")
    dp = DualPublisher(
        legacy_publisher=lambda p: None,
        v2_publisher=lambda p: None,
        comparison_mode=True,
    )
    dp.publish(
        {"price": 1.85, "event_id": "ev1"},
        {"price": 1.90, "event_id": "ev1"},
        event_id="ev1",
    )
    assert len(dp.divergences) >= 1
    # price diverged
    price_divs = [d for d in dp.divergences if d.field_path == "price"]
    assert len(price_divs) == 1
    assert price_divs[0].legacy_value == 1.85
    assert price_divs[0].v2_value == 1.90


def test_comparison_mode_no_divergence_when_equal(monkeypatch):
    monkeypatch.setenv("MSP_DUAL_PUBLISH_ENABLED", "1")
    dp = DualPublisher(
        legacy_publisher=lambda p: None,
        v2_publisher=lambda p: None,
        comparison_mode=True,
    )
    payload = {"price": 1.85, "event_id": "ev1"}
    dp.publish(dict(payload), dict(payload), event_id="ev1")
    assert dp.divergences == []


# ── Bounded divergences (Phase 8 fix) ────────────────────────────


def test_divergences_bounded(monkeypatch):
    """_divergences is a bounded deque; old entries are evicted."""
    from collections import deque

    from aggregator.migration import DIVERGENCE_LOG_MAXLEN

    monkeypatch.setenv("MSP_DUAL_PUBLISH_ENABLED", "1")
    dp = DualPublisher(
        legacy_publisher=lambda p: None,
        v2_publisher=lambda p: None,
        comparison_mode=True,
    )

    # Verify it's a deque with maxlen.
    assert isinstance(dp._divergences, deque)
    assert dp._divergences.maxlen == DIVERGENCE_LOG_MAXLEN

    # Replace with a small-maxlen deque to test rotation.
    small_maxlen = 3
    dp._divergences = deque(maxlen=small_maxlen)
    for i in range(6):
        dp.publish(
            {"key": f"legacy-{i}"},
            {"key": f"v2-{i}"},
            event_id=f"ev-{i}",
        )
    # Only last 3 divergences remain (one per publish since key differs).
    assert len(dp._divergences) == small_maxlen
    assert dp._divergences[0].event_id == "ev-3"
