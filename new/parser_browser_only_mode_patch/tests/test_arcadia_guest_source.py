"""Tests for Story 27.9 — Arcadia standby adapter gate logic.

The adapter is a skeleton until the Story 27.1 research verdict flips
to GREEN. These tests cover the gating contract: flag + circuit state
must both hold for the adapter to self-report as ``active``.
"""

from __future__ import annotations

import pytest

from aggregator.sources.arcadia_guest_source import (
    ArcadiaStandbyAdapter,
    arcadia_standby_enabled,
)


def _adapter(
    *, circuit_open: bool = False, override_enabled: bool | None = None
) -> ArcadiaStandbyAdapter:
    adapter = ArcadiaStandbyAdapter(
        is_partner_api_circuit_open=lambda: circuit_open,
        _enabled_override=override_enabled,
    )
    return adapter


# ---------------------------------------------------------------------------
# Env flag
# ---------------------------------------------------------------------------


def test_flag_off_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MSP_ARCADIA_STANDBY_ENABLED", raising=False)
    assert arcadia_standby_enabled() is False


@pytest.mark.parametrize("val", ["1", "true", "True", "yes"])
def test_flag_accepts_truthy(monkeypatch: pytest.MonkeyPatch, val: str) -> None:
    monkeypatch.setenv("MSP_ARCADIA_STANDBY_ENABLED", val)
    assert arcadia_standby_enabled() is True


@pytest.mark.parametrize("val", ["0", "false", "no", "", "bananas"])
def test_flag_rejects_others(monkeypatch: pytest.MonkeyPatch, val: str) -> None:
    monkeypatch.setenv("MSP_ARCADIA_STANDBY_ENABLED", val)
    assert arcadia_standby_enabled() is False


# ---------------------------------------------------------------------------
# is_active contract
# ---------------------------------------------------------------------------


def test_not_active_when_flag_off() -> None:
    adapter = _adapter(circuit_open=True, override_enabled=False)
    assert adapter.is_active() is False


def test_not_active_when_circuit_closed() -> None:
    adapter = _adapter(circuit_open=False, override_enabled=True)
    assert adapter.is_active() is False


def test_active_only_with_flag_and_circuit_open() -> None:
    adapter = _adapter(circuit_open=True, override_enabled=True)
    assert adapter.is_active() is True


def test_callback_exception_keeps_adapter_inert() -> None:
    def boom() -> bool:
        raise RuntimeError("circuit introspection crashed")

    adapter = ArcadiaStandbyAdapter(
        is_partner_api_circuit_open=boom, _enabled_override=True
    )
    # Defensive: never activate if the circuit signal can't be trusted.
    assert adapter.is_active() is False


# ---------------------------------------------------------------------------
# Skeleton poll_once — counts only
# ---------------------------------------------------------------------------


def test_poll_once_increments_attempts() -> None:
    adapter = _adapter(circuit_open=False, override_enabled=False)
    adapter.poll_once()
    adapter.poll_once()
    assert adapter.stats()["arcadia_standby_poll_attempts_total"] == 2
    # Never activated while disabled.
    assert adapter.stats()["arcadia_standby_activations_total"] == 0


def test_poll_once_activations_count_when_gated_conditions_hold() -> None:
    adapter = _adapter(circuit_open=True, override_enabled=True)
    adapter.poll_once()
    adapter.poll_once()
    assert adapter.stats()["arcadia_standby_activations_total"] == 2


def test_poll_once_inactive_does_not_emit() -> None:
    """When gates are closed, poll_once must not touch the network or
    produce SourceEvents — the client is never built."""
    emits: list = []
    adapter = ArcadiaStandbyAdapter(
        is_partner_api_circuit_open=lambda: False,  # circuit closed
        emit_callback=lambda ev: emits.append(ev),
        _enabled_override=True,  # flag on, circuit off → inactive
    )
    result = adapter.poll_once()
    assert result == 0
    assert emits == []
    # Client not built because we never reached the active path.
    assert adapter.client is None


# ---------------------------------------------------------------------------
# Stats shape
# ---------------------------------------------------------------------------


def test_stats_shape_consistent() -> None:
    adapter = _adapter(circuit_open=False, override_enabled=False)
    snap = adapter.stats()
    for required in (
        "arcadia_standby_enabled",
        "arcadia_standby_active",
        "arcadia_standby_activations_total",
        "arcadia_standby_poll_attempts_total",
        "source_id",
    ):
        assert required in snap
    assert snap["source_id"] == "arcadia_guest"


# ---------------------------------------------------------------------------
# Active poll_once — with mocked client
# ---------------------------------------------------------------------------


class _StubArcadiaClient:
    """Stub matching the ArcadiaGuestClient public surface."""

    def __init__(
        self,
        *,
        matchups: list[dict],
        markets: list[dict],
        raise_on: Exception | None = None,
    ) -> None:
        self.fetch_matchups_calls: list[int] = []
        self.fetch_markets_calls: list[int] = []
        self._matchups = matchups
        self._markets = markets
        self._raise = raise_on

    def fetch_matchups(self, sport_id, *, with_specials=False):
        self.fetch_matchups_calls.append(sport_id)
        if self._raise is not None:
            raise self._raise
        return list(self._matchups)

    def fetch_markets(self, sport_id):
        self.fetch_markets_calls.append(sport_id)
        if self._raise is not None:
            raise self._raise
        return list(self._markets)


def test_active_poll_emits_source_events_for_each_game() -> None:
    emits: list = []
    matchups = [
        {
            "id": 42,
            "status": "started",
            "participants": [
                {"id": 421, "alignment": "home", "name": "H"},
                {"id": 422, "alignment": "away", "name": "A"},
            ],
            "league": {"name": "League"},
        }
    ]
    markets = [
        {
            "matchupId": 42,
            "key": "s;0;m",
            "prices": [
                {"participantId": 421, "price": -110},
                {"participantId": 422, "price": 150},
            ],
            "version": 1,
        }
    ]
    stub = _StubArcadiaClient(matchups=matchups, markets=markets)
    from aggregator.sources.arcadia_guest_source import ArcadiaStandbyAdapter

    adapter = ArcadiaStandbyAdapter(
        is_partner_api_circuit_open=lambda: True,
        emit_callback=lambda ev: emits.append(ev),
        client=stub,  # type: ignore[arg-type]
        sport_ids=(4,),
        _enabled_override=True,
    )
    emitted = adapter.poll_once()
    assert emitted == 1
    assert len(emits) == 1
    ev = emits[0]
    assert ev.source_id == "arcadia_guest"
    assert ev.family == "pinnacle_native"
    assert ev.event_id == "arcadia_guest:42"
    assert ev.payload["Pid"] == 42
    assert stub.fetch_matchups_calls == [4]
    assert stub.fetch_markets_calls == [4]


def test_active_poll_rate_limit_captures_error_bucket() -> None:
    from aggregator.sources.arcadia_guest_client import ArcadiaApiRateLimitError
    from aggregator.sources.arcadia_guest_source import ArcadiaStandbyAdapter

    stub = _StubArcadiaClient(
        matchups=[], markets=[], raise_on=ArcadiaApiRateLimitError("429", retry_after=5.0)
    )
    adapter = ArcadiaStandbyAdapter(
        is_partner_api_circuit_open=lambda: True,
        client=stub,  # type: ignore[arg-type]
        sport_ids=(4,),
        _enabled_override=True,
    )
    emitted = adapter.poll_once()
    assert emitted == 0
    stats = adapter.stats()
    assert stats["arcadia_standby_errors_by_class"]["rate_limit"] == 1


def test_active_poll_server_error_captured() -> None:
    from aggregator.sources.arcadia_guest_client import ArcadiaApiServerError
    from aggregator.sources.arcadia_guest_source import ArcadiaStandbyAdapter

    stub = _StubArcadiaClient(
        matchups=[], markets=[], raise_on=ArcadiaApiServerError("500", status=500)
    )
    adapter = ArcadiaStandbyAdapter(
        is_partner_api_circuit_open=lambda: True,
        client=stub,  # type: ignore[arg-type]
        sport_ids=(4,),
        _enabled_override=True,
    )
    adapter.poll_once()
    assert adapter.stats()["arcadia_standby_errors_by_class"]["server"] == 1


def test_active_poll_transport_error_captured() -> None:
    from aggregator.sources.arcadia_guest_client import ArcadiaApiTransportError
    from aggregator.sources.arcadia_guest_source import ArcadiaStandbyAdapter

    stub = _StubArcadiaClient(
        matchups=[], markets=[], raise_on=ArcadiaApiTransportError("net")
    )
    adapter = ArcadiaStandbyAdapter(
        is_partner_api_circuit_open=lambda: True,
        client=stub,  # type: ignore[arg-type]
        sport_ids=(4,),
        _enabled_override=True,
    )
    adapter.poll_once()
    assert adapter.stats()["arcadia_standby_errors_by_class"]["transport"] == 1


def test_emit_callback_exception_does_not_break_loop() -> None:
    from aggregator.sources.arcadia_guest_source import ArcadiaStandbyAdapter

    def bad_emit(ev):
        raise RuntimeError("consumer on fire")

    matchups = [{"id": 1, "participants": [], "league": {"name": ""}}]
    markets = [{"matchupId": 1, "key": "s;0;m", "prices": [], "version": 1}]
    stub = _StubArcadiaClient(matchups=matchups, markets=markets)
    adapter = ArcadiaStandbyAdapter(
        is_partner_api_circuit_open=lambda: True,
        emit_callback=bad_emit,
        client=stub,  # type: ignore[arg-type]
        sport_ids=(4,),
        _enabled_override=True,
    )
    # poll_once must not raise even though consumer blew up.
    adapter.poll_once()


def test_active_poll_iterates_all_sport_ids() -> None:
    from aggregator.sources.arcadia_guest_source import ArcadiaStandbyAdapter

    stub = _StubArcadiaClient(matchups=[], markets=[])
    adapter = ArcadiaStandbyAdapter(
        is_partner_api_circuit_open=lambda: True,
        client=stub,  # type: ignore[arg-type]
        sport_ids=(4, 29, 19),
        _enabled_override=True,
    )
    adapter.poll_once()
    assert stub.fetch_matchups_calls == [4, 29, 19]
    assert stub.fetch_markets_calls == [4, 29, 19]


def test_stats_includes_full_observability_surface() -> None:
    from aggregator.sources.arcadia_guest_source import ArcadiaStandbyAdapter

    adapter = ArcadiaStandbyAdapter(
        is_partner_api_circuit_open=lambda: False,
        _enabled_override=False,
    )
    adapter.poll_once()
    stats = adapter.stats()
    for required in (
        "arcadia_standby_events_emitted_total",
        "arcadia_standby_errors_by_class",
        "arcadia_standby_last_poll_age_sec",
    ):
        assert required in stats
    # Error buckets always present with canonical keys.
    assert set(stats["arcadia_standby_errors_by_class"].keys()) == {
        "rate_limit",
        "server",
        "transport",
        "other",
    }
