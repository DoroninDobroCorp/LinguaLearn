"""Platform monitoring / observability hooks (Phase 8, TZ §9).

``PlatformMonitor`` aggregates health and telemetry from every
aggregator component into a single ``snapshot()`` dict suitable for
dashboards, alerting, and the ``/monitoring`` endpoint on the v2
feed server.

Flag: reuses ``MSP_V2_FEED_ENABLED``. Import-time inert; no I/O.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import time
from typing import Any, Optional


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class PlatformMonitor:
    """Collect metrics from all platform components.

    All dependencies are optional — pass ``None`` for components not
    yet active. The snapshot will include a sensible default for each
    missing component.

    Parameters
    ----------
    system_mode_monitor : SystemModeMonitor (or None)
    account_pool : AccountPool (or None)
    provenance_store : ProvenanceStore (or None)
    decision_engine : DecisionEngineV2 (or None)
    failover_orchestrator : FailoverOrchestrator (or None)
    feed_server : FeedServer (or None)
    source_health_registry : SourceHealthRegistry (or None)
    cross_source_matcher : CrossSourceMatcher (or None)
    """

    system_mode_monitor: Any = None
    account_pool: Any = None
    provenance_store: Any = None
    decision_engine: Any = None
    failover_orchestrator: Any = None
    feed_server: Any = None
    source_health_registry: Any = None
    cross_source_matcher: Any = None
    morebets_dispatcher: Any = None
    # Story 27.16: Arcadia L3 helper — exposes arcadia_l3_* counters.
    arcadia_l3_helper: Any = None
    # Story 27.3.C: per-source adapter refs expose their `degraded`
    # flag independently — AC-4/AC-5 require that PS3838 down does
    # not imply api_degraded and vice versa.
    pinnacle_api_source: Any = None
    pin888_bridge: Any = None
    # Story 27.4.E — L2/tabs surface references.
    tabs_controller: Any = None
    coverage_diff_cache: Any = None
    # Story 27.4.E — IngestRouter ref to expose WS filter counters.
    ingest_router: Any = None
    # BIA observer is started by aggregator.main when BIA_ENABLED=1.  It stays
    # isolated from core publish decisions, but operators need its lifecycle in
    # the same /monitoring surface as the central feed.
    bia_snapshot_provider: Any = None
    _start_time: datetime = field(default_factory=_utc_now)
    # Track published quotes for stale_rate calculation.
    _publish_count: int = 0
    _degraded_count: int = 0
    _source_publish_counts: dict[str, int] = field(default_factory=dict)
    _consumer_count: int = 0
    _last_delta_ts: Optional[datetime] = None

    def record_publish(self, *, degraded: bool = False, source: str = "") -> None:
        """Called on each published quote for stale/source tracking."""
        self._publish_count += 1
        if degraded:
            self._degraded_count += 1
        if source:
            self._source_publish_counts[source] = (
                self._source_publish_counts.get(source, 0) + 1
            )

    def record_consumer_delivery(self, *, consumer_count: int, ts: Optional[datetime] = None) -> None:
        """Update consumer delivery metrics."""
        self._consumer_count = consumer_count
        self._last_delta_ts = ts or _utc_now()

    def snapshot(self, *, now: Optional[datetime] = None) -> dict[str, Any]:
        """Full monitoring snapshot — JSON-serialisable."""
        now = now or _utc_now()
        source_coverage = self._get_source_coverage(now=now)
        out: dict[str, Any] = {
            "system_mode": self._get_system_mode(now),
            "api_health": self._get_api_health(now),
            "per_account_health": self._get_per_account_health(),
            "source_coverage": source_coverage,
            # Story 27.12 DOD-4 — flat alias for alerting pipelines
            # that can't traverse nested maps.
            "per_source_max_age_sec": self._get_per_source_max_age_sec(source_coverage),
            "publish_source_distribution": dict(self._source_publish_counts),
            "match_stats": self._get_match_stats(),
            "stale_rate": self._compute_stale_rate(),
            "failover_log_tail": self._get_failover_log_tail(),
            "consumer_delivery": {
                "connected_consumers": self._consumer_count,
                "last_delta_ts": (
                    self._last_delta_ts.isoformat() if self._last_delta_ts else None
                ),
            },
            "uptime": (now - self._start_time).total_seconds(),
            # Story 27.3.C / AC-4 / AC-5: per-source degraded flags.
            "pinnacle_api_degraded": self._is_pinnacle_api_degraded(),
            "pinnacle_api_rate_limited": self._is_pinnacle_api_rate_limited(),
            "pin888_ws_degraded": self._is_pin888_ws_degraded(),
            # Story 27.3.E / AC-6: enabled + stats block.
            "pinnacle_api_enabled": self._is_pinnacle_api_enabled(),
            "pinnacle_api_stats": self._get_pinnacle_api_stats(),
            "morebets_dispatcher_enabled": self.morebets_dispatcher is not None,
            "morebets_dispatcher_stats": self._get_morebets_dispatcher_stats(),
            # Story 27.16 DOD-3: Arcadia L3 helper counters.
            "arcadia_l3_helper_enabled": self.arcadia_l3_helper is not None,
            "arcadia_l3_stats": self._get_arcadia_l3_stats(),
            # AC-6 / DOD-10 — top-level /health freshness & coverage
            # fields. Also present inside pinnacle_api_stats; aliased
            # here so existing /health consumers can read them without
            # descending into the stats sub-dict.
            "pinnacle_api_last_poll_age_sec": self._get_pinnacle_api_last_poll_age_sec(),
            "pinnacle_api_coverage_events_count": self._get_pinnacle_api_coverage_events_count(),
            "bia": self._get_bia_snapshot(),
        }
        # Story 27.4.E — L2/tabs/coverage surface (AC-3, AC-5, AC-7, AC-9).
        out.update(self._get_tabs_snapshot())
        # coverage_diff_cache (if wired) takes precedence over the adapter
        # because the cache represents aggregated live-state; the
        # adapter's property only sees its own source.
        if self.coverage_diff_cache is not None:
            out["pinnacle_api_coverage_events_count"] = (
                self._get_api_coverage_events_count()
            )
        out["ps3838_ws_complement_events_count"] = self._get_ws_complement_events_count()
        out["ps3838_ws_degraded"] = self._is_ws_degraded()
        out["pin888_ws_session_rotating"] = self._is_ws_session_rotating()
        out["core_coverage_gaps_count"] = self._get_core_coverage_gaps_count()
        # DOD-2 — stale-diff admission counter (helps operators tune
        # CoverageDiffCache.ttl_sec; see docs/L2_WS_TABS_COMPLEMENT.md §1).
        out["ps3838_ws_events_admitted_during_stale_diff_total"] = (
            self._get_stale_diff_admits()
        )
        # Story 27.13 AC-6 — pin888 WS gap counters for alerting.
        out["pin888_ws_gaps_total"] = self._get_pin888_ws_gaps_total()
        out["pin888_ws_gap_max_sec"] = self._get_pin888_ws_gap_max_sec()
        out["pin888_ws_last_event_age_sec"] = self._get_pin888_ws_last_event_age_sec()
        return out

    # ── Story 27.3.C degraded flags — read from adapter references ────

    def _get_bia_snapshot(self) -> dict[str, Any]:
        """Return BIA observer status without letting observer errors break monitoring."""
        if self.bia_snapshot_provider is None:
            return {
                "enabled": False,
                "running": False,
                "phase": "disabled",
                "state": "disabled",
                "connected": False,
            }
        try:
            raw = self.bia_snapshot_provider(now=time.time())
        except TypeError:
            try:
                raw = self.bia_snapshot_provider()
            except Exception:  # noqa: BLE001
                return {
                    "enabled": True,
                    "running": False,
                    "phase": "unknown",
                    "state": "error",
                    "connected": False,
                }
        except Exception:  # noqa: BLE001
            return {
                "enabled": True,
                "running": False,
                "phase": "unknown",
                "state": "error",
                "connected": False,
            }
        return raw if isinstance(raw, dict) else {
            "enabled": True,
            "running": False,
            "phase": "unknown",
            "state": "invalid_snapshot",
            "connected": False,
        }

    def _is_pinnacle_api_degraded(self) -> bool:
        if self.pinnacle_api_source is None:
            return False
        try:
            return bool(self.pinnacle_api_source.degraded)
        except Exception:  # noqa: BLE001 — defensive snapshot
            return False

    def _is_pinnacle_api_rate_limited(self) -> bool:
        if self.pinnacle_api_source is None:
            return False
        try:
            return bool(self.pinnacle_api_source.rate_limited)
        except Exception:  # noqa: BLE001
            return False

    def _is_pin888_ws_degraded(self) -> bool:
        if self.pin888_bridge is None:
            return False
        # Legacy source exposes state via a few possible attribute
        # names — be tolerant so this monitor can adapt to whatever
        # story 27.4 names the flag as.
        for attr in ("degraded", "is_degraded", "permanent_failure"):
            try:
                value = getattr(self.pin888_bridge, attr, None)
                if value is not None:
                    return bool(value)
            except Exception:  # noqa: BLE001
                continue
        return False

    # ── Story 27.13 pin888 WS gap surface ─────────────────────────────

    def _get_pin888_bridge_stats(self) -> dict[str, Any]:
        """Read .stats() from wired bridge, swallow any errors.

        The same field may hold a Pin888WsBridge (Story 27.13) or
        a different source adapter (ставится в 27.4). Only
        Pin888WsBridge exposes the new keys.
        """
        if self.pin888_bridge is None:
            return {}
        stats_fn = getattr(self.pin888_bridge, "stats", None)
        if stats_fn is None:
            return {}
        try:
            raw = stats_fn()
        except Exception:  # noqa: BLE001
            return {}
        return raw if isinstance(raw, dict) else {}

    def _get_pin888_ws_gaps_total(self) -> int:
        return int(self._get_pin888_bridge_stats().get("gaps_total", 0) or 0)

    def _get_pin888_ws_gap_max_sec(self) -> float:
        try:
            return float(self._get_pin888_bridge_stats().get("gap_max_sec", 0.0) or 0.0)
        except (TypeError, ValueError):
            return 0.0

    def _get_pin888_ws_last_event_age_sec(self) -> Optional[float]:
        raw = self._get_pin888_bridge_stats().get("last_event_mono_sec")
        if raw is None:
            return None
        try:
            return float(raw)
        except (TypeError, ValueError):
            return None

    # ── Story 27.3.E observability surface (AC-6) ─────────────────────

    def _is_pinnacle_api_enabled(self) -> bool:
        """Adapter presence is the monitor's signal for ``enabled``."""
        return self.pinnacle_api_source is not None

    def _get_morebets_dispatcher_stats(self) -> dict[str, Any]:
        if self.morebets_dispatcher is None:
            return {}
        stats_fn = getattr(self.morebets_dispatcher, "stats", None)
        if stats_fn is None:
            return {}
        try:
            stats = stats_fn()
        except Exception:  # noqa: BLE001
            return {}
        return stats if isinstance(stats, dict) else {}

    def _get_arcadia_l3_stats(self) -> dict[str, Any]:
        """Story 27.16 DOD-3: expose Arcadia L3 helper counters."""
        if self.arcadia_l3_helper is None:
            return {
                "arcadia_l3_calls_total": 0,
                "arcadia_l3_hits": 0,
                "arcadia_l3_misses": 0,
                "arcadia_l3_rate_limited": 0,
                "arcadia_l3_errors": 0,
                "arcadia_l3_current_rpm": 0,
                "arcadia_l3_cache_size": 0,
            }
        stats_fn = getattr(self.arcadia_l3_helper, "stats", None)
        if stats_fn is None:
            return {}
        try:
            stats = stats_fn()
        except Exception:  # noqa: BLE001
            return {}
        return stats if isinstance(stats, dict) else {}

    def _get_pinnacle_api_last_poll_age_sec(self) -> float | None:
        """AC-6 top-level /health field: seconds since last Partner API
        poll started, or ``None`` if no adapter / no poll yet."""
        if self.pinnacle_api_source is None:
            return None
        try:
            val = self.pinnacle_api_source.last_poll_age_sec
            if val is None:
                return None
            return float(val)
        except Exception:  # noqa: BLE001
            return None

    def _get_pinnacle_api_coverage_events_count(self) -> int:
        """AC-6 top-level /health field: distinct Partner API event count."""
        if self.pinnacle_api_source is None:
            return 0
        try:
            return int(self.pinnacle_api_source.coverage_events_count)
        except Exception:  # noqa: BLE001
            return 0

    def _get_pinnacle_api_stats(self) -> dict[str, Any]:
        """Forward the adapter's ``stats()`` output verbatim, plus bolt
        on the router-scoped ``duplicate_updates_total`` field.

        Callers without an adapter get zeros — consistent shape lets
        dashboards assume all keys exist.
        """
        empty_errors: dict[str, int] = {
            k: 0 for k in ("auth", "rate_limit", "server", "transport")
        }
        empty: dict[str, Any] = {
            "polls_total": 0,
            "errors_by_class": empty_errors,
            "latency_p50_ms": 0.0,
            "latency_p95_ms": 0.0,
            "latency_p99_ms": 0.0,
            "duplicate_updates_total": 0,
            "published_quotes_total": 0,
            "coverage_events_count": 0,
            "last_poll_age_sec": None,
            # Story 27.20.1 AC-6: transport-level metrics from the API client.
            "sessions_refreshed_total": 0,
            "per_call_timeouts_total": 0,
            "per_call_latency_buckets": {"≤1s": 0, "1-5s": 0, "5-15s": 0, ">15s": 0},
        }
        if self.pinnacle_api_source is None:
            return empty
        try:
            raw = self.pinnacle_api_source.stats()
        except Exception:  # noqa: BLE001 — snapshot must not raise
            return empty
        # Copy the required keys; any missing ones fall back to 0.
        out = dict(empty)
        for key in (
            "polls_total",
            "errors_by_class",
            "latency_p50_ms",
            "latency_p95_ms",
            "latency_p99_ms",
            "published_quotes_total",
            "coverage_events_count",
            "last_poll_age_sec",
            # Story 27.20 AC-2 — per-class observability.
            "per_class_polls",
            "per_class_latency_p50_ms",
            "per_class_latency_p95_ms",
            # Story 27.20.1 AC-6 — transport-level metrics.
            "sessions_refreshed_total",
            "per_call_timeouts_total",
            "per_call_latency_buckets",
        ):
            if key in raw:
                out[key] = raw[key]
        # AC-6 cross-cutting: dedup counter lives on the router, not
        # the adapter. Read it from the provenance store's router if we
        # have a reference; otherwise stay at 0.
        router = getattr(self.provenance_store, "_router", None)
        if router is None:
            # Tolerate adapters that expose `_router_dedup` hook
            # (convention for 27.3.E wiring).
            pass
        try:
            # Indirect path: adapter may carry a router reference via
            # .router attribute (see PinnacleApiSourceAdapter).
            adapter_router = getattr(self.pinnacle_api_source, "router", None)
            if adapter_router is not None:
                getter = getattr(
                    adapter_router, "duplicate_updates_total_by_source", None
                )
                if callable(getter):
                    counts = getter()
                    out["duplicate_updates_total"] = int(
                        counts.get("pinnacle_api", 0)
                    )
        except Exception:  # noqa: BLE001
            pass
        return out

    # ── internal helpers ──────────────────────────────────────────────

    def _get_system_mode(self, now: datetime) -> str:
        if self.system_mode_monitor is None:
            return "unknown"
        try:
            mode = self.system_mode_monitor.compute_mode(now=now)
            return str(mode.value)
        except Exception:  # noqa: BLE001
            return "error"

    def _get_api_health(self, now: datetime) -> dict[str, Any]:
        if self.source_health_registry is None:
            return {"status": "unknown", "last_check": None, "error_count": 0}
        try:
            # Check for any official API source.
            source_ids = self.source_health_registry.known_source_ids()
            api_sources = [s for s in source_ids if "api" in s.lower()]
            if not api_sources:
                return {"status": "no_api_source", "last_check": None, "error_count": 0}
            # Use the first API source as representative.
            h = self.source_health_registry.get(api_sources[0])
            if h is None:
                return {"status": "unknown", "last_check": None, "error_count": 0}
            # API source polls every ~10s per sport × N sports — use a
            # generous freshness window (2 full cycles) instead of the
            # default 6s designed for sub-second WS pushes.
            _API_HEALTHY_AGE_SEC = 120.0
            status = "up" if h.is_fresh(now=now, healthy_age_sec=_API_HEALTHY_AGE_SEC) else "down"
            return {
                "status": status,
                "last_check": h.last_event_at.isoformat() if h.last_event_at else None,
                "error_count": h.consecutive_failures,
            }
        except Exception:  # noqa: BLE001
            return {"status": "error", "last_check": None, "error_count": 0}

    def _get_per_account_health(self) -> dict[str, Any]:
        if self.account_pool is None:
            return {}
        try:
            result: dict[str, Any] = {}
            for acc in self.account_pool.all_accounts():
                result[acc.account_id] = {
                    "state": acc.state.value,
                    "transport": acc.current_transport,
                    "last_401": acc.last_401_at.isoformat() if acc.last_401_at else None,
                    "last_429": acc.last_429_at.isoformat() if acc.last_429_at else None,
                    "more_bets_used": acc.more_bets_budget.used(),
                }
            return result
        except Exception:  # noqa: BLE001
            return {}

    def _get_source_coverage(self, *, now: Optional[datetime] = None) -> dict[str, Any]:
        """Per-source coverage snapshot with age telemetry (Story 27.12 AC-3).

        ``max_age_sec`` and ``p50_age_sec`` both read ``last_event_at`` from
        ``SourceHealth``. Since the registry tracks only the most recent
        event per source (not a distribution), ``p50_age_sec == max_age_sec``
        today — the two keys are kept as separate outputs to give operators
        one stable schema if we later switch to a per-event age sample
        (e.g. sliding window of last N events).
        """
        if self.source_health_registry is None:
            return {}
        try:
            result: dict[str, Any] = {}
            now_ts = now if now is not None else _utc_now()
            for sid in self.source_health_registry.known_source_ids():
                h = self.source_health_registry.get(sid)
                if h is None:
                    continue
                age_sec: Optional[float]
                if h.last_event_at is None:
                    age_sec = None
                else:
                    age_sec = max(0.0, (now_ts - h.last_event_at).total_seconds())
                result[sid] = {
                    "event_count": h.total_events,
                    "max_age_sec": age_sec,
                    "p50_age_sec": age_sec,
                }
            return result
        except Exception:  # noqa: BLE001
            return {}

    def _get_per_source_max_age_sec(self, coverage: dict[str, Any]) -> dict[str, float]:
        """Top-level alias for easier alerting (Story 27.12 DOD-4).

        Flattens ``source_coverage[src].max_age_sec`` into a flat
        ``{source_id: age_sec}`` map. Sources with ``max_age_sec=None``
        are excluded so alerts trigger only on real stale signals, not
        on freshly-registered-never-fired sources.
        """
        out: dict[str, float] = {}
        for sid, entry in coverage.items():
            age = entry.get("max_age_sec")
            if age is not None:
                out[sid] = float(age)
        return out

    def _get_match_stats(self) -> dict[str, int]:
        if self.cross_source_matcher is None:
            return {"matched": 0, "unmatched": 0, "collision": 0}
        try:
            stats = self.cross_source_matcher.stats
            return {
                "matched": stats.matched,
                "unmatched": stats.unmatched_missing_field,
                "collision": stats.unmatched_outside_window,
            }
        except Exception:  # noqa: BLE001
            return {"matched": 0, "unmatched": 0, "collision": 0}

    def _compute_stale_rate(self) -> float:
        if self._publish_count == 0:
            return 0.0
        return self._degraded_count / self._publish_count

    def _get_failover_log_tail(self, n: int = 20) -> list[dict[str, Any]]:
        if self.failover_orchestrator is None:
            return []
        try:
            log = self.failover_orchestrator.log
            tail = log[-n:] if len(log) > n else log
            return [
                {
                    "timestamp": e.timestamp.isoformat(),
                    "account_id": e.account_id,
                    "old_transport": e.old_transport,
                    "new_transport": e.new_transport,
                    "trigger": e.trigger,
                    "direction": e.direction,
                }
                for e in tail
            ]
        except Exception:  # noqa: BLE001
            return []

    # ── Story 27.4.E — L2 / tabs / coverage surface ──────────────────

    def _get_tabs_snapshot(self) -> dict[str, Any]:
        """DOD-12 /health fields for tabs fallback."""
        if self.tabs_controller is None:
            return {
                "tabs_fallback_allowed": False,
                "tabs_fallback_active": False,
                "tabs_fallback_reason": "off",
                "tabs_fallback_state": "off",
            }
        try:
            # The controller needs the current flag value to stamp
            # `tabs_fallback_allowed`; we import lazily to avoid a
            # cycle with tabs_controller at module init.
            from aggregator.tabs_controller import tabs_fallback_allowed

            return dict(self.tabs_controller.snapshot(allowed=tabs_fallback_allowed()))
        except Exception:  # noqa: BLE001
            return {
                "tabs_fallback_allowed": False,
                "tabs_fallback_active": False,
                "tabs_fallback_reason": "off",
                "tabs_fallback_state": "error",
            }

    def _get_api_coverage_events_count(self) -> int:
        if self.coverage_diff_cache is None:
            return 0
        try:
            return int(self.coverage_diff_cache.total_api_events())
        except Exception:  # noqa: BLE001
            return 0

    def _get_ws_complement_events_count(self) -> int:
        if self.coverage_diff_cache is None:
            return 0
        try:
            return int(self.coverage_diff_cache.total_ws_complement_events())
        except Exception:  # noqa: BLE001
            return 0

    def _is_ws_degraded(self) -> bool:
        """AC-3 — PS3838 WS degraded flag independent of API state."""
        if self.pin888_bridge is None:
            return False
        for attr in ("degraded", "is_degraded", "circuit_open"):
            try:
                value = getattr(self.pin888_bridge, attr, None)
                if value is not None:
                    return bool(value)
            except Exception:  # noqa: BLE001
                continue
        return False

    def _is_ws_session_rotating(self) -> bool:
        """AC-7 — expose the ``session_rotating`` signal for dashboards."""
        if self.pin888_bridge is None:
            return False
        try:
            value = getattr(self.pin888_bridge, "session_rotating", None)
            if value is None:
                return False
            return bool(value)
        except Exception:  # noqa: BLE001
            return False

    def _get_stale_diff_admits(self) -> int:
        """DOD-2 — surface IngestRouter.ws_events_admitted_during_stale_diff_total."""
        if self.ingest_router is None:
            return 0
        try:
            return int(self.ingest_router.ws_events_admitted_during_stale_diff_total())
        except Exception:  # noqa: BLE001
            return 0

    def _get_core_coverage_gaps_count(self) -> int:
        """AC-9 — count events visible via discovery but with no live source.

        A gap = a pid known to the aggregator (via any source's discovery
        channel) that does not have a fresh candidate in any of the
        accepted core-publisher sources. We don't track the full set
        here yet; this method returns 0 until discovery wiring lands.
        """
        # Deferred wiring: without a cross-source matcher exposing
        # "known pids - published pids", we can only guess. Safe default
        # is 0 so dashboards don't alarm. A future wire-in can replace
        # this with a real computation.
        return 0


__all__ = [
    "PlatformMonitor",
]
