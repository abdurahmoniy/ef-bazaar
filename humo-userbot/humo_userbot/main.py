"""Telegram userbot: watches the Humo bot's chat and reports every top-up.

Runs continuously rather than starting per invoice. Reconnecting churns the
Telegram session and drops whatever arrives during the gap, and a dropped
message is money the platform cannot see.

This module knows nothing about invoices, users or money rules. It observes
and reports; payment-service decides what an observation means.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from pyrogram import Client, filters

from humo_userbot.config import as_chat_ref, get_settings
from humo_userbot.kafka_client import (
    CARD_CREDIT_OBSERVED,
    USERBOT_HEARTBEAT,
    KafkaClient,
    iso_z,
)
from humo_userbot.parser import parse_topup

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger(__name__)

kafka = KafkaClient(settings.kafka_bootstrap_servers)

# The session file lives in this directory and is a credential: it is mounted
# as a volume, never committed and never logged.
app = Client(
    settings.telegram_session_name,
    api_id=settings.telegram_api_id,
    api_hash=settings.telegram_api_hash,
    workdir=settings.telegram_session_dir,
)


@app.on_message(filters.chat(as_chat_ref(settings.source_chat)))
async def on_humo_message(_client, message) -> None:
    text = message.text or message.caption
    parsed = parse_topup(text)
    if parsed is None:
        log.debug("message %s is not a top-up, ignoring", message.id)
        return

    payload = {
        "telegramMessageId": message.id,
        "cardLast4": parsed.card_last4,
        "amountTiyin": parsed.amount_tiyin,
        "cardBalanceTiyin": parsed.card_balance_tiyin,
        "observedAt": iso_z(message.date or datetime.now(UTC)),
        "rawText": text,
    }
    await kafka.publish(CARD_CREDIT_OBSERVED, payload, key=str(message.id))
    log.info(
        "observed top-up %s tiyin on card *%s (message %s)",
        parsed.amount_tiyin,
        parsed.card_last4,
        message.id,
    )


async def heartbeat_loop() -> None:
    while True:
        try:
            await kafka.publish(
                USERBOT_HEARTBEAT,
                {"sentAt": iso_z(datetime.now(UTC))},
            )
        except Exception:
            log.exception("heartbeat publish failed")
        await asyncio.sleep(settings.heartbeat_interval_seconds)


async def main() -> None:
    await kafka.start()
    await app.start()
    log.info("humo-userbot started, watching %s", settings.source_chat)
    try:
        await heartbeat_loop()
    finally:
        await app.stop()
        await kafka.stop()


if __name__ == "__main__":
    asyncio.run(main())
