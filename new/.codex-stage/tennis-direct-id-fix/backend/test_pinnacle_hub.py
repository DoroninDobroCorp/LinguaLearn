"""Tests for pin888 hub stream snapshot decoding."""
import json
import time
import unittest

import pinnacle_hub


def _snapshot(rows):
    return {
        "t": "snapshot",
        "sport": 29,
        "slug": "soccer",
        "scope": "live",
        "ts": 123456789,
        "data": json.dumps({
            "odds": {
                "u": [[29, rows]],
            },
        }),
    }


def _frame(rows):
    return {
        "t": "frame",
        "sport": 29,
        "slug": "soccer",
        "scope": "live",
        "ts": 123456790,
        "data": json.dumps({
            "odds": {
                "u": [[29, rows]],
            },
        }),
    }


class PinnacleHubTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        pinnacle_hub._snapshot_cache.clear()
        pinnacle_hub._more_bet_cache.clear()
        pinnacle_hub.clear_stream_cache()

    async def test_lookup_stream_price_matches_by_id(self):
        rows = [
            [0, 1, 0, None, -161.0, "1.621", 1111, 2222, 0, 1, "O", 0, 1631777],
            [0, 1, 2, None, 290.0, "3.900", 3333, 4444, 0, 1, "O", 0, 1631777],
        ]
        pinnacle_hub._snapshot_cache["soccer"] = (time.time(), _snapshot(rows))

        result = await pinnacle_hub.lookup_stream_price(
            sport_label="Футбол - Бразилия",
            event_id="1631777",
            odds_id="2222",
            raw_selection="П1",
        )

        self.assertIsNotNone(result)
        self.assertEqual(result["matched_by"], "id+selection")
        self.assertEqual(result["decimal_odds"], 1.6211)
        self.assertEqual(result["line_id"], "1111")
        self.assertEqual(result["odds_id"], "2222")

    async def test_lookup_stream_price_matches_total_selection(self):
        rows = [
            [0, 3, 3, 2.5, -139.0, "0.719", 1111, 2222, 0, 1, "O", 0, 1631777],
            [0, 3, 4, 2.5, 102.0, "1.020", 1111, 3333, 0, 1, "O", 0, 1631777],
        ]
        pinnacle_hub._snapshot_cache["soccer"] = (time.time(), _snapshot(rows))

        result = await pinnacle_hub.lookup_stream_price(
            sport_label="Soccer",
            event_id="1631777",
            raw_selection="ТМ(2.5)",
            market="Totals",
            outcome="Under 2.5",
        )

        self.assertIsNotNone(result)
        self.assertEqual(result["matched_by"], "selection")
        self.assertEqual(result["decimal_odds"], 2.02)
        self.assertEqual(result["designation_code"], 4)
        self.assertEqual(result["points"], 2.5)
        self.assertIn("market_signature", result)
        self.assertAlmostEqual(result["market_margin"], 1 / 1.7194 + 1 / 2.02 - 1, places=4)
        self.assertEqual(
            [outcome["designation_code"] for outcome in result["market_outcomes"]],
            [3, 4],
        )

    async def test_lookup_stream_price_preserves_handicap_sign(self):
        rows = [
            [0, 2, 1, -1.5, 154.0, "2.540", 1111, 1111, 0, 1, "O", 0, 1631777],
            [0, 2, 0, 1.5, -200.0, "1.500", 1111, 1111, 0, 1, "O", 0, 1631777],
            [0, 2, 0, -1.5, -112.0, "1.892", 2222, 2222, 0, 1, "O", 0, 1631777],
            [0, 2, 1, 1.5, -108.0, "1.926", 2222, 2222, 0, 1, "O", 0, 1631777],
        ]
        pinnacle_hub._snapshot_cache["tennis"] = (time.time(), {
            **_snapshot(rows), "sport": 33, "slug": "tennis",
        })

        result = await pinnacle_hub.lookup_stream_price(
            sport_label="Теннис",
            event_id="1631777",
            raw_selection="Ф2(1,5)",
            market="Handicap",
            outcome="H2 1.5",
        )

        self.assertIsNotNone(result)
        self.assertEqual(result["points"], 1.5)
        self.assertEqual(result["designation_code"], 1)
        self.assertAlmostEqual(result["decimal_odds"], 1.9259, places=4)
        self.assertAlmostEqual(result["market_margin"], 1 / 1.8929 + 1 / 1.9259 - 1, places=4)
        self.assertEqual(
            {outcome["line_id"] for outcome in result["market_outcomes"]},
            {"2222"},
        )

    async def test_lookup_stream_price_selection_only_never_uses_forted_price(self):
        rows = [
            [0, 2, 0, -1.5, -125.0, "1.800", 3669291688, 3669291688, 0, 1, "O", 0, 1632727214],
            [0, 2, 1, 1.5, -97.0, "2.030", 3669291688, 3669291688, 0, 1, "O", 0, 1632727214],
            [0, 2, 0, 1.5, -292.0, "1.343", 56878490460, 56878490460, 0, 1, "O", 0, 1632727214],
            [0, 2, 1, -1.5, 224.0, "3.240", 56878490460, 56878490460, 0, 1, "O", 0, 1632727214],
        ]
        pinnacle_hub._snapshot_cache["tennis"] = (time.time(), {
            **_snapshot(rows), "sport": 33, "slug": "tennis",
        })

        result = await pinnacle_hub.lookup_stream_price(
            sport_label="Теннис",
            event_id="1632727214",
            raw_selection="Ф2(1,5)",
            market="Handicap",
            outcome="H2 1.5",
        )

        self.assertIsNotNone(result)
        self.assertEqual(result["matched_by"], "selection")
        self.assertNotIn("expected_decimal_odds", result)

    async def test_lookup_stream_price_selection_only_is_diagnostic(self):
        rows = [
            [0, 2, 0, -1.5, -125.0, "1.800", 3669291688, 3669291688, 0, 1, "O", 0, 1632727214],
            [0, 2, 1, 1.5, -97.0, "2.030", 3669291688, 3669291688, 0, 1, "O", 0, 1632727214],
            [0, 2, 0, 1.5, -292.0, "1.343", 56878490460, 56878490460, 0, 1, "O", 0, 1632727214],
            [0, 2, 1, -1.5, 224.0, "3.240", 56878490460, 56878490460, 0, 1, "O", 0, 1632727214],
        ]
        pinnacle_hub._snapshot_cache["tennis"] = (time.time(), {
            **_snapshot(rows), "sport": 33, "slug": "tennis",
        })

        result = await pinnacle_hub.lookup_stream_price(
            sport_label="Теннис",
            event_id="1632727214",
            raw_selection="Ф2(1,5)",
            market="Handicap",
            outcome="H2 1.5",
        )

        self.assertIsNotNone(result)
        self.assertEqual(result["matched_by"], "selection")
        self.assertEqual(result["line_id"], "3669291688")
        self.assertEqual(
            {outcome["line_id"] for outcome in result["market_outcomes"]},
            {"3669291688"},
        )

    async def test_lookup_stream_price_uses_latest_duplicate_coordinate(self):
        rows = [
            [0, 1, 0, 0, 0, "16.00", 1111, 1111, 0, 1, "O", 0, 1631777],
            [0, 1, 1, 0, 0, "1.023", 1111, 1111, 0, 1, "O", 0, 1631777],
            [0, 1, 0, 0, 0, "13.58", 2222, 2222, 0, 1, "O", 0, 1631777],
            [0, 1, 1, 0, 0, "1.031", 2222, 2222, 0, 1, "O", 0, 1631777],
        ]
        pinnacle_hub._snapshot_cache["tennis"] = (time.time(), {
            **_snapshot(rows), "sport": 33, "slug": "tennis",
        })

        result = await pinnacle_hub.lookup_stream_price(
            sport_label="Теннис",
            event_id="1631777",
            raw_selection="П1",
            market="Moneyline",
            outcome="Win1",
        )

        self.assertIsNotNone(result)
        self.assertEqual(result["decimal_odds"], 13.58)
        self.assertEqual(result["line_id"], "2222")

    async def test_lookup_stream_price_reverses_canonical_team_order(self):
        rows = [
            [0, 1, 0, 0, 0, "1.806", 1111, 1111, 0, 1, "O", 0, 1631777],
            [0, 1, 1, 0, 0, "2.230", 1111, 1111, 0, 1, "O", 0, 1631777],
        ]
        pinnacle_hub._snapshot_cache["tennis"] = (time.time(), {
            **_snapshot(rows), "sport": 33, "slug": "tennis",
        })

        result = await pinnacle_hub.lookup_stream_price(
            sport_label="Теннис",
            event_id="1631777",
            raw_selection="П2",
            market="Moneyline",
            outcome="Win2",
            reverse_teams=True,
        )

        self.assertIsNotNone(result)
        self.assertEqual(result["designation_code"], 0)
        self.assertEqual(result["decimal_odds"], 1.806)

    async def test_lookup_stream_price_does_not_turn_qualifier_into_moneyline(self):
        rows = [
            [0, 1, 0, 0, 0, "2.960", 1111, 1111, 0, 1, "O", 0, 1631777],
            [0, 1, 1, 0, 0, "1.420", 1111, 1111, 0, 1, "O", 0, 1631777],
        ]
        pinnacle_hub._snapshot_cache["soccer"] = (time.time(), _snapshot(rows))

        result = await pinnacle_hub.lookup_stream_price(
            sport_label="Soccer",
            event_id="1631777",
            raw_selection="К1 пройдёт",
            market="Moneyline",
            outcome="Win1",
        )

        self.assertIsNone(result)

    async def test_lookup_stream_price_omits_margin_when_pair_is_incomplete(self):
        rows = [
            [0, 3, 4, 2.5, 102.0, "1.020", 1111, 3333, 0, 1, "O", 0, 1631777],
        ]
        pinnacle_hub._snapshot_cache["soccer"] = (time.time(), _snapshot(rows))

        result = await pinnacle_hub.lookup_stream_price(
            sport_label="Soccer",
            event_id="1631777",
            raw_selection="ТМ(2.5)",
            market="Totals",
            outcome="Under 2.5",
        )

        self.assertIsNotNone(result)
        self.assertNotIn("market_margin", result)

    async def test_lookup_stream_price_rejects_neighbouring_line(self):
        rows = [
            [0, 3, 4, 2.49, 102.0, "1.020", 1111, 3333, 0, 1, "O", 0, 1631777],
        ]
        pinnacle_hub._snapshot_cache["soccer"] = (time.time(), _snapshot(rows))

        result = await pinnacle_hub.lookup_stream_price(
            sport_label="Soccer",
            event_id="1631777",
            raw_selection="ТМ(2.5)",
            market="Totals",
            outcome="Under 2.5",
        )

        self.assertIsNone(result)

    async def test_lookup_stream_price_does_not_pair_neighbouring_margin_line(self):
        rows = [
            [0, 3, 3, 2.49, -139.0, "0.719", 1111, 2222, 0, 1, "O", 0, 1631777],
            [0, 3, 4, 2.5, 102.0, "1.020", 1111, 3333, 0, 1, "O", 0, 1631777],
        ]
        pinnacle_hub._snapshot_cache["soccer"] = (time.time(), _snapshot(rows))

        result = await pinnacle_hub.lookup_stream_price(
            sport_label="Soccer",
            event_id="1631777",
            raw_selection="ТМ(2.5)",
            market="Totals",
            outcome="Under 2.5",
        )

        self.assertIsNotNone(result)
        self.assertNotIn("market_margin", result)

    async def test_lookup_stream_price_disambiguates_shared_ids_by_selection(self):
        rows = [
            [0, 3, 3, 2.5, -139.0, "0.719", 1111, 2222, 0, 1, "O", 0, 1631777],
            [0, 3, 4, 2.5, 102.0, "1.020", 1111, 2222, 0, 1, "O", 0, 1631777],
        ]
        pinnacle_hub._snapshot_cache["soccer"] = (time.time(), _snapshot(rows))

        result = await pinnacle_hub.lookup_stream_price(
            sport_label="Soccer",
            event_id="1631777",
            line_id="1111",
            raw_selection="ТМ(2.5)",
            market="Totals",
            outcome="Under 2.5",
        )

        self.assertIsNotNone(result)
        self.assertEqual(result["matched_by"], "id+selection")
        self.assertEqual(result["decimal_odds"], 2.02)
        self.assertEqual(result["designation_code"], 4)

    async def test_lookup_stream_price_does_not_fallback_to_selection_when_expected_id_misses(self):
        rows = [
            [0, 1, 0, None, -161.0, "1.621", 1111, 2222, 0, 1, "O", 0, 1631777],
            [0, 1, 2, None, 290.0, "3.900", 3333, 4444, 0, 1, "O", 0, 1631777],
        ]
        pinnacle_hub._snapshot_cache["soccer"] = (time.time(), _snapshot(rows))

        result = await pinnacle_hub.lookup_stream_price(
            sport_label="Soccer",
            event_id="1631777",
            selection_id="missing-selection-id",
            raw_selection="П1",
            market="Moneyline",
            outcome="Win1",
        )

        self.assertIsNone(result)

    async def test_lookup_stream_price_requires_selection_check_for_line_id_only(self):
        rows = [
            [0, 3, 3, 2.5, -139.0, "0.719", 1111, 2222, 0, 1, "O", 0, 1631777],
        ]
        pinnacle_hub._snapshot_cache["soccer"] = (time.time(), _snapshot(rows))

        result = await pinnacle_hub.lookup_stream_price(
            sport_label="Soccer",
            event_id="1631777",
            line_id="1111",
            raw_selection="unknown selection",
            market="Totals",
            outcome="",
        )

        self.assertIsNone(result)

    async def test_lookup_stream_price_signature_tracks_pair_price_change(self):
        rows = [
            [0, 3, 3, 2.5, -139.0, "0.719", 1111, 2222, 0, 1, "O", 0, 1631777],
            [0, 3, 4, 2.5, 102.0, "1.020", 1111, 3333, 0, 1, "O", 0, 1631777],
        ]
        pinnacle_hub._snapshot_cache["soccer"] = (time.time(), _snapshot(rows))
        first = await pinnacle_hub.lookup_stream_price(
            sport_label="Soccer",
            event_id="1631777",
            raw_selection="ТМ(2.5)",
            market="Totals",
            outcome="Under 2.5",
        )

        rows[0][4] = -150.0
        pinnacle_hub.apply_stream_frame(_snapshot(rows))
        pinnacle_hub._snapshot_cache["soccer"] = (time.time(), _snapshot(rows))
        second = await pinnacle_hub.lookup_stream_price(
            sport_label="Soccer",
            event_id="1631777",
            raw_selection="ТМ(2.5)",
            market="Totals",
            outcome="Under 2.5",
        )

        self.assertIsNotNone(first)
        self.assertIsNotNone(second)
        self.assertNotEqual(first["market_signature"], second["market_signature"])

    async def test_lookup_stream_price_uses_accumulated_partial_updates(self):
        rows = [
            [0, 3, 3, 2.5, -139.0, "0.719", 1111, 2222, 0, 1, "O", 0, 1631777],
            [0, 3, 4, 2.5, 102.0, "1.020", 1111, 3333, 0, 1, "O", 0, 1631777],
        ]
        pinnacle_hub.apply_stream_frame(_snapshot(rows))
        pinnacle_hub.apply_stream_frame(_frame([
            [0, 3, 4, 2.5, 110.0, "1.100", 1111, 3333, 0, 1, "O", 0, 1631777],
        ]))

        result = await pinnacle_hub.lookup_stream_price(
            sport_label="Soccer",
            event_id="1631777",
            raw_selection="ТМ(2.5)",
            market="Totals",
            outcome="Under 2.5",
        )

        self.assertIsNotNone(result)
        self.assertEqual(result["decimal_odds"], 2.1)
        self.assertEqual(len(result["market_outcomes"]), 2)

    async def test_stream_cache_age_uses_pin888_frame_timestamp(self):
        rows = [
            [0, 1, 0, None, -161.0, "1.621", 1111, 2222, 0, 1, "O", 0, 1631777],
        ]
        frame = _snapshot(rows)
        frame["ts"] = int((time.time() - 30.0) * 1000)

        pinnacle_hub.apply_stream_frame(frame)
        status = pinnacle_hub.stream_cache_status()

        self.assertGreaterEqual(status["sports"]["soccer"]["age_sec"], 25.0)

    async def test_lookup_stream_price_ignores_stale_hub_snapshot(self):
        rows = [
            [0, 1, 0, None, -161.0, "1.621", 1111, 2222, 0, 1, "O", 0, 1631777],
        ]
        frame = _snapshot(rows)
        frame["ts"] = int((time.time() - pinnacle_hub.STREAM_STATE_MAX_AGE_SEC - 5.0) * 1000)
        original = pinnacle_hub.get_cached_snapshot

        async def fake_snapshot(*_args, **_kwargs):
            return frame

        pinnacle_hub.get_cached_snapshot = fake_snapshot
        try:
            result = await pinnacle_hub.lookup_stream_price(
                sport_label="Soccer",
                event_id="1631777",
                odds_id="2222",
                raw_selection="П1",
            )
        finally:
            pinnacle_hub.get_cached_snapshot = original

        self.assertIsNone(result)

    async def test_lookup_more_bet_price_requires_exact_handicap_sign(self):
        event_id = "1631777"
        raw_event = [
            int(event_id),
            "Home FC",
            "Away FC",
            0,
            0,
            0,
            0,
            0,
            {
                "0": [
                    None,
                    None,
                    [
                        [1.5, -1.5, "1.5", "0.760", "1.120", 0, 1, 5678, 1, 100.0, 0],
                        [-1.5, 1.5, "1.5", "1.120", "0.760", 0, 1, 5679, 1, 100.0, 0],
                    ],
                    [["2.5", 2.5, "0.900", "0.950", 6789, 1, 100.0, 0]],
                    ["1.500", "3.000", "2.300", 4567, 0, 100.0, 0],
                ],
            },
        ]
        pinnacle_hub._more_bet_cache[event_id] = (
            time.time(),
            {
                "ok": True,
                "event_id": event_id,
                "data": {
                    "odds": {
                        "e": [29, 100, 2, raw_event, 123456789],
                        "e1": None,
                    },
                },
            },
        )

        result = await pinnacle_hub.lookup_more_bet_price(
            sport_label="Soccer",
            event_id=event_id,
            raw_selection="Ф2(1,5)",
            market="Handicap",
            outcome="Win2",
        )

        self.assertIsNotNone(result)
        self.assertEqual(result["source"], "pinnacle-more-bet")
        self.assertEqual(result["line_id"], "5679")
        self.assertEqual(result["is_alt"], 1)
        self.assertEqual(result["actual_handicap"], 1.5)
        self.assertEqual(result["matched_by"], "more_bet_selection")

    def test_more_bet_resolver_rejects_neighbouring_total_line(self):
        event = {
            "raw": [
                1631777,
                "Home FC",
                "Away FC",
                {
                    "0": [
                        None,
                        None,
                        [],
                        [["2.49", 2.49, "1.900", "1.950", 6789, 1]],
                        [],
                    ],
                },
            ],
        }

        result = pinnacle_hub._resolve_more_bet_line_meta(
            event,
            period=0,
            bet_type=3,
            team_select=4,
            handicap=2.5,
        )

        self.assertIsNone(result)

    async def test_lookup_more_bet_price_rejects_opposite_handicap_sign(self):
        event_id = "1631778"
        raw_event = [
            int(event_id),
            "Home FC",
            "Away FC",
            0,
            0,
            0,
            0,
            0,
            {
                "0": [
                    None,
                    None,
                    [[1.5, -1.5, "1.5", "0.760", "1.120", 0, 1, 5678, 1, 100.0, 0]],
                    [],
                    ["1.500", "3.000", "2.300", 4567, 0, 100.0, 0],
                ],
            },
        ]
        pinnacle_hub._more_bet_cache[event_id] = (
            time.time(),
            {
                "ok": True,
                "event_id": event_id,
                "data": {
                    "odds": {
                        "e": [29, 100, 2, raw_event, 123456789],
                        "e1": None,
                    },
                },
            },
        )

        result = await pinnacle_hub.lookup_more_bet_price(
            sport_label="Soccer",
            event_id=event_id,
            raw_selection="Ф2(1,5)",
            market="Handicap",
            outcome="Win2",
        )

        self.assertIsNone(result)

    async def test_lookup_more_bet_price_rejects_wrong_signed_handicap(self):
        event_id = "1631779"
        raw_event = [
            int(event_id),
            "Home FC",
            "Away FC",
            0,
            0,
            0,
            0,
            0,
            {
                "0": [
                    None,
                    None,
                    [[-1.5, 1.5, "1.5", "0.760", "1.120", 0, 1, 5678, 1, 100.0, 0]],
                    [],
                    ["1.500", "3.000", "2.300", 4567, 0, 100.0, 0],
                ],
            },
        ]
        pinnacle_hub._more_bet_cache[event_id] = (
            time.time(),
            {
                "ok": True,
                "event_id": event_id,
                "data": {
                    "odds": {
                        "e": [29, 100, 2, raw_event, 123456789],
                        "e1": None,
                    },
                },
            },
        )

        result = await pinnacle_hub.lookup_more_bet_price(
            sport_label="Soccer",
            event_id=event_id,
            raw_selection="Ф2(-1,5)",
            market="Handicap",
            outcome="Win2",
        )

        self.assertIsNone(result)

    async def test_lookup_more_bet_price_rejects_opposite_signed_handicap(self):
        event_id = "1631338310"
        raw_event = [
            int(event_id),
            "Japan",
            "Sweden",
            0,
            0,
            0,
            0,
            0,
            {
                "0": [
                    [],
                    [],
                    [
                        [0.5, -0.5, "0.5", "1.943", "1.943", 1, 0, 3645385469, 0, 10000.0, 1],
                        [1.5, -1.5, "1.5", "3.570", "1.311", 1, 0, 56779565505, 1, 10000.0, 1],
                    ],
                    [],
                    ["4.400", "1.934", "3.380"],
                ],
            },
        ]
        pinnacle_hub._more_bet_cache[event_id] = (
            time.time(),
            {
                "ok": True,
                "event_id": event_id,
                "data": {
                    "odds": {
                        "e": [29, 2686, 0, raw_event, 123456789],
                        "e1": None,
                    },
                },
            },
        )

        result = await pinnacle_hub.lookup_more_bet_price(
            sport_label="Soccer",
            event_id=event_id,
            raw_selection="Ф2(1,5)",
            market="Handicap",
            outcome="H2 1.5",
        )

        self.assertIsNone(result)

    async def test_lookup_more_bet_price_uses_exact_sign_even_when_other_price_is_closer(self):
        event_id = "1620849626"
        raw_event = [
            int(event_id),
            "Norway",
            "Senegal",
            0,
            0,
            0,
            0,
            0,
            {
                "0": [
                    [],
                    [],
                    [
                        [0.25, -0.25, "0-0.5", "1.952", "1.952", 1, 0, 3645386649, 0, 100000.0, 2],
                        [-0.25, 0.25, "0-0.5", "1.467", "2.840", 0, 1, 56779572961, 1, 100000.0, 2],
                    ],
                    [],
                    ["3.320", "2.260", "3.510"],
                ],
            },
        ]
        pinnacle_hub._more_bet_cache[event_id] = (
            time.time(),
            {
                "ok": True,
                "event_id": event_id,
                "data": {
                    "odds": {
                        "e": [29, 2686, 0, raw_event, 123456789],
                        "e1": None,
                    },
                },
            },
        )

        result = await pinnacle_hub.lookup_more_bet_price(
            sport_label="Soccer",
            event_id=event_id,
            raw_selection="Ф2(0,25)",
            market="Handicap",
            outcome="H2 0.25",
        )

        self.assertIsNotNone(result)
        self.assertEqual(result["matched_by"], "more_bet_selection")
        self.assertEqual(result["line_id"], "56779572961")
        self.assertEqual(result["decimal_odds"], 2.84)
        self.assertEqual(result["actual_handicap"], 0.25)
        self.assertEqual(result["handicap"], 0.25)

    async def test_lookup_more_bet_price_rejects_mirror_handicap_without_price_match(self):
        event_id = "1631780"
        raw_event = [
            int(event_id),
            "Home FC",
            "Away FC",
            0,
            0,
            0,
            0,
            0,
            {
                "0": [
                    None,
                    None,
                    [[-1.5, 1.5, "1.5", "0.760", "1.120", 0, 1, 5678, 1, 100.0, 0]],
                    [],
                    ["1.500", "3.000", "2.300", 4567, 0, 100.0, 0],
                ],
            },
        ]
        pinnacle_hub._more_bet_cache[event_id] = (
            time.time(),
            {
                "ok": True,
                "event_id": event_id,
                "data": {
                    "odds": {
                        "e": [29, 100, 2, raw_event, 123456789],
                        "e1": None,
                    },
                },
            },
        )

        result = await pinnacle_hub.lookup_more_bet_price(
            sport_label="Soccer",
            event_id=event_id,
            raw_selection="Ф2(-1,5)",
            market="Handicap",
            outcome="Win2",
        )

        self.assertIsNone(result)

    async def test_lookup_more_bet_price_reversed_teams_keep_handicap_sign(self):
        event_id = "1631581358"
        raw_event = [
            int(event_id),
            "Philadelphia Phillies",
            "Chicago White Sox",
            0,
            0,
            0,
            0,
            0,
            {
                "0": [
                    None,
                    None,
                    [[-1.5, 1.5, "1.5", "1.220", "0.366", 0, 1, 56729527844, 0, 100.0, 0]],
                    [],
                    ["1.500", "3.000", "2.300", 4567, 0, 100.0, 0],
                ],
            },
        ]
        pinnacle_hub._more_bet_cache[event_id] = (
            time.time(),
            {
                "ok": True,
                "event_id": event_id,
                "data": {
                    "odds": {
                        "e": [29, 100, 2, raw_event, 123456789],
                        "e1": None,
                    },
                },
            },
        )

        result = await pinnacle_hub.lookup_more_bet_price(
            sport_label="Baseball",
            event_id=event_id,
            raw_selection="Ф2(-1,5)",
            market="Handicap",
            outcome="H2 -1.5",
            forted_home="Chicago White Sox",
            forted_away="Philadelphia Phillies",
        )

        self.assertIsNotNone(result)
        self.assertTrue(result["reversed"])
        self.assertEqual(result["team_select"], 0)
        self.assertEqual(result["actual_handicap"], -1.5)
        self.assertEqual(result["handicap"], -1.5)
        self.assertEqual(result["line_id"], "56729527844")

    async def test_lookup_more_bet_price_reversed_moneyline_uses_same_real_team(self):
        event_id = "1631586740"
        raw_event = [
            int(event_id),
            "Texas Rangers",
            "Cleveland Guardians",
            0,
            0,
            0,
            0,
            0,
            {
                "0": [
                    None,
                    None,
                    [],
                    [],
                    ["1.770", "2.230", None, 3633443607, 0, 100.0, 0],
                ],
            },
        ]
        pinnacle_hub._more_bet_cache[event_id] = (
            time.time(),
            {
                "ok": True,
                "event_id": event_id,
                "data": {
                    "odds": {
                        "e": [29, 100, 2, raw_event, 123456789],
                        "e1": None,
                    },
                },
            },
        )

        result = await pinnacle_hub.lookup_more_bet_price(
            sport_label="Baseball",
            event_id=event_id,
            raw_selection="П1",
            market="Moneyline",
            outcome="Win1",
            forted_home="Cleveland Guardians",
            forted_away="Texas Rangers",
        )

        self.assertIsNotNone(result)
        self.assertTrue(result["reversed"])
        self.assertEqual(result["bet_type"], 1)
        self.assertEqual(result["team_select"], 1)
        self.assertEqual(result["line_id"], "3633443607")

    async def test_lookup_more_bet_price_uses_team_total_block(self):
        event_id = "1631888"
        raw_event = [
            int(event_id),
            "Home FC",
            "Away FC",
            0,
            0,
            0,
            0,
            0,
            {
                "0": [
                    [
                        [["12.5", 12.5, "0.700", "1.160", 1111, 1, 100.0, 1]],
                        [["12.5", 12.5, "1.060", "0.800", 2222, 1, 100.0, 1]],
                        3333,
                    ],
                    None,
                    [],
                    [],
                    None,
                ],
            },
        ]
        pinnacle_hub._more_bet_cache[event_id] = (
            time.time(),
            {
                "ok": True,
                "event_id": event_id,
                "data": {
                    "odds": {
                        "e": [29, 100, 2, raw_event, 123456789],
                        "e1": None,
                    },
                },
            },
        )

        result = await pinnacle_hub.lookup_more_bet_price(
            sport_label="Soccer",
            event_id=event_id,
            raw_selection="ИТ2Б(12,5)",
            market="Totals",
            outcome="Win2",
        )

        self.assertIsNotNone(result)
        self.assertEqual(result["line_id"], "2222")
        self.assertEqual(result["is_alt"], 1)
        self.assertEqual(result["bet_type"], 5)
        self.assertEqual(result["team_select"], 7)

    async def test_lookup_more_bet_price_team_total_does_not_reverse_when_event_order_matches(self):
        event_id = "1631629420"
        raw_event = [
            int(event_id),
            "New York Knicks",
            "San Antonio Spurs",
            0,
            0,
            0,
            0,
            0,
            {
                "0": [
                    [
                        [],
                        [["108.5", 108.5, "1.060", "0.800", 56728003172, 1, 100.0, 1]],
                        56728003172,
                    ],
                    None,
                    [],
                    [],
                    None,
                ],
            },
        ]
        pinnacle_hub._more_bet_cache[event_id] = (
            time.time(),
            {
                "ok": True,
                "event_id": event_id,
                "data": {
                    "odds": {
                        "e": [29, 100, 2, raw_event, 123456789],
                        "e1": None,
                    },
                },
            },
        )

        result = await pinnacle_hub.lookup_more_bet_price(
            sport_label="Basketball",
            event_id=event_id,
            raw_selection="ИТ2Б(108,5)",
            market="Totals",
            outcome="Win2",
            forted_home="New York Knicks",
            forted_away="San Antonio Spurs",
        )

        self.assertIsNotNone(result)
        self.assertFalse(result["reversed"])
        self.assertEqual(result["bet_type"], 5)
        self.assertEqual(result["team_select"], 7)
        self.assertEqual(result["line_id"], "56728003172")


if __name__ == "__main__":
    unittest.main()
