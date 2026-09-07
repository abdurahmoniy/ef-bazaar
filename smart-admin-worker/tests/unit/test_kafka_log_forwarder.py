"""Worker xatolari ham Telegramga chiqadi — Java servislar bilan bir topikda.

Ilgari worker faqat Kafka handler'i yiqilganda xabar berardi
(`main.py` dagi `_wrap`), qolgan hamma `log.error` esa hech qayerga
bormasdi — IMAP poller yiqilishi, Mailcow javob bermasligi va hokazo.
"""

from __future__ import annotations

import asyncio
import logging

from smart_admin_worker.observability.kafka_log_forwarder import KafkaLogForwarder


class RecordingProducer:
    def __init__(self) -> None:
        self.published: list[tuple[str, str, dict]] = []

    async def publish(self, topic: str, key: str, event) -> None:
        self.published.append((topic, key, event))


async def _forwarder():
    producer = RecordingProducer()
    fwd = KafkaLogForwarder(
        producer=producer,
        service_name="smart-admin-worker",
        loop=asyncio.get_running_loop(),
    )
    return producer, fwd


async def test_a_warning_is_published_in_the_shape_the_bot_expects():
    producer, fwd = await _forwarder()
    handler = fwd.logging_handler()
    logger = logging.getLogger("smart_admin_worker.test.caller")
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    try:
        logger.warning("mailcow javob bermadi")
    finally:
        logger.removeHandler(handler)
    await asyncio.sleep(0.05)

    assert len(producer.published) == 1
    topic, key, event = producer.published[0]
    assert topic == "efbazaar.system.log-event"
    assert key == "smart-admin-worker"
    # Bot LogEventDto shu maydonlarni kutadi; biri yetishmasa u jimgina
    # yiqiladi va xabar yo'qoladi.
    assert set(event) == {"service", "level", "logger", "thread",
                          "message", "stackTrace", "timestamp"}
    assert event["service"] == "smart-admin-worker"
    assert event["level"] == "WARNING"
    assert event["message"] == "mailcow javob bermadi"


async def test_info_is_not_forwarded():
    producer, fwd = await _forwarder()
    handler = fwd.logging_handler()
    logger = logging.getLogger("smart_admin_worker.test.quiet")
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    try:
        logger.info("odatiy ish")
    finally:
        logger.removeHandler(handler)
    await asyncio.sleep(0.05)

    assert producer.published == []


async def test_kafkas_own_logs_are_never_forwarded():
    # Aks holda: publish qilish log yozadi, log publish qiladi — cheksiz halqa.
    producer, fwd = await _forwarder()
    handler = fwd.logging_handler()
    logger = logging.getLogger("aiokafka.producer.sender")
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    try:
        logger.error("broker javob bermadi")
    finally:
        logger.removeHandler(handler)
    await asyncio.sleep(0.05)

    assert producer.published == []


async def test_a_repeating_failure_is_forwarded_once():
    producer, fwd = await _forwarder()
    handler = fwd.logging_handler()
    logger = logging.getLogger("smart_admin_worker.test.loop")
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    try:
        for i in range(50):
            # Har xabar noyob — halqada odatda shunday bo'ladi. Kalit
            # matnga qarab qurilsa dedup aynan shu yerda ishlamay qolardi.
            logger.error("savdo %s ochilmadi", i)
    finally:
        logger.removeHandler(handler)
    await asyncio.sleep(0.05)

    assert len(producer.published) == 1


async def test_structlog_events_are_forwarded_too():
    # Worker aralash yozadi: main.py structlog, consumer.py stdlib. structlog
    # PrintLogger bilan stdout'ga to'g'ridan-to'g'ri yozadi va stdlib
    # handler uni UMUMAN ko'rmaydi.
    producer, fwd = await _forwarder()
    processor = fwd.structlog_processor()

    processor(None, "error", {"event": "imap_poll_failed", "mailbox": "a@b.uz"})
    await asyncio.sleep(0.05)

    assert len(producer.published) == 1
    assert producer.published[0][2]["level"] == "ERROR"
    assert "imap_poll_failed" in producer.published[0][2]["message"]
