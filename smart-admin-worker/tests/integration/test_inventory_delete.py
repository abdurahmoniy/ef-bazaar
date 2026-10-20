"""Real Kafka request decoding/dispatch/publication and Redis poller cleanup.

Mailcow HTTP is an isolated fixture; no live credentials or mailboxes are used.
"""
from __future__ import annotations

import asyncio
import json
from uuid import uuid4

import httpx
import redis.asyncio as aioredis
import respx
from aiokafka import AIOKafkaConsumer

from smart_admin_worker.handlers.mailbox_delete import MailboxDeleteHandler
from smart_admin_worker.handlers.mailbox_inventory import MailboxInventoryHandler
from smart_admin_worker.imap.detector import KonamiEmailDetector
from smart_admin_worker.imap.registry import ImapPollerRegistry
from smart_admin_worker.kafka import events as e
from smart_admin_worker.kafka import topics as t
from smart_admin_worker.kafka.consumer import KafkaConsumerRunner
from smart_admin_worker.kafka.producer import KafkaProducerClient
from smart_admin_worker.mailcow.client import MailcowClient
from smart_admin_worker.redis.lock import RedisLockManager


@respx.mock
async def test_inventory_and_delete_requests_cross_real_kafka(kafka_bootstrap, redis_url):
    base = "https://fixture.mail.test/api/v1"
    inventory_route = respx.get(f"{base}/get/mailbox/all/efbazaar.uz").mock(
        return_value=httpx.Response(200, json=[{
            "username": "orphan@efbazaar.uz", "quota_used": 321, "quota": 1000, "active": "1",
        }]))
    delete_route = respx.post(f"{base}/delete/mailbox").mock(side_effect=[
        httpx.Response(200, json=[{"type": "success", "msg": ["mailbox_removed"]}]),
        httpx.Response(200, json=[{"type": "danger", "msg": ["object_dne"]}]),
    ])
    producer = KafkaProducerClient(kafka_bootstrap)
    mailcow = MailcowClient(base, "fixture-key")
    redis = aioredis.from_url(redis_url)
    registry = ImapPollerRegistry(
        factory=None, detector=KonamiEmailDetector(frozenset()),
        lock=RedisLockManager(redis, 6), poll_interval=1,
    )
    delete = MailboxDeleteHandler(mailcow, registry, producer)
    inventory = MailboxInventoryHandler(mailcow, producer)
    runner = KafkaConsumerRunner(kafka_bootstrap, f"inventory-worker-{uuid4()}",
        [t.TOPIC_MAILBOX_INVENTORY_REQ, t.TOPIC_MAILBOX_DELETE_REQ], {
            t.TOPIC_MAILBOX_INVENTORY_REQ: inventory.handle,
            t.TOPIC_MAILBOX_DELETE_REQ: delete.handle,
        })
    consumer = AIOKafkaConsumer(t.TOPIC_MAILBOX_INVENTORY_OBSERVED, t.TOPIC_MAILBOX_DELETE_RESULT,
        bootstrap_servers=kafka_bootstrap, group_id=f"inventory-result-{uuid4()}",
        auto_offset_reset="earliest")
    inventory_id, delete_id, mailbox_id = uuid4(), uuid4(), uuid4()
    await producer.start()
    try:
        await consumer.start()
        await runner.start()
        await producer.publish(t.TOPIC_MAILBOX_INVENTORY_REQ, str(inventory_id),
            e.MailboxInventoryRequest(inventory_id, ["efbazaar.uz"]))
        delete_event = e.MailboxDeleteRequest(mailbox_id, "retired@efbazaar.uz", delete_id)
        await producer.publish(t.TOPIC_MAILBOX_DELETE_REQ, str(mailbox_id), delete_event)
        await producer.publish(t.TOPIC_MAILBOX_DELETE_REQ, str(mailbox_id), delete_event)
        inventory_results, delete_results = [], []
        async with asyncio.timeout(20):
            while len(inventory_results) < 1 or len(delete_results) < 2:
                for messages in (await consumer.getmany(timeout_ms=200)).values():
                    for msg in messages:
                        payload = json.loads(msg.value)
                        if payload["requestId"] == str(inventory_id):
                            inventory_results.append(payload)
                        if payload["requestId"] == str(delete_id):
                            delete_results.append(payload)
        assert inventory_route.call_count == 1
        assert inventory_results[0]["lastPage"] is True
        assert inventory_results[0]["mailboxes"] == [{
            "mailboxEmail": "orphan@efbazaar.uz", "usedBytes": 321,
            "quotaBytes": 1000, "active": True,
        }]
        assert delete_route.call_count == 2
        assert [item["alreadyAbsent"] for item in delete_results] == [False, True]
        assert all(item["success"] and item["mailboxId"] == str(mailbox_id)
                   and item["mailboxEmail"] == delete_event.mailbox_email
                   for item in delete_results)
    finally:
        await runner.stop()
        await consumer.stop()
        await registry.cancel_all()
        await redis.aclose()
        await mailcow.aclose()
        await producer.stop()
