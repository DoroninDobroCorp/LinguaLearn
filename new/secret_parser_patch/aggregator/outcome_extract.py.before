"""Outcome extraction helpers (Phase 5).

The aggregator needs an outcome-granular view: per
``(event_id, market_id, outcome_id)`` we want a price + provenance.
Source-native payloads vary by source, so this helper applies a small
set of well-known shapes:

1. Explicit normalized shape: ``payload["outcomes"] = [{"market_id": ..., "outcome_id": ..., "price": ...}, ...]``.
2. Pin888 ``Periods`` shape (very common): ``payload["Periods"] = [{"Number": 0, "MoneyLine": {"Home": 1.92, ...}, ...}]``.
3. Single-outcome shape: payload carries ``market_id``, ``outcome_id``, ``price``.

Anything not recognised yields an empty list — the caller falls back
to the event-granular path. Never raises.
"""

from __future__ import annotations

from typing import Any


def _coerce_price(value: Any) -> float | None:
    if isinstance(value, dict):
        for key in ("value", "price", "odds"):
            if key in value:
                return _coerce_price(value.get(key))
        return None
    if value is None or isinstance(value, bool):
        return None
    try:
        price = float(value)
    except (TypeError, ValueError):
        return None
    if price <= 0.0:
        return None
    return price


def extract_outcomes(payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Return list of ``{market_id, outcome_id, price}`` dicts.

    Pure / total — never raises on weird input.
    """
    if not isinstance(payload, dict):
        return []

    explicit = payload.get("outcomes")
    if isinstance(explicit, list):
        out: list[dict[str, Any]] = []
        for item in explicit:
            if not isinstance(item, dict):
                continue
            mid = item.get("market_id") or item.get("market") or ""
            oid = item.get("outcome_id") or item.get("outcome") or ""
            if not mid or not oid:
                continue
            out.append({
                "market_id": str(mid),
                "outcome_id": str(oid),
                "price": _coerce_price(item.get("price") or item.get("odds")),
            })
        if out:
            return out

    # Pin888-ish Periods shape.
    periods = payload.get("Periods")
    if isinstance(periods, list):
        out2: list[dict[str, Any]] = []
        for period in periods:
            if not isinstance(period, dict):
                continue
            pnum = period.get("Number", 0)
            for mtype, sides in period.items():
                if (
                    mtype in ("Number", "Status", "Cutoff")
                    or str(mtype).startswith("_")
                ):
                    continue
                if not isinstance(sides, dict):
                    continue
                # Direct side map: Win1x2={"Win1": {"value": 1.9}, ...}
                direct_added = False
                for side, price in sides.items():
                    if str(side).startswith("_") or side in ("LineId", "LineEventId"):
                        continue
                    coerced = _coerce_price(price)
                    if coerced is None:
                        continue
                    out2.append({
                        "market_id": f"p{pnum}:{mtype}",
                        "outcome_id": str(side),
                        "price": coerced,
                    })
                    direct_added = True
                if direct_added:
                    continue
                # Line map: Totals={"2.5": {"WinMore": {"value": ...}, ...}}
                for line, line_sides in sides.items():
                    if str(line).startswith("_") or not isinstance(line_sides, dict):
                        continue
                    for side, price in line_sides.items():
                        if str(side).startswith("_") or side in ("LineId", "LineEventId"):
                            continue
                        coerced = _coerce_price(price)
                        if coerced is None:
                            continue
                        out2.append({
                            "market_id": f"p{pnum}:{mtype}:{line}",
                            "outcome_id": str(side),
                            "price": coerced,
                        })
        if out2:
            return out2

    # Single-outcome flat shape.
    mid = payload.get("market_id")
    oid = payload.get("outcome_id")
    if mid and oid:
        return [{
            "market_id": str(mid),
            "outcome_id": str(oid),
            "price": _coerce_price(payload.get("price") or payload.get("odds")),
        }]

    return []


__all__ = ["extract_outcomes"]
