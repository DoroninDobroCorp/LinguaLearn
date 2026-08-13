"""Тесты forted_targeting (выбор событий MORE_BET по вилкам Forted) — канон."""
import pytest
from aggregator import forted_targeting as ft


def _forks():
    return [{"event_id":101,"profit":0.5},{"event_id":102,"profit":2.1},
            {"event_id":103,"profit":1.2},{"event_id":105,"profit":3.0}]

def test_rank_top_n():
    assert ft.rank_top_n(_forks(), 3) == [105, 102, 103]

def test_rank_top_n_zero_and_full():
    assert ft.rank_top_n(_forks(), 0) == []
    assert len(ft.rank_top_n(_forks(), 10)) == 4

def test_rank_top_n_skips_bad_eid():
    assert ft.rank_top_n([{"profit":9.0},{"event_id":7,"profit":1.0}], 5) == [7]

def test_topn_watchlist_linger():
    last = {}
    a0 = ft.topn_watchlist(_forks(), 2, last, now=0.0, linger_sec=120.0)
    assert set(a0) == {105, 102}
    a1 = ft.topn_watchlist([{"event_id":200,"profit":5.0},{"event_id":201,"profit":4.0}], 2, last, now=10.0, linger_sec=120.0)
    assert set(a1) == {200, 201, 105, 102}  # хвост держит выпавшие
    a2 = ft.topn_watchlist([], 2, last, now=200.0, linger_sec=120.0)
    assert a2 == [] and last == {}  # протухли + подчищено

def test_active_watchlist_linger():
    seen = {1: 0.0, 2: 50.0, 3: 100.0}
    assert set(ft.active_watchlist(120.0, seen, 120.0)) == {2, 3}

def test_partition_roundrobin():
    b = ft.partition_watchlist([10,11,12,13,14], 2)
    assert b[0] == [10,12,14] and b[1] == [11,13]

def test_worker_capacity():
    assert ft.worker_capacity(2.0) == 2
    assert ft.worker_capacity(12.0) == 12

def test_next_interval_cap():
    assert ft.next_interval() == 1.0
    assert ft.next_interval(5.0) == 1.0  # анти-бан кламп

def test_schedule_due():
    assert ft.schedule_due(150.0, {1:100.0, 2:90.0, 3:200.0}) == [2, 1]

def test_fits_in_time():
    assert ft.fits_in_time(2, 2.0) is True
    assert ft.fits_in_time(3, 2.0) is False

def test_next_interval_bad():
    with pytest.raises(ValueError):
        ft.next_interval(0)
