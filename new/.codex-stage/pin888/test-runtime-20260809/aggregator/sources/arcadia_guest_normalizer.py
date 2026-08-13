"""Arcadia Guest API → Pin888-shape normalizer (Story 27.9).

Arcadia's JSON structure differs from Pinnacle Partner API:

* **Matchups**: lightweight event metadata with `id`, `status`,
  `startTime`, `participants`, `periods[hasMoneyline/hasSpread/hasTotal]`.
  No prices here.
* **Markets**: per-outcome price rows keyed by
  ``(matchupId, key, period)`` where ``key`` encodes the market family
  (``s;1;m`` = period 1 moneyline, etc.). Each row carries a
  ``version`` int and a ``prices`` list
  ``[{"participantId": ..., "price": int_as_pips}]``.

This module joins the two streams into Pin888-shape payloads suitable
for feeding through the aggregator pipeline. Prices are converted from
Arcadia's integer pip representation (``1950`` → ``1.950`` decimal)
and written into ``Periods[...].Win1x2/MoneyLine`` / ``Handicap`` /
``Totals`` buckets.

The normalizer is **pure** — no I/O, no global state. Missing fields
degrade gracefully: a matchup without any markets yields an empty
``Periods`` list; a single malformed market row is skipped.
"""

from __future__ import annotations

from typing import Any


def _pips_to_decimal(pips: Any) -> float | None:
    """Convert Arcadia's price to decimal odds.

    **IMPORTANT**: Round 2 / parity spike (2026-04-24) proved that the
    Arcadia Guest API returns **American odds** by default, NOT decimal
    pips. Samples observed: ``118`` (positive → +1.18 decimal ×100),
    ``-152`` (negative → /152 × 100 + 100), etc. The guest endpoint
    does not honour ``?oddsFormat=Decimal``.

    Conversion:
    * American > 0:  decimal = 1 + american/100          (+118 → 2.18)
    * American < 0:  decimal = 1 + 100/|american|        (-152 → 1.658)
    * American == 0 or missing: rejected (return None)

    The conversion lines up with Partner API's Decimal format so the
    aggregator's downstream price-comparison paths stay consistent
    across L1 swaps (Partner ↔ Arcadia standby).

    For the rare case where Arcadia actually returns a large positive
    integer (> 10 000), treat it as pips (legacy pre-2026-04 shape):
    divide by 1000. Conservative heuristic to avoid silent regressions.
    """
    if not isinstance(pips, (int, float)) or isinstance(pips, bool):
        return None
    value = float(pips)
    if value == 0:
        return None
    # Legacy pips format (> 10000) — keep backwards compat.
    if value >= 10000:
        return round(value / 1000.0, 4)
    # American odds.
    if value >= 100:
        return round(1.0 + value / 100.0, 4)
    if value <= -100:
        return round(1.0 + 100.0 / abs(value), 4)
    # Values in (-100, 100) are malformed for either format → reject.
    return None


def _classify_market(key: str) -> tuple[int, str] | None:
    """Map an Arcadia market ``key`` to (period_number, market_type).

    Accepts the compact form Arcadia uses (``s;1;m`` = sport; period 1;
    moneyline). Returns ``None`` for unrecognised shapes so callers can
    skip them gracefully.
    """
    if not isinstance(key, str) or not key:
        return None
    parts = key.split(";")
    # Canonical shape: "s;<period>;<type>" where type ∈ {m, s, t}.
    if len(parts) < 3:
        return None
    try:
        period = int(parts[1])
    except ValueError:
        return None
    type_code = parts[2]
    market_type = {
        "m": "MoneyLine",
        "s": "Handicap",
        "t": "Totals",
    }.get(type_code)
    if market_type is None:
        return None
    return period, market_type


def _matchup_participant_side(participants: list[Any]) -> dict[int, str]:
    """Return a ``{participantId: side_label}`` map.

    Arcadia tags participants with ``"alignment": "home"|"away"`` on
    team markets or ``"order"`` on draw/3-way. The side label we emit
    matches the legacy Pin888 Win1x2 keys (``Win1`` / ``WinNone`` /
    ``Win2``) so downstream consumers don't have to special-case
    Arcadia payloads.
    """
    out: dict[int, str] = {}
    if not isinstance(participants, list):
        return out
    for p in participants:
        if not isinstance(p, dict):
            continue
        pid = p.get("id")
        if not isinstance(pid, int):
            continue
        alignment = (p.get("alignment") or "").lower()
        if alignment == "home":
            out[pid] = "Win1"
        elif alignment == "away":
            out[pid] = "Win2"
        elif alignment == "neutral" or alignment == "draw":
            out[pid] = "WinNone"
    return out


def _emit_market_into_periods(
    periods: dict[int, dict[str, Any]],
    market: dict[str, Any],
    side_map: dict[int, str],
) -> None:
    """Fold one Arcadia market row into the Periods dict keyed by period."""
    key = market.get("key")
    klass = _classify_market(key if isinstance(key, str) else "")
    if klass is None:
        return
    period, market_type = klass
    period_bucket = periods.setdefault(period, {"Number": period})

    prices = market.get("prices") or []
    if not isinstance(prices, list):
        return

    if market_type == "MoneyLine":
        # Flat dict: {Win1: {value: 1.92}, WinNone: {...}, Win2: {...}}.
        bucket: dict[str, Any] = period_bucket.setdefault("Win1x2", {})
        for row in prices:
            if not isinstance(row, dict):
                continue
            pid = row.get("participantId")
            price = _pips_to_decimal(row.get("price"))
            if price is None or pid not in side_map:
                continue
            bucket[side_map[pid]] = {"value": price}
        return

    if market_type in ("Handicap", "Totals"):
        # These come in as lists of entries with Hdp/Points + Home/Away.
        entry: dict[str, Any] = {}
        if market_type == "Handicap":
            # Arcadia records the line as `params.handicap` or
            # `attributes.handicap`; we probe both shapes.
            hdp = (
                (market.get("attributes") or {}).get("handicap")
                or (market.get("params") or {}).get("handicap")
            )
            if isinstance(hdp, (int, float)) and not isinstance(hdp, bool):
                entry["Hdp"] = float(hdp)
        else:  # Totals
            points = (
                (market.get("attributes") or {}).get("points")
                or (market.get("params") or {}).get("points")
            )
            if isinstance(points, (int, float)) and not isinstance(points, bool):
                entry["Points"] = float(points)
        for row in prices:
            if not isinstance(row, dict):
                continue
            pid = row.get("participantId")
            price = _pips_to_decimal(row.get("price"))
            if price is None:
                continue
            # side_map is keyed by int pid; tolerate non-int values by
            # falling back to str(pid) so unexpected shapes don't crash.
            side = (
                side_map.get(pid, str(pid))
                if isinstance(pid, int)
                else str(pid)
            )
            entry[side] = price
        bucket_list: list[Any] = period_bucket.setdefault(market_type, [])
        if isinstance(bucket_list, list):
            bucket_list.append(entry)


def normalize_matchup(
    matchup: dict[str, Any],
    markets_for_matchup: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Return a Pin888-shape game dict for one Arcadia matchup.

    Returns ``None`` when the matchup is malformed or has no id.
    """
    if not isinstance(matchup, dict):
        return None
    mid = matchup.get("id")
    if not isinstance(mid, int):
        return None
    side_map = _matchup_participant_side(matchup.get("participants") or [])
    periods: dict[int, dict[str, Any]] = {}
    for market in markets_for_matchup:
        if not isinstance(market, dict):
            continue
        _emit_market_into_periods(periods, market, side_map)

    # Extract basic metadata for Pin888 consumers.
    home = away = ""
    league = ""
    for p in matchup.get("participants") or []:
        if not isinstance(p, dict):
            continue
        name = p.get("name") or ""
        alignment = (p.get("alignment") or "").lower()
        if alignment == "home":
            home = str(name)
        elif alignment == "away":
            away = str(name)
    league_obj = matchup.get("league")
    if isinstance(league_obj, dict):
        league = str(league_obj.get("name") or "")
    is_live = matchup.get("status") == "started"

    return {
        "Pid": mid,
        "MatchId": str(mid),
        "LeagueName": league,
        "homeName": home,
        "awayName": away,
        "SportName": "",  # Arcadia doesn't carry the sport name per matchup
        "isLive": bool(is_live),
        "Periods": [periods[p] for p in sorted(periods)],
    }


def normalize_snapshot(
    *,
    matchups: list[dict[str, Any]],
    markets: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Join matchups + markets into a list of Pin888-shape games.

    Groups markets by ``matchupId`` first so repeated lookups during
    the join are O(1). Malformed rows are skipped silently; never
    raises.
    """
    markets_by_mid: dict[int, list[dict[str, Any]]] = {}
    for market in markets:
        if not isinstance(market, dict):
            continue
        mid = market.get("matchupId")
        if isinstance(mid, int):
            markets_by_mid.setdefault(mid, []).append(market)
    games: list[dict[str, Any]] = []
    for matchup in matchups:
        if not isinstance(matchup, dict):
            continue
        mid = matchup.get("id")
        if not isinstance(mid, int):
            continue
        game = normalize_matchup(matchup, markets_by_mid.get(mid, []))
        if game is not None:
            games.append(game)
    return games


__all__ = [
    "_classify_market",
    "_pips_to_decimal",
    "normalize_matchup",
    "normalize_snapshot",
]
