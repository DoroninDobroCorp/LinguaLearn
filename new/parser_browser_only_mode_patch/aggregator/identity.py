"""Event identity helpers for runtime source convergence.

Default behavior keeps every source in its own event-id namespace.
When ``MSP_SHARED_PID_EVENT_ID_ENABLED`` is enabled, pinnacle-native
sources that carry the same runtime ``Pid`` collapse to a shared
canonical event id:

    ``agg:pid:<Pid>``

This is the pragmatic bridge between the existing browser/runtime
feeds and the official API source while the full fuzzy cross-source
matcher is still being wired into the hot path.
"""

from __future__ import annotations

import os
import threading
from typing import Any

from aggregator.types import SourceEvent

_SHARED_PID_FAMILIES: frozenset[str] = frozenset(
    {"pin888", "ps3838", "pinnacle_api", "piwi247", "pv247"}
)

# Cache the flag value once at first access to avoid per-event os.environ reads
# and to ensure consistent behavior within a single process lifetime.
_shared_pid_enabled_cached: bool | None = None
_shared_pid_lock = threading.Lock()


def shared_pid_event_id_enabled() -> bool:
    global _shared_pid_enabled_cached
    if _shared_pid_enabled_cached is None:
        with _shared_pid_lock:
            if _shared_pid_enabled_cached is None:
                _shared_pid_enabled_cached = os.environ.get(
                    "MSP_SHARED_PID_EVENT_ID_ENABLED", ""
                ).strip() in ("1", "true", "True", "yes")
    return _shared_pid_enabled_cached


def shared_pid_event_id(event: SourceEvent, payload: dict[str, Any]) -> str:
    """Resolve a canonical event id for sources that share Pinnacle ``Pid``.

    When disabled or when the source/payload do not qualify, the source
    event id is preserved unchanged.
    """
    if not shared_pid_event_id_enabled():
        return event.event_id
    if not isinstance(payload, dict):
        return event.event_id

    source_head = str(event.source_id or "").split(":", 1)[0].strip().lower()
    if source_head not in _SHARED_PID_FAMILIES:
        return event.event_id

    pid = payload.get("Pid")
    if pid in (None, ""):
        return event.event_id
    try:
        return f"agg:pid:{int(pid)}"
    except (TypeError, ValueError):
        return event.event_id


__all__ = [
    "shared_pid_event_id",
    "shared_pid_event_id_enabled",
]
