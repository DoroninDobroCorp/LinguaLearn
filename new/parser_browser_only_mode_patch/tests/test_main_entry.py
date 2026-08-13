"""Phase 8: aggregator main entry point tests."""

from __future__ import annotations

import threading

from aggregator.main import _aggregator_enabled, _build_config_summary, main


# ── flag tests ────────────────────────────────────────────────────


def test_aggregator_disabled_by_default(monkeypatch):
    monkeypatch.delenv("MSP_AGGREGATOR_ENABLED", raising=False)
    assert _aggregator_enabled() is False


def test_aggregator_enabled_when_set(monkeypatch):
    monkeypatch.setenv("MSP_AGGREGATOR_ENABLED", "1")
    assert _aggregator_enabled() is True


# ── config summary ────────────────────────────────────────────────


def test_config_summary_keys(monkeypatch):
    monkeypatch.setenv("MSP_AGGREGATOR_ENABLED", "1")
    monkeypatch.setenv("MSP_V2_FEED_ENABLED", "0")
    summary = _build_config_summary()
    assert "MSP_AGGREGATOR_ENABLED" in summary
    assert "MSP_V2_FEED_ENABLED" in summary
    assert "MSP_FEED_PORT" in summary


# ── main exits cleanly when disabled ─────────────────────────────


def test_main_exits_when_disabled(monkeypatch, capsys):
    monkeypatch.delenv("MSP_AGGREGATOR_ENABLED", raising=False)
    main()
    captured = capsys.readouterr()
    assert "not set" in captured.out


# ── main starts and stops cleanly ────────────────────────────────


def test_main_starts_and_stops_cleanly(monkeypatch):
    """main() with minimal config starts and shuts down via event.set()."""
    monkeypatch.setenv("MSP_AGGREGATOR_ENABLED", "1")
    monkeypatch.delenv("MSP_V2_FEED_ENABLED", raising=False)
    monkeypatch.delenv("MSP_FAILOVER_ENABLED", raising=False)
    monkeypatch.delenv("MSP_DECISION_V2_ENABLED", raising=False)

    # Patch threading.Event so we can control shutdown without real signals.
    original_event = threading.Event

    class QuickShutdownEvent(threading.Event):
        """Event that auto-sets after a brief wait (simulates SIGTERM)."""

        def wait(self, timeout=None):
            # Wait just briefly then auto-signal shutdown.
            super().wait(timeout=0.1)
            self.set()
            return True

    monkeypatch.setattr(threading, "Event", QuickShutdownEvent)

    # Run main — should start, then QuickShutdownEvent will release it.
    main()
    # If we reach here, main() completed successfully.
    monkeypatch.setattr(threading, "Event", original_event)


def test_main_with_feed_enabled(monkeypatch):
    """main() with feed enabled starts feed server then shuts down."""
    monkeypatch.setenv("MSP_AGGREGATOR_ENABLED", "1")
    monkeypatch.setenv("MSP_V2_FEED_ENABLED", "1")
    monkeypatch.setenv("MSP_FEED_PORT", "19876")
    monkeypatch.delenv("MSP_FAILOVER_ENABLED", raising=False)
    monkeypatch.delenv("MSP_DECISION_V2_ENABLED", raising=False)

    original_event = threading.Event

    class QuickShutdownEvent(threading.Event):
        def wait(self, timeout=None):
            super().wait(timeout=0.1)
            self.set()
            return True

    monkeypatch.setattr(threading, "Event", QuickShutdownEvent)
    main()
    monkeypatch.setattr(threading, "Event", original_event)
