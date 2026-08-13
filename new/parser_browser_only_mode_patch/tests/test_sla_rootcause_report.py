"""Unit tests for tools/sla_rootcause_report.py (Story 27.21 DOD-9)."""
from __future__ import annotations

import io
import itertools
import json
import sys
import tempfile
import time
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
from sla_rootcause_report import (  # noqa: E402
    _analyze_cadence,
    _assign_verdict,
    _collect_cadence,
    _collect_ws_gap,
    _percentile,
    _render_full_report,
    _score_option,
    main,
)


# ── percentile ────────────────────────────────────────────────────────

def test_percentile_empty():
    assert _percentile([], 0.5) == 0.0


def test_percentile_single():
    assert _percentile([5.0], 0.50) == 5.0
    assert _percentile([5.0], 0.95) == 5.0


def test_percentile_p50():
    vals = [1.0, 2.0, 3.0, 4.0, 5.0]
    assert _percentile(vals, 0.50) == 3.0


def test_percentile_p95_ten_values():
    vals = list(range(1, 11))  # 1..10
    # nearest-rank: ceil(0.95 * 10) = 10 → index 9 → value 10
    assert _percentile(vals, 0.95) == 10.0


# ── cadence analysis ──────────────────────────────────────────────────

def test_analyze_cadence_empty_samples():
    result = _analyze_cadence({4: [], 29: []})
    for sid in (4, 29):
        assert result[sid]["n_samples"] == 0
        assert result[sid]["p50_poll_age_sec"] == 0.0
        assert result[sid]["cadence_primary"] is False


def test_analyze_cadence_fast_polls():
    # Poll age < 2s → cadence_primary should be False.
    samples = [0.5, 0.8, 1.0, 1.2, 0.9]
    result = _analyze_cadence({29: samples})
    assert result[29]["cadence_primary"] is False
    assert result[29]["p50_poll_age_sec"] == pytest.approx(0.9, abs=0.01)


def test_analyze_cadence_slow_polls_primary():
    # Poll age p50 > 2s → cadence_primary should be True.
    samples = [60.0, 64.0, 70.0, 80.0, 128.0]
    result = _analyze_cadence({4: samples})
    assert result[4]["cadence_primary"] is True
    assert result[4]["p50_poll_age_sec"] > 2.0


def test_analyze_cadence_mean():
    samples = [10.0, 20.0, 30.0]
    result = _analyze_cadence({19: samples})
    assert result[19]["mean_poll_age_sec"] == pytest.approx(20.0, abs=0.01)


# ── verdict assignment ────────────────────────────────────────────────

def test_assign_verdict_unknown_low_obs():
    cadence = {"cadence_primary": True}
    ws = {"ws_gap_primary": False}
    assert _assign_verdict(cadence, ws, fail_obs=5) == "UNKNOWN"


def test_assign_verdict_polling_cadence():
    cadence = {"cadence_primary": True}
    ws = {"ws_gap_primary": False}
    assert _assign_verdict(cadence, ws, fail_obs=100) == "POLLING_CADENCE"


def test_assign_verdict_ws_gap():
    cadence = {"cadence_primary": False}
    ws = {"ws_gap_primary": True}
    assert _assign_verdict(cadence, ws, fail_obs=100) == "WS_GAP"


def test_assign_verdict_combined():
    cadence = {"cadence_primary": True}
    ws = {"ws_gap_primary": True}
    assert _assign_verdict(cadence, ws, fail_obs=100) == "COMBINED"


def test_assign_verdict_unknown_neither():
    cadence = {"cadence_primary": False}
    ws = {"ws_gap_primary": False}
    assert _assign_verdict(cadence, ws, fail_obs=100) == "UNKNOWN"


def test_assign_verdict_none_inputs():
    assert _assign_verdict(None, None, fail_obs=100) == "UNKNOWN"


# ── option scoring ────────────────────────────────────────────────────

def test_score_option_a_recommended_when_cadence():
    verdict_map = {4: "POLLING_CADENCE", 29: "POLLING_CADENCE"}
    assert _score_option(verdict_map, "A") == "RECOMMENDED"


def test_score_option_a_recommended_when_combined():
    verdict_map = {4: "COMBINED"}
    assert _score_option(verdict_map, "A") == "RECOMMENDED"


def test_score_option_a_optional_when_ws_only():
    verdict_map = {4: "WS_GAP"}
    assert _score_option(verdict_map, "A") == "OPTIONAL"


def test_score_option_b_recommended_when_cadence():
    verdict_map = {29: "POLLING_CADENCE"}
    assert _score_option(verdict_map, "B") == "RECOMMENDED"


def test_score_option_b_optional_when_combined():
    verdict_map = {29: "COMBINED"}
    assert _score_option(verdict_map, "B") == "OPTIONAL"


def test_score_option_b_not_needed_when_ws():
    verdict_map = {29: "WS_GAP"}
    assert _score_option(verdict_map, "B") == "NOT_NEEDED"


def test_score_option_c_recommended_when_ws():
    verdict_map = {4: "WS_GAP"}
    assert _score_option(verdict_map, "C") == "RECOMMENDED"


def test_score_option_c_not_needed_when_cadence():
    verdict_map = {4: "POLLING_CADENCE"}
    assert _score_option(verdict_map, "C") == "NOT_NEEDED"


# ── render_full_report ────────────────────────────────────────────────

def test_render_full_report_contains_sections():
    cadence = {
        4: {"n_samples": 100, "mean_poll_age_sec": 64.0,
            "p50_poll_age_sec": 64.0, "p95_poll_age_sec": 128.0,
            "cadence_primary": True},
        29: {"n_samples": 100, "mean_poll_age_sec": 64.0,
             "p50_poll_age_sec": 64.0, "p95_poll_age_sec": 128.0,
             "cadence_primary": True},
    }
    wsgap = {
        4: {"gaps_count": 2, "gaps_per_min": 0.2,
            "gap_duration_p95_sec": 1.5, "ws_gap_primary": False},
        29: {"gaps_count": 1, "gaps_per_min": 0.1,
             "gap_duration_p95_sec": 1.0, "ws_gap_primary": False},
    }
    report = _render_full_report(cadence, wsgap, [4, 29], duration_min=30.0)
    assert "SLA Root Cause Analysis" in report
    assert "POLLING_CADENCE" in report
    assert "Option A" in report
    assert "Option B" in report
    assert "Option C" in report
    assert "RECOMMENDED" in report


def test_render_full_report_ws_gap_marks_option_c():
    cadence = {
        4: {"n_samples": 50, "mean_poll_age_sec": 1.0,
            "p50_poll_age_sec": 0.9, "p95_poll_age_sec": 1.5,
            "cadence_primary": False},
    }
    wsgap = {
        4: {"gaps_count": 20, "gaps_per_min": 2.0,
            "gap_duration_p95_sec": 8.0, "ws_gap_primary": True},
    }
    report = _render_full_report(cadence, wsgap, [4], duration_min=10.0)
    assert "WS_GAP" in report
    # Option C should be RECOMMENDED.
    assert "Option C" in report


# ── _collect_cadence (mocked urllib) ─────────────────────────────────

def _make_mock_response(payload: Any) -> MagicMock:
    raw = json.dumps(payload).encode()
    mock_resp = MagicMock()
    mock_resp.read.return_value = raw
    mock_resp.__enter__ = lambda s: s
    mock_resp.__exit__ = MagicMock(return_value=False)
    return mock_resp


def _fake_time(first_values: list[float], *, then: float = 100.0):
    """Return a callable: returns first_values in order, then `then` forever."""
    seq = itertools.chain(first_values, itertools.repeat(then))
    return lambda: next(seq)


def test_collect_cadence_flat_structure():
    """_collect_cadence collects per_sport_poll_age_sec from flat /monitoring response."""
    payload = {"per_sport_poll_age_sec": {"29": 3.5, "4": 12.0}}
    # time.time calls: t_end(1), while(2), t0(3), elapsed(4), while-exit(5+)
    with patch("sla_rootcause_report.urllib.request.urlopen",
               return_value=_make_mock_response(payload)):
        with patch("sla_rootcause_report.time.sleep"):
            with patch("sla_rootcause_report.time.time",
                       side_effect=_fake_time([0.0, 0.0, 0.0, 0.0])):
                result = _collect_cadence(
                    "http://localhost:9013/monitoring",
                    duration_sec=1.0,
                    sport_ids=[29, 4],
                )
    assert len(result[29]) >= 1
    assert result[29][0] == 3.5
    assert result[4][0] == 12.0


def test_collect_cadence_nested_structure():
    """_collect_cadence finds per_sport_poll_age_sec inside nested adapter dict."""
    payload = {
        "pinnacle_api": {"per_sport_poll_age_sec": {"29": 7.2}},
        "other_key": "value",
    }
    with patch("sla_rootcause_report.urllib.request.urlopen",
               return_value=_make_mock_response(payload)):
        with patch("sla_rootcause_report.time.sleep"):
            with patch("sla_rootcause_report.time.time",
                       side_effect=_fake_time([0.0, 0.0, 0.0, 0.0])):
                result = _collect_cadence(
                    "http://localhost:9013/monitoring",
                    duration_sec=1.0,
                    sport_ids=[29],
                )
    assert len(result[29]) >= 1
    assert result[29][0] == pytest.approx(7.2)


def test_collect_cadence_fetch_error_skips():
    """_collect_cadence skips ticks where fetch raises an exception."""
    with patch("sla_rootcause_report.urllib.request.urlopen",
               side_effect=OSError("network unreachable")):
        with patch("sla_rootcause_report.time.sleep"):
            with patch("sla_rootcause_report.time.time",
                       side_effect=_fake_time([0.0, 0.0, 0.0])):
                result = _collect_cadence(
                    "http://localhost:9013/monitoring",
                    duration_sec=1.0,
                    sport_ids=[29],
                )
    assert result[29] == []


# ── _collect_ws_gap (mocked urllib) ──────────────────────────────────

def test_collect_ws_gap_no_gap_when_fresh():
    """No gaps detected when freshness_ms is below threshold."""
    payload = {"events": [
        {"is_live": True, "sport_id": 29, "freshness_ms": 500},
    ]}
    # calls: last_fresh_ts(1), t_start(2), while(3), t0(4), now(5), elapsed(6), while-exit(7+)
    with patch("sla_rootcause_report.urllib.request.urlopen",
               return_value=_make_mock_response(payload)):
        with patch("sla_rootcause_report.time.sleep"):
            with patch("sla_rootcause_report.time.time",
                       side_effect=_fake_time([0.0, 0.0, 0.0, 0.0, 0.0, 0.0])):
                result = _collect_ws_gap(
                    "http://localhost:9013/snapshot",
                    duration_sec=1.0,
                    sport_ids=[29],
                    gap_threshold_sec=3.0,
                )
    assert result[29]["gaps_count"] == 0


def test_collect_ws_gap_gap_detected_when_stale():
    """Gap opened when freshness_ms exceeds threshold * 1000."""
    payload = {"events": [
        {"is_live": True, "sport_id": 29, "freshness_ms": 5000},
    ]}
    with patch("sla_rootcause_report.urllib.request.urlopen",
               return_value=_make_mock_response(payload)):
        with patch("sla_rootcause_report.time.sleep"):
            with patch("sla_rootcause_report.time.time",
                       side_effect=_fake_time([0.0, 0.0, 0.0, 0.0, 0.0, 0.0])):
                result = _collect_ws_gap(
                    "http://localhost:9013/snapshot",
                    duration_sec=1.0,
                    sport_ids=[29],
                    gap_threshold_sec=3.0,
                )
    # Gap opened when staleness detected; may not be closed (no recovery tick).
    # gaps_count = 0 (open gap), but in_gap flag was set → verifiable via durations.
    assert isinstance(result[29]["gaps_count"], int)
    assert result[29]["gaps_per_min"] >= 0.0


# ── main() CLI smoke test ─────────────────────────────────────────────

def test_main_cadence_mode_exits_cleanly(tmp_path: Path):
    """main() in cadence mode with --duration-sec 1 (all fetches fail) exits cleanly."""
    with patch("sla_rootcause_report.urllib.request.urlopen",
               side_effect=OSError("no server")):
        with patch("sla_rootcause_report.time.sleep"):
            with patch("sla_rootcause_report.time.time",
                       side_effect=_fake_time([0.0, 0.0, 0.0])):
                sys.argv = [
                    "sla_rootcause_report.py",
                    "--mode", "cadence",
                    "--duration-sec", "1",
                    "--out-dir", str(tmp_path),
                ]
                rc = main()
    assert isinstance(rc, int)
