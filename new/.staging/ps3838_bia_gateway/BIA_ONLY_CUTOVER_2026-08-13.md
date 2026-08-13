# BIA-only gateway cutover — 2026-08-13

## Result

The service on `127.0.0.1:8770` is now `robinarb-bia-gateway.service`.
It exposes only the BIA quote/placement contract used by RobinArb:

- `GET /health`
- `POST /proof`
- `POST /verify`
- `POST /verify/release`
- `POST /place`
- `POST /drain`
- `GET /bia/orders/{order_id}`

Direct Pinnacle browser/API transport is not part of the active gateway
runtime. `side=pinnacle` is retained only as a compatibility input and always
fails closed with `DIRECT_PINNACLE_REMOVED`.

## Removed from the active runtime

- `PS3838Session` construction and lifecycle;
- `PinnacleLineWorker` startup;
- direct verify/place branches;
- `/sample-selection`, `/balance`, `/relogin`, `/market-margin`, `/clear`;
- Pinnacle login/password/proxy/line-worker variables from the gateway env;
- old betslip proxy, reverse-tunnel and logout-monitor units;
- direct session/worker/proxy modules and their compiled bytecode.

The old units are `masked` so a normal `systemctl start` cannot revive them.
The retired files remain recoverable in:

`/srv/robinarb-bia-gateway/backups/bia-gateway-cutover-20260813T162034Z`

## Runtime files

- unit: `/etc/systemd/system/robinarb-bia-gateway.service`
- versioned unit copy: `/srv/robinarb-bia-gateway/infra/systemd/robinarb-bia-gateway.service`
- environment: `/etc/robinarb/robinarb-bia-gateway.env`
- application: `/srv/robinarb-bia-gateway/app.py`
- logs: `journalctl -u robinarb-bia-gateway.service`

## Verification

- BIA gateway suite: `74 passed`, `45 subtests passed`;
- cold restart succeeds without the retired modules;
- health: `mode=bia_only`, `direct_pinnacle_removed=true`,
  `pinnacle_state=removed`;
- legacy direct routes return `404`;
- `side=pinnacle` returns `DIRECT_PINNACLE_REMOVED`;
- old services are `masked/inactive`;
- no listener on the retired proxy port `1080`;
- RobinArb health remains `ok`.

`/proof` and new exact BIA lookups can still return `BIA_PROOF_UNAVAILABLE`
while the central structural index on `secret:19100` is intentionally stopped.
That is fail-closed and does not activate any Pinnacle transport on `dev`.
