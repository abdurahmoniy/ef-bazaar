"""aiokafka consumer runner with per-topic async handler dispatch.

Retries a handler up to 3 times with exponential backoff (tenacity), then
commits ordinary failed messages. Required-result publication failure stops
the consumer without committing, preserving the request for recovery.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable, Mapping

from aiokafka import AIOKafkaConsumer
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from smart_admin_worker.kafka.events import from_json
from smart_admin_worker.kafka.producer import ResultPublicationError

log = logging.getLogger(__name__)

Handler = Callable[[object], Awaitable[None]]
StateCallback = Callable[[str], None]
# (topik, hodisa, xato) -> urinishlar tugagach bir marta.
ExhaustedCallback = Callable[[str, object, Exception], Awaitable[None]]


class KafkaConsumerRunner:
    def __init__(
        self,
        bootstrap_servers: str,
        group_id: str,
        topics: list[str],
        handlers: Mapping[str, Handler],
        on_state_change: StateCallback | None = None,
        on_exhausted: ExhaustedCallback | None = None,
    ) -> None:
        self._bootstrap = bootstrap_servers
        self._group = group_id
        self._topics = topics
        self._handlers = handlers
        self._on_state_change = on_state_change or (lambda _: None)
        # Urinishlar tugaganda BIR MARTA chaqiriladi. Usiz xabar
        # jimgina yo'qolar va uni kutayotgan tomon abadiy kutib
        # qolardi — savdo INITIATED da qotib, pul muzlab turardi.
        self._on_exhausted = on_exhausted
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

        commit = True
        try:
            async for attempt in AsyncRetrying(
                stop=stop_after_attempt(3),
                wait=wait_exponential(multiplier=1, min=1, max=10),
                reraise=True,
                retry=retry_if_exception_type(Exception),
            ):
                with attempt:
                    await handler(event)
        except Exception as e:  # noqa: BLE001
            # tenacity's reraise=True re-raises the original exception from the
            # last attempt, not a RetryError, so this is the only branch that's
            # ever reachable here.
            log.error("handler for %s exhausted retries: %s", msg.topic, e)
            if isinstance(e, ResultPublicationError):
                # Stop the consumer without committing this request. Health
                # becomes error; restart/recovery safely redelivers it.
                commit = False
                raise
            if self._on_exhausted is not None:
                try:
                    await self._on_exhausted(msg.topic, event, e)
                except Exception:  # noqa: BLE001
                    # Xabar bera olmaslik offsetni to'sib qo'ymaydi:
                    # aks holda bitta yiqilgan xabar butun navbatni
                    # to'xtatib qo'yardi.
                    log.exception("on_exhausted callback failed for %s", msg.topic)
        finally:
            if commit:
                await self._consumer.commit()
