"""BIA wiring helpers in aggregator.main."""

from __future__ import annotations

from aggregator.main import _mirror_frame_to_legacy_state
from state import state


def test_mirror_frame_creates_legacy_state_event() -> None:
    original_events = state.events_data
    original_sources = state.event_source
    try:
        state.events_data = {}
        state.event_source = {}
        frame = {
            "Pid": 1600000001,
            "Home": "Home FC",
            "Away": "Away FC",
            "SportName": "Soccer",
            "SportId": 29,
            "Periods": [{"Number": 0, "Win1x2": {"Win1": {"value": 2.0}}}],
        }

        _mirror_frame_to_legacy_state(frame)

        assert state.events_data[1600000001]["Home"] == "Home FC"
        assert state.event_source[1600000001] == "ps3838"
        assert state.chain_state_update_ts > 0
    finally:
        state.events_data = original_events
        state.event_source = original_sources


def test_mirror_frame_preserves_existing_bia_specials() -> None:
    original_events = state.events_data
    original_sources = state.event_source
    try:
        state.events_data = {
            1600000002: {
                "Pid": 1600000002,
                "Home": "Home FC",
                "Away": "Away FC",
                "SportName": "Soccer",
                "Periods": [
                    {
                        "Number": 0,
                        "ExactTotalGoals": {"3": {"value": 4.5}},
                    }
                ],
            }
        }
        state.event_source = {}
        frame = {
            "Pid": 1600000002,
            "Periods": [{"Number": 0, "Win1x2": {"Win1": {"value": 2.1}}}],
        }

        _mirror_frame_to_legacy_state(frame)

        period = state.events_data[1600000002]["Periods"][0]
        assert period["Win1x2"]["Win1"]["value"] == 2.1
        assert period["ExactTotalGoals"]["3"]["value"] == 4.5
    finally:
        state.events_data = original_events
        state.event_source = original_sources
