import json
from types import SimpleNamespace

import aiohttp
import pytest

import services.bia_exact_price as exact_price
from services.bia_client import BiaPmmMsg
from services.bia_exact_price import (
    BiaExactPriceClient,
    BiaExactPriceMappingError,
    build_bia_betslip_request as _strict_build_bia_betslip_request,
    extract_pin88_effective_quote,
)


def build_bia_betslip_request(event_ref, selection, *, want_bookies=None):
    """Exercise legacy serialization only as test input to the strict builder."""
    event_ref = dict(event_ref)
    if "offer_proof" not in event_ref:
        event_ref["offer_proof"] = {
            "bia_bet_type": exact_price._selection_bia_bet_type(event_ref, selection),
        }
    return _strict_build_bia_betslip_request(
        event_ref, selection, want_bookies=want_bookies,
    )


def _proven_event_ref(*, bet_type="for,h"):
    return {
        "sport_code": "fb",
        "event_key": "2026-04-05,95,47",
        "swapped": False,
        "offer_proof": {"bia_bet_type": bet_type},
    }


def test_build_bia_betslip_request_requires_central_offer_proof():
    with pytest.raises(BiaExactPriceMappingError) as exc:
        _strict_build_bia_betslip_request(
            {"sport_code": "fb", "event_key": "event", "swapped": False},
            {"bet_type": 1, "team_select": 0, "handicap": 0},
        )
    assert exc.value.code == "BIA_OFFER_PROOF_REQUIRED"


def test_build_bia_betslip_request_moneyline_home():
    payload = build_bia_betslip_request(
        {"sport_code": "fb", "event_key": "2026-04-05,95,47", "swapped": False},
        {"bet_type": 1, "team_select": 0, "handicap": 0},
    )

    assert payload == {
        "sport": "fb",
        "event_id": "2026-04-05,95,47",
        "bet_type": "for,tp,reg,wdw,h",
        "equivalent_bets": False,
        "want_bookies": ["pin88"],
    }


def test_build_bia_betslip_request_uses_central_raw_offer_proof_verbatim():
    payload = build_bia_betslip_request(
        {
            "sport_code": "esports",
            "event_key": "event",
            "swapped": False,
            "offer_proof": {
                "raw_offer_group": "time_tahou,tmap,1,a",
                "raw_asian_code": 42,
                "bia_bet_type": "for,tmap,1,tahunder,a,42",
            },
        },
        # Deliberately not a locally supported selector: proof owns identity.
        {"bet_type": 99, "team_select": 99, "handicap": 10.5},
    )
    assert payload["bet_type"] == "for,tmap,1,tahunder,a,42"
    assert payload["equivalent_bets"] is False


@pytest.mark.parametrize("offer_proof", [None, {}, {"bia_bet_type": "for,h\nfor,a"}])
def test_build_bia_betslip_request_rejects_invalid_explicit_offer_proof(offer_proof):
    event_ref = {
        "sport_code": "fb",
        "event_key": "event",
        "swapped": False,
        "offer_proof": offer_proof,
    }
    if offer_proof is None:
        event_ref["offer_proof"] = "not-a-dict"
    with pytest.raises(BiaExactPriceMappingError) as exc:
        build_bia_betslip_request(
            event_ref,
            {"bet_type": 1, "team_select": 0, "handicap": 0},
        )
    assert exc.value.code == "BIA_OFFER_PROOF_INVALID"


def test_build_bia_betslip_request_moneyline_draw_uses_wdw():
    payload = build_bia_betslip_request(
        {"sport_code": "fb", "event_key": "2026-04-05,95,47", "swapped": False},
        {"bet_type": 1, "team_select": 2, "handicap": 0},
    )

    assert payload["bet_type"] == "for,tp,reg,wdw,d"


def test_build_bia_betslip_request_tennis_moneyline_uses_tset_identity():
    payload = build_bia_betslip_request(
        {"sport_code": "tennis", "event_key": "2026-04-05,95,47", "swapped": False},
        {"bet_type": 1, "team_select": 0, "handicap": 0},
    )

    assert payload["bet_type"] == "for,tset,all,vwhatever,p1"


@pytest.mark.parametrize(
    ("bet_type", "team_select", "swapped", "expected"),
    [
        (4, 5, False, "for,tahover,h,10"),
        (4, 0, False, "for,tahunder,h,10"),
        (5, 7, False, "for,tahover,a,10"),
        (5, 1, False, "for,tahunder,a,10"),
        (4, 5, True, "for,tahover,a,10"),
        (4, 0, True, "for,tahunder,a,10"),
        (5, 7, True, "for,tahover,h,10"),
        (5, 1, True, "for,tahunder,h,10"),
    ],
)
def test_build_bia_betslip_request_team_totals_are_exact(
    bet_type, team_select, swapped, expected,
):
    payload = build_bia_betslip_request(
        {"sport_code": "fb", "event_key": "event", "swapped": swapped},
        {"bet_type": bet_type, "team_select": team_select, "handicap": 2.5},
    )
    assert payload["bet_type"] == expected
    assert payload["equivalent_bets"] is False


@pytest.mark.parametrize(
    ("selection", "expected"),
    [
        ({"bet_type": 1, "team_select": 1, "handicap": 0, "map_number": 1}, "for,tmap,1,ml,a"),
        ({"bet_type": 2, "team_select": 1, "handicap": -3.5, "map_number": 1}, "for,tmap,1,ah,a,-14"),
        ({"bet_type": 3, "team_select": 4, "handicap": 22.5, "map_number": 1}, "for,tmap,1,ahunder,90"),
        ({"bet_type": 5, "team_select": 1, "handicap": 10.5, "map_number": 1}, "for,tmap,1,tahunder,a,42"),
        ({"bet_type": 3, "team_select": 3, "handicap": 20.5, "map_number": 2, "esports_unit": "kills"}, "for,tmap,2,sub,kills,ahover,82"),
    ],
)
def test_build_bia_betslip_request_esports_map_contract(selection, expected):
    payload = build_bia_betslip_request(
        {"sport_code": "esports", "event_key": "event", "swapped": False},
        selection,
    )
    assert payload["bet_type"] == expected


def test_build_bia_betslip_request_tennis_lines_use_quarter_codes():
    event_ref = {"sport_code": "tennis", "event_key": "event", "swapped": False}
    handicap = build_bia_betslip_request(
        event_ref,
        {"bet_type": 2, "team_select": 1, "handicap": -1.5, "period": 0, "tennis_unit": "game"},
    )
    total = build_bia_betslip_request(
        event_ref,
        {"bet_type": 3, "team_select": 4, "handicap": 21.5, "period": 0, "tennis_unit": "game"},
    )
    sets = build_bia_betslip_request(
        event_ref,
        {"bet_type": 2, "team_select": 1, "handicap": -1.5, "period": 0, "tennis_unit": "set"},
    )
    assert handicap["bet_type"] == "for,tset,all,vwhatever,game,ah,p2,-6"
    assert total["bet_type"] == "for,tset,all,vwhatever,game,ahunder,86"
    assert sets["bet_type"] == "for,tset,all,vwhatever,set,ah,p2,-6"


def test_build_bia_betslip_request_requires_tennis_line_unit_without_offer_proof():
    with pytest.raises(BiaExactPriceMappingError) as exc:
        build_bia_betslip_request(
            {"sport_code": "tennis", "event_key": "event", "swapped": False},
            {"bet_type": 2, "team_select": 1, "handicap": -1.5, "period": 0},
        )
    assert exc.value.code == "BIA_TENNIS_UNIT_REQUIRED"


@pytest.mark.parametrize("poison_line", [1.49, 2.49, 0.1, float("nan"), float("inf")])
def test_build_bia_betslip_request_rejects_non_quarter_structural_lines(poison_line):
    with pytest.raises(BiaExactPriceMappingError):
        build_bia_betslip_request(
            {"sport_code": "fb", "event_key": "event", "swapped": False},
            {"bet_type": 4, "team_select": 5, "handicap": poison_line},
        )


@pytest.mark.parametrize("bet_type,team_select", [(4, 7), (4, 1), (5, 5), (5, 0)])
def test_build_bia_betslip_request_rejects_crossed_team_total_selectors(
    bet_type, team_select,
):
    with pytest.raises(BiaExactPriceMappingError) as exc:
        build_bia_betslip_request(
            {"sport_code": "fb", "event_key": "event", "swapped": False},
            {"bet_type": bet_type, "team_select": team_select, "handicap": 2.5},
        )
    assert exc.value.code == "UNSUPPORTED_TEAM_TOTAL_TEAM"


def test_build_bia_betslip_request_double_chance_respects_swapped_sides():
    payload = build_bia_betslip_request(
        {"sport_code": "fb_ht", "event_key": "2026-04-05,95,47", "swapped": True},
        {"special_type": "double_chance", "contestant": "HomeOrDraw"},
    )

    assert payload["bet_type"] == "for,dc,d,a"


def test_build_bia_betslip_request_correct_score():
    payload = build_bia_betslip_request(
        {"sport_code": "fb", "event_key": "2026-04-05,95,47", "swapped": False},
        {"special_type": "correct_score", "contestant": "2:1"},
    )

    assert payload["bet_type"] == "for,cs,2,1"


def test_build_bia_betslip_request_correct_score_swapped_flips_goals():
    payload = build_bia_betslip_request(
        {"sport_code": "fb", "event_key": "2026-04-05,95,47", "swapped": True},
        {"special_type": "correct_score", "contestant": "2:1"},
    )

    assert payload["bet_type"] == "for,cs,1,2"


def test_build_bia_betslip_request_exact_total_goals():
    payload = build_bia_betslip_request(
        {"sport_code": "fb", "event_key": "2026-04-05,95,47", "swapped": False},
        {"special_type": "exact_total_goals", "contestant": "3"},
    )

    assert payload["bet_type"] == "for,exact_total,3"


def test_build_bia_betslip_request_total_goals_range():
    payload = build_bia_betslip_request(
        {"sport_code": "fb", "event_key": "2026-04-05,95,47", "swapped": False},
        {"special_type": "total_goals_range", "contestant": "4-6"},
    )

    assert payload["bet_type"] == "for,gr,4,6"


def test_build_bia_betslip_request_total_goals_range_plus():
    payload = build_bia_betslip_request(
        {"sport_code": "fb", "event_key": "2026-04-05,95,47", "swapped": False},
        {"special_type": "total_goals_range", "contestant": "7+"},
    )

    assert payload["bet_type"] == "for,gr,7,999"


def test_build_bia_betslip_request_winning_margin():
    payload = build_bia_betslip_request(
        {"sport_code": "fb", "event_key": "2026-04-05,95,47", "swapped": False},
        {"special_type": "winning_margin", "contestant": "Home By 1"},
    )

    assert payload["bet_type"] == "for,wm,h,1"


def test_build_bia_betslip_request_winning_margin_swapped_flips_side():
    payload = build_bia_betslip_request(
        {"sport_code": "fb", "event_key": "2026-04-05,95,47", "swapped": True},
        {"special_type": "winning_margin", "contestant": "Home By 1"},
    )

    assert payload["bet_type"] == "for,wm,a,1"


def test_build_bia_betslip_request_rejects_unproven_btts_no_mapping():
    with pytest.raises(BiaExactPriceMappingError) as exc:
        build_bia_betslip_request(
            {"sport_code": "fb", "event_key": "2026-04-05,95,47", "swapped": False},
            {"special_type": "btts", "contestant": "No"},
        )

    assert exc.value.code == "UNSUPPORTED_BTTS_CONTESTANT"


def test_build_bia_betslip_request_rejects_unproven_exact_total_goals_plus():
    with pytest.raises(BiaExactPriceMappingError) as exc:
        build_bia_betslip_request(
            {"sport_code": "fb", "event_key": "2026-04-05,95,47", "swapped": False},
            {"special_type": "exact_total_goals", "contestant": "6+"},
        )

    assert exc.value.code == "UNSUPPORTED_EXACT_TOTAL_GOALS_CONTESTANT"


def test_extract_pin88_effective_quote_accepts_both_limit_orders():
    msg = BiaPmmMsg(
        raw=[],
        bookie="pin88",
        betslip_id="abc-123",
        event_id="2026-04-05,95,47",
        bet_type="for,h",
        status_code="ok",
        price_list=[{"effective": {"price": 1.91, "min": [1.25, "USD"], "max": ["USD", 100]}}],
    )

    quote = extract_pin88_effective_quote(msg)

    assert quote["status"] == "OK"
    assert quote["odds"] == pytest.approx(1.91)
    assert quote["min_stake"] == pytest.approx(1.25)
    assert quote["max_stake"] == pytest.approx(100)


def test_extract_pin88_effective_quote_accepts_success_status():
    msg = BiaPmmMsg(
        raw=[],
        bookie="pin88",
        betslip_id="abc-123",
        event_id="2026-04-05,95,47",
        bet_type="for,h",
        status_code="success",
        price_list=[{"effective": {"price": 2.05, "max": [100, "USD"]}}],
    )

    quote = extract_pin88_effective_quote(msg)

    assert quote["status"] == "OK"
    assert quote["odds"] == pytest.approx(2.05)


def test_extract_pin88_effective_quote_requires_exact_bet_type_identity():
    base = dict(
        raw=[],
        bookie="pin88",
        betslip_id="abc-123",
        event_id="event",
        status_code="ok",
        price_list=[{"effective": {"price": 2.05, "max": [100, "USD"]}}],
    )
    exact = extract_pin88_effective_quote(
        BiaPmmMsg(bet_type="for,tahunder,a,10", **base),
        expected_bet_type="for,tahunder,a,10",
    )
    live_wrapped = extract_pin88_effective_quote(
        BiaPmmMsg(bet_type="for,ir,1,0,tahunder,a,10", **base),
        expected_bet_type="for,tahunder,a,10",
    )
    mismatch = extract_pin88_effective_quote(
        BiaPmmMsg(bet_type="for,tahunder,h,10", **base),
        expected_bet_type="for,tahunder,a,10",
    )
    assert exact["status"] == "OK"
    assert live_wrapped["status"] == "OK"
    assert mismatch["status"] == "UNAVAILABLE"
    assert mismatch["error_code"] == "PMM_BET_TYPE_MISMATCH"


@pytest.mark.asyncio
async def test_bia_exact_price_client_quote_pin88_success():
    frame = json.dumps([
        "api",
        {
            "data": [
                [
                    "pmm",
                    {
                        "bookie": "pin88",
                        "betslip_id": "abc-123",
                        "event_id": "2026-04-05,95,47",
                        "bet_type": "for,h",
                        "status": {"code": "ok"},
                        "price_list": [{"effective": {"price": 1.91, "max": ["USD", 100]}}],
                    },
                ]
            ]
        },
    ])

    class _FakeResponse:
        def __init__(self, status, payload):
            self.status = status
            self._payload = payload

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def json(self, content_type=None):
            return self._payload

    class _FakeHttp:
        def __init__(self):
            self.closed = False
            self.delete_calls = []

        def post(self, *args, **kwargs):
            return _FakeResponse(
                200,
                {
                    "data": {
                        "betslip_id": "abc-123",
                        "bet_type": "for,h",
                        "equivalent_bets": False,
                        "bookies_with_offers": ["pin88"],
                    }
                },
            )

        def delete(self, url, **kwargs):
            self.delete_calls.append((url, kwargs))
            return _FakeResponse(200, {"status": "ok"})

    class _FakeBiaSession:
        async def ensure_token(self):
            return "tok"

    class _FakeWs:
        closed = False

        async def receive(self, timeout=None):
            return SimpleNamespace(type=aiohttp.WSMsgType.TEXT, data=frame)

        async def close(self):
            self.closed = True

        def exception(self):
            return None

    client = BiaExactPriceClient()
    client._http = _FakeHttp()
    client._bia = _FakeBiaSession()
    client._ws = _FakeWs()
    client._ws_token = "tok"

    async def _noop():
        return None

    client.start = _noop  # type: ignore[assignment]
    client._ensure_ws = _noop  # type: ignore[assignment]
    client._respect_rate_limit = _noop  # type: ignore[assignment]

    quote = await client.quote_pin88(
        _proven_event_ref(),
        {"bet_type": 1, "team_select": 0, "handicap": 0},
    )

    assert quote["status"] == "OK"
    assert quote["odds"] == pytest.approx(1.91)
    assert quote["bet_type"] == "for,h"
    assert quote["betslip_id"] == "abc-123"
    assert client._http.delete_calls


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("created_bet_type", "created_equivalent_bets", "expected_error"),
    [
        ("for,ml,h", False, "BIA_BET_TYPE_MISMATCH"),
        ("for,h", True, "BIA_EQUIVALENT_BETS_NOT_DISABLED"),
    ],
)
async def test_bia_exact_price_client_rejects_non_exact_create_identity(
    created_bet_type, created_equivalent_bets, expected_error,
):
    cleaned = []

    client = BiaExactPriceClient()

    async def _noop():
        return None

    async def _create(payload):
        assert payload["bet_type"] == "for,h"
        assert payload["equivalent_bets"] is False
        return {
            "betslip_id": "abc-123",
            "bet_type": created_bet_type,
            "equivalent_bets": created_equivalent_bets,
            "bookies_with_offers": ["pin88"],
        }

    async def _cleanup(betslip_id):
        cleaned.append(betslip_id)
        return None

    async def _unexpected_wait(*args, **kwargs):
        raise AssertionError("PMM wait should not start for a non-exact create response")

    client.start = _noop  # type: ignore[assignment]
    client._ensure_ws = _noop  # type: ignore[assignment]
    client._respect_rate_limit = _noop  # type: ignore[assignment]
    client._create_betslip = _create  # type: ignore[assignment]
    client._delete_betslip_with_retries = _cleanup  # type: ignore[assignment]
    client._wait_for_pin88_quote = _unexpected_wait  # type: ignore[assignment]

    quote = await client.quote_pin88(
        _proven_event_ref(),
        {"bet_type": 1, "team_select": 0, "handicap": 0},
    )

    assert quote["status"] == "UNAVAILABLE"
    assert quote["error_code"] == expected_error
    assert quote["betslip_id"] == "abc-123"
    assert cleaned == ["abc-123"]


@pytest.mark.asyncio
async def test_bia_exact_price_client_retries_create_after_rate_limit(monkeypatch):
    frame = json.dumps([
        "api",
        {
            "data": [
                [
                    "pmm",
                    {
                        "bookie": "pin88",
                        "betslip_id": "abc-123",
                        "event_id": "2026-04-05,95,47",
                        "bet_type": "for,h",
                        "status": {"code": "ok"},
                        "price_list": [{"effective": {"price": 1.91, "max": ["USD", 100]}}],
                    },
                ]
            ]
        },
    ])

    class _FakeResponse:
        def __init__(self, status, payload, headers=None):
            self.status = status
            self._payload = payload
            self.headers = headers or {}

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def json(self, content_type=None):
            return self._payload

        async def text(self):
            return json.dumps(self._payload)

    class _FakeHttp:
        def __init__(self):
            self.closed = False
            self.post_calls = 0
            self.delete_calls = []

        def post(self, *args, **kwargs):
            self.post_calls += 1
            if self.post_calls == 1:
                return _FakeResponse(
                    429,
                    {
                        "status": "error",
                        "code": "throttled",
                        "data": {
                            "message": "Request was throttled. Expected available in 3 seconds.",
                            "retry_after": 3,
                        },
                    },
                )
            return _FakeResponse(
                200,
                {
                    "data": {
                        "betslip_id": "abc-123",
                        "bet_type": "for,h",
                        "equivalent_bets": False,
                        "bookies_with_offers": ["pin88"],
                    }
                },
            )

        def delete(self, url, **kwargs):
            self.delete_calls.append((url, kwargs))
            return _FakeResponse(200, {"status": "ok"})

    class _FakeBiaSession:
        async def ensure_token(self):
            return "tok"

    class _FakeWs:
        closed = False

        async def receive(self, timeout=None):
            return SimpleNamespace(type=aiohttp.WSMsgType.TEXT, data=frame)

        async def close(self):
            self.closed = True

        def exception(self):
            return None

    sleep_calls = []

    async def _fake_sleep(delay):
        sleep_calls.append(delay)

    client = BiaExactPriceClient(rate_limit_retries=2)
    client._http = _FakeHttp()
    client._bia = _FakeBiaSession()
    client._ws = _FakeWs()
    client._ws_token = "tok"

    async def _noop():
        return None

    client.start = _noop  # type: ignore[assignment]
    client._ensure_ws = _noop  # type: ignore[assignment]
    client._respect_rate_limit = _noop  # type: ignore[assignment]
    monkeypatch.setattr(exact_price.asyncio, "sleep", _fake_sleep)

    quote = await client.quote_pin88(
        _proven_event_ref(),
        {"bet_type": 1, "team_select": 0, "handicap": 0},
    )

    assert quote["status"] == "OK"
    assert quote["odds"] == pytest.approx(1.91)
    assert quote["bet_type"] == "for,h"
    assert client._http.post_calls == 2
    assert sleep_calls == [3.0]


@pytest.mark.asyncio
async def test_bia_exact_price_client_returns_rate_limited_after_retry_budget(monkeypatch):
    class _FakeResponse:
        def __init__(self, status, payload, headers=None):
            self.status = status
            self._payload = payload
            self.headers = headers or {}

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def json(self, content_type=None):
            return self._payload

        async def text(self):
            return json.dumps(self._payload)

    class _FakeHttp:
        def __init__(self):
            self.closed = False
            self.post_calls = 0

        def post(self, *args, **kwargs):
            self.post_calls += 1
            return _FakeResponse(
                429,
                {
                    "status": "error",
                    "code": "throttled",
                    "data": {"retry_after": 2},
                },
            )

        def delete(self, *args, **kwargs):
            raise AssertionError("delete should not be called when create is throttled")

    class _FakeBiaSession:
        async def ensure_token(self):
            return "tok"

    sleep_calls = []

    async def _fake_sleep(delay):
        sleep_calls.append(delay)

    client = BiaExactPriceClient(rate_limit_retries=1)
    client._http = _FakeHttp()
    client._bia = _FakeBiaSession()

    async def _noop():
        return None

    client.start = _noop  # type: ignore[assignment]
    client._ensure_ws = _noop  # type: ignore[assignment]
    client._respect_rate_limit = _noop  # type: ignore[assignment]
    monkeypatch.setattr(exact_price.asyncio, "sleep", _fake_sleep)

    quote = await client.quote_pin88(
        _proven_event_ref(),
        {"bet_type": 1, "team_select": 0, "handicap": 0},
    )

    assert quote["status"] == "RATE_LIMITED"
    assert quote["error_code"] == "PMM_RATE_LIMITED"
    assert quote["retry_after_sec"] == pytest.approx(2.0)
    assert client._http.post_calls == 2
    assert sleep_calls == [2.0]
