"""Shared fail-closed claim acquisition and read-only replay credential proof."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from uuid import UUID

import structlog

from smart_admin_worker.crypto.field_encryptor import FieldEncryptor
from smart_admin_worker.kafka.producer import ResultPublicationError
from smart_admin_worker.trade.client import ProvisionClaim, ProvisionClaimClient

log = structlog.get_logger(__name__)
CredentialVerifier = Callable[[str, str], Awaitable[bool]]


async def acquire(
    claims: ProvisionClaimClient | None,
    encryptor: FieldEncryptor,
    mailbox_id: UUID,
    trade_id: UUID | None,
    email: str,
    proposed_password: str,
) -> tuple[ProvisionClaim, str] | None:
    try:
        if claims is None:
            raise ValueError("Provisioning claim authority is not configured")
        proposed = encryptor.encrypt(f"mbox-{mailbox_id}", proposed_password.encode())
        claim = await claims.claim(mailbox_id, trade_id, email, proposed)
        if claim is None:
            log.warning("provision_claim_refused", mailbox_id=str(mailbox_id))
            return None
        if claim.mailbox_id != mailbox_id or claim.mailbox_email != email:
            raise ValueError("Provisioning claim identity mismatch")
        password = encryptor.decrypt(f"mbox-{mailbox_id}", claim.password).decode()
        return claim, password
    except Exception as error:
        # Never put credentials, HTTP bodies or headers in logs. A timed-out
        # claim may have committed STARTED; this is not proof of no resource.
        log.error(
            "provision_claim_unknown_manual_reconciliation",
            mailbox_id=str(mailbox_id),
            error_type=type(error).__name__,
        )
        raise ResultPublicationError("Provision claim authority unavailable") from error


async def prove_existing(verifier: CredentialVerifier | None, email: str, password: str) -> bool:
    try:
        return verifier is not None and await verifier(email, password) is True
    except Exception:
        return False
