"""Sport/runtime allocation helpers for PS3838 browser fleet."""

from __future__ import annotations

import re
from dataclasses import dataclass

from aggregator.account_pool import FleetAccount


@dataclass(frozen=True)
class SportSpec:
    slug: str
    sport_id: int


def parse_sports(raw: str, *, default: str) -> list[SportSpec]:
    out: list[SportSpec] = []
    for part in (raw or default).split(","):
        part = part.strip()
        if not part:
            continue
        if ":" not in part:
            raise ValueError(f"invalid sport entry {part!r}, expected slug:id")
        slug, sport_id = part.split(":", 1)
        out.append(SportSpec(slug=slug.strip(), sport_id=int(sport_id.strip())))
    if not out:
        raise ValueError("no sports configured")
    return out


def profile_for_sport(account_id: str, sport_slug: str, sport_index: int, offset: int) -> str:
    safe_account = re.sub(r"[^A-Za-z0-9_-]+", "_", account_id)
    safe_slug = re.sub(r"[^A-Za-z0-9_-]+", "_", sport_slug)
    return f"/tmp/remote-fleet-{safe_account}-{safe_slug}-{sport_index}-{offset}"


def accounts_for_sport(
    accounts: list[FleetAccount],
    sport_index: int,
    sport_slug: str,
    target_k: int,
) -> list[FleetAccount]:
    if not accounts:
        return []
    count = max(1, min(target_k, len(accounts)))
    out: list[FleetAccount] = []
    for offset in range(count):
        base = accounts[(sport_index + offset) % len(accounts)]
        cfg = dict(base.cfg)
        cfg.setdefault("profile", profile_for_sport(base.id, sport_slug, sport_index, offset))
        out.append(FleetAccount(id=base.id, cfg=cfg))
    return out


__all__ = ["SportSpec", "accounts_for_sport", "parse_sports", "profile_for_sport"]
