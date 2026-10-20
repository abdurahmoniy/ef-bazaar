from __future__ import annotations

import json
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest

from smart_admin_worker.kafka import events as e
from smart_admin_worker.kafka import topics as t
from smart_admin_worker.mailcow.errors import MailcowApiError


async def test_inventory_request_decode_and_chunked_observation_preserves_one_snapshot():
    from smart_admin_worker.handlers.mailbox_inventory import MailboxInventoryHandler
    from smart_admin_worker.mailcow.client import MailboxInventoryEntry

    request_id = uuid4()
    event = e.from_json("efbazaar.trade.mailbox-inventory-request", json.dumps({
        "requestId": str(request_id), "domains": ["efbazaar.uz"]}).encode())
    assert event.request_id == request_id
    mailcow, producer = AsyncMock(), AsyncMock()
    mailcow.get_mailbox_inventory.return_value = [
        MailboxInventoryEntry(f"orphan-{i}@efbazaar.uz", i, 1000, True) for i in range(201)
    ]
    await MailboxInventoryHandler(mailcow, producer).handle(event)
    results = [call.args[2] for call in producer.publish.await_args_list]
    assert [len(result.mailboxes) for result in results] == [100, 100, 1]
    assert [result.page for result in results] == [0, 1, 2]
    assert [result.last_page for result in results] == [False, False, True]
    assert len({result.observed_at for result in results}) == 1
    assert all(result.success and result.request_id == request_id for result in results)
    wire = json.loads(e.to_json(results[0]))
    assert wire["mailboxes"][0] == {
        "mailboxEmail": "orphan-0@efbazaar.uz", "usedBytes": 0,
        "quotaBytes": 1000, "active": True}
    assert all(call.args[0] == "efbazaar.trade.mailbox-inventory-observed"
               and call.args[1] == str(request_id) for call in producer.publish.await_args_list)
    assert t.TOPIC_MAILBOX_INVENTORY_REQ in t.REQUEST_TOPICS


@pytest.mark.parametrize("error", [MailcowApiError(403, "denied"), httpx.ReadTimeout("slow")])
async def test_inventory_failure_never_claims_a_complete_empty_snapshot(error):
    from smart_admin_worker.handlers.mailbox_inventory import MailboxInventoryHandler

    mailcow, producer = AsyncMock(), AsyncMock()
    mailcow.get_mailbox_inventory.side_effect = error
    await MailboxInventoryHandler(mailcow, producer).handle(
        e.MailboxInventoryRequest(uuid4(), ["efbazaar.uz"]))
    result = producer.publish.await_args.args[2]
    assert result.success is False
    assert result.last_page is False
    assert result.mailboxes == []
    assert result.error


async def test_inventory_empty_success_and_no_partial_on_later_domain_failure():
    from smart_admin_worker.handlers.mailbox_inventory import MailboxInventoryHandler

    mailcow, producer = AsyncMock(), AsyncMock()
    mailcow.get_mailbox_inventory.return_value = []
    handler = MailboxInventoryHandler(mailcow, producer)
    await handler.handle(e.MailboxInventoryRequest(uuid4(), ["efbazaar.uz"]))
    result = producer.publish.await_args.args[2]
    assert result.success and result.last_page and result.mailboxes == []
    producer.reset_mock()
    mailcow.get_mailbox_inventory.side_effect = [[], MailcowApiError(502, "failed")]
    await handler.handle(e.MailboxInventoryRequest(uuid4(), ["efbazaar.uz", "other.test"]))
    producer.publish.assert_awaited_once()
    assert producer.publish.await_args.args[2].success is False


@pytest.mark.parametrize("domains", [[], ["../all"], ["all"], ["a.test"] * 51, "a.test"])
async def test_invalid_or_unbounded_domain_requests_never_reach_mailcow(domains):
    from smart_admin_worker.handlers.mailbox_inventory import MailboxInventoryHandler

    mailcow, producer = AsyncMock(), AsyncMock()
    await MailboxInventoryHandler(mailcow, producer).handle(
        e.MailboxInventoryRequest(uuid4(), domains))
    mailcow.get_mailbox_inventory.assert_not_awaited()
    assert producer.publish.await_args.args[2].success is False


async def test_inventory_broker_failure_propagates_for_retry():
    from smart_admin_worker.handlers.mailbox_inventory import MailboxInventoryHandler

    mailcow, producer = AsyncMock(), AsyncMock()
    mailcow.get_mailbox_inventory.return_value = []
    producer.publish.side_effect = RuntimeError("broker unavailable")
    with pytest.raises(RuntimeError, match="broker unavailable"):
        await MailboxInventoryHandler(mailcow, producer).handle(
            e.MailboxInventoryRequest(uuid4(), ["efbazaar.uz"]))
