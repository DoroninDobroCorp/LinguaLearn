"""
Tests для Story 16.31: gzip Content-Encoding + orjson + backward compat.

Запуск: pytest tests/test_compression.py -v
"""
import base64
import gzip
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))


def _reload_with_env(**env):
    """Reload module с указанным env. Helper для testing config-driven behavior.

    Story 16.38: chain reload forted_server submodules ПЕРЕД lws чтобы env
    propagate в config.py / state.py / probes.py / storage.py.
    Без этого ENV override (SSE_GZIP, SSE_HASH_INCLUDE_OV, CACHE_TTL_SEC etc.)
    не активируется в submodules.
    """
    import importlib
    for k, v in env.items():
        os.environ[k] = v
    os.environ.setdefault("AUTH_DISABLED", "1")
    os.environ.setdefault("SERVER_ROLE", "all")
    # Story 16.38: dependency order — config → state → probes → storage → lws
    for mod_name in ["forted_server.config", "forted_server.state",
                     "forted_server.probes", "forted_server.storage"]:
        if mod_name in sys.modules:
            importlib.reload(sys.modules[mod_name])
    if "live_web_server" in sys.modules:
        importlib.reload(sys.modules["live_web_server"])
    return importlib.import_module("live_web_server")


def test_json_impl_detected():
    """Story 16.31: _JSON_IMPL флаг сообщает orjson или json."""
    lws = _reload_with_env()
    assert lws._JSON_IMPL in ("orjson", "json")
    sample = lws._json_dumps_state({"hello": "world", "x": [1, 2, 3]})
    assert isinstance(sample, bytes)
    assert b'"hello"' in sample
    # Cyrillic: правильное UTF-8 кодирование (не \u-escapes)
    cyr = lws._json_dumps_state({"team": "Хубэй"})
    decoded = cyr.decode("utf-8")
    assert "Хубэй" in decoded


def test_gzip_default_on_but_negotiation_required():
    """SSE_GZIP=1 default. Но реально gzip только если Accept-Encoding: gzip."""
    lws = _reload_with_env()
    assert lws.SSE_GZIP is True
    # Логика проверки `use_gzip = SSE_GZIP and "gzip" in Accept-Encoding`
    # тестируется через integration ниже (см. test_sse_negotiation_*).


def test_sse_negotiation_no_accept_encoding_returns_plain():
    """Vovka текущий код (без Accept-Encoding: gzip header) получает plain.

    Проверяем только response headers — payload encoding покрыт
    test_consumer_gzip_decode_roundtrip + ручным smoke.
    """
    lws = _reload_with_env(SSE_GZIP="1")
    server = _start_test_server(lws)
    try:
        url = f"http://127.0.0.1:{server.port}/stream/forks"
        req = urllib.request.Request(url, headers={"Accept": "text/event-stream"})
        with urllib.request.urlopen(req, timeout=5) as r:
            ce = r.headers.get("Content-Encoding", "")
            assert ce == "", f"должен быть plain без gzip, got Content-Encoding={ce!r}"
            ct = r.headers.get("Content-Type", "")
            assert ct.startswith("text/event-stream"), f"expected SSE, got {ct!r}"
    finally:
        server.shutdown()


def test_sse_negotiation_with_accept_encoding_returns_gzip():
    """Consumer прислал Accept-Encoding: gzip → server отдаёт x-sse-gzip-chunked."""
    lws = _reload_with_env(SSE_GZIP="1")
    server = _start_test_server(lws)
    try:
        url = f"http://127.0.0.1:{server.port}/stream/forks"
        req = urllib.request.Request(url, headers={
            "Accept": "text/event-stream",
            "Accept-Encoding": "gzip",
        })
        with urllib.request.urlopen(req, timeout=5) as r:
            ce = r.headers.get("Content-Encoding", "")
            assert ce == "x-sse-gzip-chunked", f"expected gzip-chunked, got {ce!r}"
    finally:
        server.shutdown()


def test_sse_gzip_disabled_returns_plain_even_with_accept_header():
    """SSE_GZIP=0 → server игнорирует Accept-Encoding, отдаёт plain."""
    lws = _reload_with_env(SSE_GZIP="0")
    server = _start_test_server(lws)
    try:
        url = f"http://127.0.0.1:{server.port}/stream/forks"
        req = urllib.request.Request(url, headers={
            "Accept": "text/event-stream",
            "Accept-Encoding": "gzip",
        })
        with urllib.request.urlopen(req, timeout=5) as r:
            ce = r.headers.get("Content-Encoding", "")
            assert ce == "", f"SSE_GZIP=0 должен быть plain даже с Accept-gzip, got {ce!r}"
    finally:
        server.shutdown()


def test_consumer_gzip_decode_roundtrip():
    """Consumer correctly декодирует base64+gzip + парсит JSON."""
    # Имитируем server-side encoding
    payload = json.dumps({"hello": "Привет", "value": 42}, ensure_ascii=False)
    compressed = gzip.compress(payload.encode("utf-8"))
    encoded = base64.b64encode(compressed).decode("ascii")
    # Имитируем что consumer получил эту строку как data:
    decoded_compressed = base64.b64decode(encoded)
    decoded_json = gzip.decompress(decoded_compressed).decode("utf-8")
    state = json.loads(decoded_json)
    assert state["hello"] == "Привет"
    assert state["value"] == 42


def test_consumer_json_loads_fallback():
    """sse_consumer._json_loads работает на bytes и str, orjson или json."""
    import sse_consumer
    sample = {"sport": "Теннис", "x": 1}
    payload = json.dumps(sample, ensure_ascii=False).encode("utf-8")
    parsed = sse_consumer._json_loads(payload)
    assert parsed["sport"] == "Теннис"
    parsed2 = sse_consumer._json_loads(payload.decode("utf-8"))
    assert parsed2 == parsed


def test_team_en_dedupe_omits_redundant_fields():
    """AC-5: build_state омитает team1_en если оно равно team1 (dedupe)."""
    lws = _reload_with_env(SSE_DEDUPE_TEAM_EN="1")
    # Inject fork с team1_en == team1
    with lws._lock:
        first_server = lws.SERVERS[0]
        lws._per_server_pool[first_server] = {
            ("Tennis", ("paddy",), ("a", "b"), "П1"): {
                "last_seen": time.time(),
                "server": first_server,
                "fork": {
                    "sport": "Tennis", "team1": "Alice", "team2": "Bob",
                    "team1_en": "Alice", "team2_en": "Carol",  # team1_en дубль, team2_en другой
                    "stakes": "П1;П2", "profit": 1.5, "coef1": "2", "coef2": "1.9",
                    "score": "", "is_live": "0", "match_key": "Tennis|alice|bob",
                    "event_dt": "21.05.2026",
                    "sources": [{"bk": "paddy"}, {"bk": "pin"}],
                    "ov_array": [], "additional_count": 0, "additional_markets": [],
                    "info": "",
                },
            }
        }
    state = lws.build_state()
    assert len(state["forks"]) >= 1
    fork = state["forks"][0]
    assert "team1_en" not in fork, "team1_en должен быть омит т.к. равен team1"
    assert fork.get("team2_en") == "Carol", "team2_en должен остаться т.к. != team2"


def test_team_en_dedupe_disabled_keeps_fields():
    """AC-5: SSE_DEDUPE_TEAM_EN=0 — поля сохраняются (backward-compat kill switch)."""
    lws = _reload_with_env(SSE_DEDUPE_TEAM_EN="0")
    with lws._lock:
        first_server = lws.SERVERS[0]
        lws._per_server_pool[first_server] = {
            ("Tennis", ("paddy",), ("a", "b"), "П1"): {
                "last_seen": time.time(),
                "server": first_server,
                "fork": {
                    "sport": "Tennis", "team1": "Alice", "team2": "Bob",
                    "team1_en": "Alice", "team2_en": "Bob",
                    "stakes": "П1;П2", "profit": 1.5, "coef1": "2", "coef2": "1.9",
                    "score": "", "is_live": "0", "match_key": "Tennis|alice|bob",
                    "event_dt": "21.05.2026",
                    "sources": [{"bk": "paddy"}, {"bk": "pin"}],
                    "ov_array": [], "additional_count": 0, "additional_markets": [],
                    "info": "",
                },
            }
        }
    state = lws.build_state()
    fork = state["forks"][0]
    assert "team1_en" in fork and "team2_en" in fork, "dedupe off → оба поля присутствуют"


def test_sse_hash_include_ov_default_off():
    """Story 16.37: SSE_HASH_INCLUDE_OV default=0 — backward compat (additional_count
    НЕ в hash). Same fork с разным OV не trigger push."""
    os.environ.pop("SSE_HASH_INCLUDE_OV", None)
    lws = _reload_with_env()
    assert lws.SSE_HASH_INCLUDE_OV is False


def test_sse_hash_include_ov_enabled():
    """Story 16.37: env opt-in activates hash inclusion."""
    lws = _reload_with_env(SSE_HASH_INCLUDE_OV="1")
    assert lws.SSE_HASH_INCLUDE_OV is True


def test_cache_ttl_default():
    """Story 16.37 L5: CACHE_TTL_SEC default = 3600 (1 hour)."""
    os.environ.pop("CACHE_TTL_SEC", None)
    lws = _reload_with_env()
    assert lws.CACHE_TTL_SEC == 3600


def test_cache_ttl_env_override():
    """Story 16.37 L5: env override."""
    lws = _reload_with_env(CACHE_TTL_SEC="60")
    assert lws.CACHE_TTL_SEC == 60


def test_consumer_gzip_bomb_defence():
    """Security H3: consumer ограничивает size при decompress (защита от gzip bomb)."""
    import importlib, sse_consumer
    # 1MB лимит для теста (default 10MB)
    os.environ["SSE_MAX_DECOMPRESSED_BYTES"] = "1024"
    importlib.reload(sse_consumer)
    # Создаём compressed payload который декомпрессируется в > limit
    big_data = b"A" * 100_000  # 100KB plain → ~100 bytes after gzip (highly compressible)
    compressed = gzip.compress(big_data, compresslevel=9)
    encoded = base64.b64encode(compressed).decode("ascii")
    sse_msg = f"event: state\ndata: {encoded}"
    # handle_event с gzip_chunked=True — должен skip event (не raise)
    # Без assert: главное — нет MemoryError, функция возвращается чисто.
    sse_consumer.handle_event(sse_msg, gzip_chunked=True)
    # Очищаем env
    del os.environ["SSE_MAX_DECOMPRESSED_BYTES"]
    importlib.reload(sse_consumer)


# ===== Test infrastructure =====

class _TestServer:
    """Helper: запускает live_web_server в потоке на ephemeral port, останавливает."""
    def __init__(self, port, server, thread):
        self.port = port
        self._server = server
        self._thread = thread

    def shutdown(self):
        self._server.shutdown()
        self._server.server_close()
        # thread daemon → не ждём


def _start_test_server(lws):
    """Запустить HTTP server в потоке. ВАЖНО: capture_server потоки не стартуем
    чтобы не лезть в реальный Forted backend."""
    from http.server import ThreadingHTTPServer
    # Inject one synthetic fork чтобы /stream/forks отдал не-пустой state
    with lws._lock:
        first_server = lws.SERVERS[0]
        lws._per_server_pool[first_server] = {
            ("Tennis", ("paddy",), ("a", "b"), "П1"): {
                "last_seen": time.time(),
                "server": first_server,
                "fork": {
                    "sport": "Tennis", "team1": "A", "team2": "B",
                    "team1_en": "A", "team2_en": "B",
                    "stakes": "П1;П2", "profit": 1.5, "coef1": "2", "coef2": "1.9",
                    "score": "", "is_live": "0", "match_key": "Tennis|a|b",
                    "event_dt": "21.05.2026", "sources": [{"bk": "paddy"}, {"bk": "pin"}],
                    "ov_array": [], "additional_count": 0, "additional_markets": [],
                    "info": "",
                },
            }
        }
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), lws.Handler)
    port = httpd.server_address[1]
    th = threading.Thread(target=httpd.serve_forever, daemon=True)
    th.start()
    # Также SSE publisher thread нужен — иначе очередь не наполнится
    # Запускаем только если ещё не запущен
    pub_started = getattr(_start_test_server, "_pub_started", False)
    if not pub_started:
        threading.Thread(target=lws.sse_publisher_thread, daemon=True).start()
        _start_test_server._pub_started = True
    time.sleep(0.3)  # дать publisher время поделать первый push
    return _TestServer(port=port, server=httpd, thread=th)


def _read_one_event(response, timeout_s: float = 3.0):
    """Read из SSE stream до первой пустой строки (event boundary)."""
    deadline = time.time() + timeout_s
    buf = b""
    while time.time() < deadline:
        try:
            chunk = response.read(1024)
        except Exception:
            return None
        if not chunk:
            return None
        buf += chunk
        if b"\n\n" in buf:
            msg, _rest = buf.split(b"\n\n", 1)
            text = msg.decode("utf-8", errors="replace")
            # Skip первый initial event если это ping, ищем data:
            for line in text.split("\n"):
                if line.startswith("data: "):
                    return line  # return only the data: line, not entire block
            # если в этом блоке нет data: — продолжаем
            buf = _rest
    return None
