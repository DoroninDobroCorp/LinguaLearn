"""Multi-host deployment config (Phase 8, TZ §10).

Planning module — suggests which processes go where based on account
profiles and API availability. Does NOT actually deploy or start
anything. Operators use the output to configure process managers.

Import-time inert. No I/O, no env reads.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class HostRole(str, Enum):
    """Role a host can play in the multi-source platform."""

    BROWSER_HOST = "browser_host"  # Mac — browser accounts only
    API_HOST = "api_host"  # Server — API + aggregator + feed
    HYBRID = "hybrid"  # Both (single-machine dev/staging)


@dataclass
class ProcessAssignment:
    """A single process assigned to a host."""

    process: str  # e.g. "browser_source:acct-1", "api_poller", "aggregator"
    host_role: HostRole
    reason: str = ""


@dataclass
class DeploymentPlan:
    """Output of plan_deployment — which processes go where."""

    assignments: list[ProcessAssignment] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def by_role(self, role: HostRole) -> list[ProcessAssignment]:
        """Filter assignments by host role."""
        return [a for a in self.assignments if a.host_role == role]

    def summary(self) -> dict[str, Any]:
        """JSON-serialisable summary."""
        return {
            "total_processes": len(self.assignments),
            "browser_host": len(self.by_role(HostRole.BROWSER_HOST)),
            "api_host": len(self.by_role(HostRole.API_HOST)),
            "hybrid": len(self.by_role(HostRole.HYBRID)),
            "notes": self.notes,
        }


@dataclass
class DeploymentConfig:
    """Configuration for which sources run on which host.

    Operators populate this before calling ``plan_deployment``.
    """

    browser_accounts: list[str] = field(default_factory=list)
    api_sources: list[str] = field(default_factory=list)
    single_host: bool = False  # True → everything goes to HYBRID


def plan_deployment(
    config: DeploymentConfig,
    *,
    api_available: bool = True,
) -> DeploymentPlan:
    """Suggest which processes go where.

    Parameters
    ----------
    config : DeploymentConfig with account/source info.
    api_available : whether the official API is reachable.

    Returns
    -------
    DeploymentPlan with assignments and advisory notes.
    """
    plan = DeploymentPlan()

    if config.single_host:
        # All processes on HYBRID.
        for acct in config.browser_accounts:
            plan.assignments.append(
                ProcessAssignment(
                    process=f"browser_source:{acct}",
                    host_role=HostRole.HYBRID,
                    reason="single_host mode",
                )
            )
        if api_available:
            for src in config.api_sources:
                plan.assignments.append(
                    ProcessAssignment(
                        process=f"api_poller:{src}",
                        host_role=HostRole.HYBRID,
                        reason="single_host mode",
                    )
                )
        plan.assignments.append(
            ProcessAssignment(
                process="aggregator",
                host_role=HostRole.HYBRID,
                reason="single_host mode",
            )
        )
        plan.assignments.append(
            ProcessAssignment(
                process="feed_server",
                host_role=HostRole.HYBRID,
                reason="single_host mode",
            )
        )
        plan.notes.append("Single-host mode: all processes co-located.")
        if not api_available:
            plan.notes.append("API unavailable — API pollers not assigned.")
        if not api_available and not config.browser_accounts:
            plan.notes.append("WARNING: No data sources available.")
        return plan

    # Multi-host: browser accounts on BROWSER_HOST, API + aggregator on API_HOST.
    for acct in config.browser_accounts:
        plan.assignments.append(
            ProcessAssignment(
                process=f"browser_source:{acct}",
                host_role=HostRole.BROWSER_HOST,
                reason="browser accounts require Mac with Chrome",
            )
        )

    if api_available:
        for src in config.api_sources:
            plan.assignments.append(
                ProcessAssignment(
                    process=f"api_poller:{src}",
                    host_role=HostRole.API_HOST,
                    reason="API poller runs on server",
                )
            )
    else:
        plan.notes.append("API unavailable — API pollers not assigned.")

    plan.assignments.append(
        ProcessAssignment(
            process="aggregator",
            host_role=HostRole.API_HOST,
            reason="aggregator runs co-located with API",
        )
    )
    plan.assignments.append(
        ProcessAssignment(
            process="feed_server",
            host_role=HostRole.API_HOST,
            reason="feed server runs co-located with aggregator",
        )
    )

    if not config.browser_accounts:
        plan.notes.append("No browser accounts configured — pool will be empty.")
    if not api_available and not config.browser_accounts:
        plan.notes.append("WARNING: No data sources available.")

    return plan


__all__ = [
    "DeploymentConfig",
    "DeploymentPlan",
    "HostRole",
    "ProcessAssignment",
    "plan_deployment",
]
