import unittest

from internal_analyzer_transport import ingress_headers


class IngressHeadersTest(unittest.TestCase):
    def test_builds_internal_header(self):
        self.assertEqual(ingress_headers("token"), {"X-API-Key": "token"})

    def test_rejects_empty_token(self):
        with self.assertRaises(ValueError):
            ingress_headers("")


if __name__ == "__main__":
    unittest.main()
