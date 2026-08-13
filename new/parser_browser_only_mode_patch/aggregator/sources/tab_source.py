"""Tab-mode source adapter (Phase 6, TZ §3.3 / §7).

Aggregator-side receiver for tab-mode snapshots. The actual tab
polling runs in the browser runtime; this stub normalizes incoming
snapshots into ``SourceEvent``s with ``transport_mode="tab"`` metadata
so the decision engine can apply the tab penalty.

Active only when ``MSP_FAILOVER_ENABLED=1``. Import-time inert.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


def failover_enabled() -> bool:
    """Check ``MSP_FAILOVER_ENABLED``; tab reuses same flag."""
    return os.environ.get("MSP_FAILOVER_ENABLED", "").strip() in (
        "1",
        "true",
        "True",
        "yes",
    )


@dataclass
class TabSnapshot:
    """Raw snapshot received from a tab-mode browser account."""

    account_id: str
    family: str
    events: list[dict[str, Any]] = field(default_factory=list)
    captured_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class TabSourceEvent:
    """Normalized event emitted by TabSource.

    Carries ``transport_mode="tab"`` so downstream can identify penalty
    tier and ``source_id`` encoded as ``<family>:<account_id>:tab``.
    """

    source_id: str
    event_id: str
    family: str
    transport_mode: str = "tab"
    payload: dict[str, Any] = field(default_factory=dict)
    received_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class TabSource:
    """Aggregator-side adapter for tab-mode data.

    Accepts :class:`TabSnapshot` from the browser runtime side and
    emits normalized :class:`TabSourceEvent` objects. Callers feed
    these into the IngestRouter via the standard SourceEvent path.
    """

    family: str
    transport: str = "tab"
    _event_count: int = 0

    def process_snapshot(self, snapshot: TabSnapshot) -> list[TabSourceEvent]:
        """Convert a raw tab snapshot to source events."""
        if not failover_enabled():
            return []
        results: list[TabSourceEvent] = []
        source_id = f"{snapshot.family}:{snapshot.account_id}:tab"
        for raw_event in snapshot.events:
            event_id = raw_event.get("event_id", f"tab_{self._event_count}")
            self._event_count += 1
            results.append(
                TabSourceEvent(
                    source_id=source_id,
                    event_id=event_id,
                    family=snapshot.family,
                    transport_mode="tab",
                    payload=dict(raw_event),
                    received_at=snapshot.captured_at,
                    metadata={
                        "transport_mode": "tab",
                        "account_id": snapshot.account_id,
                        "tab_penalty": True,
                    },
                )
            )
        return results


__all__ = [
    "TabSnapshot",
    "TabSource",
    "TabSourceEvent",
    "failover_enabled",
]
