#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path

forbidden = re.compile(
    r"pinnacle|ps3838|parse_serge|pin888|verify-ps3838|(?::|localhost:)(?:8769|9012|9110|9111)\b",
    re.I,
)


def sanitize(path: Path) -> None:
    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    output: list[str] = []
    index = 0
    while index < len(lines):
        line = lines[index]
        if re.match(r"^\s*location\b", line):
            block = [line]
            depth = line.count("{") - line.count("}")
            index += 1
            while index < len(lines) and depth > 0:
                current = lines[index]
                block.append(current)
                depth += current.count("{") - current.count("}")
                index += 1
            if forbidden.search("".join(block)):
                while output and (not output[-1].strip() or output[-1].lstrip().startswith("#")):
                    if output[-1].lstrip().startswith("#") and not forbidden.search(output[-1]):
                        break
                    output.pop()
                if output and output[-1].strip():
                    output.append("\n")
                continue
            output.extend(block)
            continue
        if line.lstrip().startswith("#") and forbidden.search(line):
            index += 1
            continue
        output.append(line)
        index += 1
    path.write_text("".join(output), encoding="utf-8")


for argument in sys.argv[1:]:
    sanitize(Path(argument))
