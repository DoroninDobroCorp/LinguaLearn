"""Migration helpers: dual publish + comparison (Phase 7, TZ §10).

``DualPublisher`` publishes to BOTH the legacy :9012 feed surface AND
the new v2 feed simultaneously during the migration window. In
comparison mode, it logs divergences between legacy and v2 payloads
for validation.

Flag: ``MSP_DUAL_PUBLISH_ENABLED`` (default off). Import-time inert.
"""

from __future__ import annotations

import json
import os
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Optional

# Maximum divergence records retained in memory.
DIVERGENCE_LOG_MAXLEN: int = 10_000


def dual_publish_enabled() -> bool:
    """Check ``MSP_DUAL_PUBLISH_ENABLED``; default OFF."""
    return os.environ.get("MSP_DUAL_PUBLISH_ENABLED", "").strip() in (
        "1",
        "true",
        "True",
        "yes",
    )


@dataclass
class DivergenceRecord:
    """Records a divergence between legacy and v2 payloads."""

    timestamp: datetime
    event_id: str
    field_path: str
    legacy_value: Any
    v2_value: Any


Publisher = Callable[[dict[str, Any]], None]


@dataclass
class DualPublisher:
    """Publishes to legacy + v2 feed during migration.

    Parameters
    ----------
    legacy_publisher : callable that accepts a payload dict for legacy.
    v2_publisher : callable that accepts a payload dict for v2.
    comparison_mode : when True, compares payloads and logs divergences.
    """

    legacy_publisher: Publisher
    v2_publisher: Publisher
    comparison_mode: bool = False
    _divergences: deque[DivergenceRecord] = field(
        default_factory=lambda: deque(maxlen=DIVERGENCE_LOG_MAXLEN)
    )

    @property
    def divergences(self) -> list[DivergenceRecord]:
        return list(self._divergences)

    def publish(
        self,
        legacy_payload: dict[str, Any],
        v2_payload: dict[str, Any],
        *,
        event_id: str = "",
        now: Optional[datetime] = None,
    ) -> None:
        """Publish to both destinations.

        When ``MSP_DUAL_PUBLISH_ENABLED`` is off, only legacy is published.
        """
        # Always publish legacy.
        self.legacy_publisher(legacy_payload)

        if not dual_publish_enabled():
            return

        # Publish v2.
        self.v2_publisher(v2_payload)

        # Compare if in comparison mode.
        if self.comparison_mode:
            self._compare(legacy_payload, v2_payload, event_id, now)

    def _compare(
        self,
        legacy: dict[str, Any],
        v2: dict[str, Any],
        event_id: str,
        now: Optional[datetime],
    ) -> None:
        when = now or datetime.now(timezone.utc)
        # Shallow comparison of top-level keys present in both.
        all_keys = set(legacy.keys()) | set(v2.keys())
        for key in sorted(all_keys):
            lv = legacy.get(key)
            vv = v2.get(key)
            if _normalize_for_compare(lv) != _normalize_for_compare(vv):
                self._divergences.append(
                    DivergenceRecord(
                        timestamp=when,
                        event_id=event_id,
                        field_path=key,
                        legacy_value=lv,
                        v2_value=vv,
                    )
                )


def _normalize_for_compare(val: Any) -> str:
    """Normalize value for comparison (JSON canonical form)."""
    try:
        return json.dumps(val, sort_keys=True, default=str)
    except (TypeError, ValueError):
        return str(val)


__all__ = [
    "DivergenceRecord",
    "DualPublisher",
    "dual_publish_enabled",
]
