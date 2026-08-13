from utils.list_signal import (
    build_known_event_ids,
    expand_signal_targets,
    find_known_event_ids,
    signal_timestamp_for_event,
)


def _child_meta(parent_id: int) -> dict:
    raw_event = [0] * 29
    raw_event[28] = parent_id
    return {"is_live": True, "event": raw_event}


def test_known_event_ids_include_parent_ids_from_raw_events():
    raw_events = {
        5001: _child_meta(9001),
        7001: _child_meta(7001),
    }

    known_ids = build_known_event_ids(raw_events, {9001: {}, 7001: {}})

    assert known_ids == {5001, 7001, 9001}


def test_update_left_menu_ids_expand_from_parent_to_child_targets():
    raw_events = {
        5001: _child_meta(9001),
        7001: _child_meta(7001),
    }
    known_ids = build_known_event_ids(raw_events, {9001: {}, 7001: {}})
    payload = {
        "type": "UPDATE_LEFT_MENU",
        "rows": [
            {"eventId": "9001"},
            {"id": 7001},
            {"ignored": 33},
        ],
    }

    matched_ids = find_known_event_ids(payload, known_ids)
    targets = expand_signal_targets(matched_ids, raw_events)

    assert matched_ids == {7001, 9001}
    assert targets == {5001, 7001, 9001}


def test_signal_timestamp_uses_parent_signal_for_child_scheduler_id():
    raw_events = {
        5001: _child_meta(9001),
    }

    assert signal_timestamp_for_event(5001, {9001: 123.0}, raw_events) == 123.0
    assert signal_timestamp_for_event(5001, {5001: 99.0}, raw_events) == 99.0
