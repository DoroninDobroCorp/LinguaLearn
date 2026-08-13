import asyncio
import unittest
from unittest.mock import patch

import server


class CalculatorBasketReleaseTests(unittest.TestCase):
    def test_release_posts_exact_intent_to_gateway(self):
        calls = []

        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {"released": True, "released_count": 1, "deleted_betslips": 1}

        class FakeClient:
            def __init__(self, **kwargs):
                calls.append(("client", kwargs))

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, json=None, headers=None):
                calls.append(("post", url, json, headers))
                return FakeResponse()

        with patch.object(server, "BIA_GATEWAY_BASE", "http://127.0.0.1:8770"), patch.object(
            server.httpx,
            "AsyncClient",
            FakeClient,
        ):
            released = asyncio.run(server._release_pinnacle_verify_intent("intent-a"))

        self.assertTrue(released)
        post = next(call for call in calls if call[0] == "post")
        self.assertEqual(post[1], "http://127.0.0.1:8770/verify/release")
        self.assertEqual(post[2], {"intent_id": "intent-a"})
        self.assertEqual(post[3], server._pinnacle_api_headers())

    def test_release_failure_is_best_effort(self):
        class FailingClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, json=None, headers=None):
                raise server.httpx.ConnectError("gateway unavailable")

        with patch.object(server, "BIA_GATEWAY_BASE", "http://127.0.0.1:8770"), patch.object(
            server.httpx,
            "AsyncClient",
            lambda **kwargs: FailingClient(),
        ):
            released = asyncio.run(server._release_pinnacle_verify_intent("intent-a"))

        self.assertFalse(released)

    def test_release_waits_for_inflight_verify_of_same_intent(self):
        events = []

        class FakeResponse:
            status_code = 200

            def raise_for_status(self):
                return None

            def json(self):
                return {"released": True, "released_count": 1}

        async def scenario():
            verify_started = asyncio.Event()
            finish_verify = asyncio.Event()

            class FakeClient:
                def __init__(self, **_kwargs):
                    pass

                async def __aenter__(self):
                    return self

                async def __aexit__(self, exc_type, exc, tb):
                    return False

                async def post(self, url, json=None, headers=None):
                    if url.endswith("/verify"):
                        events.append("verify-start")
                        verify_started.set()
                        await finish_verify.wait()
                        events.append("verify-end")
                    else:
                        events.append("release")
                    return FakeResponse()

            with patch.object(server, "BIA_GATEWAY_BASE", "http://127.0.0.1:8770"), patch.object(
                server.httpx,
                "AsyncClient",
                FakeClient,
            ):
                verify_task = asyncio.create_task(server._pinnacle_calculator_verify_post({
                    "intent_id": "intent-serialized",
                }))
                await verify_started.wait()
                release_task = asyncio.create_task(
                    server._release_pinnacle_verify_intent("intent-serialized")
                )
                await asyncio.sleep(0)
                self.assertEqual(events, ["verify-start"])
                finish_verify.set()
                await asyncio.gather(verify_task, release_task)

        asyncio.run(scenario())

        self.assertEqual(events, ["verify-start", "verify-end", "release"])
        self.assertNotIn("intent-serialized", server._calculator_bia_intent_slots)


if __name__ == "__main__":
    unittest.main()
