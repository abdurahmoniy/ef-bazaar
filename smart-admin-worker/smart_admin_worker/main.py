"""smart-admin-worker entrypoint — full wiring.

Assembles the FastAPI app, wires the lifespan hook that starts the aiokafka
consumer + producer, the Mailcow/Konami/IMAP/Redis clients, and dispatches
all four request-topic handlers by topic. Uvicorn runs this via
`uvicorn smart_admin_worker.main:app`.
"""

from __future__ import annotations

import base64
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID

import redis.asyncio as aioredis
import structlog
from fastapi import FastAPI

from smart_admin_worker.config import get_settings
from smart_admin_worker.crypto.field_encryptor import FieldEncryptor
from smart_admin_worker.handlers.email_provision import EmailProvisionHandler
from smart_admin_worker.handlers.forgot_password import ForgotPasswordHandler
from smart_admin_worker.handlers.imap_poll import ImapPollHandler
from smart_admin_worker.handlers.mailbox_rotate import MailboxRotateHandler
from smart_admin_worker.http import health
from smart_admin_worker.imap.detector import KonamiEmailDetector
from smart_admin_worker.imap.factory import ImapToolsConnectionFactory
from smart_admin_worker.imap.registry import ImapPollerRegistry
from smart_admin_worker.kafka.consumer import KafkaConsumerRunner
from smart_admin_worker.kafka.producer import KafkaProducerClient
from smart_admin_worker.kafka.topics import (
    REQUEST_TOPICS,
    TOPIC_EMAIL_PROVISION_REQ,
    TOPIC_FORGOT_PW_REQ,
    TOPIC_IMAP_POLL_REQ,
    TOPIC_MAILBOX_ROTATE_REQ,
)
from smart_admin_worker.konami.client import KonamiClient
from smart_admin_worker.logging_config import configure_logging
from smart_admin_worker.mailcow.client import MailcowClient
from smart_admin_worker.redis.lock import RedisLockManager


def _load_master_key(path: Path) -> bytes:
    return base64.b64decode(path.read_text().strip())


def _read_api_key(path: Path) -> str:
    return path.read_text().strip()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    log = structlog.get_logger(__name__)
    log.info("startup", version=app.version)

    master_key = _load_master_key(settings.master_key_file)
    mailcow_api_key = _read_api_key(settings.mailcow_api_key_file)

    encryptor = FieldEncryptor(master_key)
    mailcow = MailcowClient(settings.mailcow_api_url, mailcow_api_key)
    producer = KafkaProducerClient(settings.kafka_bootstrap_servers)
    konami = KonamiClient(max_concurrent=settings.max_concurrent_rotate)

    redis_client = aioredis.Redis(
        host=settings.redis_host,
        port=settings.redis_port,
        password=settings.redis_password or None,
        decode_responses=True,
    )
    redis_lock = RedisLockManager(redis_client, ttl_seconds=settings.imap_poll_lock_ttl_seconds)

    detector = KonamiEmailDetector(settings.konami_sender_allowlist_set)
    poller_registry = ImapPollerRegistry(
        factory=ImapToolsConnectionFactory(),
        detector=detector,
        lock=redis_lock,
        poll_interval=settings.imap_poll_interval_seconds,
        imap_host=settings.imap_host,
        imap_port=settings.imap_port,
    )

    # --- MVP simplification (documented, not fixed here) ---------------------
    # The IMAP poll handler needs the mailbox's plaintext password to log in,
    # and the rotate handler needs mailbox_id -> email. Neither is available
    # from the request event alone today: trade-service doesn't yet round-trip
    # the encrypted password payload on imap-poll-request (that's Task 15's
    # ImapPollRequest DTO change). Until then we keep small in-memory caches
    # populated by the email-provision path; a cache miss means the worker
    # skips the poll/rotate this time (rotate falls back to a 404 from Mailcow,
    # which tenacity retries and eventually surfaces in the logs). This does
    # NOT survive a worker restart — acceptable for MVP happy-path only.
    app.state.password_cache = {}
    app.state.mailbox_id_to_email = {}

    async def password_provider(mailbox_email: str) -> str:
        """MVP: looks up a plaintext password cached in-process at provision time.

        Not durable across restarts — see the MVP note above. Task 15 closes
        this gap by having trade-service resend the encrypted password on
        imap-poll-request so the worker can decrypt on demand instead.
        """
        return app.state.password_cache.get(mailbox_email, "")

    async def email_provider(mailbox_id: UUID) -> str:
        """MVP: looks up mailbox_id -> email from an in-process cache.

        Same caveat as password_provider — see the MVP note above.
        """
        return app.state.mailbox_id_to_email.get(mailbox_id, "")

    email_provision_handler = EmailProvisionHandler(
        mailcow=mailcow, encryptor=encryptor, producer=producer, mailcow_domain="efbazaar.uz",
        password_cache=app.state.password_cache,
        mailbox_id_to_email=app.state.mailbox_id_to_email,
    )

    handlers: dict[str, Callable[[object], Awaitable[None]]] = {
        TOPIC_EMAIL_PROVISION_REQ: email_provision_handler.handle,
        TOPIC_FORGOT_PW_REQ: ForgotPasswordHandler(konami=konami, producer=producer).handle,
        TOPIC_IMAP_POLL_REQ: ImapPollHandler(
            registry=poller_registry, producer=producer, password_provider=password_provider,
        ).handle,
        TOPIC_MAILBOX_ROTATE_REQ: MailboxRotateHandler(
            mailcow=mailcow, encryptor=encryptor, producer=producer,
            email_provider=email_provider,
        ).handle,
    }

    consumer = KafkaConsumerRunner(
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id=settings.kafka_consumer_group,
        topics=list(REQUEST_TOPICS),
        handlers=handlers,
        on_state_change=health.set_kafka_state,
    )

    # Both starts share one try/finally so that if consumer.start() throws,
    # producer.stop() still runs and we don't leak the producer's connection.
    await producer.start()
    try:
        await consumer.start()

        app.state.producer = producer
        app.state.consumer = consumer
        app.state.mailcow = mailcow
        app.state.redis = redis_client
        app.state.poller_registry = poller_registry

        try:
            yield
        finally:
            # Cleanup order note: producer.stop() is NOT called here — it runs
            # in the outer `finally` below instead, after everything else has
            # shut down. The original design called for
            # consumer.stop -> poller_registry.cancel_all -> producer.stop ->
            # mailcow.aclose -> redis_client.aclose, but I1's fix (see comment
            # above producer.start()) wraps producer.start()/stop() around the
            # *entire* consumer lifecycle so that a failed consumer.start()
            # still stops the producer. A necessary consequence of that shape
            # is that producer.stop() can only live in the outermost finally,
            # i.e. last. This is intentional: the producer must outlive every
            # other service, since any of them (e.g. handlers still in flight
            # via poller_registry) could still try to emit a Kafka message
            # during shutdown.
            await consumer.stop()
            await poller_registry.cancel_all()
            await mailcow.aclose()
            await redis_client.aclose()
            log.info("shutdown")
    finally:
        await producer.stop()


app = FastAPI(title="smart-admin-worker", version="0.1.0", lifespan=lifespan)
app.include_router(health.router)
