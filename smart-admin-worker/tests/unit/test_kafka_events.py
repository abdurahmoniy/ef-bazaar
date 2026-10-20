"""Kafka JSON serialization — round-trip parity with Java Jackson output."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import UUID

import pytest

from smart_admin_worker.kafka import events as e
from smart_admin_worker.kafka.events import from_json, to_json


def test_forgot_password_request_round_trip():
    payload = {
        "tradeId": "11111111-1111-1111-1111-111111111111",
        "mailboxEmail": "trade-abc@efbazaar.uz",
        "konamiId": None,
    }
    encoded = json.dumps(payload).encode()
    ev = from_json("efbazaar.trade.forgot-password-request", encoded)
    assert isinstance(ev, e.ForgotPasswordRequest)
    assert ev.trade_id == UUID("11111111-1111-1111-1111-111111111111")
    assert ev.mailbox_email == "trade-abc@efbazaar.uz"
    assert ev.konami_id is None


def test_konami_email_received_names_the_mailbox_it_landed_in():
    """Obmenda ikkita quti bor va javob qaysi biriga kelgani MUHIM.

    Manzilsiz trade-service uni "hali bajarmagan birinchi tarafga" yozardi
    — ya'ni tanga tashlash. Kod hodisalarida manzil boshidan bor edi,
    shuning uchun ular to'g'ri tomonga borardi.
    """
    ev = e.KonamiEmailReceived(
        trade_id=UUID("11111111-1111-1111-1111-111111111111"),
        reset_link_present=True,
        sender="noreply@konami.com",
        received_at=datetime(2026, 7, 15, 10, 30, tzinfo=UTC),
        mailbox_email="trade-05a64118@efbazaar.uz",
    )
    encoded = to_json(ev)
    decoded = json.loads(encoded)
    assert decoded == {
        "tradeId": "11111111-1111-1111-1111-111111111111",
        "resetLinkPresent": True,
        "sender": "noreply@konami.com",
        "receivedAt": "2026-07-15T10:30:00Z",
        "mailboxEmail": "trade-05a64118@efbazaar.uz",
        "emailNotRegistered": False,
    }


def test_konami_email_received_carries_the_not_registered_flag():
    ev = e.KonamiEmailReceived(
        trade_id=UUID("11111111-1111-1111-1111-111111111111"),
        reset_link_present=False,
        sender="konami-info@konami.net",
        received_at=datetime(2026, 10, 6, 18, 34, tzinfo=UTC),
        mailbox_email="trade-bc55c054@efbazaar.uz",
        email_not_registered=True,
    )
    assert json.loads(to_json(ev))["emailNotRegistered"] is True


def test_worker_queued_serialization():
    ev = e.WorkerQueued(
        trade_id=UUID("11111111-1111-1111-1111-111111111111"),
        purpose="forgot-password",
        estimated_wait_seconds=60,
    )
    payload = json.loads(to_json(ev))
    assert payload == {
        "tradeId": "11111111-1111-1111-1111-111111111111",
        "purpose": "forgot-password",
        "estimatedWaitSeconds": 60,
    }


def test_email_provisioned_bytes_encoded_as_base64():
    ev = e.EmailProvisioned(
        trade_id=UUID("11111111-1111-1111-1111-111111111111"),
        mailbox_id=UUID("22222222-2222-2222-2222-222222222222"),
        mailbox_email="a@b",
        encrypted_password=b"\x01\x02",
        iv=b"\x03" * 12,
        tag=b"\x04" * 16,
    )
    payload = json.loads(to_json(ev))
    assert payload["mailboxId"] == "22222222-2222-2222-2222-222222222222"
    assert payload["encryptedPassword"] == "AQI="
    assert payload["iv"] == "AwMDAwMDAwMDAwMD"
    assert payload["tag"] == "BAQEBAQEBAQEBAQEBAQEBA=="


def test_from_json_raises_on_unknown_topic():
    with pytest.raises(ValueError):
        from_json("efbazaar.trade.nonexistent", b"{}")


def test_from_json_raises_clear_error_on_missing_required_field():
    # ForgotPasswordRequest requires tradeId + mailboxEmail; konamiId is Optional.
    payload = {"tradeId": "11111111-1111-1111-1111-111111111111"}  # missing mailboxEmail
    with pytest.raises(ValueError, match="Missing required field 'mailboxEmail'"):
        from_json(
            "efbazaar.trade.forgot-password-request",
            json.dumps(payload).encode(),
        )


def test_from_json_ignores_extra_fields():
    payload = {
        "tradeId": "11111111-1111-1111-1111-111111111111",
        "mailboxEmail": "trade-abc@efbazaar.uz",
        "konamiId": None,
        "extraField": "should be ignored",
        "anotherOne": 42,
    }
    ev = from_json(
        "efbazaar.trade.forgot-password-request",
        json.dumps(payload).encode(),
    )
    assert isinstance(ev, e.ForgotPasswordRequest)
    assert ev.mailbox_email == "trade-abc@efbazaar.uz"


def test_observation_timestamp_preserves_subsecond_ordering():
    import json
    from datetime import UTC, datetime
    from uuid import uuid4

    from smart_admin_worker.kafka.events import MailboxDeleteResult, to_json

    observed = datetime(2026, 10, 20, 1, 2, 3, 456789, tzinfo=UTC)
    event = MailboxDeleteResult(uuid4(), uuid4(), "a@efbazaar.uz", True, False, None, observed)
    assert json.loads(to_json(event))["occurredAt"] == "2026-10-20T01:02:03.456789Z"
