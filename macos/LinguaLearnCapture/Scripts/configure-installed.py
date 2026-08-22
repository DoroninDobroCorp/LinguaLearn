#!/usr/bin/python3
"""Atomically configure an installed LinguaLearn Capture agent from a secret env file."""

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
    token_source = parser.add_mutually_exclusive_group(required=True)
    token_source.add_argument("--secret-env")
    token_source.add_argument(
        "--token-stdin",
        action="store_true",
        help="read the capture token from standard input so it is not exposed in process arguments",
    )
    parser.add_argument("--api-url", required=True)
    parser.add_argument("--app-url", required=True)
    arguments = parser.parse_args()

    config_path = pathlib.Path(arguments.config).expanduser()
    if arguments.secret_env:
        secret_path = pathlib.Path(arguments.secret_env).expanduser()
        name, separator, token = secret_path.read_text(encoding="utf-8").strip().partition("=")
        if name != "CAPTURE_API_TOKEN" or separator != "=":
            raise SystemExit("Invalid CAPTURE_API_TOKEN env file")
    else:
        token = sys.stdin.readline().strip()
    if len(token) < 16:
        raise SystemExit("Capture token is unexpectedly short")

    document = json.loads(config_path.read_text(encoding="utf-8"))
    document["apiURL"] = arguments.api_url
    document["appURL"] = arguments.app_url
    document["bearerToken"] = token

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
