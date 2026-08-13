from __future__ import annotations

from services.bia_neural_matcher import (
    BiaNeuralCandidate,
    BiaNeuralMatcher,
    BiaNeuralMatcherConfig,
    _clean_json_response,
    _parse_decision,
)


def test_neural_matcher_unavailable_with_empty_key():
    matcher = BiaNeuralMatcher(BiaNeuralMatcherConfig(enabled=True, api_key=""))

    decision = matcher.match(
        bia_home="Arsenal",
        bia_away="Chelsea",
        bia_sport="fb",
        bia_league="Premier League",
        candidates=[BiaNeuralCandidate(pid=1, home="Arsenal", away="Chelsea")],
    )

    assert matcher.available is False
    assert decision is None


def test_clean_json_response_strips_markdown_prefix():
    assert _clean_json_response('```json\n{"pid": 1}\n```') == '{"pid": 1}'
    assert _clean_json_response('text before {"pid": 2}') == '{"pid": 2}'


def test_parse_decision_accepts_null_pid():
    decision = _parse_decision('{"pid": null, "confidence": 0.2, "reason": "unsafe"}')

    assert decision is not None
    assert decision.pid is None
    assert decision.confidence == 0.2


def test_neural_matcher_rejects_pid_outside_candidates(monkeypatch):
    matcher = BiaNeuralMatcher(
        BiaNeuralMatcherConfig(enabled=True, api_key="key", min_confidence=0.85)
    )
    monkeypatch.setattr(
        matcher,
        "_generate",
        lambda _system, _request: '{"pid": 99, "confidence": 0.99, "swapped": false}',
    )

    decision = matcher.match(
        bia_home="Arsenal",
        bia_away="Chelsea",
        bia_sport="fb",
        bia_league="Premier League",
        candidates=[BiaNeuralCandidate(pid=1, home="Arsenal", away="Chelsea")],
    )

    assert decision is None


def test_neural_matcher_accepts_confident_candidate(monkeypatch):
    matcher = BiaNeuralMatcher(
        BiaNeuralMatcherConfig(enabled=True, api_key="key", min_confidence=0.85)
    )
    monkeypatch.setattr(
        matcher,
        "_generate",
        lambda _system, _request: '{"pid": 1, "confidence": 0.91, "swapped": true}',
    )

    decision = matcher.match(
        bia_home="Chelsea",
        bia_away="Arsenal",
        bia_sport="fb",
        bia_league="Premier League",
        candidates=[BiaNeuralCandidate(pid=1, home="Arsenal", away="Chelsea", swapped=True)],
    )

    assert decision is not None
    assert decision.pid == 1
    assert decision.swapped is True


def test_neural_matcher_caches_negative_decision(monkeypatch):
    matcher = BiaNeuralMatcher(
        BiaNeuralMatcherConfig(enabled=True, api_key="key", cache_ttl_sec=3600)
    )
    calls = {"count": 0}

    def fake_generate(_system, _request):
        calls["count"] += 1
        return '{"pid": null, "confidence": 0.1, "reason": "ambiguous"}'

    monkeypatch.setattr(matcher, "_generate", fake_generate)
    kwargs = {
        "bia_home": "Arsenal",
        "bia_away": "Chelsea",
        "bia_sport": "fb",
        "bia_league": "Premier League",
        "candidates": [BiaNeuralCandidate(pid=1, home="Arsenal", away="Chelsea")],
    }

    first = matcher.match(**kwargs)
    second = matcher.match(**kwargs)

    assert first is not None
    assert first.pid is None
    assert second is first
    assert calls["count"] == 1
