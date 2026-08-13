import unittest

from sender_analyzer import safe_endpoint


class SafeEndpointTest(unittest.TestCase):
    def test_removes_query_fragment_and_userinfo(self):
        self.assertEqual(
            safe_endpoint("ws://name:password@analyzer:7100/path?api_key=secret#fragment"),
            "ws://analyzer:7100/path",
        )

    def test_preserves_ipv6_endpoint(self):
        self.assertEqual(
            safe_endpoint("wss://[2001:db8::1]:7443/feed?token=secret"),
            "wss://[2001:db8::1]:7443/feed",
        )


if __name__ == "__main__":
    unittest.main()
