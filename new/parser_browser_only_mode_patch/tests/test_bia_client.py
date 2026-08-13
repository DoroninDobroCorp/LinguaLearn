"""
Unit tests for services/bia_client.py — message parsing and session logic.
"""

import json

from services.bia_client import (
    BiaEventMsg,
    BiaInfoMsg,
    BiaOffersEventMsg,
    BiaOffersHcapMsg,
    BiaOtherMsg,
    BiaPmmMsg,
    BiaSession,
    parse_cpricefeed_frame,
)


# ── parse_cpricefeed_frame ───────────────────────────────────────────────────


def test_parse_single_event_message():
    frame = json.dumps([
        "event",
        ["fb", "2026-04-05,94,45"],
        {"home": "TeamA", "away": "TeamB", "competition_id": 94, "event_type": "normal"},
    ])
    msgs = parse_cpricefeed_frame(frame)
    assert len(msgs) == 1
    m = msgs[0]
    assert isinstance(m, BiaEventMsg)
    assert m.sport == "fb"
    assert m.event_key == "2026-04-05,94,45"
    assert m.data["home"] == "TeamA"


def test_parse_batched_messages():
    frame = json.dumps([
        ["event", ["fb", "2026-04-05,94,45"], {"home": "A", "away": "B"}],
        ["event", ["tennis", "2026-04-05,12,7"], {"home": "C", "away": "D"}],
    ])
    msgs = parse_cpricefeed_frame(frame)
    assert len(msgs) == 2
    assert isinstance(msgs[0], BiaEventMsg) and msgs[0].sport == "fb"
    assert isinstance(msgs[1], BiaEventMsg) and msgs[1].sport == "tennis"


def test_parse_offers_hcap():
    frame = json.dumps([
        "offers_hcap",
        ["fb", "2026-04-05,94,45"],
        {"wdw": [0, [["h", 1.92], ["d", 3.50], ["a", 4.10]]]},
    ])
    msgs = parse_cpricefeed_frame(frame)
    assert len(msgs) == 1
    m = msgs[0]
    assert isinstance(m, BiaOffersHcapMsg)
    assert "wdw" in m.markets
    assert m.markets["wdw"][1][0] == ["h", 1.92]


def test_parse_offers_event():
    frame = json.dumps([
        "offers_event",
        ["fb", "2026-04-05,94,45"],
        {"cs": [[[1, 0], [["", 8.5]]], [[2, 1], [["", 9.2]]]]},
    ])
    msgs = parse_cpricefeed_frame(frame)
    assert len(msgs) == 1
    m = msgs[0]
    assert isinstance(m, BiaOffersEventMsg)
    assert "cs" in m.markets
    assert m.markets["cs"][0][0] == [1, 0]
    assert m.markets["cs"][1][1][0][1] == 9.2


def test_parse_api_pmm():
    frame = json.dumps([
        "api",
        {
            "data": [
                [
                    "pmm",
                    {
                        "bookie": "pin88",
                        "betslip_id": "abc-123",
                        "event_id": 12345,
                        "bet_type": "wdw",
                        "status": {"code": "ok"},
                        "price_list": [{"effective": {"price": 1.95, "max": [100, "USD"]}}],
                    },
                ]
            ]
        },
    ])
    msgs = parse_cpricefeed_frame(frame)
    assert len(msgs) == 1
    m = msgs[0]
    assert isinstance(m, BiaPmmMsg)
    assert m.bookie == "pin88"
    assert m.betslip_id == "abc-123"
    assert m.event_id == "12345"
    assert m.status_code == "ok"
    assert m.price_list[0]["effective"]["price"] == 1.95


def test_parse_info_message():
    frame = json.dumps(["info", {"version": "1.2.3"}])
    msgs = parse_cpricefeed_frame(frame)
    assert len(msgs) == 1
    assert isinstance(msgs[0], BiaInfoMsg)
    assert msgs[0].payload == {"version": "1.2.3"}


def test_parse_unknown_message_type():
    frame = json.dumps(["pong", "1234567890"])
    msgs = parse_cpricefeed_frame(frame)
    assert len(msgs) == 1
    assert isinstance(msgs[0], BiaOtherMsg)
    assert msgs[0].msg_type == "pong"


def test_parse_empty_frame():
    assert parse_cpricefeed_frame("") == []
    assert parse_cpricefeed_frame("null") == []
    assert parse_cpricefeed_frame("{}") == []
    assert parse_cpricefeed_frame("[]") == []


def test_parse_invalid_json():
    assert parse_cpricefeed_frame("not json") == []


def test_parse_mixed_batch():
    """Batch with event + offers_event + offers_hcap + unknown."""
    frame = json.dumps([
        ["event", ["fb", "2026-04-05,1,2"], {"home": "X"}],
        ["offers_event", ["fb", "2026-04-05,1,2"], {"cs": [[[1, 0], [["", 8.5]]]]}],
        ["offers_hcap", ["fb", "2026-04-05,1,2"], {"ml": [0, [["h", 2.0]]]}],
        ["heartbeat", 12345],
    ])
    msgs = parse_cpricefeed_frame(frame)
    assert len(msgs) == 4
    assert isinstance(msgs[0], BiaEventMsg)
    assert isinstance(msgs[1], BiaOffersEventMsg)
    assert isinstance(msgs[2], BiaOffersHcapMsg)
    assert isinstance(msgs[3], BiaOtherMsg)


def test_parse_api_pmm_multiple_bookies():
    """Multiple PMM entries in one api message."""
    frame = json.dumps([
        "api",
        {
            "data": [
                ["pmm", {"bookie": "bf", "betslip_id": "bs1", "event_id": 1,
                          "bet_type": "ml", "status": {"code": "ok"}, "price_list": []}],
                ["pmm", {"bookie": "pin88", "betslip_id": "bs1", "event_id": 1,
                          "bet_type": "ml", "status": {"code": "ok"}, "price_list": []}],
                ["pmm", {"bookie": "mbook", "betslip_id": "bs1", "event_id": 1,
                          "bet_type": "ml", "status": {"code": "ok"}, "price_list": []}],
            ]
        },
    ])
    msgs = parse_cpricefeed_frame(frame)
    assert len(msgs) == 3
    bookies = {m.bookie for m in msgs}
    assert bookies == {"bf", "pin88", "mbook"}


# ── BiaSession token/expiry ─────────────────────────────────────────────────


def test_session_is_expired_when_no_token():
    import aiohttp

    class FakeHttp:
        pass

    s = BiaSession(FakeHttp())
    assert s.is_expired is True
    assert s.token is None


def test_session_ws_url_returns_none_without_token():
    class FakeHttp:
        pass

    s = BiaSession(FakeHttp())
    assert s.ws_url() is None
