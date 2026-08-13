"""Pinnacle Multi-Source Aggregator (Phase 1 skeleton).

See `docs/PINNACLE_MULTI_SOURCE_PLATFORM_TZ.md` for the contract this
package implements.

Phase 1 scope (delivered here):

- typed envelopes: `SourceEvent`, `CandidateQuote`, `PublishedQuote`,
  `Account` and the supporting state enums (`SourceState`,
  `AccountState`, `SystemState`);
- `IngestRouter` that accepts `SourceEvent`s from any source and routes
  them through a normalize+store pipeline;
- in-memory `ProvenanceStore` (sqlite optional via env);
- `DecisionEngine` with the default Phase 1 policy
  ("single source pass-through");
- `state_machine` FSM helpers;
- `compat_shim` that converts a `PublishedQuote` to the existing
  `:9012` `update` message shape (byte-level equivalent);
- adapter `aggregator.sources.pin888_source` so the existing pin888
  runtime can emit `SourceEvent`s without breaking the production WS
  contract.

Nothing here starts a network listener at import time. The aggregator
runtime is gated by the env flag ``MSP_AGGREGATOR_ENABLED`` (default off);
when disabled the aggregator path is fully inert.
"""

from aggregator.data_class import DataClass
from aggregator.sources.profile import AuthorityClass, SourceProfile
from aggregator.state_machine import SystemMode
from aggregator.types import (
    Account,
    AccountState,
    CandidateQuote,
    PublishedOutcome,
    PublishedQuote,
    SourceEvent,
    SourceState,
    SystemState,
)

__all__ = [
    "Account",
    "AccountState",
    "AuthorityClass",
    "CandidateQuote",
    "DataClass",
    "PublishedOutcome",
    "PublishedQuote",
    "SourceEvent",
    "SourceProfile",
    "SourceState",
    "SystemMode",
    "SystemState",
]
