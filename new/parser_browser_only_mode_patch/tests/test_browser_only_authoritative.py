"""Browser-only quote authority without hiding API topology telemetry."""

from __future__ import annotations

from datetime import datetime, timezone

from aggregator.compat_shim import to_pin888_update
from aggregator.decision import DecisionEngineV2, build_default_engine
from aggregator.main import _build_config_summary
from aggregator.monitoring import PlatformMonitor
from aggregator.state_machine import SourceHealthRegistry, SystemMode, SystemModeMonitor
from aggregator.types import CandidateQuote


def _candidate(
    source_id: str = "pin888:acct-A:browser_ws",
    *,
    transport: str = "browser_ws",
) -> CandidateQuote:
    now = datetime.now(timezone.utc)
    return CandidateQuote(
        source_id=source_id,
        family="pinnacle_native",
        transport=transport,
        event_id="ps3838:browser-only-regression",
        payload={"Pid": 42, "market_class": "base"},
        collected_at=now,
        received_at=now,
    )


def test_policy_is_backward_compatible_by_default() -> None:
    quote = DecisionEngineV2().decide(
        [_candidate()], system_mode=SystemMode.API_DEGRADED
    )

    assert quote is not None
    assert quote.degraded is True
    assert quote.fallback_state == "API_DEGRADED"


def test_browser_only_policy_makes_fresh_browser_ws_quote_non_stale() -> None:
    quote = DecisionEngineV2(browser_only_authoritative=True).decide(
        [_candidate()], system_mode=SystemMode.API_DEGRADED
    )

    assert quote is not None
    assert quote.source_used_for_publish == "pin888:acct-A:browser_ws"
    assert quote.degraded is False
    assert quote.fallback_state is None
    envelope = to_pin888_update(quote, stale=bool(quote.degraded))
    assert envelope["stale"] is False
    assert "reason" not in envelope


def test_browser_only_policy_does_not_bless_other_authority_tiers() -> None:
    engine = DecisionEngineV2(browser_only_authoritative=True)

    tab_quote = engine.decide(
        [_candidate("pin888:acct-A:tab_mode", transport="tab_mode")],
        system_mode=SystemMode.API_DEGRADED,
    )
    assert tab_quote is not None
    assert tab_quote.degraded is True
    assert tab_quote.fallback_state == "API_DEGRADED"

    api_quote = engine.decide(
        [_candidate("pinnacle_api", transport="http_pull")],
        system_mode=SystemMode.API_DEGRADED,
    )
    assert api_quote is not None
    assert api_quote.degraded is True
    assert api_quote.fallback_state == "API_DEGRADED"


def test_browser_only_policy_does_not_relax_hard_degraded_gate() -> None:
    quote = DecisionEngineV2(browser_only_authoritative=True).decide(
        [_candidate()], system_mode=SystemMode.HARD_DEGRADED
    )
    assert quote is None


def test_env_flag_is_explicit_and_off_by_default(monkeypatch) -> None:
    monkeypatch.setenv("MSP_DECISION_V2_ENABLED", "1")
    monkeypatch.delenv("MSP_BROWSER_ONLY_AUTHORITATIVE", raising=False)
    default_engine = build_default_engine()
    assert isinstance(default_engine, DecisionEngineV2)
    assert default_engine.browser_only_authoritative is False

    monkeypatch.setenv("MSP_BROWSER_ONLY_AUTHORITATIVE", "1")
    browser_only_engine = build_default_engine()
    assert isinstance(browser_only_engine, DecisionEngineV2)
    assert browser_only_engine.browser_only_authoritative is True
    assert _build_config_summary()["MSP_BROWSER_ONLY_AUTHORITATIVE"] == "1"


def test_api_degraded_telemetry_is_preserved_while_quote_is_fresh() -> None:
    now = datetime.now(timezone.utc)
    health = SourceHealthRegistry()
    health.mark_event("pin888:acct-A:browser_ws", when=now)
    mode_monitor = SystemModeMonitor(health=health, min_dwell_sec=0)
    assert mode_monitor.compute_mode(now=now) is SystemMode.API_DEGRADED

    quote = DecisionEngineV2(browser_only_authoritative=True).decide(
        [_candidate()], system_mode=mode_monitor.compute_mode(now=now)
    )
    assert quote is not None and quote.degraded is False

    platform = PlatformMonitor(
        system_mode_monitor=mode_monitor,
        source_health_registry=health,
    )
    platform.record_publish(
        degraded=quote.degraded,
        source=quote.source_used_for_publish,
    )
    snapshot = platform.snapshot(now=now)

    assert snapshot["system_mode"] == "api_degraded"
    assert snapshot["api_health"]["status"] == "no_api_source"
    assert snapshot["pinnacle_api_enabled"] is False
    assert snapshot["stale_rate"] == 0.0
