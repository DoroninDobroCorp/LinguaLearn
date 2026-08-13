"""Unit tests for sharpbook probe scripts (Story 27.28).

Tests (>=8, no network):
  Bump table (7 tests): fallback_bump per each threshold from story
  expected_offer (2 tests): boundary values
  compute_match_cap (2 tests): formula + max_cap clamp
  aggregate_signals (2 tests): fixture-based counter checks
  valid_bk_link (1 test): link validation
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

from exp_sb_pricing import fallback_bump, expected_offer, _BUMP_TABLE  # noqa: E402
from exp_sb_brm import compute_match_cap  # noqa: E402
from exp_sb_signals import aggregate_signals, has_pinnacle_leg, valid_bk_link  # noqa: E402


# ---------------------------------------------------------------------------
# Bump table tests (AC-3)
# ---------------------------------------------------------------------------


class TestFallbackBump:
    """One test per threshold from story bump table."""

    def test_bump_1_30_gives_001(self):
        """pin=1.30 <= 1.35 -> +0.01"""
        assert fallback_bump(1.30) == pytest.approx(0.01)

    def test_bump_1_35_boundary(self):
        """pin=1.35 exactly on boundary -> +0.01"""
        assert fallback_bump(1.35) == pytest.approx(0.01)

    def test_bump_1_50_gives_002(self):
        """pin=1.50 <= 1.70 -> +0.02"""
        assert fallback_bump(1.50) == pytest.approx(0.02)

    def test_bump_2_0_gives_003(self):
        """pin=2.0 <= 2.20 -> +0.03"""
        assert fallback_bump(2.0) == pytest.approx(0.03)

    def test_bump_2_5_gives_005(self):
        """pin=2.5 <= 3.00 -> +0.05"""
        assert fallback_bump(2.5) == pytest.approx(0.05)

    def test_bump_4_gives_008(self):
        """pin=4 <= 5.00 -> +0.08"""
        assert fallback_bump(4.0) == pytest.approx(0.08)

    def test_bump_8_gives_015(self):
        """pin=8 <= 10.00 -> +0.15"""
        assert fallback_bump(8.0) == pytest.approx(0.15)

    def test_bump_15_gives_030(self):
        """pin=15 > 10 -> +0.30"""
        assert fallback_bump(15.0) == pytest.approx(0.30)

    def test_bump_table_has_6_entries(self):
        """Internal table has exactly 6 threshold entries."""
        assert len(_BUMP_TABLE) == 6


# ---------------------------------------------------------------------------
# expected_offer tests
# ---------------------------------------------------------------------------


class TestExpectedOffer:
    def test_offer_1_30(self):
        """1.30 + 0.01 = 1.31"""
        assert expected_offer(1.30) == pytest.approx(1.31, abs=1e-7)

    def test_offer_2_0(self):
        """2.0 + 0.03 = 2.03"""
        assert expected_offer(2.0) == pytest.approx(2.03, abs=1e-7)

    def test_offer_10_0(self):
        """10.0 is exactly on boundary <= 10.00 -> +0.15 -> 10.15"""
        assert expected_offer(10.0) == pytest.approx(10.15, abs=1e-7)

    def test_offer_12_gives_030_bump(self):
        """12 > 10 -> +0.30 -> 12.30"""
        assert expected_offer(12.0) == pytest.approx(12.30, abs=1e-7)


# ---------------------------------------------------------------------------
# compute_match_cap tests (AC-2)
# ---------------------------------------------------------------------------


class TestComputeMatchCap:
    def test_example_from_story(self):
        """Story example: pin=1.5, bankroll=60000, edge=2.5, risk=15, max=10 -> ~1450.

        Formula gives ~1430; within +-150 of story's stated ~1450.
        """
        cap = compute_match_cap(1.5, 60000, 2.5, 15, 10)
        assert 1200 <= cap <= 1650, f"cap={cap} not in [1200,1650]"

    def test_cap_divisible_by_5(self):
        """Cap must always be a multiple of 5."""
        for pin in [1.2, 1.5, 2.0, 3.0, 5.0, 10.0]:
            cap = compute_match_cap(pin, 60000, 2.5, 15, 10)
            assert cap % 5 == 0, f"cap={cap} not divisible by 5 for pin={pin}"

    def test_cap_decreases_with_higher_odds(self):
        """Higher pin_odds -> lower or equal cap (lay odds decreases -> smaller pct)."""
        cap_low = compute_match_cap(1.5, 60000, 2.5, 15, 10)
        cap_high = compute_match_cap(5.0, 60000, 2.5, 15, 10)
        assert cap_low >= cap_high, f"Expected cap(1.5)={cap_low} >= cap(5.0)={cap_high}"

    def test_max_bet_pct_clamps(self):
        """Very small max_bet_pct should clamp the cap."""
        cap = compute_match_cap(1.5, 60000, 2.5, 15, 0.1)  # max=0.1% = 60
        assert cap <= 60, f"cap={cap} should be <= 60 (0.1% of 60000)"

    def test_larger_bankroll_scales_cap(self):
        """Doubling bankroll doubles cap (linear scaling)."""
        cap1 = compute_match_cap(1.5, 60000, 2.5, 15, 100)
        cap2 = compute_match_cap(1.5, 120000, 2.5, 15, 100)
        # Should be roughly 2x (rounding to 5 may cause small diff)
        assert 1.8 <= cap2 / cap1 <= 2.2, f"ratio={cap2/cap1:.2f}"


# ---------------------------------------------------------------------------
# aggregate_signals tests (AC-1)
# ---------------------------------------------------------------------------


def _make_sig(
    bk1="pinnaclesports.com",
    bk2="bet365.com",
    sport="soccer",
    profit=1.5,
    price_source="fallback",
    is_live=False,
    bk1_link="/12345",
    pin_odds=1.5,
    offered_odds=1.52,
):
    return dict(
        bk1=bk1,
        bk2=bk2,
        sport=sport,
        profit=profit,
        price_source=price_source,
        is_live=is_live,
        bk1_link=bk1_link,
        pin_odds=pin_odds,
        offered_odds=offered_odds,
    )


class TestAggregateSignals:
    def test_empty_signals(self):
        agg = aggregate_signals([])
        assert agg == {"total": 0}

    def test_counts_total(self):
        sigs = [_make_sig(), _make_sig()]
        agg = aggregate_signals(sigs)
        assert agg["total"] == 2

    def test_counts_pinnacle_leg(self):
        sigs = [
            _make_sig(bk1="pinnaclesports.com"),
            _make_sig(bk1="bet365.com", bk2="bet365.com"),  # no pinnacle leg
        ]
        agg = aggregate_signals(sigs)
        assert agg["with_pinnacle_leg"] == 1

    def test_profit_stats(self):
        sigs = [
            _make_sig(profit=1.0),
            _make_sig(profit=2.0),
            _make_sig(profit=-0.5),
        ]
        agg = aggregate_signals(sigs)
        assert agg["profit_min"] == pytest.approx(-0.5)
        assert agg["profit_max"] == pytest.approx(2.0)
        assert agg["profit_gt0_count"] == 2

    def test_price_source_counts(self):
        sigs = [
            _make_sig(price_source="fallback"),
            _make_sig(price_source="fallback"),
            _make_sig(price_source="margin"),
        ]
        agg = aggregate_signals(sigs)
        assert agg["fallback_count"] == 2
        assert agg["margin_count"] == 1

    def test_sport_breakdown(self):
        sigs = [
            _make_sig(sport="soccer"),
            _make_sig(sport="tennis"),
            _make_sig(sport="soccer"),
        ]
        agg = aggregate_signals(sigs)
        assert agg["by_sport"]["soccer"] == 2
        assert agg["by_sport"]["tennis"] == 1

    def test_pct_is_live(self):
        sigs = [_make_sig(is_live=True), _make_sig(is_live=False)]
        agg = aggregate_signals(sigs)
        assert agg["pct_is_live"] == pytest.approx(50.0)

    def test_pct_valid_bk_link(self):
        sigs = [
            _make_sig(bk1_link="/12345"),
            _make_sig(bk1_link="http://external.com"),  # not starting with /
            _make_sig(bk1_link="/67890"),
        ]
        agg = aggregate_signals(sigs)
        assert agg["pct_valid_bk_link"] == pytest.approx(66.7, abs=0.2)


# ---------------------------------------------------------------------------
# valid_bk_link tests
# ---------------------------------------------------------------------------


class TestValidBkLink:
    def test_valid_slash_link(self):
        assert valid_bk_link({"bk1_link": "/12345"}) is True

    def test_invalid_http_link(self):
        assert valid_bk_link({"bk1_link": "http://ext.com"}) is False

    def test_empty_link(self):
        assert valid_bk_link({"bk1_link": ""}) is False

    def test_missing_link(self):
        assert valid_bk_link({}) is False

    def test_root_slash_only(self):
        # "/" alone is length 1 -> invalid per spec (no pid after slash)
        assert valid_bk_link({"bk1_link": "/"}) is False


# ---------------------------------------------------------------------------
# has_pinnacle_leg tests
# ---------------------------------------------------------------------------


class TestHasPinnacleLeg:
    def test_bk1_pinnacle(self):
        assert has_pinnacle_leg({"bk1": "pinnaclesports.com"}) is True

    def test_bk2_pinnacle(self):
        assert has_pinnacle_leg({"bk2": "pinnaclesports.com"}) is True

    def test_neither_pinnacle(self):
        assert has_pinnacle_leg({"bk1": "bet365", "bk2": "1xbet"}) is False
