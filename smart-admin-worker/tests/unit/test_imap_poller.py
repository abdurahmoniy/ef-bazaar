"""ImapPoller + Registry — fake IMAP connection, fakeredis lock."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import fakeredis.aioredis
import pytest

from smart_admin_worker.imap.detector import KonamiEmailDetector, ResetHit
from smart_admin_worker.imap.poller import ImapPoller, PollPurpose
from smart_admin_worker.imap.registry import ImapPollerRegistry
from smart_admin_worker.redis.lock import RedisLockManager


@dataclass
class FakeMsg:
    from_: str = ""
    subject: str = ""
    text: str = ""
    date: datetime = datetime(2026, 7, 15, tzinfo=UTC)


class FakeConn:
    def __init__(self, msgs_per_call: list[list[FakeMsg]]):
        self._msgs = msgs_per_call
        self._idx = 0
        self.closed = False

    def fetch(self, *args, **kwargs):
        if self._idx >= len(self._msgs):
            return []
        out = self._msgs[self._idx]
        self._idx += 1
        return out

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.closed = True


class FakeFactory:
    def __init__(self, msgs_per_call):
        self._msgs = msgs_per_call
        self.opened = 0

    def open(self, host, port, email, password):
        self.opened += 1
        return FakeConn(list(self._msgs))


@pytest.fixture
async def redis_lock():
    r = fakeredis.aioredis.FakeRedis()
    yield RedisLockManager(r, ttl_seconds=6)
    await r.aclose()


async def test_poller_detects_reset_and_stops(redis_lock):
    factory = FakeFactory([[FakeMsg(
        from_="noreply@konami.com",
        subject="[KONAMI ID] Reissue Password",
        text="https://id.konami.net/reset?token=1",
    )]])
    detector = KonamiEmailDetector(frozenset({"noreply@konami.com"}))
    hits = []

    async def on_reset(hit: ResetHit):
        hits.append(hit)

    poller = ImapPoller(
        factory=factory,
        detector=detector,
        lock=redis_lock,
        poll_interval=0.01,
        on_reset=on_reset,
        on_2fa=None,
    )
    task = asyncio.create_task(
        poller.run("trade-abc@efbazaar.uz", "pw", purpose=PollPurpose.VERIFY_LINK)
    )
    await asyncio.sleep(0.1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert len(hits) == 1
    assert hits[0].reset_link_present is True


async def test_poller_skips_iteration_when_lock_held(redis_lock):
    # Manually hold the lock so the poller's try_acquire fails.
    await redis_lock.try_acquire("smartadmin:imap-poll:trade-abc@efbazaar.uz")

    factory = FakeFactory([[FakeMsg(
        from_="noreply@konami.com",
        subject="[KONAMI ID] Reissue Password",
        text="https://id.konami.net/reset",
    )]])
    detector = KonamiEmailDetector(frozenset({"noreply@konami.com"}))
    hits = []

    async def on_reset(hit): hits.append(hit)

    poller = ImapPoller(
        factory=factory, detector=detector, lock=redis_lock,
        poll_interval=0.02, on_reset=on_reset, on_2fa=None,
    )
    task = asyncio.create_task(
        poller.run("trade-abc@efbazaar.uz", "pw", purpose=PollPurpose.VERIFY_LINK)
    )
    await asyncio.sleep(0.05)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

    assert hits == []
    assert factory.opened == 0


async def test_registry_start_and_cancel(redis_lock):
    factory = FakeFactory([[]])
    detector = KonamiEmailDetector(frozenset({"noreply@konami.com"}))
    registry = ImapPollerRegistry(
        factory=factory, detector=detector, lock=redis_lock, poll_interval=0.05,
    )

    on_hit = AsyncMock()
    registry.start(
        "trade-abc@efbazaar.uz", "pw",
        purpose=PollPurpose.VERIFY_LINK,
        on_reset=on_hit, on_2fa=None,
    )
    # Registry rejects duplicate start for same (mailbox, purpose):
    with pytest.raises(ValueError):
        registry.start(
            "trade-abc@efbazaar.uz", "pw",
            purpose=PollPurpose.VERIFY_LINK,
            on_reset=on_hit, on_2fa=None,
        )

    await registry.cancel("trade-abc@efbazaar.uz", PollPurpose.VERIFY_LINK)
    # After cancel, we can re-start.
    registry.start(
        "trade-abc@efbazaar.uz", "pw",
        purpose=PollPurpose.VERIFY_LINK,
        on_reset=on_hit, on_2fa=None,
    )
    await registry.cancel("trade-abc@efbazaar.uz", PollPurpose.VERIFY_LINK)


# --- Kod topshirilgach xat SEEN qilinadi -----------------------------------

KONAMI = "noreply@konami.com"
LOGIN_SUBJECT = "[KONAMI ID] Verification Code"
EMAIL_SUBJECT = "[KONAMI ID] Update Email Address"


@dataclass
class BoxMsg:
    uid: str
    subject: str
    text: str
    date: datetime
    from_: str = KONAMI
    seen: bool = False


class SeenAwareMailbox:
    """IMAP qutisi: faqat UNSEEN qaytaradi, mark_seen bayroqni haqiqatan qo'yadi."""

    def __init__(self, msgs: list[BoxMsg]):
        self.msgs = msgs
        self.marked: list[list[str]] = []
        self.events: list[str] = []

    def open(self, host, port, email, password):
        return self

    def fetch(self):
        return [m for m in self.msgs if not m.seen]

    def mark_seen(self, uids):
        uids = list(uids)
        self.events.append("mark_seen")
        self.marked.append(uids)
        for m in self.msgs:
            if m.uid in uids:
                m.seen = True

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return None


def _login(uid, code, seconds=0):
    return BoxMsg(uid, LOGIN_SUBJECT, f"Your verification code is {code}",
                  datetime(2026, 10, 2, tzinfo=UTC).replace(second=seconds))


async def _run_until(poller, purpose, predicate, box="trade-abc@efbazaar.uz"):
    task = asyncio.create_task(poller.run(box, "pw", purpose))
    try:
        async with asyncio.timeout(1):
            while not predicate():
                await asyncio.sleep(0.005)
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


def _poller(mailbox, redis_lock, **callbacks):
    kw = {"on_reset": None, "on_2fa": None, **callbacks}
    return ImapPoller(
        factory=mailbox, detector=KonamiEmailDetector(frozenset({KONAMI})),
        lock=redis_lock, poll_interval=0.005, **kw,
    )


async def test_delivered_login_code_and_older_same_step_codes_are_marked_seen(redis_lock):
    other_step = BoxMsg("9", EMAIL_SUBJECT, "555555 is the verification code",
                        datetime(2026, 10, 2, 0, 0, 30, tzinfo=UTC))
    mailbox = SeenAwareMailbox([_login("1", "111111"), _login("2", "222222", 10), other_step])
    hits = []

    async def on_2fa(hit):
        mailbox.events.append("delivered")
        hits.append(hit)

    poller = _poller(mailbox, redis_lock, on_2fa=on_2fa)
    await _run_until(poller, PollPurpose.WAIT_2FA_CODE, lambda: mailbox.marked)

    assert [h.code for h in hits] == ["222222"]
    assert sorted(mailbox.marked[0]) == ["1", "2"]
    # Boshqa qadamning xati o'qilmagan bo'lib qoladi.
    assert other_step.seen is False
    # Avval userga topshiriladi, keyin SEEN.
    assert mailbox.events[:2] == ["delivered", "mark_seen"]


async def test_resend_after_restart_delivers_only_the_new_code(redis_lock):
    mailbox = SeenAwareMailbox([_login("1", "111111")])
    hits = []

    async def on_2fa(hit):
        hits.append(hit.code)

    first = _poller(mailbox, redis_lock, on_2fa=on_2fa)
    await _run_until(first, PollPurpose.WAIT_2FA_CODE, lambda: mailbox.marked)

    # Worker qayta ishga tushdi (xotiradagi holat yo'q), user "qayta jo'natish" bosdi.
    mailbox.msgs.append(_login("2", "222222", 10))
    second = _poller(mailbox, redis_lock, on_2fa=on_2fa)
    await _run_until(second, PollPurpose.WAIT_2FA_CODE, lambda: len(mailbox.marked) == 2)

    assert hits == ["111111", "222222"]


async def test_failed_delivery_leaves_message_unseen_and_retries(redis_lock):
    mailbox = SeenAwareMailbox([_login("1", "111111")])
    attempts = []

    async def on_2fa(hit):
        attempts.append(hit.code)
        if len(attempts) == 1:
            raise RuntimeError("kafka down")

    poller = _poller(mailbox, redis_lock, on_2fa=on_2fa)
    await _run_until(poller, PollPurpose.WAIT_2FA_CODE, lambda: mailbox.marked)

    assert attempts == ["111111", "111111"]
    assert mailbox.marked == [["1"]]


async def test_email_change_poller_does_not_consume_login_code(redis_lock):
    login = _login("1", "111111")
    email_code = BoxMsg("2", EMAIL_SUBJECT, "222222 is the verification code",
                        datetime(2026, 10, 2, tzinfo=UTC))
    mailbox = SeenAwareMailbox([login, email_code])
    hits = []

    async def on_email(hit):
        hits.append(hit.verification_code)

    poller = _poller(mailbox, redis_lock, on_email_change_code=on_email)
    await _run_until(poller, PollPurpose.WAIT_EMAIL_CHANGE_CODE, lambda: mailbox.marked)

    assert hits == ["222222"]
    assert mailbox.marked == [["2"]]
    assert login.seen is False


async def test_reset_link_message_is_marked_seen_after_delivery(redis_lock):
    reset = BoxMsg("7", "[KONAMI ID] Reissue Password", "https://id.konami.net/reset",
                   datetime(2026, 10, 2, tzinfo=UTC))
    mailbox = SeenAwareMailbox([reset])
    hits = []

    async def on_reset(hit):
        hits.append(hit)

    poller = _poller(mailbox, redis_lock, on_reset=on_reset)
    await _run_until(poller, PollPurpose.VERIFY_LINK, lambda: mailbox.marked)

    assert len(hits) == 1
    assert mailbox.marked == [["7"]]


async def test_not_registered_reply_keeps_the_poller_watching_for_the_real_link(redis_lock):
    """Pochta Konami ID ga ulanmagan bo'lsa Konami xuddi shu sarlavha bilan
    rad javobini yuboradi. Sotuvchi emailni o'tkazib, tiklashni qayta
    so'raganda keladigan haqiqiy havola ham ushlanishi kerak — avval poller
    birinchi xatdan keyin jim turib qolardi."""
    refused = BoxMsg("7", "[KONAMI ID] Reissue Password",
                     "This email address is not registered to a KONAMI ID.\n"
                     "https://my.konami.net/",
                     datetime(2026, 10, 2, tzinfo=UTC))
    mailbox = SeenAwareMailbox([refused])
    hits = []

    async def on_reset(hit):
        hits.append(hit)

    poller = _poller(mailbox, redis_lock, on_reset=on_reset)

    def deliver_real_link_after_refusal():
        if mailbox.marked == [["7"]] and len(mailbox.msgs) == 1:
            mailbox.msgs.append(BoxMsg(
                "8", "[KONAMI ID] Reissue Password",
                "https://my.konami.net/en/password-reminder/register-password?put=x",
                datetime(2026, 10, 2, 0, 5, tzinfo=UTC)))
        return len(hits) == 2

    await _run_until(poller, PollPurpose.VERIFY_LINK, deliver_real_link_after_refusal)

    assert [(h.reset_link_present, h.email_not_registered) for h in hits] == [
        (False, True), (True, False)]
    assert mailbox.marked == [["7"], ["8"]]


def test_imap_conn_mark_seen_sets_seen_flag_by_uid():
    from unittest.mock import Mock

    from imap_tools import MailMessageFlags

    from smart_admin_worker.imap.factory import _ImapConn

    mailbox = Mock()
    _ImapConn(mailbox).mark_seen(["3", "5"])

    mailbox.flag.assert_called_once_with(["3", "5"], MailMessageFlags.SEEN, True)


def test_imap_conn_idle_wait_and_interrupt_use_the_live_socket():
    import socket
    from unittest.mock import Mock

    from smart_admin_worker.imap.factory import _ImapConn

    mailbox = Mock()
    conn = _ImapConn(mailbox)

    conn.wait_for_change(300)
    conn.interrupt()

    mailbox.idle.wait.assert_called_once_with(timeout=300)
    mailbox.client.sock.shutdown.assert_called_once_with(socket.SHUT_RDWR)


def test_connections_have_a_socket_timeout_so_a_half_open_link_cannot_hang(monkeypatch):
    from unittest.mock import MagicMock

    from smart_admin_worker.imap import factory as factory_module

    mailbox_cls = MagicMock()
    monkeypatch.setattr(factory_module, "MailBox", mailbox_cls)

    factory_module.ImapToolsConnectionFactory().open("mail", 993, "a@b", "pw")

    assert mailbox_cls.call_args.kwargs["timeout"] == factory_module.SOCKET_TIMEOUT_SECONDS
    assert factory_module.SOCKET_TIMEOUT_SECONDS > 0
