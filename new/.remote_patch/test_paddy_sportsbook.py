from __future__ import annotations

import unittest

import paddy_sportsbook as pp


def runner(name: str, odds: float, *, selection_id: int, handicap: float = 0, result: str = "", status: str = "ACTIVE"):
    return {
        "selectionId": selection_id,
        "runnerName": name,
        "handicap": handicap,
        "result": {"type": result} if result else {},
        "runnerStatus": status,
        "winRunnerOdds": {"trueOdds": {"decimalOdds": {"decimalOdds": odds}}},
    }


def market(market_id: str, name: str, market_type: str, runners: list[dict], status: str = "OPEN"):
    return {
        "marketId": market_id,
        "marketName": name,
        "marketType": market_type,
        "marketStatus": status,
        "runners": runners,
    }


def snapshot(event_id: str, event_name: str, markets: list[dict]):
    return {
        "attachments": {
            "events": {event_id: {"eventId": int(event_id), "name": event_name}},
            "markets": {item["marketId"]: item for item in markets},
        }
    }


class PaddySportsbookPureTests(unittest.TestCase):
    def base_arb(self, **updates):
        value = {
            "market": "Moneyline",
            "match": "Сапфо Сакеллариди vs Мириана Тона",
            "home": "Сапфо Сакеллариди",
            "away": "Мириана Тона",
            "team1_en": "Sapfo Sakellaridi",
            "team2_en": "Miriana Tona",
            "bk2_selection": "Away",
            "bk2_odds": 2.625,
            "bk2": "paddypower.com",
            "bk2_raw_link": "https://www.paddypower.com/tennis/x/match-35818011?tab=all-markets",
            "pinnacle_market_metadata": {"family": "Moneyline"},
        }
        value.update(updates)
        return value

    def test_identifies_paddy_and_not_exchange(self):
        self.assertTrue(pp.is_sportsbook_fork(self.base_arb()))
        self.assertTrue(pp.is_sportsbook_fork({"bk2_url": "https://www.betfair.com/sport/football/x"}))
        self.assertFalse(pp.is_sportsbook_fork({"bk2_url": "https://www.betfair.com/exchange/plus/market/1.2"}))

    def test_extracts_paddy_event_id(self):
        self.assertEqual(pp.extract_event_id(self.base_arb()), "35818011")

    def test_moneyline_returns_current_price_not_expected_price(self):
        arb = self.base_arb(bk2_odds=2.625)
        data = snapshot("35818011", "Sapfo Sakellaridi v Miriana Tona", [
            market("m1", "Match Odds", "MATCH_ODDS", [
                runner("Sapfo Sakellaridi", 1.5, selection_id=1, result="HOME"),
                runner("Miriana Tona", 2.75, selection_id=2, result="AWAY"),
            ])
        ])
        result = pp.resolve_quote_from_snapshot(arb, "35818011", data)
        self.assertTrue(result["verified"])
        self.assertEqual(result["current_odds"], 2.75)

    def test_total_matches_line_direction_and_rejects_other_same_price(self):
        arb = self.base_arb(
            market="Totals", bk2_selection="Under (21,5)",
            pinnacle_market_metadata={"family": "Totals", "line": "21.5"},
        )
        data = snapshot("35818011", "Sapfo Sakellaridi v Miriana Tona", [
            market("m1", "Total Match Games 21.5", "TOTAL_MATCH_GAMES", [
                runner("Over 21.5", 1.8, selection_id=1), runner("Under 21.5", 2.1, selection_id=2),
            ]),
            market("m2", "Set 1 Total Games Over/Under 8.5", "SET_1_TOTAL_GAMES_OVER/UNDER_8.5", [
                runner("Over 8.5", 2.1, selection_id=3), runner("Under 8.5", 1.7, selection_id=4),
            ]),
        ])
        result = pp.resolve_quote_from_snapshot(arb, "35818011", data)
        self.assertTrue(result["verified"])
        self.assertEqual(result["market_id"], "m1")
        self.assertEqual(result["current_odds"], 2.1)

    def test_total_selection_preserves_line_stored_only_as_handicap(self):
        arb = self.base_arb(
            market="Totals", bk2_selection="Under (93,5)",
            pinnacle_market_metadata={"family": "Totals", "line": "93.5"},
        )
        data = snapshot("35818011", "Sapfo Sakellaridi v Miriana Tona", [
            market("m1", "Total Points", "TOTAL_POINTS", [
                runner("Over", 1.8, selection_id=1, handicap=93.5),
                runner("Under", 2.0, selection_id=2, handicap=93.5),
            ]),
        ])
        result = pp.resolve_quote_from_snapshot(arb, "35818011", data)
        self.assertTrue(result["verified"])
        self.assertEqual(result["selection"], "Under")
        self.assertEqual(result["selection_label"], "Under (93.5)")

    def test_match_total_is_not_misclassified_as_matt_player_total(self):
        arb = self.base_arb(
            market="Totals",
            match="Мэтт Халм vs Джошуа Чарльтон",
            home="Мэтт Халм",
            away="Джошуа Чарльтон",
            team1_en="Matt Hulme",
            team2_en="Joshua Charlton",
            bk2_selection="Over (21,5)",
            pinnacle_market_metadata={"family": "Totals", "line": "22"},
        )
        data = snapshot("35818011", "Matt Hulme v Joshua Charlton", [
            market("total", "Match Total Games", "MATCH_TOTAL_GAMES", [
                runner("Over 21.5", 2.0, selection_id=1),
                runner("Under 21.5", 1.72, selection_id=2),
            ]),
        ])
        result = pp.resolve_quote_from_snapshot(arb, "35818011", data)
        self.assertTrue(result["verified"])
        self.assertEqual(result["selection_id"], 1)

    def test_set_total_requires_exact_set(self):
        arb = self.base_arb(
            market="Totals", bk2_selection="Over (12,5)", set_number=1,
            pinnacle_market_metadata={"family": "Totals", "line": "12.5", "set_number": 1},
        )
        data = snapshot("35818011", "Sapfo Sakellaridi v Miriana Tona", [
            market("set1", "Set 1 Total Games Over/Under 12.5", "SET_1_TOTAL_GAMES_OVER/UNDER_12.5", [
                runner("Over 12.5", 5.0, selection_id=1), runner("Under 12.5", 1.05, selection_id=2),
            ]),
            market("set2", "Set 2 Total Games Over/Under 12.5", "SET_2_TOTAL_GAMES_OVER/UNDER_12.5", [
                runner("Over 12.5", 4.5, selection_id=3), runner("Under 12.5", 1.08, selection_id=4),
            ]),
        ])
        result = pp.resolve_quote_from_snapshot(arb, "35818011", data)
        self.assertTrue(result["verified"])
        self.assertEqual(result["market_id"], "set1")

    def test_individual_total_maps_canonical_team_to_paddy_order(self):
        arb = self.base_arb(
            market="Totals", match="Ференцварош vs Войводина", home="Ференцварош", away="Войводина",
            team1_en="Vojvodina", team2_en="Ferencvaros", bk2_selection="ИТ2М(0,5)",
            pinnacle_market_metadata={"family": "Totals", "team": "2", "line": "0.5"},
        )
        data = snapshot("35809032", "Vojvodina v Ferencvaros", [
            market("home", "Home Team Over/Under 0.5 Goals", "HOME_TEAM_OVER/UNDER_0.5_GOALS", [
                runner("Over 0.5", 1.2, selection_id=1), runner("Under 0.5", 3.5, selection_id=2),
            ]),
            market("away", "Away Team Over/Under 0.5 Goals", "AWAY_TEAM_OVER/UNDER_0.5_GOALS", [
                runner("Over 0.5", 1.4, selection_id=3), runner("Under 0.5", 2.75, selection_id=4),
            ]),
        ])
        result = pp.resolve_quote_from_snapshot(arb, "35809032", data)
        self.assertTrue(result["verified"])
        self.assertEqual(result["market_id"], "home")

    def test_three_way_handicap_maps_transliterated_reversed_event(self):
        arb = self.base_arb(
            market="Handicap", match="Гарабах vs Вестри", home="Гарабах", away="Вестри",
            team1_en="IF Vestri", team2_en="Qarabag Fk", bk2_selection="1(0:3)",
            pinnacle_market_metadata={"family": "Handicap", "team": "2", "line": "3.5"},
        )
        data = snapshot("35808966", "IF Vestri v Qarabag FK", [
            market("hcap", "Handicap Betting", "HANDICAP_BETTING", [
                runner("IF Vestri", 1.5, selection_id=1, handicap=3, result="HOME"),
                runner("Handicap Draw", 4.0, selection_id=2, handicap=-3),
                runner("Qarabag Fk", 2.9, selection_id=3, handicap=-3, result="AWAY"),
            ])
        ])
        result = pp.resolve_quote_from_snapshot(arb, "35808966", data)
        self.assertTrue(result["verified"])
        self.assertEqual(result["selection_id"], 3)
        self.assertEqual(result["current_odds"], 2.9)

    def test_first_set_small_line_maps_to_set_game_handicap(self):
        arb = self.base_arb(
            sport="Tennis",
            market="Handicap",
            match="Даниил Глинка vs Филип Секулич",
            home="Даниил Глинка",
            away="Филип Секулич",
            team1_en="Daniil Glinka",
            team2_en="Philip Sekulic",
            bk2_selection="Handicap 1 (-1,5)",
            set_number=1,
            pinnacle_market_metadata={
                "family": "Handicap", "team": "2", "line": "1.5",
                "set_number": 1, "period_type": "set",
            },
        )
        data = snapshot("35823884", "Glinka v Phi Sekulic", [
            market("game", "Set 1 Game Handicap -1.5", "SET_X_GAME_HANDICAP", [
                runner("Daniil Glinka (-1.5)", 2.1, selection_id=1),
                runner("Philip Sekulic (+1.5)", 1.6666666667, selection_id=2),
            ]),
            market("sets", "Set Handicap -1.5", "SET_HANDICAP_TW", [
                runner("Daniil Glinka (-1.5)", 2.5, selection_id=3),
                runner("Philip Sekulic (+1.5)", 1.5, selection_id=4),
            ]),
        ])
        result = pp.resolve_quote_from_snapshot(arb, "35823884", data)
        self.assertTrue(result["verified"])
        self.assertEqual(result["market_id"], "game")
        self.assertEqual(result["selection_id"], 1)
        self.assertEqual(result["current_odds"], 2.1)

    def test_double_chance_matches_exact_pair(self):
        arb = self.base_arb(bk2_selection="1X")
        data = snapshot("35818011", "Sapfo Sakellaridi v Miriana Tona", [
            market("dc", "Double Chance", "DOUBLE_CHANCE", [
                runner("Sapfo Sakellaridi And Draw", 1.3, selection_id=1),
                runner("Miriana Tona And Draw", 1.8, selection_id=2),
                runner("Sapfo Sakellaridi And Miriana Tona", 1.1, selection_id=3),
            ])
        ])
        result = pp.resolve_quote_from_snapshot(arb, "35818011", data)
        self.assertTrue(result["verified"])
        self.assertEqual(result["selection_id"], 1)

    def test_bare_away_counter_to_handicap_is_resolved_as_moneyline(self):
        arb = self.base_arb(
            market="Handicap", match="Коннектикут Сан vs Портленд Файр",
            home="Коннектикут Сан", away="Портленд Файр", team1_en="Portland Fire",
            team2_en="Connecticut Sun", bk2_selection="Away",
            bk2_raw_link="https://www.paddypower.com/basketball/wnba/x-35816154",
            pinnacle_market_metadata={"family": "Handicap", "team": "1", "line": "1"},
        )
        data = snapshot("35816154", "Portland Fire @ Connecticut Sun", [
            market("money", "Match Betting", "MATCH_ODDS", [
                runner("Portland Fire", 2.05, selection_id=1, result="HOME"),
                runner("Connecticut Sun", 1.72, selection_id=2, result="AWAY"),
            ])
        ])
        result = pp.resolve_quote_from_snapshot(arb, "35816154", data)
        self.assertTrue(result["verified"])
        self.assertEqual(result["selection_id"], 1)

    def test_prefers_two_way_total_over_three_way_variant(self):
        arb = self.base_arb(
            market="Totals", bk2_selection="Under (8,5)", set_number=1,
            pinnacle_market_metadata={"family": "Totals", "line": "8.5", "set_number": 1},
        )
        data = snapshot("35818011", "Sapfo Sakellaridi v Miriana Tona", [
            market("two", "Set 1 Total Games Over/Under 8.5", "SET_1_TOTAL_GAMES_OVER/UNDER_8.5", [
                runner("Over 8.5", 1.44, selection_id=1), runner("Under 8.5", 2.625, selection_id=2),
            ]),
            market("three", "Set 1 Total Games 3 Way", "SET_X_TOTAL_GAMES_3-WAY", [
                runner("Under 8.5", 2.5, selection_id=3),
            ]),
        ])
        result = pp.resolve_quote_from_snapshot(arb, "35818011", data)
        self.assertTrue(result["verified"])
        self.assertEqual(result["market_id"], "two")

    def test_plain_total_rejects_compound_same_line_markets(self):
        arb = self.base_arb(
            market="Totals", bk2_selection="Under (1,5)",
            pinnacle_market_metadata={"family": "Totals", "line": "1.5"},
        )
        data = snapshot("35818011", "Sapfo Sakellaridi v Miriana Tona", [
            market("plain", "Over/Under 1.5 Goals", "OVER_UNDER_15", [
                runner("Over 1.5 Goals", 1.4, selection_id=1),
                runner("Under 1.5 Goals", 2.75, selection_id=2),
            ]),
            market("wdw", "WDW & O/U 1.5 Goals", "WDW_AND_OVER_UNDER_15", [
                runner("Draw And Under 1.5", 5.0, selection_id=3),
            ]),
            market("btts", "Both Teams To Score & O/U 1.5 Goals", "BTTS_AND_OVER_UNDER_15", [
                runner("No & Under 1.5", 3.2, selection_id=4),
            ]),
            market("double", "Moneyline/Total Points Double 1.5", "TOTAL_POINTS_DOUBLE", [
                runner("Away & Under 1.5", 4.0, selection_id=5),
            ]),
        ])
        result = pp.resolve_quote_from_snapshot(arb, "35818011", data)
        self.assertTrue(result["verified"])
        self.assertEqual(result["market_id"], "plain")

    def test_referrer_url_is_ascii_encoded(self):
        value = pp._ascii_header_url("https://example.test/max-alcalà-gurrií")
        self.assertTrue(value.isascii())
        self.assertIn("%C3%A0", value)

    def test_suspended_exact_runner_is_not_verified(self):
        arb = self.base_arb()
        data = snapshot("35818011", "Sapfo Sakellaridi v Miriana Tona", [
            market("m1", "Match Odds", "MATCH_ODDS", [
                runner("Sapfo Sakellaridi", 1.5, selection_id=1, result="HOME"),
                runner("Miriana Tona", 2.75, selection_id=2, result="AWAY", status="SUSPENDED"),
            ])
        ])
        result = pp.resolve_quote_from_snapshot(arb, "35818011", data)
        self.assertFalse(result["verified"])
        self.assertEqual(result["status"], "SUSPENDED")


if __name__ == "__main__":
    unittest.main()
