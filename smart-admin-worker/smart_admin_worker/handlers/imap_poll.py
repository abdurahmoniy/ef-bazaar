"""Handler for efbazaar.trade.imap-poll-request.

Trade-service tells us "please start (or continue) polling mailbox X for
purpose Y" — we register a poll task and publish results as they arrive.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from smart_admin_worker.imap.poller import PollPurpose
from smart_admin_worker.imap.registry import ImapPollerRegistry
from smart_admin_worker.kafka import events as e
from smart_admin_worker.kafka.producer import KafkaProducerClient
from smart_admin_worker.kafka.topics import (
    TOPIC_IMAP_2FA,
    TOPIC_KONAMI_EMAIL,
    TOPIC_KONAMI_EMAIL_CHANGE_CODE,
)

PasswordProvider = Callable[[str], Awaitable[str]]


class ImapPollHandler:
    def __init__(
        self,
        registry: ImapPollerRegistry,
        producer: KafkaProducerClient,
        password_provider: PasswordProvider,
    ) -> None:
        self._registry = registry
        self._producer = producer
        self._password_provider = password_provider

    async def handle(self, event: e.ImapPollRequest) -> None:
        purpose = PollPurpose(event.purpose)
        password = await self._password_provider(event.mailbox_email)

        async def on_reset(hit):
            await self._producer.publish(
                TOPIC_KONAMI_EMAIL,
                str(event.trade_id),
                e.KonamiEmailReceived(
                    trade_id=event.trade_id,
                    reset_link_present=hit.reset_link_present,
                    sender=hit.sender,
                    received_at=hit.received_at,
                ),
            )

        async def on_2fa(hit):
            await self._producer.publish(
                TOPIC_IMAP_2FA,
                str(event.trade_id),
                e.Imap2faCode(
                    trade_id=event.trade_id,
                    code=hit.code,
                    received_at=hit.received_at,
                ),
            )

        async def on_email_change_code(hit):
            await self._producer.publish(
                TOPIC_KONAMI_EMAIL_CHANGE_CODE,
                str(event.trade_id),
                e.KonamiEmailChangeCodeReceived(
                    trade_id=event.trade_id,
                    verification_code=hit.verification_code,
                    received_at=hit.received_at,
                    sender=hit.sender,
                ),
            )

        try:
            self._registry.start(
                event.mailbox_email, password, purpose,
                on_reset=on_reset if purpose is PollPurpose.VERIFY_LINK else None,
                on_2fa=on_2fa if purpose is PollPurpose.WAIT_2FA_CODE else None,
                on_email_change_code=(
                    on_email_change_code
                    if purpose is PollPurpose.WAIT_EMAIL_CHANGE_CODE
                    else None
                ),
            )
        except ValueError:
            # Already polling — this is a re-fire, no-op.
            pass
