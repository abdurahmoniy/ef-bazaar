"""Handler for efbazaar.trade.forgot-password-request.

Backpressure UX: before acquiring the KonamiClient semaphore, we snapshot the
current queue depth. If someone else is ahead of us we publish worker-queued
so trade-service can extend the state deadline and post a STATUS message
in the trade chat. Once we actually acquire the semaphore we publish
worker-started so the user sees things are moving.

We deliberately reach past KonamiClient's public trigger_reset() and drive
the semaphore + subprocess call ourselves: worker-started must fire after
the semaphore is acquired but before the subprocess starts, and
trigger_reset doesn't expose a seam for that.
"""

from __future__ import annotations

import asyncio

from smart_admin_worker.kafka import events as e
from smart_admin_worker.kafka.producer import KafkaProducerClient
from smart_admin_worker.kafka.topics import TOPIC_WORKER_QUEUED, TOPIC_WORKER_STARTED
from smart_admin_worker.konami.client import KonamiClient

_ESTIMATED_SECONDS_PER_SLOT = 30


class ForgotPasswordHandler:
    def __init__(self, konami: KonamiClient, producer: KafkaProducerClient) -> None:
        self._konami = konami
        self._producer = producer

    async def handle(self, event: e.ForgotPasswordRequest) -> None:
        # queue_position() only counts tasks already blocked in acquire(), so it
        # reads 0 for the very next caller behind the current holder (that
        # caller hasn't called acquire() yet, so it isn't in _waiters). Use
        # locked() — true the instant there's no free slot — to decide whether
        # *this* call will have to wait at all; queue_position() then tells us
        # how many callers are already ahead of us in line for the estimate.
        semaphore = self._konami._semaphore  # noqa: SLF001 — intentional
        if semaphore.locked():
            queue_position = self._konami.queue_position()
            await self._producer.publish(
                TOPIC_WORKER_QUEUED,
                str(event.trade_id),
                e.WorkerQueued(
                    trade_id=event.trade_id,
                    purpose="forgot-password",
                    estimated_wait_seconds=(queue_position + 1) * _ESTIMATED_SECONDS_PER_SLOT,
                ),
            )

        # Intentional private access: we need to publish worker-started AFTER
        # the semaphore is acquired but BEFORE the subprocess runs, which the
        # public trigger_reset() interface doesn't expose.
        async with semaphore:
            await self._producer.publish(
                TOPIC_WORKER_STARTED,
                str(event.trade_id),
                e.WorkerStarted(
                    trade_id=event.trade_id,
                    purpose="forgot-password",
                ),
            )
            # Call the subprocess directly, bypassing trigger_reset's own
            # semaphore acquisition — we already hold the slot.
            await asyncio.to_thread(
                self._konami._run_subprocess,  # noqa: SLF001 — intentional
                event.mailbox_email,
                event.konami_id,
            )
