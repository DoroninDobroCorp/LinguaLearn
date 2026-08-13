"""Tests for Story 27.8 — switchover PDF report generator."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

pytest.importorskip("reportlab")
pytest.importorskip("PIL")


_REPO_ROOT = Path(__file__).resolve().parents[1]
_SCRIPT = _REPO_ROOT / "tools" / "gen_switchover_pdf_report.py"


def _write_shadow_json(path: Path, *, fail: bool = False) -> None:
    data: dict = {
        "prod_legacy_missing_in_shadow_count": 1 if fail else 0,
        "shadow_extra_vs_prod_legacy_count": 2,
        "odds_diff_p99_core_markets_ticks": 2.5 if fail else 1.0,
        "core_live_p95_freshness_ms": 2500 if fail else 1200,
        "core_prematch_p95_freshness_ms": 8000,
        "observed_window_minutes": 65,
    }
    path.write_text(json.dumps(data), encoding="utf-8")


def _tiny_png(path: Path) -> None:
    """Generate a small valid PNG via Pillow (reportlab's image loader
    requires well-formed IDAT chunks)."""
    from PIL import Image as PilImage  # pytest.importorskip("PIL") ensures availability

    img = PilImage.new("RGB", (50, 50), color=(255, 0, 0))
    img.save(str(path), format="PNG")


def test_pass_run_produces_pdf(tmp_path: Path) -> None:
    shadow = tmp_path / "shadow.json"
    before = tmp_path / "before.png"
    after = tmp_path / "after.png"
    out = tmp_path / "out.pdf"
    _write_shadow_json(shadow, fail=False)
    _tiny_png(before)
    _tiny_png(after)

    result = subprocess.run(
        [
            sys.executable,
            str(_SCRIPT),
            "--before-png",
            str(before),
            "--after-png",
            str(after),
            "--shadow-json",
            str(shadow),
            "--out",
            str(out),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert out.exists()
    assert out.stat().st_size > 500


def test_fail_run_still_produces_pdf_with_failures_listed(tmp_path: Path) -> None:
    shadow = tmp_path / "shadow.json"
    before = tmp_path / "before.png"
    after = tmp_path / "after.png"
    out = tmp_path / "out.pdf"
    _write_shadow_json(shadow, fail=True)
    _tiny_png(before)
    _tiny_png(after)

    result = subprocess.run(
        [
            sys.executable,
            str(_SCRIPT),
            "--before-png",
            str(before),
            "--after-png",
            str(after),
            "--shadow-json",
            str(shadow),
            "--out",
            str(out),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    # Even FAIL verdict still produces a PDF — the operator reads it.
    assert result.returncode == 0
    assert out.exists()


def test_verdict_helpers() -> None:
    # Import the module by file path (the script file doubles as a module).
    import importlib.util

    spec = importlib.util.spec_from_file_location("switchover_pdf", _SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    verdict, failures = module._verdict_from_shadow_json({
        "prod_legacy_missing_in_shadow_count": 0,
        "odds_diff_p99_core_markets_ticks": 0.5,
        "core_live_p95_freshness_ms": 1800,
    })
    assert verdict == "PASS"
    assert failures == []

    verdict, failures = module._verdict_from_shadow_json({
        "prod_legacy_missing_in_shadow_count": 2,
        "odds_diff_p99_core_markets_ticks": 3,
        "core_live_p95_freshness_ms": 5000,
    })
    assert verdict == "FAIL"
    assert len(failures) == 3


def test_verdict_missing_field_still_flags_failure() -> None:
    import importlib.util

    spec = importlib.util.spec_from_file_location("switchover_pdf", _SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    verdict, failures = module._verdict_from_shadow_json({})
    # Missing prod_legacy_missing_in_shadow_count → cannot verify no regression.
    assert verdict == "FAIL"
    assert any("prod_legacy_missing" in f for f in failures)
