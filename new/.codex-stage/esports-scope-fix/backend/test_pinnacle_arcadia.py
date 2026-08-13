from __future__ import annotations

import time
import unittest

import pinnacle_arcadia as pa


def matchup(matchup_id: int, home: str = "Home FC", away: str = "Away FC") -> dict:
    return {
        "id": matchup_id,
        "participants": [{"name": home}, {"name": away}],
        "isLive": False,
        "startTime": "2026-07-14T12:00:00Z",
    }


def market(matchup_id: int, *, market_type: str, period: int, prices: list[dict], side: str | None = None) -> dict:
    return {
        "matchupId": matchup_id,
        "type": market_type,
        "period": period,
        "status": "open",
        "side": side,
        "prices": prices,
        "isAlternate": True,
        "key": f"{market_type}-{period}",
    }


class PinnacleArcadiaTests(unittest.TestCase):
    def cache(self, matchups: list[dict], markets: list[dict]) -> pa.ArcadiaCache:
        value = pa.ArcadiaCache(ttl=60)
        by_matchup: dict[int, list[dict]] = {}
        for row in markets:
            by_matchup.setdefault(int(row["matchupId"]), []).append(row)
        entry = {"ts": time.time(), "matchups": matchups, "markets_by_matchup": by_matchup}
        value._cache[33] = entry
        for row in matchups:
            value._event_cache[int(row["id"])] = entry
        return value

    def test_exact_handicap_sign_and_line_are_required(self):
        event = matchup(123)
        data = self.cache([event], [market(123, market_type="spread", period=0, prices=[
            {"designation": "away", "points": -1.5, "price": 159},
            {"designation": "away", "points": 1.5, "price": -108},
        ])])

        result = pa.lookup_pinnacle(
            "Tennis", "Home FC", "Away FC", "Handicap", "",
            raw_selection="Ф2(1,5)", matchup_id=123, cache=data,
        )

        self.assertIsNotNone(result)
        self.assertEqual(result["points"], 1.5)
        self.assertAlmostEqual(result["decimal_odds"], 1.9259, places=4)

    def test_exact_matchup_id_does_not_require_guessing_broad_combat_sport(self):
        event = matchup(123, home="Fighter One", away="Fighter Two")
        data = self.cache([event], [market(123, market_type="moneyline", period=0, prices=[
            {"designation": "home", "price": -120},
            {"designation": "away", "price": 110},
        ])])

        result = pa.lookup_pinnacle(
            "Combat Sports", "Fighter One", "Fighter Two", "Moneyline", "",
            raw_selection="П2", matchup_id=123, cache=data,
        )

        self.assertIsNotNone(result)
        self.assertEqual(result["matchup_id"], 123)
        self.assertEqual(result["designation"], "away")

    def test_common_forted_selection_taxonomy_parses_to_exact_coordinates(self):
        cases = {
            "П1": ("moneyline", "home", None),
            "П2": ("moneyline", "away", None),
            "X": ("moneyline", "draw", None),
            "Ф1(-1,5)": ("spread", "home", -1.5),
            "H2 +1.5": ("spread", "away", 1.5),
            "ТБ(2,5)": ("total", "over", 2.5),
            "Under 2.5": ("total", "under", 2.5),
            "IT1> 105.5": ("team_total", "over", 105.5),
            "ИТ1М(105,5)": ("team_total", "under", 105.5),
            "ИТ2Б(83)": ("team_total", "over", 83.0),
            "IT2< 85.5": ("team_total", "under", 85.5),
        }
        for raw, (market_type, designation, line) in cases.items():
            with self.subTest(raw=raw):
                parsed = pa.parse_raw_selection(raw)
                self.assertEqual(parsed["market_type"], market_type)
                self.assertEqual(parsed["designation"], designation)
                self.assertEqual(parsed["line"], line)

        for raw in ("1X", "X2", "12", "0:0", "К1 пройдёт"):
            with self.subTest(unsupported_standard_market=raw):
                self.assertIsNone(pa.parse_raw_selection(raw)["market_type"])

    def test_all_standard_market_sides_resolve_by_structure(self):
        event = matchup(123)
        moneyline = market(123, market_type="moneyline", period=0, prices=[
            {"designation": "home", "price": -120},
            {"designation": "away", "price": 130},
            {"designation": "draw", "price": 240},
        ])
        moneyline["key"] = "ml-0"
        spread = market(123, market_type="spread", period=0, prices=[
            {"designation": "home", "points": -1.5, "price": 110},
            {"designation": "away", "points": 1.5, "price": -125},
        ])
        spread["key"] = "spread-1.5"
        total = market(123, market_type="total", period=0, prices=[
            {"designation": "over", "points": 2.5, "price": -105},
            {"designation": "under", "points": 2.5, "price": -110},
        ])
        total["key"] = "total-2.5"
        home_total = market(123, market_type="team_total", period=0, side="home", prices=[
            {"designation": "over", "points": 1.5, "price": 102},
            {"designation": "under", "points": 1.5, "price": -118},
        ])
        home_total["key"] = "home-total-1.5"
        away_total = market(123, market_type="team_total", period=0, side="away", prices=[
            {"designation": "over", "points": 0.5, "price": -115},
            {"designation": "under", "points": 0.5, "price": 101},
        ])
        away_total["key"] = "away-total-0.5"
        data = self.cache([event], [moneyline, spread, total, home_total, away_total])
        cases = (
            ("П1", "ml-0", "home", None),
            ("П2", "ml-0", "away", None),
            ("X", "ml-0", "draw", None),
            ("Ф1(-1,5)", "spread-1.5", "home", -1.5),
            ("Ф2(1,5)", "spread-1.5", "away", 1.5),
            ("ТБ(2,5)", "total-2.5", "over", 2.5),
            ("ТМ(2,5)", "total-2.5", "under", 2.5),
            ("ИТ1Б(1,5)", "home-total-1.5", "over", 1.5),
            ("ИТ1М(1,5)", "home-total-1.5", "under", 1.5),
            ("ИТ2Б(0,5)", "away-total-0.5", "over", 0.5),
            ("ИТ2М(0,5)", "away-total-0.5", "under", 0.5),
        )
        for raw, expected_key, designation, points in cases:
            with self.subTest(raw=raw):
                result = pa.lookup_pinnacle(
                    "Soccer", "Home FC", "Away FC", "", "",
                    raw_selection=raw, matchup_id=123, cache=data,
                )
                self.assertIsNotNone(result)
                self.assertEqual(result["market_key"], expected_key)
                self.assertEqual(result["designation"], designation)
                self.assertEqual(result["points"], points)

    def test_missing_exact_line_does_not_fall_back_to_another_line(self):
        event = matchup(123)
        data = self.cache([event], [market(123, market_type="total", period=0, prices=[
            {"designation": "over", "points": 22.5, "price": -110},
        ])])

        result = pa.lookup_pinnacle(
            "Tennis", "Home FC", "Away FC", "Totals", "",
            raw_selection="ТБ(21,5)", matchup_id=123, cache=data,
        )

        self.assertIsNone(result)

    def test_reversed_participants_keep_the_real_selected_team(self):
        event = matchup(123, home="Dominika Salkova", away="Alevtina Ibragimova")
        data = self.cache([event], [market(123, market_type="moneyline", period=0, prices=[
            {"designation": "home", "price": -124},
            {"designation": "away", "price": 123},
        ])])

        result = pa.lookup_pinnacle(
            "Tennis", "Alevtina Ibragimova", "Dominika Salkova", "Moneyline", "",
            raw_selection="П2", matchup_id=123, cache=data,
        )

        self.assertIsNotNone(result)
        self.assertTrue(result["reversed"])
        self.assertEqual(result["designation"], "home")
        self.assertAlmostEqual(result["decimal_odds"], 1.8065, places=4)
        expected_margin = (
            1 / pa._american_to_decimal(-124)
            + 1 / pa._american_to_decimal(123)
            - 1
        )
        self.assertAlmostEqual(result["market_margin"], expected_margin, places=8)

    def test_infers_unique_nonzero_period_without_using_expected_price(self):
        event = matchup(123)
        data = self.cache([event], [market(123, market_type="total", period=1, prices=[
            {"designation": "over", "points": 1.5, "price": -145},
        ])])

        result = pa.lookup_pinnacle(
            "Soccer", "Home FC", "Away FC", "Totals", "",
            raw_selection="ТБ(1,5)", matchup_id=123, cache=data,
        )

        self.assertIsNotNone(result)
        self.assertEqual(result["period"], 1)
        self.assertTrue(result["period_inferred"])
        self.assertAlmostEqual(result["decimal_odds"], 1.6897, places=4)

    def test_explicit_period_does_not_infer_another_period(self):
        event = matchup(123)
        data = self.cache([event], [market(123, market_type="total", period=1, prices=[
            {"designation": "over", "points": 1.5, "price": -145},
        ])])

        result = pa.lookup_pinnacle(
            "Soccer", "Home FC", "Away FC", "Totals", "",
            raw_selection="ТБ(1,5)", matchup_id=123, cache=data,
            period=0, period_explicit=True,
        )

        self.assertIsNone(result)

    def test_esports_map_moneyline_does_not_reuse_match_moneyline(self):
        event = matchup(123, home="MiBR", away="Fluxo W7M")
        match_moneyline = market(123, market_type="moneyline", period=0, prices=[
            {"designation": "away", "price": 231},
        ])
        match_moneyline["key"] = "s;0;m"
        map_one_moneyline = market(123, market_type="moneyline", period=1, prices=[
            {"designation": "away", "price": 184},
        ])
        map_one_moneyline["key"] = "s;1;m"
        data = self.cache([event], [match_moneyline, map_one_moneyline])

        result = pa.lookup_pinnacle(
            "Esports", "MiBR", "Fluxo W7M", "Moneyline", "Win2",
            raw_selection="П2", matchup_id=123, cache=data,
            period=1, period_explicit=True,
        )

        self.assertIsNotNone(result)
        self.assertEqual(result["period"], 1)
        self.assertEqual(result["market_key"], "s;1;m")
        self.assertAlmostEqual(result["decimal_odds"], 2.84, places=4)

    def test_explicit_tennis_set_period_selects_set_moneyline(self):
        event = matchup(123, home="Player One", away="Player Two")
        data = self.cache([event], [
            market(123, market_type="moneyline", period=0, prices=[
                {"designation": "away", "price": 121},
            ]),
            market(123, market_type="moneyline", period=1, prices=[
                {"designation": "away", "price": -127},
            ]),
        ])

        result = pa.lookup_pinnacle(
            "Tennis", "Player One", "Player Two", "Moneyline", "",
            raw_selection="П2", matchup_id=123, cache=data,
            period=1, period_explicit=True,
        )

        self.assertIsNotNone(result)
        self.assertEqual(result["period"], 1)
        self.assertFalse(result["period_inferred"])
        self.assertAlmostEqual(result["decimal_odds"], 1.7874, places=4)

    def test_tennis_scope_resolves_same_handicap_without_price_matching(self):
        root = matchup(123, home="Zsombor Piros", away="Max Hans Rehberg")
        games = matchup(124, home="Zsombor Piros (Games)", away="Max Hans Rehberg (Games)")
        root_market = market(123, market_type="spread", period=0, prices=[
            {"designation": "away", "points": 1.5, "price": -133},
            {"designation": "home", "points": -1.5, "price": 117},
        ])
        root_market["key"] = "sets-spread-1.5"
        games_market = market(124, market_type="spread", period=0, prices=[
            {"designation": "away", "points": 1.5, "price": 103},
            {"designation": "home", "points": -1.5, "price": -119},
        ])
        games_market["key"] = "games-spread-1.5"
        data = self.cache([root, games], [root_market, games_market])

        sets_result = pa.lookup_pinnacle(
            "Tennis", "Zsombor Piros", "Max Hans Rehberg", "Handicap", "",
            raw_selection="Ф2(1,5)", matchup_id=123, market_scope="sets", cache=data,
        )
        games_result = pa.lookup_pinnacle(
            "Tennis", "Zsombor Piros", "Max Hans Rehberg", "Handicap", "",
            raw_selection="Ф2(1,5)", matchup_id=123, market_scope="games", cache=data,
        )

        self.assertEqual(sets_result["matchup_id"], 123)
        self.assertEqual(sets_result["market_key"], "sets-spread-1.5")
        self.assertAlmostEqual(sets_result["decimal_odds"], 1.7519, places=4)
        self.assertEqual(games_result["matchup_id"], 124)
        self.assertEqual(games_result["market_key"], "games-spread-1.5")
        self.assertAlmostEqual(games_result["decimal_odds"], 2.03, places=4)

    def test_duplicate_structural_market_keys_fail_closed(self):
        event = matchup(123)
        first = market(123, market_type="spread", period=0, prices=[
            {"designation": "away", "points": 1.5, "price": -133},
        ])
        first["key"] = "spread-a"
        second = market(123, market_type="spread", period=0, prices=[
            {"designation": "away", "points": 1.5, "price": 103},
        ])
        second["key"] = "spread-b"
        data = self.cache([event], [first, second])

        result = pa.lookup_pinnacle(
            "Tennis", "Home FC", "Away FC", "Handicap", "",
            raw_selection="Ф2(1,5)", matchup_id=123, market_scope="sets", cache=data,
        )

        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
