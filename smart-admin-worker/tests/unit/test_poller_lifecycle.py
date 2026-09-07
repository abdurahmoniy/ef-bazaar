"""Pollerlar savdo tugagach to'xtashi kerak.

Har savdo mailbox uchun cheksiz `while True` task ochadi va uni bugun
hech kim bekor qilmaydi: `ImapPollerRegistry.cancel` butun kod bazasida
faqat `cancel_all()` ichidan, ya'ni worker o'chayotganda chaqiriladi.

Natijasi ikkita. Savdo yopilgach parol rotate bo'ladi va o'sha mailbox
polleri eski parol bilan har 5 soniyada login qilishga urinib abadiy
qoladi. Ikkinchidan, ular yig'ilib boradi: har poller `asyncio.to_thread`
ishlatadi, u esa default executor'ning `min(32, CPU+4)` ta threadiga
tushadi — o'nlab o'lik poller yig'ilsa, tirik savdoning 2FA kodi navbatda
kutib qoladi.

Savdoning uchala tugash yo'li ham (SUCCESS, REJECTED, ORPHANED)
`TradeStateHandler.handOver` orqali mailbox-rotate-request chiqaradi, shu
sababli rotate — pollerni to'xtatish uchun to'liq va ishonchli signal.
"""

from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import uuid4

import fakeredis.aioredis
import pytest

from smart_admin_worker.crypto.field_encryptor import FieldEncryptor
from smart_admin_worker.handlers.imap_poll import ImapPollHandler
from smart_admin_worker.handlers.mailbox_delete import MailboxDeleteHandler
from smart_admin_worker.handlers.mailbox_rotate import MailboxRotateHandler
from smart_admin_worker.imap.detector import KonamiEmailDetector
from smart_admin_worker.imap.poller import PollPurpose
from smart_admin_worker.imap.registry import ImapPollerRegistry
from smart_admin_worker.kafka import events as e
from smart_admin_worker.redis.lock import RedisLockManager

BOX = "trade-9f3c1a20@efbazaar.uz"
OTHER_BOX = "trade-5b1e77c4@efbazaar.uz"


class _IdleFactory:
    """Never returns a message, so no poller ever detects and idles out."""

    def open(self, host, port, email, password):
        return self

    def fetch(self):
        return []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return None


@pytest.fixture
async def registry():
    r = fakeredis.aioredis.FakeRedis()
    yield ImapPollerRegistry(
        factory=_IdleFactory(),
        detector=KonamiEmailDetector(frozenset({"noreply@konami.com"})),
        lock=RedisLockManager(r, ttl_seconds=6),
        poll_interval=30,
    )
    await r.aclose()


def _start(registry, mailbox, purpose):
    return registry.start(
        mailbox, "pw", purpose=purpose,
        on_reset=AsyncMock(), on_2fa=AsyncMock(), on_email_change_code=AsyncMock(),
    )


async def test_cancelling_a_mailbox_stops_every_purpose_watching_it(registry):
    # A single trade can hold three pollers on one box — the reset link, the
    # 2FA code and the email-change code are separate purposes. Rotate knows
    # the mailbox, not which purposes happen to be live, so cancelling by
    # mailbox has to reach all of them.
    tasks = [
        _start(registry, BOX, PollPurpose.VERIFY_LINK),
        _start(registry, BOX, PollPurpose.WAIT_2FA_CODE),
        _start(registry, BOX, PollPurpose.WAIT_EMAIL_CHANGE_CODE),
    ]

    stopped = await registry.cancel_mailbox(BOX)

    assert stopped == 3
    assert all(t.done() for t in tasks)


async def test_cancelling_one_mailbox_leaves_another_trade_polling(registry):
    # Four users mid-trade share one worker. Closing one trade must not
    # silence the other three.
    mine = _start(registry, BOX, PollPurpose.WAIT_2FA_CODE)
    # A different purpose on purpose: with both boxes on the same one, a
    # cancel_mailbox that ignored the mailbox and swept the whole task table
    # still looked correct here, because every key it built happened to name
    # the mailbox it was asked about.
    theirs = _start(registry, OTHER_BOX, PollPurpose.VERIFY_LINK)

    stopped = await registry.cancel_mailbox(BOX)

    # The count is what a rotate reports: pollers collected for THIS box.
    assert stopped == 1
    assert mine.done()
    assert not theirs.done()
    await registry.cancel_mailbox(OTHER_BOX)


async def test_rotating_a_mailbox_stops_its_pollers_before_the_password_changes():
    # Order matters: a poll that lands between the rotate and the cancel logs
    # in with a password Mailcow has already replaced, which reads as a failed
    # login on the mail server.
    order: list[str] = []
    registry = AsyncMock()
    registry.cancel_mailbox.side_effect = lambda _: order.append("cancel")
    mailcow = AsyncMock()
    mailcow.rotate_password.side_effect = lambda *a, **k: order.append("rotate")
    mailbox_id = uuid4()

    await MailboxRotateHandler(
        mailcow=mailcow,
        encryptor=FieldEncryptor(b"\x00" * 32),
        producer=AsyncMock(),
        email_provider=AsyncMock(return_value=BOX),
        registry=registry,
    ).handle(e.MailboxRotateRequest(mailbox_id=mailbox_id))

    registry.cancel_mailbox.assert_awaited_once_with(BOX)
    assert order == ["cancel", "rotate"]


async def test_deleting_a_mailbox_stops_its_pollers():
    # The address stops existing; a poller left on it can only fail-login for
    # ever.
    registry = AsyncMock()

    await MailboxDeleteHandler(mailcow=AsyncMock(), registry=registry).handle(
        e.MailboxDeleteRequest(mailbox_id=uuid4(), mailbox_email=BOX)
    )

    registry.cancel_mailbox.assert_awaited_once_with(BOX)


async def test_a_poll_with_no_cached_password_is_refused_rather_than_started():
    # password_provider returns "" on a cache miss (worker restarted). Starting
    # a poller on that is the worst of both worlds: it can never log in, and it
    # retries every interval for ever. Raising instead puts it through the
    # consumer's retry + Telegram alert path, where somebody can see it.
    registry = AsyncMock()

    with pytest.raises(LookupError):
        await ImapPollHandler(
            registry=registry,
            producer=AsyncMock(),
            password_provider=AsyncMock(return_value=""),
        ).handle(
            e.ImapPollRequest(
                trade_id=uuid4(), mailbox_email=BOX,
                purpose=PollPurpose.WAIT_2FA_CODE.value,
            )
        )

    registry.start.assert_not_called()
