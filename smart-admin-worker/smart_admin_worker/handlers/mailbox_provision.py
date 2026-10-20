"""Provision an admin/custom address through the same one-shot claim authority.

The chosen local part and domain remain permanently reserved in trade-service.
Password context is mbox-{mailboxId}. Replays may only prove the original sealed
password with IMAP AUTH and emit the matching claim result. A fresh custom
claim colliding with an existing Mailcow address is never adopted.
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
from smart_admin_worker.kafka.topics import TOPIC_MAILBOX_PROVISIONED
from smart_admin_worker.mailcow.client import Mailbox, MailcowClient
from smart_admin_worker.mailcow.errors import MailboxAlreadyExists
from smart_admin_worker.trade.client import ProvisionClaimClient

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
        claims: ProvisionClaimClient | None = None,
        credential_verifier: CredentialVerifier | None = None,
    ) -> None:
        self._mailcow = mailcow
        self._encryptor = encryptor
        self._producer = producer
        self._domain = mailcow_domain
        self._password_cache = password_cache
        self._mailbox_id_to_email = mailbox_id_to_email
        self._notifier = notifier
        self._claims = claims
        self._credential_verifier = credential_verifier

    async def handle(self, event: e.MailboxProvisionRequest) -> None:
        if type(event.address_version) is not int or event.address_version != 2:
            logging.getLogger(__name__).error(
                "Rejected legacy provisioning request; manual reconciliation required: "
                "mailbox_id=%s",
                event.mailbox_id,
            )
            return
        password = secrets.token_urlsafe(16)
        domain = event.domain or self._domain

        authorization = await acquire(
            self._claims,
            self._encryptor,
            event.mailbox_id,
            None,
            f"{event.local_part}@{domain}",
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
                    local_part=event.local_part,
                    domain=domain,
                    password=password,
                    quota_mb=100,
                )
            except MailboxAlreadyExists as exc:
                fresh_create = False
                if event.custom:
                    log.error(
                        "custom mailbox %s@%s already exists in Mailcow; not provisioning",
                        event.local_part,
                        domain,
                    )
                    if self._notifier is not None and self._notifier.enabled:
                        await self._notifier.notify_error(
                            context="mailbox_provision.custom_exists",
                            error=exc,
                            trade_id=event.mailbox_id,
                        )
                    return
                if not await prove_existing(self._credential_verifier, mb.email, password):
                    log.error(
                        "provision_existing_password_unproven", mailbox_id=str(event.mailbox_id)
                    )
                    return
            except Exception as error:
                log.error(
                    "provision_unknown_manual_reconciliation",
                    mailbox_id=str(event.mailbox_id),
                    error_type=type(error).__name__,
                )
                return
        elif not await prove_existing(self._credential_verifier, mb.email, password):
            log.error("provision_claim_started_unknown", mailbox_id=str(event.mailbox_id))
            return
        field = claim.password

        await publish_required_result(
            self._producer,
            TOPIC_MAILBOX_PROVISIONED,
            str(event.mailbox_id),
            e.MailboxProvisioned(
                mailbox_id=event.mailbox_id,
                mailbox_email=mb.email,
                encrypted_password=field.ciphertext,
                iv=field.iv,
                tag=field.tag,
                claim_id=claim.claim_id,
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
        log.warning("telegram_notify_task_error", error=str(exc), error_type=type(exc).__name__)
