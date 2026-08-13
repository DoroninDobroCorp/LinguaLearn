import asyncio
from types import SimpleNamespace

import aiohttp


from services.bia_client import BiaOffersEventMsg
from services.bia_event_hydration import _apply_bia_event_markets


def test_apply_bia_event_markets_merges_bulk_snapshot(monkeypatch):
    import services.bia_observer as obs
    from state import state

    orig_events = state.events_data
    orig_signatures = state.bia_specials_signature
    try:
        monkeypatch.setattr(
            state,
            "events_data",
            {
                101: {
                    "Pid": 101,
                    "SportName": "Soccer",
                    "Home": "FC Barcelona",
                    "Away": "Atletico Madrid",
                    "Periods": [
                        {"Number": 0, "CorrectScore": {"2:1": {"value": 9.59}}},
                        {"Number": 1},
                    ],
                }
            },
            raising=False,
        )
        monkeypatch.setattr(state, "bia_specials_signature", {}, raising=False)
        monkeypatch.setattr(obs, "_stamp_bia_confirmation_scope", lambda *_args, **_kwargs: None)

        result = asyncio.run(
            _apply_bia_event_markets(
                101,
                {"sport_code": "fb", "swapped": False},
                {
                    "cs": [[1, 0], [["", 8.5]]],
                    "dc": [None, [["a,d", 2.689], ["h,a", 1.235], ["h,d", 1.196]]],
                    "exact_total": [2, [["", 1.892]]],
                    "gr": [[4, 6], [["", 5.6]]],
                    "proposition,Team Props,Either Team To Score?": [None, [["No", 26.19], ["Yes", 1.022]]],
                    "proposition,Team Props,First Team To Score": [
                        None,
                        [["Atletico Madrid", 3.03], ["Barcelona", 1.483], ["Neither", 26.13]],
                    ],
                    "wm": [1, [["h", 4.8], ["a", 5.1]]],
                },
            )
        )

        assert result["status"] == "applied"
        assert set(result["market_keys"]) == {
            "CorrectScore",
            "DoubleChance",
            "EitherTeamToScore",
            "ExactTotalGoals",
            "FirstTeamToScore",
            "TotalGoalsRange",
            "WinningMargin",
        }
        p0 = state.events_data[101]["Periods"][0]
        assert p0["CorrectScore"]["1:0"]["value"] == 8.5
        assert p0["CorrectScore"]["2:1"]["value"] == 9.59
        assert p0["DoubleChance"]["W1X"]["value"] == 1.196
        assert p0["DoubleChance"]["W12"]["value"] == 1.235
        assert p0["DoubleChance"]["WX2"]["value"] == 2.689
        assert p0["EitherTeamToScore"]["Yes"]["value"] == 1.022
        assert p0["ExactTotalGoals"]["2"]["value"] == 1.892
        assert p0["FirstTeamToScore"]["Home"]["value"] == 1.483
        assert p0["FirstTeamToScore"]["Away"]["value"] == 3.03
        assert p0["FirstTeamToScore"]["Neither"]["value"] == 26.13
        assert p0["TotalGoalsRange"]["4-6"]["value"] == 5.6
        assert p0["WinningMargin"]["Home By 1"]["value"] == 4.8
        assert p0["WinningMargin"]["Away By 1"]["value"] == 5.1
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)
        monkeypatch.setattr(state, "bia_specials_signature", orig_signatures, raising=False)


def test_hydrate_bia_event_snapshot_accepts_offers_event(monkeypatch):
    import services.bia_event_hydration as hydration
    import services.bia_observer as obs
    from state import state

    class _FakeWS:
        def __init__(self):
            self.sent = []
            self._messages = [
                SimpleNamespace(type=aiohttp.WSMsgType.TEXT, data="offers-event-frame"),
                SimpleNamespace(type=aiohttp.WSMsgType.CLOSE, data=None, extra=None),
            ]

        async def send_json(self, payload):
            self.sent.append(payload)

        async def receive(self):
            return self._messages.pop(0)

    class _FakeWSCtx:
        def __init__(self, ws):
            self._ws = ws

        async def __aenter__(self):
            return self._ws

        async def __aexit__(self, *exc):
            return False

    class _FakeHttp:
        def __init__(self, ws):
            self._ws = ws

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        def ws_connect(self, *_args, **_kwargs):
            return _FakeWSCtx(self._ws)

    class _FakeBiaSession:
        def __init__(self, http):
            self._http = http

        async def ensure_token(self):
            return "tok"

        def ws_url(self):
            return "wss://example.test/cpricefeed"

    async def _fake_apply(event_id, event_ref, markets):
        assert event_id == 101
        assert event_ref["sport_code"] == "fb"
        assert markets == {"cs": [[[2, 1], [["", 9.838]]]]}
        return {"status": "applied", "period": 0, "market_keys": ["CorrectScore"]}

    orig_events = state.events_data
    try:
        fake_ws = _FakeWS()
        monkeypatch.setattr(
            state,
            "events_data",
            {
                101: {
                    "Pid": 101,
                    "SportName": "Soccer",
                    "Periods": [{"Number": 0}],
                }
            },
            raising=False,
        )
        monkeypatch.setattr(
            obs,
            "lookup_bia_event_for_pid",
            lambda event_id, period=0: {
                "comp_id": "28",
                "sport_code": "fb",
                "event_key": "evt1",
                "swapped": False,
            } if int(event_id) == 101 and int(period) == 0 else None,
        )
        monkeypatch.setattr(hydration, "BiaSession", _FakeBiaSession)
        monkeypatch.setattr(hydration.aiohttp, "ClientSession", lambda *args, **kwargs: _FakeHttp(fake_ws))
        monkeypatch.setattr(hydration, "_make_ssl_ctx", lambda: None)
        monkeypatch.setattr(
            hydration,
            "parse_cpricefeed_frame",
            lambda _text: [
                BiaOffersEventMsg(
                    raw=["offers_event", [28, "fb", "evt1"], {"cs": [[[2, 1], [["", 9.838]]]]}],
                    event_header=[28, "fb", "evt1"],
                    markets={"cs": [[[2, 1], [["", 9.838]]]]},
                )
            ],
        )
        monkeypatch.setattr(hydration, "_apply_bia_event_markets", _fake_apply)

        result = asyncio.run(hydration.hydrate_bia_event_snapshot(101, periods=(0,), timeout_sec=1))

        assert result["status"] == "ok"
        assert result["updated_periods"] == 1
        assert result["periods"]["0"]["watch_event_sent"] is True
        assert result["periods"]["0"]["watch_hcaps_sent"] is True
        assert result["periods"]["0"]["offers_seen"] == 1
        assert result["periods"]["0"]["apply_results"] == [
            {"status": "applied", "period": 0, "market_keys": ["CorrectScore"]}
        ]
        assert fake_ws.sent == [
            ["watch_event", [28, "fb", "evt1"]],
            ["watch_hcaps", [[28, "fb", "evt1"]]],
        ]
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)
