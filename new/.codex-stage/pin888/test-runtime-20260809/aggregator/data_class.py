"""Data-class taxonomy for the multi-source aggregator (TZ §4-§5).

Every observation flowing through the aggregator is classified into one
of four ``DataClass`` buckets. The decision engine (v2) consults this
classification to pick the correct per-class authority policy as
described in TZ §5.

Classes
-------

- ``BASE_EVENT`` — bare event-existence signals (fixture creation,
  competitors, league, scheduled start). The only data-class for which
  the matching layer can fold quotes from different sources together.
- ``BASE_MARKET`` — main markets (1x2, Handicap, Totals, …). Highest
  read volume; per TZ §4 main authority is OFFICIAL_API in normal mode
  and BROWSER_WS in API-degraded mode.
- ``MORE_BETS_SPECIAL`` — specials / more-bets / additional markets.
  Coverage by API is patchy, hence the policy in TZ §3.3 falls back to
  browser pool when API has no coverage.
- ``LIFECYCLE`` — open / suspend / close / stale / tombstone signals.
  Tombstones from any pinnacle-native source preempt live quotes per
  TZ §6.

The classifier is a *heuristic* — in Phase 3 the upstream sources do
not yet hand us a structured market-class field. We map on a small set
of well-known keys (``market_class``, ``market_type``, ``Type``) and
fall back to ``BASE_EVENT`` for unknown shapes. The classifier MUST
NOT crash on unexpected input — it is on the hot path.
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from aggregator.types import SourceEvent


class DataClass(str, Enum):
    """Coarse-grained data taxonomy used by the decision engine."""

    BASE_EVENT = "base_event"
    BASE_MARKET = "base_market"
    MORE_BETS_SPECIAL = "more_bets_special"
    LIFECYCLE = "lifecycle"


# Market-type tokens that look like base 1x2 / Handicap / Totals.
_BASE_MARKET_TOKENS = frozenset(
    {
        "moneyline",
        "money_line",
        "1x2",
        "h2h",
        "spread",
        "handicap",
        "asian_handicap",
        "total",
        "totals",
        "over_under",
        "ou",
        "draw_no_bet",
        "double_chance",
    }
)

# Tokens that scream "specials / more-bets".
_SPECIAL_TOKENS = frozenset(
    {
        "special",
        "specials",
        "more_bets",
        "more_bet",
        "morebets",
        "additional",
        "props",
        "prop",
        "outright",
        "futures",
        "anytime",
        "first_to",
        "team_total",
        "exact_score",
        "correct_score",
        "btts",
    }
)


def _norm_token(value: Any) -> str:
    if value is None:
        return ""
    try:
        return str(value).strip().lower().replace("-", "_").replace(" ", "_")
    except Exception:  # noqa: BLE001 — never crash on classification
        return ""


def classify_payload(payload: dict[str, Any] | None) -> DataClass:
    """Classify a single source-event payload into a ``DataClass``.

    The payload shape is source-native. We look at a small whitelist of
    keys; anything we cannot recognise falls back to ``BASE_EVENT`` so
    the event still flows through the pipeline (TZ §6.2 — "do not drop
    silently").
    """
    if not isinstance(payload, dict):
        return DataClass.BASE_EVENT

    # Lifecycle / tombstone signals.
    for key in ("Removed", "removed", "tombstone", "is_tombstone", "deleted"):
        if payload.get(key):
            return DataClass.LIFECYCLE
    status = _norm_token(payload.get("status") or payload.get("Status"))
    if status in {"suspended", "closed", "settled", "cancelled"}:
        return DataClass.LIFECYCLE

    # Explicit market_class field, if any source has been good enough
    # to give us one.
    explicit = _norm_token(
        payload.get("market_class")
        or payload.get("data_class")
        or payload.get("MarketClass")
    )
    if explicit:
        if explicit in {"base", "base_market", "main"}:
            return DataClass.BASE_MARKET
        if explicit in {"special", "specials", "more_bets", "morebets", "additional"}:
            return DataClass.MORE_BETS_SPECIAL
        if explicit in {"lifecycle", "tombstone"}:
            return DataClass.LIFECYCLE
        if explicit in {"event", "fixture", "base_event"}:
            return DataClass.BASE_EVENT

    market_type = _norm_token(
        payload.get("market_type")
        or payload.get("Type")
        or payload.get("type")
    )
    if market_type in _SPECIAL_TOKENS:
        return DataClass.MORE_BETS_SPECIAL
    if market_type in _BASE_MARKET_TOKENS:
        return DataClass.BASE_MARKET

    # If the payload carries any odds-bearing field, treat it as a
    # base market quote; else as bare event existence.
    for key in ("price", "odds", "Price", "moneyline", "spread", "total", "Periods"):
        if key in payload:
            return DataClass.BASE_MARKET

    return DataClass.BASE_EVENT


def classify(event: SourceEvent) -> DataClass:
    """Convenience wrapper — tombstone events always classify LIFECYCLE."""
    if event.is_tombstone:
        return DataClass.LIFECYCLE
    return classify_payload(event.payload)


__all__ = ["DataClass", "classify", "classify_payload"]
