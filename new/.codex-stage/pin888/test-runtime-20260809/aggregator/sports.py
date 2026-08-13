"""Sport name ↔ id mapping (Story 27.17).

Partner API uses numeric sport_ids (29 Soccer, 4 Basketball, ...). pin888
legacy payload только `SportName` (строка). Чтобы в /snapshot
экспонировать числовой `sport_id` для per-sport SLA matrices, нужен
reverse lookup.

Source of truth — ``SPORT_ID_TO_RUNTIME_NAME`` в ``tools/ps3838_api_parity.py``.
Здесь mirror'им его в обратном направлении с case-insensitive lookup.
"""
from __future__ import annotations

from typing import Optional

# Lift forward mapping from the parity tool — single source of truth.
from tools.ps3838_api_parity import SPORT_ID_TO_RUNTIME_NAME

# Case-insensitive reverse map. Soccer → 29 etc.
_SPORT_NAME_TO_ID: dict[str, int] = {
    name.lower(): sport_id for sport_id, name in SPORT_ID_TO_RUNTIME_NAME.items()
}


def sport_id_from_name(name: Optional[str]) -> Optional[int]:
    """Resolve numeric sport_id by SportName string; None when unknown / empty."""
    if not isinstance(name, str):
        return None
    key = name.strip().lower()
    if not key:
        return None
    return _SPORT_NAME_TO_ID.get(key)


__all__ = ["sport_id_from_name", "SPORT_ID_TO_RUNTIME_NAME"]
