"""The Konami code event has to say which mailbox it came out of.

A swap runs two escrow mailboxes on one trade and Konami mints a separate
verification code for each account. Published with the trade id alone, the two
codes are indistinguishable downstream — trade-service kept them in one column,
last write winning, and a party was shown either nothing or the six digits
Konami issued for somebody else's account.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import UUID

from smart_admin_worker.handlers.imap_poll import ImapPollHandler
from smart_admin_worker.imap.poller import PollPurpose
from smart_admin_worker.kafka import events as e

TRADE = UUID("11111111-1111-1111-1111-111111111111")
BOX = "trade-9f3c1a20@efbazaar.uz"


class _Hit:
    """What the detector hands the callback."""

    verification_code = "482913"
    received_at = datetime(2026, 8, 20, 12, 0, tzinfo=UTC)
    sender = "noreply@konami.net"


def _handler(registry):
    return ImapPollHandler(
        registry=registry,
        producer=AsyncMock(),
        password_provider=AsyncMock(return_value="hunter2"),
    )


async def _run_and_capture(purpose: PollPurpose):
    """Runs the handler and returns (producer, the callback it registered)."""
    registry = AsyncMock()
    handler = _handler(registry)
    await handler.handle(
        e.ImapPollRequest(trade_id=TRADE, mailbox_email=BOX, purpose=purpose.value)
    )
    return handler._producer, registry.start.call_args


async def test_the_code_event_names_the_mailbox_it_arrived_in():
    producer, call = await _run_and_capture(PollPurpose.WAIT_EMAIL_CHANGE_CODE)

    await call.kwargs["on_email_change_code"](_Hit())

    args, kwargs = producer.publish.call_args
    topic = args[0] if args else kwargs["topic"]
    assert topic == "efbazaar.trade.konami-email-change-code-received"

    event = args[2] if len(args) > 2 else kwargs["event"]
    assert isinstance(event, e.KonamiEmailChangeCodeReceived)
    assert event.trade_id == TRADE
    assert event.verification_code == "482913"
    # The field the whole fix rests on: without it the consumer cannot tell
    # which party the code belongs to.
    assert event.mailbox_email == BOX


async def test_a_poll_for_another_purpose_does_not_watch_for_codes():
    # Registering the callback regardless would have the poller publish a code
    # event out of a run started to verify a reset link.
    _, call = await _run_and_capture(PollPurpose.VERIFY_LINK)

    assert call.kwargs["on_email_change_code"] is None
    assert call.kwargs["on_reset"] is not None
