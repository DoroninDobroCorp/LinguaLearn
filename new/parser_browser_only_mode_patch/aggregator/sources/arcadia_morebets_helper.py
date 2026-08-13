"""Arcadia Guest API — L3 MoreBets helper (Story 27.16 AC-1, AC-2, AC-5).

Provides direct per-pid access to Arcadia's MoreBets specials coverage
(~21k soccer specials-only events). Used as an **L3 supplement** when the
primary pin888 WS / Partner API streams do not have MoreBets data for a
given pid.

Key design decisions:
- NOT wired into IngestRouter — Arcadia events bypass the ingest pipeline
  entirely. Callers receive a raw dict (canonical MoreBets shape) or None.
- Cache per pid, TTL=30s (half of Arcadia's observed 60s CDN TTL).
- Shared rate budget: ≤30 RPM (conservative; measured ceiling is ~60 RPM).
- Gated by ``MSP_ARCADIA_L3_HELPER_ENABLED`` (default off).
- All counters exposed via :meth:`stats` → monitoring.py.
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request
from collections import deque
from typing import Any

# Arcadia API key — required for withSpecials=true queries.
# Story 27.17 probe confirmed: without X-API-Key → 401.
DEFAULT_ARCADIA_BASE_URL = "https://guest.api.arcadia.pinnacle.com/0.1"
DEFAULT_ARCADIA_API_KEY = os.environ.get("ARCADIA_API_KEY", "")

_CACHE_TTL_SEC = 30.0
_RATE_LIMIT_RPM = 30
_RATE_WINDOW_SEC = 60.0
_REQUEST_TIMEOUT_SEC = 5.0


def arcadia_l3_helper_enabled() -> bool:
    """Return True when MSP_ARCADIA_L3_HELPER_ENABLED is set to a truthy value.

    Reads from ``os.environ`` on every call so that runtime changes
    (e.g. via a SIGHUP config reload) take effect without a process restart.
    """
    raw = (os.environ.get("MSP_ARCADIA_L3_HELPER_ENABLED") or "").strip()
    return raw in ("1", "true", "True", "yes")


class _RpmBudget:
    """Sliding-window RPM tracker (reuse pattern from pinnacle_api_source)."""

    def __init__(self, *, rpm_limit: int) -> None:
        self._limit = int(rpm_limit)
        self._timestamps: deque[float] = deque()

    def _evict(self, now: float) -> None:
        cutoff = now - _RATE_WINDOW_SEC
        while self._timestamps and self._timestamps[0] < cutoff:
            self._timestamps.popleft()

    def try_acquire(self) -> bool:
        now = time.monotonic()
        self._evict(now)
        if len(self._timestamps) >= self._limit:
            return False
        self._timestamps.append(now)
        return True

    def current_rpm(self) -> int:
        now = time.monotonic()
        self._evict(now)
        return len(self._timestamps)


class ArcadiaMoreBetsHelper:
    """Fetch MoreBets data for a single pid from the Arcadia Guest API.

    Parameters
    ----------
    base_url : str
        Arcadia API base URL (default: guest.api.arcadia.pinnacle.com/0.1).
    api_key : str
        X-API-Key header value. Required for specials (withSpecials=true).
    rpm_limit : int
        Aggregate rate budget (requests per minute). Default 30.
    cache_ttl_sec : float
        Per-pid cache TTL in seconds. Default 30.0.
    """

    def __init__(
        self,
        *,
        base_url: str = DEFAULT_ARCADIA_BASE_URL,
        api_key: str = DEFAULT_ARCADIA_API_KEY,
        rpm_limit: int = _RATE_LIMIT_RPM,
        cache_ttl_sec: float = _CACHE_TTL_SEC,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._rpm_limit = int(rpm_limit)
        self._cache_ttl_sec = float(cache_ttl_sec)

        self._lock = threading.Lock()
        self._cache: dict[int, tuple[float, dict[str, Any] | None]] = {}
        self._budget = _RpmBudget(rpm_limit=self._rpm_limit)

        # Counters (DOD-3).
        self.calls_total: int = 0
        self.hits: int = 0       # cache hits
        self.misses: int = 0     # cache misses → network fetch
        self.rate_limited: int = 0
        self.errors: int = 0

    # ── public API ────────────────────────────────────────────────────

    def fetch_morebet(self, pid: int) -> dict[str, Any] | None:
        """Return MoreBets data for *pid* or ``None`` on miss/error.

        Cache hit: returns cached dict if < TTL old (no network call).
        Rate-limit: returns None when budget is exhausted.
        Network error: increments error counter; returns None.
        """
        with self._lock:
            self.calls_total += 1
            cached_ts, cached_val = self._cache.get(pid, (0.0, None))
            now = time.monotonic()
            if now - cached_ts < self._cache_ttl_sec:
                self.hits += 1
                return cached_val

            # Need a fresh fetch — check budget first.
            if not self._budget.try_acquire():
                self.rate_limited += 1
                return cached_val  # Return stale cache if available.
            self.misses += 1

        # Network fetch outside the lock to avoid blocking other threads.
        result = self._fetch_from_arcadia(pid)

        with self._lock:
            self._cache[pid] = (time.monotonic(), result)
        return result

    def stats(self) -> dict[str, Any]:
        """Return counter snapshot for monitoring (DOD-3)."""
        with self._lock:
            return {
                "arcadia_l3_calls_total": self.calls_total,
                "arcadia_l3_hits": self.hits,
                "arcadia_l3_misses": self.misses,
                "arcadia_l3_rate_limited": self.rate_limited,
                "arcadia_l3_errors": self.errors,
                "arcadia_l3_current_rpm": self._budget.current_rpm(),
                "arcadia_l3_cache_size": len(self._cache),
            }

    def clear_cache(self) -> None:
        with self._lock:
            self._cache.clear()

    # ── internals ────────────────────────────────────────────────────

    def _fetch_from_arcadia(self, pid: int) -> dict[str, Any] | None:
        """Fetch `/matchups/<pid>/related` and parse into canonical shape."""
        url = f"{self._base_url}/matchups/{pid}/related"
        headers: dict[str, str] = {
            "User-Agent": "pin888-arcadia-l3/27.16",
            "Accept": "application/json",
        }
        if self._api_key:
            headers["X-API-Key"] = self._api_key

        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=_REQUEST_TIMEOUT_SEC) as resp:  # noqa: S310
                raw = json.loads(resp.read())
        except (urllib.error.URLError, urllib.error.HTTPError, OSError, ValueError):
            with self._lock:
                self.errors += 1
            return None
        except Exception:  # noqa: BLE001
            with self._lock:
                self.errors += 1
            return None

        return self._parse_related(pid, raw)

    def _parse_related(
        self, pid: int, raw: Any
    ) -> dict[str, Any] | None:
        """Extract the MoreBets markets from the /related response.

        Returns a canonical dict or None if the response carries no
        usable MoreBets markets. Shape mirrors our internal MoreBets
        structure so downstream callers need no special-casing.
        """
        if not isinstance(raw, (list, dict)):
            return None
        events: list[Any] = raw if isinstance(raw, list) else raw.get("matchups") or []
        if not events:
            return None

        # Find the specials/related events — these are the MoreBets carriers.
        specials: list[dict[str, Any]] = []
        for ev in events:
            if not isinstance(ev, dict):
                continue
            if ev.get("id") != pid:
                specials.append(ev)

        if not specials:
            return None

        return {
            "pid": pid,
            "source": "arcadia_l3",
            "specials": specials,
            "fetched_at": time.time(),
        }


__all__ = [
    "ArcadiaMoreBetsHelper",
    "arcadia_l3_helper_enabled",
]
