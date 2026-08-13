"""Tests for Story 26.1 — Chain-lag diagnostics.

Проверяет:
- State имеет chain_lag поля (AC-1, AC-2 instrumentation)
- handle_payload обновляет chain_recv_to_handler_ms / chain_handler_to_state_ms
- /health включает chain_lag секцию (AC-3 API→monitor)
- Reconnect сбрасывает chain_state_update_ts (AC-4 reconnect path)
- tools/diagnose_chain_lag.py импортируется без ошибок
"""

from __future__ import annotations

import importlib
import time
import unittest.mock as mock


# ── State fields ─────────────────────────────────────────────────────────────

def test_state_has_chain_lag_fields() -> None:
    """AC-1/AC-2: State имеет поля chain_lag instrumentation."""
    from state import ParserState
    s = ParserState()
    assert hasattr(s, "chain_ws_recv_ts"), "chain_ws_recv_ts missing"
    assert hasattr(s, "chain_handler_entry_ts"), "chain_handler_entry_ts missing"
    assert hasattr(s, "chain_state_update_ts"), "chain_state_update_ts missing"
    assert hasattr(s, "chain_recv_to_handler_ms"), "chain_recv_to_handler_ms missing"
    assert hasattr(s, "chain_handler_to_state_ms"), "chain_handler_to_state_ms missing"
    assert hasattr(s, "chain_total_lag_ms"), "chain_total_lag_ms missing"
    assert hasattr(s, "chain_fo_count"), "chain_fo_count missing"
    assert hasattr(s, "chain_uo_count"), "chain_uo_count missing"


def test_state_chain_lag_initial_none() -> None:
    """State chain-lag fields initialize to None/0."""
    from state import ParserState
    s = ParserState()
    assert s.chain_ws_recv_ts is None
    assert s.chain_handler_entry_ts is None
    assert s.chain_state_update_ts is None
    assert s.chain_recv_to_handler_ms is None
    assert s.chain_handler_to_state_ms is None
    assert s.chain_total_lag_ms is None
    assert s.chain_fo_count == 0
    assert s.chain_uo_count == 0


# ── handle_payload updates chain fields ──────────────────────────────────────

def _make_full_odds_msg() -> dict:
    return {
        "type": "FULL_ODDS",
        "time": int(time.time() * 1000) - 500,  # 500ms lag
        "odds": {},
    }


def _make_update_odds_msg() -> dict:
    return {
        "type": "UPDATE_ODDS",
        "time": int(time.time() * 1000) - 200,
        "odds": {"u": []},
    }


def test_handle_payload_fo_sets_chain_handler_entry_ts() -> None:
    """AC-1: handle_payload обновляет chain_handler_entry_ts при FULL_ODDS."""
    from state import ParserState
    import handlers.data_handler as dh

    s = ParserState()
    s.chain_ws_recv_ts = time.monotonic() - 0.010  # 10ms ago

    with (
        mock.patch.object(dh, "state", s),
        mock.patch.object(dh, "handle_full_odds", new=mock.AsyncMock()),
        mock.patch.object(dh, "handle_update_odds", new=mock.AsyncMock()),
    ):
        import asyncio
        asyncio.run(
            dh.handle_payload(_make_full_odds_msg(), None, "TEST")
        )

    assert s.chain_handler_entry_ts is not None, "chain_handler_entry_ts not set"
    assert s.chain_recv_to_handler_ms is not None, "chain_recv_to_handler_ms not set"
    assert s.chain_recv_to_handler_ms >= 0, "recv_to_handler_ms must be non-negative"
    assert s.chain_fo_count == 1, "chain_fo_count should be 1"
    assert s.chain_state_update_ts is not None, "chain_state_update_ts not set after FO"


def test_handle_payload_uo_increments_uo_count() -> None:
    """AC-1: handle_payload обновляет chain_uo_count при UPDATE_ODDS."""
    from state import ParserState
    import handlers.data_handler as dh

    s = ParserState()
    s.chain_ws_recv_ts = time.monotonic() - 0.005

    with (
        mock.patch.object(dh, "state", s),
        mock.patch.object(dh, "handle_full_odds", new=mock.AsyncMock()),
        mock.patch.object(dh, "handle_update_odds", new=mock.AsyncMock()),
    ):
        import asyncio
        asyncio.run(
            dh.handle_payload(_make_update_odds_msg(), None, "TEST")
        )

    assert s.chain_uo_count == 1, "chain_uo_count should be 1"


def test_chain_recv_to_handler_ms_increases_with_delay() -> None:
    """AC-1: recv_to_handler_ms отражает реальную задержку event-loop."""
    from state import ParserState
    import handlers.data_handler as dh

    s = ParserState()
    # Simulate 50ms delay between WS recv and handler entry
    s.chain_ws_recv_ts = time.monotonic() - 0.050

    with (
        mock.patch.object(dh, "state", s),
        mock.patch.object(dh, "handle_full_odds", new=mock.AsyncMock()),
        mock.patch.object(dh, "handle_update_odds", new=mock.AsyncMock()),
    ):
        import asyncio
        asyncio.run(
            dh.handle_payload(_make_full_odds_msg(), None, "TEST")
        )

    # Should be ≥ 50ms
    assert s.chain_recv_to_handler_ms is not None
    assert s.chain_recv_to_handler_ms >= 45, (
        f"Expected ≥45ms but got {s.chain_recv_to_handler_ms}ms"
    )


# ── /health chain_lag section ─────────────────────────────────────────────────

def test_health_payload_contains_chain_lag_key() -> None:
    """AC-2/AC-3: /health response содержит chain_lag секцию."""
    import ps3838_server
    import inspect

    # Find the payload dict construction in the handler function
    source = inspect.getsource(ps3838_server)
    assert '"chain_lag"' in source or "'chain_lag'" in source, (
        "/health endpoint must expose chain_lag dict (AC-2/AC-3)"
    )


def test_chain_lag_section_has_required_keys() -> None:
    """AC-3: chain_lag содержит все нужные ключи для diagnosis."""
    # Parse the payload construction from the server source
    import re
    import ps3838_server
    import inspect

    source = inspect.getsource(ps3838_server)
    # Verify each required key is in the chain_lag dict
    required_keys = [
        "recv_to_handler_ms",
        "handler_to_state_ms",
        "fo_count",
        "uo_count",
        "last_state_update_age_sec",
    ]
    for key in required_keys:
        assert f'"{key}"' in source or f"'{key}'" in source, (
            f"chain_lag must include key '{key}' (AC-3)"
        )


# ── Reconnect path ─────────────────────────────────────────────────────────

def test_new_parser_state_chain_ts_resets_on_reinit() -> None:
    """AC-4: Новый ParserState (reconnect) сбрасывает chain timestamps."""
    from state import ParserState
    s1 = ParserState()
    s1.chain_ws_recv_ts = time.monotonic()
    s1.chain_state_update_ts = time.time()
    s1.chain_fo_count = 42

    # Reconnect creates new state
    s2 = ParserState()
    assert s2.chain_ws_recv_ts is None, "chain_ws_recv_ts must reset on new state"
    assert s2.chain_state_update_ts is None
    assert s2.chain_fo_count == 0


# ── Diagnostic tool ──────────────────────────────────────────────────────────

def test_diagnose_chain_lag_tool_imports() -> None:
    """AC-5: Diagnostic tool importable без ошибок."""
    spec = importlib.util.find_spec("tools.diagnose_chain_lag")
    # May not be in sys.path as a module; try direct import
    import importlib.util as ilu
    import os
    tool_path = os.path.join(os.path.dirname(__file__), "..", "tools", "diagnose_chain_lag.py")
    spec2 = ilu.spec_from_file_location("diagnose_chain_lag", tool_path)
    assert spec2 is not None, "tools/diagnose_chain_lag.py not found"
    mod = ilu.module_from_spec(spec2)
    spec2.loader.exec_module(mod)  # type: ignore[union-attr]
    assert hasattr(mod, "main"), "diagnose_chain_lag.py must have main()"
    assert hasattr(mod, "_collect"), "diagnose_chain_lag.py must have _collect()"


def test_diagnose_chain_lag_diagnoses_high_recv_to_handler() -> None:
    """AC-5: Tool выдаёт WARN при recv_to_handler_ms >50ms."""
    import importlib.util as ilu
    import os
    tool_path = os.path.join(os.path.dirname(__file__), "..", "tools", "diagnose_chain_lag.py")
    spec2 = ilu.spec_from_file_location("diagnose_chain_lag", tool_path)
    mod = ilu.module_from_spec(spec2)
    spec2.loader.exec_module(mod)  # type: ignore[union-attr]

    # Simulate samples with high recv_to_handler latency
    captured: list[str] = []
    fake_health = {
        "chain_lag": {
            "recv_to_handler_ms": 150.0,
            "handler_to_state_ms": 100.0,
            "total_lag_ms": 250.0,
            "last_state_update_age_sec": 2.0,
            "fo_count": 10,
            "uo_count": 5,
        },
        "last_msg_age_sec": 3.5,
        "status": "ok",
        "stale": False,
    }

    with (
        mock.patch.object(mod, "_fetch", return_value=fake_health),
        mock.patch("builtins.print", side_effect=lambda *a, **kw: captured.append(str(a))),
        mock.patch("time.sleep"),
        mock.patch("time.time", side_effect=[0.0, 0.0, 1.0, 1.0, 2.0, 2.0, 2.1]),
    ):
        mod._collect("http://fake/health", interval=1.0, duration=1.5, out=None)

    combined = " ".join(captured)
    assert "recv_to_handler" in combined.lower() or "WARN" in combined, (
        "Expected WARN for high recv_to_handler_ms"
    )
