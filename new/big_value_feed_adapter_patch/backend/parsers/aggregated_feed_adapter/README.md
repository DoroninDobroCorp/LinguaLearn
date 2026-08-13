# Aggregated feed adapter

This adapter is the only supported transport from the shared browser-parser
feed on `secret` into Big Value. It connects only to loopback endpoints:

- upstream aggregate WebSocket transported over SSH: `127.0.0.1:19014`;
- post-replay reconciliation snapshot: `127.0.0.1:19014/snapshot`;
- Analyzer live ingress: `127.0.0.1:7200`;
- Analyzer prematch ingress: `127.0.0.1:7201`;
- local health endpoint: `127.0.0.1:19015/health`.

It does not contain or call any bookmaker provider API. Do not add an HTTP
fallback, provider hostname, account login, bet placement, balance or price
verification path. The upstream parser is shared with other projects, so its
protocol must remain backward-compatible.

Freshness is deliberately fail-closed. Snapshot/replay events retain their
real `PriceConfirmedAt` (or `CreatedAt` fallback). The broadcaster's
`LastUpdated` and local receipt time are never promoted to price freshness;
they can describe delivery of cached history rather than a browser-confirmed
market.

The adapter never invents `_market_ts`. Base-market timestamps must come from
the exact browser frame in which that market group was observed; events that
lack them may be displayed for diagnostics but Analyzer deliberately refuses
to treat those base outcomes as fresh.

The upstream broadcaster sends large initial states as `update_replay`. The
adapter buffers the complete replay without publishing partial state, then
reconciles it against the current internal snapshot before filling Analyzer.
This closes the update gap that exists while a new upstream client is still
receiving its initial replay.

Run tests:

```bash
cd /srv/big_value/backend/parsers/aggregated_feed_adapter
python3 -m unittest -v
```
