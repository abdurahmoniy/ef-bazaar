from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import UUID

import pytest

from smart_admin_worker.crypto.field_encryptor import EncryptedField, FieldEncryptor
from smart_admin_worker.handlers.mailbox_provision import MailboxProvisionHandler
from smart_admin_worker.kafka import events as e
from smart_admin_worker.mailcow.client import Mailbox
from smart_admin_worker.mailcow.errors import MailboxAlreadyExists
from tests.unit.provisioning_fixtures import AuthorizingClaims, credentials_valid

MAILBOX_ID = UUID("33333333-3333-3333-3333-333333333333")


@pytest.fixture
def encryptor():
    return FieldEncryptor(master_key=b"K" * 32)


async def test_creates_mailbox_with_admin_local_part_and_publishes(encryptor):
    mailcow = AsyncMock()
    mailcow.create_mailbox.return_value = Mailbox(email="azizbek@efbazaar.uz")
    producer = AsyncMock()

    handler = MailboxProvisionHandler(
        mailcow=mailcow,
        encryptor=encryptor,
        producer=producer,
        mailcow_domain="efbazaar.uz",
        claims=AuthorizingClaims(),
        credential_verifier=credentials_valid,
    )
    await handler.handle(
        e.MailboxProvisionRequest(mailbox_id=MAILBOX_ID, local_part="azizbek", address_version=2)
    )

    call = mailcow.create_mailbox.await_args
    assert call.kwargs["local_part"] == "azizbek"
    assert call.kwargs["domain"] == "efbazaar.uz"

    args, kwargs = producer.publish.call_args
    assert args[0] == "efbazaar.trade.mailbox-provisioned"
    assert args[1] == str(MAILBOX_ID)

    event = args[2]
    assert isinstance(event, e.MailboxProvisioned)
    assert event.mailbox_id == MAILBOX_ID
    assert event.mailbox_email == "azizbek@efbazaar.uz"
    assert len(event.iv) == 12
    assert len(event.tag) == 16

    # Context MUST be mbox-{mailboxId}: admin rows have no trade, so this is
    # the only context MailboxPasswordResolver can try.
    field = EncryptedField(iv=event.iv, tag=event.tag, ciphertext=event.encrypted_password)
    plaintext = encryptor.decrypt(f"mbox-{MAILBOX_ID}", field).decode()
    assert plaintext == call.kwargs["password"]


async def test_populates_caches_on_fresh_create(encryptor):
    mailcow = AsyncMock()
    mailcow.create_mailbox.return_value = Mailbox(email="azizbek@efbazaar.uz")
    password_cache: dict[str, str] = {}
    mailbox_id_to_email: dict[UUID, str] = {}

    handler = MailboxProvisionHandler(
        mailcow=mailcow,
        encryptor=encryptor,
        producer=AsyncMock(),
        mailcow_domain="efbazaar.uz",
        password_cache=password_cache,
        mailbox_id_to_email=mailbox_id_to_email,
        claims=AuthorizingClaims(),
        credential_verifier=credentials_valid,
    )
    await handler.handle(
        e.MailboxProvisionRequest(mailbox_id=MAILBOX_ID, local_part="azizbek", address_version=2)
    )

    generated = mailcow.create_mailbox.await_args.kwargs["password"]
    assert password_cache["azizbek@efbazaar.uz"] == generated
    assert mailbox_id_to_email[MAILBOX_ID] == "azizbek@efbazaar.uz"


async def test_replay_of_existing_mailbox_still_publishes_but_skips_caches(encryptor):
    mailcow = AsyncMock()
    mailcow.create_mailbox.side_effect = MailboxAlreadyExists(200, "object_exists")
    producer = AsyncMock()
    password_cache: dict[str, str] = {}

    handler = MailboxProvisionHandler(
        mailcow=mailcow,
        encryptor=encryptor,
        producer=producer,
        mailcow_domain="efbazaar.uz",
        password_cache=password_cache,
        claims=AuthorizingClaims(),
        credential_verifier=credentials_valid,
    )
    await handler.handle(
        e.MailboxProvisionRequest(mailbox_id=MAILBOX_ID, local_part="azizbek", address_version=2)
    )

    event = producer.publish.call_args[0][2]
    assert event.mailbox_email == "azizbek@efbazaar.uz"
    # Mailcow never returns the existing password, so caching one would break
    # IMAP logins — the cache must stay untouched on replay.
    assert password_cache == {}
