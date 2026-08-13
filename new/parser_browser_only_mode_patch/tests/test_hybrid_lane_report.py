"""Tests for hybrid lane reporting fix: WS data reports to all registered modes."""

from unittest.mock import patch

import pytest


class TestHybridReportWsDataAllModes:
    """_hybrid_report_ws_data must report to all registered modes for a sport."""

    def test_reports_all_modes_for_sport(self, monkeypatch):
        """When WS data arrives for a sport, all mode streams get updated."""
        from core.hybrid_transport import HybridTransportManager, Transport
        import core.connection as conn

        mgr = HybridTransportManager(stall_threshold_sec=45.0)
        mgr.register_stream(29, "live")
        mgr.register_stream(29, "today")
        mgr.register_stream(29, "early")
        mgr.register_stream(33, "live")  # different sport, should not be touched

        monkeypatch.setattr(conn, "_hybrid_manager", mgr)
        monkeypatch.setattr(conn._cfg, "PS3838_HYBRID_ENABLED", True, raising=False)

        conn._hybrid_report_ws_data(29)

        assert mgr.streams[(29, "live")].last_ws_ts > 0
        assert mgr.streams[(29, "today")].last_ws_ts > 0
        assert mgr.streams[(29, "early")].last_ws_ts > 0
        assert mgr.streams[(33, "live")].last_ws_ts == 0  # untouched

    def test_no_crash_when_hybrid_disabled(self, monkeypatch):
        """No error when hybrid manager is None (hybrid disabled)."""
        import core.connection as conn

        monkeypatch.setattr(conn, "_hybrid_manager", None)
        monkeypatch.setattr(conn._cfg, "PS3838_HYBRID_ENABLED", False, raising=False)

        # Should not raise
        conn._hybrid_report_ws_data(29)

    def test_single_mode_still_reported(self, monkeypatch):
        """If only one mode is registered, it still gets reported."""
        from core.hybrid_transport import HybridTransportManager
        import core.connection as conn

        mgr = HybridTransportManager(stall_threshold_sec=45.0)
        mgr.register_stream(4, "today")

        monkeypatch.setattr(conn, "_hybrid_manager", mgr)
        monkeypatch.setattr(conn._cfg, "PS3838_HYBRID_ENABLED", True, raising=False)

        conn._hybrid_report_ws_data(4)

        assert mgr.streams[(4, "today")].last_ws_ts > 0
