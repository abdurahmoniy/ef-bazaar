from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest

from smart_admin_worker.crypto.field_encryptor import FieldEncryptor
from smart_admin_worker.kafka import events as e


@pytest.mark.parametrize("admin", [False, True])
async def test_duplicate_started_claim_can_only_prove_original_password_and_publish(admin):
    from smart_admin_worker.handlers.email_provision import EmailProvisionHandler
    from smart_admin_worker.handlers.mailbox_provision import MailboxProvisionHandler
    from smart_admin_worker.trade.client import ProvisionClaim

    mailbox, trade, claim_id = uuid4(), uuid4(), uuid4()
    encryptor = FieldEncryptor(b"K" * 32)
    password = encryptor.encrypt(f"mbox-{mailbox}", b"original-known-password")
    mailcow, producer, claims, verifier = AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock()
    email = "chosen@efbazaar.uz" if admin else f"trade-{mailbox.hex}@efbazaar.uz"
    claims.claim.return_value = ProvisionClaim(claim_id, mailbox, email, False, password)
    verifier.return_value = True
    handler = (MailboxProvisionHandler if admin else EmailProvisionHandler)(
        mailcow=mailcow,
        encryptor=encryptor,
        producer=producer,
        claims=claims,
        credential_verifier=verifier,
    )
    event = (
        e.MailboxProvisionRequest(mailbox, "chosen", address_version=2)
        if admin
        else e.EmailProvisionRequest(trade, mailbox, address_version=2)
    )
    await handler.handle(event)
    mailcow.create_mailbox.assert_not_awaited()
    mailcow.rotate_password.assert_not_awaited()
    verifier.assert_awaited_once_with(email, "original-known-password")
    result = producer.publish.await_args.args[2]
    assert result.claim_id == claim_id
    assert result.encrypted_password == password.ciphertext
    assert result.iv == password.iv and result.tag == password.tag


@pytest.mark.parametrize("admin", [False, True])
async def test_unknown_claim_or_failed_proof_never_creates_rotates_or_claims_success(admin):
    from smart_admin_worker.handlers.email_provision import EmailProvisionHandler
    from smart_admin_worker.handlers.mailbox_provision import MailboxProvisionHandler
    from smart_admin_worker.trade.client import ProvisionClaim

    mailbox, trade = uuid4(), uuid4()
    encryptor = FieldEncryptor(b"K" * 32)
    password = encryptor.encrypt(f"mbox-{mailbox}", b"original")
    mailcow, producer, claims, verifier = AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock()
    email = "chosen@efbazaar.uz" if admin else f"trade-{mailbox.hex}@efbazaar.uz"
    claims.claim.return_value = ProvisionClaim(uuid4(), mailbox, email, False, password)
    verifier.return_value = False
    handler = (MailboxProvisionHandler if admin else EmailProvisionHandler)(
        mailcow=mailcow,
        encryptor=encryptor,
        producer=producer,
        claims=claims,
        credential_verifier=verifier,
    )
    event = (
        e.MailboxProvisionRequest(mailbox, "chosen", address_version=2)
        if admin
        else e.EmailProvisionRequest(trade, mailbox, address_version=2)
    )
    await handler.handle(event)
    mailcow.create_mailbox.assert_not_awaited()
    producer.publish.assert_not_awaited()
    claims.claim.side_effect = httpx.ReadTimeout("claim response lost")
    from smart_admin_worker.kafka.producer import ResultPublicationError

    with pytest.raises(ResultPublicationError):
        await handler.handle(event)
    mailcow.create_mailbox.assert_not_awaited()
    producer.publish.assert_not_awaited()


def test_replay_credential_probe_authenticates_without_selecting_or_reading_a_folder(monkeypatch):
    from unittest.mock import MagicMock

    from smart_admin_worker.imap import factory

    mailbox = MagicMock()
    mailbox.return_value.__enter__.return_value = mailbox.return_value
    monkeypatch.setattr(factory, "MailBox", mailbox)
    assert factory.verify_credentials(
        "mail.fixture.test", 993, "own@efbazaar.uz", "sealed-password"
    )
    mailbox.return_value.login.assert_called_once_with(
        "own@efbazaar.uz", "sealed-password", initial_folder=None
    )
    mailbox.return_value.folder.set.assert_not_called()
    mailbox.return_value.fetch.assert_not_called()
    mailbox.return_value.flag.assert_not_called()


@pytest.mark.parametrize("admin", [False, True])
async def test_result_retry_proves_original_claim_without_a_second_create(admin):
    from smart_admin_worker.handlers.email_provision import EmailProvisionHandler
    from smart_admin_worker.handlers.mailbox_provision import MailboxProvisionHandler
    from smart_admin_worker.kafka.producer import ResultPublicationError
    from smart_admin_worker.trade.client import ProvisionClaim

    mailbox, trade, claim_id = uuid4(), uuid4(), uuid4()
    encryptor = FieldEncryptor(b"K" * 32)
    field = encryptor.encrypt(f"mbox-{mailbox}", b"durable-password")
    email = "chosen@efbazaar.uz" if admin else f"trade-{mailbox.hex}@efbazaar.uz"
    mailcow, claims, producer, verifier = AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock()
    claims.claim.side_effect = [
        ProvisionClaim(claim_id, mailbox, email, True, field),
        ProvisionClaim(claim_id, mailbox, email, False, field),
    ]
    verifier.return_value = True
    producer.publish.side_effect = [RuntimeError("broker unavailable"), None]
    handler = (MailboxProvisionHandler if admin else EmailProvisionHandler)(
        mailcow=mailcow,
        encryptor=encryptor,
        producer=producer,
        claims=claims,
        credential_verifier=verifier,
    )
    event = (
        e.MailboxProvisionRequest(mailbox, "chosen", address_version=2)
        if admin
        else e.EmailProvisionRequest(trade, mailbox, address_version=2)
    )
    with pytest.raises(ResultPublicationError):
        await handler.handle(event)
    await handler.handle(event)
    mailcow.create_mailbox.assert_awaited_once()
    mailcow.rotate_password.assert_not_awaited()
    verifier.assert_awaited_once_with(email, "durable-password")
    results = [call.args[2] for call in producer.publish.await_args_list]
    assert all(
        result.claim_id == claim_id
        and result.encrypted_password == field.ciphertext
        and result.iv == field.iv
        and result.tag == field.tag
        for result in results
    )


@pytest.mark.parametrize("admin", [False, True])
async def test_first_create_timeout_is_unknown_and_never_claims_success_or_no_resource(admin):
    from smart_admin_worker.handlers.email_provision import EmailProvisionHandler
    from smart_admin_worker.handlers.mailbox_provision import MailboxProvisionHandler
    from tests.unit.provisioning_fixtures import AuthorizingClaims, credentials_valid

    mailcow, producer = AsyncMock(), AsyncMock()
    mailcow.create_mailbox.side_effect = httpx.ReadTimeout("Mailcow outcome unknown")
    mailbox = uuid4()
    handler = (MailboxProvisionHandler if admin else EmailProvisionHandler)(
        mailcow=mailcow,
        encryptor=FieldEncryptor(b"K" * 32),
        producer=producer,
        claims=AuthorizingClaims(),
        credential_verifier=credentials_valid,
    )
    event = (
        e.MailboxProvisionRequest(mailbox, "chosen", address_version=2)
        if admin
        else e.EmailProvisionRequest(uuid4(), mailbox, address_version=2)
    )
    await handler.handle(event)
    mailcow.create_mailbox.assert_awaited_once()
    producer.publish.assert_not_awaited()
    mailcow.rotate_password.assert_not_awaited()


async def test_legacy_custom_request_never_contacts_claim_authority_or_mailcow():
    from smart_admin_worker.handlers.mailbox_provision import MailboxProvisionHandler

    mailcow, producer, claims = AsyncMock(), AsyncMock(), AsyncMock()
    handler = MailboxProvisionHandler(mailcow, FieldEncryptor(b"K" * 32), producer, claims=claims)
    await handler.handle(e.MailboxProvisionRequest(uuid4(), "legacy"))
    claims.claim.assert_not_awaited()
    mailcow.create_mailbox.assert_not_awaited()
    producer.publish.assert_not_awaited()


async def test_unavailable_claim_authority_keeps_request_retryable_without_mailcow_side_effects():
    from smart_admin_worker.handlers.email_provision import EmailProvisionHandler
    from smart_admin_worker.kafka.producer import ResultPublicationError

    claims, mailcow, producer = AsyncMock(), AsyncMock(), AsyncMock()
    claims.claim.side_effect = httpx.ReadTimeout("claim response unknown")
    handler = EmailProvisionHandler(mailcow, FieldEncryptor(b"K" * 32), producer, claims=claims)
    with pytest.raises(ResultPublicationError):
        await handler.handle(e.EmailProvisionRequest(uuid4(), uuid4(), address_version=2))
    mailcow.create_mailbox.assert_not_awaited()
    producer.publish.assert_not_awaited()


def test_failed_replay_authentication_closes_the_imap_connection(monkeypatch):
    from unittest.mock import MagicMock

    from smart_admin_worker.imap import factory

    mailbox = MagicMock()
    mailbox.return_value.__enter__.return_value = mailbox.return_value
    mailbox.return_value.login.side_effect = ValueError("authentication failed")
    monkeypatch.setattr(factory, "MailBox", mailbox)
    with pytest.raises(ValueError, match="authentication failed"):
        factory.verify_credentials("mail.fixture.test", 993, "own@efbazaar.uz", "bad-password")
    mailbox.return_value.__exit__.assert_called_once()
