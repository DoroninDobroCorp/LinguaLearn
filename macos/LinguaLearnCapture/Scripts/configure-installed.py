#!/usr/bin/python3
"""Atomically configure an installed LinguaLearn Capture agent from a secret env file or arguments."""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import tempfile


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument(
        "--api-url",
        default="http://127.0.0.1:8318/v1/chat/completions",
        help="API URL for writing analysis (default: VibeProxy http://127.0.0.1:8318/v1/chat/completions)",
    )
    parser.add_argument(
        "--app-url",
        default="http://127.0.0.1:8318",
        help="App/base URL (default: http://127.0.0.1:8318)",
    )
    parser.add_argument(
        "--model",
        default="gemini-3.7-flash-high",
        help="Model name for VibeProxy (default: gemini-3.7-flash-high)",
    )
    token_source = parser.add_mutually_exclusive_group(required=False)
    token_source.add_argument("--secret-env")
    token_source.add_argument(
        "--token-stdin",
        action="store_true",
        help="read the capture token from standard input",
    )
    token_source.add_argument("--token", help="capture token")
    arguments = parser.parse_args()

    config_path = pathlib.Path(arguments.config).expanduser()
    token = ""
    if arguments.secret_env:
        secret_path = pathlib.Path(arguments.secret_env).expanduser()
        name, separator, token = secret_path.read_text(encoding="utf-8").strip().partition("=")
        if name != "CAPTURE_API_TOKEN" or separator != "=":
            raise SystemExit("Invalid CAPTURE_API_TOKEN env file")
    elif arguments.token_stdin:
        token = sys.stdin.readline().strip()
    elif arguments.token:
        token = arguments.token.strip()

    is_loopback = any(h in arguments.api_url for h in ("127.0.0.1", "localhost", "::1"))
    if not is_loopback and not token:
        raise SystemExit("Capture token is required for remote API URL")

    document = {}
    if config_path.exists():
        try:
            document = json.loads(config_path.read_text(encoding="utf-8"))
        except Exception:
            document = {}

    document["apiURL"] = arguments.api_url
    document["appURL"] = arguments.app_url
    document["model"] = arguments.model
    if token:
        document["bearerToken"] = token
    elif "bearerToken" not in document:
        document["bearerToken"] = ""

    config_path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(
        prefix="config.", suffix=".tmp", dir=config_path.parent
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(document, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, config_path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

    print("Installed capture configuration updated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
