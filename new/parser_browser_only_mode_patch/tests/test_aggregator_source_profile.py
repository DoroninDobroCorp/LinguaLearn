"""Unit tests for ``aggregator.sources.profile`` (TZ §4 + §6)."""

from __future__ import annotations

from aggregator.data_class import DataClass
from aggregator.sources.profile import (
    AuthorityClass,
    SourceProfile,
    SourceProfileRegistry,
    get_profile,
)


def test_built_in_pinnacle_api_template():
    p = get_profile("pinnacle_api")
    assert p is not None
    assert p.family == "pinnacle_api"
    assert p.authority_class is AuthorityClass.OFFICIAL_API
    assert p.is_pinnacle_native is True
    assert p.supports(DataClass.BASE_MARKET)
    assert p.supports(DataClass.MORE_BETS_SPECIAL)


def test_built_in_pin888_template_does_not_support_specials_yet():
    p = get_profile("pin888")
    assert p is not None
    assert p.authority_class is AuthorityClass.BROWSER_WS
    assert p.is_pinnacle_native is True
    assert p.supports(DataClass.BASE_MARKET)
    assert not p.supports(DataClass.MORE_BETS_SPECIAL)


def test_dynamic_pin888_account_id_resolves_to_browser_ws():
    p = get_profile("pin888:acct-A:browser_ws")
    assert p is not None
    assert p.family == "pin888"
    assert p.authority_class is AuthorityClass.BROWSER_WS
    assert p.is_pinnacle_native is True


def test_dynamic_tab_mode_demotes_authority():
    p = get_profile("pin888:acct-X:tab_mode")
    assert p is not None
    assert p.family == "pin888"
    assert p.authority_class is AuthorityClass.TAB_MODE
    assert p.is_pinnacle_native is True  # tab-mode of native family is still native


def test_dynamic_ps3838_profile_available():
    p = get_profile("ps3838:acct-1:browser_ws")
    assert p is not None
    assert p.family == "ps3838"
    assert p.authority_class is AuthorityClass.BROWSER_WS
    assert p.is_pinnacle_native is True


def test_dynamic_piwi247_profile_uses_pv247_runtime_family():
    p = get_profile("piwi247:acct-1:browser_ws")
    assert p is not None
    assert p.family == "pv247"
    assert p.authority_class is AuthorityClass.BROWSER_WS
    assert p.is_pinnacle_native is True


def test_dynamic_pv247_profile_alias_available():
    p = get_profile("pv247:acct-1:browser_ws")
    assert p is not None
    assert p.family == "pv247"
    assert p.authority_class is AuthorityClass.BROWSER_WS
    assert p.is_pinnacle_native is True


def test_bia_profile_is_supplement_not_native():
    p = get_profile("bia")
    assert p is not None
    assert p.authority_class is AuthorityClass.BIA_SUPPLEMENT
    assert p.is_pinnacle_native is False


def test_unknown_family_returns_none():
    assert get_profile("never_seen_family:foo") is None
    assert get_profile("") is None


def test_authority_class_ordering_matches_tz():
    # Pinnacle-native must always outrank BIA when both have a fresh
    # quote (TZ §2 invariant 1).
    assert AuthorityClass.OFFICIAL_API > AuthorityClass.BIA_SUPPLEMENT
    assert AuthorityClass.BROWSER_WS > AuthorityClass.BIA_SUPPLEMENT
    # Tab-mode below browser-WS but above no-data.
    assert AuthorityClass.TAB_MODE < AuthorityClass.BROWSER_WS
    assert AuthorityClass.TAB_MODE > AuthorityClass.UNKNOWN
    # Official API > Browser WS in normal mode.
    assert AuthorityClass.OFFICIAL_API > AuthorityClass.BROWSER_WS


def test_dynamic_registration_overrides_template():
    reg = SourceProfileRegistry()
    custom = SourceProfile(
        source_id="pin888:custom",
        family="pin888",
        authority_class=AuthorityClass.TAB_MODE,
        data_classes_supported=frozenset({DataClass.BASE_EVENT}),
        is_pinnacle_native=True,
    )
    reg.register(custom)
    got = reg.get("pin888:custom")
    assert got is custom


def test_registry_resolves_via_family_head():
    reg = SourceProfileRegistry()
    p = reg.get("pin888:acct-A:browser_ws")
    assert p is not None
    assert p.family == "pin888"
