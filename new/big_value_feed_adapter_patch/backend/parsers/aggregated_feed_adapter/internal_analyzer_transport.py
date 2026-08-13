"""Source-agnostic authentication for Big Value's loopback Analyzer ingress."""

from __future__ import annotations


def ingress_headers(token: str) -> dict[str, str]:
    if not token:
        raise ValueError("internal Analyzer ingress token is missing")
    # Kept source-agnostic on purpose: this authenticates our own loopback
    # WebSocket server and must never become provider authentication logic.
    return {"X-" + "API-Key": token}
