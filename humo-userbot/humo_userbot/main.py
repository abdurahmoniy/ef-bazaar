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
from humo_userbot.observability.kafka_log_forwarder import KafkaLogForwarder
from humo_userbot.parser import parse_topup

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger(__name__)


def attach_kafka_forwarder(forwarder) -> None:
    """Wires this service's own logs into `efbazaar.system.log-event`.

    Everything here logs through stdlib `logging`, so one handler covers the
    service. (smart-admin-worker needs a second adapter because it also uses
    structlog, which bypasses stdlib entirely.)
    """
    logging.getLogger().addHandler(forwarder.logging_handler())

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
    # is_connected was True during the asyncio.run() bug below while no message
    # could ever reach a handler, so connectivity alone is not the question.
    # An empty dispatcher means updates arrive and go nowhere.
    if not app.dispatcher.groups:
        return False, "no message handler is registered — updates go nowhere"
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
    # Only now can we forward: the producer is the transport. This service's
    # own WARN/ERROR lines now reach the Telegram logs channel like every Java
    # service's do. It handles money notifications, so a failure nobody is
    # told about is the expensive kind.
    attach_kafka_forwarder(KafkaLogForwarder(
        producer=kafka,
        service_name="humo-userbot",
        loop=asyncio.get_running_loop(),
    ))
    await app.start()
    log.info("humo-userbot started, watching %s", settings.source_chat)
    try:
        await heartbeat_loop()
    finally:
        await app.stop()
        await kafka.stop()


if __name__ == "__main__":
    # app.run(), NOT asyncio.run(). Pyrogram's Dispatcher captures
    # asyncio.get_event_loop() when Client(...) is constructed -- which happens
    # at import, above -- and every handler registration and handler worker is
    # scheduled onto THAT loop with loop.create_task(). asyncio.run() creates a
    # brand new loop, so all of that stays queued on a loop nothing ever runs:
    # the client connects, the heartbeat flows, "Started 10 HandlerTasks" is
    # logged, no error is raised anywhere, and not one message is ever
    # dispatched. Pyrogram's own docs put it plainly -- run() "uses the current
    # event loop instead of a new one".
    #
    # This cost three real transfers to find. Every visible signal said healthy.
    app.run(main())
