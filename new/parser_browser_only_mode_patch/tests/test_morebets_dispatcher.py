"""Tests for Story 27.5.A — MoreBetsDispatcher (AC-2, AC-3, AC-4, AC-7).

Exercises the dispatcher with the shipped 11-family policy.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from aggregator.morebets_dispatcher import (
    MoreBetsDispatcher,
    SourceQuote,
    _TokenBucket,
)
from aggregator.morebets_policy import load_policy


_REPO_ROOT = Path(__file__).resolve().parents[1]
_POLICY_PATH = _REPO_ROOT / "config" / "morebets_priority_policy.yaml"


@pytest.fixture()
def dispatcher() -> MoreBetsDispatcher:
    return MoreBetsDispatcher(policy=load_policy(_POLICY_PATH))


# ---------------------------------------------------------------------------
# AC-2: priority order
# ---------------------------------------------------------------------------


def test_api_fresh_wins_regardless_of_other_sources(
    dispatcher: MoreBetsDispatcher,
) -> None:
    decision = dispatcher.dispatch(
        sport_id=29,
        market_family="corners",
        quotes=[
            SourceQuote(source="api", present=True, age_sec=1.0),
            SourceQuote(source="ws", present=True, age_sec=0.1),
            SourceQuote(source="bia", present=True, age_sec=0.0, match_confidence=0.99),
        ],
    )
    assert decision.winning_source == "api"
    assert decision.reason_detail == "l1_api_fresh"


def test_api_stale_falls_through_to_ws(dispatcher: MoreBetsDispatcher) -> None:
    # corners: stale_api_sec=3
    decision = dispatcher.dispatch(
        sport_id=29,
        market_family="corners",
        quotes=[
            SourceQuote(source="api", present=True, age_sec=5.0),
            SourceQuote(source="ws", present=True, age_sec=1.0),
        ],
    )
    assert decision.winning_source == "ws"
    assert decision.reason_detail == "l2_ws_fresh"
    assert ("api", "api_stale") in decision.rejected


def test_ws_also_stale_falls_through_to_bia(
    dispatcher: MoreBetsDispatcher,
) -> None:
    decision = dispatcher.dispatch(
        sport_id=29,
        market_family="corners",
        quotes=[
            SourceQuote(source="api", present=True, age_sec=5.0),
            SourceQuote(source="ws", present=True, age_sec=30.0),
            SourceQuote(source="bia", present=True, age_sec=0.0, match_confidence=0.99),
        ],
    )
    assert decision.winning_source == "bia"
    assert decision.reason_detail == "l3_bia_fallback"


def test_all_three_exhausted_returns_unresolved(
    dispatcher: MoreBetsDispatcher,
) -> None:
    decision = dispatcher.dispatch(
        sport_id=29,
        market_family="corners",
        quotes=[
            SourceQuote(source="api", present=True, age_sec=5.0),
            SourceQuote(source="ws", present=False),
            SourceQuote(source="bia", present=False),
        ],
    )
    assert decision.winning_source is None
    assert decision.resolved is False
    assert "exhausted" in decision.reason_detail


def test_player_props_family_never_reaches_bia(
    dispatcher: MoreBetsDispatcher,
) -> None:
    # player_props: priority_order = [api, ws]; BIA disabled in V1.
    decision = dispatcher.dispatch(
        sport_id=29,
        market_family="player_props",
        quotes=[
            SourceQuote(source="api", present=True, age_sec=999.0),  # stale
            SourceQuote(source="ws", present=True, age_sec=999.0),  # stale
            SourceQuote(source="bia", present=True, match_confidence=0.99),
        ],
    )
    assert decision.winning_source is None
    # BIA must not appear as attempted — it's not in priority_order.
    attempted_sources = {src for src, _ in decision.rejected}
    assert "bia" not in attempted_sources


def test_unknown_family_uses_fallback_policy(
    dispatcher: MoreBetsDispatcher,
) -> None:
    # Unknown family falls back to "unknown_family" policy (api, ws).
    decision = dispatcher.dispatch(
        sport_id=29,
        market_family="not_a_family",
        quotes=[SourceQuote(source="api", present=True, age_sec=0.5)],
    )
    assert decision.winning_source == "api"


# ---------------------------------------------------------------------------
# AC-4: BIA min_confidence gate
# ---------------------------------------------------------------------------


def test_bia_rejected_below_min_confidence(
    dispatcher: MoreBetsDispatcher,
) -> None:
    decision = dispatcher.dispatch(
        sport_id=29,
        market_family="corners",
        quotes=[
            SourceQuote(source="api", present=False),
            SourceQuote(source="ws", present=False),
            SourceQuote(source="bia", present=True, match_confidence=0.5),
        ],
    )
    assert decision.winning_source is None
    assert ("bia", "bia_low_confidence") in decision.rejected
    stats = dispatcher.stats()
    assert stats["morebets_bia_rejected_low_confidence_total"] == 1


def test_bia_accepted_at_exact_threshold(
    dispatcher: MoreBetsDispatcher,
) -> None:
    decision = dispatcher.dispatch(
        sport_id=29,
        market_family="corners",
        quotes=[
            SourceQuote(source="api", present=False),
            SourceQuote(source="ws", present=False),
            SourceQuote(source="bia", present=True, match_confidence=0.85),
        ],
    )
    assert decision.winning_source == "bia"


# ---------------------------------------------------------------------------
# AC-3: L2 rate-limit enforcement
# ---------------------------------------------------------------------------


def test_ws_budget_exhausted_blocks_further_ws_wins(
    dispatcher: MoreBetsDispatcher,
) -> None:
    # corners l2_qps_ceil=2.0 → burst=2. First two WS pass, third fails.
    quotes = [
        SourceQuote(source="api", present=False),
        SourceQuote(source="ws", present=True, age_sec=1.0),
    ]
    for _ in range(2):
        d = dispatcher.dispatch(sport_id=29, market_family="corners", quotes=quotes)
        assert d.winning_source == "ws"
    # Third hit immediately — bucket is empty.
    d3 = dispatcher.dispatch(sport_id=29, market_family="corners", quotes=quotes)
    assert d3.winning_source is None
    assert ("ws", "ws_budget_exhausted") in d3.rejected
    assert dispatcher.stats()["morebets_ws_budget_exhausted_total"] >= 1


def test_l2_budget_shared_across_ws_and_tabs() -> None:
    """DOD-5 — tabs cannot bypass the cap because both share source="ws"."""
    # In this dispatcher there is a single "ws" source label covering
    # WS and Tabs substitute (story 27.4 AC-5). The bucket is per-
    # family; tabs just change transport, they don't get a fresh budget.
    dispatcher = MoreBetsDispatcher(policy=load_policy(_POLICY_PATH))
    quotes = [
        SourceQuote(source="api", present=False),
        SourceQuote(source="ws", present=True, age_sec=1.0),
    ]
    for _ in range(2):
        dispatcher.dispatch(sport_id=29, market_family="corners", quotes=quotes)
    # Next attempt — whether it's a tab or a ws, it's still counted.
    d = dispatcher.dispatch(sport_id=29, market_family="corners", quotes=quotes)
    assert d.winning_source is None


def test_l2_budget_is_per_family(
    dispatcher: MoreBetsDispatcher,
) -> None:
    quotes = [
        SourceQuote(source="api", present=False),
        SourceQuote(source="ws", present=True, age_sec=1.0),
    ]
    # Exhaust corners bucket.
    for _ in range(2):
        dispatcher.dispatch(sport_id=29, market_family="corners", quotes=quotes)
    dispatcher.dispatch(sport_id=29, market_family="corners", quotes=quotes)  # exhausted
    # cards family has its own bucket → still succeeds.
    d = dispatcher.dispatch(sport_id=29, market_family="cards", quotes=quotes)
    assert d.winning_source == "ws"


def test_token_bucket_refills_over_time() -> None:
    bucket = _TokenBucket(qps_ceil=2.0)
    assert bucket.try_acquire(now=0.0) is True
    assert bucket.try_acquire(now=0.1) is True
    assert bucket.try_acquire(now=0.2) is False  # empty
    # 1 second later — two tokens refilled.
    assert bucket.try_acquire(now=1.2) is True
    assert bucket.try_acquire(now=1.2) is True


# ---------------------------------------------------------------------------
# AC-7: observability counters
# ---------------------------------------------------------------------------


def test_attempts_total_increments_on_every_dispatch(
    dispatcher: MoreBetsDispatcher,
) -> None:
    quotes = [SourceQuote(source="api", present=True, age_sec=0.5)]
    for _ in range(5):
        dispatcher.dispatch(sport_id=29, market_family="corners", quotes=quotes)
    assert dispatcher.stats()["morebets_dispatch_attempts_total"] == 5


def test_success_by_source_counter(dispatcher: MoreBetsDispatcher) -> None:
    dispatcher.dispatch(
        sport_id=29,
        market_family="corners",
        quotes=[SourceQuote(source="api", present=True, age_sec=0.5)],
    )
    dispatcher.dispatch(
        sport_id=29,
        market_family="cards",
        quotes=[
            SourceQuote(source="api", present=False),
            SourceQuote(source="ws", present=True, age_sec=0.5),
        ],
    )
    counts = dispatcher.stats()["morebets_dispatch_success_by_source_total"]
    assert counts == {"api": 1, "ws": 1}


def test_fallback_total_incremented_when_l1_not_used(
    dispatcher: MoreBetsDispatcher,
) -> None:
    dispatcher.dispatch(
        sport_id=29,
        market_family="corners",
        quotes=[
            SourceQuote(source="api", present=True, age_sec=10.0),  # stale
            SourceQuote(source="ws", present=True, age_sec=0.5),
        ],
    )
    assert dispatcher.stats()["morebets_dispatch_fallback_total"] == 1


def test_exhausted_total_tracks_unresolved(
    dispatcher: MoreBetsDispatcher,
) -> None:
    dispatcher.dispatch(
        sport_id=29,
        market_family="corners",
        quotes=[SourceQuote(source="api", present=False)],
    )
    assert dispatcher.stats()["morebets_dispatch_exhausted_total"] == 1


def test_bucket_snapshot_exposes_available_tokens(
    dispatcher: MoreBetsDispatcher,
) -> None:
    dispatcher.dispatch(
        sport_id=29,
        market_family="corners",
        quotes=[
            SourceQuote(source="api", present=False),
            SourceQuote(source="ws", present=True, age_sec=0.5),
        ],
    )
    snap = dispatcher.bucket_snapshot()
    # DOD-5 canonical key: (sport_id, family, tier="l2").
    assert (29, "corners", "l2") in snap
    assert snap[(29, "corners", "l2")] < 2.0


# ---------------------------------------------------------------------------
# swap_policy (preparation for SIGHUP reload in 27.5.B)
# ---------------------------------------------------------------------------


def test_swap_policy_replaces_reference(dispatcher: MoreBetsDispatcher) -> None:
    new_policy = load_policy(_POLICY_PATH)
    assert dispatcher.policy is not new_policy  # different instances
    dispatcher.swap_policy(new_policy)
    assert dispatcher.policy is new_policy
