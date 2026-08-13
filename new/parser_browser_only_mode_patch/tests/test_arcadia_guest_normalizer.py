"""Tests for Story 27.9 — Arcadia → Pin888-shape normalizer."""

from __future__ import annotations

from aggregator.sources.arcadia_guest_normalizer import (
    _classify_market,
    _pips_to_decimal,
    normalize_matchup,
    normalize_snapshot,
)


# ---------------------------------------------------------------------------
# _pips_to_decimal — primary Arcadia format is American odds
# (Round 2 parity spike 2026-04-24 confirmed: +118, -152, etc.)
# ---------------------------------------------------------------------------


def test_american_positive_to_decimal() -> None:
    # +118 → 1 + 118/100 = 2.18
    assert _pips_to_decimal(118) == 2.18
    # +150 → 2.50
    assert _pips_to_decimal(150) == 2.5


def test_american_negative_to_decimal() -> None:
    # -152 → 1 + 100/152 ≈ 1.6579
    assert _pips_to_decimal(-152) == 1.6579
    # -103 → ≈ 1.9709
    assert _pips_to_decimal(-103) == 1.9709


def test_legacy_pips_format_still_supported() -> None:
    # Backwards compat for values ≥ 10000 (treat as pips/thousandths).
    assert _pips_to_decimal(19500) == 19.5
    assert _pips_to_decimal(34500) == 34.5


def test_pips_to_decimal_rejects_non_numeric() -> None:
    assert _pips_to_decimal(None) is None
    assert _pips_to_decimal("1950") is None
    assert _pips_to_decimal(True) is None  # bool is int in Python; reject


def test_pips_to_decimal_rejects_zero() -> None:
    assert _pips_to_decimal(0) is None


def test_pips_to_decimal_rejects_ambiguous_mid_range() -> None:
    # (-100, 100) is neither valid American odds nor legacy pips.
    assert _pips_to_decimal(50) is None
    assert _pips_to_decimal(-50) is None
    assert _pips_to_decimal(99) is None
    assert _pips_to_decimal(-99) is None


# ---------------------------------------------------------------------------
# _classify_market
# ---------------------------------------------------------------------------


def test_classify_moneyline() -> None:
    assert _classify_market("s;0;m") == (0, "MoneyLine")
    assert _classify_market("s;1;m") == (1, "MoneyLine")


def test_classify_handicap() -> None:
    assert _classify_market("s;0;s") == (0, "Handicap")


def test_classify_totals() -> None:
    assert _classify_market("s;0;t") == (0, "Totals")


def test_classify_unknown_shapes() -> None:
    assert _classify_market("") is None
    assert _classify_market(None) is None  # type: ignore[arg-type]
    assert _classify_market("m") is None  # too short
    assert _classify_market("s;x;m") is None  # period not int
    assert _classify_market("s;0;xyz") is None  # unknown type


# ---------------------------------------------------------------------------
# normalize_matchup / normalize_snapshot
# ---------------------------------------------------------------------------


def _mk_matchup(mid: int, home: str = "Home", away: str = "Away") -> dict:
    return {
        "id": mid,
        "status": "started",
        "participants": [
            {"id": mid * 10 + 1, "alignment": "home", "name": home},
            {"id": mid * 10 + 2, "alignment": "away", "name": away},
        ],
        "league": {"name": "Test League"},
    }


def _mk_market(mid: int, key: str, prices: list[dict]) -> dict:
    return {
        "matchupId": mid,
        "key": key,
        "prices": prices,
        "version": 123,
    }


def test_normalize_matchup_produces_pin888_shape() -> None:
    matchup = _mk_matchup(42)
    markets = [
        _mk_market(
            42,
            "s;0;m",
            [
                {"participantId": 421, "price": 190},
                {"participantId": 422, "price": 150},
            ],
        )
    ]
    game = normalize_matchup(matchup, markets)
    assert game is not None
    assert game["Pid"] == 42
    assert game["homeName"] == "Home"
    assert game["awayName"] == "Away"
    assert game["LeagueName"] == "Test League"
    assert game["isLive"] is True
    assert len(game["Periods"]) == 1
    period0 = game["Periods"][0]
    assert period0["Number"] == 0
    # MoneyLine maps Home → Win1 (+190 American → 2.9 decimal),
    # Away → Win2 (+150 → 2.5).
    assert period0["Win1x2"]["Win1"] == {"value": 2.9}
    assert period0["Win1x2"]["Win2"] == {"value": 2.5}


def test_normalize_handles_missing_matchup_id() -> None:
    assert normalize_matchup({}, []) is None
    assert normalize_matchup({"id": "not-int"}, []) is None


def test_normalize_skips_malformed_markets() -> None:
    game = normalize_matchup(
        _mk_matchup(1),
        [
            _mk_market(1, "s;0;m", [{"participantId": 11, "price": -120}]),
            "not a dict",  # type: ignore[list-item]
            {"matchupId": 1, "key": "s;0;xyz", "prices": []},  # unknown type
        ],
    )
    assert game is not None
    # Only one period0 bucket from the valid moneyline row.
    assert len(game["Periods"]) == 1


def test_normalize_handicap_carries_line() -> None:
    matchup = _mk_matchup(7)
    hdp_market = {
        "matchupId": 7,
        "key": "s;0;s",
        "attributes": {"handicap": -0.5},
        "prices": [
            {"participantId": 71, "price": -115},
            {"participantId": 72, "price": -110},
        ],
    }
    game = normalize_matchup(matchup, [hdp_market])
    assert game is not None
    period0 = game["Periods"][0]
    handicap = period0["Handicap"]
    assert isinstance(handicap, list) and len(handicap) == 1
    entry = handicap[0]
    assert entry["Hdp"] == -0.5
    # -115 → 1.8696; -110 → 1.9091
    assert entry["Win1"] == 1.8696
    assert entry["Win2"] == 1.9091


def test_normalize_totals_carries_points() -> None:
    matchup = _mk_matchup(9)
    totals_market = {
        "matchupId": 9,
        "key": "s;0;t",
        "params": {"points": 2.5},
        "prices": [
            {"participantId": 900, "price": -125},
            {"participantId": 901, "price": 145},
        ],
    }
    game = normalize_matchup(matchup, [totals_market])
    period0 = game["Periods"][0]  # type: ignore[index]
    totals = period0["Totals"]
    assert totals[0]["Points"] == 2.5
    # Unknown participant ids fall through with the raw id as side label.
    # -125 → 1.8 decimal.
    assert "900" in totals[0]
    assert totals[0]["900"] == 1.8


def test_normalize_snapshot_joins_streams() -> None:
    matchups = [_mk_matchup(1), _mk_matchup(2)]
    markets = [
        _mk_market(1, "s;0;m", [{"participantId": 11, "price": -120}]),
        _mk_market(2, "s;0;m", [{"participantId": 21, "price": 160}]),
        # Stray market with no matching matchup — silently dropped.
        _mk_market(999, "s;0;m", [{"participantId": 9991, "price": 1500}]),
    ]
    games = normalize_snapshot(matchups=matchups, markets=markets)
    assert {g["Pid"] for g in games} == {1, 2}


def test_normalize_snapshot_empty_inputs() -> None:
    assert normalize_snapshot(matchups=[], markets=[]) == []


def test_normalize_snapshot_malformed_entries_skipped() -> None:
    games = normalize_snapshot(
        matchups=[_mk_matchup(1), "bad", {"id": "not-int"}],  # type: ignore[list-item]
        markets=["bad-row", _mk_market(1, "s;0;m", [{"participantId": 11, "price": -120}])],  # type: ignore[list-item]
    )
    assert len(games) == 1
    assert games[0]["Pid"] == 1
