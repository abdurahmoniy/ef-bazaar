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
