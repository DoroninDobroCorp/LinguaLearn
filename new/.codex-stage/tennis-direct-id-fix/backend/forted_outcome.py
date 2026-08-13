"""Translate Forted-style cyrillic raw_selection into the PS3838 outcome string
accepted by pin888 services/outcome_mapper.outcome_to_ps3838().

Supported Forted forms (case-insensitive, comma or dot decimals):
  П1 / 1 / Home          -> "1"
  П2 / 2 / Away          -> "2"
  Х / X / Draw           -> "X"
  ТБ(2,5) / Over 2.5     -> "T> 2.5"
  ТМ(2,5) / Under 2.5    -> "T< 2.5"
  Ф1(-1,5)               -> "H1 -1.5"
  Ф2(1,5)                -> "H2 1.5"
  ИТ1Б(105,5)            -> "IT1> 105.5"
  ИТ1М(105,5)            -> "IT1< 105.5"
  ИТ2Б(83)               -> "IT2> 83"
  ИТ2М(85,5)             -> "IT2< 85.5"
  1X / Х2 / 12           -> "DC 1X" / "DC X2" / "DC 12"
  К1 пройдёт / К1 пройдет -> "TQ Home"
  К2 пройдёт / К2 пройдет -> "TQ Away"
  0:2 / 1:1 / 2:0        -> "CS 0:2"

Returns None when the form cannot be reliably mapped — caller must NOT guess.
"""

from __future__ import annotations

import re
from typing import Optional


_NUMERIC_RE = re.compile(r"\(\s*([-+]?\d+(?:[.,]\d+)?)\s*\)")
_TRAILING_NUMERIC_RE = re.compile(r"(?:\s|[><])([-+]?\d+(?:[.,]\d+)?)\s*$")
_CORRECT_SCORE_RE = re.compile(r"^(\d+)\s*:\s*(\d+)$")
_SCORE_SUFFIX_RE = re.compile(r"^\s*([12X])\s*\(\s*\d+\s*:\s*\d+\s*\)\s*$", re.IGNORECASE)
_PERIOD_PREFIX_RE = re.compile(
    r"^\s*(?:p\s*(\d+)|(\d+)(?:\s*-(?:й|ый|ой|ий|st|nd|rd|th))?\s*(?:p|п|period|пер(?:иод)?|half|тайм|set|сет))\.?\s*[:;,\-/]?\s+",
    re.IGNORECASE,
)


def _extract_line(s: str) -> Optional[float]:
    m = _NUMERIC_RE.search(s) or _TRAILING_NUMERIC_RE.search(s)
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", "."))
    except ValueError:
        return None


def _format_line(value: float) -> str:
    if value == int(value):
        return f"{int(value)}"
    return f"{value:.2f}".rstrip("0").rstrip(".")


def _with_period(outcome: str, period: int) -> str:
    if period and period > 0:
        return f"P{period} {outcome}"
    return outcome


def _individual_total_direction(value: str) -> Optional[str]:
    match = re.match(
        r"^(?:ит|it)\s*[12]\s*(б|м|>|<|over\b|under\b)",
        str(value or "").strip().lower(),
    )
    if not match:
        return None
    marker = match.group(1)
    return ">" if marker in {"б", ">", "over"} else "<"


def _strip_period_prefix(raw: str, default_period: int) -> tuple[str, int]:
    clean = str(raw or "").strip()
    match = _PERIOD_PREFIX_RE.match(clean)
    if not match:
        return clean, default_period
    period_raw = match.group(1) or match.group(2)
    try:
        period = int(period_raw)
    except (TypeError, ValueError):
        period = default_period
    return clean[match.end():].strip(), period


def translate(raw: str, period: int = 0) -> Optional[str]:
    """Translate Forted cyrillic raw_selection -> PS3838 outcome string.

    period=0 keeps no prefix; otherwise prepends "P{period} ".
    Returns None for unknown / per-game props / corner / card markets.
    """
    if not raw:
        return None
    s, period = _strip_period_prefix(str(raw).strip(), period)
    lower = s.lower()

    if re.match(r"^game\s+\d", lower):
        return None

    score_suffix = _SCORE_SUFFIX_RE.match(s)
    if score_suffix:
        team = score_suffix.group(1).upper()
        if team == "1":
            return _with_period("1", period)
        if team == "2":
            return _with_period("2", period)
        return _with_period("X", period)

    cs_match = _CORRECT_SCORE_RE.match(s)
    if cs_match:
        home_score = int(cs_match.group(1))
        away_score = int(cs_match.group(2))
        return _with_period(f"CS {home_score}:{away_score}", period)

    qualify_lower = lower.replace("ё", "е")
    if qualify_lower.startswith("к1 пройдет") or qualify_lower.startswith("k1 проходит") or qualify_lower.startswith("k1 to qualify"):
        return _with_period("TQ Home", period)
    if qualify_lower.startswith("к2 пройдет") or qualify_lower.startswith("k2 проходит") or qualify_lower.startswith("k2 to qualify"):
        return _with_period("TQ Away", period)

    line = _extract_line(s)

    # Individual Totals — must come BEFORE Total (since ИТ1Б startswith "и" not "т")
    if lower.startswith("ит1") or lower.startswith("it1"):
        direction = _individual_total_direction(lower)
        if line is None or direction is None:
            return None
        return _with_period(f"IT1{direction} {_format_line(line)}", period)
    if lower.startswith("ит2") or lower.startswith("it2"):
        direction = _individual_total_direction(lower)
        if line is None or direction is None:
            return None
        return _with_period(f"IT2{direction} {_format_line(line)}", period)

    # Total
    if lower.startswith("тб") or lower.startswith("over"):
        if line is None:
            return None
        return _with_period(f"T> {_format_line(line)}", period)
    if lower.startswith("тм") or lower.startswith("under"):
        if line is None:
            return None
        return _with_period(f"T< {_format_line(line)}", period)

    # Handicap
    if lower.startswith("ф1") or lower.startswith("handicap 1") or lower.startswith("hcap 1") or lower.startswith("h1"):
        if line is None:
            return None
        return _with_period(f"H1 {_format_line(line)}", period)
    if lower.startswith("ф2") or lower.startswith("handicap 2") or lower.startswith("hcap 2") or lower.startswith("h2"):
        if line is None:
            return None
        return _with_period(f"H2 {_format_line(line)}", period)

    # Double chance (Forted writes 1X / X2 / 12, sometimes with Cyrillic Х)
    dc = lower.replace("х", "x")
    if dc in {"1x", "x2", "12"}:
        canonical = {"1x": "1X", "x2": "X2", "12": "12"}[dc]
        return _with_period(f"DC {canonical}", period)

    # Moneyline
    if lower in {"п1", "1", "home", "win1"}:
        return _with_period("1", period)
    if lower in {"п2", "2", "away", "win2"}:
        return _with_period("2", period)
    if lower in {"х", "x", "draw", "winnone", "none"}:
        return _with_period("X", period)

    return None
