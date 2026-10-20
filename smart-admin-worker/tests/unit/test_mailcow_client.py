"""MailcowClient — httpx mocked via respx."""

from __future__ import annotations

import httpx
import pytest
import respx

from smart_admin_worker.mailcow.client import Mailbox, MailcowClient
from smart_admin_worker.mailcow.errors import (
    MailboxAlreadyExists,
    MailboxNotFound,
    MailcowApiError,
)

BASE = "https://mail.example.test/api/v1"


@pytest.fixture
def client():
    return MailcowClient(base_url=BASE, api_key="test-key")


@respx.mock
async def test_create_mailbox_success(client):
    respx.post(f"{BASE}/add/mailbox").mock(
        return_value=httpx.Response(200, json=[{"type": "success", "msg": ["mailbox_added"]}])
    )
    mb = await client.create_mailbox("trade-abc", "efbazaar.uz", "Pw!12345", quota_mb=100)
    assert mb == Mailbox(email="trade-abc@efbazaar.uz")


@respx.mock
async def test_create_mailbox_already_exists(client):
    respx.post(f"{BASE}/add/mailbox").mock(
        return_value=httpx.Response(200, json=[{"type": "danger", "msg": ["object_exists"]}])
    )
    with pytest.raises(MailboxAlreadyExists):
        await client.create_mailbox("trade-abc", "efbazaar.uz", "Pw!12345")


@respx.mock
async def test_create_mailbox_5xx(client):
    respx.post(f"{BASE}/add/mailbox").mock(return_value=httpx.Response(502, text="upstream failed"))
    with pytest.raises(MailcowApiError) as ei:
        await client.create_mailbox("trade-abc", "efbazaar.uz", "Pw!12345")
    assert ei.value.status_code == 502


@respx.mock
async def test_rotate_password_success(client):
    respx.post(f"{BASE}/edit/mailbox").mock(
        return_value=httpx.Response(200, json=[{"type": "success", "msg": ["mailbox_modified"]}])
    )
    await client.rotate_password("trade-abc@efbazaar.uz", "NewPw!54321")


@respx.mock
async def test_rotate_password_not_found(client):
    respx.post(f"{BASE}/edit/mailbox").mock(
        return_value=httpx.Response(200, json=[{"type": "danger", "msg": ["object_dne"]}])
    )
    with pytest.raises(MailboxNotFound):
        await client.rotate_password("missing@efbazaar.uz", "x")


@respx.mock
async def test_delete_mailbox_success(client):
    respx.post(f"{BASE}/delete/mailbox").mock(
        return_value=httpx.Response(200, json=[{"type": "success", "msg": ["mailbox_removed"]}])
    )
    await client.delete_mailbox("trade-abc@efbazaar.uz")


@respx.mock
async def test_auth_header_sent(client):
    route = respx.post(f"{BASE}/add/mailbox").mock(
        return_value=httpx.Response(200, json=[{"type": "success", "msg": ["mailbox_added"]}])
    )
    await client.create_mailbox("trade-abc", "efbazaar.uz", "Pw!12345")
    assert route.calls.last.request.headers["X-API-Key"] == "test-key"


@respx.mock
async def test_get_domain_capacity_success(client):
    respx.get(f"{BASE}/get/domain/efbazaar.uz").mock(
        return_value=httpx.Response(
            200,
            json={
                "mboxes_in_domain": 3,
                "mboxes_left": 7,
                "domain_name": "efbazaar.uz",
            },
        )
    )
    cap = await client.get_domain_capacity("efbazaar.uz")
    assert cap == {"used": 3, "limit": 10}


@respx.mock
async def test_get_domain_capacity_list_shape(client):
    """Some Mailcow versions wrap the response in a list — handle that too."""
    respx.get(f"{BASE}/get/domain/efbazaar.uz").mock(
        return_value=httpx.Response(
            200,
            json=[{"mboxes_in_domain": 1, "mboxes_left": 9}],
        )
    )
    cap = await client.get_domain_capacity("efbazaar.uz")
    assert cap == {"used": 1, "limit": 10}


@respx.mock
async def test_get_domain_capacity_returns_none_on_5xx(client):
    respx.get(f"{BASE}/get/domain/efbazaar.uz").mock(return_value=httpx.Response(502))
    assert await client.get_domain_capacity("efbazaar.uz") is None


@respx.mock
async def test_get_domain_capacity_returns_none_on_unexpected_shape(client):
    respx.get(f"{BASE}/get/domain/efbazaar.uz").mock(
        return_value=httpx.Response(200, json={"unexpected": "shape"})
    )
    assert await client.get_domain_capacity("efbazaar.uz") is None


@respx.mock
async def test_get_domain_capacity_returns_none_on_network_error(client):
    respx.get(f"{BASE}/get/domain/efbazaar.uz").mock(side_effect=httpx.ConnectError("boom"))
    assert await client.get_domain_capacity("efbazaar.uz") is None


@respx.mock
async def test_inventory_reads_real_bytes_and_filters_the_requested_domain(client):
    respx.get(f"{BASE}/get/mailbox/all/efbazaar.uz").mock(return_value=httpx.Response(200, json=[
        {"username": "orphan@efbazaar.uz", "quota_used": "1537", "quota": 104857600,
         "active": "1"},
        {"username": "staff@other.test", "quota_used": 1, "quota": 2, "active": 0},
    ]))
    rows = await client.get_mailbox_inventory("efbazaar.uz")
    assert len(rows) == 1
    assert rows[0].mailbox_email == "orphan@efbazaar.uz"
    assert rows[0].used_bytes == 1537
    assert rows[0].quota_bytes == 104857600
    assert rows[0].active is True


@pytest.mark.parametrize("payload", [
    {}, [{"type": "danger", "msg": ["access_denied"]}],
    [{"username": "a@efbazaar.uz", "quota_used": -1, "quota": 1, "active": 1}],
    [{"username": "a@efbazaar.uz", "quota_used": None, "quota": 1, "active": 1}],
    [{"username": "a@efbazaar.uz", "quota_used": 0, "quota": "bad", "active": 1}],
    [{"username": "a@efbazaar.uz", "quota_used": 0, "quota": 1, "active": "yes"}],
    [{"username": "a@efbazaar.uz", "quota_used": True, "quota": 1, "active": 1}],
])
@respx.mock
async def test_inventory_malformed_or_denied_is_error_not_zero(client, payload):
    respx.get(f"{BASE}/get/mailbox/all/efbazaar.uz").mock(
        return_value=httpx.Response(200, json=payload))
    with pytest.raises(MailcowApiError):
        await client.get_mailbox_inventory("efbazaar.uz")


@respx.mock
async def test_inventory_empty_is_confirmed_only_for_a_successful_list(client):
    respx.get(f"{BASE}/get/mailbox/all/efbazaar.uz").mock(
        return_value=httpx.Response(200, json=[]))
    assert await client.get_mailbox_inventory("efbazaar.uz") == []


@pytest.mark.parametrize("payload", [None, {}, [], ["success"],
    [{"type": "success"}, {"type": "danger", "msg": "access_denied"}]])
@respx.mock
async def test_delete_rejects_malformed_or_mixed_failure_response(client, payload):
    respx.post(f"{BASE}/delete/mailbox").mock(return_value=httpx.Response(200, json=payload))
    with pytest.raises(MailcowApiError):
        await client.delete_mailbox("trade-abc@efbazaar.uz")


@respx.mock
async def test_mixed_not_found_and_access_denied_is_not_confirmed_absence(client):
    respx.post(f"{BASE}/delete/mailbox").mock(return_value=httpx.Response(200, json=[
        {"type": "danger", "msg": ["object_dne"]},
        {"type": "danger", "msg": ["access_denied"]},
    ]))
    with pytest.raises(MailcowApiError) as caught:
        await client.delete_mailbox("trade-abc@efbazaar.uz")
    assert not isinstance(caught.value, MailboxNotFound)


@pytest.mark.parametrize("status, payload", [
    (200, [{"type": "success"}]),
    (200, [{"type": "success", "msg": []}]),
    (302, [{"type": "success", "msg": ["mailbox_removed"]}]),
])
@respx.mock
async def test_delete_requires_a_complete_successful_mutation_response(client, status, payload):
    respx.post(f"{BASE}/delete/mailbox").mock(
        return_value=httpx.Response(status, json=payload))
    with pytest.raises(MailcowApiError):
        await client.delete_mailbox("trade-abc@efbazaar.uz")
