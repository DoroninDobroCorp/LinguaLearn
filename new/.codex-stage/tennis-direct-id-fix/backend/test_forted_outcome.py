from __future__ import annotations

import unittest

import forted_outcome


class FortedOutcomeMappingTests(unittest.TestCase):
    def test_common_outcomes_have_one_canonical_ps3838_coordinate(self):
        cases = {
            "П1": "1",
            "П2": "2",
            "Х": "X",
            "Ф1(-1,5)": "H1 -1.5",
            "H2 +1.5": "H2 1.5",
            "ТБ(2,5)": "T> 2.5",
            "Under 2.5": "T< 2.5",
            "ИТ1Б(105,5)": "IT1> 105.5",
            "IT1> 105.5": "IT1> 105.5",
            "IT1< 105.5": "IT1< 105.5",
            "ИТ2Б(83)": "IT2> 83",
            "IT2> 83": "IT2> 83",
            "IT2< 85.5": "IT2< 85.5",
            "1X": "DC 1X",
            "Х2": "DC X2",
            "12": "DC 12",
            "К1 пройдёт": "TQ Home",
            "К2 пройдет": "TQ Away",
            "0:2": "CS 0:2",
            "1 (0:0)": "1",
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(forted_outcome.translate(raw), expected)

    def test_period_is_part_of_identity(self):
        self.assertEqual(forted_outcome.translate("1-й тайм ТБ(1,5)"), "P1 T> 1.5")
        self.assertEqual(forted_outcome.translate("2 set Ф2(+1,5)"), "P2 H2 1.5")
        self.assertEqual(forted_outcome.translate("П2", period=3), "P3 2")

    def test_unknown_or_incomplete_outcomes_never_guess(self):
        for raw in (
            "", "Game 8 Away", "Ф1", "ТБ", "ИТ1(8,5)", "IT2 10.5", "unknown",
            "П1 не проиграет", "П2 с форой", "П1 — следующий гол",
        ):
            with self.subTest(raw=raw):
                self.assertIsNone(forted_outcome.translate(raw))


if __name__ == "__main__":
    unittest.main()
