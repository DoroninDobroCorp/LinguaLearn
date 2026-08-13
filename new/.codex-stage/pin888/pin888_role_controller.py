#!/usr/bin/env python3
"""Reconcile football/other-sports ownership from a Pin account pool.

One Pin account temporarily owns every supported sport. Two accounts keep
fixed football/other-sports roles. Pools of three or more advance a fair cycle
while keeping exactly two accounts active and the remaining accounts at rest.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pwd
import re
import subprocess
import time
from dataclasses import asdict, dataclass
from pathlib import Path


SOCCER = "soccer"
OTHER_SPORTS = (
    "tennis",
    "basketball",
    "hockey",
    "volleyball",
    "handball",
    "e-sports",
    "table-tennis",
    "baseball",
    "cricket",
    "american-football",
    "aussie-rules",
    "combat-sports",
)
SAFE_ACCOUNT_ID = re.compile(r"^[A-Za-z0-9._-]+$")


@dataclass(frozen=True)
class RolePlan:
    cycle_index: int
    football_owner: str
    other_owner: str
    active_pin_ids: tuple[str, ...]
    assignment: str


def serialize_plan(plan: RolePlan) -> dict:
    """Return the stable JSON representation used for state comparisons."""
    value = asdict(plan)
    value["active_pin_ids"] = list(plan.active_pin_ids)
    return value


def plan_roles(logins: list[str], cycle_index: int) -> RolePlan:
    if not logins:
        raise ValueError("at least one Pin account is required")
    if len(set(logins)) != len(logins):
        raise ValueError("duplicate Pin account id")
    if any(not SAFE_ACCOUNT_ID.fullmatch(login) for login in logins):
        raise ValueError("unsafe Pin account id")

    others_csv = ",".join(OTHER_SPORTS)
    if len(logins) == 1:
        owner = logins[0]
        return RolePlan(
            cycle_index=0,
            football_owner=owner,
            other_owner=owner,
            active_pin_ids=(owner,),
            assignment=f"{owner}={SOCCER},{others_csv}",
        )

    if len(logins) == 2:
        football_owner, other_owner = logins
        return RolePlan(
            cycle_index=0,
            football_owner=football_owner,
            other_owner=other_owner,
            active_pin_ids=(football_owner, other_owner),
            assignment=f"{football_owner}={SOCCER};{other_owner}={others_csv}",
        )

    n = len(logins)
    cycle = max(0, int(cycle_index))
    football_idx = cycle % n
    football_owner = logins[football_idx]
    other_owner = logins[(football_idx + 1) % n]
    return RolePlan(
        cycle_index=cycle,
        football_owner=football_owner,
        other_owner=other_owner,
        active_pin_ids=(football_owner, other_owner),
        assignment=f"{football_owner}={SOCCER};{other_owner}={others_csv}",
    )


def _clean_lines(path: Path) -> list[str]:
    return [
        line.strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def load_pool(accounts_path: Path, proxies_path: Path) -> tuple[list[str], list[str], list[str]]:
    account_lines = _clean_lines(accounts_path)
    proxy_lines = _clean_lines(proxies_path)
    if not account_lines:
        raise ValueError("Pin account pool is empty")
    if len(account_lines) != len(proxy_lines):
        raise ValueError("Pin accounts and proxies must remain 1:1")
    logins = [line.split(":", 1)[0].strip() for line in account_lines]
    if any(not login for login in logins):
        raise ValueError("Pin account id is empty")
    return logins, account_lines, proxy_lines


def pool_fingerprint(logins: list[str], account_lines: list[str], proxy_lines: list[str]) -> str:
    payload = json.dumps(
        {"logins": logins, "accounts": account_lines, "proxies": proxy_lines},
        ensure_ascii=True,
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _atomic_write(path: Path, text: str, mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp-{os.getpid()}")
    with tmp.open("w", encoding="utf-8") as handle:
        handle.write(text)
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(tmp, mode)
    os.replace(tmp, path)


def _load_state(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (FileNotFoundError, OSError, ValueError, TypeError):
        return {}


def _run_systemctl(*args: str) -> None:
    subprocess.run(["systemctl", *args], check=True, timeout=90)


def reconcile(args: argparse.Namespace) -> RolePlan:
    now = time.time()
    logins, account_lines, proxy_lines = load_pool(args.accounts, args.proxies)
    fingerprint = pool_fingerprint(logins, account_lines, proxy_lines)
    state = _load_state(args.state)
    pool_changed = state.get("pool_fingerprint") != fingerprint
    previous_count = int(state.get("account_count", 0) or 0)
    cycle_index = int(state.get("cycle_index", 0) or 0)
    next_rotation_at = float(state.get("next_rotation_at", 0) or 0)

    if len(logins) <= 2:
        cycle_index = 0
        next_rotation_at = 0.0
    elif pool_changed or previous_count < 3:
        cycle_index = 0
        next_rotation_at = now + args.rotation_sec
    elif args.tick and now >= next_rotation_at:
        cycle_index += 1
        next_rotation_at = now + args.rotation_sec

    plan = plan_roles(logins, cycle_index)
    serialized_plan = serialize_plan(plan)
    old_plan = state.get("plan") if isinstance(state.get("plan"), dict) else {}
    must_apply = pool_changed or old_plan != serialized_plan
    if not must_apply:
        return plan

    by_login = {
        login: (account_lines[idx], proxy_lines[idx])
        for idx, login in enumerate(logins)
    }
    selected = [by_login[login] for login in plan.active_pin_ids]
    preflight_path = args.state.parent / f".proxy-preflight-{os.getpid()}.txt"
    try:
        _atomic_write(preflight_path, "".join(row[1] + "\n" for row in selected))
        subprocess.run(
            [
                str(args.proxy_preflight),
                "--proxies",
                str(preflight_path),
            ],
            check=True,
            timeout=45,
        )
    finally:
        preflight_path.unlink(missing_ok=True)
    _atomic_write(args.active_accounts, "".join(row[0] + "\n" for row in selected))
    _atomic_write(args.active_proxies, "".join(row[1] + "\n" for row in selected))
    fleet_user = pwd.getpwnam(args.fleet_user)
    os.chown(args.active_accounts, fleet_user.pw_uid, fleet_user.pw_gid)
    os.chown(args.active_proxies, fleet_user.pw_uid, fleet_user.pw_gid)
    dropin = (
        "[Service]\n"
        f'Environment="REMOTE_FLEET_ACCOUNT_SPORTS={plan.assignment}"\n'
    )
    _atomic_write(args.dropin, dropin, mode=0o644)

    _run_systemctl("daemon-reload")
    _run_systemctl("enable", "--now", args.fleet_unit)
    _run_systemctl("restart", args.fleet_unit)
    active = subprocess.run(
        ["systemctl", "is-active", "--quiet", args.fleet_unit],
        check=False,
        timeout=15,
    ).returncode == 0
    if not active:
        raise RuntimeError("Pin fleet unit failed to become active")

    payload = {
        "account_count": len(logins),
        "pool_fingerprint": fingerprint,
        "cycle_index": plan.cycle_index,
        "next_rotation_at": next_rotation_at,
        "plan": serialized_plan,
        "updated_at": now,
    }
    _atomic_write(args.state, json.dumps(payload, sort_keys=True) + "\n")
    return plan


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tick", action="store_true")
    parser.add_argument("--rotation-sec", type=float, default=28800.0)
    parser.add_argument("--accounts", type=Path, default=Path("/home/admin805/.secrets/pin888_accounts.txt"))
    parser.add_argument("--proxies", type=Path, default=Path("/home/admin805/.secrets/pin888_proxies.txt"))
    parser.add_argument("--active-accounts", type=Path, default=Path("/home/admin805/.secrets/pin888_active_accounts.txt"))
    parser.add_argument("--active-proxies", type=Path, default=Path("/home/admin805/.secrets/pin888_active_proxies.txt"))
    parser.add_argument("--state", type=Path, default=Path("/var/lib/pin888-role-controller/state.json"))
    parser.add_argument("--dropin", type=Path, default=Path("/etc/systemd/system/pin888-role-fleet.service.d/50-role.conf"))
    parser.add_argument("--fleet-unit", default="pin888-role-fleet.service")
    parser.add_argument("--fleet-user", default="admin805")
    parser.add_argument("--proxy-preflight", type=Path, default=Path("/srv/pin888/bin/check-pin888-proxies"))
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.rotation_sec < 60:
        raise SystemExit("rotation interval must be at least 60 seconds")
    plan = reconcile(args)
    print(json.dumps(serialize_plan(plan), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
