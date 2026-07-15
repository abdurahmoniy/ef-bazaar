"""smart-admin-worker entrypoint.

Assembles the FastAPI app, wires the lifespan hook that starts the aiokafka
consumer + producer (IMAP poller registry follows in a later task), and
mounts /health + /metrics. Uvicorn runs this via
`uvicorn smart_admin_worker.main:app`.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

from smart_admin_worker.config import get_settings
from smart_admin_worker.http import health
from smart_admin_worker.kafka.consumer import KafkaConsumerRunner
from smart_admin_worker.kafka.producer import KafkaProducerClient
from smart_admin_worker.kafka.topics import REQUEST_TOPICS
from smart_admin_worker.logging_config import configure_logging


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    log = structlog.get_logger(__name__)
    log.info("startup", version=app.version)

    producer = KafkaProducerClient(settings.kafka_bootstrap_servers)
    await producer.start()
    app.state.producer = producer

    # Handlers registered from later tasks. For now a placeholder that logs.
    async def _placeholder(event: object) -> None:
        log.warning("received event but no handler wired yet", event=repr(event))

    handlers = {topic: _placeholder for topic in REQUEST_TOPICS}

    consumer = KafkaConsumerRunner(
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id=settings.kafka_consumer_group,
        topics=list(REQUEST_TOPICS),
        handlers=handlers,
        on_state_change=health.set_kafka_state,
    )
    await consumer.start()
    app.state.consumer = consumer

    try:
        yield
    finally:
        await consumer.stop()
        await producer.stop()
        log.info("shutdown")


app = FastAPI(title="smart-admin-worker", version="0.1.0", lifespan=lifespan)
app.include_router(health.router)
