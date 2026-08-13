"""PS3838 account-pool config schema + loader (Story 27.7 / AC-1).

Validated via pydantic; credentials are referenced by name
(``env://...`` or ``vault://...``) so the YAML file never contains
secrets.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator


DEFAULT_POOL_CONFIG_PATH = "config/ps3838_account_pool.yaml"
DEFAULT_POOL_CONFIG_ENV = "MSP_PS3838_POOL_CONFIG_PATH"


class AccountEntry(BaseModel):
    """A single PS3838 account entry in the pool config."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    credentials_ref: str = Field(min_length=1)
    region: str = Field(default="")
    host_node: str = Field(default="")
    max_concurrent_sessions: int = Field(default=1, ge=1, le=4)

    @field_validator("credentials_ref")
    @classmethod
    def _validate_credentials_ref(cls, v: str) -> str:
        if not (v.startswith("env://") or v.startswith("vault://")):
            raise ValueError(
                "credentials_ref must start with 'env://' or 'vault://'"
            )
        return v


class RotationPolicy(BaseModel):
    """Rotation triggers + cool-downs."""

    model_config = ConfigDict(extra="forbid")

    trigger_auth_errors_window_sec: int = Field(default=60, gt=0)
    trigger_threshold: int = Field(default=3, ge=1)
    cooldown_after_rotation_sec: int = Field(default=900, ge=0)
    max_switch_rate_per_hour: int = Field(default=6, ge=1)


class Ps3838PoolConfig(BaseModel):
    """Top-level pool configuration."""

    model_config = ConfigDict(extra="forbid")

    version: int
    accounts: list[AccountEntry] = Field(min_length=1, max_length=4)
    rotation_policy: RotationPolicy

    @field_validator("version")
    @classmethod
    def _v(cls, v: int) -> int:
        if v != 1:
            raise ValueError(f"unsupported pool config version {v}")
        return v

    @field_validator("accounts")
    @classmethod
    def _unique_ids(cls, v: list[AccountEntry]) -> list[AccountEntry]:
        ids = [a.id for a in v]
        if len(set(ids)) != len(ids):
            raise ValueError("accounts[].id must be unique within the pool")
        return v


def resolve_pool_config_path(env: dict[str, str] | None = None) -> str:
    source = env if env is not None else os.environ
    raw = (source.get(DEFAULT_POOL_CONFIG_ENV) or "").strip()
    return raw or DEFAULT_POOL_CONFIG_PATH


def load_pool_config(path: str | os.PathLike[str]) -> Ps3838PoolConfig:
    """Load + validate pool config YAML."""
    with Path(path).open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}
    return Ps3838PoolConfig.model_validate(raw)


def dump_pool_config(cfg: Ps3838PoolConfig) -> dict[str, Any]:
    return cfg.model_dump(mode="json")


__all__ = [
    "AccountEntry",
    "DEFAULT_POOL_CONFIG_ENV",
    "DEFAULT_POOL_CONFIG_PATH",
    "Ps3838PoolConfig",
    "RotationPolicy",
    "dump_pool_config",
    "load_pool_config",
    "resolve_pool_config_path",
]
