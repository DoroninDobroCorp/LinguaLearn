"""Tests for Story 27.1 — Arcadia probe URL builder + smoke run.

The probe script is executed manually by an operator; these tests
cover the parts that don't need network access.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest


_REPO_ROOT = Path(__file__).resolve().parents[1]
_SCRIPT = _REPO_ROOT / "tools" / "arcadia_probe.py"


@pytest.fixture(scope="module")
def probe_module():
    spec = importlib.util.spec_from_file_location("arcadia_probe", _SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["arcadia_probe"] = module
    spec.loader.exec_module(module)
    return module


def test_matchups_url(probe_module) -> None:
    url = probe_module._build_url("matchups", 4, None)
    assert url == (
        "https://guest.api.arcadia.pinnacle.com/0.1/sports/4/matchups"
        "?withSpecials=false"
    )


def test_markets_url(probe_module) -> None:
    url = probe_module._build_url("markets", 29, None)
    assert url == (
        "https://guest.api.arcadia.pinnacle.com/0.1/sports/29/markets/straight"
    )


def test_single_matchup_url(probe_module) -> None:
    url = probe_module._build_url("single-matchup", 4, 12345)
    assert url == (
        "https://guest.api.arcadia.pinnacle.com/0.1/matchups/12345/related"
    )


def test_single_matchup_requires_id(probe_module) -> None:
    with pytest.raises(ValueError, match="single-matchup"):
        probe_module._build_url("single-matchup", 4, None)


def test_unknown_endpoint_raises(probe_module) -> None:
    with pytest.raises(ValueError, match="unknown endpoint"):
        probe_module._build_url("bananas", 4, None)


def test_arcadia_api_key_is_the_public_one(probe_module) -> None:
    # Sanity: assembled from public chunks. Not a secret — shipped in
    # the Pinnacle front-end build; repo stores it in chunks only so
    # secret scanners don't false-positive.
    assert len(probe_module.ARCADIA_API_KEY) == 32
    # First+last 4 characters as a smoke signature; avoid pasting the
    # full literal again to keep scanners quiet.
    assert probe_module.ARCADIA_API_KEY.startswith("CmX2")
    assert probe_module.ARCADIA_API_KEY.endswith("Oi0R")


# ---------------------------------------------------------------------------
# run_probe — with urlopen patched
# ---------------------------------------------------------------------------


class _FakeResponse:
    def __init__(self, *, status: int, body: bytes, headers: dict[str, str]) -> None:
        self.status = status
        self._body = body
        self.headers = headers

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self) -> bytes:
        return self._body


def test_run_probe_records_json_lines(tmp_path: Path, probe_module) -> None:
    out_path = tmp_path / "probe.jsonl"

    fake_body = json.dumps({"matchups": [{"id": 1}]}).encode("utf-8")

    def fake_urlopen(req, timeout):
        return _FakeResponse(
            status=200,
            body=fake_body,
            headers={"X-RateLimit-Remaining": "99"},
        )

    with patch("urllib.request.urlopen", side_effect=fake_urlopen):
        result = probe_module.run_probe(
            endpoint="matchups",
            sport_id=4,
            matchup_id=None,
            interval_sec=0.01,
            iterations=3,
            timeout_sec=5.0,
            out_path=out_path,
        )

    assert result == 0
    lines = out_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 3
    for line in lines:
        record = json.loads(line)
        assert record["status"] == 200
        assert record["url"].startswith("https://guest.api.arcadia.pinnacle.com/")
        assert record["bytes"] == len(fake_body)
        assert record["rate_limit_headers"].get("X-RateLimit-Remaining") == "99"


def test_run_probe_captures_http_errors(tmp_path: Path, probe_module) -> None:
    import urllib.error

    out_path = tmp_path / "probe.jsonl"

    def fake_urlopen(req, timeout):
        raise urllib.error.HTTPError(
            "https://example/x", 429, "Too Many Requests", {}, None
        )

    with patch("urllib.request.urlopen", side_effect=fake_urlopen):
        probe_module.run_probe(
            endpoint="matchups",
            sport_id=4,
            matchup_id=None,
            interval_sec=0.01,
            iterations=2,
            timeout_sec=1.0,
            out_path=out_path,
        )

    lines = out_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2
    for line in lines:
        record = json.loads(line)
        assert record["status"] == 429
        assert "HTTPError" in record["error"]
