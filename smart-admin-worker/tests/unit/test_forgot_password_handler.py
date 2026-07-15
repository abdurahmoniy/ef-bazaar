from __future__ import annotations

import asyncio
import threading
from unittest.mock import AsyncMock
from uuid import UUID

from smart_admin_worker.handlers.forgot_password import ForgotPasswordHandler
from smart_admin_worker.kafka import events as e
from smart_admin_worker.konami.client import KonamiClient


async def test_publishes_worker_started_when_semaphore_free():
    producer = AsyncMock()

    class InstantKonami(KonamiClient):
        def _run_subprocess(self, email, konami_id):  # override — skip real subprocess
            return None

    konami = InstantKonami(max_concurrent=1)
    handler = ForgotPasswordHandler(konami=konami, producer=producer)

    tid = UUID("11111111-1111-1111-1111-111111111111")
    await handler.handle(e.ForgotPasswordRequest(
        trade_id=tid,
        mailbox_email="trade-abc@efbazaar.uz",
        konami_id=None,
    ))

    topics_published = [c.args[0] for c in producer.publish.await_args_list]
    assert "efbazaar.trade.worker-queued" not in topics_published
    assert "efbazaar.trade.worker-started" in topics_published


async def test_publishes_worker_queued_when_semaphore_busy():
    producer = AsyncMock()

    # _run_subprocess executes inside a worker thread (via asyncio.to_thread),
    # so it needs thread-safe primitives rather than asyncio.Event.
    started = threading.Event()
    hold = threading.Event()

    class SlowKonami(KonamiClient):
        def _run_subprocess(self, email, konami_id):  # override — simulate a slow subprocess
            started.set()
            hold.wait()

    konami = SlowKonami(max_concurrent=1)
    handler = ForgotPasswordHandler(konami=konami, producer=producer)

    tid_a = UUID("11111111-1111-1111-1111-111111111111")
    tid_b = UUID("22222222-2222-2222-2222-222222222222")

    task_a = asyncio.create_task(handler.handle(e.ForgotPasswordRequest(
        trade_id=tid_a, mailbox_email="a@x", konami_id=None,
    )))
    await asyncio.to_thread(started.wait)  # A is holding the semaphore

    task_b = asyncio.create_task(handler.handle(e.ForgotPasswordRequest(
        trade_id=tid_b, mailbox_email="b@x", konami_id=None,
    )))
    await asyncio.sleep(0.02)  # let B enqueue

    # B should have published worker-queued by now
    published = [(c.args[0], c.args[1]) for c in producer.publish.await_args_list]
    assert ("efbazaar.trade.worker-queued", str(tid_b)) in published

    hold.set()
    await task_a
    await task_b
