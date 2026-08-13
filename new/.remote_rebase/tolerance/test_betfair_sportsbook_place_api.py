import unittest
from unittest.mock import AsyncMock

from betfair_sportsbook_place_api import (
    BetfairSportsbookPlaceApiClient,
    BetfairSportsbookPlaceApiConfig,
)


class BetfairSportsbookPlaceApiClientTests(unittest.TestCase):
    def test_worker_calls_honor_configured_timeout_without_proxy(self):
        config = BetfairSportsbookPlaceApiConfig(
            worker_url="http://127.0.0.1:8898",
            proxy_url="http://proxy.invalid:8080",
            timeout_sec=27.5,
        )
        kwargs = BetfairSportsbookPlaceApiClient(config)._worker_client_kwargs()
        self.assertEqual(kwargs["timeout"], 27.5)
        self.assertNotIn("proxy", kwargs)


    def test_browser_fingerprint_versions_are_consistent(self):
        headers = BetfairSportsbookPlaceApiClient._headers("session=test")
        self.assertIn("Chrome/147.0.0.0", headers["user-agent"])
        self.assertIn('"Chromium";v="147"', headers["sec-ch-ua"])


class BetfairSportsbookPrepareTests(unittest.IsolatedAsyncioTestCase):
    async def test_prepare_validates_coupon_without_calling_place(self):
        client = BetfairSportsbookPlaceApiClient(BetfairSportsbookPlaceApiConfig())
        client.fetch_session_cookie = AsyncMock(return_value="session=test")
        client.imply_bets = AsyncMock(return_value={
            "bet_reference": "coupon",
            "odds": 2.2,
            "min_stake": 0.11,
            "max_stake": 3.91,
        })
        client.place_bet = AsyncMock()

        result = await client.prepare(
            market_id="924.1",
            selection_id="42",
            stake=1.0,
            expected_odds=2.2,
        )

        self.assertEqual(result["status"], "BETSLIP_READY_REQUESTS")
        self.assertTrue(result["coupon_validated"])
        self.assertTrue(result["submit_blocked"])
        client.place_bet.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
