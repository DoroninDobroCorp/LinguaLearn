"""Tests for Story 27.5.A — MoreBets policy schema + loader.

Validates the pydantic schema against the canonical YAML shipped at
``config/morebets_priority_policy.yaml`` plus synthetic failure cases.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from aggregator.morebets_policy import (
    ALLOWED_SOURCES,
    CANONICAL_FAMILIES,
    DEFAULT_POLICY_PATH,
    MoreBetsFamilyPolicy,
    MoreBetsPolicy,
    load_policy,
    load_policy_from_env,
    resolve_policy_path,
)


_REPO_ROOT = Path(__file__).resolve().parents[1]
_BUILTIN_POLICY = _REPO_ROOT / "config" / "morebets_priority_policy.yaml"


# ---------------------------------------------------------------------------
# Schema basics
# ---------------------------------------------------------------------------


def test_canonical_families_has_exactly_eleven_entries() -> None:
    assert len(CANONICAL_FAMILIES) == 11


def test_allowed_sources_are_api_ws_bia() -> None:
    assert ALLOWED_SOURCES == frozenset({"api", "ws", "bia"})


def test_family_policy_valid_shape() -> None:
    p = MoreBetsFamilyPolicy(
        priority_order=["api", "ws", "bia"],
        stale_api_sec=3.0,
        stale_ws_sec=6.0,
        l2_qps_ceil=2.0,
        min_confidence={"bia": 0.85},
    )
    assert p.priority_order == ["api", "ws", "bia"]
    assert p.stale_api_sec == 3.0


@pytest.mark.parametrize(
    "bad_order", [["api", "api"], ["ws", "ws", "bia"], ["api", "bia", "api"]]
)
def test_family_policy_rejects_duplicate_priority_order(
    bad_order: list[str],
) -> None:
    with pytest.raises(ValidationError, match="must not contain duplicates"):
        MoreBetsFamilyPolicy(
            priority_order=bad_order,
            stale_api_sec=1.0,
            stale_ws_sec=1.0,
            l2_qps_ceil=1.0,
            min_confidence={"bia": 0.85},
        )


def test_family_policy_rejects_unknown_source() -> None:
    with pytest.raises(ValidationError, match="must be one of"):
        MoreBetsFamilyPolicy(
            priority_order=["api", "tabs", "bia"],  # "tabs" not allowed
            stale_api_sec=1.0,
            stale_ws_sec=1.0,
            l2_qps_ceil=1.0,
            min_confidence={"bia": 0.85},
        )


def test_family_policy_rejects_non_positive_staleness() -> None:
    with pytest.raises(ValidationError):
        MoreBetsFamilyPolicy(
            priority_order=["api"],
            stale_api_sec=0,
            stale_ws_sec=1.0,
            l2_qps_ceil=1.0,
        )


def test_family_policy_rejects_out_of_range_confidence() -> None:
    with pytest.raises(ValidationError, match="min_confidence"):
        MoreBetsFamilyPolicy(
            priority_order=["api"],
            stale_api_sec=1.0,
            stale_ws_sec=1.0,
            l2_qps_ceil=1.0,
            min_confidence={"bia": 1.5},
        )


def test_family_policy_forbids_extra_fields() -> None:
    with pytest.raises(ValidationError):
        MoreBetsFamilyPolicy(
            priority_order=["api"],
            stale_api_sec=1.0,
            stale_ws_sec=1.0,
            l2_qps_ceil=1.0,
            min_confidence={"bia": 0.85},
            extra_garbage="boom",  # type: ignore[call-arg]
        )


# ---------------------------------------------------------------------------
# Top-level policy
# ---------------------------------------------------------------------------


def _mk_minimal_family() -> dict:
    return {
        "priority_order": ["api", "ws"],
        "stale_api_sec": 1.0,
        "stale_ws_sec": 1.0,
        "l2_qps_ceil": 1.0,
        "min_confidence": {"bia": 0.85},
    }


def test_policy_requires_all_canonical_families() -> None:
    families = {"corners": _mk_minimal_family()}
    with pytest.raises(ValidationError, match="missing required families"):
        MoreBetsPolicy(version=1, families=families)


def test_policy_rejects_unknown_family() -> None:
    families = {name: _mk_minimal_family() for name in CANONICAL_FAMILIES}
    families["basketball_total_points"] = _mk_minimal_family()
    with pytest.raises(ValidationError, match="unknown families"):
        MoreBetsPolicy(version=1, families=families)


def test_policy_version_must_be_one() -> None:
    families = {name: _mk_minimal_family() for name in CANONICAL_FAMILIES}
    with pytest.raises(ValidationError, match="unsupported policy version"):
        MoreBetsPolicy(version=2, families=families)


def test_policy_for_family_fallback_to_unknown() -> None:
    families = {name: _mk_minimal_family() for name in CANONICAL_FAMILIES}
    policy = MoreBetsPolicy(version=1, families=families)
    # Something not in the canonical list falls back to unknown_family.
    entry = policy.for_family("this_is_not_a_family")
    assert entry is policy.families["unknown_family"]


# ---------------------------------------------------------------------------
# Shipped YAML file — integration
# ---------------------------------------------------------------------------


def test_shipped_policy_yaml_loads_without_error() -> None:
    policy = load_policy(_BUILTIN_POLICY)
    assert policy.version == 1
    for family in CANONICAL_FAMILIES:
        assert family in policy.families


def test_shipped_policy_corners_matches_ac5_matrix() -> None:
    policy = load_policy(_BUILTIN_POLICY)
    corners = policy.for_family("corners")
    assert corners.priority_order == ["api", "ws", "bia"]
    assert corners.stale_api_sec == 3
    assert corners.stale_ws_sec == 6
    assert corners.l2_qps_ceil == 2.0
    assert corners.min_confidence["bia"] == 0.85


def test_shipped_policy_player_props_has_no_bia_in_v1() -> None:
    policy = load_policy(_BUILTIN_POLICY)
    pp = policy.for_family("player_props")
    assert "bia" not in pp.priority_order


def test_shipped_policy_unknown_family_is_conservative() -> None:
    policy = load_policy(_BUILTIN_POLICY)
    uf = policy.for_family("unknown_family")
    assert uf.l2_qps_ceil == 0.5


# ---------------------------------------------------------------------------
# Env resolution
# ---------------------------------------------------------------------------


def test_resolve_policy_path_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MSP_MOREBETS_POLICY_PATH", raising=False)
    assert resolve_policy_path() == DEFAULT_POLICY_PATH


def test_resolve_policy_path_env_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MSP_MOREBETS_POLICY_PATH", "/tmp/custom.yaml")
    assert resolve_policy_path() == "/tmp/custom.yaml"


def test_load_policy_from_env_uses_env_path(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    custom = tmp_path / "policy.yaml"
    custom.write_text(_BUILTIN_POLICY.read_text(encoding="utf-8"), encoding="utf-8")
    monkeypatch.setenv("MSP_MOREBETS_POLICY_PATH", str(custom))
    policy = load_policy_from_env()
    assert policy.version == 1


def test_load_policy_missing_file_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        load_policy(tmp_path / "does-not-exist.yaml")
