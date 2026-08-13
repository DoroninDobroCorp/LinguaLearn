"""Runtime account loader for MORE_BET fleet (Story 27.41).

Loads local secrets into both canonical ``Account`` objects and fleet worker
configs.  The loader is deliberately strict about PS3838 by default: every
account must have exactly one proxy.  Direct mode is explicit and opt-in.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from aggregator.account_fsm import AccountFSM, AccountState
from aggregator.account_pool import Account, FleetAccount, MoreBetsBudget

DEFAULT_PS3838_ACCOUNTS_PATH = "~/.secrets/ps3838_accounts.txt"
DEFAULT_PS3838_PROXIES_PATH = "~/.secrets/ps3838_proxies.txt"
DEFAULT_PS3838_DOMAIN = "www.ps3838.com"


@dataclass(frozen=True)
class RuntimeAccountBundle:
    """Canonical + fleet views for one credential/proxy pair."""

    account: Account
    fleet_account: FleetAccount


@dataclass(frozen=True)
class _ParsedAccount:
    login: str
    password: str
    source_type: str
    note: str
    proxy_index: int | None = None


@dataclass(frozen=True)
class _ParsedProxy:
    host: str
    port: str
    user: str
    password: str


def _clean_lines(lines: Iterable[str]) -> list[str]:
    out: list[str] = []
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        out.append(line)
    return out


def parse_ps3838_accounts(lines: Iterable[str]) -> list[_ParsedAccount]:
    """Parse ``LOGIN:PASS:TYPE:NOTE`` rows.

    Password is field ``[1]`` after splitting by ``:``.  If it is empty,
    the login is used as the known legacy fallback.
    """
    parsed: list[_ParsedAccount] = []
    for line in _clean_lines(lines):
        parts = line.split(":")
        login = parts[0].strip() if parts else ""
        password = parts[1].strip() if len(parts) > 1 else ""
        if not login:
            continue
        note = ":".join(parts[3:]).strip() if len(parts) > 3 else ""
        proxy_match = re.search(r"proxy#(\d+)|прокси#(\d+)", note, re.IGNORECASE)
        proxy_index = None
        if proxy_match is not None:
            raw_idx = proxy_match.group(1) or proxy_match.group(2)
            proxy_index = int(raw_idx)
        parsed.append(
            _ParsedAccount(
                login=login,
                password=password or login,
                source_type=parts[2].strip() if len(parts) > 2 else "",
                note=note,
                proxy_index=proxy_index,
            )
        )
    return parsed


def _is_fleet_ws_account(account: _ParsedAccount) -> bool:
    source_type = account.source_type.strip().lower()
    if source_type == "api":
        return False
    note = account.note.lower()
    if "api-only" in note or "api only" in note:
        return False
    return source_type in {"", "ws", "browser_ws", "ps3838"}


def _is_direct_account(account: _ParsedAccount) -> bool:
    note = account.note.lower()
    return (
        account.proxy_index == 0
        or "direct" in note
        or "no_proxy" in note
        or "no-proxy" in note
        or "без прокси" in note
    )


def parse_ps3838_proxies(
    lines: Iterable[str],
    *,
    default_user: str = "",
    default_password: str = "",
) -> list[_ParsedProxy]:
    """Parse proxy rows as ``host:port[:user:password]``.

    The current production proxy auth is shared, so two-field rows are valid
    only when defaults are supplied by the caller.
    """
    parsed: list[_ParsedProxy] = []
    for line in _clean_lines(lines):
        parts = line.split(":")
        if len(parts) < 2:
            continue
        user = parts[2].strip() if len(parts) > 2 else default_user
        password = parts[3].strip() if len(parts) > 3 else default_password
        if not user or not password:
            raise ValueError("proxy auth is required; direct fallback is forbidden")
        parsed.append(
            _ParsedProxy(
                host=parts[0].strip(),
                port=parts[1].strip(),
                user=user,
                password=password,
            )
        )
    return parsed


def build_ps3838_runtime_bundles(
    accounts: list[_ParsedAccount],
    proxies: list[_ParsedProxy],
    *,
    domain: str = DEFAULT_PS3838_DOMAIN,
    budget_cap: int = 60,
    budget_window_sec: float = 60.0,
    allow_direct: bool = False,
) -> list[RuntimeAccountBundle]:
    """Build canonical and fleet account descriptors from parsed secrets."""
    fleet_accounts = [a for a in accounts if _is_fleet_ws_account(a)]
    direct_accounts = [a for a in fleet_accounts if allow_direct and _is_direct_account(a)]
    indexed_accounts = [
        a for a in fleet_accounts
        if a.proxy_index is not None and a.proxy_index != 0
    ]
    if indexed_accounts or direct_accounts:
        accounts_with_routes: list[tuple[_ParsedAccount, _ParsedProxy | None]] = []
        used_proxy_indexes: set[int] = set()
        direct_logins = {a.login for a in direct_accounts}
        for acc in direct_accounts:
            accounts_with_routes.append((acc, None))
        for acc in indexed_accounts:
            if acc.login in direct_logins:
                continue
            proxy_index = acc.proxy_index
            if proxy_index is None or proxy_index < 1 or proxy_index > len(proxies):
                raise ValueError("PS3838 account references missing proxy index")
            if proxy_index in used_proxy_indexes:
                raise ValueError("PS3838 proxy index is assigned to multiple accounts")
            used_proxy_indexes.add(proxy_index)
            accounts_with_routes.append((acc, proxies[proxy_index - 1]))
    else:
        if allow_direct and not proxies:
            accounts_with_routes = [(acc, None) for acc in fleet_accounts]
        elif len(fleet_accounts) != len(proxies):
            raise ValueError("PS3838 fleet accounts and proxies must be 1:1")
        else:
            accounts_with_routes = list(zip(fleet_accounts, proxies))
    if not accounts_with_routes:
        raise ValueError("no PS3838 WS fleet accounts with assigned route")
    bundles: list[RuntimeAccountBundle] = []
    for acc, proxy in accounts_with_routes:
        route_profile = {
            "source_type": acc.source_type,
            "note": acc.note,
            "domain": domain,
        }
        if proxy is not None:
            route_profile.update({"proxy_host": proxy.host, "proxy_port": proxy.port})
        else:
            route_profile.update({"route": "direct"})
        account = Account(
            account_id=acc.login,
            family="ps3838",
            role="more_bet_fleet",
            credentials_ref="local://ps3838/%s" % acc.login,
            supported_transports={"browser_ws"},
            current_transport="browser_ws",
            more_bets_budget=MoreBetsBudget(
                cap=budget_cap,
                window_sec=budget_window_sec,
            ),
            capability_profile=route_profile,
            fsm=AccountFSM(
                state=AccountState.HEALTHY_BROWSER_WS,
                hysteresis_ticks_required=1,
            ),
        )
        fleet_cfg = {
            "user": acc.login,
            "password": acc.password,
            "domain": domain,
        }
        if proxy is not None:
            fleet_cfg.update(
                {
                    "proxy_host": proxy.host,
                    "proxy_port": proxy.port,
                    "proxy_user": proxy.user,
                    "proxy_pass": proxy.password,
                }
            )
        else:
            fleet_cfg.update({"direct_mode": "1"})
        fleet_account = FleetAccount(
            id=acc.login,
            cfg=fleet_cfg,
        )
        bundles.append(RuntimeAccountBundle(account=account, fleet_account=fleet_account))
    return bundles


def load_ps3838_runtime_bundles(
    *,
    accounts_path: str = DEFAULT_PS3838_ACCOUNTS_PATH,
    proxies_path: str = DEFAULT_PS3838_PROXIES_PATH,
    proxy_user: str = "",
    proxy_password: str = "",
    domain: str = DEFAULT_PS3838_DOMAIN,
    allow_direct: bool = False,
) -> list[RuntimeAccountBundle]:
    """Load PS3838 runtime accounts from local secret files."""
    accounts_file = Path(accounts_path).expanduser()
    proxies_file = Path(proxies_path).expanduser()
    accounts = parse_ps3838_accounts(accounts_file.read_text(encoding="utf-8").splitlines())
    proxies = parse_ps3838_proxies(
        proxies_file.read_text(encoding="utf-8").splitlines(),
        default_user=proxy_user,
        default_password=proxy_password,
    )
    return build_ps3838_runtime_bundles(
        accounts,
        proxies,
        domain=domain,
        allow_direct=allow_direct,
    )


__all__ = [
    "DEFAULT_PS3838_ACCOUNTS_PATH",
    "DEFAULT_PS3838_DOMAIN",
    "DEFAULT_PS3838_PROXIES_PATH",
    "RuntimeAccountBundle",
    "build_ps3838_runtime_bundles",
    "load_ps3838_runtime_bundles",
    "parse_ps3838_accounts",
    "parse_ps3838_proxies",
]
