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
from smart_admin_worker.mailcow.errors import MailboxNotFound, MailcowApiError

EVENT = e.MailboxDeleteRequest(
    mailbox_id=uuid4(),
    request_id=uuid4(),
    mailbox_email="pending-edb65249-7c53-41ef-911c-256ab59631a8@efbazaar.uz",
)


async def test_a_refusal_is_not_retried():
    mailcow = AsyncMock()
    mailcow.delete_mailbox.side_effect = MailcowApiError(200, "access_denied")

    # Must not raise: raising is what puts it back on the topic.
    await MailboxDeleteHandler(
            mailcow=mailcow, registry=AsyncMock(), producer=AsyncMock(),
        ).handle(EVENT)


async def test_mailcow_being_unreachable_is_retried():
    # Unwilling and unreachable are different. This one may well work next
    # time, and the mailbox is still sitting on the server until it does.
    mailcow = AsyncMock()
    mailcow.delete_mailbox.side_effect = httpx.ConnectError("no route")

    with pytest.raises(httpx.HTTPError):
        await MailboxDeleteHandler(
            mailcow=mailcow, registry=AsyncMock(), producer=AsyncMock(),
        ).handle(EVENT)


async def test_the_happy_path_asks_mailcow_once():
    mailcow = AsyncMock()

    await MailboxDeleteHandler(
            mailcow=mailcow, registry=AsyncMock(), producer=AsyncMock(),
        ).handle(EVENT)

    mailcow.delete_mailbox.assert_awaited_once_with(EVENT.mailbox_email)


@pytest.mark.parametrize("error, success, absent", [
    (None, True, False), (MailboxNotFound(200, "object_dne"), True, True),
    (MailcowApiError(200, "access_denied"), False, False),
])
async def test_delete_acknowledges_only_a_confirmed_result(error, success, absent):
    mailcow, producer, registry = AsyncMock(), AsyncMock(), AsyncMock()
    mailcow.delete_mailbox.side_effect = error
    await MailboxDeleteHandler(mailcow, registry, producer=producer).handle(EVENT)
    registry.cancel_mailbox.assert_awaited_once_with(EVENT.mailbox_email)
    topic, key, result = producer.publish.await_args.args
    assert topic == "efbazaar.trade.mailbox-delete-result"
    assert key == str(EVENT.mailbox_id)
    assert result.success is success
    assert result.already_absent is absent
    assert result.request_id == EVENT.request_id
    assert bool(result.error) is (not success)


async def test_delete_timeout_publishes_unknown_failure_then_retries():
    mailcow, producer = AsyncMock(), AsyncMock()
    mailcow.delete_mailbox.side_effect = httpx.ReadTimeout("timeout")
    with pytest.raises(httpx.ReadTimeout):
        await MailboxDeleteHandler(mailcow, AsyncMock(), producer=producer).handle(EVENT)
    result = producer.publish.await_args.args[2]
    assert result.success is False
    assert result.already_absent is False
    assert result.error == "UNKNOWN:ReadTimeout"


async def test_delete_result_publish_failure_does_not_complete_request():
    producer = AsyncMock()
    producer.publish.side_effect = RuntimeError("broker unavailable")
    with pytest.raises(RuntimeError, match="broker unavailable"):
        await MailboxDeleteHandler(AsyncMock(), AsyncMock(), producer=producer).handle(EVENT)


async def test_replay_confirms_already_absent_and_preserves_request_identity():
    mailcow, producer = AsyncMock(), AsyncMock()
    mailcow.delete_mailbox.side_effect = [None, MailboxNotFound(200, "object_dne")]
    event = e.MailboxDeleteRequest(uuid4(), "retired@efbazaar.uz", request_id=uuid4())
    handler = MailboxDeleteHandler(mailcow, AsyncMock(), producer)
    await handler.handle(event)
    await handler.handle(event)
    first, replay = (call.args[2] for call in producer.publish.await_args_list)
    assert first.success and not first.already_absent
    assert replay.success and replay.already_absent
    assert replay.request_id == event.request_id
    assert replay.mailbox_id == event.mailbox_id
    assert replay.mailbox_email == event.mailbox_email


async def test_legacy_uncorrelated_delete_decodes_but_never_touches_mailcow(caplog):
    import json

    old = e.from_json("efbazaar.trade.mailbox-delete-request", json.dumps({
        "mailboxId": str(uuid4()), "mailboxEmail": "old@efbazaar.uz",
    }).encode())
    assert old.request_id is None
    mailcow, registry, producer = AsyncMock(), AsyncMock(), AsyncMock()
    await MailboxDeleteHandler(mailcow, registry, producer).handle(old)
    mailcow.delete_mailbox.assert_not_awaited()
    registry.cancel_mailbox.assert_not_awaited()
    result = producer.publish.await_args.args[2]
    assert result.request_id is None
    assert not result.success and not result.already_absent
    assert result.error == "MISSING_REQUEST_ID"
    assert "uncorrelated" in caplog.text
