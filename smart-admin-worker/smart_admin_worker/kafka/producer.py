"""aiokafka producer with fire-and-forget send + JSON serialization."""

from __future__ import annotations

import logging
from typing import Any

from aiokafka import AIOKafkaProducer

from smart_admin_worker.kafka.events import to_json

log = logging.getLogger(__name__)


class KafkaProducerClient:
    def __init__(self, bootstrap_servers: str) -> None:
        self._bootstrap = bootstrap_servers
        self._producer: AIOKafkaProducer | None = None

    async def start(self) -> None:
        self._producer = AIOKafkaProducer(
            bootstrap_servers=self._bootstrap,
            enable_idempotence=False,
            acks="all",
        )
        await self._producer.start()

    async def stop(self) -> None:
        if self._producer is not None:
            await self._producer.stop()
            self._producer = None

    async def publish(self, topic: str, key: str, event: Any) -> None:
        assert self._producer is not None, "producer not started"
        payload = to_json(event)
        await self._producer.send_and_wait(
            topic=topic,
            key=key.encode("utf-8"),
            value=payload,
        )
        log.debug("published to %s key=%s", topic, key)
