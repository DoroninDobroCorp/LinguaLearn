from __future__ import annotations

import forted_feed_shim as shim


def test_snapshot_preserves_every_three_way_leg() -> None:
    fork = {
        "last_seen": 1_786_038_174.0,
        "sport": "Футбол - Товарищеские матчи",
        "profit": 1.243,
        "stakes": "Ф1(-0,25);X;2",
        "odds": [1.934, 4.2, 3.4],
        "match_key": "soccer|manchester united|paris saint-germain",
        "team1": "Манчестер Юнайтед",
        "team2": "ПСЖ",
        "sources": [
            {"bk": "pinnaclesports.com", "mobl": "/1633250545"},
            {"bk": "paddypower.com", "mobl": "https://pp.test/35910221"},
            {"bk": "paddypower.com", "mobl": "https://pp.test/35910221"},
        ],
    }

    item = shim._state_fork_to_snapshot_item(fork, 0)

    assert item is not None
    assert item["multi_leg_complete"] is True
    assert item["outcome_count"] == 3
    assert [leg["selection"] for leg in item["legs"]] == ["Ф1(-0,25)", "X", "2"]
    assert [leg["odds"] for leg in item["legs"]] == [1.934, 4.2, 3.4]
    assert [leg["bk"] for leg in item["legs"]] == [
        "pinnaclesports.com", "paddypower.com", "paddypower.com",
    ]


def test_snapshot_marks_incomplete_multileg_contract() -> None:
    fork = {
        "stakes": "Ф1(-0,25);X;2",
        "odds": [1.934, 4.2],
        "sources": [
            {"bk": "pinnaclesports.com"},
            {"bk": "paddypower.com"},
            {"bk": "paddypower.com"},
        ],
    }

    item = shim._state_fork_to_snapshot_item(fork, 0)

    assert item is not None
    assert item["multi_leg_complete"] is False
    assert item["outcome_count"] == 3
    assert item["odds_count"] == 2
