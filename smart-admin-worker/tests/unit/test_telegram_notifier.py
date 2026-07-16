"""TelegramNotifier — sendMessage payload, inert mode, and error swallowing."""

from __future__ import annotations

from uuid import UUID

import httpx
import pytest
import respx

from smart_admin_worker.telegram.notifier import TelegramNotifier

BOT_TOKEN = "111:AAAA-token"  # noqa: S105 — test fixture, not a real secret
CHAT_ID = "-1001234567890"
TOPIC_ID = 6
API_URL = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"

# Test UUIDs — chosen so the first 8 chars (short-id used in the message) are
# distinctive enough to grep for in assertions.
UUID_A = UUID("aaaaaaaa-1111-1111-1111-111111111111")
UUID_B = UUID("bbbbbbbb-2222-2222-2222-222222222222")
UUID_C = UUID("cccccccc-3333-3333-3333-333333333333")
UUID_D = UUID("dddddddd-4444-4444-4444-444444444444")
UUID_E = UUID("eeeeeeee-5555-5555-5555-555555555555")
UUID_F = UUID("ffffffff-6666-6666-6666-666666666666")
UUID_G = UUID("12345678-7777-7777-7777-777777777777")


@pytest.fixture
async def http_client():
    async with httpx.AsyncClient() as c:
        yield c


async def test_inert_mode_when_token_missing(http_client):
    """No token → notifier is inert. No HTTP call, no error."""
    notifier = TelegramNotifier(
        bot_token=None, chat_id=CHAT_ID, topic_id=TOPIC_ID, http_client=http_client
    )
    assert notifier.enabled is False
    # Must not raise, must not attempt a network call.
    await notifier.notify_mailbox_created(
        trade_id=UUID_A, mailbox_email="trade-aaaaaaaa@efbazaar.uz", capacity=None
    )


async def test_inert_mode_when_chat_missing(http_client):
    notifier = TelegramNotifier(
        bot_token=BOT_TOKEN, chat_id=None, topic_id=TOPIC_ID, http_client=http_client
    )
    assert notifier.enabled is False
    await notifier.notify_mailbox_created(
        trade_id=UUID_B, mailbox_email="trade-bbbbbbbb@efbazaar.uz", capacity=None
    )


@respx.mock
async def test_sends_payload_when_configured(http_client):
    route = respx.post(API_URL).mock(return_value=httpx.Response(200, json={"ok": True}))
    notifier = TelegramNotifier(
        bot_token=BOT_TOKEN, chat_id=CHAT_ID, topic_id=TOPIC_ID, http_client=http_client
    )

    await notifier.notify_mailbox_created(
        trade_id=UUID_C,
        mailbox_email="trade-cccccccc@efbazaar.uz",
        capacity={"used": 3, "limit": 10},
    )

    assert route.called
    import json as _json
    payload = _json.loads(route.calls.last.request.content)
    # Chat + topic threading.
    assert payload["chat_id"] == CHAT_ID
    assert payload["message_thread_id"] == TOPIC_ID
    # Message body content.
    text = payload["text"]
    assert "Yangi mailbox yaratildi" in text
    assert "trade-cccccccc@efbazaar.uz" in text
    # Trade short id is present.
    assert "cccccccc" in text
    # Capacity line was included.
    assert "3/10 mailbox (30%)" in text


@respx.mock
async def test_omits_topic_when_none(http_client):
    route = respx.post(API_URL).mock(return_value=httpx.Response(200, json={"ok": True}))
    notifier = TelegramNotifier(
        bot_token=BOT_TOKEN, chat_id=CHAT_ID, topic_id=None, http_client=http_client
    )

    await notifier.notify_mailbox_created(
        trade_id=UUID_D, mailbox_email="trade-dddddddd@efbazaar.uz", capacity=None
    )

    import json as _json
    payload = _json.loads(route.calls.last.request.content)
    assert "message_thread_id" not in payload


@respx.mock
async def test_skips_capacity_line_when_none(http_client):
    route = respx.post(API_URL).mock(return_value=httpx.Response(200, json={"ok": True}))
    notifier = TelegramNotifier(
        bot_token=BOT_TOKEN, chat_id=CHAT_ID, topic_id=TOPIC_ID, http_client=http_client
    )

    await notifier.notify_mailbox_created(
        trade_id=UUID_E, mailbox_email="trade-eeeeeeee@efbazaar.uz", capacity=None
    )

    import json as _json
    payload = _json.loads(route.calls.last.request.content)
    # No "mailbox (" percentage line when capacity is None.
    assert "mailbox (" not in payload["text"]


@respx.mock
async def test_swallows_http_error(http_client):
    respx.post(API_URL).mock(return_value=httpx.Response(500, text="upstream boom"))
    notifier = TelegramNotifier(
        bot_token=BOT_TOKEN, chat_id=CHAT_ID, topic_id=TOPIC_ID, http_client=http_client
    )

    # Must NOT raise — Telegram outage must not stall the caller.
    await notifier.notify_mailbox_created(
        trade_id=UUID_F, mailbox_email="trade-ffffffff@efbazaar.uz", capacity=None
    )


@respx.mock
async def test_swallows_network_error(http_client):
    respx.post(API_URL).mock(side_effect=httpx.ConnectError("dns down"))
    notifier = TelegramNotifier(
        bot_token=BOT_TOKEN, chat_id=CHAT_ID, topic_id=TOPIC_ID, http_client=http_client
    )

    # Must NOT raise.
    await notifier.notify_mailbox_created(
        trade_id=UUID_G, mailbox_email="trade-12345678@efbazaar.uz", capacity=None
    )
