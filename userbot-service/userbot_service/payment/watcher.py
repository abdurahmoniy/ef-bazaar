"""The Humo chat watcher for the account bound to PAYMENT."""

from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from userbot_service.config import as_chat_ref
from userbot_service.payment.observation import observation_for
from userbot_service.payment.queue import PendingQueue
from userbot_service.telegram.ports import AccountClient, Msg

log = logging.getLogger(__name__)

STUCK_AFTER_SECONDS = 60


class HumoWatcher:
    def __init__(self, *, account_id: UUID, telegram_user_id: int, client: AccountClient,
                 queue: PendingQueue, kafka, source_chat: str) -> None:
        self.account_id = account_id
        self._tg = telegram_user_id
        self._client = client
        self._queue = queue
        self._kafka = kafka
        self._chat = as_chat_ref(source_chat)
        self._flush_lock = asyncio.Lock()

    async def attach(self) -> None:
        # Handler first, history second: a message arriving in between is seen
        # twice, which the queue's primary key and payment's idempotency absorb.
        # The other order would lose it.
        self._client.on_incoming(self._chat, self._on_message)
        last = await self._queue.last_message_id(self.account_id)
        if last is None:
            # A newly bound account: its past is not the platform's money.
            newest = await self._client.newest_message_id(self._chat)
            await self._queue.init_state(self.account_id, newest)
        else:
            missed = await self._client.history_after(self._chat, last)
            for msg in missed:
                await self._queue.record(self.account_id, msg.id, observation_for(msg, self._tg))
            if missed:
                log.info("caught up %d message(s) missed while down", len(missed))
        await self.flush()

    async def _on_message(self, msg: Msg) -> None:
        await self._queue.record(self.account_id, msg.id, observation_for(msg, self._tg))
        await self.flush()

    async def flush(self) -> None:
        async with self._flush_lock:
            for item in await self._queue.pending(self.account_id):
                try:
                    await self._kafka.publish(item.topic, item.payload,
                                              key=f"{self._tg}:{item.message_id}")
                except Exception:
                    log.exception("publishing observation %s failed; it stays queued",
                                  item.message_id)
                    return
                await self._queue.done(self.account_id, item.message_id)
                log.info("published %s for message %s", item.topic, item.message_id)

    async def health(self) -> tuple[bool, str]:
        if not self._client.is_connected:
            return False, "Telegram client is not connected"
        if not self._client.has_handlers():
            return False, "no message handler is registered — updates go nowhere"
        age = await self._queue.oldest_age_seconds(self.account_id)
        if age is not None and age > STUCK_AFTER_SECONDS:
            return False, f"an observation has been unpublished for {int(age)}s"
        return True, ""
