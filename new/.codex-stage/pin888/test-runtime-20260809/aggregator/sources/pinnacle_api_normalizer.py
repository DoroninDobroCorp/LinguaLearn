"""Pinnacle Official API → runtime envelope normalizer.

Pure functions only. Given a raw response dict from the Pinnacle API
(``/v3/fixtures``, ``/v3/odds``, optional specials), produce a list of
event-dicts in the **same shape that today flows through the pin888
broadcaster** (a.k.a. the legacy ``:9012`` ``update.data`` payload).

We deliberately reuse the proven ``build_api_games`` pipeline that
``tools/ps3838_api_parity.py`` has been exercising against the live API
for parity audits. Lifting it into a library keeps a single source of
truth for the API → runtime mapping; the parity tool keeps working
because its own ``build_api_games`` symbol is unchanged.

Stable canonical ``event_id`` for each game follows the same convention
the pin888 source uses (``<source-prefix>:<Pid>``), but with the
``pinnacle_api`` prefix so the aggregator's candidate buckets keep one
quote-per-source-per-event:

    pinnacle_api:1234567

Tombstones are first-class: when a previously seen ``Pid`` disappears
from a fresh poll snapshot, the adapter calls :func:`build_tombstone`
to emit a payload with ``Removed=True`` (matching the pin888 contract
already understood by ``IngestRouter``'s tombstone path).

No I/O, no env, no network — every function is import-time safe.
"""

from __future__ import annotations

from typing import Any, Iterable

# Lift the parity tool's normalization pipeline. ``tools/`` lives at the
# repo root and the parity script already keeps the heavy lifting in
# pure functions, so no shim is needed.
from tools.ps3838_api_parity import (
    SPECIALS_SUPPORTED_SPORT_IDS,
    SPORT_ID_TO_RUNTIME_NAME,
    build_api_games,
)

EVENT_ID_PREFIX = "pinnacle_api"


def event_id_for_pid(pid: int | str) -> str:
    """Canonical event_id for an API-side ``Pid``.

    Mirrors the pin888 source convention so cross-source candidates
    bucket correctly inside :class:`aggregator.store.ProvenanceStore`.
    """
    return f"{EVENT_ID_PREFIX}:{int(pid)}"


def normalize_sport_snapshot(
    *,
    sport_id: int,
    fixtures: dict[str, Any],
    odds: dict[str, Any],
    special_fixtures: dict[str, Any] | None = None,
    special_odds: dict[str, Any] | None = None,
    fixture_meta_override: dict[int, dict[str, Any]] | None = None,
    skip_event_ids: set[int] | None = None,
) -> list[dict[str, Any]]:
    """Normalize one sport's raw API response into runtime event-dicts.

    Returns a list of game-dicts, one per event_id, ready to be wrapped
    in a :class:`aggregator.types.SourceEvent`. Each dict carries:

    - ``Pid`` (int) — the canonical Pinnacle event id;
    - ``MatchId``, ``LeagueName``, ``homeName``, ``awayName``,
      ``SportName``, ``isLive``;
    - ``Periods`` — list of period dicts containing ``Win1x2``,
      ``Handicap``, ``Totals``, ``FirstTeamTotals``, ``SecondTeamTotals``
      and (when applicable) merged specials.

    Empty / missing inputs are handled gracefully — pass ``{}`` if a
    poll returned 204 (delta with no changes).
    """
    fixtures = fixtures or {}
    odds = odds or {}
    games_by_pid, _counts, _names = build_api_games(
        sport_id=sport_id,
        fixtures=fixtures,
        odds=odds,
        special_fixtures=special_fixtures,
        special_odds=special_odds,
        fixture_meta_override=fixture_meta_override,
        skip_event_ids=skip_event_ids,
    )
    return list(games_by_pid.values())


def build_tombstone(pid: int, *, sport_id: int | None = None) -> dict[str, Any]:
    """Construct a tombstone payload for an event that disappeared.

    Shape matches what the pin888 source detects via ``Removed`` /
    ``Deleted``: callers can hand this dict to a `SourceEvent` with
    ``is_tombstone=True`` and the ingest router will publish it as a
    tombstone, clearing all candidates for this ``event_id`` (see
    ``aggregator.ingest.IngestRouter.ingest`` and the cross-source
    semantics added in commit 8c5a889).
    """
    payload: dict[str, Any] = {
        "Pid": int(pid),
        "MatchId": str(int(pid)),
        "Removed": True,
    }
    if sport_id is not None:
        payload["SportName"] = SPORT_ID_TO_RUNTIME_NAME.get(
            int(sport_id), f"Sport{int(sport_id)}"
        )
    return payload


def extract_pids(games: Iterable[dict[str, Any]]) -> set[int]:
    """Return the set of valid integer Pids in a normalized batch."""
    out: set[int] = set()
    for game in games:
        pid = game.get("Pid") if isinstance(game, dict) else None
        if pid is None:
            continue
        try:
            out.add(int(pid))
        except (TypeError, ValueError):
            continue
    return out


__all__ = [
    "EVENT_ID_PREFIX",
    "SPECIALS_SUPPORTED_SPORT_IDS",
    "build_tombstone",
    "event_id_for_pid",
    "extract_pids",
    "normalize_sport_snapshot",
]
