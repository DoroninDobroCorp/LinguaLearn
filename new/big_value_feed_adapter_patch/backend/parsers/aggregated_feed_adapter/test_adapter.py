import unittest
from datetime import datetime, timedelta, timezone

from adapter import (
    base_market_confirmation_epochs,
    confirmations_regress,
    has_unprovenanced_price,
    positive_prices,
    prepare_event,
)


NOW = datetime(2026, 8, 10, 2, 0, 0, tzinfo=timezone.utc)


def valid_event(**overrides):
    event = {
        "Pid": 123,
        "MatchId": "123",
        "LeagueName": "test league",
        "homeName": "home team",
        "awayName": "away team",
        "isLive": True,
        "Periods": [
            {
                "Win1x2": {
                    "Win1": {"value": 1.8, "raw": {"line_id": 1}},
                    "WinNone": {"value": 3.2, "raw": {"line_id": 2}},
                    "Win2": {"value": 4.4, "raw": {"line_id": 3}},
                },
                "_market_ts": {"Win1x2": 1786327195.0},
            }
        ],
        "Source": "Pinnacle",
        "SportName": "Soccer",
        "CreatedAt": "2026-08-10T01:59:55Z",
        "PriceConfirmedAt": "2026-08-10T01:59:55Z",
        "LastUpdated": "2026-08-10T01:59:58Z",
    }
    event.update(overrides)
    return event


def prepare(event, *, replay=True, stale=False):
    return prepare_event(
        event,
        replay=replay,
        stale=stale,
        now=NOW,
        max_live_confirmation_age_seconds=7,
        max_prematch_confirmation_age_seconds=90,
        max_future_skew_seconds=10,
    )


class PositivePricesTest(unittest.TestCase):
    def test_only_counts_canonical_value_leaves(self):
        self.assertEqual(
            positive_prices(
                {
                    "line_id": 999999,
                    "a": {"value": 2.1},
                    "b": {"value": 0},
                    "c": [{"value": "1.7"}],
                }
            ),
            2,
        )

    def test_detects_positive_unprovenanced_price_in_any_market(self):
        periods = [
            {
                "Win1x2": {
                    "Win1": {"value": 1.8, "raw": {"line_id": 1}},
                    "WinNone": {"value": 0.0},
                },
                "Specials": {
                    "anything": {"value": 5.0, "raw": {"line_id": 9}}
                },
            }
        ]
        self.assertFalse(has_unprovenanced_price(periods))
        periods[0]["Specials"]["anything"] = {"value": 5.0}
        self.assertTrue(has_unprovenanced_price(periods))
        periods[0]["Specials"]["anything"] = {
            "value": 5.0,
            "raw": {"line_id": 9},
        }
        periods[0]["Win1x2"]["WinNone"] = {"value": 3.2}
        self.assertTrue(has_unprovenanced_price(periods))

    def test_market_confirmation_requires_each_populated_group(self):
        periods = valid_event()["Periods"]
        timestamps, reason = base_market_confirmation_epochs(periods)
        self.assertIsNone(reason)
        self.assertEqual(timestamps, {(0, "Win1x2"): 1786327195.0})
        periods[0]["Totals"] = {
            "2.5": {"WinMore": {"value": 1.9, "raw": {"line_id": 4}}}
        }
        timestamps, reason = base_market_confirmation_epochs(periods)
        self.assertIsNone(timestamps)
        self.assertEqual(reason, "invalid_market_confirmation")

    def test_market_confirmation_regression_is_detected(self):
        previous = {(0, "Win1x2"): 100.0, (0, "Totals"): 200.0}
        self.assertFalse(
            confirmations_regress({(0, "Win1x2"): 101.0}, previous)
        )
        self.assertTrue(
            confirmations_regress({(0, "Totals"): 199.0}, previous)
        )

class PrepareEventTest(unittest.TestCase):
    def test_replay_keeps_real_price_confirmation_not_delivery_stamp(self):
        event, reason = prepare(valid_event(), replay=True)
        self.assertIsNone(reason)
        self.assertEqual(event["CreatedAt"], "2026-08-10T01:59:55.000Z")

    def test_stream_update_uses_browser_confirmation_not_broadcaster_stamp(self):
        event, reason = prepare(valid_event(), replay=False)
        self.assertIsNone(reason)
        self.assertEqual(event["CreatedAt"], "2026-08-10T01:59:55.000Z")

    def test_stream_update_rejects_old_confirmation(self):
        event, reason = prepare(
            valid_event(
                CreatedAt="2026-08-10T01:58:00Z",
                PriceConfirmedAt="2026-08-10T01:58:00Z",
                LastUpdated="2026-08-10T01:59:59Z",
            ),
            replay=False,
        )
        self.assertIsNone(event)
        self.assertEqual(reason, "confirmation_stale")

    def test_platform_degraded_envelope_uses_price_confirmations(self):
        event, reason = prepare(valid_event(), stale=True)
        self.assertIsNotNone(event)
        self.assertIsNone(reason)

    def test_replay_does_not_bypass_price_age(self):
        old = valid_event(
            PriceConfirmedAt="2026-08-10T01:58:00Z",
            Periods=[
                {
                    "Win1x2": {
                        "Win1": {"value": 1.8, "raw": {"line_id": 1}},
                    },
                    "_market_ts": {"Win1x2": 1786327080.0},
                }
            ],
        )
        event, reason = prepare(old, replay=True)
        self.assertIsNone(event)
        self.assertEqual(reason, "confirmation_stale")

    def test_oldest_market_confirmation_controls_event_freshness(self):
        event = valid_event(PriceConfirmedAt="2026-08-10T01:59:58Z")
        prepared, reason = prepare(event)
        self.assertIsNone(reason)
        self.assertEqual(prepared["CreatedAt"], "2026-08-10T01:59:55.000Z")

    def test_populated_base_market_without_timestamp_is_rejected(self):
        event = valid_event()
        event["Periods"][0].pop("_market_ts")
        prepared, reason = prepare(event)
        self.assertIsNone(prepared)
        self.assertEqual(reason, "missing_market_confirmation")

    def test_tombstone_is_not_forwarded(self):
        event, reason = prepare(valid_event(Removed=True))
        self.assertIsNone(event)
        self.assertEqual(reason, "tombstone")

    def test_incomplete_event_is_rejected(self):
        event, reason = prepare(valid_event(MatchId=None))
        self.assertIsNone(event)
        self.assertEqual(reason, "missing_match_id")

    def test_wrong_source_is_rejected(self):
        event, reason = prepare(valid_event(Source="Other"))
        self.assertIsNone(event)
        self.assertEqual(reason, "unexpected_data_source")

    def test_same_team_is_rejected(self):
        event, reason = prepare(valid_event(awayName=" HOME   TEAM "))
        self.assertIsNone(event)
        self.assertEqual(reason, "same_teams")

    def test_event_without_prices_is_rejected(self):
        event, reason = prepare(valid_event(Periods=[{"Win1x2": {}}]))
        self.assertIsNone(event)
        self.assertEqual(reason, "no_positive_prices")

    def test_cross_period_compat_injection_without_raw_is_rejected(self):
        contaminated = valid_event()
        contaminated["Periods"][0]["Win1x2"]["Win1"] = {
            "value": 1.8,
            "raw": {"line_id": 1, "period": 0},
        }
        contaminated["Periods"][0]["Win1x2"]["WinNone"] = {"value": 3.2}
        event, reason = prepare(contaminated)
        self.assertIsNone(event)
        self.assertEqual(reason, "unprovenanced_price")

    def test_unprovenanced_special_is_rejected(self):
        event = valid_event()
        event["Periods"][0]["CorrectScore"] = {
            "1:0": {"value": 8.5},
        }
        prepared, reason = prepare(event)
        self.assertIsNone(prepared)
        self.assertEqual(reason, "unprovenanced_price")


if __name__ == "__main__":
    unittest.main()
