"""Tests for BIA market adapter (services/bia_market_adapter.py)."""

from __future__ import annotations

import pytest

from services.bia_market_adapter import (
    _is_suspended_prices,
    _extract_three_way,
    _extract_two_way,
    _extract_line_market,
    _extract_yes_no,
    _extract_odd_even,
    _extract_named_outcomes,
    _extract_dc,
    convert_bia_markets,
    build_bia_game_update,
)


# ── Suspension filter ───────────────────────────────────────────────────────

class TestSuspensionFilter:
    def test_low_price_is_suspended(self):
        assert _is_suspended_prices({"home": 1.01, "away": 2.0}) is True

    def test_high_implied_prob_suspended(self):
        # 1/1.1 + 1/1.1 = 1.82 > 1.15
        assert _is_suspended_prices({"home": 1.1, "away": 1.1}) is True

    def test_normal_prices_not_suspended(self):
        assert _is_suspended_prices({"home": 2.5, "draw": 3.2, "away": 2.8}) is False

    def test_empty_is_suspended(self):
        assert _is_suspended_prices({}) is True


# ── Three-way extraction ────────────────────────────────────────────────────

class TestExtractThreeWay:
    def test_normal_wdw(self):
        market = [None, [["h", 2.5], ["d", 3.2], ["a", 2.8]]]
        result = _extract_three_way(market, swapped=False)
        assert result == {"home": 2.5, "draw": 3.2, "away": 2.8}

    def test_swapped_wdw(self):
        market = [None, [["h", 2.5], ["d", 3.2], ["a", 2.8]]]
        result = _extract_three_way(market, swapped=True)
        assert result == {"home": 2.8, "draw": 3.2, "away": 2.5}

    def test_incomplete_returns_none(self):
        market = [None, [["h", 2.5]]]
        assert _extract_three_way(market, swapped=False) is None

    def test_invalid_format(self):
        assert _extract_three_way("not a list", swapped=False) is None


# ── Two-way extraction ──────────────────────────────────────────────────────

class TestExtractTwoWay:
    def test_moneyline(self):
        market = [None, [["h", 1.85], ["a", 2.05]]]
        result = _extract_two_way(market, swapped=False)
        assert result == {"home": 1.85, "away": 2.05}

    def test_swapped_moneyline(self):
        market = [None, [["h", 1.85], ["a", 2.05]]]
        result = _extract_two_way(market, swapped=True)
        assert result == {"home": 2.05, "away": 1.85}

    def test_missing_side_returns_none(self):
        market = [None, [["h", 1.85]]]
        assert _extract_two_way(market, swapped=False) is None


# ── Line market extraction ──────────────────────────────────────────────────

class TestExtractLineMarket:
    def test_totals(self):
        market = [None, [[2.5, 1.9, 1.95], [3.0, 2.1, 1.75]]]
        result = _extract_line_market(market, swapped=False, negate_handicap=False)
        assert result is not None
        assert "2.5" in result
        assert result["2.5"]["WinMore"]["value"] == 1.9
        assert result["2.5"]["WinLess"]["value"] == 1.95

    def test_handicap(self):
        market = [None, [[-0.5, 1.85, 2.0]]]
        result = _extract_line_market(market, swapped=False, negate_handicap=True)
        assert result is not None
        assert "0.5" in result
        assert result["0.5"]["Win1"]["value"] == 1.85
        assert result["0.5"]["Win2"]["value"] == 2.0

    def test_swapped_handicap(self):
        market = [None, [[-0.5, 1.85, 2.0]]]
        result = _extract_line_market(market, swapped=True, negate_handicap=True)
        assert result is not None
        assert "0.5" in result
        assert result["0.5"]["Win1"]["value"] == 2.0
        assert result["0.5"]["Win2"]["value"] == 1.85

    def test_suspended_line_skipped(self):
        market = [None, [[2.5, 1.0, 1.0]]]
        result = _extract_line_market(market, swapped=False, negate_handicap=False)
        assert result is None

    def test_empty_lines(self):
        market = [None, []]
        result = _extract_line_market(market, swapped=False, negate_handicap=False)
        assert result is None


# ── Yes/No extraction ───────────────────────────────────────────────────────

class TestExtractYesNo:
    def test_btts(self):
        market = [None, [["y", 1.85], ["n", 2.0]]]
        result = _extract_yes_no(market)
        assert result is not None
        assert result["Yes"]["value"] == 1.85
        assert result["No"]["value"] == 2.0

    def test_suspended_btts(self):
        market = [None, [["y", 1.01], ["n", 1.01]]]
        result = _extract_yes_no(market)
        assert result is None


# ── Odd/Even extraction ─────────────────────────────────────────────────────

class TestExtractOddEven:
    def test_normal_oe(self):
        market = [None, [["o", 1.9], ["e", 1.95]]]
        result = _extract_odd_even(market)
        assert result is not None
        assert result["Odd"]["value"] == 1.9
        assert result["Even"]["value"] == 1.95

    def test_suspended_oe(self):
        market = [None, [["o", 1.0], ["e", 1.0]]]
        result = _extract_odd_even(market)
        assert result is None


# ── Named outcomes extraction ───────────────────────────────────────────────

class TestExtractNamedOutcomes:
    def test_correct_score(self):
        market = [None, [["1:0", 6.5], ["0:1", 8.0], ["2:1", 7.5]]]
        result = _extract_named_outcomes(market)
        assert result is not None
        assert result["1:0"]["value"] == 6.5
        assert result["0:1"]["value"] == 8.0

    def test_low_price_filtered(self):
        market = [None, [["1:0", 1.01]]]
        result = _extract_named_outcomes(market)
        assert result is None


# ── Double chance extraction ────────────────────────────────────────────────

class TestExtractDoubleChance:
    def test_normal_dc(self):
        market = [None, [["hd", 1.4], ["ha", 1.35], ["da", 2.5]]]
        result = _extract_dc(market, swapped=False)
        assert result is not None
        assert result["W1X"]["value"] == 1.4
        assert result["W12"]["value"] == 1.35
        assert result["WX2"]["value"] == 2.5

    def test_swapped_dc(self):
        market = [None, [["hd", 1.4], ["ha", 1.35], ["da", 2.5]]]
        result = _extract_dc(market, swapped=True)
        assert result is not None
        assert result["W1X"]["value"] == 2.5  # WX2 becomes W1X when swapped
        assert result["WX2"]["value"] == 1.4  # W1X becomes WX2 when swapped

    def test_live_bia_dc_shape(self):
        market = [None, [["a,d", 2.689], ["h,a", 1.235], ["h,d", 1.196]]]
        result = _extract_dc(market, swapped=False)
        assert result is not None
        assert result["WX2"]["value"] == 2.689
        assert result["W12"]["value"] == 1.235
        assert result["W1X"]["value"] == 1.196

    def test_live_bia_dc_shape_swapped(self):
        market = [None, [["a,d", 2.689], ["h,a", 1.235], ["h,d", 1.196]]]
        result = _extract_dc(market, swapped=True)
        assert result is not None
        assert result["W1X"]["value"] == 2.689
        assert result["W12"]["value"] == 1.235
        assert result["WX2"]["value"] == 1.196

    def test_incomplete_dc(self):
        market = [None, [["hd", 1.4]]]
        assert _extract_dc(market, swapped=False) is None


# ── Full convert_bia_markets ────────────────────────────────────────────────

class TestConvertBiaMarkets:
    def test_wdw_market(self):
        markets = {
            "wdw": [None, [["h", 2.5], ["d", 3.2], ["a", 2.8]]],
        }
        result = convert_bia_markets(markets, swapped=False)
        assert result is not None
        assert "Win1x2" in result
        assert result["Win1x2"]["Win1"]["value"] == 2.5
        assert result["Win1x2"]["Draw"]["value"] == 3.2
        assert result["Win1x2"]["Win2"]["value"] == 2.8

    def test_ml_market_no_draw(self):
        markets = {
            "ml": [None, [["h", 1.85], ["a", 2.05]]],
        }
        result = convert_bia_markets(markets, swapped=False)
        assert result is not None
        assert "Win1x2" in result
        assert "Draw" not in result["Win1x2"]

    def test_ah_market(self):
        markets = {
            "ah": [None, [[-0.5, 1.85, 2.0]]],
        }
        result = convert_bia_markets(markets, swapped=False)
        assert result is not None
        assert "Handicap" in result

    def test_ahou_market(self):
        markets = {
            "ahou": [None, [[2.5, 1.9, 1.95]]],
        }
        result = convert_bia_markets(markets, swapped=False)
        assert result is not None
        assert "Totals" in result

    def test_multiple_markets(self):
        markets = {
            "wdw": [None, [["h", 2.5], ["d", 3.2], ["a", 2.8]]],
            "score,both": [None, [["y", 1.85], ["n", 2.0]]],
            "oe": [None, [["o", 1.9], ["e", 1.95]]],
            "dc": [None, [["hd", 1.4], ["ha", 1.35], ["da", 2.5]]],
        }
        result = convert_bia_markets(markets, swapped=False)
        assert result is not None
        assert "Win1x2" in result
        assert "BTTS" in result
        assert "OddEven" in result
        assert "DoubleChance" in result

    def test_suspended_market_returns_none(self):
        markets = {
            "wdw": [None, [["h", 1.01], ["d", 1.01], ["a", 1.01]]],
        }
        result = convert_bia_markets(markets, swapped=False)
        # All markets suspended → None
        assert result is None

    def test_empty_markets(self):
        assert convert_bia_markets({}, swapped=False) is None

    def test_swapped_wdw(self):
        markets = {
            "wdw": [None, [["h", 2.5], ["d", 3.2], ["a", 2.8]]],
        }
        result = convert_bia_markets(markets, swapped=True)
        assert result is not None
        assert result["Win1x2"]["Win1"]["value"] == 2.8  # swapped
        assert result["Win1x2"]["Win2"]["value"] == 2.5

    def test_team_totals(self):
        markets = {
            "tahou,h": [None, [[1.5, 1.9, 1.95]]],
            "tahou,a": [None, [[0.5, 1.7, 2.15]]],
        }
        result = convert_bia_markets(markets, swapped=False)
        assert result is not None
        assert "FirstTeamTotals" in result
        assert "SecondTeamTotals" in result

    def test_team_totals_swapped(self):
        markets = {
            "tahou,h": [None, [[1.5, 1.9, 1.95]]],
            "tahou,a": [None, [[0.5, 1.7, 2.15]]],
        }
        result = convert_bia_markets(markets, swapped=True)
        assert result is not None
        # When swapped, tahou,h → SecondTeamTotals, tahou,a → FirstTeamTotals
        assert "FirstTeamTotals" in result
        assert "SecondTeamTotals" in result

    def test_team_totals_prefers_standard_2_5_line_when_alts_exist(self):
        markets = {
            "tahou,h": [None, [[1.5, 1.83, 1.99], [2.5, 2.63, 1.47], [3.5, 4.6, 1.15]]],
        }
        result = convert_bia_markets(markets, swapped=False)
        assert result is not None
        assert result["FirstTeamTotals"] == {
            "2.5": {"WinMore": {"value": 2.63}, "WinLess": {"value": 1.47}},
        }

    def test_win_to_nil(self):
        markets = {
            "win_to_nil,h": [None, [["y", 3.5], ["n", 1.25]]],
        }
        result = convert_bia_markets(markets, swapped=False)
        assert result is not None
        assert "HomeWinToNil" in result

    def test_qualify(self):
        markets = {
            "qualify": [None, [["h", 1.5], ["a", 2.5]]],
        }
        result = convert_bia_markets(markets, swapped=False)
        assert result is not None
        assert "ToQualify" in result
        assert set(result["ToQualify"]) == {"Home", "Away"}
        assert result["ToQualify"]["Home"]["value"] == 1.5
        assert result["ToQualify"]["Away"]["value"] == 2.5

    def test_qualify_swapped_uses_home_away_keys(self):
        markets = {
            "qualify": [None, [["h", 1.5], ["a", 2.5]]],
        }
        result = convert_bia_markets(markets, swapped=True)
        assert result is not None
        assert set(result["ToQualify"]) == {"Home", "Away"}
        assert result["ToQualify"]["Home"]["value"] == 2.5
        assert result["ToQualify"]["Away"]["value"] == 1.5

    def test_exact_total(self):
        markets = {
            "exact_total": [None, [["0", 8.0], ["1", 5.5], ["2", 4.0]]],
        }
        result = convert_bia_markets(markets, swapped=False)
        assert result is not None
        assert "ExactTotalGoals" in result

    def test_correct_score_live_bia_shape(self):
        markets = {
            "cs": [[1, 0], [["", 8.5]]],
        }
        result = convert_bia_markets(markets, swapped=False)
        assert result is not None
        assert result["CorrectScore"]["1:0"]["value"] == 8.5

    def test_exact_total_live_bia_shape(self):
        markets = {
            "exact_total": [2, [["", 1.892]]],
        }
        result = convert_bia_markets(markets, swapped=False)
        assert result is not None
        assert result["ExactTotalGoals"]["2"]["value"] == 1.892

    def test_htft_live_bia_shape(self):
        markets = {
            "htft": [None, [["a,a", 1.97], ["d,h", 28.44], ["h,d", 33.34]]],
        }
        result = convert_bia_markets(markets, swapped=False)
        assert result is not None
        assert result["HalfTimeFullTime"]["2/2"]["value"] == 1.97
        assert result["HalfTimeFullTime"]["X/1"]["value"] == 28.44
        assert result["HalfTimeFullTime"]["1/X"]["value"] == 33.34

    def test_htft_live_bia_shape_swapped(self):
        markets = {
            "htft": [None, [["a,a", 1.97], ["d,h", 28.44], ["h,d", 33.34]]],
        }
        result = convert_bia_markets(markets, swapped=True)
        assert result is not None
        assert result["HalfTimeFullTime"]["1/1"]["value"] == 1.97
        assert result["HalfTimeFullTime"]["X/2"]["value"] == 28.44
        assert result["HalfTimeFullTime"]["2/X"]["value"] == 33.34

    def test_winning_margin(self):
        markets = {
            "wm": [None, [["1-0", 6.5], ["2-0", 8.0]]],
        }
        result = convert_bia_markets(markets, swapped=False)
        assert result is not None
        assert "WinningMargin" in result

    def test_winning_margin_live_bia_shape(self):
        markets = {
            "wm": [1, [["h", 4.8], ["a", 5.1]]],
        }
        result = convert_bia_markets(markets, swapped=False)
        assert result is not None
        assert result["WinningMargin"]["Home By 1"]["value"] == 4.8
        assert result["WinningMargin"]["Away By 1"]["value"] == 5.1

    def test_winning_margin_live_bia_shape_swapped(self):
        markets = {
            "wm": [1, [["h", 4.8], ["a", 5.1]]],
        }
        result = convert_bia_markets(markets, swapped=True)
        assert result is not None
        assert result["WinningMargin"]["Home By 1"]["value"] == 5.1
        assert result["WinningMargin"]["Away By 1"]["value"] == 4.8

    def test_total_goals_range(self):
        markets = {
            "gr": [None, [["0-1", 3.5], ["2-3", 2.5], ["4+", 3.0]]],
        }
        result = convert_bia_markets(markets, swapped=False)
        assert result is not None
        assert "TotalGoalsRange" in result

    def test_total_goals_range_live_bia_shape(self):
        markets = {
            "gr": [[4, 6], [["", 5.6]]],
        }
        result = convert_bia_markets(markets, swapped=False)
        assert result is not None
        assert result["TotalGoalsRange"]["4-6"]["value"] == 5.6

    def test_total_goals_range_prefers_api_compatible_buckets(self):
        markets = {
            "gr": [
                [[0, 0], [["", 4.05]]],
                [[0, 1], [["", 1.862]]],
                [[1, 1], [["", 2.74]]],
                [[2, 2], [["", 3.4]]],
                [[2, 3], [["", 2.389]]],
            ],
        }
        result = convert_bia_markets(markets, swapped=False, period_number=1)
        assert result is not None
        assert set(result["TotalGoalsRange"]) == {"0 - 1", "2-3"}
        assert result["TotalGoalsRange"]["0 - 1"]["value"] == 1.862
        assert result["TotalGoalsRange"]["2-3"]["value"] == 2.389

    def test_team_to_score(self):
        markets = {
            "score,h": [None, [["y", 1.3], ["n", 3.5]]],
            "score,a": [None, [["y", 1.5], ["n", 2.6]]],
        }
        result = convert_bia_markets(markets, swapped=False)
        assert result is not None
        assert "HomeTeamToScore" in result
        assert "AwayTeamToScore" in result

    def test_team_to_score_swapped(self):
        markets = {
            "score,h": [None, [["y", 1.3], ["n", 3.5]]],
            "score,a": [None, [["y", 1.5], ["n", 2.6]]],
        }
        result = convert_bia_markets(markets, swapped=True)
        assert result is not None
        # When swapped, score,h→AwayTeamToScore, score,a→HomeTeamToScore
        assert "HomeTeamToScore" in result
        assert "AwayTeamToScore" in result
        assert result["HomeTeamToScore"]["Yes"]["value"] == 1.5  # from score,a

    def test_btts_winner_combo(self):
        markets = {
            "mo_both_score": [None, [["a,no", 5.222], ["d,yes", 4.529], ["h,yes", 6.14]]],
        }
        result = convert_bia_markets(markets, swapped=False)
        assert result is not None
        assert result["BTTSWinnerCombo"]["No & Away"]["value"] == 5.222
        assert result["BTTSWinnerCombo"]["Yes & Draw"]["value"] == 4.529
        assert result["BTTSWinnerCombo"]["Yes & Home"]["value"] == 6.14

    def test_btts_winner_combo_swapped(self):
        markets = {
            "mo_both_score": [None, [["a,no", 5.222], ["h,yes", 6.14]]],
        }
        result = convert_bia_markets(markets, swapped=True)
        assert result is not None
        assert result["BTTSWinnerCombo"]["No & Home"]["value"] == 5.222
        assert result["BTTSWinnerCombo"]["Yes & Away"]["value"] == 6.14

    def test_proposition_team_props_markets(self):
        markets = {
            "dc": [None, [["a,d", 2.689], ["h,a", 1.235], ["h,d", 1.196]]],
            "proposition,Team Props,Either Team To Score?": [None, [["No", 26.19], ["Yes", 1.022]]],
            "proposition,Team Props,First Team To Score": [
                None,
                [["Atletico Madrid", 3.03], ["Barcelona", 1.483], ["Neither", 26.13]],
            ],
            "proposition,Team Props,Both Teams To Score/Total Goals": [
                None,
                [["No & Over 2.5", 6.77], ["No & Under 2.5", 4.359], ["Yes & Over 2.5", 1.694], ["Yes & Under 2.5", 11.53]],
            ],
            "proposition,Team Props,Odd/Even / Total Goals": [
                None,
                [["Even & Over 2.5", 3.16], ["Even & Under 2.5", 4.64], ["Odd & Over 2.5", 2.429], ["Odd & Under 2.5", 9.53]],
            ],
            "proposition,Team Props,3-Way Handicap Barcelona +1": [
                None,
                [["Atletico Madrid (-1)", 12.88], ["Barcelona (+1)", 1.181], ["Draw - (Barcelona +1)", 8.48]],
            ],
        }
        result = convert_bia_markets(
            markets,
            swapped=False,
            home_name="FC Barcelona",
            away_name="Atletico Madrid",
        )
        assert result is not None
        assert result["DoubleChance"]["W1X"]["value"] == 1.196
        assert result["DoubleChance"]["W12"]["value"] == 1.235
        assert result["DoubleChance"]["WX2"]["value"] == 2.689
        assert result["EitherTeamToScore"]["Yes"]["value"] == 1.022
        assert result["EitherTeamToScore"]["No"]["value"] == 26.19
        assert result["FirstTeamToScore"]["Home"]["value"] == 1.483
        assert result["FirstTeamToScore"]["Away"]["value"] == 3.03
        assert result["FirstTeamToScore"]["Neither"]["value"] == 26.13
        assert result["BTTSTotalCombo"]["Yes & Under 2.5"]["value"] == 11.53
        assert result["OddEvenTotalCombo"]["Odd & Under 2.5"]["value"] == 9.53
        assert result["ThreeWayHandicap"]["+1"]["Draw"]["value"] == 8.48

    def test_first_half_proposition_team_props_markets(self):
        markets = {
            "proposition,Team Props - 1st Half,Either Team To Score? 1st Half": [
                None,
                [["No", 4.85], ["Yes", 1.198]],
            ],
            "proposition,Team Props - 1st Half,First Team To Score 1st Half": [
                None,
                [["Atletico Madrid", 3.68], ["Barcelona", 1.763], ["Neither", 4.93]],
            ],
        }
        result = convert_bia_markets(
            markets,
            swapped=False,
            period_number=1,
            home_name="FC Barcelona",
            away_name="Atletico Madrid",
        )
        assert result is not None
        assert result["Number"] == 1
        assert result["EitherTeamToScore"]["Yes"]["value"] == 1.198
        assert result["FirstTeamToScore"]["Home"]["value"] == 1.763
        assert result["FirstTeamToScore"]["Away"]["value"] == 3.68
        assert result["FirstTeamToScore"]["Neither"]["value"] == 4.93

    def test_winner_total_combo(self):
        markets = {
            "moou": [2.5, [["a,over", 6.42], ["d,under", 3.49], ["h,under", 4.82]]],
        }
        result = convert_bia_markets(markets, swapped=False)
        assert result is not None
        assert result["WinnerTotalCombo"]["Away & Over 2.5"]["value"] == 6.42
        assert result["WinnerTotalCombo"]["Draw & Under 2.5"]["value"] == 3.49
        assert result["WinnerTotalCombo"]["Home & Under 2.5"]["value"] == 4.82

    def test_winner_total_combo_swapped(self):
        markets = {
            "moou": [2.5, [["a,over", 6.42], ["h,under", 4.82]]],
        }
        result = convert_bia_markets(markets, swapped=True)
        assert result is not None
        assert result["WinnerTotalCombo"]["Home & Over 2.5"]["value"] == 6.42
        assert result["WinnerTotalCombo"]["Away & Under 2.5"]["value"] == 4.82

    def test_winner_total_combo_prefers_standard_2_5_line_when_bia_sends_alts(self):
        markets = {
            "moou": [
                [1.5, [["a,over", 5.419], ["h,under", 10.329]]],
                [2.5, [["a,over", 7.677], ["d,under", 9.052], ["h,under", 6.695]]],
                [3.5, [["a,over", 12.784], ["h,under", 3.209]]],
            ],
        }
        result = convert_bia_markets(markets, swapped=False)
        assert result is not None
        assert set(result["WinnerTotalCombo"]) == {
            "Away & Over 2.5",
            "Draw & Under 2.5",
            "Home & Under 2.5",
        }
        assert result["WinnerTotalCombo"]["Away & Over 2.5"]["value"] == 7.677
        assert result["WinnerTotalCombo"]["Draw & Under 2.5"]["value"] == 9.052
        assert result["WinnerTotalCombo"]["Home & Under 2.5"]["value"] == 6.695


# ── build_bia_game_update ───────────────────────────────────────────────────

class TestBuildBiaGameUpdate:
    def test_builds_partial_game(self):
        period_data = {
            "Number": 0,
            "Win1x2": {"Win1": {"value": 2.5}, "Draw": {"value": 3.2}, "Win2": {"value": 2.8}},
        }
        existing = {
            "Pid": 1001,
            "Periods": [{"Number": 0, "Handicap": {"0.5": {"Win1": {"value": 1.85}}}}],
        }
        result = build_bia_game_update(1001, period_data, existing)
        assert result["Pid"] == 1001
        assert len(result["Periods"]) == 1
        assert "Win1x2" in result["Periods"][0]

    def test_extends_periods_for_higher_index(self):
        period_data = {"Number": 1, "Win1x2": {"Win1": {"value": 2.5}}}
        existing = {"Pid": 1001, "Periods": [{"Number": 0}]}
        result = build_bia_game_update(1001, period_data, existing)
        assert len(result["Periods"]) == 2
        assert result["Periods"][0] == {}  # untouched
        assert "Win1x2" in result["Periods"][1]
