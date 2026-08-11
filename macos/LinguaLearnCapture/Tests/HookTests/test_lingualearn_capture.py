from __future__ import annotations

import http.server
import json
import os
import stat
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path


PACKAGE_ROOT = Path(__file__).resolve().parents[2]
HOOK = PACKAGE_ROOT / "Hooks" / "lingualearn_capture.py"


class _LoopbackServer:
    def __init__(self, support_directory: Path, status: int):
        self.support_directory = support_directory
        self.status = status
        self.requests: list[dict[str, object]] = []
        owner = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_POST(self):  # noqa: N802 - BaseHTTPRequestHandler API
                length = int(self.headers.get("Content-Length", "0"))
                body = self.rfile.read(length)
                owner.requests.append(
                    {
                        "spooledBeforeRequest": bool(
                            list((owner.support_directory / "hook-inbox").glob("*.json"))
                        ),
                        "token": self.headers.get("X-LinguaLearn-Ingress-Token"),
                        "body": json.loads(body),
                    }
                )
                self.send_response(owner.status)
                self.send_header("Content-Length", "2")
                self.end_headers()
                self.wfile.write(b"{}")

            def log_message(self, _format, *_args):
                pass

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    @property
    def port(self) -> int:
        return int(self.server.server_address[1])

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *_args):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=1)


class DurableHookTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="lingualearn-hook-tests-")
        self.support = Path(self.temporary.name) / "LinguaLearnCapture"
        self.config = self.support / "config.json"

    def tearDown(self):
        self.temporary.cleanup()

    def write_config(self, port: int, token: str = "local-secret") -> None:
        self.support.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.config.write_text(
            json.dumps({"ingressPort": port, "ingressToken": token}), encoding="utf-8"
        )

    def run_hook(self, document: object, timeout: float = 2) -> tuple[subprocess.CompletedProcess, float]:
        environment = os.environ.copy()
        environment["LINGUALEARN_CAPTURE_CONFIG"] = str(self.config)
        started = time.monotonic()
        result = subprocess.run(
            [sys.executable, str(HOOK)],
            input=json.dumps(document, ensure_ascii=False).encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=environment,
            timeout=timeout,
            check=False,
        )
        return result, time.monotonic() - started

    def spool_files(self) -> list[Path]:
        return sorted((self.support / "hook-inbox").glob("*.json"))

    def test_spools_before_loopback_and_removes_only_after_202(self):
        with _LoopbackServer(self.support, 202) as server:
            self.write_config(server.port)
            result, elapsed = self.run_hook(
                {"turn_id": "turn-accepted", "prompt": "Yesterday I go home."}
            )

        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, b"")
        self.assertEqual(result.stderr, b"")
        self.assertLess(elapsed, 1)
        self.assertEqual(len(server.requests), 1)
        self.assertTrue(server.requests[0]["spooledBeforeRequest"])
        self.assertEqual(server.requests[0]["token"], "local-secret")
        self.assertEqual(server.requests[0]["body"]["eventId"], "turn-accepted")
        self.assertEqual(server.requests[0]["body"]["sourceApp"], "codex")
        self.assertIn("sentAt", server.requests[0]["body"])
        self.assertEqual(self.spool_files(), [])

    def test_200_duplicate_or_filtered_also_removes_spool(self):
        with _LoopbackServer(self.support, 200) as server:
            self.write_config(server.port)
            result, _ = self.run_hook({"turn_id": "turn-filtered", "prompt": "Thanks"})
        self.assertEqual(result.returncode, 0)
        self.assertEqual(len(server.requests), 1)
        self.assertEqual(self.spool_files(), [])

    def test_paused_or_full_response_retains_mode_0600_spool(self):
        with _LoopbackServer(self.support, 503) as server:
            self.write_config(server.port)
            result, elapsed = self.run_hook(
                {"turn_id": "turn-paused", "prompt": "I will return later."}
            )
        self.assertEqual(result.returncode, 0)
        self.assertLess(elapsed, 1)
        files = self.spool_files()
        self.assertEqual(len(files), 1)
        self.assertEqual(stat.S_IMODE(files[0].stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(files[0].parent.stat().st_mode), 0o700)

    def test_missing_agent_or_config_is_fast_fail_open_and_keeps_spool(self):
        result, elapsed = self.run_hook(
            {"turn_id": "turn-offline", "prompt": "The agent is not running."}
        )
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, b"")
        self.assertEqual(result.stderr, b"")
        self.assertLess(elapsed, 1)
        files = self.spool_files()
        self.assertEqual(len(files), 1)
        payload = json.loads(files[0].read_text(encoding="utf-8"))
        self.assertEqual(payload["eventId"], "turn-offline")

    def test_repeated_turn_preserves_first_payload_and_invalid_input_does_not_spool(self):
        self.write_config(1)
        first, _ = self.run_hook({"turn_id": "turn-retry", "prompt": "Please retry this."})
        self.assertEqual(first.returncode, 0)
        file = self.spool_files()[0]
        first_body = file.read_bytes()
        first_mtime = file.stat().st_mtime_ns

        second, _ = self.run_hook({"turn_id": "turn-retry", "prompt": "Please retry this."})
        self.assertEqual(second.returncode, 0)
        self.assertEqual(file.read_bytes(), first_body)
        self.assertEqual(file.stat().st_mtime_ns, first_mtime)

        invalid, _ = self.run_hook({"turn_id": "", "prompt": "Ignored."})
        self.assertEqual(invalid.returncode, 0)
        self.assertEqual(len(self.spool_files()), 1)


if __name__ == "__main__":
    unittest.main()
