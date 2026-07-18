from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

from smart_admin_worker.crypto.field_encryptor import FieldEncryptor
from smart_admin_worker.handlers.email_provision import EmailProvisionHandler
from smart_admin_worker.kafka import events as e
from smart_admin_worker.mailcow.client import Mailbox
from smart_admin_worker.mailcow.errors import MailboxAlreadyExists


@pytest.fixture
def encryptor():
    return FieldEncryptor(master_key=b"K" * 32)


async def test_creates_mailbox_and_publishes_provisioned(encryptor):
    mailcow = AsyncMock()
    mailcow.create_mailbox.return_value = Mailbox(email="trade-abc@efbazaar.uz")
    producer = AsyncMock()

    handler = EmailProvisionHandler(
        mailcow=mailcow,
        encryptor=encryptor,
        producer=producer,
        mailcow_domain="efbazaar.uz",
    )
    trade_id = UUID("11111111-1111-1111-1111-111111111111")
    await handler.handle(e.EmailProvisionRequest(trade_id=trade_id, mailbox_id=uuid4()))

    mailcow.create_mailbox.assert_awaited_once()
    call = mailcow.create_mailbox.await_args
    assert call.kwargs.get("domain") == "efbazaar.uz" or call.args[1] == "efbazaar.uz"

    producer.publish.assert_awaited_once()
    args, kwargs = producer.publish.call_args
    topic = args[0] if args else kwargs["topic"]
    assert topic == "efbazaar.trade.email-provisioned"

    key_arg = args[1] if len(args) > 1 else kwargs["key"]
    assert key_arg == str(trade_id)

    event_arg = args[2] if len(args) > 2 else kwargs["event"]
    assert isinstance(event_arg, e.EmailProvisioned)
    assert event_arg.trade_id == trade_id
    assert event_arg.mailbox_email == "trade-abc@efbazaar.uz"
    # Worker generates the mailbox UUID; must be distinct from the trade UUID
    # (that's precisely the invariant the rotate-cache bug relied on breaking).
    assert isinstance(event_arg.mailbox_id, UUID)
    assert event_arg.mailbox_id != trade_id
    assert len(event_arg.iv) == 12
    assert len(event_arg.tag) == 16
    # Round-trip: decrypt the payload back with same encryptor + context.
    # Context is `mbox-{mailbox_id}` (worker-supplied UUID), NOT the trade id —
    # matches the primary decrypt path in MailboxPasswordResolver.
    from smart_admin_worker.crypto.field_encryptor import EncryptedField
    field = EncryptedField(
        iv=event_arg.iv, tag=event_arg.tag, ciphertext=event_arg.encrypted_password
    )
    plaintext = encryptor.decrypt(f"mbox-{event_arg.mailbox_id}", field).decode()
    # Mailcow was called with a password we generated — verify it matches the encrypted one.
    generated_password = call.kwargs.get("password") or call.args[2]
    assert plaintext == generated_password


async def test_populates_caches_on_fresh_create(encryptor):
    mailcow = AsyncMock()
    mailcow.create_mailbox.return_value = Mailbox(email="trade-abc@efbazaar.uz")
    producer = AsyncMock()
    password_cache: dict[str, str] = {}
    mailbox_id_to_email: dict[UUID, str] = {}

    handler = EmailProvisionHandler(
        mailcow=mailcow,
        encryptor=encryptor,
        producer=producer,
        mailcow_domain="efbazaar.uz",
        password_cache=password_cache,
        mailbox_id_to_email=mailbox_id_to_email,
    )
    trade_id = UUID("22222222-2222-2222-2222-222222222222")
    await handler.handle(e.EmailProvisionRequest(trade_id=trade_id, mailbox_id=uuid4()))

    # Password cache was populated with the generated password.
    assert "trade-abc@efbazaar.uz" in password_cache
    generated_password = mailcow.create_mailbox.await_args.kwargs["password"]
    assert password_cache["trade-abc@efbazaar.uz"] == generated_password

    # Mailbox-id-to-email cache is keyed by the worker-supplied mailbox UUID
    # (the same one MailboxRotateHandler receives on rotate requests) — NOT by
    # the trade UUID. The mailbox_id is the one field published in the
    # EmailProvisioned event.
    producer.publish.assert_awaited_once()
    args, kwargs = producer.publish.call_args
    event_arg = args[2] if len(args) > 2 else kwargs["event"]
    assert mailbox_id_to_email[event_arg.mailbox_id] == "trade-abc@efbazaar.uz"
    # Sanity: mailbox_id must differ from trade_id or the bug still lurks.
    assert event_arg.mailbox_id != trade_id
    assert trade_id not in mailbox_id_to_email


async def test_does_not_populate_caches_on_replay(encryptor):
    """On MailboxAlreadyExists (Kafka replay) we don't know the real password,
    so the caches must NOT be touched — poisoning them would break IMAP login."""
    mailcow = AsyncMock()
    mailcow.create_mailbox.side_effect = MailboxAlreadyExists(200, "object_exists")
    producer = AsyncMock()
    password_cache: dict[str, str] = {}
    mailbox_id_to_email: dict[UUID, str] = {}

    handler = EmailProvisionHandler(
        mailcow=mailcow,
        encryptor=encryptor,
        producer=producer,
        mailcow_domain="efbazaar.uz",
        password_cache=password_cache,
        mailbox_id_to_email=mailbox_id_to_email,
    )
    trade_id = UUID("33333333-3333-3333-3333-333333333333")
    await handler.handle(e.EmailProvisionRequest(trade_id=trade_id, mailbox_id=uuid4()))

    assert password_cache == {}
    assert mailbox_id_to_email == {}
    # But the publish still happened so trade-service can persist the (new)
    # encrypted payload — replay must remain idempotent.
    producer.publish.assert_awaited_once()


async def test_notifier_called_on_fresh_create(encryptor):
    mailcow = AsyncMock()
    mailcow.create_mailbox.return_value = Mailbox(email="trade-abc@efbazaar.uz")
    mailcow.get_domain_capacity = AsyncMock(return_value={"used": 4, "limit": 10})
    producer = AsyncMock()
    notifier = AsyncMock()
    notifier.enabled = True

    handler = EmailProvisionHandler(
        mailcow=mailcow,
        encryptor=encryptor,
        producer=producer,
        mailcow_domain="efbazaar.uz",
        notifier=notifier,
    )
    trade_id = UUID("44444444-4444-4444-4444-444444444444")
    await handler.handle(e.EmailProvisionRequest(trade_id=trade_id, mailbox_id=uuid4()))

    # Fire-and-forget task — give the loop a tick to run it.
    import asyncio as _asyncio
    for _ in range(3):
        await _asyncio.sleep(0)

    notifier.notify_mailbox_created.assert_awaited_once()
    call_kwargs = notifier.notify_mailbox_created.await_args.kwargs
    assert call_kwargs["trade_id"] == trade_id
    assert call_kwargs["mailbox_email"] == "trade-abc@efbazaar.uz"
    assert call_kwargs["capacity"] == {"used": 4, "limit": 10}


async def test_notifier_not_called_on_replay(encryptor):
    mailcow = AsyncMock()
    mailcow.create_mailbox.side_effect = MailboxAlreadyExists(200, "object_exists")
    producer = AsyncMock()
    notifier = AsyncMock()
    notifier.enabled = True

    handler = EmailProvisionHandler(
        mailcow=mailcow,
        encryptor=encryptor,
        producer=producer,
        mailcow_domain="efbazaar.uz",
        notifier=notifier,
    )
    trade_id = UUID("55555555-5555-5555-5555-555555555555")
    await handler.handle(e.EmailProvisionRequest(trade_id=trade_id, mailbox_id=uuid4()))

    import asyncio as _asyncio
    for _ in range(3):
        await _asyncio.sleep(0)

    notifier.notify_mailbox_created.assert_not_awaited()


async def test_notifier_skipped_when_disabled(encryptor):
    """A disabled notifier (missing token/chat) must not be called at all —
    saves a coroutine allocation per provision on unconfigured deployments."""
    mailcow = AsyncMock()
    mailcow.create_mailbox.return_value = Mailbox(email="trade-abc@efbazaar.uz")
    producer = AsyncMock()
    notifier = AsyncMock()
    notifier.enabled = False

    handler = EmailProvisionHandler(
        mailcow=mailcow,
        encryptor=encryptor,
        producer=producer,
        mailcow_domain="efbazaar.uz",
        notifier=notifier,
    )
    trade_id = UUID("66666666-6666-6666-6666-666666666666")
    await handler.handle(e.EmailProvisionRequest(trade_id=trade_id, mailbox_id=uuid4()))

    import asyncio as _asyncio
    for _ in range(3):
        await _asyncio.sleep(0)

    notifier.notify_mailbox_created.assert_not_awaited()
