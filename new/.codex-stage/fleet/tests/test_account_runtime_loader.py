"""Tests for Story 27.41 runtime account secrets loader."""

from __future__ import annotations

import pytest

from aggregator.account_fsm import AccountState
from aggregator.account_runtime_loader import (
    build_ps3838_runtime_bundles,
    parse_ps3838_accounts,
    parse_ps3838_proxies,
)


def test_parse_ps3838_accounts_uses_password_field_one() -> None:
    rows = ["TEST_LOGIN:TESTPASS573:ps3838:activated"]
    parsed = parse_ps3838_accounts(rows)
    assert len(parsed) == 1
    assert parsed[0].login == "TEST_LOGIN"
    assert parsed[0].password == "TESTPASS573"
    assert parsed[0].source_type == "ps3838"


def test_parse_ps3838_accounts_falls_back_to_login_when_password_empty() -> None:
    parsed = parse_ps3838_accounts(["TEST_LOGIN::ps3838:legacy"])
    assert parsed[0].password == "TEST_LOGIN"


def test_parse_proxy_requires_auth_without_defaults() -> None:
    with pytest.raises(ValueError, match="proxy auth"):
        parse_ps3838_proxies(["193.160.73.214:64335"])


def test_parse_proxy_accepts_shared_auth_defaults() -> None:
    proxies = parse_ps3838_proxies(
        ["193.160.73.214:64335"],
        default_user="proxy-user",
        default_password="proxy-pass",
    )
    assert proxies[0].host == "193.160.73.214"
    assert proxies[0].port == "64335"
    assert proxies[0].user == "proxy-user"


def test_build_runtime_bundles_enforces_one_account_one_proxy() -> None:
    accounts = parse_ps3838_accounts(
        [
            "TEST_LOGIN:TEST_LOGIN:ps3838:a",
            "TEST_LOGIN:TESTPASS573:ps3838:b",
        ]
    )
    proxies = parse_ps3838_proxies(
        ["193.160.73.214:64335"],
        default_user="u",
        default_password="p",
    )
    with pytest.raises(ValueError, match="1:1"):
        build_ps3838_runtime_bundles(accounts, proxies)


def test_build_runtime_bundles_registers_canonical_and_fleet_views() -> None:
    accounts = parse_ps3838_accounts(["TEST_LOGIN:TESTPASS573:ps3838:activated"])
    proxies = parse_ps3838_proxies(
        ["156.246.214.172:63101"],
        default_user="u",
        default_password="p",
    )
    bundle = build_ps3838_runtime_bundles(accounts, proxies)[0]
    assert bundle.account.account_id == "TEST_LOGIN"
    assert bundle.account.family == "ps3838"
    assert bundle.account.current_transport == "browser_ws"
    assert bundle.account.state is AccountState.HEALTHY_BROWSER_WS
    assert bundle.fleet_account.id == "TEST_LOGIN"
    assert bundle.fleet_account.cfg["password"] == "TESTPASS573"
    assert bundle.fleet_account.cfg["proxy_host"] == "156.246.214.172"
    assert "proxy_user" in bundle.fleet_account.cfg


def test_build_runtime_bundles_uses_explicit_proxy_markers_only() -> None:
    accounts = parse_ps3838_accounts(
        [
            "API1:API_PASS:API:api only",
            "WS2:PASS2:WS:active прокси#2",
            "WS3:PASS3:WS:active proxy#3",
            "UNASSIGNED:PASS4:WS:no proxy marker",
        ]
    )
    proxies = parse_ps3838_proxies(
        [
            "10.0.0.1:6001:u:p",
            "10.0.0.2:6002:u:p",
            "10.0.0.3:6003:u:p",
        ]
    )
    bundles = build_ps3838_runtime_bundles(accounts, proxies)

    assert [b.account.account_id for b in bundles] == ["WS2", "WS3"]
    assert bundles[0].fleet_account.cfg["proxy_host"] == "10.0.0.2"
    assert bundles[1].fleet_account.cfg["proxy_host"] == "10.0.0.3"


def test_build_runtime_bundles_supports_explicit_direct_mode() -> None:
    accounts = parse_ps3838_accounts(["WS1:PASS1:WS:active direct"])

    bundles = build_ps3838_runtime_bundles(accounts, [], allow_direct=True)

    assert bundles[0].account.account_id == "WS1"
    assert bundles[0].account.capability_profile["route"] == "direct"
    assert bundles[0].fleet_account.cfg["direct_mode"] == "1"
    assert "proxy_host" not in bundles[0].fleet_account.cfg


def test_build_runtime_bundles_keeps_direct_mode_opt_in() -> None:
    accounts = parse_ps3838_accounts(["WS1:PASS1:WS:active direct"])

    with pytest.raises(ValueError, match="1:1"):
        build_ps3838_runtime_bundles(accounts, [], allow_direct=False)
