"""Tests for startup config guards around specials delivery."""

import importlib
from unittest.mock import patch

import pytest


def _reload_config_clean(monkeypatch, env_overrides: dict, clear_keys: list | None = None):
    """Reload config.py with dotenv neutralised and controlled env vars."""
    for k in (clear_keys or []):
        monkeypatch.delenv(k, raising=False)
    for k, v in env_overrides.items():
        monkeypatch.setenv(k, v)
    with patch("dotenv.load_dotenv"):
        import config as _cfg
        importlib.reload(_cfg)
    return _cfg


class TestSpecialsSourceGuard:
    """SEND_MODE!=base_only must have BIA, direct WS MORE_BET, or hybrid MORE_BET."""

    def test_send_mode_all_without_specials_source_fails(self, monkeypatch):
        with pytest.raises(SystemExit) as exc_info:
            _reload_config_clean(monkeypatch, {
                "PS3838_SEND_MODE": "all",
                "BIA_ENABLED": "0",
                "PS3838_TRANSPORT_BACKEND": "legacy",
                "PS3838_DIRECT_MORE_BET_ENABLED": "0",
                "PS3838_HYBRID_MORE_BET_ENABLED": "0",
            })
        assert exc_info.value.code == 1

    def test_more_bets_only_without_specials_source_fails(self, monkeypatch):
        with pytest.raises(SystemExit) as exc_info:
            _reload_config_clean(monkeypatch, {
                "PS3838_SEND_MODE": "more_bets_only",
                "BIA_ENABLED": "0",
                "PS3838_TRANSPORT_BACKEND": "legacy",
                "PS3838_DIRECT_MORE_BET_ENABLED": "0",
                "PS3838_HYBRID_MORE_BET_ENABLED": "0",
            })
        assert exc_info.value.code == 1

    def test_bia_send_mode_all_without_credentials_fails(self, monkeypatch):
        with pytest.raises(SystemExit) as exc_info:
            _reload_config_clean(monkeypatch, {
                "PS3838_SEND_MODE": "all",
                "BIA_ENABLED": "1",
                "BIA_LOGIN": "",
                "BIA_PASSWORD": "",
            })
        assert exc_info.value.code == 1

    def test_bia_send_mode_all_with_credentials_passes(self, monkeypatch):
        cfg = _reload_config_clean(monkeypatch, {
            "PS3838_SEND_MODE": "all",
            "BIA_ENABLED": "1",
            "BIA_LOGIN": "user",
            "BIA_PASSWORD": "pass",
        })
        assert cfg.PS3838_SEND_MODE == "all"
        assert cfg.BIA_ENABLED is True

    def test_hybrid_runner_without_bia_fails(self, monkeypatch):
        # After legacy MoreBets removal, BIA is the only specials source.
        with pytest.raises(SystemExit) as exc_info:
            _reload_config_clean(monkeypatch, {
                "PS3838_SEND_MODE": "all",
                "BIA_ENABLED": "0",
                "PS3838_TRANSPORT_BACKEND": "hybrid_runner",
            })
        assert exc_info.value.code == 1

    def test_bia_observer_only_no_credentials_required(self, monkeypatch):
        cfg = _reload_config_clean(monkeypatch, {
            "PS3838_SEND_MODE": "base_only",
            "BIA_ENABLED": "1",
            "BIA_LOGIN": "",
            "BIA_PASSWORD": "",
        })
        assert cfg.PS3838_SEND_MODE == "base_only"
        assert cfg.BIA_ENABLED is True

    def test_base_only_mode_no_guard(self, monkeypatch):
        cfg = _reload_config_clean(monkeypatch, {
            "PS3838_SEND_MODE": "base_only",
            "BIA_ENABLED": "0",
        })
        assert cfg.PS3838_SEND_MODE == "base_only"
        assert cfg.BIA_ENABLED is False


class TestHybridEnabledDefault:
    """Guard: PS3838_HYBRID_ENABLED defaults to 0 (HTTP fallback off by default)."""

    def test_hybrid_enabled_defaults_to_false(self, monkeypatch):
        cfg = _reload_config_clean(monkeypatch, {}, clear_keys=["PS3838_HYBRID_ENABLED"])
        assert cfg.PS3838_HYBRID_ENABLED is False

    def test_hybrid_enabled_can_be_opted_in(self, monkeypatch):
        cfg = _reload_config_clean(monkeypatch, {
            "PS3838_HYBRID_ENABLED": "1",
        })
        assert cfg.PS3838_HYBRID_ENABLED is True


class TestSendModeValidation:
    """Guard: PS3838_SEND_MODE must be a valid value."""

    def test_invalid_send_mode_fails(self, monkeypatch):
        with pytest.raises(SystemExit) as exc_info:
            _reload_config_clean(monkeypatch, {
                "PS3838_SEND_MODE": "invalid_mode",
            })
        assert exc_info.value.code == 1

    def test_more_bets_only_mode_accepted_with_bia(self, monkeypatch):
        cfg = _reload_config_clean(monkeypatch, {
            "PS3838_SEND_MODE": "more_bets_only",
            "BIA_ENABLED": "1",
            "BIA_LOGIN": "user",
            "BIA_PASSWORD": "pass",
        })
        assert cfg.PS3838_SEND_MODE == "more_bets_only"
