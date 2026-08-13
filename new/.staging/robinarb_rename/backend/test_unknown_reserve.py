"""Mocked tests: UNKNOWN/PENDING must keep RobinArb balance reserved."""
import os
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

os.environ["FORTED_ENABLED"] = "0"
os.environ["FORTED_FEED_URL"] = ""
os.environ["FORTED_FEED_USE_SSE"] = "0"
os.environ["FORTED_FEED_STREAM_URL"] = ""
os.environ["FORTED_LWS_TOKEN"] = ""
os.environ["ROBINARB_ALLOW_MOCK_FALLBACK"] = "1"
os.environ["ROBINARB_ALLOW_DEMO_USERS"] = "1"
os.environ["ROBINARB_CORS_ORIGINS"] = ""
os.environ["ROBINARB_FEED_KEYS"] = ""
os.environ["ROBINARB_STATS_ENABLED"] = "0"
os.environ["PIN888_STREAM_CACHE_ENABLED"] = "0"

_TEST_RUNTIME = tempfile.TemporaryDirectory()
os.environ["ROBINARB_STATE_DB"] = os.path.join(_TEST_RUNTIME.name, "state.db")
os.environ["ROBINARB_LIMITS_HISTORY_FILE"] = os.path.join(_TEST_RUNTIME.name, "match_history.json")

from fastapi.testclient import TestClient

import server


def _reset_test_storage(users):
    with server._storage._lock:  # noqa: SLF001
        conn = server._storage._connect()  # noqa: SLF001
        conn.execute("DELETE FROM bets")
        conn.execute("DELETE FROM hidden_arbs")
        conn.execute("DELETE FROM meta")
        conn.execute("DELETE FROM users")
    for user in users.values():
        server._storage.upsert_user(user)


class UnknownReserveTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        server.ROBINARB_ALLOW_DEMO_USERS = True
        server._users = server._build_initial_user_state()
        _reset_test_storage(server._users)
        server._sessions.clear()
        self.client = TestClient(server.app)

    def login(self, username="owner", password="owner123"):
        resp = self.client.post("/api/login", json={"username": username, "password": password})
        self.assertEqual(resp.status_code, 200, resp.text)
        token = resp.json().get("token") or resp.json().get("access_token")
        if not token:
            # cookie session fallback
            return {}
        return {"Authorization": f"Bearer {token}"}

    async def test_place_pinnacle_via_service_unknown_not_http_exception(self):
        body = {"status": "UNKNOWN", "error_code": "BIA_ORDER_RECONCILIATION_REQUIRED"}
        class FakeResp:
            def raise_for_status(self):
                return None
            def json(self):
                return body
        with patch.object(server, "_pinnacle_service_post", AsyncMock(return_value=FakeResp())):
            with patch.object(server, "BIA_GATEWAY_BASE", "http://example.invalid"):
                result = await server._place_pinnacle_via_service(
                    {"id": "a1", "bk1_odds": 2.0},
                    {"odds": 2.0},
                    stake=10.0,
                    expected_odds=2.0,
                )
        self.assertEqual(result["status"], "UNKNOWN")
        self.assertTrue(result.get("reconciliation_required"))

    async def test_place_pinnacle_via_service_pending_keeps_status(self):
        body = {"status": "PENDING", "order_id": "o1"}
        class FakeResp:
            def raise_for_status(self):
                return None
            def json(self):
                return body
        with patch.object(server, "_pinnacle_service_post", AsyncMock(return_value=FakeResp())):
            with patch.object(server, "BIA_GATEWAY_BASE", "http://example.invalid"):
                result = await server._place_pinnacle_via_service(
                    {"id": "a1", "bk1_odds": 2.0},
                    {"odds": 2.0},
                    stake=10.0,
                    expected_odds=2.0,
                )
        self.assertEqual(result["status"], "PENDING")
        self.assertTrue(result.get("reconciliation_required"))

    async def test_place_pinnacle_5xx_returns_unknown_not_raise(self):
        import httpx
        request = httpx.Request("POST", "http://example.invalid/place")
        response = httpx.Response(503, request=request, text="down")
        exc = httpx.HTTPStatusError("503", request=request, response=response)

        async def boom(*args, **kwargs):
            raise exc

        with patch.object(server, "_pinnacle_service_post", boom):
            with patch.object(server, "BIA_GATEWAY_BASE", "http://example.invalid"):
                result = await server._place_pinnacle_via_service(
                    {"id": "a1", "bk1_odds": 2.0},
                    {"odds": 2.0},
                    stake=10.0,
                    expected_odds=2.0,
                )
        self.assertEqual(result["status"], "UNKNOWN")
        self.assertTrue(result.get("reconciliation_required"))


if __name__ == "__main__":
    unittest.main()
