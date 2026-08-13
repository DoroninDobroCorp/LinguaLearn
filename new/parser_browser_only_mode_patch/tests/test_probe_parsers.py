"""Unit tests for PS3838 probe parsers (DoD-9).
No live WS required -- uses recorded fixtures.

Tests (>=6):
  test_ln_ids_live       -- live pids from l-tree
  test_ln_ids_prematch   -- prematch pids from n-tree
  test_extract_prices    -- prices from event[8]
  test_compare_prices    -- MATCH / MISMATCH verdict
  test_mb_responded      -- pids from MORE_BET e/e1/ce
  test_u_delta_ids       -- pids from UPDATE_ODDS u
  test_empty_frame       -- empty input returns empty result
  test_market_delta      -- added/removed set difference
  test_collect_events    -- pid->market_set from FULL_ODDS
  test_snap_ids_ln       -- (live, pm) via snap_ids_ln
  test_extract_events_ln -- N>=3 events, structure check
"""
import json
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

from exp_odds_xval import extract_prices, extract_events_ln, compare_prices, xval_overall_verdict
from exp_morebet_content import (
    _slot_has_data,
    _markets_from_ev,
    collect_events_snap,
    mb_responded,
    mb_event_markets,
    market_delta,
)
from exp_reconnect_soak import ln_ids, u_delta_ids
from exp_noslug_nav import snap_ids_ln

_FIXTURE = Path(__file__).parent / "fixtures" / "ps3838_frames_sample.json"


@pytest.fixture(scope="module")
def fx():
    with _FIXTURE.open() as f:
        return json.load(f)


@pytest.fixture(scope="module")
def sport(fx):
    return fx["_sport"]


@pytest.fixture(scope="module")
def full_odds_frame(fx):
    return fx["full_odds"]


@pytest.fixture(scope="module")
def update_odds_frame(fx):
    return fx["update_odds"]


@pytest.fixture(scope="module")
def more_bet_frame(fx):
    return fx["more_bet"]


# -- Test 1: ln_ids -- live pids from l-tree ----------------------------------

def test_ln_ids_live(full_odds_frame, sport):
    odds_obj = full_odds_frame["odds"]
    live_set, pm_set = ln_ids(odds_obj, sport)
    assert live_set, "Should find live events in l-tree"
    assert all(pid > 1_500_000_000 for pid in live_set)
    assert len(live_set) >= 2, "Fixture has 2 live events"


# -- Test 2: ln_ids -- prematch pids from n-tree -------------------------------

def test_ln_ids_prematch(full_odds_frame, sport):
    odds_obj = full_odds_frame["odds"]
    live_set, pm_set = ln_ids(odds_obj, sport)
    assert pm_set, "Should find prematch events in n-tree"
    assert all(pid > 1_500_000_000 for pid in pm_set)
    assert len(pm_set) >= 1, "Fixture has prematch events"
    assert live_set.isdisjoint(pm_set), "Live/pm pids should not overlap"


# -- Test 3: extract_prices -- parse prices from event[8] ---------------------

def test_extract_prices(full_odds_frame, sport):
    odds_obj = full_odds_frame["odds"]
    live_tree = odds_obj.get("l", [])
    ev_arr = None
    for sp in live_tree:
        if sp[0] == sport:
            ev_arr = sp[2][0][2][0]
            break
    assert ev_arr is not None, "Should find live event array"
    prices = extract_prices(ev_arr)
    assert prices, "Should extract prices"
    for key, val in prices.items():
        try:
            fval = float(val)
            assert fval > 1.0, "Price should be > 1.0 (decimal odds): %s=%s" % (key, val)
        except ValueError:
            pytest.fail("Non-numeric price: %s=%r" % (key, val))


# -- Test 4a: compare_prices -- MATCH -----------------------------------------

def test_compare_prices_match():
    ws = {"p0_s0_h": "2.350", "p0_s1_o": "1.900", "p0_s2_ml_w1": "3.400"}
    src = {"p0_s0_h": "2.360", "p0_s1_o": "1.905", "p0_s2_ml_w1": "3.400"}
    verdict, matched, mismatched = compare_prices(ws, src, tol=0.05)
    assert verdict == "MATCH"
    assert len(matched) == 3
    assert len(mismatched) == 0


# -- Test 4b: compare_prices -- MISMATCH --------------------------------------

def test_compare_prices_mismatch():
    ws = {"p0_s0_h": "2.350", "p0_ml_w1": "2.100"}
    src = {"p0_s0_h": "2.700", "p0_ml_w1": "2.100"}
    verdict, matched, mismatched = compare_prices(ws, src, tol=0.05)
    assert verdict == "MISMATCH"
    assert len(mismatched) >= 1
    mkeys = {m["key"] for m in mismatched}
    assert "p0_s0_h" in mkeys


# -- Test 5: mb_responded -- pids from MORE_BET -------------------------------

def test_mb_responded(more_bet_frame):
    frames = [json.dumps(more_bet_frame)]
    pids = mb_responded(frames)
    assert pids, "Should extract pid from MORE_BET frame"
    assert all(pid > 1_500_000_000 for pid in pids)


# -- Test 6: u_delta_ids -- pids from UPDATE_ODDS u-array ---------------------

def test_u_delta_ids(update_odds_frame, sport):
    odds_obj = update_odds_frame["odds"]
    pids = u_delta_ids(odds_obj, sport)
    assert pids, "Should extract pids from UPDATE_ODDS"
    assert all(pid > 1_500_000_000 for pid in pids)


# -- Test 7: empty frame -> empty result --------------------------------------

def test_empty_ln_ids():
    live_set, pm_set = ln_ids({}, 29)
    assert live_set == set()
    assert pm_set == set()


def test_empty_u_delta():
    pids = u_delta_ids({}, 29)
    assert pids == set()


def test_empty_mb_responded():
    pids = mb_responded([])
    assert pids == set()


def test_empty_extract_prices():
    prices = extract_prices([])
    assert prices == {}


# -- Test 8: market_delta -- set difference -----------------------------------

def test_market_delta_added():
    before = {"0", "1"}
    after = {"0", "1", "9"}
    added, removed = market_delta(before, after)
    assert added == {"9"}
    assert removed == set()


def test_market_delta_removed():
    before = {"0", "1", "2"}
    after = {"0", "2"}
    added, removed = market_delta(before, after)
    assert added == set()
    assert removed == {"1"}


def test_market_delta_symmetric():
    before = {"0", "1"}
    after = {"0", "9"}
    added, removed = market_delta(before, after)
    assert added == {"9"}
    assert removed == {"1"}


# -- Test 9: collect_events_snap -- pid->market_set from FULL_ODDS ------------

def test_collect_events_snap(full_odds_frame, sport):
    frames = [json.dumps(full_odds_frame)]
    snap = collect_events_snap(frames, sport)
    assert snap, "Should extract events from FULL_ODDS"
    assert all(pid > 1_500_000_000 for pid in snap)
    for pid, mkts in snap.items():
        assert isinstance(mkts, set), "Markets should be a set for pid=%d" % pid


# -- Test 10: snap_ids_ln -- (live, pm) from frames ---------------------------

def test_snap_ids_ln(full_odds_frame, sport):
    frames = [json.dumps(full_odds_frame)]
    live_set, pm_set = snap_ids_ln(frames, sport)
    assert live_set, "Should find live events"
    assert pm_set, "Should find prematch events"
    direct_live, direct_pm = ln_ids(full_odds_frame["odds"], sport)
    assert live_set == direct_live
    assert pm_set == direct_pm


# -- Test 11: extract_events_ln -- N>=3 events, structure ---------------------

def test_extract_events_ln_count(full_odds_frame, sport):
    odds_obj = full_odds_frame["odds"]
    events = extract_events_ln(odds_obj, sport)
    assert len(events) >= 3, "Need >=3 events (N>=3), got %d" % len(events)
    live_count = sum(1 for e in events if e["live"])
    pm_count = sum(1 for e in events if not e["live"])
    assert live_count >= 1
    assert pm_count >= 1


def test_extract_events_ln_structure(full_odds_frame, sport):
    odds_obj = full_odds_frame["odds"]
    events = extract_events_ln(odds_obj, sport)
    for ev in events:
        assert "pid" in ev
        assert "team1" in ev
        assert "prices" in ev
        assert ev["pid"] > 1_500_000_000


# -- Test 12: mb_event_markets -- market sets from MORE_BET -------------------

def test_mb_event_markets(full_odds_frame, more_bet_frame, sport):
    snap_frames = [json.dumps(full_odds_frame)]
    snap = collect_events_snap(snap_frames, sport)
    mb_frames = [json.dumps(more_bet_frame)]
    mb_mkts = mb_event_markets(mb_frames)
    for pid, after_set in mb_mkts.items():
        if pid in snap:
            before_set = snap[pid]
            added, _ = market_delta(before_set, after_set)
            assert isinstance(added, set), "market_delta must return set"
            # elements must be (period, slot) tuples, not bare period strings
            for m in before_set | after_set:
                assert isinstance(m, tuple) and len(m) == 2, (
                    f"market-set elements must be (period, slot) tuples, got {m!r}"
                )


# -- Test 13: _slot_has_data helper -------------------------------------------

def test_slot_has_data_spread():
    assert _slot_has_data([[0.5, -0.5, "0.5", "2.1", "1.8"]])


def test_slot_has_data_empty_list():
    assert not _slot_has_data([])


def test_slot_has_data_none():
    assert not _slot_has_data(None)


def test_slot_has_data_all_empty_inner():
    assert not _slot_has_data([[], []])


def test_slot_has_data_moneyline_flat():
    assert _slot_has_data(["3.4", "2.1", "3.2", 12345, 0, 10000.0, 1])


# -- Test 14: _markets_from_ev returns (period, slot) tuples ------------------

def test_markets_from_ev_slot_level():
    """_markets_from_ev must return (period, slot_idx) tuples, not bare period strings."""
    ev_arr = [None] * 9
    ev_arr[8] = {
        "0": [
            [[0.5, -0.5, "0.5", "2.1", "1.8", 0, 0, 111, 1, 1000.0, 1]],  # slot 0: spread
            [[2.5, "1.9", "1.95", 222, 0, 1000.0, 1]],                       # slot 1: total
            ["3.2", "2.1", "3.5", 333, 0, 1000.0, 1],                         # slot 2: ml
        ],
        "1": [
            [],                                             # slot 0 empty
            [],                                             # slot 1 empty
            ["4.0", "2.0", "4.5", 444, 0, 500.0, 1],       # slot 2: ml
        ],
    }
    mkts = _markets_from_ev(ev_arr)
    assert isinstance(mkts, set)
    assert all(isinstance(m, tuple) and len(m) == 2 for m in mkts), (
        "All market-set elements must be (period_str, slot_int) tuples"
    )
    assert ("0", 0) in mkts, "period 0 slot 0 (spread) must be detected"
    assert ("0", 1) in mkts, "period 0 slot 1 (total) must be detected"
    assert ("0", 2) in mkts, "period 0 slot 2 (moneyline) must be detected"
    assert ("1", 2) in mkts, "period 1 slot 2 (moneyline) must be detected"
    assert len(mkts) == 4, f"Expected 4 non-empty slots, got {sorted(mkts)}"


def test_markets_from_ev_empty():
    assert _markets_from_ev([]) == set()
    ev = [None] * 9
    ev[8] = {}
    assert _markets_from_ev(ev) == set()


# -- Test 15: bet-type level delta: MORE_BET adds slots vs FULL_ODDS -----------

def test_market_delta_bet_type_level(full_odds_frame, more_bet_frame, sport):
    """MORE_BET must expose new market slots vs FULL_ODDS snapshot (bet-type delta, not period level)."""
    snap_frames = [json.dumps(full_odds_frame)]
    snap = collect_events_snap(snap_frames, sport)
    mb_frames = [json.dumps(more_bet_frame)]
    mb_mkts = mb_event_markets(mb_frames)

    pid = 1630000001  # event present in both full_odds and more_bet fixtures
    assert pid in snap, "pid must be in FULL_ODDS snapshot"
    assert pid in mb_mkts, "pid must be in MORE_BET response"

    before_set = snap[pid]
    after_set = mb_mkts[pid]
    added, _ = market_delta(before_set, after_set)

    assert added, (
        f"MORE_BET must add at least one new market slot vs FULL_ODDS snapshot; "
        f"before={sorted(before_set)} after={sorted(after_set)} added={sorted(added)}"
    )
    # Verify all elements are (period, slot) tuples — not bare period strings
    for m in before_set | after_set:
        assert isinstance(m, tuple) and len(m) == 2, (
            f"market-set element must be (period_str, slot_int) tuple, got {m!r}"
        )


# -- Test 16: xval_overall_verdict logic (P1 defect fix) ----------------------

def test_xval_verdict_zero_pairs_is_inconclusive():
    """0 pairs must give INCONCLUSIVE, not MATCH (P1 defect fix)."""
    assert xval_overall_verdict(0, 0) == "INCONCLUSIVE", (
        "0 pairs with 0 mismatches must be INCONCLUSIVE, not MATCH"
    )
    assert xval_overall_verdict(0, 5) == "INCONCLUSIVE"


def test_xval_verdict_match():
    """pairs > 0, mismatch == 0 → MATCH."""
    assert xval_overall_verdict(5, 0) == "MATCH"
    assert xval_overall_verdict(1, 0) == "MATCH"


def test_xval_verdict_mismatch():
    """pairs > 0, mismatch > 0 → MISMATCH."""
    assert xval_overall_verdict(5, 2) == "MISMATCH"
    assert xval_overall_verdict(1, 1) == "MISMATCH"
