import unittest
from unittest.mock import patch

from aggregator.fleet.worker import Worker


def _worker(*, cooldown: float = 30.0) -> Worker:
    return Worker(
        label="pin-test",
        sport=29,
        slug="soccer",
        on_event=lambda _event: None,
        cfg={"morebet_429_cooldown_sec": cooldown},
    )


class WorkerRateLimitTests(unittest.TestCase):
    def test_http_429_cooldown_recovers_inside_same_worker_run(self) -> None:
        worker = _worker(cooldown=30.0)

        with patch("aggregator.fleet.worker.time.monotonic", return_value=100.0):
            worker._record_http_429()

        self.assertTrue(worker._got_429)
        self.assertEqual(worker._http_429_count, 1)
        self.assertTrue(worker._morebet_429_cooldown_active(now=129.9))
        self.assertFalse(worker._morebet_429_cooldown_active(now=130.0))

    def test_no_429_never_starts_cooldown(self) -> None:
        worker = _worker()

        self.assertFalse(worker._morebet_429_cooldown_active(now=10_000.0))
