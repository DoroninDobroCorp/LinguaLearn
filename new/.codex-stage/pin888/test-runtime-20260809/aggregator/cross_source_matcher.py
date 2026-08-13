"""Cross-source event matcher (Phase 5, TZ §3 / §8).

Pure functions, stdlib-only. Given event metadata from multiple
sources, produce a stable ``match_key`` that callers can use as a
cross-source event identifier.

Design choices
--------------

- We **never** silently merge into the ``event_id`` of any one source.
  Callers explicitly attach the ``match_key`` to events that resolve
  to the same fixture; downstream stays able to fall back to the
  per-source ``event_id`` namespace at any time.
- If any required field is missing or empty after normalization, we
  refuse to produce a key (returns ``None`` and increments the caller-
  visible counter on ``MatchStats``). Better skip than wrong match
  (TZ §8).
- The match window is configurable; default ±5 minutes around the
  scheduled start time. Times are bucketed to the nearest minute so
  small jitter does not split matches.
- Team-name aliasing uses a small, extensible dict that ships empty.
  Callers may register aliases at runtime — the registry is local to
  ``CrossSourceMatcher`` instances so concurrent test isolation works.

Behind ``MSP_CROSS_SOURCE_MATCH_ENABLED`` for runtime use; the helper
itself is import-time inert and side-effect-free.
"""

from __future__ import annotations

import hashlib
import os
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable, Optional

# ── env flag ─────────────────────────────────────────────────────────


def cross_source_match_enabled() -> bool:
    """Whether the runtime should consult the matcher.

    Default OFF. When off, the decision engine retains today's per-
    source-namespace behaviour (each event_id stays separate).
    """
    return os.environ.get("MSP_CROSS_SOURCE_MATCH_ENABLED", "").strip() in (
        "1",
        "true",
        "True",
        "yes",
    )


# ── normalization primitives ─────────────────────────────────────────


_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def _strip_diacritics(s: str) -> str:
    nf = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nf if not unicodedata.combining(c))


def normalize_text(value: str | None) -> str:
    """Lowercase, strip diacritics, collapse non-alphanumeric to ``_``.

    Empty input → empty string. Never raises.
    """
    if not isinstance(value, str):
        return ""
    s = _strip_diacritics(value).strip().lower()
    s = _NON_ALNUM.sub("_", s)
    s = s.strip("_")
    return s


# ── alias table ──────────────────────────────────────────────────────


@dataclass
class AliasTable:
    """Per-instance team-name alias map.

    Maps any spelling → canonical normalized form. The default ships
    empty; callers extend at runtime via ``add()``. We intentionally
    do not bake aliases into the module so tests stay deterministic
    and concurrent matchers do not share state.
    """

    _table: dict[str, str] = field(default_factory=dict)

    def add(self, *spellings: str, canonical: str) -> None:
        canon = normalize_text(canonical)
        if not canon:
            return
        for spell in spellings:
            n = normalize_text(spell)
            if n:
                self._table[n] = canon

    def resolve(self, value: str) -> str:
        n = normalize_text(value)
        return self._table.get(n, n)


# ── stats counter ────────────────────────────────────────────────────


@dataclass
class MatchStats:
    matched: int = 0
    unmatched_missing_field: int = 0
    unmatched_outside_window: int = 0


# ── core matcher ─────────────────────────────────────────────────────


@dataclass
class EventDescriptor:
    """Minimal cross-source event descriptor.

    All fields required for a match. ``start_time`` should be tz-aware
    UTC; naive datetimes are interpreted as UTC.
    """

    sport: str
    league: str
    home_team: str
    away_team: str
    start_time: datetime


def _to_utc(ts: datetime) -> datetime:
    if ts.tzinfo is None:
        return ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc)


@dataclass
class CrossSourceMatcher:
    """Compute stable ``match_key``s across sources.

    Stateless except for the alias table and counters. Callers may
    construct one matcher per worker (cheap) or share one.
    """

    aliases: AliasTable = field(default_factory=AliasTable)
    window_minutes: int = 5
    stats: MatchStats = field(default_factory=MatchStats)

    def normalize_descriptor(
        self, desc: EventDescriptor
    ) -> Optional[tuple[str, str, str, str, int]]:
        """Return tuple of normalized fields or None if any is missing.

        The returned tuple is ``(sport, league, home, away, unix_min)``
        where ``unix_min`` is the start time bucketed to ``window_minutes``.
        """
        sport = normalize_text(desc.sport)
        league = normalize_text(desc.league)
        home = self.aliases.resolve(desc.home_team)
        away = self.aliases.resolve(desc.away_team)
        if not (sport and league and home and away):
            self.stats.unmatched_missing_field += 1
            return None
        try:
            ts = _to_utc(desc.start_time)
        except Exception:  # noqa: BLE001 — never crash hot path
            self.stats.unmatched_missing_field += 1
            return None
        # Bucket to window_minutes so small drifts coalesce.
        if self.window_minutes < 1:
            window = 1
        else:
            window = self.window_minutes
        unix_min = int(ts.timestamp() // (window * 60))
        return (sport, league, home, away, unix_min)

    def match_key(self, desc: EventDescriptor) -> Optional[str]:
        """Compute the cross-source ``match:...`` key for ``desc``.

        Returns ``None`` if any required field is missing — caller
        MUST treat as unmatched (TZ §8: better skip than wrong match).
        """
        norm = self.normalize_descriptor(desc)
        if norm is None:
            return None
        sport, league, home, away, unix_min = norm
        # Order-insensitive in teams: many sources put home/away in
        # opposite order. Sort lexicographically so both orders hash
        # to the same key. We still preserve original order for the
        # caller via the descriptor.
        a, b = sorted((home, away))
        raw = f"match:{sport}:{league}:{a}:{b}:{unix_min}"
        if len(raw) > 120:
            digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]
            return f"match:{sport}:{league}:{digest}"
        return raw

    def match(
        self, a: EventDescriptor, b: EventDescriptor
    ) -> bool:
        """Pairwise: do ``a`` and ``b`` resolve to the same fixture?"""
        ka = self.match_key(a)
        kb = self.match_key(b)
        if ka is None or kb is None:
            return False
        # Window already encoded in the key; if start_times are within
        # one window-bucket they share a key. Adjacent buckets handled
        # by the caller via ``find_within_window``.
        if ka == kb:
            self.stats.matched += 1
            return True
        # Same fixture in adjacent bucket? Verify by direct delta.
        norm_a = self.normalize_descriptor(a)
        norm_b = self.normalize_descriptor(b)
        if norm_a is None or norm_b is None:
            return False
        # Sort home/away for order-insensitive comparison (match_key
        # already sorts teams, so the fallback must too).
        sport_a, league_a, home_a, away_a, _ = norm_a
        sport_b, league_b, home_b, away_b, _ = norm_b
        teams_a = tuple(sorted((home_a, away_a)))
        teams_b = tuple(sorted((home_b, away_b)))
        if (sport_a, league_a) != (sport_b, league_b) or teams_a != teams_b:
            return False
        ta = _to_utc(a.start_time)
        tb = _to_utc(b.start_time)
        delta_min = abs((ta - tb).total_seconds()) / 60.0
        if delta_min <= self.window_minutes:
            self.stats.matched += 1
            return True
        self.stats.unmatched_outside_window += 1
        return False

    def group(self, descs: Iterable[EventDescriptor]) -> dict[str, list[EventDescriptor]]:
        """Bucket descriptors by ``match_key``. Skipped events excluded."""
        buckets: dict[str, list[EventDescriptor]] = {}
        for d in descs:
            k = self.match_key(d)
            if k is None:
                continue
            buckets.setdefault(k, []).append(d)
        return buckets


__all__ = [
    "AliasTable",
    "CrossSourceMatcher",
    "EventDescriptor",
    "MatchStats",
    "cross_source_match_enabled",
    "normalize_text",
]
