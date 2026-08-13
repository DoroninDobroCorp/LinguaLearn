"""HTTP client for the Official Pinnacle (ps3838) API.

Pure transport layer. Knows how to:

- build authenticated requests against ``api.ps3838.com`` (HTTP Basic);
- route through an optional HTTP/SOCKS proxy;
- fetch sports / leagues / fixtures / odds / specials on demand;
- carry a ``since`` cursor for incremental delta polling (the API
  documents it as the ``last`` value returned by the previous response);
- raise typed exceptions on auth / rate-limit / 5xx so callers can
  back off without an infinite loop inside the client.

Module-level execution is import-time inert — there are **no** network
calls or env reads at module load. Construction reads env only when
:meth:`PinnacleApiClient.from_env` is invoked.

Thread-safety model (Story 27.20):
    The client uses ``threading.local()`` so each thread gets its own
    ``requests.Session`` (independent cookie jar, connection pool, and
    auth state).  The :attr:`session` property lazy-creates a Session on
    first access per thread; call :meth:`close_all_sessions` at shutdown
    to release underlying sockets for every thread that has ever touched
    the client.

    Legacy callers that constructed a ``PinnacleApiClient`` and then
    accessed ``client.session`` directly (to patch ``session.send`` in
    tests, for example) continue to work — the property still returns a
    valid ``requests.Session`` for the calling thread.

This module deliberately does **not** know about ``SourceEvent``,
``IngestRouter``, the runtime envelope or any aggregator concept; the
adapter layer is responsible for that. Keep this file pure HTTP so it
can be reused (and tested) standalone.
"""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass, field
from typing import Any

import requests


DEFAULT_BASE_URL = "https://api.ps3838.com/"
DEFAULT_TIMEOUT_SEC = 20.0
DEFAULT_REFRESH_SEC = 300.0
DEFAULT_CONNECT_TIMEOUT_SEC = 5.0
DEFAULT_READ_TIMEOUT_SEC = 10.0
SPECIALS_SUPPORTED_SPORT_IDS = frozenset({29, 4, 19})  # mirrors parity tool


class PinnacleApiError(Exception):
    """Base class for typed errors raised by :class:`PinnacleApiClient`."""


class PinnacleApiAuthError(PinnacleApiError):
    """401/403 from the upstream API — credentials are bad / suspended."""


class PinnacleApiRateLimitError(PinnacleApiError):
    """429 (or upstream-imposed slow-down) — caller must back off."""

    def __init__(self, message: str, *, retry_after: float | None = None) -> None:
        super().__init__(message)
        self.retry_after = retry_after


class PinnacleApiServerError(PinnacleApiError):
    """5xx from the upstream — transient, caller may retry with backoff."""

    def __init__(self, message: str, *, status: int) -> None:
        super().__init__(message)
        self.status = status


class PinnacleApiTransportError(PinnacleApiError):
    """Lower-level transport failure (connect / read / proxy)."""


@dataclass
class PinnacleApiConfig:
    """Static configuration for :class:`PinnacleApiClient`.

    All fields have sensible defaults so a test can construct one
    inline; :meth:`from_env` populates production defaults from env.
    """

    base_url: str = DEFAULT_BASE_URL
    username: str = ""
    password: str = ""
    proxy_url: str = ""
    timeout_sec: float = DEFAULT_TIMEOUT_SEC
    odds_format: str = "Decimal"
    user_agent: str = "pin888-msp/0.2 (+pinnacle_api_client)"
    extra_headers: dict[str, str] = field(default_factory=dict)


class PinnacleApiClient:
    """Thin requests-based client for the Pinnacle Official API.

    Endpoints used (mirrors ``tools/ps3838_api_parity.py`` and the Go
    reference parser, both of which are known-working against the
    ``api.ps3838.com`` host):

    - ``/v3/fixtures``                — fixtures for a sport (delta-capable);
    - ``/v3/odds``                    — odds snapshot for a sport (delta-capable);
    - ``/v2/fixtures/special``        — specials fixtures (subset of sports);
    - ``/v2/odds/special``            — specials odds (subset of sports);
    - ``/v2/sports``                  — sport catalog (rare);
    - ``/v2/leagues``                 — league catalog per sport (rare).

    The TZ document mentions ``v1/*`` endpoint paths in the rollout
    notes, but the working parity tool and the Go parser both call the
    ``v2``/``v3`` paths above against the same host. We follow the
    proven endpoints; the Phase-3+ shadow-merge work will revisit if
    Pinnacle ever publishes a new revision.

    Thread-safety (Story 27.20)
    ---------------------------
    The :attr:`session` property is backed by ``threading.local()``.
    Each OS thread gets its own ``requests.Session`` instance the first
    time it touches ``self.session``, so concurrent callers (e.g. the
    live and prematch polling threads spawned by
    ``run_forever_per_class``) never share a cookie jar or connection
    pool.

    If a *specific* ``session`` is passed to ``__init__`` (the legacy
    constructor path used by tests), that session is stored on the
    calling thread's TLS slot, so ``self.session`` returns it on that
    same thread — preserving full backwards compatibility for all
    existing test helpers that patch ``client.session.send``.
    """

    # Class-level lock protecting the _tls registry dict used by
    # close_all_sessions().  The lock is per-instance but lightweight —
    # it is only acquired during session creation (once per thread) and
    # at shutdown.
    _tls_registry_lock: threading.Lock

    def __init__(
        self,
        *,
        config: PinnacleApiConfig | None = None,
        session: requests.Session | None = None,
        refresh_sec: float = DEFAULT_REFRESH_SEC,
        connect_timeout_sec: float = DEFAULT_CONNECT_TIMEOUT_SEC,
        read_timeout_sec: float = DEFAULT_READ_TIMEOUT_SEC,
    ) -> None:
        self.config = config or PinnacleApiConfig()
        # Per-thread Session storage.  _tls holds one attribute per
        # thread: ``_tls.session`` → requests.Session,
        # ``_tls.session_created_at`` → float (monotonic timestamp).
        self._tls: threading.local = threading.local()
        # Registry maps thread-id → session so close_all_sessions() can
        # drain every thread's pool at shutdown.  Guarded by the
        # instance-level lock to allow concurrent creation.
        self._tls_registry: dict[int, requests.Session] = {}
        self._tls_registry_lock = threading.Lock()
        # Session refresh interval (Story 27.20.1 AC-1).
        self._refresh_sec: float = float(refresh_sec)
        # Per-call timeout tuple: (connect_timeout, read_timeout).
        self._connect_timeout: float = float(connect_timeout_sec)
        self._read_timeout: float = float(read_timeout_sec)

        # Atomic counters guarded by _tls_registry_lock.
        self._sessions_refreshed_total: int = 0
        self._per_call_timeouts_total: int = 0
        self._per_call_latency_buckets: dict[str, int] = {
            "≤1s": 0,
            "1-5s": 0,
            "5-15s": 0,
            ">15s": 0,
        }

        if session is not None:
            # Legacy path: caller supplied a concrete session.  Bind it
            # to the current thread's TLS slot so subsequent accesses on
            # this same thread see it.  Tests that swap ``session.send``
            # after construction keep working because they run on the
            # same thread.
            self._tls.session = session
            self._tls.session_created_at = time.monotonic()
            self._configure_session(session)
            with self._tls_registry_lock:
                self._tls_registry[threading.get_ident()] = session

    # ── session management ────────────────────────────────────────────

    def _configure_session(self, sess: requests.Session) -> None:
        """Apply auth, headers, proxy, and pool-tuning adapter to *sess*.

        Called once per session object regardless of whether the session
        was supplied by the caller or freshly constructed here.

        Pool tuning (Story 27.20.1 AC-2): mount a custom HTTPAdapter with
        ``pool_connections=20, pool_maxsize=20, max_retries=0`` for both
        ``https://`` and ``http://`` so each thread's session has enough
        room for concurrent requests without hitting the default cap of 10.
        ``max_retries=0`` keeps the client from silently retrying 429s.
        """
        sess.auth = (self.config.username, self.config.password)
        headers: dict[str, str] = {
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "User-Agent": self.config.user_agent,
        }
        headers.update(self.config.extra_headers)
        sess.headers.update(headers)
        if self.config.proxy_url:
            sess.proxies.update(
                {"http": self.config.proxy_url, "https": self.config.proxy_url}
            )
        # Pool tuning — mount for both schemes.
        adapter = requests.adapters.HTTPAdapter(
            pool_connections=20,
            pool_maxsize=20,
            max_retries=0,
        )
        sess.mount("https://", adapter)
        sess.mount("http://", adapter)

    def _build_session(self) -> requests.Session:
        """Create and configure a brand-new ``requests.Session``.

        Used internally by the :attr:`session` property the first time a
        thread accesses it (or when the refresh interval elapses).
        Registers the new session in the instance registry so
        :meth:`close_all_sessions` can drain it later.
        """
        sess = requests.Session()
        self._configure_session(sess)
        with self._tls_registry_lock:
            self._tls_registry[threading.get_ident()] = sess
        return sess

    @property
    def session(self) -> requests.Session:
        """The ``requests.Session`` for the **calling thread**.

        On first access per thread a new session is created via
        :meth:`_build_session`.  Subsequent accesses on the same thread
        return the cached instance without acquiring any lock — this is
        the hot path (called for every HTTP request).

        Story 27.20.1 AC-1 — Periodic refresh: if the session has been
        alive for ``≥ refresh_sec`` seconds (measured via
        ``time.monotonic``), the old session is closed gracefully and a
        fresh one is created.  This prevents NAT idle-timeout and
        connection-pool exhaustion that cause the 130s+ latency
        degradation observed after 30 minutes in production.

        Setting ``client.session = <value>`` replaces the current
        thread's session and updates the registry; this path exists
        mainly for the test helpers that inject a mock transport after
        construction on the same thread.
        """
        now = time.monotonic()
        sess: requests.Session | None = getattr(self._tls, "session", None)
        created_at: float = getattr(self._tls, "session_created_at", 0.0)
        if sess is None or (now - created_at) >= self._refresh_sec:
            if sess is not None:
                # Close the stale session gracefully; ignore errors.
                try:
                    sess.close()
                except Exception:  # noqa: BLE001 — best-effort close
                    pass
                # Remove old entry from registry so close_all_sessions()
                # does not try to double-close it.
                with self._tls_registry_lock:
                    self._tls_registry.pop(threading.get_ident(), None)
                    self._sessions_refreshed_total += 1
            sess = self._build_session()
            self._tls.session = sess
            self._tls.session_created_at = now
        return sess

    @session.setter
    def session(self, value: requests.Session) -> None:
        """Assign *value* as this thread's session and update the registry.

        Resets the per-thread ``session_created_at`` timestamp so the
        refresh interval starts fresh from this assignment.
        """
        self._tls.session = value
        self._tls.session_created_at = time.monotonic()
        with self._tls_registry_lock:
            self._tls_registry[threading.get_ident()] = value

    def close_all_sessions(self) -> None:
        """Close every per-thread ``requests.Session`` that was ever opened.

        Intended for graceful shutdown.  After this call no thread should
        attempt further HTTP requests through this client.  Each session's
        underlying connection pool (``urllib3.HTTPConnectionPool``) is
        released, freeing sockets immediately rather than waiting for GC.
        """
        with self._tls_registry_lock:
            sessions = list(self._tls_registry.values())
            self._tls_registry.clear()
        for sess in sessions:
            try:
                sess.close()
            except Exception:  # noqa: BLE001 — best-effort cleanup
                pass

    def client_metrics(self) -> dict[str, Any]:
        """Return transport-level metrics for observability (Story 27.20.1 AC-6).

        All three counters are read under the shared lock for consistency.

        Returns a dict with keys:
        - ``sessions_refreshed_total`` — number of per-thread session
          rotations triggered by the ``refresh_sec`` interval;
        - ``per_call_timeouts_total`` — number of ``requests.Timeout``
          exceptions encountered in ``_get_json``;
        - ``per_call_latency_buckets`` — histogram of HTTP call durations
          bucketed as ``≤1s``, ``1-5s``, ``5-15s``, ``>15s``.
        """
        with self._tls_registry_lock:
            return {
                "sessions_refreshed_total": self._sessions_refreshed_total,
                "per_call_timeouts_total": self._per_call_timeouts_total,
                "per_call_latency_buckets": dict(self._per_call_latency_buckets),
            }

    # ── construction helpers ──────────────────────────────────────────

    @classmethod
    def from_env(
        cls,
        *,
        env: dict[str, str] | None = None,
        session: requests.Session | None = None,
    ) -> "PinnacleApiClient":
        """Build a client from environment variables.

        Reads (with defaults):

        - ``PINNACLE_API_BASE_URL``                — default ``https://api.ps3838.com/``;
        - ``PINNACLE_API_USERNAME``                — required;
        - ``PINNACLE_API_PASSWORD``                — required;
        - ``PINNACLE_PROXY_URL``                   — optional;
        - ``PINNACLE_API_TIMEOUT``                 — optional, seconds, default ``20``;
        - ``MSP_PINNACLE_API_SESSION_REFRESH_SEC`` — session refresh interval, default ``300``;
        - ``MSP_PINNACLE_API_CONNECT_TIMEOUT_SEC`` — TCP connect timeout, default ``5``;
        - ``MSP_PINNACLE_API_READ_TIMEOUT_SEC``    — HTTP read timeout, default ``10``.

        Raises :class:`PinnacleApiError` if username/password are blank.
        """
        env = env if env is not None else dict(os.environ)
        base_url = (env.get("PINNACLE_API_BASE_URL") or DEFAULT_BASE_URL).strip()
        username = (env.get("PINNACLE_API_USERNAME") or "").strip()
        password = (env.get("PINNACLE_API_PASSWORD") or "").strip()
        proxy_url = (env.get("PINNACLE_PROXY_URL") or "").strip()
        try:
            timeout_sec = float(env.get("PINNACLE_API_TIMEOUT") or DEFAULT_TIMEOUT_SEC)
        except ValueError:
            timeout_sec = DEFAULT_TIMEOUT_SEC
        if not username or not password:
            raise PinnacleApiError(
                "PINNACLE_API_USERNAME / PINNACLE_API_PASSWORD must be set"
            )
        try:
            refresh_sec = float(
                env.get("MSP_PINNACLE_API_SESSION_REFRESH_SEC") or DEFAULT_REFRESH_SEC
            )
        except ValueError:
            refresh_sec = DEFAULT_REFRESH_SEC
        try:
            connect_timeout_sec = float(
                env.get("MSP_PINNACLE_API_CONNECT_TIMEOUT_SEC") or DEFAULT_CONNECT_TIMEOUT_SEC
            )
        except ValueError:
            connect_timeout_sec = DEFAULT_CONNECT_TIMEOUT_SEC
        try:
            read_timeout_sec = float(
                env.get("MSP_PINNACLE_API_READ_TIMEOUT_SEC") or DEFAULT_READ_TIMEOUT_SEC
            )
        except ValueError:
            read_timeout_sec = DEFAULT_READ_TIMEOUT_SEC
        cfg = PinnacleApiConfig(
            base_url=base_url,
            username=username,
            password=password,
            proxy_url=proxy_url,
            timeout_sec=timeout_sec,
        )
        return cls(
            config=cfg,
            session=session,
            refresh_sec=refresh_sec,
            connect_timeout_sec=connect_timeout_sec,
            read_timeout_sec=read_timeout_sec,
        )

    # ── core HTTP ─────────────────────────────────────────────────────

    def _build_url(self, path: str) -> str:
        base = self.config.base_url.rstrip("/")
        if not path.startswith("/"):
            path = "/" + path
        return base + path

    def _record_latency_bucket(self, elapsed_sec: float) -> None:
        """Increment the appropriate latency histogram bucket (thread-safe)."""
        if elapsed_sec <= 1.0:
            key = "≤1s"
        elif elapsed_sec <= 5.0:
            key = "1-5s"
        elif elapsed_sec <= 15.0:
            key = "5-15s"
        else:
            key = ">15s"
        with self._tls_registry_lock:
            self._per_call_latency_buckets[key] += 1

    def _get_json(
        self,
        path: str,
        *,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        url = self._build_url(path)
        _t0 = time.monotonic()
        try:
            response = self.session.get(
                url,
                params=params or {},
                timeout=(self._connect_timeout, self._read_timeout),
            )
        except requests.exceptions.Timeout as exc:
            elapsed = time.monotonic() - _t0
            self._record_latency_bucket(elapsed)
            with self._tls_registry_lock:
                self._per_call_timeouts_total += 1
            raise PinnacleApiTransportError(f"GET {url} timed out: {exc}") from exc
        except requests.RequestException as exc:
            elapsed = time.monotonic() - _t0
            self._record_latency_bucket(elapsed)
            raise PinnacleApiTransportError(f"GET {url} failed: {exc}") from exc
        elapsed = time.monotonic() - _t0
        self._record_latency_bucket(elapsed)

        status = response.status_code
        if status == 401 or status == 403:
            raise PinnacleApiAuthError(f"GET {url} -> HTTP {status}")
        if status == 429:
            retry_after_raw = response.headers.get("Retry-After")
            retry_after: float | None
            try:
                retry_after = float(retry_after_raw) if retry_after_raw else None
            except (TypeError, ValueError):
                retry_after = None
            raise PinnacleApiRateLimitError(
                f"GET {url} -> HTTP 429 (rate limited)",
                retry_after=retry_after,
            )
        if 500 <= status < 600:
            raise PinnacleApiServerError(
                f"GET {url} -> HTTP {status}", status=status
            )
        if status >= 400:
            raise PinnacleApiError(f"GET {url} -> HTTP {status}: {response.text[:200]}")

        # 204 No Content / empty body — Pinnacle returns this between
        # delta polls when nothing changed since the cursor.
        if not response.content:
            return {}
        try:
            return response.json()
        except ValueError as exc:
            raise PinnacleApiError(f"GET {url}: invalid JSON: {exc}") from exc

    # ── public fetchers ───────────────────────────────────────────────

    def fetch_sports(self) -> dict[str, Any]:
        """``GET /v2/sports`` — sport catalog."""
        return self._get_json("/v2/sports")

    def fetch_leagues(self, sport_id: int) -> dict[str, Any]:
        """``GET /v2/leagues?sportId=N`` — league catalog for one sport."""
        return self._get_json("/v2/leagues", params={"sportId": int(sport_id)})

    def fetch_fixtures(
        self,
        sport_id: int,
        *,
        since: int | None = None,
        is_live: bool | None = None,
    ) -> dict[str, Any]:
        """``GET /v3/fixtures``.

        ``since`` enables delta polling — pass the ``last`` value from
        the previous response. ``is_live`` filters to live (``1``) or
        prematch (``0``) when explicitly set.
        """
        params: dict[str, Any] = {"sportId": int(sport_id)}
        if since is not None:
            params["since"] = int(since)
        if is_live is not None:
            params["isLive"] = 1 if is_live else 0
        return self._get_json("/v3/fixtures", params=params)

    def fetch_odds(
        self,
        sport_id: int,
        *,
        since: int | None = None,
        is_live: bool | None = None,
    ) -> dict[str, Any]:
        """``GET /v3/odds``.

        ``since`` enables delta polling; ``oddsFormat`` is hard-coded to
        the configured value (default ``Decimal`` — same as parity tool).
        """
        params: dict[str, Any] = {
            "sportId": int(sport_id),
            "oddsFormat": self.config.odds_format,
            "altLines": 1,
        }
        if since is not None:
            params["since"] = int(since)
        if is_live is not None:
            params["isLive"] = 1 if is_live else 0
        return self._get_json("/v3/odds", params=params)

    def fetch_special_fixtures(
        self,
        sport_id: int,
        *,
        is_live: bool | None = None,
    ) -> dict[str, Any]:
        """``GET /v2/fixtures/special``."""
        params: dict[str, Any] = {"sportId": int(sport_id)}
        if is_live is not None:
            params["isLive"] = 1 if is_live else 0
        return self._get_json("/v2/fixtures/special", params=params)

    def fetch_special_odds(
        self,
        sport_id: int,
        *,
        is_live: bool | None = None,
    ) -> dict[str, Any]:
        """``GET /v2/odds/special``."""
        params: dict[str, Any] = {
            "sportId": int(sport_id),
            "oddsFormat": self.config.odds_format,
        }
        if is_live is not None:
            params["isLive"] = 1 if is_live else 0
        return self._get_json(
            "/v2/odds/special",
            params=params,
        )


def extract_cursor(response_payload: dict[str, Any] | None) -> int | None:
    """Return the ``last`` cursor for the next delta poll, or ``None``.

    The Pinnacle API returns ``{"last": <int>, ...}`` on fixtures /
    odds responses; callers feed that integer back as ``since`` on
    the next call to receive only changes since that point. Returns
    ``None`` for empty / missing payloads (no advance).
    """
    if not isinstance(response_payload, dict):
        return None
    raw = response_payload.get("last")
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


__all__ = [
    "DEFAULT_CONNECT_TIMEOUT_SEC",
    "DEFAULT_READ_TIMEOUT_SEC",
    "DEFAULT_REFRESH_SEC",
    "PinnacleApiClient",
    "PinnacleApiConfig",
    "PinnacleApiError",
    "PinnacleApiAuthError",
    "PinnacleApiRateLimitError",
    "PinnacleApiServerError",
    "PinnacleApiTransportError",
    "SPECIALS_SUPPORTED_SPORT_IDS",
    "extract_cursor",
]
