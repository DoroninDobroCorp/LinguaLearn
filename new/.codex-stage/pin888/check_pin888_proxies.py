#!/usr/bin/env python3
"""Fail-closed SOCKS5 health gate for Pin888 browser accounts."""

from __future__ import annotations

import argparse
import socket
import struct
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ProxyRoute:
    host: str
    port: int
    username: str
    password: str


def parse_routes(path: Path) -> list[ProxyRoute]:
    routes: list[ProxyRoute] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(":")
        if len(parts) != 4:
            raise ValueError("proxy row must be host:port:user:password")
        host, port, username, password = (part.strip() for part in parts)
        if not host or not username or not password:
            raise ValueError("proxy host and authentication are required")
        routes.append(ProxyRoute(host, int(port), username, password))
    if not routes:
        raise ValueError("no proxy routes configured")
    return routes


def _recv_exact(sock: socket.socket, size: int) -> bytes:
    chunks: list[bytes] = []
    remaining = size
    while remaining:
        chunk = sock.recv(remaining)
        if not chunk:
            raise ConnectionError("proxy closed the health-check connection")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def probe_route(
    route: ProxyRoute,
    *,
    timeout: float = 8.0,
    target_host: str = "1.1.1.1",
    target_port: int = 443,
) -> None:
    username = route.username.encode("utf-8")
    password = route.password.encode("utf-8")
    if not 0 < len(username) <= 255 or not 0 < len(password) <= 255:
        raise ValueError("SOCKS5 credentials exceed protocol limits")
    with socket.create_connection((route.host, route.port), timeout=timeout) as sock:
        sock.settimeout(timeout)
        sock.sendall(b"\x05\x01\x02")
        if _recv_exact(sock, 2) != b"\x05\x02":
            raise ConnectionError("proxy did not select username/password auth")
        sock.sendall(
            b"\x01"
            + bytes((len(username),))
            + username
            + bytes((len(password),))
            + password
        )
        if _recv_exact(sock, 2) != b"\x01\x00":
            raise ConnectionError("proxy authentication failed")

        target_ip = socket.inet_aton(target_host)
        sock.sendall(b"\x05\x01\x00\x01" + target_ip + struct.pack("!H", target_port))
        head = _recv_exact(sock, 4)
        if head[0] != 5 or head[1] != 0:
            raise ConnectionError("proxy CONNECT failed")
        atyp = head[3]
        if atyp == 1:
            _recv_exact(sock, 4)
        elif atyp == 3:
            _recv_exact(sock, _recv_exact(sock, 1)[0])
        elif atyp == 4:
            _recv_exact(sock, 16)
        else:
            raise ConnectionError("proxy returned an invalid address type")
        _recv_exact(sock, 2)


def check_all(path: Path, timeout: float) -> tuple[bool, list[str]]:
    try:
        routes = parse_routes(path)
    except Exception as exc:
        return False, [f"configuration:{type(exc).__name__}"]
    errors: list[str] = []
    for index, route in enumerate(routes, start=1):
        try:
            probe_route(route, timeout=timeout)
        except Exception as exc:
            errors.append(f"route#{index}:{type(exc).__name__}")
    return not errors, errors


def _systemctl(action: str, unit: str) -> None:
    subprocess.run(
        ["systemctl", action, unit],
        check=False,
        timeout=45,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--proxies", type=Path, required=True)
    parser.add_argument("--timeout", type=float, default=8.0)
    parser.add_argument("--manage-unit")
    parser.add_argument("--role-state", type=Path)
    args = parser.parse_args()

    ok, errors = check_all(args.proxies, args.timeout)
    if args.manage_unit:
        if ok and args.role_state and args.role_state.is_file():
            _systemctl("start", args.manage_unit)
        elif not ok:
            _systemctl("stop", args.manage_unit)
    if ok:
        print("pin888_proxy_preflight=ok")
        return 0
    print("pin888_proxy_preflight=failed " + ",".join(errors))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
