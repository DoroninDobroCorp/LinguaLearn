import json

import core.connection as connection
import core.session_manager as session_manager
import ps3838_server


def test_read_runtime_lock_returns_empty_dict_for_invalid_payload(tmp_path):
    lock_path = tmp_path / "runtime.lock"
    lock_path.write_text("{not-json", encoding="utf-8")

    assert ps3838_server._read_runtime_lock(lock_path) == {}


def test_sync_x_app_data_with_ulp_preserves_invalid_json_object_string():
    raw = "{not-json"

    assert connection._sync_x_app_data_with_ulp(raw, []) == raw


def test_load_auth_cooldown_payload_removes_invalid_file(tmp_path, monkeypatch):
    cooldown_file = tmp_path / "auth_cooldown.json"
    cooldown_file.write_text("{broken", encoding="utf-8")
    monkeypatch.setattr(session_manager, "PS3838_AUTH_COOLDOWN_FILE", str(cooldown_file))

    assert session_manager._load_auth_cooldown_payload() is None
    assert cooldown_file.exists() is False


def test_fix_ws_url_tolerates_non_mapping_cookie_entries():
    ws_url = "wss://example.com/ws?ulp=undefined"
    cookies = [None, "bad-cookie", {"name": "_ulp", "value": "ULP123"}]

    assert "ULP123" in session_manager._fix_ws_url(ws_url, cookies)


def test_build_cookie_header_filters_out_foreign_domains():
    cookie_header = session_manager._build_cookie_header(
        [
            {"name": "JSESSIONID", "value": "js", "domain": ".pinnacle888.com"},
            {"name": "_ulp", "value": "ulp", "domain": "www.pinnacle888.com"},
            {"name": "NID", "value": "google", "domain": ".google.com"},
            {"name": "hostOnly", "value": "1"},
        ],
        "www.pinnacle888.com",
    )

    assert "JSESSIONID=js" in cookie_header
    assert "_ulp=ulp" in cookie_header
    assert "hostOnly=1" in cookie_header
    assert "NID=google" not in cookie_header


def test_refresh_ws_url_from_current_session_handles_invalid_snapshot(monkeypatch):
    def _raise_invalid_json():
        raise json.JSONDecodeError("bad json", "{broken", 1)

    monkeypatch.setattr(connection, "load_session_raw", _raise_invalid_json)
    monkeypatch.setattr(connection, "PS3838_SITE_AUTH_MODE", "rest")

    assert connection._refresh_ws_url_from_current_session() is False


def test_build_ws_url_with_token_tolerates_non_mapping_cookie_entries():
    ws_url = session_manager.build_ws_url_with_token(
        "TOKEN123",
        [None, "bad-cookie", {"name": "_ulp", "value": "ULP123"}],
    )

    assert "TOKEN123" in ws_url
    assert "ULP123" in ws_url
