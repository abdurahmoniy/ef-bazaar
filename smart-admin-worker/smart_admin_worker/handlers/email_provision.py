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

import asyncio
import secrets
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

import structlog

from smart_admin_worker.crypto.field_encryptor import FieldEncryptor
from smart_admin_worker.kafka import events as e
from smart_admin_worker.kafka.producer import KafkaProducerClient
from smart_admin_worker.kafka.topics import TOPIC_EMAIL_PROVISIONED
from smart_admin_worker.mailcow.client import Mailbox, MailcowClient
from smart_admin_worker.mailcow.errors import MailboxAlreadyExists

if TYPE_CHECKING:
    from smart_admin_worker.telegram.notifier import TelegramNotifier

log = structlog.get_logger(__name__)


class EmailProvisionHandler:
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
        # MVP: best-effort in-process caches so downstream handlers (IMAP poll,
        # mailbox rotate) can look up plaintext password / email by mailbox id
        # without a round-trip through trade-service. NOT durable across restart
        # — Task 15 replaces this by threading the encrypted payload through
        # request events so the worker can decrypt on demand.
        self._password_cache = password_cache
        self._mailbox_id_to_email = mailbox_id_to_email
        self._notifier = notifier

    async def handle(self, event: e.EmailProvisionRequest) -> None:
        local_part = self._local_part_for(event.trade_id)
        password = self._generate_password()
        # Worker owns the mailbox UUID so the encryption context (`mbox-{id}`),
        # the rotate lookup key, and the row we ask trade-service to persist all
        # line up. Historically Java made a placeholder UUID for the mailbox
        # while the worker encrypted with `mbox-{trade_id}` — those two IDs
        # never matched, so MailboxRotateHandler couldn't find the email and
        # Mailcow rejected the PATCH with `username_invalid`.
        mailbox_id = uuid4()

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
            f"mbox-{mailbox_id}",
            password.encode("utf-8"),
        )

        await self._producer.publish(
            TOPIC_EMAIL_PROVISIONED,
            str(event.trade_id),
            e.EmailProvisioned(
                trade_id=event.trade_id,
                mailbox_id=mailbox_id,
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
                # Key by the mailbox UUID (matches the id trade-service will
                # persist and later echo back on MailboxRotateRequest), not the
                # trade UUID.
                self._mailbox_id_to_email[mailbox_id] = mb.email

            # Fire-and-forget Telegram notification: a slow / dead Telegram must
            # never stall the handler and prevent trade-service from getting
            # its EmailProvisioned event. Any exception inside the task is
            # swallowed and logged by the notifier itself.
            if self._notifier is not None and self._notifier.enabled:
                capacity = await self._safe_get_capacity()
                task = asyncio.create_task(
                    self._notifier.notify_mailbox_created(
                        trade_id=event.trade_id,
                        mailbox_email=mb.email,
                        capacity=capacity,
                        mailbox_password=password,
                    )
                )
                task.add_done_callback(_log_notify_task_failure)

    async def _safe_get_capacity(self) -> dict[str, int] | None:
        # MailcowClient.get_domain_capacity is itself best-effort (returns None
        # on any error), but wrap once more just in case the client hasn't been
        # extended in a given deployment.
        get = getattr(self._mailcow, "get_domain_capacity", None)
        if get is None:
            return None
        try:
            return await get(self._domain)
        except Exception as exc:  # noqa: BLE001 — capacity is optional decoration
            log.warning("mailcow_capacity_lookup_failed", error=str(exc))
            return None

    @staticmethod
    def _local_part_for(trade_id: UUID) -> str:
        return "trade-" + str(trade_id)[:8]

    @staticmethod
    def _generate_password() -> str:
        return secrets.token_urlsafe(16)


def _log_notify_task_failure(task: asyncio.Task) -> None:
    """Guard: if the fire-and-forget notify task raises, at least surface it
    in the log rather than leaving the exception on the task's __dict__ until
    GC (which prints a warning and can trip test frameworks). The notifier
    itself already catches Exception, so this is a belt-and-braces log."""
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        log.warning("telegram_notify_task_error", error=str(exc), error_type=type(exc).__name__)
