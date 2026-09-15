"""Handler for efbazaar.trade.mailbox-rotate-request.

Fires when a trade closes (SUCCESS or REJECTED — trade-service publishes a
mailbox-rotate-request either way). We generate a new password, tell Mailcow
to swap it, encrypt for storage, and publish MailboxRotated so trade-service
can persist the fresh iv/tag/ciphertext.
"""

from __future__ import annotations

import secrets
from collections.abc import Awaitable, Callable
from uuid import UUID

from smart_admin_worker.crypto.field_encryptor import FieldEncryptor
from smart_admin_worker.imap.registry import ImapPollerRegistry
from smart_admin_worker.kafka import events as e
from smart_admin_worker.kafka.producer import KafkaProducerClient
from smart_admin_worker.kafka.topics import TOPIC_MAILBOX_ROTATED
from smart_admin_worker.mailcow.client import MailcowClient

EmailProvider = Callable[[UUID], Awaitable[str]]


class MailboxRotateHandler:
    def __init__(
        self,
        mailcow: MailcowClient,
        encryptor: FieldEncryptor,
        producer: KafkaProducerClient,
        email_provider: EmailProvider,
        registry: ImapPollerRegistry,
    ) -> None:
        self._mailcow = mailcow
        self._encryptor = encryptor
        self._producer = producer
        self._email_provider = email_provider
        self._registry = registry

    async def handle(self, event: e.MailboxRotateRequest) -> None:
        # The request carries the address. The in-process cache is only a
        # fallback for requests queued before it did: it is empty for any box
        # this process did not provision itself — admin-created boxes, and
        # every box after a restart — and Mailcow answers an empty username
        # with ``username_invalid``.
        email = event.mailbox_email or await self._email_provider(event.mailbox_id)
        if not email:
            raise ValueError(
                f"mailbox {event.mailbox_id}: no address to rotate — "
                "request carries none and it is not in the worker cache"
            )
        # Stop watching this box before the password under it changes. Every
        # trade ending routes through here — SUCCESS, REJECTED and ORPHANED
        # all call TradeStateHandler.handOver, which rotates each mailbox — so
        # this is where a finished trade's pollers are collected. Without it
        # they never stop: nothing else in the worker cancels one, and each
        # survivor keeps taking a thread off the shared executor that a live
        # trade's 2FA poll needs.
        #
        # Cancel first, not after: a poll landing between the swap and the
        # cancel logs in with a password Mailcow has already replaced.
        await self._registry.cancel_mailbox(email)
        password = secrets.token_urlsafe(16)
        await self._mailcow.rotate_password(email, password)

        field = self._encryptor.encrypt(
            f"mbox-{event.mailbox_id}",
            password.encode("utf-8"),
        )
        await self._producer.publish(
            TOPIC_MAILBOX_ROTATED,
            str(event.mailbox_id),
            e.MailboxRotated(
                mailbox_id=event.mailbox_id,
                encrypted_password=field.ciphertext,
                iv=field.iv,
                tag=field.tag,
            ),
        )
