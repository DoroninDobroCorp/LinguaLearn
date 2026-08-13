#!/usr/bin/env python3
from __future__ import annotations
import json
import logging
import threading
from collections.abc import Hashable
from typing import Any

log = logging.getLogger(__name__)
__all__ = ["BiaPriceTracker", "get_shared_tracker"]

# Shared singleton (AC-1, 27.46)
_SHARED: BiaPriceTracker | None = None
_SHARED_LOCK: threading.Lock = threading.Lock()


class BiaPriceTracker:
    def __init__(self, *, fresh_sec: float = 30.0, min_delta: float = 0.0) -> None:
        self._fresh_sec = fresh_sec
        self._min_delta = min_delta
        self._last: dict[tuple[Hashable, str], str] = {}
        self._hot_until: dict[Hashable, float] = {}
        self._lock: threading.Lock = threading.Lock()

    def observe(self, event_key: Hashable, markets: dict[str, Any], now: float) -> bool:
        changed = False
        with self._lock:
            for market_key, market_value in markets.items():
                serialized = json.dumps(market_value, sort_keys=True, default=str)
                cache_key: tuple[Hashable, str] = (event_key, market_key)
                prev = self._last.get(cache_key)
                if prev is None:
                    self._last[cache_key] = serialized
                    continue
                if prev == serialized:
                    continue
                if self._min_delta > 0.0:
                    try:
                        prev_obj = json.loads(prev)
                        if isinstance(prev_obj, (int, float)) and isinstance(
                            market_value, (int, float)
                        ):
                            delta = abs(float(market_value) - float(prev_obj))
                            if delta < self._min_delta:
                                self._last[cache_key] = serialized
                                continue
                    except (ValueError, TypeError, json.JSONDecodeError):
                        pass
                self._last[cache_key] = serialized
                changed = True
            if changed:
                self._hot_until[event_key] = now + self._fresh_sec
                log.debug(
                    "bia_price_tracker: event %r hot until %.1f",
                    event_key,
                    now + self._fresh_sec,
                )
        return changed

    def hot_events(self, now: float) -> list[Hashable]:
        with self._lock:
            expired = [k for k, until in self._hot_until.items() if until <= now]
            for k in expired:
                del self._hot_until[k]
                stale = [ck for ck in self._last if ck[0] == k]
                for ck in stale:
                    del self._last[ck]
                log.debug(
                    "bia_price_tracker: event %r expired, purged %d _last keys",
                    k,
                    len(stale),
                )
            return list(self._hot_until)


def get_shared_tracker(
    *,
    fresh_sec: float | None = None,
    min_delta: float | None = None,
) -> BiaPriceTracker:
    """Return the module-level shared BiaPriceTracker singleton (27.46)."""
    global _SHARED
    if _SHARED is not None:
        return _SHARED
    with _SHARED_LOCK:
        if _SHARED is not None:
            return _SHARED
        import config as _config
        _fs = fresh_sec if fresh_sec is not None else _config.BIA_PRICE_FRESH_SEC
        _md = min_delta if min_delta is not None else _config.BIA_PRICE_MIN_DELTA
        _SHARED = BiaPriceTracker(fresh_sec=_fs, min_delta=_md)
    return _SHARED


def _reset_shared_tracker() -> None:
    """Reset the shared singleton.  Intended for tests only."""
    global _SHARED
    with _SHARED_LOCK:
        _SHARED = None
