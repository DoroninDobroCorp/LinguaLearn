import unittest

from main import _events_from_graphql_message


class GraphQLMessageParsingTest(unittest.TestCase):
    def test_extracts_events_from_valid_payload(self):
        events, error = _events_from_graphql_message({
            "type": "data",
            "payload": {"data": {"matches": {"sportEvents": [{"id": "1"}]}}},
        })
        self.assertEqual(events, [{"id": "1"}])
        self.assertIsNone(error)

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
