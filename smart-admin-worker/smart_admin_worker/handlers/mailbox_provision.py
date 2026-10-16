"""Handler for efbazaar.trade.mailbox-provision-request.

Admin-panel twin of :mod:`email_provision`. Differences that matter:

* No trade — nothing to key the response on but the mailbox id, which
  trade-service already reserved before publishing the request.
* The local part comes from the admin, not from a trade UUID prefix, so the
  address is human-readable and permanent.
* Encryption context is always ``mbox-{mailboxId}``. Admin rows have no trade,
  so trade-service's MailboxPasswordResolver has no other context to fall back
  to — using anything else here would make the row undecryptable.

MailboxAlreadyExists is treated as success: the row on the trade-service side
reserved the address first, so a duplicate means a Kafka replay, not a clash
with someone else's mailbox.
"""

from __future__ import annotations

import asyncio
import secrets
from typing import TYPE_CHECKING
from uuid import UUID

import structlog

from smart_admin_worker.crypto.field_encryptor import FieldEncryptor
from smart_admin_worker.kafka import events as e
from smart_admin_worker.kafka.producer import KafkaProducerClient
from smart_admin_worker.kafka.topics import TOPIC_MAILBOX_PROVISIONED
from smart_admin_worker.mailcow.client import Mailbox, MailcowClient
from smart_admin_worker.mailcow.errors import MailboxAlreadyExists

if TYPE_CHECKING:
    from smart_admin_worker.telegram.notifier import TelegramNotifier

log = structlog.get_logger(__name__)


class MailboxProvisionHandler:
    def __init__(
        self,
        mailcow: MailcowClient,
        encryptor: FieldEncryptor,
        producer: KafkaProducerClient,
        mailcow_domain: str = "efbazaar.uz",
        password_cache: dict[str, str] | None = None,
        mailbox_id_to_email: dict[UUID, str] | None = None,
        notifier: TelegramNotifier | None = None,
    ) -> None:
        self._mailcow = mailcow
        self._encryptor = encryptor
        self._producer = producer
        self._domain = mailcow_domain
        self._password_cache = password_cache
        self._mailbox_id_to_email = mailbox_id_to_email
        self._notifier = notifier

    async def handle(self, event: e.MailboxProvisionRequest) -> None:
        password = secrets.token_urlsafe(16)
        domain = event.domain or self._domain

        fresh_create = True
        try:
            mb = await self._mailcow.create_mailbox(
                local_part=event.local_part,
                domain=domain,
                password=password,
                quota_mb=100,
            )
        except MailboxAlreadyExists:
            mb = Mailbox(email=f"{event.local_part}@{domain}")
            fresh_create = False

        field = self._encryptor.encrypt(
            f"mbox-{event.mailbox_id}",
            password.encode("utf-8"),
        )

        await self._producer.publish(
            TOPIC_MAILBOX_PROVISIONED,
            str(event.mailbox_id),
            e.MailboxProvisioned(
                mailbox_id=event.mailbox_id,
                mailbox_email=mb.email,
                encrypted_password=field.ciphertext,
                iv=field.iv,
                tag=field.tag,
            ),
        )

        # Same caveat as email_provision: on replay of an existing mailbox we
        # no longer hold the plaintext, so caching would poison IMAP logins.
        if fresh_create:
            if self._password_cache is not None:
                self._password_cache[mb.email] = password
            if self._mailbox_id_to_email is not None:
                self._mailbox_id_to_email[event.mailbox_id] = mb.email

            if self._notifier is not None and self._notifier.enabled:
                task = asyncio.create_task(
                    self._notifier.notify_mailbox_created(
                        trade_id=event.mailbox_id,
                        mailbox_email=mb.email,
                        capacity=None,
                        mailbox_password=password,
                    )
                )
                task.add_done_callback(_log_notify_task_failure)

        log.info(
            "admin_mailbox_provisioned",
            mailbox_id=str(event.mailbox_id),
            email=mb.email,
            fresh_create=fresh_create,
        )


def _log_notify_task_failure(task: asyncio.Task) -> None:
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        log.warning(
            "telegram_notify_task_error", error=str(exc), error_type=type(exc).__name__
        )
