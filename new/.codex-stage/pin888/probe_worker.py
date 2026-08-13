#!/usr/bin/env python3
"""Run one Pin888 fleet worker without publishing data to the aggregator."""

from __future__ import annotations

import argparse
import asyncio
import json

from aggregator.account_runtime_loader import load_ps3838_runtime_bundles
from aggregator.fleet.worker import Worker


async def _probe(args: argparse.Namespace) -> int:
    bundles = load_ps3838_runtime_bundles(
        accounts_path=args.accounts,
        proxies_path=args.proxies,
        domain=args.domain,
    )
    if len(bundles) != 1:
        print(json.dumps({"ok": False, "reason": "expected exactly one runtime bundle"}))
        return 2

    cfg = dict(bundles[0].fleet_account.cfg)
    cfg.update(
        cdp=str(args.cdp),
        socks=str(args.socks),
        profile=args.profile,
    )
    events: list[dict] = []
    worker = Worker(
        label="pin888-isolated",
        sport=args.sport,
        slug=args.slug,
        on_event=events.append,
        cfg=cfg,
    )
    result = await worker.run(run_sec=args.run_sec, watchlist=[])
    result.pop("label", None)
    result["events_callback_count"] = len(events)
    result["ok"] = result.get("status") == "DONE" and bool(events)
    print(json.dumps(result, sort_keys=True))
    return 0 if result["ok"] else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--accounts", required=True)
    parser.add_argument("--proxies", required=True)
    parser.add_argument("--domain", default="www.pinnacle888.com")
    parser.add_argument("--sport", type=int, default=33)
    parser.add_argument("--slug", default="tennis")
    parser.add_argument("--run-sec", type=float, default=20.0)
    parser.add_argument("--cdp", type=int, default=9451)
    parser.add_argument("--socks", type=int, default=19451)
    parser.add_argument("--profile", default="/tmp/pin888-isolated-probe")
    args = parser.parse_args()
    return asyncio.run(_probe(args))


if __name__ == "__main__":
    raise SystemExit(main())
