"""Deleting a mailbox that Mailcow will not delete.

Mailcow answers `access_denied` for a mailbox that does not exist, not
`object_dne`, so the "already gone" case does not arrive as MailboxNotFound.
The first version of this handler only caught that, and a request to delete a
"pending-…" address — one reserved by a trade and never provisioned — went
round Kafka for ever, firing the same Telegram alert on every pass.
"""

from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest

from smart_admin_worker.handlers.mailbox_delete import MailboxDeleteHandler
from smart_admin_worker.kafka import events as e
from smart_admin_worker.mailcow.errors import MailcowApiError

EVENT = e.MailboxDeleteRequest(
    mailbox_id=uuid4(),
    mailbox_email="pending-edb65249-7c53-41ef-911c-256ab59631a8@efbazaar.uz",
)


async def test_a_refusal_is_not_retried():
    mailcow = AsyncMock()
    mailcow.delete_mailbox.side_effect = MailcowApiError(200, "access_denied")

    # Must not raise: raising is what puts it back on the topic.
    await MailboxDeleteHandler(mailcow=mailcow).handle(EVENT)


async def test_mailcow_being_unreachable_is_retried():
    # Unwilling and unreachable are different. This one may well work next
    # time, and the mailbox is still sitting on the server until it does.
    mailcow = AsyncMock()
    mailcow.delete_mailbox.side_effect = httpx.ConnectError("no route")

    with pytest.raises(httpx.HTTPError):
        await MailboxDeleteHandler(mailcow=mailcow).handle(EVENT)


async def test_the_happy_path_asks_mailcow_once():
    mailcow = AsyncMock()

    await MailboxDeleteHandler(mailcow=mailcow).handle(EVENT)

    mailcow.delete_mailbox.assert_awaited_once_with(EVENT.mailbox_email)
