"""A login-code retry must observe a new message without replaying the old one."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import fakeredis.aioredis
import pytest

from smart_admin_worker.handlers.imap_poll import ImapPollHandler
from smart_admin_worker.imap.detector import KonamiEmailDetector
from smart_admin_worker.imap.factory import _ImapConn
from smart_admin_worker.imap.poller import PollPurpose
from smart_admin_worker.imap.registry import ImapPollerRegistry
from smart_admin_worker.kafka.events import ImapPollRequest
from smart_admin_worker.redis.lock import RedisLockManager

BOX = "retry@efbazaar.uz"
NOW = datetime(2026, 9, 25, tzinfo=UTC)


def message(code, seconds=0, subject="[KONAMI ID] Verification Code"):
    return SimpleNamespace(
        from_="noreply@konami.com", subject=subject,
        text=f"Your verification code is {code}", date=NOW + timedelta(seconds=seconds),
    )


class SnapshotFactory:
    def __init__(self, messages):
        self.messages = messages
        self.polled = asyncio.Queue()
        self.loop = asyncio.get_running_loop()

    def open(self, *_args):
        return self

    def fetch(self):
        snapshot = list(self.messages)
        self.loop.call_soon_threadsafe(self.polled.put_nowait, snapshot)
        return snapshot

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        pass

    async def observed_twice(self, messages):
        # A second fetch proves the previous snapshot completed detection.
        async with asyncio.timeout(1):
            for _ in range(2):
                while await self.polled.get() != messages:
                    pass


def test_login_detector_chooses_latest_matching_message_regardless_of_fetch_order():
    detector = KonamiEmailDetector(frozenset({"noreply@konami.com"}))
    old, latest = message("111111"), message("222222", 10)
    unrelated = message("333333", 20, "[KONAMI ID] Update Email Address")

    assert detector.check_2fa([old, unrelated, latest]).code == "222222"
    assert detector.check_2fa([latest, old, unrelated]).code == "222222"


def test_login_detector_accepts_timezone_less_dates_and_ignores_undated_other_mail():
    detector = KonamiEmailDetector(frozenset({"noreply@konami.com"}))
    old, latest = message("111111"), message("222222", 10)
    old.date = old.date.replace(tzinfo=None)
    unrelated = message("333333", subject="Unrelated mail")
    unrelated.date = datetime(1900, 1, 1)  # imap-tools' fallback for a missing Date header

    assert detector.check_2fa([unrelated, old, latest]).code == "222222"
    assert detector.check_2fa([old]).received_at == NOW


def test_imap_fetch_limits_the_newest_messages_instead_of_the_oldest_fifty():
    mailbox = Mock()
    mailbox.fetch.return_value = []

    list(_ImapConn(mailbox).fetch())

    assert mailbox.fetch.call_args.kwargs == {
        "mark_seen": False, "limit": 50, "reverse": True,
    }


@pytest.mark.parametrize("purpose", ["WAIT_2FA_CODE", "WAIT_EMAIL_CHANGE_CODE"])
async def test_repeated_requests_keep_one_poller_and_deliver_only_fresh_codes(purpose):
    old, first, second = message("000000", -10), message("111111"), message("222222", 10)
    if purpose == "WAIT_EMAIL_CHANGE_CODE":
        for msg, code in ((old, "000000"), (first, "111111"), (second, "222222")):
            msg.subject = "[KONAMI ID] Update Email Address"
            msg.text = f"{code} is the verification code"
    factory = SnapshotFactory([first])
    redis = fakeredis.aioredis.FakeRedis()
    registry = ImapPollerRegistry(
        factory=factory,
        detector=KonamiEmailDetector(frozenset({"noreply@konami.com"})),
        lock=RedisLockManager(redis, ttl_seconds=6), poll_interval=0,
    )
    delivered = asyncio.Queue()
    producer = AsyncMock()
    producer.publish.side_effect = lambda _topic, _key, event: delivered.put_nowait(event)
    handler = ImapPollHandler(registry, producer, AsyncMock(return_value="password"))
    request = ImapPollRequest(trade_id=uuid4(), mailbox_email=BOX, purpose=purpose)
    try:
        await handler.handle(request)
        initial = await asyncio.wait_for(delivered.get(), 1)
        field = "code" if purpose == "WAIT_2FA_CODE" else "verification_code"
        assert getattr(initial, field) == "111111"

        await asyncio.gather(*(handler.handle(request) for _ in range(3)))
        factory.messages = [old, first, second]
        fresh = await asyncio.wait_for(delivered.get(), 1)
        assert getattr(fresh, field) == "222222"
        assert fresh.mailbox_email == BOX
        assert fresh.trade_id == request.trade_id

        # Unread messages remain visible, and an older one may become the
        # latest available after a user reads/deletes the delivered message.
        await factory.observed_twice([old, first, second])
        factory.messages = [old, first]
        await factory.observed_twice([old, first])
        assert delivered.empty()
        assert producer.publish.await_count == 2
        assert await registry.cancel_mailbox(BOX) == 1
    finally:
        await registry.cancel_all()
        await redis.aclose()


@pytest.mark.parametrize("purpose,subject,text", [
    (PollPurpose.VERIFY_LINK, "[KONAMI ID] Reissue Password", "https://id.konami.net/reset"),
])
async def test_reset_link_detection_remains_one_shot(purpose, subject, text):
    msg = message("111111", subject=subject)
    msg.text = text
    factory = SnapshotFactory([msg])
    redis = fakeredis.aioredis.FakeRedis()
    registry = ImapPollerRegistry(
        factory=factory, detector=KonamiEmailDetector(frozenset({"noreply@konami.com"})),
        lock=RedisLockManager(redis, ttl_seconds=6), poll_interval=0,
    )
    delivered = asyncio.Event()

    async def on_hit(_hit):
        delivered.set()

    try:
        registry.start(BOX, "password", purpose, on_hit, None, on_hit)
        await asyncio.wait_for(delivered.wait(), 1)
        await asyncio.wait_for(factory.polled.get(), 1)
        with pytest.raises(TimeoutError):
            await asyncio.wait_for(factory.polled.get(), 0.05)
        assert await registry.cancel_mailbox(BOX) == 1
    finally:
        await registry.cancel_all()
        await redis.aclose()


def test_email_change_detector_chooses_newest_code_and_normalizes_naive_dates():
    detector = KonamiEmailDetector(frozenset({"noreply@konami.com"}))
    old, new = message("111111"), message("222222", 10)
    for msg, code in ((old, "111111"), (new, "222222")):
        msg.subject = "[KONAMI ID] Update Email Address"
        msg.text = f"{code} is the verification code"
    old.date = old.date.replace(tzinfo=None)
    assert detector.check_email_change_verification([old, new]).verification_code == "222222"
    assert detector.check_email_change_verification([new, old]).verification_code == "222222"
    assert detector.check_email_change_verification([old]).received_at == NOW
