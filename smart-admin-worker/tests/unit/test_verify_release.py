from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from smart_admin_worker.handlers.imap_poll import ImapPollHandler
from smart_admin_worker.kafka import events as e


@pytest.mark.parametrize("authenticated", [False, True])
async def test_release_result_requires_crypto_proof_and_binds_nonce_mailbox_and_time(authenticated):
    now = datetime.now(UTC)
    nonce = uuid4()
    event = e.ImapPollRequest(
        nonce,
        "owned@efbazaar.uz",
        "VERIFY_RELEASE",
        started_at=now - timedelta(seconds=2),
        expires_at=now + timedelta(minutes=10),
    )
    registry, producer, origin = MagicMock(), AsyncMock(), AsyncMock(return_value=authenticated)
    handler = ImapPollHandler(
        registry, producer, AsyncMock(return_value="pw"), origin_verifier=origin
    )
    await handler.handle(event)
    callback = registry.start.call_args.kwargs["on_release"]
    assert registry.start.call_args.kwargs["on_reset"] is None
    raw = b"original RFC822 octets\r\n"
    hit = SimpleNamespace(
        sender="konami-info@konami.net",
        received_at=now,
        reset_link_present=False,
        email_not_registered=True,
        raw_message=raw,
    )
    accepted = await callback(hit)
    origin.assert_awaited_once_with(raw, event.mailbox_email, event.started_at, event.expires_at)
    assert accepted is authenticated
    if authenticated:
        result = producer.publish.await_args.args[2]
        assert result.origin_verified is True
        assert result.trade_id == nonce and result.mailbox_email == event.mailbox_email
        assert result.email_not_registered and not result.reset_link_present
    else:
        result = producer.publish.await_args.args[2]
        assert result.origin_verified is False
        assert result.email_not_registered is False
        assert result.trade_id == nonce and result.mailbox_email == event.mailbox_email


@pytest.mark.parametrize("raw", [None, b""])
async def test_release_without_original_wire_octets_never_uses_reserialized_message(raw):
    now = datetime.now(UTC)
    origin, registry, producer = AsyncMock(return_value=True), MagicMock(), AsyncMock()
    handler = ImapPollHandler(
        registry, producer, AsyncMock(return_value="pw"), origin_verifier=origin
    )
    event = e.ImapPollRequest(
        uuid4(),
        "owned@efbazaar.uz",
        "VERIFY_RELEASE",
        started_at=now - timedelta(seconds=1),
        expires_at=now + timedelta(minutes=10),
    )
    await handler.handle(event)
    hit = SimpleNamespace(
        sender="konami-info@konami.net",
        received_at=now,
        reset_link_present=False,
        email_not_registered=True,
        raw_message=raw,
    )
    assert await registry.start.call_args.kwargs["on_release"](hit) is False
    assert producer.publish.await_args.args[2].origin_verified is False
    origin.assert_not_awaited()


async def test_release_missing_time_bounds_is_rejected_before_poller_start():
    registry = MagicMock()
    handler = ImapPollHandler(registry, AsyncMock(), AsyncMock(return_value="pw"))
    with pytest.raises(ValueError, match="bounds"):
        await handler.handle(e.ImapPollRequest(uuid4(), "owned@efbazaar.uz", "VERIFY_RELEASE"))
    registry.start.assert_not_called()


def test_request_bounds_decode_to_aware_datetimes_and_legacy_remains_optional():
    request = e.from_json(
        "efbazaar.trade.imap-poll-request",
        json.dumps(
            {
                "tradeId": str(uuid4()),
                "mailboxEmail": "owned@efbazaar.uz",
                "purpose": "VERIFY_RELEASE",
                "startedAt": "2026-10-20T00:00:01Z",
                "expiresAt": "2026-10-20T00:10:01Z",
            }
        ).encode(),
    )
    assert request.started_at == datetime(2026, 10, 20, 0, 0, 1, tzinfo=UTC)
    assert request.expires_at == datetime(2026, 10, 20, 0, 10, 1, tzinfo=UTC)


def test_original_rfc822_octets_survive_imap_message_parsing_unchanged():
    from smart_admin_worker.imap.factory import RawMailMessage

    raw = (
        b"From: konami-info@konami.net\r\nTo: owned@efbazaar.uz\r\n"
        b"Subject: [KONAMI ID] Reissue Password\r\nX-Folded: first\r\n second\r\n\r\n"
        b"This address is not registered to a KONAMI ID.\r\n"
    )
    message = RawMailMessage.from_bytes(raw)
    assert message.raw_message == raw
    assert message.raw_message != message.obj.as_bytes()


async def test_release_poller_skips_spoofed_newest_candidate_and_marks_only_verified_message():
    import asyncio

    import fakeredis.aioredis

    from smart_admin_worker.imap.detector import KonamiEmailDetector
    from smart_admin_worker.imap.poller import ImapPoller, PollPurpose
    from smart_admin_worker.redis.lock import RedisLockManager

    marks = []
    messages = [
        SimpleNamespace(
            uid=str(index),
            from_="noreply@konami.net",
            subject="[KONAMI ID] Reissue Password",
            text="Not registered to a KONAMI ID",
            date=datetime.now(UTC),
            raw_message=raw,
        )
        for index, raw in [("1", b"spoof"), ("2", b"signed")]
    ]

    class Connection:
        def fetch(self):
            return messages

        def mark_seen(self, uids):
            marks.extend(uids)

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

    class Factory:
        def open(self, *args):
            return Connection()

    observed = []

    async def authenticate(hit):
        observed.append(hit.raw_message)
        return hit.raw_message == b"signed"

    redis = fakeredis.aioredis.FakeRedis()
    poller = ImapPoller(
        Factory(),
        KonamiEmailDetector(frozenset({"noreply@konami.net"})),
        RedisLockManager(redis, 6),
        0.01,
        None,
        None,
        on_release=authenticate,
    )
    task = asyncio.create_task(poller.run("owned@efbazaar.uz", "pw", PollPurpose.VERIFY_RELEASE))
    try:
        async with asyncio.timeout(1):
            while not marks:
                await asyncio.sleep(0)
        assert observed == [b"spoof", b"signed"]
        assert marks == ["2"]
    finally:
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        await redis.aclose()


async def test_release_registry_expires_and_closes_its_idle_connection():
    import asyncio

    import fakeredis.aioredis

    from smart_admin_worker.imap.detector import KonamiEmailDetector
    from smart_admin_worker.imap.poller import PollPurpose
    from smart_admin_worker.imap.registry import ImapPollerRegistry
    from smart_admin_worker.redis.lock import RedisLockManager
    from tests.unit.test_imap_idle import FakeServer

    server = FakeServer()
    redis = fakeredis.aioredis.FakeRedis()
    registry = ImapPollerRegistry(
        server,
        KonamiEmailDetector(frozenset()),
        RedisLockManager(redis, 6),
        0.01,
        max_idle_connections=1,
    )
    task = registry.start(
        "owned@efbazaar.uz",
        "pw",
        PollPurpose.VERIFY_RELEASE,
        None,
        None,
        on_release=AsyncMock(return_value=False),
        expires_at=datetime.now(UTC) + timedelta(seconds=0.05),
    )
    try:
        await asyncio.wait_for(task, 1)
        assert registry.idle_mailboxes() == set()
        async with asyncio.timeout(1):
            while server.active_idle("owned@efbazaar.uz"):
                await asyncio.sleep(0)
    finally:
        await registry.cancel_all()
        await redis.aclose()


async def test_original_signed_message_reaches_release_callback_without_reencoding():
    import base64
    from email.utils import format_datetime

    import dkim
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    from smart_admin_worker.imap.detector import KonamiEmailDetector
    from smart_admin_worker.imap.factory import RawMailMessage
    from smart_admin_worker.imap.release_auth import ReleaseOriginVerifier

    now = datetime.now(UTC).replace(microsecond=0)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    )
    public = key.public_key().public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    dns = b"v=DKIM1; k=rsa; p=" + base64.b64encode(public)
    raw = (
        f"From: noreply@konami.net\r\nTo: owned@efbazaar.uz\r\n"
        f"Date: {format_datetime(now)}\r\nSubject: [KONAMI ID] Reissue Password\r\n"
        "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n"
        "This email is not registered to a KONAMI ID.\r\n"
    ).encode()
    raw = (
        dkim.sign(
            raw,
            b"release",
            b"konami.net",
            private,
            include_headers=[b"from", b"to", b"date", b"subject", b"mime-version", b"content-type"],
        )
        + raw
    )
    verifier = ReleaseOriginVerifier(dnsfunc=lambda *args, **kwargs: dns)

    async def origin(*args):
        return await verifier.verify(*args, now=now)

    producer, registry = AsyncMock(), MagicMock()
    handler = ImapPollHandler(
        registry, producer, AsyncMock(return_value="pw"), origin_verifier=origin
    )
    event = e.ImapPollRequest(
        uuid4(),
        "owned@efbazaar.uz",
        "VERIFY_RELEASE",
        started_at=now - timedelta(seconds=2),
        expires_at=now + timedelta(minutes=10),
    )
    await handler.handle(event)
    hit = KonamiEmailDetector(frozenset({"noreply@konami.net"})).check_release(
        [RawMailMessage.from_bytes(raw)]
    )
    assert hit.raw_message == raw
    assert await registry.start.call_args.kwargs["on_release"](hit) is True
    result = producer.publish.await_args.args[2]
    assert result.origin_verified and result.email_not_registered
    assert result.trade_id == event.trade_id and result.mailbox_email == event.mailbox_email
