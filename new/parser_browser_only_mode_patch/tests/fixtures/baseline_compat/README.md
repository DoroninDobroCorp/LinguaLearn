# baseline_compat fixtures

Canonical examples of the `:9012` WS contract emitted by the current
pin888 parser. Used by:

- `tests/test_compat_contract.py` — schema-style regression of the
  outward-facing payload shape;
- `tests/test_aggregator_compat_shim.py` — round-trip equivalence between
  direct broadcaster output and `aggregator.compat_shim` output.

Shapes captured (from `core/broadcaster.py`, `services/forwarder_smart.py`,
`handlers/fo_handler.py`, `ps3838_server.py`):

- `init.json` — small initial snapshot sent on client connect.
- `init_replay.json` — large initial snapshot light header (followed by
  `update` replay messages, see `_send_snapshot_with_replay`).
- `state.json` — periodic state snapshot (live or full scope).
- `update.json` — single-event update message.
- `tombstone.json` — tombstone update emitted on event removal/purge.

All values are anonymized (synthetic event IDs, team names, prices) but
preserve the structural contract.
