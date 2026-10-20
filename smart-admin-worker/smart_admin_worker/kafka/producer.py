"""aiokafka producer that blocks on broker ack (acks="all") + JSON serialization.

`publish()` uses `send_and_wait` under the hood, so every call awaits the full
in-sync-replica acknowledgement before returning. That means back-pressure and
broker/network failures surface synchronously to the caller — the trade-off for
losing the throughput of a true fire-and-forget send. Idempotence is off
(single-writer-per-key semantics are already handled up-stream), but `acks="all"`
keeps us durable against a single-broker failure between send and ack.
"""

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


class ResultPublicationError(RuntimeError):
    """A required result was not acknowledged; its request must remain uncommitted."""


async def publish_required_result(
    producer: KafkaProducerClient, topic: str, key: str, event: Any,
) -> None:
    try:
        await producer.publish(topic, key, event)
    except Exception as exc:
        raise ResultPublicationError(str(exc)) from exc
