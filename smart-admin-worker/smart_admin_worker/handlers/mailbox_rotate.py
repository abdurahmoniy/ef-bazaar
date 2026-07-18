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
    ) -> None:
        self._mailcow = mailcow
        self._encryptor = encryptor
        self._producer = producer
        self._email_provider = email_provider

    async def handle(self, event: e.MailboxRotateRequest) -> None:
        email = await self._email_provider(event.mailbox_id)
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
