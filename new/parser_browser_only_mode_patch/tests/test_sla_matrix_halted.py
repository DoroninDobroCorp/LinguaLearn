"""Story 27.24 — verify_sla_matrix is_halted фильтр.

AC-2/AC-3/AC-5: only events with is_halted=True (Pinnacle status="H")
are excluded from SLA. Events with empty markets but is_halted=False are
counted as SLA failures (delivery failure, не пауза).
"""

from __future__ import annotations

import json
from pathlib import Path

from tools import verify_sla_matrix as vsm


def _ev(
    *,
    pid: int,
    sid: int,
    is_live: bool,
    freshness_ms: float,
    is_halted: bool = False,
    source: str = "pinnacle_api",
) -> dict:
    return {
        "event_id": f"pin888:{pid}",
        "sport_id": sid,
        "is_live": is_live,
        "is_halted": is_halted,
        "freshness_ms": freshness_ms,
        "source_used_for_publish": source,
        "outcomes": [],
        "markets": {},
    }


def _run_collect(monkeypatch, tmp_path: Path, events: list[dict]) -> tuple[
    int,
    dict,
    dict[tuple[int, str], int],
    dict[tuple[int, str], int],
]:
    """Patch _fetch_json + run a single-snapshot collect."""
    payload = {"events": events}
    calls = {"n": 0}

    def _fake_fetch(_url: str) -> dict:
        calls["n"] += 1
        return payload

    monkeypatch.setattr(vsm, "_fetch_json", _fake_fetch)

    return vsm._collect(
        url="http://test/snapshot",
        interval_sec=0.01,
        duration_sec=0.005,  # one tick
        out_dir=tmp_path,
        live_target_ms=2000,
        prematch_target_ms=10000,
    )


def test_halted_live_excluded_from_sla(monkeypatch, tmp_path: Path) -> None:
    """AC-2: is_halted=True → исключается из SLA-аккумулятора, попадает в halted_excl."""
    halted = _ev(pid=1, sid=33, is_live=True, freshness_ms=15000.0, is_halted=True)
    _, accum, _, halted_excl = _run_collect(monkeypatch, tmp_path, [halted])
    assert (33, "live") not in accum, "halted event must not be in SLA accum"
    assert halted_excl[(33, "live")] == 1


def test_open_live_no_markets_counted_as_sla(monkeypatch, tmp_path: Path) -> None:
    """AC-3: is_halted=False + пустые markets → SLA failure, NOT excluded."""
    delivery_fail = _ev(pid=2, sid=33, is_live=True, freshness_ms=15000.0, is_halted=False)
    _, accum, _, halted_excl = _run_collect(monkeypatch, tmp_path, [delivery_fail])
    assert (33, "live") in accum, "non-halted event must be counted in SLA"
    assert halted_excl.get((33, "live"), 0) == 0


def test_legacy_snapshot_without_is_halted_field(monkeypatch, tmp_path: Path) -> None:
    """AC-5: snapshot без поля is_halted → conservative: не исключаем, считаем как нарушение."""
    legacy = {
        "event_id": "pin888:3",
        "sport_id": 33,
        "is_live": True,
        "freshness_ms": 15000.0,
        "source_used_for_publish": "pin888",
        # no is_halted key at all
    }
    _, accum, _, halted_excl = _run_collect(monkeypatch, tmp_path, [legacy])
    assert (33, "live") in accum
    assert halted_excl.get((33, "live"), 0) == 0


def test_halted_only_filters_live_not_prematch(monkeypatch, tmp_path: Path) -> None:
    """AC-2/AC-3: prematch is_halted=True должно быть в SLA (фильтр halted — только для live)."""
    pre_halted = _ev(
        pid=4, sid=29, is_live=False, freshness_ms=5000.0, is_halted=True,
        source="pin888",  # avoid api_pre_excl path
    )
    _, accum, api_pre_excl, halted_excl = _run_collect(monkeypatch, tmp_path, [pre_halted])
    # halted филтр работает только для live → prematch попадает в accum
    assert (29, "prematch") in accum
    assert halted_excl.get((29, "prematch"), 0) == 0
