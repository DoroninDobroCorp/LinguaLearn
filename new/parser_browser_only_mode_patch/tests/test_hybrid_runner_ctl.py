from types import SimpleNamespace

from tools import hybrid_runner_ctl


def test_cmd_runtime_status_hits_hybrid_runtime_endpoint(monkeypatch, capsys):
    calls = []

    def fake_runtime_request(port, path, *, params=None):
        calls.append((port, path, params))
        return 200, {
            "config": {"sports": [4], "modes": ["today"], "host": "example.test", "more_bet": {"enabled": True, "target_rps": 1.0, "hard_cap_rps": 1, "rate_profile": "normal"}},
            "tabs": {"total": 1, "expected": 1, "ws_alive": 0, "ws_snapshot_mode": 1, "ws_status": []},
        }

    monkeypatch.setattr(hybrid_runner_ctl, "_runtime_request", fake_runtime_request)

    rc = hybrid_runner_ctl.cmd_runtime_status(SimpleNamespace(port=9012, json=False))

    assert rc == 0
    assert calls == [(9012, "/hybrid-runtime", None)]
    assert "sports=4 modes=today host=example.test" in capsys.readouterr().out


def test_cmd_reconfigure_hits_hybrid_runtime_endpoint_with_requested_changes(monkeypatch, capsys):
    calls = []

    def fake_runtime_request(port, path, *, params=None):
        calls.append((port, path, params))
        return 200, {
            "config": {"sports": [4], "modes": ["today"], "host": "example.test", "more_bet": {"enabled": True, "target_rps": 1.0, "hard_cap_rps": 1, "rate_profile": "normal"}},
            "tabs": {"total": 1, "expected": 1, "ws_alive": 0, "ws_snapshot_mode": 1, "ws_status": []},
            "applied": {
                "added_keys": [{"sport_id": 4, "mode": "today"}],
                "removed_keys": [],
            },
        }

    monkeypatch.setattr(hybrid_runner_ctl, "_runtime_request", fake_runtime_request)

    rc = hybrid_runner_ctl.cmd_reconfigure(
        SimpleNamespace(
            port=9012,
            sports="4",
            modes="today",
            mb_target_rps=1.0,
            mb_hard_cap_rps=1,
            json=False,
        )
    )

    assert rc == 0
    assert calls == [
        (
            9012,
            "/hybrid-runtime",
            {
                "sports": "4",
                "modes": "today",
                "mb_target_rps": 1.0,
                "mb_hard_cap_rps": 1,
            },
        )
    ]
    assert "added: (4,today)" in capsys.readouterr().out
