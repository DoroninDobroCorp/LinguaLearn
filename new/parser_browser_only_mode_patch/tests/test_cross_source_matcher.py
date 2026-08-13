"""Phase 5: cross-source matcher tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from aggregator.cross_source_matcher import (
    AliasTable,
    CrossSourceMatcher,
    EventDescriptor,
    cross_source_match_enabled,
    normalize_text,
)


# ── env flag ───────────────────────────────────────────────────────


def test_cross_source_match_off_by_default(monkeypatch):
    monkeypatch.delenv("MSP_CROSS_SOURCE_MATCH_ENABLED", raising=False)
    assert cross_source_match_enabled() is False


def test_cross_source_match_env_opt_in(monkeypatch):
    monkeypatch.setenv("MSP_CROSS_SOURCE_MATCH_ENABLED", "1")
    assert cross_source_match_enabled() is True


# ── normalization ──────────────────────────────────────────────────


def test_normalize_text_strips_diacritics_and_case():
    assert normalize_text("Bayern München") == "bayern_munchen"
    assert normalize_text("FÉlix") == "felix"
    assert normalize_text("  AC  Milan  ") == "ac_milan"
    assert normalize_text("") == ""
    assert normalize_text(None) == ""


def test_normalize_text_collapses_punctuation():
    assert normalize_text("Real-Madrid C.F.") == "real_madrid_c_f"


# ── alias table ────────────────────────────────────────────────────


def test_alias_table_resolves_synonyms_to_canonical():
    a = AliasTable()
    a.add("Man Utd", "Manchester United FC", canonical="Manchester United")
    assert a.resolve("Man Utd") == "manchester_united"
    assert a.resolve("Manchester United FC") == "manchester_united"
    # Unknown spelling falls through to plain normalization.
    assert a.resolve("Liverpool") == "liverpool"


# ── positive matches ──────────────────────────────────────────────


def _ts(*args) -> datetime:
    return datetime(*args, tzinfo=timezone.utc)


def test_positive_match_same_event_different_sources():
    m = CrossSourceMatcher()
    a = EventDescriptor(
        sport="Soccer", league="EPL",
        home_team="Arsenal", away_team="Chelsea",
        start_time=_ts(2026, 4, 19, 15, 30),
    )
    b = EventDescriptor(
        sport="soccer", league="epl",
        home_team="ARSENAL", away_team="chelsea",
        start_time=_ts(2026, 4, 19, 15, 30),
    )
    assert m.match_key(a) == m.match_key(b)
    assert m.match(a, b) is True


def test_match_is_order_insensitive_in_teams():
    m = CrossSourceMatcher()
    a = EventDescriptor(
        sport="soccer", league="epl",
        home_team="Arsenal", away_team="Chelsea",
        start_time=_ts(2026, 4, 19, 15, 30),
    )
    b = EventDescriptor(
        sport="soccer", league="epl",
        home_team="Chelsea", away_team="Arsenal",
        start_time=_ts(2026, 4, 19, 15, 30),
    )
    assert m.match_key(a) == m.match_key(b)


def test_match_within_window_minutes():
    m = CrossSourceMatcher(window_minutes=5)
    a = EventDescriptor(
        sport="soccer", league="epl",
        home_team="Arsenal", away_team="Chelsea",
        start_time=_ts(2026, 4, 19, 15, 30),
    )
    b = EventDescriptor(
        sport="soccer", league="epl",
        home_team="Arsenal", away_team="Chelsea",
        start_time=_ts(2026, 4, 19, 15, 33),  # +3 min — within ±5
    )
    assert m.match(a, b) is True


# ── negative matches ──────────────────────────────────────────────


def test_negative_match_different_league():
    m = CrossSourceMatcher()
    a = EventDescriptor("soccer", "EPL", "Arsenal", "Chelsea", _ts(2026, 4, 19, 15, 30))
    b = EventDescriptor("soccer", "Bundesliga", "Arsenal", "Chelsea", _ts(2026, 4, 19, 15, 30))
    assert m.match(a, b) is False
    assert m.match_key(a) != m.match_key(b)


def test_negative_match_different_sport():
    m = CrossSourceMatcher()
    a = EventDescriptor("soccer", "EPL", "Arsenal", "Chelsea", _ts(2026, 4, 19, 15, 30))
    b = EventDescriptor("tennis", "EPL", "Arsenal", "Chelsea", _ts(2026, 4, 19, 15, 30))
    assert m.match(a, b) is False


def test_negative_match_outside_time_window():
    m = CrossSourceMatcher(window_minutes=5)
    a = EventDescriptor("soccer", "EPL", "Arsenal", "Chelsea", _ts(2026, 4, 19, 15, 30))
    b = EventDescriptor("soccer", "EPL", "Arsenal", "Chelsea", _ts(2026, 4, 19, 16, 30))
    assert m.match(a, b) is False
    assert m.stats.unmatched_outside_window >= 1


# ── missing field skips ────────────────────────────────────────────


def test_missing_league_returns_none_and_increments_skip_counter():
    m = CrossSourceMatcher()
    bad = EventDescriptor("soccer", "", "Arsenal", "Chelsea", _ts(2026, 4, 19, 15, 30))
    assert m.match_key(bad) is None
    assert m.stats.unmatched_missing_field >= 1


def test_missing_team_returns_none():
    m = CrossSourceMatcher()
    bad = EventDescriptor("soccer", "EPL", "", "Chelsea", _ts(2026, 4, 19, 15, 30))
    assert m.match_key(bad) is None


def test_missing_sport_returns_none():
    m = CrossSourceMatcher()
    bad = EventDescriptor("", "EPL", "Arsenal", "Chelsea", _ts(2026, 4, 19, 15, 30))
    assert m.match_key(bad) is None


def test_match_refuses_when_either_side_missing():
    m = CrossSourceMatcher()
    a = EventDescriptor("soccer", "EPL", "Arsenal", "Chelsea", _ts(2026, 4, 19, 15, 30))
    bad = EventDescriptor("soccer", "", "Arsenal", "Chelsea", _ts(2026, 4, 19, 15, 30))
    assert m.match(a, bad) is False


# ── alias-aware match ─────────────────────────────────────────────


def test_alias_table_lets_two_sources_match_same_event():
    table = AliasTable()
    table.add("Bayern Munich", canonical="Bayern München")
    m = CrossSourceMatcher(aliases=table)
    a = EventDescriptor(
        "soccer", "Bundesliga",
        "Bayern München", "BVB",
        _ts(2026, 4, 19, 15, 30),
    )
    b = EventDescriptor(
        "soccer", "Bundesliga",
        "Bayern Munich", "BVB",
        _ts(2026, 4, 19, 15, 30),
    )
    assert m.match(a, b) is True


# ── bucket grouping ──────────────────────────────────────────────


def test_group_buckets_descriptors_by_match_key():
    m = CrossSourceMatcher()
    a = EventDescriptor("soccer", "EPL", "Arsenal", "Chelsea", _ts(2026, 4, 19, 15, 30))
    b = EventDescriptor("soccer", "EPL", "Arsenal", "Chelsea", _ts(2026, 4, 19, 15, 30))
    c = EventDescriptor("soccer", "EPL", "Liverpool", "Spurs", _ts(2026, 4, 19, 15, 30))
    bad = EventDescriptor("soccer", "", "Foo", "Bar", _ts(2026, 4, 19, 15, 30))
    buckets = m.group([a, b, c, bad])
    assert len(buckets) == 2
    sizes = sorted(len(v) for v in buckets.values())
    assert sizes == [1, 2]


# ── naive datetime tolerated ──────────────────────────────────────


def test_naive_datetime_treated_as_utc():
    m = CrossSourceMatcher()
    naive = EventDescriptor(
        "soccer", "EPL", "Arsenal", "Chelsea",
        datetime(2026, 4, 19, 15, 30),
    )
    aware = EventDescriptor(
        "soccer", "EPL", "Arsenal", "Chelsea",
        datetime(2026, 4, 19, 15, 30, tzinfo=timezone.utc),
    )
    assert m.match_key(naive) == m.match_key(aware)


# ── adjacent-bucket + swapped teams regression ─────────────────────


def test_adjacent_bucket_swapped_teams_still_matches():
    """Regression: when home/away are swapped AND start times fall in
    adjacent time buckets, the fallback path must still match (it must
    sort teams like match_key does).
    """
    m = CrossSourceMatcher(window_minutes=5)
    # Place a at the end of one bucket and b at the start of the next,
    # so they land in adjacent buckets but are still within window_minutes.
    base = _ts(2026, 4, 19, 15, 29)  # near bucket boundary
    shifted = base + timedelta(minutes=4)  # +4 min — within 5 min window
    a = EventDescriptor(
        sport="soccer", league="EPL",
        home_team="Arsenal", away_team="Chelsea",
        start_time=base,
    )
    b = EventDescriptor(
        sport="soccer", league="EPL",
        home_team="Chelsea", away_team="Arsenal",  # swapped!
        start_time=shifted,
    )
    # Keys may differ (different bucket), but pairwise match must succeed.
    assert m.match(a, b) is True
    assert m.stats.matched >= 1
