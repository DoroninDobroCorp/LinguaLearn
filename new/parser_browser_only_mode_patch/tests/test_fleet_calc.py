"""Тесты fleet_calc (расчёт ёмкости фермы) — перенесено из эксперимента в канон."""
import pytest
from aggregator import fleet_calc as fc


def test_required_morebet_rps():
    assert fc.required_morebet_rps(10, 2.0) == 5.0
    assert fc.required_morebet_rps(0, 2.0) == 0.0

def test_required_morebet_rps_bad():
    with pytest.raises(ValueError):
        fc.required_morebet_rps(10, 0)

def test_morebet_accounts_basic():
    assert fc.morebet_accounts(10, 2.0) == 5
    assert fc.morebet_accounts(12, 12.0) == 1

def test_morebet_accounts_caps_rps():
    assert fc.morebet_accounts(10, 2.0, per_acct_rps=5.0) == 5  # кламп к 1.0

def test_morebet_accounts_zero():
    assert fc.morebet_accounts(0, 2.0) == 0

def test_pushline_accounts():
    assert fc.pushline_accounts(1600, 800) == 2
    assert fc.pushline_accounts(801, 800) == 2
    assert fc.pushline_accounts(0, 800) == 0

def test_pushline_accounts_bad():
    with pytest.raises(ValueError):
        fc.pushline_accounts(100, 0)

def test_fleet_size_smallset():
    r = fc.fleet_size(events_with_arbs=7, total_line_events=1231, per_socket_events=478)
    assert r["fleet_accounts_total"] == r["morebet_accounts_total"] + r["pushline_accounts"]
    assert r["morebet_accounts_total"] <= 5

def test_fleet_size_bounds():
    with pytest.raises(ValueError):
        fc.fleet_size(10, 100, live_fraction=1.5)

def test_fleet_size_split():
    r = fc.fleet_size(events_with_arbs=10, total_line_events=0, live_fraction=0.5)
    assert r["live_events"] == 5 and r["prematch_events"] == 5 and r["pushline_accounts"] == 0
