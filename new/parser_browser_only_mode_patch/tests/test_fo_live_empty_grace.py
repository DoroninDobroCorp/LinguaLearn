from handlers.fo_handler import (
    _should_preserve_live_empty_classic_market,
    _should_preserve_live_empty_classic_period,
)


def _w12(value1: float = 1.91, value2: float = 1.91) -> dict:
    return {
        "Win1": {"value": value1},
        "Win2": {"value": value2},
    }


def _totals(value_more: float = 1.91, value_less: float = 1.91) -> dict:
    return {
        "140.5": {
            "WinMore": {"value": value_more},
            "WinLess": {"value": value_less},
        }
    }


def test_preserve_live_empty_classic_market_on_recent_churn():
    now_ts = 105.0
    event = {"_classic_market_churn_ts": 100.0}
    old_period = {
        "Win1x2": _w12(),
        "_Win1x2_ts": 100.0,
    }
    new_period = {
        "Handicap": {"-1.5": {"Win1": {"value": 1.91}, "Win2": {"value": 1.91}}},
    }

    assert _should_preserve_live_empty_classic_market(
        event,
        old_period,
        new_period,
        "Win1x2",
        {"Win1x2", "Handicap", "Totals"},
        now_ts,
    ) is True


def test_preserve_live_empty_classic_period_on_recent_churn():
    now_ts = 105.0
    event = {"_score_changed_ts": 101.0}
    old_period = {
        "Win1x2": _w12(),
        "_Win1x2_ts": 100.0,
    }

    assert _should_preserve_live_empty_classic_period(
        event,
        old_period,
        {"Win1x2", "Handicap", "Totals"},
        now_ts,
    ) is True


def test_do_not_preserve_live_empty_classic_market_when_old_price_is_too_stale():
    now_ts = 140.0
    event = {"_classic_market_churn_ts": 135.0}
    old_period = {
        "Totals": _totals(),
        "_Totals_ts": 100.0,
    }
    new_period = {"Win1x2": _w12()}

    assert _should_preserve_live_empty_classic_market(
        event,
        old_period,
        new_period,
        "Totals",
        {"Win1x2", "Handicap", "Totals"},
        now_ts,
    ) is False
