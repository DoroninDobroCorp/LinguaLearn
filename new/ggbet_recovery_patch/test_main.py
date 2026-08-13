import unittest

from main import EMPTY_FETCH_INTERVAL, _events_from_graphql_message, _health_state


class GraphQLMessageParsingTest(unittest.TestCase):
    def test_extracts_events_from_valid_payload(self):
        events, error = _events_from_graphql_message({
            "type": "data",
            "payload": {"data": {"matches": {"sportEvents": [{"id": "1"}]}}},
        })
        self.assertEqual(events, [{"id": "1"}])
        self.assertIsNone(error)


class HealthStateTest(unittest.TestCase):
    def test_upstream_empty_is_degraded_even_with_healthy_transport(self):
        ready, reason = _health_state({
            "connected": True,
            "events_tracked": 0,
            "last_feed_state": "upstream_empty",
        }, last_update_age=1)
        self.assertFalse(ready)
        self.assertEqual(reason, "upstream_empty")

    def test_fresh_usable_events_are_ready(self):
        ready, reason = _health_state({
            "connected": True,
            "events_tracked": 3,
            "last_feed_state": "events",
        }, last_update_age=1)
        self.assertTrue(ready)
        self.assertEqual(reason, "ok")

    def test_query_failure_is_not_reported_as_empty_catalog(self):
        ready, reason = _health_state({
            "connected": True,
            "events_tracked": 0,
            "last_feed_state": "query_failed",
        }, last_update_age=1)
        self.assertFalse(ready)
        self.assertEqual(reason, "query_failed")

    def test_scheduled_empty_poll_is_still_a_fresh_cycle(self):
        ready, reason = _health_state({
            "connected": True,
            "events_tracked": 0,
            "last_feed_state": "upstream_empty",
        }, last_update_age=EMPTY_FETCH_INTERVAL)
        self.assertFalse(ready)
        self.assertEqual(reason, "upstream_empty")

    def test_null_data_is_a_recoverable_query_error(self):
        events, error = _events_from_graphql_message({
            "type": "data",
            "payload": {"data": None, "errors": [{"message": "upstream unavailable"}]},
        })
        self.assertEqual(events, [])
        self.assertEqual(error, [{"message": "upstream unavailable"}])

    def test_null_matches_does_not_raise(self):
        events, error = _events_from_graphql_message({
            "type": "next",
            "payload": {"data": {"matches": None}},
        })
        self.assertEqual(events, [])
        self.assertIsNone(error)


if __name__ == "__main__":
    unittest.main()
