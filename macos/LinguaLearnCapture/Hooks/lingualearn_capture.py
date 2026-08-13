#!/usr/bin/python3
"""Durable, bounded Codex UserPromptSubmit handoff to LinguaLearn Capture.

The prompt is atomically spooled before the best-effort loopback request.  A running agent removes
the spool file indirectly by acknowledging 200/202; otherwise the next/periodic agent import owns
delivery.  Every failure is deliberately fail-open for Codex.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
import socket
import sys
import tempfile
import time
from pathlib import Path
from typing import Any


MAX_INPUT_BYTES = 256 * 1024
MAX_PROMPT_CHARACTERS = 64_000
MAX_STATUS_BYTES = 4_096
HANDOFF_BUDGET_SECONDS = 0.65
SOCKET_STEP_TIMEOUT_SECONDS = 0.20
SAFE_EVENT_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$")


def configuration_path() -> Path:
    override = os.environ.get("LINGUALEARN_CAPTURE_CONFIG")
    if override:
        return Path(override).expanduser()
    return Path.home() / "Library" / "Application Support" / "LinguaLearnCapture" / "config.json"


def normalized_event_id(turn_id: str) -> str:
    candidate = turn_id.strip()
    if SAFE_EVENT_ID.fullmatch(candidate):
        return candidate
    return "codex-" + hashlib.sha256(turn_id.encode("utf-8")).hexdigest()


def utc_timestamp() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def capture_payload(hook_input: Any) -> dict[str, Any] | None:
    if not isinstance(hook_input, dict):
        return None
    prompt = hook_input.get("prompt")
    turn_id = hook_input.get("turn_id")
    if not isinstance(prompt, str) or not prompt or len(prompt) > MAX_PROMPT_CHARACTERS:
        return None
    if not isinstance(turn_id, str) or not turn_id.strip():
        return None
    return {
        "schemaVersion": 1,
        "eventId": normalized_event_id(turn_id),
        "sourceApp": "codex",
        "originalText": prompt,
        "text": prompt,
        # Persist this value with the event so every retry has the identical API payload.
        "sentAt": utc_timestamp(),
    }


def encoded_payload(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def _fsync_directory(directory: Path) -> None:
    descriptor = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _matching_existing_payload(target: Path, payload: dict[str, Any]) -> bytes | None:
    try:
        existing = target.read_bytes()
        document = json.loads(existing)
        if (
            isinstance(document, dict)
            and document.get("eventId") == payload["eventId"]
            and document.get("sourceApp") == payload["sourceApp"]
            and document.get("text") == payload["text"]
            and isinstance(document.get("sentAt"), str)
        ):
            return existing
    except (OSError, ValueError, TypeError):
        pass
    return None


def spool_payload(config_path: Path, payload: dict[str, Any]) -> tuple[Path, bytes]:
    inbox = config_path.parent / "hook-inbox"
    inbox.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(inbox, 0o700)
    filename = hashlib.sha256(payload["eventId"].encode("utf-8")).hexdigest() + ".json"
    target = inbox / filename

    # A retry of the same hook turn must preserve the original sentAt value.  This keeps the
    # backend's event-id/content binding stable even across process restarts.
    existing = _matching_existing_payload(target, payload)
    if existing is not None:
        os.chmod(target, 0o600)
        return target, existing

    body = encoded_payload(payload)
    descriptor, temporary_name = tempfile.mkstemp(prefix=".hook-", suffix=".tmp", dir=inbox)
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "wb", closefd=True) as handle:
            descriptor = -1
            handle.write(body)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, target)
        os.chmod(target, 0o600)
        _fsync_directory(inbox)
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
    return target, body


def read_loopback_configuration(config_path: Path) -> tuple[int, str]:
    document = json.loads(config_path.read_text(encoding="utf-8"))
    port = int(document.get("ingressPort", 43119))
    if not 1 <= port <= 65_535:
        raise ValueError("invalid ingress port")
    return port, str(document.get("ingressToken", ""))


def _remaining_timeout(deadline: float) -> float:
    return max(0.01, min(SOCKET_STEP_TIMEOUT_SECONDS, deadline - time.monotonic()))


def deliver_to_loopback(body: bytes, port: int, ingress_token: str) -> int | None:
    token_header = (
        f"X-LinguaLearn-Ingress-Token: {ingress_token}\r\n" if ingress_token else ""
    )
    request = (
        "POST /capture HTTP/1.1\r\n"
        "Host: 127.0.0.1\r\n"
        "Content-Type: application/json\r\n"
        f"Content-Length: {len(body)}\r\n"
        f"{token_header}"
        "Connection: close\r\n\r\n"
    ).encode("ascii") + body

    deadline = time.monotonic() + HANDOFF_BUDGET_SECONDS
    with socket.create_connection(
        ("127.0.0.1", port), timeout=_remaining_timeout(deadline)
    ) as connection:
        connection.settimeout(_remaining_timeout(deadline))
        connection.sendall(request)
        response = bytearray()
        while b"\r\n" not in response and len(response) < MAX_STATUS_BYTES:
            connection.settimeout(_remaining_timeout(deadline))
            chunk = connection.recv(min(512, MAX_STATUS_BYTES - len(response)))
            if not chunk:
                break
            response.extend(chunk)
        status_line = bytes(response).split(b"\r\n", 1)[0]
        match = re.fullmatch(rb"HTTP/\d(?:\.\d)?\s+(\d{3})(?:\s+.*)?", status_line)
        return int(match.group(1)) if match else None


def main() -> int:
    try:
        raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
        if len(raw) > MAX_INPUT_BYTES:
            return 0
        payload = capture_payload(json.loads(raw))
        if payload is None:
            return 0

        config_path = configuration_path()
        spool_file, body = spool_payload(config_path, payload)
        try:
            port, ingress_token = read_loopback_configuration(config_path)
            status = deliver_to_loopback(body, port, ingress_token)
        except Exception:
            status = None

        if status in (200, 202):
            try:
                spool_file.unlink()
                _fsync_directory(spool_file.parent)
            except FileNotFoundError:
                pass
        return 0
    except Exception:
        # Grammar capture must never block or add output to the Codex prompt.
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
