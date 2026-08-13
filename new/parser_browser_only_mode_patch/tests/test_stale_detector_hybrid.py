from __future__ import annotations

import pytest

from state import state


def _seed_stale_state(monkeypatch, stale_detector, *, transport_backend: str, now: float, gap: float) -> None:
    monkeypatch.setattr(stale_detector.time, "time", lambda: now)
    monkeypatch.setattr(stale_detector._cfg, "PS3838_TRANSPORT_BACKEND", transport_backend, raising=False)
    monkeypatch.setattr(stale_detector._cfg, "PS3838_HYBRID_STALL_THRESHOLD_SEC", 20.0, raising=False)
    monkeypatch.setattr(stale_detector._cfg, "PS3838_ONLY_LIVE", True, raising=False)
    monkeypatch.setattr(stale_detector._cfg, "PS3838_ONLY_PREMATCH", False, raising=False)
    monkeypatch.setattr(stale_detector, "LIVE_STALE_SEC", 10.0)
    monkeypatch.setattr(stale_detector, "PREMATCH_STALE_SEC", 60.0)
    monkeypatch.setattr(stale_detector, "STARTUP_GRACE_SEC", 0.0)
    monkeypatch.setattr(state, "start_ts", 0.0, raising=False)
    monkeypatch.setattr(state, "empty_full_odds_count", 0, raising=False)
    monkeypatch.setattr(state, "last_valid_data_time", now - gap, raising=False)
    monkeypatch.setattr(state, "last_ws_activity_time", now - gap, raising=False)
    monkeypatch.setattr(state, "last_data_recv_time", None, raising=False)
    monkeypatch.setattr(state, "last_is_live", True, raising=False)
    monkeypatch.setattr(state, "stale", False, raising=False)
    monkeypatch.setattr(state, "stale_live", False, raising=False)
    monkeypatch.setattr(state, "stale_prematch", False, raising=False)
    monkeypatch.setattr(state, "stale_reason", "", raising=False)


@pytest.mark.asyncio
async def test_check_silence_uses_hybrid_live_floor(monkeypatch):
    import core.stale_detector as stale_detector

    _seed_stale_state(monkeypatch, stale_detector, transport_backend="hybrid_runner", now=100.0, gap=15.0)

    async def fake_set_status(is_stale, reason, lag_ms=None):
        _ = lag_ms
        state.stale = is_stale
        state.stale_reason = reason

    async def fake_maybe_refresh(reason):
        _ = reason
        return False

    monkeypatch.setattr(stale_detector, "set_status", fake_set_status)
    monkeypatch.setattr(stale_detector, "maybe_refresh", fake_maybe_refresh)

    stale = await stale_detector.check_silence()

    assert stale is False
    assert state.stale_live is False
    assert state.stale is False


@pytest.mark.asyncio
async def test_check_silence_keeps_global_fresh_when_only_live_lane_is_stale(monkeypatch):
    import core.stale_detector as stale_detector

    _seed_stale_state(monkeypatch, stale_detector, transport_backend="hybrid_runner", now=100.0, gap=24.0)
    monkeypatch.setattr(stale_detector._cfg, "PS3838_ONLY_LIVE", False, raising=False)
    monkeypatch.setattr(stale_detector._cfg, "PS3838_ONLY_PREMATCH", False, raising=False)

    async def fake_set_status(is_stale, reason, lag_ms=None):
        _ = lag_ms
        state.stale = is_stale
        state.stale_reason = reason

    async def fake_maybe_refresh(reason):
        _ = reason
        return False

    monkeypatch.setattr(stale_detector, "set_status", fake_set_status)
    monkeypatch.setattr(stale_detector, "maybe_refresh", fake_maybe_refresh)

    stale = await stale_detector.check_silence()

    assert stale is False
    assert state.stale_live is True
    assert state.stale_prematch is False
    assert state.stale is False


@pytest.mark.asyncio
async def test_check_silence_keeps_legacy_live_threshold(monkeypatch):
    import core.stale_detector as stale_detector

    _seed_stale_state(monkeypatch, stale_detector, transport_backend="legacy", now=100.0, gap=15.0)

    async def fake_set_status(is_stale, reason, lag_ms=None):
        _ = lag_ms
        state.stale = is_stale
        state.stale_reason = reason

    async def fake_maybe_refresh(reason):
        _ = reason
        return False

    monkeypatch.setattr(stale_detector, "set_status", fake_set_status)
    monkeypatch.setattr(stale_detector, "maybe_refresh", fake_maybe_refresh)

    stale = await stale_detector.check_silence()

    assert stale is True
    assert state.stale_live is True
    assert state.stale is True
    assert "WS dead: no data for 15.0s" in state.stale_reason
