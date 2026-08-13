import services.forwarder_smart as forwarder


def _event(pid, *, is_live, home_score=0, away_score=0):
    return {
        "Pid": pid,
        "isLive": is_live,
        "homeName": f"home-{pid}",
        "awayName": f"away-{pid}",
        "HomeScore": home_score,
        "AwayScore": away_score,
        "Periods": [
            {
                "Number": 0,
                "Win1x2": {"Win1": {"value": 1.9}},
                "Totals": {"2.5": {"WinMore": {"value": 1.8}}},
            }
        ],
    }


def setup_function():
    forwarder.buffer.clear()
    forwarder.pending_pids.clear()
    forwarder.pending_removals.clear()


def test_build_removed_payload_preserves_score_and_clears_markets():
    payload = forwarder._build_removed_payload(
        101,
        _event(101, is_live=True, home_score=2, away_score=1),
        "removed from source",
        removed_at="2026-04-12T18:00:00Z",
    )

    assert payload["Pid"] == 101
    assert payload["Removed"] is True
    assert payload["Deleted"] is True
    assert payload["RemovedAt"] == "2026-04-12T18:00:00Z"
    assert payload["HomeScore"] == 2
    assert payload["AwayScore"] == 1
    assert payload["Periods"][0]["Win1x2"] == {}
    assert payload["Periods"][0]["Totals"] == {}
    assert payload["Periods"][0]["_closed_markets"] == {
        "Win1x2": "2026-04-12T18:00:00Z",
        "Totals": "2026-04-12T18:00:00Z",
    }


def test_apply_state_snapshot_queues_tombstone_for_removed_pid():
    forwarder.buffer.update({
        1: _event(1, is_live=True, home_score=1, away_score=0),
        2: _event(2, is_live=True, home_score=0, away_score=0),
    })

    forwarder._apply_state_snapshot([_event(2, is_live=True)], "live", "live", "state")

    assert set(forwarder.buffer) == {2}
    assert forwarder.pending_pids == {2}
    assert 1 in forwarder.pending_removals
    tombstone = forwarder.pending_removals[1]
    assert tombstone["Removed"] is True
    assert tombstone["HomeScore"] == 1
    assert tombstone["AwayScore"] == 0


def test_apply_live_scope_for_all_filter_keeps_prematch_buffer():
    forwarder.buffer.update({
        10: _event(10, is_live=True),
        20: _event(20, is_live=False),
    })

    forwarder._apply_state_snapshot([_event(30, is_live=True)], "live", "all", "state")

    assert set(forwarder.buffer) == {20, 30}
    assert forwarder.buffer[20]["isLive"] is False
    assert 10 in forwarder.pending_removals
    assert 20 not in forwarder.pending_removals
    assert 30 in forwarder.pending_pids
