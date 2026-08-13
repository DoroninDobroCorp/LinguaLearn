"""Decision engine for the multi-source aggregator.

Two engines live here:

- **DecisionEngine (v1)** — the Phase 1 single-source pass-through
  policy. Always available; default behavior.
- **DecisionEngineV2** — Phase 3 per-data-class authority engine
  encoding TZ §4-§6. Off by default; opt in with
  ``MSP_DECISION_V2_ENABLED=1``.

The v1 → v2 cut-over is *behind a flag* so v2 can shadow-run before
becoming the production publisher. Use ``build_default_engine()`` to
get whichever engine the env requests.

Per-data-class authority policy (encoded by v2)
-----------------------------------------------

Authority tiers (numeric, see ``SourceProfile.authority_class``):

    OFFICIAL_API (100) > BROWSER_WS (90) > TAB_MODE (60) > BIA_SUPPLEMENT (30)

For ``BASE_EVENT`` / ``BASE_MARKET`` / ``MORE_BETS_SPECIAL``, the
per-mode minimum acceptable tier (anything below = degraded) is:

    NORMAL                  → OFFICIAL_API or BROWSER_WS
    API_DEGRADED            → BROWSER_WS (API absent)
    POOL_DEGRADED           → OFFICIAL_API (browser pool absent)
    BIA_ASSISTED_DEGRADED   → BIA may serve MoreBets only; core emits nothing
    HARD_DEGRADED / STOPPED → emit nothing (decide returns None)

Within an acceptable set, the winner is picked by
``(authority_class desc, freshness asc, confidence desc)``. Tombstones
from any pinnacle-native source short-circuit and win immediately so
the LIFECYCLE class cannot be "outvoted" by a stale live quote.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Optional

from aggregator.data_class import DataClass, classify_payload
from aggregator.decision_reasons import DecisionReason, with_class
from aggregator.outcome_extract import extract_outcomes
from aggregator.sources.profile import (
    DEFAULT_REGISTRY,
    AuthorityClass,
    SourceProfileRegistry,
)
from aggregator.state_machine import SystemMode
from aggregator.types import (
    CandidateQuote,
    PublishedOutcome,
    PublishedQuote,
    PublishedQuoteCandidate,
    SystemState,
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def decision_v2_enabled() -> bool:
    """Whether the v2 per-data-class engine is opted in via env."""
    return os.environ.get("MSP_DECISION_V2_ENABLED", "").strip() in (
        "1",
        "true",
        "True",
        "yes",
    )


def outcome_granular_enabled() -> bool:
    """Whether the engine should also emit ``PublishedOutcome``s.

    Default OFF — when off, ``PublishedQuote.outcomes`` stays an empty
    list and the engine path is byte-identical to Phase 3.
    """
    return os.environ.get("MSP_OUTCOME_GRANULAR_ENABLED", "").strip() in (
        "1",
        "true",
        "True",
        "yes",
    )


# Story 27.4.C — BIA exclusion constants.
#
# Families the aggregator labels as BIA. Both "bia" (canonical) and
# "bia_supplement" (legacy/Phase-3 alias) are rejected from the core
# candidate list. MoreBets paths (Story 27.5/27.6) set
# ``market_class="more_bets"`` which bypasses the filter.
_BIA_FAMILIES: frozenset[str] = frozenset({"bia", "bia_supplement"})
BIA_NOT_ALLOWED_IN_CORE_REJECTED_REASON: str = "bia_not_allowed_in_core"


def _is_bia_candidate(cand: CandidateQuote) -> bool:
    """Recognise BIA by family *or* source-id namespace.

    The redundant source-id check prevents a malformed adapter from bypassing
    core isolation merely by attaching the wrong ``family`` label.
    """
    source_head = str(cand.source_id or "").split(":", 1)[0].strip().lower()
    return cand.family in _BIA_FAMILIES or source_head == "bia"


class DecisionEngine:
    """Phase 1 single-source pass-through engine.

    The engine is stateless; it exists as a class so that Phase 5 can
    attach per-class policies and hysteresis state without changing the
    signature.
    """

    def __init__(self, *, default_authority_class: str = "pinnacle_native") -> None:
        self.default_authority_class = default_authority_class

    # Stub for Phase 5
    def register_policy(self, data_class: str, policy: object) -> None:  # pragma: no cover - stub
        raise NotImplementedError("per-data-class policies arrive in Phase 5")

    def decide(
        self,
        candidates: Iterable[CandidateQuote],
        *,
        system_state: SystemState = SystemState.NORMAL,
        exclusive_l1_source_id: str | None = None,
        l1_circuit_open: bool = False,
        market_class: str | None = None,
    ) -> PublishedQuote | None:
        """Pick the publisher for a bucket of candidates.

        Three modes, driven by kwargs:

        * **Legacy single-source pass-through** (default — kwargs
          untouched). Returns the freshest candidate regardless of
          source. Backwards-compat behaviour for tests and Phase-1
          callers that never had more than one source.

        * **Story 27.3.D AC-8 exclusive authority** — ``exclusive_l1_
          source_id`` is set AND ``l1_circuit_open=False``. If a
          candidate from that source is present, it wins unconditionally;
          WS freshness does not override it. Reason:
          ``L1_PARTNER_API_EXCLUSIVE``. If no L1 candidate is present,
          the bucket is an L1-uncovered event → best non-L1 candidate
          wins with reason ``L2_COMPLEMENT``.

        * **Circuit-open fallback** — ``l1_circuit_open=True``. L1
          candidates are ignored; the best non-L1 candidate wins with
          reason ``L1_FALLBACK_TO_L2_WS``. If there is no non-L1
          candidate → return None (better skip than wrong match).

        Tombstones short-circuit all three modes: a tombstone from the
        exclusive L1 source is always published.
        """
        cands = list(candidates)
        if not cands:
            return None

        now = _utc_now()

        # Story 27.4.C AC-6 / DOD-13 — BIA exclusion from core.
        # ``market_class=None`` defaults to the core path; only an
        # explicit ``"more_bets"`` bypasses the filter (reserved for
        # Story 27.5/27.6 downstream logic). Runs BEFORE exclusive-L1
        # logic so BIA is never even a candidate for L2_COMPLEMENT
        # publishing in core.
        is_core = market_class is None or market_class == "core"
        bia_rejected: list[CandidateQuote] = []
        if is_core:
            filtered: list[CandidateQuote] = []
            for c in cands:
                if _is_bia_candidate(c):
                    bia_rejected.append(c)
                else:
                    filtered.append(c)
            cands = filtered
            if not cands:
                return None

        # Tombstone short-circuit for the exclusive L1 source — publish
        # lifecycle regardless of circuit state, otherwise a tombstone
        # from API would be dropped while WS had a stale live candidate.
        if exclusive_l1_source_id is not None:
            for c in cands:
                if c.source_id == exclusive_l1_source_id and c.is_tombstone:
                    losers = [x for x in cands if x is not c]
                    return self._build_published(
                        winner=c,
                        losers=losers,
                        now=now,
                        reason=DecisionReason.TOMBSTONE_FROM_NATIVE_SOURCE.value,
                        system_state=system_state,
                        bia_rejected=bia_rejected,
                    )

        # Exclusive authority / fallback chain (Story 27.3.D).
        if exclusive_l1_source_id is not None:
            l1_cands = [c for c in cands if c.source_id == exclusive_l1_source_id]
            non_l1_cands = [c for c in cands if c.source_id != exclusive_l1_source_id]
            if l1_circuit_open:
                # L1 is degraded — L2 takes over for this bucket.
                if not non_l1_cands:
                    return None
                winner = max(non_l1_cands, key=lambda c: c.collected_at)
                losers = [c for c in cands if c is not winner]
                return self._build_published(
                    winner=winner,
                    losers=losers,
                    now=now,
                    reason=DecisionReason.L1_FALLBACK_TO_L2_WS.value,
                    system_state=system_state,
                    rejected_reason="l1_circuit_open",
                    bia_rejected=bia_rejected,
                )
            if l1_cands:
                # L1 covered event + healthy circuit → exclusive publisher.
                winner = max(l1_cands, key=lambda c: c.collected_at)
                losers = [c for c in cands if c is not winner]
                return self._build_published(
                    winner=winner,
                    losers=losers,
                    now=now,
                    reason=DecisionReason.L1_PARTNER_API_EXCLUSIVE.value,
                    system_state=system_state,
                    rejected_reason="not_publisher_l1_exclusive",
                    bia_rejected=bia_rejected,
                )
            # L1-uncovered event → L2 complement publishes.
            winner = max(non_l1_cands, key=lambda c: c.collected_at)
            losers = [c for c in cands if c is not winner]
            return self._build_published(
                winner=winner,
                losers=losers,
                now=now,
                reason=DecisionReason.L2_COMPLEMENT.value,
                system_state=system_state,
                rejected_reason="not_freshest",
                bia_rejected=bia_rejected,
            )

        # Legacy pass-through.
        winner = max(cands, key=lambda c: c.collected_at)
        losers = [c for c in cands if c is not winner]
        return self._build_published(
            winner=winner,
            losers=losers,
            now=now,
            reason=DecisionReason.SINGLE_SOURCE_PASS_THROUGH.value,
            system_state=system_state,
            bia_rejected=bia_rejected,
        )

    def _build_published(
        self,
        *,
        winner: CandidateQuote,
        losers: list[CandidateQuote],
        now: datetime,
        reason: str,
        system_state: SystemState,
        rejected_reason: str = "not_freshest",
        bia_rejected: list[CandidateQuote] | None = None,
    ) -> PublishedQuote:
        # Build loser audit — BIA rejections show up with the canonical
        # reason so operations can grep for them; non-BIA losers use
        # the rejected_reason kwarg (default "not_freshest").
        audit: list[PublishedQuoteCandidate] = [
            PublishedQuoteCandidate(
                source=cand.source_id,
                age_ms=cand.age_ms(now),
                rejected_reason=rejected_reason,
            )
            for cand in losers
        ]
        for cand in (bia_rejected or []):
            audit.append(
                PublishedQuoteCandidate(
                    source=cand.source_id,
                    age_ms=cand.age_ms(now),
                    rejected_reason=BIA_NOT_ALLOWED_IN_CORE_REJECTED_REASON,
                )
            )
        return PublishedQuote(
            event_id=winner.event_id,
            payload=winner.payload,
            source_used_for_publish=winner.source_id,
            publish_authority_class=self.default_authority_class,
            all_candidate_sources=audit,
            freshness_ms=winner.age_ms(now),
            collected_at=winner.collected_at,
            received_at=winner.received_at,
            decision_reason=reason,
            degraded=False,
            confidence=winner.confidence,
            system_state_snapshot=system_state,
            is_tombstone=winner.is_tombstone,
        )


# ── Decision engine v2 (Phase 3) ──────────────────────────────────────


# Per-mode minimum acceptable authority class for the "fresh native"
# bucket. Anything that meets this tier is non-degraded; lower tiers
# can still publish but are tagged ``degraded`` with a fallback_state.
_MIN_NATIVE_BY_MODE: dict[SystemMode, AuthorityClass] = {
    SystemMode.NORMAL: AuthorityClass.BROWSER_WS,
    SystemMode.API_DEGRADED: AuthorityClass.BROWSER_WS,
    SystemMode.POOL_DEGRADED: AuthorityClass.OFFICIAL_API,
    SystemMode.BIA_ASSISTED_DEGRADED: AuthorityClass.BIA_SUPPLEMENT,
    SystemMode.HARD_DEGRADED: AuthorityClass.UNKNOWN,
    SystemMode.STOPPED: AuthorityClass.UNKNOWN,
}


# The fallback_state value to stamp on a PublishedQuote whose winner
# was below the per-mode "ideal" tier.
_FALLBACK_STATE_BY_MODE: dict[SystemMode, str] = {
    SystemMode.NORMAL: "NORMAL",
    SystemMode.API_DEGRADED: "API_DEGRADED",
    SystemMode.POOL_DEGRADED: "POOL_DEGRADED",
    SystemMode.BIA_ASSISTED_DEGRADED: "BIA_ASSISTED",
    SystemMode.HARD_DEGRADED: "HARD_DEGRADED",
    SystemMode.STOPPED: "STOPPED",
}


@dataclass
class _RankedCandidate:
    candidate: CandidateQuote
    authority: AuthorityClass
    is_native: bool
    freshness_ms: int


# Default per-class hard-age tables — consumers may pass these to
# the engine constructor to opt into per-class freshness (TZ §5).
# Live thresholds ≈ N1_live=3s × 5 = 15s for base markets.
DEFAULT_HARD_AGE_LIVE_BY_CLASS: dict[DataClass, float] = {
    DataClass.BASE_EVENT: 30.0,
    DataClass.BASE_MARKET: 15.0,
    DataClass.MORE_BETS_SPECIAL: 30.0,
    DataClass.LIFECYCLE: 60.0,
}
DEFAULT_HARD_AGE_PREMATCH_BY_CLASS: dict[DataClass, float] = {
    DataClass.BASE_EVENT: 600.0,
    DataClass.BASE_MARKET: 150.0,
    DataClass.MORE_BETS_SPECIAL: 300.0,
    DataClass.LIFECYCLE: 600.0,
}


# Backwards-compat (older internal aliases).
_HARD_AGE_LIVE_BY_CLASS = DEFAULT_HARD_AGE_LIVE_BY_CLASS
_HARD_AGE_PREMATCH_BY_CLASS = DEFAULT_HARD_AGE_PREMATCH_BY_CLASS


def _is_prematch(payload: dict | None) -> bool:
    """Explicit prematch hint in payload. Default-False → assume live.

    We prefer the more restrictive ``live`` cutoff when no signal is
    present, so that a missing ``live=True`` flag never silently relaxes
    the freshness budget. (Back-compat: pre-Phase-5 engine used the
    live cutoff unconditionally.)
    """
    if not isinstance(payload, dict):
        return False
    for key in ("prematch", "is_prematch", "Prematch"):
        v = payload.get(key)
        if isinstance(v, bool) and v:
            return True
    status = payload.get("status") or payload.get("Status")
    if isinstance(status, str) and status.strip().lower() in ("prematch", "scheduled", "upcoming"):
        return True
    return False


def _bucket_is_live(cands: list[CandidateQuote]) -> bool:
    # Live unless ALL candidates explicitly mark prematch.
    if not cands:
        return True
    return not all(_is_prematch(c.payload) for c in cands)


class DecisionEngineV2:
    """Per-data-class authority engine (TZ §4-§6).

    Construction is cheap and import-time safe — the engine reads its
    profile registry on every ``decide`` call so dynamic registrations
    are picked up without a restart.
    """

    def __init__(
        self,
        *,
        registry: SourceProfileRegistry | None = None,
        hard_max_age_sec_live: float = 15.0,
        hard_max_age_sec_prematch: float = 150.0,
        per_class_hard_age_live: dict[DataClass, float] | None = None,
        per_class_hard_age_prematch: dict[DataClass, float] | None = None,
        emit_outcomes: bool | None = None,
    ) -> None:
        self.registry = registry or DEFAULT_REGISTRY
        self.hard_max_age_sec_live = hard_max_age_sec_live
        self.hard_max_age_sec_prematch = hard_max_age_sec_prematch
        # Per-class hard age — when None the constructor scalar wins
        # uniformly (back-compat); when provided, missing classes fall
        # back to the constructor scalar.
        self._per_class_live = per_class_hard_age_live
        self._per_class_prematch = per_class_hard_age_prematch
        # Override env flag for tests; None → consult env each call.
        self._emit_outcomes_override = emit_outcomes

    # ── public API ────────────────────────────────────────────────────

    def decide(
        self,
        candidates: Iterable[CandidateQuote],
        *,
        system_state: SystemState = SystemState.NORMAL,
        system_mode: SystemMode = SystemMode.NORMAL,
        data_class: Optional[DataClass] = None,
    ) -> PublishedQuote | None:
        cands = list(candidates)
        if not cands:
            return None
        if system_mode in (SystemMode.HARD_DEGRADED, SystemMode.STOPPED):
            return None

        now = _utc_now()
        klass = data_class or _classify_bucket(cands)
        is_live = _bucket_is_live(cands)

        # BIA is never authoritative for event identity, lifecycle, or core
        # prices.  Keep this explicit filter in V2 as defence in depth even
        # though the BIA source profile is also MoreBets-only.  A future
        # profile/configuration mistake therefore cannot leak BIA into the
        # main Pinnacle line.
        bia_core_rejected: list[CandidateQuote] = []
        if klass is not DataClass.MORE_BETS_SPECIAL:
            native_or_other: list[CandidateQuote] = []
            for candidate in cands:
                profile = self.registry.get(candidate.source_id)
                if _is_bia_candidate(candidate) or (
                    profile is not None
                    and profile.authority_class is AuthorityClass.BIA_SUPPLEMENT
                ):
                    bia_core_rejected.append(candidate)
                else:
                    native_or_other.append(candidate)
            cands = native_or_other
            if not cands:
                return None

        # 1) tombstone short-circuit — if any pinnacle-native source has
        # emitted a tombstone, publish it. LIFECYCLE wins over live.
        for c in cands:
            if c.is_tombstone:
                profile = self.registry.get(c.source_id)
                if profile is not None and profile.is_pinnacle_native:
                    quote = self._publish(
                        winner=c,
                        losers=[x for x in cands if x is not c] + bia_core_rejected,
                        now=now,
                        authority_class="pinnacle_native",
                        decision_reason=DecisionReason.TOMBSTONE_FROM_NATIVE_SOURCE.value,
                        degraded=False,
                        fallback_state=None,
                        system_state=system_state,
                        system_mode=system_mode,
                        core_bia_rejected=bia_core_rejected,
                    )
                    return self._maybe_attach_outcomes(quote, [c], cands, now, klass, system_mode, system_state, is_live=is_live)

        # 2) Drop expired and unknown-profile candidates.
        ranked = self._rank(cands, now=now, mode=system_mode, klass=klass, is_live=is_live)
        if not ranked:
            return None

        # 3) Per-class authority resolution. For SPECIALS, if API
        # candidate exists but is empty/no-coverage, prefer browser_ws.
        ranked.sort(
            key=lambda r: (
                -int(r.authority),
                r.freshness_ms,
                -r.candidate.confidence,
            )
        )
        winner_ranked = ranked[0]
        specials_no_cov = False
        if klass is DataClass.MORE_BETS_SPECIAL:
            api_winner = winner_ranked.authority is AuthorityClass.OFFICIAL_API
            if api_winner and _payload_has_no_specials_coverage(winner_ranked.candidate.payload):
                # Promote next browser_ws/native candidate if available.
                for r in ranked[1:]:
                    if r.is_native and r.authority >= AuthorityClass.BROWSER_WS:
                        winner_ranked = r
                        specials_no_cov = True
                        break

        ranked_set = {id(r.candidate) for r in ranked}
        losers = [r.candidate for r in ranked if r.candidate is not winner_ranked.candidate] + [
            c for c in cands if c is not winner_ranked.candidate and id(c) not in ranked_set
        ] + bia_core_rejected

        decision_reason, degraded, fallback_state, authority_class = self._reason(
            winner_ranked, mode=system_mode, klass=klass, specials_no_cov=specials_no_cov
        )

        quote = self._publish(
            winner=winner_ranked.candidate,
            losers=losers,
            now=now,
            authority_class=authority_class,
            decision_reason=decision_reason,
            degraded=degraded,
            fallback_state=fallback_state,
            system_state=system_state,
            system_mode=system_mode,
            core_bia_rejected=bia_core_rejected,
        )
        return self._maybe_attach_outcomes(
            quote, [winner_ranked.candidate], cands, now, klass, system_mode, system_state, is_live=is_live
        )

    # ── internals ─────────────────────────────────────────────────────

    def _rank(
        self,
        cands: list[CandidateQuote],
        *,
        now: datetime,
        mode: SystemMode,
        klass: DataClass = DataClass.BASE_MARKET,
        is_live: bool = True,
    ) -> list[_RankedCandidate]:
        hard_age_sec = self._hard_age_sec(klass, is_live)
        out: list[_RankedCandidate] = []
        for c in cands:
            profile = self.registry.get(c.source_id)
            if profile is None:
                continue
            if not profile.supports(klass):
                continue
            age_ms = c.age_ms(now)
            if age_ms > hard_age_sec * 1000:
                continue
            if mode is SystemMode.BIA_ASSISTED_DEGRADED and profile.is_pinnacle_native:
                # Native sources stay considered (see comment in §11);
                # SystemModeMonitor would have re-promoted the mode if
                # native is fresh.
                pass
            out.append(
                _RankedCandidate(
                    candidate=c,
                    authority=profile.authority_class,
                    is_native=profile.is_pinnacle_native,
                    freshness_ms=age_ms,
                )
            )
        return out

    def _reason(
        self,
        winner: _RankedCandidate,
        *,
        mode: SystemMode,
        klass: DataClass,
        specials_no_cov: bool = False,
    ) -> tuple[str, bool, Optional[str], str]:
        """Return (decision_reason, degraded, fallback_state, authority_class_label)."""
        min_native = _MIN_NATIVE_BY_MODE.get(mode, AuthorityClass.UNKNOWN)
        authority_label = (
            "pinnacle_native" if winner.is_native else "bia"
        )

        if specials_no_cov and winner.is_native:
            return (
                with_class(
                    DecisionReason.SPECIALS_BROWSER_PREFERRED_API_NO_COVERAGE, klass.value
                ),
                False,
                None,
                authority_label,
            )

        # Winner is BIA → always degraded (TZ §2 invariant 1).
        if not winner.is_native:
            return (
                with_class(DecisionReason.BIA_SUPPLEMENT_USED_NO_FRESH_NATIVE, klass.value),
                True,
                "BIA_ASSISTED",
                "bia",
            )
        # Winner is tab-mode → degraded vs same-account browser-WS.
        if winner.authority is AuthorityClass.TAB_MODE:
            return (
                with_class(DecisionReason.TAB_FALLBACK_USED, klass.value),
                True,
                _FALLBACK_STATE_BY_MODE.get(mode, "POOL_DEGRADED"),
                authority_label,
            )
        # Winner meets the per-mode minimum → not degraded.
        if winner.authority >= min_native:
            base = (
                DecisionReason.FRESH_NATIVE_OFFICIAL_API_PREFERRED
                if winner.authority is AuthorityClass.OFFICIAL_API
                else DecisionReason.FRESH_NATIVE_BROWSER_WS_PREFERRED
            )
            reason = with_class(base, klass.value)
            degraded = mode is not SystemMode.NORMAL
            fallback_state = None if mode is SystemMode.NORMAL else _FALLBACK_STATE_BY_MODE[mode]
            return reason, degraded, fallback_state, authority_label
        # Below per-mode minimum but still native → degraded.
        return (
            with_class(DecisionReason.NATIVE_BELOW_MODE_MINIMUM, klass.value),
            True,
            _FALLBACK_STATE_BY_MODE.get(mode, "POOL_DEGRADED"),
            authority_label,
        )

    def _publish(
        self,
        *,
        winner: CandidateQuote,
        losers: list[CandidateQuote],
        now: datetime,
        authority_class: str,
        decision_reason: str,
        degraded: bool,
        fallback_state: Optional[str],
        system_state: SystemState,
        system_mode: SystemMode,
        core_bia_rejected: list[CandidateQuote] | None = None,
    ) -> PublishedQuote:
        rejected_ids = {id(cand) for cand in (core_bia_rejected or [])}
        loser_audit = []
        for cand in losers:
            profile = self.registry.get(cand.source_id)
            reason = "less_authority_or_less_fresh"
            if id(cand) in rejected_ids:
                reason = BIA_NOT_ALLOWED_IN_CORE_REJECTED_REASON
            elif profile is None:
                reason = "unknown_source_profile"
            elif not profile.is_pinnacle_native and authority_class == "pinnacle_native":
                reason = "lower_authority"
            loser_audit.append(
                PublishedQuoteCandidate(
                    source=cand.source_id,
                    age_ms=cand.age_ms(now),
                    rejected_reason=reason,
                )
            )

        return PublishedQuote(
            event_id=winner.event_id,
            payload=winner.payload,
            source_used_for_publish=winner.source_id,
            publish_authority_class=authority_class,
            all_candidate_sources=loser_audit,
            freshness_ms=winner.age_ms(now),
            collected_at=winner.collected_at,
            received_at=winner.received_at,
            decision_reason=decision_reason,
            degraded=degraded,
            fallback_state=fallback_state,
            confidence=winner.confidence,
            system_state_snapshot=system_state,
            is_tombstone=winner.is_tombstone,
        )

    # ── outcome-granular emission (Phase 5, opt-in) ───────────────────

    def _emit_outcomes(self) -> bool:
        if self._emit_outcomes_override is not None:
            return bool(self._emit_outcomes_override)
        return outcome_granular_enabled()

    def _hard_age_sec(self, klass: DataClass, is_live: bool) -> float:
        """Return the hard-age threshold (seconds) for *klass*."""
        per_class_table = self._per_class_live if is_live else self._per_class_prematch
        scalar_default = (
            self.hard_max_age_sec_live if is_live else self.hard_max_age_sec_prematch
        )
        if per_class_table is not None:
            return per_class_table.get(klass, scalar_default)
        return scalar_default

    def _maybe_attach_outcomes(
        self,
        quote: PublishedQuote,
        winner_chain: list[CandidateQuote],
        all_cands: list[CandidateQuote],
        now: datetime,
        klass: DataClass,
        mode: SystemMode,
        system_state: SystemState,
        is_live: bool = True,
    ) -> PublishedQuote:
        if not self._emit_outcomes():
            return quote

        hard_age_ms = self._hard_age_sec(klass, is_live) * 1000

        # Group all candidates' outcomes by (market_id, outcome_id),
        # remembering source provenance per row.
        # Skip candidates that exceed the per-class hard-age threshold
        # so stale sources cannot win an outcome bucket by default.
        per_outcome: dict[tuple[str, str], list[tuple[CandidateQuote, dict]]] = {}
        for c in all_cands:
            if c.age_ms(now) > hard_age_ms:
                continue
            for row in extract_outcomes(c.payload):
                key = (row["market_id"], row["outcome_id"])
                per_outcome.setdefault(key, []).append((c, row))

        if not per_outcome:
            return quote

        outcomes: list[PublishedOutcome] = []
        for (mid, oid), rows in per_outcome.items():
            ranked: list[tuple[_RankedCandidate, dict]] = []
            for cand, row in rows:
                profile = self.registry.get(cand.source_id)
                if profile is None:
                    continue
                ranked.append((
                    _RankedCandidate(
                        candidate=cand,
                        authority=profile.authority_class,
                        is_native=profile.is_pinnacle_native,
                        freshness_ms=cand.age_ms(now),
                    ),
                    row,
                ))
            if not ranked:
                continue
            ranked.sort(
                key=lambda t: (
                    -int(t[0].authority),
                    t[0].freshness_ms,
                    -t[0].candidate.confidence,
                )
            )
            winner_r, winner_row = ranked[0]
            decision_reason, degraded, fallback_state, authority_class = self._reason(
                winner_r, mode=mode, klass=klass
            )
            loser_audit = [
                PublishedQuoteCandidate(
                    source=r.candidate.source_id,
                    age_ms=r.freshness_ms,
                    rejected_reason="less_authority_or_less_fresh",
                    price=row.get("price"),
                )
                for r, row in ranked[1:]
            ]
            outcomes.append(
                PublishedOutcome(
                    event_id=winner_r.candidate.event_id,
                    market_id=mid,
                    outcome_id=oid,
                    price=winner_row.get("price"),
                    source_used_for_publish=winner_r.candidate.source_id,
                    publish_authority_class=authority_class,
                    all_candidate_sources=loser_audit,
                    freshness_ms=winner_r.freshness_ms,
                    collected_at=winner_r.candidate.collected_at,
                    received_at=winner_r.candidate.received_at,
                    decision_reason=decision_reason,
                    degraded=degraded,
                    fallback_state=fallback_state,
                    confidence=winner_r.candidate.confidence,
                    is_tombstone=winner_r.candidate.is_tombstone,
                    data_class=klass.value,
                )
            )

        # Mutate the dataclass non-destructively.
        import dataclasses as _dc
        return _dc.replace(quote, outcomes=outcomes)


def _classify_bucket(cands: list[CandidateQuote]) -> DataClass:
    """Classify a multi-candidate bucket; LIFECYCLE wins if any."""
    seen: set[DataClass] = set()
    for c in cands:
        if c.is_tombstone:
            return DataClass.LIFECYCLE
        seen.add(classify_payload(c.payload))
    if DataClass.LIFECYCLE in seen:
        return DataClass.LIFECYCLE
    if DataClass.MORE_BETS_SPECIAL in seen:
        return DataClass.MORE_BETS_SPECIAL
    if DataClass.BASE_MARKET in seen:
        return DataClass.BASE_MARKET
    return DataClass.BASE_EVENT


def _payload_has_no_specials_coverage(payload: dict | None) -> bool:
    """Heuristic: is this an OFFICIAL_API specials response with no rows?

    TZ §3.3 — when API has no coverage on a special, the browser pool
    wins. We can only tell from payload shape; treat empty
    ``outcomes``/``markets``/``specials`` lists or an explicit
    ``no_coverage`` flag as evidence.
    """
    if not isinstance(payload, dict):
        return False
    if payload.get("no_coverage") is True or payload.get("api_coverage") == "none":
        return True
    for key in ("outcomes", "markets", "specials", "more_bets"):
        v = payload.get(key)
        if isinstance(v, list) and len(v) == 0:
            return True
    return False


def build_default_engine() -> DecisionEngine | DecisionEngineV2:
    """Construct whichever engine the env requests.

    Returns ``DecisionEngineV2`` when ``MSP_DECISION_V2_ENABLED`` is
    set, else the legacy v1 ``DecisionEngine``. Callers that need to
    pin a specific version should construct the class directly.
    """
    if decision_v2_enabled():
        return DecisionEngineV2()
    return DecisionEngine()


__all__ = [
    "BIA_NOT_ALLOWED_IN_CORE_REJECTED_REASON",
    "DecisionEngine",
    "DecisionEngineV2",
    "build_default_engine",
    "decision_v2_enabled",
]
