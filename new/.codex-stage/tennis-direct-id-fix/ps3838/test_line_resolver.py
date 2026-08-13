"""Quick sanity-check: load compact for soccer, find event, resolve a few lineIds."""
import asyncio
import json
import sys
sys.path.insert(0, '/srv/ps3838_betslip')
from session import PS3838Session
from line_resolver import CompactCache, resolve_line_id


async def main():
    s = PS3838Session()
    await s.start()
    cache = CompactCache(s)
    ev = await cache.get_event(29, 1631102798)
    if not ev:
        print("event not found")
        await s.stop()
        return
    print("event:", ev["home"], "vs", ev["away"], "league:", ev["league_name"])
    print("periods:", list((ev["raw"][8] if isinstance(ev["raw"][8], dict) else {}).keys()))

    for label, params in [
        ("ML team1", dict(period=0, bet_type=1, team_select=0, handicap=0)),
        ("ML team2", dict(period=0, bet_type=1, team_select=1, handicap=0)),
        ("HCP team1 -0.25", dict(period=0, bet_type=2, team_select=0, handicap=-0.25)),
        ("HCP team2 0.25", dict(period=0, bet_type=2, team_select=1, handicap=0.25)),
        ("Total Over 1.5", dict(period=0, bet_type=3, team_select=3, handicap=1.5)),
        ("Total Under 1.5", dict(period=0, bet_type=3, team_select=4, handicap=1.5)),
        ("Total Over 1.75", dict(period=0, bet_type=3, team_select=3, handicap=1.75)),
    ]:
        lid, odds = resolve_line_id(ev, **params)
        print(f"  {label:25s} → lineId={lid}, odds={odds}")

    await s.stop()


if __name__ == "__main__":
    asyncio.run(main())
