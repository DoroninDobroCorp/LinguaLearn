"""v2 consumer feed surface (Phase 5).

The HTTP/WS endpoints documented in TZ §9.5 will arrive in Phase 7.
This module re-exports the Phase-5 view encoders from
``aggregator.views`` so consumers can import a stable surface from
``aggregator.feed``.
"""

from __future__ import annotations

from dataclasses import dataclass

from aggregator.types import PublishedQuote
from aggregator.views import (
    ViewProfile,
    build_delta_payload,
    build_snapshot_payload,
    render_analytics,
    render_debug,
    render_lightweight,
    view_profile_from_env,
)


@dataclass
class FeedProfile:
    """View profile descriptor (TZ §9.4 — kept for back-compat)."""

    name: str
    description: str = ""


LIGHTWEIGHT = FeedProfile(name="lightweight", description="value engine")
ANALYTICS = FeedProfile(name="analytics", description="predictor")
DEBUG = FeedProfile(name="debug", description="ops, parity, Bogdan")


__all__ = [
    "ANALYTICS",
    "DEBUG",
    "FeedProfile",
    "LIGHTWEIGHT",
    "PublishedQuote",
    "ViewProfile",
    "build_delta_payload",
    "build_snapshot_payload",
    "render_analytics",
    "render_debug",
    "render_lightweight",
    "view_profile_from_env",
]

