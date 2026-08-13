from tools.run_pin888_safe import build_env_overlay


def _make_args(**overrides):
    defaults = {
        "mode": "full",
        "lane_stagger_sec": 5.0,
        "session_settle_sec": None,
        "port": "9890",
        "sports": None,
        "btgs": None,
        "send_mode": None,
        "use_browser_ws": None,
        "combine_btgs": None,
        "http_snapshot_fallback": None,
    }
    defaults.update(overrides)
    return type("_Args", (), defaults)()


def test_pin888_safe_launcher_base_mode_uses_single_btg_overlay():
    overlay = build_env_overlay(_make_args(mode="base"))

    assert overlay["PS3838_SPORT_FO_LANE_STAGGER_SEC"] == "5.0"
    assert overlay["PS3838_SPORT_FO_BTGS"] == "1"
    assert overlay["PS3838_SPORT_FO_COMBINE_BTGS"] == "0"
    assert overlay["PS3838_STARTUP_SESSION_SETTLE_SEC"] == "0.0"
    assert overlay["PS3838_LOGIN_MIN_INTERVAL_SEC"] == "180"
    assert "PS3838_MORE_BET_ENABLED" not in overlay
    assert "PS3838_ALLOW_LEGACY_MORE_BET" not in overlay


def test_pin888_safe_launcher_browser_mode_keeps_runtime_narrow():
    overlay = build_env_overlay(_make_args(mode="browser"))

    assert overlay["PS3838_USE_BROWSER_WS"] == "1"
    assert overlay["PS3838_SPORT_FO_COMBINE_BTGS"] == "1"
    assert "PS3838_SPORT_FO_DEDICATED_MB_SOCKET" not in overlay
    assert "PS3838_MORE_BET_ENABLED" not in overlay


def test_pin888_safe_launcher_allows_disabling_http_snapshot_fallback():
    overlay = build_env_overlay(
        _make_args(mode="base", sports="29", http_snapshot_fallback="0")
    )

    assert overlay["PS3838_HTTP_SNAPSHOT_FALLBACK"] == "0"
    assert overlay["PS3838_SPORTS"] == "29"


def test_pin888_safe_launcher_applies_explicit_send_and_browser_overrides():
    overlay = build_env_overlay(
        _make_args(
            mode="full",
            send_mode="all",
            use_browser_ws="1",
            combine_btgs="0",
        )
    )

    assert overlay["PS3838_SEND_MODE"] == "all"
    assert overlay["PS3838_USE_BROWSER_WS"] == "1"
    assert overlay["PS3838_SPORT_FO_COMBINE_BTGS"] == "0"

