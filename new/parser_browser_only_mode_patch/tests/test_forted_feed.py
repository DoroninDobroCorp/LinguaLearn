from __future__ import annotations
import json
import logging
import pathlib
import threading
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from aggregator.forted_feed import (FortedFeedPoller, extract_pin_pid, extract_pin_pid_raw, map_forks, RealForkFetcher)
from aggregator.forted_targeting import rank_top_n
from aggregator.morebets_targeting import FortedTopNTrigger

class _OkFetcher:
    def __init__(self, forks: list[dict[str, Any]]) -> None:
        self._forks = forks
    def fetch(self) -> list[dict[str, Any]]:
        return list(self._forks)
class _FailingFetcher:
    def fetch(self) -> list[dict[str, Any]]:
        raise RuntimeError("upstream down")
class _NonListFetcher:
    def __init__(self, value: Any) -> None:
        self._value = value
    def fetch(self) -> Any:
        return self._value
def _pin_fork(bk2_link: str, profit: float = 1.0, is_live: bool = False) -> dict[str, Any]:
    return {"bk2_link": bk2_link, "event_id": "999999999", "profit": profit, "is_live": is_live}
def test_extract_pin_pid_from_bk2_link() -> None:
    fork: dict[str, Any] = {"bk2_link": "https://www.pinnacle.com/en/soccer/t/123456789/", "event_id": "999"}
    assert extract_pin_pid(fork) == 123456789
def test_extract_pin_pid_fallback_event_id() -> None:
    fork: dict[str, Any] = {"event_id": "987654321", "bk2_link": ""}
    assert extract_pin_pid(fork) == 987654321
def test_extract_pin_pid_fallback_no_bk2_link_key() -> None:
    fork: dict[str, Any] = {"event_id": "100000001"}
    assert extract_pin_pid(fork) == 100000001
def test_extract_pin_pid_invalid_returns_none() -> None:
    fork: dict[str, Any] = {"event_id": "abc", "bk2_link": ""}
    assert extract_pin_pid(fork) is None
def test_extract_pin_pid_short_number_no_fallback_gives_none() -> None:
    fork: dict[str, Any] = {"event_id": "nope", "bk2_link": "https://example.com/123"}
    assert extract_pin_pid(fork) is None
def test_map_forks_pid_from_bk2_link_and_profit_is_live() -> None:
    raw = [{"bk2_link": "https://www.pinnacle.com/en/soccer/foo/1765432100/", "event_id": "0", "profit": 3.14, "is_live": True}]
    result = map_forks(raw)
    assert len(result) == 1 and result[0]["event_id"] == 1765432100
    assert result[0]["profit"] == pytest.approx(3.14) and result[0]["is_live"] is True
def test_map_forks_drops_invalid_pid() -> None:
    raw = [{"event_id": "abc", "bk2_link": "", "profit": 5.0, "is_live": False}, {"event_id": "123456789", "bk2_link": "", "profit": 2.0, "is_live": False}]
    result = map_forks(raw)
    assert len(result) == 1 and result[0]["event_id"] == 123456789
def test_map_forks_empty_feed() -> None:
    assert map_forks([]) == []
def test_poll_once_calls_set_forks_with_mapped() -> None:
    trigger = FortedTopNTrigger()
    raw = [{"bk2_link": "https://pin.com/1111111111", "event_id": "0", "profit": 2.0, "is_live": True}, {"bk2_link": "https://pin.com/2222222222", "event_id": "0", "profit": 1.0, "is_live": False}]
    FortedFeedPoller(trigger=trigger, fetcher=_OkFetcher(raw)).poll_once()
    forks = trigger.current_forks(0)
    assert len(forks) == 2
    pids = {f["event_id"] for f in forks}
    assert 1111111111 in pids and 2222222222 in pids
def test_poll_once_fetcher_raises_no_crash_and_previous_preserved() -> None:
    trigger = FortedTopNTrigger()
    good_raw = [{"event_id": "333333333", "bk2_link": "", "profit": 1.5, "is_live": False}]
    FortedFeedPoller(trigger=trigger, fetcher=_OkFetcher(good_raw)).poll_once()
    prev_forks = trigger.current_forks(0)
    assert len(prev_forks) == 1
    FortedFeedPoller(trigger=trigger, fetcher=_FailingFetcher()).poll_once()
    assert trigger.current_forks(0) == prev_forks
def test_poll_once_empty_feed_sets_empty_forks() -> None:
    trigger = FortedTopNTrigger([{"event_id": 9999999999, "profit": 5.0, "is_live": False}])
    FortedFeedPoller(trigger=trigger, fetcher=_OkFetcher([])).poll_once()
    assert trigger.current_forks(0) == []
def test_flag_off_no_poller_created() -> None:
    flag_enabled = False
    poller = None
    trigger = FortedTopNTrigger()
    if flag_enabled:
        poller = FortedFeedPoller(trigger=trigger, fetcher=_OkFetcher([]))
    assert poller is None
def test_rank_top_n_with_mapped_forks_by_profit() -> None:
    raw = [{"event_id": "100000100", "bk2_link": "", "profit": 1.0, "is_live": False}, {"event_id": "200000200", "bk2_link": "", "profit": 5.0, "is_live": True}, {"event_id": "300000300", "bk2_link": "", "profit": 2.0, "is_live": False}]
    mapped = map_forks(raw)
    top = rank_top_n(mapped, 2)
    assert top[0] == 200000200 and top[1] == 300000300 and 100000100 not in top
def test_run_forever_stops_on_stop_event() -> None:
    stop = threading.Event()
    call_count: list[int] = [0]
    class _CountFetcher:
        def fetch(self) -> list[dict[str, Any]]:
            call_count[0] += 1
            if call_count[0] >= 2:
                stop.set()
            return []
    trigger = FortedTopNTrigger()
    poller = FortedFeedPoller(trigger=trigger, fetcher=_CountFetcher(), interval_sec=0.01)
    t = threading.Thread(target=poller.run_forever, args=(stop,))
    t.start()
    t.join(timeout=3.0)
    assert not t.is_alive(), "run_forever did not stop after stop_event"
    assert call_count[0] >= 2
def test_map_forks_is_live_false_by_default() -> None:
    raw = [{"event_id": "123456789", "bk2_link": "", "profit": 0.5}]
    result = map_forks(raw)
    assert result[0]["is_live"] is False
def test_get_trigger_returns_forted_topn() -> None:
    from aggregator.morebets_targeting import MoreBetsTargeter
    targeter = MoreBetsTargeter.from_config()
    trigger = targeter.get_trigger("forted_topn")
    assert isinstance(trigger, FortedTopNTrigger)
def test_get_trigger_unknown_name_returns_none() -> None:
    from aggregator.morebets_targeting import MoreBetsTargeter
    targeter = MoreBetsTargeter.from_config()
    assert targeter.get_trigger("bogus_trigger") is None
def test_poll_once_multiple_forks_profit_preserved() -> None:
    raw = [{"event_id": "400000100", "bk2_link": "", "profit": 0.75, "is_live": True}, {"event_id": "400000200", "bk2_link": "", "profit": -0.5, "is_live": False}]
    trigger = FortedTopNTrigger()
    FortedFeedPoller(trigger=trigger, fetcher=_OkFetcher(raw)).poll_once()
    forks = {f["event_id"]: f for f in trigger.current_forks(0)}
    assert forks[400000100]["profit"] == pytest.approx(0.75)
    assert forks[400000100]["is_live"] is True
    assert forks[400000200]["profit"] == pytest.approx(-0.5)
    assert forks[400000200]["is_live"] is False
def test_extract_pin_pid_date_plus_pid_in_path_takes_pid() -> None:
    fork = _pin_fork("https://www.pinnacle.com/en/soccer/20260609/match/1631757397/")
    assert extract_pin_pid(fork) == 1631757397
def test_extract_pin_pid_ambiguous_multiple_pids_returns_none() -> None:
    fork = _pin_fork("https://pin.com/1631757397/9876543210/")
    assert extract_pin_pid(fork) is None
def test_extract_pin_pid_only_date_in_path_returns_none() -> None:
    fork = _pin_fork("https://www.pinnacle.com/en/soccer/20260609/slug/")
    assert extract_pin_pid(fork) is None
def test_extract_pin_pid_event_id_too_short_returns_none() -> None:
    fork: dict[str, Any] = {"event_id": "1234567", "bk2_link": ""}
    assert extract_pin_pid(fork) is None
def test_poll_once_nonlist_dict_does_not_wipe_forks() -> None:
    trigger = FortedTopNTrigger()
    FortedFeedPoller(trigger=trigger, fetcher=_OkFetcher([{"event_id": "555555555", "bk2_link": "", "profit": 1.0, "is_live": False}])).poll_once()
    prev = trigger.current_forks(0)
    assert len(prev) == 1
    FortedFeedPoller(trigger=trigger, fetcher=_NonListFetcher({"bad": "dict"})).poll_once()
    assert trigger.current_forks(0) == prev
def test_poll_once_nonlist_none_does_not_wipe_forks() -> None:
    trigger = FortedTopNTrigger()
    FortedFeedPoller(trigger=trigger, fetcher=_OkFetcher([{"event_id": "666666666", "bk2_link": "", "profit": 2.0, "is_live": True}])).poll_once()
    prev = trigger.current_forks(0)
    FortedFeedPoller(trigger=trigger, fetcher=_NonListFetcher(None)).poll_once()
    assert trigger.current_forks(0) == prev
def test_poll_once_nonlist_string_does_not_wipe_forks() -> None:
    trigger = FortedTopNTrigger()
    FortedFeedPoller(trigger=trigger, fetcher=_OkFetcher([{"event_id": "777777777", "bk2_link": "", "profit": 3.0, "is_live": False}])).poll_once()
    prev = trigger.current_forks(0)
    FortedFeedPoller(trigger=trigger, fetcher=_NonListFetcher("not a list")).poll_once()
    assert trigger.current_forks(0) == prev
def test_map_forks_is_live_string_false_values() -> None:
    for val in ("false", "0", "no", "prematch", ""):
        raw = [{"event_id": "123456789", "bk2_link": "", "profit": 1.0, "is_live": val}]
        result = map_forks(raw)
        assert result[0]["is_live"] is False
def test_map_forks_is_live_string_true_values() -> None:
    for val in ("1", "true", "live", "yes"):
        raw = [{"event_id": "123456789", "bk2_link": "", "profit": 1.0, "is_live": val}]
        result = map_forks(raw)
        assert result[0]["is_live"] is True
def test_poll_once_degraded_log_throttled_no_exc_info(caplog: pytest.LogCaptureFixture) -> None:
    trigger = FortedTopNTrigger()
    poller = FortedFeedPoller(trigger=trigger, fetcher=_FailingFetcher())
    with caplog.at_level(logging.WARNING, logger="aggregator.forted_feed"):
        for _ in range(5):
            poller.poll_once()
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) < 5
    assert all(r.exc_info is None for r in warnings)



def _raw_fork_pin_bk1(bk1_link: str, profit: float = 1.5, is_live: str = "0") -> dict:
    return {"bk1": "pinnaclesports.com", "bk1_link": bk1_link, "bk2": "betsson.com", "bk2_link": "https://betsson.com/x", "event_id": 99999, "profit": profit, "is_live": is_live}


def _raw_fork_pin_bk2(bk2_link: str, profit: float = 1.5, is_live: str = "0") -> dict:
    return {"bk1": "ladbrokes.com", "bk1_link": "https://ladbrokes.com/x", "bk2": "pinnaclesports.com", "bk2_link": bk2_link, "event_id": 99999, "profit": profit, "is_live": is_live}


def _raw_fork_no_pin(profit: float = 1.0) -> dict:
    return {"bk1": "ladbrokes.com", "bk1_link": "https://ladbrokes.com/abc", "bk2": "betsson.com", "bk2_link": "https://betsson.com/abc", "event_id": 1234567890, "profit": profit, "is_live": "0"}


def test_raw_extract_pin_pid_from_bk1_side() -> None:
    fork = _raw_fork_pin_bk1("/1631793359")
    assert extract_pin_pid_raw(fork) == 1631793359


def test_raw_extract_pin_pid_from_bk2_side() -> None:
    fork = _raw_fork_pin_bk2("/1631778085")
    assert extract_pin_pid_raw(fork) == 1631778085


def test_raw_extract_pin_pid_non_pinnacle_both_returns_none() -> None:
    fork = _raw_fork_no_pin()
    assert extract_pin_pid_raw(fork) is None


def test_raw_extract_pin_pid_no_event_id_fallback() -> None:
    fork = {"bk1": "betsson.com", "bk1_link": "https://betsson.com/abc",
            "bk2": "ladbrokes.com", "bk2_link": "https://ld.com/abc",
            "event_id": 1631793359, "profit": 1.0, "is_live": "0"}
    result = extract_pin_pid_raw(fork)
    assert result is None, "event_id must NOT be used as fallback in raw mode"


def test_raw_extract_pin_pid_ambiguous_link_returns_none() -> None:
    fork = _raw_fork_pin_bk1("/1631793359/9876543210")
    assert extract_pin_pid_raw(fork) is None


def test_raw_extract_pin_pid_invalid_link_returns_none() -> None:
    fork = _raw_fork_pin_bk1("/not-a-number")
    assert extract_pin_pid_raw(fork) is None


def test_raw_extract_pin_pid_empty_link_returns_none() -> None:
    fork = _raw_fork_pin_bk1("")
    assert extract_pin_pid_raw(fork) is None


def test_raw_map_forks_is_live_string_zero_false() -> None:
    fork = _raw_fork_pin_bk1("/1631793359", is_live="0")
    result = map_forks([fork], fmt="raw")
    assert len(result) == 1
    assert result[0]["is_live"] is False


def test_raw_map_forks_is_live_string_one_true() -> None:
    fork = _raw_fork_pin_bk1("/1631793359", is_live="1")
    result = map_forks([fork], fmt="raw")
    assert len(result) == 1
    assert result[0]["is_live"] is True


def test_raw_map_forks_skips_non_pinnacle_forks() -> None:
    forks = [_raw_fork_no_pin(), _raw_fork_no_pin(), _raw_fork_pin_bk1("/1631793359")]
    result = map_forks(forks, fmt="raw")
    assert len(result) == 1
    assert result[0]["event_id"] == 1631793359


def test_raw_format_flag_switches_behavior() -> None:
    fork = {"bk1": "pinnaclesports.com", "bk1_link": "/1631793359",
            "bk2": "betsson.com", "bk2_link": "",
            "event_id": 999888777, "profit": 2.0, "is_live": "0"}
    result_raw = map_forks([fork], fmt="raw")
    assert result_raw[0]["event_id"] == 1631793359
    result_san = map_forks([fork], fmt="sanitized")
    assert result_san[0]["event_id"] == 999888777


def test_sanitized_path_unchanged_with_bk2_link() -> None:
    fork = {"bk2_link": "https://www.pinnacle.com/en/soccer/foo/1765432100/",
            "event_id": "0", "profit": 3.14, "is_live": True}
    result = map_forks([fork], fmt="sanitized")
    assert len(result) == 1
    assert result[0]["event_id"] == 1765432100


def test_forted_feed_poller_uses_fmt_raw() -> None:
    from aggregator.morebets_targeting import FortedTopNTrigger
    trigger = FortedTopNTrigger()
    raw = [_raw_fork_pin_bk1("/1631807753", profit=2.5, is_live="1"),
           _raw_fork_no_pin()]
    FortedFeedPoller(trigger=trigger, fetcher=_OkFetcher(raw), fmt="raw").poll_once()
    forks = trigger.current_forks(0)
    assert len(forks) == 1
    assert forks[0]["event_id"] == 1631807753
    assert forks[0]["is_live"] is True


def test_real_fork_fetcher_sends_x_forted_key() -> None:
    fetcher = RealForkFetcher("http://example.com/forks", key="secret-key-123")
    mock_resp = MagicMock()
    mock_resp.json.return_value = []
    with patch("requests.get", return_value=mock_resp) as mock_get:
        fetcher.fetch()
    call_kwargs = mock_get.call_args[1]
    assert call_kwargs["headers"]["X-Forted-Key"] == "secret-key-123"


def test_real_fork_fetcher_no_key_no_header() -> None:
    fetcher = RealForkFetcher("http://example.com/forks")
    mock_resp = MagicMock()
    mock_resp.json.return_value = []
    with patch("requests.get", return_value=mock_resp) as mock_get:
        fetcher.fetch()
    call_kwargs = mock_get.call_args[1]
    assert "X-Forted-Key" not in call_kwargs.get("headers", {})


def test_raw_fixture_zero_false_targets_and_valid_pin_pids() -> None:
    data = json.loads(pathlib.Path("tests/fixtures/forted_raw_sample.json").read_text())
    assert len(data) == 200, f"Expected 200 forks, got {len(data)}"

    result = map_forks(data, fmt="raw")

    assert len(result) >= 28, f"Expected >=28 valid pid forks, got {len(result)}"

    pinnacle_links: set[int] = set()
    for fork in data:
        if fork.get("bk1") == "pinnaclesports.com":
            link = fork.get("bk1_link", "").strip("/ ")
            if link.isdigit() and len(link) >= 9:
                pinnacle_links.add(int(link))
        if fork.get("bk2") == "pinnaclesports.com":
            link = fork.get("bk2_link", "").strip("/ ")
            if link.isdigit() and len(link) >= 9:
                pinnacle_links.add(int(link))

    result_pids = {r["event_id"] for r in result}
    false_targets = result_pids - pinnacle_links
    assert len(false_targets) == 0, f"False targets (non-pinnacle pids in output): {false_targets}"
    lost = pinnacle_links - result_pids
    assert not lost, f"Lost legitimate pinnacle pids: {lost}"
    assert result_pids == pinnacle_links


