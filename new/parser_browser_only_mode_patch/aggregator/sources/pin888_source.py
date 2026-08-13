"""pin888 → aggregator source adapter.

The existing pin888 runtime (`core/broadcaster.py`,
`handlers/fo_handler.py`, etc.) speaks a particular legacy shape:

    {"type": "update", "source": "ps3838", "data": <event-dict>, "stale": <bool>}

This adapter converts those legacy emissions into `SourceEvent`s for
the aggregator's `IngestRouter`, **without** changing the broadcaster
path itself. Production behavior is preserved exactly:

- when ``MSP_AGGREGATOR_ENABLED`` is unset (default) this module does
  nothing at runtime;
- when set, the broadcaster can call `Pin888SourceAdapter.from_legacy_update`
  and forward the resulting `SourceEvent` to its `IngestRouter`.

The adapter does not import broadcaster / connection / fo_handler
modules to keep the import-time graph tiny and unit-testable without
network deps.
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any

from aggregator.ingest import IngestRouter
from aggregator.types import SourceEvent

DEFAULT_FAMILY = "pinnacle_native"
DEFAULT_TRANSPORT = "browser_ws"

# How many silent drops we tolerate before logging a single warning.
_MISSING_PID_LOG_EVERY = 100

# Module-level counter for events skipped because no stable id could be
# derived. Kept deliberately simple — `int` behind a `Lock`, no metrics
# infra. Read via :func:`missing_pid_drop_count` from tests.
_missing_pid_lock = threading.Lock()
_missing_pid_drops = 0


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _event_id_from_payload(payload: dict[str, Any]) -> str | None:
    """Stable canonical id for an event-dict, or ``None`` if undecidable.

    pin888 events carry a `Pid` (mapped public id). We prefix with the
    family namespace per TZ §6.3 (`event_id` example
    `agg:soccer:1234567`) but keep it compact in Phase 1.

    When `Pid` / `EventId` / `id` are *all* absent we return ``None``
    instead of a constant fallback string — collapsing every malformed
    payload to a single id (e.g. ``"pin888:unknown"``) caused candidate
    bucket collisions that overwrote real events. The caller is
    expected to drop the event and bump the missing-pid counter.
    """
    pid = payload.get("Pid")
    if pid is None:
        pid = payload.get("EventId") or payload.get("id")
    if pid is None or pid == "":
        return None
    return f"pin888:{pid}"


def missing_pid_drop_count() -> int:
    """Return the number of payloads dropped due to missing stable id."""
    with _missing_pid_lock:
        return _missing_pid_drops


def _bump_missing_pid_drop() -> int:
    global _missing_pid_drops
    with _missing_pid_lock:
        _missing_pid_drops += 1
        return _missing_pid_drops


class Pin888SourceAdapter:
    """Adapter that turns legacy pin888 broadcaster emissions into
    `SourceEvent`s and forwards them to the aggregator router.
    """

    def __init__(
        self,
        router: IngestRouter,
        *,
        source_id: str = "pin888:acct-A:browser_ws",
        account_id: str = "pin888-acct-a",
        family: str = DEFAULT_FAMILY,
        transport: str = DEFAULT_TRANSPORT,
    ) -> None:
        self.router = router
        self.source_id = source_id
        self.account_id = account_id
        self.family = family
        self.transport = transport

    # ── conversion ─────────────────────────────────────────────────────

    def build_event(
        self,
        payload: dict[str, Any],
        *,
        is_tombstone: bool | None = None,
        collected_at: datetime | None = None,
    ) -> SourceEvent | None:
        """Build a `SourceEvent` from a pin888-shaped payload.

        Returns ``None`` if the payload has no derivable stable id —
        callers MUST treat ``None`` as "skip this event".
        """
        event_id = _event_id_from_payload(payload)
        if event_id is None:
            return None
        if is_tombstone is None:
            is_tombstone = bool(payload.get("Removed") or payload.get("Deleted"))
        now = collected_at or _utc_now()
        # Story 27.17 — enrich payload с sport_id (numeric), starts_at
        # (ISO string) и is_live (bool) чтобы downstream (snapshot views,
        # distance tests) могли группировать per-sport / разделять live
        # vs prematch. Не mutate'им shared payload — работаем с копией
        # ссылки в рамках вызова build_event.
        from aggregator.sports import sport_id_from_name

        sport_name = payload.get("SportName")
        payload.setdefault(
            "sport_id",
            sport_id_from_name(sport_name) if isinstance(sport_name, str) else None,
        )
        # pin888 WS payload uses ``matchDate`` (ISO8601 Z). Legacy fields
        # (StartDate/startTime) проверяются для backward-compat когда
        # source format мог поменяться. Story 27.17 live probe
        # подтвердил: поле именно ``matchDate``, coverage 100%.
        payload.setdefault(
            "starts_at",
            payload.get("matchDate")
            or payload.get("StartDate")
            or payload.get("starts_at")
            or payload.get("startTime"),
        )
        if "is_live" not in payload:
            payload["is_live"] = bool(payload.get("isLive"))
        return SourceEvent(
            source_id=self.source_id,
            family=self.family,
            transport=self.transport,
            event_id=event_id,
            payload=payload,
            collected_at=now,
            received_at=now,
            is_tombstone=is_tombstone,
            account_id=self.account_id,
        )

    def from_legacy_update(self, envelope: dict[str, Any]) -> SourceEvent | None:
        """Build a `SourceEvent` from a legacy `update` envelope.

        Returns None for envelopes that do not carry a per-event payload
        (e.g. status messages or full-state snapshots — those are
        handled by separate hooks in later phases) **or** when the
        payload has no stable id.
        """
        if not isinstance(envelope, dict):
            return None
        if envelope.get("type") != "update" or envelope.get("source") != "ps3838":
            return None
        payload = envelope.get("data")
        if not isinstance(payload, dict):
            return None
        return self.build_event(payload)

    # ── runtime hook ──────────────────────────────────────────────────

    def emit_legacy_update(self, envelope: dict[str, Any]) -> None:
        """Forward a single legacy `update` envelope into the router.

        Errors are swallowed so that failures inside the aggregator
        cannot break the production broadcaster path. (Errors are still
        observable through `IngestRouter`'s store and history.)

        Payloads with no derivable stable id are dropped silently;
        every Nth drop logs one warning so operators notice broken
        upstream payloads without log spam.
        """
        if not isinstance(envelope, dict):
            return
        if envelope.get("type") != "update" or envelope.get("source") != "ps3838":
            return
        payload = envelope.get("data")
        if not isinstance(payload, dict):
            return
        ev = self.build_event(payload)
        if ev is None:
            count = _bump_missing_pid_drop()
            if count % _MISSING_PID_LOG_EVERY == 1:
                try:
                    from utils.utils import log
                    log(
                        f"[MSP] pin888 source dropped event with no Pid/EventId/id "
                        f"(total drops={count})"
                    )
                except Exception:  # noqa: BLE001 — never break producer
                    pass
            return
        try:
            self.router.ingest(ev)
        except Exception:  # noqa: BLE001 — never break the producer
            return


__all__ = ["Pin888SourceAdapter", "missing_pid_drop_count"]
