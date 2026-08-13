import asyncio
import json
import unittest

import httpx

import betfair_sportsbook_place_api as api


# Real implyBets response, captured live on dev (ps38-dev, 2026-07-15) via a
# safe read-only implyBets call against the actual Betfair Sportsbook API
# (implyBets never spends money). betReference below is a real one-time
# token that was never used for a placeBet -- it is dead/expired by design.
REAL_IMPLY_BETS_RESPONSE = {
    "betCombinations": [
        {
            "legCombinations": [
                {
                    "runners": [{"marketId": "924.528239251", "selectionId": 60116755}],
                    "outcomes": [],
                    "legType": "SIMPLE_SELECTION",
                }
            ],
            "canPlaceEachwayBet": False,
            "numLines": 1,
            "betMinStake": 0.11,
            "betMaxStake": 1.72,
            "averageOdds": 2.0,
            "winAverageOdds": 2.0,
            "winAvgOdds": {
                "trueOdds": {"decimalOdds": {"decimalOdds": 2.0}},
                "decimalDisplayOdds": {"decimalOdds": 2.0},
            },
            "betReference": (
                "XpuyBYnh5Fj2mN3PU1qPEJ1tU9IJtiVyy0qvrMbaudefR3sSxTMlRJeBtBqQZwWV1/"
                "z5zPm/xH1o0xyxtCdMAbTthfroY6u3YahmMtxga+4="
            ),
            "betType": "SINGLE",
        }
    ],
    "runnerOdds": [],
    "betFailures": [],
    "legFailures": [],
    "respCode": "SUCCESS",
}

# Real getMarketPrices response, same live dev capture.
REAL_MARKET_PRICES_RESPONSE = [
    {
        "marketId": "924.528239251",
        "inplay": False,
        "runnerDetails": [
            {
                "selectionId": 60116755,
                "runnerOdds": {"trueOdds": {"decimalOdds": {"decimalOdds": 2.0}}},
                "runnerStatus": "ACTIVE",
            }
        ],
    }
]

# Real placeBet(dryRun=true) response, same live dev capture -- rejected
# because the replayed session cookie had gone stale by the time of the
# write call (AC-1's whole point: fetch a *fresh* cookie right before use).
# Still a genuine, live-verified example of Betfair's clean-rejection shape.
REAL_PLACE_BET_ACCESS_DENIED_RESPONSE = {"respCode": "ACCESS_DENIED"}


def _handler_for(imply=None, market_prices=None, place=None, session_cookie="ok-cookie=1"):
    async def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if request.url.path == "/session-cookies":
            return httpx.Response(200, json={"ok": True, "cookie": session_cookie})
        if "implyBets" in url:
            return await imply(request)
        if "getMarketPrices" in url:
            return await market_prices(request)
        if "placeBet" in url:
            return await place(request)
        raise AssertionError(f"unexpected request: {url}")

    return handler


class PriceToleranceDefaultTests(unittest.TestCase):
    """The API and browser paths use the same one-cent price tolerance."""

    def test_dataclass_default_is_0_01(self):
        config = api.BetfairSportsbookPlaceApiConfig()
        self.assertEqual(config.price_tolerance, 0.01)

    def test_from_env_default_is_0_01_when_unset(self):
        import os
        from unittest.mock import patch

        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ROBINARB_BETFAIR_ODDS_TOLERANCE", None)
            config = api.BetfairSportsbookPlaceApiConfig.from_env()
        self.assertEqual(config.price_tolerance, 0.01)


class PayloadBuildTests(unittest.TestCase):
    def test_build_imply_bets_payload_matches_captured_contract(self):
        payload = api.build_imply_bets_payload(market_id="924.528239251", selection_id=60116755)
        self.assertEqual(
            payload,
            {
                "betLegs": [
                    {
                        "betRunners": [{"runner": {"marketId": "924.528239251", "selectionId": 60116755}}],
                        "legType": "SIMPLE_SELECTION",
                        "isBoostedLeg": False,
                    }
                ]
            },
        )

    def test_build_imply_bets_payload_accepts_string_selection_id(self):
        payload = api.build_imply_bets_payload(market_id="1.2", selection_id="60116755")
        self.assertEqual(payload["betLegs"][0]["betRunners"][0]["runner"]["selectionId"], 60116755)

    def test_build_imply_bets_payload_rejects_non_numeric_selection_id(self):
        with self.assertRaises(api.BetfairSportsbookPlaceApiError) as ctx:
            api.build_imply_bets_payload(market_id="1.2", selection_id="abc")
        self.assertEqual(ctx.exception.code, api.IMPLY_FAILED)

    def test_build_imply_bets_payload_rejects_missing_market_id(self):
        with self.assertRaises(api.BetfairSportsbookPlaceApiError):
            api.build_imply_bets_payload(market_id="", selection_id=1)

    def test_build_market_prices_payload(self):
        payload = api.build_market_prices_payload(market_ids=["924.528239251", "", "1.2"])
        self.assertEqual(payload, {"marketIds": ["924.528239251", "1.2"]})

    def test_build_place_bet_payload_matches_captured_contract(self):
        payload = api.build_place_bet_payload(
            market_id="924.528239251",
            selection_id=60116755,
            stake=1,
            expected_odds=2,
            bet_reference="ref-token",
            customer_ref="00000001784080504816",
            dry_run=False,
        )
        self.assertEqual(payload["betDefinitions"][0]["betReference"], "ref-token")
        self.assertEqual(payload["betDefinitions"][0]["stakePerLine"], 1.0)
        self.assertEqual(
            payload["betDefinitions"][0]["legs"][0]["winExpectedOdds"]["decimalOdds"]["decimalOdds"], 2.0
        )
        self.assertFalse(payload["dryRun"])
        self.assertEqual(payload["customerRef"], "00000001784080504816")
        self.assertEqual(payload["walletAllocationType"], "WALLET_CONSTRAINTS")
        self.assertFalse(payload["useAvailableBonus"])

    def test_build_place_bet_payload_default_accept_lower_odds_is_false(self):
        """Story 2.2b fix-1 (P1, money-safety): acceptLowerOdds must default
        to False -- a bare True has no lower bound and lets Betfair fill at
        any price below the requested one while still reporting the stale
        pre-placement quote as the fill price.
        """
        payload = api.build_place_bet_payload(
            market_id="1.2", selection_id=1, stake=1, expected_odds=2,
            bet_reference="ref", customer_ref="cr", dry_run=True,
        )
        self.assertFalse(payload["acceptLowerOdds"])

    def test_build_place_bet_payload_has_no_accept_lower_odds_override(self):
        """Story 2.2b fix-2 (P2): the invariant "acceptLowerOdds is never
        true" must be enforced by the function signature itself, not just by
        every current call site happening to pass False -- build_place_bet_payload
        must not accept an accept_lower_odds keyword at all any more.
        """
        with self.assertRaises(TypeError):
            api.build_place_bet_payload(
                market_id="1.2", selection_id=1, stake=1, expected_odds=2,
                bet_reference="ref", customer_ref="cr", dry_run=True,
                accept_lower_odds=True,
            )

    def test_place_bet_has_no_accept_lower_odds_override(self):
        """Story 2.2b fix-2 (P2): same invariant on place_bet() itself."""
        with self.assertRaises(TypeError):
            asyncio.run(
                api.BetfairSportsbookPlaceApiClient(
                    transport=httpx.MockTransport(lambda request: httpx.Response(200, json={}))
                ).place_bet(
                    cookie="c", market_id="1.2", selection_id=1, stake=1, expected_odds=2,
                    bet_reference="ref", customer_ref="cr", dry_run=True,
                    accept_lower_odds=True,
                )
            )

    def test_build_place_bet_payload_dry_run_flag(self):
        payload = api.build_place_bet_payload(
            market_id="1.2",
            selection_id=1,
            stake=1,
            expected_odds=2,
            bet_reference="ref",
            customer_ref="cr",
            dry_run=True,
        )
        self.assertTrue(payload["dryRun"])

    def test_build_place_bet_payload_rejects_invalid_stake(self):
        with self.assertRaises(api.BetfairSportsbookPlaceApiError):
            api.build_place_bet_payload(
                market_id="1.2", selection_id=1, stake=0, expected_odds=2,
                bet_reference="ref", customer_ref="cr", dry_run=True,
            )

    def test_build_place_bet_payload_rejects_invalid_odds(self):
        with self.assertRaises(api.BetfairSportsbookPlaceApiError):
            api.build_place_bet_payload(
                market_id="1.2", selection_id=1, stake=1, expected_odds=1,
                bet_reference="ref", customer_ref="cr", dry_run=True,
            )

    def test_build_place_bet_payload_rejects_missing_bet_reference(self):
        with self.assertRaises(api.BetfairSportsbookPlaceApiError):
            api.build_place_bet_payload(
                market_id="1.2", selection_id=1, stake=1, expected_odds=2,
                bet_reference="", customer_ref="cr", dry_run=True,
            )


class CustomerRefTests(unittest.TestCase):
    def test_format(self):
        ref = api.build_customer_ref(now_us=1784080504816)
        self.assertEqual(ref, "00000001784080504816")
        self.assertEqual(len(ref), 20)

    def test_monotonic_uniqueness_within_same_microsecond(self):
        first = api.build_customer_ref(now_us=1000)
        second = api.build_customer_ref(now_us=1000)
        self.assertNotEqual(first, second)

    def test_series_is_unique(self):
        refs = {api.build_customer_ref() for _ in range(20)}
        self.assertEqual(len(refs), 20)


class ImplyBetsParsingTests(unittest.TestCase):
    def test_parses_bet_reference_and_odds_from_real_response(self):
        async def imply(request):
            return httpx.Response(200, json=REAL_IMPLY_BETS_RESPONSE)

        client = api.BetfairSportsbookPlaceApiClient(
            transport=httpx.MockTransport(_handler_for(imply=imply))
        )
        result = asyncio.run(client.imply_bets(cookie="c=1", market_id="924.528239251", selection_id=60116755))
        self.assertEqual(result["bet_reference"], REAL_IMPLY_BETS_RESPONSE["betCombinations"][0]["betReference"])
        self.assertEqual(result["odds"], 2.0)
        self.assertEqual(result["min_stake"], 0.11)
        self.assertEqual(result["max_stake"], 1.72)

    def test_leg_failure_raises_imply_failed(self):
        async def imply(request):
            return httpx.Response(200, json={"respCode": "SUCCESS", "legFailures": ["SUSPENDED"], "betCombinations": []})

        client = api.BetfairSportsbookPlaceApiClient(transport=httpx.MockTransport(_handler_for(imply=imply)))
        with self.assertRaises(api.BetfairSportsbookPlaceApiError) as ctx:
            asyncio.run(client.imply_bets(cookie="c=1", market_id="1.2", selection_id=1))
        self.assertEqual(ctx.exception.code, api.IMPLY_FAILED)

    def test_missing_bet_combinations_raises_imply_failed(self):
        async def imply(request):
            return httpx.Response(200, json={"respCode": "SUCCESS", "betCombinations": []})

        client = api.BetfairSportsbookPlaceApiClient(transport=httpx.MockTransport(_handler_for(imply=imply)))
        with self.assertRaises(api.BetfairSportsbookPlaceApiError) as ctx:
            asyncio.run(client.imply_bets(cookie="c=1", market_id="1.2", selection_id=1))
        self.assertEqual(ctx.exception.code, api.IMPLY_FAILED)

    def test_non_success_resp_code_raises_imply_failed(self):
        async def imply(request):
            return httpx.Response(200, json={"respCode": "MARKET_CLOSED"})

        client = api.BetfairSportsbookPlaceApiClient(transport=httpx.MockTransport(_handler_for(imply=imply)))
        with self.assertRaises(api.BetfairSportsbookPlaceApiError) as ctx:
            asyncio.run(client.imply_bets(cookie="c=1", market_id="1.2", selection_id=1))
        self.assertEqual(ctx.exception.code, api.IMPLY_FAILED)

    def test_network_failure_raises_imply_network_failed_not_imply_failed(self):
        """Story 2.2 fix-1 (P2): implyBets is the pre-stake stage -- no money
        has moved yet -- so a transport-level failure (connect refused,
        timeout, or any other exception raised while constructing the client
        / sending the request) must be distinguishable from a structured
        Betfair rejection (IMPLY_FAILED) so the caller can safely fall back
        to the browser worker instead of surfacing a clean 422 reject.
        """
        async def imply(request):
            raise httpx.ConnectError("refused", request=request)

        client = api.BetfairSportsbookPlaceApiClient(transport=httpx.MockTransport(_handler_for(imply=imply)))
        with self.assertRaises(api.BetfairSportsbookPlaceApiError) as ctx:
            asyncio.run(client.imply_bets(cookie="c=1", market_id="1.2", selection_id=1))
        self.assertEqual(ctx.exception.code, api.IMPLY_NETWORK_FAILED)


class MarketPricesParsingTests(unittest.TestCase):
    def test_parses_first_market_from_real_response(self):
        async def market_prices(request):
            return httpx.Response(200, json=REAL_MARKET_PRICES_RESPONSE)

        client = api.BetfairSportsbookPlaceApiClient(
            transport=httpx.MockTransport(_handler_for(market_prices=market_prices))
        )
        result = asyncio.run(client.get_market_prices(cookie="c=1", market_id="924.528239251"))
        self.assertEqual(result["runnerDetails"][0]["runnerStatus"], "ACTIVE")

    def test_empty_list_returns_none(self):
        async def market_prices(request):
            return httpx.Response(200, json=[])

        client = api.BetfairSportsbookPlaceApiClient(
            transport=httpx.MockTransport(_handler_for(market_prices=market_prices))
        )
        result = asyncio.run(client.get_market_prices(cookie="c=1", market_id="924.528239251"))
        self.assertIsNone(result)


class SessionCookieTests(unittest.TestCase):
    def test_fetch_session_cookie_success(self):
        async def handler(request):
            return httpx.Response(200, json={"ok": True, "cookie": "a=1; b=2"})

        client = api.BetfairSportsbookPlaceApiClient(transport=httpx.MockTransport(handler))
        cookie = asyncio.run(client.fetch_session_cookie())
        self.assertEqual(cookie, "a=1; b=2")

    def test_fetch_session_cookie_worker_reports_unavailable(self):
        async def handler(request):
            return httpx.Response(409, json={"ok": False, "status": "SESSION_UNAVAILABLE", "detail": "no session"})

        client = api.BetfairSportsbookPlaceApiClient(transport=httpx.MockTransport(handler))
        with self.assertRaises(api.BetfairSportsbookPlaceApiError) as ctx:
            asyncio.run(client.fetch_session_cookie())
        self.assertEqual(ctx.exception.code, api.SESSION_UNAVAILABLE)

    def test_fetch_session_cookie_transport_failure(self):
        async def handler(request):
            raise httpx.ConnectError("refused", request=request)

        client = api.BetfairSportsbookPlaceApiClient(transport=httpx.MockTransport(handler))
        with self.assertRaises(api.BetfairSportsbookPlaceApiError) as ctx:
            asyncio.run(client.fetch_session_cookie())
        self.assertEqual(ctx.exception.code, api.SESSION_UNAVAILABLE)

    def test_fetch_session_cookie_empty_cookie_is_unavailable(self):
        async def handler(request):
            return httpx.Response(200, json={"ok": True, "cookie": ""})

        client = api.BetfairSportsbookPlaceApiClient(transport=httpx.MockTransport(handler))
        with self.assertRaises(api.BetfairSportsbookPlaceApiError) as ctx:
            asyncio.run(client.fetch_session_cookie())
        self.assertEqual(ctx.exception.code, api.SESSION_UNAVAILABLE)


class PlaceOutcomeTests(unittest.TestCase):
    def _client(self, *, imply_json=REAL_IMPLY_BETS_RESPONSE, place_response):
        async def imply(request):
            return httpx.Response(200, json=imply_json)

        handler = _handler_for(imply=imply, place=place_response)
        return api.BetfairSportsbookPlaceApiClient(transport=httpx.MockTransport(handler))

    def test_dry_run_success_returns_dry_run_ok(self):
        seen_body = {}

        async def place(request):
            seen_body["json"] = json.loads(request.content)
            return httpx.Response(200, json={"respCode": "SUCCESS", "betId": "123"})

        client = self._client(place_response=place)
        result = asyncio.run(
            client.place(market_id="924.528239251", selection_id=60116755, stake=1, expected_odds=2.0, dry_run=True)
        )
        self.assertTrue(seen_body["json"]["dryRun"])
        self.assertEqual(result["status"], "DRY_RUN_OK")
        self.assertEqual(result["order_id"], "123")
        # betReference is one-time and must never surface in full in the result.
        real_bet_reference = REAL_IMPLY_BETS_RESPONSE["betCombinations"][0]["betReference"]
        self.assertNotIn(real_bet_reference, result.values())
        self.assertEqual(result["bet_reference_len"], len(real_bet_reference))

    def test_real_place_success_returns_bet_placed(self):
        async def place(request):
            return httpx.Response(200, json={"respCode": "SUCCESS", "betId": "456"})

        client = self._client(place_response=place)
        result = asyncio.run(
            client.place(market_id="924.528239251", selection_id=60116755, stake=1, expected_odds=2.0, dry_run=False)
        )
        self.assertEqual(result["status"], "BET_PLACED")
        self.assertEqual(result["order_id"], "456")

    def test_dry_run_missing_bet_id_falls_back_to_generated_order_id(self):
        """Betfair's own dryRun sandbox validates without spending money and
        does not always echo an ID back -- a synthetic order_id is safe only
        for dry_run=True (no real placement happened either way).
        """
        async def place(request):
            return httpx.Response(200, json={"respCode": "SUCCESS"})

        client = self._client(place_response=place)
        result = asyncio.run(
            client.place(market_id="924.528239251", selection_id=60116755, stake=1, expected_odds=2.0, dry_run=True)
        )
        self.assertTrue(result["order_id"].startswith("bf-api-"))

    def test_real_place_missing_bet_id_raises_place_indeterminate(self):
        """Story 2.2b fix-1 (P1): a live placement (dry_run=False) whose
        respCode is SUCCESS but carries no real betId/betReceiptId/orderId is
        NOT distinguishable from a bet that silently failed to register --
        this must never be reported as BET_PLACED with a fabricated ID
        (bf-api-<customer_ref>); it must raise PLACE_INDETERMINATE so the
        caller holds the stake for reconciliation instead of refunding it.
        """
        async def place(request):
            return httpx.Response(200, json={"respCode": "SUCCESS"})

        client = self._client(place_response=place)
        with self.assertRaises(api.BetfairSportsbookPlaceApiError) as ctx:
            asyncio.run(
                client.place(
                    market_id="924.528239251", selection_id=60116755, stake=1, expected_odds=2.0, dry_run=False
                )
            )
        self.assertEqual(ctx.exception.code, api.PLACE_INDETERMINATE)

    def test_real_place_runner_failure_code_raises_place_indeterminate(self):
        """Story 2.2b fix-1 (P1): an overall SUCCESS envelope can still carry
        a per-runner failureCode (result[].runners[].failureCode) -- that is
        not proof the bet went through as requested.
        """
        async def place(request):
            return httpx.Response(
                200,
                json={
                    "respCode": "SUCCESS",
                    "betId": "789",
                    "result": [{"runners": [{"failureCode": "RUNNER_REMOVED"}]}],
                },
            )

        client = self._client(place_response=place)
        with self.assertRaises(api.BetfairSportsbookPlaceApiError) as ctx:
            asyncio.run(
                client.place(
                    market_id="924.528239251", selection_id=60116755, stake=1, expected_odds=2.0, dry_run=False
                )
            )
        self.assertEqual(ctx.exception.code, api.PLACE_INDETERMINATE)

    def test_access_denied_response_raises_place_rejected(self):
        # Live-verified shape: HTTP 200 with a clean structured rejection.
        async def place(request):
            return httpx.Response(200, json=REAL_PLACE_BET_ACCESS_DENIED_RESPONSE)

        client = self._client(place_response=place)
        with self.assertRaises(api.BetfairSportsbookPlaceApiError) as ctx:
            asyncio.run(
                client.place(
                    market_id="924.528239251", selection_id=60116755, stake=1, expected_odds=2.0, dry_run=True
                )
            )
        self.assertEqual(ctx.exception.code, api.PLACE_REJECTED)

    def test_network_error_after_send_raises_place_indeterminate(self):
        async def place(request):
            raise httpx.ReadTimeout("timed out", request=request)

        client = self._client(place_response=place)
        with self.assertRaises(api.BetfairSportsbookPlaceApiError) as ctx:
            asyncio.run(
                client.place(
                    market_id="924.528239251", selection_id=60116755, stake=1, expected_odds=2.0, dry_run=False
                )
            )
        self.assertEqual(ctx.exception.code, api.PLACE_INDETERMINATE)

    def test_server_error_raises_place_indeterminate(self):
        async def place(request):
            return httpx.Response(502, json={"error": "upstream"})

        client = self._client(place_response=place)
        with self.assertRaises(api.BetfairSportsbookPlaceApiError) as ctx:
            asyncio.run(
                client.place(
                    market_id="924.528239251", selection_id=60116755, stake=1, expected_odds=2.0, dry_run=False
                )
            )
        self.assertEqual(ctx.exception.code, api.PLACE_INDETERMINATE)

    def test_price_changed_blocks_place_bet_call(self):
        place_called = False

        async def place(request):
            nonlocal place_called
            place_called = True
            return httpx.Response(200, json={"respCode": "SUCCESS", "betId": "1"})

        client = self._client(place_response=place)
        with self.assertRaises(api.BetfairSportsbookPlaceApiError) as ctx:
            asyncio.run(
                client.place(
                    market_id="924.528239251", selection_id=60116755, stake=1, expected_odds=2.5, dry_run=True
                )
            )
        self.assertEqual(ctx.exception.code, api.PRICE_CHANGED)
        self.assertFalse(place_called, "placeBet must not be called once the price mismatches")

    def test_price_within_tolerance_proceeds_to_place_bet(self):
        async def place(request):
            return httpx.Response(200, json={"respCode": "SUCCESS", "betId": "1"})

        client = self._client(place_response=place)
        # implyBets odds is 2.0; display rounding inside one cent is accepted.
        result = asyncio.run(
            client.place(
                market_id="924.528239251", selection_id=60116755, stake=1, expected_odds=2.0005, dry_run=True
            )
        )
        self.assertEqual(result["status"], "DRY_RUN_OK")

    def test_price_drift_within_one_cent_tolerance_proceeds(self):
        place_called = False

        async def place(request):
            nonlocal place_called
            place_called = True
            return httpx.Response(200, json={"respCode": "SUCCESS", "betId": "1"})

        client = self._client(place_response=place)
        result = asyncio.run(
            client.place(
                market_id="924.528239251", selection_id=60116755, stake=1, expected_odds=2.005, dry_run=True
            )
        )
        self.assertEqual(result["status"], "DRY_RUN_OK")
        self.assertTrue(place_called)

    def test_price_drift_above_one_cent_is_rejected(self):
        place_called = False

        async def place(request):
            nonlocal place_called
            place_called = True
            return httpx.Response(200, json={"respCode": "SUCCESS", "betId": "1"})

        client = self._client(place_response=place)
        with self.assertRaises(api.BetfairSportsbookPlaceApiError) as ctx:
            asyncio.run(
                client.place(
                    market_id="924.528239251", selection_id=60116755, stake=1, expected_odds=2.011, dry_run=True
                )
            )
        self.assertEqual(ctx.exception.code, api.PRICE_CHANGED)
        self.assertFalse(place_called)


class RequestedPriceNotAvailableRetryTests(unittest.TestCase):
    """Story 2.2b fix-1 (P1): acceptLowerOdds=false rejects cleanly with
    REQUESTED_PRICE_NOT_AVAILABLE when the price ticks down between
    implyBets and placeBet -- place() must retry the FULL cycle (fresh
    implyBets -> fresh one-time betReference -> placeBet), bounded, never a
    bare retry of the same placeBet body.
    """

    def test_retries_full_cycle_with_fresh_bet_reference_then_succeeds(self):
        imply_calls = []
        place_calls = []

        async def imply(request):
            imply_calls.append(1)
            body = json.loads(json.dumps(REAL_IMPLY_BETS_RESPONSE))
            body["betCombinations"][0]["betReference"] = f"ref-{len(imply_calls)}"
            return httpx.Response(200, json=body)

        async def place(request):
            place_calls.append(json.loads(request.content))
            if len(place_calls) == 1:
                return httpx.Response(200, json={"respCode": "REQUESTED_PRICE_NOT_AVAILABLE"})
            return httpx.Response(200, json={"respCode": "SUCCESS", "betId": "999"})

        handler = _handler_for(imply=imply, place=place)
        client = api.BetfairSportsbookPlaceApiClient(transport=httpx.MockTransport(handler))
        result = asyncio.run(
            client.place(market_id="924.528239251", selection_id=60116755, stake=1, expected_odds=2.0, dry_run=False)
        )
        self.assertEqual(result["status"], "BET_PLACED")
        self.assertEqual(result["order_id"], "999")
        self.assertEqual(len(imply_calls), 2, "must re-run implyBets for a fresh betReference on retry")
        self.assertEqual(len(place_calls), 2)
        self.assertNotEqual(
            place_calls[0]["betDefinitions"][0]["betReference"],
            place_calls[1]["betDefinitions"][0]["betReference"],
            "retry must never reuse the same one-time betReference",
        )
        self.assertFalse(place_calls[0]["acceptLowerOdds"])
        self.assertFalse(place_calls[1]["acceptLowerOdds"])

    def test_exhausts_bounded_retries_and_raises_requested_price_not_available(self):
        async def imply(request):
            return httpx.Response(200, json=REAL_IMPLY_BETS_RESPONSE)

        place_calls = []

        async def place(request):
            place_calls.append(1)
            return httpx.Response(200, json={"respCode": "REQUESTED_PRICE_NOT_AVAILABLE"})

        handler = _handler_for(imply=imply, place=place)
        client = api.BetfairSportsbookPlaceApiClient(transport=httpx.MockTransport(handler))
        with self.assertRaises(api.BetfairSportsbookPlaceApiError) as ctx:
            asyncio.run(
                client.place(
                    market_id="924.528239251", selection_id=60116755, stake=1, expected_odds=2.0, dry_run=False
                )
            )
        self.assertEqual(ctx.exception.code, api.REQUESTED_PRICE_NOT_AVAILABLE)
        self.assertEqual(len(place_calls), api.MAX_PRICE_RETRIES + 1)


class ExecutedOddsReconciliationTests(unittest.TestCase):
    """Story 2.2b fix-1 (P1): the bet is already live once placeBet returns
    SUCCESS -- a fill worse than the pre-placement quote must not raise, it
    must flag reconciliation_required and report the REAL fill price parsed
    from the placeBet response, not the stale implyBets quote.
    """

    def _client(self, *, place_json):
        async def imply(request):
            return httpx.Response(200, json=REAL_IMPLY_BETS_RESPONSE)

        async def place(request):
            return httpx.Response(200, json=place_json)

        return api.BetfairSportsbookPlaceApiClient(
            transport=httpx.MockTransport(_handler_for(imply=imply, place=place))
        )

    def test_divergent_fill_sets_reconciliation_and_real_price(self):
        client = self._client(
            place_json={
                "respCode": "SUCCESS",
                "betId": "555",
                "result": [{"runners": [{"odds": {"trueOdds": {"decimalOdds": {"decimalOdds": 1.9}}}}]}],
            }
        )
        result = asyncio.run(
            client.place(market_id="924.528239251", selection_id=60116755, stake=1, expected_odds=2.0, dry_run=False)
        )
        self.assertEqual(result["status"], "BET_PLACED")
        self.assertTrue(result["reconciliation_required"])
        self.assertEqual(result["odds"], 1.9)
        self.assertEqual(result["expected_odds"], 2.0)

    def test_fill_within_tolerance_no_reconciliation(self):
        client = self._client(
            place_json={
                "respCode": "SUCCESS",
                "betId": "556",
                "result": [{"runners": [{"odds": {"trueOdds": {"decimalOdds": {"decimalOdds": 2.0005}}}}]}],
            }
        )
        result = asyncio.run(
            client.place(market_id="924.528239251", selection_id=60116755, stake=1, expected_odds=2.0, dry_run=False)
        )
        self.assertNotIn("reconciliation_required", result)
        self.assertEqual(result["odds"], 2.0005)

    def test_missing_executed_odds_flags_reconciliation_and_does_not_imply_fill(self):
        """Story 2.2b fix-2 (P1, money-critical): SUCCESS with a real betId
        but no parseable executed-odds field must NOT report the
        pre-placement implyBets quote as if it were the real fill -- that
        silently hides a possible negative arb. Must flag
        reconciliation_required=True and report odds as unknown (None), not
        the stale quote.
        """
        client = self._client(place_json={"respCode": "SUCCESS", "betId": "557"})
        result = asyncio.run(
            client.place(market_id="924.528239251", selection_id=60116755, stake=1, expected_odds=2.0, dry_run=False)
        )
        self.assertTrue(result["reconciliation_required"])
        self.assertIsNone(result["odds"])

    def test_dry_run_never_flags_reconciliation_even_on_divergent_response(self):
        """dryRun never places real money -- a divergent-looking response
        shape (Betfair's own sandbox echo) must never mark reconciliation."""
        client = self._client(
            place_json={
                "respCode": "SUCCESS",
                "betId": "558",
                "result": [{"runners": [{"odds": {"trueOdds": {"decimalOdds": {"decimalOdds": 1.5}}}}]}],
            }
        )
        result = asyncio.run(
            client.place(market_id="924.528239251", selection_id=60116755, stake=1, expected_odds=2.0, dry_run=True)
        )
        self.assertNotIn("reconciliation_required", result)


if __name__ == "__main__":
    unittest.main()
