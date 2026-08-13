#!/usr/bin/env bash
set -euo pipefail

repo_root="${1:-/srv/big_value}"

python3 - "$repo_root" <<'PY'
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
if not root.is_dir():
    print(f"ERROR: repository directory does not exist: {root}", file=sys.stderr)
    raise SystemExit(2)

skip_dirs = {
    ".git", ".next", "node_modules", "logs", "bundles", "__pycache__",
    ".pytest_cache", ".mypy_cache", "backups", "backup",
}
skip_names = {
    "AGENTS.md", "check_no_pinnacle_api.sh", "BIG_VALUE_RESTORATION_REPORT.md",
}
text_suffixes = {
    "", ".go", ".py", ".js", ".jsx", ".ts", ".tsx", ".sh", ".bash",
    ".json", ".yml", ".yaml", ".toml", ".ini", ".conf", ".config",
    ".env", ".service", ".socket", ".timer", ".html",
}

forbidden = [
    re.compile(r"guest\.api\.arcadia\.pinnacle\.com", re.I),
    re.compile(r"(?:^|[^a-z])api\.pinnacle\.com", re.I),
    re.compile(r"(?:^|[^a-z])api\.ps3838\.com", re.I),
    re.compile(r"\bPINNACLE_API_(?:LOGIN|PASSWORD|URL|KEY|TOKEN|ENABLED)\b", re.I),
    re.compile(r"\bPS3838_(?:EMAIL|PASSWORD|API_URL|API_KEY|VERIFY_URL)\b", re.I),
    re.compile(r"\bBET_SERVICE_URL\b", re.I),
    re.compile(r"\bpinnacleVerify(?:Url|Enabled)\b", re.I),
    re.compile(r"\bskipUnavailablePinnacle\b", re.I),
    re.compile(r"\bPS38_VERIFY_(?:ENABLED|MODE|URL)\b", re.I),
    re.compile(r"/pinnacle/(?:verify|place|balance)(?:\b|/)", re.I),
    re.compile(r"/verify-ps3838-bet(?:\b|/)", re.I),
    re.compile(r"pinnacle-verifier", re.I),
    re.compile(r"\bparse_(?:ps3838|serge|pin888)\b", re.I),
    re.compile(r"\b(?:pin888|ps38)-remote-fleet\b", re.I),
    re.compile(r"\bpin888-bet-service\b", re.I),
    re.compile(r"\bbv-central-pinnacle-(?:feed|live|prematch)\b", re.I),
    re.compile(r"\bssh-tunnel-bet-service(?:-night)?\b", re.I),
    re.compile(r"\bparser-duty-rotation\b", re.I),
]

path_forbidden = re.compile(
    r"(?:parse_ps3838|parse_serge|pinnacle-verifier|central_pinnacle_forwarder|"
    r"pin888-remote-fleet|ps38-remote-fleet|pin888-bet-service|"
    r"ssh-tunnel-bet-service|parser-duty-rotation)",
    re.I,
)

violations: list[tuple[str, int, str]] = []

for dirpath, dirnames, filenames in os.walk(root):
    dirnames[:] = [d for d in dirnames if d not in skip_dirs and not d.startswith(".remote_")]
    base = Path(dirpath)
    for name in filenames:
        path = base / name
        rel = path.relative_to(root).as_posix()
        if name in skip_names or name.endswith((".bak", ".backup", ".pyc")):
            continue
        if path_forbidden.search(rel):
            violations.append((rel, 0, "forbidden legacy path"))
        if path.suffix.lower() not in text_suffixes and not name.startswith(".env"):
            continue
        try:
            if path.stat().st_size > 5_000_000:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for pattern in forbidden:
            match = pattern.search(text)
            if match:
                line = text.count("\n", 0, match.start()) + 1
                violations.append((rel, line, f"forbidden pattern: {pattern.pattern}"))
        if re.search(r"pinnacle", text, re.I) and re.search(
            r"X-API-Key|Authorization\s*[:=]\s*['\"]?Basic|BasicAuth", text, re.I
        ):
            violations.append((rel, 0, "Pinnacle provider authentication material"))

unique = sorted(set(violations))
if unique:
    print("Pinnacle no-API policy violations:", file=sys.stderr)
    for rel, line, reason in unique:
        location = f"{rel}:{line}" if line else rel
        print(f"  - {location}: {reason}", file=sys.stderr)
    raise SystemExit(1)

print("OK: no forbidden Pinnacle API/runtime paths found")
PY
