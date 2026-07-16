"""Handler for efbazaar.trade.forgot-password-request.

Backpressure UX: before acquiring the KonamiClient semaphore, we snapshot the
current queue depth. If someone else is ahead of us we publish worker-queued
so trade-service can extend the state deadline and post a STATUS message
in the trade chat. Once we actually acquire the semaphore we publish
worker-started so the user sees things are moving.

We drive the semaphore + subprocess call ourselves (via KonamiClient's public
``semaphore`` property and ``invoke_reset`` method) rather than calling
``trigger_reset``: worker-started must fire after the semaphore is acquired
but before the subprocess starts, and ``trigger_reset`` doesn't let a caller
observe that boundary.
"""

from __future__ import annotations

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
        semaphore = self._konami.semaphore
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

        # worker-started must fire AFTER the semaphore is acquired but BEFORE
        # the subprocess runs — we call invoke_reset() rather than
        # trigger_reset() precisely because we already hold the slot.
        async with semaphore:
            await self._producer.publish(
                TOPIC_WORKER_STARTED,
                str(event.trade_id),
                e.WorkerStarted(
                    trade_id=event.trade_id,
                    purpose="forgot-password",
                ),
            )
            await self._konami.invoke_reset(event.mailbox_email, event.konami_id)
