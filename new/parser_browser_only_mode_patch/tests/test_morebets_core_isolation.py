"""Tests for Story 27.5 DOD-12/DOD-13 — core path does NOT import morebets.

AC-9 invariant: the core DecisionEngine must not reach into the
MoreBets dispatcher (or vice versa). The two code zones are
independent so a bug in the MoreBets path cannot regress core
publishing.
"""

from __future__ import annotations

import re
from pathlib import Path


_REPO_ROOT = Path(__file__).resolve().parents[1]
_DECISION_PY = _REPO_ROOT / "aggregator" / "decision.py"


def test_core_decision_module_does_not_import_morebets_dispatcher() -> None:
    """Static check — the core module's source has no morebets import."""
    src = _DECISION_PY.read_text(encoding="utf-8")
    # The forbidden patterns — importing the dispatcher in any form.
    assert not re.search(
        r"^\s*from\s+aggregator\.morebets_dispatcher\b",
        src,
        flags=re.MULTILINE,
    ), "aggregator.decision must NOT import from morebets_dispatcher"
    assert not re.search(
        r"^\s*import\s+aggregator\.morebets_dispatcher\b",
        src,
        flags=re.MULTILINE,
    )


def test_core_decision_module_does_not_import_morebets_policy() -> None:
    src = _DECISION_PY.read_text(encoding="utf-8")
    assert "aggregator.morebets_policy" not in src, (
        "aggregator.decision must stay isolated from morebets policy"
    )


def test_core_decision_imports_resolve_independently(
    monkeypatch,
) -> None:
    """Launch a fresh Python subprocess, import decision, assert no morebets."""
    import subprocess
    import sys

    code = (
        "import sys; import aggregator.decision; "
        "assert 'aggregator.morebets_dispatcher' not in sys.modules; "
        "assert 'aggregator.morebets_policy' not in sys.modules; "
        "print('ok')"
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=str(_REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, (
        f"core decision import pulled morebets module: {result.stdout} {result.stderr}"
    )
    assert "ok" in result.stdout


def test_morebets_dispatcher_does_not_import_decision_engine() -> None:
    """Mirror: the MoreBets dispatcher is independent of the core engine."""
    src = (_REPO_ROOT / "aggregator" / "morebets_dispatcher.py").read_text(
        encoding="utf-8"
    )
    assert "from aggregator.decision" not in src
    # importing `aggregator.types` / `aggregator.morebets_policy` is fine.
