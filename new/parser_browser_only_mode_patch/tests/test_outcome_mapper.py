"""Тесты для outcome_mapper.py — маппинг строки исхода → параметры PS3838 betslip."""
from services.outcome_mapper import outcome_to_ps3838, is_standard_market


# ── Game winners (1G/2G) ──────────────────────────────────────────────────

class TestGameWinners:
    def test_p3_1g_11(self):
        """P3 1G 11 → Player 1 wins Game 11 in Set 3."""
        r = outcome_to_ps3838("P3 1G 11")
        assert r["market"] == "standard"
        assert r["bet_type"] == 1
        assert r["team_select"] == 0
        assert r["period"] == 3
        assert r["game_number"] == 11

    def test_p3_2g_5(self):
        """P3 2G 5 → Player 2 wins Game 5 in Set 3."""
        r = outcome_to_ps3838("P3 2G 5")
        assert r["market"] == "standard"
        assert r["bet_type"] == 1
        assert r["team_select"] == 1
        assert r["period"] == 3
        assert r["game_number"] == 5

    def test_1g_1_no_period(self):
        """1G 1 → Player 1 wins Game 1, no period prefix → period 0."""
        r = outcome_to_ps3838("1G 1")
        assert r["market"] == "standard"
        assert r["bet_type"] == 1
        assert r["team_select"] == 0
        assert r["period"] == 0
        assert r["game_number"] == 1

    def test_p1_2g_13(self):
        """P1 2G 13 → Player 2 wins Game 13 in Set 1."""
        r = outcome_to_ps3838("P1 2G 13")
        assert r["market"] == "standard"
        assert r["bet_type"] == 1
        assert r["team_select"] == 1
        assert r["period"] == 1
        assert r["game_number"] == 13

    def test_game_winner_is_standard(self):
        """Game winners must be standard markets (not special)."""
        r = outcome_to_ps3838("P3 1G 11")
        assert is_standard_market(r)


# ── Standard markets (regression) ─────────────────────────────────────────

class TestStandardMarketsRegression:
    def test_moneyline_home(self):
        r = outcome_to_ps3838("1")
        assert r == {"market": "standard", "bet_type": 1, "team_select": 0, "handicap": 0, "period": 0, "is_alt": 0}

    def test_moneyline_away(self):
        r = outcome_to_ps3838("2")
        assert r["bet_type"] == 1 and r["team_select"] == 1

    def test_moneyline_home_away_aliases(self):
        assert outcome_to_ps3838("Home")["team_select"] == 0
        assert outcome_to_ps3838("Away")["team_select"] == 1

    def test_handicap_h1(self):
        r = outcome_to_ps3838("H1 -1.5")
        assert r["market"] == "standard"
        assert r["bet_type"] == 2
        assert r["handicap"] == -1.5

    def test_total_over(self):
        r = outcome_to_ps3838("T> 2.5")
        assert r["bet_type"] == 3 and r["team_select"] == 3

    def test_period_prefix(self):
        r = outcome_to_ps3838("P2 T< 3.5")
        assert r["period"] == 2 and r["bet_type"] == 3 and r["team_select"] == 4


# ── Special markets (regression) ──────────────────────────────────────────

class TestSpecialMarketsRegression:
    def test_btts(self):
        r = outcome_to_ps3838("BTTS Yes")
        assert r["market"] == "special"
        assert r["special_type"] == "btts"

    def test_dnb_home_uses_special_lookup(self):
        r = outcome_to_ps3838("DNB 1")
        assert r["market"] == "special"
        assert r["special_type"] == "draw_no_bet"
        assert r["contestant"] == "Home"
        assert not is_standard_market(r)

    def test_dnb_away_uses_special_lookup(self):
        r = outcome_to_ps3838("DNB 2")
        assert r["market"] == "special"
        assert r["special_type"] == "draw_no_bet"
        assert r["contestant"] == "Away"
        assert not is_standard_market(r)

    def test_sets_handicap(self):
        r = outcome_to_ps3838("Sets H1 -1.5")
        assert r["market"] == "special"
        assert r["special_type"] == "sets_handicap"
        assert not is_standard_market(r)
