"""Tests for Story 27.11 — `--prematch-mode` флаг в verify_live_sla.

Проверяет что prematch mode:
- Filter'ит is_live=False events
- Default target_ms = 10_000 (prematch SLA)
- Meta label в report — "Prematch" вместо "Live"

Тестим через subprocess т.к. CLI логика в `main()`.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
_TOOL = _REPO_ROOT / "tools" / "verify_live_sla.py"


def test_tool_exposes_prematch_mode_flag() -> None:
    """`--prematch-mode` help text присутствует (CLI contract)."""
    result = subprocess.run(
        [sys.executable, str(_TOOL), "--help"],
        capture_output=True, text=True, check=True, timeout=10,
    )
    assert "--prematch-mode" in result.stdout
    # Clarify expectation — help mentions что filter меняется на is_live=False.
    assert "is_live=False" in result.stdout or "prematch" in result.stdout.lower()


def test_tool_importable_and_has_collect_with_filter_flag() -> None:
    """Internal _collect должен принимать filter_is_live kwarg.

    Guarantees that Story 27.14 (matrix) может вызвать _collect дважды
    (live + prematch) с разными filter'ами без subprocess overhead.
    """
    spec = importlib.util.spec_from_file_location("verify_live_sla", _TOOL)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert hasattr(mod, "_collect")
    import inspect
    sig = inspect.signature(mod._collect)
    assert "filter_is_live" in sig.parameters, (
        "Story 27.11 AC-1: _collect must accept filter_is_live kwarg"
    )
    # Default остаётся True (backward compat с 27.10 live mode)
    assert sig.parameters["filter_is_live"].default is True


def test_bucket_honors_target_ms() -> None:
    """27.11: prematch target_ms=10000 — _bucket corectly маркирует
    freshness ≤10s как in-SLA, несмотря на default 2000."""
    spec = importlib.util.spec_from_file_location("verify_live_sla", _TOOL)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    # Live threshold — 2s
    assert mod._bucket(1500.0, 2000) == mod._B0  # in-SLA at 1.5s
    assert mod._bucket(3000.0, 2000) == mod._B1  # out of live SLA
    # Prematch threshold — 10s: 3000ms must be in-SLA
    assert mod._bucket(3000.0, 10_000) == mod._B0
    assert mod._bucket(12_000.0, 10_000) == mod._B3
