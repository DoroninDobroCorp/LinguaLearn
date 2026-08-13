import unittest

from market_mapper import SPORT_MAP, TARGET_SPORTS


class CurrentSportIdsTest(unittest.TestCase):
    def test_every_target_has_an_analyzer_mapping(self):
        self.assertFalse(set(TARGET_SPORTS) - set(SPORT_MAP))

    def test_current_browser_esports_ids_are_used(self):
        for sport_id in (
            "esports_dota_2",
            "esports_basketball",
            "esports_fifa",
            "esports_soccer_mythical",
        ):
            self.assertIn(sport_id, TARGET_SPORTS)

        for obsolete_id in (
            "esports_dota2",
            "esports_ebasketball",
            "esports_efootball",
            "esports_etennis",
            "esports_evolleyball",
            "esports_estreetball",
        ):
            self.assertNotIn(obsolete_id, TARGET_SPORTS)


if __name__ == "__main__":
    unittest.main()
