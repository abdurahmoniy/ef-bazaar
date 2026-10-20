"""Provision a version-2 random mailbox through an authoritative one-shot claim.

The address uses the whole mailbox UUID. Trade-service persists the proposed
password encrypted under mbox-{mailboxId} before granting the first create.
A repeated STARTED claim can only prove the original password with IMAP AUTH
and republish its matching claim result; it cannot create or rotate a mailbox.
Legacy requests and unknown outcomes require visible reconciliation.
"""

from __future__ import annotations

import asyncio
import logging
import secrets
from typing import TYPE_CHECKING
from uuid import UUID

import structlog

from smart_admin_worker.crypto.field_encryptor import FieldEncryptor
from smart_admin_worker.handlers.provision_claim import (
    CredentialVerifier,
    acquire,
    prove_existing,
)
from smart_admin_worker.kafka import events as e
from smart_admin_worker.kafka.producer import KafkaProducerClient, publish_required_result
from smart_admin_worker.kafka.topics import TOPIC_EMAIL_PROVISIONED
from smart_admin_worker.mailcow.client import Mailbox, MailcowClient
from smart_admin_worker.mailcow.errors import MailboxAlreadyExists
from smart_admin_worker.trade.client import ProvisionClaimClient

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
        claims: ProvisionClaimClient | None = None,
        credential_verifier: CredentialVerifier | None = None,
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
        self._claims = claims
        self._credential_verifier = credential_verifier

    async def handle(self, event: e.EmailProvisionRequest) -> None:
        if type(event.address_version) is not int or event.address_version != 2:
            logging.getLogger(__name__).error(
                "Rejected legacy provisioning request; manual reconciliation required: "
                "mailbox_id=%s",
                event.mailbox_id,
            )
            return
        local_part = self._local_part_for(event.mailbox_id)
        password = self._generate_password()
        # Echo back the mailbox id trade-service supplied in the request.
        # Aligning the id here means MailboxService.adoptWorkerMailboxId takes
        # the "already matches" fast path (in-place overwrite, no delete-and-
        # insert swap) and MailboxRotateHandler can find the email in cache
        # via the same UUID trade-service later publishes on rotate-request.
        mailbox_id = event.mailbox_id

        authorization = await acquire(
            self._claims,
            self._encryptor,
            mailbox_id,
            event.trade_id,
            f"{local_part}@{self._domain}",
            password,
        )
        if authorization is None:
            return
        claim, password = authorization
        fresh_create = claim.allow_create
        mb = Mailbox(email=claim.mailbox_email)
        if claim.allow_create:
            try:
                await self._mailcow.create_mailbox(
                    local_part=local_part,
                    domain=self._domain,
                    password=password,
                    quota_mb=100,
                )
            except MailboxAlreadyExists:
                fresh_create = False
                if not await prove_existing(self._credential_verifier, mb.email, password):
                    log.error("provision_existing_password_unproven", mailbox_id=str(mailbox_id))
                    return
            except Exception as error:
                log.error(
                    "provision_unknown_manual_reconciliation",
                    mailbox_id=str(mailbox_id),
                    error_type=type(error).__name__,
                )
                return
        elif not await prove_existing(self._credential_verifier, mb.email, password):
            log.error("provision_claim_started_unknown", mailbox_id=str(mailbox_id))
            return
        field = claim.password

        await publish_required_result(
            self._producer,
            TOPIC_EMAIL_PROVISIONED,
            str(event.trade_id),
            e.EmailProvisioned(
                trade_id=event.trade_id,
                mailbox_id=mailbox_id,
                mailbox_email=mb.email,
                encrypted_password=field.ciphertext,
                iv=field.iv,
                tag=field.tag,
                claim_id=claim.claim_id,
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
    def _local_part_for(mailbox_id: UUID) -> str:
        """Address for one mailbox.

        Derived from the mailbox id, not the trade id. A swap asks for two
        mailboxes on the same trade, and naming them after the trade produced
        the same address twice: the first was created, the second collided with
        the unique address column and its row stayed on its ``pending-``
        placeholder for ever. Both parties were then shown whichever one had
        been provisioned.
        """
        return "trade-" + mailbox_id.hex

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
