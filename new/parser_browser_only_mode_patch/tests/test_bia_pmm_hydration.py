import asyncio

from services.bia_pmm_hydration import hydrate_bia_supported_outcomes


def test_hydrate_bia_supported_outcomes_merges_available_quotes(monkeypatch):
    import services.bia_observer as obs
    import services.bia_pmm_hydration as hydration
    from state import state

    orig_events = state.events_data
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

        def fake_lookup(event_id: int, *, period: int = 0):
            assert event_id == 101
            if period == 0:
                return {
                    "sport_code": "fb",
                    "event_key": "2026-04-08,187,173",
                    "swapped": False,
                }
            return None

        def fake_stamp(*_args, **_kwargs):
            return None

        monkeypatch.setattr(obs, "lookup_bia_event_for_pid", fake_lookup)
        monkeypatch.setattr(obs, "_stamp_bia_confirmation_scope", fake_stamp)
        async def fake_snapshot(event_id: int, *, periods=None, timeout_sec=None):
            assert event_id == 101
            assert periods == (0,)
            return {"status": "ok", "updated_periods": 0, "periods": {}}

        monkeypatch.setattr(hydration, "hydrate_bia_event_snapshot", fake_snapshot)

        class _FakeClient:
            async def quote_pin88(self, event_ref, selection):
                assert event_ref["sport_code"] == "fb"
                if (
                    selection.get("special_type") == "correct_score"
                    and selection.get("contestant") == "0:0"
                ):
                    return {"status": "OK", "odds": 8.11}
                if (
                    selection.get("special_type") == "exact_total_goals"
                    and selection.get("contestant") == "3"
                ):
                    return {"status": "OK", "odds": 4.50}
                return {"status": "UNAVAILABLE", "error_code": "PIN88_NOT_OFFERED"}

        summary = asyncio.run(
            hydrate_bia_supported_outcomes(101, periods=(0,), client=_FakeClient())
        )

        assert summary["status"] == "ok"
        assert summary["snapshot_refresh"]["status"] == "ok"
        assert summary["updated_total"] == 2
        p0 = state.events_data[101]["Periods"][0]
        assert p0["CorrectScore"]["0:0"]["value"] == 8.11
        assert p0["CorrectScore"]["2:1"]["value"] == 9.59
        assert p0["ExactTotalGoals"]["3"]["value"] == 4.50
        assert "CorrectScore|2:1" in summary["periods"]["0"]["already_present"]
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)


def test_hydrate_bia_supported_outcomes_prefers_snapshot_markets(monkeypatch):
    import services.bia_observer as obs
    import services.bia_pmm_hydration as hydration
    from state import state

    orig_events = state.events_data
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

        def fake_lookup(event_id: int, *, period: int = 0):
            assert event_id == 101
            if period == 0:
                return {
                    "sport_code": "fb",
                    "event_key": "2026-04-08,187,173",
                    "swapped": False,
                }
            return None

        def fake_stamp(*_args, **_kwargs):
            return None

        selections: list[tuple[str, str]] = []

        async def fake_snapshot(event_id: int, *, periods=None, timeout_sec=None):
            assert event_id == 101
            assert periods == (0,)
            state.events_data[101]["Periods"][0]["ExactTotalGoals"] = {"3": {"value": 4.50}}
            return {"status": "ok", "updated_periods": 1, "periods": {"0": {"offers_seen": 1}}}

        monkeypatch.setattr(obs, "lookup_bia_event_for_pid", fake_lookup)
        monkeypatch.setattr(obs, "_stamp_bia_confirmation_scope", fake_stamp)
        monkeypatch.setattr(hydration, "hydrate_bia_event_snapshot", fake_snapshot)

        class _FakeClient:
            async def quote_pin88(self, event_ref, selection):
                selections.append(
                    (
                        str(selection.get("special_type") or ""),
                        str(selection.get("contestant") or ""),
                    )
                )
                if (
                    selection.get("special_type") == "correct_score"
                    and selection.get("contestant") == "0:0"
                ):
                    return {"status": "OK", "odds": 8.11}
                return {"status": "UNAVAILABLE", "error_code": "PIN88_NOT_OFFERED"}

        summary = asyncio.run(
            hydrate_bia_supported_outcomes(101, periods=(0,), client=_FakeClient())
        )

        assert summary["status"] == "ok"
        assert summary["snapshot_refresh"]["updated_periods"] == 1
        assert summary["updated_total"] == 1
        assert ("exact_total_goals", "3") not in selections
        assert "ExactTotalGoals|3" in summary["periods"]["0"]["already_present"]
        assert state.events_data[101]["Periods"][0]["ExactTotalGoals"]["3"]["value"] == 4.50
    finally:
        monkeypatch.setattr(state, "events_data", orig_events, raising=False)
