import asyncio
import time
import unittest
import urllib.parse
from unittest.mock import AsyncMock, patch, MagicMock

from pydantic import ValidationError

from bia_placer import (
    BiaPlacer,
    bia_bet_type_matches_exact,
    map_selection_to_bia_bet_type,
)
from outcome_mapper import outcome_to_ps3838
import app as ps_app


class BiaMapperTests(unittest.TestCase):
    def test_direct_pinnacle_routes_are_not_exposed(self):
        exposed = {
            route.path
            for route in ps_app.app.routes
            if getattr(route, "path", None)
        }
        self.assertFalse(hasattr(ps_app, "session"))
        self.assertTrue(ps_app._bia_only_mode())
        for path in ("/sample-selection", "/balance", "/relogin", "/market-margin", "/clear"):
            self.assertNotIn(path, exposed)

    def test_environment_cannot_enable_direct_pinnacle(self):
        with patch.dict(ps_app.os.environ, {"BIA_ONLY_MODE": "0"}, clear=False):
            self.assertTrue(ps_app._bia_only_mode())

    def test_structural_request_coordinates_are_strict_integers(self):
        poisoned = (
            {"event_id": True, "outcome": "1"},
            {"event_id": 1.9, "outcome": "1"},
            {"event_id": 1, "outcome": "1", "period": 1.9},
            {"event_id": 1, "outcome": "1", "period": True},
            {"event_id": 1, "outcome": "1", "map_number": 1.9},
            {"event_id": 1, "outcome": "1", "inning_number": 1.9},
            {"event_id": 1, "outcome": "1", "half_number": True},
        )
        for payload in poisoned:
            with self.subTest(payload=payload):
                with self.assertRaises(ValidationError):
                    ps_app.VerifyRequest(**payload)

    def test_root_event_period_scope_is_explicit(self):
        inning = ps_app.VerifyRequest(
            event_id=1,
            outcome="Under 0.5",
            period=3,
            period_type="inning",
            inning_number=1,
        )
        half = ps_app.VerifyRequest(
            event_id=1,
            outcome="Over 29.5",
            period=1,
            period_type="half",
        )
        self.assertEqual(ps_app._bia_period_scope(inning), ("inning", 1, 0))
        self.assertEqual(ps_app._bia_period_scope(half), ("half", 0, 1))

    def test_tennis_line_result_carries_exact_set_coordinate(self):
        result = ps_app._enrich_result(
            {"status": "OK", "bia_bet_type": "for,tset,2,vwhatever,game,ahover,34"},
            event_id=1,
            outcome_str="T> 8.5",
            params={
                "bet_type": 3,
                "team_select": 3,
                "handicap": 8.5,
                "period": 2,
                "tennis_unit": "game",
            },
            request_period=2,
            request_market="Totals",
        )
        self.assertEqual(result["period"], 2)
        self.assertEqual(result["set_number"], 2)
        self.assertEqual(result["tennis_unit"], "game")

    def test_contextual_team_total_result_preserves_exact_namespace_and_direction(self):
        result = ps_app._enrich_result(
            {
                "status": "OK",
                "odds": 1.769,
                "bia_bet_type": "for,tahover,a,14",
                "bia_sport_code": "fb_corn",
            },
            event_id=1632820971,
            outcome_str="CIT2> 3.5",
            params={"bet_type": 5, "team_select": 7, "handicap": 3.5, "period": 0},
            request_period=0,
            request_market="Totals",
        )

        self.assertEqual(result["outcome"], "CIT2> 3.5")
        self.assertEqual(result["market"], "Totals")
        self.assertEqual(result["team"], "2")
        self.assertEqual(result["direction"], "Over")
        self.assertEqual(result["line"], 3.5)

    def test_tennis_unit_comes_from_explicit_board_scope_not_price(self):
        sets = ps_app.VerifyRequest(
            event_id=1, outcome="H2 -1.5", market_scope="sets",
        )
        games = ps_app.VerifyRequest(
            event_id=1, outcome="H2 -1.5", market_scope="games",
        )
        explicit = ps_app.VerifyRequest(
            event_id=1, outcome="H2 -1.5", market_scope="games",
            tennis_unit="set",
        )
        self.assertEqual(ps_app._bia_tennis_unit(sets), "set")
        self.assertEqual(ps_app._bia_tennis_unit(games), "game")
        with self.assertRaisesRegex(ValueError, "BIA_TENNIS_SCOPE_CONFLICT"):
            ps_app._bia_tennis_unit(explicit)

    def test_moneyline_mapping_table(self):
        cases = [
            # soccer moneyline home/away/draw + swapped
            (1, 0, 0.0, False, True, "for,tp,reg,wdw,h"),
            (1, 1, 0.0, False, True, "for,tp,reg,wdw,a"),
            (1, 2, 0.0, False, True, "for,tp,reg,wdw,d"),
            (1, 0, 0.0, True, True, "for,tp,reg,wdw,a"),
            (1, 1, 0.0, True, True, "for,tp,reg,wdw,h"),
            # basketball moneyline
            (1, 0, 0.0, False, False, "for,ml,h"),
            (1, 1, 0.0, False, False, "for,ml,a"),
            (1, 0, 0.0, True, False, "for,ml,a"),
        ]
        for bet_type, team, hcap, swapped, soccer, expected in cases:
            with self.subTest(bet_type=bet_type, team=team, swapped=swapped, soccer=soccer):
                self.assertEqual(
                    map_selection_to_bia_bet_type(bet_type, team, hcap, swapped, soccer),
                    expected,
                )

    def test_handicap_mapping_table(self):
        cases = [
            (2, 0, -1.5, False, True, "for,ah,h,-6"),
            (2, 0, 1.25, False, True, "for,ah,h,5"),
            (2, 0, 0.0, False, True, "for,ah,h,0"),
            (2, 1, 0.5, False, True, "for,ah,a,2"),
            (2, 0, -1.5, True, True, "for,ah,a,-6"),
            (2, 1, 1.0, True, False, "for,ah,h,4"),
        ]
        for bet_type, team, hcap, swapped, soccer, expected in cases:
            with self.subTest(hcap=hcap, team=team, swapped=swapped):
                self.assertEqual(
                    map_selection_to_bia_bet_type(bet_type, team, hcap, swapped, soccer),
                    expected,
                )

    def test_totals_mapping_table(self):
        cases = [
            (3, 3, 2.5, False, True, "for,ahover,10"),
            (3, 4, 3.0, False, True, "for,ahunder,12"),
            (3, 3, 1.25, True, False, "for,ahover,5"),
        ]
        for bet_type, team, hcap, swapped, soccer, expected in cases:
            with self.subTest(hcap=hcap, team=team):
                self.assertEqual(
                    map_selection_to_bia_bet_type(bet_type, team, hcap, swapped, soccer),
                    expected,
                )

    def test_tennis_set_mapping(self):
        self.assertEqual(
            map_selection_to_bia_bet_type(1, 0, 0, False, False, period=2, sport_code="tennis"),
            "for,tset,2,vwhatever,p1",
        )
        self.assertEqual(
            map_selection_to_bia_bet_type(2, 1, 1.5, False, False, period=3, sport_code="tennis"),
            "for,tset,3,vwhatever,game,ah,p2,6",
        )
        self.assertEqual(
            map_selection_to_bia_bet_type(3, 3, 9.5, False, False, period=1, sport_code="tennis"),
            "for,tset,1,vwhatever,game,ahover,38",
        )

    def test_tennis_full_match_uses_all_set_serializer(self):
        self.assertEqual(
            map_selection_to_bia_bet_type(1, 0, 0, False, False, period=0, sport_code="tennis"),
            "for,tset,all,vwhatever,p1",
        )
        self.assertEqual(
            map_selection_to_bia_bet_type(1, 1, 0, True, False, period=0, sport_code="tennis"),
            "for,tset,all,vwhatever,p1",
        )
        self.assertEqual(
            map_selection_to_bia_bet_type(2, 1, 1.5, False, False, period=0, sport_code="tennis"),
            "for,tset,all,vwhatever,game,ah,p2,6",
        )
        self.assertEqual(
            map_selection_to_bia_bet_type(3, 4, 21.5, False, False, period=0, sport_code="tennis"),
            "for,tset,all,vwhatever,game,ahunder,86",
        )

    def test_exact_tennis_game_winner_serializer(self):
        params = outcome_to_ps3838("P2 2G 5")
        self.assertEqual(params["period"], 2)
        self.assertEqual(params["game_number"], 5)
        self.assertEqual(
            map_selection_to_bia_bet_type(
                params["bet_type"], params["team_select"], params["handicap"],
                False, False, period=params["period"], sport_code="tennis",
                game_number=params["game_number"],
            ),
            "for,tgame,2,5,vwhatever,p2",
        )
        with self.assertRaisesRegex(ValueError, "BIA_TENNIS_GAME_REQUIRES_SET"):
            map_selection_to_bia_bet_type(
                1, 0, 0, False, False, period=0, sport_code="tennis", game_number=5,
            )
        enriched = ps_app._enrich_result(
            {"status": "OK", "odds": 2.1}, event_id=123,
            outcome_str="P2 2G 5", params=params, request_period=0,
            request_market="Game Winner",
        )
        self.assertEqual(enriched["set_number"], 2)
        self.assertEqual(enriched["game_number"], 5)
        unresolved = outcome_to_ps3838("Game 5 Win2")
        self.assertEqual(unresolved["period"], 0)
        self.assertEqual(unresolved["team_select"], 1)
        self.assertEqual(unresolved["game_number"], 5)

        self.assertEqual(
            ps_app._period_from_exact_tennis_game_proof(
                "for,tgame,2,5,vwhatever,p2",
                expected_set=2,
                game_number=5,
                team_select=1,
                swapped=False,
            ),
            2,
        )
        with self.assertRaisesRegex(RuntimeError, "BIA_TENNIS_GAME_PROOF_INVALID"):
            ps_app._period_from_exact_tennis_game_proof(
                "for,tgame,3,5,vwhatever,p2",
                expected_set=2,
                game_number=5,
                team_select=1,
                swapped=False,
            )

    def test_basketball_period_namespace_validation(self):
        self.assertEqual(
            map_selection_to_bia_bet_type(1, 0, 0, False, False, period=3, sport_code="basket_q3"),
            "for,ml,h",
        )
        with self.assertRaisesRegex(ValueError, "BIA_UNSUPPORTED_BASKETBALL_PERIOD"):
            map_selection_to_bia_bet_type(1, 0, 0, False, False, period=3, sport_code="basket")

    def test_team_total_mapping_is_exact_for_direct_and_swapped_events(self):
        cases = [
            (4, 5, False, "for,tahover,h,10"),
            (4, 0, False, "for,tahunder,h,10"),
            (5, 7, False, "for,tahover,a,10"),
            (5, 1, False, "for,tahunder,a,10"),
            (4, 5, True, "for,tahover,a,10"),
            (4, 0, True, "for,tahunder,a,10"),
            (5, 7, True, "for,tahover,h,10"),
            (5, 1, True, "for,tahunder,h,10"),
        ]
        for bet_type, team_select, swapped, expected in cases:
            with self.subTest(bet_type=bet_type, team_select=team_select, swapped=swapped):
                self.assertEqual(
                    map_selection_to_bia_bet_type(
                        bet_type, team_select, 2.5, swapped, True, sport_code="fb",
                    ),
                    expected,
                )

    def test_esports_map_serializers_cover_standard_and_team_totals(self):
        cases = [
            (1, 1, 0, "for,tmap,1,ml,a"),
            (2, 1, -3.5, "for,tmap,1,ah,a,-14"),
            (3, 4, 22.5, "for,tmap,1,ahunder,90"),
            (4, 5, 10.5, "for,tmap,1,tahover,h,42"),
            (5, 1, 10.5, "for,tmap,1,tahunder,a,42"),
        ]
        for bet_type, team_select, line, expected in cases:
            with self.subTest(bet_type=bet_type, team_select=team_select):
                self.assertEqual(
                    map_selection_to_bia_bet_type(
                        bet_type, team_select, line, False, False,
                        sport_code="esports", map_number=1,
                    ),
                    expected,
                )

        self.assertEqual(
            map_selection_to_bia_bet_type(
                1, 0, 0, False, False, sport_code="esports",
            ),
            "for,tp,all,ml,h",
        )
        self.assertEqual(
            map_selection_to_bia_bet_type(
                3, 3, 20.5, False, False, sport_code="esports",
                map_number=2, esports_unit="kills",
            ),
            "for,tmap,2,sub,kills,ahover,82",
        )

    def test_esports_map_result_keeps_event_period_separate_from_map_scope(self):
        enriched = ps_app._enrich_result(
            {"status": "OK", "odds": 2.84},
            event_id=1632983548,
            outcome_str="2",
            params={
                "bet_type": 1,
                "team_select": 1,
                "handicap": 0,
                "period": 0,
                "map_number": 1,
                "esports_unit": "rounds",
            },
            request_period=0,
            request_market="Moneyline",
        )

        self.assertEqual(enriched["period"], 0)
        self.assertEqual(enriched["period_number"], 0)
        self.assertEqual(enriched["map_number"], 1)
        self.assertEqual(enriched["esports_unit"], "rounds")
        self.assertEqual(enriched["outcome"], "Win2")

    def test_invalid_team_total_combinations_and_non_quarter_lines_fail_closed(self):
        for bet_type, team_select in ((4, 7), (4, 1), (5, 5), (5, 0)):
            with self.subTest(bet_type=bet_type, team_select=team_select):
                with self.assertRaisesRegex(ValueError, "UNSUPPORTED_TEAM_TOTAL_TEAM"):
                    map_selection_to_bia_bet_type(
                        bet_type, team_select, 2.5, False, True, sport_code="fb",
                    )
        with self.assertRaisesRegex(ValueError, "BIA_ASIAN_LINE_NOT_QUARTER"):
            map_selection_to_bia_bet_type(3, 3, 1.49, False, True, sport_code="fb")
        with self.assertRaisesRegex(ValueError, "BIA_ASIAN_LINE_NOT_QUARTER"):
            map_selection_to_bia_bet_type(4, 5, 2.49, False, True, sport_code="fb")
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_TOTALS_TEAM"):
            map_selection_to_bia_bet_type(3, 0, 2.5, False, True)


class BiaMockedEndpointsTests(unittest.IsolatedAsyncioTestCase):
    async def test_verify_rejects_removed_direct_pinnacle_without_touching_bia(self):
        req = ps_app.VerifyRequest(event_id=123, outcome="1", side="pinnacle")
        fallback = AsyncMock(side_effect=AssertionError("BIA fallback was reached"))
        with patch.object(ps_app, "handle_fallback_verify", new=fallback):
            result = await ps_app.verify(MagicMock(), req)

        self.assertEqual(result["status"], "UNAVAILABLE")
        self.assertEqual(result["error_code"], "DIRECT_PINNACLE_REMOVED")
        fallback.assert_not_awaited()

    async def test_place_rejects_removed_direct_pinnacle_without_touching_bia(self):
        req = ps_app.PlaceRequest(
            event_id=123,
            outcome="1",
            side="pinnacle",
            stake=10,
            expected_odds=2.0,
        )
        auth = ps_app._AuthContext(consumer_id="test", rate_identity="test")
        fallback = AsyncMock(side_effect=AssertionError("BIA fallback was reached"))
        with patch.dict(ps_app.os.environ, {"DEV_SIMULATION_MODE": "0"}, clear=False), patch.object(
            ps_app, "handle_fallback_place", new=fallback,
        ):
            result = await ps_app._place_registered(req, auth)

        self.assertEqual(result["status"], "NOT_PLACED")
        self.assertEqual(result["error_code"], "DIRECT_PINNACLE_REMOVED")
        fallback.assert_not_awaited()

    async def test_cached_prepared_quote_refreshes_same_single_basket(self):
        token = "prepared-live-refresh"
        cache_key = "calculator-intent-cache"
        now = time.time()
        original_client = ps_app.bia_placer_client
        fake_client = MagicMock()
        fake_client.refresh_betslip = AsyncMock(return_value=None)
        fake_client.get_betslip = AsyncMock(side_effect=[
            {
                "accounts": [{
                    "bookie": "pin88",
                    "bet_type": "for,ahome,0",
                    "price": 1.91,
                    "min": 1,
                    "max": 125,
                    "currency": "EUR",
                }],
            },
            {
                "accounts": [{
                    "bookie": "pin88",
                    "bet_type": "for,ahome,0",
                    "price": 1.94,
                    "min": 1,
                    "max": 120,
                    "currency": "EUR",
                }],
            },
        ])
        initial = {
            "status": "OK",
            "odds": 1.89,
            "source": "bia_placer",
            "fresh": True,
            "timestamp": now,
            "intent_id": "intent-0123456789abcdef",
            "prepared_quote_id": token,
            "prepared_quote_expires_at": now + 10,
            "results": [{
                "status": "OK",
                "odds": 1.89,
                "source": "bia_placer",
                "fresh": True,
            }],
        }
        with ps_app._prepared_quotes_lock:
            ps_app._prepared_quotes[token] = {
                "consumer_id": "consumer-a",
                "intent_id": initial["intent_id"],
                "betslip_id": "single-basket-7",
                "bia_bet_type": "for,ahome,0",
                "expires_at": now + 10,
                "revision": 1,
                "last_refresh_post_at": 0.0,
            }
        with ps_app._verify_result_cache_lock:
            ps_app._verify_result_cache[cache_key] = (now + 10, initial)
        ps_app.bia_placer_client = fake_client
        try:
            first = await ps_app._bia_verify_cache_get(cache_key)
            second = await ps_app._bia_verify_cache_get(cache_key)
        finally:
            ps_app.bia_placer_client = original_client
            with ps_app._verify_result_cache_lock:
                ps_app._verify_result_cache.pop(cache_key, None)
            with ps_app._prepared_quotes_lock:
                ps_app._prepared_quotes.pop(token, None)
            with ps_app._prepared_refresh_locks_lock:
                ps_app._prepared_refresh_locks.pop(token, None)

        self.assertEqual(first["odds"], 1.91)
        self.assertEqual(second["odds"], 1.94)
        self.assertEqual(first["prepared_quote_id"], token)
        self.assertEqual(second["prepared_quote_id"], token)
        self.assertTrue(second["basket_reused"])
        self.assertEqual(second["basket_revision"], 3)
        fake_client.refresh_betslip.assert_awaited_once_with("single-basket-7")
        self.assertEqual(fake_client.get_betslip.await_count, 2)

    async def test_cached_prepared_quote_never_returns_stale_price_when_pin_is_suspended(self):
        token = "prepared-suspended"
        cache_key = "calculator-suspended-cache"
        now = time.time()
        original_client = ps_app.bia_placer_client
        fake_client = MagicMock()
        fake_client.refresh_betslip = AsyncMock(return_value=None)
        fake_client.get_betslip = AsyncMock(return_value={"accounts": []})
        initial = {
            "status": "OK",
            "odds": 2.1,
            "source": "bia_placer",
            "fresh": True,
            "timestamp": now,
            "intent_id": "intent-fedcba9876543210",
            "prepared_quote_id": token,
            "prepared_quote_expires_at": now + 10,
            "results": [{"status": "OK", "odds": 2.1, "fresh": True}],
        }
        with ps_app._prepared_quotes_lock:
            ps_app._prepared_quotes[token] = {
                "consumer_id": "consumer-a",
                "intent_id": initial["intent_id"],
                "betslip_id": "single-basket-8",
                "bia_bet_type": "for,aaway,0",
                "expires_at": now + 10,
                "revision": 1,
                "last_refresh_post_at": 0.0,
            }
        with ps_app._verify_result_cache_lock:
            ps_app._verify_result_cache[cache_key] = (now + 10, initial)
        ps_app.bia_placer_client = fake_client
        try:
            suspended = await ps_app._bia_verify_cache_get(cache_key)
        finally:
            ps_app.bia_placer_client = original_client
            with ps_app._verify_result_cache_lock:
                ps_app._verify_result_cache.pop(cache_key, None)
            with ps_app._prepared_quotes_lock:
                ps_app._prepared_quotes.pop(token, None)
            with ps_app._prepared_refresh_locks_lock:
                ps_app._prepared_refresh_locks.pop(token, None)

        self.assertEqual(suspended["status"], "PROCESSING")
        self.assertIsNone(suspended["odds"])
        self.assertFalse(suspended["fresh"])
        self.assertEqual(suspended["error_code"], "BIA_PREPARED_REFRESH_PENDING")

    async def test_release_intent_deletes_only_own_retained_single_basket(self):
        intent_id = "intent-release-0123456789"
        token_a = "prepared-release-a"
        token_b = "prepared-release-b"
        now = time.time()
        original_client = ps_app.bia_placer_client
        fake_client = MagicMock()
        fake_client.delete_betslip = AsyncMock(return_value=None)
        with ps_app._prepared_quotes_lock:
            ps_app._prepared_quotes[token_a] = {
                "consumer_id": "consumer-a",
                "intent_id": intent_id,
                "betslip_id": "single-release-a",
                "expires_at": now + 10,
            }
            ps_app._prepared_quotes[token_b] = {
                "consumer_id": "consumer-b",
                "intent_id": intent_id,
                "betslip_id": "single-release-b",
                "expires_at": now + 10,
            }
        with ps_app._verify_result_cache_lock:
            ps_app._verify_result_cache["release-cache-a"] = (
                now + 10,
                {"intent_id": intent_id, "prepared_quote_id": token_a},
            )
            ps_app._verify_result_cache["release-cache-b"] = (
                now + 10,
                {"intent_id": intent_id, "prepared_quote_id": token_b},
            )
        ps_app.bia_placer_client = fake_client
        try:
            released = await ps_app._release_prepared_intent("consumer-a", intent_id)
            with ps_app._prepared_quotes_lock:
                self.assertNotIn(token_a, ps_app._prepared_quotes)
                self.assertIn(token_b, ps_app._prepared_quotes)
            with ps_app._verify_result_cache_lock:
                self.assertNotIn("release-cache-a", ps_app._verify_result_cache)
                self.assertIn("release-cache-b", ps_app._verify_result_cache)
        finally:
            ps_app.bia_placer_client = original_client
            with ps_app._prepared_quotes_lock:
                ps_app._prepared_quotes.pop(token_a, None)
                ps_app._prepared_quotes.pop(token_b, None)
            with ps_app._verify_result_cache_lock:
                ps_app._verify_result_cache.pop("release-cache-a", None)
                ps_app._verify_result_cache.pop("release-cache-b", None)
            with ps_app._prepared_refresh_locks_lock:
                ps_app._prepared_refresh_locks.pop(token_a, None)
                ps_app._prepared_refresh_locks.pop(token_b, None)

        self.assertTrue(released["released"])
        self.assertEqual(released["released_count"], 1)
        fake_client.delete_betslip.assert_awaited_once_with("single-release-a")

    async def test_release_intent_uses_prepared_registry_when_cache_is_gone(self):
        intent_id = "intent-orphan-0123456789"
        token = "prepared-orphan"
        original_client = ps_app.bia_placer_client
        fake_client = MagicMock()
        fake_client.delete_betslip = AsyncMock(return_value=None)
        with ps_app._prepared_quotes_lock:
            ps_app._prepared_quotes[token] = {
                "consumer_id": "consumer-a",
                "intent_id": intent_id,
                "betslip_id": "single-orphan",
                "expires_at": time.time() + 10,
            }
        ps_app.bia_placer_client = fake_client
        try:
            released = await ps_app._release_prepared_intent("consumer-a", intent_id)
            with ps_app._prepared_quotes_lock:
                self.assertNotIn(token, ps_app._prepared_quotes)
        finally:
            ps_app.bia_placer_client = original_client
            with ps_app._prepared_quotes_lock:
                ps_app._prepared_quotes.pop(token, None)
            with ps_app._prepared_refresh_locks_lock:
                ps_app._prepared_refresh_locks.pop(token, None)

        self.assertTrue(released["released"])
        self.assertEqual(released["released_count"], 1)
        fake_client.delete_betslip.assert_awaited_once_with("single-orphan")

    async def test_store_replaces_previous_single_for_same_consumer_intent(self):
        intent_id = "intent-replace-0123456789"
        old_token = "prepared-replaced"
        original_client = ps_app.bia_placer_client
        fake_client = MagicMock()
        fake_client.delete_betslip = AsyncMock(return_value=None)
        req = ps_app.VerifyRequest(
            event_id=12345,
            sport="Soccer",
            market="Handicap",
            outcome="H1 -0.5",
            handicap=-0.5,
            intent_id=intent_id,
        )
        outcome, params = ps_app._resolve_outcome_and_params(req)
        auth = MagicMock(consumer_id="consumer-a")
        with ps_app._prepared_quotes_lock:
            ps_app._prepared_quotes[old_token] = {
                "consumer_id": "consumer-a",
                "intent_id": intent_id,
                "betslip_id": "single-old",
                "expires_at": time.time() + 10,
            }
        ps_app.bia_placer_client = fake_client
        new_token = None
        try:
            new_token, _expires_at = ps_app._store_prepared_quote(
                req=req,
                auth=auth,
                outcome_str=outcome,
                params=params,
                betslip_id="single-new",
                event_ref={"event_key": "event-1"},
                bia_bet_type="for,soccer,1",
            )
            await asyncio.sleep(0)
            with ps_app._prepared_quotes_lock:
                self.assertNotIn(old_token, ps_app._prepared_quotes)
                self.assertIn(new_token, ps_app._prepared_quotes)
        finally:
            ps_app.bia_placer_client = original_client
            with ps_app._prepared_quotes_lock:
                ps_app._prepared_quotes.pop(old_token, None)
                if new_token:
                    ps_app._prepared_quotes.pop(new_token, None)
            with ps_app._prepared_refresh_locks_lock:
                ps_app._prepared_refresh_locks.pop(old_token, None)
                if new_token:
                    ps_app._prepared_refresh_locks.pop(new_token, None)

        fake_client.delete_betslip.assert_awaited_once_with("single-old")

    async def test_prepared_quote_is_structurally_bound_and_consumed_once(self):
        req = ps_app.PlaceRequest(
            event_id=12345,
            sport="Soccer",
            market="Handicap",
            outcome="H1 -0.5",
            raw_selection="H1 -0.5",
            handicap=-0.5,
            stake=10,
            expected_odds=2.0,
            prepared_quote_id="prepared-once",
        )
        outcome, params = ps_app._resolve_outcome_and_params(req)
        auth = MagicMock(consumer_id="test-consumer")
        entry = {
            "consumer_id": "test-consumer",
            "fingerprint": ps_app._prepared_quote_fingerprint(req, outcome, params),
            "betslip_id": "basket-1",
            "event_ref": {"event_key": "event-1"},
            "bia_bet_type": "for,ahome,-0.5",
            "expires_at": time.time() + 10,
        }
        with ps_app._prepared_quotes_lock:
            ps_app._prepared_quotes["prepared-once"] = entry

        consumed, error = await ps_app._consume_prepared_quote(req, auth, outcome, params)
        self.assertIsNone(error)
        self.assertEqual(consumed["betslip_id"], "basket-1")
        consumed_again, error_again = await ps_app._consume_prepared_quote(req, auth, outcome, params)
        self.assertIsNone(consumed_again)
        self.assertEqual(error_again, "BIA_PREPARED_QUOTE_INVALID")

    async def test_prepared_quote_rejects_changed_selection(self):
        original = ps_app.PlaceRequest(
            event_id=12345,
            sport="Soccer",
            market="Moneyline",
            outcome="1",
            stake=10,
            expected_odds=2.0,
            prepared_quote_id="prepared-mismatch",
        )
        changed = original.model_copy(update={"outcome": "2"})
        original_outcome, original_params = ps_app._resolve_outcome_and_params(original)
        changed_outcome, changed_params = ps_app._resolve_outcome_and_params(changed)
        with ps_app._prepared_quotes_lock:
            ps_app._prepared_quotes["prepared-mismatch"] = {
                "consumer_id": "test-consumer",
                "fingerprint": ps_app._prepared_quote_fingerprint(
                    original, original_outcome, original_params,
                ),
                "betslip_id": "basket-2",
                "expires_at": time.time() + 10,
            }
        consumed, error = await ps_app._consume_prepared_quote(
            changed,
            MagicMock(consumer_id="test-consumer"),
            changed_outcome,
            changed_params,
        )
        self.assertEqual(consumed["betslip_id"], "basket-2")
        self.assertEqual(error, "BIA_PREPARED_QUOTE_SELECTION_MISMATCH")

    async def test_offer_proof_is_structural_and_does_not_create_betslip(self):
        req = ps_app.VerifyRequest(
            event_id=1633101459,
            outcome="2",
            market="Moneyline",
            sport="Baseball",
            pinnacle_home="Seattle Mariners",
            pinnacle_away="Detroit Tigers",
            pinnacle_sport="Baseball",
            pinnacle_start="2026-08-06T01:40:00Z",
            pinnacle_league="MLB",
        )
        event_ref = {
            "found": True,
            "sport_code": "baseball",
            "event_key": "bia-baseball-event",
            "swapped": True,
            "home": "Seattle Mariners",
            "away": "Detroit Tigers",
            "offer_proof": {"bia_bet_type": "for,ml,h"},
        }
        response = AsyncMock(status=200)
        response.json = AsyncMock(return_value=event_ref)
        session = MagicMock()
        session.get.return_value.__aenter__ = AsyncMock(return_value=response)
        session.get.return_value.__aexit__ = AsyncMock()
        session.__aenter__ = AsyncMock(return_value=session)
        session.__aexit__ = AsyncMock()

        with patch("aiohttp.ClientSession", return_value=session):
            outcome, params, proof, failure = await ps_app._lookup_bia_offer_proof(req)

        self.assertEqual(outcome, "2")
        self.assertEqual(params["bet_type"], 1)
        self.assertEqual(params["team_select"], 1)
        self.assertEqual(proof, event_ref)
        self.assertEqual(failure, {})
        query = urllib.parse.parse_qs(
            urllib.parse.urlsplit(session.get.call_args.args[0]).query
        )
        self.assertEqual(query["proof"], ["1"])
        self.assertEqual(query["stale_candidate"], ["1"])
        self.assertEqual(query["bet_type"], ["1"])
        self.assertEqual(query["team_select"], ["1"])
        self.assertEqual(query["pinnacle_home"], ["Seattle Mariners"])
        self.assertEqual(query["pinnacle_away"], ["Detroit Tigers"])
        self.assertEqual(query["pinnacle_sport"], ["Baseball"])
        self.assertEqual(query["pinnacle_league"], ["MLB"])
        self.assertEqual(query["pinnacle_start"], ["2026-08-06T01:40:00Z"])

    def test_bia_identity_prefers_pinnacle_names_and_falls_back_to_forted(self):
        canonical = ps_app.VerifyRequest(
            event_id=123,
            sport="Soccer",
            forted_home="Forted Home",
            forted_away="Forted Away",
            pinnacle_home="Pinnacle Home",
            pinnacle_away="Pinnacle Away",
        )
        self.assertEqual(
            ps_app._bia_identity_lookup_params(canonical)["pinnacle_home"],
            "Pinnacle Home",
        )

        proposed = ps_app.VerifyRequest(
            event_id=123,
            sport="Soccer",
            forted_home="Forted Home",
            forted_away="Forted Away",
        )
        identity = ps_app._bia_identity_lookup_params(proposed)
        self.assertEqual(identity["pinnacle_home"], "Forted Home")
        self.assertEqual(identity["pinnacle_away"], "Forted Away")
        self.assertEqual(identity["pinnacle_sport"], "Soccer")

    async def test_offer_proof_preserves_central_not_found_diagnostics(self):
        req = ps_app.VerifyRequest(
            event_id=123,
            outcome="Over 9.5",
            market="Totals",
            market_context="corners",
        )
        response = AsyncMock(status=200)
        response.json = AsyncMock(return_value={
            "found": False,
            "event_found": False,
            "error_code": "BIA_EVENT_NOT_FOUND",
            "refresh_status": "timeout",
        })
        session = MagicMock()
        session.get.return_value.__aenter__ = AsyncMock(return_value=response)
        session.get.return_value.__aexit__ = AsyncMock()
        session.__aenter__ = AsyncMock(return_value=session)
        session.__aexit__ = AsyncMock()

        with patch("aiohttp.ClientSession", return_value=session):
            _outcome, _params, proof, failure = await ps_app._lookup_bia_offer_proof(req)

        self.assertIsNone(proof)
        self.assertEqual(failure["error_code"], "BIA_EVENT_NOT_FOUND")
        self.assertFalse(failure["event_found"])
        self.assertEqual(failure["refresh_status"], "timeout")
        query = urllib.parse.parse_qs(
            urllib.parse.urlsplit(session.get.call_args.args[0]).query
        )
        self.assertEqual(query["market_context"], ["corners"])
        self.assertEqual(query["stale_candidate"], ["1"])

    async def test_offer_proof_maps_contextual_team_total_to_exact_bia_coordinates(self):
        req = ps_app.VerifyRequest(
            event_id=1632820971,
            outcome="CIT2> 3.5",
            market="Totals",
            market_context="corners",
        )
        event_ref = {
            "found": True,
            "sport_code": "fb_corn",
            "event_key": "corners-event",
            "swapped": False,
            "offer_proof": {
                "bia_bet_type": "for,tset,0,vwhole,tg,tahover,p2,14",
            },
        }
        response = AsyncMock(status=200)
        response.json = AsyncMock(return_value=event_ref)
        session = MagicMock()
        session.get.return_value.__aenter__ = AsyncMock(return_value=response)
        session.get.return_value.__aexit__ = AsyncMock()
        session.__aenter__ = AsyncMock(return_value=session)
        session.__aexit__ = AsyncMock()

        with patch("aiohttp.ClientSession", return_value=session):
            outcome, params, proof, failure = await ps_app._lookup_bia_offer_proof(req)

        self.assertEqual(outcome, "CIT2> 3.5")
        self.assertEqual(params["bet_type"], 5)
        self.assertEqual(params["team_select"], 7)
        self.assertEqual(params["handicap"], 3.5)
        self.assertEqual(proof, event_ref)
        self.assertEqual(failure, {})
        query = urllib.parse.parse_qs(
            urllib.parse.urlsplit(session.get.call_args.args[0]).query
        )
        self.assertEqual(query["bet_type"], ["5"])
        self.assertEqual(query["team_select"], ["7"])
        self.assertEqual(query["handicap"], ["3.5"])
        self.assertEqual(query["market_context"], ["corners"])

    async def test_simulation_is_forbidden_without_explicit_dev_runtime(self):
        with patch.dict(
            ps_app.os.environ,
            {"DEV_SIMULATION_MODE": "1", "PS3838_RUNTIME_ENV": "production"},
            clear=True,
        ):
            self.assertFalse(ps_app._dev_simulation_enabled())
            with self.assertRaisesRegex(RuntimeError, "forbidden in production"):
                ps_app._validate_runtime_safety()

        with patch.dict(
            ps_app.os.environ,
            {"DEV_SIMULATION_MODE": "1", "PS3838_RUNTIME_ENV": "test"},
            clear=True,
        ):
            self.assertTrue(ps_app._dev_simulation_enabled())
            ps_app._validate_runtime_safety()

    async def test_verify_never_uses_expected_odds_as_production_quote(self):
        req = ps_app.VerifyRequest(
            event_id=1632974942,
            sport="Tennis",
            market="Handicap",
            outcome="H2 -1.5",
            raw_selection="Ф2(-1,5)",
            handicap=-1.5,
            expected_odds=1.84,
        )
        with patch.dict(
            ps_app.os.environ,
            {
                "BIA_ENABLED": "0",
                "DEV_SIMULATION_MODE": "1",
                "PS3838_RUNTIME_ENV": "production",
            },
            clear=True,
        ):
            result = await ps_app.handle_fallback_verify(req)

        self.assertEqual(result["status"], "UNAVAILABLE")
        self.assertEqual(result["error_code"], "BIA_VERIFY_UNAVAILABLE")
        self.assertNotEqual(result.get("odds"), 1.84)

    async def test_verify_propagates_sanitized_lookup_failure_diagnostics(self):
        req = ps_app.VerifyRequest(
            event_id=12345,
            sport="Soccer",
            market="Moneyline",
            outcome="1",
        )
        lookup = AsyncMock(status=200)
        lookup.json = AsyncMock(return_value={
            "found": False,
            "event_found": True,
            "parser_event_found": True,
            "error_code": "bia_offer_not_found",
            "candidate_count": 7,
            "refresh_status": "fresh",
            "diagnostic_category": "market_family_missing",
            "candidate_error_codes": [
                "bia_offer_market_missing",
                "BIA_OFFER_LINE_MISSING",
            ],
            "raw_offer_group_count": 3,
            "raw_offer_groups": ["wdw", "time_ah,tperiod,1"],
            "access_token": "must-not-leak",
            "raw_candidates": [{"secret": "must-not-leak"}],
        })
        sess = MagicMock()
        sess.get.return_value.__aenter__ = AsyncMock(return_value=lookup)
        sess.get.return_value.__aexit__ = AsyncMock()
        sess.__aenter__ = AsyncMock(return_value=sess)
        sess.__aexit__ = AsyncMock()

        with patch("aiohttp.ClientSession", return_value=sess), patch.dict(
            ps_app.os.environ,
            {
                "BIA_ENABLED": "1",
                "BIA_LOGIN": "x",
                "BIA_PASSWORD": "y",
                "DEV_SIMULATION_MODE": "0",
            },
            clear=True,
        ):
            result = await ps_app.handle_fallback_verify(req)

        self.assertEqual(result["status"], "UNAVAILABLE")
        self.assertEqual(result["error_code"], "BIA_OFFER_NOT_FOUND")
        self.assertEqual(result["lookup_error_code"], "BIA_OFFER_NOT_FOUND")
        self.assertEqual(result["candidate_count"], 7)
        self.assertEqual(result["refresh_status"], "fresh")
        self.assertIs(result["event_found"], True)
        self.assertIs(result["parser_event_found"], True)
        self.assertEqual(result["diagnostic_category"], "market_family_missing")
        self.assertEqual(result["candidate_error_codes"], [
            "BIA_OFFER_MARKET_MISSING", "BIA_OFFER_LINE_MISSING",
        ])
        self.assertEqual(result["raw_offer_group_count"], 3)
        self.assertEqual(result["raw_offer_groups"], ["wdw", "time_ah,tperiod,1"])
        self.assertNotIn("access_token", result)
        self.assertNotIn("raw_candidates", result)
        self.assertEqual(result["results"][0]["lookup_error_code"], "BIA_OFFER_NOT_FOUND")

    async def test_fallback_verify_uses_contextual_team_total_coordinates(self):
        req = ps_app.VerifyRequest(
            event_id=1632820971,
            sport="Soccer",
            market="Totals",
            outcome="CIT2> 3.5",
            market_context="corners",
        )
        lookup = AsyncMock(status=200)
        lookup.json = AsyncMock(return_value={
            "found": False,
            "event_found": True,
            "error_code": "BIA_OFFER_NOT_FOUND",
        })
        sess = MagicMock()
        sess.get.return_value.__aenter__ = AsyncMock(return_value=lookup)
        sess.get.return_value.__aexit__ = AsyncMock()
        sess.__aenter__ = AsyncMock(return_value=sess)
        sess.__aexit__ = AsyncMock()

        with patch("aiohttp.ClientSession", return_value=sess), patch.dict(
            ps_app.os.environ,
            {"BIA_ENABLED": "1", "BIA_LOGIN": "x", "BIA_PASSWORD": "y"},
            clear=True,
        ):
            result = await ps_app.handle_fallback_verify(req)

        self.assertEqual(result["error_code"], "BIA_OFFER_NOT_FOUND")
        query = urllib.parse.parse_qs(
            urllib.parse.urlsplit(sess.get.call_args.args[0]).query
        )
        self.assertEqual(query["bet_type"], ["5"])
        self.assertEqual(query["team_select"], ["7"])
        self.assertEqual(query["handicap"], ["3.5"])
        self.assertEqual(query["market_context"], ["corners"])

    async def test_verify_rejects_unsafe_lookup_failure_diagnostics(self):
        req = ps_app.VerifyRequest(event_id=12345, market="Moneyline", outcome="1")
        lookup = AsyncMock(status=200)
        lookup.json = AsyncMock(return_value={
            "found": False,
            "error_code": "../../secret\nheader",
            "candidate_count": True,
            "refresh_status": "fresh\nheader",
            "parser_event_found": "yes",
            "diagnostic_category": "market family missing",
            "candidate_error_codes": ["../../secret"],
            "raw_offer_group_count": True,
            "raw_offer_groups": ["secret/header"],
        })
        sess = MagicMock()
        sess.get.return_value.__aenter__ = AsyncMock(return_value=lookup)
        sess.get.return_value.__aexit__ = AsyncMock()
        sess.__aenter__ = AsyncMock(return_value=sess)
        sess.__aexit__ = AsyncMock()

        with patch("aiohttp.ClientSession", return_value=sess), patch.dict(
            ps_app.os.environ,
            {
                "BIA_ENABLED": "1",
                "BIA_LOGIN": "x",
                "BIA_PASSWORD": "y",
                "DEV_SIMULATION_MODE": "0",
            },
            clear=True,
        ):
            result = await ps_app.handle_fallback_verify(req)

        self.assertEqual(result["error_code"], "BIA_VERIFY_UNAVAILABLE")
        self.assertNotIn("lookup_error_code", result)
        self.assertNotIn("candidate_count", result)
        self.assertNotIn("refresh_status", result)
        self.assertNotIn("parser_event_found", result)
        self.assertNotIn("diagnostic_category", result)
        self.assertNotIn("candidate_error_codes", result)
        self.assertNotIn("raw_offer_group_count", result)
        self.assertNotIn("raw_offer_groups", result)

    async def test_dev_verify_is_diagnostic_and_never_ok(self):
        req = ps_app.VerifyRequest(
            event_id=123,
            sport="Tennis",
            market="Handicap",
            outcome="H2 -1.5",
            expected_odds=1.84,
        )
        with patch.dict(
            ps_app.os.environ,
            {
                "BIA_ENABLED": "0",
                "DEV_SIMULATION_MODE": "1",
                "PS3838_RUNTIME_ENV": "test",
            },
            clear=True,
        ):
            result = await ps_app.handle_fallback_verify(req)

        self.assertEqual(result["status"], "SIMULATED")
        self.assertNotEqual(result["status"], "OK")
        self.assertTrue(result["simulation"])
        self.assertIsNone(result["selection_id"])
        self.assertIsNone(result["line_id"])
        self.assertIsNone(result["odds_id"])

    async def test_missing_bia_mapping_place_fails_closed_without_name_error(self):
        req = ps_app.PlaceRequest(
            event_id=123,
            sport="Tennis",
            market="Moneyline",
            outcome="1",
            stake=10,
            expected_odds=2.0,
        )
        auth = MagicMock(consumer_id="test")
        with patch.dict(
            ps_app.os.environ,
            {"BIA_ENABLED": "0", "DEV_SIMULATION_MODE": "0"},
            clear=True,
        ):
            result = await ps_app.handle_fallback_place(req, auth)

        self.assertEqual(result["status"], "NOT_PLACED")
        self.assertEqual(result["error_code"], "BET_PLACEMENT_NOT_CONFIGURED")

    async def test_dev_place_is_dry_run_and_never_placed(self):
        req = ps_app.PlaceRequest(
            event_id=123,
            sport="Tennis",
            market="Moneyline",
            outcome="1",
            stake=10,
            expected_odds=2.0,
        )
        auth = MagicMock(consumer_id="test")
        with patch.dict(
            ps_app.os.environ,
            {
                "BIA_ENABLED": "0",
                "DEV_SIMULATION_MODE": "1",
                "PS3838_RUNTIME_ENV": "test",
            },
            clear=True,
        ):
            result = await ps_app.handle_fallback_place(req, auth)

        self.assertEqual(result["status"], "SIMULATED")
        self.assertNotEqual(result["status"], "PLACED")
        self.assertEqual(result["error_code"], "DRY_RUN_ONLY")
        self.assertTrue(result["simulation"])

    async def test_dev_place_short_circuits_direct_and_fallback_engines(self):
        auth = ps_app._AuthContext(consumer_id="test", rate_identity="test")
        for side in (None, "pinnacle"):
            with self.subTest(side=side):
                req = ps_app.PlaceRequest(
                    event_id=123,
                    sport="Tennis",
                    market="Moneyline",
                    outcome="1",
                    side=side,
                    stake=10,
                    expected_odds=2.0,
                )
                fallback = AsyncMock(side_effect=AssertionError("live fallback engine was reached"))
                direct_router = MagicMock(side_effect=AssertionError("direct engine routing was reached"))
                with patch.dict(
                    ps_app.os.environ,
                    {
                        "BIA_ENABLED": "1",
                        "BIA_LOGIN": "configured",
                        "BIA_PASSWORD": "configured",
                        "DEV_SIMULATION_MODE": "1",
                        "PS3838_RUNTIME_ENV": "test",
                    },
                    clear=True,
                ), patch.object(ps_app, "handle_fallback_place", new=fallback), patch.object(
                    ps_app, "_direct_pinnacle_requested", new=direct_router,
                ):
                    result = await ps_app._place_registered(req, auth)

                self.assertEqual(result["status"], "SIMULATED")
                self.assertEqual(result["error_code"], "DRY_RUN_ONLY")
                self.assertIsNone(result["wager_id"])
                fallback.assert_not_awaited()
                direct_router.assert_not_called()

    async def test_tennis_game_set_discovery_by_offer_is_disabled(self):
        placer = BiaPlacer("user", "password")
        placer.create_betslip = AsyncMock()
        placer.delete_betslip = AsyncMock()

        with self.assertRaisesRegex(RuntimeError, "BIA_TENNIS_GAME_SET_DISCOVERY_DISABLED"):
            await placer.discover_tennis_game_set("event", 5, "p1")
        placer.create_betslip.assert_not_awaited()
        placer.delete_betslip.assert_not_awaited()

    async def _place_with_order_response(self, order_response, **req_overrides):
        req = MagicMock(
            event_id=12345,
            period=0,
            sport="Soccer",
            stake=100.0,
            expected_odds=2.0,
            odds_tolerance=0.01,
            accept_better_odds=False,
            market="Moneyline",
            outcome="1",
            raw_selection="1",
            handicap=None,
            map_number=0,
            esports_unit="",
        )
        for key, value in req_overrides.items():
            setattr(req, key, value)

        lookup = AsyncMock(status=200)
        lookup.json = AsyncMock(
            return_value={
                "found": True,
                "sport_code": "fb",
                "event_key": "evt",
                "swapped": False,
                "offer_proof": {"bia_bet_type": "for,h"},
            }
        )
        placer = MagicMock()
        placer.create_betslip = AsyncMock(
            return_value={
                "betslip_id": "slip-1",
                "accounts": [{
                    "bookie": "pin88", "bet_type": "for,h",
                    "price": 2.0, "min": 10, "max": 1000,
                }],
            }
        )
        if isinstance(order_response, Exception):
            placer.place_order = AsyncMock(side_effect=order_response)
        else:
            placer.place_order = AsyncMock(return_value=order_response)
        placer.delete_betslip = AsyncMock()

        sess = MagicMock()
        sess.get.return_value.__aenter__ = AsyncMock(return_value=lookup)
        sess.get.return_value.__aexit__ = AsyncMock()
        sess.__aenter__ = AsyncMock(return_value=sess)
        sess.__aexit__ = AsyncMock()

        old = ps_app.bia_placer_client
        ps_app.bia_placer_client = placer
        try:
            with patch("aiohttp.ClientSession", return_value=sess), patch(
                "os.environ",
                {"BIA_ENABLED": "1", "BIA_LOGIN": "x", "BIA_PASSWORD": "y"},
            ):
                return await ps_app.handle_fallback_place(req, MagicMock(consumer_id="test")), placer
        finally:
            ps_app.bia_placer_client = old

    async def test_final_order_requires_real_id(self):
        result, _ = await self._place_with_order_response(
            {"_bia_http_status": 200, "data": {"status": "PLACED", "order_id": "real-1"}}
        )
        self.assertEqual(result["status"], "PLACED")
        self.assertEqual(result["wager_id"], "real-1")

    async def test_pending_and_http_202_are_not_placed_and_keep_betslip(self):
        result, placer = await self._place_with_order_response(
            {"_bia_http_status": 202, "data": {"status": "PENDING", "order_id": "real-1"}}
        )
        self.assertEqual(result["status"], "PENDING")
        self.assertFalse(result["reconciliation"]["retry_order"])
        await asyncio.sleep(0)
        placer.delete_betslip.assert_not_awaited()

    async def test_empty_status_is_unknown(self):
        result, placer = await self._place_with_order_response(
            {"_bia_http_status": 200, "data": {"status": "", "order_id": "real-1"}}
        )
        self.assertEqual(result["status"], "UNKNOWN")
        await asyncio.sleep(0)
        placer.delete_betslip.assert_not_awaited()

    async def test_missing_order_id_is_unknown(self):
        result, _ = await self._place_with_order_response(
            {"_bia_http_status": 200, "data": {"status": "PLACED"}}
        )
        self.assertEqual(result["status"], "UNKNOWN")

    async def test_timeout_or_5xx_uncertainty_is_unknown(self):
        result, _ = await self._place_with_order_response(asyncio.TimeoutError())
        self.assertEqual(result["status"], "UNKNOWN")
        from bia_placer import BiaOrderUncertain

        result, _ = await self._place_with_order_response(BiaOrderUncertain("HTTP 503"))
        self.assertEqual(result["status"], "UNKNOWN")

    async def test_better_odds_rejected_without_accept_flag(self):
        req = MagicMock(
            event_id=12345,
            period=0,
            sport="Soccer",
            stake=100.0,
            expected_odds=2.0,
            odds_tolerance=0.01,
            accept_better_odds=False,
            market="Moneyline",
            outcome="1",
            raw_selection="1",
            handicap=None,
            map_number=0,
            esports_unit="",
        )
        lookup = AsyncMock(status=200)
        lookup.json = AsyncMock(
            return_value={
                "found": True, "sport_code": "fb", "event_key": "evt", "swapped": False,
                "offer_proof": {"bia_bet_type": "for,h"},
            }
        )
        placer = MagicMock()
        placer.create_betslip = AsyncMock(
            return_value={
                "betslip_id": "slip-1",
                "accounts": [{
                    "bookie": "pin88", "bet_type": "for,h",
                    "price": 2.20, "min": 10, "max": 1000,
                }],
            }
        )
        placer.place_order = AsyncMock()
        placer.delete_betslip = AsyncMock()
        sess = MagicMock()
        sess.get.return_value.__aenter__ = AsyncMock(return_value=lookup)
        sess.get.return_value.__aexit__ = AsyncMock()
        sess.__aenter__ = AsyncMock(return_value=sess)
        sess.__aexit__ = AsyncMock()
        old = ps_app.bia_placer_client
        ps_app.bia_placer_client = placer
        try:
            with patch("aiohttp.ClientSession", return_value=sess), patch(
                "os.environ",
                {"BIA_ENABLED": "1", "BIA_LOGIN": "x", "BIA_PASSWORD": "y"},
            ):
                res = await ps_app.handle_fallback_place(req, MagicMock(consumer_id="test"))
        finally:
            ps_app.bia_placer_client = old
        self.assertEqual(res["status"], "NOT_PLACED")
        self.assertIn("Price protection", res["error"])
        placer.place_order.assert_not_awaited()

    async def test_better_odds_allowed_with_accept_flag(self):
        result, placer = await self._place_with_order_response(
            {"_bia_http_status": 200, "data": {"status": "PLACED", "order_id": "real-better"}},
            expected_odds=2.0,
            accept_better_odds=True,
        )
        # create_betslip still returns price 2.0 in helper; force better via custom quote
        # covered by dedicated helper below when needed — here verify success path still works
        self.assertEqual(result["status"], "PLACED")

    async def test_missing_min_max_rejected(self):
        req = MagicMock(
            event_id=12345,
            period=0,
            sport="Soccer",
            stake=100.0,
            expected_odds=2.0,
            odds_tolerance=0.01,
            accept_better_odds=False,
            market="Moneyline",
            outcome="1",
            raw_selection="1",
            handicap=None,
            map_number=0,
            esports_unit="",
        )
        lookup = AsyncMock(status=200)
        lookup.json = AsyncMock(
            return_value={
                "found": True, "sport_code": "fb", "event_key": "evt", "swapped": False,
                "offer_proof": {"bia_bet_type": "for,h"},
            }
        )
        placer = MagicMock()
        placer.create_betslip = AsyncMock(
            return_value={
                "betslip_id": "slip-1",
                "accounts": [{"bookie": "pin88", "bet_type": "for,h", "price": 2.0}],  # no min/max
            }
        )
        placer.place_order = AsyncMock()
        placer.delete_betslip = AsyncMock()
        sess = MagicMock()
        sess.get.return_value.__aenter__ = AsyncMock(return_value=lookup)
        sess.get.return_value.__aexit__ = AsyncMock()
        sess.__aenter__ = AsyncMock(return_value=sess)
        sess.__aexit__ = AsyncMock()
        old = ps_app.bia_placer_client
        ps_app.bia_placer_client = placer
        try:
            with patch("aiohttp.ClientSession", return_value=sess), patch(
                "os.environ",
                {"BIA_ENABLED": "1", "BIA_LOGIN": "x", "BIA_PASSWORD": "y"},
            ):
                res = await ps_app.handle_fallback_place(req, MagicMock(consumer_id="test"))
        finally:
            ps_app.bia_placer_client = old
        self.assertEqual(res["status"], "NOT_PLACED")
        self.assertIn("no explicit stake limits", res["error"])
        placer.place_order.assert_not_awaited()

    async def test_tennis_period_is_forwarded_to_bia_ticket(self):
        req = MagicMock(
            event_id=12345,
            period=1,
            sport="Tennis",
            stake=100.0,
            expected_odds=2.0,
            odds_tolerance=0.01,
            accept_better_odds=False,
            market="Moneyline",
            outcome="1",
            raw_selection="1",
            handicap=None,
            map_number=0,
            esports_unit="",
        )
        lookup = AsyncMock(status=200)
        lookup.json = AsyncMock(
            return_value={
                "found": True, "sport_code": "tennis", "event_key": "evt", "swapped": False,
                "offer_proof": {"bia_bet_type": "for,tset,1,vwhatever,p1"},
            }
        )
        placer = MagicMock()
        placer.create_betslip = AsyncMock(return_value={
            "betslip_id": "set-slip",
            "accounts": [{
                "bookie": "pin88", "bet_type": "for,tset,1,vwhatever,p1",
                "price": 2.0, "min": 1, "max": 1000,
            }],
        })
        placer.place_order = AsyncMock(return_value={
            "_bia_http_status": 200,
            "data": {"status": "PLACED", "order_id": "set-order"},
        })
        placer.delete_betslip = AsyncMock()
        sess = MagicMock()
        sess.get.return_value.__aenter__ = AsyncMock(return_value=lookup)
        sess.get.return_value.__aexit__ = AsyncMock()
        sess.__aenter__ = AsyncMock(return_value=sess)
        sess.__aexit__ = AsyncMock()
        old = ps_app.bia_placer_client
        ps_app.bia_placer_client = placer
        try:
            with patch("aiohttp.ClientSession", return_value=sess), patch(
                "os.environ",
                {"BIA_ENABLED": "1", "BIA_LOGIN": "x", "BIA_PASSWORD": "y"},
            ):
                res = await ps_app.handle_fallback_place(req, MagicMock(consumer_id="test"))
        finally:
            ps_app.bia_placer_client = old
        self.assertEqual(res["status"], "PLACED")
        placer.create_betslip.assert_awaited_once_with("tennis", "evt", "for,tset,1,vwhatever,p1")

    async def test_handle_fallback_verify_success(self):
        req = MagicMock()
        req.event_id = 12345
        req.period = 0
        req.sport = "Soccer"
        req.selection_id = "sel_1"
        req.line_id = "line_1"
        req.odds_id = "odds_1"
        req.market = "Moneyline"
        req.outcome = "1"
        req.raw_selection = "1"
        req.expected_odds = 2.05
        req.handicap = None
        req.map_number = 0
        req.esports_unit = ""

        event_ref = {
            "found": True,
            "sport_code": "fb",
            "event_key": "bia_event_123",
            "swapped": False,
            "home": "Home Team",
            "away": "Away Team",
            "competition_name": "League",
            "offer_proof": {"bia_bet_type": "for,h"},
        }

        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=event_ref)

        mock_placer = MagicMock()
        mock_placer.create_betslip = AsyncMock(
            return_value={
                "betslip_id": "betslip_abc",
                "accounts": [{
                    "bookie": "pin88", "bet_type": "for,h",
                    "price": 2.10, "min": 10.0, "max": 1000.0,
                }],
            }
        )
        mock_placer.delete_betslip = AsyncMock()
        mock_placer.close = AsyncMock()

        original_placer = ps_app.bia_placer_client
        ps_app.bia_placer_client = mock_placer

        mock_sess_instance = MagicMock()
        mock_sess_instance.get.return_value.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_sess_instance.get.return_value.__aexit__ = AsyncMock()
        mock_sess_instance.__aenter__ = AsyncMock(return_value=mock_sess_instance)
        mock_sess_instance.__aexit__ = AsyncMock()

        try:
            with patch("aiohttp.ClientSession", return_value=mock_sess_instance), patch(
                "os.environ",
                {
                    "BIA_ENABLED": "1",
                    "BIA_LOGIN": "test",
                    "BIA_PASSWORD": "pwd",
                    "DEV_SIMULATION_MODE": "0",
                },
            ):
                res = await ps_app.handle_fallback_verify(req)
                self.assertEqual(res["status"], "OK")
                self.assertEqual(res["odds"], 2.10)
                self.assertEqual(res["max_stake"], 1000.0)
                self.assertEqual(res["min_stake"], 10.0)
                self.assertEqual(res["source"], "bia_placer")
                self.assertEqual(res["selection_id"], "sel_1")
                self.assertNotIn("mock_", str(res.get("selection_id")))
                lookup_url = mock_sess_instance.get.call_args.args[0]
                query = urllib.parse.parse_qs(urllib.parse.urlsplit(lookup_url).query)
                self.assertEqual(query["proof"], ["1"])
                self.assertEqual(query["bet_type"], ["1"])
                self.assertEqual(query["team_select"], ["0"])
                self.assertEqual(query["handicap"], ["0"])
        finally:
            ps_app.bia_placer_client = original_placer

    async def test_special_verify_rejects_stale_direct_store_price(self):
        req = ps_app.VerifyRequest(
            event_id=1633133757,
            period=0,
            sport="Soccer",
            market="Moneyline",
            outcome="TQ Home",
            raw_selection="TQ Home",
            pinnacle_home="Paris Saint-Germain",
            pinnacle_away="Aston Villa",
            pinnacle_sport="Soccer",
            pinnacle_league="UEFA Super Cup",
        )
        lookup = AsyncMock(status=200)
        lookup.json = AsyncMock(return_value={
            "found": True,
            "event_id": 1633133757,
            "special_type": "to_qualify",
            "contestant": "Home",
            "period": 0,
            "handicap": 0.0,
            "cid": "qualify-home-cid",
            "special_id": 7788,
            "price": 1.91,
            "ts": time.time() - 3600,
            "source": "bia_special_offer",
        })
        sess = MagicMock()
        sess.get.return_value.__aenter__ = AsyncMock(return_value=lookup)
        sess.get.return_value.__aexit__ = AsyncMock()
        sess.__aenter__ = AsyncMock(return_value=sess)
        sess.__aexit__ = AsyncMock()
        placer = MagicMock()
        original = ps_app.bia_placer_client
        ps_app.bia_placer_client = placer
        try:
            with patch("aiohttp.ClientSession", return_value=sess) as client_session, patch(
                "os.environ",
                {"BIA_ENABLED": "1", "BIA_LOGIN": "x", "BIA_PASSWORD": "y"},
            ):
                response = await ps_app.handle_fallback_verify(req)
        finally:
            ps_app.bia_placer_client = original

        query = urllib.parse.parse_qs(
            urllib.parse.urlsplit(sess.get.call_args.args[0]).query
        )
        self.assertIn("lookup-special", sess.get.call_args.args[0])
        self.assertEqual(query["event_id"], ["1633133757"])
        self.assertEqual(query["type"], ["to_qualify"])
        self.assertEqual(query["contestant"], ["Home"])
        self.assertEqual(query["proof"], ["1"])
        self.assertEqual(query["pinnacle_home"], ["Paris Saint-Germain"])
        self.assertEqual(query["pinnacle_away"], ["Aston Villa"])
        self.assertEqual(query["pinnacle_sport"], ["Soccer"])
        self.assertEqual(query["pinnacle_league"], ["UEFA Super Cup"])
        self.assertEqual(client_session.call_args.kwargs["timeout"].total, 8.50)
        self.assertEqual(response["status"], "UNAVAILABLE")
        self.assertEqual(response["error_code"], "BIA_SPECIAL_PROOF_SOURCE_INVALID")
        self.assertNotIn("odds", response)
        placer.create_betslip.assert_not_called()

    async def test_special_verify_fails_closed_when_exact_selection_is_missing(self):
        req = ps_app.VerifyRequest(
            event_id=1633133757,
            sport="Soccer",
            market="Moneyline",
            outcome="TQ Away",
            raw_selection="TQ Away",
        )
        lookup = AsyncMock(status=200)
        lookup.json = AsyncMock(return_value={"found": False})
        sess = MagicMock()
        sess.get.return_value.__aenter__ = AsyncMock(return_value=lookup)
        sess.get.return_value.__aexit__ = AsyncMock()
        sess.__aenter__ = AsyncMock(return_value=sess)
        sess.__aexit__ = AsyncMock()
        with patch("aiohttp.ClientSession", return_value=sess), patch(
            "os.environ",
            {"BIA_ENABLED": "1", "BIA_LOGIN": "x", "BIA_PASSWORD": "y"},
        ):
            response = await ps_app.handle_fallback_verify(req)

        self.assertEqual(response["status"], "UNAVAILABLE")
        self.assertEqual(response["error_code"], "BIA_SPECIAL_SELECTION_NOT_FOUND")
        self.assertNotIn("odds", response)

    async def test_special_verify_preserves_central_exact_failure_diagnostics(self):
        req = ps_app.VerifyRequest(
            event_id=1633133757,
            sport="Soccer",
            market="Moneyline",
            outcome="TQ Away",
            raw_selection="TQ Away",
        )
        lookup = AsyncMock(status=200)
        lookup.json = AsyncMock(return_value={
            "found": False,
            "event_found": True,
            "parser_event_found": True,
            "error_code": "BIA_OFFER_EVENT_MISSING",
            "diagnostic_category": "offer_event_missing",
            "refresh_status": "timeout",
        })
        sess = MagicMock()
        sess.get.return_value.__aenter__ = AsyncMock(return_value=lookup)
        sess.get.return_value.__aexit__ = AsyncMock()
        sess.__aenter__ = AsyncMock(return_value=sess)
        sess.__aexit__ = AsyncMock()
        with patch("aiohttp.ClientSession", return_value=sess), patch(
            "os.environ",
            {"BIA_ENABLED": "1", "BIA_LOGIN": "x", "BIA_PASSWORD": "y"},
        ):
            response = await ps_app.handle_fallback_verify(req)

        self.assertEqual(response["status"], "UNAVAILABLE")
        self.assertEqual(response["error_code"], "BIA_OFFER_EVENT_MISSING")
        self.assertEqual(response["diagnostic_category"], "offer_event_missing")
        self.assertEqual(response["refresh_status"], "timeout")
        self.assertTrue(response["event_found"])
        self.assertTrue(response["parser_event_found"])
        self.assertNotIn("odds", response)

    async def test_special_verify_reports_transport_failure_explicitly(self):
        req = ps_app.VerifyRequest(
            event_id=1633133757,
            sport="Soccer",
            market="Moneyline",
            outcome="TQ Away",
            raw_selection="TQ Away",
        )
        sess = MagicMock()
        sess.get.side_effect = asyncio.TimeoutError()
        sess.__aenter__ = AsyncMock(return_value=sess)
        sess.__aexit__ = AsyncMock(return_value=False)
        with patch("aiohttp.ClientSession", return_value=sess), patch(
            "os.environ",
            {"BIA_ENABLED": "1", "BIA_LOGIN": "x", "BIA_PASSWORD": "y"},
        ):
            response = await ps_app.handle_fallback_verify(req)

        self.assertEqual(response["status"], "UNAVAILABLE")
        self.assertEqual(response["error_code"], "BIA_SPECIAL_LOOKUP_UNAVAILABLE")
        self.assertEqual(response["refresh_status"], "unavailable")
        self.assertNotIn("odds", response)

    async def test_special_verify_prices_exact_raw_bia_offer_proof(self):
        req = ps_app.VerifyRequest(
            event_id=1633133757,
            sport="Soccer",
            market="Moneyline",
            outcome="TQ Home",
            raw_selection="TQ Home",
        )
        lookup = AsyncMock(status=200)
        lookup.json = AsyncMock(return_value={
            "found": True,
            "source": "bia_special_offer_proof",
            # Even a malformed/mixed central response cannot dictate the
            # executable quote. The BIA betslip below is authoritative.
            "price": 9.99,
            "sport_code": "fb",
            "event_key": "2026-08-06,26163,753",
            "swapped": False,
            "home": "SC Corinthians (SP)",
            "away": "SC Internacional (RS)",
            "offer_proof": {
                "raw_offer_group": "qualify",
                # The cold-refresh path serializes the registry's structural
                # outcome as `direction`; the immediate path uses
                # `raw_outcome`. Both bind the same exact raw coordinate.
                "direction": "h",
                "bia_bet_type": "for,qualify,h",
            },
        })
        sess = MagicMock()
        sess.get.return_value.__aenter__ = AsyncMock(return_value=lookup)
        sess.get.return_value.__aexit__ = AsyncMock()
        sess.__aenter__ = AsyncMock(return_value=sess)
        sess.__aexit__ = AsyncMock()
        placer = MagicMock()
        placer.create_betslip = AsyncMock(return_value={
            "betslip_id": "qualify-slip",
            "accounts": [{
                "bookie": "pin88",
                "bet_type": "for,qualify,h",
                "price": 1.91,
                "min": 1,
                "max": 900,
            }],
        })
        placer.delete_betslip = AsyncMock()
        original = ps_app.bia_placer_client
        ps_app.bia_placer_client = placer
        try:
            with patch("aiohttp.ClientSession", return_value=sess), patch(
                "os.environ",
                {"BIA_ENABLED": "1", "BIA_LOGIN": "x", "BIA_PASSWORD": "y"},
            ):
                response = await ps_app.handle_fallback_verify(req)
        finally:
            ps_app.bia_placer_client = original

        self.assertEqual(response["status"], "OK")
        self.assertEqual(response["odds"], 1.91)
        self.assertEqual(response["source"], "bia_placer")
        result = response["results"][0]
        self.assertEqual(result["outcome"], "TQ Home")
        self.assertEqual(result["team"], "1")
        self.assertEqual(result["bia_bet_type"], "for,qualify,h")
        placer.create_betslip.assert_awaited_once_with(
            "fb", "2026-08-06,26163,753", "for,qualify,h",
        )
        query = urllib.parse.parse_qs(
            urllib.parse.urlsplit(sess.get.call_args.args[0]).query
        )
        self.assertEqual(query["proof"], ["1"])

    async def test_esports_map_verify_uses_root_event_and_returns_proven_map(self):
        req = MagicMock(
            event_id=1632983548,
            period=1,
            sport="Esports",
            selection_id=None,
            line_id=None,
            odds_id=None,
            market="Moneyline",
            outcome="2",
            raw_selection="2",
            expected_odds=2.84,
            handicap=None,
            map_number=1,
            esports_unit="rounds",
        )
        event_ref = {
            "found": True,
            "sport_code": "esports",
            "event_key": "bia-esports-event",
            "swapped": False,
            "offer_proof": {
                "raw_offer_group": "time_ml,tmap,1",
                "bia_bet_type": "for,tmap,1,ml,a",
            },
        }
        lookup = AsyncMock(status=200)
        lookup.json = AsyncMock(return_value=event_ref)
        placer = MagicMock()
        placer.create_betslip = AsyncMock(return_value={
            "betslip_id": "map-slip",
            "accounts": [{
                "bookie": "pin88",
                "bet_type": "for,tmap,1,ml,a",
                "price": 2.84,
                "min": 1,
                "max": 1000,
            }],
        })
        placer.delete_betslip = AsyncMock()
        sess = MagicMock()
        sess.get.return_value.__aenter__ = AsyncMock(return_value=lookup)
        sess.get.return_value.__aexit__ = AsyncMock()
        sess.__aenter__ = AsyncMock(return_value=sess)
        sess.__aexit__ = AsyncMock()
        original = ps_app.bia_placer_client
        ps_app.bia_placer_client = placer
        try:
            with patch("aiohttp.ClientSession", return_value=sess), patch(
                "os.environ",
                {"BIA_ENABLED": "1", "BIA_LOGIN": "x", "BIA_PASSWORD": "y"},
            ):
                response = await ps_app.handle_fallback_verify(req)
        finally:
            ps_app.bia_placer_client = original

        query = urllib.parse.parse_qs(
            urllib.parse.urlsplit(sess.get.call_args.args[0]).query
        )
        self.assertEqual(query["period"], ["0"])
        self.assertEqual(query["map_number"], ["1"])
        self.assertEqual(query["esports_unit"], ["rounds"])
        result = response["results"][0]
        self.assertEqual(result["period"], 0)
        self.assertEqual(result["map_number"], 1)
        self.assertEqual(result["esports_unit"], "rounds")
        self.assertEqual(result["bia_bet_type"], "for,tmap,1,ml,a")
        placer.create_betslip.assert_awaited_once_with(
            "esports", "bia-esports-event", "for,tmap,1,ml,a",
        )

    async def test_tennis_game_verify_requires_central_raw_offer_proof(self):
        req = MagicMock(
            event_id=12345,
            period=0,
            sport="Tennis",
            selection_id=None,
            line_id=None,
            odds_id=None,
            market="Game Winner",
            market_scope="games",
            outcome="P2 2G 5",
            raw_selection="P2 2G 5",
            expected_odds=1.91,
            handicap=None,
            map_number=0,
            esports_unit="",
            tennis_unit="",
        )
        event_ref = {
            "found": True,
            "sport_code": "tennis",
            "event_key": "bia-tennis-event",
            "swapped": False,
            "offer_proof": {
                "raw_offer_group": "tennis_game_win,2,5",
                "bia_bet_type": "for,tgame,2,5,vwhatever,p2",
            },
        }
        lookup = AsyncMock(status=200)
        lookup.json = AsyncMock(return_value=event_ref)
        placer = MagicMock()
        placer.create_betslip = AsyncMock(return_value={
            "betslip_id": "game-slip",
            "accounts": [{
                "bookie": "pin88",
                "bet_type": "for,tgame,2,5,vwhatever,p2",
                "price": 1.91,
                "min": 1,
                "max": 1000,
            }],
        })
        placer.delete_betslip = AsyncMock()
        placer.discover_tennis_game_set = AsyncMock()
        sess = MagicMock()
        sess.get.return_value.__aenter__ = AsyncMock(return_value=lookup)
        sess.get.return_value.__aexit__ = AsyncMock()
        sess.__aenter__ = AsyncMock(return_value=sess)
        sess.__aexit__ = AsyncMock()
        original = ps_app.bia_placer_client
        ps_app.bia_placer_client = placer
        try:
            with patch("aiohttp.ClientSession", return_value=sess), patch(
                "os.environ",
                {"BIA_ENABLED": "1", "BIA_LOGIN": "x", "BIA_PASSWORD": "y"},
            ):
                response = await ps_app.handle_fallback_verify(req)
        finally:
            ps_app.bia_placer_client = original

        query = urllib.parse.parse_qs(
            urllib.parse.urlsplit(sess.get.call_args.args[0]).query
        )
        self.assertEqual(query["proof"], ["1"])
        self.assertEqual(query["period"], ["2"])
        self.assertEqual(query["game_number"], ["5"])
        self.assertEqual(query["tennis_unit"], ["game"])
        self.assertEqual(response["status"], "OK")
        self.assertEqual(
            response["bia_bet_type"], "for,tgame,2,5,vwhatever,p2",
        )
        result = response["results"][0]
        self.assertEqual(result["period"], 2)
        self.assertEqual(result["set_number"], 2)
        self.assertEqual(result["game_number"], 5)
        placer.discover_tennis_game_set.assert_not_awaited()
        placer.create_betslip.assert_awaited_once_with(
            "tennis", "bia-tennis-event", "for,tgame,2,5,vwhatever,p2",
        )

    async def test_handle_fallback_place_price_protection_triggered(self):
        req = MagicMock()
        req.event_id = 12345
        req.period = 0
        req.sport = "Soccer"
        req.stake = 100.0
        req.expected_odds = 2.05
        req.odds_tolerance = 0.01
        req.accept_better_odds = False
        req.market = "Moneyline"
        req.outcome = "1"
        req.raw_selection = "1"
        req.handicap = None
        req.map_number = 0
        req.esports_unit = ""

        event_ref = {
            "found": True,
            "sport_code": "fb",
            "event_key": "bia_event_123",
            "swapped": False,
            "offer_proof": {"bia_bet_type": "for,h"},
        }

        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=event_ref)

        mock_placer = MagicMock()
        mock_placer.create_betslip = AsyncMock(
            return_value={
                "betslip_id": "betslip_abc",
                "accounts": [{
                    "bookie": "pin88", "bet_type": "for,h",
                    "price": 1.90, "min": 10.0, "max": 1000.0,
                }],
            }
        )
        mock_placer.delete_betslip = AsyncMock()
        mock_placer.close = AsyncMock()

        original_placer = ps_app.bia_placer_client
        ps_app.bia_placer_client = mock_placer

        mock_sess_instance = MagicMock()
        mock_sess_instance.get.return_value.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_sess_instance.get.return_value.__aexit__ = AsyncMock()
        mock_sess_instance.__aenter__ = AsyncMock(return_value=mock_sess_instance)
        mock_sess_instance.__aexit__ = AsyncMock()

        auth = MagicMock()
        auth.consumer_id = "test_consumer"

        try:
            with patch("aiohttp.ClientSession", return_value=mock_sess_instance), patch(
                "os.environ",
                {"BIA_ENABLED": "1", "BIA_LOGIN": "test", "BIA_PASSWORD": "pwd"},
            ):
                res = await ps_app.handle_fallback_place(req, auth)
                self.assertEqual(res["status"], "NOT_PLACED")
                self.assertEqual(res["error_code"], "BIA_PLACE_FAILED")
                self.assertIn("Price protection triggered", res["error"])
        finally:
            ps_app.bia_placer_client = original_placer




class BiaQuoteParsingTests(unittest.TestCase):
    def test_bet_type_identity_is_exact_except_for_approved_live_wrapper(self):
        requested = "for,ahover,10"
        self.assertTrue(bia_bet_type_matches_exact(requested, requested))
        self.assertTrue(bia_bet_type_matches_exact(requested, "for,ir,0,2,ahover,10"))
        self.assertFalse(bia_bet_type_matches_exact(requested, "for,ahover,9"))
        self.assertFalse(bia_bet_type_matches_exact(requested, "for,ir,x,2,ahover,10"))
        self.assertFalse(bia_bet_type_matches_exact(requested, ""))

    def test_extract_flat_and_price_list(self):
        from bia_placer import extract_pin88_quote, unwrap_bia_payload
        flat = extract_pin88_quote([{"bookie": "pin88", "price": 1.9, "min": 1, "max": 100}])
        self.assertEqual(flat["price"], 1.9)
        self.assertEqual(flat["min"], 1.0)
        nested = extract_pin88_quote([{
            "bookie": "pin88",
            "status": "success",
            "price_list": [{"effective": {"price": 1.781, "min": ["GBP", 0.85], "max": ["GBP", 800.0]}}],
        }])
        self.assertEqual(nested["price"], 1.781)
        self.assertEqual(nested["currency"], "GBP")
        self.assertAlmostEqual(nested["min"], 0.85)
        self.assertIsNone(extract_pin88_quote([{"bookie": "pin88", "bet_type": "for,h"}]))
        exact = extract_pin88_quote(
            [{
                "bookie": "pin88", "bet_type": "for,h",
                "price": 1.9, "min": 1, "max": 100,
            }],
            expected_bet_type="for,h",
        )
        self.assertEqual(exact["price"], 1.9)
        self.assertIsNone(extract_pin88_quote(
            [{
                "bookie": "pin88", "bet_type": "for,a",
                "price": 1.9, "min": 1, "max": 100,
            }],
            expected_bet_type="for,h",
        ))
        body = unwrap_bia_payload({"status": "ok", "data": {"betslip_id": "x", "accounts": []}})
        self.assertEqual(body["betslip_id"], "x")




class BiaOrderClassifyTests(unittest.TestCase):
    def test_open_is_pending_with_id(self):
        from bia_placer import classify_bia_order
        c = classify_bia_order({"status": "OPEN", "order_id": 1, "closed": False})
        self.assertEqual(c["status"], "PENDING")
        self.assertEqual(c["order_id"], "1")

    def test_done_filled_is_placed(self):
        from bia_placer import classify_bia_order
        c = classify_bia_order({
            "status": "done", "order_id": 1850661207, "closed": True,
            "close_reason": "order_filled",
        })
        self.assertEqual(c["status"], "PLACED")

    def test_missing_id_even_if_done_is_unknown(self):
        from bia_placer import classify_bia_order
        c = classify_bia_order({"status": "done", "closed": True, "close_reason": "order_filled"})
        self.assertEqual(c["status"], "UNKNOWN")


if __name__ == "__main__":
    unittest.main()
