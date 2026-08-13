"""Phase 8: deploy_config tests."""

from __future__ import annotations

from aggregator.deploy_config import (
    DeploymentConfig,
    HostRole,
    plan_deployment,
)


# ── single host ──────────────────────────────────────────────────


def test_single_host_all_processes_hybrid():
    config = DeploymentConfig(
        browser_accounts=["acct-1", "acct-2"],
        api_sources=["ps3838_api"],
        single_host=True,
    )
    plan = plan_deployment(config, api_available=True)
    assert all(a.host_role == HostRole.HYBRID for a in plan.assignments)
    # At least browser + api + aggregator + feed.
    assert len(plan.assignments) >= 5


def test_single_host_summary():
    config = DeploymentConfig(
        browser_accounts=["acct-1"],
        api_sources=["api"],
        single_host=True,
    )
    plan = plan_deployment(config, api_available=True)
    summary = plan.summary()
    assert summary["hybrid"] == summary["total_processes"]
    assert summary["browser_host"] == 0
    assert summary["api_host"] == 0


# ── multi host ───────────────────────────────────────────────────


def test_multi_host_browser_on_browser_host():
    config = DeploymentConfig(
        browser_accounts=["acct-1", "acct-2"],
        api_sources=["ps3838_api"],
        single_host=False,
    )
    plan = plan_deployment(config, api_available=True)
    browser_procs = plan.by_role(HostRole.BROWSER_HOST)
    assert len(browser_procs) == 2
    for p in browser_procs:
        assert "browser_source" in p.process


def test_multi_host_api_and_aggregator_on_api_host():
    config = DeploymentConfig(
        browser_accounts=["acct-1"],
        api_sources=["ps3838_api"],
        single_host=False,
    )
    plan = plan_deployment(config, api_available=True)
    api_procs = plan.by_role(HostRole.API_HOST)
    process_names = [p.process for p in api_procs]
    assert "aggregator" in process_names
    assert "feed_server" in process_names
    assert any("api_poller" in n for n in process_names)


def test_multi_host_api_unavailable():
    config = DeploymentConfig(
        browser_accounts=["acct-1"],
        api_sources=["ps3838_api"],
        single_host=False,
    )
    plan = plan_deployment(config, api_available=False)
    api_procs = plan.by_role(HostRole.API_HOST)
    # No api_poller processes when API is down.
    assert not any("api_poller" in p.process for p in api_procs)
    assert any("API unavailable" in n for n in plan.notes)


def test_no_browser_accounts_note():
    config = DeploymentConfig(
        browser_accounts=[],
        api_sources=["api"],
        single_host=False,
    )
    plan = plan_deployment(config, api_available=True)
    assert any("pool will be empty" in n for n in plan.notes)
