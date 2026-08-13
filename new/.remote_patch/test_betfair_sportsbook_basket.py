import unittest

from betfair_sportsbook_basket import (
    BetfairSportsbookBasketError,
    build_prepare_payload,
)


class BetfairSportsbookBasketTests(unittest.TestCase):
    def test_builds_dry_run_sportsbook_payload(self):
        payload = build_prepare_payload(
            arb={"id": "arb-1", "market": "Match Odds"},
            quote={
                "market_id": "924.123",
                "selection_id": 24,
                "market_name": "Match Odds",
                "selection": "France",
                "current_odds": 2.4,
            },
            event_url="https://www.betfair.com/betting/football/world-cup/france-v-spain/e-35811169",
            stake=1,
        )
        self.assertTrue(payload["dry_run"])
        self.assertEqual(payload["market_id"], "924.123")
        self.assertEqual(payload["selection_id"], "24")
        self.assertEqual(payload["stake"], 1.0)

    def test_rejects_exchange_url(self):
        with self.assertRaises(BetfairSportsbookBasketError):
            build_prepare_payload(
                arb={"id": "arb-1"},
                quote={
                    "market_id": "1.123",
                    "selection_id": 24,
                    "market_name": "Match Odds",
                    "selection": "France",
                    "current_odds": 2.4,
                },
                event_url="https://www.betfair.com/exchange/plus/en/market/1.123",
                stake=1,
            )

    def test_prefers_exact_line_label_for_browser_fallback(self):
        payload = build_prepare_payload(
            arb={"id": "arb-total", "market": "Totals", "bk2_selection": "Under (93,5)"},
            quote={
                "market_id": "927.392265299",
                "selection_id": 7017824,
                "market_name": "1st Half Total Points",
                "selection": "Under",
                "selection_label": "Under (93.5)",
                "current_odds": 2.0,
            },
            event_url="https://www.betfair.com/betting/basketball/new-zealand-nbl/a-v-b/e-35820361",
            stake=1,
        )
        self.assertEqual(payload["selection"], "Under (93.5)")


if __name__ == "__main__":
    unittest.main()
