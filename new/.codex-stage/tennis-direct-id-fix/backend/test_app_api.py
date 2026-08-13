import csv
import json
import os
import subprocess
import sys
import tempfile
import time
import types
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ["FORTED_ENABLED"] = "0"
os.environ["FORTED_FEED_URL"] = ""
os.environ["FORTED_FEED_USE_SSE"] = "0"
os.environ["FORTED_FEED_STREAM_URL"] = ""
os.environ["FORTED_LWS_TOKEN"] = ""
os.environ["ROBINARB_ALLOW_MOCK_FALLBACK"] = "1"
os.environ["ROBINARB_ALLOW_DEMO_USERS"] = "1"
os.environ["ROBINARB_CORS_ORIGINS"] = ""
os.environ["ROBINARB_FEED_KEYS"] = ""
os.environ["ROBINARB_STATS_ENABLED"] = "0"
os.environ["PIN888_STREAM_CACHE_ENABLED"] = "0"
os.environ["ROBINARB_MAX_STAKE_LIMIT"] = "1000"
os.environ["ROBINARB_BETFAIR_LIVE_PLACE_ENABLED"] = "0"
os.environ["PINNACLE_LIVE_PLACE_ENABLED"] = "0"

_TEST_RUNTIME = tempfile.TemporaryDirectory()
os.environ["ROBINARB_STATE_DB"] = os.path.join(_TEST_RUNTIME.name, "state.db")
os.environ["ROBINARB_LIMITS_HISTORY_FILE"] = os.path.join(_TEST_RUNTIME.name, "match_history.json")

from fastapi.testclient import TestClient

import forted_source
import server


def _reset_test_storage(users: dict[str, dict]) -> None:
    with server._storage._lock:  # noqa: SLF001 - tests intentionally isolate the singleton DB
        conn = server._storage._connect()  # noqa: SLF001
        conn.execute("DELETE FROM bets")
        conn.execute("DELETE FROM hidden_arbs")
        conn.execute("DELETE FROM meta")
        conn.execute("DELETE FROM users")
    for user in users.values():
        server._storage.upsert_user(user)


def _reset_test_match_limits() -> None:
    tracker = server._match_limits
    if tracker is None:
        return
    with tracker._lock:  # noqa: SLF001 - tests intentionally isolate the singleton tracker
        tracker._bet_history.clear()  # noqa: SLF001
        tracker.bet_attempts = 0
        tracker.bets_placed = 0
        if tracker.history_file_path:
            Path(tracker.history_file_path).parent.mkdir(parents=True, exist_ok=True)
            Path(tracker.history_file_path).write_text("{}\n", encoding="utf-8")


class RobinArbApiTests(unittest.TestCase):
    def setUp(self):
        server.FORTED_ENABLED = False
        server.FORTED_FEED_URL = ""
        server.FORTED_FEED_USE_SSE = False
        server.FORTED_FEED_STREAM_URL = ""
        server.ROBINARB_ALLOW_MOCK_FALLBACK = True
        server.ROBINARB_ALLOW_DEMO_USERS = True
        server.ROBINARB_CORS_ORIGINS = []
        server.ROBINARB_FEED_KEYS = []
        server.PIN888_STREAM_CACHE_ENABLED = False
        server.ROBINARB_ROBIN_WORK_TOP_N = 5
        server.ROBINARB_ROBIN_WORK_CANDIDATE_N = 10
        with server._lws_profile_lock:  # noqa: SLF001 - tests isolate module-level switch state
            server._lws_last_profile = server._canonical_lws_profile(os.getenv("FORTED_LWS_PROFILE", "pin_vbet"))
            server._lws_switch_started_at = 0.0
        server._users = server._build_initial_user_state()
        _reset_test_storage(server._users)
        _reset_test_match_limits()
        server._sessions.clear()
        server._arbs_cache = []
        server._arbs_source = "none"
        server._arbs_updated_at = 0
        server._rolling_arbs.clear()
        server._verified_quotes.clear()
        server._calculator_verify_claims.clear()
        server._stream_quote_cache.clear()
        server._login_attempts.clear()
        server._pinnacle_tennis_matchup_cache = (0.0, {})
        server.robin_margin._fork_price_cache.clear()
        server._storage.delete_hidden_items_for_user("owner")
        server._storage.delete_hidden_items_for_user("trader1")
        server._storage.delete_hidden_items_for_user("trader2")
        server.PINNACLE_API_BASE = "https://test-pinnacle.local/api/pinnacle"
        server.ROBINARB_VERIFY_PINNACLE_STREAM_FIRST = False
        async def prepare_sportsbook_requests(arb, quote, *, stake):
            return {
                "ok": True,
                "status": "BETSLIP_READY_REQUESTS",
                "event_url": arb.get("bk2_url"),
                "event_mapping_mode": "event_url",
                "market_id": str(quote.get("market_id")),
                "selection_id": str(quote.get("selection_id")),
                "odds": quote.get("current_odds"),
                "stake": stake,
                "min_stake": 0.1,
                "max_stake": 100.0,
                "coupon_validated": True,
                "submit_blocked": True,
            }

        async def prepare_sportsbook_betslip(arb, quote, *, stake, event_url=None):
            return {
                "ok": True,
                "status": "BETSLIP_READY_DRY_RUN",
                "event_url": event_url or arb.get("bk2_url"),
                "market_id": str(quote.get("market_id")),
                "selection_id": str(quote.get("selection_id")),
                "odds": quote.get("current_odds"),
                "stake": stake,
                "submit_blocked": True,
            }
        self.betfair_basket_patcher = patch.object(
            server,
            "_prepare_betfair_sportsbook_basket",
            new=prepare_sportsbook_betslip,
        )
        self.betfair_basket_patcher.start()
        self.addCleanup(self.betfair_basket_patcher.stop)
        self.betfair_request_patcher = patch.object(
            server,
            "_prepare_betfair_sportsbook_requests",
            new=prepare_sportsbook_requests,
        )
        self.betfair_request_patcher.start()
        self.addCleanup(self.betfair_request_patcher.stop)
        self.client_ctx = TestClient(server.app)
        self.client = self.client_ctx.__enter__()

    def tearDown(self):
        self.client_ctx.__exit__(None, None, None)

    def login(self, username: str, password: str) -> dict[str, str]:
        response = self.client.post(
            "/api/auth/login",
            json={"username": username, "password": password},
        )
        self.assertEqual(response.status_code, 200, response.text)
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}

    def stop_background_relay(self):
        relay = server._relay_thread
        if relay is not None:
            relay.running = False
            relay.join(timeout=1.0)
        server._relay_thread = None
        server._rolling_arbs.clear()

    def assume_forted_stream_alive(self):
        """Story 2.1: прематч-форки свежи по живости Forted-потока, не по personal
        updated_at — симулирует подключённый listener со свежим кадром, чтобы фикстуры,
        напрямую подставляющие server._arbs_cache, вели себя как в проде (где живой
        snapshot всегда сопровождается connected+свежий last_frame_at)."""
        original = server._relay_thread
        server._relay_thread = types.SimpleNamespace(connected=True, last_frame_at=time.time())
        self.addCleanup(setattr, server, "_relay_thread", original)

    def test_forted_team_names_swaps_reversed_english_names(self):
        home, away = server._forted_team_names_for_pinnacle({
            "home": "Хироко Кувата",
            "away": "Селин Неф",
            "team1_en": "Celine Naef",
            "team2_en": "Hiroko Kuwata",
        })

        self.assertEqual(home, "Hiroko Kuwata")
        self.assertEqual(away, "Celine Naef")

    def test_forted_team_names_swaps_reversed_country_translit_names(self):
        home, away = server._forted_team_names_for_pinnacle({
            "home": "Алжир",
            "away": "Иордания",
            "team1_en": "Jordan",
            "team2_en": "Algeria",
        })

        self.assertEqual(home, "Algeria")
        self.assertEqual(away, "Jordan")

    def test_pinnacle_result_rejects_packed_id_with_opposite_handicap_sign(self):
        payload = {
            "event_id": 1631736473,
            "market": "Handicap",
            "outcome": "H1 1.5",
            "market_metadata": {"family": "Handicap", "line": "1.5", "team": "1"},
        }
        result = {
            "status": "OK",
            "odds": "4.35",
            "event_id": 1631736473,
            "odds_id": "1631736473|0|2|0|1|-1.5",
            "selection_id": "3633428949|56729396411|1631736473|0|2|0|1|-1.50|0",
        }

        self.assertFalse(server._pinnacle_result_matches_request(payload, result))

    def test_identifier_metadata_parses_current_team_total_codes(self):
        self.assertEqual(
            server._identifier_metadata_from_parts(["1631", "0", "4", "0", "1", "108.5"])["direction"],
            "Under",
        )
        self.assertEqual(
            server._identifier_metadata_from_parts(["1631", "0", "5", "1", "1", "108.5"])["direction"],
            "Under",
        )
        self.assertEqual(
            server._identifier_metadata_from_parts(["1631", "0", "5", "7", "1", "108.5"])["direction"],
            "Over",
        )

    def test_period_prefix_is_parsed_for_forted_totals(self):
        metadata = server._parse_selection_market_metadata("1п Under (100,5)", "Totals", True)

        self.assertEqual(metadata["period_number"], 1)
        self.assertEqual(metadata["line"], "100.5")
        self.assertEqual(metadata["direction"], "Under")
        self.assertEqual(server._forted_translate_outcome("1п Under (100,5)", 0), "P1 T< 100.5")

    def test_individual_totals_keep_exact_team_and_direction_outcome(self):
        cases = (
            ("ИТ1Б(12,5)", True, "IT1> 12.5", "1", "Over"),
            ("ИТ2М(2,5)", False, "IT2< 2.5", "2", "Under"),
            ("IT1> 8.5", True, "IT1> 8.5", "1", "Over"),
            ("IT2< 10.5", False, "IT2< 10.5", "2", "Under"),
        )
        for raw, primary, expected, team, direction in cases:
            with self.subTest(raw=raw):
                metadata = server._parse_selection_market_metadata(raw, "Totals", primary)
                self.assertEqual(metadata["team"], team)
                self.assertEqual(metadata["direction"], direction)
                self.assertEqual(
                    server._infer_pinnacle_outcome(raw, "Totals", primary, metadata),
                    expected,
                )

    def test_ambiguous_individual_total_never_guesses_under(self):
        raw = "ИТ2(2,5)"
        metadata = server._parse_selection_market_metadata(raw, "Totals", False)

        self.assertNotIn("direction", metadata)
        self.assertIsNone(server._forted_translate_outcome(raw, 0))
        self.assertEqual(
            server._infer_pinnacle_outcome(raw, "Totals", False, metadata),
            raw,
        )
        self.assertIsNone(
            server._forted_contextual_special_outcome(
                raw,
                {"market_context": "corners"},
                0,
            )
        )

    def test_verbose_p1_p2_propositions_do_not_become_moneyline(self):
        for raw in ("П1 не проиграет", "П2 с форой", "П1 — следующий гол"):
            with self.subTest(raw=raw):
                metadata = server._parse_selection_market_metadata(raw, "Moneyline", True)
                self.assertEqual(
                    server._infer_pinnacle_outcome(raw, "Moneyline", True, metadata),
                    "",
                )
                self.assertIsNone(server._forted_translate_outcome(raw, 0))

    def test_no_id_individual_total_match_requires_exact_team_direction_and_line(self):
        payload = {
            "event_id": 1632862868,
            "market": "Totals",
            "outcome": "IT2< 2.5",
            "market_metadata": {
                "family": "Totals",
                "raw_selection": "ИТ2М(2,5)",
                "team": "2",
                "direction": "Under",
                "line": "2.5",
            },
        }
        exact = {
            "status": "OK",
            "event_id": 1632862868,
            "market": "Totals",
            "outcome": "Win2",
            "team": "2",
            "direction": "Under",
            "line": 2.5,
        }

        self.assertTrue(server._pinnacle_result_matches_request(payload, exact))
        self.assertFalse(
            server._pinnacle_result_matches_request(
                payload,
                {**exact, "direction": "Over"},
            )
        )
        self.assertFalse(
            server._pinnacle_result_matches_request(
                payload,
                {**exact, "outcome": "Win1", "team": "1"},
            )
        )
        self.assertFalse(
            server._pinnacle_result_matches_request(
                payload,
                {**exact, "line": 2.49},
            )
        )

        stale_arb = {
            "market": "Totals",
            "bk1_selection": "ИТ2М(2,5)",
            "bk1_outcome": "Win2",
            "pinnacle_hub_event_id": "1632862868",
            "pinnacle_market_metadata": payload["market_metadata"],
        }
        self.assertEqual(
            server._build_pinnacle_verify_payload(stale_arb)["outcome"],
            "IT2< 2.5",
        )
        self.assertEqual(
            server._canonical_pinnacle_selection_for_arb(stale_arb),
            "IT2< 2.5",
        )

    def test_exact_tennis_game_winner_translation_requires_set_and_game(self):
        arb = {
            "market": "Game Winner",
            "pinnacle_market_metadata": {
                "family": "Game Winner", "set_number": 2,
                "game_number": 5, "team": "2",
            },
        }
        self.assertEqual(
            server._forted_translate_for_pinnacle_service("гейм 5 П2", arb, 0),
            "P2 2G 5",
        )
        del arb["pinnacle_market_metadata"]["set_number"]
        self.assertIsNone(server._forted_translate_for_pinnacle_service("гейм 5 П2", arb, 0))

    def test_exact_tennis_game_quote_is_trusted_despite_large_live_drift(self):
        arb = {"bk1_odds": 5.59, "bk2_odds": 1.25, "profit_pct": 9.65}
        payload = {
            "market": "Game Winner",
            "outcome": "P2 2G 8",
            "market_metadata": {
                "family": "Game Winner", "set_number": 2,
                "game_number": 8, "team": "2",
            },
        }
        self.assertIsNone(server._untrusted_pinnacle_quote_suspicion(arb, 11.69, payload))

        del payload["market_metadata"]["set_number"]
        self.assertIsNotNone(server._untrusted_pinnacle_quote_suspicion(arb, 11.69, payload))
        resolved = {
            "source": "bia_placer", "set_number": 2,
            "game_number": 8, "team": "2",
        }
        self.assertIsNone(
            server._untrusted_pinnacle_quote_suspicion(arb, 11.69, payload, resolved)
        )

    def test_robin_work_blocks_only_incomplete_tennis_game_context(self):
        arb = {
            "sport": "Tennis", "market": "Game Winner",
            "pinnacle_market_metadata": {"family": "Game Winner", "game_number": 8, "team": "1"},
        }
        self.assertIn("set number", server._robin_work_verification_block_reason(arb))
        arb["pinnacle_market_metadata"]["set_number"] = 2
        self.assertEqual(server._robin_work_verification_block_reason(arb), "")

        esports = {
            "sport": "Esports", "market": "Moneyline",
            "pinnacle_market_metadata": {"family": "Moneyline", "raw_selection": "3к П2"},
        }
        self.assertIn("esports map", server._robin_work_verification_block_reason(esports))

    def test_esports_map_label_becomes_exact_pinnacle_period_coordinate(self):
        arb = {
            "sport": "Esports",
            "market": "Moneyline",
            "display_market": "Раунды, 1 карта",
            "bk1_selection": "Away",
            "bk1_outcome": "Win2",
            "pinnacle_market_metadata": {
                "family": "Moneyline", "raw_selection": "П2", "team": "2",
            },
        }

        metadata = server._ensure_esports_scope_metadata(arb)
        payload = server._build_pinnacle_verify_payload(arb)

        self.assertEqual(metadata["map_number"], 1)
        self.assertEqual(metadata["period_number"], 1)
        self.assertEqual(metadata["period_type"], "map")
        self.assertEqual(metadata["esports_unit"], "rounds")
        self.assertEqual(payload["map_number"], 1)
        self.assertEqual(payload["esports_unit"], "rounds")
        self.assertEqual(payload["period_type"], "map")
        self.assertEqual(server._stream_lookup_period(payload), 1)
        self.assertEqual(server._pinnacle_bia_event_period(arb, metadata), 0)
        margin_payload = server._build_pinnacle_market_margin_payload(arb, "П2")
        self.assertEqual(margin_payload["period"], 1)
        self.assertEqual(margin_payload["map_number"], 1)
        metadata["service_outcome"] = "P1 2"
        arb["pinnacle_service_outcome"] = "P1 2"
        bia_payload = server._normalize_pinnacle_bia_transport_payload(
            arb, dict(margin_payload), raw_selection="П2",
        )
        self.assertEqual(bia_payload["period"], 0)
        self.assertEqual(bia_payload["outcome"], "2")
        place_payload = server._build_pinnacle_service_place_payload(
            arb,
            {"verified_event_id": 1632983548, "service_outcome": "Win2"},
            stake=10.0,
            expected_odds=2.84,
        )
        self.assertEqual(place_payload["period"], 0)
        self.assertEqual(place_payload["map_number"], 1)
        self.assertEqual(place_payload["esports_unit"], "rounds")
        self.assertNotRegex(str(place_payload["outcome"]), r"^P1\s")
        exact_result = {
            "event_id": payload.get("event_id"),
            "outcome": "Win2",
            "market": "Moneyline",
            "period": 0,
            "map_number": 1,
            "esports_unit": "rounds",
            "bia_bet_type": "for,tmap,1,ml,a",
            "source": "bia_placer",
            "team": "2",
        }
        self.assertTrue(server._pinnacle_result_matches_request(payload, exact_result))
        self.assertFalse(server._pinnacle_result_matches_request(
            payload, {**exact_result, "map_number": 2},
        ))
        missing_map = dict(exact_result)
        missing_map.pop("map_number")
        self.assertFalse(server._pinnacle_result_matches_request(payload, missing_map))
        echoed_only = dict(exact_result)
        echoed_only.pop("bia_bet_type")
        self.assertFalse(server._pinnacle_result_matches_request(payload, echoed_only))
        payload_with_id = {**payload, "selection_id": "sel-map-1"}
        echoed_with_id = {**echoed_only, "selection_id": "sel-map-1"}
        self.assertFalse(server._pinnacle_result_matches_request(
            payload_with_id, echoed_with_id,
        ))
        wrong_map_with_id = {
            **exact_result,
            "selection_id": "sel-map-1",
            "map_number": 2,
            "bia_bet_type": "for,tmap,2,ml,a",
        }
        self.assertFalse(server._pinnacle_result_matches_request(
            payload_with_id, wrong_map_with_id,
        ))
        self.assertEqual(server._robin_work_verification_block_reason(arb), "")

    def test_esports_context_without_map_number_fails_closed(self):
        arb = {
            "sport": "Esports",
            "market": "Moneyline",
            "display_market": "Раунды, карта",
            "pinnacle_market_metadata": {
                "family": "Moneyline", "raw_selection": "П2", "team": "2",
            },
        }

        self.assertIn("map number", server._robin_work_verification_block_reason(arb))

    def test_esports_match_maps_unit_is_explicit_and_lower_units_take_priority(self):
        cases = (
            ("Карты, матч", "maps"),
            ("Maps, match", "maps"),
            ("Раунды, карты, матч", "rounds"),
            ("Kills, maps, match", "kills"),
        )
        for display_market, expected_unit in cases:
            with self.subTest(display_market=display_market):
                arb = {
                    "sport": "Esports",
                    "market": "Totals",
                    "display_market": display_market,
                    "bk1_selection": "ТБ(2,5)",
                    "pinnacle_market_metadata": {
                        "family": "Totals",
                        "raw_selection": "ТБ(2,5)",
                        "line": 2.5,
                        "direction": "Over",
                    },
                }

                metadata = server._ensure_esports_scope_metadata(arb)
                payload = server._normalize_pinnacle_bia_transport_payload(
                    arb,
                    server._build_pinnacle_verify_payload(arb),
                    raw_selection="ТБ(2,5)",
                )

                self.assertEqual(metadata["esports_unit"], expected_unit)
                self.assertEqual(payload["esports_unit"], expected_unit)
                self.assertNotIn("map_number", metadata)
                self.assertEqual(payload["period"], 0)

    def test_robin_work_cache_separates_match_and_map_moneyline(self):
        match_arb = {
            "pinnacle_market_metadata": {"family": "Moneyline", "raw_selection": "П2"},
        }
        map_arb = {
            "pinnacle_market_metadata": {
                "family": "Moneyline", "raw_selection": "П2",
                "map_number": 1, "period_number": 1, "period_type": "map",
            },
        }

        match_key = server._robin_work_cache_selection(match_arb, "П2")
        map_key = server._robin_work_cache_selection(map_arb, "П2")

        self.assertNotEqual(match_key, map_key)
        self.assertIn('"map_number":1', map_key)

    def test_simulation_or_mock_ids_can_never_match_real_pinnacle_request(self):
        payload = {
            "event_id": 1632974942,
            "market": "Handicap",
            "outcome": "Win2",
            "market_metadata": {"family": "Handicap", "team": "2", "line": "-1.5"},
        }
        candidates = (
            {
                "status": "OK", "odds": 1.84, "event_id": 1632974942,
                "market": "Handicap", "outcome": "Win2", "team": "2", "line": -1.5,
                "source": "simulation", "simulation": True,
            },
            {
                "status": "OK", "odds": 1.84, "event_id": 1632974942,
                "market": "Handicap", "outcome": "Win2", "team": "2", "line": -1.5,
                "selection_id": "sim_selection_id", "line_id": "sim_line_id",
            },
        )

        for candidate in candidates:
            with self.subTest(candidate=candidate):
                self.assertTrue(server._pinnacle_result_is_simulated(candidate))
                self.assertFalse(server._pinnacle_result_matches_request(payload, candidate))
                self.assertIn(
                    "simulation/mock",
                    server._untrusted_pinnacle_quote_suspicion({}, 1.84, payload, candidate),
                )

    def test_structural_line_requires_exact_value_not_odds_tolerance(self):
        payload = {
            "event_id": 1632974942,
            "market": "Handicap",
            "outcome": "H2 -1.5",
            "market_metadata": {
                "family": "Handicap", "team": "2", "line": "-1.5",
            },
        }
        nearby_line = {
            "status": "OK",
            "event_id": 1632974942,
            "market": "Handicap",
            "outcome": "H2 -1.5",
            "team": "2",
            "line": -1.49,
        }

        self.assertFalse(server._pinnacle_result_matches_request(payload, nearby_line))

    def test_robin_quote_requires_same_verified_pinnacle_base(self):
        coherent = {
            "sport": "Tennis",
            "market": "Handicap",
            "bk1_selection": "H2 -1.5",
            "bk1_outcome": "H2 -1.5",
            "pinnacle_hub_event_id": "1632974942",
            "pinnacle_market_metadata": {
                "family": "Handicap", "raw_selection": "H2 -1.5",
                "team": "2", "line": "-1.5",
            },
            "robin_work_verified_pin_odds": 1.8403,
            "robin_work_verified_market_key": "s;0;s;1.5",
            "robin_work_verified_event_id": 1632974942,
            "robin_work_verified_scope": "",
        }
        coherent["robin_work_verified_request_binding"] = server._robin_work_request_binding(coherent)
        wrong_price = {
            **coherent,
            "robin_work_verified_pin_odds": 2.61,
        }
        wrong_related_event = {**coherent, "robin_work_verified_event_id": 1632949639}

        self.assertTrue(
            server._robin_quote_matches_verified_pin(1.84, coherent, 1.87, "pinnacle-arcadia")
        )
        self.assertTrue(
            server._robin_quote_matches_verified_pin(1.85, coherent, 1.88, "pinnacle-arcadia")
        )
        self.assertFalse(
            server._robin_quote_matches_verified_pin(1.851, coherent, 1.88, "pinnacle-arcadia")
        )
        self.assertFalse(
            server._robin_quote_matches_verified_pin(
                1.84, wrong_price, 2.635, "pinnacle-arcadia"
            )
        )
        self.assertFalse(
            server._robin_quote_matches_verified_pin(
                1.84, wrong_related_event, 1.87, "pinnacle-arcadia"
            )
        )
        self.assertFalse(
            server._robin_quote_matches_verified_pin(1.84, coherent, 1.87, "fallback-table")
        )
        self.assertFalse(
            server._robin_quote_matches_verified_pin(
                1.84, coherent, 1.87, "pinnacle-exact-verify"
            )
        )

        scoped = {
            **coherent,
            "pinnacle_market_metadata": {
                **coherent["pinnacle_market_metadata"],
                "set_number": 1,
            },
        }
        scoped["robin_work_verified_pin_odds"] = 1.8403
        server._record_robin_work_verified_binding(
            scoped,
            resolved_event_id=9999999999,
            market_key="related-market",
        )
        self.assertFalse(
            server._robin_quote_matches_verified_pin(
                1.84, scoped, 1.87, "pinnacle-arcadia"
            )
        )
        server._record_robin_work_verified_binding(
            scoped,
            resolved_event_id=1632974999,
            parent_event_id=1632974942,
            related_event_verified=True,
            market_key="related-market",
        )
        self.assertTrue(
            server._robin_quote_matches_verified_pin(
                1.84, scoped, 1.87, "pinnacle-arcadia"
            )
        )

    def test_arcadia_rejects_related_event_without_explicit_scope(self):
        arb = {
            "id": "eala-zheng",
            "sport": "Tennis",
            "home": "Alexandra Eala",
            "away": "Qinwen Zheng",
            "market": "Handicap",
            "bk1_selection": "Handicap 2 (-1,5)",
            "bk1_outcome": "H2 -1.5",
            "bk1_odds": 1.84,
            "pinnacle_hub_event_id": "1632974942",
            "pinnacle_market_metadata": {
                "family": "Handicap", "raw_selection": "Ф2(-1,5)",
                "team": "2", "line": "-1.5",
            },
        }
        payload = server._build_pinnacle_verify_payload(arb)
        wrong_quote = {
            "matchup_id": 1632949639,
            "decimal_odds": 2.61,
            "market_type": "spread",
            "designation": "away",
            "points": -1.5,
            "period": 0,
            "market_key": "s;0;s;1.5",
            "market_margin": 0.034,
        }
        with patch.object(server.pinnacle_arcadia, "lookup_pinnacle", return_value=wrong_quote):
            result = server.asyncio.run(server._arcadia_quote_payload(arb, payload))

        self.assertIsNone(result)

    def make_hidden_test_arb(self, idx: int, *, event_id: int | None = None, market: str = "Moneyline", odds2: float = 2.4) -> dict:
        now = time.time()
        event = event_id if event_id is not None else 8100 + idx
        return {
            "id": f"hide-arb-{idx}",
            "sport": "Tennis",
            "league": "Tennis",
            "match": f"Hidden Player {event}A vs Hidden Player {event}B",
            "home": f"Hidden Player {event}A",
            "away": f"Hidden Player {event}B",
            "market": market,
            "side1": "Home",
            "side2": "Away",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
            "pinnacle_market_metadata": {"family": market, "raw_selection": "Home"},
            "pinnacle_hub_event_id": f"1638{event}",
            "_source": "listener",
            "bk1": "Pinnacle",
            "bk1_odds": 2.0,
            "bk2": "bet365.com",
            "bk2_odds": odds2,
            "robin_odds": 2.04,
            "profit_pct": 5.0 - idx * 0.1,
            "robin_profit_pct": 0.0,
            "event_id": event,
            "is_live": False,
            "updated_at": now,
        }

    def test_auth_required_for_user_api(self):
        self.assertEqual(self.client.get("/api/arbs").status_code, 401)
        self.assertEqual(self.client.get("/api/forks/feed").status_code, 401)
        self.assertEqual(self.client.get("/api/balance").status_code, 401)

    def test_betfair_event_url_reuses_canonical_paddy_slugs(self):
        arb = {
            "sport": "Теннис",
            "league": "Теннис - Австралия - ITF M25 Брисбен 2026",
            "home": "Шинджи Хазава",
            "away": "Колин Синклер",
            "bk2_url": (
                "https://www.paddypower.com/tennis/itf-m25-brisbane-aus/"
                "shinji-hazawa-v-colin-sinclair-35826668?tab=all-markets"
            ),
        }
        url = server._betfair_sportsbook_event_url(arb, {"event_id": "35826668"})
        self.assertEqual(
            url,
            "https://www.betfair.com/betting/tennis/itf-m25-brisbane-aus/"
            "shinji-hazawa-v-colin-sinclair/e-35826668?tab=all-markets",
        )

    def test_betfair_event_url_preserves_existing_betfair_path(self):
        arb = {
            "bk2_url": (
                "https://www.betfair.com/betting/tennis/wta-athens-2026/"
                "chan-kato-v-korneeva-kudermetova/e-35827625?foo=bar"
            ),
        }
        url = server._betfair_sportsbook_event_url(arb, {"event_id": "35827625"})
        self.assertEqual(
            url,
            "https://www.betfair.com/betting/tennis/wta-athens-2026/"
            "chan-kato-v-korneeva-kudermetova/e-35827625?tab=all-markets",
        )

    def test_betfair_run_dry_run_writes_attempt(self):
        headers = self.login("owner", "owner123")
        self.assume_forted_stream_alive()
        attempts_dir = Path(_TEST_RUNTIME.name) / "betfair-attempts"
        previous_attempts_dir = server.ROBINARB_BETFAIR_ATTEMPTS_DIR
        server.ROBINARB_BETFAIR_ATTEMPTS_DIR = str(attempts_dir)
        now = time.time()
        arb = self.make_hidden_test_arb(1, market="Moneyline", odds2=2.1)
        arb.update({
            "id": "bf-api-1",
            "bk2": "paddypower.com",
            "bk2_url": "https://www.betfair.com/betting/tennis/test/test-v-test/e-35811169",
            "bk2_selection": "Away",
            "side2": "Away",
            "bk1_odds": 2.0,
            "robin_odds": 1.5,
            "profit_pct": 1.25,
            "updated_at": now,
            "is_live": False,
        })
        server._arbs_cache = [arb]
        server._arbs_source = "listener"
        server._arbs_updated_at = now

        async def pricing(_arb):
            return {
                "robin_odds": 2.04,
                "robin_profit_pct": 0.25,
                "source": "test",
                "margin_calculated": True,
                "target_margin": 0.025,
            }

        async def pinnacle_verify(_arb):
            return {
                "verified": True,
                "status": "OK",
                "current_odds": 2.0,
                "source": "pinnacle-test",
            }

        async def betfair_quote(_arb, **_kwargs):
            return {
                "verified": True,
                "status": "OK",
                "current_odds": 2.1,
                "available_size": 100.0,
                "market_id": "1.234",
                "selection_id": 12345,
                "selection": "Player B",
            }

        cfg = server.betfair_executor.BetfairConfig(app_key="app", session_token="session")
        try:
            with patch.object(server, "_stats_price_for_arb", new=pricing), \
                patch.object(server, "_stats_verify_betslip_price", new=pinnacle_verify), \
                patch.object(server, "_resolve_betfair_quote", new=betfair_quote), \
                patch.object(server.betfair_executor.BetfairConfig, "from_env", return_value=cfg):
                response = self.client.post(
                    "/api/betfair/run",
                    json={"limit": 5, "stake": 1.0, "dry_run": True},
                    headers=headers,
                )
        finally:
            server.ROBINARB_BETFAIR_ATTEMPTS_DIR = previous_attempts_dir

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["candidate_count"], 1)
        self.assertEqual(body["success_count"], 1)
        self.assertTrue(body["dry_run"])
        self.assertEqual(body["results"][0]["record"]["status"], "DRY_RUN_READY")
        self.assertEqual(body["results"][0]["betfair_price_match"]["status"], "OK")
        self.assertIsNotNone(body["results"][0]["order_payload"])
        self.assertEqual(body["results"][0]["stake_plan"]["robin_odds"], 2.04)
        self.assertEqual(body["results"][0]["stake_plan"]["robin_stake"], 1.03)
        self.assertTrue(Path(body["attempts_csv"]).exists())

    def test_betfair_run_rejects_non_dry_run(self):
        headers = self.login("owner", "owner123")

        response = self.client.post(
            "/api/betfair/run",
            json={"limit": 5, "stake": 1.0, "dry_run": False},
            headers=headers,
        )

        self.assertEqual(response.status_code, 403, response.text)
        self.assertIn("Real Betfair submit is disabled", response.text)

    def test_betfair_run_prepares_every_ready_candidate(self):
        headers = self.login("owner", "owner123")
        self.assume_forted_stream_alive()
        attempts_dir = Path(_TEST_RUNTIME.name) / "betfair-attempts-multiple-baskets"
        previous_attempts_dir = server.ROBINARB_BETFAIR_ATTEMPTS_DIR
        server.ROBINARB_BETFAIR_ATTEMPTS_DIR = str(attempts_dir)
        now = time.time()
        arbs = []
        for index in (1, 2):
            arb = self.make_hidden_test_arb(index, market="Moneyline", odds2=2.1)
            arb.update({
                "id": f"bf-api-multiple-{index}",
                "bk2": "paddypower.com",
                "bk2_url": f"https://www.betfair.com/betting/tennis/test/test-{index}-v-away/e-3581116{index}",
                "bk2_selection": "Away",
                "side2": "Away",
                "bk1_odds": 2.0,
                "robin_odds": 2.04,
                "profit_pct": 1.25,
                "updated_at": now,
                "is_live": False,
            })
            arbs.append(arb)
        server._arbs_cache = arbs
        server._arbs_source = "listener"
        server._arbs_updated_at = now

        async def pricing(_arb):
            return {
                "robin_odds": 2.04,
                "robin_profit_pct": 0.25,
                "source": "test",
                "margin_calculated": True,
                "target_margin": 0.025,
            }

        async def pinnacle_verify(_arb):
            return {"verified": True, "status": "OK", "current_odds": 2.0, "source": "test"}

        async def betfair_quote(arb, **_kwargs):
            return {
                "verified": True,
                "status": "OK",
                "current_odds": 2.1,
                "market_id": f"1.{arb['id'][-1]}",
                "selection_id": f"1234{arb['id'][-1]}",
                "selection": "Away",
                "market_name": "Match Odds",
            }

        try:
            with patch.object(server, "_stats_price_for_arb", new=pricing), \
                patch.object(server, "_stats_verify_betslip_price", new=pinnacle_verify), \
                patch.object(server, "_resolve_betfair_quote", new=betfair_quote):
                response = self.client.post(
                    "/api/betfair/run",
                    json={"limit": 5, "stake": 1.0, "dry_run": True},
                    headers=headers,
                )
        finally:
            server.ROBINARB_BETFAIR_ATTEMPTS_DIR = previous_attempts_dir

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["candidate_count"], 2)
        self.assertEqual(body["success_count"], 2)
        self.assertEqual([result["record"]["status"] for result in body["results"]], [
            "DRY_RUN_READY",
            "DRY_RUN_READY",
        ])
        self.assertTrue(all(result["order_payload"]["coupon_validated"] for result in body["results"]))

    def test_betfair_run_never_calls_place_orders(self):
        headers = self.login("owner", "owner123")
        self.assume_forted_stream_alive()
        attempts_dir = Path(_TEST_RUNTIME.name) / "betfair-attempts-no-submit"
        previous_attempts_dir = server.ROBINARB_BETFAIR_ATTEMPTS_DIR
        server.ROBINARB_BETFAIR_ATTEMPTS_DIR = str(attempts_dir)
        now = time.time()
        arb = self.make_hidden_test_arb(1, market="Moneyline", odds2=2.1)
        arb.update({
            "id": "bf-api-no-submit",
            "bk2": "paddypower.com",
            "bk2_url": "https://www.betfair.com/betting/tennis/test/test-v-test/e-35811169",
            "bk2_selection": "Away",
            "side2": "Away",
            "bk1_odds": 2.0,
            "robin_odds": 1.5,
            "profit_pct": 1.25,
            "updated_at": now,
            "is_live": False,
        })
        server._arbs_cache = [arb]
        server._arbs_source = "listener"
        server._arbs_updated_at = now
        called = False
        basket_called = False

        async def pricing(_arb):
            return {
                "robin_odds": 2.04,
                "robin_profit_pct": 0.25,
                "source": "test",
                "margin_calculated": True,
                "target_margin": 0.025,
            }

        async def pinnacle_verify(_arb):
            return {
                "verified": True,
                "status": "OK",
                "current_odds": 2.0,
                "source": "pinnacle-test",
            }

        async def betfair_quote(_arb, **_kwargs):
            return {
                "verified": True,
                "status": "OK",
                "current_odds": 2.1,
                "available_size": 100.0,
                "market_id": "1.234",
                "selection_id": 12345,
                "selection": "Player B",
            }

        async def place_orders(_self, _payload):
            nonlocal called
            called = True
            raise AssertionError("dry-run endpoint must not call place_orders")

        async def prepare_browser_basket(*_args, **_kwargs):
            nonlocal basket_called
            basket_called = True
            raise AssertionError("request-ready dry-run must not invoke the browser basket")

        cfg = server.betfair_executor.BetfairConfig(app_key="app", session_token="session")
        try:
            with patch.object(server, "_stats_price_for_arb", new=pricing), \
                patch.object(server, "_stats_verify_betslip_price", new=pinnacle_verify), \
                patch.object(server, "_resolve_betfair_quote", new=betfair_quote), \
                patch.object(server.betfair_executor.BetfairConfig, "from_env", return_value=cfg), \
                patch.object(server, "_prepare_betfair_sportsbook_basket", new=prepare_browser_basket), \
                patch.object(server.betfair_executor.BetfairClient, "place_orders", new=place_orders):
                response = self.client.post(
                    "/api/betfair/run",
                    json={"limit": 5, "stake": 1.0, "dry_run": True},
                    headers=headers,
                )
        finally:
            server.ROBINARB_BETFAIR_ATTEMPTS_DIR = previous_attempts_dir

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["success_count"], 1)
        self.assertEqual(body["results"][0]["record"]["status"], "DRY_RUN_READY")
        self.assertIsNotNone(body["results"][0]["order_payload"])
        self.assertFalse(called)
        self.assertFalse(basket_called)

    def test_betfair_run_accepts_betfair_price_change_within_tolerance(self):
        headers = self.login("owner", "owner123")
        self.assume_forted_stream_alive()
        attempts_dir = Path(_TEST_RUNTIME.name) / "betfair-attempts-price-mismatch"
        previous_attempts_dir = server.ROBINARB_BETFAIR_ATTEMPTS_DIR
        server.ROBINARB_BETFAIR_ATTEMPTS_DIR = str(attempts_dir)
        now = time.time()
        arb = self.make_hidden_test_arb(1, market="Moneyline", odds2=2.1)
        arb.update({
            "id": "bf-api-price-within-tolerance",
            "bk2": "paddypower.com",
            "bk2_url": "https://www.betfair.com/betting/tennis/test/test-v-test/e-35811169",
            "bk2_selection": "Away",
            "side2": "Away",
            "bk1_odds": 2.0,
            "robin_odds": 1.5,
            "profit_pct": 1.25,
            "updated_at": now,
            "is_live": False,
        })
        server._arbs_cache = [arb]
        server._arbs_source = "listener"
        server._arbs_updated_at = now

        async def pricing(_arb):
            return {
                "robin_odds": 2.04,
                "robin_profit_pct": 0.25,
                "source": "test",
                "margin_calculated": True,
                "target_margin": 0.025,
            }

        async def pinnacle_verify(_arb):
            return {
                "verified": True,
                "status": "OK",
                "current_odds": 2.0,
                "source": "pinnacle-test",
            }

        async def betfair_quote(_arb, **_kwargs):
            return {
                "verified": True,
                "status": "OK",
                "current_odds": 2.1009,
                "available_size": 100.0,
                "market_id": "1.234",
                "selection_id": 12345,
                "selection": "Player B",
            }

        cfg = server.betfair_executor.BetfairConfig(app_key="app", session_token="session")
        try:
            with patch.object(server, "_stats_price_for_arb", new=pricing), \
                patch.object(server, "_stats_verify_betslip_price", new=pinnacle_verify), \
                patch.object(server, "_resolve_betfair_quote", new=betfair_quote), \
                patch.object(server.betfair_executor.BetfairConfig, "from_env", return_value=cfg):
                response = self.client.post(
                    "/api/betfair/run",
                    json={"limit": 5, "stake": 1.0, "dry_run": True},
                    headers=headers,
                )
        finally:
            server.ROBINARB_BETFAIR_ATTEMPTS_DIR = previous_attempts_dir

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["candidate_count"], 1)
        self.assertEqual(body["success_count"], 1)
        result = body["results"][0]
        self.assertEqual(result["record"]["status"], "DRY_RUN_READY")
        self.assertEqual(result["betfair_price_match"]["status"], "OK")
        self.assertEqual(set(result["betfair_price_match"]), {"ok", "status"})
        self.assertEqual(result["record"]["failure_reason"], "")
        self.assertIsNotNone(result["order_payload"])

    def test_betfair_run_rejects_processing_pinnacle_status(self):
        headers = self.login("owner", "owner123")
        self.assume_forted_stream_alive()
        attempts_dir = Path(_TEST_RUNTIME.name) / "betfair-attempts-processing-pin"
        previous_attempts_dir = server.ROBINARB_BETFAIR_ATTEMPTS_DIR
        server.ROBINARB_BETFAIR_ATTEMPTS_DIR = str(attempts_dir)
        now = time.time()
        arb = self.make_hidden_test_arb(1, market="Moneyline", odds2=2.1)
        arb.update({
            "id": "bf-api-processing-pin",
            "bk2": "paddypower.com",
            "bk2_url": "https://www.betfair.com/betting/tennis/test/test-v-test/e-35811169",
            "bk2_selection": "Away",
            "side2": "Away",
            "bk1_odds": 2.0,
            "robin_odds": 1.5,
            "profit_pct": 1.25,
            "updated_at": now,
            "is_live": False,
        })
        server._arbs_cache = [arb]
        server._arbs_source = "listener"
        server._arbs_updated_at = now

        async def pricing(_arb):
            return {
                "robin_odds": 2.04,
                "robin_profit_pct": 0.25,
                "source": "test",
                "margin_calculated": True,
                "target_margin": 0.025,
            }

        async def pinnacle_verify(_arb):
            return {
                "verified": True,
                "status": "OK",
                "result_status": "PROCESSING",
                "current_odds": 2.0,
                "source": "pinnacle-test",
            }

        async def betfair_quote(_arb, **_kwargs):
            return {
                "verified": True,
                "status": "OK",
                "current_odds": 2.1,
                "available_size": 100.0,
                "market_id": "1.234",
                "selection_id": 12345,
                "selection": "Player B",
            }

        cfg = server.betfair_executor.BetfairConfig(app_key="app", session_token="session")
        try:
            with patch.object(server, "_stats_price_for_arb", new=pricing), \
                patch.object(server, "_stats_verify_betslip_price", new=pinnacle_verify), \
                patch.object(server, "_resolve_betfair_quote", new=betfair_quote), \
                patch.object(server.betfair_executor.BetfairConfig, "from_env", return_value=cfg):
                response = self.client.post(
                    "/api/betfair/run",
                    json={"limit": 5, "stake": 1.0, "dry_run": True},
                    headers=headers,
                )
        finally:
            server.ROBINARB_BETFAIR_ATTEMPTS_DIR = previous_attempts_dir

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["candidate_count"], 1)
        self.assertEqual(body["success_count"], 0)
        result = body["results"][0]
        self.assertEqual(result["record"]["status"], "REJECTED")
        self.assertIn("pinnacle_PROCESSING", result["record"]["failure_reason"])
        self.assertIsNone(result["order_payload"])

    def test_betfair_sportsbook_does_not_apply_exchange_liquidity(self):
        headers = self.login("owner", "owner123")
        self.assume_forted_stream_alive()
        attempts_dir = Path(_TEST_RUNTIME.name) / "betfair-attempts-low-liquidity"
        previous_attempts_dir = server.ROBINARB_BETFAIR_ATTEMPTS_DIR
        server.ROBINARB_BETFAIR_ATTEMPTS_DIR = str(attempts_dir)
        now = time.time()
        arb = self.make_hidden_test_arb(1, market="Moneyline", odds2=2.1)
        arb.update({
            "id": "bf-api-low-liq",
            "bk2": "paddypower.com",
            "bk2_url": "https://www.betfair.com/betting/tennis/test/test-v-test/e-35811169",
            "bk2_selection": "Away",
            "side2": "Away",
            "bk1_odds": 2.0,
            "robin_odds": 2.04,
            "profit_pct": 1.25,
            "updated_at": now,
            "is_live": False,
        })
        server._arbs_cache = [arb]
        server._arbs_source = "listener"
        server._arbs_updated_at = now

        async def pricing(_arb):
            return {
                "robin_odds": 2.04,
                "robin_profit_pct": 0.25,
                "source": "test",
                "margin_calculated": True,
                "target_margin": 0.025,
            }

        async def pinnacle_verify(_arb):
            return {
                "verified": True,
                "status": "OK",
                "current_odds": 2.0,
                "source": "pinnacle-test",
            }

        async def betfair_quote(_arb, **_kwargs):
            return {
                "verified": True,
                "status": "OK",
                "current_odds": 2.1,
                "available_size": 0.996,
                "market_id": "1.234",
                "selection_id": 12345,
                "selection": "Player B",
            }

        cfg = server.betfair_executor.BetfairConfig(app_key="app", session_token="session")
        try:
            with patch.object(server, "_stats_price_for_arb", new=pricing), \
                patch.object(server, "_stats_verify_betslip_price", new=pinnacle_verify), \
                patch.object(server, "_resolve_betfair_quote", new=betfair_quote), \
                patch.object(server.betfair_executor.BetfairConfig, "from_env", return_value=cfg):
                response = self.client.post(
                    "/api/betfair/run",
                    json={"limit": 5, "stake": 1.0, "dry_run": True},
                    headers=headers,
                )
        finally:
            server.ROBINARB_BETFAIR_ATTEMPTS_DIR = previous_attempts_dir

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["candidate_count"], 1)
        self.assertEqual(body["success_count"], 1)
        self.assertEqual(body["results"][0]["record"]["status"], "DRY_RUN_READY")
        self.assertEqual(body["results"][0]["record"]["failure_reason"], "")
        self.assertEqual(body["results"][0]["order_payload"]["provider"], "betfair-sportsbook")

    def test_betfair_run_rejects_when_robin_pricing_fails(self):
        headers = self.login("owner", "owner123")
        self.assume_forted_stream_alive()
        attempts_dir = Path(_TEST_RUNTIME.name) / "betfair-attempts-pricing-fail"
        previous_attempts_dir = server.ROBINARB_BETFAIR_ATTEMPTS_DIR
        server.ROBINARB_BETFAIR_ATTEMPTS_DIR = str(attempts_dir)
        now = time.time()
        arb = self.make_hidden_test_arb(1, market="Moneyline", odds2=2.1)
        arb.update({
            "id": "bf-api-pricing-fail",
            "bk2": "paddypower.com",
            "bk2_url": "https://www.betfair.com/betting/tennis/test/test-v-test/e-35811169",
            "bk2_selection": "Away",
            "side2": "Away",
            "bk1_odds": 2.0,
            "robin_odds": 1.5,
            "profit_pct": 1.25,
            "updated_at": now,
            "is_live": False,
        })
        server._arbs_cache = [arb]
        server._arbs_source = "listener"
        server._arbs_updated_at = now

        async def pricing(_arb):
            raise RuntimeError("pricing unavailable")

        async def pinnacle_verify(_arb):
            return {
                "verified": True,
                "status": "OK",
                "current_odds": 2.0,
                "source": "pinnacle-test",
            }

        async def betfair_quote(_arb, **_kwargs):
            return {
                "verified": True,
                "status": "OK",
                "current_odds": 2.1,
                "available_size": 100.0,
                "market_id": "1.234",
                "selection_id": 12345,
                "selection": "Player B",
            }

        cfg = server.betfair_executor.BetfairConfig(app_key="app", session_token="session")
        try:
            with patch.object(server, "_stats_price_for_arb", new=pricing), \
                patch.object(server, "_stats_verify_betslip_price", new=pinnacle_verify), \
                patch.object(server, "_resolve_betfair_quote", new=betfair_quote), \
                patch.object(server.betfair_executor.BetfairConfig, "from_env", return_value=cfg):
                response = self.client.post(
                    "/api/betfair/run",
                    json={"limit": 5, "stake": 1.0, "dry_run": True},
                    headers=headers,
                )
        finally:
            server.ROBINARB_BETFAIR_ATTEMPTS_DIR = previous_attempts_dir

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["candidate_count"], 1)
        self.assertEqual(body["success_count"], 0)
        self.assertEqual(body["results"][0]["record"]["status"], "REJECTED")
        self.assertIn("robin_pricing_failed", body["results"][0]["record"]["failure_reason"])
        self.assertIsNone(body["results"][0]["stake_plan"])

    def test_betfair_run_rejects_non_authoritative_robin_pricing(self):
        headers = self.login("owner", "owner123")
        self.assume_forted_stream_alive()
        attempts_dir = Path(_TEST_RUNTIME.name) / "betfair-attempts-fallback-pricing"
        previous_attempts_dir = server.ROBINARB_BETFAIR_ATTEMPTS_DIR
        server.ROBINARB_BETFAIR_ATTEMPTS_DIR = str(attempts_dir)
        now = time.time()
        arb = self.make_hidden_test_arb(1, market="Moneyline", odds2=2.1)
        arb.update({
            "id": "bf-api-fallback-pricing",
            "bk2": "paddypower.com",
            "bk2_url": "https://www.betfair.com/betting/tennis/test/test-v-test/e-35811169",
            "bk2_selection": "Away",
            "side2": "Away",
            "bk1_odds": 2.0,
            "robin_odds": 1.5,
            "profit_pct": 1.25,
            "updated_at": now,
            "is_live": False,
        })
        server._arbs_cache = [arb]
        server._arbs_source = "listener"
        server._arbs_updated_at = now

        async def pricing(_arb):
            return {
                "robin_odds": 2.04,
                "robin_profit_pct": 0.25,
                "source": "fallback-table",
                "margin_calculated": False,
            }

        async def pinnacle_verify(_arb):
            return {
                "verified": True,
                "status": "OK",
                "current_odds": 2.0,
                "source": "pinnacle-test",
            }

        async def betfair_quote(_arb, **_kwargs):
            return {
                "verified": True,
                "status": "OK",
                "current_odds": 2.1,
                "available_size": 100.0,
                "market_id": "1.234",
                "selection_id": 12345,
                "selection": "Player B",
            }

        cfg = server.betfair_executor.BetfairConfig(app_key="app", session_token="session")
        try:
            with patch.object(server, "_stats_price_for_arb", new=pricing), \
                patch.object(server, "_stats_verify_betslip_price", new=pinnacle_verify), \
                patch.object(server, "_resolve_betfair_quote", new=betfair_quote), \
                patch.object(server.betfair_executor.BetfairConfig, "from_env", return_value=cfg):
                response = self.client.post(
                    "/api/betfair/run",
                    json={"limit": 5, "stake": 1.0, "dry_run": True},
                    headers=headers,
                )
        finally:
            server.ROBINARB_BETFAIR_ATTEMPTS_DIR = previous_attempts_dir

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["candidate_count"], 1)
        self.assertEqual(body["success_count"], 0)
        self.assertEqual(body["results"][0]["record"]["status"], "REJECTED")
        self.assertIn("live Robin odds are not authoritative", body["results"][0]["record"]["failure_reason"])
        self.assertIsNone(body["results"][0]["stake_plan"])

    def test_betfair_run_rejects_stale_authoritative_robin_cache(self):
        headers = self.login("owner", "owner123")
        self.assume_forted_stream_alive()
        attempts_dir = Path(_TEST_RUNTIME.name) / "betfair-attempts-stale-robin-cache"
        previous_attempts_dir = server.ROBINARB_BETFAIR_ATTEMPTS_DIR
        server.ROBINARB_BETFAIR_ATTEMPTS_DIR = str(attempts_dir)
        now = time.time()
        event_id = "1631999"
        arb = self.make_hidden_test_arb(1, market="Moneyline", odds2=2.1)
        arb.update({
            "id": "bf-api-stale-robin-cache",
            "sport": "Tennis",
            "bk2": "paddypower.com",
            "bk2_url": "https://www.betfair.com/betting/tennis/test/test-v-test/e-35811169",
            "bk2_selection": "Away",
            "side2": "Away",
            "bk1_selection": "Home",
            "pinnacle_market_metadata": {"family": "Moneyline", "raw_selection": "Home"},
            "pinnacle_hub_event_id": event_id,
            "_source": "listener",
            "bk1_odds": 2.0,
            "robin_odds": 1.5,
            "profit_pct": 1.25,
            "updated_at": now,
            "is_live": False,
        })
        server._arbs_cache = [arb]
        server._arbs_source = "listener"
        server._arbs_updated_at = now
        cache_key = server.robin_margin.stream_cache_key(event_id, "Tennis", "Home", "Moneyline")
        server.robin_margin._fork_price_cache[cache_key] = {
            "ts": now - server.robin_margin.BOARD_TTL - 5,
            "pin_odds": 2.0,
            "robin_odds": 9.99,
            "source": "hub-board",
            "price_signature": "",
        }

        async def pinnacle_verify(_arb):
            return {
                "verified": True,
                "status": "OK",
                "current_odds": 2.0,
                "source": "pinnacle-test",
            }

        async def betfair_quote(_arb, **_kwargs):
            return {
                "verified": True,
                "status": "OK",
                "current_odds": 2.1,
                "available_size": 100.0,
                "market_id": "1.234",
                "selection_id": 12345,
                "selection": "Player B",
            }

        async def no_stream_lookup(**_kwargs):
            return None

        async def no_board(_event_id, force=False):
            return False

        async def no_compact_margin(*_args, **_kwargs):
            return None

        cfg = server.betfair_executor.BetfairConfig(app_key="app", session_token="session")
        try:
            with patch.object(server, "_stats_verify_betslip_price", new=pinnacle_verify), \
                patch.object(server, "_resolve_betfair_quote", new=betfair_quote), \
                patch.object(server.betfair_executor.BetfairConfig, "from_env", return_value=cfg), \
                patch.object(server.pinnacle_hub, "lookup_stream_price", new=no_stream_lookup), \
                patch.object(server.robin_margin, "ensure_board", new=no_board), \
                patch.object(server, "_pinnacle_compact_margin_price_for_robin_work", new=no_compact_margin):
                response = self.client.post(
                    "/api/betfair/run",
                    json={"limit": 5, "stake": 1.0, "dry_run": True},
                    headers=headers,
                )
        finally:
            server.ROBINARB_BETFAIR_ATTEMPTS_DIR = previous_attempts_dir

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["candidate_count"], 1)
        self.assertEqual(body["success_count"], 0)
        result = body["results"][0]
        self.assertEqual(result["record"]["status"], "REJECTED")
        self.assertEqual(result["record"]["robin_odds"], 2.03)
        self.assertIn("live Robin odds are not authoritative", result["record"]["failure_reason"])
        self.assertIsNone(result["stake_plan"])
        self.assertIsNone(result["order_payload"])

    def test_betfair_run_rejects_disabled_price_guards(self):
        headers = self.login("owner", "owner123")
        for payload in (
            {"limit": 5, "stake": 1.0, "dry_run": True, "verify_betfair": False},
            {"limit": 5, "stake": 1.0, "dry_run": True, "verify_pinnacle": False},
            {"limit": 5, "stake": 1.0, "dry_run": True, "require_price_match": False},
        ):
            with self.subTest(payload=payload):
                response = self.client.post("/api/betfair/run", json=payload, headers=headers)

            self.assertEqual(response.status_code, 400, response.text)
            self.assertIn("requires verify_pinnacle=true", response.text)

    def test_betfair_run_rejects_invalid_stake_sizes(self):
        headers = self.login("owner", "owner123")
        for payload in (
            {"limit": 5, "stake": 0.5, "dry_run": True},
            {"limit": 5, "stake": 1.005, "dry_run": True},
            {"limit": 5, "stake": 10.0, "dry_run": True},
        ):
            with self.subTest(payload=payload):
                response = self.client.post("/api/betfair/run", json=payload, headers=headers)

            self.assertEqual(response.status_code, 400, response.text)

    def test_betfair_stake_limits_ignore_env_overrides(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = os.environ.copy()
            env.update({
                "FORTED_ENABLED": "0",
                "FORTED_FEED_URL": "",
                "FORTED_FEED_USE_SSE": "0",
                "FORTED_FEED_STREAM_URL": "",
                "ROBINARB_ALLOW_MOCK_FALLBACK": "1",
                "ROBINARB_ALLOW_DEMO_USERS": "1",
                "ROBINARB_CORS_ORIGINS": "",
                "ROBINARB_FEED_KEYS": "",
                "ROBINARB_STATS_ENABLED": "0",
                "PIN888_STREAM_CACHE_ENABLED": "0",
                "ROBINARB_STATE_DB": str(Path(tmp) / "state.db"),
                "ROBINARB_LIMITS_HISTORY_FILE": str(Path(tmp) / "match_history.json"),
                "ROBINARB_BETFAIR_MIN_STAKE": "0.01",
                "ROBINARB_BETFAIR_DEFAULT_STAKE": "5.00",
                "ROBINARB_BETFAIR_MAX_STAKE": "10.00",
            })
            result = subprocess.run(
                [
                    sys.executable,
                    "-c",
                    (
                        "import json, server; "
                        "print(json.dumps(["
                        "server.ROBINARB_BETFAIR_MIN_STAKE, "
                        "server.ROBINARB_BETFAIR_DEFAULT_STAKE, "
                        "server.ROBINARB_BETFAIR_MAX_STAKE"
                        "]))"
                    ),
                ],
                cwd=Path(__file__).parent,
                env=env,
                check=True,
                capture_output=True,
                text=True,
            )

        self.assertEqual(json.loads(result.stdout.strip().splitlines()[-1]), [1.0, 1.0, 1.0])

    def test_betfair_status_allows_betfair_profile(self):
        headers = self.login("owner", "owner123")

        response = self.client.get("/api/betfair/status", headers=headers)

        self.assertEqual(response.status_code, 200, response.text)
        profile = response.json()["profile"]
        self.assertTrue(profile["profile_available"])
        self.assertIn("pin_paddy", profile["allowed_profiles"])
        self.assertNotIn("pin_betfair", profile["allowed_profiles"])
        self.assertEqual(profile["profile_config"], "config_pin_paddy.toml")

    def test_betfair_status_reports_mapped_sportsbook_profile_config(self):
        headers = self.login("owner", "owner123")
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "config_pin_paddy.toml").write_text("[capture]\n", encoding="utf-8")
            with patch.dict(os.environ, {"FORTED_RUST_CONFIG_DIR": tmp}):
                response = self.client.get("/api/betfair/status", headers=headers)

        self.assertEqual(response.status_code, 200, response.text)
        profile = response.json()["profile"]
        self.assertEqual(profile["profile_config"], "config_pin_paddy.toml")
        self.assertTrue(profile["profile_config_exists"])
        self.assertTrue(profile["sportsbook_config_exists"])
        self.assertFalse(profile["old_betbetting_config_exists"])
        self.assertFalse(profile["exchange_config_exists"])
        self.assertFalse(profile["config_pin_betfair_exists"])

    def test_betfair_status_reports_sportsbook_and_ignored_exchange_diagnostics(self):
        headers = self.login("owner", "owner123")
        self.assume_forted_stream_alive()
        now = time.time()
        with_id = self.make_hidden_test_arb(1, market="Moneyline", odds2=2.1)
        with_id.update({
            "id": "bf-with-id",
            "bk2": "paddypower.com",
            "bk2_url": "https://www.betfair.com/betting/tennis/atp/test-v-test/e-35731336",
            "bk2_raw_link": "35731336",
            "betfair_market_id": "924.23456789",
            "updated_at": now,
            "_source": "listener",
        })
        missing_id = self.make_hidden_test_arb(2, market="Moneyline", odds2=2.2)
        missing_id.update({
            "id": "bf-missing-id",
            "bk2": "betfair.com",
            "bk2_url": "https://www.betfair.com/exchange/plus/football/event/123",
            "updated_at": now,
            "_source": "listener",
        })
        server._arbs_cache = [with_id, missing_id]
        server._arbs_source = "listener"
        server._arbs_updated_at = now

        async def runtime_status():
            return {
                "source": "rust",
                "available": True,
                "profile": None,
                "active_config": "config_pin_betbetting.toml",
                "summary": {"active_config": "config_pin_betbetting.toml"},
            }

        with patch.object(server, "_forted_runtime_status", runtime_status):
            response = self.client.get("/api/betfair/status", headers=headers)

        self.assertEqual(response.status_code, 200, response.text)
        diagnostics = response.json()["diagnostics"]
        self.assertEqual(diagnostics["betfair_fresh_count"], 1)
        self.assertEqual(diagnostics["betfair_with_market_id_count"], 1)
        self.assertEqual(diagnostics["betfair_missing_market_id_count"], 0)
        self.assertEqual(diagnostics["betfair_exchange_ignored_count"], 1)
        self.assertEqual(diagnostics["samples"][0]["betfair_market_id"], "924.23456789")
        self.assertEqual(response.json()["profile"]["runtime_active_config"], "config_pin_betbetting.toml")

    def test_admin_stats_endpoints_require_admin(self):
        trader_headers = self.login("trader1", "trader123")
        self.assertEqual(self.client.get("/api/admin/stats/summary", headers=trader_headers).status_code, 403)
        self.assertEqual(self.client.get("/api/admin/stats/records", headers=trader_headers).status_code, 403)
        self.assertEqual(self.client.get("/api/admin/stats/download", headers=trader_headers).status_code, 403)
        self.assertEqual(self.client.get("/api/admin/stats/records/rec1", headers=trader_headers).status_code, 403)
        self.assertEqual(self.client.post("/api/admin/stats/records/rec1/settle", json={"result": "donor_win"}, headers=trader_headers).status_code, 403)
        self.assertEqual(self.client.get("/api/admin/stats/records/rec1/download", headers=trader_headers).status_code, 403)
        self.assertEqual(self.client.get("/api/admin/stats/records/rec1/events.csv", headers=trader_headers).status_code, 403)

    def test_admin_stats_reads_collector_csv_and_downloads(self):
        stats_dir = Path(_TEST_RUNTIME.name) / "stats"
        stats_dir.mkdir(parents=True, exist_ok=True)
        csv_path = stats_dir / "robinarb_stats.csv"
        bet1 = stats_dir / "bets" / "rec1.jsonl"
        bet2 = stats_dir / "bets" / "rec2.jsonl"
        bet1.parent.mkdir(parents=True, exist_ok=True)
        bet1.write_text(
            '{"event":"accepted_virtual_bet","record_id":"rec1","timestamp":"2026-06-06T01:00:00Z"}\n'
            '{"event":"price_tick","record_id":"rec1","timestamp":"2026-06-06T01:00:20Z","elapsed_sec":20,"status":"OK","price":2.01,"last_known_price":2.01,"source":"pinnacle-stream"}\n'
            '{"event":"completed","record_id":"rec1","timestamp":"2026-06-06T01:02:00Z","elapsed_sec":120,"last_known_price":2.01,"price_closed":false,"ticks":60}\n',
            encoding="utf-8",
        )
        bet2.write_text(
            '{"event":"accepted_virtual_bet","record_id":"rec2","timestamp":"2026-06-06T02:00:00Z"}\n',
            encoding="utf-8",
        )
        rows = [
            {
                "record_id": "rec1",
                "created_at": "2026-06-06T01:00:00Z",
                "mode": "live",
                "category": "3",
                "sport": "Soccer",
                "league": "League",
                "match": "A vs B",
                "market": "Totals",
                "selection": "Over",
                "counter_bookmaker": "vivarobet.com",
                "pin_odds_forted": "2.000",
                "pin_odds_verified": "2.000",
                "robin_odds": "2.050",
                "counter_odds": "2.000",
                "forted_profit_pct": "0.5",
                "robin_profit_pct": "1.2",
                "target_margin_pct": "2.5",
                "margin_calculated": "1",
                "robin_price_source": "hub-board",
                "verify_source": "pinnacle-betslip",
                "verify_status": "OK",
                "price_live_20s": "2.010",
                "price_live_2m": "2.020",
                "last_price": "2.020",
                "last_price_at": "2026-06-06T01:02:00Z",
                "price_closed": "0",
                "ticks": "60",
                "file_path": str(bet1),
            },
            {
                "record_id": "rec2",
                "created_at": "2026-06-06T02:00:00Z",
                "mode": "prematch",
                "category": "2",
                "sport": "Tennis",
                "league": "League",
                "match": "C vs D",
                "market": "Moneyline",
                "selection": "Home",
                "counter_bookmaker": "vivarobet.com",
                "pin_odds_forted": "1.500",
                "pin_odds_verified": "1.500",
                "robin_odds": "1.550",
                "counter_odds": "3.000",
                "forted_profit_pct": "-0.5",
                "robin_profit_pct": "0.7",
                "target_margin_pct": "2.5",
                "margin_calculated": "0",
                "robin_price_source": "stream-fallback",
                "verify_source": "pinnacle-betslip",
                "verify_status": "ODDS_CHANGE",
                "price_prematch_2m": "1.490",
                "price_prematch_20m": "1.480",
                "last_price": "1.480",
                "last_price_at": "2026-06-06T02:20:00Z",
                "price_closed": "1",
                "ticks": "120",
                "file_path": str(bet2),
            },
        ]
        with csv_path.open("w", encoding="utf-8", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=server.stats_collector.CSV_FIELDS)
            writer.writeheader()
            for row in rows:
                writer.writerow({field: row.get(field, "") for field in server.stats_collector.CSV_FIELDS})

        class FakeCollector:
            def __init__(self, path: Path):
                self.csv_path = path

            @staticmethod
            def status():
                return {"enabled": True, "started": True}

        original = server._stats_collector
        server._stats_collector = FakeCollector(csv_path)
        try:
            headers = self.login("owner", "owner123")
            summary = self.client.get("/api/admin/stats/summary", headers=headers)
            self.assertEqual(summary.status_code, 200, summary.text)
            body = summary.json()
            self.assertEqual(body["total_records"], 2)
            self.assertEqual(body["unique_matches"], 2)
            self.assertEqual(body["by_category"], {"3": 1, "2": 1})
            self.assertEqual(body["margin_calculated"], 1)
            self.assertEqual(body["fallback"], 1)
            self.assertEqual(body["settlement"]["settled"], 0)

            records = self.client.get("/api/admin/stats/records?margin=fallback", headers=headers)
            self.assertEqual(records.status_code, 200, records.text)
            self.assertEqual(records.json()["count"], 1)
            self.assertEqual(records.json()["records"][0]["record_id"], "rec2")

            pending_detail = self.client.get("/api/admin/stats/records/rec2", headers=headers)
            self.assertEqual(pending_detail.status_code, 200, pending_detail.text)
            self.assertFalse(pending_detail.json()["price_changes_ready"])
            self.assertEqual(pending_detail.json()["price_changes"], [])

            pending_csv = self.client.get("/api/admin/stats/records/rec2/price_changes.csv", headers=headers)
            self.assertEqual(pending_csv.status_code, 409)

            download = self.client.get("/api/admin/stats/download", headers=headers)
            self.assertEqual(download.status_code, 200, download.text)
            self.assertIn("record_id,created_at", download.text)

            detail = self.client.get("/api/admin/stats/records/rec1", headers=headers)
            self.assertEqual(detail.status_code, 200, detail.text)
            self.assertEqual(detail.json()["events_count"], 3)
            self.assertEqual(detail.json()["events"][1]["price"], 2.01)
            self.assertTrue(detail.json()["price_changes_ready"])
            self.assertEqual(detail.json()["price_changes"][0]["event"], "initial")
            self.assertEqual(detail.json()["price_changes"][1]["event"], "price_change")
            self.assertEqual(detail.json()["price_changes"][1]["price"], "2.010")
            self.assertEqual(detail.json()["price_changes"][1]["robin_offered_odds"], "2.050")

            raw_file = self.client.get("/api/admin/stats/records/rec1/download", headers=headers)
            self.assertEqual(raw_file.status_code, 200, raw_file.text)
            self.assertIn("price_tick", raw_file.text)

            event_csv = self.client.get("/api/admin/stats/records/rec1/price_changes.csv", headers=headers)
            self.assertEqual(event_csv.status_code, 200, event_csv.text)
            self.assertIn("record_id,timestamp,elapsed_sec,event,status,pinnacle_price,pinnacle_last_known_price,robin_offered_odds", event_csv.text)
            self.assertIn("price_change", event_csv.text)

            settled = self.client.post("/api/admin/stats/records/rec1/settle", json={"result": "donor_win"}, headers=headers)
            self.assertEqual(settled.status_code, 200, settled.text)
            self.assertEqual(settled.json()["record"]["settlement_result"], "donor_win")
            self.assertGreater(float(settled.json()["record"]["robin_house_profit"]), 0)

            summary_after = self.client.get("/api/admin/stats/summary", headers=headers)
            self.assertEqual(summary_after.json()["settlement"]["settled"], 1)
        finally:
            server._stats_collector = original

    def test_build_bookmaker_url_rewrites_pinnacle_to_pinnacle888(self):
        url = "HTTPS://www.pinnacle.com/events/123?selection_id=ABC123"
        self.assertEqual(
            server._build_bookmaker_url(url),
            "https://www.pinnacle888.com/en/events/123?selection_id=ABC123",
        )
        deep_link = "HTTPS://www.pinnacle.com/events/123"
        self.assertEqual(server._build_bookmaker_url(deep_link), "https://www.pinnacle888.com/en/events/123")
        self.assertEqual(server._build_bookmaker_url("pinnacle.com"), "https://www.pinnacle888.com/en")

    def test_build_deep_bookmaker_url_maps_pinnacle_relative_paths(self):
        self.assertEqual(
            server._build_deep_bookmaker_url("/1631584158", "pinnacle.com"),
            "https://www.pinnacle888.com/en/1631584158",
        )
        self.assertEqual(
            server._build_deep_bookmaker_url("?selection_id=778899", "pinnacle.com"),
            "https://www.pinnacle888.com/en?selection_id=778899",
        )

    def test_build_deep_bookmaker_url_preserves_betfair_market_ids(self):
        self.assertEqual(
            server._build_deep_bookmaker_url("1.23456789", "betfair.com"),
            "https://www.betfair.com/exchange/plus/en/market/1.23456789",
        )
        self.assertEqual(
            server._build_deep_bookmaker_url("?marketId=1.23456789&selectionId=987654321", "betfair.com"),
            "https://www.betfair.com/exchange/plus/en/market/1.23456789",
        )

    def test_build_deep_bookmaker_url_maps_betfair_event_ids_to_sportsbook(self):
        self.assertEqual(
            server._build_deep_bookmaker_url(
                "35731336",
                "betfair.com",
                sport="Tennis",
                league="Tennis - United Kingdom - ATP London 2026",
                event_name="Tennis - United Kingdom - ATP London 2026",
                home="Alex De Minaur",
                away="Brandon Nakashima",
            ),
            "https://www.betfair.com/betting/tennis/atp-london-2026/alex-de-minaur-v-brandon-nakashima/e-35731336?tab=all-markets",
        )

    def test_build_pinnacle_compact_stats_url_matches_pin888_route(self):
        self.assertEqual(
            server._build_pinnacle_compact_stats_url(
                sport="Soccer",
                event_name="Soccer - Spain - Segunda Division",
                home="Las Palmas",
                away="Malaga",
                event_id="1631747271",
            ),
            "https://www.pinnacle888.com/en/compact/sports/soccer/stats/Spain-Segunda-Division/Las-Palmas-vs-Malaga/1631747271#:~:text=All%20Markets",
        )

    def test_feed_fork_builds_pinnacle_compact_stats_link(self):
        arb = server._feed_fork_to_arb(
            {
                "sport": "Футбол - Чили - Кубок",
                "profit": 2.5,
                "event_id": "123456",
                "fork_timestamp": time.time(),
                "stake_types": "П1;П2",
                "bk1": "pinnaclesports.com",
                "bk2": "bet365.com",
                "event_name": "O'Higgins - Palestino",
                "bk1_link": "/1631610886",
                "bk2_link": "https://www.bet365.com/",
                "odds1": 2.05,
                "odds2": 1.97,
                "team1_en": "O'Higgins",
                "team2_en": "Palestino",
                "bk1_event_name": "Soccer - Chile - League Cup",
            },
            0,
        )

        self.assertIsNotNone(arb)
        self.assertEqual(
            arb["bk1_url"],
            "https://www.pinnacle888.com/en/compact/sports/soccer/stats/Chile-League-Cup/OHiggins-vs-Palestino/1631610886#:~:text=All%20Markets",
        )

    def test_feed_fork_pinnacle_compact_link_reorders_reversed_english_teams(self):
        arb = server._feed_fork_to_arb(
            {
                "sport": "Футбол - Венесуэла",
                "profit": 2.5,
                "event_id": "123456",
                "fork_timestamp": time.time(),
                "stake_types": "П1;П2",
                "bk1": "pinnaclesports.com",
                "bk2": "bet365.com",
                "event_name": "Академия Пуэрто Кабельо - Карабобо",
                "bk1_link": "/1631621447",
                "bk2_link": "https://www.bet365.com/",
                "odds1": 2.05,
                "odds2": 1.97,
                "team1_en": "Carabobo",
                "team2_en": "Academia Puerto Cabello",
                "bk1_event_name": "Soccer - Venezuela - Primera Division",
            },
            0,
        )

        self.assertIsNotNone(arb)
        self.assertEqual(
            arb["bk1_url"],
            "https://www.pinnacle888.com/en/compact/sports/soccer/stats/Venezuela-Primera-Division/Academia-Puerto-Cabello-vs-Carabobo/1631621447#:~:text=All%20Markets",
        )

    def test_build_pinnacle_tennis_matchup_index_pairs_sets_and_games_ids(self):
        def tennis_event(event_id, home, away, label, parent_id=0):
            event = [None] * 29
            event[0] = event_id
            event[1] = home
            event[2] = away
            event[4] = 1780992000000
            event[24] = "Yannick Hanfmann"
            event[25] = "Aleksandar Kovacevic"
            event[27] = label
            event[28] = parent_id
            return event

        snapshot = {
            "data": {
                "odds": {
                    "n": [
                        [
                            33,
                            "Tennis",
                            [
                                [
                                    3638,
                                    "ATP Stuttgart - R1",
                                    [
                                        tennis_event(1631739543, "Yannick Hanfmann", "Aleksandar Kovacevic", "Sets"),
                                        tennis_event(
                                            1631755738,
                                            "Yannick Hanfmann (Games)",
                                            "Aleksandar Kovacevic (Games)",
                                            "Games",
                                            1631739543,
                                        ),
                                    ],
                                ],
                            ],
                        ],
                    ],
                },
            },
        }

        expected = (
            "https://www.pinnacle888.com/en/compact/sports/tennis/matchup/"
            "ATP-Stuttgart-R1/Yannick-Hanfmann-vs-Aleksandar-Kovacevic/3638/1631739543,1631755738"
        )
        index = server._build_pinnacle_tennis_matchup_index(snapshot)
        self.assertEqual(index["1631739543"], expected)
        self.assertEqual(index["1631755738"], expected)

    def test_tennis_pinnacle_link_uses_matchup_route_from_pin888_snapshot(self):
        expected = (
            "https://www.pinnacle888.com/en/compact/sports/tennis/matchup/"
            "ATP-Stuttgart-R1/Fabian-Marozsan-vs-Gauthier-Onclin/3638/1631758190,1631759000"
        )
        with patch.object(server, "_pinnacle_tennis_matchup_url_for_event", return_value=expected) as resolver:
            self.assertEqual(
                server._build_pinnacle_compact_stats_url(
                    sport="Tennis",
                    event_name="Tennis - ATP Stuttgart - R1",
                    home="Fabian Marozsan",
                    away="Gauthier Onclin",
                    event_id="1631758190",
                ),
                expected,
            )
        resolver.assert_called_once_with("1631758190")

    def test_feed_fork_builds_tennis_pinnacle_matchup_link(self):
        expected = (
            "https://www.pinnacle888.com/en/compact/sports/tennis/matchup/"
            "ATP-Stuttgart-R1/Fabian-Marozsan-vs-Gauthier-Onclin/3638/1631758190,1631759000"
        )
        with patch.object(server, "_pinnacle_tennis_matchup_url_for_event", return_value=expected):
            arb = server._feed_fork_to_arb(
                {
                    "sport": "Теннис - ATP",
                    "profit": 2.5,
                    "event_id": "123456",
                    "fork_timestamp": time.time(),
                    "stake_types": "П1;П2",
                    "bk1": "pinnaclesports.com",
                    "bk2": "bet365.com",
                    "event_name": "Фабиан Марожан - Готье Онклен",
                    "bk1_link": "/1631758190",
                    "bk2_link": "https://www.bet365.com/",
                    "odds1": 2.05,
                    "odds2": 1.97,
                    "team1_en": "Fabian Marozsan",
                    "team2_en": "Gauthier Onclin",
                    "bk1_event_name": "Tennis - ATP Stuttgart - R1",
                },
                0,
            )

        self.assertIsNotNone(arb)
        self.assertEqual(
            arb["bk1_url"],
            expected,
        )

    def test_feed_fork_builds_hanfmann_kovacevic_tennis_matchup_link(self):
        expected = (
            "https://www.pinnacle888.com/en/compact/sports/tennis/matchup/"
            "ATP-Stuttgart-R1/Yannick-Hanfmann-vs-Aleksandar-Kovacevic/3638/1631739543,1631755738"
        )
        with patch.object(server, "_pinnacle_tennis_matchup_url_for_event", return_value=expected):
            arb = server._feed_fork_to_arb(
                {
                    "sport": "Теннис - ATP",
                    "profit": -0.639,
                    "event_id": "44990938",
                    "fork_timestamp": time.time(),
                    "stake_types": "Ф1(-1,5);Ф2(1,5)",
                    "bk1": "paddypower.com",
                    "bk2": "pinnaclesports.com",
                    "event_name": "Янник Ханфманн vs Александр Ковакевич",
                    "bk1_link": "https://www.paddypower.com/tennis/atp-stuttgart-2026/hanfmann-v-al-kovacevic-35691930?tab=all-markets",
                    "bk2_link": "/1631739543",
                    "odds1": 2.5,
                    "odds2": 1.649,
                    "team1_en": "Yannick Hanfmann",
                    "team2_en": "Aleksandar Kovacevic",
                    "bk1_event_name": "Tennis - ATP Stuttgart 2026",
                    "bk2_event_name": "Tennis - ATP Stuttgart - R1",
                },
                0,
            )

        self.assertIsNotNone(arb)
        self.assertEqual(arb["bk1_url"], expected)
        self.assertEqual(
            arb["match"],
            "Янник Ханфманн vs Александр Ковакевич",
        )

    def test_build_deep_bookmaker_url_maps_vivaro_relative_paths(self):
        raw = "3/1510003/11447/29955399/Basketball/Mexico"
        self.assertEqual(
            server._build_deep_bookmaker_url(raw, "vivarobet.com", is_live=True),
            "https://www.vbet.ua/uk/sports/live/event-view/Basketball/Mexico/11447/x/29955399",
        )

    def test_build_deep_bookmaker_url_rewrites_full_vivarobet_links(self):
        raw = "https://vivarobet.com/4/2410004/18293140/29978089/Tennis/United Kingdom?tab=all"
        self.assertEqual(
            server._build_deep_bookmaker_url(raw, "vivarobet.com", is_live=False),
            "https://www.vbet.ua/uk/sports/pre-match/event-view/Tennis/United%20Kingdom/18293140/x/29978089",
        )

    def test_failed_login_uses_async_backoff_and_ip_throttle_buckets(self):
        original_sleep = server.asyncio.sleep
        sleeps = []

        async def fake_sleep(delay):
            sleeps.append(delay)

        server.asyncio.sleep = fake_sleep
        try:
            response = self.client.post(
                "/api/auth/login",
                json={"username": "owner", "password": "wrong"},
            )
        finally:
            server.asyncio.sleep = original_sleep

        self.assertEqual(response.status_code, 401, response.text)
        self.assertEqual(sleeps, [min(server.ROBINARB_LOGIN_BACKOFF, 5) / 10])
        self.assertIn("user:owner", server._login_attempts)
        self.assertIn("combo:testclient:owner", server._login_attempts)
        self.assertIn("ip:testclient", server._login_attempts)
        self.assertIn("global", server._login_attempts)

    def test_login_verifies_password_outside_event_loop_thread(self):
        original_to_thread = server.asyncio.to_thread
        calls = []

        async def fake_to_thread(func, *args):
            calls.append(func.__name__)
            return func(*args)

        server.asyncio.to_thread = fake_to_thread
        try:
            response = self.client.post(
                "/api/auth/login",
                json={"username": "owner", "password": "owner123"},
            )
        finally:
            server.asyncio.to_thread = original_to_thread

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(calls, ["_verify_password"])

    def test_failed_login_reserves_before_verify_and_uses_dummy_hash(self):
        original_to_thread = server.asyncio.to_thread
        original_sleep = server.asyncio.sleep
        observed_hashes = []

        async def fake_to_thread(func, password, password_hash):
            self.assertIn("user:missing", server._login_attempts)
            self.assertIn("combo:testclient:missing", server._login_attempts)
            self.assertIn("ip:testclient", server._login_attempts)
            self.assertIn("global", server._login_attempts)
            observed_hashes.append(password_hash)
            return False

        async def fake_sleep(delay):
            return None

        server.asyncio.to_thread = fake_to_thread
        server.asyncio.sleep = fake_sleep
        try:
            response = self.client.post(
                "/api/auth/login",
                json={"username": "missing", "password": "wrong"},
            )
        finally:
            server.asyncio.to_thread = original_to_thread
            server.asyncio.sleep = original_sleep

        self.assertEqual(response.status_code, 401, response.text)
        self.assertEqual(observed_hashes, [server._DUMMY_PASSWORD_HASH])

    def test_valid_login_succeeds_at_throttle_boundary(self):
        now = time.time()
        recent_failures = [now - 1, now - 2, now - 3, now - 4]
        server._login_attempts["user:owner"] = list(recent_failures)
        server._login_attempts["combo:testclient:owner"] = list(recent_failures)

        response = self.client.post(
            "/api/auth/login",
            json={"username": "owner", "password": "owner123"},
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertNotIn("user:owner", server._login_attempts)
        self.assertNotIn("combo:testclient:owner", server._login_attempts)

    def test_login_attempt_pruning_removes_stale_and_caps_keys(self):
        original_limit = server.ROBINARB_LOGIN_ATTEMPT_KEY_LIMIT
        now = time.time()
        server._login_attempts["user:stale"] = [now - 120]
        for index in range(5):
            server._login_attempts[f"user:old-{index}"] = [now - index]
        server.ROBINARB_LOGIN_ATTEMPT_KEY_LIMIT = 3
        try:
            with server._users_lock:
                server._prune_login_attempts_locked(now)
        finally:
            server.ROBINARB_LOGIN_ATTEMPT_KEY_LIMIT = original_limit

        self.assertNotIn("user:stale", server._login_attempts)
        self.assertLessEqual(len(server._login_attempts), 3)

    def test_feed_endpoint_accepts_machine_key(self):
        original_keys = list(server.ROBINARB_FEED_KEYS)
        server.ROBINARB_FEED_KEYS = ["machine-secret"]
        try:
            response = self.client.get(
                "/api/forks/feed?limit=1",
                headers={"X-Robinarb-Feed-Key": "machine-secret"},
            )
        finally:
            server.ROBINARB_FEED_KEYS = original_keys

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["bk1"], "pinnaclesports.com")

    def test_users_have_isolated_balances_and_bets(self):
        owner_headers = self.login("owner", "owner123")
        trader_headers = self.login("trader1", "trader123")

        owner_before = self.client.get("/api/balance", headers=owner_headers).json()
        trader_before = self.client.get("/api/balance", headers=trader_headers).json()
        arbs_response = self.client.get("/api/arbs", headers=owner_headers)
        self.assertEqual(arbs_response.status_code, 200, arbs_response.text)
        arb = arbs_response.json()["arbs"][0]
        quote_arb = server._find_arb_by_id(arb["id"]) or arb
        quote_id = server._issue_verified_quote(
            "owner",
            arb["id"],
            float(quote_arb["bk1_odds"]),
            server._build_pinnacle_verify_payload(quote_arb),
            {},
        )

        bet_response = self.client.post(
            "/api/bet",
            headers=owner_headers,
            json={
                "arb_id": arb["id"],
                "side": "robinbet",
                "stake": 100.0,
                "odds": arb["robin_odds"],
                "quote_id": quote_id,
            },
        )
        self.assertEqual(bet_response.status_code, 200, bet_response.text)

        owner_after = self.client.get("/api/balance", headers=owner_headers).json()
        trader_after = self.client.get("/api/balance", headers=trader_headers).json()
        owner_bets = self.client.get("/api/bets", headers=owner_headers).json()
        trader_bets = self.client.get("/api/bets", headers=trader_headers).json()

        self.assertLess(owner_after["robinbet"], owner_before["robinbet"])
        self.assertEqual(trader_after["robinbet"], trader_before["robinbet"])
        self.assertEqual(owner_bets["count"], 1)
        self.assertEqual(owner_bets["bets"][0]["selection"], arb.get("bk1_outcome") or arb.get("bk1_selection") or arb["side1"])
        self.assertEqual(owner_bets["bets"][0]["counter_selection"], arb.get("bk2_selection") or arb["side2"])
        self.assertEqual(trader_bets["count"], 0)

    def test_upstream_filters_refresh_mock_data(self):
        headers = self.login("owner", "owner123")

        update_response = self.client.post(
            "/api/forted/filters",
            headers=headers,
            json={
                "sports": ["Tennis"],
                "bookmakers": ["bet365.com"],
            },
        )
        self.assertEqual(update_response.status_code, 200, update_response.text)
        self.assertIn("Tennis", update_response.json()["filters"]["sports"])

        arbs_response = self.client.get("/api/arbs", headers=headers)
        feed_response = self.client.get("/api/forks/feed?limit=10", headers=headers)
        self.assertEqual(arbs_response.status_code, 200, arbs_response.text)
        self.assertEqual(feed_response.status_code, 200, feed_response.text)
        arbs = arbs_response.json()["arbs"]

        self.assertTrue(arbs)
        self.assertTrue(all(arb["sport"] == "Tennis" for arb in arbs))
        self.assertTrue(all(arb["bk2"] == "bet365.com" for arb in arbs))

    def test_only_admin_can_update_forted_filters(self):
        headers = self.login("trader1", "trader123")

        response = self.client.post(
            "/api/forted/filters",
            headers=headers,
            json={"sports": ["Tennis"]},
        )

        self.assertEqual(response.status_code, 403)

    def test_forted_bookmaker_keeps_selected_profile_over_inferred_common(self):
        async def fake_lws_request(method, path, json_body=None):
            self.assertEqual(method, "GET")
            self.assertEqual(path, "/api/profile")
            self.assertIsNone(json_body)
            return {
                "profile": "pin_ladbrokes",
                "switching": False,
                "servers_ready": 1,
                "servers_total": 1,
            }

        server._arbs_cache = [
            {"bk2": "ladbrokes", "bk2_raw_link": ""},
            {"bk2": "vivarobet", "bk2_raw_link": ""},
        ]
        server._lws_last_profile = "pin_ladbrokes"
        server._lws_switch_started_at = 0.0

        headers = self.login("owner", "owner123")
        with patch.object(server, "_lws_request", fake_lws_request):
            response = self.client.get("/api/forted/bookmaker", headers=headers)

        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data["profile"], "pin_ladbrokes")
        self.assertEqual(data["memory_profile"], "pin_ladbrokes")
        self.assertEqual(data["inferred_profile"], "pin_all3")
        self.assertNotIn("pin_betfair", data.get("allowed", []))

    def test_infer_forted_profile_does_not_confuse_atomic_books_with_composites(self):
        self.assertEqual(
            server._infer_lws_profile_from_arbs([
                {"bk2": "paddypower.com", "bk2_raw_link": "https://www.paddypower.com/event"},
            ]),
            "pin_paddy",
        )
        self.assertEqual(
            server._infer_lws_profile_from_arbs([
                {"bk2": "1win.pro", "bk2_raw_link": "https://1win.pro/betting/match/sport/123"},
            ]),
            "pin_1win",
        )
        self.assertEqual(
            server._infer_lws_profile_from_arbs([
                {"bk2": "bc.game"}, {"bk2": "1win.pro"},
            ]),
            "pin_bc_dafa_1win",
        )

    def test_forted_bookmaker_prefers_feed_inference_when_rust_has_no_active_config(self):
        async def fake_lws_request(method, path, json_body=None):
            raise server.HTTPException(404, "legacy lws unavailable")

        async def fake_rust_admin_request(method, path, json_body=None):
            self.assertEqual(method, "GET")
            self.assertEqual(path, "/admin/status")
            return {"sqlite": {"on": False}}

        server._arbs_cache = [{"bk2": "1win.pro", "bk2_raw_link": "https://1win.pro/betting/match/sport/123"}]
        server._lws_last_profile = "pin_6mix"
        server._lws_switch_started_at = 0.0

        headers = self.login("owner", "owner123")
        with patch.object(server, "_lws_request", fake_lws_request), \
            patch.object(server, "_rust_admin_request", fake_rust_admin_request):
            response = self.client.get("/api/forted/bookmaker", headers=headers)

        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data["active_profile"], "pin_1win")
        self.assertEqual(data["memory_profile"], "pin_1win")
        self.assertEqual(data["inferred_profile"], "pin_1win")

    def test_forted_bookmaker_control_profile_completes_switch_without_forks(self):
        async def fake_lws_request(method, path, json_body=None):
            self.assertEqual(method, "GET")
            self.assertEqual(path, "/api/profile")
            self.assertIsNone(json_body)
            return {
                "profile": "pin_ladbrokes",
                "servers_ready": 0,
                "servers_total": 0,
            }

        server._arbs_cache = []
        server._arbs_source = "listener"
        server._arbs_updated_at = time.time()
        with server._lws_profile_lock:
            server._lws_last_profile = "pin_ladbrokes"
            server._lws_switch_started_at = time.time()

        headers = self.login("owner", "owner123")
        with patch.object(server, "_lws_request", fake_lws_request):
            response = self.client.get("/api/forted/bookmaker", headers=headers)

        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data["profile"], "pin_ladbrokes")
        self.assertFalse(data["switching"])
        self.assertEqual(data["servers_ready"], 1)
        self.assertEqual(data["servers_total"], 1)
        self.assertEqual(server._lws_switch_started_at, 0.0)

    def test_forted_bookmaker_does_not_show_memory_profile_for_unknown_runtime_config(self):
        async def fake_lws_request(method, path, json_body=None):
            raise server.HTTPException(502, "legacy lws unavailable")

        async def fake_rust_admin_request(method, path, json_body=None):
            self.assertEqual(method, "GET")
            self.assertEqual(path, "/admin/status")
            return {"active_config": "config_ms_exchanges_eu.toml", "current_config": "config_ms_exchanges_eu.toml"}

        server._lws_last_profile = "pin_vbet"
        server._lws_switch_started_at = 0.0

        headers = self.login("owner", "owner123")
        with patch.object(server, "_lws_request", fake_lws_request), \
            patch.object(server, "_rust_admin_request", fake_rust_admin_request):
            response = self.client.get("/api/forted/bookmaker", headers=headers)

        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertIsNone(data["profile"])
        self.assertIsNone(data["active_profile"])
        self.assertEqual(data["memory_profile"], "pin_vbet")
        self.assertEqual(data["runtime_active_config"], "config_ms_exchanges_eu.toml")
        self.assertTrue(data["runtime_config_unknown"])

    def test_forted_bookmaker_rejects_unknown_profile_before_lws(self):
        headers = self.login("owner", "owner123")
        calls = []

        async def fake_lws_request(method, path, json_body=None):
            calls.append((method, path, json_body))
            return {"profile": json_body["profile"]}

        with patch.object(server, "_lws_request", fake_lws_request):
            response = self.client.post(
                "/api/forted/bookmaker",
                headers=headers,
                json={"profile": "pin_unlisted"},
            )

        self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(calls, [])

    def test_forted_bookmaker_requires_admin_before_lws(self):
        headers = self.login("trader1", "trader123")

        async def fake_lws_request(method, path, json_body=None):
            raise AssertionError("non-admin must not reach LWS profile endpoints")

        async def fake_rust_admin_request(method, path, json_body=None):
            raise AssertionError("non-admin must not reach Rust profile endpoints")

        with patch.object(server, "_lws_request", fake_lws_request), \
            patch.object(server, "_rust_admin_request", fake_rust_admin_request):
            get_response = self.client.get("/api/forted/bookmaker", headers=headers)
            response = self.client.post(
                "/api/forted/bookmaker",
                headers=headers,
                json={"profile": "pin_vbet"},
            )

        self.assertEqual(get_response.status_code, 403, get_response.text)
        self.assertEqual(response.status_code, 403, response.text)

    def test_forted_bookmaker_legacy_betfair_profile_maps_to_paddy(self):
        headers = self.login("owner", "owner123")
        calls = []

        async def fake_lws_request(method, path, json_body=None):
            calls.append((method, path, json_body))
            return {"profile": json_body["profile"], "switching": False}

        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "config_pin_paddy.toml").write_text("[capture]\n", encoding="utf-8")
            with patch.dict(os.environ, {"FORTED_RUST_CONFIG_DIR": tmp}), \
                patch.object(server, "_lws_request", fake_lws_request):
                response = self.client.post(
                    "/api/forted/bookmaker",
                    headers=headers,
                    json={"profile": "pin_betfair"},
                )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(calls, [("POST", "/api/switch_profile", {"profile": "pin_paddy"})])
        self.assertEqual(response.json()["profile"], "pin_paddy")

    def test_forted_bookmaker_profile_api_does_not_require_local_config(self):
        headers = self.login("owner", "owner123")
        calls = []

        async def fake_lws_request(method, path, json_body=None):
            calls.append((method, path, json_body))
            return {"profile": json_body["profile"], "switching": False}

        async def fake_rust_admin_request(method, path, json_body=None):
            raise AssertionError("profile API success must not reach Rust profile switching")

        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict(os.environ, {"FORTED_RUST_CONFIG_DIR": tmp}), \
                patch.object(server, "_lws_request", fake_lws_request), \
                patch.object(server, "_rust_admin_request", fake_rust_admin_request):
                response = self.client.post(
                    "/api/forted/bookmaker",
                    headers=headers,
                    json={"profile": "pin_paddy"},
                )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(calls, [("POST", "/api/switch_profile", {"profile": "pin_paddy"})])
        self.assertEqual(response.json()["profile"], "pin_paddy")

    def test_forted_bookmaker_switch_ack_keeps_local_switching(self):
        headers = self.login("owner", "owner123")

        async def fake_lws_request(method, path, json_body=None):
            self.assertEqual((method, path), ("POST", "/api/switch_profile"))
            return {"profile": json_body["profile"], "switching": False}

        with patch.object(server, "_lws_request", fake_lws_request):
            response = self.client.post(
                "/api/forted/bookmaker",
                headers=headers,
                json={"profile": "pin_paddy"},
            )

        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data["profile"], "pin_paddy")
        self.assertTrue(data["switching"])
        self.assertGreater(server._lws_switch_started_at, 0)

    def test_forted_bookmaker_network_error_falls_back_to_rust_switch(self):
        headers = self.login("owner", "owner123")
        rust_calls = []

        async def fake_lws_request(method, path, json_body=None):
            raise server.httpx.ConnectError("temporary control outage")

        async def fake_rust_admin_request(method, path, json_body=None):
            rust_calls.append((method, path, json_body))
            return {"ok": True}

        with patch.object(server, "_lws_request", fake_lws_request), \
            patch.object(server, "_rust_admin_request", fake_rust_admin_request):
            response = self.client.post(
                "/api/forted/bookmaker",
                headers=headers,
                json={"profile": "pin_paddy"},
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            rust_calls,
            [("POST", "/admin/profile", {"config": "config_pin_paddy.toml"})],
        )
        self.assertEqual(response.json()["runtime"], "rust")
        self.assertTrue(response.json()["switching"])

    def test_forted_bookmaker_status_uses_memory_during_active_switch_outage(self):
        headers = self.login("owner", "owner123")

        async def fake_lws_request(method, path, json_body=None):
            raise server.HTTPException(502, "legacy status unavailable")

        async def fake_rust_admin_request(method, path, json_body=None):
            raise server.HTTPException(502, "rust status unavailable")

        with server._lws_profile_lock:
            server._lws_last_profile = "pin_paddy"
            server._lws_switch_started_at = time.time()

        with patch.object(server, "_lws_request", fake_lws_request), \
            patch.object(server, "_rust_admin_request", fake_rust_admin_request):
            response = self.client.get("/api/forted/bookmaker", headers=headers)

        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data["runtime"], "memory")
        self.assertFalse(data["control_available"])
        self.assertEqual(data["profile"], "pin_paddy")
        self.assertTrue(data["switching"])

    def test_forted_bookmaker_control_4xx_does_not_fallback_to_rust(self):
        headers = self.login("owner", "owner123")

        async def fake_lws_request(method, path, json_body=None):
            raise server.HTTPException(409, "forted control rejected profile")

        async def fake_rust_admin_request(method, path, json_body=None):
            raise AssertionError("control 4xx must not fall back to Rust profile switching")

        with patch.object(server, "_lws_request", fake_lws_request), \
            patch.object(server, "_rust_admin_request", fake_rust_admin_request):
            response = self.client.post(
                "/api/forted/bookmaker",
                headers=headers,
                json={"profile": "pin_paddy"},
            )

        self.assertEqual(response.status_code, 409, response.text)

    def test_forted_bookmaker_paddy_profile_uses_paddy_config_via_rust_fallback(self):
        headers = self.login("owner", "owner123")
        rust_calls = []

        async def fake_lws_request(method, path, json_body=None):
            raise server.HTTPException(502, "lws does not know pin_paddy")

        async def fake_rust_admin_request(method, path, json_body=None):
            rust_calls.append((method, path, json_body))
            return {"ok": True}

        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "config_pin_paddy.toml").write_text("[capture]\n", encoding="utf-8")
            with patch.dict(os.environ, {"FORTED_RUST_CONFIG_DIR": tmp}), \
                patch.object(server, "_lws_request", fake_lws_request), \
                patch.object(server, "_rust_admin_request", fake_rust_admin_request):
                response = self.client.post(
                    "/api/forted/bookmaker",
                    headers=headers,
                    json={"profile": "pin_paddy"},
                )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            rust_calls,
            [("POST", "/admin/profile", {"config": "config_pin_paddy.toml"})],
        )
        self.assertEqual(response.json()["config"], "config_pin_paddy.toml")

    def test_external_feed_fork_is_convertible_to_arb(self):
        arb = server._feed_fork_to_arb(
            {
                "sport": "Теннис - ATP",
                "profit": 2.5,
                "event_id": "123456",
                "fork_timestamp": time.time(),
                "stake_types": "П1;П2",
                "bk1": "pinnaclesports.com",
                "bk2": "bet365.com",
                "event_name": "Player A - Player B",
                "bk1_link": "https://www.pinnacle.com/?selection_id=778899",
                "bk2_link": "https://www.bet365.com/",
                "odds1": 2.05,
                "odds2": 1.97,
            },
            0,
        )

        self.assertIsNotNone(arb)
        self.assertEqual(arb["bk1"], "Pinnacle")
        self.assertEqual(arb["bk2"], "bet365.com")
        self.assertEqual(arb["sport"], "Tennis")
        self.assertEqual(arb["event_id"], 123456)
        self.assertEqual(arb["side1"], "Home")
        self.assertEqual(arb["side2"], "Away")
        self.assertEqual(arb["pinnacle_selection_id"], "778899")
        self.assertTrue(arb["pinnacle_place_supported"])

    def test_external_feed_cyrillic_draw_keeps_draw_identity(self):
        self.assertEqual(server._translate_selection_text("Х"), "Draw")
        self.assertEqual(server._selection_team_number("Х", True), "None")
        self.assertEqual(server._infer_pinnacle_outcome("Х", "Moneyline", True), "WinNone")

        arb = server._feed_fork_to_arb(
            {
                "sport": "Футбол - Test",
                "profit": 2.13,
                "event_id": "123459",
                "fork_timestamp": time.time(),
                "stake_types": "Х;П1",
                "bk1": "pinnaclesports.com",
                "bk2": "paddypower.com",
                "event_name": "Team A - Team B",
                "bk1_link": "/1632862870",
                "bk2_link": "https://www.paddypower.com/event",
                "odds1": 3.2,
                "odds2": 1.5,
            },
            0,
        )

        self.assertIsNotNone(arb)
        self.assertEqual(arb["market"], "Moneyline")
        self.assertEqual(arb["bk1_selection"], "Draw")
        self.assertEqual(arb["bk1_outcome"], "WinNone")

    def test_external_feed_individual_total_is_not_labeled_as_moneyline(self):
        arb = server._feed_fork_to_arb(
            {
                "sport": "Футбол - Австрия",
                "profit": 2.13,
                "event_id": "123457",
                "fork_timestamp": time.time(),
                "stake_types": "ИТ2М(2,5);ИТ2Б(2,5)",
                "bk1": "pinnaclesports.com",
                "bk2": "paddypower.com",
                "event_name": "Team A - Team B",
                "bk1_link": "/1632862868",
                "bk2_link": "https://www.paddypower.com/event",
                "odds1": 1.5,
                "odds2": 3.2,
            },
            0,
        )

        self.assertIsNotNone(arb)
        self.assertEqual(arb["market"], "Totals")
        self.assertEqual(arb["bk1_selection"], "ИТ2М(2,5)")
        self.assertEqual(arb["bk1_outcome"], "IT2< 2.5")
        self.assertEqual(arb["pinnacle_market_metadata"]["team"], "2")
        self.assertEqual(arb["pinnacle_market_metadata"]["direction"], "Under")
        self.assertEqual(
            server._build_pinnacle_verify_payload(arb)["outcome"],
            "IT2< 2.5",
        )

        canonical_arb = server._feed_fork_to_arb(
            {
                "sport": "Basketball - Test",
                "profit": 2.13,
                "event_id": "123458",
                "fork_timestamp": time.time(),
                "stake_types": "IT1> 8.5;IT1< 8.5",
                "bk1": "pinnaclesports.com",
                "bk2": "paddypower.com",
                "event_name": "Team C - Team D",
                "bk1_link": "/1632862869",
                "bk2_link": "https://www.paddypower.com/event",
                "odds1": 1.5,
                "odds2": 3.2,
            },
            0,
        )
        self.assertIsNotNone(canonical_arb)
        self.assertEqual(canonical_arb["market"], "Totals")
        self.assertEqual(canonical_arb["bk1_outcome"], "IT1> 8.5")
        self.assertEqual(canonical_arb["pinnacle_market_metadata"]["direction"], "Over")

    def test_individual_total_place_and_ledger_use_canonical_selection(self):
        headers = self.login("owner", "owner123")
        arb = {
            "id": "stale-team-total-ledger",
            "sport": "Soccer",
            "match": "Team A vs Team B",
            "market": "Totals",
            "side1": "ИТ2М(2,5)",
            "side2": "ИТ2Б(2,5)",
            "bk1_selection": "ИТ2М(2,5)",
            "bk1_outcome": "Win2",
            "bk1_odds": 1.5,
            "bk2": "paddypower.com",
            "bk2_selection": "ИТ2Б(2,5)",
            "bk2_odds": 3.2,
            "robin_odds": 1.55,
            "pinnacle_hub_event_id": "1632862868",
            "pinnacle_market_metadata": {
                "family": "Totals",
                "raw_selection": "ИТ2М(2,5)",
                "team": "2",
                "direction": "Under",
                "line": "2.5",
            },
            "updated_at": time.time(),
        }
        payload = server._build_pinnacle_verify_payload(arb)
        quote_id = server._issue_verified_quote(
            "owner",
            arb["id"],
            1.5,
            payload,
            {},
            arb_snapshot=arb,
            verification_mode="stream",
        )
        original_find_arb = server._find_arb_by_id
        original_source = server._arbs_source
        server._find_arb_by_id = lambda _arb_id: arb
        server._arbs_source = "mock"
        try:
            response = self.client.post(
                "/api/bet",
                headers=headers,
                json={
                    "arb_id": arb["id"],
                    "side": "pinnacle",
                    "stake": 1,
                    "odds": 1.5,
                    "quote_id": quote_id,
                    "verify_mode": "stream",
                },
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server._arbs_source = original_source

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["bet"]["selection"], "IT2< 2.5")

    def test_external_feed_preserves_mixed_case_http_links(self):
        pinnacle_link = "HTTPS://www.pinnacle.com/events/123?selection_id=ABC123&foo=bar"
        counter_link = "HtTpS://www.bet365.com/coupon?x=1"
        arb = server._feed_fork_to_arb(
            {
                "sport": "Теннис - ATP",
                "profit": 2.5,
                "event_id": "123456",
                "fork_timestamp": time.time(),
                "stake_types": "П1;П2",
                "bk1": "pinnaclesports.com",
                "bk2": "bet365.com",
                "event_name": "Player A - Player B",
                "bk1_link": pinnacle_link,
                "bk2_link": counter_link,
                "odds1": 2.05,
                "odds2": 1.97,
            },
            0,
        )

        self.assertIsNotNone(arb)
        self.assertEqual(arb["bk1_url"], "https://www.pinnacle888.com/en/events/123?selection_id=ABC123&foo=bar")
        self.assertEqual(arb["bk2_url"], counter_link)
        self.assertEqual(arb["pinnacle_selection_id"], "ABC123")

    def test_external_feed_betfair_link_preserves_market_id_metadata(self):
        arb = server._feed_fork_to_arb(
            {
                "sport": "Теннис - ATP",
                "profit": 2.5,
                "event_id": "123456",
                "fork_timestamp": time.time(),
                "stake_types": "П1;П2",
                "bk1": "pinnaclesports.com",
                "bk2": "betfair.com",
                "event_name": "Player A - Player B",
                "bk1_link": "https://www.pinnacle.com/?selection_id=778899",
                "bk2_link": "?marketId=1.23456789&selectionId=987654321",
                "odds1": 2.05,
                "odds2": 1.97,
            },
            0,
        )

        self.assertIsNotNone(arb)
        self.assertEqual(arb["bk2_url"], "https://www.betfair.com/exchange/plus/en/market/1.23456789")
        self.assertEqual(arb["betfair_market_id"], "1.23456789")
        self.assertEqual(arb["betfair_selection_id"], "987654321")

    def test_external_feed_betfair_numeric_link_builds_sportsbook_url(self):
        arb = server._feed_fork_to_arb(
            {
                "sport": "Теннис - ATP",
                "profit": 2.5,
                "event_id": "123456",
                "fork_timestamp": time.time(),
                "stake_types": "ТМ(2,5);ТБ(2,5)",
                "bk1": "pinnaclesports.com",
                "bk2": "betfair.com",
                "event_name": "Алекс Минаур - Брэндон Накашима",
                "team1": "Алекс Минаур",
                "team2": "Брэндон Накашима",
                "team1_en": "Alex De Minaur",
                "team2_en": "Brandon Nakashima",
                "bk1_event_name": "Tennis - ATP London 2026",
                "bk2_event_name": "Tennis - United Kingdom - ATP London 2026",
                "bk1_link": "https://www.pinnacle.com/?selection_id=778899",
                "bk2_link": "35731336",
                "odds1": 1.71,
                "odds2": 2.44,
            },
            0,
        )

        self.assertIsNotNone(arb)
        self.assertEqual(
            arb["bk2_url"],
            "https://www.betfair.com/betting/tennis/atp-london-2026/alex-de-minaur-v-brandon-nakashima/e-35731336?tab=all-markets",
        )
        self.assertIsNone(arb["betfair_market_id"])
        self.assertEqual(arb["betfair_event_id"], "35731336")

    def test_external_feed_fork_keeps_pinnacle_second_source_identifiers(self):
        arb = server._feed_fork_to_arb(
            {
                "sport": "Теннис - ATP",
                "profit": 3.1,
                "event_id": "789012",
                "fork_timestamp": time.time(),
                "stake_types": "П1;П2",
                "bk1": "bet365.com",
                "bk2": "pinnaclesports.com",
                "event_name": "Player A - Player B",
                "bk1_link": "https://www.bet365.com/",
                "bk2_link": "https://www.pinnacle.com/?odds_id=222333",
                "bk2_selection_id": "998877",
                "bk2_odds_id": "222333",
                "odds1": 1.91,
                "odds2": 2.12,
            },
            0,
        )

        self.assertIsNotNone(arb)
        self.assertEqual(arb["side1"], "Away")
        self.assertEqual(arb["bk1_outcome"], "Win2")
        self.assertFalse(arb["pinnacle_is_primary_side"])
        self.assertEqual(arb["pinnacle_source_index"], 2)
        self.assertEqual(arb["pinnacle_selection_id"], "998877")
        self.assertEqual(arb["pinnacle_odds_id"], "222333")
        self.assertTrue(arb["pinnacle_place_supported"])

    def test_arbs_endpoint_hides_only_pinnacle_overvalue_above_limit(self):
        headers = self.login("owner", "owner123")
        self.assume_forted_stream_alive()
        now = time.time()
        visible_at_limit = self.make_hidden_test_arb(1, event_id=9101)
        visible_at_limit["pin_overvalue"] = 140
        hidden_high_pinnacle = self.make_hidden_test_arb(2, event_id=9102)
        hidden_high_pinnacle["pin_overvalue"] = 141
        visible_high_counter = self.make_hidden_test_arb(3, event_id=9103)
        visible_high_counter["pin_overvalue"] = 25
        visible_high_counter["counter_overvalue"] = 180
        for arb in (visible_at_limit, hidden_high_pinnacle, visible_high_counter):
            arb["updated_at"] = now

        server._arbs_source = "listener"
        server._arbs_updated_at = now
        server._arbs_cache = [visible_at_limit, hidden_high_pinnacle, visible_high_counter]

        response = self.client.get("/api/arbs", headers=headers)

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        ids = {arb["id"] for arb in payload["arbs"]}
        self.assertIn(visible_at_limit["id"], ids)
        self.assertIn(visible_high_counter["id"], ids)
        self.assertNotIn(hidden_high_pinnacle["id"], ids)
        self.assertEqual(payload["total_count"], 2)

    def test_arbs_endpoint_filters_counter_books_by_active_forted_profile(self):
        headers = self.login("owner", "owner123")
        now = time.time()
        lad = self.make_hidden_test_arb(1, event_id=9201)
        lad.update({
            "id": "lad-live",
            "bk2": "ladbrokes.com",
            "bk2_url": "https://sports.ladbrokes.com/event/live",
            "is_live": True,
            "updated_at": now,
        })
        dirty_pin = self.make_hidden_test_arb(2, event_id=9202)
        dirty_pin.update({
            "id": "dirty-pin-live",
            "bk2": "pinnaclesports.com",
            "bk2_url": "https://www.pinnaclesports.com/en/event/live",
            "is_live": True,
            "updated_at": now,
        })
        server._arbs_source = "listener"
        server._arbs_updated_at = now
        server._arbs_cache = [lad, dirty_pin]
        original_lws_token = server.FORTED_LWS_TOKEN
        server.FORTED_LWS_TOKEN = "test-token"

        async def fake_rust_admin_request(method, path, json_body=None):
            self.assertEqual(method, "GET")
            self.assertEqual(path, "/admin/status")
            return {"active_config": "config_pin_ladbrokes.toml"}

        try:
            with patch.object(server, "_rust_admin_request", fake_rust_admin_request):
                response = self.client.get("/api/arbs?live=live", headers=headers)
        finally:
            server.FORTED_LWS_TOKEN = original_lws_token

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual([arb["id"] for arb in payload["arbs"]], ["lad-live"])
        self.assertEqual(payload["filters"]["bookmakers"], ["ladbrokes.com"])
        self.assertEqual(payload["total_count"], 1)

    def test_external_feed_fork_consumes_child_market_metadata(self):
        arb = server._feed_fork_to_arb(
            {
                "sport": "Теннис - ATP",
                "profit": 2.4,
                "event_id": "456789",
                "fork_timestamp": time.time(),
                "stake_types": "П1;П2",
                "market_metadata": {"family": "Game Winner", "game_number": 8},
                "bk1": "bet365.com",
                "bk2": "pinnaclesports.com",
                "event_name": "Player A - Player B",
                "bk1_link": "https://www.bet365.com/",
                "bk2_link": "https://www.pinnacle.com/?selection_id=111222",
                "odds1": 1.91,
                "odds2": 2.12,
            },
            0,
        )

        self.assertIsNotNone(arb)
        self.assertEqual(arb["market"], "Game Winner")
        self.assertEqual(arb["bk1_outcome"], "Game 8 Win2")
        self.assertEqual(arb["pinnacle_market_metadata"]["game_number"], 8)

    def test_external_feed_merges_exact_tennis_coordinates_from_forted(self):
        arb = server._feed_fork_to_arb(
            {
                "sport": "Теннис - ATP",
                "profit": 2.4,
                "event_id": "456789",
                "fork_timestamp": time.time(),
                "stake_types": "гейм 8 П1;гейм 8 П2",
                "set_number": 1,
                "game_number": 8,
                "bk1": "pinnaclesports.com",
                "bk2": "bet365.com",
                "event_name": "Player A - Player B",
                "bk1_link": "/1632494715",
                "bk2_link": "https://www.bet365.com/",
                "odds1": 2.12,
                "odds2": 1.91,
            },
            0,
        )

        self.assertIsNotNone(arb)
        self.assertEqual(arb["market"], "Game Winner")
        self.assertEqual(arb["pinnacle_market_metadata"]["set_number"], 1)
        self.assertEqual(arb["pinnacle_market_metadata"]["game_number"], 8)
        self.assertEqual(
            server._forted_translate_for_pinnacle_service(
                "гейм 8 П1", arb, 0,
            ),
            "P1 1G 8",
        )

    def test_external_feed_accepts_camel_case_market_metadata(self):
        arb = server._feed_fork_to_arb(
            {
                "sport": "Теннис - ATP",
                "profit": 2.4,
                "event_id": "456789",
                "fork_timestamp": time.time(),
                "stake_types": "П1;П2",
                "marketMetadata": {"family": "Game Winner", "gameNumber": 8},
                "bk1": "bet365.com",
                "bk2": "pinnaclesports.com",
                "event_name": "Player A - Player B",
                "bk1_link": "https://www.bet365.com/",
                "bk2_link": "https://www.pinnacle.com/?selection_id=111222",
                "odds1": 1.91,
                "odds2": 2.12,
            },
            0,
        )

        self.assertIsNotNone(arb)
        self.assertEqual(arb["market"], "Game Winner")
        self.assertEqual(arb["pinnacle_market_metadata"]["game_number"], 8)

    def test_external_feed_merges_snake_and_camel_market_metadata(self):
        arb = server._feed_fork_to_arb(
            {
                "sport": "Теннис - ATP",
                "profit": 2.4,
                "event_id": "456789",
                "fork_timestamp": time.time(),
                "stake_types": "Game 8 Over 8.5;Game 8 Under 8.5",
                "market_metadata": {"family": "Totals", "line": "8.5"},
                "marketMetadata": {"gameNumber": 8, "direction": "Over"},
                "bk1": "pinnaclesports.com",
                "bk2": "bet365.com",
                "event_name": "Player A - Player B",
                "bk1_link": "https://www.pinnacle.com/?selection_id=111222",
                "bk2_link": "https://www.bet365.com/",
                "odds1": 2.12,
                "odds2": 1.91,
            },
            0,
        )

        self.assertIsNotNone(arb)
        self.assertEqual(arb["market"], "Totals")
        self.assertEqual(arb["bk1_outcome"], "Game 8 Over 8.5")
        self.assertEqual(arb["pinnacle_market_metadata"]["game_number"], 8)
        self.assertEqual(arb["pinnacle_market_metadata"]["direction"], "Over")
        self.assertEqual(arb["pinnacle_market_metadata"]["line"], "8.5")

    def test_external_feed_accepts_comma_decimal_profit_and_odds(self):
        arb = server._feed_fork_to_arb(
            {
                "sport": "Теннис - ATP",
                "profit": "2,4",
                "event_id": "456789",
                "fork_timestamp": time.time(),
                "stake_types": "П1;П2",
                "bk1": "pinnaclesports.com",
                "bk2": "bet365.com",
                "event_name": "Player A - Player B",
                "bk1_link": "https://www.pinnacle.com/?selection_id=111222",
                "bk2_link": "https://www.bet365.com/",
                "odds1": "2,12",
                "odds2": "1,91",
            },
            0,
        )

        self.assertIsNotNone(arb)
        self.assertEqual(arb["bk1_odds"], 2.12)
        self.assertEqual(arb["bk2_odds"], 1.91)

    def test_external_feed_zero_line_metadata_builds_specific_totals_payload(self):
        arb = server._feed_fork_to_arb(
            {
                "sport": "Теннис - ATP",
                "profit": 2.4,
                "event_id": "456789",
                "fork_timestamp": time.time(),
                "stake_types": "П1;П2",
                "marketMetadata": {"family": "Totals", "direction": "Over", "line": 0},
                "bk1": "pinnaclesports.com",
                "bk2": "bet365.com",
                "event_name": "Player A - Player B",
                "bk1_link": "https://www.pinnacle.com/?line_id=zero-line",
                "bk2_link": "https://www.bet365.com/",
                "odds1": 2.12,
                "odds2": 1.91,
            },
            0,
        )

        self.assertIsNotNone(arb)
        self.assertEqual(arb["bk1_outcome"], "Over 0")
        payload = server._build_pinnacle_verify_payload(arb)
        self.assertEqual(payload["outcome"], "Over 0")
        self.assertEqual(payload["market_metadata"]["line"], 0)

    def test_external_feed_child_totals_metadata_overrides_game_heuristic(self):
        arb = server._feed_fork_to_arb(
            {
                "sport": "Теннис - ATP",
                "profit": 2.4,
                "event_id": "456789",
                "fork_timestamp": time.time(),
                "stake_types": "Game 8 Over 8.5;Game 8 Under 8.5",
                "market_metadata": {"family": "Totals", "game_number": 8},
                "bk1": "pinnaclesports.com",
                "bk2": "bet365.com",
                "event_name": "Player A - Player B",
                "bk1_link": "https://www.pinnacle.com/?selection_id=111222",
                "bk2_link": "https://www.bet365.com/",
                "odds1": 2.12,
                "odds2": 1.91,
            },
            0,
        )

        self.assertIsNotNone(arb)
        self.assertEqual(arb["market"], "Totals")
        self.assertEqual(arb["bk1_outcome"], "Game 8 Over 8.5")
        self.assertEqual(arb["pinnacle_market_metadata"]["line"], "8.5")

    def test_external_feed_canonicalizes_odd_even_family_alias(self):
        arb = server._feed_fork_to_arb(
            {
                "sport": "Теннис - ATP",
                "profit": 2.4,
                "event_id": "456789",
                "fork_timestamp": time.time(),
                "stake_types": "Game 5 Odd;Game 5 Even",
                "market_metadata": {"family": "OddEven", "game_number": 5},
                "bk1": "pinnaclesports.com",
                "bk2": "bet365.com",
                "event_name": "Player A - Player B",
                "bk1_link": "https://www.pinnacle.com/?selection_id=111222",
                "bk2_link": "https://www.bet365.com/",
                "odds1": 2.12,
                "odds2": 1.91,
            },
            0,
        )

        self.assertIsNotNone(arb)
        self.assertEqual(arb["market"], "Odd/Even")
        self.assertEqual(arb["bk1_outcome"], "Game 5 Odd")

    def test_verify_uses_pinnacle_stream_quote_without_pinnacle_rest(self):
        headers = self.login("owner", "owner123")
        original_stream_first = server.ROBINARB_VERIFY_PINNACLE_STREAM_FIRST
        original_match_limits = server._match_limits
        now = time.time()
        server.ROBINARB_VERIFY_PINNACLE_STREAM_FIRST = True
        server._match_limits = None
        server._arbs_source = "listener"
        server._arbs_updated_at = now
        server._arbs_cache = [{
            "id": "feed-quote-1",
            "sport": "Tennis",
            "league": "Tennis",
            "match": "Player A vs Player B",
            "home": "Player A",
            "away": "Player B",
            "market": "Moneyline",
            "side1": "Home",
            "side2": "Away",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
            "bk1_outcome": "Win1",
            "pinnacle_is_primary_side": True,
            "pinnacle_market_metadata": {"family": "Moneyline"},
            "pinnacle_selection_id": "sel-1",
            "pinnacle_odds_id": "odds-1",
            "pinnacle_line_id": "line-1",
            "pinnacle_hub_event_id": "1631777",
            "pinnacle_place_supported": True,
            "_source": "listener",
            "bk1": "Pinnacle",
            "bk1_odds": 2.05,
            "bk2": "bet365.com",
            "bk2_odds": 1.95,
            "robin_odds": 2.08,
            "profit_pct": 1.2,
            "robin_profit_pct": 2.5,
            "event_id": 123456,
            "is_live": True,
            "bk1_url": "https://www.pinnacle.com/",
            "bk2_url": "https://www.bet365.com/",
            "updated_at": now,
        }]

        class RaisingAsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                raise AssertionError("Pinnacle REST should not be used for stream quote")

            async def __aexit__(self, exc_type, exc, tb):
                return False

        async def fake_lookup_stream_price(**kwargs):
            self.assertEqual(kwargs["event_id"], "1631777")
            self.assertEqual(kwargs["odds_id"], "odds-1")
            return {
                "source": "pinnacle-stream",
                "slug": "tennis",
                "decimal_odds": 2.07,
                "event_id": "1631777",
                "odds_id": "odds-1",
                "line_id": "line-1",
                "matched_by": "id",
                "snapshot_ts": 123456789,
            }

        async def fake_exact_robin_price(working):
            working["robin_work_verified_pin_odds"] = 2.07
            server._record_robin_work_verified_binding(
                working,
                resolved_event_id=1631777,
                market_key="stream-moneyline",
            )
            working["robin_work_verification_blocked"] = False
            working["robin_work_verification_block_reason"] = None
            return 2.1, "pinnacle-stream-id"

        original_async_client = server.httpx.AsyncClient
        original_lookup_stream_price = server.pinnacle_hub.lookup_stream_price
        original_robin_price = server._robin_work_price_for_arb
        server.httpx.AsyncClient = RaisingAsyncClient
        server.pinnacle_hub.lookup_stream_price = fake_lookup_stream_price
        server._robin_work_price_for_arb = fake_exact_robin_price
        try:
            response = self.client.post("/api/verify", headers=headers, json={"arb_id": "feed-quote-1"})
            self.assertEqual(response.status_code, 200, response.text)
            payload = response.json()
            self.assertTrue(payload["verified"])
            self.assertEqual(payload["source"], "pinnacle-stream")
            self.assertEqual(payload["current_odds"], 2.07)
            self.assertEqual(payload["feed_odds"], 2.05)
            self.assertEqual(payload["robin_odds"], 2.1)
            self.assertTrue(payload["robin_quote_verified"])
            self.assertTrue(payload["quote_id"])

            bet_response = self.client.post(
                "/api/bet",
                headers=headers,
                json={
                    "arb_id": "feed-quote-1",
                    "side": "pinnacle",
                    "stake": 10.0,
                    "odds": payload["current_odds"],
                    "quote_id": payload["quote_id"],
                },
            )
            self.assertEqual(bet_response.status_code, 200, bet_response.text)
        finally:
            server.httpx.AsyncClient = original_async_client
            server.pinnacle_hub.lookup_stream_price = original_lookup_stream_price
            server._robin_work_price_for_arb = original_robin_price
            server.ROBINARB_VERIFY_PINNACLE_STREAM_FIRST = original_stream_first
            server._match_limits = original_match_limits

    def test_stream_quote_ignores_mock_arbs(self):
        original_source = server._arbs_source
        original_lookup_stream_price = server.pinnacle_hub.lookup_stream_price

        async def raising_lookup_stream_price(**kwargs):
            raise AssertionError("Pinnacle stream lookup should not be used for mock arbs")

        server.pinnacle_hub.lookup_stream_price = raising_lookup_stream_price
        try:
            server._arbs_source = "mock"
            arb = {
                "id": "mock-quote-1",
                "bk1_odds": 2.05,
                "robin_odds": 2.09,
                "bk1_selection": "Home",
                "bk1_outcome": "Win1",
                "market": "Moneyline",
                "_source": "mock",
            }
            payload = {"event_id": 123456, "market": "Moneyline", "outcome": "Win1"}

            result = server.asyncio.run(server._stream_quote_response("owner", "mock-quote-1", arb, payload))
            self.assertIsNone(result)
        finally:
            server.pinnacle_hub.lookup_stream_price = original_lookup_stream_price
            server._arbs_source = original_source

    def test_stream_issued_quote_without_exact_robin_binding_cannot_place_robin(self):
        headers = self.login("owner", "owner123")
        arb = {
            "id": "stream-robin-blocked",
            "sport": "Tennis",
            "match": "Player A vs Player B",
            "home": "Player A",
            "away": "Player B",
            "market": "Moneyline",
            "side1": "Home",
            "side2": "Away",
            "bk1_selection": "Home",
            "bk1_outcome": "Win1",
            "bk1_odds": 2.05,
            "bk2": "bet365.com",
            "bk2_odds": 1.95,
            "robin_odds": 2.11,
            "pinnacle_hub_event_id": "1631777",
            "pinnacle_market_metadata": {"family": "Moneyline", "raw_selection": "Home"},
            "updated_at": time.time(),
        }
        payload = server._build_pinnacle_verify_payload(arb)

        async def fake_cached_stream(_arb, _payload):
            return {
                "verified": True,
                "status": "OK",
                "current_odds": 2.07,
                "event_id": 1631777,
                "market": "Moneyline",
                "outcome": "Win1",
                "source": "pinnacle-stream",
            }

        async def unverified_robin(working):
            working["robin_work_verification_blocked"] = True
            working["robin_work_verification_block_reason"] = "No exact paired market"
            return 2.11, "unverified"

        with patch.object(server, "_cached_stream_quote_payload", new=fake_cached_stream), patch.object(
            server, "_robin_work_price_for_arb", new=unverified_robin,
        ):
            stream_response = server.asyncio.run(
                server._stream_quote_response("owner", arb["id"], arb, payload)
            )

        self.assertIsNotNone(stream_response)
        self.assertFalse(stream_response["robin_quote_verified"])
        quote = server._verified_quotes[stream_response["quote_id"]]
        self.assertTrue(quote["require_verified_robin"])
        self.assertEqual(quote["verification_mode"], "stream")

        original_find_arb = server._find_arb_by_id
        original_source = server._arbs_source
        server._find_arb_by_id = lambda _arb_id: arb
        server._arbs_source = "mock"
        try:
            place_response = self.client.post(
                "/api/bet",
                headers=headers,
                json={
                    "arb_id": arb["id"], "side": "robinbet", "stake": 1,
                    "odds": 2.11, "quote_id": stream_response["quote_id"],
                    "verify_mode": "demo",
                },
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server._arbs_source = original_source

        self.assertEqual(place_response.status_code, 409, place_response.text)
        self.assertIn("Exact Robin quote", place_response.text)

    def test_stream_quote_rejects_selection_only_lookup_when_ids_are_expected(self):
        original_source = server._arbs_source
        original_lookup_stream_price = server.pinnacle_hub.lookup_stream_price

        async def fake_lookup_stream_price(**kwargs):
            self.assertEqual(kwargs["selection_id"], "expected-selection")
            return {
                "source": "pinnacle-stream",
                "slug": "soccer",
                "decimal_odds": 4.35,
                "event_id": "1631777",
                "line_id": "wrong-line",
                "odds_id": "wrong-odds",
                "matched_by": "selection",
                "snapshot_ts": 123456789,
            }

        arb = {
            "id": "stream-selection-fallback",
            "sport": "Soccer",
            "market": "Moneyline",
            "bk1_selection": "Home",
            "bk1_outcome": "Win1",
            "bk1_odds": 1.5,
            "bk2_odds": 5.3,
            "pinnacle_hub_event_id": "1631777",
            "pinnacle_selection_id": "expected-selection",
            "pinnacle_market_metadata": {"family": "Moneyline", "raw_selection": "П1", "team": "1"},
            "_source": "listener",
        }
        payload = server._build_pinnacle_verify_payload(arb)
        server.pinnacle_hub.lookup_stream_price = fake_lookup_stream_price
        server._arbs_source = "listener"
        try:
            result = server.asyncio.run(server._stream_quote_response("owner", arb["id"], arb, payload))
        finally:
            server.pinnacle_hub.lookup_stream_price = original_lookup_stream_price
            server._arbs_source = original_source

        self.assertIsNone(result)

    def test_verify_betslip_rejects_suspicious_untrusted_odds_jump(self):
        headers = self.login("owner", "owner123")
        original_find_arb = server._find_arb_by_id
        original_async_client = server.httpx.AsyncClient
        original_lookup_more_bet_price = server.pinnacle_hub.lookup_more_bet_price

        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "results": [
                        {
                            "status": "OK",
                            "odds": "4.35",
                            "event_id": 123,
                            "market": "Moneyline",
                            "outcome": "Win1",
                        }
                    ]
                }

        class FakeAsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, json, **kwargs):
                return FakeResponse()

        async def fake_lookup_more_bet_price(**_kwargs):
            return None

        server._find_arb_by_id = lambda _arb_id: {
            "id": "suspicious-untrusted-jump",
            "event_id": 123,
            "pinnacle_hub_event_id": "123",
            "sport": "Tennis",
            "match": "Player A vs Player B",
            "market": "Moneyline",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
            "bk1_outcome": "Win1",
            "pinnacle_market_metadata": {"family": "Moneyline", "raw_selection": "П1", "team": "1"},
            "bk1_odds": 1.5,
            "bk2_odds": 5.3,
            "bk2": "bet365.com",
            "profit_pct": 1.0,
            "updated_at": time.time(),
        }
        server.httpx.AsyncClient = FakeAsyncClient
        server.pinnacle_hub.lookup_more_bet_price = fake_lookup_more_bet_price

        try:
            response = self.client.post(
                "/api/verify",
                headers=headers,
                json={"arb_id": "suspicious-untrusted-jump", "verify_mode": "betslip"},
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server.httpx.AsyncClient = original_async_client
            server.pinnacle_hub.lookup_more_bet_price = original_lookup_more_bet_price

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertFalse(payload["verified"])
        self.assertEqual(payload["status"], "MISMATCH")
        self.assertEqual(payload["error_code"], "SUSPICIOUS_ODDS_MOVE")
        self.assertIsNone(payload["quote_id"])

    def test_draw_prone_moneyline_is_not_two_leg_supported(self):
        self.assertTrue(server._is_draw_prone_moneyline_arb({
            "sport": "Soccer",
            "market": "Moneyline",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
        }))
        self.assertFalse(server._is_draw_prone_moneyline_arb({
            "sport": "Tennis",
            "market": "Moneyline",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
        }))
        self.assertFalse(server._is_draw_prone_moneyline_arb({
            "sport": "Soccer",
            "market": "Totals",
            "bk1_selection": "Over (2.5)",
            "bk2_selection": "Under (2.5)",
        }))

    def test_stats_monitor_rejects_selection_match_when_verified_ids_exist(self):
        original_lookup_stream_price = server.pinnacle_hub.lookup_stream_price
        original_stats_verify_betslip_price = server._stats_verify_betslip_price

        async def fake_lookup_stream_price(**kwargs):
            self.assertEqual(kwargs["line_id"], "line-verified")
            return {
                "source": "pinnacle-stream",
                "slug": "soccer",
                "decimal_odds": 13.79,
                "event_id": "1631748345",
                "line_id": "other-line",
                "odds_id": "other-odds",
                "matched_by": "selection",
                "snapshot_ts": 123456789,
            }

        async def fake_stats_verify_betslip_price(_arb):
            return {
                "verified": False,
                "status": "UNAVAILABLE",
                "current_odds": None,
                "source": "pinnacle-betslip",
                "detail": "Betslip market unavailable",
            }

        server.pinnacle_hub.lookup_stream_price = fake_lookup_stream_price
        server._stats_verify_betslip_price = fake_stats_verify_betslip_price
        try:
            result = server.asyncio.run(server._stats_monitor_price({
                "id": "stats-monitor-strict-id",
                "sport": "Soccer",
                "market": "Moneyline",
                "bk1_selection": "Draw",
                "bk1_outcome": "WinNone",
                "bk1_odds": 1.207,
                "bk2_odds": 23.0,
                "pinnacle_hub_event_id": "1631748345",
                "pinnacle_line_id": "line-verified",
                "pinnacle_odds_id": "odds-verified",
                "pinnacle_selection_id": "selection-verified",
                "pinnacle_market_metadata": {"family": "Moneyline", "raw_selection": "X", "team": "None"},
                "_source": "listener",
            }))
        finally:
            server.pinnacle_hub.lookup_stream_price = original_lookup_stream_price
            server._stats_verify_betslip_price = original_stats_verify_betslip_price

        self.assertEqual(result["status"], "UNAVAILABLE")
        self.assertIsNone(result["current_odds"])
        self.assertIn("verified selection identifiers", result["detail"])
        self.assertIn("Betslip market unavailable", result["detail"])
        self.assertEqual(result["stream_lookup"]["matched_by"], "selection")

    def test_stats_monitor_does_not_use_full_odds_for_contextual_market(self):
        original_lookup_stream_price = server.pinnacle_hub.lookup_stream_price
        original_stats_verify_betslip_price = server._stats_verify_betslip_price

        async def forbidden_stream_lookup(**_kwargs):
            raise AssertionError("contextual market must not use the standard FULL_ODDS stream")

        async def unavailable_betslip(_arb):
            return {
                "verified": False,
                "status": "UNAVAILABLE",
                "current_odds": None,
                "source": "pinnacle-betslip",
                "detail": "Betslip market unavailable",
            }

        server.pinnacle_hub.lookup_stream_price = forbidden_stream_lookup
        server._stats_verify_betslip_price = unavailable_betslip
        try:
            result = server.asyncio.run(server._stats_monitor_price({
                "id": "stats-contextual-market",
                "sport": "Soccer",
                "market": "Handicap",
                "market_context": "corners",
                "bk1_selection": "Handicap 1 (0.5)",
                "bk1_odds": 2.12,
                "pinnacle_hub_event_id": "1631748345",
                "pinnacle_market_metadata": {
                    "family": "Handicap",
                    "raw_selection": "Ф1(0,5)",
                    "market_context": "corners",
                },
                "_source": "listener",
            }))
        finally:
            server.pinnacle_hub.lookup_stream_price = original_lookup_stream_price
            server._stats_verify_betslip_price = original_stats_verify_betslip_price

        self.assertFalse(result["verified"])
        self.assertEqual(result["status"], "UNAVAILABLE")
        self.assertIn("contextual market: corners", result["detail"])
        self.assertIn("Betslip market unavailable", result["detail"])

    def test_pinnacle_period_hint_uses_forted_tennis_set_number(self):
        self.assertEqual(
            server._stream_lookup_period({
                "market_metadata": {"family": "Moneyline", "set_number": 1},
            }),
            1,
        )

    def test_stats_monitor_uses_betslip_fallback_when_stream_identifier_mismatches(self):
        original_lookup_stream_price = server.pinnacle_hub.lookup_stream_price
        original_stats_verify_betslip_price = server._stats_verify_betslip_price

        async def fake_lookup_stream_price(**kwargs):
            return {
                "source": "pinnacle-stream",
                "slug": "soccer",
                "decimal_odds": 13.79,
                "event_id": "1631748345",
                "line_id": "other-line",
                "odds_id": "other-odds",
                "matched_by": "selection",
                "snapshot_ts": 123456789,
            }

        async def fake_stats_verify_betslip_price(_arb):
            return {
                "verified": True,
                "status": "OK",
                "result_status": "ODDS_CHANGE",
                "current_odds": 1.215,
                "source": "pinnacle-betslip",
                "detail": "Pinnacle betslip verified at odds 1.215",
            }

        server.pinnacle_hub.lookup_stream_price = fake_lookup_stream_price
        server._stats_verify_betslip_price = fake_stats_verify_betslip_price
        try:
            result = server.asyncio.run(server._stats_monitor_price({
                "id": "stats-monitor-betslip-fallback",
                "sport": "Soccer",
                "market": "Moneyline",
                "bk1_selection": "Draw",
                "bk1_outcome": "WinNone",
                "bk1_odds": 1.207,
                "bk2_odds": 23.0,
                "pinnacle_hub_event_id": "1631748345",
                "pinnacle_line_id": "line-verified",
                "pinnacle_odds_id": "odds-verified",
                "pinnacle_selection_id": "selection-verified",
                "pinnacle_market_metadata": {"family": "Moneyline", "raw_selection": "X", "team": "None"},
                "_source": "listener",
            }))
        finally:
            server.pinnacle_hub.lookup_stream_price = original_lookup_stream_price
            server._stats_verify_betslip_price = original_stats_verify_betslip_price

        self.assertTrue(result["verified"])
        self.assertEqual(result["source"], "pinnacle-betslip-monitor")
        self.assertEqual(result["current_odds"], 1.215)
        self.assertEqual(result["stream_lookup"]["matched_by"], "selection")
        self.assertIn("stream fallback", result["detail"])

    def test_demo_verify_does_not_authorize_local_bet_without_live_quote(self):
        headers = self.login("owner", "owner123")
        self.stop_background_relay()
        self.assume_forted_stream_alive()
        now = time.time()
        server._arbs_source = "listener"
        server._arbs_updated_at = now
        server._arbs_cache = [self.make_hidden_test_arb(31, event_id=9310, odds2=2.3)]
        arb_id = "hide-arb-31"

        original_lookup_stream_price = server.pinnacle_hub.lookup_stream_price
        original_async_client = server.httpx.AsyncClient
        original_insert_bet = server._storage.insert_bet
        original_update_user_balance = server._storage.update_user_balance
        original_match_limits = server._match_limits

        async def fake_lookup_stream_price(**kwargs):
            return None

        class RaisingAsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                raise AssertionError("Demo mode should not call Pinnacle betslip REST")

            async def __aexit__(self, exc_type, exc, tb):
                return False

        server.pinnacle_hub.lookup_stream_price = fake_lookup_stream_price
        server.httpx.AsyncClient = RaisingAsyncClient
        server._storage.insert_bet = lambda *_args, **_kwargs: None
        server._storage.update_user_balance = lambda *_args, **_kwargs: None
        server._match_limits = None
        try:
            verify_response = self.client.post(
                "/api/verify",
                headers=headers,
                json={"arb_id": arb_id, "verify_mode": "demo"},
            )
            self.assertEqual(verify_response.status_code, 200, verify_response.text)
            verify_payload = verify_response.json()
            self.assertTrue(verify_payload["verified"])
            self.assertEqual(verify_payload["source"], "demo-feed")
            self.assertIsNone(verify_payload["quote_id"])

            bet_response = self.client.post(
                "/api/bet",
                headers=headers,
                json={
                    "arb_id": arb_id,
                    "side": "pinnacle",
                    "stake": 10.0,
                    "odds": 2.0,
                    "verify_mode": "demo",
                },
            )
            self.assertEqual(bet_response.status_code, 409, bet_response.text)
            self.assertIn("Verify the live Pinnacle price", bet_response.text)
        finally:
            server.pinnacle_hub.lookup_stream_price = original_lookup_stream_price
            server.httpx.AsyncClient = original_async_client
            server._storage.insert_bet = original_insert_bet
            server._storage.update_user_balance = original_update_user_balance
            server._match_limits = original_match_limits

    def test_verify_enriches_betslip_request_with_pin888_more_bet_line_id(self):
        headers = self.login("owner", "owner123")
        self.stop_background_relay()
        self.assume_forted_stream_alive()
        now = time.time()
        server._arbs_source = "listener"
        server._arbs_updated_at = now
        server._arbs_cache = [{
            "id": "more-bet-line-1",
            "sport": "Soccer",
            "league": "Soccer",
            "match": "Home FC vs Away FC",
            "home": "Home FC",
            "away": "Away FC",
            "team1_en": "Home FC",
            "team2_en": "Away FC",
            "market": "Handicap",
            "side1": "Ф2(1,5)",
            "side2": "Home",
            "bk1_selection": "Ф2(1,5)",
            "bk2_selection": "Home",
            "bk1_outcome": "Win2",
            "pinnacle_is_primary_side": True,
            "pinnacle_market_metadata": {
                "family": "Handicap",
                "raw_selection": "Ф2(1,5)",
                "line": "1.5",
                "team": "2",
            },
            "pinnacle_hub_event_id": "1631777",
            "_source": "listener",
            "bk1": "Pinnacle",
            "bk1_odds": 2.05,
            "bk2": "bet365.com",
            "bk2_odds": 1.95,
            "robin_odds": 2.08,
            "profit_pct": 1.2,
            "robin_profit_pct": 2.5,
            "event_id": 123456,
            "is_live": False,
            "updated_at": now,
        }]

        captured = {}

        async def fake_lookup_more_bet_price(**kwargs):
            self.assertEqual(kwargs["event_id"], "1631777")
            self.assertEqual(kwargs["raw_selection"], "Ф2(1,5)")
            return {
                "source": "pinnacle-more-bet",
                "event_id": "1631777",
                "line_id": "5678",
                "is_alt": 1,
                "actual_handicap": 1.5,
                "period": 0,
                "bet_type": 2,
                "team_select": 1,
                "handicap": 1.5,
                "cached": False,
            }

        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "results": [{
                        "status": "OK",
                        "odds": 2.04,
                        "line_id": "5678",
                        "event_id": 1631777,
                        "market": "Handicap",
                        "outcome": "Win2",
                        "team": "2",
                        "line": 1.5,
                        "odds_id": "1631777|0|2|1|1|1.5",
                        "selection_id": "5678|1631777|0|2|1|1|1.5|0",
                    }]
                }

        class CapturingAsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, json, **kwargs):
                if "/verify" in url:
                    captured["url"] = url
                    captured["json"] = dict(json)
                return FakeResponse()

        original_lookup_more_bet_price = server.pinnacle_hub.lookup_more_bet_price
        original_async_client = server.httpx.AsyncClient
        server.pinnacle_hub.lookup_more_bet_price = fake_lookup_more_bet_price
        server.httpx.AsyncClient = CapturingAsyncClient
        try:
            response = self.client.post("/api/verify", headers=headers, json={"arb_id": "more-bet-line-1"})
        finally:
            server.pinnacle_hub.lookup_more_bet_price = original_lookup_more_bet_price
            server.httpx.AsyncClient = original_async_client

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertTrue(payload["verified"])
        self.assertEqual(payload["source"], "pinnacle-betslip")
        self.assertEqual(payload["line_id"], "5678")
        self.assertEqual(payload["line_source"], "pinnacle-more-bet")
        self.assertEqual(captured["json"]["line_id"], "5678")
        self.assertEqual(captured["json"]["odds_id"], "1631777|0|2|1|1|1.5")
        self.assertEqual(captured["json"]["selection_id"], "5678|1631777|0|2|1|1|1.5|0")
        self.assertEqual(captured["json"]["is_alt"], 1)
        self.assertEqual(captured["json"]["handicap"], 1.5)
        self.assertEqual(captured["json"]["event_id"], 1631777)
        self.assertNotIn("expected_odds", captured["json"])

    def test_verify_uses_exact_signed_more_bet_line(self):
        headers = self.login("owner", "owner123")
        self.stop_background_relay()
        self.assume_forted_stream_alive()
        now = time.time()
        server._arbs_source = "listener"
        server._arbs_updated_at = now
        server._arbs_cache = [{
            "id": "mirror-handicap-line",
            "sport": "Soccer",
            "league": "Soccer",
            "match": "Home FC vs Away FC",
            "home": "Home FC",
            "away": "Away FC",
            "team1_en": "Home FC",
            "team2_en": "Away FC",
            "market": "Handicap",
            "side1": "Ф1(2,5)",
            "side2": "Away",
            "bk1_selection": "Ф1(2,5)",
            "bk2_selection": "Away",
            "bk1_outcome": "Win1",
            "pinnacle_is_primary_side": True,
            "pinnacle_market_metadata": {
                "family": "Handicap",
                "raw_selection": "Ф1(2,5)",
                "line": "2.5",
                "team": "1",
            },
            "pinnacle_hub_event_id": "1631779",
            "_source": "listener",
            "bk1": "Pinnacle",
            "bk1_odds": 1.408,
            "bk2": "bet365.com",
            "bk2_odds": 3.2,
            "robin_odds": 1.43,
            "profit_pct": 0.8,
            "robin_profit_pct": 1.1,
            "event_id": 123456,
            "is_live": False,
            "updated_at": now,
        }]

        captured = {}

        async def fake_lookup_more_bet_price(**kwargs):
            self.assertNotIn("expected_decimal_odds", kwargs)
            return {
                "source": "pinnacle-more-bet",
                "event_id": "1631779",
                "line_id": "56729624961",
                "is_alt": 1,
                "actual_handicap": 2.5,
                "period": 0,
                "bet_type": 2,
                "team_select": 0,
                "handicap": 2.5,
                "matched_by": "more_bet_selection",
                "home": "Home FC",
                "away": "Away FC",
                "requested_params": {"period": 0, "bet_type": 2, "team_select": 0, "handicap": 2.5},
                "cached": False,
            }

        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "results": [{
                        "status": "OK",
                        "odds": 1.408,
                        "line_id": "56729624961",
                        "event_id": 1631779,
                        "market": "Handicap",
                        "outcome": "Win1",
                        "team": "1",
                        "line": 2.5,
                        "odds_id": "1631779|0|2|0|1|2.5",
                        "selection_id": "56729624961|1631779|0|2|0|1|2.5|0",
                    }]
                }

        class CapturingAsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, json, **kwargs):
                if "/verify" in url:
                    captured["json"] = dict(json)
                return FakeResponse()

        original_lookup_more_bet_price = server.pinnacle_hub.lookup_more_bet_price
        original_async_client = server.httpx.AsyncClient
        server.pinnacle_hub.lookup_more_bet_price = fake_lookup_more_bet_price
        server.httpx.AsyncClient = CapturingAsyncClient
        try:
            response = self.client.post("/api/verify", headers=headers, json={"arb_id": "mirror-handicap-line"})
        finally:
            server.pinnacle_hub.lookup_more_bet_price = original_lookup_more_bet_price
            server.httpx.AsyncClient = original_async_client

        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["verified"])
        self.assertEqual(captured["json"]["handicap"], 2.5)
        self.assertEqual(captured["json"]["odds_id"], "1631779|0|2|0|1|2.5")
        self.assertEqual(captured["json"]["selection_id"], "56729624961|1631779|0|2|0|1|2.5|0")
        metadata = captured["json"]["market_metadata"]
        self.assertEqual(metadata["pinnacle_lookup_matched_by"], "more_bet_selection")
        self.assertEqual(metadata["pinnacle_actual_handicap"], 2.5)
        self.assertEqual(metadata["effective_ps3838_params"]["handicap"], 2.5)

    def test_betslip_mode_requires_verified_quote_for_pinnacle_bet(self):
        headers = self.login("owner", "owner123")
        self.stop_background_relay()
        now = time.time()
        server._arbs_source = "listener"
        server._arbs_updated_at = now
        server._arbs_cache = [self.make_hidden_test_arb(32, event_id=9320, odds2=2.3)]

        response = self.client.post(
            "/api/bet",
            headers=headers,
            json={
                "arb_id": "hide-arb-32",
                "side": "pinnacle",
                "stake": 10.0,
                "odds": 2.0,
                "verify_mode": "betslip",
            },
        )

        self.assertEqual(response.status_code, 409, response.text)

    def test_required_robin_quote_cannot_be_bypassed_with_client_verify_mode(self):
        headers = self.login("owner", "owner123")
        arb = {
            "id": "strict-robin-missing",
            "sport": "Tennis",
            "match": "Player A vs Player B",
            "market": "Moneyline",
            "bk1_selection": "Home",
            "bk1_outcome": "Win1",
            "bk1_odds": 2.2,
            "bk2": "bet365.com",
            "bk2_odds": 1.9,
            "robin_odds": 9.99,
            "updated_at": time.time(),
        }
        payload = server._build_pinnacle_verify_payload(arb)
        quote_id = server._issue_verified_quote(
            "owner", arb["id"], 2.2, payload, {},
            arb_snapshot=arb,
            verified_robin_odds=2.34,
            verified_robin_source="pinnacle-arcadia",
            require_verified_robin=True,
        )
        original_find_arb = server._find_arb_by_id
        original_source = server._arbs_source
        server._find_arb_by_id = lambda _arb_id: arb
        server._arbs_source = "mock"
        try:
            response = self.client.post(
                "/api/bet",
                headers=headers,
                json={
                    "arb_id": arb["id"], "side": "robinbet", "stake": 10,
                    "odds": 9.99, "quote_id": quote_id, "verify_mode": "stream",
                },
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server._arbs_source = original_source

        self.assertEqual(response.status_code, 409, response.text)
        self.assertIn("Exact Robin quote", response.text)

    def test_required_robin_quote_uses_server_verified_odds_in_every_mode(self):
        headers = self.login("owner", "owner123")
        arb = {
            "id": "strict-robin-coherent",
            "sport": "Tennis",
            "match": "Player A vs Player B",
            "market": "Moneyline",
            "bk1_selection": "Home",
            "bk1_outcome": "Win1",
            "bk1_odds": 2.2,
            "bk2": "bet365.com",
            "bk2_odds": 1.9,
            "robin_odds": 9.99,
            "updated_at": time.time(),
        }
        payload = server._build_pinnacle_verify_payload(arb)
        quote_id = server._issue_verified_quote(
            "owner", arb["id"], 2.2, payload, {},
            arb_snapshot=arb,
            verified_robin_odds=2.34,
            verified_robin_source="pinnacle-arcadia",
            require_verified_robin=True,
            robin_quote_verified=True,
        )
        original_find_arb = server._find_arb_by_id
        original_source = server._arbs_source
        server._find_arb_by_id = lambda _arb_id: arb
        server._arbs_source = "mock"
        try:
            response = self.client.post(
                "/api/bet",
                headers=headers,
                json={
                    "arb_id": arb["id"], "side": "robinbet", "stake": 10,
                    "odds": 2.34, "quote_id": quote_id, "verify_mode": "stream",
                },
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server._arbs_source = original_source

        self.assertEqual(response.status_code, 200, response.text)

    def test_verify_to_place_keeps_pinnacle_available_and_robin_structurally_bound(self):
        headers = self.login("owner", "owner123")
        now = time.time()
        arb = {
            "id": "verify-robin-binding-e2e",
            "sport": "Tennis",
            "league": "WTA Test",
            "match": "Player A vs Player B",
            "home": "Player A",
            "away": "Player B",
            "market": "Handicap",
            "side1": "H2 -1.5",
            "side2": "H1 +1.5",
            "bk1_selection": "H2 -1.5",
            "bk1_outcome": "H2 -1.5",
            "bk1_odds": 1.84,
            "bk2": "paddypower.com",
            "bk2_selection": "H1 +1.5",
            "bk2_odds": 2.1,
            "robin_odds": 9.99,
            "pinnacle_hub_event_id": "1632974942",
            "pinnacle_selection_id": "selection-1",
            "pinnacle_line_id": "line-1",
            "pinnacle_market_metadata": {
                "family": "Handicap", "raw_selection": "H2 -1.5",
                "team": "2", "line": "-1.5",
            },
            "updated_at": now,
        }

        class FakeResponse:
            status_code = 200
            text = ""

            def raise_for_status(self):
                return None

            def json(self):
                return {"results": [{
                    "status": "OK",
                    "odds": 1.84,
                    "event_id": 1632974942,
                    "market": "Handicap",
                    "outcome": "H2 -1.5",
                    "team": "2",
                    "line": -1.5,
                    "selection_id": "selection-1",
                    "line_id": "line-1",
                    "source": "bia_placer",
                }]}

        async def fake_service_post(*_args, **_kwargs):
            return FakeResponse()

        async def coherent_robin(working):
            working["robin_work_verified_pin_odds"] = 1.8403
            server._record_robin_work_verified_binding(
                working,
                resolved_event_id=1632974942,
                market_key="s;0;s;1.5",
            )
            working["robin_work_verification_blocked"] = False
            working["robin_work_verification_block_reason"] = None
            return 1.87, "pinnacle-arcadia"

        async def conflicting_robin(working):
            working["robin_work_verified_pin_odds"] = 1.8403
            server._record_robin_work_verified_binding(
                working,
                resolved_event_id=1632949639,
                market_key="s;0;s;1.5",
            )
            working["robin_work_verification_blocked"] = True
            working["robin_work_verification_block_reason"] = "Resolved a different Pinnacle event"
            return 1.87, "pinnacle-arcadia"

        previous_source = server._arbs_source
        previous_updated = server._arbs_updated_at
        previous_cache = server._arbs_cache
        previous_api_base = server.PINNACLE_API_BASE
        server._arbs_source = "mock"
        server._arbs_updated_at = now
        server._arbs_cache = [arb]
        server.PINNACLE_API_BASE = "http://pinnacle.test"
        try:
            with patch.object(server, "_pinnacle_service_post", new=fake_service_post), patch.object(
                server, "_robin_work_price_for_arb", new=coherent_robin,
            ):
                coherent_verify = self.client.post(
                    "/api/verify",
                    headers=headers,
                    json={"arb_id": arb["id"], "verify_mode": "betslip"},
                )
            self.assertEqual(coherent_verify.status_code, 200, coherent_verify.text)
            coherent_body = coherent_verify.json()
            self.assertTrue(coherent_body["verified"])
            self.assertTrue(coherent_body["robin_quote_verified"])
            self.assertEqual(coherent_body["robin_odds"], 1.87)
            coherent_quote = server._verified_quotes[coherent_body["quote_id"]]
            self.assertTrue(coherent_quote["require_verified_robin"])
            self.assertTrue(coherent_quote["robin_quote_verified"])

            coherent_place = self.client.post(
                "/api/bet",
                headers=headers,
                json={
                    "arb_id": arb["id"], "side": "robinbet", "stake": 1,
                    "odds": 1.87, "quote_id": coherent_body["quote_id"],
                    "verify_mode": "stream",
                },
            )
            self.assertEqual(coherent_place.status_code, 200, coherent_place.text)

            with patch.object(server, "_pinnacle_service_post", new=fake_service_post), patch.object(
                server, "_robin_work_price_for_arb", new=conflicting_robin,
            ):
                conflict_pin_verify = self.client.post(
                    "/api/verify", headers=headers,
                    json={"arb_id": arb["id"], "verify_mode": "betslip"},
                )
            conflict_pin_body = conflict_pin_verify.json()
            self.assertTrue(conflict_pin_body["verified"])
            self.assertFalse(conflict_pin_body["robin_quote_verified"])
            self.assertIsNone(conflict_pin_body["robin_odds"])

            pin_place = self.client.post(
                "/api/bet",
                headers=headers,
                json={
                    "arb_id": arb["id"], "side": "pinnacle", "stake": 1,
                    "odds": 1.84, "quote_id": conflict_pin_body["quote_id"],
                    "verify_mode": "stream",
                },
            )
            self.assertEqual(pin_place.status_code, 200, pin_place.text)

            with patch.object(server, "_pinnacle_service_post", new=fake_service_post), patch.object(
                server, "_robin_work_price_for_arb", new=conflicting_robin,
            ):
                conflict_robin_verify = self.client.post(
                    "/api/verify", headers=headers,
                    json={"arb_id": arb["id"], "verify_mode": "betslip"},
                )
            conflict_robin_body = conflict_robin_verify.json()
            robin_place = self.client.post(
                "/api/bet",
                headers=headers,
                json={
                    "arb_id": arb["id"], "side": "robinbet", "stake": 1,
                    "odds": 1.87, "quote_id": conflict_robin_body["quote_id"],
                    "verify_mode": "stream",
                },
            )
            self.assertEqual(robin_place.status_code, 409, robin_place.text)
            self.assertIn("Exact Robin quote", robin_place.text)
        finally:
            server._arbs_source = previous_source
            server._arbs_updated_at = previous_updated
            server._arbs_cache = previous_cache
            server.PINNACLE_API_BASE = previous_api_base

    def test_vbet_user_can_login(self):
        headers = self.login("vbet", "vbet")
        response = self.client.get("/api/auth/me", headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["user"]["username"], "vbet")

    def test_arbs_without_robin_work_use_default_bump_without_margin_request(self):
        headers = self.login("owner", "owner123")
        self.stop_background_relay()
        self.assume_forted_stream_alive()
        now = time.time()
        server._arbs_source = "listener"
        server._arbs_updated_at = now
        server._arbs_cache = [{
            "id": "rw-default-1",
            "sport": "Tennis",
            "league": "Tennis",
            "match": "Player A vs Player B",
            "home": "Player A",
            "away": "Player B",
            "market": "Moneyline",
            "side1": "Home",
            "side2": "Away",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
            "pinnacle_market_metadata": {"family": "Moneyline", "raw_selection": "Home"},
            "pinnacle_hub_event_id": "1631001",
            "_source": "listener",
            "bk1": "Pinnacle",
            "bk1_odds": 2.0,
            "bk2": "bet365.com",
            "bk2_odds": 2.0,
            "robin_odds": 3.0,
            "profit_pct": 1.2,
            "robin_profit_pct": 50.0,
            "event_id": 1001,
            "is_live": False,
            "updated_at": now,
        }]

        original_ensure_board = server.robin_margin.ensure_board
        original_robin_odds_for = server.robin_margin.robin_odds_for

        async def raising_ensure_board(*_args, **_kwargs):
            raise AssertionError("RobinWork board request should stay off")

        def raising_robin_odds_for(*_args, **_kwargs):
            raise AssertionError("RobinWork odds calculation should stay off")

        server.robin_margin.ensure_board = raising_ensure_board
        server.robin_margin.robin_odds_for = raising_robin_odds_for
        try:
            response = self.client.get("/api/arbs", headers=headers)
        finally:
            server.robin_margin.ensure_board = original_ensure_board
            server.robin_margin.robin_odds_for = original_robin_odds_for

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        arb = payload["arbs"][0]
        self.assertEqual(payload["robin_work"], {"enabled": False, "top_n": server.ROBINARB_ROBIN_WORK_TOP_N, "selected": []})
        self.assertEqual(arb["robin_odds"], 2.03)
        self.assertEqual(arb["robin_price_source"], "fallback-table")
        self.assertFalse(arb["robin_work_enabled"])
        self.assertFalse(arb["robin_work_selected"])

    def test_robin_work_selects_top_five_by_recalculated_robin_profit(self):
        headers = self.login("owner", "owner123")
        self.stop_background_relay()
        self.assume_forted_stream_alive()
        now = time.time()
        server._arbs_source = "listener"
        server._arbs_updated_at = now
        counter_odds = [2.6, 2.5, 2.4, 2.3, 2.2, 2.1]
        server._arbs_cache = [
            {
                "id": f"rw-top-{idx}",
                "sport": "Tennis",
                "league": "Tennis",
                "match": f"Player {idx}A vs Player {idx}B",
                "home": f"Player {idx}A",
                "away": f"Player {idx}B",
                "market": "Moneyline",
                "side1": "Home",
                "side2": "Away",
                "bk1_selection": "Home",
                "bk2_selection": "Away",
                "pinnacle_market_metadata": {"family": "Moneyline", "raw_selection": "Home"},
                "pinnacle_hub_event_id": f"163100{idx}",
                "_source": "listener",
                "bk1": "Pinnacle",
                "bk1_odds": 2.0,
                "bk2": "bet365.com",
                "bk2_odds": odds,
                "robin_odds": 2.04,
                "profit_pct": 10.0 - idx,
                "robin_profit_pct": 0.0,
                "event_id": 2000 + idx,
                "is_live": False,
                "updated_at": now,
            }
            for idx, odds in enumerate(counter_odds)
        ]

        original_top_n = server.ROBINARB_ROBIN_WORK_TOP_N
        original_candidate_n = server.ROBINARB_ROBIN_WORK_CANDIDATE_N
        original_price_for_arb = server._robin_work_price_for_arb
        odds_calls = []

        async def fake_price_for_arb(arb):
            event_id = arb.get("pinnacle_hub_event_id")
            odds_calls.append(str(event_id))
            arb["robin_work_verification_blocked"] = False
            arb["robin_work_verification_block_reason"] = None
            return (1.5 if str(event_id) == "1631000" else 2.3), "pinnacle-arcadia"

        server.ROBINARB_ROBIN_WORK_TOP_N = 5
        server.ROBINARB_ROBIN_WORK_CANDIDATE_N = 6
        server._robin_work_price_for_arb = fake_price_for_arb
        try:
            response = self.client.get("/api/arbs?robin_work=1", headers=headers)
        finally:
            server.ROBINARB_ROBIN_WORK_TOP_N = original_top_n
            server.ROBINARB_ROBIN_WORK_CANDIDATE_N = original_candidate_n
            server._robin_work_price_for_arb = original_price_for_arb

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        selected_ids = [f"rw-top-{idx}" for idx in range(1, 6)]
        self.assertEqual(payload["robin_work"], {"enabled": True, "top_n": 5, "selected": selected_ids})
        self.assertEqual(odds_calls, [f"163100{idx}" for idx in range(6)])

        by_id = {arb["id"]: arb for arb in payload["arbs"]}
        self.assertFalse(by_id["rw-top-0"]["robin_work_selected"])
        self.assertIsNone(by_id["rw-top-0"]["robin_work_rank"])
        self.assertEqual(by_id["rw-top-0"]["robin_odds"], 1.5)
        self.assertLess(by_id["rw-top-0"]["robin_profit_pct"], by_id["rw-top-5"]["robin_profit_pct"])
        self.assertTrue(by_id["rw-top-1"]["robin_work_selected"])
        self.assertEqual(by_id["rw-top-1"]["robin_work_rank"], 1)
        self.assertTrue(by_id["rw-top-5"]["robin_work_selected"])
        self.assertEqual(by_id["rw-top-5"]["robin_price_source"], "pinnacle-arcadia")

    def test_robin_work_calculates_top_per_counter_bookmaker_group(self):
        headers = self.login("owner", "owner123")
        self.stop_background_relay()
        self.assume_forted_stream_alive()
        now = time.time()
        server._arbs_source = "listener"
        server._arbs_updated_at = now

        def make_arb(idx, bookmaker, bookmaker_url, counter_odds):
            return {
                "id": idx,
                "sport": "Tennis",
                "league": "Tennis",
                "match": f"{idx} A vs {idx} B",
                "home": f"{idx} A",
                "away": f"{idx} B",
                "market": "Moneyline",
                "side1": "Home",
                "side2": "Away",
                "bk1_selection": "Home",
                "bk2_selection": "Away",
                "pinnacle_market_metadata": {"family": "Moneyline", "raw_selection": "Home"},
                "pinnacle_hub_event_id": idx.replace("rw-", "164"),
                "_source": "listener",
                "bk1": "Pinnacle",
                "bk1_odds": 2.0,
                "bk2": bookmaker,
                "bk2_url": bookmaker_url,
                "bk2_odds": counter_odds,
                "robin_odds": 2.04,
                "profit_pct": 10.0,
                "robin_profit_pct": 0.0,
                "event_id": idx,
                "is_live": False,
                "updated_at": now,
            }

        server._arbs_cache = [
            make_arb("rw-bet365-0", "bet365.com", "https://www.bet365.com/event/0", 2.6),
            make_arb("rw-bet365-1", "www.bet365.com", "https://bet365.com/event/1", 2.5),
            make_arb("rw-bet365-2", "Bet365", "https://www.bet365.com/event/2", 2.4),
            make_arb("rw-vbet-0", "vivarobet.com", "https://www.vivarobet.com/event/0", 2.7),
            make_arb("rw-vbet-1", "Vivarobet", "https://vivarobet.com/event/1", 2.55),
            make_arb("rw-vbet-2", "www.vivarobet.com", "https://www.vivarobet.com/event/2", 2.45),
        ]

        original_top_n = server.ROBINARB_ROBIN_WORK_TOP_N
        original_candidate_n = server.ROBINARB_ROBIN_WORK_CANDIDATE_N
        original_price_for_arb = server._robin_work_price_for_arb
        odds_calls = []

        async def fake_price_for_arb(arb):
            event_id = arb.get("pinnacle_hub_event_id")
            odds_calls.append(str(event_id))
            arb["robin_work_verification_blocked"] = False
            arb["robin_work_verification_block_reason"] = None
            return (1.5 if str(event_id).endswith("-0") else 2.3), "pinnacle-arcadia"

        server.ROBINARB_ROBIN_WORK_TOP_N = 2
        server.ROBINARB_ROBIN_WORK_CANDIDATE_N = 3
        server._robin_work_price_for_arb = fake_price_for_arb
        try:
            response = self.client.get("/api/arbs?robin_work=1", headers=headers)
        finally:
            server.ROBINARB_ROBIN_WORK_TOP_N = original_top_n
            server.ROBINARB_ROBIN_WORK_CANDIDATE_N = original_candidate_n
            server._robin_work_price_for_arb = original_price_for_arb

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["robin_work"]["top_n"], 2)
        self.assertEqual(
            set(payload["robin_work"]["selected"]),
            {"rw-bet365-1", "rw-bet365-2", "rw-vbet-1", "rw-vbet-2"},
        )
        self.assertEqual(len(odds_calls), 6)

        by_id = {arb["id"]: arb for arb in payload["arbs"]}
        self.assertFalse(by_id["rw-bet365-0"]["robin_work_selected"])
        self.assertFalse(by_id["rw-vbet-0"]["robin_work_selected"])
        self.assertEqual(by_id["rw-bet365-1"]["robin_work_rank"], 1)
        self.assertEqual(by_id["rw-vbet-1"]["robin_work_rank"], 1)
        self.assertEqual(by_id["rw-bet365-2"]["robin_work_rank"], 2)
        self.assertEqual(by_id["rw-vbet-2"]["robin_work_rank"], 2)

    def test_robin_work_uses_id_bound_stream_price_not_forted_price(self):
        headers = self.login("owner", "owner123")
        self.stop_background_relay()
        self.assume_forted_stream_alive()
        now = time.time()
        server._arbs_source = "listener"
        server._arbs_updated_at = now
        server._arbs_cache = [{
            "id": "rw-cache-hit",
            "sport": "Tennis",
            "league": "Tennis",
            "match": "Player Cache vs Player Hit",
            "home": "Player Cache",
            "away": "Player Hit",
            "market": "Moneyline",
            "side1": "Home",
            "side2": "Away",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
            "pinnacle_market_metadata": {"family": "Moneyline", "raw_selection": "Home"},
            "pinnacle_hub_event_id": "1631999",
            "pinnacle_line_id": "778899",
            "_source": "listener",
            "bk1": "Pinnacle",
            "bk1_odds": 2.0,
            "bk2": "bet365.com",
            "bk2_odds": 2.2,
            "robin_odds": 2.04,
            "profit_pct": 1.2,
            "robin_profit_pct": 0.0,
            "event_id": 1999,
            "is_live": False,
            "updated_at": now,
        }]

        original_lookup_stream_price = server.pinnacle_hub.lookup_stream_price
        original_arcadia = server._arcadia_quote_payload
        original_compact = server._pinnacle_compact_margin_price_for_robin_work

        async def fake_lookup_stream_price(**kwargs):
            return {
                "decimal_odds": 2.3,
                "event_id": "1631999",
                "market_signature": "same-pin-market",
                "market_margin": 0.05,
                "matched_by": "id+selection",
                "line_id": "778899",
            }

        async def no_arcadia(*_args, **_kwargs):
            return None

        async def no_compact(*_args, **_kwargs):
            return None

        server.pinnacle_hub.lookup_stream_price = fake_lookup_stream_price
        server._arcadia_quote_payload = no_arcadia
        server._pinnacle_compact_margin_price_for_robin_work = no_compact
        try:
            response = self.client.get("/api/arbs?robin_work=1", headers=headers)
        finally:
            server.pinnacle_hub.lookup_stream_price = original_lookup_stream_price
            server._arcadia_quote_payload = original_arcadia
            server._pinnacle_compact_margin_price_for_robin_work = original_compact

        self.assertEqual(response.status_code, 200, response.text)
        arb = response.json()["arbs"][0]
        self.assertTrue(arb["robin_work_selected"])
        self.assertEqual(arb["robin_odds"], round(server.robin_margin.compute_robin_odds(2.3, 0.05), 3))
        self.assertEqual(arb["robin_price_source"], "pinnacle-stream-id")
        self.assertEqual(arb["robin_work_verified_pin_odds"], 2.3)

    def test_robin_work_upgrades_stream_fallback_with_ps3838_compact_margin(self):
        headers = self.login("owner", "owner123")
        self.stop_background_relay()
        self.assume_forted_stream_alive()
        now = time.time()
        server._arbs_source = "listener"
        server._arbs_updated_at = now
        server._arbs_cache = [{
            "id": "rw-compact-margin",
            "sport": "Tennis",
            "league": "Tennis",
            "match": "Player Compact vs Player Margin",
            "home": "Player Compact",
            "away": "Player Margin",
            "market": "Moneyline",
            "side1": "Home",
            "side2": "Away",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
            "pinnacle_market_metadata": {"family": "Moneyline", "raw_selection": "Home"},
            "pinnacle_hub_event_id": "1632999",
            "_source": "listener",
            "bk1": "Pinnacle",
            "bk1_odds": 2.0,
            "bk2": "bet365.com",
            "bk2_odds": 2.2,
            "robin_odds": 2.04,
            "profit_pct": 1.2,
            "robin_profit_pct": 0.0,
            "event_id": 2999,
            "is_live": False,
            "updated_at": now,
        }]

        original_lookup_stream_price = server.pinnacle_hub.lookup_stream_price
        original_ensure_board = server.robin_margin.ensure_board
        original_compact_margin = server._pinnacle_compact_margin_price_for_robin_work
        original_arcadia_quote = server._arcadia_quote_payload
        calls = []

        async def fake_lookup_stream_price(**kwargs):
            return None

        async def fake_ensure_board(event_id, force=False):
            return False

        async def fake_compact_margin(*args, **kwargs):
            calls.append(kwargs["cache_key"])
            return 2.18, "ps3838-compact"

        async def no_arcadia(*_args, **_kwargs):
            return None

        server.pinnacle_hub.lookup_stream_price = fake_lookup_stream_price
        server.robin_margin.ensure_board = fake_ensure_board
        server._pinnacle_compact_margin_price_for_robin_work = fake_compact_margin
        server._arcadia_quote_payload = no_arcadia
        try:
            response = self.client.get("/api/arbs?robin_work=1", headers=headers)
        finally:
            server.pinnacle_hub.lookup_stream_price = original_lookup_stream_price
            server.robin_margin.ensure_board = original_ensure_board
            server._pinnacle_compact_margin_price_for_robin_work = original_compact_margin
            server._arcadia_quote_payload = original_arcadia_quote

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(calls), 1)
        arb = response.json()["arbs"][0]
        self.assertTrue(arb["robin_work_selected"])
        self.assertEqual(arb["robin_odds"], 2.18)
        self.assertEqual(arb["robin_price_source"], "ps3838-compact")

    def test_compact_margin_uses_independent_pinnacle_selected_odds(self):
        arb = {
            "id": "rw-independent-price",
            "sport": "Tennis",
            "home": "Player A",
            "away": "Player B",
            "market": "Handicap",
            "display_market": "По сетам: форы, тоталы, счёт",
            "bk1_selection": "Ф2(1,5)",
            "bk1_outcome": "H2 1.5",
            "bk1_odds": 1.751,
            "pinnacle_hub_event_id": "1632998",
            "pinnacle_market_metadata": {"family": "Handicap", "raw_selection": "Ф2(1,5)", "line": 1.5},
        }
        captured = {}

        class FakeResponse:
            def json(self):
                return {
                    "status": "OK",
                    "source": "compact",
                    "event_id": 1632998,
                    "margin": 0.05,
                    "selected_odds": 2.3,
                    "selected_line_id": "991122",
                    "price_signature": "exact:1632998:991122",
                }

            def raise_for_status(self):
                return None

        async def fake_post(path, payload, **kwargs):
            captured.update(payload)
            return FakeResponse()

        original_post = server._pinnacle_service_post
        original_cache = dict(server._PINNACLE_MARKET_MARGIN_CACHE)
        server._pinnacle_service_post = fake_post
        server._PINNACLE_MARKET_MARGIN_CACHE.clear()
        try:
            result = server.asyncio.run(server._pinnacle_compact_margin_price_for_robin_work(
                arb,
                raw_selection="Ф2(1,5)",
                cache_key="independent-price-key",
            ))
        finally:
            server._pinnacle_service_post = original_post
            server._PINNACLE_MARKET_MARGIN_CACHE.clear()
            server._PINNACLE_MARKET_MARGIN_CACHE.update(original_cache)

        self.assertEqual(result[1], "ps3838-compact")
        self.assertAlmostEqual(result[0], server.robin_margin.compute_robin_odds(2.3, 0.05))
        self.assertEqual(arb["robin_work_verified_pin_odds"], 2.3)
        self.assertEqual(arb["robin_work_verified_event_id"], 1632998)
        self.assertEqual(arb["pinnacle_line_id"], "991122")
        self.assertEqual(captured["market_scope"], "sets")
        self.assertEqual(captured["tennis_unit"], "set")
        self.assertNotIn("expected_odds", captured)

    def test_compact_margin_fails_closed_without_explicit_event_binding(self):
        requested_event_id = 1632996
        cases = (
            ("missing-event", {}, False, False),
            ("wrong-event", {"event_id": 1632000}, False, False),
            (
                "unscoped-parent",
                {"event_id": 1632001, "parent_event_id": requested_event_id},
                False,
                False,
            ),
            ("direct-event", {"event_id": requested_event_id}, False, True),
            (
                "scoped-related",
                {"event_id": 1632002, "parent_event_id": requested_event_id},
                True,
                True,
            ),
            (
                "scoped-wrong-parent",
                {"event_id": 1632003, "parent_event_id": 1632004},
                True,
                False,
            ),
        )

        original_post = server._pinnacle_service_post
        original_cache = dict(server._PINNACLE_MARKET_MARGIN_CACHE)
        try:
            for name, event_proof, scoped, expected_ok in cases:
                with self.subTest(name=name):
                    arb = {
                        "id": f"rw-{name}",
                        "sport": "Tennis",
                        "home": "Player A",
                        "away": "Player B",
                        "market": "Handicap",
                        "bk1_selection": "H2 -1.5",
                        "bk1_outcome": "H2 -1.5",
                        "bk1_odds": 1.84,
                        "pinnacle_hub_event_id": str(requested_event_id),
                        "pinnacle_market_metadata": {
                            "family": "Handicap",
                            "raw_selection": "H2 -1.5",
                            "team": "2",
                            "line": -1.5,
                            **({"game_number": 1} if scoped else {}),
                        },
                    }
                    response_body = {
                        "status": "OK",
                        "source": "compact",
                        "margin": 0.05,
                        "selected_odds": 1.84,
                        "selected_line_id": f"line-{name}",
                        "price_signature": f"signature-{name}",
                        **event_proof,
                    }

                    class FakeResponse:
                        def json(self):
                            return response_body

                        def raise_for_status(self):
                            return None

                    async def fake_post(*_args, **_kwargs):
                        return FakeResponse()

                    server._pinnacle_service_post = fake_post
                    server._PINNACLE_MARKET_MARGIN_CACHE.clear()
                    result = server.asyncio.run(
                        server._pinnacle_compact_margin_price_for_robin_work(
                            arb,
                            raw_selection="H2 -1.5",
                            cache_key=f"binding-{name}",
                        )
                    )

                    if expected_ok:
                        self.assertIsNotNone(result)
                        self.assertEqual(
                            arb["robin_work_verified_event_id"],
                            event_proof["event_id"],
                        )
                        self.assertEqual(
                            arb["robin_work_verified_related_event"],
                            name == "scoped-related",
                        )
                    else:
                        self.assertIsNone(result)
                        self.assertNotIn("robin_work_verified_pin_odds", arb)
                        self.assertNotIn("robin_work_verified_event_id", arb)
        finally:
            server._pinnacle_service_post = original_post
            server._PINNACLE_MARKET_MARGIN_CACHE.clear()
            server._PINNACLE_MARKET_MARGIN_CACHE.update(original_cache)

    def test_compact_margin_revalidates_cached_event_binding(self):
        arb = {
            "id": "rw-invalid-cached-binding",
            "sport": "Tennis",
            "home": "Player A",
            "away": "Player B",
            "market": "Moneyline",
            "bk1_selection": "Home",
            "bk1_outcome": "1",
            "bk1_odds": 2.0,
            "pinnacle_hub_event_id": "1632995",
            "pinnacle_market_metadata": {
                "family": "Moneyline", "raw_selection": "Home",
            },
        }
        payload = server._build_pinnacle_market_margin_payload(arb, "Home")
        lookup_key = server._market_margin_cache_key(payload, 0.0)
        invalid_cached = (
            2.1,
            "ps3838-compact",
            2.0,
            "wrong-event-signature",
            1632000,
            "line-1",
            1632995,
            True,
        )
        original_cache = dict(server._PINNACLE_MARKET_MARGIN_CACHE)
        server._PINNACLE_MARKET_MARGIN_CACHE.clear()
        server._market_margin_cache_set(lookup_key, invalid_cached)
        try:
            result = server.asyncio.run(
                server._pinnacle_compact_margin_price_for_robin_work(
                    arb,
                    raw_selection="Home",
                    cache_key="invalid-cached-binding",
                )
            )
        finally:
            server._PINNACLE_MARKET_MARGIN_CACHE.clear()
            server._PINNACLE_MARKET_MARGIN_CACHE.update(original_cache)

        self.assertIsNone(result)
        self.assertNotIn("robin_work_verified_event_id", arb)

    def test_robin_work_scanner_never_ranks_unbound_compact_price(self):
        arb = {
            "id": "rw-unbound-scanner-price",
            "sport": "Tennis",
            "home": "Player A",
            "away": "Player B",
            "market": "Handicap",
            "bk1_selection": "H2 -1.5",
            "bk1_outcome": "H2 -1.5",
            "bk1_odds": 1.84,
            "bk2_odds": 2.1,
            "pinnacle_hub_event_id": "1632994",
            "pinnacle_market_metadata": {
                "family": "Handicap",
                "raw_selection": "H2 -1.5",
                "team": "2",
                "line": -1.5,
            },
        }

        class FakeResponse:
            def json(self):
                return {
                    "status": "OK",
                    "source": "compact",
                    "event_id": 1632000,
                    "margin": 0.05,
                    "selected_odds": 2.61,
                    "selected_line_id": "wrong-line",
                    "price_signature": "wrong-event-market",
                }

            def raise_for_status(self):
                return None

        async def fake_post(*_args, **_kwargs):
            return FakeResponse()

        async def no_quote(*_args, **_kwargs):
            return None

        original_cache = dict(server._PINNACLE_MARKET_MARGIN_CACHE)
        server._PINNACLE_MARKET_MARGIN_CACHE.clear()
        try:
            with patch.object(server, "_pinnacle_service_post", new=fake_post), \
                    patch.object(server, "_arcadia_quote_payload", new=no_quote), \
                    patch.object(server, "_stream_lookup_for_robin_work", new=no_quote), \
                    patch.object(server, "_pinnacle_exact_verify_price_for_robin_work", new=no_quote):
                odds, source = server.asyncio.run(server._robin_work_price_for_arb(arb))
        finally:
            server._PINNACLE_MARKET_MARGIN_CACHE.clear()
            server._PINNACLE_MARKET_MARGIN_CACHE.update(original_cache)

        self.assertEqual(source, "unverified")
        self.assertNotEqual(odds, server.robin_margin.compute_robin_odds(2.61, 0.05))
        self.assertTrue(arb["robin_work_verification_blocked"])
        self.assertNotIn("robin_work_verified_event_id", arb)

    def test_exact_verify_fallback_uses_structural_tuple_not_forted_price(self):
        arb = {
            "id": "rw-exact-verify",
            "sport": "Soccer",
            "home": "Home FC",
            "away": "Away FC",
            "market": "Handicap",
            "bk1_selection": "Ф2(1,5)",
            "bk1_outcome": "H2 1.5",
            "bk1_odds": 1.4,
            "pinnacle_hub_event_id": "1632997",
            "pinnacle_market_metadata": {"family": "Handicap", "raw_selection": "Ф2(1,5)", "line": 1.5, "team": "2"},
        }
        captured = {}

        class FakeResponse:
            def json(self):
                return {"results": [{
                    "status": "OK",
                    "odds": 2.3,
                    "source": "bia_placer",
                    "event_id": 1632997,
                    "market": "Handicap",
                    "outcome": "H2 1.5",
                    "period": 0,
                    "bet_type": 2,
                    "team_select": 1,
                    "team": "2",
                    "handicap": 1.5,
                }]}

            def raise_for_status(self):
                return None

        async def fake_post(path, payload, **kwargs):
            captured.update(payload)
            return FakeResponse()

        original_post = server._pinnacle_service_post
        server._pinnacle_service_post = fake_post
        try:
            result = server.asyncio.run(server._pinnacle_exact_verify_price_for_robin_work(
                arb,
                raw_selection="Ф2(1,5)",
            ))
        finally:
            server._pinnacle_service_post = original_post

        self.assertEqual(result, (server.robin_margin.fallback_by_odds(2.3), "pinnacle-exact-verify"))
        self.assertEqual(arb["robin_work_verified_pin_odds"], 2.3)
        self.assertNotIn("expected_odds", captured)

    def test_robin_work_does_not_select_fallback_margin_rows(self):
        headers = self.login("owner", "owner123")
        self.stop_background_relay()
        self.assume_forted_stream_alive()
        now = time.time()
        server._arbs_source = "listener"
        server._arbs_updated_at = now
        server._arbs_cache = [{
            "id": "rw-fallback-only",
            "sport": "Soccer",
            "league": "Friendlies",
            "match": "Thailand vs Kuwait",
            "home": "Thailand",
            "away": "Kuwait",
            "market": "Totals",
            "side1": "ИТ2Б(2,5)",
            "side2": "ИТ2М(2,5)",
            "bk1_selection": "ИТ2Б(2,5)",
            "bk2_selection": "ИТ2М(2,5)",
            "pinnacle_market_metadata": {"family": "Totals", "raw_selection": "ИТ2Б(2,5)", "line": "2.5", "team": "2"},
            "pinnacle_hub_event_id": "1631498992",
            "_source": "listener",
            "bk1": "Pinnacle",
            "bk1_odds": 1.704,
            "bk2": "vivarobet.com",
            "bk2_odds": 2.3,
            "robin_odds": 1.734,
            "profit_pct": -2.12,
            "robin_profit_pct": 0.0,
            "event_id": 463338657,
            "is_live": False,
            "updated_at": now,
        }]

        original_price_for_arb = server._robin_work_price_for_arb

        async def fake_price_for_arb(_arb):
            return 1.734, "stream-fallback"

        server._robin_work_price_for_arb = fake_price_for_arb
        try:
            response = self.client.get("/api/arbs?robin_work=1", headers=headers)
        finally:
            server._robin_work_price_for_arb = original_price_for_arb

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["robin_work"], {"enabled": True, "top_n": 5, "selected": []})
        arb = payload["arbs"][0]
        self.assertFalse(arb["robin_work_selected"])
        self.assertIsNone(arb["robin_work_rank"])
        self.assertEqual(arb["robin_price_source"], "stream-fallback")

    def test_robin_work_rejects_selection_only_stream_without_pinnacle_id(self):
        headers = self.login("owner", "owner123")
        self.stop_background_relay()
        self.assume_forted_stream_alive()
        now = time.time()
        server._arbs_source = "listener"
        server._arbs_updated_at = now
        server._arbs_cache = [{
            "id": "rw-stream-margin",
            "sport": "Soccer",
            "league": "Soccer",
            "match": "Stream A vs Stream B",
            "home": "Stream A",
            "away": "Stream B",
            "market": "Totals",
            "side1": "Under (2.5)",
            "side2": "Over (2.5)",
            "bk1_selection": "Under (2.5)",
            "bk2_selection": "Over (2.5)",
            "pinnacle_market_metadata": {"family": "Totals", "raw_selection": "Under (2.5)", "line": 2.5},
            "pinnacle_hub_event_id": "1633999",
            "_source": "listener",
            "bk1": "Pinnacle",
            "bk1_odds": 2.0,
            "bk2": "bet365.com",
            "bk2_odds": 2.2,
            "robin_odds": 2.04,
            "profit_pct": 1.2,
            "robin_profit_pct": 0.0,
            "event_id": 3999,
            "is_live": False,
            "updated_at": now,
        }]

        original_lookup_stream_price = server.pinnacle_hub.lookup_stream_price
        original_ensure_board = server.robin_margin.ensure_board
        original_compact_margin = server._pinnacle_compact_margin_price_for_robin_work
        original_exact_verify = server._pinnacle_exact_verify_price_for_robin_work
        lookup_kwargs = {}

        async def fake_lookup_stream_price(**kwargs):
            lookup_kwargs.update(kwargs)
            return {
                # A selection-only stream lookup may resolve a neighbouring
                # line.  Its market pair is still useful for the margin, but
                # this price must not replace the exact Forted fork leg.
                "decimal_odds": 2.3,
                "event_id": "1633999",
                "market_signature": "stream-pair",
                "market_margin": 0.05,
            }

        async def raising_ensure_board(*_args, **_kwargs):
            raise AssertionError("stream margin should avoid MORE_BET board request")

        async def no_compact_margin(*_args, **_kwargs):
            return None

        async def no_exact_verify(*_args, **_kwargs):
            return None

        server.pinnacle_hub.lookup_stream_price = fake_lookup_stream_price
        server.robin_margin.ensure_board = raising_ensure_board
        server._pinnacle_compact_margin_price_for_robin_work = no_compact_margin
        server._pinnacle_exact_verify_price_for_robin_work = no_exact_verify
        try:
            response = self.client.get("/api/arbs?robin_work=1", headers=headers)
        finally:
            server.pinnacle_hub.lookup_stream_price = original_lookup_stream_price
            server.robin_margin.ensure_board = original_ensure_board
            server._pinnacle_compact_margin_price_for_robin_work = original_compact_margin
            server._pinnacle_exact_verify_price_for_robin_work = original_exact_verify

        self.assertEqual(response.status_code, 200, response.text)
        arb = response.json()["arbs"][0]
        self.assertFalse(arb["robin_work_selected"])
        self.assertEqual(arb["robin_price_source"], "unverified")
        self.assertTrue(arb["robin_work_verification_blocked"])
        self.assertEqual(lookup_kwargs, {})

    def test_robin_work_pricing_deadline_uses_safe_fallback(self):
        arb = {
            "id": "rw-timeout",
            "sport": "Tennis",
            "market": "Handicap",
            "bk1_odds": 2.0,
            "bk2_odds": 2.2,
            "profit_pct": 1.2,
            "bk2": "paddypower.com",
        }
        original_price = server._robin_work_price_for_arb
        original_timeout = server.ROBINARB_ROBIN_WORK_PRICING_TIMEOUT_SEC
        original_top_n = server.ROBINARB_ROBIN_WORK_TOP_N
        original_candidate_n = server.ROBINARB_ROBIN_WORK_CANDIDATE_N

        async def slow_price(_arb):
            await server.asyncio.sleep(0.05)
            return 9.9, "should-not-complete"

        server._robin_work_price_for_arb = slow_price
        server.ROBINARB_ROBIN_WORK_PRICING_TIMEOUT_SEC = 0.01
        server.ROBINARB_ROBIN_WORK_TOP_N = 1
        server.ROBINARB_ROBIN_WORK_CANDIDATE_N = 1
        try:
            selected = server.asyncio.run(server._apply_robin_work_pricing([arb], True))
        finally:
            server._robin_work_price_for_arb = original_price
            server.ROBINARB_ROBIN_WORK_PRICING_TIMEOUT_SEC = original_timeout
            server.ROBINARB_ROBIN_WORK_TOP_N = original_top_n
            server.ROBINARB_ROBIN_WORK_CANDIDATE_N = original_candidate_n

        self.assertEqual(selected, [])
        self.assertEqual(arb["robin_price_source"], "unverified")
        self.assertEqual(arb["robin_odds"], server.robin_margin.fallback_by_odds(2.0))
        self.assertFalse(arb["robin_work_selected"])
        self.assertTrue(arb["robin_work_verification_blocked"])

    def test_hidden_fork_is_excluded_before_robin_work_top_five_and_can_restore(self):
        headers = self.login("owner", "owner123")
        self.stop_background_relay()
        self.assume_forted_stream_alive()
        now = time.time()
        server._arbs_source = "listener"
        server._arbs_updated_at = now
        server._arbs_cache = [
            self.make_hidden_test_arb(idx, odds2=2.6 - idx * 0.1)
            for idx in range(6)
        ]

        original_price_for_arb = server._robin_work_price_for_arb
        odds_calls = []

        async def fake_price_for_arb(arb):
            event_id = arb.get("pinnacle_hub_event_id")
            odds_calls.append(str(event_id))
            arb["robin_work_verification_blocked"] = False
            arb["robin_work_verification_block_reason"] = None
            return 2.3, "pinnacle-arcadia"

        server._robin_work_price_for_arb = fake_price_for_arb
        try:
            hide_response = self.client.post(
                "/api/hidden-arbs",
                headers=headers,
                json={"arb_id": "hide-arb-0", "scope": "fork"},
            )
            self.assertEqual(hide_response.status_code, 200, hide_response.text)
            hidden_id = hide_response.json()["item"]["id"]

            odds_calls.clear()
            response = self.client.get("/api/arbs?robin_work=1", headers=headers)
            self.assertEqual(response.status_code, 200, response.text)
            payload = response.json()
            ids = [arb["id"] for arb in payload["arbs"]]
            self.assertNotIn("hide-arb-0", ids)
            self.assertEqual(payload["robin_work"]["selected"], [f"hide-arb-{idx}" for idx in range(1, 6)])
            self.assertEqual(odds_calls, [f"1638{8100 + idx}" for idx in range(1, 6)])

            restore_response = self.client.delete(f"/api/hidden-arbs/{hidden_id}", headers=headers)
            self.assertEqual(restore_response.status_code, 200, restore_response.text)

            restored_response = self.client.get("/api/arbs?robin_work=1", headers=headers)
            self.assertEqual(restored_response.status_code, 200, restored_response.text)
            restored_ids = [arb["id"] for arb in restored_response.json()["arbs"]]
            self.assertIn("hide-arb-0", restored_ids)
            self.assertEqual(restored_response.json()["robin_work"]["selected"], [f"hide-arb-{idx}" for idx in range(5)])
        finally:
            server._robin_work_price_for_arb = original_price_for_arb

    def test_hidden_match_is_user_scoped_and_hides_all_event_forks(self):
        owner_headers = self.login("owner", "owner123")
        trader_headers = self.login("trader1", "trader123")
        self.stop_background_relay()
        self.assume_forted_stream_alive()
        now = time.time()
        server._arbs_source = "listener"
        server._arbs_updated_at = now
        server._arbs_cache = [
            self.make_hidden_test_arb(1, event_id=9100, market="Moneyline", odds2=2.3),
            self.make_hidden_test_arb(2, event_id=9100, market="Totals", odds2=2.2),
            self.make_hidden_test_arb(3, event_id=9200, market="Moneyline", odds2=2.1),
        ]

        hide_response = self.client.post(
            "/api/hidden-arbs",
            headers=owner_headers,
            json={"arb_id": "hide-arb-1", "scope": "match"},
        )
        self.assertEqual(hide_response.status_code, 200, hide_response.text)

        owner_response = self.client.get("/api/arbs", headers=owner_headers)
        trader_response = self.client.get("/api/arbs", headers=trader_headers)
        self.assertEqual(owner_response.status_code, 200, owner_response.text)
        self.assertEqual(trader_response.status_code, 200, trader_response.text)

        owner_ids = {arb["id"] for arb in owner_response.json()["arbs"]}
        trader_ids = {arb["id"] for arb in trader_response.json()["arbs"]}
        self.assertNotIn("hide-arb-1", owner_ids)
        self.assertNotIn("hide-arb-2", owner_ids)
        self.assertIn("hide-arb-3", owner_ids)
        self.assertIn("hide-arb-1", trader_ids)
        self.assertIn("hide-arb-2", trader_ids)

        owner_hidden = self.client.get("/api/hidden-arbs", headers=owner_headers)
        trader_hidden = self.client.get("/api/hidden-arbs", headers=trader_headers)
        self.assertEqual(owner_hidden.json()["count"], 1)
        self.assertEqual(trader_hidden.json()["count"], 0)
        self.assertEqual(owner_hidden.json()["items"][0]["scope"], "match")

    def test_external_feed_drops_stale_source_timestamp(self):
        stale_timestamp = time.time() - server.ROBINARB_FEED_STALE_AFTER - 5
        arb = server._feed_fork_to_arb(
            {
                "sport": "Теннис - ATP",
                "profit": 2.4,
                "event_id": "456789",
                "fork_timestamp": stale_timestamp,
                "stake_types": "П1;П2",
                "bk1": "pinnaclesports.com",
                "bk2": "bet365.com",
                "event_name": "Player A - Player B",
                "bk1_link": "https://www.pinnacle.com/?selection_id=111222",
                "bk2_link": "https://www.bet365.com/",
                "odds1": 2.12,
                "odds2": 1.91,
            },
            0,
        )

        self.assertIsNone(arb)

    def test_external_feed_drops_future_source_timestamp(self):
        future_timestamp = time.time() + server.ROBINARB_FEED_FUTURE_SKEW + 5
        arb = server._feed_fork_to_arb(
            {
                "sport": "Теннис - ATP",
                "profit": 2.4,
                "event_id": "456789",
                "fork_timestamp": future_timestamp,
                "stake_types": "П1;П2",
                "bk1": "pinnaclesports.com",
                "bk2": "bet365.com",
                "event_name": "Player A - Player B",
                "bk1_link": "https://www.pinnacle.com/?selection_id=111222",
                "bk2_link": "https://www.bet365.com/",
                "odds1": 2.12,
                "odds2": 1.91,
            },
            0,
        )

        self.assertIsNone(arb)

    def test_external_feed_requires_source_timestamp(self):
        arb = server._feed_fork_to_arb(
            {
                "sport": "Теннис - ATP",
                "profit": 2.4,
                "event_id": "456789",
                "stake_types": "П1;П2",
                "bk1": "pinnaclesports.com",
                "bk2": "bet365.com",
                "event_name": "Player A - Player B",
                "bk1_link": "https://www.pinnacle.com/?selection_id=111222",
                "bk2_link": "https://www.bet365.com/",
                "odds1": 2.12,
                "odds2": 1.91,
            },
            0,
        )

        self.assertIsNone(arb)

    def test_bare_numeric_pinnacle_link_is_kept_untyped(self):
        self.assertIsNone(server._extract_pinnacle_selection_id("123456"))
        self.assertIsNone(server._extract_pinnacle_odds_id("123456"))
        self.assertIsNone(server._extract_pinnacle_line_id("123456"))
        self.assertEqual(server._extract_raw_pinnacle_identifier("123456"), "123456")

    def test_direct_forted_bare_numeric_mobl_does_not_populate_typed_ids(self):
        sb_parts = ["SB=", "Теннис", "2.5", str(time.time()), "", "", "", "", "", "", "2.05", "1.97", "", "", "", "", "123456"]
        arb = server._fork_to_arb(
            {
                "SB": ";".join(sb_parts),
                "ST": "П1;П2",
                "sources": [
                    {"bk": "pinnaclesports.com", "match": "Player A vs Player B", "mobl": "123456"},
                    {"bk": "bet365.com", "match": "Player A vs Player B", "mobl": "https://www.bet365.com/"},
                ],
            },
            0,
        )

        self.assertIsNotNone(arb)
        self.assertIsNone(arb["pinnacle_selection_id"])
        self.assertIsNone(arb["pinnacle_odds_id"])
        self.assertIsNone(arb["pinnacle_line_id"])
        self.assertEqual(arb["pinnacle_raw_id"], "123456")
        self.assertFalse(arb["pinnacle_place_supported"])

    def test_direct_forted_betfair_bare_market_id_is_preserved(self):
        sb_parts = ["SB=", "Теннис", "2.5", str(time.time()), "", "", "", "", "", "", "2.05", "1.97", "", "", "", "", "123456"]
        arb = server._fork_to_arb(
            {
                "SB": ";".join(sb_parts),
                "ST": "П1;П2",
                "sources": [
                    {"bk": "pinnaclesports.com", "match": "Player A vs Player B", "mobl": "https://www.pinnacle.com/?selection_id=123456"},
                    {"bk": "betfair.com", "match": "Player A vs Player B", "mobl": "1.23456789"},
                ],
            },
            0,
        )

        self.assertIsNotNone(arb)
        self.assertEqual(arb["bk2_url"], "https://www.betfair.com/exchange/plus/en/market/1.23456789")
        self.assertEqual(arb["betfair_market_id"], "1.23456789")

    def test_direct_forted_extracts_simple_lif_line_id(self):
        sb_parts = ["SB=", "Теннис", "2.5", str(time.time()), "", "", "", "", "", "", "2.05", "1.97", "", "", "", "", "123456"]
        arb = server._fork_to_arb(
            {
                "SB": ";".join(sb_parts),
                "ST": "П1;П2",
                "sources": [
                    {"bk": "pinnaclesports.com", "match": "Player A vs Player B", "mobl": "https://www.pinnacle.com/", "lif": "lineABC_123"},
                    {"bk": "bet365.com", "match": "Player A vs Player B", "mobl": "https://www.bet365.com/"},
                ],
            },
            0,
        )

        self.assertIsNotNone(arb)
        self.assertEqual(arb["pinnacle_line_id"], "lineABC_123")

    def test_direct_forted_preserves_mixed_case_http_mobl_links(self):
        pinnacle_link = "HTTPS://www.pinnacle.com/events/123?selection_id=ABC123&foo=bar"
        counter_link = "HtTpS://www.bet365.com/coupon?x=1"
        sb_parts = ["SB=", "Теннис", "2.5", str(time.time()), "", "", "", "", "", "", "2.05", "1.97", "", "", "", "", "123456"]
        arb = server._fork_to_arb(
            {
                "SB": ";".join(sb_parts),
                "ST": "П1;П2",
                "sources": [
                    {"bk": "pinnaclesports.com", "match": "Player A vs Player B", "mobl": pinnacle_link},
                    {"bk": "bet365.com", "match": "Player A vs Player B", "mobl": counter_link},
                ],
            },
            0,
        )

        self.assertIsNotNone(arb)
        self.assertEqual(arb["bk1_url"], "https://www.pinnacle888.com/en/events/123?selection_id=ABC123&foo=bar")
        self.assertEqual(arb["bk2_url"], counter_link)
        self.assertEqual(arb["pinnacle_selection_id"], "ABC123")

    def test_direct_forted_drops_stale_source_timestamp(self):
        stale_timestamp = time.time() - server.ROBINARB_FEED_STALE_AFTER - 5
        sb_parts = ["SB=", "Теннис", "2.5", str(stale_timestamp), "", "", "", "", "", "", "2.05", "1.97", "", "", "", "", "123456"]
        arb = server._fork_to_arb(
            {
                "SB": ";".join(sb_parts),
                "ST": "П1;П2",
                "sources": [
                    {"bk": "pinnaclesports.com", "match": "Player A vs Player B", "mobl": "https://www.pinnacle.com/?selection_id=123456"},
                    {"bk": "bet365.com", "match": "Player A vs Player B", "mobl": "https://www.bet365.com/"},
                ],
            },
            0,
        )

        self.assertIsNone(arb)

    def test_direct_forted_drops_future_source_timestamp(self):
        future_timestamp = time.time() + server.ROBINARB_FEED_FUTURE_SKEW + 5
        sb_parts = ["SB=", "Теннис", "2.5", str(future_timestamp), "", "", "", "", "", "", "2.05", "1.97", "", "", "", "", "123456"]
        arb = server._fork_to_arb(
            {
                "SB": ";".join(sb_parts),
                "ST": "П1;П2",
                "sources": [
                    {"bk": "pinnaclesports.com", "match": "Player A vs Player B", "mobl": "https://www.pinnacle.com/?selection_id=123456"},
                    {"bk": "bet365.com", "match": "Player A vs Player B", "mobl": "https://www.bet365.com/"},
                ],
            },
            0,
        )

        self.assertIsNone(arb)

    def test_direct_forted_empty_snapshot_keeps_recent_rolling_entries(self):
        relay = server.FortedRelay()
        old_arb = {
            "id": "old-forted-arb",
            "event_id": 123,
            "match": "Player A vs Player B",
            "bk2": "bet365.com",
            "market": "Moneyline",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
            "profit_pct": 2.1,
            "updated_at": time.time(),
            "_source": "forted",
        }
        server._arbs_cache = [old_arb]
        server._arbs_source = "forted"
        server._record_rolling_arbs([old_arb])
        relay.last_error = "previous error"
        relay.last_disconnect_reason = "previous disconnect"

        self.assertTrue(server._publish_direct_forted_snapshot({"surebets_frame": True, "forks": []}, relay))

        self.assertEqual(server._arbs_cache, [])
        self.assertEqual(server._arbs_source, "forted")
        self.assertEqual(relay.forks_total, 0)
        self.assertIsNone(relay.last_error)
        self.assertIsNone(relay.last_disconnect_reason)
        self.assertEqual({arb["id"] for arb in server._rolling_arbs_snapshot()}, {"old-forted-arb"})

    def test_listener_empty_snapshot_keeps_recent_entries_until_freshness_expires(self):
        headers = self.login("owner", "owner123")
        relay = server.ExternalFeedRelay()
        original_relay_thread = server._relay_thread
        server._relay_thread = relay
        self.addCleanup(setattr, server, "_relay_thread", original_relay_thread)
        old_arb = {
            "id": "old-listener-arb",
            "event_id": 123,
            "sport": "Tennis",
            "match": "Player A vs Player B",
            "bk2": "bet365.com",
            "market": "Moneyline",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
            "bk1": "Pinnacle",
            "bk1_odds": 2.0,
            "bk2_odds": 1.95,
            "robin_odds": 2.04,
            "profit_pct": 1.2,
            "robin_profit_pct": 1.6,
            "updated_at": time.time(),
            "_source": "listener",
        }
        server._arbs_cache = [old_arb]
        server._arbs_source = "listener"
        server._record_rolling_arbs([old_arb])

        server._publish_listener_snapshot([], relay, set())
        arbs_response = self.client.get("/api/arbs", headers=headers)
        feed_response = self.client.get("/api/forks/feed?limit=10", headers=headers)
        bet_response = self.client.post(
            "/api/bet",
            headers=headers,
            json={"arb_id": "old-listener-arb", "side": "robinbet", "stake": 100, "odds": 2.04},
        )

        self.assertEqual(server._arbs_cache, [])
        self.assertEqual(relay.forks_total, 0)
        self.assertEqual(arbs_response.status_code, 200, arbs_response.text)
        self.assertEqual(arbs_response.json()["count"], 1)
        self.assertEqual(feed_response.status_code, 200, feed_response.text)
        self.assertEqual(len(feed_response.json()), 1)
        self.assertNotEqual(bet_response.status_code, 404)

    def test_listener_empty_snapshot_ghost_fork_expires_after_freshness_window(self):
        """Story 2.1 fix1 P1: форк, ушедший из live snapshot ДАВНО (> ROBINARB_FEED_STALE_AFTER
        назад), должен считаться stale и отклоняться money-эндпоинтами, даже если глобальный
        Forted-поток остаётся живым — иначе он "призрачно" ставибелен вплоть до ROBINARB_ROLLING_TTL
        (300s) вместо короткого ROBINARB_FEED_STALE_AFTER (45s)."""
        headers = self.login("owner", "owner123")
        relay = server.ExternalFeedRelay()
        original_relay_thread = server._relay_thread
        server._relay_thread = relay
        self.addCleanup(setattr, server, "_relay_thread", original_relay_thread)
        old_arb = {
            "id": "ghost-listener-arb",
            "event_id": 124,
            "sport": "Tennis",
            "match": "Player C vs Player D",
            "bk2": "bet365.com",
            "market": "Moneyline",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
            "bk1": "Pinnacle",
            "bk1_odds": 2.0,
            "bk2_odds": 1.95,
            "robin_odds": 2.04,
            "profit_pct": 1.2,
            "robin_profit_pct": 1.6,
            "updated_at": time.time(),
            "_source": "listener",
        }
        server._arbs_cache = [old_arb]
        server._arbs_source = "listener"
        server._record_rolling_arbs([old_arb])

        # Симулируем, что форк не репортится upstream уже дольше freshness-окна:
        # искусственно "состариваем" _snapshot_seen_at в rolling-кеше (независимо
        # от глобальной живости потока, которую _publish_listener_snapshot ниже
        # оставит "живой").
        key = server._rolling_key(old_arb)
        with server._rolling_arbs_lock:
            server._rolling_arbs[key]["_snapshot_seen_at"] = (
                time.time() - server.ROBINARB_FEED_STALE_AFTER - 5
            )

        server._publish_listener_snapshot([], relay, set())
        arbs_response = self.client.get("/api/arbs", headers=headers)
        feed_response = self.client.get("/api/forks/feed?limit=10", headers=headers)
        bet_response = self.client.post(
            "/api/bet",
            headers=headers,
            json={"arb_id": "ghost-listener-arb", "side": "robinbet", "stake": 100, "odds": 2.04},
        )

        self.assertEqual(server._arbs_cache, [])
        self.assertEqual(arbs_response.status_code, 200, arbs_response.text)
        self.assertEqual(arbs_response.json()["count"], 0)
        self.assertEqual(feed_response.status_code, 200, feed_response.text)
        self.assertEqual(len(feed_response.json()), 0)
        self.assertEqual(bet_response.status_code, 404, bet_response.text)

    def test_arbs_poll_does_not_renew_ghost_fork_snapshot_seen_at(self):
        """Story 2.1 fix2 P0: GET /api/arbs re-stamp'ил _snapshot_seen_at из отфильтрованного
        `result` (строка ~8205), а не только из сырого _arbs_cache. `result` мержит rolling-cache
        items, прошедшие СТАРУЮ проверку свежести — включая призрачные форки, ещё в окне свежести,
        но уже отсутствующие в _arbs_cache. Каждый poll живого UI (1-10s) заново обновлял
        _snapshot_seen_at призрака -> таймер 45s никогда не истекал, пока клиент поллит быстрее
        45s (всегда true для live scanner) -> призрак вечно ставибелен/верифицируем."""
        headers = self.login("owner", "owner123")
        relay = server.ExternalFeedRelay()
        original_relay_thread = server._relay_thread
        server._relay_thread = relay
        self.addCleanup(setattr, server, "_relay_thread", original_relay_thread)
        old_arb = {
            "id": "ghost-poll-arb",
            "event_id": 125,
            "sport": "Tennis",
            "match": "Player E vs Player F",
            "bk2": "bet365.com",
            "market": "Moneyline",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
            "bk1": "Pinnacle",
            "bk1_odds": 2.0,
            "bk2_odds": 1.95,
            "robin_odds": 2.04,
            "profit_pct": 1.2,
            "robin_profit_pct": 1.6,
            "updated_at": time.time(),
            "_source": "listener",
        }
        server._arbs_cache = [old_arb]
        server._arbs_source = "listener"
        server._record_rolling_arbs([old_arb])
        key = server._rolling_key(old_arb)
        with server._rolling_arbs_lock:
            real_seen_at = server._rolling_arbs[key]["_snapshot_seen_at"]

        # Форк исчезает из живого snapshot (upstream перестал репортить) -> остаётся
        # только в rolling-кеше как "призрак" с последним реальным _snapshot_seen_at.
        server._publish_listener_snapshot([], relay, set())
        self.assertEqual(server._arbs_cache, [])

        # Симулируем поллинг живого клиента (типично 1-10s cadence) с живым потоком:
        # 4 запроса GET /api/arbs с шагом 20s (80s суммарно, > ROBINARB_FEED_STALE_AFTER=45s),
        # каждый следующий gap (20s) < 45s -> при наличии бага призрак re-stamp'ится и
        # никогда не пересекает порог staleness индивидуально, хотя реально не виден
        # в _arbs_cache уже 80s.
        base_time = real_seen_at
        for step in (20, 40, 60, 80):
            fake_now = base_time + step
            with patch("server.time.time", return_value=fake_now):
                relay.connected = True
                relay.last_frame_at = fake_now - 1
                poll_response = self.client.get("/api/arbs", headers=headers)
                self.assertEqual(poll_response.status_code, 200, poll_response.text)

        with server._rolling_arbs_lock:
            stored_after_polls = server._rolling_arbs.get(key)

        # Корень фикса: polling GET /api/arbs НЕ должен продлевать _snapshot_seen_at
        # призрака -- он должен остаться на моменте последнего реального присутствия
        # в _arbs_cache (real_seen_at), а не быть re-stamp'нутым на fake_now каждого poll'а.
        self.assertIsNotNone(stored_after_polls)
        self.assertAlmostEqual(stored_after_polls["_snapshot_seen_at"], real_seen_at, delta=1.0)

        final_now = base_time + 80
        with patch("server.time.time", return_value=final_now):
            relay.connected = True
            relay.last_frame_at = final_now - 1
            arbs_response = self.client.get("/api/arbs", headers=headers)
            feed_response = self.client.get("/api/forks/feed?limit=10", headers=headers)
            bet_response = self.client.post(
                "/api/bet",
                headers=headers,
                json={"arb_id": "ghost-poll-arb", "side": "robinbet", "stake": 100, "odds": 2.04},
            )

        ids = {arb["id"] for arb in arbs_response.json()["arbs"]}
        self.assertEqual(arbs_response.status_code, 200, arbs_response.text)
        self.assertNotIn("ghost-poll-arb", ids)
        self.assertEqual(feed_response.status_code, 200, feed_response.text)
        self.assertNotIn("ghost-poll-arb", [f.get("id") for f in feed_response.json()])
        self.assertEqual(bet_response.status_code, 404, bet_response.text)

    def test_listener_sparse_snapshot_keeps_recent_external_arbs(self):
        headers = self.login("owner", "owner123")
        relay = server.ExternalFeedRelay()
        original_relay_thread = server._relay_thread
        server._relay_thread = relay
        self.addCleanup(setattr, server, "_relay_thread", original_relay_thread)
        now = time.time()
        rich_arbs = [
            {
                "id": "listener-rich-a",
                "event_id": 111,
                "sport": "Tennis",
                "match": "Player A vs Player B",
                "bk1": "Pinnacle",
                "bk2": "bet365.com",
                "market": "Moneyline",
                "bk1_selection": "Home",
                "bk2_selection": "Away",
                "bk1_odds": 2.0,
                "bk2_odds": 1.95,
                "robin_odds": 2.04,
                "profit_pct": 2.1,
                "robin_profit_pct": 1.6,
                "updated_at": now,
                "_source": "listener",
            },
            {
                "id": "listener-rich-b",
                "event_id": 222,
                "sport": "Tennis",
                "match": "Player C vs Player D",
                "bk1": "Pinnacle",
                "bk2": "bet365.com",
                "market": "Moneyline",
                "bk1_selection": "Home",
                "bk2_selection": "Away",
                "bk1_odds": 2.1,
                "bk2_odds": 1.9,
                "robin_odds": 2.0,
                "profit_pct": 1.5,
                "robin_profit_pct": 1.2,
                "updated_at": now,
                "_source": "listener",
            },
        ]
        server._publish_listener_snapshot([dict(arb) for arb in rich_arbs], relay, {"pinnaclesports.com", "bet365.com"})
        server._publish_listener_snapshot([dict(rich_arbs[1])], relay, {"pinnaclesports.com", "bet365.com"})

        response = self.client.get("/api/arbs", headers=headers)
        bet_response = self.client.post(
            "/api/bet",
            headers=headers,
            json={"arb_id": "listener-rich-a", "side": "robinbet", "stake": 100, "odds": 2.04},
        )
        self.assertEqual(response.status_code, 200, response.text)
        ids = {arb["id"] for arb in response.json()["arbs"]}
        rolling_ids = {arb["id"] for arb in server._rolling_arbs_snapshot()}
        self.assertIn("listener-rich-a", rolling_ids)
        self.assertIn("listener-rich-a", ids)
        self.assertIn("listener-rich-b", ids)
        self.assertNotEqual(bet_response.status_code, 404)

    def test_direct_publish_records_rolling_before_sparse_snapshot(self):
        relay = server.FortedRelay()
        original_fork_to_arb = server._fork_to_arb
        now = time.time()
        rich_arbs = [
            {"id": "direct-rich-a", "event_id": 333, "match": "A vs B", "bk2": "bet365.com", "market": "Moneyline", "bk1_selection": "Home", "bk2_selection": "Away", "profit_pct": 2.1, "updated_at": now, "_source": "forted"},
            {"id": "direct-rich-b", "event_id": 444, "match": "C vs D", "bk2": "bet365.com", "market": "Moneyline", "bk1_selection": "Home", "bk2_selection": "Away", "profit_pct": 1.4, "updated_at": now, "_source": "forted"},
        ]
        server._fork_to_arb = lambda fork, _idx: dict(fork)
        try:
            self.assertTrue(server._publish_direct_forted_snapshot({"surebets_frame": True, "forks": rich_arbs}, relay))
            self.assertTrue(server._publish_direct_forted_snapshot({"surebets_frame": True, "forks": [rich_arbs[1]]}, relay))
        finally:
            server._fork_to_arb = original_fork_to_arb

        ids = {arb["id"] for arb in server._rolling_arbs_snapshot()}
        self.assertIn("direct-rich-a", ids)
        self.assertIn("direct-rich-b", ids)

    def test_source_feed_roundtrip_preserves_listener_shape(self):
        arb = server._feed_fork_to_arb(
            {
                "sport": "Теннис - ATP",
                "profit": 2.5,
                "event_id": "123456",
                "fork_timestamp": time.time(),
                "stake_types": "П1;П2",
                "bk1": "pinnaclesports.com",
                "bk2": "bet365.com",
                "event_name": "Player A - Player B",
                "bk1_link": "https://www.pinnacle.com/?selection_id=778899",
                "bk2_link": "https://www.bet365.com/",
                "odds1": 2.05,
                "odds2": 1.97,
            },
            0,
        )

        self.assertIsNotNone(arb)
        feed_fork = forted_source._arb_to_feed_fork(arb, 0)
        roundtrip = server._feed_fork_to_arb(feed_fork, 0)

        self.assertIsNotNone(roundtrip)
        self.assertEqual(roundtrip["bk1"], "Pinnacle")
        self.assertEqual(roundtrip["bk2"], "bet365.com")
        self.assertEqual(roundtrip["event_id"], 123456)
        self.assertEqual(roundtrip["pinnacle_selection_id"], "778899")

    def test_feed_market_code_recovers_half_and_prop_context(self):
        arb = server._feed_fork_to_arb(
            {
                "sport": "Баскетбол - Европа", "profit": 2.5,
                "event_id": "123456", "fork_timestamp": time.time(),
                "stake_types": "П1;П2", "market_code": "УГЛ 1п",
                "bk1": "pinnaclesports.com", "bk2": "ladbrokes.com",
                "event_name": "Team A - Team B", "odds1": 2.05, "odds2": 1.97,
            },
            0,
        )
        self.assertIsNotNone(arb)
        self.assertEqual(arb["period_number"], 1)
        self.assertEqual(arb["period_type"], "half")
        self.assertEqual(arb["market_scope"], "half")
        self.assertEqual(arb["market_context"], "corners")
        self.assertEqual(arb["pinnacle_market_metadata"]["period_number"], 1)

    def test_feed_empty_market_code_is_explicit_full_scope(self):
        arb = server._feed_fork_to_arb(
            {
                "sport": "Футбол - Европа", "profit": 2.5,
                "event_id": "123456", "fork_timestamp": time.time(),
                "stake_types": "П1;П2", "market_code": "",
                "bk1": "pinnaclesports.com", "bk2": "ladbrokes.com",
                "event_name": "Team A - Team B", "odds1": 2.05, "odds2": 1.97,
            },
            0,
        )
        self.assertIsNotNone(arb)
        self.assertEqual(arb["market_scope"], "full")

    def test_feed_profit_replaces_giant_reported_value_with_odds_math(self):
        arb = server._feed_fork_to_arb(
            {
                "sport": "Теннис - ATP",
                "profit": 99999,
                "event_id": "123456",
                "fork_timestamp": time.time(),
                "stake_types": "П1;П2",
                "bk1": "pinnaclesports.com",
                "bk2": "bet365.com",
                "event_name": "Player A - Player B",
                "odds1": 2.0,
                "odds2": 2.0,
            },
            0,
        )

        self.assertIsNotNone(arb)
        self.assertEqual(arb["profit_pct"], 0.0)

    def test_feed_rejects_giant_profit_implied_by_odds(self):
        arb = server._feed_fork_to_arb(
            {
                "sport": "Теннис - ATP",
                "profit": 1.0,
                "event_id": "123456",
                "fork_timestamp": time.time(),
                "stake_types": "П1;П2",
                "bk1": "pinnaclesports.com",
                "bk2": "bet365.com",
                "event_name": "Player A - Player B",
                "odds1": 10.0,
                "odds2": 10.0,
            },
            0,
        )

        self.assertIsNone(arb)

    def test_forted_filters_expose_available_sports_catalog(self):
        headers = self.login("owner", "owner123")

        response = self.client.get("/api/forted/filters", headers=headers)
        self.assertEqual(response.status_code, 200, response.text)

        filters = response.json()["filters"]
        self.assertIn("Tennis", filters["available_sports"])
        self.assertGreaterEqual(filters["available_sports_count"], filters["sports_count"])
        self.assertEqual(filters["available_sports_count"], len(filters["available_sports"]))

    def test_authenticated_backend_feed_endpoint_returns_listener_shape(self):
        headers = self.login("owner", "owner123")

        response = self.client.get("/api/forks/feed?limit=1", headers=headers)
        self.assertEqual(response.status_code, 200, response.text)

        payload = response.json()
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["bk1"], "pinnaclesports.com")
        self.assertIn("event_name", payload[0])
        self.assertIn("odds1", payload[0])
        self.assertIn("odds2", payload[0])

    def test_infer_pinnacle_outcome_keeps_total_and_handicap_lines(self):
        self.assertEqual(
            server._infer_pinnacle_outcome("Over (8,5)", "Totals", True),
            "Over 8.5",
        )
        self.assertEqual(
            server._infer_pinnacle_outcome("Home", "Totals", True, {"family": "Totals", "direction": "Over", "line": 0}),
            "Over 0",
        )
        self.assertEqual(
            server._infer_pinnacle_outcome("P1 Handicap 2 (+1,5)", "Handicap", False),
            "P1 H2 +1.5",
        )
        self.assertEqual(
            server._infer_pinnacle_outcome("Home", "Handicap", True, {"family": "Handicap", "team": "1", "line": 0}),
            "H1 0",
        )

    def test_infer_pinnacle_outcome_keeps_game_and_set_context(self):
        self.assertEqual(
            server._infer_pinnacle_outcome("Game 8 Away", "Game Winner", False),
            "Game 8 Win2",
        )
        self.assertEqual(
            server._infer_pinnacle_outcome("Set 2 Home", "Set Winner", True),
            "Set 2 Win1",
        )

    def test_infer_pinnacle_outcome_keeps_set_total_and_child_odd_even_context(self):
        set_total_metadata = server._parse_selection_market_metadata("Set 2 Over 9.5", "Totals", True)
        odd_even_metadata = server._parse_selection_market_metadata("Game 5 Odd", "Odd/Even", True)

        self.assertEqual(set_total_metadata["set_number"], 2)
        self.assertEqual(set_total_metadata["line"], "9.5")
        self.assertEqual(server._infer_pinnacle_outcome("Set 2 Over 9.5", "Totals", True, set_total_metadata), "Set 2 Over 9.5")
        self.assertEqual(odd_even_metadata["game_number"], 5)
        self.assertEqual(odd_even_metadata["parity"], "Odd")
        self.assertEqual(server._infer_pinnacle_outcome("Game 5 Odd", "Odd/Even", True, odd_even_metadata), "Game 5 Odd")

    def test_infer_pinnacle_outcome_supports_draw(self):
        self.assertEqual(
            server._infer_pinnacle_outcome("Draw", "Moneyline", True),
            "WinNone",
        )

    def test_totals_text_does_not_create_false_set_or_game_scope(self):
        metadata = server._parse_selection_market_metadata("Totals 2.5 Over", "Totals", True)

        self.assertNotIn("set_number", metadata)
        self.assertNotIn("game_number", metadata)

    def test_tennis_structured_period_outranks_ambiguous_games_label(self):
        set_arb = {
            "sport": "Tennis",
            "display_market": "Геймы, 1 сет",
            "pinnacle_market_metadata": {"family": "Moneyline", "set_number": 1, "period_type": "set"},
        }
        game_arb = {
            "sport": "Tennis",
            "display_market": "Геймы, 1 сет",
            "pinnacle_market_metadata": {"family": "Moneyline", "set_number": 1, "game_number": 8, "period_type": "game"},
        }
        set_total_arb = {
            "sport": "Tennis",
            "display_market": "Геймы, 1 сет",
            "pinnacle_market_metadata": {"family": "Totals", "set_number": 1, "period_type": "set"},
        }
        volleyball_arb = {
            "sport": "Volleyball",
            "display_market": "Геймы, 1 сет",
            "pinnacle_market_metadata": {"family": "Totals", "set_number": 1, "period_type": "set"},
        }
        generic_games_arb = {
            "sport": "Tennis",
            "bk1_event_name": "Alexandra Eala (Games) vs Qinwen Zheng (Games)",
            "market": "Handicap",
            "pinnacle_market_metadata": {"family": "Handicap", "line": -1.5},
        }

        self.assertEqual(server._pinnacle_market_scope(set_arb), "sets")
        self.assertEqual(server._pinnacle_market_scope(game_arb), "games")
        self.assertEqual(server._pinnacle_market_scope(set_total_arb), "games")
        self.assertEqual(server._pinnacle_market_scope(volleyball_arb), "")
        self.assertEqual(server._pinnacle_market_scope(generic_games_arb), "games")
        self.assertEqual(server._tennis_unit_from_market_scope("sets"), "set")
        self.assertEqual(server._tennis_unit_from_market_scope("games"), "game")
        self.assertEqual(server._tennis_unit_from_market_scope(""), "")
        self.assertIsNone(server._to_int_or_none(True))
        self.assertIsNone(server._to_int_or_none(1.9))
        self.assertIsNone(server._to_int_or_none("1.9"))
        self.assertEqual(server._to_int_or_none(1.0), 1)
        self.assertEqual(server._to_int_or_none("1"), 1)
        self.assertNotEqual(
            server._robin_work_cache_selection(set_arb, "H2 -1.5"),
            server._robin_work_cache_selection(
                {
                    **set_arb,
                    "display_market": "По геймам",
                    "pinnacle_market_metadata": {"family": "Handicap"},
                },
                "H2 -1.5",
            ),
        )

    def test_bia_transport_carries_exact_tennis_line_unit(self):
        cases = (
            ("По сетам: форы, тоталы, счёт", "sets", "set"),
            ("По геймам: форы, тоталы, счёт", "games", "game"),
        )
        for display_market, expected_scope, expected_unit in cases:
            with self.subTest(display_market=display_market):
                arb = {
                    "sport": "Tennis",
                    "market": "Handicap",
                    "display_market": display_market,
                    "bk1_selection": "Ф2(-1,5)",
                    "pinnacle_market_metadata": {
                        "family": "Handicap",
                        "raw_selection": "Ф2(-1,5)",
                        "line": -1.5,
                        "team": "2",
                    },
                }
                payload = server._normalize_pinnacle_bia_transport_payload(
                    arb,
                    server._build_pinnacle_verify_payload(arb),
                    raw_selection="Ф2(-1,5)",
                )

                self.assertEqual(payload["market_scope"], expected_scope)
                self.assertEqual(payload["tennis_unit"], expected_unit)
                self.assertEqual(payload["period"], 0)

    def test_bia_transport_uses_tennis_set_as_exact_period_for_line_markets(self):
        cases = (
            ("Handicap", "Ф2(-1,5)", {"line": -1.5, "team": "2"}),
            ("Totals", "ТБ(9,5)", {"line": 9.5, "direction": "Over"}),
        )
        for market, raw_selection, extra_metadata in cases:
            with self.subTest(market=market):
                arb = {
                    "sport": "Tennis",
                    "market": market,
                    "display_market": "Геймы, 2 сет",
                    "bk1_selection": raw_selection,
                    "pinnacle_market_metadata": {
                        "family": market,
                        "raw_selection": raw_selection,
                        "set_number": 2,
                        "period_type": "set",
                        **extra_metadata,
                    },
                }
                payload = server._normalize_pinnacle_bia_transport_payload(
                    arb,
                    server._build_pinnacle_verify_payload(arb),
                    raw_selection=raw_selection,
                )

                self.assertEqual(payload["period"], 2)
                self.assertEqual(payload["market_scope"], "games")
                self.assertEqual(payload["tennis_unit"], "game")

    def test_bia_transport_never_downgrades_invalid_tennis_set_to_full_match(self):
        for invalid_set in (0, 6, 1.9, True, "not-a-set"):
            with self.subTest(set_number=invalid_set):
                arb = {
                    "sport": "Tennis",
                    "market": "Handicap",
                    "bk1_selection": "Ф2(-1,5)",
                    "pinnacle_market_metadata": {
                        "family": "Handicap",
                        "raw_selection": "Ф2(-1,5)",
                        "line": -1.5,
                        "team": "2",
                        "set_number": invalid_set,
                    },
                }

                payload = server._normalize_pinnacle_bia_transport_payload(
                    arb,
                    server._build_pinnacle_verify_payload(arb),
                    raw_selection="Ф2(-1,5)",
                )

                self.assertEqual(payload["period"], -1)

    def test_bia_transport_never_truncates_or_downgrades_period_coordinate(self):
        for invalid_period in (1.9, True, "not-a-period", -1):
            with self.subTest(period_number=invalid_period):
                arb = {
                    "sport": "Basketball",
                    "market": "Totals",
                    "bk1_selection": "ТБ(40,5)",
                    "pinnacle_market_metadata": {
                        "family": "Totals",
                        "raw_selection": "ТБ(40,5)",
                        "line": 40.5,
                        "direction": "Over",
                        "period_number": invalid_period,
                    },
                }

                payload = server._normalize_pinnacle_bia_transport_payload(
                    arb,
                    server._build_pinnacle_verify_payload(arb),
                    raw_selection="ТБ(40,5)",
                )

                self.assertEqual(payload["period"], -1)

        valid = server._pinnacle_bia_event_period(
            {"sport": "Basketball"},
            {"period_number": 1.0},
        )
        self.assertEqual(valid, 1)

    def test_bia_tennis_unit_is_proved_by_exact_bet_type(self):
        game_line = {
            "bia_bet_type": "for,tset,all,vwhatever,game,ah,p2,-6",
        }
        set_line = {
            "bia_bet_type": "for,tset,all,vwhatever,set,ah,p2,-6",
        }
        game_total = {
            "bia_bet_type": "for,tset,2,vwhatever,game,ahunder,10",
        }
        set_total = {
            "bia_bet_type": "for,tset,all,vwhatever,set,ahover,10",
        }
        game_team_total = {
            "bia_bet_type": "for,tset,2,vwhole,game,tahover,p2,10",
        }
        set_team_total = {
            "bia_bet_type": "for,tset,all,vwhole,set,tahunder,p1,10",
        }
        game_winner = {
            "bia_bet_type": "for,tgame,2,5,vwhatever,p2",
        }
        set_winner = {
            "bia_bet_type": "for,tset,2,vwhatever,p2",
        }

        self.assertTrue(server._bia_result_proves_tennis_unit(game_line, "game"))
        self.assertFalse(server._bia_result_proves_tennis_unit(game_line, "set"))
        self.assertTrue(server._bia_result_proves_tennis_unit(set_line, "set"))
        self.assertFalse(server._bia_result_proves_tennis_unit(set_line, "game"))
        self.assertTrue(server._bia_result_proves_tennis_unit(game_total, "game"))
        self.assertFalse(server._bia_result_proves_tennis_unit(game_total, "set"))
        self.assertTrue(server._bia_result_proves_tennis_unit(set_total, "set"))
        self.assertFalse(server._bia_result_proves_tennis_unit(set_total, "game"))
        self.assertTrue(server._bia_result_proves_tennis_unit(game_team_total, "game"))
        self.assertFalse(server._bia_result_proves_tennis_unit(game_team_total, "set"))
        self.assertTrue(server._bia_result_proves_tennis_unit(set_team_total, "set"))
        self.assertFalse(server._bia_result_proves_tennis_unit(set_team_total, "game"))
        self.assertTrue(server._bia_result_proves_tennis_unit(game_winner, "game"))
        self.assertFalse(server._bia_result_proves_tennis_unit(game_winner, "set"))
        self.assertTrue(server._bia_result_proves_tennis_unit(set_winner, "set"))
        self.assertFalse(server._bia_result_proves_tennis_unit(set_winner, "game"))

    def test_bia_tennis_unit_rejects_malformed_or_unscoped_bet_types(self):
        malformed = (
            "for,tgame,all,5,vwhatever,p2",
            "for,tgame,2,0,vwhatever,p2",
            "for,tgame,2,5,vwhatever,p3",
            "for,tset,all,vwhatever,game,ah,p2",
            "for,tset,all,vwhatever,game,ahover,not-a-code",
            "for,tset,all,vwhole,game,tahover,p3,10",
            "for,tset,all,vwhatever,game,unknown,10",
        )
        for bet_type in malformed:
            with self.subTest(bet_type=bet_type):
                self.assertFalse(server._bia_result_proves_tennis_unit(
                    {"bia_bet_type": bet_type}, "game",
                ))

    def test_bia_tennis_unit_accepts_exact_live_score_wrapper(self):
        wrapped = {
            "bia_bet_type": "for,ir,1,0,tset,all,vwhatever,game,ah,p2,-6",
        }
        self.assertTrue(server._bia_result_proves_tennis_unit(wrapped, "game"))
        self.assertFalse(server._bia_result_proves_tennis_unit(wrapped, "set"))

    def test_arcadia_uses_decomposed_coordinate_when_raw_token_is_lossy(self):
        self.assertEqual(
            server._arcadia_structural_raw_selection(
                "П1",
                {"family": "Handicap", "team": "1", "line": "0"},
            ),
            "H1 +0",
        )
        self.assertEqual(
            server._arcadia_structural_raw_selection(
                "Home",
                {"family": "Team Total", "team": "2", "direction": "Under", "line": "85.5"},
            ),
            "IT2< 85.5",
        )
        self.assertEqual(
            server._arcadia_structural_raw_selection(
                "ИТ2М(2,5)",
                {
                    "family": "Totals", "raw_selection": "ИТ2М(2,5)",
                    "team": "2", "direction": "Under", "line": "2.5",
                },
            ),
            "IT2< 2.5",
        )

    def test_matching_line_id_still_rejects_wrong_echoed_market(self):
        self.assertFalse(
            server._pinnacle_result_matches_request(
                {
                    "event_id": 123,
                    "outcome": "Game 8 Over 8.5",
                    "market": "Totals",
                    "line_id": "555",
                    "market_metadata": {"family": "Totals", "game_number": 8, "line": "8.5", "direction": "Over"},
                },
                {"status": "OK", "line_id": "555", "event_id": 123, "market": "Game Winner"},
            )
        )

    def test_matching_accepts_exact_selection_id_sent_alias(self):
        sent_selection_id = "56729527844|1631581358|0|2|0|0|-1.5|0"
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {
                    "event_id": 1631581358,
                    "outcome": "H2 -1.5",
                    "market": "Handicap",
                    "selection_id": sent_selection_id,
                    "odds_id": "1631581358|0|2|0|0|-1.5",
                    "line_id": "56729527844",
                    "market_metadata": {"family": "Handicap", "team": "2", "line": "-1.5"},
                },
                {
                    "status": "ODDS_CHANGE",
                    "event_id": 1631581358,
                    "market": "Handicap",
                    "outcome": "Win1",
                    "selection_id": "3633449291|0|1631581358|0|2|0|0|-1.50|0",
                    "selection_id_sent": sent_selection_id,
                    "odds_id": "1631581358|0|2|0|0|-1.5",
                    "line_id": "56729527844",
                },
            )
        )

    def test_matching_accepts_decomposed_child_total_result(self):
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {
                    "event_id": 123,
                    "outcome": "Game 8 Over 8.5",
                    "market": "Totals",
                    "line_id": "555",
                    "market_metadata": {"family": "Totals", "game_number": 8, "line": "8.5", "direction": "Over"},
                },
                {
                    "status": "OK",
                    "line_id": "555",
                    "event_id": 123,
                    "market": "Totals",
                    "outcome": "Over",
                    "line": "8.5",
                    "game_number": 8,
                    "direction": "Over",
                },
            )
        )

    def test_matching_accepts_nested_decomposed_child_metadata(self):
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {
                    "event_id": 123,
                    "outcome": "Game 8 Over 8.5",
                    "market": "Totals",
                    "line_id": "555",
                    "market_metadata": {"family": "Totals", "game_number": 8, "line": "8.5", "direction": "Over"},
                },
                {
                    "status": "OK",
                    "line_id": "555",
                    "event_id": 123,
                    "market": "Totals",
                    "outcome": "Over",
                    "market_metadata": {"line": "8.5", "game_number": 8, "direction": "Over"},
                },
            )
        )

    def test_matching_accepts_camel_case_metadata_family_without_top_level_market(self):
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {
                    "event_id": 123,
                    "outcome": "Game 8 Over 8.5",
                    "market": "Totals",
                    "line_id": "555",
                    "market_metadata": {"family": "Totals", "game_number": 8, "line": "8.5", "direction": "Over"},
                },
                {
                    "status": "OK",
                    "lineId": "555",
                    "eventId": 123,
                    "betType": "Over",
                    "marketMetadata": {"family": "Totals", "gameNumber": 8, "line": "8.5", "direction": "Over"},
                },
            )
        )

    def test_matching_derives_direction_and_parity_from_bet_type(self):
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {
                    "event_id": 123,
                    "outcome": "Game 8 Over 8.5",
                    "market": "Totals",
                    "line_id": "555",
                    "market_metadata": {"family": "Totals", "game_number": 8, "line": "8.5", "direction": "Over"},
                },
                {
                    "status": "OK",
                    "lineId": "555",
                    "eventId": 123,
                    "marketType": "Totals",
                    "betType": "Over",
                    "marketMetadata": {"gameNumber": 8, "line": "8.5"},
                },
            )
        )
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {"event_id": 123, "outcome": "Game 5 Odd", "market": "Odd/Even", "line_id": "odd-line", "market_metadata": {"family": "Odd/Even", "game_number": 5, "parity": "Odd"}},
                {"status": "OK", "lineId": "odd-line", "eventId": 123, "marketType": "OddEven", "betType": "Odd", "marketMetadata": {"gameNumber": 5}},
            )
        )
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {
                    "event_id": 123,
                    "outcome": "Game 8 Over 8.5",
                    "market": "Totals",
                    "line_id": "555",
                    "market_metadata": {"family": "Totals", "game_number": 8, "line": "8.5", "direction": "Over"},
                },
                {
                    "status": "OK",
                    "lineId": "555",
                    "eventId": 123,
                    "marketType": "Totals",
                    "outcome": "Over 8.5",
                    "marketMetadata": {"gameNumber": 8, "line": "8.5"},
                },
            )
        )

    def test_matching_derives_child_scope_from_full_result_outcome_text(self):
        cases = [
            (
                {"event_id": 123, "outcome": "Game 8 Win2", "market": "Game Winner", "line_id": "game-winner", "market_metadata": {"family": "Game Winner", "game_number": 8, "team": "2"}},
                {"status": "OK", "lineId": "game-winner", "eventId": 123, "marketType": "Game Winner", "outcome": "Game 8 Win2"},
            ),
            (
                {"event_id": 123, "outcome": "Set 2 Win1", "market": "Set Winner", "line_id": "set-winner", "market_metadata": {"family": "Set Winner", "set_number": 2, "team": "1"}},
                {"status": "OK", "lineId": "set-winner", "eventId": 123, "marketType": "Set Winner", "outcome": "Set 2 Win1"},
            ),
            (
                {"event_id": 123, "outcome": "Set 2 Game 8 Over 9.5", "market": "Totals", "line_id": "set-game-total", "market_metadata": {"family": "Totals", "set_number": 2, "game_number": 8, "line": "9.5", "direction": "Over"}},
                {"status": "OK", "lineId": "set-game-total", "eventId": 123, "marketType": "Totals", "outcome": "Set 2 Game 8 Over 9.5"},
            ),
            (
                {"event_id": 123, "outcome": "Game 5 Odd", "market": "Odd/Even", "line_id": "odd-even", "market_metadata": {"family": "Odd/Even", "game_number": 5, "parity": "Odd"}},
                {"status": "OK", "lineId": "odd-even", "eventId": 123, "marketType": "OddEven", "outcome": "Game 5 Odd"},
            ),
        ]
        for payload, result in cases:
            with self.subTest(outcome=payload["outcome"]):
                self.assertTrue(server._pinnacle_result_matches_request(payload, result))

    def test_matching_merges_snake_and_camel_nested_metadata(self):
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {
                    "event_id": 123,
                    "outcome": "Game 8 Over 8.5",
                    "market": "Totals",
                    "line_id": "555",
                    "market_metadata": {"family": "Totals", "game_number": 8, "line": "8.5", "direction": "Over"},
                },
                {
                    "status": "OK",
                    "lineId": "555",
                    "eventId": 123,
                    "betType": "Over",
                    "market_metadata": {"family": "Totals", "line": "8.5"},
                    "marketMetadata": {"gameNumber": 8, "direction": "Over"},
                },
            )
        )

    def test_matching_accepts_side_alias_outcomes(self):
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {"event_id": 123, "outcome": "Win1", "market": "Moneyline", "market_metadata": {"family": "Moneyline", "team": "1"}},
                {"status": "OK", "event_id": 123, "market": "Moneyline", "outcome": "Home"},
            )
        )
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {"event_id": 123, "outcome": "Game 8 Win2", "market": "Game Winner", "market_metadata": {"family": "Game Winner", "game_number": 8, "team": "2"}},
                {"status": "OK", "event_id": 123, "market": "Game Winner", "outcome": "Away", "game_number": 8, "team": "2"},
            )
        )
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {"event_id": 123, "outcome": "WinNone", "market": "Moneyline", "market_metadata": {"family": "Moneyline", "team": "None"}},
                {"status": "OK", "event_id": 123, "market": "Moneyline", "outcome": "Draw"},
            )
        )
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {"event_id": 123, "outcome": "WinNone", "market": "Moneyline", "market_metadata": {"family": "Moneyline", "team": "None"}},
                {"status": "OK", "event_id": 123, "market": "Moneyline", "outcome": "Win None"},
            )
        )
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {"event_id": 123, "outcome": "Win1", "market": "Moneyline", "market_metadata": {"family": "Moneyline", "team": "1"}},
                {"status": "OK", "event_id": 123, "market": "Moneyline", "outcome": "Win 1"},
            )
        )
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {"event_id": 123, "outcome": "Win2", "market": "Moneyline", "market_metadata": {"family": "Moneyline", "team": "2"}},
                {"status": "OK", "event_id": 123, "market": "Moneyline", "outcome": "Away Team"},
            )
        )

    def test_matching_ignores_team_metadata_for_plain_totals(self):
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {
                    "event_id": 123,
                    "outcome": "Over 21.5",
                    "market": "Totals",
                    "market_metadata": {
                        "family": "Totals",
                        "raw_selection": "ТБ(21,5)",
                        "team": "2",
                        "line": "21.5",
                        "direction": "Over",
                    },
                },
                {
                    "status": "OK",
                    "event_id": 123,
                    "market": "Totals",
                    "outcome": "Over",
                    "team": "1",
                    "line": 21.5,
                    "direction": "Over",
                },
            )
        )

    def test_matching_accepts_decomposed_side_alias_fields(self):
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {"event_id": 123, "outcome": "Win1", "market": "Moneyline", "selection_id": "sel-1", "market_metadata": {"family": "Moneyline", "team": "1"}},
                {"status": "OK", "selection_id": "sel-1", "event_id": 123, "market": "Moneyline", "side": "Home"},
            )
        )
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {"event_id": 123, "outcome": "WinNone", "market": "Moneyline", "selection_id": "sel-draw", "market_metadata": {"family": "Moneyline", "team": "None"}},
                {"status": "OK", "selection_id": "sel-draw", "event_id": 123, "market": "Moneyline", "side": "Win None"},
            )
        )

    def test_matching_accepts_decomposed_side_without_selection_id(self):
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {"event_id": 123, "outcome": "Win1", "market": "Moneyline", "market_metadata": {"family": "Moneyline", "team": "1"}},
                {"status": "OK", "event_id": 123, "market": "Moneyline", "side": "Home"},
            )
        )
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {"event_id": 123, "outcome": "WinNone", "market": "Moneyline", "market_metadata": {"family": "Moneyline", "team": "None"}},
                {"status": "OK", "event_id": 123, "market": "Moneyline", "side": "Win None"},
            )
        )

    def test_matching_accepts_numeric_line_without_plus_sign(self):
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {"event_id": 123, "outcome": "H1 +1.5", "market": "Handicap", "selection_id": "sel-handicap", "market_metadata": {"family": "Handicap", "team": "1", "line": "+1.5"}},
                {"status": "OK", "selection_id": "sel-handicap", "event_id": 123, "market": "Handicap", "outcome": "H1 +1.5", "team": "1", "line": 1.5},
            )
        )
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {"event_id": 123, "outcome": "H1 +1.5", "market": "Handicap", "line_id": "line-comma", "market_metadata": {"family": "Handicap", "team": "1", "line": "+1.5"}},
                {"status": "OK", "line_id": "line-comma", "event_id": 123, "market": "Handicap", "outcome": "H1 +1.5", "team": "1", "line": "1,5"},
            )
        )

    def test_line_id_matching_accepts_numeric_zero_line(self):
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {"event_id": 123, "outcome": "H1 0", "market": "Handicap", "line_id": "line-0", "market_metadata": {"family": "Handicap", "team": "1", "line": "0"}},
                {"status": "OK", "line_id": "line-0", "event_id": 123, "market": "Handicap", "outcome": "H1 0", "team": "1", "line": 0},
            )
        )

    def test_matching_accepts_odd_even_market_alias(self):
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {"event_id": 123, "outcome": "Odd", "market": "Odd/Even", "market_metadata": {"family": "Odd/Even", "parity": "Odd"}},
                {"status": "OK", "event_id": 123, "market": "OddEven", "outcome": "Odd", "parity": "Odd"},
            )
        )

    def test_matching_accepts_camel_case_result_identifiers(self):
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {"event_id": 123, "outcome": "Win1", "market": "Moneyline", "selection_id": "abc123"},
                {"status": "OK", "event_id": 123, "market": "Moneyline", "outcome": "Home", "selectionId": "abc123"},
            )
        )

    def test_line_id_only_sparse_result_does_not_match(self):
        self.assertFalse(
            server._pinnacle_result_matches_request(
                {"event_id": 123, "outcome": "Over 8.5", "market": "Totals", "line_id": "555", "market_metadata": {"family": "Totals", "line": "8.5", "direction": "Over"}},
                {"status": "OK", "line_id": "555", "odds": "2.1"},
            )
        )

    def test_line_id_matching_accepts_camel_case_nested_child_metadata(self):
        self.assertTrue(
            server._pinnacle_result_matches_request(
                {"event_id": 123, "outcome": "Game 8 Over 8.5", "market": "Totals", "line_id": "555", "market_metadata": {"family": "Totals", "game_number": 8, "line": "8.5", "direction": "Over"}},
                {"status": "OK", "lineId": "555", "eventId": 123, "marketType": "Totals", "betType": "Over", "marketMetadata": {"gameNumber": 8, "line": "8.5", "direction": "Over"}},
            )
        )

    def test_demo_users_can_be_disabled_without_configured_users(self):
        original_allow_demo = server.ROBINARB_ALLOW_DEMO_USERS
        original_users_env = os.environ.pop("ROBINARB_DEMO_USERS", None)
        server.ROBINARB_ALLOW_DEMO_USERS = False
        try:
            self.assertEqual(server._build_initial_user_state(), {})
        finally:
            server.ROBINARB_ALLOW_DEMO_USERS = original_allow_demo
            if original_users_env is not None:
                os.environ["ROBINARB_DEMO_USERS"] = original_users_env

    def test_tls_verification_defaults_to_enabled(self):
        self.assertTrue(server.PINNACLE_API_VERIFY_SSL)

    def test_pinnacle_identifier_extracts_odds_id_alias(self):
        link = "https://www.pinnacle.com/events/123?odds_id=445566"

        self.assertIsNone(server._extract_pinnacle_selection_id(link))
        self.assertEqual(server._extract_pinnacle_odds_id(link), "445566")

    def test_pinnacle_identifier_does_not_match_alias_substrings(self):
        self.assertIsNone(server._extract_pinnacle_line_id("https://www.pinnacle.com/?baselineId=445566"))
        self.assertIsNone(server._extract_pinnacle_line_id("baselineId=445566"))
        self.assertIsNone(server._extract_pinnacle_selection_id("https://www.pinnacle.com/?eventId=445566"))

    def test_pinnacle_identifier_extracts_alphanumeric_raw_typed_ids(self):
        self.assertEqual(server._extract_pinnacle_selection_id("selection_id=abc123"), "abc123")
        self.assertEqual(server._extract_pinnacle_line_id("lineId:ln_789"), "ln_789")

    def test_verify_uses_stored_outcome_and_identifier_metadata(self):
        headers = self.login("owner", "owner123")
        original_find_arb = server._find_arb_by_id
        original_async_client = server.httpx.AsyncClient
        original_lookup_more_bet_price = server.pinnacle_hub.lookup_more_bet_price
        captured = {}

        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {"results": [{"status": "OK", "odds": "2.31", "selection_id": "998877", "odds_id": "222333"}]}

        class FakeAsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, json, **kwargs):
                captured.update(json)
                return FakeResponse()

        async def fake_lookup_more_bet_price(**_kwargs):
            return None

        server._find_arb_by_id = lambda _arb_id: {
            "id": "arb-game-winner",
            "event_id": 11907213,
            "market": "Game Winner",
            "sport": "Tennis",
            "bk1_selection": "Game 8 Away",
            "bk1_outcome": "Game 8 Win2",
            "pinnacle_is_primary_side": False,
            "pinnacle_market_metadata": {
                "family": "Game Winner",
                "game_number": 8,
                "team": "2",
                "raw_selection": "Game 8 Away",
            },
            "bk1_odds": 2.2,
            "bk2": "betcity.ru",
            "pinnacle_selection_id": "998877",
            "pinnacle_odds_id": "222333",
        }
        server.httpx.AsyncClient = FakeAsyncClient
        server.pinnacle_hub.lookup_more_bet_price = fake_lookup_more_bet_price

        try:
            response = self.client.post(
                "/api/verify",
                headers=headers,
                json={"arb_id": "arb-game-winner"},
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server.httpx.AsyncClient = original_async_client
            server.pinnacle_hub.lookup_more_bet_price = original_lookup_more_bet_price

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(captured["outcome"], "Game 8 Win2")
        self.assertEqual(captured["selection_id"], "998877")
        self.assertEqual(captured["odds_id"], "222333")
        self.assertEqual(captured["market_metadata"]["game_number"], 8)
        self.assertNotIn("line", captured)
        self.assertNotIn("line", captured["market_metadata"])
        payload = response.json()
        self.assertTrue(payload["verified"])
        self.assertEqual(payload["current_odds"], 2.31)
        self.assertTrue(payload["quote_id"])

    def test_verify_betslip_uses_pinnacle_event_id_and_english_team_names(self):
        headers = self.login("owner", "owner123")
        original_find_arb = server._find_arb_by_id
        original_async_client = server.httpx.AsyncClient
        original_lookup_more_bet_price = server.pinnacle_hub.lookup_more_bet_price
        captured = {}

        class FakeVerifyResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "results": [
                        {
                            "status": "OK",
                            "odds": "2.31",
                            "event_id": 1631655402,
                            "outcome": "Win1",
                            "market": "Moneyline",
                            "market_key": "1631655402:0:moneyline:home",
                        }
                    ]
                }

        class FakeAsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, json, **kwargs):
                captured.update(json)
                return FakeVerifyResponse()

        async def fake_lookup_more_bet_price(**_kwargs):
            return None

        server._find_arb_by_id = lambda _arb_id: {
            "id": "arb-real-pin-event",
            "event_id": 6788997628,
            "pinnacle_hub_event_id": "1631655402",
            "bk1_raw_link": "/1631655402",
            "market": "Moneyline",
            "sport": "Tennis",
            "match": "Масамити Имамура vs Колтон Смит",
            "home": "Масамити Имамура",
            "away": "Колтон Смит",
            "team1_en": "Masamichi Imamura",
            "team2_en": "Colton Smith",
            "bk1_selection": "Home",
            "bk1_outcome": "Win1",
            "pinnacle_market_metadata": {"family": "Moneyline", "raw_selection": "П1"},
            "bk1_odds": 2.2,
            "bk2": "betcity.ru",
        }
        server.httpx.AsyncClient = FakeAsyncClient
        server.pinnacle_hub.lookup_more_bet_price = fake_lookup_more_bet_price

        try:
            response = self.client.post(
                "/api/verify",
                headers=headers,
                json={"arb_id": "arb-real-pin-event", "verify_mode": "betslip"},
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server.httpx.AsyncClient = original_async_client
            server.pinnacle_hub.lookup_more_bet_price = original_lookup_more_bet_price

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(captured["event_id"], 1631655402)
        self.assertEqual(captured["forted_home"], "Masamichi Imamura")
        self.assertEqual(captured["forted_away"], "Colton Smith")
        self.assertEqual(captured["raw_selection"], "П1")
        self.assertEqual(captured["outcome"], "1")
        payload = response.json()
        self.assertTrue(payload["verified"])
        self.assertEqual(payload["event_id"], 1631655402)
        self.assertTrue(payload["quote_id"])

    def test_verify_betslip_translates_corner_markets_as_special_outcomes(self):
        headers = self.login("owner", "owner123")
        original_find_arb = server._find_arb_by_id
        original_async_client = server.httpx.AsyncClient
        original_lookup_more_bet_price = server.pinnacle_hub.lookup_more_bet_price
        original_live_place_enabled = server.PINNACLE_LIVE_PLACE_ENABLED
        captured = {}
        placed = {}

        class FakeVerifyResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "results": [
                        {
                            "status": "OK",
                            "odds": 2.2,
                            "event_id": 1631653124,
                            "market": "Totals",
                            "outcome": "Win2",
                            "team": "2",
                            "line": "1.5",
                            "direction": "Over",
                            "line_id": "3631593291",
                            "odds_id": "1631653124|0|5|7|0|1.5",
                            "selection_id": "3631593291|1631653124|0|5|7|0|1.5|0",
                        }
                    ]
                }

        class FakePlaceResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {"status": "PLACED", "bet_id": "corner-bet"}

        class FakeAsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, json, **kwargs):
                if str(url).endswith("/place"):
                    placed.update(json)
                    return FakePlaceResponse()
                captured.update(json)
                return FakeVerifyResponse()

        async def fake_lookup_more_bet_price(**kwargs):
            self.assertEqual(kwargs["market_context"], "corners")
            return {
                "event_id": "1631653124",
                "parent_event_id": "1631172323",
                "line_id": "3631593291",
                "market_context": "corners",
                "period": 0,
                "bet_type": 5,
                "team_select": 7,
                "handicap": 1.5,
                "actual_handicap": 1.5,
                "is_alt": 0,
            }

        server._find_arb_by_id = lambda _arb_id: {
            "id": "arb-corners",
            "event_id": 1409901735,
            "pinnacle_hub_event_id": "1631172323",
            "bk1_raw_link": "/1631172323",
            "market": "Totals",
            "sport": "Soccer",
            "match": "Spain vs Iraq",
            "home": "Spain",
            "away": "Iraq",
            "team1_en": "Spain",
            "team2_en": "Iraq",
            "bk1_event_name": "Soccer - International - Friendlies Corners",
            "bk1_selection": "Team 2 Over (1.5)",
            "bk1_outcome": "Win2",
            "pinnacle_market_metadata": {
                "family": "Totals",
                "raw_selection": "ИТ2Б(1,5)",
                "team": "2",
                "line": "1.5",
            },
            "bk1_odds": 2.2,
            "bk2": "betcity.ru",
        }
        server.httpx.AsyncClient = FakeAsyncClient
        server.pinnacle_hub.lookup_more_bet_price = fake_lookup_more_bet_price
        server.PINNACLE_LIVE_PLACE_ENABLED = True

        try:
            response = self.client.post(
                "/api/verify",
                headers=headers,
                json={"arb_id": "arb-corners", "verify_mode": "betslip"},
            )
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(captured["event_id"], 1631653124)
            self.assertEqual(captured["parent_event_id"], 1631172323)
            self.assertEqual(captured["outcome"], "IT2> 1.5")
            self.assertEqual(captured["service_outcome"], "IT2> 1.5")
            self.assertEqual(captured["market_context"], "corners")
            self.assertEqual(captured["line_id"], "3631593291")
            self.assertEqual(captured["raw_selection"], "ИТ2Б(1,5)")
            payload = response.json()
            self.assertTrue(payload["verified"])
            self.assertEqual(payload["event_id"], 1631653124)
            self.assertTrue(payload["quote_id"])

            bet_response = self.client.post(
                "/api/bet",
                headers=headers,
                json={
                    "arb_id": "arb-corners",
                    "side": "pinnacle",
                    "stake": 10,
                    "odds": payload["current_odds"],
                    "quote_id": payload["quote_id"],
                    "verify_mode": "betslip",
                },
            )
            self.assertEqual(bet_response.status_code, 200, bet_response.text)
            self.assertEqual(placed["event_id"], 1631653124)
            self.assertEqual(placed["outcome"], "IT2> 1.5")
            self.assertEqual(placed["line_id"], "3631593291")
        finally:
            server._find_arb_by_id = original_find_arb
            server.httpx.AsyncClient = original_async_client
            server.pinnacle_hub.lookup_more_bet_price = original_lookup_more_bet_price
            server.PINNACLE_LIVE_PLACE_ENABLED = original_live_place_enabled

    def test_verify_betslip_treats_raw_moneyline_side_as_moneyline(self):
        headers = self.login("owner", "owner123")
        original_find_arb = server._find_arb_by_id
        original_async_client = server.httpx.AsyncClient
        original_lookup_more_bet_price = server.pinnacle_hub.lookup_more_bet_price
        captured = {}

        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "results": [
                        {
                            "status": "OK",
                            "odds": 18.25,
                            "event_id": 1631142074,
                            "market": "Moneyline",
                            "outcome": "Win2",
                            "team": "2",
                            "line_id": "3630751832",
                        }
                    ]
                }

        class FakeAsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, json, **kwargs):
                captured.update(json)
                return FakeResponse()

        async def fake_lookup_more_bet_price(**_kwargs):
            return None

        server._find_arb_by_id = lambda _arb_id: {
            "id": "mixed-moneyline",
            "event_id": 1004147490,
            "pinnacle_hub_event_id": "1631142074",
            "market": "Handicap",
            "sport": "Soccer",
            "match": "South Korea vs El Salvador",
            "home": "South Korea",
            "away": "El Salvador",
            "team1_en": "South Korea",
            "team2_en": "El Salvador",
            "bk1_selection": "Away",
            "bk1_outcome": "H2 0.5",
            "pinnacle_market_metadata": {
                "family": "Handicap",
                "raw_selection": "2",
                "team": "2",
                "line": "0.5",
            },
            "bk1_odds": 18.25,
            "bk2": "vivarobet.com",
        }
        server.httpx.AsyncClient = FakeAsyncClient
        server.pinnacle_hub.lookup_more_bet_price = fake_lookup_more_bet_price

        try:
            response = self.client.post(
                "/api/verify",
                headers=headers,
                json={"arb_id": "mixed-moneyline", "verify_mode": "betslip"},
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server.httpx.AsyncClient = original_async_client
            server.pinnacle_hub.lookup_more_bet_price = original_lookup_more_bet_price

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(captured["event_id"], 1631142074)
        self.assertEqual(captured["market"], "Moneyline")
        self.assertEqual(captured["outcome"], "2")
        payload = response.json()
        self.assertTrue(payload["verified"])
        self.assertEqual(payload["status"], "OK")
        self.assertEqual(payload["market_metadata"]["family"], "Moneyline")

    def test_rolling_cache_preserves_recent_verified_quote(self):
        now = time.time()
        base_arb = {
            "id": "stable-id",
            "event_id": 123,
            "match": "Player A vs Player B",
            "bk2": "bet365.com",
            "market": "Moneyline",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
            "updated_at": now,
            "last_verified_pinnacle_odds": 2.31,
            "last_verified_pinnacle_at": now,
        }
        refreshed_arb = {
            **base_arb,
            "id": "new-id",
            "updated_at": now + 1,
        }
        refreshed_arb.pop("last_verified_pinnacle_odds")
        refreshed_arb.pop("last_verified_pinnacle_at")

        server._record_rolling_arbs([base_arb])
        server._record_rolling_arbs([refreshed_arb])
        stored = next(arb for arb in server._rolling_arbs.values() if arb["id"] == "stable-id")

        self.assertEqual(stored["last_verified_pinnacle_odds"], 2.31)
        self.assertEqual(stored["last_verified_pinnacle_at"], now)

    def test_verify_identifier_mismatch_does_not_issue_quote(self):
        headers = self.login("owner", "owner123")
        original_find_arb = server._find_arb_by_id
        original_async_client = server.httpx.AsyncClient

        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {"results": [{"status": "OK", "odds": "2.31", "selection_id": "different"}]}

        class FakeAsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, json, **kwargs):
                return FakeResponse()

        server._find_arb_by_id = lambda _arb_id: {
            "id": "arb-mismatch",
            "event_id": 11907213,
            "market": "Moneyline",
            "sport": "Tennis",
            "bk1_selection": "Home",
            "bk1_outcome": "Win1",
            "bk1_odds": 2.2,
            "bk2": "betcity.ru",
            "pinnacle_selection_id": "expected",
        }
        server.httpx.AsyncClient = FakeAsyncClient

        try:
            response = self.client.post(
                "/api/verify",
                headers=headers,
                json={"arb_id": "arb-mismatch"},
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server.httpx.AsyncClient = original_async_client

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertFalse(payload["verified"])
        self.assertEqual(payload["status"], "MISMATCH")
        self.assertIsNone(payload["quote_id"])

    def test_verify_selects_later_matching_result(self):
        headers = self.login("owner", "owner123")
        original_find_arb = server._find_arb_by_id
        original_async_client = server.httpx.AsyncClient

        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "results": [
                        {"status": "OK", "odds": "2.11", "selection_id": "wrong"},
                        {"status": "OK", "odds": "2.31", "selection_id": "expected", "event_id": 11907213, "outcome": "Win1", "market": "Moneyline"},
                    ]
                }

        class FakeAsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, json, **kwargs):
                return FakeResponse()

        server._find_arb_by_id = lambda _arb_id: {
            "id": "arb-multi-result",
            "event_id": 11907213,
            "market": "Moneyline",
            "sport": "Tennis",
            "bk1_selection": "Home",
            "bk1_outcome": "Win1",
            "bk1_odds": 2.2,
            "bk2": "betcity.ru",
            "pinnacle_selection_id": "expected",
        }
        server.httpx.AsyncClient = FakeAsyncClient

        try:
            response = self.client.post(
                "/api/verify",
                headers=headers,
                json={"arb_id": "arb-multi-result"},
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server.httpx.AsyncClient = original_async_client

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertTrue(payload["verified"])
        self.assertEqual(payload["current_odds"], 2.31)
        self.assertEqual(payload["selection_id"], "expected")
        self.assertTrue(payload["quote_id"])

    def test_calculator_betslip_verify_is_single_active_fork_per_user(self):
        headers = self.login("owner", "owner123")
        original_find_arb = server._find_arb_by_id
        original_async_client = server.httpx.AsyncClient
        original_lookup_more_bet_price = server.pinnacle_hub.lookup_more_bet_price
        calls = []

        class FakeResponse:
            def __init__(self, payload):
                self.payload = dict(payload)

            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "results": [{
                        "status": "OK",
                        "odds": "2.31",
                        "selection_id": self.payload.get("selection_id"),
                        "event_id": self.payload.get("event_id"),
                        "outcome": self.payload.get("outcome"),
                        "market": self.payload.get("market"),
                    }]
                }

        class FakeAsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, json, **kwargs):
                calls.append(dict(json))
                return FakeResponse(json)

        def fake_arb(arb_id):
            suffix = arb_id[-1]
            return {
                "id": arb_id,
                "event_id": 11907210 + ord(suffix),
                "market": "Moneyline",
                "sport": "Tennis",
                "bk1_selection": "Home",
                "bk1_outcome": "Win1",
                "bk1_odds": 2.2,
                "bk2": "betcity.ru",
                "pinnacle_selection_id": f"sel-{suffix}",
            }

        async def fake_lookup_more_bet_price(**_kwargs):
            return None

        server._find_arb_by_id = fake_arb
        server.httpx.AsyncClient = FakeAsyncClient
        server.pinnacle_hub.lookup_more_bet_price = fake_lookup_more_bet_price
        try:
            first = self.client.post(
                "/api/verify",
                headers=headers,
                json={
                    "arb_id": "calc-a",
                    "verify_mode": "betslip",
                    "verify_scope": "calculator",
                    "client_id": "tab-a",
                },
            )
            locked = self.client.post(
                "/api/verify",
                headers=headers,
                json={
                    "arb_id": "calc-b",
                    "verify_mode": "betslip",
                    "verify_scope": "calculator",
                    "client_id": "tab-b",
                },
            )
            self.assertEqual(first.status_code, 200, first.text)
            self.assertTrue(first.json()["verified"])
            self.assertEqual(locked.status_code, 200, locked.text)
            self.assertEqual(locked.json()["status"], "CALCULATOR_LOCKED")
            self.assertEqual(len(calls), 1)
            switched = self.client.post(
                "/api/verify",
                headers=headers,
                json={
                    "arb_id": "calc-b",
                    "verify_mode": "betslip",
                    "verify_scope": "calculator",
                    "client_id": "tab-a",
                },
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server.httpx.AsyncClient = original_async_client
            server.pinnacle_hub.lookup_more_bet_price = original_lookup_more_bet_price

        self.assertEqual(switched.status_code, 200, switched.text)
        self.assertTrue(switched.json()["verified"])
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[1]["selection_id"], "sel-b")

    def test_calculator_betslip_verify_allows_takeover_after_stale_heartbeat(self):
        now = time.time()
        server._calculator_verify_claims["owner"] = {
            "arb_id": "calc-old",
            "client_id": "tab-old",
            "started_at": now,
            "updated_at": now - server.ROBINARB_CALCULATOR_VERIFY_LOCK_SEC - 1,
        }

        result = server._calculator_verify_control(
            "owner",
            "calc-new",
            "tab-new",
            "betslip",
            "calculator",
        )

        self.assertIsNone(result)
        self.assertEqual(server._calculator_verify_claims["owner"]["arb_id"], "calc-new")
        self.assertEqual(server._calculator_verify_claims["owner"]["client_id"], "tab-new")

    def test_calculator_betslip_release_clears_matching_claim(self):
        headers = self.login("owner", "owner123")
        server._calculator_verify_claims["owner"] = {
            "arb_id": "calc-release",
            "client_id": "tab-a",
            "started_at": time.time(),
            "updated_at": time.time(),
        }

        response = self.client.post(
            "/api/verify/calculator/release",
            headers=headers,
            json={"arb_id": "calc-release", "client_id": "tab-a"},
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["released"])
        self.assertNotIn("owner", server._calculator_verify_claims)

    def test_calculator_betslip_verify_expires_after_window_without_betslip_call(self):
        headers = self.login("owner", "owner123")
        original_find_arb = server._find_arb_by_id
        original_async_client = server.httpx.AsyncClient
        original_lookup_more_bet_price = server.pinnacle_hub.lookup_more_bet_price
        original_window = server.ROBINARB_CALCULATOR_VERIFY_WINDOW_SEC
        calls = []

        class FakeResponse:
            def __init__(self, payload):
                self.payload = dict(payload)

            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "results": [{
                        "status": "OK",
                        "odds": "2.31",
                        "selection_id": self.payload.get("selection_id"),
                        "event_id": self.payload.get("event_id"),
                        "outcome": self.payload.get("outcome"),
                        "market": self.payload.get("market"),
                    }]
                }

        class FakeAsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, json, **kwargs):
                calls.append(dict(json))
                return FakeResponse(json)

        async def fake_lookup_more_bet_price(**_kwargs):
            return None

        server._find_arb_by_id = lambda _arb_id: {
            "id": "calc-expire",
            "event_id": 11907213,
            "market": "Moneyline",
            "sport": "Tennis",
            "bk1_selection": "Home",
            "bk1_outcome": "Win1",
            "bk1_odds": 2.2,
            "bk2": "betcity.ru",
            "pinnacle_selection_id": "expected",
        }
        server.httpx.AsyncClient = FakeAsyncClient
        server.pinnacle_hub.lookup_more_bet_price = fake_lookup_more_bet_price
        server.ROBINARB_CALCULATOR_VERIFY_WINDOW_SEC = 1
        try:
            first = self.client.post(
                "/api/verify",
                headers=headers,
                json={
                    "arb_id": "calc-expire",
                    "verify_mode": "betslip",
                    "verify_scope": "calculator",
                    "client_id": "tab-a",
                },
            )
            server._calculator_verify_claims["owner"]["started_at"] -= 2
            expired = self.client.post(
                "/api/verify",
                headers=headers,
                json={
                    "arb_id": "calc-expire",
                    "verify_mode": "betslip",
                    "verify_scope": "calculator",
                    "client_id": "tab-a",
                },
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server.httpx.AsyncClient = original_async_client
            server.pinnacle_hub.lookup_more_bet_price = original_lookup_more_bet_price
            server.ROBINARB_CALCULATOR_VERIFY_WINDOW_SEC = original_window

        self.assertEqual(first.status_code, 200, first.text)
        self.assertTrue(first.json()["verified"])
        self.assertEqual(expired.status_code, 200, expired.text)
        self.assertEqual(expired.json()["status"], "CALCULATOR_EXPIRED")
        self.assertEqual(len(calls), 1)

    def test_verify_skips_malformed_candidate_odds_before_later_match(self):
        headers = self.login("owner", "owner123")
        original_find_arb = server._find_arb_by_id
        original_async_client = server.httpx.AsyncClient

        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "results": [
                        {"status": "OK", "odds": "not-a-number", "selection_id": "expected", "event_id": 11907213, "outcome": "Win1", "market": "Moneyline"},
                        {"status": "OK", "odds": "2.31", "selection_id": "expected", "event_id": 11907213, "outcome": "Win1", "market": "Moneyline"},
                    ]
                }

        class FakeAsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, json, **kwargs):
                return FakeResponse()

        server._find_arb_by_id = lambda _arb_id: {
            "id": "arb-malformed-first-result",
            "event_id": 11907213,
            "market": "Moneyline",
            "sport": "Tennis",
            "bk1_selection": "Home",
            "bk1_outcome": "Win1",
            "bk1_odds": 2.2,
            "bk2": "betcity.ru",
            "pinnacle_selection_id": "expected",
        }
        server.httpx.AsyncClient = FakeAsyncClient

        try:
            response = self.client.post(
                "/api/verify",
                headers=headers,
                json={"arb_id": "arb-malformed-first-result"},
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server.httpx.AsyncClient = original_async_client

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertTrue(payload["verified"])
        self.assertEqual(payload["current_odds"], 2.31)
        self.assertTrue(payload["quote_id"])

    def test_verify_allows_selection_id_without_event_id(self):
        headers = self.login("owner", "owner123")
        original_find_arb = server._find_arb_by_id
        original_async_client = server.httpx.AsyncClient
        captured = {}

        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {"results": [{"status": "ok", "odds": "2.31", "selectionId": "expected", "eventId": 999, "outcome": "Home", "market": "Moneyline"}]}

        class FakeAsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, json, **kwargs):
                captured.update(json)
                return FakeResponse()

        server._find_arb_by_id = lambda _arb_id: {
            "id": "arb-selection-no-event",
            "event_id": 0,
            "market": "Moneyline",
            "sport": "Tennis",
            "match": "Player A vs Player B",
            "side1": "Home",
            "side2": "Away",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
            "bk1_outcome": "Win1",
            "bk1_odds": 2.2,
            "bk2": "betcity.ru",
            "pinnacle_selection_id": "expected",
        }
        server.httpx.AsyncClient = FakeAsyncClient

        try:
            response = self.client.post(
                "/api/verify",
                headers=headers,
                json={"arb_id": "arb-selection-no-event"},
            )
            bet_response = self.client.post(
                "/api/bet",
                headers=headers,
                json={"arb_id": "arb-selection-no-event", "side": "pinnacle", "stake": 100, "odds": 2.31, "quote_id": response.json()["quote_id"]},
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server.httpx.AsyncClient = original_async_client

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertTrue(payload["verified"])
        self.assertNotIn("event_id", captured)
        self.assertEqual(payload["selection_id"], "expected")
        self.assertTrue(payload["quote_id"])
        self.assertEqual(bet_response.status_code, 200, bet_response.text)

    def test_verified_quote_id_is_bound_to_user(self):
        owner_headers = self.login("owner", "owner123")
        trader_headers = self.login("trader1", "trader123")
        arb = {
            "id": "quote-bound-arb",
            "sport": "Tennis",
            "match": "Player A vs Player B",
            "market": "Moneyline",
            "side1": "Home",
            "side2": "Away",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
            "bk1_odds": 2.2,
            "bk2": "bet365.com",
            "robin_odds": 2.24,
            "pinnacle_selection_id": "111",
            "updated_at": time.time(),
        }
        original_find_arb = server._find_arb_by_id
        original_source = server._arbs_source
        quote_id = server._issue_verified_quote(
            "owner",
            "quote-bound-arb",
            2.2,
            {
                "market": "Moneyline",
                "outcome": "Win1",
                "selection_id": "111",
                "market_metadata": {"family": "Moneyline", "raw_selection": "Home", "team": "1"},
            },
            {"selection_id": "111"},
        )
        server._find_arb_by_id = lambda _arb_id: arb
        server._arbs_source = "mock"

        try:
            trader_response = self.client.post(
                "/api/bet",
                headers=trader_headers,
                json={"arb_id": "quote-bound-arb", "side": "pinnacle", "stake": 100, "odds": 2.2, "quote_id": quote_id},
            )
            owner_response = self.client.post(
                "/api/bet",
                headers=owner_headers,
                json={"arb_id": "quote-bound-arb", "side": "pinnacle", "stake": 100, "odds": 2.2, "quote_id": quote_id},
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server._arbs_source = original_source

        self.assertEqual(trader_response.status_code, 409)
        self.assertEqual(owner_response.status_code, 200, owner_response.text)

    def test_verified_quote_rejects_changed_current_identifier(self):
        owner_headers = self.login("owner", "owner123")
        original_find_arb = server._find_arb_by_id
        original_source = server._arbs_source
        arb = {
            "id": "quote-changed-arb",
            "sport": "Tennis",
            "match": "Player A vs Player B",
            "market": "Moneyline",
            "side1": "Home",
            "side2": "Away",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
            "bk1_outcome": "Win1",
            "bk1_odds": 2.2,
            "bk2": "bet365.com",
            "robin_odds": 2.24,
            "pinnacle_selection_id": "222",
            "updated_at": time.time(),
        }
        quote_id = server._issue_verified_quote(
            "owner",
            "quote-changed-arb",
            2.2,
            {"outcome": "Win1", "selection_id": "111"},
            {"selection_id": "111"},
        )
        server._find_arb_by_id = lambda _arb_id: arb
        server._arbs_source = "mock"

        try:
            response = self.client.post(
                "/api/bet",
                headers=owner_headers,
                json={"arb_id": "quote-changed-arb", "side": "pinnacle", "stake": 100, "odds": 2.2, "quote_id": quote_id},
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server._arbs_source = original_source

        self.assertEqual(response.status_code, 409)

    def test_verified_quote_rejects_identifier_appearing_after_verify(self):
        owner_headers = self.login("owner", "owner123")
        original_find_arb = server._find_arb_by_id
        original_source = server._arbs_source
        current_arb = {
            "id": "quote-id-appeared-arb",
            "event_id": 123,
            "sport": "Tennis",
            "match": "Player A vs Player B",
            "market": "Moneyline",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
            "bk1_outcome": "Win1",
            "bk1_odds": 2.2,
            "bk2": "bet365.com",
            "robin_odds": 2.24,
            "pinnacle_selection_id": "new-id",
            "updated_at": time.time(),
        }
        quote_id = server._issue_verified_quote(
            "owner",
            "quote-id-appeared-arb",
            2.2,
            {"event_id": 123, "market": "Moneyline", "outcome": "Win1", "market_metadata": {"family": "Moneyline", "team": "1"}},
            {"event_id": 123, "market": "Moneyline", "outcome": "Win1"},
        )
        server._find_arb_by_id = lambda _arb_id: current_arb
        server._arbs_source = "mock"

        try:
            response = self.client.post(
                "/api/bet",
                headers=owner_headers,
                json={"arb_id": "quote-id-appeared-arb", "side": "pinnacle", "stake": 100, "odds": 2.2, "quote_id": quote_id},
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server._arbs_source = original_source

        self.assertEqual(response.status_code, 409)

    def test_verified_quote_rejects_identifier_disappearing_after_verify(self):
        owner_headers = self.login("owner", "owner123")
        original_find_arb = server._find_arb_by_id
        original_source = server._arbs_source
        current_arb = {
            "id": "quote-id-disappeared-arb",
            "event_id": 123,
            "sport": "Tennis",
            "match": "Player A vs Player B",
            "market": "Moneyline",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
            "bk1_outcome": "Win1",
            "bk1_odds": 2.2,
            "bk2": "bet365.com",
            "robin_odds": 2.24,
            "updated_at": time.time(),
        }
        quote_id = server._issue_verified_quote(
            "owner",
            "quote-id-disappeared-arb",
            2.2,
            {"event_id": 123, "market": "Moneyline", "outcome": "Win1", "selection_id": "old-id", "market_metadata": {"family": "Moneyline", "team": "1"}},
            {"event_id": 123, "market": "Moneyline", "outcome": "Win1"},
        )
        server._find_arb_by_id = lambda _arb_id: current_arb
        server._arbs_source = "mock"

        try:
            response = self.client.post(
                "/api/bet",
                headers=owner_headers,
                json={"arb_id": "quote-id-disappeared-arb", "side": "pinnacle", "stake": 100, "odds": 2.2, "quote_id": quote_id},
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server._arbs_source = original_source

        self.assertEqual(response.status_code, 409)

    def test_verified_quote_without_ids_revalidates_current_event_and_market(self):
        owner_headers = self.login("owner", "owner123")
        original_find_arb = server._find_arb_by_id
        original_source = server._arbs_source
        current_arb = {
            "id": "quote-no-id-arb",
            "event_id": 456,
            "sport": "Tennis",
            "match": "Player A vs Player B",
            "market": "Moneyline",
            "side1": "Home",
            "side2": "Away",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
            "bk1_outcome": "Win1",
            "bk1_odds": 2.2,
            "bk2": "bet365.com",
            "robin_odds": 2.24,
            "updated_at": time.time(),
        }
        quote_id = server._issue_verified_quote(
            "owner",
            "quote-no-id-arb",
            2.2,
            {"event_id": 123, "market": "Moneyline", "outcome": "Win1", "market_metadata": {"family": "Moneyline", "team": "1"}},
            {"event_id": 123, "market": "Moneyline", "outcome": "Win1"},
        )
        server._find_arb_by_id = lambda _arb_id: current_arb
        server._arbs_source = "mock"

        try:
            response = self.client.post(
                "/api/bet",
                headers=owner_headers,
                json={"arb_id": "quote-no-id-arb", "side": "pinnacle", "stake": 100, "odds": 2.2, "quote_id": quote_id},
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server._arbs_source = original_source

        self.assertEqual(response.status_code, 409)

    def test_verified_quote_rejects_metadata_appearing_disappearing_or_changing(self):
        base_arb = {
            "id": "quote-metadata-arb",
            "event_id": 123,
            "sport": "Tennis",
            "match": "Player A vs Player B",
            "market": "Game Winner",
            "bk1_selection": "Game 8 Home",
            "bk2_selection": "Game 8 Away",
            "bk1_outcome": "Game 8 Win1",
            "bk1_odds": 2.2,
            "bk2": "bet365.com",
            "robin_odds": 2.24,
            "pinnacle_selection_id": "sel-game",
            "updated_at": time.time(),
        }
        scenarios = [
            (
                {"family": "Game Winner", "team": "1"},
                {"family": "Game Winner", "team": "1", "game_number": 8},
            ),
            (
                {"family": "Game Winner", "team": "1", "game_number": 8},
                {"family": "Game Winner", "team": "1"},
            ),
            (
                {"family": "Game Winner", "team": "1", "game_number": 8},
                {"family": "Game Winner", "team": "1", "game_number": 9},
            ),
            (
                {"family": "Game Winner", "team": "1"},
                {"family": "Game Winner", "team": "1", "raw_selection": "Game 8 Home"},
            ),
            (
                {"family": "Game Winner", "team": "1", "raw_selection": "Game 8 Home"},
                {"family": "Game Winner", "team": "1"},
            ),
            (
                {"family": "Game Winner", "team": "1", "raw_selection": "Game 8 Home"},
                {"family": "Game Winner", "team": "1", "raw_selection": "Game 9 Home"},
            ),
        ]
        for quote_metadata, current_metadata in scenarios:
            with self.subTest(quote_metadata=quote_metadata, current_metadata=current_metadata):
                quote_id = server._issue_verified_quote(
                    "owner",
                    "quote-metadata-arb",
                    2.2,
                    {
                        "event_id": 123,
                        "market": "Game Winner",
                        "outcome": "Game 8 Win1",
                        "selection_id": "sel-game",
                        "market_metadata": quote_metadata,
                    },
                    {"event_id": 123, "selection_id": "sel-game"},
                )
                quote = server._verified_quotes.pop(quote_id)
                current_arb = {**base_arb, "pinnacle_market_metadata": current_metadata}
                self.assertFalse(server._verified_quote_matches_current_arb(quote, current_arb))

    def test_verified_quote_accepts_more_bet_enriched_ids_without_informational_metadata(self):
        current_arb = {
            "id": "quote-more-bet-arb",
            "event_id": 1631987211,
            "sport": "Tennis",
            "match": "Alexander Zverev vs Raphael Collignon",
            "market": "Moneyline",
            "side1": "Home",
            "side2": "Away",
            "bk1_selection": "Away",
            "bk2_selection": "Home",
            "bk1_outcome": "Win2",
            "bk1_odds": 5.41,
            "bk2": "betfair.com",
            "robin_odds": 5.56,
            "pinnacle_market_metadata": {
                "family": "Moneyline",
                "raw_selection": "П2",
                "team": "2",
                "raw_stake_types": "П1;П2",
                "source_index": 2,
            },
            "updated_at": time.time(),
        }
        quote_id = server._issue_verified_quote(
            "owner",
            "quote-more-bet-arb",
            5.41,
            {
                "event_id": 1631987211,
                "market": "Moneyline",
                "outcome": "Win2",
                "selection_id": "3642860544|1631987211|0|1|1|0|0|0",
                "odds_id": "1631987211|0|1|1|0|0",
                "line_id": "3642860544",
                "market_metadata": {
                    "family": "Moneyline",
                    "raw_selection": "П2",
                    "team": "2",
                    "pinnacle_home": "Alexander Zverev",
                    "pinnacle_away": "Raphael Collignon",
                    "pinnacle_reversed": False,
                    "pinnacle_lookup_matched_by": "more_bet_selection",
                    "requested_ps3838_params": {"period": 0, "bet_type": 1, "team_select": 1, "handicap": 0.0},
                    "effective_ps3838_params": {"period": 0, "bet_type": 1, "team_select": 1, "handicap": 0.0, "is_alt": 0},
                },
            },
            {
                "event_id": 1631987211,
                "selection_id": "3642860544|1631987211|0|1|1|0|0|0",
                "odds_id": "1631987211|0|1|1|0|0",
                "line_id": "3642860544",
            },
        )
        quote = server._verified_quotes.pop(quote_id)

        self.assertTrue(server._verified_quote_matches_current_arb(quote, current_arb))

    def test_local_bet_can_use_verified_quote_snapshot_during_feed_blip(self):
        headers = self.login("owner", "owner123")
        original_find_arb = server._find_arb_by_id
        original_match_limits = server._match_limits
        original_insert_bet = server._storage.insert_bet
        original_update_user_balance = server._storage.update_user_balance
        arb = {
            "id": "quote-feed-blip-arb",
            "event_id": 123,
            "sport": "Tennis",
            "match": "Player A vs Player B",
            "market": "Moneyline",
            "side1": "Home",
            "side2": "Away",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
            "bk1_outcome": "Win1",
            "bk1_odds": 2.2,
            "bk2": "betfair.com",
            "bk2_odds": 1.9,
            "robin_odds": 2.24,
            "profit_pct": 0.1,
            "robin_profit_pct": 0.5,
            "pinnacle_market_metadata": {"family": "Moneyline", "raw_selection": "П1", "team": "1"},
            "updated_at": time.time(),
        }
        quote_id = server._issue_verified_quote(
            "owner",
            "quote-feed-blip-arb",
            2.2,
            {
                "event_id": 123,
                "market": "Moneyline",
                "outcome": "Win1",
                "market_metadata": {"family": "Moneyline", "raw_selection": "П1", "team": "1"},
            },
            {"event_id": 123, "market": "Moneyline", "outcome": "Win1"},
            arb_snapshot=arb,
        )
        server._find_arb_by_id = lambda _arb_id: None
        server._match_limits = None
        server._storage.insert_bet = lambda *_args, **_kwargs: None
        server._storage.update_user_balance = lambda *_args, **_kwargs: None
        try:
            response = self.client.post(
                "/api/bet",
                headers=headers,
                json={
                    "arb_id": "quote-feed-blip-arb",
                    "side": "pinnacle",
                    "stake": 10.0,
                    "odds": 2.2,
                    "quote_id": quote_id,
                },
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server._match_limits = original_match_limits
            server._storage.insert_bet = original_insert_bet
            server._storage.update_user_balance = original_update_user_balance

        self.assertEqual(response.status_code, 200, response.text)

    def test_verified_quote_without_current_ids_can_consume_informational_result_id(self):
        owner_headers = self.login("owner", "owner123")
        original_find_arb = server._find_arb_by_id
        original_async_client = server.httpx.AsyncClient
        original_source = server._arbs_source
        arb = {
            "id": "quote-info-id-arb",
            "event_id": 123,
            "sport": "Tennis",
            "match": "Player A vs Player B",
            "market": "Moneyline",
            "side1": "Home",
            "side2": "Away",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
            "bk1_outcome": "Win1",
            "bk1_odds": 2.2,
            "bk2": "bet365.com",
            "robin_odds": 2.24,
            "updated_at": time.time(),
        }

        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {"results": [{"status": "OK", "odds": "2.2", "selection_id": "999", "event_id": 123, "market": "Moneyline", "outcome": "Home"}]}

        class FakeAsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, json, **kwargs):
                return FakeResponse()

        server._find_arb_by_id = lambda _arb_id: arb
        server.httpx.AsyncClient = FakeAsyncClient
        server._arbs_source = "mock"

        try:
            verify_response = self.client.post("/api/verify", headers=owner_headers, json={"arb_id": "quote-info-id-arb"})
            quote_id = verify_response.json()["quote_id"]
            bet_response = self.client.post(
                "/api/bet",
                headers=owner_headers,
                json={"arb_id": "quote-info-id-arb", "side": "pinnacle", "stake": 100, "odds": 2.2, "quote_id": quote_id},
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server.httpx.AsyncClient = original_async_client
            server._arbs_source = original_source

        self.assertEqual(verify_response.status_code, 200, verify_response.text)
        self.assertTrue(verify_response.json()["verified"])
        self.assertEqual(verify_response.json()["selection_id"], "999")
        self.assertEqual(bet_response.status_code, 200, bet_response.text)

    def test_stale_rolling_listener_arb_stays_blocked_after_mock_fallback(self):
        headers = self.login("owner", "owner123")
        old_updated_at = time.time() - server.ROBINARB_FEED_STALE_AFTER - 5
        stale_arb = {
            "id": "stale-rolling-arb",
            "sport": "Tennis",
            "match": "Player A vs Player B",
            "market": "Moneyline",
            "side1": "Home",
            "side2": "Away",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
            "bk1": "Pinnacle",
            "bk1_odds": 2.0,
            "bk2": "bet365.com",
            "bk2_odds": 1.95,
            "robin_odds": 2.04,
            "profit_pct": 1.2,
            "robin_profit_pct": 1.6,
            "event_id": 123456,
            "updated_at": old_updated_at,
        }
        mock_arb = {**stale_arb, "id": "fresh-mock-arb", "match": "Mock A vs Mock B", "updated_at": time.time(), "_source": "mock"}

        server._arbs_source = "listener"
        server._record_rolling_arbs([stale_arb])
        server._arbs_source = "mock"
        server._arbs_cache = [mock_arb]
        server._arbs_updated_at = time.time()

        arbs_response = self.client.get("/api/arbs", headers=headers)
        bet_response = self.client.post(
            "/api/bet",
            headers=headers,
            json={"arb_id": "stale-rolling-arb", "side": "robinbet", "stake": 100, "odds": 2.04},
        )

        self.assertEqual(arbs_response.status_code, 200, arbs_response.text)
        ids = {arb["id"] for arb in arbs_response.json()["arbs"]}
        self.assertNotIn("stale-rolling-arb", ids)
        self.assertEqual(bet_response.status_code, 404)

    def test_verify_returns_detail_for_unavailable_game_winner_market(self):
        headers = self.login("owner", "owner123")
        original_find_arb = server._find_arb_by_id
        original_async_client = server.httpx.AsyncClient

        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {"results": [{"status": "UNAVAILABLE"}]}

        class FakeAsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, json, **kwargs):
                return FakeResponse()

        server._find_arb_by_id = lambda _arb_id: {
            "id": "arb-game-winner",
            "event_id": 11907213,
            "market": "Game Winner",
            "sport": "Tennis",
            "bk1_selection": "Game 8 Away",
            "bk1_outcome": "Win1",
            "bk1_odds": 1.552,
            "bk2": "betcity.ru",
            "pinnacle_selection_id": None,
        }
        server.httpx.AsyncClient = FakeAsyncClient

        try:
            response = self.client.post(
                "/api/verify",
                headers=headers,
                json={"arb_id": "arb-game-winner"},
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server.httpx.AsyncClient = original_async_client

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["status"], "UNAVAILABLE")
        self.assertIn("Game Winner", payload["detail"])
        self.assertIn("set/game metadata", payload["detail"])

    def test_live_listener_arbs_use_short_freshness_window(self):
        headers = self.login("owner", "owner123")
        self.assume_forted_stream_alive()
        old_updated_at = time.time() - server.ROBINARB_LIVE_FEED_STALE_AFTER - 1
        self.assertLess(time.time() - old_updated_at, server.ROBINARB_FEED_STALE_AFTER)
        base_arb = {
            "sport": "Basketball",
            "league": "Basketball Live",
            "match": "Team A vs Team B",
            "home": "Team A",
            "away": "Team B",
            "market": "Totals",
            "side1": "Under (33.5)",
            "side2": "Over (33.5)",
            "bk1_selection": "Under (33.5)",
            "bk2_selection": "Over (33.5)",
            "bk1": "Pinnacle",
            "bk1_odds": 2.0,
            "bk2": "bet365.com",
            "bk2_odds": 1.95,
            "robin_odds": 2.04,
            "profit_pct": 1.2,
            "robin_profit_pct": 1.6,
            "event_id": 123456,
            "updated_at": old_updated_at,
        }
        live_arb = {
            **base_arb,
            "id": "short-live-stale",
            "is_live": False,
            "score": "3:0+3:0",
            "match_time": "62+49",
        }
        prematch_arb = {
            **base_arb,
            "id": "short-prematch-fresh",
            "event_id": 123457,
            "match": "Team C vs Team D",
            "is_live": False,
        }

        server._arbs_source = "listener"
        server._arbs_updated_at = time.time()
        server._arbs_cache = [live_arb, prematch_arb]

        arbs_response = self.client.get("/api/arbs", headers=headers)
        verify_response = self.client.post(
            "/api/verify",
            headers=headers,
            json={"arb_id": "short-live-stale"},
        )

        self.assertEqual(arbs_response.status_code, 200, arbs_response.text)
        ids = {arb["id"] for arb in arbs_response.json()["arbs"]}
        self.assertNotIn("short-live-stale", ids)
        self.assertIn("short-prematch-fresh", ids)
        self.assertEqual(verify_response.status_code, 200, verify_response.text)
        self.assertEqual(verify_response.json()["status"], "STALE")

    def test_local_bet_rejects_invalid_side_and_negative_stake(self):
        headers = self.login("owner", "owner123")
        arbs_response = self.client.get("/api/arbs", headers=headers)
        self.assertEqual(arbs_response.status_code, 200, arbs_response.text)
        arb = arbs_response.json()["arbs"][0]
        balance_before = self.client.get("/api/balance", headers=headers).json()
        quote_arb = server._find_arb_by_id(arb["id"]) or arb
        odds_mismatch_quote_id = server._issue_verified_quote(
            "owner",
            arb["id"],
            float(quote_arb["bk1_odds"]),
            server._build_pinnacle_verify_payload(quote_arb),
            {},
        )

        invalid_side = self.client.post(
            "/api/bet",
            headers=headers,
            json={"arb_id": arb["id"], "side": "external", "stake": 100, "odds": 2.0},
        )
        negative_stake = self.client.post(
            "/api/bet",
            headers=headers,
            json={"arb_id": arb["id"], "side": "robinbet", "stake": -100, "odds": 2.0},
        )
        odds_mismatch = self.client.post(
            "/api/bet",
            headers=headers,
            json={
                "arb_id": arb["id"],
                "side": "robinbet",
                "stake": 100,
                "odds": 999.0,
                "quote_id": odds_mismatch_quote_id,
            },
        )
        unverified_pin = self.client.post(
            "/api/bet",
            headers=headers,
            json={"arb_id": arb["id"], "side": "pinnacle", "stake": 100, "odds": arb["bk1_odds"]},
        )
        balance_after = self.client.get("/api/balance", headers=headers).json()

        self.assertEqual(invalid_side.status_code, 422)
        self.assertEqual(negative_stake.status_code, 422)
        self.assertEqual(odds_mismatch.status_code, 400)
        self.assertEqual(unverified_pin.status_code, 409)
        self.assertEqual(balance_after["pinnacle_cashback"], balance_before["pinnacle_cashback"])
        self.assertEqual(balance_after["robinbet"], balance_before["robinbet"])

    def test_local_bet_enforces_configured_emergency_stake_cap(self):
        headers = self.login("owner", "owner123")
        arbs_response = self.client.get("/api/arbs", headers=headers)
        self.assertEqual(arbs_response.status_code, 200, arbs_response.text)
        arb = arbs_response.json()["arbs"][0]
        quote_arb = server._find_arb_by_id(arb["id"]) or arb
        quote_id = server._issue_verified_quote(
            "owner",
            arb["id"],
            float(quote_arb["bk1_odds"]),
            server._build_pinnacle_verify_payload(quote_arb),
            {},
        )
        balance_before = self.client.get("/api/balance", headers=headers).json()

        with patch.object(server, "ROBINARB_MAX_STAKE_LIMIT", 50.0):
            response = self.client.post(
                "/api/bet",
                headers=headers,
                json={
                    "arb_id": arb["id"],
                    "side": "robinbet",
                    "stake": 50.01,
                    "odds": arb["robin_odds"],
                    "quote_id": quote_id,
                },
            )

        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("50", response.json()["detail"])
        self.assertEqual(self.client.get("/api/balance", headers=headers).json(), balance_before)

    def test_stale_listener_arbs_are_hidden_and_not_accepted(self):
        headers = self.login("owner", "owner123")
        old_updated_at = time.time() - server.ROBINARB_FEED_STALE_AFTER - 5
        stale_arb = {
            "id": "stale-arb",
            "sport": "Tennis",
            "league": "Tennis Live",
            "match": "Player A vs Player B",
            "home": "Player A",
            "away": "Player B",
            "market": "Moneyline",
            "side1": "Home",
            "side2": "Away",
            "bk1_selection": "Home",
            "bk2_selection": "Away",
            "bk1": "Pinnacle",
            "bk1_odds": 2.0,
            "bk2": "bet365.com",
            "bk2_odds": 1.95,
            "robin_odds": 2.04,
            "profit_pct": 1.2,
            "robin_profit_pct": 1.6,
            "event_id": 123456,
            "updated_at": old_updated_at,
            "last_verified_pinnacle_odds": 2.0,
            "last_verified_pinnacle_at": time.time(),
        }
        server._arbs_source = "listener"
        server._arbs_updated_at = old_updated_at
        server._arbs_cache = [stale_arb]

        arbs_response = self.client.get("/api/arbs", headers=headers)
        feed_response = self.client.get("/api/forks/feed?limit=10", headers=headers)
        bet_response = self.client.post(
            "/api/bet",
            headers=headers,
            json={"arb_id": "stale-arb", "side": "robinbet", "stake": 100, "odds": 2.04},
        )
        pin_bet_response = self.client.post(
            "/api/bet",
            headers=headers,
            json={"arb_id": "stale-arb", "side": "pinnacle", "stake": 100, "odds": 2.0},
        )

        self.assertEqual(arbs_response.status_code, 200, arbs_response.text)
        self.assertEqual(arbs_response.json()["count"], 0)
        self.assertEqual(feed_response.status_code, 200, feed_response.text)
        self.assertEqual(feed_response.json(), [])
        self.assertEqual(bet_response.status_code, 409)
        self.assertEqual(pin_bet_response.status_code, 409)

    def test_cors_defaults_to_no_cross_origin_wildcard(self):
        self.assertEqual(server.ROBINARB_CORS_ORIGINS, [])

    def test_private_url_detection_is_precise_for_172_range(self):
        self.assertTrue(server._is_local_or_private_url("http://172.16.0.10/api/pinnacle"))
        self.assertFalse(server._is_local_or_private_url("http://172.200.0.10/api/pinnacle"))

    def test_remote_plain_http_requires_explicit_opt_in(self):
        self.assertTrue(server._remote_plain_http_requires_opt_in("http://93.184.216.34/api/forks/feed", False))
        self.assertFalse(server._remote_plain_http_requires_opt_in("http://127.0.0.1:9015/api/forks/feed", False))
        self.assertFalse(server._remote_plain_http_requires_opt_in("http://93.184.216.34/api/forks/feed", True))

    def test_live_arb_future_timestamp_is_not_fresh(self):
        future_arb = {"updated_at": time.time() + server.ROBINARB_FEED_FUTURE_SKEW + 5}

        self.assertFalse(server._live_arb_is_fresh(future_arb))

    def test_green_favicon_is_linked_from_index(self):
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        index_path = os.path.join(project_root, "index.html")
        favicon_path = os.path.join(project_root, "public", "favicon.svg")

        with open(index_path, encoding="utf-8") as index_file:
            index_html = index_file.read()
        with open(favicon_path, encoding="utf-8") as favicon_file:
            favicon_svg = favicon_file.read()

        self.assertIn('rel="icon"', index_html)
        self.assertIn('/favicon.svg', index_html)
        self.assertIn('#12b76a', favicon_svg)

    def test_public_health_hides_admin_diagnostics(self):
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["status"], "ok")
        self.assertNotIn("source", payload)
        self.assertNotIn("arb_count", payload)
        self.assertNotIn("forted_feed_url", payload)
        self.assertNotIn("forted_filters", payload)
        self.assertNotIn("forted_last_error", payload)

    def test_health_details_are_admin_only(self):
        owner_headers = self.login("owner", "owner123")
        trader_headers = self.login("trader1", "trader123")

        trader_response = self.client.get("/api/health/details", headers=trader_headers)
        owner_response = self.client.get("/api/health/details", headers=owner_headers)

        self.assertEqual(trader_response.status_code, 403)
        self.assertEqual(owner_response.status_code, 200, owner_response.text)
        self.assertIn("forted_filters", owner_response.json())

    def test_standalone_source_health_details_require_feed_key(self):
        original_keys = list(server.ROBINARB_FEED_KEYS)
        server.ROBINARB_FEED_KEYS = ["source-secret"]
        try:
            with TestClient(forted_source.app) as source_client:
                public_response = source_client.get("/health")
                blocked_response = source_client.get("/health/details")
                invalid_response = source_client.get("/health/details", headers={"X-Robinarb-Feed-Key": "wrong-secret"})
                details_response = source_client.get("/health/details", headers={"X-Robinarb-Feed-Key": "source-secret"})
        finally:
            server.ROBINARB_FEED_KEYS = original_keys

        self.assertEqual(public_response.status_code, 200, public_response.text)
        self.assertNotIn("forted_last_error", public_response.json())
        self.assertEqual(blocked_response.status_code, 401)
        self.assertEqual(invalid_response.status_code, 401)
        self.assertEqual(details_response.status_code, 200, details_response.text)
        self.assertIn("filters", details_response.json())

    def test_feed_key_matching_checks_multiple_keys(self):
        original_keys = list(server.ROBINARB_FEED_KEYS)
        server.ROBINARB_FEED_KEYS = ["first-secret", "second-secret"]
        try:
            self.assertTrue(server._matches_feed_key("second-secret"))
            self.assertFalse(server._matches_feed_key("missing-secret"))
        finally:
            server.ROBINARB_FEED_KEYS = original_keys

    def test_settle_cashback_endpoint_rules(self):
        trader_headers = self.login("trader1", "trader123")
        response = self.client.post("/api/auth/settle_cashback", headers=trader_headers)
        self.assertEqual(response.status_code, 403)

        superuser_headers = self.login("bumblebet", "bUmblE#Bet_9281!x")
        with server._users_lock:
            user = server._users.get("bumblebet")
            user["balance"]["cashback_pl"] = 0.0
            user["balance"]["pinnacle_cashback"] = 1000.0
            server._storage.update_user_balance("bumblebet", user["balance"])

        response = self.client.post("/api/auth/settle_cashback", headers=superuser_headers)
        self.assertEqual(response.status_code, 400)
        self.assertIn("Cashback PnL must be positive to settle", response.text)

        with server._users_lock:
            user = server._users.get("bumblebet")
            user["balance"]["cashback_pl"] = 150.50
            server._storage.update_user_balance("bumblebet", user["balance"])

        response = self.client.post("/api/auth/settle_cashback", headers=superuser_headers)
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["balance"]["pinnacle_cashback"], 1150.50)
        self.assertEqual(data["balance"]["cashback_pl"], 0.0)

        persisted_users = server._storage.load_users()
        self.assertEqual(persisted_users["bumblebet"]["balance"]["pinnacle_cashback"], 1150.50)
        self.assertEqual(persisted_users["bumblebet"]["balance"]["cashback_pl"], 0.0)

    def test_admin_user_management_flow(self):
        admin_headers = self.login("owner", "owner123")
        trader_headers = self.login("trader1", "trader123")

        # 1. Non-admin cannot create user
        response = self.client.post(
            "/api/admin/users",
            json={
                "username": "newclient",
                "password": "password123",
                "display_name": "New Client",
                "role": "trader",
                "pinnacle_cashback": 5000,
                "robinbet": 5000
            },
            headers=trader_headers
        )
        self.assertEqual(response.status_code, 403)

        # 2. Admin creates new user
        response = self.client.post(
            "/api/admin/users",
            json={
                "username": "newclient",
                "password": "password123",
                "display_name": "New Client",
                "role": "trader",
                "pinnacle_cashback": 5000,
                "robinbet": 5000
            },
            headers=admin_headers
        )
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["user"]["username"], "newclient")

        # 3. Verify user can login with new credentials
        new_headers = self.login("newclient", "password123")
        self.assertIn("Authorization", new_headers)

        # 4. Non-admin cannot adjust balance
        response = self.client.post(
            "/api/admin/users/newclient/balance",
            json={"pinnacle_cashback": 15000, "robinbet": 12000},
            headers=trader_headers
        )
        self.assertEqual(response.status_code, 403)

        # 5. Admin adjusts balance
        response = self.client.post(
            "/api/admin/users/newclient/balance",
            json={"pinnacle_cashback": 15000, "robinbet": 12000},
            headers=admin_headers
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["balance"]["pinnacle_cashback"], 15000.0)
        self.assertEqual(response.json()["balance"]["robinbet"], 12000.0)

        # 6. Admin resets password
        response = self.client.post(
            "/api/admin/users/newclient/password",
            json={"new_password": "newpassword123"},
            headers=admin_headers
        )
        self.assertEqual(response.status_code, 200, response.text)

        # Verify old login fails, and new login succeeds
        response = self.client.post(
            "/api/auth/login",
            json={"username": "newclient", "password": "password123"},
        )
        self.assertEqual(response.status_code, 401)

        new_headers_2 = self.login("newclient", "newpassword123")
        self.assertIn("Authorization", new_headers_2)

    def test_counter_verify_reads_onewin_sportsbook_price(self):
        class FakeOneWinClient:
            async def resolve_live_quote(self, arb):
                self.arb = arb
                return {
                    "verified": True,
                    "status": "OK",
                    "current_odds": 2.15,
                    "selection": "Home",
                    "source": "onewin-public-ws",
                }

        server._arbs_cache = [{
            "id": "onewin-counter-1",
            "bk2": "1win.pro",
            "bk2_odds": 2.15,
            "bk2_selection": "Home",
            "bk2_raw_link": "https://1win.pro/betting/match/sport/34968910",
            "updated_at": time.time(),
            "is_live": False,
        }]
        headers = self.login("owner", "owner123")
        with patch.object(server, "_shared_onewin_verify_client", return_value=FakeOneWinClient()):
            response = self.client.post(
                "/api/counter/verify",
                headers=headers,
                json={"arb_id": "onewin-counter-1"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertTrue(payload["verified"])
        self.assertTrue(payload["price_match"]["ok"])
        self.assertEqual(payload["source"], "onewin-public-ws")

    def test_counter_verify_requires_authentication(self):
        response = self.client.post("/api/counter/verify", json={"arb_id": "missing"})
        self.assertEqual(response.status_code, 401)

    def test_counter_verify_reads_ladbrokes_openbet_price(self):
        class FakeLadbrokesClient:
            async def resolve_live_quote(self, arb):
                self.arb = arb
                return {
                    "verified": True,
                    "status": "OK",
                    "current_odds": 1.65,
                    "selection": "Away",
                    "source": "ladbrokes-openbet",
                }

        server._arbs_cache = [{
            "id": "ladbrokes-counter-1",
            "bk2": "ladbrokes.com",
            "bk2_odds": 1.65,
            "bk2_selection": "Away",
            "bk2_raw_link": "https://sports.ladbrokes.com/event/tennis/x/257140112/all-markets",
            "updated_at": time.time(),
            "is_live": False,
        }]
        headers = self.login("owner", "owner123")
        with patch.object(server, "_shared_ladbrokes_verify_client", return_value=FakeLadbrokesClient()):
            response = self.client.post(
                "/api/counter/verify",
                headers=headers,
                json={"arb_id": "ladbrokes-counter-1"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertTrue(payload["verified"])
        self.assertTrue(payload["price_match"]["ok"])
        self.assertEqual(payload["source"], "ladbrokes-openbet")

    def test_counter_navigation_marks_bcgame_bti_provider(self):
        fields = server._counter_navigation_fields({
            "bk2": "bc.game",
            "bk2_raw_link": "https://prod20166.bti-sports.io/sports/event/123456789012345678",
        })

        self.assertEqual(fields["counter_navigation"]["provider_label"], "Provider BTi")
        self.assertEqual(fields["counter_navigation"]["avoid_provider_label"], "Provider Betby")
        self.assertEqual(fields["counter_navigation"]["url"], "https://bc.game/sports")

    def test_counter_navigation_marks_bcgame_compact_link_as_betby(self):
        fields = server._counter_navigation_fields({
            "bk2": "bc.game",
            "bk2_raw_link": "=/sports/football/england/premier-league/123456789012345678",
        })

        self.assertEqual(fields["counter_navigation"]["provider_label"], "Provider Betby")
        self.assertEqual(fields["counter_navigation"]["avoid_provider_label"], "Provider BTi")

    def test_counter_navigation_is_absent_for_unregistered_bookmaker(self):
        fields = server._counter_navigation_fields({
            "bk2": "ladbrokes.com",
            "bk2_raw_link": "https://sports.ladbrokes.com/event/123",
        })

        self.assertEqual(fields, {})

    # --- AC-8: PLACE_INDETERMINATE money-safety (Story 1.1, fix round 1) ---
    def test_betfair_place_indeterminate_holds_balance_pending_reconciliation(self):
        """A worker PLACE_INDETERMINATE error must not be treated as a clean
        reject: the reserved balance is NOT refunded, the bet is recorded as
        pending_reconciliation, and betfair_live_place.reconciliation_required
        is set — mirroring the existing Pinnacle UNKNOWN/PENDING contract."""
        headers = self.login("owner", "owner123")
        original_find_arb = server._find_arb_by_id
        original_consume_quote = server._consume_verified_quote
        original_quote_matches = server._verified_quote_matches_current_arb
        original_resolve_counter = server._resolve_counter_bookmaker_quote
        original_event_url = server._betfair_sportsbook_event_url
        original_prepare = server.betfair_sportsbook_basket.BetfairSportsbookBasketClient.prepare
        original_live_place_env = os.environ.get("ROBINARB_BETFAIR_LIVE_PLACE_ENABLED")

        arb = {
            "id": "arb-betfair-indeterminate",
            "match": "Team A vs Team B",
            "sport": "Soccer",
            "market": "Match Odds",
            "side1": "Home",
            "side2": "Away",
            "bk1_selection": "Home",
            "bk1_outcome": "Win1",
            "bk1_odds": 2.2,
            "bk2": "betfair.com",
            # Story reconcile Фаза3 (audit C, item 4 -- scoping): the live
            # placement guard now requires both is_betfair_fork AND
            # paddy_sportsbook.is_sportsbook_fork -- a bare "betfair.com"
            # bookmaker name with no sportsbook URL path fails the latter
            # (indistinguishable from Betfair Exchange). This bk2_url gives
            # it a real sportsbook path and an extractable event_id.
            "bk2_url": "https://www.betfair.com/sport/football/team-a-vs-team-b-29849246",
            "bk2_selection": "Away",
            "robin_odds": 2.1,
            "profit_pct": 3.0,
            "robin_profit_pct": 3.0,
        }
        quote = {
            "user": "owner",
            "arb_id": arb["id"],
            "odds": 2.2,
            "arb_snapshot": dict(arb),
        }

        async def fake_resolve_counter(_arb):
            return {
                "market_id": "1.234",
                "selection_id": "5678",
                "market_name": "Match Odds",
                "selection": "Away",
                "current_odds": 2.1,
                # Story reconcile Фаза3 (audit C): _resolve_betfair_placement_odds
                # requires verified/status/source, a matching event_id, and a
                # fresh snapshot_fetched_at before it will use this quote to
                # price the live placement.
                "verified": True,
                "status": "OK",
                "source": "paddy-sportsbook-api",
                "event_id": "29849246",
                "snapshot_fetched_at": time.time(),
            }

        async def fake_prepare(_self, _payload):
            raise server.betfair_sportsbook_basket.BetfairSportsbookBasketError(
                "BETSLIP_REJECTED: PLACE_INDETERMINATE: bet may have been placed — "
                "verify in My Bets before any retry"
            )

        server._find_arb_by_id = lambda _arb_id: dict(arb)
        server._consume_verified_quote = (
            lambda _username, _arb_id, quote_id: dict(quote) if quote_id == "indet-quote" else None
        )
        server._verified_quote_matches_current_arb = lambda _quote, _arb: True
        server._resolve_counter_bookmaker_quote = fake_resolve_counter
        server._betfair_sportsbook_event_url = lambda _arb, _quote: "https://www.betfair.com/betting/football/x"
        server.betfair_sportsbook_basket.BetfairSportsbookBasketClient.prepare = fake_prepare
        os.environ["ROBINARB_BETFAIR_LIVE_PLACE_ENABLED"] = "1"

        try:
            balance_before = self.client.get("/api/balance", headers=headers).json()["robinbet"]

            response = self.client.post(
                "/api/bet",
                headers=headers,
                json={
                    "arb_id": arb["id"],
                    "side": "robinbet",
                    "stake": 1.0,
                    "odds": 2.1,
                    "quote_id": "indet-quote",
                    "verify_mode": "betslip",
                },
            )
        finally:
            server._find_arb_by_id = original_find_arb
            server._consume_verified_quote = original_consume_quote
            server._verified_quote_matches_current_arb = original_quote_matches
            server._resolve_counter_bookmaker_quote = original_resolve_counter
            server._betfair_sportsbook_event_url = original_event_url
            server.betfair_sportsbook_basket.BetfairSportsbookBasketClient.prepare = original_prepare
            if original_live_place_env is None:
                os.environ.pop("ROBINARB_BETFAIR_LIVE_PLACE_ENABLED", None)
            else:
                os.environ["ROBINARB_BETFAIR_LIVE_PLACE_ENABLED"] = original_live_place_env

        # HTTP 200: an indeterminate outcome is not a rejection — the caller
        # must not see a clean-fail 4xx (that would invite an unsafe retry).
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        bet = payload["bet"]

        self.assertEqual(bet["status"], "pending_reconciliation")
        self.assertTrue(bet["betfair_live_place"]["reconciliation_required"])
        self.assertEqual(bet["betfair_live_place"]["status"], "UNKNOWN")
        recon = bet["betfair_live_place"]["reconciliation"]
        self.assertEqual(recon["event_id"], "29849246")
        self.assertEqual(recon["selection_id"], "5678")
        self.assertEqual(recon["stake"], 1.0)
        self.assertEqual(recon["expected_odds"], 2.1)

        # Money safety: the €1 reserve taken before placement is held, not
        # refunded — automatic double-betting on retry is the bigger risk.
        balance_after_response = float(payload["balance_after"])
        self.assertAlmostEqual(balance_before - 1.0, balance_after_response, places=2)
        current_balance = self.client.get("/api/balance", headers=headers).json()["robinbet"]
        self.assertAlmostEqual(balance_before - 1.0, current_balance, places=2)

    def test_betfair_reconcile_placed_accepts_pending_bet_without_balance_change(self):
        headers = self.login("owner", "owner123")
        user = server._users["owner"]
        balance_before = float(user["balance"]["robinbet"])
        user["bets"].append({
            "id": "bf-recon-1",
            "side": "robinbet",
            "stake": 1.0,
            "status": "pending_reconciliation",
            "settled_at": None,
            "payout": 0.0,
            "betfair_live_place": {
                "status": "UNKNOWN",
                "order_id": "2674780218",
                "reconciliation_required": True,
            },
        })
        server._storage.insert_bet("owner", user["bets"][-1])

        async def fake_reconcile(order_id, *, intent=None):
            self.assertEqual(order_id, "2674780218")
            self.assertIsNone(intent)
            return {
                "status": "PLACED",
                "order_id": order_id,
                "entry_service_id": order_id,
                "bet_id": "O/23359578/0000004",
                "receipt_bet_id": "233595780000004",
                "odds": 1.36,
            }

        with patch.object(server, "reconcile_betfair_live_place", new=fake_reconcile):
            response = self.client.post(
                "/api/bet/reconcile",
                params={"order_id": "2674780218"},
                headers=headers,
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["provider"], "betfair")
        bet = next(item for item in user["bets"] if item["id"] == "bf-recon-1")
        self.assertEqual(bet["status"], "accepted")
        self.assertFalse(bet["betfair_live_place"]["reconciliation_required"])
        self.assertEqual(bet["betfair_live_place"]["bet_id"], "O/23359578/0000004")
        self.assertEqual(float(user["balance"]["robinbet"]), balance_before)

    def test_betfair_reconcile_not_found_stays_pending_and_never_refunds(self):
        headers = self.login("owner", "owner123")
        user = server._users["owner"]
        balance_before = float(user["balance"]["robinbet"])
        user["bets"].append({
            "id": "bf-recon-unknown",
            "side": "robinbet",
            "stake": 1.0,
            "status": "pending_reconciliation",
            "settled_at": None,
            "payout": 0.0,
            "betfair_live_place": {
                "status": "UNKNOWN",
                "order_id": "2674780999",
                "reconciliation_required": True,
            },
        })
        server._storage.insert_bet("owner", user["bets"][-1])

        async def fake_reconcile(order_id, *, intent=None):
            self.assertIsNone(intent)
            return {
                "status": "UNKNOWN",
                "order_id": order_id,
                "error_code": "BET_NOT_FOUND",
                "reconciliation_required": True,
            }

        with patch.object(server, "reconcile_betfair_live_place", new=fake_reconcile):
            response = self.client.post(
                "/api/bet/reconcile",
                params={"order_id": "2674780999"},
                headers=headers,
            )

        self.assertEqual(response.status_code, 200, response.text)
        bet = next(item for item in user["bets"] if item["id"] == "bf-recon-unknown")
        self.assertEqual(bet["status"], "pending_reconciliation")
        self.assertTrue(bet["betfair_live_place"]["reconciliation_required"])
        self.assertEqual(float(user["balance"]["robinbet"]), balance_before)

    def test_betfair_reconcile_idless_pending_uses_strict_saved_intent(self):
        headers = self.login("owner", "owner123")
        user = server._users["owner"]
        user["bets"].append({
            "id": "bf-recon-idless",
            "side": "robinbet",
            "stake": 1.0,
            "status": "pending_reconciliation",
            "settled_at": None,
            "payout": 0.0,
            "betfair_live_place": {
                "status": "UNKNOWN",
                "order_id": None,
                "expected_odds": 1.36,
                "reconciliation_required": True,
                "reconciliation": {
                    "event_id": "35825764",
                    "selection_id": "63374950",
                    "stake": 1.0,
                    "expected_odds": 1.36,
                },
            },
        })
        server._storage.insert_bet("owner", user["bets"][-1])

        async def fake_reconcile(order_id, *, intent=None):
            self.assertEqual(order_id, "")
            self.assertEqual(intent["event_id"], "35825764")
            self.assertEqual(intent["selection_id"], "63374950")
            self.assertEqual(intent["stake"], 1.0)
            return {
                "status": "PLACED",
                "order_id": "2674780218",
                "entry_service_id": "2674780218",
                "bet_id": "O/23359578/0000004",
                "odds": 1.36,
            }

        with patch.object(server, "reconcile_betfair_live_place", new=fake_reconcile):
            response = self.client.post(
                "/api/bet/reconcile",
                params={"bet_id": "bf-recon-idless"},
                headers=headers,
            )

        self.assertEqual(response.status_code, 200, response.text)
        bet = next(item for item in user["bets"] if item["id"] == "bf-recon-idless")
        self.assertEqual(bet["status"], "accepted")
        self.assertEqual(bet["betfair_live_place"]["entry_service_id"], "2674780218")


if __name__ == "__main__":
    unittest.main()
