#!/usr/bin/env python3
"""Report aggregate feed health without printing event or account payloads."""

from __future__ import annotations

import argparse
import asyncio
import json
import time
from collections import Counter

import websockets


def summarize_payload(value: object, summary: Counter[str]) -> None:
    if isinstance(value, list):
        summary["event_items"] += len(value)
        sample = value[:20000]
    elif isinstance(value, dict):
        if any(field in value for field in ("Pid", "SportId", "sport", "_account")):
            summary["event_items"] += 1
            sample = [value]
        else:
            summary["event_items"] += len(value)
            sample = list(value.values())[:20000]
    else:
        return
    for item in sample:
        if not isinstance(item, dict):
            continue
        for field in ("_account", "account", "account_id"):
            account = item.get(field)
            if isinstance(account, str) and account:
                summary[f"account:{account[:40]}"] += 1
                break
        for field in ("sport", "sport_name", "sportName"):
            sport = item.get(field)
            if isinstance(sport, str) and sport:
                summary[f"sport:{sport[:40]}"] += 1
                break
        sport_id = item.get("SportId")
        if isinstance(sport_id, int):
            summary[f"sport_id:{sport_id}"] += 1


async def probe(url: str, seconds: float, max_frames: int) -> dict[str, object]:
    summary: Counter[str] = Counter()
    frames = 0
    deadline = time.monotonic() + seconds
    error = None
    try:
        async with websockets.connect(url, max_size=32 * 1024 * 1024) as websocket:
            while frames < max_frames and time.monotonic() < deadline:
                timeout = max(0.1, min(5.0, deadline - time.monotonic()))
                try:
                    raw = await asyncio.wait_for(websocket.recv(), timeout=timeout)
                except asyncio.TimeoutError:
                    continue
                frames += 1
                try:
                    message = json.loads(raw)
                except (TypeError, ValueError):
                    summary["non_json"] += 1
                    continue
                if not isinstance(message, dict):
                    summary["non_object"] += 1
                    continue
                for field in ("source", "source_family", "provider"):
                    source = message.get(field)
                    if isinstance(source, str) and source:
                        summary[f"{field}:{source[:40]}"] += 1
                for field in ("_account", "account", "account_id"):
                    account = message.get(field)
                    if isinstance(account, str) and account:
                        summary[f"account:{account[:40]}"] += 1
                        break
                summary[f"stale:{message.get('stale')}"] += 1
                count = message.get("count")
                if isinstance(count, int):
                    summary["reported_count_total"] += count
                    summary["reported_count_max"] = max(summary["reported_count_max"], count)
                for field in ("events", "data", "payload"):
                    if field in message:
                        summarize_payload(message[field], summary)
                        break
    except Exception as exc:  # only the class is reported; payloads stay private
        error = type(exc).__name__
    return {
        "frames": frames,
        "error": error,
        "summary": sorted(summary.items()),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="ws://127.0.0.1:19014")
    parser.add_argument("--seconds", type=float, default=30.0)
    parser.add_argument("--max-frames", type=int, default=100)
    args = parser.parse_args()
    print(json.dumps(asyncio.run(probe(args.url, args.seconds, args.max_frames)), sort_keys=True))


if __name__ == "__main__":
    main()
