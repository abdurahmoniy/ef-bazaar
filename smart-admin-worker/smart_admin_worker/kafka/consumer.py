"""aiokafka consumer runner with per-topic async handler dispatch.

Retries a handler up to 3 times with exponential backoff (tenacity), then
commits the offset and moves on. Never blocks the consumer indefinitely on a
poison-pill message.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable, Mapping

from aiokafka import AIOKafkaConsumer
from tenacity import (
    AsyncRetrying,
    RetryError,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from smart_admin_worker.kafka.events import from_json

log = logging.getLogger(__name__)

Handler = Callable[[object], Awaitable[None]]
StateCallback = Callable[[str], None]


class KafkaConsumerRunner:
    def __init__(
        self,
        bootstrap_servers: str,
        group_id: str,
        topics: list[str],
        handlers: Mapping[str, Handler],
        on_state_change: StateCallback | None = None,
    ) -> None:
        self._bootstrap = bootstrap_servers
        self._group = group_id
        self._topics = topics
        self._handlers = handlers
        self._on_state_change = on_state_change or (lambda _: None)
        self._task: asyncio.Task | None = None
        self._consumer: AIOKafkaConsumer | None = None
        self._stop_event = asyncio.Event()

    async def start(self) -> None:
        self._consumer = AIOKafkaConsumer(
            *self._topics,
            bootstrap_servers=self._bootstrap,
            group_id=self._group,
            enable_auto_commit=False,
            auto_offset_reset="earliest",
        )
        self._on_state_change("starting")
        await self._consumer.start()
        self._on_state_change("joined")
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        if self._consumer is not None:
            await self._consumer.stop()
            self._consumer = None
        self._on_state_change("stopped")

    async def _run_loop(self) -> None:
        assert self._consumer is not None
        try:
            async for msg in self._consumer:
                await self._process_one(msg)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            log.exception("consumer loop crashed: %s", e)
            self._on_state_change("error")
            raise

    async def _process_one(self, msg) -> None:
        try:
            event = from_json(msg.topic, msg.value)
        except Exception as e:  # noqa: BLE001
            log.error("skipping malformed message on %s: %s", msg.topic, e)
            await self._consumer.commit()
            return

        handler = self._handlers.get(msg.topic)
        if handler is None:
            log.warning("no handler for topic %s — committing and skipping", msg.topic)
            await self._consumer.commit()
            return

        try:
            async for attempt in AsyncRetrying(
                stop=stop_after_attempt(3),
                wait=wait_exponential(multiplier=1, min=1, max=10),
                reraise=True,
                retry=retry_if_exception_type(Exception),
            ):
                with attempt:
                    await handler(event)
        except RetryError:
            log.error("handler for %s failed after retries — dropping message", msg.topic)
        except Exception as e:  # noqa: BLE001
            log.error("handler for %s exhausted retries: %s", msg.topic, e)
        finally:
            await self._consumer.commit()
