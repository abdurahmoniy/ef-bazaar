"""Handler for efbazaar.trade.email-provision-request.

Flow:
1. Compute a synthetic local_part from the trade UUID prefix.
2. Generate a random mailbox password (secrets.token_urlsafe(16)).
3. Create the mailbox via MailcowClient.
4. Encrypt the plaintext password with FieldEncryptor(context="mbox-{tradeId}").
5. Publish EmailProvisioned so trade-service can persist iv/tag/ciphertext.

If Mailcow returns MailboxAlreadyExists (Kafka replay), we treat it as
success — the row on the trade-service side is idempotent and the encrypted
payload we publish overwrites the previous one.
"""

from __future__ import annotations

import secrets
from uuid import UUID

from smart_admin_worker.crypto.field_encryptor import FieldEncryptor
from smart_admin_worker.kafka import events as e
from smart_admin_worker.kafka.producer import KafkaProducerClient
from smart_admin_worker.kafka.topics import TOPIC_EMAIL_PROVISIONED
from smart_admin_worker.mailcow.client import Mailbox, MailcowClient
from smart_admin_worker.mailcow.errors import MailboxAlreadyExists


class EmailProvisionHandler:
    def __init__(
        self,
        mailcow: MailcowClient,
        encryptor: FieldEncryptor,
        producer: KafkaProducerClient,
        mailcow_domain: str = "efbazaar.uz",
    ) -> None:
        self._mailcow = mailcow
        self._encryptor = encryptor
        self._producer = producer
        self._domain = mailcow_domain

    async def handle(self, event: e.EmailProvisionRequest) -> None:
        local_part = self._local_part_for(event.trade_id)
        password = self._generate_password()

        try:
            mb = await self._mailcow.create_mailbox(
                local_part=local_part,
                domain=self._domain,
                password=password,
                quota_mb=100,
            )
        except MailboxAlreadyExists:
            mb = Mailbox(email=f"{local_part}@{self._domain}")

        field = self._encryptor.encrypt(
            f"mbox-{event.trade_id}",
            password.encode("utf-8"),
        )

        await self._producer.publish(
            TOPIC_EMAIL_PROVISIONED,
            str(event.trade_id),
            e.EmailProvisioned(
                trade_id=event.trade_id,
                mailbox_email=mb.email,
                encrypted_password=field.ciphertext,
                iv=field.iv,
                tag=field.tag,
            ),
        )

    @staticmethod
    def _local_part_for(trade_id: UUID) -> str:
        return "trade-" + str(trade_id)[:8]

    @staticmethod
    def _generate_password() -> str:
        return secrets.token_urlsafe(16)
