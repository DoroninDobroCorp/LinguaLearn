"""Unit tests for aggregator/sources/arcadia_morebets_helper.py (Story 27.16 DOD-5)."""
from __future__ import annotations

import json
import time
from unittest.mock import MagicMock, patch


from aggregator.sources.arcadia_morebets_helper import (
    ArcadiaMoreBetsHelper,
    _RpmBudget,
    arcadia_l3_helper_enabled,
)


# ── arcadia_l3_helper_enabled ─────────────────────────────────────────

def test_arcadia_l3_helper_enabled_default_off(monkeypatch):
    monkeypatch.delenv("MSP_ARCADIA_L3_HELPER_ENABLED", raising=False)
    assert arcadia_l3_helper_enabled() is False


def test_arcadia_l3_helper_enabled_on(monkeypatch):
    monkeypatch.setenv("MSP_ARCADIA_L3_HELPER_ENABLED", "1")
    assert arcadia_l3_helper_enabled() is True


def test_arcadia_l3_helper_enabled_true_string(monkeypatch):
    monkeypatch.setenv("MSP_ARCADIA_L3_HELPER_ENABLED", "true")
    assert arcadia_l3_helper_enabled() is True


def test_arcadia_l3_helper_enabled_True_string(monkeypatch):
    monkeypatch.setenv("MSP_ARCADIA_L3_HELPER_ENABLED", "True")
    assert arcadia_l3_helper_enabled() is True


def test_arcadia_l3_helper_enabled_yes_string(monkeypatch):
    monkeypatch.setenv("MSP_ARCADIA_L3_HELPER_ENABLED", "yes")
    assert arcadia_l3_helper_enabled() is True


# ── _RpmBudget ────────────────────────────────────────────────────────

def test_rpm_budget_allows_within_limit():
    b = _RpmBudget(rpm_limit=5)
    for _ in range(5):
        assert b.try_acquire() is True


def test_rpm_budget_blocks_over_limit():
    b = _RpmBudget(rpm_limit=3)
    for _ in range(3):
        b.try_acquire()
    assert b.try_acquire() is False


def test_rpm_budget_current_rpm():
    b = _RpmBudget(rpm_limit=10)
    b.try_acquire()
    b.try_acquire()
    assert b.current_rpm() == 2


# ── ArcadiaMoreBetsHelper.fetch_morebet ───────────────────────────────

def _make_helper(**kwargs: object) -> ArcadiaMoreBetsHelper:
    return ArcadiaMoreBetsHelper(
        base_url="http://arcadia.test",
        api_key="test-key",
        rpm_limit=kwargs.get("rpm_limit", 30),  # type: ignore[arg-type]
        cache_ttl_sec=kwargs.get("cache_ttl_sec", 30.0),  # type: ignore[arg-type]
    )


def _related_response(pid: int) -> bytes:
    return json.dumps([
        {"id": pid + 1, "type": "special", "home": "TeamA", "away": "TeamB"},
        {"id": pid + 2, "type": "special", "home": "TeamC", "away": "TeamD"},
    ]).encode()


@patch("urllib.request.urlopen")
def test_fetch_morebet_returns_dict_on_success(mock_open):
    pid = 5550001
    mock_resp = MagicMock()
    mock_resp.__enter__ = lambda s: s
    mock_resp.__exit__ = MagicMock(return_value=False)
    mock_resp.read.return_value = _related_response(pid)
    mock_open.return_value = mock_resp

    helper = _make_helper()
    result = helper.fetch_morebet(pid)

    assert result is not None
    assert result["pid"] == pid
    assert result["source"] == "arcadia_l3"
    assert isinstance(result["specials"], list)
    assert len(result["specials"]) == 2


@patch("urllib.request.urlopen")
def test_fetch_morebet_cache_hit(mock_open):
    pid = 5550002
    mock_resp = MagicMock()
    mock_resp.__enter__ = lambda s: s
    mock_resp.__exit__ = MagicMock(return_value=False)
    mock_resp.read.return_value = _related_response(pid)
    mock_open.return_value = mock_resp

    helper = _make_helper()
    first = helper.fetch_morebet(pid)
    second = helper.fetch_morebet(pid)

    # Second call should be a cache hit — urlopen called only once.
    assert mock_open.call_count == 1
    assert second is first
    assert helper.hits == 1
    assert helper.misses == 1


@patch("urllib.request.urlopen")
def test_fetch_morebet_cache_expires(mock_open):
    pid = 5550003
    mock_resp = MagicMock()
    mock_resp.__enter__ = lambda s: s
    mock_resp.__exit__ = MagicMock(return_value=False)
    mock_resp.read.return_value = _related_response(pid)
    mock_open.return_value = mock_resp

    helper = _make_helper(cache_ttl_sec=0.01)
    helper.fetch_morebet(pid)
    time.sleep(0.02)
    helper.fetch_morebet(pid)

    assert mock_open.call_count == 2
    assert helper.misses == 2


@patch("urllib.request.urlopen", side_effect=Exception("network error"))
def test_fetch_morebet_error_returns_none(mock_open):
    helper = _make_helper()
    result = helper.fetch_morebet(1234)
    assert result is None
    assert helper.errors == 1


def test_fetch_morebet_rate_limited_returns_none():
    helper = _make_helper(rpm_limit=2)
    # Fill budget.
    with patch("urllib.request.urlopen") as mock_open:
        mock_resp = MagicMock()
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_resp.read.return_value = _related_response(9001)
        mock_open.return_value = mock_resp
        helper.fetch_morebet(9001)
        helper.fetch_morebet(9002)  # fills budget (2 RPM)

    # Third call — budget exhausted, no cache → None.
    result = helper.fetch_morebet(9003)
    assert result is None
    assert helper.rate_limited == 1


# ── stats ─────────────────────────────────────────────────────────────

@patch("urllib.request.urlopen")
def test_stats_counters(mock_open):
    mock_resp = MagicMock()
    mock_resp.__enter__ = lambda s: s
    mock_resp.__exit__ = MagicMock(return_value=False)
    mock_resp.read.return_value = _related_response(1)
    mock_open.return_value = mock_resp

    helper = _make_helper()
    helper.fetch_morebet(1)
    helper.fetch_morebet(1)  # cache hit

    s = helper.stats()
    assert s["arcadia_l3_calls_total"] == 2
    assert s["arcadia_l3_misses"] == 1
    assert s["arcadia_l3_hits"] == 1
    assert s["arcadia_l3_errors"] == 0
    assert "arcadia_l3_cache_size" in s


def test_stats_keys_present_on_empty():
    helper = _make_helper()
    s = helper.stats()
    for key in ("arcadia_l3_calls_total", "arcadia_l3_hits", "arcadia_l3_misses",
                "arcadia_l3_rate_limited", "arcadia_l3_errors"):
        assert key in s


# ── parse_related ─────────────────────────────────────────────────────

def test_parse_related_empty_list_returns_none():
    helper = _make_helper()
    result = helper._parse_related(pid=999, raw=[])
    assert result is None


def test_parse_related_only_pid_itself_returns_none():
    helper = _make_helper()
    result = helper._parse_related(pid=5, raw=[{"id": 5, "type": "matchup"}])
    assert result is None


def test_parse_related_with_specials_returns_dict():
    helper = _make_helper()
    raw = [
        {"id": 5, "type": "matchup"},  # parent — excluded
        {"id": 6, "type": "special"},  # related — included
    ]
    result = helper._parse_related(pid=5, raw=raw)
    assert result is not None
    assert result["specials"] == [{"id": 6, "type": "special"}]


def test_parse_related_dict_with_matchups_key():
    """_parse_related handles dict response with 'matchups' key."""
    helper = _make_helper()
    raw = {"matchups": [
        {"id": 10, "type": "matchup"},      # parent — excluded
        {"id": 11, "type": "special"},      # related — included
    ]}
    result = helper._parse_related(pid=10, raw=raw)
    assert result is not None
    assert result["pid"] == 10
    assert len(result["specials"]) == 1
    assert result["specials"][0]["id"] == 11


def test_parse_related_dict_empty_matchups():
    """_parse_related returns None when matchups list is empty."""
    helper = _make_helper()
    raw = {"matchups": []}
    result = helper._parse_related(pid=5, raw=raw)
    assert result is None


def test_fetch_morebet_stale_cache_returned_on_rate_limit():
    """When rate-limit hit and cache has stale entry, stale value is returned."""
    from collections import deque
    helper = _make_helper()
    # Pre-populate cache with a stale entry (older than TTL but present).
    stale_data = {"pid": 42, "source": "arcadia_l3", "specials": []}
    helper._cache[42] = (0.0, stale_data)  # ts=0.0 → stale
    # Exhaust budget (use deque to match internal type)
    helper._budget._timestamps = deque([time.monotonic()] * helper._rpm_limit)

    result = helper.fetch_morebet(42)
    # Should return the stale cache value (not None) when rate-limited.
    assert result == stale_data
    assert helper.rate_limited == 1


def test_clear_cache_empties_all_entries():
    """clear_cache() removes all cached entries."""
    helper = _make_helper()
    helper._cache[1] = (time.monotonic(), {"pid": 1})
    helper._cache[2] = (time.monotonic(), {"pid": 2})
    assert len(helper._cache) == 2
    helper.clear_cache()
    assert len(helper._cache) == 0
