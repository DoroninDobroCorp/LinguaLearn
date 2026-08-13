"""Helpers for combining Pinnacle API payload slices.

These helpers are intentionally import-safe and side-effect free so both
production adapter code and offline tooling can share the same payload
semantics.
"""

from __future__ import annotations

from typing import Any


def merge_odds_payloads(*payloads: dict[str, Any] | None) -> dict[str, Any]:
    """Merge prematch/live odds payloads into one normalize-ready snapshot.

    Pinnacle exposes prematch and live odds as separate slices via
    ``isLive=0`` / ``isLive=1``. The normalizer expects a single odds
    payload, so we collapse all leagues/events into one synthetic league
    keyed by event id. Later payloads win, which lets the explicit live
    pull override any overlap from the prematch/default slice.
    """
    merged_events: dict[int, dict[str, Any]] = {}
    last_values: list[int] = []
    for payload in payloads:
        if not isinstance(payload, dict):
            continue
        raw_last = payload.get("last")
        try:
            if raw_last is not None:
                last_values.append(int(raw_last))
        except (TypeError, ValueError):
            pass
        for league in payload.get("leagues") or []:
            if not isinstance(league, dict):
                continue
            for event in league.get("events") or []:
                if not isinstance(event, dict):
                    continue
                try:
                    event_id = int(event.get("id") or 0)
                except (TypeError, ValueError):
                    continue
                if event_id <= 0:
                    continue
                merged_events[event_id] = event

    merged: dict[str, Any] = {
        "leagues": [{"id": 0, "name": "", "events": list(merged_events.values())}]
        if merged_events
        else []
    }
    if last_values:
        merged["last"] = max(last_values)
    return merged


__all__ = ["merge_odds_payloads"]