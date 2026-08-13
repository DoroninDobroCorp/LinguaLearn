"""Unit tests for exp_pncl_xval cross-validation logic (no live WS/network).

Tests (>=5):
  test_extract_markets_pncl_event   -- extract from PNCL-normalized event
  test_extract_markets_our_event    -- extract from our parser output (same fn)
  test_compare_values_match         -- values within tol -> MATCH
  test_compare_values_mismatch      -- values beyond tol -> MISMATCH
  test_no_overlap_inconclusive      -- 0 overlap pids -> INCONCLUSIVE
  test_line_id_matching             -- line_id-based matching takes priority
  test_per_pid_verdict_empty        -- empty market results -> INCONCLUSIVE
  test_overall_verdict_boundary     -- 5% boundary: exactly 5% -> MATCH, 6% -> MISMATCH
"""
import sys
from pathlib import Path

import pytest

_SCRIPTS = (
    Path(__file__).parent.parent
    / "docs"
    / "night-experiments-2026-05-28"
    / "scripts"
)
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from exp_pncl_xval import (
    extract_markets,
    extract_markets_by_lid,
    compare_markets,
    per_pid_verdict,
    overall_verdict,
    _ALT_LINE_ID_THRESHOLD,
)

# -- Fixtures ----------------------------------------------------------------


def _make_period(w1=2.10, wnone=3.20, w2=3.40, tot_line="2.5", wmore=1.90, wless=1.99, line_id=None):
    """Build a minimal normalized period dict for test fixtures."""
    raw_ml = {"bet_type": 1, "team_select": 0, "handicap": 0, "period": 0,
              "line_id": line_id or 100001, "event_id": 9000001}
    raw_tot = {"bet_type": 3, "team_select": 3, "handicap": float(tot_line), "period": 0,
               "line_id": line_id or 200001, "event_id": 9000001}
    period = {
        "Win1x2": {
            "Win1":   {"value": w1,    "raw": {**raw_ml, "team_select": 0}},
            "WinNone":{"value": wnone, "raw": {**raw_ml, "team_select": 2}},
            "Win2":   {"value": w2,    "raw": {**raw_ml, "team_select": 1}},
            "LineId": line_id or 100001,
        },
        "Totals": {
            tot_line: {
                "WinMore": {"value": wmore, "raw": {**raw_tot, "team_select": 3}},
                "WinLess": {"value": wless, "raw": {**raw_tot, "team_select": 4}},
                "LineId": line_id or 200001,
            }
        },
    }
    return period


def _make_event(pid=9000001, w1=2.10, wnone=3.20, w2=3.40,
                tot_line="2.5", wmore=1.90, wless=1.99, line_id=None):
    """Build a minimal normalized event dict (PNCL or our parser output format)."""
    return {
        "Pid": pid,
        "homeName": "Home Team",
        "awayName": "Away Team",
        "isLive": True,
        "Periods": [_make_period(w1, wnone, w2, tot_line, wmore, wless, line_id)],
    }


def _make_alt_line_event(pid=9000002):
    """Event with an alt-line Totals entry (LineId >= threshold) -- should be skipped."""
    alt_lid = _ALT_LINE_ID_THRESHOLD + 1
    period = {
        "Totals": {
            "2.5": {
                "WinMore": {"value": 1.95, "raw": {"line_id": alt_lid}},
                "WinLess": {"value": 1.88, "raw": {"line_id": alt_lid}},
                "LineId": alt_lid,
            }
        },
    }
    return {"Pid": pid, "Periods": [period]}


# -- Test 1: extract_markets from a PNCL-style normalized event --------------


def test_extract_markets_pncl_event():
    """extract_markets works on PNCL-format event (same as our parser output)."""
    ev = _make_event(pid=9000001, w1=2.10, wnone=3.20, w2=3.40,
                     tot_line="2.5", wmore=1.90, wless=1.99, line_id=100001)
    markets = extract_markets(ev)
    assert "p0_w1x2_w1" in markets
    assert "p0_w1x2_wnone" in markets
    assert "p0_w1x2_w2" in markets
    assert abs(markets["p0_w1x2_w1"] - 2.10) < 1e-9
    assert abs(markets["p0_w1x2_wnone"] - 3.20) < 1e-9
    assert abs(markets["p0_w1x2_w2"] - 3.40) < 1e-9
    assert "p0_tot_2.5_wmore" in markets or "p0_tot_2.5_wless" in markets


# -- Test 2: extract_markets from our parser output (identical function) -----


def test_extract_markets_our_event():
    """extract_markets on our parsed event (parse_ps3838_all_sports format)."""
    ev = _make_event(pid=9000003, w1=1.80, wnone=0.0, w2=4.50,
                     tot_line="3.0", wmore=2.05, wless=1.78, line_id=300001)
    markets = extract_markets(ev)
    assert "p0_w1x2_w1" in markets
    assert abs(markets["p0_w1x2_w1"] - 1.80) < 1e-9
    # wnone=0 should NOT appear (only positive values included)
    assert "p0_w1x2_wnone" not in markets
    assert abs(markets["p0_w1x2_w2"] - 4.50) < 1e-9
    assert "p0_tot_3.0_wmore" in markets
    assert abs(markets["p0_tot_3.0_wmore"] - 2.05) < 1e-9


# -- Test 3: compare within tolerance -> MATCH -------------------------------


def test_compare_values_match():
    """Values within tol -> MATCH verdict."""
    ref_ev = _make_event(w1=2.10, wnone=3.20, w2=3.40, wmore=1.90, wless=1.99, line_id=None)
    our_ev = _make_event(w1=2.12, wnone=3.22, w2=3.38, wmore=1.92, wless=1.97, line_id=None)
    result = compare_markets(ref_ev, our_ev, tol=0.05)
    assert result, "Expected non-empty comparison results"
    all_match = all(v["status"] == "MATCH" for v in result.values())
    assert all_match, "All values within 0.05 should be MATCH"
    verdict = per_pid_verdict(result)
    assert verdict == "MATCH"


# -- Test 4: compare beyond tolerance -> MISMATCH ---------------------------


def test_compare_values_mismatch():
    """Values beyond tol -> MISMATCH verdict for those markets."""
    ref_ev = _make_event(w1=2.10, wnone=3.20, w2=3.40, wmore=1.90, wless=1.99, line_id=None)
    # w1 differs by 0.20 which exceeds default tol=0.05
    our_ev = _make_event(w1=2.30, wnone=3.20, w2=3.40, wmore=1.90, wless=1.99, line_id=None)
    result = compare_markets(ref_ev, our_ev, tol=0.05)
    assert result
    # At least one MISMATCH expected
    mismatches = [k for k, v in result.items() if v["status"] == "MISMATCH"]
    assert mismatches, "Expected at least one MISMATCH for diff=0.20 > tol=0.05"
    verdict = per_pid_verdict(result)
    assert verdict == "MISMATCH"


# -- Test 5: 0 overlap pids -> INCONCLUSIVE ----------------------------------


def test_no_overlap_inconclusive():
    """When ref and ours have no common pids, verdict is INCONCLUSIVE."""
    verdict = overall_verdict(overlap=0, mismatched_pids=0)
    assert verdict == "INCONCLUSIVE"


# -- Test 6: line_id-based matching ------------------------------------------


def test_line_id_matching():
    """When both events share line_ids, matching uses line_id precisely."""
    shared_lid = 999001
    ref_ev = _make_event(w1=2.10, wnone=3.20, w2=3.40, line_id=shared_lid)
    our_ev = _make_event(w1=2.11, wnone=3.21, w2=3.39, line_id=shared_lid)
    result = compare_markets(ref_ev, our_ev, tol=0.05)
    lid_keys = [k for k in result if k.startswith("lid_")]
    assert lid_keys, "Expected line_id-based match keys"
    for k in lid_keys:
        assert result[k]["match_by"] == "line_id"
    all_match = all(v["status"] == "MATCH" for v in result.values())
    assert all_match, "Diffs within 0.05 should all MATCH via line_id"


# -- Test 7: empty market results -> INCONCLUSIVE ----------------------------


def test_per_pid_verdict_empty():
    """Empty market dict returns INCONCLUSIVE (no comparable data for this pid)."""
    assert per_pid_verdict({}) == "INCONCLUSIVE"


# -- Test 8: overall_verdict 5% boundary ------------------------------------


def test_overall_verdict_boundary():
    """mismatch_rate exactly 5% -> MATCH; 6% -> MISMATCH."""
    # 5 out of 100 -> rate=0.05 -> MATCH
    assert overall_verdict(100, 5) == "MATCH"
    # 6 out of 100 -> rate=0.06 -> MISMATCH
    assert overall_verdict(100, 6) == "MISMATCH"
    # 0 out of 10 -> MATCH
    assert overall_verdict(10, 0) == "MATCH"


# -- Test 9: alt lines are skipped in extract_markets -----------------------


def test_alt_lines_skipped():
    """Alt lines (LineId >= threshold) are excluded from markets."""
    ev = _make_alt_line_event()
    markets = extract_markets(ev)
    # The alt-line Totals entry should be skipped
    assert not any("tot_" in k for k in markets), "Alt lines should be excluded"

