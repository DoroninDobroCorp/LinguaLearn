"""Pin critical repo-shipped config defaults to the approved architecture.

These tests reload config.py with dotenv neutralised and target env vars
cleared so they see only the hard-coded fallback values.  If a default
drifts, CI will catch it.
"""

import importlib
from unittest.mock import patch


def _reload_config_clean(monkeypatch, keys):
    """Remove *keys* from env, disable dotenv, reimport config."""
    baseline_keys = {
        "PS3838_SEND_MODE",
    }
    for k in baseline_keys.union(keys):
        monkeypatch.delenv(k, raising=False)
    with patch("dotenv.load_dotenv"):
        import config as _cfg
        importlib.reload(_cfg)
    return _cfg


class TestShippedDefaults:
    """Guard-rail: shipped defaults must match approved hybrid architecture."""

    # ── PS3838_SITE_PROFILE ───────────────────────────────────────────
    def test_site_profile_defaults_to_pin888(self, monkeypatch):
        """Repo default profile must be pin888, not ps3838."""
        cfg = _reload_config_clean(monkeypatch, ["PS3838_SITE_PROFILE"])
        assert cfg.PS3838_SITE_PROFILE == "pin888"

    def test_empty_site_profile_normalizes_to_pin888(self, monkeypatch):
        """Empty/unset PS3838_SITE_PROFILE maps to pin888."""
        monkeypatch.setenv("PS3838_SITE_PROFILE", "")
        cfg = _reload_config_clean(monkeypatch, [])
        assert cfg.PS3838_SITE_PROFILE == "pin888"

    # ── PS3838_TRANSPORT_BACKEND ──────────────────────────────────────
    def test_transport_backend_defaults_to_legacy_direct_ws(self, monkeypatch):
        """Default transport = direct single PIN888 WS ('legacy'), not hybrid_runner."""
        cfg = _reload_config_clean(monkeypatch, ["PS3838_TRANSPORT_BACKEND"])
        assert cfg.PS3838_TRANSPORT_BACKEND == "legacy"

    # ── PS3838_USE_BROWSER_WS ─────────────────────────────────────────
    def test_browser_ws_off_by_default(self, monkeypatch):
        """Browser WS routing is manual opt-in only."""
        cfg = _reload_config_clean(monkeypatch, ["PS3838_USE_BROWSER_WS"])
        assert cfg.PS3838_USE_BROWSER_WS is False

    # ── PS3838_SEND_MODE ──────────────────────────────────────────────
    def test_send_mode_defaults_to_base_only(self, monkeypatch):
        """HYBRID_SPEC §1.1: BIA cpricefeed is primary more-bets source,
        so PS3838 channel defaults to base_only."""
        cfg = _reload_config_clean(monkeypatch, ["PS3838_SEND_MODE"])
        assert cfg.PS3838_SEND_MODE == "base_only"

    # ── BIA_ENABLED ───────────────────────────────────────────────────
    def test_bia_disabled_by_default(self, monkeypatch):
        """BIA observer requires explicit opt-in with credentials."""
        cfg = _reload_config_clean(monkeypatch, ["BIA_ENABLED"])
        assert cfg.BIA_ENABLED is False

    def test_bia_sports_defaults_include_soccer_special_namespaces(self, monkeypatch):
        """Repo defaults should subscribe to proven soccer special namespaces."""
        cfg = _reload_config_clean(monkeypatch, ["BIA_SPORTS"])
        assert "fb" in cfg.BIA_SPORTS
        assert "fb_ht" in cfg.BIA_SPORTS
        assert "fb_htft" in cfg.BIA_SPORTS

    # ── BIA_SSL_VERIFY ────────────────────────────────────────────────
    def test_bia_ssl_verify_on_by_default(self, monkeypatch):
        """SSL verification must default to ON for safety."""
        cfg = _reload_config_clean(monkeypatch, ["BIA_SSL_VERIFY"])
        assert cfg.BIA_SSL_VERIFY is True

    def test_bia_watch_event_rollout_defaults_match_direct_ws_path(self, monkeypatch):
        """Shipped observer defaults should favor direct BIA watch_event rollout,
        not the old ultra-slow experimental pacing."""
        cfg = _reload_config_clean(monkeypatch, [
            "BIA_WATCH_HCAPS_WARMUP_SEC",
            "BIA_WATCH_HCAPS_BATCH_SIZE",
            "BIA_WATCH_HCAPS_FLUSH_SEC",
            "BIA_WATCH_EVENT_WARMUP_SEC",
            "BIA_WATCH_EVENT_BATCH_SIZE",
            "BIA_WATCH_EVENT_FLUSH_SEC",
            "BIA_WATCH_EVENT_LIVE_SEED_SEC",
            "BIA_WATCH_EVENT_LIVE_SEED_COUNT",
            "BIA_WATCH_EVENT_MATCH_SCAN_LIMIT",
            "BIA_WATCH_EVENT_PREFETCH_COUNT",
            "BIA_WATCH_EVENT_HOT_CANDIDATE_CAP",
        ])
        assert cfg.BIA_WATCH_HCAPS_WARMUP_SEC == 3.0
        assert cfg.BIA_WATCH_HCAPS_BATCH_SIZE == 50
        assert cfg.BIA_WATCH_HCAPS_FLUSH_SEC == 1.5
        assert cfg.BIA_WATCH_EVENT_WARMUP_SEC == 3.0
        assert cfg.BIA_WATCH_EVENT_BATCH_SIZE == 25
        assert cfg.BIA_WATCH_EVENT_FLUSH_SEC == 1.0
        assert cfg.BIA_WATCH_EVENT_LIVE_SEED_SEC == 5.0
        assert cfg.BIA_WATCH_EVENT_LIVE_SEED_COUNT == 25
        assert cfg.BIA_WATCH_EVENT_MATCH_SCAN_LIMIT == 5000
        assert cfg.BIA_WATCH_EVENT_PREFETCH_COUNT == 50
        assert cfg.BIA_WATCH_EVENT_HOT_CANDIDATE_CAP == 50

    # ── VERIFY exact-price shadow ───────────────────────────────────────
    def test_verify_exact_price_disabled_by_default(self, monkeypatch):
        """Shadow exact-price verify must stay opt-in until rollout is complete."""
        cfg = _reload_config_clean(monkeypatch, ["PS3838_VERIFY_EXACT_PRICE_ENABLED"])
        assert cfg.PS3838_VERIFY_EXACT_PRICE_ENABLED is False

    def test_verify_exact_price_still_requires_request_flag_by_default(self, monkeypatch):
        """Even when enabled later, exact-price should require an explicit request by default."""
        cfg = _reload_config_clean(monkeypatch, ["PS3838_VERIFY_EXACT_PRICE_REQUIRE_FLAG"])
        assert cfg.PS3838_VERIFY_EXACT_PRICE_REQUIRE_FLAG is True

    # ── PINNACLE_WS env override ──────────────────────────────────────
    def test_pinnacle_ws_accepts_env_override(self, monkeypatch):
        """PINNACLE_WS must be overridable via PINNACLE_WS_URL env var."""
        custom = "ws://10.0.0.1:9999/feed"
        monkeypatch.setenv("PINNACLE_WS_URL", custom)
        cfg = _reload_config_clean(monkeypatch, [])
        assert cfg.PINNACLE_WS == custom

    def test_pinnacle_ws_has_safe_default(self, monkeypatch):
        """Without env override, PINNACLE_WS uses built-in default."""
        cfg = _reload_config_clean(monkeypatch, ["PINNACLE_WS_URL"])
        assert cfg.PINNACLE_WS.startswith("ws://")
        assert "/output" in cfg.PINNACLE_WS

    # ── ONLY_LIVE / ONLY_PREMATCH ─────────────────────────────────────
    def test_only_live_on_by_default(self, monkeypatch):
        cfg = _reload_config_clean(monkeypatch, ["PS3838_ONLY_LIVE"])
        assert cfg.PS3838_ONLY_LIVE is True

    def test_only_prematch_off_by_default(self, monkeypatch):
        cfg = _reload_config_clean(monkeypatch, ["PS3838_ONLY_PREMATCH"])
        assert cfg.PS3838_ONLY_PREMATCH is False

    # ── Safety-critical stale guard ───────────────────────────────────
    def test_drop_stale_updates_on_by_default(self, monkeypatch):
        """PS3838_DROP_STALE_UPDATES=1 is CRITICAL; must never ship as 0."""
        cfg = _reload_config_clean(monkeypatch, ["PS3838_DROP_STALE_UPDATES"])
        assert cfg.PS3838_DROP_STALE_UPDATES is True

    def test_auto_refresh_on_stale_on_by_default(self, monkeypatch):
        cfg = _reload_config_clean(monkeypatch, ["PS3838_AUTO_REFRESH_ON_STALE"])
        assert cfg.PS3838_AUTO_REFRESH_ON_STALE is True

    # ── Topology coherence ────────────────────────────────────────────
    def test_default_topology_is_direct_ws_not_browser_tabs(self, monkeypatch):
        """Approved architecture: direct WS primary, browser tabs off by default."""
        cfg = _reload_config_clean(monkeypatch, [
            "PS3838_SITE_PROFILE",
            "PS3838_TRANSPORT_BACKEND",
            "PS3838_USE_BROWSER_WS",
        ])
        assert cfg.PS3838_SITE_PROFILE == "pin888"
        assert cfg.PS3838_TRANSPORT_BACKEND == "legacy"
        assert cfg.PS3838_USE_BROWSER_WS is False

    # ── Hybrid HTTP fallback off by default ───────────────────────────
    def test_hybrid_enabled_off_by_default(self, monkeypatch):
        """HTTP compact/events fallback is manual opt-in, default OFF."""
        cfg = _reload_config_clean(monkeypatch, ["PS3838_HYBRID_ENABLED"])
        assert cfg.PS3838_HYBRID_ENABLED is False

    # ── dotenv override semantics ─────────────────────────────────────
    def test_dotenv_uses_override_false(self, monkeypatch):
        """load_dotenv(override=False) so tooling env overlays take precedence."""
        import config as cfg_module
        import inspect
        source = inspect.getsource(cfg_module)
        assert "load_dotenv(override=True)" not in source
        assert "load_dotenv(override=False)" in source

    # ── 1015 auto-relaunch disabled by default ────────────────────────
    def test_1015_auto_relaunch_disabled_by_default(self, monkeypatch):
        """HYBRID_SPEC: automatic browser/hybrid relaunch after 1015 must be
        off by default (manual-only); require PS3838_HYBRID_DISABLE_1015_AUTO_RELAUNCH=0
        to opt in."""
        monkeypatch.delenv("PS3838_HYBRID_DISABLE_1015_AUTO_RELAUNCH", raising=False)
        import core.hybrid_runner as hr_mod
        import importlib
        importlib.reload(hr_mod)
        assert hr_mod.DISABLE_1015_AUTO_RELAUNCH is True

    def test_fatal_1015_force_exit_enabled_by_default(self, monkeypatch):
        monkeypatch.delenv("PS3838_HYBRID_FORCE_EXIT_ON_FATAL_1015", raising=False)
        import core.hybrid_runner as hr_mod
        import importlib
        importlib.reload(hr_mod)
        assert hr_mod.FORCE_EXIT_ON_FATAL_1015 is True

    # ── Session-file default uses pin888 name ─────────────────────────
    def test_session_file_defaults_to_pin888(self, monkeypatch):
        """Session file default must use pin888_ws_session.json, not ps3838_ws_session.json."""
        cfg = _reload_config_clean(monkeypatch, ["PS3838_SESSION_FILE"])
        assert "pin888_ws_session.json" in cfg.SESSION_FILE
        assert "ps3838_ws_session.json" not in cfg.SESSION_FILE

    # ── Relaunch default parser port matches config ───────────────────
    def test_relaunch_default_parser_port_matches_config(self, monkeypatch):
        """core/runtime_relaunch DEFAULT_PARSER_PORT must match config.py SERVER_PORT default."""
        from core.runtime_relaunch import DEFAULT_PARSER_PORT
        cfg = _reload_config_clean(monkeypatch, ["PORT", "PS3838_SERVER_PORT"])
        assert DEFAULT_PARSER_PORT == cfg.SERVER_PORT

    # ── Hybrid runner default sports must be narrow ───────────────────
    def test_hybrid_runner_default_sports_is_narrow(self, monkeypatch):
        """HYBRID_SPEC §3.6: fallback starts narrow (soccer only), not 14-tab fanout."""
        from core.hybrid_runner import DEFAULT_SPORTS, NARROW_FALLBACK_SPORTS, ALL_SPORTS
        assert DEFAULT_SPORTS == NARROW_FALLBACK_SPORTS
        assert DEFAULT_SPORTS == [29]
        assert len(ALL_SPORTS) == 7

    # ── Relaunch must not force hybrid mode ───────────────────────────
    def test_relaunch_does_not_force_hybrid_backend(self, monkeypatch):
        """Relaunch must preserve current transport settings, not force hybrid_runner."""
        monkeypatch.delenv("PS3838_TRANSPORT_BACKEND", raising=False)
        monkeypatch.delenv("PS3838_HYBRID_ENABLED", raising=False)
        from tools.runtime_stack_relaunch import build_arg_parser, _build_runtime_env
        parser = build_arg_parser()
        args = parser.parse_args(["--cooldown-sec", "0"])
        env = _build_runtime_env(args)
        assert env.get("PS3838_TRANSPORT_BACKEND") != "hybrid_runner"
        assert env.get("PS3838_HYBRID_ENABLED") != "1"
