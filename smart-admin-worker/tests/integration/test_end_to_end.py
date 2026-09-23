"""Kafka round-trip: publish forgot-password-request, expect worker-started + konami-email-received.

Konami subprocess and Mailcow API are both mocked; IMAP is a fake factory that
returns a Konami reset email on first fetch. This exercises the whole handler
chain against real Kafka + real Redis (Testcontainers).
"""

from __future__ import annotations

import asyncio
import subprocess
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

from aiokafka import AIOKafkaConsumer

from smart_admin_worker.handlers.forgot_password import ForgotPasswordHandler
from smart_admin_worker.handlers.imap_poll import ImapPollHandler
from smart_admin_worker.imap.detector import KonamiEmailDetector
from smart_admin_worker.imap.registry import ImapPollerRegistry
from smart_admin_worker.kafka.producer import KafkaProducerClient
from smart_admin_worker.kafka.topics import TOPIC_KONAMI_EMAIL, TOPIC_WORKER_STARTED
from smart_admin_worker.konami.client import KonamiClient
from smart_admin_worker.redis.lock import RedisLockManager


class _FakeImapConn:
    def __init__(self, msgs):
        self._msgs = msgs

    def fetch(self):
        return list(self._msgs)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return None


class _FakeFactory:
    def __init__(self, msgs):
        self._msgs = msgs

    def open(self, host, port, email, password):
        return _FakeImapConn(self._msgs)


async def test_forgot_password_then_imap_poll_publishes_konami_email(
    kafka_bootstrap, redis_url, monkeypatch
):
    # Mock subprocess so KonamiClient exits cleanly and quickly.
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda *a, **kw: SimpleNamespace(returncode=0, stderr=b"", stdout=b""),
    )

    producer = KafkaProducerClient(kafka_bootstrap)
    await producer.start()

    konami = KonamiClient(max_concurrent=1, timeout_seconds=30)
    fp_handler = ForgotPasswordHandler(konami=konami, producer=producer)

    # Prepare IMAP fake with a Konami reset email waiting.
    fake_msg = SimpleNamespace(
        from_="noreply@konami.com",
        subject="[KONAMI ID] Reissue Password",
        text="Please click https://id.konami.net/reset?token=xyz to reset your password.",
        date=datetime(2026, 7, 15, 10, 30, tzinfo=UTC),
    )
    factory = _FakeFactory([fake_msg])
    detector = KonamiEmailDetector(frozenset({"noreply@konami.com"}))

    import redis.asyncio as aioredis

    redis_client = aioredis.from_url(redis_url, decode_responses=True)
    lock = RedisLockManager(redis_client, ttl_seconds=6)
    registry = ImapPollerRegistry(factory=factory, detector=detector, lock=lock, poll_interval=0.05)

    async def password_provider(_email):
        return "irrelevant"

    imap_handler = ImapPollHandler(
        registry=registry, producer=producer, password_provider=password_provider,
    )

    # Subscribe to expected outbound topics BEFORE firing the handlers, so we don't miss.
    consumer = AIOKafkaConsumer(
        TOPIC_WORKER_STARTED,
        TOPIC_KONAMI_EMAIL,
        bootstrap_servers=kafka_bootstrap,
        group_id=f"test-e2e-{uuid4()}",
        auto_offset_reset="earliest",
    )
    await consumer.start()

    tid = uuid4()
    try:
        # 1. Fire forgot-password — expect worker-started
        await fp_handler.handle(SimpleNamespace(
            trade_id=tid,
            mailbox_email=f"trade-{tid.hex[:8]}@efbazaar.uz",
            konami_id=None,
        ))

        # 2. Fire imap-poll — expect konami-email-received soon
        await imap_handler.handle(SimpleNamespace(
            trade_id=tid,
            mailbox_email=f"trade-{tid.hex[:8]}@efbazaar.uz",
            purpose="VERIFY_LINK",
        ))

        received_topics = set()
        deadline = asyncio.get_event_loop().time() + 10.0
        while asyncio.get_event_loop().time() < deadline:
            batch = await consumer.getmany(timeout_ms=500)
            for msgs in batch.values():
                for m in msgs:
                    received_topics.add(m.topic)
            if TOPIC_KONAMI_EMAIL in received_topics and TOPIC_WORKER_STARTED in received_topics:
                break

        assert TOPIC_WORKER_STARTED in received_topics
        assert TOPIC_KONAMI_EMAIL in received_topics
    finally:
        await consumer.stop()
        await registry.cancel_all()
        await producer.stop()
        await redis_client.aclose()
