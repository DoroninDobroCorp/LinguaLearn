"""Compatibility shim: PublishedQuote → legacy `:9012` payloads.

The current cutover chain
``Mac :9012 → dev :9014 → serverforvovka :9012 → admin.ibet.team`` consumes messages of
the shape produced by ``core/broadcaster._build_update_payload``:

    {"type": "update", "source": "ps3838", "data": <event-dict>, "stale": <bool>}

with optional `"reason"` when `stale` is true.

Tombstone updates emitted by ``handlers/fo_handler.py`` (~line 1214) use
a *different* shape with NO ``stale`` key:

    {"type": "update", "source": "ps3838", "data": {"Pid": ..., "Removed": True, ...}}

Aggregator-produced quotes are compatible with the public monitor, but
some downstream legacy consumers still expect event-level aliases such
as ``Source`` / ``HomeName`` / ``AwayName``. This shim therefore keeps
the existing outer envelope while backfilling those aliases for normal
events before they are re-emitted on ``:9012``.

The shim is also responsible for producing the `init` and tombstone
shapes — both belong in this module so that all "legacy contract"
knowledge lives in one place.
"""

from __future__ import annotations

import copy
from typing import Any, Iterable

from aggregator.types import PublishedQuote

PIN888_SOURCE_TAG = "ps3838"
PIN888_EVENT_SOURCE = "Pinnacle"


def _payload_with_published_outcomes(quote: PublishedQuote) -> dict[str, Any]:
    """Project outcome-granular winners back into the legacy Periods shape."""
    payload = copy.deepcopy(quote.payload) if isinstance(quote.payload, dict) else {}
    periods = payload.get("Periods")
    if not isinstance(periods, list) or not quote.outcomes:
        return payload
    by_number = {
        str(period.get("Number", index)): period
        for index, period in enumerate(periods)
        if isinstance(period, dict)
    }
    for outcome in quote.outcomes:
        parts = str(outcome.market_id or "").split(":", 2)
        if len(parts) < 2 or not parts[0].startswith("p") or outcome.price is None:
            continue
        period = by_number.get(parts[0][1:])
        if not isinstance(period, dict):
            continue
        market = period.get(parts[1])
        if not isinstance(market, dict):
            continue
        target = market
        if len(parts) == 3:
            target = market.get(parts[2])
            if not isinstance(target, dict):
                continue
        current = target.get(outcome.outcome_id)
        if isinstance(current, dict):
            current["value"] = outcome.price
        elif current is not None:
            target[outcome.outcome_id] = outcome.price
    return payload


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _with_pin888_event_aliases(payload: dict[str, Any]) -> dict[str, Any]:
    """Backfill legacy analyzer aliases on a normal event payload."""
    out = dict(payload) if isinstance(payload, dict) else {}

    source_name = _text(out.get("Source")) or PIN888_EVENT_SOURCE
    league_name = _text(out.get("LeagueName")) or _text(out.get("leagueName"))
    home_name = _text(out.get("HomeName")) or _text(out.get("homeName")) or _text(out.get("Home"))
    away_name = _text(out.get("AwayName")) or _text(out.get("awayName")) or _text(out.get("Away"))

    if source_name and not _text(out.get("Source")):
        out["Source"] = source_name
    if league_name and not _text(out.get("LeagueName")):
        out["LeagueName"] = league_name
    if home_name:
        if not _text(out.get("homeName")):
            out["homeName"] = home_name
        if not _text(out.get("HomeName")):
            out["HomeName"] = home_name
        if not _text(out.get("Home")):
            out["Home"] = home_name
    if away_name:
        if not _text(out.get("awayName")):
            out["awayName"] = away_name
        if not _text(out.get("AwayName")):
            out["AwayName"] = away_name
        if not _text(out.get("Away")):
            out["Away"] = away_name
    return out


def payload_has_identity(payload: dict[str, Any]) -> bool:
    """Whether a payload has the minimum identity required by legacy consumers."""
    data = _with_pin888_event_aliases(payload)
    return bool(
        _text(data.get("LeagueName"))
        and _text(data.get("homeName"))
        and _text(data.get("awayName"))
    )


def _as_pin888_data(payload: dict[str, Any], *, is_tombstone: bool) -> dict[str, Any]:
    """Return the `data` block of the legacy `update` envelope.

    For non-tombstone events the payload is backfilled with the legacy
    aliases still required by the analyzer path. For tombstones we
    preserve the historical shape and ensure both `Removed=True`
    and `Deleted=True` markers are present (R2-M2). Legacy consumers
    may check either field; setting both matches
    services.forwarder_smart._build_removed_payload semantics.
    """
    if not is_tombstone:
        return _with_pin888_event_aliases(payload)
    out = dict(payload) if isinstance(payload, dict) else {}
    out["Removed"] = True
    out["Deleted"] = True
    return out


def to_pin888_update(
    quote: PublishedQuote,
    *,
    stale: bool = False,
    stale_reason: str | None = None,
) -> dict[str, Any]:
    """Build the legacy `update` envelope.

    For live (non-tombstone) quotes this preserves the historical
    envelope while backfilling legacy event-level aliases that some
    downstream analyzer consumers still require.

    For tombstone quotes (``quote.is_tombstone`` True) it matches the
    shape emitted by ``handlers/fo_handler.py`` line ~1214:
    ``{"type":"update","source":"ps3838","data": <ts-dict>}`` with NO
    ``stale`` key — the ``stale`` and ``stale_reason`` arguments are
    ignored to keep tombstone bytes identical to the legacy producer.
    """
    data = _as_pin888_data(
        _payload_with_published_outcomes(quote), is_tombstone=quote.is_tombstone
    )
    if quote.is_tombstone:
        return {"type": "update", "source": PIN888_SOURCE_TAG, "data": data}
    envelope: dict[str, Any] = {
        "type": "update",
        "source": PIN888_SOURCE_TAG,
        "data": data,
        "stale": bool(stale),
    }
    if stale:
        envelope["reason"] = stale_reason
    return envelope


def to_pin888_init(
    quotes: Iterable[PublishedQuote],
    *,
    stale: bool = False,
    stale_reason: str | None = None,
) -> dict[str, Any]:
    """Build the legacy `init` snapshot envelope (small-snapshot variant)."""
    events = [
        _as_pin888_data(_payload_with_published_outcomes(q), is_tombstone=q.is_tombstone)
        for q in quotes
        if not q.is_tombstone
    ]
    payload: dict[str, Any] = {
        "type": "init",
        "events": events,
        "count": len(events),
        "stale": bool(stale),
    }
    if stale:
        payload["reason"] = stale_reason
    return payload


def to_pin888_init_replay(
    *,
    replay_total: int,
    stale: bool = False,
    stale_reason: str | None = None,
) -> dict[str, Any]:
    """Build the light `init` header used by ``_send_snapshot_with_replay``.

    Matches ``core.broadcaster._send_snapshot_with_replay`` exactly.
    The legacy producer starts from the ``init`` payload built at
    ``core/broadcaster.py`` line ~412 (keys in order:
    ``type, events, count, stale, [reason]``) and *then* assigns
    ``snapshot_mode`` and ``replay_total`` to that dict. Python dict
    assignment to existing keys preserves position; new keys append at
    the end — so the real on-the-wire order is:

        ``type, events, count, stale, [reason], snapshot_mode, replay_total``

    Both ``json`` and ``orjson`` serialize in dict insertion order, so
    we replicate the exact same construction sequence here.
    """
    payload: dict[str, Any] = {
        "type": "init",
        "events": [],
        "count": 0,
        "stale": bool(stale),
    }
    if stale:
        payload["reason"] = stale_reason
    payload["snapshot_mode"] = "update_replay"
    payload["replay_total"] = int(replay_total)
    return payload


def to_pin888_tombstone_update(
    pid: Any,
    *,
    home_name: str = "",
    away_name: str = "",
    is_live: bool | None = None,
) -> dict[str, Any]:
    """Build the legacy tombstone `update` (matches `handlers/fo_handler.py`).

    Convenience constructor for callers that have only the minimal
    tombstone fields and no `PublishedQuote`. The runtime path (compat
    shim invoked from `IngestRouter` consumers) goes through
    `to_pin888_update`, which now branches on `quote.is_tombstone`.
    """
    data: dict[str, Any] = {
        "Pid": pid,
        "Removed": True,
        "Deleted": True,
        "homeName": home_name,
        "awayName": away_name,
        "isLive": is_live,
    }
    return {"type": "update", "source": PIN888_SOURCE_TAG, "data": data}


__all__ = [
    "PIN888_EVENT_SOURCE",
    "PIN888_SOURCE_TAG",
    "payload_has_identity",
    "to_pin888_init",
    "to_pin888_init_replay",
    "to_pin888_tombstone_update",
    "to_pin888_update",
]
