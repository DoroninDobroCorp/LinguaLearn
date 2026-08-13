"""tests/test_fleet_memory_fixes.py — тесты фиксов утечки памяти fleet-воркеров.

Fix #1 — worker.py: br.close() и pw.stop() вызываются в finally с таймаутом.
Fix #2 — supervisor.py: старые Chrome-профили удаляются при respawn.
Fix #3 — worker.py: relay.wait_closed() после relay.close().
Fix #4 — ingest.py: TTL eviction для _last_quote_signature.

P2-2 upgrade: teardown-тесты теперь вызывают НАСТОЯЩИЙ Worker.run() через моки
Playwright/Chrome/relay — а не дубль finally-блока, который мог зеленеть при
поломке прод-кода.
"""
from __future__ import annotations

import asyncio
import shutil
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aggregator.fleet.worker import Worker
from aggregator.fleet.supervisor import Supervisor, _safe_rmtree_fleet_profile
from aggregator.account_pool import FleetAccount, FleetAccountPool


# ---------------------------------------------------------------------------
# Вспомогательные фиктивные объекты
# ---------------------------------------------------------------------------


class _TrackedBrowser:
    """Fake playwright Browser — отслеживает вызов close()."""

    def __init__(
        self,
        calls: list[str],
        raises: bool = False,
        hang: bool = False,
    ) -> None:
        self._calls = calls
        self._raises = raises
        self._hang = hang

    async def close(self) -> None:
        if self._hang:
            # Имитируем зависание: ждём вечно (прерывается таймаутом воркера).
            await asyncio.sleep(9999)
        if self._raises:
            raise RuntimeError("simulated br.close failure")
        self._calls.append("br.close")


class _TrackedPlaywright:
    """Fake playwright instance — отслеживает вызов stop()."""

    def __init__(self, calls: list[str]) -> None:
        self._calls = calls

    async def stop(self) -> None:
        self._calls.append("pw.stop")


class _FakeRelayServer:
    """Fake _RelayServer — отслеживает вызовы close()/wait_closed()."""

    def __init__(self, calls: list[str]) -> None:
        self._calls = calls

    def close(self) -> None:
        self._calls.append("relay.close")

    async def wait_closed(self) -> None:
        self._calls.append("relay.wait_closed")


# ---------------------------------------------------------------------------
# Хелпер: запустить Worker.run() с замоканными внешними зависимостями.
# Позволяет проверить, что реальный teardown-блок вызывает нужные методы.
# ---------------------------------------------------------------------------


async def _run_worker_with_mocks(
    *,
    br: Any,
    pw: Any,
    relay: Any | None = None,
    fail_at_wcdp: bool = False,
) -> tuple[dict[str, Any], list[str]]:
    """Запустить Worker.run() с замоканными Playwright/Chrome/relay.

    Параметры:
        br      — фиктивный browser (возвращается pw.chromium.connect_over_cdp)
        pw      — фиктивный playwright instance (возвращается async_playwright().start())
        relay   — фиктивный relay (возвращается socks5_relay); если None — _FakeRelayServer
        fail_at_wcdp — если True, _wcdp() вернёт False (worker завершится FAIL:CDP)

    Возвращает (result_dict, relay_calls).
    """
    relay_calls: list[str] = []
    if relay is None:
        relay = _FakeRelayServer(relay_calls)

    # Сконфигурировать фиктивный browser с контекстом и страницей.
    fake_page = MagicMock()
    fake_page.add_init_script = AsyncMock()
    fake_page.goto = AsyncMock()
    fake_page.evaluate = AsyncMock()
    # _wait_ws возвращает True чтобы воркер дошёл до _loop.
    fake_page.wait_for_selector = AsyncMock(return_value=MagicMock())

    fake_ctx = MagicMock()
    fake_ctx.pages = [fake_page]

    # Создадим отдельный async mock для connect_over_cdp
    connect_mock = AsyncMock(return_value=br)
    chromium_mock = MagicMock()
    chromium_mock.connect_over_cdp = connect_mock

    pw_mock = pw
    pw_mock.chromium = chromium_mock  # type: ignore[attr-defined]

    # Фиктивный async_playwright контекст-менеджер
    ap_instance = AsyncMock()
    ap_instance.start = AsyncMock(return_value=pw_mock)
    ap_cm = MagicMock()
    ap_cm.return_value = ap_instance

    # Патч br.contexts
    br.contexts = [fake_ctx]  # type: ignore[attr-defined]

    worker = Worker(
        label="test-teardown",
        sport=29,
        slug="soccer",
        on_event=lambda f: None,
        cfg={
            "proxy_host": "127.0.0.1",
            "proxy_port": "1080",
            "proxy_user": "u",
            "proxy_pass": "p",
            "cdp": "9999",
            "socks": "19999",
        },
    )

    # Замокать _wait_ws чтобы сразу завершать воркер (run_sec=0 → _loop выйдет сразу).
    with (
        patch("aggregator.fleet.worker.socks5_relay", new=AsyncMock(return_value=relay)),
        patch("aggregator.fleet.worker._wcdp", new=AsyncMock(return_value=not fail_at_wcdp)),
        patch("playwright.async_api.async_playwright", new=ap_cm),
        patch.object(worker, "_login", new=AsyncMock()),
        patch.object(worker, "_wait_ws", new=AsyncMock(return_value=True)),
        patch.object(worker, "_loop", new=AsyncMock()),
    ):
        result = await worker.run(run_sec=0.0)

    return result, relay_calls


# ---------------------------------------------------------------------------
# Fix #1 / P2-2: teardown через НАСТОЯЩИЙ Worker.run() с замоками
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_worker_run_calls_br_close_and_pw_stop() -> None:
    """Fix #1 / P2-2: Worker.run() вызывает br.close() и pw.stop() в finally.

    Используется настоящий Worker.run() с замоканными внешними зависимостями —
    не дубль finally-блока.
    """
    calls: list[str] = []
    br = _TrackedBrowser(calls)
    pw = _TrackedPlaywright(calls)

    result, _ = await _run_worker_with_mocks(br=br, pw=pw)

    assert "br.close" in calls, "br.close() не вызван реальным Worker.run()"
    assert "pw.stop" in calls, "pw.stop() не вызван реальным Worker.run()"
    assert calls.index("br.close") < calls.index("pw.stop"), (
        "br.close() должен вызываться раньше pw.stop()"
    )


@pytest.mark.asyncio
async def test_worker_run_pw_stop_called_even_if_br_close_raises() -> None:
    """Fix #1 / P2-2: исключение в br.close() не мешает pw.stop() выполниться."""
    calls: list[str] = []
    br = _TrackedBrowser(calls, raises=True)
    pw = _TrackedPlaywright(calls)

    await _run_worker_with_mocks(br=br, pw=pw)

    assert "pw.stop" in calls, "pw.stop() должен быть вызван даже после исключения в br.close()"


@pytest.mark.asyncio
async def test_worker_run_teardown_when_br_is_none() -> None:
    """Fix #1 / P2-2: если br=None (pw.start упал до connect_over_cdp) — pw.stop() вызывается.

    Сценарий: Worker доходит до pw.start() но connect_over_cdp кидает исключение.
    В этом случае br=None, pw!=None — pw.stop() всё равно должен вызваться.
    """
    calls: list[str] = []
    pw = _TrackedPlaywright(calls)

    # Создадим трекер-br, который будет возбуждать исключение при connect
    # (имитируем ситуацию когда connect_over_cdp бросил исключение — br=None).
    worker = Worker(
        label="test-br-none",
        sport=29,
        slug="soccer",
        on_event=lambda f: None,
        cfg={
            "proxy_host": "127.0.0.1",
            "proxy_port": "1080",
            "proxy_user": "u",
            "proxy_pass": "p",
            "cdp": "9998",
            "socks": "19998",
        },
    )

    fake_relay = _FakeRelayServer([])
    pw_mock = pw

    # connect_over_cdp бросает исключение → br остаётся None в finally
    connect_mock = AsyncMock(side_effect=RuntimeError("cdp connect failed"))
    chromium_mock = MagicMock()
    chromium_mock.connect_over_cdp = connect_mock
    pw_mock.chromium = chromium_mock  # type: ignore[attr-defined]

    ap_instance = AsyncMock()
    ap_instance.start = AsyncMock(return_value=pw_mock)
    ap_cm = MagicMock()
    ap_cm.return_value = ap_instance

    with (
        patch("aggregator.fleet.worker.socks5_relay", new=AsyncMock(return_value=fake_relay)),
        patch("aggregator.fleet.worker._wcdp", new=AsyncMock(return_value=True)),
        patch("playwright.async_api.async_playwright", new=ap_cm),
        patch.object(worker, "_login", new=AsyncMock()),
    ):
        result = await worker.run(run_sec=0.0)

    # Воркер упал с исключением (FAIL: cdp connect failed), но pw.stop() должен был вызваться.
    assert "pw.stop" in calls, "pw.stop() должен вызываться даже если br=None (connect упал)"
    assert "FAIL" in result["status"]


@pytest.mark.asyncio
async def test_worker_run_br_close_timeout_does_not_block_pw_stop() -> None:
    """Fix #1 (v2) / P2-2: если br.close() ВИСИТ — таймаут не блокирует pw.stop().

    Это сценарий который NEW в v2: br.close() зависает на asyncio.sleep(9999),
    но asyncio.wait_for(br.close(), timeout=5) срабатывает и teardown продолжается.
    pw.stop() и ch.terminate() должны быть вызваны несмотря на зависание br.close().
    """
    calls: list[str] = []
    br = _TrackedBrowser(calls, hang=True)  # br.close() зависнет
    pw = _TrackedPlaywright(calls)

    result, _ = await _run_worker_with_mocks(br=br, pw=pw)

    # br.close ЗАВИСЛО → br.close НЕ должна быть в calls (таймаут прервал)
    assert "br.close" not in calls, (
        "br.close() не должен завершиться при зависании (ожидался таймаут)"
    )
    # pw.stop ДОЛЖЕН вызваться несмотря на зависание br.close
    assert "pw.stop" in calls, (
        "pw.stop() должен вызываться даже если br.close() зависло (P1-1 timeout)"
    )


@pytest.mark.asyncio
async def test_worker_run_returns_fail_when_no_proxy() -> None:
    """Smoke: Worker.run() возвращает FAIL: NO_PROXY при отсутствии proxy_host.

    Заодно проверяем что br и pw инициализируются как None до try-блока —
    NameError в finally невозможен.
    """
    worker = Worker(
        label="noproxy",
        sport=29,
        slug="soccer",
        on_event=lambda f: None,
        cfg={"proxy_host": ""},
    )
    result = await worker.run(run_sec=0.1)
    assert result["status"] == "FAIL: NO_PROXY"


# ---------------------------------------------------------------------------
# Fix #2 — Supervisor._spawn() удаляет предыдущий профиль при respawn
# ---------------------------------------------------------------------------


def _pool(n: int = 3, **kw: float) -> FleetAccountPool:
    accs = [
        FleetAccount(
            id="a%d" % i,
            cfg={
                "proxy_host": "127.0.0.1",
                "proxy_port": "1080",
                "cdp": str(9300 + i),
                "socks": str(19300 + i),
            },
        )
        for i in range(n)
    ]
    return FleetAccountPool(accs, **kw)


@pytest.mark.asyncio
async def test_supervisor_cleans_old_profile_on_respawn() -> None:
    """Fix #2: при respawn аккаунта старый профиль удаляется через rmtree."""
    rmtree_calls: list[str] = []

    class QuickWorker(Worker):
        async def run(self, run_sec: float, watchlist: list[int] | None = None) -> dict[str, Any]:
            await asyncio.sleep(0.001)
            return {"label": self.label, "status": "DONE"}

    pool = _pool(2, cooldown_sec=0.01)
    sup = Supervisor(
        pool=pool,
        on_event=lambda f: None,
        target_k=1,
        worker_run_sec=0.01,
        _worker_cls=QuickWorker,
    )

    original_rmtree = shutil.rmtree

    def tracking_rmtree(path: str, **kwargs: Any) -> None:
        rmtree_calls.append(path)
        original_rmtree(path, **kwargs)

    with patch("aggregator.fleet.supervisor.shutil.rmtree", side_effect=tracking_rmtree):
        await sup.run(total_sec=0.08)

    # При respawn одного аккаунта должен был появиться вызов rmtree для
    # /tmp/fleet-sup-a0-* (старый профиль) или аналогичный
    fleet_sup_calls = [p for p in rmtree_calls if "fleet-sup-" in p]
    assert fleet_sup_calls, (
        "ожидался rmtree для fleet-sup-профиля при respawn; got: %r" % rmtree_calls
    )


@pytest.mark.asyncio
async def test_supervisor_no_rmtree_on_first_spawn() -> None:
    """Fix #2: при первом спавне (нет предыдущего профиля) rmtree НЕ вызывается."""
    rmtree_calls: list[str] = []

    class QuickFinish(Worker):
        async def run(self, run_sec: float, watchlist: list[int] | None = None) -> dict[str, Any]:
            return {"label": self.label, "status": "DONE"}

    pool = _pool(2, cooldown_sec=10000.0)  # cooldown большой — respawn не произойдёт
    sup = Supervisor(
        pool=pool,
        on_event=lambda f: None,
        target_k=1,
        worker_run_sec=0.01,
        _worker_cls=QuickFinish,
    )

    original_rmtree = shutil.rmtree

    def tracking_rmtree(path: str, **kwargs: Any) -> None:
        rmtree_calls.append(path)
        original_rmtree(path, **kwargs)

    with patch("aggregator.fleet.supervisor.shutil.rmtree", side_effect=tracking_rmtree):
        await sup.run(total_sec=0.05)

    fleet_sup_calls = [p for p in rmtree_calls if "fleet-sup-" in p]
    assert not fleet_sup_calls, (
        "rmtree fleet-sup не должен вызываться при первом спавне; got: %r" % fleet_sup_calls
    )


def test_safe_rmtree_fleet_profile_ignores_wrong_path() -> None:
    """Fix #2 / P1-2: _safe_rmtree_fleet_profile НЕ удаляет пути, не соответствующие шаблону."""
    with patch("aggregator.fleet.supervisor.shutil.rmtree") as mock_rm:
        # Путь не соответствует шаблону fleet-sup-<acc_id>-N
        _safe_rmtree_fleet_profile("/tmp/some-other-dir", "a0")
        mock_rm.assert_not_called()

        _safe_rmtree_fleet_profile("/tmp/fleet-sup-a1-5", "a0")  # чужой acc_id
        mock_rm.assert_not_called()

        _safe_rmtree_fleet_profile("/etc/passwd", "a0")
        mock_rm.assert_not_called()


def test_safe_rmtree_fleet_profile_removes_correct_path() -> None:
    """Fix #2 / P1-2: _safe_rmtree_fleet_profile удаляет правильный путь."""
    with patch("aggregator.fleet.supervisor.shutil.rmtree") as mock_rm:
        _safe_rmtree_fleet_profile("/tmp/fleet-sup-a0-3", "a0")
        mock_rm.assert_called_once_with("/tmp/fleet-sup-a0-3", ignore_errors=True)


# ---------------------------------------------------------------------------
# P1-2: дополнительные тесты безопасности пути (_safe_rmtree_fleet_profile)
# ---------------------------------------------------------------------------


def test_safe_rmtree_rejects_acc_id_with_slash() -> None:
    """P1-2: acc_id содержащий '/' отклоняется — rmtree НЕ вызывается."""
    with patch("aggregator.fleet.supervisor.shutil.rmtree") as mock_rm:
        _safe_rmtree_fleet_profile("/tmp/fleet-sup-a0/evil-3", "a0/evil")
        mock_rm.assert_not_called()


def test_safe_rmtree_rejects_acc_id_with_dotdot() -> None:
    """P1-2: acc_id содержащий '..' отклоняется — rmtree НЕ вызывается."""
    with patch("aggregator.fleet.supervisor.shutil.rmtree") as mock_rm:
        _safe_rmtree_fleet_profile("/tmp/fleet-sup-../etc-3", "../etc")
        mock_rm.assert_not_called()


def test_safe_rmtree_rejects_path_traversal_via_literal() -> None:
    """P1-2: буквальный path-traversal в path отклоняется."""
    with patch("aggregator.fleet.supervisor.shutil.rmtree") as mock_rm:
        # Попытка обойти regex: путь начинается верно, но содержит ..
        _safe_rmtree_fleet_profile("/tmp/fleet-sup-a0-3/../../../etc", "a0")
        mock_rm.assert_not_called()


def test_safe_rmtree_rejects_path_outside_tmp_via_symlink(tmp_path: Any) -> None:
    """P1-2: путь-симлинк за пределы /tmp отклоняется через realpath-проверку."""
    import os  # noqa: PLC0415

    # Создать директорию вне /tmp и симлинк на неё из /tmp
    outside_dir = tmp_path / "outside"
    outside_dir.mkdir()

    symlink_name = "/tmp/fleet-sup-a0-9999"
    try:
        if os.path.lexists(symlink_name):
            os.unlink(symlink_name)
        os.symlink(str(outside_dir), symlink_name)

        with patch("aggregator.fleet.supervisor.shutil.rmtree") as mock_rm:
            _safe_rmtree_fleet_profile(symlink_name, "a0")
            # realpath(symlink_name) → tmp_path/outside, которое НЕ начинается с
            # /tmp/fleet-sup-a0- → должно быть отклонено
            mock_rm.assert_not_called()
    finally:
        try:
            os.unlink(symlink_name)
        except Exception:
            pass


def test_safe_rmtree_accepts_valid_path() -> None:
    """P1-2: валидный путь (без симлинков) — rmtree вызывается."""
    import os  # noqa: PLC0415

    test_dir = "/tmp/fleet-sup-validacc-42"
    try:
        os.makedirs(test_dir, exist_ok=True)
        # Без мока — реальный rmtree должен удалить директорию
        _safe_rmtree_fleet_profile(test_dir, "validacc")
        assert not os.path.exists(test_dir), "директория должна быть удалена"
    finally:
        try:
            shutil.rmtree(test_dir, ignore_errors=True)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# P2-1: _RelayServer трекает и отменяет in-flight задачи
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_relay_server_cancels_inflight_tasks_on_close() -> None:
    """P2-1: _RelayServer.close() отменяет активные _handle задачи."""
    from aggregator.fleet.worker import _RelayServer

    tasks: set[asyncio.Task[Any]] = set()
    cancelled: list[bool] = []

    async def long_handle() -> None:
        try:
            await asyncio.sleep(9999)
        except asyncio.CancelledError:
            cancelled.append(True)
            raise

    loop = asyncio.get_event_loop()
    t = loop.create_task(long_handle())
    tasks.add(t)
    t.add_done_callback(tasks.discard)

    # Дать задаче стартовать (дойти до await asyncio.sleep(9999)) прежде чем отменять.
    await asyncio.sleep(0)

    # Фиктивный asyncio.AbstractServer
    raw_server = MagicMock()
    raw_server.close = MagicMock()
    raw_server.wait_closed = AsyncMock()

    relay = _RelayServer(raw_server, tasks)
    relay.close()
    await relay.wait_closed()

    assert cancelled, "_handle задача должна быть отменена при relay.close()"
    assert len(tasks) == 0, "отменённые задачи должны быть очищены после wait_closed()"


@pytest.mark.asyncio
async def test_relay_server_close_empty_tasks_no_error() -> None:
    """P2-1: _RelayServer без активных задач — close()/wait_closed() не падает."""
    from aggregator.fleet.worker import _RelayServer

    raw_server = MagicMock()
    raw_server.close = MagicMock()
    raw_server.wait_closed = AsyncMock()

    relay = _RelayServer(raw_server, set())
    relay.close()
    await relay.wait_closed()  # не должно бросать исключение


# ---------------------------------------------------------------------------
# Fix #4 — IngestRouter: TTL eviction _last_quote_signature
# ---------------------------------------------------------------------------


def _mk_source_event(
    source_id: str,
    event_id: str,
    received_at: datetime,
    periods: list[dict] | None = None,
) -> Any:
    from aggregator.types import SourceEvent

    payload: dict[str, Any] = {"Pid": 42}
    if periods is not None:
        payload["Periods"] = periods
    return SourceEvent(
        source_id=source_id,
        family="ps3838",
        transport="browser_ws",
        event_id=event_id,
        payload=payload,
        collected_at=received_at,
        received_at=received_at,
    )


def test_ingest_ttl_eviction_removes_stale_signatures() -> None:
    """Fix #4: устаревшие записи _last_quote_signature удаляются при purge."""
    from aggregator.decision import DecisionEngine
    from aggregator.ingest import IngestRouter
    from aggregator.store import ProvenanceStore

    router = IngestRouter(ProvenanceStore(), DecisionEngine(), dedup_window_sec=2.0)

    now = datetime.now(timezone.utc)
    old_ts = now - timedelta(seconds=100)  # > 10 * 2.0 = 20 сек → стала stale

    # Вручную засеем устаревшую запись
    sig_key = ("src1", "evt:old")
    router._last_quote_signature[sig_key] = (
        frozenset([("k", "v")]),
        old_ts,
    )
    # И свежую запись
    fresh_key = ("src1", "evt:fresh")
    router._last_quote_signature[fresh_key] = (
        frozenset([("k2", "v2")]),
        now,
    )

    router._purge_stale_signatures(now)

    assert sig_key not in router._last_quote_signature, (
        "устаревшая запись должна быть удалена"
    )
    assert fresh_key in router._last_quote_signature, (
        "свежая запись должна остаться"
    )


def test_ingest_ttl_eviction_triggered_periodically() -> None:
    """Fix #4: purge вызывается каждые ~1000 ingest; свежие записи не затрагиваются."""
    from aggregator.decision import DecisionEngine
    from aggregator.ingest import IngestRouter
    from aggregator.store import ProvenanceStore

    router = IngestRouter(ProvenanceStore(), DecisionEngine(), dedup_window_sec=1.0)
    # Уменьшим интервал для быстрого теста
    router._signature_purge_interval = 5

    now = datetime.now(timezone.utc)
    old_ts = now - timedelta(seconds=50)  # > 10 * 1.0 = 10 сек → stale
    stale_key = ("src_stale", "evt:stale")
    router._last_quote_signature[stale_key] = (frozenset(), old_ts)

    periods = [{"Number": 0, "MoneyLine": {"Home": {"value": 1.9}, "Away": {"value": 2.0}}}]

    # Инжектируем 5 событий — на 5-м должен сработать purge
    for i in range(5):
        ev = _mk_source_event(
            source_id="src%d" % i,
            event_id="evt:%d" % i,
            received_at=now,
            periods=periods,
        )
        router.ingest(ev)

    # После 5 ingest purge должен был сработать
    assert stale_key not in router._last_quote_signature, (
        "устаревший ключ должен быть вычищен после периодического purge"
    )


def test_ingest_ttl_eviction_keeps_fresh_dedup_signatures() -> None:
    """Fix #4: свежие подписи (внутри окна) не удаляются и dedup продолжает работать."""
    from aggregator.decision import DecisionEngine
    from aggregator.ingest import IngestRouter
    from aggregator.store import ProvenanceStore

    router = IngestRouter(ProvenanceStore(), DecisionEngine(), dedup_window_sec=60.0)
    router._signature_purge_interval = 2  # сразу purge

    now = datetime.now(timezone.utc)
    periods = [{"Number": 0, "MoneyLine": {"Home": {"value": 1.9}, "Away": {"value": 2.0}}}]

    ev1 = _mk_source_event("src_fresh", "evt:fresh1", now, periods=periods)
    router.ingest(ev1)

    # После purge (на 2-м ingest) свежая запись должна остаться
    ev2 = _mk_source_event("src_fresh2", "evt:fresh2", now, periods=periods)
    router.ingest(ev2)

    # Dedup: повторная отправка первого события должна быть подавлена
    result = router.ingest(ev1)
    assert result is None, "повторное событие внутри dedup_window должно быть подавлено"
