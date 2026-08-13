import os
import unittest

os.environ.setdefault("PS3838_LOGIN_ID", "test-login")
os.environ.setdefault("PS3838_LOGIN_PASSWORD", "test-password")
os.environ.setdefault("PS3838_SESSION_FILE", "/tmp/ps3838-test-session.json")

import app as ps_app
from fastapi.testclient import TestClient
from line_resolver import resolve_line_meta
from outcome_mapper import outcome_to_ps3838


def _event(periods):
    return {"raw": [1631000, "Home", "Away", periods], "home": "Home", "away": "Away"}


class MarketMarginTests(unittest.TestCase):
    def test_canonical_outcome_matrix_maps_all_common_market_sides(self):
        cases = {
            "1": (1, 0, 0.0),
            "2": (1, 1, 0.0),
            "X": (1, 2, 0.0),
            "H1 -1.5": (2, 0, -1.5),
            "H2 1.5": (2, 1, 1.5),
            "T> 2.5": (3, 3, 2.5),
            "T< 2.5": (3, 4, 2.5),
            "IT1> 1.5": (4, 5, 1.5),
            "IT1< 1.5": (4, 0, 1.5),
            "IT2> 0.5": (5, 7, 0.5),
            "IT2< 0.5": (5, 1, 0.5),
        }
        for outcome, expected in cases.items():
            with self.subTest(outcome=outcome):
                params = outcome_to_ps3838(outcome)
                self.assertEqual(params["market"], "standard")
                self.assertEqual(
                    (params["bet_type"], params["team_select"], params["handicap"]),
                    expected,
                )

    def test_period_prefix_remains_part_of_ps3838_identity(self):
        params = outcome_to_ps3838("P3 H2 +1.5")
        self.assertEqual(params["period"], 3)
        self.assertEqual(params["bet_type"], 2)
        self.assertEqual(params["team_select"], 1)
        self.assertEqual(params["handicap"], 1.5)

    def test_tennis_scope_selects_related_board_without_price(self):
        root = {"raw": [100], "home": "Player A", "away": "Player B"}
        games = {"raw": [101], "home": "Player A (Games)", "away": "Player B (Games)"}
        root["children"] = [games]

        self.assertIs(ps_app._select_tennis_scope_event(root, "sets"), root)
        self.assertIs(ps_app._select_tennis_scope_event(root, "games"), games)

    def test_tennis_scope_rejects_duplicate_related_boards(self):
        root = {"raw": [100], "home": "Player A", "away": "Player B"}
        root["children"] = [
            {"raw": [101], "home": "Player A (Games)", "away": "Player B (Games)"},
            {"raw": [102], "home": "Player A Games", "away": "Player B Games"},
        ]
        self.assertIsNone(ps_app._select_tennis_scope_event(root, "games"))

    def test_line_resolver_rejects_mirror_handicap_sign(self):
        event = _event({
            "0": [
                [[-1.5, 1.5, "1.5", 4.35, 1.22, None, None, 5679, 1]],
                [],
                [],
            ]
        })

        self.assertIsNone(resolve_line_meta(event, period=0, bet_type=2, team_select=0, handicap=1.5))
        exact = resolve_line_meta(event, period=0, bet_type=2, team_select=0, handicap=-1.5)
        self.assertIsNotNone(exact)
        self.assertEqual(exact["line_id"], 5679)

    def test_exact_ids_mismatch_rejects_opposite_handicap(self):
        req = ps_app.VerifyRequest(
            event_id=1631736473,
            outcome="H1 1.5",
            market="Handicap",
            line_id="56729396411",
            odds_id="1631736473|0|2|0|1|-1.5",
            selection_id="56729396411|1631736473|0|2|0|1|-1.5|0",
        )
        _outcome, params = ps_app._resolve_outcome_and_params(req)

        reason = ps_app._exact_ids_mismatch_reason(
            req=req,
            odds_id=req.odds_id,
            selection_id=req.selection_id,
            event_id=req.event_id,
            sport="Tennis",
            params=params,
        )

        self.assertIn("handicap", reason)

    def test_exact_ids_match_requested_tuple(self):
        req = ps_app.VerifyRequest(
            event_id=1631736473,
            outcome="H1 1.5",
            market="Handicap",
            line_id="56729396412",
            odds_id="1631736473|0|2|0|1|1.5",
            selection_id="56729396412|1631736473|0|2|0|1|1.5|0",
        )
        _outcome, params = ps_app._resolve_outcome_and_params(req)

        reason = ps_app._exact_ids_mismatch_reason(
            req=req,
            odds_id=req.odds_id,
            selection_id=req.selection_id,
            event_id=req.event_id,
            sport="Tennis",
            params=params,
        )

        self.assertIsNone(reason)

    def test_reversed_team_order_keeps_handicap_sign(self):
        event = {"home": "Philadelphia Phillies", "away": "Chicago White Sox", "raw": [1631581358]}
        params = {"bet_type": 2, "team_select": 1, "handicap": -1.5}

        bet_type, team_select, handicap, reversed_flag = ps_app._effective_market_params(
            event,
            params,
            forted_home="Chicago White Sox",
            forted_away="Philadelphia Phillies",
        )

        self.assertTrue(reversed_flag)
        self.assertEqual(bet_type, 2)
        self.assertEqual(team_select, 0)
        self.assertAlmostEqual(handicap, -1.5)

    def test_compact_handicap_margin_uses_exact_opposite_line(self):
        periods = {
            "0": [
                [[4.5, -4.5, "4.5", 1.63, 2.48, None, None, 3631613646, 1]],
                [],
                [],
            ]
        }

        body = ps_app._compact_market_margin_from_event(
            _event(periods),
            period=0,
            bet_type=2,
            team_select=1,
            handicap=-4.5,
        )

        self.assertIsNotNone(body)
        self.assertEqual(body["status"], "OK")
        self.assertEqual(body["source"], "compact")
        self.assertEqual(body["line_id"], 3631613646)
        self.assertEqual(body["opposite_line_id"], 3631613646)
        self.assertAlmostEqual(body["selected_odds"], 2.48)
        self.assertAlmostEqual(body["opposite_odds"], 1.63)
        self.assertAlmostEqual(body["margin"], 1 / 2.48 + 1 / 1.63 - 1, places=6)

    def test_compact_moneyline_margin_uses_all_available_outcomes(self):
        periods = {"0": [[], [], [1.91, 1.95, None, 777]]}

        body = ps_app._compact_market_margin_from_event(
            _event(periods),
            period=0,
            bet_type=1,
            team_select=1,
            handicap=0,
        )

        self.assertIsNotNone(body)
        self.assertEqual(body["margin_type"], "moneyline")
        self.assertEqual(len(body["outcomes"]), 2)
        self.assertAlmostEqual(body["margin"], 1 / 1.91 + 1 / 1.95 - 1, places=6)

    def test_more_bet_parent_team_total_margin_uses_requested_side(self):
        periods = {
            "0": [
                [],
                [],
                [],
                None,
                [],
                [["1.5", 1.5, "4.22", "1.21", 56719859810, 1, 100.0, 1]],
            ]
        }

        body = ps_app._compact_market_margin_from_event(
            _event(periods),
            period=0,
            bet_type=5,
            team_select=7,
            handicap=1.5,
            source="more_bet",
        )

        self.assertIsNotNone(body)
        self.assertEqual(body["source"], "more_bet")
        self.assertEqual(body["line_id"], 56719859810)
        self.assertEqual(body["opposite_line_id"], 56719859810)
        self.assertAlmostEqual(body["selected_odds"], 4.22)
        self.assertAlmostEqual(body["opposite_odds"], 1.21)
        self.assertAlmostEqual(body["margin"], 1 / 4.22 + 1 / 1.21 - 1, places=6)


class ExactIdEventOrderTests(unittest.IsolatedAsyncioTestCase):
    async def test_exact_ids_skip_context_lookup_for_already_resolved_child_event(self):
        odds_id = "1631709519|0|4|0|0|5.5"
        selection_id = f"3632285588|{odds_id}|0"
        calls = {"verify_by_ids": None}

        class FakeVerifier:
            async def verify_by_ids(self, **kwargs):
                calls["verify_by_ids"] = dict(kwargs)
                return {
                    "status": "OK",
                    "odds": "1.625",
                    "selection_id": selection_id,
                    "selection_id_sent": selection_id,
                    "line_id": 3632285588,
                    "odds_id": odds_id,
                    "fresh": True,
                    "age_seconds": 0.0,
                }

        async def fail_context_lookup(*_args, **_kwargs):
            raise AssertionError("exact-id contextual verify must not re-resolve the child event")

        original_verifier = ps_app.verifier
        original_context_lookup = ps_app._resolve_contextual_market_request
        original_login_error = ps_app.session.login_error
        original_login_id = getattr(ps_app.session, "login_id", None)
        original_login_password = getattr(ps_app.session, "login_password", None)
        ps_app.verifier = FakeVerifier()
        ps_app._resolve_contextual_market_request = fail_context_lookup
        ps_app.session._login_error = None
        ps_app.session.login_id = "TEST_LOGIN"
        ps_app.session.login_password = "test-password"
        try:
            client = TestClient(ps_app.app)
            response = client.post(
                "/verify",
                json={
                    "event_id": 1631709519,
                    "outcome": "CIT1< 5.5",
                    "market": "Totals",
                    "market_context": "corners",
                    "line_id": "3632285588",
                    "odds_id": odds_id,
                    "selection_id": selection_id,
                    "sport": "Soccer",
                    "side": "pinnacle",
                },
            )
        finally:
            ps_app.verifier = original_verifier
            ps_app._resolve_contextual_market_request = original_context_lookup
            ps_app.session._login_error = original_login_error
            ps_app.session.login_id = original_login_id
            ps_app.session.login_password = original_login_password

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["status"], "OK")
        self.assertEqual(payload["market_context"], "corners")
        self.assertEqual(calls["verify_by_ids"]["odds_id"], odds_id)
        self.assertEqual(calls["verify_by_ids"]["selection_id"], selection_id)
        result = payload["results"][0]
        self.assertEqual(result["event_id"], 1631709519)
        self.assertEqual(result["market_context"], "corners")
        self.assertEqual(result["bet_type"], 4)
        self.assertEqual(result["team_select"], 0)
        self.assertAlmostEqual(result["handicap"], 5.5)

    async def test_exact_id_validation_uses_reversed_event_order_without_mirroring_handicap(self):
        event_id = 1631581358
        req = ps_app.VerifyRequest(
            event_id=event_id,
            sport="Baseball",
            outcome="H2 -1.5",
            forted_home="Chicago White Sox",
            forted_away="Philadelphia Phillies",
            line_id="56729527844",
            odds_id=f"{event_id}|0|2|0|0|-1.5",
            selection_id=f"56729527844|{event_id}|0|2|0|0|-1.5|0",
        )
        _outcome, params = ps_app._resolve_outcome_and_params(req)
        ps_event = {"home": "Philadelphia Phillies", "away": "Chicago White Sox", "raw": [event_id]}

        original_cache = ps_app.cache
        original_more_bet = ps_app._more_bet_event_for_market_margin

        async def fake_more_bet(_sport_id, _event_id):
            self.assertEqual(_event_id, event_id)
            return ps_event

        ps_app.cache = None
        ps_app._more_bet_event_for_market_margin = fake_more_bet
        try:
            effective, reversed_flag, event = await ps_app._effective_request_params_for_event_order(
                req,
                event_id=event_id,
                sport="Baseball",
                params=params,
            )
        finally:
            ps_app.cache = original_cache
            ps_app._more_bet_event_for_market_margin = original_more_bet

        self.assertIs(event, ps_event)
        self.assertTrue(reversed_flag)
        self.assertEqual(effective["bet_type"], 2)
        self.assertEqual(effective["team_select"], 0)
        self.assertAlmostEqual(effective["handicap"], -1.5)
        self.assertIsNone(
            ps_app._exact_ids_mismatch_reason(
                req=req,
                odds_id=req.odds_id,
                selection_id=req.selection_id,
                event_id=event_id,
                sport="Baseball",
                params=effective,
            )
        )

        wrong_sign = f"{event_id}|0|2|0|0|1.5"
        self.assertIn(
            "handicap",
            ps_app._exact_ids_mismatch_reason(
                req=req,
                odds_id=wrong_sign,
                selection_id=f"56729527844|{wrong_sign}|0",
                event_id=event_id,
                sport="Baseball",
                params=effective,
            ),
        )


if __name__ == "__main__":
    unittest.main()
