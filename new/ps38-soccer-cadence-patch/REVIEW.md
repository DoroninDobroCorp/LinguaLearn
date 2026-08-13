# Browser-only Pin888 compact live-delta patch (review only)

Status: staged and verified; **not deployed**. No production service, browser,
configuration, or provider endpoint was changed.

## Baseline and evidence

The staging sources were copied from the current `secret` production tree and
matched it before editing:

- `aggregator/fleet/worker.py`:
  `8c7b0f258e63aee8284ae72666fc3e6df81548f337e188a222e37daa0f68fa73`
- `tests/test_fleet_runtime.py`:
  `7d61356a61039ced60b1f5a6265ce71eac2bf49de1eebb24d991ecfb153b0a4d`
- deployed central `aggregator/main.py`:
  `57fc20cb188f6669d624d5cb129a7c8a9945e94ba165939a114236e9adc58277`

Read-only CDP discovery on `secret` found no exposed active CDP port in this
SSH session, so it sent neither a site request nor a provider request. The
retained browser-WS capture fixture confirms compact live shape:

```text
odds.u = [[sport, [
  [period, bet_type, team_select, handicap, _, price, line_id,
   ..., ..., ..., ..., is_alt, event_id]
]]]
```

Thus ordinary `UPDATE_ODDS` frames are not complete events, and passing their
`u` block to `normalize_full_odds` correctly yields no canonical game.

## Change

`NormalizedEventDeltaCache` is allocated per `Worker` (and shared only by its
own `MultiSportWorker` pages). Complete normalized snapshots seed a private
copy keyed by `(sport, Pid)`. Canonical odd leaves are indexed only when their
parser provenance supplies the exact tuple:

```text
(period, bet_type, team_select, handicap, line_id, is_alt, event_id)
```

A compact row may update only that already-indexed leaf. Unknown events,
unseen/new lines, absent/invalid line IDs, malformed coordinates and suspended
or non-decimal prices fail closed. The only intentional representation bridge
is the confirmed `1X2` wire `handicap=null` versus canonical `handicap=0`.

For a successful delta, only its owning canonical market gets `_market_ts`
from the exact browser frame `time`; unrelated markets keep their prior
evidence. `PriceConfirmedAt` is formatted from the same frame time. Arrival
time, `LastUpdated`, cache age, queue time and TTL are not used as price
evidence. Each emission is deep-copied, so a later delta cannot mutate a
queued earlier envelope.

No direct/guest/Arcadia/provider API path was added or re-enabled.

## Verification

- `python3 -m py_compile aggregator/fleet/worker.py tests/test_fleet_runtime.py`: passed.
- Isolated staged-worker tests: `17 passed, 77 deselected`.
  The local staging contains only the two edited files; the run mounts its
  unchanged full package as a read-only import base and explicitly loads the
  staged worker.
- Coverage includes: exact leaf update, market-scoped timestamp, same-source
  `PriceConfirmedAt`, null 1X2 handicap normalization, unmatched/new fail
  closed, child line event mapped to parent `Pid`, wrapper path, and real
  `Worker._loop` cache use.
- `/srv/pin888/bin/check-no-pinnacle-api`: `no_api_runtime_guard=ok`.
- Static scan of staged diff: no provider/API/Arcadia endpoint reference.

## Deployment (approval required)

1. Re-read the two production baseline hashes above; abort and rebase on any
   mismatch. Leave deployed central `main.py` at `57fc20cb...` untouched.
2. Copy only the staged `worker.py` and `test_fleet_runtime.py` to a uniquely
   named temporary directory on `secret`; verify transferred hashes.
3. Back up only those two production files with timestamped `cp -a` copies.
4. Install the two files, run production-venv `py_compile`, the 17 focused
   tests, and `/srv/pin888/bin/check-no-pinnacle-api`. Abort before restart on
   any failure.
5. Restart only `pin888-role-fleet.service`. Do not restart the central
   aggregator, Big Value adapter, or any other parser service.
6. Canary for 10 minutes: confirm compact `UPDATE_ODDS` moves only the target
   market timestamp at the observed 1--3 second cadence; stop on 429,
   reconnect/restart growth, poster errors/drops, queue lag, or a price/timing
   mismatch.

## Rollback

Restore the two timestamped backups, rerun `py_compile` and the no-API guard,
then restart only `pin888-role-fleet.service`. The central live-priority patch
and all Big Value components remain unchanged throughout both deployment and
rollback.
