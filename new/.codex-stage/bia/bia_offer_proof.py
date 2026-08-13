"""Thread-safe structural offer proofs derived from raw BIA market groups.

The registry deliberately stores no prices.  It only remembers that a raw
BIA update contained a precise market group, Asian line code and direction.
That structural evidence can then be used to choose one exact BIA ``bet_type``
for a team-total selection.

Updates use patch semantics matching cpricefeed:

* an omitted group/line/direction is retained;
* ``market is None`` removes the whole group;
* ``[code, None]`` removes one Asian line;
* ``["over", None]`` / ``["under", None]`` removes one direction.

Event identity is keyed by ``(sport_code, event_key)`` and binds exactly one
competition id.  A second competition id poisons the entry until it expires or
is removed explicitly.  Proof lookup also fails closed for stale evidence,
malformed supported groups and multiple matching raw groups.
"""

from __future__ import annotations

import math
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from threading import RLock
from typing import Any


# This registry stores structural market identity only, never a bookmaker
# price. The current Pinnacle price is verified independently after this
# mapping. A five-minute expiry caused quiet but still-open prematch boards to
# disappear between BIA deltas, so retain the proven grammar for thirty
# minutes; explicit BIA tombstones still remove closed groups immediately.
DEFAULT_OFFER_PROOF_TTL_SEC = 30 * 60.0


class BiaOfferProofError(LookupError):
    """A stable, machine-readable failure to prove one exact BIA outcome."""

    def __init__(
        self,
        code: str,
        message: str | None = None,
        *,
        details: Mapping[str, Any] | None = None,
    ) -> None:
        self.code = str(code)
        self.details = dict(details or {})
        super().__init__(message or self.code)

    def as_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "status": "UNAVAILABLE",
            "error_code": self.code,
        }
        if self.details:
            payload["details"] = dict(self.details)
        return payload


@dataclass(frozen=True, slots=True)
class BiaOfferProof:
    """One unambiguous, fresh structural mapping to an exact BIA bet type."""

    competition_id: str
    sport_code: str
    event_key: str
    raw_group: str
    asian_code: int | None
    direction: str
    bet_type: str
    observed_at: float
    expires_at: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "status": "OK",
            "competition_id": self.competition_id,
            "sport_code": self.sport_code,
            "event_key": self.event_key,
            "raw_group": self.raw_group,
            "asian_code": self.asian_code,
            "direction": self.direction,
            "outcome": self.direction,
            "bet_type": self.bet_type,
            "observed_at": self.observed_at,
            "expires_at": self.expires_at,
        }


@dataclass(frozen=True, slots=True)
class BiaOfferProofUpdate:
    """Small update receipt suitable for counters and diagnostics."""

    status: str
    groups_seen: int = 0
    groups_updated: int = 0
    groups_removed: int = 0
    groups_invalid: int = 0
    unsupported_groups: int = 0
    out_of_order: bool = False

    def as_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "groups_seen": self.groups_seen,
            "groups_updated": self.groups_updated,
            "groups_removed": self.groups_removed,
            "groups_invalid": self.groups_invalid,
            "unsupported_groups": self.unsupported_groups,
            "out_of_order": self.out_of_order,
        }


@dataclass(slots=True)
class _LineState:
    # Values are observation timestamps, never bookmaker prices.
    outcomes: dict[str, float] = field(default_factory=dict)


@dataclass(slots=True)
class _GroupState:
    lines: dict[int, _LineState] = field(default_factory=dict)
    updated_at: float = 0.0


@dataclass(slots=True)
class _EventState:
    competition_ids: set[str]
    groups: dict[str, _GroupState] = field(default_factory=dict)
    invalid_groups: set[str] = field(default_factory=set)
    last_seen: float = 0.0
    collision: bool = False


@dataclass(frozen=True, slots=True)
class _RawGroupSpec:
    kind: str
    side: str
    scope: str = ""
    game: str = ""
    tennis_unit: str = ""


@dataclass(frozen=True, slots=True)
class _StandardSelection:
    bet_type: int
    team_select: int
    outcome: str
    asian_code: int | None
    swapped: bool
    map_number: int
    period: int
    game_number: int
    esports_unit: str
    tennis_unit: str
    period_type: str
    inning_number: int
    half_number: int


_TEAM_TOTAL_SELECTORS: dict[tuple[int, int], str] = {
    (4, 5): "over",
    (4, 0): "under",
    (5, 7): "over",
    (5, 1): "under",
}

_OVER_LABELS = frozenset({"over", "o", "ahover", "tahover"})
_UNDER_LABELS = frozenset({"under", "u", "ahunder", "tahunder"})


def asian_line_to_code(value: Any) -> int:
    """Convert a displayed Asian line to BIA's exact quarter-unit integer."""

    if isinstance(value, bool) or value is None:
        raise BiaOfferProofError("BIA_ASIAN_LINE_INVALID")
    try:
        line = Decimal(str(value).strip())
    except (InvalidOperation, ValueError, TypeError):
        raise BiaOfferProofError("BIA_ASIAN_LINE_INVALID") from None
    if not line.is_finite():
        raise BiaOfferProofError("BIA_ASIAN_LINE_INVALID")
    scaled = line * Decimal(4)
    integral = scaled.to_integral_value()
    if scaled != integral:
        raise BiaOfferProofError(
            "BIA_ASIAN_LINE_NOT_QUARTER",
            details={"line": str(value)},
        )
    return int(integral)


def _raw_asian_code(value: Any) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        code = Decimal(str(value).strip())
    except (InvalidOperation, ValueError, TypeError):
        return None
    if not code.is_finite() or code != code.to_integral_value():
        return None
    return int(code)


def _exact_int(value: Any, *, default: int | None = None) -> int:
    """Parse an integer without truncating fractional/bool structural fields."""

    if value is None or value == "":
        if default is not None:
            return default
        raise BiaOfferProofError("BIA_STANDARD_SELECTION_INVALID")
    if isinstance(value, bool):
        raise BiaOfferProofError("BIA_STANDARD_SELECTION_INVALID")
    try:
        parsed = Decimal(str(value).strip())
    except (InvalidOperation, ValueError, TypeError):
        raise BiaOfferProofError("BIA_STANDARD_SELECTION_INVALID") from None
    if not parsed.is_finite() or parsed != parsed.to_integral_value():
        raise BiaOfferProofError("BIA_STANDARD_SELECTION_INVALID")
    return int(parsed)


def _exact_bool(value: Any, *, default: bool = False) -> bool:
    if value is None:
        return default
    if not isinstance(value, bool):
        raise BiaOfferProofError("BIA_OFFER_SWAP_INVALID")
    return value


def _normalise_identity_part(value: Any) -> str:
    return str(value or "").strip()


def _normalise_sport(value: Any) -> str:
    return _normalise_identity_part(value).lower()


def _normalise_outcome(value: Any) -> str | None:
    label = str(value or "").strip().lower()
    if label in _OVER_LABELS:
        return "over"
    if label in _UNDER_LABELS:
        return "under"
    if label in {"h", "home"}:
        return "h"
    if label in {"a", "away"}:
        return "a"
    if label in {"d", "draw", "x"}:
        return "d"
    if label in {"p1", "player1", "player_1"}:
        return "p1"
    if label in {"p2", "player2", "player_2"}:
        return "p2"
    return None


def _parse_raw_group(raw_group: Any) -> _RawGroupSpec | None:
    key = str(raw_group or "").strip().lower()
    parts = [part.strip() for part in key.split(",")]

    simple_groups = {
        "wdw": "simple_wdw",
        "ml": "simple_ml",
        "ah": "simple_ah",
        "ahou": "simple_total",
        "qualify": "simple_qualify",
    }
    if len(parts) == 1 and parts[0] in simple_groups:
        return _RawGroupSpec(simple_groups[parts[0]], "")

    if len(parts) == 2 and parts[0] == "tahou" and parts[1] in {"h", "a"}:
        return _RawGroupSpec("simple_team_total", parts[1])

    scoped_groups = {
        "time_wdw": "scoped_wdw",
        "time_ml": "scoped_ml",
        "time_ah": "scoped_ah",
        "time_ahou": "scoped_total",
    }
    if (
        len(parts) == 3
        and parts[0] in scoped_groups
        and parts[1] in {"tmap", "tp", "thalf", "tinnings"}
        and parts[2]
    ):
        if parts[1] in {"tmap", "thalf", "tinnings"}:
            try:
                scope_number = int(parts[2])
            except (TypeError, ValueError):
                return None
            max_scope = 5 if parts[1] == "tmap" else (2 if parts[1] == "thalf" else 20)
            if scope_number <= 0 or scope_number > max_scope or str(scope_number) != parts[2]:
                return None
        return _RawGroupSpec(
            f"{scoped_groups[parts[0]]}_{parts[1]}",
            "",
            parts[2],
        )

    # Current cpricefeed uses ``time_win,<scope>,<value>,ml`` for two-way
    # esports moneylines.  Keep the older ``time_ml,<scope>,<value>`` shape
    # above as a compatibility alias, but preserve the observed raw key in the
    # proof so neither shape is inferred from the other.
    if (
        len(parts) == 4
        and parts[0] == "time_win"
        and parts[1] in {"tmap", "tp", "thalf", "tinnings"}
        and parts[2]
        and parts[3] in {"ml", "wdw"}
    ):
        if parts[1] in {"tmap", "thalf", "tinnings"}:
            try:
                scope_number = int(parts[2])
            except (TypeError, ValueError):
                return None
            max_scope = 5 if parts[1] == "tmap" else (2 if parts[1] == "thalf" else 20)
            if scope_number <= 0 or scope_number > max_scope or str(scope_number) != parts[2]:
                return None
        return _RawGroupSpec(f"scoped_{parts[3]}_{parts[1]}", "", parts[2])

    if (
        len(parts) == 5
        and parts[0] in {"time_ah", "time_ahou"}
        and parts[1] == "tmap"
        and parts[3:] == ["sub", "kills"]
    ):
        try:
            map_number = int(parts[2])
        except (TypeError, ValueError):
            return None
        if map_number <= 0 or map_number > 5 or str(map_number) != parts[2]:
            return None
        family = "ah" if parts[0] == "time_ah" else "total"
        return _RawGroupSpec(f"scoped_{family}_tmap_kills", "", parts[2])

    if (
        len(parts) == 6
        and parts[0] == "time_win"
        and parts[1] == "tmap"
        and parts[3:] == ["sub", "kills", "ml"]
    ):
        try:
            map_number = int(parts[2])
        except (TypeError, ValueError):
            return None
        if map_number <= 0 or map_number > 5 or str(map_number) != parts[2]:
            return None
        return _RawGroupSpec("scoped_ml_tmap_kills", "", parts[2])

    if (
        len(parts) == 6
        and parts[0] == "time_tahou"
        and parts[1] == "tmap"
        and parts[3:5] == ["sub", "kills"]
        and parts[5] in {"h", "a"}
    ):
        try:
            map_number = int(parts[2])
        except (TypeError, ValueError):
            return None
        if map_number <= 0 or map_number > 5 or str(map_number) != parts[2]:
            return None
        return _RawGroupSpec("scoped_team_total_tmap_kills", parts[5], parts[2])

    if (
        len(parts) == 4
        and parts[0] == "time_tahou"
        and parts[1] in {"tmap", "thalf", "tinnings"}
        and parts[3] in {"h", "a"}
    ):
        try:
            scope_number = int(parts[2])
        except (TypeError, ValueError):
            return None
        max_scope = 5 if parts[1] == "tmap" else (2 if parts[1] == "thalf" else 20)
        if scope_number <= 0 or scope_number > max_scope or str(scope_number) != parts[2]:
            return None
        return _RawGroupSpec(f"scoped_team_total_{parts[1]}", parts[3], str(scope_number))

    if (
        len(parts) == 4
        and parts[0] == "time_tahou"
        and parts[1] == "tp"
        and parts[2]
        and parts[3] in {"h", "a"}
    ):
        return _RawGroupSpec("scoped_team_total_tp", parts[3], parts[2])

    if (
        len(parts) == 2
        and parts[0] == "tennis_match"
        and parts[1]
    ):
        set_no = parts[1]
        if set_no != "all":
            try:
                parsed_set = int(set_no)
            except (TypeError, ValueError):
                return None
            if parsed_set <= 0 or parsed_set > 5 or str(parsed_set) != set_no:
                return None
        return _RawGroupSpec("tennis_match", "", set_no)

    tennis_line_groups = {
        # Legacy/synthetic names retained for compatibility.
        "tennis_games_ah": ("tennis_ah", frozenset({"game"})),
        "tennis_games_ahou": ("tennis_total", frozenset({"game"})),
        # Names observed on the current cpricefeed.
        "tennis_ah": ("tennis_ah", frozenset({"game", "set"})),
        "tennis_ahou": ("tennis_total", frozenset({"game", "set"})),
    }
    if (
        len(parts) == 3
        and parts[0] in tennis_line_groups
        and parts[1]
        and parts[2] in tennis_line_groups[parts[0]][1]
    ):
        set_no = parts[1]
        if set_no != "all":
            try:
                parsed_set = int(set_no)
            except (TypeError, ValueError):
                return None
            if parsed_set <= 0 or parsed_set > 5 or str(parsed_set) != set_no:
                return None
        return _RawGroupSpec(
            tennis_line_groups[parts[0]][0],
            "",
            set_no,
            tennis_unit=parts[2],
        )

    if (
        len(parts) == 4
        and parts[0] == "tennis_games_tahou"
        and parts[1]
        and parts[2] == "game"
        and parts[3] in {"p1", "p2"}
    ):
        set_no = parts[1]
        if set_no != "all":
            try:
                parsed_set = int(set_no)
            except (TypeError, ValueError):
                return None
            if parsed_set <= 0 or parsed_set > 5 or str(parsed_set) != set_no:
                return None
        return _RawGroupSpec(
            "tennis_team_total",
            parts[3],
            set_no,
            tennis_unit=parts[2],
        )

    # Exact-game winner shapes observed across the old and current frontends.
    if len(parts) == 3 and parts[0] in {"tennis_game", "tennis_game_win"}:
        set_no, game_no = parts[1], parts[2]
    elif (
        len(parts) == 4
        and parts[0] == "tennis_games_ml"
        and parts[2] == "game"
    ):
        set_no, game_no = parts[1], parts[3]
    else:
        return None
    try:
        parsed_set = int(set_no)
        parsed_game = int(game_no)
    except (TypeError, ValueError):
        return None
    if (
        parsed_set <= 0
        or parsed_set > 5
        or parsed_game <= 0
        or str(parsed_set) != set_no
        or str(parsed_game) != game_no
    ):
        return None
    return _RawGroupSpec("tennis_game", "", set_no, game_no)


_LINE_GROUP_KINDS = frozenset(
    {
        "simple_ah",
        "simple_total",
        "simple_team_total",
        "scoped_ah_tmap",
        "scoped_ah_tp",
        "scoped_total_tmap",
        "scoped_total_tp",
        "scoped_team_total_tmap",
        "scoped_team_total_tp",
        "scoped_ah_thalf",
        "scoped_total_thalf",
        "scoped_team_total_thalf",
        "scoped_ah_tinnings",
        "scoped_total_tinnings",
        "scoped_team_total_tinnings",
        "scoped_ah_tmap_kills",
        "scoped_total_tmap_kills",
        "scoped_team_total_tmap_kills",
        "tennis_ah",
        "tennis_total",
        "tennis_team_total",
    }
)


def _is_labelled_entry(value: Any) -> bool:
    return (
        isinstance(value, (list, tuple))
        and len(value) == 2
        and not isinstance(value[0], (list, tuple, dict, set))
        and (value[1] is None or isinstance(value[1], (list, tuple)))
    )


def _is_positional_decimal_wrapper(value: Any) -> bool:
    """Recognise the distinct ``[None, [[decimal, p1, p2], ...]]`` shape."""

    return (
        isinstance(value, (list, tuple))
        and len(value) == 2
        and value[0] is None
        and isinstance(value[1], (list, tuple))
        and bool(value[1])
        and all(
            isinstance(item, (list, tuple))
            and len(item) == 3
            and not isinstance(item[0], (list, tuple, dict, set))
            for item in value[1]
        )
    )


def _positional_outcome_names(spec: _RawGroupSpec) -> tuple[str, str] | None:
    if spec.kind in {
        "simple_total",
        "simple_team_total",
        "scoped_total_tmap",
        "scoped_total_tp",
        "scoped_team_total_tmap",
        "scoped_team_total_tp",
        "scoped_total_thalf",
        "scoped_team_total_thalf",
        "scoped_total_tinnings",
        "scoped_team_total_tinnings",
        "scoped_total_tmap_kills",
        "scoped_team_total_tmap_kills",
        "tennis_total",
        "tennis_team_total",
    }:
        return "over", "under"
    if spec.kind in {
        "simple_ah", "scoped_ah_tmap", "scoped_ah_tp",
        "scoped_ah_thalf", "scoped_ah_tinnings",
        "scoped_ah_tmap_kills",
    }:
        return "h", "a"
    if spec.kind == "tennis_ah":
        return "p1", "p2"
    return None


_POSITIONAL_HANDICAP_KINDS = frozenset({
    "simple_ah", "scoped_ah_tmap", "scoped_ah_tp",
    "scoped_ah_thalf", "scoped_ah_tinnings", "tennis_ah",
})


def _outcome_value_is_active(value: Any) -> bool:
    """Interpret only the feed's exact zero availability sentinel.

    Positive odds are deliberately neither compared nor ranked.  Their value
    is discarded immediately after this boolean availability check.
    """

    if value is None:
        return False
    return not (
        not isinstance(value, bool)
        and isinstance(value, (int, float, Decimal))
        and value == 0
    )


def _parse_outcome_patch(
    outcomes: Any,
    spec: _RawGroupSpec,
) -> dict[str, bool] | None:
    """Return normalized outcome -> active; ``False`` is a tombstone."""

    if not isinstance(outcomes, (list, tuple)):
        return None
    patch: dict[str, bool] = {}
    for item in outcomes:
        if not isinstance(item, (list, tuple)) or len(item) < 2:
            return None
        outcome = _normalise_outcome(item[0])
        if outcome is None:
            # Unrelated named outcomes in the same raw market are not proofs.
            continue
        # The legacy tennis-match fixture used h/a while current cpricefeed
        # sends p1/p2.  Canonicalise both labels to the player namespace before
        # collision checking and proof lookup.
        if spec.kind == "tennis_match":
            outcome = {"h": "p1", "a": "p2"}.get(outcome, outcome)
        active = _outcome_value_is_active(item[1])
        if outcome in patch and patch[outcome] != active:
            return None
        patch[outcome] = active
    return patch


def _market_entries(
    value: Any,
    spec: _RawGroupSpec,
) -> list[tuple[int | None, dict[str, bool] | None]] | None:
    """Normalize labeled raw-code and positional decimal-line market shapes."""

    if not isinstance(value, (list, tuple)):
        return None
    if not value:
        return []

    requires_line = spec.kind in _LINE_GROUP_KINDS
    if requires_line and _is_positional_decimal_wrapper(value):
        names = _positional_outcome_names(spec)
        if names is None:
            return None
        parsed_by_code: dict[int, dict[str, bool]] = {}
        seen: set[int] = set()
        for display_line, first_price, second_price in value[1]:
            try:
                raw_code = asian_line_to_code(display_line)
            except BiaOfferProofError:
                return None
            if raw_code in seen:
                return None
            seen.add(raw_code)
            if spec.kind in _POSITIONAL_HANDICAP_KINDS:
                # Grounded cpricefeed contract: positional AH rows are
                # ``[raw_line, home/player1, away/player2]`` and the selected
                # side's handicap is -raw_line for the first side and
                # +raw_line for the second side.  No price participates in
                # that identity mapping.
                coded_outcomes = (
                    (-raw_code, names[0], first_price),
                    (raw_code, names[1], second_price),
                )
            else:
                coded_outcomes = (
                    (raw_code, names[0], first_price),
                    (raw_code, names[1], second_price),
                )
            for code, outcome, price in coded_outcomes:
                patch = parsed_by_code.setdefault(code, {})
                if outcome in patch:
                    return None
                patch[outcome] = _outcome_value_is_active(price)
        return [(code, patch) for code, patch in parsed_by_code.items()]

    if _is_labelled_entry(value):
        raw_entries = [(value[0], value[1])]
    elif all(_is_labelled_entry(item) for item in value):
        raw_entries = [(item[0], item[1]) for item in value]
    else:
        return None

    if not requires_line and len(raw_entries) != 1:
        return None
    parsed = []
    seen_codes: set[int | None] = set()
    for raw_code, outcomes in raw_entries:
        code = _raw_asian_code(raw_code) if requires_line else None
        if requires_line and code is None:
            return None
        if code in seen_codes:
            return None
        seen_codes.add(code)
        if outcomes is None:
            parsed.append((code, None))
            continue
        outcome_patch = _parse_outcome_patch(outcomes, spec)
        if outcome_patch is None:
            return None
        parsed.append((code, outcome_patch))
    return parsed


def _finite_timestamp(value: Any) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise BiaOfferProofError("BIA_OFFER_TIMESTAMP_INVALID") from None
    if not math.isfinite(parsed):
        raise BiaOfferProofError("BIA_OFFER_TIMESTAMP_INVALID")
    return parsed


def _parse_standard_selection(selection: Mapping[str, Any]) -> _StandardSelection:
    bet_type = _exact_int(selection.get("bet_type"))
    team_select = _exact_int(selection.get("team_select"))
    map_number = _exact_int(selection.get("map_number"), default=0)
    period = _exact_int(selection.get("period"), default=0)
    game_number = _exact_int(selection.get("game_number"), default=0)

    if bet_type == 1:
        outcome = {0: "h", 1: "a", 2: "d"}.get(team_select)
    elif bet_type == 2:
        outcome = {0: "h", 1: "a"}.get(team_select)
    elif bet_type == 3:
        outcome = {3: "over", 4: "under"}.get(team_select)
    elif bet_type in {4, 5}:
        outcome = _TEAM_TOTAL_SELECTORS.get((bet_type, team_select))
    else:
        outcome = None
    if outcome is None:
        raise BiaOfferProofError(
            "BIA_STANDARD_SELECTOR_INVALID",
            details={"bet_type": bet_type, "team_select": team_select},
        )
    if map_number < 0 or map_number > 5 or period < 0 or game_number < 0:
        raise BiaOfferProofError("BIA_STANDARD_SELECTION_INVALID")
    esports_unit = str(selection.get("esports_unit") or "").strip().lower()
    if esports_unit not in {"", "rounds", "kills", "maps"}:
        raise BiaOfferProofError("BIA_ESPORTS_UNIT_INVALID")
    tennis_unit = str(selection.get("tennis_unit") or "").strip().lower()
    if tennis_unit not in {"", "game", "set"}:
        raise BiaOfferProofError("BIA_TENNIS_UNIT_INVALID")
    code = None if bet_type == 1 else asian_line_to_code(selection.get("handicap"))
    period_type = str(selection.get("period_type") or "").strip().lower()
    if period_type not in {"", "half", "inning"}:
        raise BiaOfferProofError("BIA_PERIOD_TYPE_INVALID")
    inning_number = _exact_int(selection.get("inning_number"), default=0)
    half_number = _exact_int(selection.get("half_number"), default=0)
    return _StandardSelection(
        bet_type=bet_type,
        team_select=team_select,
        outcome=outcome,
        asian_code=code,
        swapped=_exact_bool(selection.get("swapped")),
        map_number=map_number,
        period=period,
        game_number=game_number,
        esports_unit=esports_unit,
        tennis_unit=tennis_unit,
        period_type=period_type,
        inning_number=inning_number,
        half_number=half_number,
    )


def _validate_selection_scope(sport_code: str, selection: _StandardSelection) -> None:
    """Bind period/map/game dimensions to their exact BIA sport namespace."""

    is_tennis = sport_code.startswith("tennis")
    is_esports = sport_code in {"esports", "e-sports"}

    if selection.map_number and not is_esports:
        raise BiaOfferProofError("BIA_MAP_REQUIRES_ESPORTS")
    if selection.game_number and not is_tennis:
        raise BiaOfferProofError("BIA_GAME_REQUIRES_TENNIS")
    if selection.tennis_unit and not is_tennis:
        raise BiaOfferProofError("BIA_TENNIS_UNIT_REQUIRES_TENNIS")
    if selection.inning_number < 0 or selection.half_number < 0:
        raise BiaOfferProofError("BIA_STANDARD_SELECTION_INVALID")
    if selection.period_type == "inning":
        if sport_code != "baseball" or selection.inning_number <= 0 or selection.half_number:
            raise BiaOfferProofError("BIA_INNING_SCOPE_CONFLICT")
        if selection.period != 0:
            raise BiaOfferProofError("BIA_UNSUPPORTED_PERIOD")
        return
    if selection.period_type == "half":
        if sport_code not in {"baseball", "af"} or selection.half_number not in {1, 2} or selection.inning_number:
            raise BiaOfferProofError("BIA_HALF_SCOPE_CONFLICT")
        if selection.period != 0:
            raise BiaOfferProofError("BIA_UNSUPPORTED_PERIOD")
        return
    if selection.inning_number or selection.half_number:
        raise BiaOfferProofError("BIA_PERIOD_SCOPE_REQUIRED")

    if is_tennis:
        if selection.period > 5:
            raise BiaOfferProofError("BIA_UNSUPPORTED_TENNIS_PERIOD")
        if selection.game_number and selection.period == 0:
            raise BiaOfferProofError("BIA_TENNIS_GAME_SET_REQUIRED")
        if selection.game_number and selection.bet_type != 1:
            raise BiaOfferProofError("BIA_TENNIS_SCOPE_CONFLICT")
        if selection.bet_type == 1:
            # Exact-game groups already carry set+game coordinates.  A
            # contradictory set unit must not be allowed to reuse them, and a
            # game-scoped selector must not reuse a root/set winner group.
            if selection.game_number and selection.tennis_unit == "set":
                raise BiaOfferProofError("BIA_TENNIS_SCOPE_CONFLICT")
            if not selection.game_number and selection.tennis_unit == "game":
                raise BiaOfferProofError("BIA_TENNIS_SCOPE_CONFLICT")
        if selection.bet_type in {2, 3, 4, 5} and not selection.tennis_unit:
            raise BiaOfferProofError("BIA_TENNIS_UNIT_REQUIRED")
        return

    if is_esports:
        if selection.period != 0:
            raise BiaOfferProofError("BIA_UNSUPPORTED_PERIOD")
        if selection.bet_type in {2, 3, 4, 5}:
            if not selection.esports_unit:
                raise BiaOfferProofError("BIA_ESPORTS_UNIT_REQUIRED")
            if selection.map_number and selection.esports_unit not in {"rounds", "kills"}:
                raise BiaOfferProofError("BIA_ESPORTS_SCOPE_CONFLICT")
            if not selection.map_number and selection.esports_unit != "maps":
                raise BiaOfferProofError("BIA_ESPORTS_SCOPE_CONFLICT")
        return

    if sport_code.startswith("basket"):
        expected_namespace = {
            0: "basket",
            1: "basket_q1",
            2: "basket_q2",
            3: "basket_q3",
            4: "basket_q4",
            5: "basket_ht",
        }.get(selection.period)
        if expected_namespace is None or sport_code != expected_namespace:
            raise BiaOfferProofError("BIA_UNSUPPORTED_BASKETBALL_PERIOD")
        return

    if sport_code.startswith("fb"):
        if selection.period == 0:
            if sport_code in {"fb_ht", "fb_corn_ht", "fb_htft"}:
                raise BiaOfferProofError("BIA_UNSUPPORTED_SOCCER_PERIOD")
            return
        if selection.period == 1 and sport_code in {"fb_ht", "fb_corn_ht"}:
            return
        raise BiaOfferProofError("BIA_UNSUPPORTED_SOCCER_PERIOD")

    if selection.period != 0:
        raise BiaOfferProofError("BIA_UNSUPPORTED_PERIOD")


def _wanted_side(selection: _StandardSelection, *, tennis: bool) -> str:
    if selection.outcome == "d":
        return "d"
    if selection.bet_type in {1, 2}:
        home = selection.outcome == "h"
    else:
        home = selection.bet_type == 4
    if selection.swapped:
        home = not home
    if tennis:
        return "p1" if home else "p2"
    return "h" if home else "a"


def _serialise_candidate(
    spec: _RawGroupSpec,
    *,
    sport_code: str,
    selection: _StandardSelection,
) -> tuple[str, str] | None:
    """Return ``(bet_type, raw_outcome)`` only for an exact raw-group scope."""

    tennis = sport_code.startswith("tennis")
    wanted_side = _wanted_side(selection, tennis=tennis)
    code = selection.asian_code

    if spec.kind.startswith("tennis_"):
        if not tennis or selection.map_number:
            return None
        wanted_set = "all" if selection.period == 0 else str(selection.period)
        if spec.kind == "tennis_game":
            if (
                selection.bet_type != 1
                or selection.game_number <= 0
                or spec.game != str(selection.game_number)
                or (selection.period > 0 and spec.scope != wanted_set)
                or wanted_side == "d"
            ):
                return None
            return (
                f"for,tgame,{spec.scope},{spec.game},vwhatever,{wanted_side}",
                wanted_side,
            )
        if spec.scope != wanted_set:
            return None
        if selection.game_number:
            return None
        if spec.kind == "tennis_match" and selection.bet_type == 1 and wanted_side != "d":
            return f"for,tset,{spec.scope},vwhatever,{wanted_side}", wanted_side
        if (
            spec.kind in {"tennis_ah", "tennis_total", "tennis_team_total"}
            and selection.tennis_unit
            and spec.tennis_unit != selection.tennis_unit
        ):
            return None
        if spec.kind == "tennis_ah" and selection.bet_type == 2 and code is not None:
            return (
                f"for,tset,{spec.scope},vwhatever,{spec.tennis_unit},ah,{wanted_side},{code}",
                wanted_side,
            )
        if spec.kind == "tennis_total" and selection.bet_type == 3 and code is not None:
            direction = f"ah{selection.outcome}"
            return (
                f"for,tset,{spec.scope},vwhatever,{spec.tennis_unit},{direction},{code}",
                selection.outcome,
            )
        if (
            spec.kind == "tennis_team_total"
            and selection.bet_type in {4, 5}
            and code is not None
            and spec.side == wanted_side
        ):
            direction = f"tah{selection.outcome}"
            return (
                f"for,tset,{spec.scope},vwhole,{spec.tennis_unit},{direction},{spec.side},{code}",
                selection.outcome,
            )
        return None

    if tennis:
        return None

    simple = spec.kind.startswith("simple_")
    if simple:
        if selection.map_number or selection.period_type:
            return None
        # Esports match identity is explicitly scoped by tp; a bare group must
        # never stand in for map/match rounds.  Likewise bare wdw has only been
        # grounded for football's simple h/d/a serializer.
        if sport_code in {"esports", "e-sports"}:
            return None
        prefix = "for,"
        family = spec.kind.removeprefix("simple_")
    elif spec.kind.endswith("_tmap"):
        if selection.map_number <= 0 or spec.scope != str(selection.map_number):
            return None
        if selection.bet_type in {2, 3, 4, 5} and selection.esports_unit != "rounds":
            return None
        prefix = f"for,tmap,{spec.scope},"
        family = spec.kind.removeprefix("scoped_").removesuffix("_tmap")
    elif spec.kind.endswith("_tmap_kills"):
        if (
            selection.map_number <= 0
            or spec.scope != str(selection.map_number)
            or selection.esports_unit != "kills"
        ):
            return None
        prefix = f"for,tmap,{spec.scope},sub,kills,"
        family = spec.kind.removeprefix("scoped_").removesuffix("_tmap_kills")
    elif spec.kind.endswith("_tp"):
        # Standard period-0 Pinnacle selections include overtime.  ``tp,reg``
        # is a different market and must never win merely because it is the
        # only raw group currently populated.  Soccer 1X2 is handled by the
        # separately validated bare ``wdw`` -> ``tp,reg,wdw`` contract.
        if (
            selection.map_number
            or selection.period_type
            or spec.scope != "all"
            or sport_code.startswith("fb")
        ):
            return None
        if (
            sport_code in {"esports", "e-sports"}
            and selection.bet_type in {2, 3, 4, 5}
            and selection.esports_unit != "maps"
        ):
            return None
        prefix = f"for,tp,{spec.scope},"
        family = spec.kind.removeprefix("scoped_").removesuffix("_tp")
    elif spec.kind.endswith("_thalf"):
        if (
            selection.period_type != "half"
            or selection.half_number <= 0
            or spec.scope != str(selection.half_number)
        ):
            return None
        prefix = f"for,thalf,{spec.scope},"
        family = spec.kind.removeprefix("scoped_").removesuffix("_thalf")
    elif spec.kind.endswith("_tinnings"):
        if (
            selection.period_type != "inning"
            or selection.inning_number <= 0
            or spec.scope != str(selection.inning_number)
        ):
            return None
        prefix = f"for,tinnings,{spec.scope},"
        family = spec.kind.removeprefix("scoped_").removesuffix("_tinnings")
    else:
        return None

    if family == "wdw" and selection.bet_type == 1:
        if simple:
            if not sport_code.startswith("fb"):
                return None
            return f"for,tp,reg,wdw,{wanted_side}", wanted_side
        return f"{prefix}wdw,{wanted_side}", wanted_side
    if family == "ml" and selection.bet_type == 1 and wanted_side != "d":
        if sport_code.startswith("fb"):
            return None
        return f"{prefix}ml,{wanted_side}", wanted_side
    if family == "ah" and selection.bet_type == 2 and code is not None:
        return f"{prefix}ah,{wanted_side},{code}", wanted_side
    if family == "total" and selection.bet_type == 3 and code is not None:
        direction = f"ah{selection.outcome}"
        return f"{prefix}{direction},{code}", selection.outcome
    if (
        family == "team_total"
        and selection.bet_type in {4, 5}
        and code is not None
        and spec.side == wanted_side
    ):
        direction = f"tah{selection.outcome}"
        return f"{prefix}{direction},{spec.side},{code}", selection.outcome
    return None


class BiaOfferProofRegistry:
    """RLock-protected registry of exact structural BIA standard offers."""

    def __init__(
        self,
        *,
        ttl_sec: float = DEFAULT_OFFER_PROOF_TTL_SEC,
        clock: Callable[[], float] = time.time,
    ) -> None:
        ttl = float(ttl_sec)
        if not math.isfinite(ttl) or ttl <= 0:
            raise ValueError("ttl_sec must be finite and positive")
        self._ttl_sec = ttl
        self._clock = clock
        self._lock = RLock()
        self._events: dict[tuple[str, str], _EventState] = {}

    @property
    def ttl_sec(self) -> float:
        return self._ttl_sec

    def _timestamp(self, observed_at: float | None) -> float:
        return _finite_timestamp(self._clock() if observed_at is None else observed_at)

    @staticmethod
    def _identity(
        competition_id: Any,
        sport_code: Any,
        event_key: Any,
    ) -> tuple[str, str, str]:
        comp_id = _normalise_identity_part(competition_id)
        sport = _normalise_sport(sport_code)
        event = _normalise_identity_part(event_key)
        if not comp_id or not sport or not event:
            raise BiaOfferProofError("BIA_OFFER_EVENT_IDENTITY_INCOMPLETE")
        return comp_id, sport, event

    def observe(
        self,
        *,
        competition_id: Any,
        sport_code: Any,
        event_key: Any,
        markets: Mapping[str, Any],
        observed_at: float | None = None,
    ) -> BiaOfferProofUpdate:
        """Apply one raw cpricefeed patch without guessing snapshot completeness."""

        comp_id, sport, event = self._identity(competition_id, sport_code, event_key)
        if not isinstance(markets, Mapping):
            raise BiaOfferProofError("BIA_OFFER_MARKETS_INVALID")
        now = self._timestamp(observed_at)
        key = (sport, event)

        with self._lock:
            state = self._events.get(key)
            if state is None:
                state = _EventState(competition_ids={comp_id}, last_seen=now)
                self._events[key] = state
            elif now < state.last_seen:
                return BiaOfferProofUpdate(
                    status="IGNORED_OUT_OF_ORDER",
                    groups_seen=len(markets),
                    out_of_order=True,
                )
            elif comp_id not in state.competition_ids:
                state.competition_ids.add(comp_id)
                state.collision = True
                state.groups.clear()
                state.invalid_groups.clear()
                state.last_seen = now
                return BiaOfferProofUpdate(
                    status="EVENT_COLLISION",
                    groups_seen=len(markets),
                )

            state.last_seen = now
            if state.collision:
                return BiaOfferProofUpdate(
                    status="EVENT_COLLISION",
                    groups_seen=len(markets),
                )

            groups_seen = 0
            groups_updated = 0
            groups_removed = 0
            groups_invalid = 0
            unsupported_groups = 0
            normalised_seen: set[str] = set()

            for raw_key, market in markets.items():
                group_key = str(raw_key or "").strip().lower()
                spec = _parse_raw_group(group_key)
                if spec is None:
                    unsupported_groups += 1
                    continue
                groups_seen += 1

                if group_key in normalised_seen:
                    state.groups.pop(group_key, None)
                    state.invalid_groups.add(group_key)
                    groups_invalid += 1
                    continue
                normalised_seen.add(group_key)

                if market is None:
                    if state.groups.pop(group_key, None) is not None:
                        groups_removed += 1
                    state.invalid_groups.discard(group_key)
                    continue

                entries = _market_entries(market, spec)
                if entries is None:
                    state.groups.pop(group_key, None)
                    state.invalid_groups.add(group_key)
                    groups_invalid += 1
                    continue

                state.invalid_groups.discard(group_key)
                group = state.groups.setdefault(group_key, _GroupState())
                touched = False
                for code, outcome_patch in entries:
                    if outcome_patch is None:
                        if group.lines.pop(code, None) is not None:
                            touched = True
                        continue
                    if not outcome_patch:
                        continue
                    line = group.lines.setdefault(code, _LineState())
                    for outcome, active in outcome_patch.items():
                        if active:
                            line.outcomes[outcome] = now
                        else:
                            line.outcomes.pop(outcome, None)
                        touched = True
                    if not line.outcomes:
                        group.lines.pop(code, None)
                if touched:
                    group.updated_at = now
                    groups_updated += 1
                if not group.lines:
                    state.groups.pop(group_key, None)

            return BiaOfferProofUpdate(
                status="OK",
                groups_seen=groups_seen,
                groups_updated=groups_updated,
                groups_removed=groups_removed,
                groups_invalid=groups_invalid,
                unsupported_groups=unsupported_groups,
            )

    def prove(
        self,
        event_ref: Mapping[str, Any],
        selection: Mapping[str, Any],
        *,
        now: float | None = None,
    ) -> BiaOfferProof:
        """Prove and serialize one exact standard outcome (bet types 1-5)."""

        if not isinstance(event_ref, Mapping) or not isinstance(selection, Mapping):
            raise BiaOfferProofError("BIA_OFFER_PROOF_REQUEST_INVALID")
        comp_id, sport, event = self._identity(
            event_ref.get("competition_id", event_ref.get("comp_id")),
            event_ref.get("sport_code"),
            event_ref.get("event_key"),
        )
        event_swapped = _exact_bool(event_ref.get("swapped"))
        if "swapped" in selection:
            selection_swapped = _exact_bool(selection.get("swapped"))
            if selection_swapped != event_swapped:
                raise BiaOfferProofError("BIA_OFFER_SWAP_CONFLICT")
        merged_selection = dict(selection)
        merged_selection["swapped"] = event_swapped
        parsed = _parse_standard_selection(merged_selection)
        _validate_selection_scope(sport, parsed)
        if parsed.esports_unit and sport not in {"esports", "e-sports"}:
            raise BiaOfferProofError("BIA_ESPORTS_UNIT_REQUIRES_ESPORTS")
        current = self._timestamp(now)

        with self._lock:
            state = self._events.get((sport, event))
            if state is None:
                raise BiaOfferProofError("BIA_OFFER_EVENT_MISSING")
            if current - state.last_seen > self._ttl_sec:
                raise BiaOfferProofError("BIA_OFFER_PROOF_STALE")
            if state.collision or len(state.competition_ids) != 1:
                raise BiaOfferProofError(
                    "BIA_OFFER_EVENT_COLLISION",
                    details={"competition_count": len(state.competition_ids)},
                )
            stored_comp_id = next(iter(state.competition_ids))
            if stored_comp_id != comp_id:
                raise BiaOfferProofError("BIA_OFFER_EVENT_COMPETITION_MISMATCH")

            active: list[tuple[str, str, str, float]] = []
            stale = 0
            relevant_groups = 0
            groups_with_line = 0
            malformed_relevant = 0

            all_group_keys = set(state.groups) | set(state.invalid_groups)
            for group_key in sorted(all_group_keys):
                spec = _parse_raw_group(group_key)
                if spec is None:
                    continue
                candidate = _serialise_candidate(
                    spec,
                    sport_code=sport,
                    selection=parsed,
                )
                if candidate is None:
                    continue
                bet_type, raw_outcome = candidate
                relevant_groups += 1
                if group_key in state.invalid_groups:
                    malformed_relevant += 1
                    continue
                group = state.groups.get(group_key)
                if group is None:
                    continue
                line = group.lines.get(parsed.asian_code)
                if line is None:
                    continue
                groups_with_line += 1
                observed_at = line.outcomes.get(raw_outcome)
                if observed_at is None:
                    continue
                if current - observed_at > self._ttl_sec:
                    stale += 1
                    continue
                active.append((group_key, bet_type, raw_outcome, observed_at))

            if malformed_relevant:
                raise BiaOfferProofError(
                    "BIA_OFFER_MARKET_INVALID",
                    details={"matching_groups": malformed_relevant},
                )
            if len(active) > 1:
                raise BiaOfferProofError(
                    "BIA_OFFER_PROOF_AMBIGUOUS",
                    details={"matching_groups": len(active)},
                )
            if len(active) == 1:
                group_key, bet_type, raw_outcome, observed_at = active[0]
                return BiaOfferProof(
                    competition_id=stored_comp_id,
                    sport_code=sport,
                    event_key=event,
                    raw_group=group_key,
                    asian_code=parsed.asian_code,
                    direction=raw_outcome,
                    bet_type=bet_type,
                    observed_at=observed_at,
                    expires_at=observed_at + self._ttl_sec,
                )
            if stale:
                raise BiaOfferProofError("BIA_OFFER_PROOF_STALE")
            if relevant_groups == 0:
                raise BiaOfferProofError("BIA_OFFER_MARKET_MISSING")
            if parsed.asian_code is not None and groups_with_line == 0:
                raise BiaOfferProofError(
                    "BIA_OFFER_LINE_MISSING",
                    details={"asian_code": parsed.asian_code},
                )
            if parsed.outcome in {"over", "under"}:
                raise BiaOfferProofError(
                    "BIA_OFFER_DIRECTION_MISSING",
                    details={"direction": parsed.outcome},
                )
            raise BiaOfferProofError(
                "BIA_OFFER_OUTCOME_MISSING",
                details={"outcome": parsed.outcome},
            )

    def try_prove(
        self,
        event_ref: Mapping[str, Any],
        selection: Mapping[str, Any],
        *,
        now: float | None = None,
    ) -> dict[str, Any]:
        """Non-raising wrapper for HTTP/service integration."""

        try:
            return self.prove(event_ref, selection, now=now).as_dict()
        except BiaOfferProofError as exc:
            return exc.as_dict()

    def prove_special(
        self,
        event_ref: Mapping[str, Any],
        *,
        special_type: Any,
        contestant: Any,
        period: Any = 0,
        handicap: Any = 0,
        now: float | None = None,
    ) -> BiaOfferProof:
        """Prove one explicitly supported special from its raw BIA group.

        This is deliberately separate from standard bet types 1-5. The raw
        group name and exact contestant determine the serializer; prices are
        discarded during observation and never participate in identity.
        """
        if not isinstance(event_ref, Mapping):
            raise BiaOfferProofError("BIA_OFFER_PROOF_REQUEST_INVALID")
        comp_id, sport, event = self._identity(
            event_ref.get("competition_id", event_ref.get("comp_id")),
            event_ref.get("sport_code"),
            event_ref.get("event_key"),
        )
        special = str(special_type or "").strip().lower()
        side = str(contestant or "").strip().lower()
        parsed_period = _exact_int(period, default=0)
        try:
            parsed_handicap = Decimal(str(handicap or 0).strip())
        except (InvalidOperation, ValueError, TypeError):
            raise BiaOfferProofError("BIA_SPECIAL_SELECTION_INVALID") from None
        if not parsed_handicap.is_finite():
            raise BiaOfferProofError("BIA_SPECIAL_SELECTION_INVALID")
        if special != "to_qualify" or side not in {"home", "away"}:
            raise BiaOfferProofError("BIA_SPECIAL_SELECTOR_INVALID")
        if parsed_period != 0 or parsed_handicap != 0 or not sport.startswith("fb"):
            raise BiaOfferProofError("BIA_SPECIAL_SCOPE_INVALID")
        swapped = _exact_bool(event_ref.get("swapped"))
        raw_side = "h" if side == "home" else "a"
        if swapped:
            raw_side = "a" if raw_side == "h" else "h"
        current = self._timestamp(now)

        with self._lock:
            state = self._events.get((sport, event))
            if state is None:
                raise BiaOfferProofError("BIA_OFFER_EVENT_MISSING")
            if current - state.last_seen > self._ttl_sec:
                raise BiaOfferProofError("BIA_OFFER_PROOF_STALE")
            if state.collision or len(state.competition_ids) != 1:
                raise BiaOfferProofError("BIA_OFFER_EVENT_COLLISION")
            if next(iter(state.competition_ids)) != comp_id:
                raise BiaOfferProofError("BIA_OFFER_EVENT_COMPETITION_MISMATCH")
            if "qualify" in state.invalid_groups:
                raise BiaOfferProofError("BIA_OFFER_MARKET_INVALID")
            group = state.groups.get("qualify")
            if group is None:
                raise BiaOfferProofError("BIA_OFFER_MARKET_MISSING")
            line = group.lines.get(None)
            observed_at = line.outcomes.get(raw_side) if line is not None else None
            if observed_at is None:
                raise BiaOfferProofError("BIA_OFFER_OUTCOME_MISSING")
            if current - observed_at > self._ttl_sec:
                raise BiaOfferProofError("BIA_OFFER_PROOF_STALE")
            return BiaOfferProof(
                competition_id=comp_id,
                sport_code=sport,
                event_key=event,
                raw_group="qualify",
                asian_code=None,
                direction=raw_side,
                bet_type=f"for,qualify,{raw_side}",
                observed_at=observed_at,
                expires_at=observed_at + self._ttl_sec,
            )

    def try_prove_special(self, event_ref: Mapping[str, Any], **kwargs: Any) -> dict[str, Any]:
        try:
            return self.prove_special(event_ref, **kwargs).as_dict()
        except BiaOfferProofError as exc:
            return exc.as_dict()

    def remove_event(
        self,
        *,
        sport_code: Any,
        event_key: Any,
        competition_id: Any | None = None,
    ) -> bool:
        """Remove an event, optionally only when its competition id matches."""

        sport = _normalise_sport(sport_code)
        event = _normalise_identity_part(event_key)
        if not sport or not event:
            raise BiaOfferProofError("BIA_OFFER_EVENT_IDENTITY_INCOMPLETE")
        with self._lock:
            state = self._events.get((sport, event))
            if state is None:
                return False
            if competition_id is not None:
                comp_id = _normalise_identity_part(competition_id)
                if state.competition_ids != {comp_id}:
                    return False
            del self._events[(sport, event)]
            return True

    def purge_stale(self, *, now: float | None = None) -> int:
        """Drop expired outcomes and events; return removed event count."""

        current = self._timestamp(now)
        removed_events = 0
        with self._lock:
            for event_key, state in list(self._events.items()):
                if current - state.last_seen > self._ttl_sec:
                    del self._events[event_key]
                    removed_events += 1
                    continue
                for group_key, group in list(state.groups.items()):
                    for code, line in list(group.lines.items()):
                        for outcome, observed_at in list(line.outcomes.items()):
                            if current - observed_at > self._ttl_sec:
                                del line.outcomes[outcome]
                        if not line.outcomes:
                            del group.lines[code]
                    if not group.lines:
                        del state.groups[group_key]
        return removed_events

    def snapshot(self) -> dict[str, Any]:
        """Return structural diagnostics.  Bookmaker prices never appear."""

        with self._lock:
            events: list[dict[str, Any]] = []
            for (sport, event), state in sorted(self._events.items()):
                groups: dict[str, Any] = {}
                for group_key, group in sorted(state.groups.items()):
                    groups[group_key] = {
                        "lines": {
                            ("none" if code is None else str(code)): sorted(line.outcomes)
                            for code, line in sorted(group.lines.items())
                        },
                        "updated_at": group.updated_at,
                    }
                events.append(
                    {
                        "sport_code": sport,
                        "event_key": event,
                        "competition_id": (
                            next(iter(state.competition_ids))
                            if len(state.competition_ids) == 1
                            else None
                        ),
                        "competition_count": len(state.competition_ids),
                        "collision": state.collision,
                        "last_seen": state.last_seen,
                        "groups": groups,
                        "invalid_groups": sorted(state.invalid_groups),
                    }
                )
            return {"ttl_sec": self._ttl_sec, "events": events}


__all__ = [
    "DEFAULT_OFFER_PROOF_TTL_SEC",
    "BiaOfferProof",
    "BiaOfferProofError",
    "BiaOfferProofRegistry",
    "BiaOfferProofUpdate",
    "asian_line_to_code",
]
