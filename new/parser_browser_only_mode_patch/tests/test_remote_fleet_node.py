from __future__ import annotations

from aggregator.main import _remote_frame_family
from aggregator.account_pool import FLEET_ACTIVE, FLEET_AVAILABLE, FleetAccount
from aggregator.fleet.sport_allocation import accounts_for_sport
from tools.remote_fleet_node import RemoteBatchPoster


def test_accounts_for_sport_clones_runtime_state_per_sport() -> None:
    base = [FleetAccount(id="AC1", cfg={"proxy_host": "127.0.0.1"})]

    soccer = accounts_for_sport(base, 0, "soccer", 1)[0]
    tennis = accounts_for_sport(base, 1, "tennis", 1)[0]

    assert soccer.id == "AC1"
    assert tennis.id == "AC1"
    assert soccer is not base[0]
    assert tennis is not base[0]
    assert soccer.cfg["profile"] != tennis.cfg["profile"]

    soccer.status = FLEET_ACTIVE

    assert tennis.status == FLEET_AVAILABLE
    assert base[0].status == FLEET_AVAILABLE


def test_remote_frame_family_defaults_to_ps3838() -> None:
    assert _remote_frame_family({}) == "ps3838"
    assert _remote_frame_family({"_family": "Pin 888"}) == "pin_888"


def test_remote_batch_poster_decorates_event_family() -> None:
    class Client:
        pass

    poster = RemoteBatchPoster(Client(), source_family="pin888")  # type: ignore[arg-type]
    poster.on_event({"Pid": 1600000001})
    poster.on_raw_frame({"type": "MORE_BET", "eventId": 1600000001})

    assert poster.events.get_nowait()["_family"] == "pin888"
    assert poster.raw_frames.get_nowait()["_family"] == "pin888"
