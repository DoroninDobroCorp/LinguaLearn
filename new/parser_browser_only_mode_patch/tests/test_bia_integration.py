"""Tests for BIA integration pipeline (observer + matcher + adapter → state).

Tests the end-to-end flow of BIA offers being applied to state.events_data
when integration mode is active, and NOT applied when in observer-only mode.
"""

from __future__ import annotations

import asyncio
import importlib
import time
from unittest.mock import patch

import pytest

import config as _cfg
from services.bia_client import BiaOffersEventMsg, BiaOffersHcapMsg
from services.bia_observer import (
    BiaObserverStats,
    _bia_integration_active,
    _apply_offers_hcap,
    bia_observer_snapshot,
)
from state import state


# ── _bia_integration_active ─────────────────────────────────────────────────

class TestBiaIntegrationActive:
    def test_disabled_when_bia_off(self, monkeypatch):
        monkeypatch.setattr(_cfg, "BIA_ENABLED", False)
        monkeypatch.setattr(_cfg, "PS3838_SEND_MODE", "all")
        assert _bia_integration_active() is False

    def test_disabled_when_base_only(self, monkeypatch):
        monkeypatch.setattr(_cfg, "BIA_ENABLED", True)
        monkeypatch.setattr(_cfg, "PS3838_SEND_MODE", "base_only")
        assert _bia_integration_active() is False

    def test_active_when_bia_on_and_send_all(self, monkeypatch):
        monkeypatch.setattr(_cfg, "BIA_ENABLED", True)
        monkeypatch.setattr(_cfg, "PS3838_SEND_MODE", "all")
        assert _bia_integration_active() is True

    def test_active_when_bia_on_and_more_bets_only(self, monkeypatch):
        monkeypatch.setattr(_cfg, "BIA_ENABLED", True)
        monkeypatch.setattr(_cfg, "PS3838_SEND_MODE", "more_bets_only")
        assert _bia_integration_active() is True

    def test_active_when_bia_on_and_send_mode_changes(self, monkeypatch):
        monkeypatch.setattr(_cfg, "BIA_ENABLED", True)
        monkeypatch.setattr(_cfg, "PS3838_SEND_MODE", "all")
        assert _bia_integration_active() is True

    def test_active_when_bia_on_and_more_bets_only_mode(self, monkeypatch):
        monkeypatch.setattr(_cfg, "BIA_ENABLED", True)
        monkeypatch.setattr(_cfg, "PS3838_SEND_MODE", "more_bets_only")
        assert _bia_integration_active() is True


# ── _apply_offers_hcap ──────────────────────────────────────────────────────

class TestApplyOffersHcap:
    @pytest.fixture(autouse=True)
    def setup_state(self, monkeypatch):
        """Set up a minimal events_data with one event."""
        monkeypatch.setattr(_cfg, "BIA_EXPERIMENTAL_REFRESH_WHOLE_EVENT_SPECIALS", False)
        monkeypatch.setattr(_cfg, "BIA_EXPERIMENTAL_REFRESH_WHOLE_SPORT_SPECIALS", False)
        state.events_data = {
            1001: {
                "Pid": 1001,
                "SportName": "Soccer",
                "homeName": "Arsenal",
                "awayName": "Chelsea",
                "isLive": True,
                "Periods": [{"Number": 0}],
                "CreatedAt": "2025-01-01T00:00:00Z",
                "Raw": {"sport_id": 29},
            },
            1002: {
                "Pid": 1002,
                "SportName": "Soccer",
                "homeName": "Liverpool",
                "awayName": "Chelsea",
                "isLive": False,
                "Periods": [{
                    "Number": 0,
                    "BTTS": {
                        "Yes": {"value": 1.77},
                        "No": {"value": 2.05},
                    },
                    "_BTTS_ts": 10.0,
                    "_market_ts": {"BTTS": 10.0},
                }],
                "CreatedAt": "2025-01-01T00:00:00Z",
                "Raw": {"sport_id": 29},
            },
            2001: {
                "Pid": 2001,
                "SportName": "Tennis",
                "homeName": "Player A",
                "awayName": "Player B",
                "isLive": False,
                "Periods": [{
                    "Number": 0,
                    "OddEven": {
                        "Odd": {"value": 1.9},
                        "Even": {"value": 1.9},
                    },
                    "_OddEven_ts": 11.0,
                    "_market_ts": {"OddEven": 11.0},
                }],
                "CreatedAt": "2025-01-01T00:00:00Z",
                "Raw": {"sport_id": 33},
            },
        }
        state.bia_specials_signature = {}
        yield
        state.events_data = {}
        state.bia_specials_signature = {}

    def test_apply_valid_offer(self):
        """A valid offers_hcap with matching event and specials should be applied."""
        stats = BiaObserverStats()
        stats._event_registry[("comp1", "fb", "evt1")] = {
            "home": "Arsenal",
            "away": "Chelsea",
            "sport": "fb",
            "event_key": "evt1",
            "competition_id": "comp1",
        }
        msg = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "fb", "evt1"], {}],
            event_header=["comp1", "fb", "evt1"],
            markets={
                "score,both": [None, [["y", 1.85], ["n", 2.0]]],
                "dc": [None, [["hd", 1.4], ["ha", 1.35], ["da", 2.5]]],
            },
        )
        asyncio.run(_apply_offers_hcap(msg, stats))

        assert stats.offers_applied == 1
        assert 1001 in stats.matched_pids
        ev = state.events_data[1001]
        assert "PriceConfirmedAt" in ev
        p0 = ev["Periods"][0]
        assert "BTTS" in p0
        assert p0["BTTS"]["Yes"]["value"] == 1.85
        assert "DoubleChance" in p0
        # CreatedAt should NOT be overwritten
        assert ev["CreatedAt"] == "2025-01-01T00:00:00Z"

    def test_apply_valid_offer_prioritizes_watch_event_queue(self, monkeypatch):
        from services.bia_observer import _WATCH_EVENT_BATCH_SIZE, _WATCH_EVENT_PREFETCH_COUNT
        cap = max(_WATCH_EVENT_BATCH_SIZE, _WATCH_EVENT_PREFETCH_COUNT)
        stats = BiaObserverStats()
        stats._event_registry[("comp1", "fb", "evt1")] = {
            "home": "Liverpool",
            "away": "Chelsea",
            "sport": "fb",
            "event_key": "evt1",
            "competition_id": "comp1",
        }
        for idx in range(cap):
            triple = [idx, "fb", f"evt-{idx}"]
            stats._watch_event_pending.append(triple)
            stats._watch_event_pending_keys.add((idx, "fb", f"evt-{idx}"))
        msg = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "fb", "evt1"], {}],
            event_header=["comp1", "fb", "evt1"],
            markets={
                "score,both": [None, [["y", 1.85], ["n", 2.0]]],
            },
        )

        monkeypatch.setattr(_cfg, "BIA_EXPERIMENTAL_OBSERVER_WATCH_EVENT", True)
        asyncio.run(_apply_offers_hcap(msg, stats))

        assert stats._watch_event_pending[0] == ["comp1", "fb", "evt1"]
        assert ("comp1", "fb", "evt1") in stats._watch_event_pending_keys
        assert len(stats._watch_event_pending) == cap

    def test_apply_live_offer_does_not_prioritize_watch_event_queue(self, monkeypatch):
        stats = BiaObserverStats()
        stats._event_registry[("comp1", "fb", "evt1")] = {
            "home": "Arsenal",
            "away": "Chelsea",
            "sport": "fb",
            "event_key": "evt1",
            "competition_id": "comp1",
        }
        msg = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "fb", "evt1"], {}],
            event_header=["comp1", "fb", "evt1"],
            markets={
                "score,both": [None, [["y", 1.85], ["n", 2.0]]],
            },
        )

        monkeypatch.setattr(_cfg, "BIA_EXPERIMENTAL_OBSERVER_WATCH_EVENT", True)
        asyncio.run(_apply_offers_hcap(msg, stats))

        assert stats._watch_event_pending == []
        assert stats._watch_event_pending_keys == set()

    def test_rich_offers_event_snapshot_survives_followup_narrow_hcap_delta(self):
        """Browser flow sends rich offers_event snapshot, then narrower offers_hcap delta."""
        stats = BiaObserverStats()
        stats._event_registry[("comp1", "fb", "evt1")] = {
            "home": "Arsenal",
            "away": "Chelsea",
            "sport": "fb",
            "event_key": "evt1",
            "competition_id": "comp1",
        }
        rich_snapshot = BiaOffersEventMsg(
            raw=["offers_event", ["comp1", "fb", "evt1"], {}],
            event_header=["comp1", "fb", "evt1"],
            markets={
                "cs": [
                    [[0, 0], [["", 35.37]]],
                    [[1, 0], [["", 15.73]]],
                    [[2, 1], [["", 9.838]]],
                ],
                "dc": [None, [["a,d", 2.689], ["h,a", 1.235], ["h,d", 1.196]]],
                "exact_total": [
                    [2, [["", 5.39]]],
                    [3, [["", 4.49]]],
                    [4, [["", 4.8]]],
                ],
                "gr": [
                    [[2, 3], [["", 2.52]]],
                    [[4, 6], [["", 2.29]]],
                ],
                "proposition,Team Props,Either Team To Score?": [
                    None,
                    [["No", 26.19], ["Yes", 1.022]],
                ],
                "proposition,Team Props,First Team To Score": [
                    None,
                    [["Chelsea", 3.03], ["Arsenal", 1.483], ["Neither", 26.13]],
                ],
                "proposition,Team Props,Both Teams To Score/Total Goals": [
                    None,
                    [["No & Over 2.5", 6.77], ["No & Under 2.5", 4.359], ["Yes & Over 2.5", 1.694], ["Yes & Under 2.5", 11.53]],
                ],
                "proposition,Team Props,Odd/Even / Total Goals": [
                    None,
                    [["Even & Over 2.5", 3.16], ["Even & Under 2.5", 4.64], ["Odd & Over 2.5", 2.429], ["Odd & Under 2.5", 9.53]],
                ],
                "proposition,Team Props,3-Way Handicap Arsenal +1": [
                    None,
                    [["Chelsea (-1)", 12.88], ["Arsenal (+1)", 1.181], ["Draw - (Arsenal +1)", 8.48]],
                ],
                "wm": [
                    [1, [["h", 4.39], ["a", 8.629]]],
                    [2, [["h", 4.859], ["a", 18.04]]],
                ],
            },
        )
        narrow_delta = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "fb", "evt1"], {}],
            event_header=["comp1", "fb", "evt1"],
            markets={
                "cs": [[2, 1], [["", 9.838]]],
                "exact_total": [3, [["", 4.49]]],
                "gr": [[4, 6], [["", 2.29]]],
                "wm": [1, [["h", 4.39], ["a", 8.629]]],
            },
        )

        asyncio.run(_apply_offers_hcap(rich_snapshot, stats))
        asyncio.run(_apply_offers_hcap(narrow_delta, stats))

        assert stats.offers_applied == 2
        p0 = state.events_data[1001]["Periods"][0]
        assert p0["CorrectScore"]["0:0"]["value"] == 35.37
        assert p0["CorrectScore"]["1:0"]["value"] == 15.73
        assert p0["CorrectScore"]["2:1"]["value"] == 9.838
        assert p0["DoubleChance"]["W1X"]["value"] == 1.196
        assert p0["DoubleChance"]["W12"]["value"] == 1.235
        assert p0["DoubleChance"]["WX2"]["value"] == 2.689
        assert p0["EitherTeamToScore"]["Yes"]["value"] == 1.022
        assert p0["FirstTeamToScore"]["Home"]["value"] == 1.483
        assert p0["FirstTeamToScore"]["Away"]["value"] == 3.03
        assert p0["BTTSTotalCombo"]["Yes & Under 2.5"]["value"] == 11.53
        assert p0["OddEvenTotalCombo"]["Odd & Under 2.5"]["value"] == 9.53
        assert p0["ThreeWayHandicap"]["+1"]["Draw"]["value"] == 8.48
        assert set(p0["ExactTotalGoals"]) >= {"2", "3", "4"}
        assert set(p0["TotalGoalsRange"]) >= {"2-3", "4-6"}
        assert set(p0["WinningMargin"]) >= {
            "Home By 1",
            "Away By 1",
            "Home By 2",
            "Away By 2",
        }

    def test_skip_no_event_registry(self):
        """Offer for unknown event_key → skipped."""
        stats = BiaObserverStats()
        msg = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "fb", "unknown_evt"], {}],
            event_header=["comp1", "fb", "unknown_evt"],
            markets={"wdw": [None, [["h", 2.5], ["d", 3.2], ["a", 2.8]]]},
        )
        asyncio.run(_apply_offers_hcap(msg, stats))
        assert stats.offers_skipped_no_match == 1
        assert stats.offers_applied == 0

    def test_skip_no_matching_pid(self):
        """Offer with event metadata but no matching Pid → skipped."""
        stats = BiaObserverStats()
        stats._event_registry[("comp1", "fb", "evt2")] = {
            "home": "Barcelona",
            "away": "Real Madrid",
            "sport": "fb",
            "event_key": "evt2",
            "competition_id": "comp1",
        }
        msg = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "fb", "evt2"], {}],
            event_header=["comp1", "fb", "evt2"],
            markets={"wdw": [None, [["h", 2.5], ["d", 3.2], ["a", 2.8]]]},
        )
        asyncio.run(_apply_offers_hcap(msg, stats))
        assert stats.offers_skipped_no_match == 1

    def test_skip_suspended_markets(self):
        """Offer where all markets are suspended → skipped."""
        stats = BiaObserverStats()
        stats._event_registry[("comp1", "fb", "evt1")] = {
            "home": "Arsenal",
            "away": "Chelsea",
            "sport": "fb",
            "event_key": "evt1",
            "competition_id": "comp1",
        }
        msg = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "fb", "evt1"], {}],
            event_header=["comp1", "fb", "evt1"],
            markets={
                "wdw": [None, [["h", 1.01], ["d", 1.01], ["a", 1.01]]],
            },
        )
        asyncio.run(_apply_offers_hcap(msg, stats))
        assert stats.offers_skipped_suspended == 1

    def test_does_not_create_new_event(self):
        """BIA should never create events that don't exist in events_data."""
        state.events_data = {}  # empty
        stats = BiaObserverStats()
        stats._event_registry[("comp1", "fb", "evt1")] = {
            "home": "Arsenal",
            "away": "Chelsea",
            "sport": "fb",
            "event_key": "evt1",
            "competition_id": "comp1",
        }
        msg = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "fb", "evt1"], {}],
            event_header=["comp1", "fb", "evt1"],
            markets={"wdw": [None, [["h", 2.5], ["d", 3.2], ["a", 2.8]]]},
        )
        asyncio.run(_apply_offers_hcap(msg, stats))
        assert len(state.events_data) == 0

    def test_preserves_raw_and_created_at(self):
        """BIA updates must not clobber CreatedAt or Raw."""
        stats = BiaObserverStats()
        stats._event_registry[("comp1", "fb", "evt1")] = {
            "home": "Arsenal",
            "away": "Chelsea",
            "sport": "fb",
            "event_key": "evt1",
            "competition_id": "comp1",
        }
        msg = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "fb", "evt1"], {}],
            event_header=["comp1", "fb", "evt1"],
            markets={"score,both": [None, [["y", 1.85], ["n", 2.0]]]},
        )
        asyncio.run(_apply_offers_hcap(msg, stats))
        ev = state.events_data[1001]
        assert ev["CreatedAt"] == "2025-01-01T00:00:00Z"
        assert ev["Raw"] == {"sport_id": 29}

    def test_stamps_market_freshness(self):
        """Applied specials markets get per-market freshness timestamps."""
        stats = BiaObserverStats()
        stats._event_registry[("comp1", "fb", "evt1")] = {
            "home": "Arsenal",
            "away": "Chelsea",
            "sport": "fb",
            "event_key": "evt1",
            "competition_id": "comp1",
        }
        msg = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "fb", "evt1"], {}],
            event_header=["comp1", "fb", "evt1"],
            markets={
                "wdw": [None, [["h", 2.5], ["d", 3.2], ["a", 2.8]]],
                "score,both": [None, [["y", 1.85], ["n", 2.0]]],
            },
        )
        before = time.time()
        asyncio.run(_apply_offers_hcap(msg, stats))
        after = time.time()

        p0 = state.events_data[1001]["Periods"][0]
        # Win1x2 is a base market → filtered out, no timestamp
        assert "_Win1x2_ts" not in p0
        # BTTS is a special → applied and stamped
        assert "_BTTS_ts" in p0
        assert before <= p0["_BTTS_ts"] <= after
        assert "PriceConfirmedAt" in state.events_data[1001]

    def test_unchanged_bia_snapshot_does_not_overwrite_pin_refresh(self):
        """Repeated identical BIA snapshot must not overwrite a fresher PIN value."""
        stats = BiaObserverStats()
        stats._event_registry[("comp1", "fb", "evt1")] = {
            "home": "Arsenal",
            "away": "Chelsea",
            "sport": "fb",
            "event_key": "evt1",
            "competition_id": "comp1",
        }
        msg = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "fb", "evt1"], {}],
            event_header=["comp1", "fb", "evt1"],
            markets={
                "score,both": [None, [["y", 1.85], ["n", 2.0]]],
            },
        )
        asyncio.run(_apply_offers_hcap(msg, stats))

        first_signature = state.bia_specials_signature[1001][0]
        first_confirmed_at = state.events_data[1001]["PriceConfirmedAt"]
        first_btts_ts = state.events_data[1001]["Periods"][0]["_BTTS_ts"]
        state.events_data[1001]["Periods"][0]["BTTS"]["Yes"]["value"] = 1.91
        state.events_data[1001]["Periods"][0]["BTTS"]["No"]["value"] = 1.96
        time.sleep(0.01)

        asyncio.run(_apply_offers_hcap(msg, stats))

        assert stats.offers_applied == 1
        assert stats.offers_skipped_unchanged == 1
        assert state.events_data[1001]["Periods"][0]["BTTS"]["Yes"]["value"] == 1.91
        assert state.events_data[1001]["Periods"][0]["BTTS"]["No"]["value"] == 1.96
        assert state.bia_specials_signature[1001][0] == first_signature
        assert state.events_data[1001]["PriceConfirmedAt"] != first_confirmed_at
        assert state.events_data[1001]["Periods"][0]["_BTTS_ts"] > first_btts_ts

    def test_changed_bia_snapshot_can_overwrite_after_pin_refresh(self):
        """A new BIA delta may overwrite the stored PIN-refreshed value again."""
        stats = BiaObserverStats()
        stats._event_registry[("comp1", "fb", "evt1")] = {
            "home": "Arsenal",
            "away": "Chelsea",
            "sport": "fb",
            "event_key": "evt1",
            "competition_id": "comp1",
        }
        msg1 = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "fb", "evt1"], {}],
            event_header=["comp1", "fb", "evt1"],
            markets={
                "score,both": [None, [["y", 1.85], ["n", 2.0]]],
            },
        )
        msg2 = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "fb", "evt1"], {}],
            event_header=["comp1", "fb", "evt1"],
            markets={
                "score,both": [None, [["y", 1.88], ["n", 1.98]]],
            },
        )
        asyncio.run(_apply_offers_hcap(msg1, stats))
        state.events_data[1001]["Periods"][0]["BTTS"]["Yes"]["value"] = 1.91
        state.events_data[1001]["Periods"][0]["BTTS"]["No"]["value"] = 1.96

        asyncio.run(_apply_offers_hcap(msg2, stats))

        assert stats.offers_applied == 2
        assert stats.offers_skipped_unchanged == 0
        assert state.events_data[1001]["Periods"][0]["BTTS"]["Yes"]["value"] == 1.88
        assert state.events_data[1001]["Periods"][0]["BTTS"]["No"]["value"] == 1.98

    def test_base_only_offer_does_not_mutate_state(self):
        """An offer with only base markets (wdw/ah/ahou) must NOT overwrite
        existing Pinnacle base prices in state."""
        state.events_data[1001]["Periods"][0]["Win1x2"] = {
            "Win1": {"value": 2.0}, "Draw": {"value": 3.0}, "Win2": {"value": 3.5},
        }
        state.events_data[1001]["Periods"][0]["Handicap"] = {
            "0.5": {"Win1": {"value": 1.90}, "Win2": {"value": 1.95}},
        }
        stats = BiaObserverStats()
        stats._event_registry[("comp1", "fb", "evt1")] = {
            "home": "Arsenal", "away": "Chelsea",
            "sport": "fb", "event_key": "evt1", "competition_id": "comp1",
        }
        msg = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "fb", "evt1"], {}],
            event_header=["comp1", "fb", "evt1"],
            markets={
                "wdw": [None, [["h", 2.5], ["d", 3.2], ["a", 2.8]]],
                "ah": [None, [[-0.5, 1.85, 2.0]]],
                "ahou": [None, [[2.5, 1.9, 1.95]]],
            },
        )
        asyncio.run(_apply_offers_hcap(msg, stats))

        # Offer had only base markets → nothing applied
        assert stats.offers_applied == 0
        assert stats.offers_skipped_base_only == 1
        # Existing base prices must be untouched
        p0 = state.events_data[1001]["Periods"][0]
        assert p0["Win1x2"]["Win1"]["value"] == 2.0  # unchanged
        assert p0["Handicap"]["0.5"]["Win1"]["value"] == 1.90  # unchanged

    def test_partial_bia_refresh_does_not_refresh_absent_neighbor_special(self):
        """If BIA re-confirms only BTTS, absent ToQualify must not get a fresh ts."""
        stats = BiaObserverStats()
        stats._event_registry[("comp1", "fb", "evt1")] = {
            "home": "Arsenal",
            "away": "Chelsea",
            "sport": "fb",
            "event_key": "evt1",
            "competition_id": "comp1",
        }
        msg_full = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "fb", "evt1"], {}],
            event_header=["comp1", "fb", "evt1"],
            markets={
                "score,both": [None, [["y", 1.85], ["n", 2.0]]],
                "qualify": [None, [["h", 1.5], ["a", 2.5]]],
            },
        )
        msg_btts_only = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "fb", "evt1"], {}],
            event_header=["comp1", "fb", "evt1"],
            markets={
                "score,both": [None, [["y", 1.85], ["n", 2.0]]],
            },
        )

        asyncio.run(_apply_offers_hcap(msg_full, stats))
        p0 = state.events_data[1001]["Periods"][0]
        first_btts_ts = p0["_BTTS_ts"]
        first_tq_ts = p0["_ToQualify_ts"]
        time.sleep(0.01)

        asyncio.run(_apply_offers_hcap(msg_btts_only, stats))

        p0 = state.events_data[1001]["Periods"][0]
        assert p0["_BTTS_ts"] > first_btts_ts
        assert p0["_ToQualify_ts"] == first_tq_ts

    def test_partial_bia_refresh_can_refresh_absent_neighbor_special_in_experimental_mode(self, monkeypatch):
        """Experimental whole-event refresh may lift sibling specials on same-event BIA activity."""
        monkeypatch.setattr(_cfg, "BIA_EXPERIMENTAL_REFRESH_WHOLE_EVENT_SPECIALS", True)
        stats = BiaObserverStats()
        stats._event_registry[("comp1", "fb", "evt1")] = {
            "home": "Arsenal",
            "away": "Chelsea",
            "sport": "fb",
            "event_key": "evt1",
            "competition_id": "comp1",
        }
        msg_full = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "fb", "evt1"], {}],
            event_header=["comp1", "fb", "evt1"],
            markets={
                "score,both": [None, [["y", 1.85], ["n", 2.0]]],
                "qualify": [None, [["h", 1.5], ["a", 2.5]]],
            },
        )
        msg_btts_only = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "fb", "evt1"], {}],
            event_header=["comp1", "fb", "evt1"],
            markets={
                "score,both": [None, [["y", 1.85], ["n", 2.0]]],
            },
        )

        asyncio.run(_apply_offers_hcap(msg_full, stats))
        p0 = state.events_data[1001]["Periods"][0]
        first_btts_ts = p0["_BTTS_ts"]
        first_tq_ts = p0["_ToQualify_ts"]
        time.sleep(0.01)

        asyncio.run(_apply_offers_hcap(msg_btts_only, stats))

        p0 = state.events_data[1001]["Periods"][0]
        assert p0["_BTTS_ts"] > first_btts_ts
        assert p0["_ToQualify_ts"] > first_tq_ts

    def test_partial_bia_refresh_can_refresh_same_sport_events_in_experimental_mode(self, monkeypatch):
        """Sport-wide experimental refresh may lift sibling soccer events, but not other sports."""
        monkeypatch.setattr(_cfg, "BIA_EXPERIMENTAL_REFRESH_WHOLE_SPORT_SPECIALS", True)
        stats = BiaObserverStats()
        stats._event_registry[("comp1", "fb", "evt1")] = {
            "home": "Arsenal",
            "away": "Chelsea",
            "sport": "fb",
            "event_key": "evt1",
            "competition_id": "comp1",
        }
        msg = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "fb", "evt1"], {}],
            event_header=["comp1", "fb", "evt1"],
            markets={
                "score,both": [None, [["y", 1.85], ["n", 2.0]]],
            },
        )

        soccer_peer_before = state.events_data[1002]["Periods"][0]["_BTTS_ts"]
        tennis_before = state.events_data[2001]["Periods"][0]["_OddEven_ts"]
        time.sleep(0.01)

        asyncio.run(_apply_offers_hcap(msg, stats))

        assert state.events_data[1002]["Periods"][0]["_BTTS_ts"] > soccer_peer_before
        assert state.events_data[2001]["Periods"][0]["_OddEven_ts"] == tennis_before

    def test_mixed_offer_applies_only_specials(self):
        """An offer with base + specials: base is filtered, specials applied."""
        state.events_data[1001]["Periods"][0]["Win1x2"] = {
            "Win1": {"value": 2.0}, "Draw": {"value": 3.0}, "Win2": {"value": 3.5},
        }
        stats = BiaObserverStats()
        stats._event_registry[("comp1", "fb", "evt1")] = {
            "home": "Arsenal", "away": "Chelsea",
            "sport": "fb", "event_key": "evt1", "competition_id": "comp1",
        }
        msg = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "fb", "evt1"], {}],
            event_header=["comp1", "fb", "evt1"],
            markets={
                "wdw": [None, [["h", 2.5], ["d", 3.2], ["a", 2.8]]],
                "oe": [None, [["o", 1.9], ["e", 1.95]]],
            },
        )
        asyncio.run(_apply_offers_hcap(msg, stats))

        assert stats.offers_applied == 1
        p0 = state.events_data[1001]["Periods"][0]
        # Base market untouched
        assert p0["Win1x2"]["Win1"]["value"] == 2.0
        # Special applied
        assert "OddEven" in p0
        assert p0["OddEven"]["Odd"]["value"] == 1.9

    def test_unsupported_period_offer_skipped(self):
        """Offer for unsupported BIA sport code (basket_q1) should be skipped
        rather than misapplied to period 0."""
        stats = BiaObserverStats()
        stats._event_registry[("comp1", "basket_q1", "evt1")] = {
            "home": "Arsenal", "away": "Chelsea",
            "sport": "basket_q1", "event_key": "evt1", "competition_id": "comp1",
        }
        msg = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "basket_q1", "evt1"], {}],
            event_header=["comp1", "basket_q1", "evt1"],
            markets={
                "score,both": [None, [["y", 1.85], ["n", 2.0]]],
            },
        )
        asyncio.run(_apply_offers_hcap(msg, stats))

        assert stats.offers_skipped_unsupported_period == 1
        assert stats.offers_applied == 0
        # State must not be touched
        p0 = state.events_data[1001]["Periods"][0]
        assert "BTTS" not in p0

    def test_fb_ht_maps_to_period_1(self):
        """fb_ht specials should be applied to period 1 (soccer first half)."""
        state.events_data[1001]["Periods"].append({"Number": 1})
        stats = BiaObserverStats()
        stats._event_registry[("comp1", "fb_ht", "evt1")] = {
            "home": "Arsenal", "away": "Chelsea",
            "sport": "fb_ht", "event_key": "evt1", "competition_id": "comp1",
        }
        msg = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "fb_ht", "evt1"], {}],
            event_header=["comp1", "fb_ht", "evt1"],
            markets={
                "dc": [None, [["hd", 1.4], ["ha", 1.35], ["da", 2.5]]],
            },
        )
        asyncio.run(_apply_offers_hcap(msg, stats))

        assert stats.offers_applied == 1
        ev = state.events_data[1001]
        periods = ev.get("Periods", [])
        assert len(periods) >= 2
        # Period 1 should have the special
        p1 = periods[1]
        assert "DoubleChance" in p1
        # Period 0 must NOT have DoubleChance
        p0 = periods[0]
        assert "DoubleChance" not in p0

    def test_fb_htft_maps_to_period_0(self):
        """fb_htft specials should be applied to period 0 (full-match HT/FT)."""
        stats = BiaObserverStats()
        stats._event_registry[("comp1", "fb_htft", "evt1")] = {
            "home": "Arsenal", "away": "Chelsea",
            "sport": "fb_htft", "event_key": "evt1", "competition_id": "comp1",
        }
        msg = BiaOffersHcapMsg(
            raw=["offers_hcap", ["comp1", "fb_htft", "evt1"], {}],
            event_header=["comp1", "fb_htft", "evt1"],
            markets={
                "htft": [None, [["h,h", 4.2], ["d,d", 5.9], ["a,a", 6.1]]],
            },
        )
        asyncio.run(_apply_offers_hcap(msg, stats))

        assert stats.offers_applied == 1
        p0 = state.events_data[1001]["Periods"][0]
        assert p0["HalfTimeFullTime"]["1/1"]["value"] == 4.2
        assert p0["HalfTimeFullTime"]["X/X"]["value"] == 5.9
        assert p0["HalfTimeFullTime"]["2/2"]["value"] == 6.1


# ── Snapshot phase reporting ────────────────────────────────────────────────

class TestSnapshotPhase:
    def test_observer_only_phase_default(self, monkeypatch):
        monkeypatch.setattr(_cfg, "BIA_ENABLED", True)
        monkeypatch.setattr(_cfg, "PS3838_SEND_MODE", "base_only")
        import services.bia_observer as obs_mod
        monkeypatch.setattr(obs_mod, "_observer_running", True)
        monkeypatch.setattr(obs_mod, "_lifecycle_state", "connected")
        monkeypatch.setattr(obs_mod, "_current_stats", None)
        snap = bia_observer_snapshot()
        assert snap["phase"] == "observer-only"

    def test_integration_phase_when_active(self, monkeypatch):
        monkeypatch.setattr(_cfg, "BIA_ENABLED", True)
        monkeypatch.setattr(_cfg, "PS3838_SEND_MODE", "all")
        import services.bia_observer as obs_mod
        monkeypatch.setattr(obs_mod, "_observer_running", True)
        monkeypatch.setattr(obs_mod, "_lifecycle_state", "connected")
        monkeypatch.setattr(obs_mod, "_current_stats", None)
        snap = bia_observer_snapshot()
        assert snap["phase"] == "integration"

    def test_integration_counters_in_snapshot(self, monkeypatch):
        monkeypatch.setattr(_cfg, "BIA_ENABLED", True)
        monkeypatch.setattr(_cfg, "PS3838_SEND_MODE", "all")
        import services.bia_observer as obs_mod
        stats = BiaObserverStats()
        stats.offers_applied = 42
        stats.offers_skipped_no_match = 5
        stats.offers_skipped_suspended = 3
        stats.matched_pids = {1001, 1002}
        stats.ws_connect_ts = time.time() - 60
        stats.last_msg_ts = time.time() - 1
        monkeypatch.setattr(obs_mod, "_observer_running", True)
        monkeypatch.setattr(obs_mod, "_lifecycle_state", "connected")
        monkeypatch.setattr(obs_mod, "_current_stats", stats)
        snap = bia_observer_snapshot()
        assert snap["integration"]["applied"] == 42
        assert snap["integration"]["skipped_no_match"] == 5
        assert snap["integration"]["matched_pids"] == 2


# ── Config guard tests ──────────────────────────────────────────────────────

def _reload_config_clean(monkeypatch, env_overrides: dict, clear_keys: list | None = None):
    """Reload config.py with dotenv neutralised and controlled env vars."""
    for k in (clear_keys or []):
        monkeypatch.delenv(k, raising=False)
    for k, v in env_overrides.items():
        monkeypatch.setenv(k, v)
    with patch("dotenv.load_dotenv"):
        import config as _cfg_mod
        importlib.reload(_cfg_mod)
    return _cfg_mod


class TestBiaConfigGuard:
    """Guard: SEND_MODE with BIA should follow the BIA-first architecture."""

    @pytest.fixture(autouse=True)
    def _restore_config(self):
        """Re-reload config with safe defaults after each test to avoid leaking."""
        yield
        import importlib as _il
        from unittest.mock import patch as _p
        import os
        for k in (
            "PS3838_SEND_MODE",
            "BIA_ENABLED",
            "BIA_LOGIN",
            "BIA_PASSWORD",
            "PS3838_DIRECT_MORE_BET_ENABLED",
            "PS3838_TRANSPORT_BACKEND",
            "PS3838_HYBRID_MORE_BET_ENABLED",
        ):
            os.environ.pop(k, None)
        with _p("dotenv.load_dotenv"):
            import config as _c
            _il.reload(_c)

    def test_bia_enabled_send_all_passes(self, monkeypatch):
        cfg = _reload_config_clean(monkeypatch, {
            "PS3838_SEND_MODE": "all",
            "BIA_ENABLED": "1",
            "BIA_LOGIN": "test",
            "BIA_PASSWORD": "test",
        })
        assert cfg.PS3838_SEND_MODE == "all"
        assert cfg.BIA_ENABLED is True

    def test_send_all_no_bia_no_hybrid_fails(self, monkeypatch):
        with pytest.raises(SystemExit) as exc_info:
            _reload_config_clean(monkeypatch, {
                "PS3838_SEND_MODE": "all",
                "BIA_ENABLED": "0",
                "PS3838_DIRECT_MORE_BET_ENABLED": "0",
                "PS3838_TRANSPORT_BACKEND": "legacy",
                "PS3838_HYBRID_MORE_BET_ENABLED": "0",
            })
        assert exc_info.value.code == 1

    def test_defaults_remain_safe(self, monkeypatch):
        """Default config (all flags 0) → passes (base_only mode)."""
        cfg = _reload_config_clean(monkeypatch, {
            "PS3838_SEND_MODE": "base_only",
            "BIA_ENABLED": "0",
        })
        assert cfg.PS3838_SEND_MODE == "base_only"
        assert cfg.BIA_ENABLED is False

    def test_more_bets_only_with_bia_passes(self, monkeypatch):
        """SEND_MODE=more_bets_only + BIA_ENABLED=1 → allowed."""
        cfg = _reload_config_clean(monkeypatch, {
            "PS3838_SEND_MODE": "more_bets_only",
            "BIA_ENABLED": "1",
            "BIA_LOGIN": "test",
            "BIA_PASSWORD": "test",
        })
        assert cfg.PS3838_SEND_MODE == "more_bets_only"
