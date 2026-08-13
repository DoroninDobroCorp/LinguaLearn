"""tests/test_fleet_runtime.py -- Story 27.40 fleet runtime tests.

Tests fleet lifecycle (FleetAccountPool, replacements_needed), Supervisor
hot-swap, Worker with fake browser (no real network/Chrome), fan-in, flag off.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import pytest

from aggregator.account_pool import (
    FLEET_ACTIVE,
    FleetAccount,
    FleetAccountPool,
    replacements_needed,
)
from aggregator.fleet.account_sport_supervisor import AccountSportFleetSupervisor, assign_sports_to_accounts
from aggregator.fleet.rotating_supervisor import RotatingFleetSupervisor
from aggregator.fleet.sport_allocation import SportSpec
from aggregator.fleet.supervisor import Supervisor, assign_ports, classify_failure
from aggregator.fleet.worker import (
    MultiSportWorker,
    Worker,
    export_parser_owned_session,
    normalize_full_odds,
    raw_event_counts_by_key,
    silent_drop_alert,
    sub_body,
)


@pytest.mark.asyncio
async def test_export_parser_owned_session_is_bet_service_usable(tmp_path) -> None:
    class FakeContext:
        async def cookies(self) -> list[dict[str, Any]]:
            return [{"name": "sid", "value": "abc", "domain": ".pinnacle888.com", "path": "/"}]

    class FakePage:
        url = "https://www.pinnacle888.com/en/compact/sports/soccer/29/"

        async def evaluate(self, script: str, arg: Any = None) -> str:
            if "v-hucode" in script:
                return "vh"
            if "x-app-data" in script:
                return "xad"
            return ""

    target = tmp_path / "bet-session.json"
    payload = await export_parser_owned_session(FakePage(), FakeContext(), str(target))

    assert payload["v_hucode"] == "vh"
    assert payload["x_app_data"] == "xad"
    assert payload["runtime_site_host"] == "www.pinnacle888.com"
    assert target.stat().st_mode & 0o777 == 0o600


def _pool(n: int = 3, **kw: float) -> FleetAccountPool:
    accs = [FleetAccount(id="a%d" % i, cfg={"proxy_host": "127.0.0.1", "proxy_port": "1080", "cdp": str(9300+i), "socks": str(19300+i)}) for i in range(n)]
    return FleetAccountPool(accs, **kw)


def test_fleet_pool_acquire_marks_active() -> None:
    pool = _pool(3)
    acc = pool.acquire(now=100.0)
    assert acc is not None
    assert acc.status == FLEET_ACTIVE
    assert pool.active_count() == 1
    assert pool.reserve_count(100.0) == 2


def test_fleet_pool_acquire_exhausted_returns_none() -> None:
    pool = _pool(1)
    assert pool.acquire(0.0) is not None
    assert pool.acquire(0.0) is None


def test_fleet_pool_release_cooldown_then_recover() -> None:
    pool = _pool(2, cooldown_sec=120.0)
    acc = pool.acquire(now=0.0)
    assert acc is not None
    pool.release(now=10.0, acc_id=acc.id, reason="transient")
    assert pool.reserve_count(now=10.0) == 1
    assert pool.cooldown_count(now=10.0) == 1
    assert pool.reserve_count(now=131.0) == 2


def test_fleet_pool_release_ok_immediately_recovers() -> None:
    pool = _pool(1, cooldown_sec=120.0, success_cooldown_sec=0.0)
    acc = pool.acquire(now=0.0)
    assert acc is not None
    pool.release(now=10.0, acc_id=acc.id, reason="ok")
    assert pool.cooldown_count(now=10.0) == 0
    assert pool.reserve_count(now=10.0) == 1
    assert pool.next_available_at(now=10.0) is None


def test_fleet_pool_next_available_at_reports_cooldown_expiry() -> None:
    pool = _pool(1, cooldown_sec=120.0)
    acc = pool.acquire(now=0.0)
    assert acc is not None
    pool.release(now=10.0, acc_id=acc.id, reason="transient")
    assert pool.next_available_at(now=11.0) == 130.0
    assert pool.next_available_at(now=131.0) is None


def test_fleet_pool_release_lockout_24h() -> None:
    pool = _pool(2, lock_sec=86400.0)
    acc = pool.acquire(now=0.0)
    assert acc is not None
    pool.release(now=5.0, acc_id=acc.id, reason="429")
    assert pool.locked_count(now=5.0) == 1
    assert pool.reserve_count(now=3605.0) == 1
    assert pool.locked_count(now=86406.0) == 0


def test_fleet_pool_reserve_count() -> None:
    pool = _pool(5)
    pool.acquire(0.0)
    pool.acquire(0.0)
    assert pool.reserve_count(0.0) == 3


def test_replacements_needed_basic() -> None:
    assert replacements_needed(target_k=5, healthy_active=3, reserve=4) == 2


def test_replacements_needed_capped_by_reserve() -> None:
    assert replacements_needed(target_k=5, healthy_active=1, reserve=1) == 1


def test_replacements_needed_none_when_full() -> None:
    assert replacements_needed(target_k=3, healthy_active=3, reserve=5) == 0


def test_fleet_pool_snapshot_shape() -> None:
    pool = _pool(4)
    pool.acquire(0.0)
    snap = pool.snapshot(now=0.0)
    assert snap == {"total": 4, "active": 1, "reserve": 3, "cooldown": 0, "locked": 0}


def test_fleet_pool_does_not_break_canonical_pick() -> None:
    from aggregator.account_pool import Account, AccountPool, MoreBetsBudget
    from aggregator.account_fsm import AccountFSM, AccountState
    pool = AccountPool()
    acc = Account(
        account_id="a1", family="pin888", current_transport="direct_ws",
        supported_transports={"direct_ws"},
        more_bets_budget=MoreBetsBudget(cap=30, window_sec=60.0),
        fsm=AccountFSM(state=AccountState.HEALTHY_DIRECT_WS, hysteresis_ticks_required=1),
    )
    pool.register(acc)
    picked = pool.pick("pin888")
    assert picked is not None and picked.account_id == "a1"


def test_classify_failure_lockout() -> None:
    assert classify_failure("FAIL: 429 at rate") == "lockout"
    assert classify_failure("FAIL: close 1006") == "lockout"
    assert classify_failure("FAIL: rate limit") == "lockout"


def test_classify_failure_ok_and_transient() -> None:
    assert classify_failure("DONE") == "ok"
    assert classify_failure("FAIL: NO_WS") == "transient"
    assert classify_failure("FAIL: CDP") == "transient"


def test_assign_ports_unique() -> None:
    p0 = assign_ports(0)
    p1 = assign_ports(1)
    assert p0 == (9300, 19300)
    assert p1 == (9301, 19301)
    assert p0[0] != p1[0] and p0[1] != p1[1]


def test_assign_ports_custom_bases() -> None:
    assert assign_ports(2, cdp_base=12300, socks_base=22300) == (12302, 22302)


def test_normalize_full_odds_extracts_events() -> None:
    frame = {
        "type": "FULL_ODDS",
        "btg": "42.5",
        "odds": {
            "l": [
                [29, {}, [[999, {}, [[1600000001, 1, 2], [1600000002, 3, 4]]]]]
            ]
        },
    }
    result = normalize_full_odds(frame, sport=29)
    assert len(result) == 2
    pids = {r["Pid"] for r in result}
    assert pids == {1600000001, 1600000002}
    assert all(r["SportId"] == 29 for r in result)
    assert all(r["_v"] == 42.5 for r in result)


def test_normalize_full_odds_extracts_update_events() -> None:
    frame = {
        "type": "UPDATE_ODDS",
        "btg": "42.5",
        "odds": {
            "u": [
                [19, {}, [[999, {}, [[1600000019, 1, 2], [1600000020, 3, 4]]]]]
            ]
        },
    }
    result = normalize_full_odds(frame, sport=19)
    assert {r["Pid"] for r in result} == {1600000019, 1600000020}
    assert all(r["SportId"] == 19 for r in result)


def test_raw_event_counts_by_key_reports_live_prematch_update() -> None:
    odds = {
        "l": [[29, {}, [[1, {}, [[1600000001, 1, 2]]]]]],
        "n": [[29, {}, [[1, {}, [[1600000002, 1, 2], [1600000003, 1, 2]]]]]],
        "u": [[29, {}, [[1, {}, [[1600000004, 1, 2]]]]]],
    }

    assert raw_event_counts_by_key(odds, 29) == {"l": 1, "n": 2, "u": 1}


def test_sub_body_uses_confirmed_hockey_mk_override() -> None:
    assert sub_body(29)["mk"] == 3
    assert sub_body(19)["mk"] == 0


class _FakeFleetPage:
    def __init__(self, send_results: list[bool] | None = None) -> None:
        self.sent: list[str] = []
        self.frames: list[str] = []
        self.send_results = list(send_results or [])
        self.goto_calls: list[str] = []

    def on(self, *_args: Any, **_kwargs: Any) -> None:
        return None

    async def evaluate(self, js: str, arg: Any = None) -> Any:
        if "window.__fr.slice" in js:
            frames = list(self.frames)
            self.frames.clear()
            return frames
        if arg is not None and "window.__ws" in js:
            self.sent.append(str(arg))
            if self.send_results:
                return self.send_results.pop(0)
            return True
        if "window.__ws&&window.__ws.readyState" in js:
            return 1
        return None

    async def goto(self, url: str, **_kwargs: Any) -> None:
        self.goto_calls.append(url)

    async def wait_for_timeout(self, _ms: int) -> None:
        return None


@pytest.mark.asyncio
async def test_worker_periodically_resends_mk3_snapshot() -> None:
    page = _FakeFleetPage()
    worker = Worker(
        label="a0",
        sport=29,
        slug="soccer",
        on_event=lambda _event: None,
        cfg={"resnapshot_sec": "0.2"},
    )

    await worker._loop(page, run_sec=0.65, watchlist=[])

    assert len(page.sent) >= 1
    assert all('"mk": 3' in payload and '"v": "0"' in payload for payload in page.sent)


@pytest.mark.asyncio
async def test_worker_recovers_sport_tab_when_resnapshot_send_fails() -> None:
    page = _FakeFleetPage(send_results=[False, True])
    worker = Worker(
        label="a0",
        sport=12,
        slug="e-sports",
        on_event=lambda _event: None,
        cfg={"resnapshot_sec": "0.2"},
    )

    await worker._loop(page, run_sec=0.65, watchlist=[])

    assert page.goto_calls == ["https://www.ps3838.com/en/compact/sports/e-sports/12/"]
    assert worker.reconnects == 1
    assert len(page.sent) >= 2


@pytest.mark.asyncio
async def test_multi_sport_worker_periodically_resends_each_sport_snapshot() -> None:
    page1 = _FakeFleetPage()
    page2 = _FakeFleetPage()
    worker = MultiSportWorker(
        label="a0",
        sports=[SportSpec("soccer", 29), SportSpec("tennis", 33)],
        on_event=lambda _event: None,
        cfg={"resnapshot_sec": "0.2"},
    )

    await worker._loop_multi(
        [(page1, 29, "soccer"), (page2, 33, "tennis")],
        run_sec=0.65,
        watchlist=[],
    )

    assert len(page1.sent) >= 1
    assert len(page2.sent) >= 1
    assert all('"mk": 3' in payload and '"v": "0"' in payload for payload in page1.sent)
    assert all('"mk": 3' in payload and '"v": "0"' in payload for payload in page2.sent)


def _six_sports() -> list[SportSpec]:
    return [
        SportSpec("soccer", 29),
        SportSpec("tennis", 33),
        SportSpec("basketball", 4),
        SportSpec("hockey", 19),
        SportSpec("volleyball", 34),
        SportSpec("e-sports", 12),
    ]


def test_account_sport_assignment_splits_sports_across_accounts() -> None:
    accounts = [
        FleetAccount(id="a0", cfg={}),
        FleetAccount(id="a1", cfg={}),
    ]

    assignment = assign_sports_to_accounts(accounts, _six_sports())

    assert [sport.slug for sport in assignment["a0"]] == ["soccer", "basketball", "volleyball"]
    assert [sport.slug for sport in assignment["a1"]] == ["tennis", "hockey", "e-sports"]


def test_account_sport_assignment_single_account_gets_all_sports() -> None:
    accounts = [FleetAccount(id="a0", cfg={})]

    assignment = assign_sports_to_accounts(accounts, _six_sports())

    assert [sport.slug for sport in assignment["a0"]] == [
        "soccer",
        "tennis",
        "basketball",
        "hockey",
        "volleyball",
        "e-sports",
    ]


def test_account_sport_assignment_accepts_explicit_account_spec() -> None:
    accounts = [
        FleetAccount(id="TEST_LOGIN", cfg={}),
        FleetAccount(id="TEST_LOGIN", cfg={}),
    ]

    assignment = assign_sports_to_accounts(
        accounts,
        _six_sports(),
        "TEST_LOGIN=soccer;TEST_LOGIN=tennis,basketball,hockey,volleyball,e-sports",
    )

    assert [sport.slug for sport in assignment["TEST_LOGIN"]] == ["soccer"]
    assert [sport.slug for sport in assignment["TEST_LOGIN"]] == [
        "tennis",
        "basketball",
        "hockey",
        "volleyball",
        "e-sports",
    ]


@pytest.mark.asyncio
async def test_account_sport_supervisor_uses_one_worker_per_account() -> None:
    captured: list[tuple[str, list[str], dict[str, Any]]] = []

    class FakeMultiWorker:
        def __init__(
            self,
            label: str,
            sports: list[SportSpec],
            on_event: Any,
            cfg: dict[str, Any] | None = None,
            **_: Any,
        ) -> None:
            self.label = label
            self.sports = list(sports)
            self.on_event = on_event
            self.cfg = dict(cfg or {})
            captured.append((label, [sport.slug for sport in sports], self.cfg))

        async def run(
            self,
            run_sec: float,
            watchlist: list[int] | None = None,
        ) -> dict[str, Any]:
            await asyncio.sleep(0.001)
            return {"label": self.label, "status": "DONE", "events_emitted": 0}

    accounts = [
        FleetAccount(id="a0", cfg={"proxy_host": "127.0.0.1", "proxy_port": "1080"}),
        FleetAccount(id="a1", cfg={"proxy_host": "127.0.0.2", "proxy_port": "1080"}),
    ]
    sup = AccountSportFleetSupervisor(
        accounts=accounts,
        sports=_six_sports(),
        on_event=lambda _f: None,
        worker_run_sec=0.01,
        _worker_cls=FakeMultiWorker,  # type: ignore[arg-type]
    )

    await sup.run(total_sec=0.03)

    first_wave = captured[:2]
    assert {item[0] for item in first_wave} == {"a0", "a1"}
    assert {tuple(item[1]) for item in first_wave} == {
        ("soccer", "basketball", "volleyball"),
        ("tennis", "hockey", "e-sports"),
    }
    assert all("cdp" in item[2] and "socks" in item[2] for item in first_wave)


def test_normalize_full_odds_parses_period_prices() -> None:
    frame = {
        "type": "FULL_ODDS",
        "btg": "7",
        "time": 1780000000000,
        "odds": {
            "l": [
                [
                    29,
                    {},
                    [
                        [
                            999,
                            "Test League",
                            [
                                [
                                    1600000001,
                                    "Home FC",
                                    "Away FC",
                                    0,
                                    0,
                                    None,
                                    None,
                                    None,
                                    {"0": [[], [], [2.10, 1.90, 3.40]]},
                                ]
                            ],
                        ]
                    ],
                ]
            ]
        },
    }
    result = normalize_full_odds(frame, sport=29)
    assert len(result) == 1
    event = result[0]
    assert event["Pid"] == 1600000001
    assert event["SportId"] == 29
    assert event["Periods"][0]["Win1x2"]["Win1"]["value"] == 1.90
    assert event["Periods"][0]["Win1x2"]["Win2"]["value"] == 2.10
    assert event["Periods"][0]["Win1x2"]["WinNone"]["value"] == 3.40


def test_normalize_full_odds_empty_on_wrong_sport() -> None:
    frame = {"type": "FULL_ODDS", "btg": "1", "odds": {"l": [[33, {}, [[1, {}, [[1600000001, 1]]]]]]}}
    assert normalize_full_odds(frame, sport=29) == []


def test_normalize_full_odds_pid_threshold() -> None:
    frame = {"type": "FULL_ODDS", "btg": "1", "odds": {"l": [[29, {}, [[1, {}, [[1234567, 1]]]]]]}}
    assert normalize_full_odds(frame, sport=29) == []


class FakeWorker(Worker):
    """Fake Worker for Supervisor tests: returns configurable result quickly."""

    def __init__(self, label: str, sport: int, slug: str,
                 on_event: Any, cfg: Any = None) -> None:
        super().__init__(label=label, sport=sport, slug=slug, on_event=on_event, cfg=cfg)
        self._result: dict[str, Any] = {"label": label, "status": "FAIL: NO_WS"}
        self._sleep_sec: float = 0.01

    async def run(self, run_sec: float, watchlist: list[int] | None = None) -> dict[str, Any]:
        await asyncio.sleep(self._sleep_sec)
        return self._result


@pytest.mark.asyncio
async def test_supervisor_holds_target_k() -> None:
    pool = _pool(5)
    sup = Supervisor(pool=pool, on_event=lambda f: None, target_k=3, worker_run_sec=0.02, _worker_cls=FakeWorker)
    await sup.run(total_sec=0.05)
    assert sup.spawned >= 3


@pytest.mark.asyncio
async def test_supervisor_uses_custom_port_bases() -> None:
    captured_cfgs: list[dict[str, Any]] = []

    class CaptureWorker(FakeWorker):
        def __init__(
            self,
            label: str,
            sport: int,
            slug: str,
            on_event: Any,
            cfg: Any = None,
        ) -> None:
            captured_cfgs.append(dict(cfg or {}))
            super().__init__(label=label, sport=sport, slug=slug, on_event=on_event, cfg=cfg)

    pool = FleetAccountPool(
        [FleetAccount(id="a0", cfg={"proxy_host": "127.0.0.1", "proxy_port": "1080"})]
    )
    sup = Supervisor(
        pool=pool,
        on_event=lambda f: None,
        target_k=1,
        worker_run_sec=0.01,
        cdp_base=12300,
        socks_base=22300,
        _worker_cls=CaptureWorker,
    )
    await sup.run(total_sec=0.02)

    assert captured_cfgs
    assert captured_cfgs[0]["cdp"] == 12300
    assert captured_cfgs[0]["socks"] == 22300


@pytest.mark.asyncio
async def test_supervisor_hot_swap_on_failure() -> None:
    pool = _pool(6)
    sup = Supervisor(pool=pool, on_event=lambda f: None, target_k=3, worker_run_sec=0.01, _worker_cls=FakeWorker)
    await sup.run(total_sec=0.15)
    assert sup.swaps > 0


@pytest.mark.asyncio
async def test_supervisor_waits_for_cooldown_when_all_workers_done() -> None:
    """Regression: no active tasks + temporary cooldown must not end run early."""

    class QuickDoneWorker(Worker):
        async def run(
            self,
            run_sec: float,
            watchlist: list[int] | None = None,
        ) -> dict[str, Any]:
            await asyncio.sleep(0.001)
            return {"label": self.label, "status": "DONE"}

    pool = _pool(1, cooldown_sec=0.02)
    sup = Supervisor(
        pool=pool,
        on_event=lambda f: None,
        target_k=1,
        worker_run_sec=0.01,
        _worker_cls=QuickDoneWorker,
    )
    await sup.run(total_sec=0.07)
    assert sup.spawned >= 2


@pytest.mark.asyncio
async def test_supervisor_isolation_one_fails() -> None:
    pool = _pool(6)
    events: list[dict[str, Any]] = []

    class GoodWorker(Worker):
        async def run(self, run_sec: float, watchlist: list[int] | None = None) -> dict[str, Any]:
            await asyncio.sleep(0.01)
            return {"label": self.label, "status": "DONE"}

    class BadWorker(Worker):
        async def run(self, run_sec: float, watchlist: list[int] | None = None) -> dict[str, Any]:
            raise RuntimeError("crash")

    call_count = [0]

    def factory(label: str, sport: int, slug: str, on_event: Any, cfg: Any = None) -> Worker:
        call_count[0] += 1
        if call_count[0] == 1:
            return BadWorker(label=label, sport=sport, slug=slug, on_event=on_event, cfg=cfg)
        return GoodWorker(label=label, sport=sport, slug=slug, on_event=on_event, cfg=cfg)

    sup = Supervisor(pool=pool, on_event=events.append, target_k=3, worker_run_sec=0.01, _worker_cls=factory)  # type: ignore[arg-type]
    await sup.run(total_sec=0.15)
    assert sup.failures[0]["reason"] in ("transient", "ok")
    assert sup.spawned >= 3


@pytest.mark.asyncio
async def test_worker_loop_emits_events_fake_browser() -> None:
    events: list[dict[str, Any]] = []
    worker = Worker(label="t1", sport=29, slug="soccer", on_event=events.append)

    import json as _json
    frame = {"type": "FULL_ODDS", "btg": "1", "odds": {
        "l": [[29, {}, [[1, {}, [[1600000001, 1, 2]]]]]]}}
    drain_calls = [0]

    class FakePg:
        async def evaluate(self, js: str, arg: Any = None) -> Any:
            if "__fr" in js:
                drain_calls[0] += 1
                if drain_calls[0] == 1:
                    return [_json.dumps(frame)]
                return []
            return None
        async def wait_for_timeout(self, ms: int) -> None:
            pass

    await worker._loop(FakePg(), run_sec=0.05, watchlist=[])
    assert len(events) == 1
    assert events[0]["Pid"] == 1600000001
    assert worker.events_emitted == 1


@pytest.mark.asyncio
async def test_worker_loop_morebet_rate_limit() -> None:
    """Worker sends MORE_BET at most once per MIN_INTERVAL."""
    sent: list[Any] = []
    worker = Worker(label="t2", sport=29, slug="soccer", on_event=lambda f: None)

    class FakePg2:
        async def evaluate(self, js: str, arg: Any = None) -> Any:
            if "__fr" in js:
                return []
            if "MORE_BET" in str(arg or ""):
                sent.append(arg)
            return None
        async def wait_for_timeout(self, ms: int) -> None:
            pass

    await worker._loop(FakePg2(), run_sec=0.6, watchlist=[1600000001, 1600000002])
    assert worker.morebet_sent <= 1


@pytest.mark.asyncio
async def test_worker_exception_isolation() -> None:
    """Worker run() isolates exceptions and returns FAIL status."""
    worker = Worker(
        label="bad", sport=29, slug="soccer", on_event=lambda f: None,
        cfg={"proxy_host": ""},
    )
    result = await worker.run(run_sec=1.0, watchlist=[])
    assert "FAIL" in result["status"]


@pytest.mark.asyncio
async def test_worker_direct_mode_skips_proxy_requirement() -> None:
    worker = Worker(
        label="direct",
        sport=29,
        slug="soccer",
        on_event=lambda f: None,
        cfg={"direct_mode": "1"},
    )

    result = await worker.run(run_sec=0.1)

    assert result["status"] == "FAIL: NO_PORTS"


@pytest.mark.asyncio
async def test_fan_in_three_workers_to_ingest() -> None:
    """Fan-in: 3 workers via on_event -> common collector receives events from all three."""
    collected: list[dict[str, Any]] = []

    class FanWorker(Worker):
        async def run(self, run_sec: float, watchlist: list[int] | None = None) -> dict[str, Any]:
            # Stable numeric Pid from label (works with a0, a1, etc.)
            pid = abs(hash(self.label)) % (10 ** 9) + 1_600_000_001
            self.on_event({"Pid": pid, "SportId": 29, "_v": 1.0, "raw": []})
            return {"label": self.label, "status": "DONE"}

    pool = _pool(5)
    sup = Supervisor(pool=pool, on_event=collected.append, target_k=3, worker_run_sec=0.01, _worker_cls=FanWorker)
    await sup.run(total_sec=0.15)
    pids = {e["Pid"] for e in collected}
    assert len(pids) >= 3  # target_k workers each emit; hot-swap may add more


def test_fleet_flag_off_supervisor_not_created() -> None:
    """When MOREBETS_FLEET_ENABLED is not set, fleet wiring predicate returns False."""
    import os
    orig = os.environ.get("MOREBETS_FLEET_ENABLED")
    try:
        os.environ.pop("MOREBETS_FLEET_ENABLED", None)
        from aggregator.main import _morebets_fleet_enabled
        assert _morebets_fleet_enabled() is False
    finally:
        if orig is not None:
            os.environ["MOREBETS_FLEET_ENABLED"] = orig


def test_fleet_flag_on_returns_true() -> None:
    import os
    orig = os.environ.get("MOREBETS_FLEET_ENABLED")
    try:
        os.environ["MOREBETS_FLEET_ENABLED"] = "1"
        from aggregator.main import _morebets_fleet_enabled
        assert _morebets_fleet_enabled() is True
    finally:
        if orig is not None:
            os.environ["MOREBETS_FLEET_ENABLED"] = orig
        else:
            os.environ.pop("MOREBETS_FLEET_ENABLED", None)


def test_fleet_require_watchlist_defaults_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MOREBETS_FLEET_REQUIRE_WATCHLIST", raising=False)
    from aggregator.main import _morebets_fleet_require_watchlist

    assert _morebets_fleet_require_watchlist() is True


def test_fleet_require_watchlist_can_be_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MOREBETS_FLEET_REQUIRE_WATCHLIST", "0")
    from aggregator.main import _morebets_fleet_require_watchlist

    assert _morebets_fleet_require_watchlist() is False


def test_fleet_start_wait_sec_invalid_uses_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MOREBETS_FLEET_START_WAIT_SEC", "not-a-number")
    from aggregator.main import _morebets_fleet_start_wait_sec

    assert _morebets_fleet_start_wait_sec() == 30.0


def test_wait_for_initial_watchlist_returns_immediate_targets() -> None:
    import threading
    from aggregator.main import _wait_for_initial_watchlist

    assert _wait_for_initial_watchlist(lambda: [101, 202], threading.Event(), 0.0) == [101, 202]


def test_fleet_supervisor_start_state_blocks_without_accounts() -> None:
    from aggregator.main import _fleet_supervisor_start_state

    should_start, reason = _fleet_supervisor_start_state(
        account_count=0,
        require_watchlist=True,
        initial_watchlist=[101],
    )

    assert should_start is False
    assert reason == "no ps3838 runtime accounts"


def test_fleet_supervisor_start_state_allows_empty_initial_watchlist() -> None:
    from aggregator.main import _fleet_supervisor_start_state

    should_start, reason = _fleet_supervisor_start_state(
        account_count=2,
        require_watchlist=True,
        initial_watchlist=[],
    )

    assert should_start is True
    assert reason == "empty initial watchlist"


def test_fleet_pool_hot_swap_cycle() -> None:
    """Full hot-swap: 3 active, one 429 -> acquire replacement from reserve."""
    pool = _pool(5, cooldown_sec=120.0, lock_sec=86400.0)
    active = pool.acquire_n(now=0.0, n=3)
    assert len(active) == 3
    assert pool.reserve_count(0.0) == 2
    dead = active[0]
    pool.release(now=50.0, acc_id=dead.id, reason="429")
    healthy = 2
    need = replacements_needed(target_k=3, healthy_active=healthy, reserve=pool.reserve_count(50.0))
    assert need == 1
    repl = pool.acquire(now=50.0)
    assert repl is not None and repl.id != dead.id
    assert pool.active_count() == 3
    assert pool.locked_count(50.0) == 1


@pytest.mark.asyncio
async def test_supervisor_uses_fan_in_callback() -> None:
    """Supervisor fan-in: on_event called by workers reaches the callback."""
    received: list[dict[str, Any]] = []

    class EmitWorker(Worker):
        async def run(self, run_sec: float, watchlist: list[int] | None = None) -> dict[str, Any]:
            self.on_event({"source": self.label})
            return {"label": self.label, "status": "DONE"}

    pool = _pool(4)
    sup = Supervisor(pool=pool, on_event=received.append, target_k=2, worker_run_sec=0.01, _worker_cls=EmitWorker)
    await sup.run(total_sec=0.1)
    assert len(received) >= 2



@pytest.mark.asyncio
async def test_worker_429_detection_aborts_morebet() -> None:
    """FIX-4 (P1): HTTP 429 response event - worker stops MORE_BET, _got_429=True."""
    worker = Worker(label="t_429", sport=29, slug="soccer", on_event=lambda f: None)

    captured: list[Any] = []
    sent: list[Any] = []

    class FakePg429:
        def on(self, event: str, handler: Any) -> None:
            if event == "response":
                captured.append(handler)

        async def evaluate(self, js: str, arg: Any = None) -> Any:
            if "__fr" in js:
                if captured and not getattr(self, "_fired", False):
                    object.__setattr__(self, "_fired", True)
                    class _Resp:
                        status = 429
                    captured[0](_Resp())
                return []
            if arg and "MORE_BET" in str(arg):
                sent.append(arg)
            return None

        async def wait_for_timeout(self, ms: int) -> None:
            pass

    await worker._loop(FakePg429(), run_sec=0.3, watchlist=[1600000001])

    assert worker.morebet_sent == 0, "no MORE_BET must be sent after 429"
    assert worker._got_429 is True, "worker must detect 429 and set _got_429"
    assert worker._http_429_count > 0, "429 counter must be > 0"


@pytest.mark.asyncio
async def test_worker_no_429_sends_morebet_normally() -> None:
    """FIX-4 (P1): без 429 - worker отправляет MORE_BET в обычном режиме."""
    worker = Worker(label="t_ok", sport=29, slug="soccer", on_event=lambda f: None)
    sent: list[Any] = []

    class FakePgOk:
        def on(self, event: str, handler: Any) -> None:
            pass

        async def evaluate(self, js: str, arg: Any = None) -> Any:
            if "__fr" in js:
                return []
            if arg and "MORE_BET" in str(arg):
                sent.append(arg)
            return None

        async def wait_for_timeout(self, ms: int) -> None:
            pass

    await worker._loop(FakePgOk(), run_sec=0.3, watchlist=[1600000001])

    assert worker._got_429 is False, "no 429 must not set _got_429"
    assert worker._http_429_count == 0


@pytest.mark.asyncio
async def test_worker_reserve_morebet_blocks_send() -> None:
    """Story 27.41: worker must obey canonical named-account limiter."""
    sent: list[Any] = []
    worker = Worker(
        label="a0",
        sport=29,
        slug="soccer",
        on_event=lambda f: None,
        reserve_morebet=lambda account_id: False,
    )

    class FakePgLimit:
        def on(self, event: str, handler: Any) -> None:
            pass

        async def evaluate(self, js: str, arg: Any = None) -> Any:
            if "__fr" in js:
                return []
            if arg and "MORE_BET" in str(arg):
                sent.append(arg)
            return None

        async def wait_for_timeout(self, ms: int) -> None:
            pass

    await worker._loop(FakePgLimit(), run_sec=0.3, watchlist=[1600000001])

    assert sent == []
    assert worker.morebet_sent == 0


@pytest.mark.asyncio
async def test_worker_counts_morebet_answers_for_silent_drop_ratio() -> None:
    import json as _json

    worker = Worker(label="ratio", sport=29, slug="soccer", on_event=lambda f: None)

    class FakePgAnswer:
        def on(self, event: str, handler: Any) -> None:
            pass

        async def evaluate(self, js: str, arg: Any = None) -> Any:
            if "__fr" in js:
                if not getattr(self, "_done", False):
                    object.__setattr__(self, "_done", True)
                    return [_json.dumps({"type": "MORE_BET", "odds": {}})]
                return []
            return None

        async def wait_for_timeout(self, ms: int) -> None:
            pass

    await worker._loop(FakePgAnswer(), run_sec=0.05, watchlist=[])
    assert worker.morebet_answered == 1


def test_silent_drop_alert_threshold() -> None:
    assert silent_drop_alert(sent=9, answered=0, min_sent=10, min_ratio=0.5) is False
    assert silent_drop_alert(sent=10, answered=4, min_sent=10, min_ratio=0.5) is True
    assert silent_drop_alert(sent=10, answered=5, min_sent=10, min_ratio=0.5) is False


@pytest.mark.asyncio
async def test_supervisor_partitions_watchlist_per_worker() -> None:
    captured: list[list[int]] = []

    class CaptureWorker(Worker):
        async def run(
            self,
            run_sec: float,
            watchlist: list[int] | None = None,
        ) -> dict[str, Any]:
            captured.append(list(watchlist or []))
            return {"label": self.label, "status": "DONE"}

    pool = _pool(2, cooldown_sec=1000.0)
    sup = Supervisor(
        pool=pool,
        on_event=lambda f: None,
        target_k=2,
        worker_run_sec=0.01,
        watchlist_provider=lambda: [10, 11, 12, 13, 14],
        _worker_cls=CaptureWorker,
    )
    await sup.run(total_sec=0.01)

    assert [10, 12, 14] in captured
    assert [11, 13] in captured


@pytest.mark.asyncio
async def test_supervisor_reports_lockout_to_canonical_pool() -> None:
    from aggregator.account_fsm import AccountFSM, AccountState
    from aggregator.account_pool import Account, AccountPool, MoreBetsBudget

    class RateWorker(Worker):
        async def run(
            self,
            run_sec: float,
            watchlist: list[int] | None = None,
        ) -> dict[str, Any]:
            return {"label": self.label, "status": "FAIL: 429"}

    canonical = AccountPool()
    canonical.register(
        Account(
            account_id="a0",
            family="ps3838",
            current_transport="browser_ws",
            supported_transports={"browser_ws"},
            more_bets_budget=MoreBetsBudget(cap=60, window_sec=60.0),
            fsm=AccountFSM(
                state=AccountState.HEALTHY_DIRECT_WS,
                hysteresis_ticks_required=1,
            ),
        )
    )
    pool = FleetAccountPool([FleetAccount(id="a0", cfg={"proxy_host": "127.0.0.1"})])
    sup = Supervisor(
        pool=pool,
        on_event=lambda f: None,
        target_k=1,
        worker_run_sec=0.01,
        canonical_pool=canonical,
        _worker_cls=RateWorker,
    )
    await sup.run(total_sec=0.01)

    acc = canonical.get("a0")
    assert acc is not None
    assert acc.last_429_at is not None


# ### 27.41 keystone fixes


@pytest.mark.asyncio
async def test_worker_morebet_frame_emits_on_event_with_morebets_marker() -> None:
    import json as _json
    events: list[dict] = []
    worker = Worker(label="mb", sport=29, slug="soccer", on_event=events.append)
    morebet_frame = {
        "type": "MORE_BET", "btg": "1.5",
        "odds": {"l": [[29, {}, [[1, {}, [[1600000001, 1, 2]]]]]]},
    }
    class FakePgMB:
        def on(self, event: str, handler: Any) -> None:
            pass
        async def evaluate(self, js: str, arg: Any = None) -> Any:
            if "__fr" in js:
                if not getattr(self, "_done", False):
                    object.__setattr__(self, "_done", True)
                    return [_json.dumps(morebet_frame)]
                return []
            return None
        async def wait_for_timeout(self, ms: int) -> None:
            pass
    await worker._loop(FakePgMB(), run_sec=0.05, watchlist=[])
    assert len(events) == 1
    assert events[0]["market_class"] == "more_bets"
    assert events[0]["Pid"] == 1600000001
    assert worker.morebet_answered == 1
    assert worker.events_emitted == 1


@pytest.mark.asyncio
async def test_worker_full_odds_carries_account_label() -> None:
    import json as _json
    events: list[dict] = []
    raw_frames: list[dict] = []
    worker = Worker(
        label="acc42",
        sport=29,
        slug="soccer",
        on_event=events.append,
        on_raw_frame=raw_frames.append,
    )
    frame = {"type": "FULL_ODDS", "btg": "1",
             "odds": {"l": [[29, {}, [[1, {}, [[1600000002, 1, 2]]]]]]}}
    class FakePgFull:
        def on(self, event: str, handler: Any) -> None:
            pass
        async def evaluate(self, js: str, arg: Any = None) -> Any:
            if "__fr" in js:
                if not getattr(self, "_done", False):
                    object.__setattr__(self, "_done", True)
                    return [_json.dumps(frame)]
                return []
            return None
        async def wait_for_timeout(self, ms: int) -> None:
            pass
    await worker._loop(FakePgFull(), run_sec=0.05, watchlist=[])
    assert len(events) == 1
    assert events[0]["_account"] == "acc42"
    assert events[0]["Pid"] == 1600000002
    assert len(raw_frames) == 1
    assert raw_frames[0]["_account"] == "acc42"
    assert raw_frames[0]["_sport"] == 29


@pytest.mark.asyncio
async def test_worker_morebet_target_provider_and_raw_annotation() -> None:
    import json as _json
    raw_frames: list[dict] = []
    sent: list[int] = []
    targets = [1600000003]
    worker = Worker(
        label="acc-mb",
        sport=29,
        slug="soccer",
        on_event=lambda _frame: None,
        on_raw_frame=raw_frames.append,
        next_morebet_target=lambda: targets.pop(0) if targets else None,
    )
    morebet_frame = {
        "type": "MORE_BET",
        "odds": {"e": [29, "Soccer", None, [1600000003, "Home", "Away", 0, 0, 0, 0, 0, {}]]},
    }

    class FakePgProvider:
        def on(self, event: str, handler: Any) -> None:
            pass

        async def evaluate(self, js: str, arg: Any = None) -> Any:
            if "__fr" in js:
                if sent and not getattr(self, "_answered", False):
                    object.__setattr__(self, "_answered", True)
                    return [_json.dumps(morebet_frame)]
                return []
            if arg and "MORE_BET" in str(arg):
                sent.append(_json.loads(arg)["eventId"])
            return None

        async def wait_for_timeout(self, ms: int) -> None:
            pass

    await worker._loop(FakePgProvider(), run_sec=0.8, watchlist=[])

    assert sent == [1600000003]
    assert raw_frames
    assert raw_frames[0]["type"] == "MORE_BET"
    assert raw_frames[0]["_requested_event_id"] == 1600000003

def test_fleet_source_id_has_ps3838_head() -> None:
    import os
    import aggregator.identity as _ident
    from aggregator.identity import shared_pid_event_id
    from aggregator.types import SourceEvent
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    frame = {"Pid": 1600000001, "SportId": 29, "_account": "acc1", "raw": []}
    sport = frame["SportId"]
    account = frame.get("_account", "fleet")
    fleet_ev = SourceEvent(
        source_id="ps3838:fleet:%s:%s" % (account, sport),
        family="ps3838",
        transport="browser_ws",
        event_id="ps3838:%d" % frame["Pid"],
        payload=dict(frame),
        collected_at=now,
        received_at=now,
    )
    ps3838_ev = SourceEvent(
        source_id="ps3838:acct2",
        family="ps3838",
        transport="browser_ws",
        event_id="ps3838:%d" % frame["Pid"],
        payload={"Pid": 1600000001},
        collected_at=now,
        received_at=now,
    )
    orig_cache = _ident._shared_pid_enabled_cached
    orig_env = os.environ.get("MSP_SHARED_PID_EVENT_ID_ENABLED")
    try:
        os.environ["MSP_SHARED_PID_EVENT_ID_ENABLED"] = "1"
        _ident._shared_pid_enabled_cached = None
        eid_fleet = shared_pid_event_id(fleet_ev, fleet_ev.payload)
        eid_ps3838 = shared_pid_event_id(ps3838_ev, ps3838_ev.payload)
        assert eid_fleet == "agg:pid:1600000001"
        assert eid_fleet == eid_ps3838
        head = fleet_ev.source_id.split(":", 1)[0]
        assert head == "ps3838"
    finally:
        if orig_env is not None:
            os.environ["MSP_SHARED_PID_EVENT_ID_ENABLED"] = orig_env
        else:
            os.environ.pop("MSP_SHARED_PID_EVENT_ID_ENABLED", None)
        _ident._shared_pid_enabled_cached = orig_cache

@pytest.mark.asyncio
async def test_supervisor_watchlist_one_snapshot_per_initial_batch() -> None:
    call_count = [0]
    def watchlist_provider() -> list[int]:
        call_count[0] += 1
        return [10, 11, 12, 13, 14]
    captured_buckets: list[list[int]] = []
    class CaptureBucketWorker(Worker):
        async def run(self, run_sec: float, watchlist: list[int] | None = None) -> dict[str, Any]:
            captured_buckets.append(list(watchlist or []))
            return {"label": self.label, "status": "DONE"}
    pool = _pool(3, cooldown_sec=1000.0)
    sup = Supervisor(
        pool=pool,
        on_event=lambda f: None,
        target_k=3,
        worker_run_sec=0.01,
        watchlist_provider=watchlist_provider,
        _worker_cls=CaptureBucketWorker,
    )
    await sup.run(total_sec=0.01)
    assert call_count[0] == 1, (
        "watchlist_provider called %d times; expected 1 per initial batch" % call_count[0]
    )
    all_pids = sorted(pid for bucket in captured_buckets for pid in bucket)
    assert all_pids == [10, 11, 12, 13, 14]
    assert len(all_pids) == len(set(all_pids))

# ---------------------------------------------------------------------------
# 27.41 Fикс2 — P0: market_class из payload кандидата доходит до decision
# ---------------------------------------------------------------------------

def test_ingest_market_class_morebets_propagated_without_dispatcher() -> None:
    """P0: when ALL candidates carry market_class='more_bets', it must reach
    _decide_candidates even when morebets_dispatcher is None (the default
    fallback path).  Before the fix, the else-branch called _decide_candidates
    without market_class so the event was wrongly treated as core.
    Conservative: only fires when every candidate in the bucket has the tag
    (mixed base+morebets buckets still get mc=None).
    """
    from datetime import datetime, timezone

    from aggregator.decision import DecisionEngine
    from aggregator.ingest import IngestRouter
    from aggregator.store import ProvenanceStore
    from aggregator.types import SourceEvent

    received_market_class: list[str | None] = []

    class CapturingDecision(DecisionEngine):
        def decide(self, candidates, **kwargs):  # type: ignore[override]
            received_market_class.append(kwargs.get("market_class"))
            return super().decide(candidates, **kwargs)

    now = datetime.now(timezone.utc)
    router = IngestRouter(ProvenanceStore(), CapturingDecision())
    ev = SourceEvent(
        source_id="ps3838:fleet:acc1:29",
        family="ps3838",
        transport="browser_ws",
        event_id="agg:pid:1600099001",
        payload={
            "Pid": 1600099001,
            "SportId": 29,
            "market_class": "more_bets",
            "market_family": "corners",
            "Periods": [
                {"Number": 0, "CornersTotal": {"9.5": {"Over": 1.91, "Under": 1.91}}}
            ],
        },
        collected_at=now,
        received_at=now,
    )
    router.ingest(ev)
    assert received_market_class, "decide() was not called at all"
    assert "more_bets" in received_market_class, (
        "market_class='more_bets' not propagated to decide(); got %r" % received_market_class
    )


def test_ingest_market_class_none_for_core_event_no_regression() -> None:
    """P0 additive: core (base) events must still get market_class=None -> no regression."""
    from datetime import datetime, timezone

    from aggregator.decision import DecisionEngine
    from aggregator.ingest import IngestRouter
    from aggregator.store import ProvenanceStore
    from aggregator.types import SourceEvent

    received_market_class: list[str | None] = []

    class CapturingDecision(DecisionEngine):
        def decide(self, candidates, **kwargs):  # type: ignore[override]
            received_market_class.append(kwargs.get("market_class"))
            return super().decide(candidates, **kwargs)

    now = datetime.now(timezone.utc)
    router = IngestRouter(ProvenanceStore(), CapturingDecision())
    ev = SourceEvent(
        source_id="ps3838:core:acc1",
        family="ps3838",
        transport="ws",
        event_id="agg:pid:1600099002",
        payload={
            "Pid": 1600099002,
            "SportId": 29,
            "Periods": [
                {"Number": 0, "MoneyLine": {"Home": 1.90, "Away": 1.95}}
            ],
        },
        collected_at=now,
        received_at=now,
    )
    router.ingest(ev)
    assert received_market_class, "decide() was not called at all"
    assert received_market_class[-1] is None, (
        "core event must propagate market_class=None; got %r" % received_market_class
    )


# ---------------------------------------------------------------------------
# 27.41 Fикс2 — P1b: стабильный bucket-индекс при replacement (без дублей)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_supervisor_replacement_reuses_freed_bucket_no_dups() -> None:
    """P1b: On worker failure the freed bucket_idx is recycled to the replacement.

    Old code: slot=3, target_k=3 -> 3%3=0 -> duplicate bucket 0, gap in bucket 1.
    New code: bucket_idx freed on completion -> replacement gets same slice.

    Scenario: target_k=3, watchlist=[0..8] (3 even buckets).
    Worker a1 returns DONE immediately; a0 and a2 wait for a barrier.
    Replacement (a3) is spawned for a1's freed bucket.
    Assert: sorted(a3_watchlist) == sorted(a1_watchlist).
    Assert: initial coverage has no duplicates.
    """
    import asyncio as _asyncio

    wl_map: dict[str, list[int]] = {}
    barrier = _asyncio.Event()

    class BarrierWorker(Worker):
        async def run(  # type: ignore[override]
            self, run_sec: float, watchlist: list[int] | None = None
        ) -> dict[str, Any]:
            wl_map[self.label] = list(watchlist or [])
            if self.label == "a1":
                # fail quickly to trigger replacement spawn
                return {"label": self.label, "status": "DONE"}
            await barrier.wait()
            return {"label": self.label, "status": "DONE"}

    # 5 accounts: a0-a4; target_k=3 uses a0,a1,a2; replacement from a3
    pool = _pool(5, cooldown_sec=1000.0)
    sup = Supervisor(
        pool=pool,
        on_event=lambda f: None,
        target_k=3,
        worker_run_sec=10.0,
        watchlist_provider=lambda: list(range(9)),
        _worker_cls=BarrierWorker,
    )

    async def _release_when_replacement_ready() -> None:
        # Wait until a3 has recorded its watchlist, then unblock a0/a2
        for _ in range(500):
            if "a3" in wl_map:
                break
            await _asyncio.sleep(0.01)
        barrier.set()

    await _asyncio.gather(
        sup.run(total_sec=5.0),
        _release_when_replacement_ready(),
    )

    # 1) Initial 3 workers cover all 9 PIDs, no duplicates
    initial_wls = [wl_map.get("a%d" % i, []) for i in range(3)]
    all_initial = sorted(pid for wl in initial_wls for pid in wl)
    assert all_initial == list(range(9)), (
        "initial watchlist union not [0..8]: %r" % all_initial
    )
    assert len(all_initial) == len(set(all_initial)), "initial watchlists have duplicates"

    # 2) Replacement (a3) got the exact same bucket as the failed worker (a1)
    assert "a3" in wl_map, "replacement worker a3 was never spawned"
    a1_wl = sorted(wl_map["a1"])
    a3_wl = sorted(wl_map["a3"])
    assert a3_wl == a1_wl, (
        "replacement a3 got bucket %r but failed a1 had %r "
        "(old bug: slot%%k would give a0 bucket instead)" % (a3_wl, a1_wl)
    )


# ---------------------------------------------------------------------------
# 27.41 Фикс3 -- P0: mixed bucket (base + more_bets) decided separately
# ---------------------------------------------------------------------------

def test_ingest_mixed_bucket_morebets_decided_separately() -> None:
    """P0 (27.41 Фикс3): mixed bucket (base + more_bets for the same Pid) must
    route the more_bets slice as market_class='more_bets' and the base slice as
    market_class=None, NOT merge them into a single core decision.

    Before this fix the else-branch used _market_class_from_candidates (ALL
    check), which returned None for mixed buckets -> more_bets was silently
    treated as core and lost.
    """
    from datetime import datetime, timezone

    from aggregator.decision import DecisionEngine
    from aggregator.ingest import IngestRouter
    from aggregator.store import ProvenanceStore
    from aggregator.types import SourceEvent

    calls: list[str | None] = []

    class CapturingDecision(DecisionEngine):
        def decide(self, candidates, **kwargs):  # type: ignore[override]
            calls.append(kwargs.get("market_class"))
            return super().decide(candidates, **kwargs)

    now = datetime.now(timezone.utc)
    router = IngestRouter(ProvenanceStore(), CapturingDecision())

    base_ev = SourceEvent(
        source_id="ps3838:core:acc1",
        family="ps3838",
        transport="ws",
        event_id="agg:pid:1600222001",
        payload={
            "Pid": 1600222001,
            "SportId": 29,
            "Periods": [{"Number": 0, "MoneyLine": {"Home": 1.90, "Away": 1.95}}],
        },
        collected_at=now,
        received_at=now,
    )
    router.ingest(base_ev)
    calls_after_base = list(calls)

    mb_ev = SourceEvent(
        source_id="ps3838:fleet:acc2:29",
        family="ps3838",
        transport="browser_ws",
        event_id="agg:pid:1600222001",
        payload={
            "Pid": 1600222001,
            "SportId": 29,
            "market_class": "more_bets",
            "market_family": "corners",
            "Periods": [
                {"Number": 0, "CornersTotal": {"9.5": {"Over": 1.91, "Under": 1.91}}}
            ],
        },
        collected_at=now,
        received_at=now,
    )
    router.ingest(mb_ev)
    calls_after_mixed = calls[len(calls_after_base):]

    assert None in calls_after_base, (
        "pure-base ingest must call decide() with market_class=None; got %r" % calls_after_base
    )
    assert "more_bets" in calls_after_mixed, (
        "more_bets slice must reach decide() with market_class='more_bets' "
        "in mixed bucket (was silently treated as core before fix); "
        "calls after mixed ingest: %r" % calls_after_mixed
    )
    assert None in calls_after_mixed, (
        "base slice must still reach decide() with market_class=None "
        "in mixed bucket (regression check); calls: %r" % calls_after_mixed
    )


# ---------------------------------------------------------------------------
# 27.41 Фикс3 -- P1b: two simultaneous worker deaths -> no dup/gap buckets
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_supervisor_simultaneous_two_deaths_no_dup_buckets() -> None:
    """P1b (27.41 Фикс3): when 2 workers die simultaneously their freed bucket
    indices are ALL returned before computing need -> replacements get distinct
    buckets and the survivor+replacement union covers [0..k-1] without gaps.

    Old code: spawning happened inside the for-loop over done tasks.  First
    done task freed its bucket, computed need=2 (second task not yet released),
    and spawned 2 replacements: one with the freed bucket and one via slot%k
    (duplicate!).  Second task's bucket was never claimed -> gap.

    New code: phase-1 releases all, phase-2 spawns once.
    """
    import asyncio as _asyncio

    wl_map: dict[str, list[int]] = {}
    barrier = _asyncio.Event()

    class TwoDeathWorker(Worker):
        async def run(  # type: ignore[override]
            self, run_sec: float, watchlist: list[int] | None = None
        ) -> dict[str, Any]:
            wl_map[self.label] = list(watchlist or [])
            if self.label in ("a1", "a2"):
                return {"label": self.label, "status": "DONE"}
            await barrier.wait()
            return {"label": self.label, "status": "DONE"}

    pool = _pool(5, cooldown_sec=1000.0)
    sup = Supervisor(
        pool=pool,
        on_event=lambda f: None,
        target_k=3,
        worker_run_sec=10.0,
        watchlist_provider=lambda: list(range(9)),
        _worker_cls=TwoDeathWorker,
    )

    async def _release_when_both_replacements_ready() -> None:
        for _ in range(500):
            if "a3" in wl_map and "a4" in wl_map:
                break
            await _asyncio.sleep(0.01)
        barrier.set()

    await _asyncio.gather(
        sup.run(total_sec=5.0),
        _release_when_both_replacements_ready(),
    )

    assert "a3" in wl_map, "first replacement worker a3 was never spawned"
    assert "a4" in wl_map, "second replacement worker a4 was never spawned"

    all_pids = sorted(
        wl_map.get("a0", []) + wl_map.get("a3", []) + wl_map.get("a4", [])
    )
    assert all_pids == list(range(9)), (
        "survivor+replacements union not [0..8]: %r "
        "(a0=%r, a3=%r, a4=%r)" % (all_pids, wl_map.get("a0"), wl_map.get("a3"), wl_map.get("a4"))
    )
    assert len(all_pids) == len(set(all_pids)), (
        "duplicate PIDs detected (old bug: slot%%k re-used same bucket): "
        "a0=%r  a3=%r  a4=%r" % (wl_map.get("a0"), wl_map.get("a3"), wl_map.get("a4"))
    )


# ---------------------------------------------------------------------------
# Story 27.49 — supervisor логирование статы воркера
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_supervisor_logs_done_as_info(caplog: pytest.LogCaptureFixture) -> None:
    """AC-1: DONE worker → INFO лог с acc_id и счётчиками."""

    class DoneStatWorker(Worker):
        async def run(self, run_sec: float, watchlist: list[int] | None = None) -> dict[str, Any]:
            return {
                "label": self.label,
                "status": "DONE",
                "morebet_sent": 7,
                "morebet_answered": 5,
                "morebet_answer_ratio": 0.71,
                "reconnects": 1,
                "got_429": False,
            }

    pool = _pool(2)
    sup = Supervisor(pool=pool, on_event=lambda f: None, target_k=1,
                     worker_run_sec=0.05, _worker_cls=DoneStatWorker)
    with caplog.at_level(logging.INFO, logger="aggregator.fleet.supervisor"):
        await sup.run(total_sec=0.1)

    info_msgs = [r for r in caplog.records
                 if r.levelno == logging.INFO and "worker done" in r.getMessage()]
    assert info_msgs, "ожидался INFO лог 'worker done'"
    msg = info_msgs[0].getMessage()
    assert "acc=a0" in msg
    assert "status=DONE" in msg
    assert "mb_sent=7" in msg
    assert "mb_ans=5" in msg
    assert "reconnects=1" in msg


@pytest.mark.asyncio
async def test_supervisor_logs_fail_as_warning(caplog: pytest.LogCaptureFixture) -> None:
    """AC-1: FAIL worker → WARNING лог."""

    class FailWorker(Worker):
        async def run(self, run_sec: float, watchlist: list[int] | None = None) -> dict[str, Any]:
            return {
                "label": self.label,
                "status": "FAIL: NO_WS",
                "morebet_sent": 0,
                "morebet_answered": 0,
                "morebet_answer_ratio": 0.0,
                "reconnects": 0,
                "got_429": False,
            }

    pool = _pool(2)
    sup = Supervisor(pool=pool, on_event=lambda f: None, target_k=1,
                     worker_run_sec=0.05, _worker_cls=FailWorker)
    with caplog.at_level(logging.WARNING, logger="aggregator.fleet.supervisor"):
        await sup.run(total_sec=0.1)

    warn_msgs = [r for r in caplog.records
                 if r.levelno == logging.WARNING and "worker done" in r.getMessage()]
    assert warn_msgs, "ожидался WARNING лог для FAIL"
    msg = warn_msgs[0].getMessage()
    assert "status=FAIL: NO_WS" in msg


@pytest.mark.asyncio
async def test_supervisor_log_safe_get_missing_fields(caplog: pytest.LogCaptureFixture) -> None:
    """AC-1: если res не содержит morebet/reconnects полей — лог не падает, дефолты '?'/0."""

    class MinimalWorker(Worker):
        async def run(self, run_sec: float, watchlist: list[int] | None = None) -> dict[str, Any]:
            # только status, остальное отсутствует
            return {"label": self.label, "status": "DONE"}

    pool = _pool(2)
    sup = Supervisor(pool=pool, on_event=lambda f: None, target_k=1,
                     worker_run_sec=0.05, _worker_cls=MinimalWorker)
    with caplog.at_level(logging.INFO, logger="aggregator.fleet.supervisor"):
        await sup.run(total_sec=0.1)

    info_msgs = [r for r in caplog.records
                 if "worker done" in r.getMessage()]
    assert info_msgs, "лог должен быть даже при отсутствующих полях"
    msg = info_msgs[0].getMessage()
    # ratio defaults to '?', numbers default to 0
    assert "ratio=?" in msg
    assert "mb_sent=0" in msg
    assert "reconnects=0" in msg


@pytest.mark.asyncio
async def test_supervisor_shutdown_drain_logs_remaining_worker(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """AC-2: shutdown drain — лог воркеров, не обработанных done-loop."""
    import threading as _threading

    stop = _threading.Event()

    class SlowReturnWorker(Worker):
        async def run(self, run_sec: float, watchlist: list[int] | None = None) -> dict[str, Any]:
            await asyncio.sleep(0.05)   # успеет до drain-таймаута 3s
            return {
                "label": self.label,
                "status": "DONE",
                "morebet_sent": 3,
                "morebet_answered": 3,
                "morebet_answer_ratio": 1.0,
                "reconnects": 0,
                "got_429": False,
            }

    pool = _pool(2)
    stop.set()  # установлен ДО run → main while-loop не войдёт, drain подберёт задачи

    sup = Supervisor(pool=pool, on_event=lambda f: None, target_k=1,
                     worker_run_sec=60.0, _worker_cls=SlowReturnWorker)
    with caplog.at_level(logging.INFO, logger="aggregator.fleet.supervisor"):
        await sup.run(total_sec=60.0, stop_event=stop)

    drain_msgs = [r for r in caplog.records if "worker done" in r.getMessage()]
    assert drain_msgs, "drain должен залогировать результат оставшегося воркера"
    msg = drain_msgs[0].getMessage()
    assert "mb_sent=3" in msg


@pytest.mark.asyncio
async def test_supervisor_release_still_called_after_logging(caplog: pytest.LogCaptureFixture) -> None:
    """AC-3: release вызывается после логирования — pool.active_count() падает."""

    class QuickWorker(Worker):
        async def run(self, run_sec: float, watchlist: list[int] | None = None) -> dict[str, Any]:
            return {"label": self.label, "status": "DONE"}

    pool = _pool(3, cooldown_sec=1000.0)
    sup = Supervisor(pool=pool, on_event=lambda f: None, target_k=2,
                     worker_run_sec=0.05, _worker_cls=QuickWorker)

    with caplog.at_level(logging.INFO, logger="aggregator.fleet.supervisor"):
        await sup.run(total_sec=0.1)

    # После release воркеры переходят в cooldown, не в active
    assert pool.active_count() == 0, (
        "все воркеры должны быть released; active_count=%d" % pool.active_count()
    )
    info_msgs = [r for r in caplog.records if "worker done" in r.getMessage()]
    assert len(info_msgs) >= 2, "ожидался лог для каждого из 2 воркеров"


@pytest.mark.asyncio
async def test_supervisor_no_double_release(caplog: pytest.LogCaptureFixture) -> None:
    """AC-3: release вызывается ровно один раз на воркера — нет двойного release."""
    release_calls: list[str] = []

    class TrackingPool(FleetAccountPool):
        def release(self, now: float, acc_id: str, reason: str) -> None:
            release_calls.append(acc_id)
            super().release(now, acc_id, reason)

    class QuickWorker2(Worker):
        async def run(self, run_sec: float, watchlist: list[int] | None = None) -> dict[str, Any]:
            return {"label": self.label, "status": "DONE"}

    accs = [FleetAccount(id="x%d" % i, cfg={"proxy_host": "127.0.0.1"}) for i in range(3)]
    pool = TrackingPool(accs, cooldown_sec=1000.0)
    sup = Supervisor(pool=pool, on_event=lambda f: None, target_k=2,
                     worker_run_sec=0.05, _worker_cls=QuickWorker2)

    with caplog.at_level(logging.INFO, logger="aggregator.fleet.supervisor"):
        await sup.run(total_sec=0.1)

    # release_calls может содержать больше записей из-за hot-swap, но каждый acc_id
    # должен встречаться ровно столько раз, сколько раз он был задействован
    from collections import Counter
    counts = Counter(release_calls)
    for acc_id, cnt in counts.items():
        assert cnt == 1, (
            "acc_id=%s был released %d раз (ожидался 1)" % (acc_id, cnt)
        )


@pytest.mark.asyncio
async def test_rotating_supervisor_never_clones_account_across_sports() -> None:
    """All-sports mode must not run the same credential in parallel."""

    running: dict[str, int] = {}
    max_parallel_by_account: dict[str, int] = {}
    started: list[tuple[str, str, int]] = []

    class RecordingWorker(Worker):
        async def run(self, run_sec: float, watchlist: list[int] | None = None) -> dict[str, Any]:
            running[self.label] = running.get(self.label, 0) + 1
            max_parallel_by_account[self.label] = max(
                max_parallel_by_account.get(self.label, 0),
                running[self.label],
            )
            started.append((self.label, self.slug, self.sport))
            await asyncio.sleep(0.02)
            running[self.label] = running.get(self.label, 1) - 1
            return {"label": self.label, "status": "DONE"}

    accs = [
        FleetAccount(id="a0", cfg={"proxy_host": "127.0.0.1"}),
        FleetAccount(id="a1", cfg={"proxy_host": "127.0.0.1"}),
    ]
    sports = [
        SportSpec("soccer", 29),
        SportSpec("tennis", 33),
        SportSpec("basketball", 4),
    ]
    sup = RotatingFleetSupervisor(
        pool=FleetAccountPool(accs, cooldown_sec=0.01),
        sports=sports,
        on_event=lambda f: None,
        target_k=2,
        worker_run_sec=0.01,
        _worker_cls=RecordingWorker,
    )

    await sup.run(total_sec=0.08)

    assert max_parallel_by_account
    assert all(count == 1 for count in max_parallel_by_account.values())
    assert {item[1] for item in started[:3]} == {"soccer", "tennis", "basketball"}


@pytest.mark.asyncio
async def test_rotating_supervisor_one_account_cycles_all_sports() -> None:
    """A single surviving account should cover configured sports sequentially."""

    started: list[str] = []

    class QuickWorker(Worker):
        async def run(self, run_sec: float, watchlist: list[int] | None = None) -> dict[str, Any]:
            started.append(self.slug)
            await asyncio.sleep(0.01)
            return {"label": self.label, "status": "DONE"}

    sup = RotatingFleetSupervisor(
        pool=FleetAccountPool([FleetAccount(id="solo", cfg={"proxy_host": "127.0.0.1"})], cooldown_sec=0.0),
        sports=[SportSpec("soccer", 29), SportSpec("tennis", 33), SportSpec("basketball", 4)],
        on_event=lambda f: None,
        target_k=3,
        worker_run_sec=0.01,
        _worker_cls=QuickWorker,
    )

    await sup.run(total_sec=0.09)

    assert started[:3] == ["soccer", "tennis", "basketball"]
