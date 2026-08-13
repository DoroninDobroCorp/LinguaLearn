# Safe refactoring plan for the RobinArb god files

This document records the refactoring plan only. The exact Pinnacle outcome-verification work must be completed and stabilized before any structural rewrite starts.

## Current pressure points

- `backend/server.py` is roughly 13.4k lines, with about 392 functions, 47 routes, and 31 mutable module-level globals.
- `src/components/Scanner.jsx` and `src/components/Calculator.jsx` are roughly 1.3k lines each and mix transport, state, filtering, presentation, and business rules.
- `backend/test_app_api.py` is roughly 9.2k lines. It provides important regression coverage, but its broad shared fixture makes failures harder to isolate.

## Invariants that must not change

- Forted odds are never evidence for Pinnacle outcome identity.
- A quote is usable only after an exact event, market family, scope, line, and side binding.
- Ambiguous or incomplete mappings fail closed and remain visible in system diagnostics.
- RobinWork cannot place from a simulated, stale, approximate, or structurally unbound quote.
- Existing API response fields and frontend behavior remain backward compatible during extraction.

## Phased extraction

1. Add characterization tests around the current public routes and verification/place invariants.
2. Extract pure parsing and outcome-identity models first. Keep compatibility wrappers in `server.py`.
3. Extract the diagnostics store and system-hidden-query service without changing persistence schema.
4. Extract Pinnacle transport, rate limiting, caches, and exact-verification orchestration into stateful services with explicit dependencies.
5. Split scanner frontend logic into data hooks, filtering/ranking selectors, diagnostics UI, and presentational components.
6. Split calculator state and bookmaker adapters from its rendering layer.
7. Divide the monolithic API test file by subsystem while retaining a small end-to-end compatibility suite.
8. Move verify/place routes last, after shadow comparison proves the extracted services return equivalent bindings and decisions.

## Delivery discipline

- One subsystem per commit; never mix behavior changes with mechanical extraction.
- Keep a compatibility facade until all callers migrate.
- Run old and new implementations in shadow mode on recorded and live read-only traffic, comparing exact binding keys and rejection codes.
- Deploy behind a reversible feature flag and monitor system-hidden diagnostics, verification coverage, latency, and placement guards.
- Remove the facade and old globals only after parity is demonstrated over a representative observation window.
