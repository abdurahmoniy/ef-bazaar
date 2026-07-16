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
        password_cache: dict[str, str] | None = None,
        mailbox_id_to_email: dict[UUID, str] | None = None,
    ) -> None:
        self._mailcow = mailcow
        self._encryptor = encryptor
        self._producer = producer
        self._domain = mailcow_domain
        # MVP: best-effort in-process caches so downstream handlers (IMAP poll,
        # mailbox rotate) can look up plaintext password / email by mailbox id
        # without a round-trip through trade-service. NOT durable across restart
        # — Task 15 replaces this by threading the encrypted payload through
        # request events so the worker can decrypt on demand.
        self._password_cache = password_cache
        self._mailbox_id_to_email = mailbox_id_to_email

    async def handle(self, event: e.EmailProvisionRequest) -> None:
        local_part = self._local_part_for(event.trade_id)
        password = self._generate_password()

        fresh_create = True
        try:
            mb = await self._mailcow.create_mailbox(
                local_part=local_part,
                domain=self._domain,
                password=password,
                quota_mb=100,
            )
        except MailboxAlreadyExists:
            mb = Mailbox(email=f"{local_part}@{self._domain}")
            fresh_create = False

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

        # Populate caches only on fresh create — on Kafka replay of an already-
        # existing mailbox we don't have the plaintext password anymore (Mailcow
        # never returns it) so caching a bogus value would break IMAP login.
        if fresh_create:
            if self._password_cache is not None:
                self._password_cache[mb.email] = password
            if self._mailbox_id_to_email is not None:
                self._mailbox_id_to_email[event.trade_id] = mb.email

    @staticmethod
    def _local_part_for(trade_id: UUID) -> str:
        return "trade-" + str(trade_id)[:8]

    @staticmethod
    def _generate_password() -> str:
        return secrets.token_urlsafe(16)
