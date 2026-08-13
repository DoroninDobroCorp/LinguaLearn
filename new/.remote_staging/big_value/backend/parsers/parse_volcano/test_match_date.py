import datetime
import unittest
from types import SimpleNamespace

from main import response_game_to_analyzer_format


def game(start_at: int):
    return SimpleNamespace(
        periods=[],
        sport_name="Soccer",
        league_name="Test League",
        match_id="test-1",
        home_name="Home",
        away_name="Away",
        is_live=False,
        start_at=start_at,
        country="Test",
        home_score=0,
        away_score=0,
    )


class MatchDateSerializationTest(unittest.TestCase):
    def test_emits_rfc3339_match_date_for_valid_start(self):
        timestamp = int(
            datetime.datetime(2026, 8, 9, 12, 30, tzinfo=datetime.timezone.utc).timestamp()
        )

        payload = response_game_to_analyzer_format(game(timestamp))

        self.assertEqual(payload["matchDate"], "2026-08-09T12:30:00Z")

    def test_omits_match_date_when_start_is_unknown(self):
        payload = response_game_to_analyzer_format(game(0))

        self.assertNotIn("matchDate", payload)


if __name__ == "__main__":
    unittest.main()
