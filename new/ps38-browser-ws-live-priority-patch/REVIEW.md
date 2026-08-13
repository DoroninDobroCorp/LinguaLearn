# Browser-WS live-priority patch (review only)

Status: staged and tested. **Not deployed; no service was changed or restarted.**

## Runtime finding

The failed Soccer cadence canary was rolled back at `02:55:52Z`. The role-only
5-second resubscribe did not make consumer-visible live markets fresh.

Read-only runtime evidence:

- `REMOTE_FLEET_SOURCE_FAMILY=pin888` and
  `REMOTE_FLEET_ALLOCATION_MODE=account_sports` are active. Therefore
  `RemoteBatchPoster` already sends generic envelopes with
  `transport=browser_ws`; its legacy `ps3838` raw-frame branch is not the
  active role path.
- During the 124-second cadence canary the poster sent 16,198 normalized
  events (~131/s), with `dropped_events=0` and `errors=0`.
- Central drain is capped at 50 events/s and round-robins sources. The generic
  browser-WS envelope coalesces by source/event, but `_enqueue_remote_event`
  currently gives live priority only to `authenticated_dom`. Soccer live and
  ~560 cold prematch fixtures therefore share the normal Soccer bucket.
- Native site-WS live `UPDATE_ODDS` frames were observed every 1-2 seconds.
  Pure normalization produced five live Soccer events with current
  `_market_ts`, while source health stayed near 0 seconds. Nevertheless the
  9014 consumer snapshot repeatedly exposed 20-80+ second live ages and one
  retained live fixture exceeded 400 seconds. Across the post-rollback samples
  no live event was <=7 seconds at observation time.
- No central queue-drop warning, role 429/reconnect/failure, or systemd restart
  was observed. Aggregator PID stayed `700614`; no-API guard passed.

This isolates latency to normal-priority central queueing, not provider
transport, normalization, poster errors, or resubscribe cadence.

## Minimal change

`aggregator/main.py` now separates two concepts:

- `is_live_dom`: unchanged, still only authenticated DOM and still the only
  transport admitted to the live-DOM snapshot cache;
- `is_live_priority`: authenticated DOM **or browser_ws**, with a dict payload
  whose `isLive` is true.

Only `is_live_priority` selects the existing live queue/coalescing maps. The
event envelope and payload are unchanged. Non-live browser-WS, legacy raw
`ps3838` frames, all other transports, hub ingestion, and poster behavior keep
their existing paths.

Exact production baseline copied from `secret`:

- `aggregator/main.py` SHA-256:
  `ef0f662937e5207c8fb4bda58a4a13d39c3cac5fb665e35e78c3ae4c67df2f26`

Production `main.py` is already dirty; deployment must abort and rebase if that
exact hash changes.

## Tests

- Four new focused tests pass:
  - a live browser-WS fixture moves ahead of a 571-event cold prematch burst;
  - repeated live versions coalesce last-write-wins;
  - the active Pin888 poster envelope is verified as `browser_ws`;
  - the legacy raw `ps3838` poster shape remains unchanged;
  - hub-compat receives the exact original payload and produces its live board.
- Existing full `test_pin888_hub_compat.py`: 23 passed.
- Existing aggregator main BIA/lazy-import regressions: 3 passed.
- Combined relevant result: 30 passed.
- `py_compile` and diff whitespace checks pass.
- Production no-API guard passes. The patch adds no network/provider path.

## Canary gates after approval

Deploying this source requires restarting only `ps38-aggregator.service`; the
browser role does not need a restart. Because the aggregator is shared, use a
controlled window and verify the baseline SHA immediately before install.

Abort/rollback if any of these occur:

- live consumer `_market_ts` p95 remains above 7 seconds after the initial
  replay has drained;
- prematch or any non-Soccer source stops advancing relative to its existing
  cadence;
- central/role `NRestarts` changes, HTTP 429/reconnect appears, or poster
  errors/drops grow;
- central queue-drop warning appears, feed client reconnect cannot complete,
  or CPU/RAM approaches the existing service limit.

Fast rollback: restore the exact backed-up `aggregator/main.py`, run the
no-API guard, and restart only `ps38-aggregator.service`. No fleet/source/env
rollback is necessary because this patch does not change them.
