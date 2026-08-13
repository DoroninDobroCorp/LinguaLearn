"""Tests for Story 27.9 — Arcadia Guest API HTTP client."""

from __future__ import annotations

import gzip
import io
import json
import urllib.error
from unittest.mock import patch

import pytest

from aggregator.sources.arcadia_guest_client import (
    ArcadiaApiError,
    ArcadiaApiRateLimitError,
    ArcadiaApiServerError,
    ArcadiaApiTransportError,
    ArcadiaGuestClient,
    DEFAULT_ARCADIA_API_KEY,
    DEFAULT_ARCADIA_BASE,
)


# ---------------------------------------------------------------------------
# URL construction + config
# ---------------------------------------------------------------------------


def test_default_api_key_is_public_constant() -> None:
    # Sanity only — don't paste the full literal so secret scanners stay quiet.
    assert len(DEFAULT_ARCADIA_API_KEY) == 32
    assert DEFAULT_ARCADIA_API_KEY.startswith("CmX2")


def test_default_base_url_points_to_guest_host() -> None:
    assert DEFAULT_ARCADIA_BASE == "https://guest.api.arcadia.pinnacle.com/0.1"


def test_client_build_url_without_params() -> None:
    c = ArcadiaGuestClient()
    assert c._build_url("/sports/4/matchups", None) == (
        "https://guest.api.arcadia.pinnacle.com/0.1/sports/4/matchups"
    )


def test_client_build_url_with_bool_param() -> None:
    c = ArcadiaGuestClient()
    assert c._build_url("/sports/4/matchups", {"withSpecials": False}) == (
        "https://guest.api.arcadia.pinnacle.com/0.1/sports/4/matchups"
        "?withSpecials=false"
    )


def test_from_env_uses_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    for v in ("MSP_ARCADIA_BASE_URL", "MSP_ARCADIA_API_KEY", "MSP_ARCADIA_TIMEOUT_SEC"):
        monkeypatch.delenv(v, raising=False)
    c = ArcadiaGuestClient.from_env()
    assert c.config.base_url == DEFAULT_ARCADIA_BASE
    assert c.config.api_key == DEFAULT_ARCADIA_API_KEY


def test_from_env_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MSP_ARCADIA_BASE_URL", "https://custom.example/0.1")
    monkeypatch.setenv("MSP_ARCADIA_API_KEY", "CUSTOM_KEY_VALUE")
    monkeypatch.setenv("MSP_ARCADIA_TIMEOUT_SEC", "7.5")
    c = ArcadiaGuestClient.from_env()
    assert c.config.base_url == "https://custom.example/0.1"
    assert c.config.api_key == "CUSTOM_KEY_VALUE"
    assert c.config.timeout_sec == 7.5


# ---------------------------------------------------------------------------
# HTTP behaviour (urlopen mocked)
# ---------------------------------------------------------------------------


class _FakeHTTPResponse:
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


def _json_response(payload, *, gzip_encoded: bool = False) -> _FakeHTTPResponse:
    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if gzip_encoded:
        buf = io.BytesIO()
        with gzip.GzipFile(fileobj=buf, mode="wb") as f:
            f.write(body)
        body = buf.getvalue()
        headers["Content-Encoding"] = "gzip"
    return _FakeHTTPResponse(status=200, body=body, headers=headers)


def test_fetch_matchups_returns_list() -> None:
    c = ArcadiaGuestClient()
    resp = _json_response([{"id": 1}, {"id": 2}])
    with patch("urllib.request.urlopen", return_value=resp):
        rows = c.fetch_matchups(4)
    assert rows == [{"id": 1}, {"id": 2}]


def test_fetch_matchups_auto_gunzips() -> None:
    c = ArcadiaGuestClient()
    resp = _json_response([{"id": 1}], gzip_encoded=True)
    with patch("urllib.request.urlopen", return_value=resp):
        rows = c.fetch_matchups(4)
    assert rows == [{"id": 1}]


def test_fetch_markets_non_list_tolerated() -> None:
    c = ArcadiaGuestClient()
    resp = _json_response({"error": "no markets"})  # wrong shape
    with patch("urllib.request.urlopen", return_value=resp):
        rows = c.fetch_markets(4)
    assert rows == []


def test_fetch_single_matchup_list_wrapper() -> None:
    c = ArcadiaGuestClient()
    resp = _json_response([{"id": 42, "status": "pending"}])
    with patch("urllib.request.urlopen", return_value=resp):
        m = c.fetch_single_matchup(42)
    assert m == {"id": 42, "status": "pending"}


def test_http_429_raises_rate_limit() -> None:
    c = ArcadiaGuestClient()

    class _HeadersStub:
        def get(self, name):
            return "12" if name == "Retry-After" else None

    def raise_429(*a, **kw):
        raise urllib.error.HTTPError(
            "https://example/x", 429, "Too Many", _HeadersStub(), None
        )

    with patch("urllib.request.urlopen", side_effect=raise_429):
        with pytest.raises(ArcadiaApiRateLimitError) as exc_info:
            c.fetch_matchups(4)
    assert exc_info.value.retry_after == 12.0


def test_http_500_raises_server_error() -> None:
    c = ArcadiaGuestClient()

    def raise_500(*a, **kw):
        raise urllib.error.HTTPError("https://example/x", 500, "boom", {}, None)

    with patch("urllib.request.urlopen", side_effect=raise_500):
        with pytest.raises(ArcadiaApiServerError):
            c.fetch_matchups(4)


def test_transport_failure_raises_transport_error() -> None:
    c = ArcadiaGuestClient()
    with patch(
        "urllib.request.urlopen",
        side_effect=urllib.error.URLError("dns fail"),
    ):
        with pytest.raises(ArcadiaApiTransportError):
            c.fetch_matchups(4)


def test_malformed_json_raises_api_error() -> None:
    c = ArcadiaGuestClient()
    resp = _FakeHTTPResponse(
        status=200, body=b"not-json{{{", headers={}
    )
    with patch("urllib.request.urlopen", return_value=resp):
        with pytest.raises(ArcadiaApiError):
            c.fetch_matchups(4)
