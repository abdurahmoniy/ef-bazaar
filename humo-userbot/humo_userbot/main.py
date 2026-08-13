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
    build_card_credit_payload,
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

# Flips false when an observation cannot be published, and back on the next
# success. The heartbeat consults it — see observation_is_possible().
_reporting_ok = True

# The session file lives in this directory and is a credential: it is mounted
# as a volume, never committed and never logged.
app = Client(
    settings.telegram_session_name,
    api_id=settings.telegram_api_id,
    api_hash=settings.telegram_api_hash,
    workdir=settings.telegram_session_dir,
)


# `filters.incoming` matters: Pyrogram dispatches outgoing messages too, so
# without it anyone with access to this personal account could paste a
# top-up-shaped message into the chat and mint a credit observation.
@app.on_message(filters.chat(as_chat_ref(settings.source_chat)) & filters.incoming)
async def on_humo_message(_client, message) -> None:
    text = message.text or message.caption
    parsed = parse_topup(text)
    if parsed is None:
        log.debug("message %s is not a top-up, ignoring", message.id)
        return

    payload = build_card_credit_payload(
        telegram_message_id=message.id,
        card_last4=parsed.card_last4,
        amount_tiyin=parsed.amount_tiyin,
        card_balance_tiyin=parsed.card_balance_tiyin,
        observed_at=message.date or datetime.now(UTC),
        raw_text=text,
    )
    global _reporting_ok
    try:
        await kafka.publish(CARD_CREDIT_OBSERVED, payload, key=str(message.id))
    except Exception:
        # Withhold the heartbeat until reporting works again. A failure scoped
        # to this one topic would otherwise leave the beat going while every
        # observation is dropped, and payment-service would keep accepting
        # deposits nothing is watching for.
        _reporting_ok = False
        raise
    _reporting_ok = True
    log.info(
        "observed top-up %s tiyin on card *%s (message %s)",
        parsed.amount_tiyin,
        parsed.card_last4,
        message.id,
    )


def observation_is_possible() -> tuple[bool, str]:
    """Can this process actually see a transfer AND report it right now?

    payment-service refuses every deposit while the heartbeat is stale, so the
    beat must mean "I am watching", not "my process is running". Those come
    apart in the failure that matters most for a personal Telegram account:
    the session is revoked from another device or the update loop dies, the
    container keeps running under `restart: unless-stopped`, and a beat that
    only proved liveness would keep deposits open with nobody watching.
    """
    if not app.is_connected:
        return False, "Telegram client is not connected"
    if not _reporting_ok:
        return False, "the last observation failed to publish"
    return True, ""


async def heartbeat_loop() -> None:
    while True:
        try:
            healthy, reason = observation_is_possible()
            if healthy:
                await kafka.publish(
                    USERBOT_HEARTBEAT,
                    {"sentAt": iso_z(datetime.now(UTC))},
                )
            else:
                # Withholding is the safe direction: deposits close.
                log.error("withholding the heartbeat — %s", reason)
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
