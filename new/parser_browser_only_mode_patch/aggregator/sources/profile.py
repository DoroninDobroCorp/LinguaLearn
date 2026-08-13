"""Source authority profile registry (TZ §4 + §6).

Every ``SourceEvent`` flowing through the aggregator carries a
``source_id``. This module attaches *meaning* to those ids: which
authority class the source belongs to (Official-API / Browser-WS /
Tab-mode / BIA-supplement), which families of data it can carry, and
whether it counts as Pinnacle-native.

The registry is *static* for the sources that exist today (``pinnacle_api``
and ``pin888``) and accepts *dynamic* registrations for the per-account
runtimes that Phase 4-6 will spin up (e.g. ``pin888:acct-A:browser_ws``,
``ps3838:acct-X:tab_mode``).

Source-id resolution
--------------------

A dynamic source-id like ``pin888:acct-A:browser_ws`` is *derived* from
its base family at lookup time: the family token (``pin888``) selects
the registered template, and the transport tail (``browser_ws`` /
``tab_mode``) overrides the authority class. This keeps the registry
small while preserving correct authority classification for every
runtime instance.

Nothing here touches the network, opens a file, or initialises shared
state at import time.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import IntEnum
from typing import Optional

from aggregator.data_class import DataClass


class AuthorityClass(IntEnum):
    """Numeric tier — higher beats lower in tiebreakers (TZ §6).

    The integer values intentionally have gaps so future inserts (e.g.
    a future ``OFFICIAL_API_BACKUP`` between API and browser-WS) do not
    require a renumbering migration.
    """

    OFFICIAL_API = 100
    # The authenticated DOM is the exact storefront view presented to the
    # logged-in user.  For live base prices it is the parity reference and
    # must beat a buffered browser WebSocket frame from the same account.
    AUTHENTICATED_DOM = 95
    BROWSER_WS = 90
    TAB_MODE = 60
    BIA_SUPPLEMENT = 30
    UNKNOWN = 0


@dataclass(frozen=True)
class SourceProfile:
    """Static descriptor of a registered source family / instance."""

    source_id: str
    family: str  # pinnacle_api | pin888 | ps3838 | pv247 | bia | tab_<family>
    authority_class: AuthorityClass
    data_classes_supported: frozenset[DataClass]
    is_pinnacle_native: bool

    def supports(self, data_class: DataClass) -> bool:
        return data_class in self.data_classes_supported


# ── built-in templates per family ─────────────────────────────────────

_ALL_CLASSES: frozenset[DataClass] = frozenset(DataClass)

_MOREBETS_ONLY: frozenset[DataClass] = frozenset(
    {DataClass.MORE_BETS_SPECIAL}
)

# These templates describe the *family* defaults; per-instance lookups
# may override authority based on transport.
_TEMPLATES: dict[str, SourceProfile] = {
    "pinnacle_api": SourceProfile(
        source_id="pinnacle_api",
        family="pinnacle_api",
        authority_class=AuthorityClass.OFFICIAL_API,
        data_classes_supported=_ALL_CLASSES,
        is_pinnacle_native=True,
    ),
    "pin888": SourceProfile(
        source_id="pin888",
        family="pin888",
        authority_class=AuthorityClass.BROWSER_WS,
        # Authenticated Pinnacle mirrors normally stream the base line and
        # may also return targeted MoreBets responses for selected matches.
        data_classes_supported=_ALL_CLASSES,
        is_pinnacle_native=True,
    ),
    "ps3838": SourceProfile(
        source_id="ps3838",
        family="ps3838",
        authority_class=AuthorityClass.BROWSER_WS,
        data_classes_supported=_ALL_CLASSES,
        is_pinnacle_native=True,
    ),
    "piwi247": SourceProfile(
        source_id="piwi247",
        family="pv247",
        authority_class=AuthorityClass.BROWSER_WS,
        data_classes_supported=_ALL_CLASSES,
        is_pinnacle_native=True,
    ),
    "pv247": SourceProfile(
        source_id="pv247",
        family="pv247",
        authority_class=AuthorityClass.BROWSER_WS,
        data_classes_supported=_ALL_CLASSES,
        is_pinnacle_native=True,
    ),
    "bia": SourceProfile(
        source_id="bia",
        family="bia",
        authority_class=AuthorityClass.BIA_SUPPLEMENT,
        # BIA is a supplementary MoreBets source only.  It must never be
        # eligible to publish base events, core prices, or lifecycle state.
        data_classes_supported=_MOREBETS_ONLY,
        is_pinnacle_native=False,
    ),
}


# Transport tail tokens that demote (or upgrade) the family default.
_TRANSPORT_OVERRIDES: dict[str, AuthorityClass] = {
    "tab_mode": AuthorityClass.TAB_MODE,
    "tab": AuthorityClass.TAB_MODE,
    "browser_ws": AuthorityClass.BROWSER_WS,
    "direct_ws": AuthorityClass.BROWSER_WS,
    "authenticated_dom": AuthorityClass.AUTHENTICATED_DOM,
    "http_pull": AuthorityClass.OFFICIAL_API,
}


@dataclass
class SourceProfileRegistry:
    """Resolve a ``source_id`` (or family token) to its ``SourceProfile``.

    Resolution order:

    1. exact-match registration (template or runtime-registered);
    2. parse the family from the ``family:rest`` head of ``source_id``,
       then optionally override the authority class from the transport
       tail (last token after ``:``);
    3. ``None`` → caller should treat as ``UNKNOWN`` (will be skipped
       by the decision engine).
    """

    extra: dict[str, SourceProfile] = field(default_factory=dict)

    def register(self, profile: SourceProfile) -> None:
        self.extra[profile.source_id] = profile

    def get(self, source_id: str) -> Optional[SourceProfile]:
        if not source_id:
            return None
        if source_id in self.extra:
            return self.extra[source_id]
        if source_id in _TEMPLATES:
            return _TEMPLATES[source_id]

        head = source_id.split(":", 1)[0]
        template = _TEMPLATES.get(head)
        if template is None:
            return None

        tail = source_id.rsplit(":", 1)[-1].lower() if ":" in source_id else ""
        authority = _TRANSPORT_OVERRIDES.get(tail, template.authority_class)
        # Tab-mode of a pinnacle-family source still counts as native
        # (TZ §0 glossary) but ranks below browser-WS.
        return SourceProfile(
            source_id=source_id,
            family=template.family,
            authority_class=authority,
            data_classes_supported=template.data_classes_supported,
            is_pinnacle_native=template.is_pinnacle_native,
        )


# Module-level shared registry — convenience for the decision engine
# and tests. Nothing is mutated at import time beyond the empty dict.
DEFAULT_REGISTRY = SourceProfileRegistry()


def get_profile(source_id: str) -> Optional[SourceProfile]:
    """Convenience wrapper around the module-level registry."""
    return DEFAULT_REGISTRY.get(source_id)


__all__ = [
    "AuthorityClass",
    "DEFAULT_REGISTRY",
    "SourceProfile",
    "SourceProfileRegistry",
    "get_profile",
]
