"""SIGHUP-triggered reload for :class:`MoreBetsDispatcher` (Story 27.5.B / AC-8, DOD-7).

Wiring a SIGHUP handler at process init time is the job of the caller
(main.py / server bootstrap). This module provides the reload
primitive itself so it can be tested without signals:

    from aggregator.morebets_policy_reload import reload_dispatcher_policy

    reload_dispatcher_policy(dispatcher)  # atomically reads + swaps

Policy file path is resolved via
:func:`aggregator.morebets_policy.resolve_policy_path`, so both the
dispatcher startup and the reload use the same source.

Thread safety: ``dispatcher.swap_policy`` replaces the attribute in
one assignment. In-flight ``dispatch()`` calls hold the previous
policy reference in a local variable — they keep running with the
old rules, the next tick picks up the new policy. Matches AC-8
"Старые in-flight requests используют старую policy (atomic swap)".
"""

from __future__ import annotations

import logging
from typing import Callable, TYPE_CHECKING

from aggregator.morebets_policy import (
    MoreBetsPolicy,
    load_policy_from_env,
)


if TYPE_CHECKING:  # pragma: no cover
    from aggregator.morebets_dispatcher import MoreBetsDispatcher


_log = logging.getLogger("aggregator.morebets.policy_reload")


def reload_dispatcher_policy(
    dispatcher: "MoreBetsDispatcher",
    *,
    loader: Callable[[], MoreBetsPolicy] = load_policy_from_env,
) -> bool:
    """Read the current policy file and atomically install it.

    Returns True on success, False if the new policy failed to validate
    (in which case the dispatcher keeps running on the old one — we
    prefer live-stale over a crash).

    ``loader`` is injectable for tests — default reads env / disk.
    """
    try:
        new_policy = loader()
    except Exception as exc:  # noqa: BLE001 — reload must never crash
        _log.error("morebets policy reload failed: %s", exc)
        return False
    dispatcher.swap_policy(new_policy)
    _log.info(
        "morebets policy reloaded: version=%s families=%d",
        new_policy.version,
        len(new_policy.families),
    )
    return True


def install_sighup_handler(
    dispatcher: "MoreBetsDispatcher",
) -> None:  # pragma: no cover - runtime wiring
    """Wire SIGHUP → :func:`reload_dispatcher_policy` on the current process.

    Excluded from coverage because exercising it requires an OS signal;
    the reload primitive itself is covered by :func:`reload_dispatcher_policy`
    tests.
    """
    import signal

    def _handle(_signum: int, _frame: object) -> None:
        reload_dispatcher_policy(dispatcher)

    signal.signal(signal.SIGHUP, _handle)


__all__ = [
    "install_sighup_handler",
    "reload_dispatcher_policy",
]
