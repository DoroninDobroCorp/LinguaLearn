#!/usr/bin/env python3
"""Audit a Big Value analyzer /match-data response from stdin."""

from __future__ import annotations

import collections
import datetime as dt
import json
import math
import statistics
import sys


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    pos = (len(ordered) - 1) * fraction
    lo = math.floor(pos)
    hi = math.ceil(pos)
    if lo == hi:
        return ordered[lo]
    return ordered[lo] * (hi - pos) + ordered[hi] * (pos - lo)


def parse_time(value: object) -> dt.datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def walk_odds(node: object, path: tuple[str, ...] = ()):
    if isinstance(node, dict):
        value = node.get("value")
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            yield float(value), node.get("raw"), path
        for key, child in node.items():
            yield from walk_odds(child, path + (str(key),))
    elif isinstance(node, list):
        for index, child in enumerate(node):
            yield from walk_odds(child, path + (str(index),))


payload = json.load(sys.stdin)
matches = payload.get("data", {})
if not isinstance(matches, dict):
    raise SystemExit("expected data object")

now = dt.datetime.now(dt.timezone.utc)
sources: collections.Counter[str] = collections.Counter()
sports: collections.Counter[str] = collections.Counter()
ages: list[float] = []
future_created: list[dict] = []
zero_match_dates = 0
odds: list[float] = []
invalid: list[dict] = []
high: list[dict] = []

for key, match in matches.items():
    if not isinstance(match, dict):
        continue
    source = str(match.get("Source", ""))
    sport = str(match.get("SportName", ""))
    sources[source] += 1
    sports[sport] += 1
    created = parse_time(match.get("CreatedAt"))
    if created:
        age = (now - created).total_seconds()
        ages.append(age)
        if age < -1:
            future_created.append({"key": key, "age": age, "created": match.get("CreatedAt")})
    match_date = parse_time(match.get("matchDate"))
    if match_date is None or match_date.year <= 1:
        zero_match_dates += 1

    for value, raw, path in walk_odds(match.get("Periods", []), ("Periods",)):
        if raw is None:
            continue
        odds.append(value)
        item = {
            "value": value,
            "source": source,
            "sport": sport,
            "match": f"{match.get('homeName')} — {match.get('awayName')}",
            "score": f"{match.get('HomeScore')}:{match.get('AwayScore')}",
            "path": "/".join(path),
            "raw": raw,
            "createdAt": match.get("CreatedAt"),
        }
        if not math.isfinite(value) or value <= 1.0:
            invalid.append(item)
        if value >= 20:
            high.append(item)

summary = {
    "reported_len": payload.get("len"),
    "actual_matches": len(matches),
    "sources": sources,
    "sports": sports,
    "created_age_seconds": {
        "min": min(ages) if ages else None,
        "p50": percentile(ages, 0.50),
        "p90": percentile(ages, 0.90),
        "p99": percentile(ages, 0.99),
        "max": max(ages) if ages else None,
    },
    "future_created_count": len(future_created),
    "zero_match_date_count": zero_match_dates,
    "odds_count": len(odds),
    "odds": {
        "min": min(odds) if odds else None,
        "p50": percentile(odds, 0.50),
        "p90": percentile(odds, 0.90),
        "p99": percentile(odds, 0.99),
        "max": max(odds) if odds else None,
        "gte20": sum(value >= 20 for value in odds),
        "gte50": sum(value >= 50 for value in odds),
        "gte100": sum(value >= 100 for value in odds),
    },
    "invalid_active_odds_count": len(invalid),
    "high_odds_top": sorted(high, key=lambda item: item["value"], reverse=True)[:20],
    "invalid_active_odds": invalid[:20],
    "future_created": future_created[:20],
}
print(json.dumps(summary, ensure_ascii=False, indent=2, default=lambda value: dict(value)))
