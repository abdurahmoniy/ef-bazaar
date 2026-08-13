"""aiokafka producer. Mirrors smart-admin-worker/kafka/producer.py: acks='all'
so a publish failure surfaces to the caller rather than being lost.

Payloads go out as plain JSON with no headers. That is the settled convention
in this repo — the Java consumer names the type via
`spring.json.value.default.type`, exactly as trade-service's listeners already
do for smart-admin-worker's messages. Stamping a `__TypeId__` header here would
couple this service to a Java package path and a Java-side refactor would
silently break deposits.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from aiokafka import AIOKafkaProducer

log = logging.getLogger(__name__)

CARD_CREDIT_OBSERVED = "efbazaar.payment.card-credit-observed"
USERBOT_HEARTBEAT = "efbazaar.payment.userbot-heartbeat"


def iso_z(value: datetime) -> str:
    """ISO-8601, second precision, literal 'Z' — the house wire format.

    Same rendering as smart-admin-worker/kafka/events.py. `.isoformat()` would
    emit '+00:00' plus microseconds; the Java side takes both, but a payload it
    cannot build is dropped in silence, so the format that is already proven
    against these consumers is the one worth pinning.
    """
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_card_credit_payload(
    telegram_message_id: int,
    card_last4: str,
    amount_tiyin: int,
    card_balance_tiyin: int | None,
    observed_at: datetime,
    raw_text: str,
) -> dict[str, Any]:
    """The card-credit wire payload.

    Pure and separate from main.py on purpose: main.py imports pyrogram, which
    a test environment need not have, and these key names are a contract with
    a Java record on the other side. Renaming one here leaves every Python and
    Java test green while every deposit silently stops arriving, so the key set
    is asserted in tests/test_wire_format.py.
    """
    return {
        "telegramMessageId": telegram_message_id,
        "cardLast4": card_last4,
        "amountTiyin": amount_tiyin,
        "cardBalanceTiyin": card_balance_tiyin,
        "observedAt": iso_z(observed_at),
        "rawText": raw_text,
    }


class KafkaClient:
    def __init__(self, bootstrap_servers: str) -> None:
        self._bootstrap = bootstrap_servers
        self._producer: AIOKafkaProducer | None = None

    async def start(self) -> None:
        self._producer = AIOKafkaProducer(
            bootstrap_servers=self._bootstrap,
            enable_idempotence=False,
            acks="all",
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
        )
        await self._producer.start()

    async def stop(self) -> None:
        if self._producer is not None:
            await self._producer.stop()
            self._producer = None

    async def publish(self, topic: str, value: dict[str, Any], key: str | None = None) -> None:
        if self._producer is None:
            raise RuntimeError("Kafka producer not started")
        await self._producer.send_and_wait(topic, value=value, key=key)
        log.debug("published to %s key=%s", topic, key)
