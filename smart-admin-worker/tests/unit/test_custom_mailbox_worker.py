"""Custom mailboxes: domain from the event, durable poll credentials, restart/stop.

Custom boxes live for months, so the worker's in-memory password cache — filled
only at provisioning — is empty after any restart. The poll request therefore
carries the encrypted password and the HKDF context it was sealed with.
"""

from __future__ import annotations

import base64
import json
from unittest.mock import AsyncMock
from uuid import UUID

import pytest

from smart_admin_worker.crypto.field_encryptor import FieldEncryptor
from smart_admin_worker.handlers.imap_poll import ImapPollHandler
from smart_admin_worker.handlers.imap_poll_stop import ImapPollStopHandler
from smart_admin_worker.handlers.mailbox_provision import MailboxProvisionHandler
from smart_admin_worker.imap.poller import PollPurpose
from smart_admin_worker.kafka import events as e
from smart_admin_worker.kafka.events import from_json
from smart_admin_worker.mailcow.client import Mailbox

SESSION = UUID("44444444-4444-4444-4444-444444444444")
BOX_ID = UUID("55555555-5555-5555-5555-555555555555")
BOX = "alibek1@efootball.uz"


@pytest.fixture
def encryptor():
    return FieldEncryptor(master_key=b"K" * 32)


async def test_provision_uses_the_domain_in_the_event(encryptor):
    mailcow = AsyncMock()
    mailcow.create_mailbox.return_value = Mailbox(email=BOX)
    handler = MailboxProvisionHandler(mailcow=mailcow, encryptor=encryptor, producer=AsyncMock())

    await handler.handle(
        e.MailboxProvisionRequest(mailbox_id=BOX_ID, local_part="alibek1", domain="efootball.uz")
    )

    assert mailcow.create_mailbox.await_args.kwargs["domain"] == "efootball.uz"


async def test_provision_keeps_the_default_for_events_without_domain(encryptor):
    mailcow = AsyncMock()
    mailcow.create_mailbox.return_value = Mailbox(email="alibek1@efbazaar.uz")
    handler = MailboxProvisionHandler(mailcow=mailcow, encryptor=encryptor, producer=AsyncMock())

    await handler.handle(e.MailboxProvisionRequest(mailbox_id=BOX_ID, local_part="alibek1"))

    assert mailcow.create_mailbox.await_args.kwargs["domain"] == "efbazaar.uz"


def test_provision_request_decodes_domain_and_its_absence():
    with_domain = from_json(
        "efbazaar.trade.mailbox-provision-request",
        json.dumps(
            {"mailboxId": str(BOX_ID), "localPart": "alibek1", "domain": "efootball.uz"}
        ).encode(),
    )
    without = from_json(
        "efbazaar.trade.mailbox-provision-request",
        json.dumps({"mailboxId": str(BOX_ID), "localPart": "alibek1"}).encode(),
    )

    assert with_domain.domain == "efootball.uz"
    assert without.domain is None


def test_poll_request_decodes_credentials_as_bytes(encryptor):
    field = encryptor.encrypt(f"mbox-{BOX_ID}", b"s3cret")
    ev = from_json(
        "efbazaar.trade.imap-poll-request",
        json.dumps(
            {
                "tradeId": str(SESSION),
                "mailboxEmail": BOX,
                "purpose": "VERIFY_LINK",
                "passwordContext": f"mbox-{BOX_ID}",
                "encryptedPassword": base64.b64encode(field.ciphertext).decode(),
                "iv": base64.b64encode(field.iv).decode(),
                "tag": base64.b64encode(field.tag).decode(),
                "restart": True,
            }
        ).encode(),
    )

    assert ev.encrypted_password == field.ciphertext
    assert ev.iv == field.iv and ev.tag == field.tag
    assert ev.password_context == f"mbox-{BOX_ID}"
    assert ev.restart is True


def test_old_poll_request_still_decodes():
    ev = from_json(
        "efbazaar.trade.imap-poll-request",
        json.dumps(
            {"tradeId": str(SESSION), "mailboxEmail": BOX, "purpose": "VERIFY_LINK"}
        ).encode(),
    )

    assert ev.encrypted_password is None
    assert ev.restart is False


async def test_poll_decrypts_the_request_when_the_cache_is_empty(encryptor):
    field = encryptor.encrypt(f"mbox-{BOX_ID}", b"s3cret")
    registry = AsyncMock()
    registry.start = AsyncMock()
    handler = ImapPollHandler(
        registry=registry,
        producer=AsyncMock(),
        password_provider=AsyncMock(return_value=""),
        decryptor=encryptor,
    )

    await handler.handle(
        e.ImapPollRequest(
            trade_id=SESSION,
            mailbox_email=BOX,
            purpose="VERIFY_LINK",
            password_context=f"mbox-{BOX_ID}",
            encrypted_password=field.ciphertext,
            iv=field.iv,
            tag=field.tag,
        )
    )

    assert registry.start.call_args.args[1] == "s3cret"


async def test_poll_without_cache_or_credentials_still_refuses():
    handler = ImapPollHandler(
        registry=AsyncMock(),
        producer=AsyncMock(),
        password_provider=AsyncMock(return_value=""),
        decryptor=None,
    )

    with pytest.raises(LookupError):
        await handler.handle(
            e.ImapPollRequest(trade_id=SESSION, mailbox_email=BOX, purpose="VERIFY_LINK")
        )


async def test_restart_cancels_the_running_poller_first():
    registry = AsyncMock()
    handler = ImapPollHandler(
        registry=registry, producer=AsyncMock(), password_provider=AsyncMock(return_value="pw")
    )

    await handler.handle(
        e.ImapPollRequest(trade_id=SESSION, mailbox_email=BOX, purpose="VERIFY_LINK", restart=True)
    )

    registry.cancel.assert_awaited_once_with(BOX, PollPurpose.VERIFY_LINK)
    registry.start.assert_called_once()


async def test_no_restart_leaves_the_running_poller_alone():
    registry = AsyncMock()
    handler = ImapPollHandler(
        registry=registry, producer=AsyncMock(), password_provider=AsyncMock(return_value="pw")
    )

    await handler.handle(
        e.ImapPollRequest(trade_id=SESSION, mailbox_email=BOX, purpose="VERIFY_LINK")
    )

    registry.cancel.assert_not_awaited()


async def test_stop_cancels_every_poller_of_the_mailbox():
    registry = AsyncMock()

    await ImapPollStopHandler(registry).handle(e.ImapPollStopRequest(mailbox_email=BOX))

    registry.cancel_mailbox.assert_awaited_once_with(BOX)


def test_stop_request_decodes():
    ev = from_json(
        "efbazaar.trade.imap-poll-stop-request", json.dumps({"mailboxEmail": BOX}).encode()
    )
    assert ev == e.ImapPollStopRequest(mailbox_email=BOX)


async def test_custom_name_already_in_mailcow_is_not_reported_as_ours(encryptor):
    """A user-chosen name can collide with a box we never made (staff, legacy).

    Reporting it provisioned would store a password Mailcow never got: IMAP
    and webmail would fail for good. Nothing is published, the admins are told.
    """
    from smart_admin_worker.mailcow.errors import MailboxAlreadyExists

    mailcow = AsyncMock()
    mailcow.create_mailbox.side_effect = MailboxAlreadyExists(409, "exists")
    producer = AsyncMock()
    notifier = AsyncMock()
    notifier.enabled = True
    handler = MailboxProvisionHandler(
        mailcow=mailcow, encryptor=encryptor, producer=producer, notifier=notifier
    )

    await handler.handle(
        e.MailboxProvisionRequest(
            mailbox_id=BOX_ID, local_part="alibek1", domain="efbazaar.uz", custom=True
        )
    )

    producer.publish.assert_not_awaited()
    notifier.notify_error.assert_awaited_once()


def test_provision_request_decodes_custom_flag():
    ev = from_json(
        "efbazaar.trade.mailbox-provision-request",
        json.dumps({"mailboxId": str(BOX_ID), "localPart": "alibek1", "custom": True}).encode(),
    )
    assert ev.custom is True
