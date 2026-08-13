"""MoreBets priority policy schema + loader (Story 27.5 / AC-1, AC-5).

The policy is stored in ``config/morebets_priority_policy.yaml`` and
loaded via :class:`MoreBetsPolicy`. The schema is validated with
pydantic on load — invalid policy files fail fast at startup rather
than silently misrouting traffic.

Canonical families (11-member set, matches AC-5 matrix):

* corners, cards, player_props, period_totals, alt_totals,
  alt_handicaps, first_half_1x2, first_team_totals,
  second_team_totals, odd_even, unknown_family

A "family" is the normalised market-category bucket a dispatcher uses
to look up source priority.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator


DEFAULT_POLICY_PATH_ENV = "MSP_MOREBETS_POLICY_PATH"
DEFAULT_POLICY_PATH = "config/morebets_priority_policy.yaml"

# Canonical family list (AC-5). Ordered for deterministic iteration.
CANONICAL_FAMILIES: tuple[str, ...] = (
    "corners",
    "cards",
    "player_props",
    "period_totals",
    "alt_totals",
    "alt_handicaps",
    "first_half_1x2",
    "first_team_totals",
    "second_team_totals",
    "odd_even",
    "unknown_family",
)

ALLOWED_SOURCES: frozenset[str] = frozenset({"api", "ws", "bia"})


class MoreBetsFamilyPolicy(BaseModel):
    """Policy for a single market family.

    ``priority_order`` lists the sources to try in sequence; the first
    one returning a fresh quote wins. Each source appears at most once
    (duplicate-free). ``stale_api_sec`` / ``stale_ws_sec`` give the
    freshness budget in seconds. ``l2_qps_ceil`` is the shared
    token-bucket refill rate for the L2 tier (WS + Tabs summed).
    ``min_confidence.bia`` is the hard gate for BIA candidates.
    """

    model_config = ConfigDict(extra="forbid")

    priority_order: list[str] = Field(min_length=1)
    stale_api_sec: float = Field(gt=0)
    stale_ws_sec: float = Field(gt=0)
    l2_qps_ceil: float = Field(gt=0)
    min_confidence: dict[str, float] = Field(default_factory=dict)

    @field_validator("priority_order")
    @classmethod
    def _validate_priority_order(cls, v: list[str]) -> list[str]:
        for s in v:
            if s not in ALLOWED_SOURCES:
                raise ValueError(
                    f"priority_order source must be one of {sorted(ALLOWED_SOURCES)}; got {s!r}"
                )
        if len(set(v)) != len(v):
            raise ValueError("priority_order must not contain duplicates")
        return v

    @field_validator("min_confidence")
    @classmethod
    def _validate_min_confidence(cls, v: dict[str, float]) -> dict[str, float]:
        for key, value in v.items():
            if not (0.0 <= float(value) <= 1.0):
                raise ValueError(
                    f"min_confidence[{key!r}] must be in [0, 1]; got {value}"
                )
        return v


class MoreBetsPolicy(BaseModel):
    """Top-level policy container.

    Invariants enforced by the validator:

    * ``version`` is ``1`` (future bumps require explicit migration).
    * All 11 canonical families present; unknown families rejected.
    """

    model_config = ConfigDict(extra="forbid")

    version: int
    families: dict[str, MoreBetsFamilyPolicy]

    @field_validator("version")
    @classmethod
    def _validate_version(cls, v: int) -> int:
        if v != 1:
            raise ValueError(f"unsupported policy version {v}; only 1 is known")
        return v

    @field_validator("families")
    @classmethod
    def _validate_families(
        cls, v: dict[str, MoreBetsFamilyPolicy]
    ) -> dict[str, MoreBetsFamilyPolicy]:
        got = set(v.keys())
        required = set(CANONICAL_FAMILIES)
        missing = required - got
        if missing:
            raise ValueError(
                f"policy missing required families: {sorted(missing)}"
            )
        extra = got - required
        if extra:
            raise ValueError(
                f"policy contains unknown families (update CANONICAL_FAMILIES first): {sorted(extra)}"
            )
        return v

    def for_family(self, family: str) -> MoreBetsFamilyPolicy:
        """Look up the policy for ``family`` with safe fallback.

        Unknown families fall back to the ``unknown_family`` entry which
        acts as a conservative catch-all. Raises ``KeyError`` if neither
        the requested family nor ``unknown_family`` is present — this
        is a programming error since the schema guarantees both.
        """
        if family in self.families:
            return self.families[family]
        return self.families["unknown_family"]


def resolve_policy_path(env: dict[str, str] | None = None) -> str:
    """Return the path the loader will read from.

    Reads ``MSP_MOREBETS_POLICY_PATH`` first; falls back to the
    repository-relative default. Callers should pass the resolved path
    to ``load_policy`` rather than re-read env.
    """
    source = env if env is not None else os.environ
    raw = (source.get(DEFAULT_POLICY_PATH_ENV) or "").strip()
    return raw or DEFAULT_POLICY_PATH


def load_policy(path: str | os.PathLike[str]) -> MoreBetsPolicy:
    """Load and validate a policy YAML file.

    Raises:
        FileNotFoundError: if the file does not exist.
        pydantic.ValidationError: if the schema check fails.
        yaml.YAMLError: if the YAML is malformed.
    """
    p = Path(path)
    with p.open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}
    return MoreBetsPolicy.model_validate(raw)


def load_policy_from_env(env: dict[str, str] | None = None) -> MoreBetsPolicy:
    """Convenience: resolve the path via env and load it."""
    return load_policy(resolve_policy_path(env))


def dump_policy(policy: MoreBetsPolicy) -> dict[str, Any]:
    """Return a JSON-friendly dict of the policy (for /stats surface)."""
    return policy.model_dump(mode="json")


__all__ = [
    "ALLOWED_SOURCES",
    "CANONICAL_FAMILIES",
    "DEFAULT_POLICY_PATH",
    "DEFAULT_POLICY_PATH_ENV",
    "MoreBetsFamilyPolicy",
    "MoreBetsPolicy",
    "dump_policy",
    "load_policy",
    "load_policy_from_env",
    "resolve_policy_path",
]
