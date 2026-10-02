"""IMAP IDLE: bitta quti — bitta doimiy ulanish, kod kelishi bilan uzatiladi."""

from __future__ import annotations

import asyncio
import threading
from dataclasses import dataclass
from datetime import UTC, datetime

import fakeredis.aioredis
import pytest

from smart_admin_worker.imap.detector import KonamiEmailDetector
from smart_admin_worker.imap.poller import PollPurpose
from smart_admin_worker.imap.registry import ImapPollerRegistry
from smart_admin_worker.redis.lock import RedisLockManager

BOX = "trade-idle-1@efbazaar.uz"
OTHER_BOX = "trade-idle-2@efbazaar.uz"
KONAMI = "noreply@konami.com"


@dataclass
class Mail:
    uid: str
    code: str
    subject: str = "[KONAMI ID] Verification Code"
    from_: str = KONAMI
    seen: bool = False

    @property
    def text(self) -> str:
        return f"Your verification code is {self.code}"

    @property
    def date(self) -> datetime:
        return datetime(2026, 10, 2, 0, 0, int(self.uid), tzinfo=UTC)


class FakeServer:
    """Mailcow o'rnida: har quti uchun xatlar, IDLE'ni uyg'otadigan signal."""

    def __init__(self) -> None:
        self.boxes: dict[str, list[Mail]] = {}
        self.wakeups: dict[str, threading.Event] = {}
        self.idle_conns: dict[str, int] = {}
        self.drop_next_idle: dict[str, int] = {}
        self.lock = threading.Lock()

    def deliver(self, box: str, mail: Mail) -> None:
        with self.lock:
            self.boxes.setdefault(box, []).append(mail)
        self.wakeups.setdefault(box, threading.Event()).set()

    def open(self, host, port, email, password):
        return FakeConn(self, email)

    def active_idle(self, box: str) -> int:
        with self.lock:
            return self.idle_conns.get(box, 0)


class FakeConn:
    def __init__(self, server: FakeServer, box: str) -> None:
        self.server = server
        self.box = box
        self.interrupted = False
        self.idling = False

    def fetch(self):
        with self.server.lock:
            return [m for m in self.server.boxes.get(self.box, []) if not m.seen]

    def mark_seen(self, uids):
        with self.server.lock:
            for m in self.server.boxes.get(self.box, []):
                if m.uid in uids:
                    m.seen = True

    def wait_for_change(self, timeout):
        if not self.idling:
            self.idling = True
            with self.server.lock:
                self.server.idle_conns[self.box] = self.server.idle_conns.get(self.box, 0) + 1
        if self.server.drop_next_idle.get(self.box, 0) > 0:
            self.server.drop_next_idle[self.box] -= 1
            raise ConnectionResetError("server closed the connection")
        wake = self.server.wakeups.setdefault(self.box, threading.Event())
        wake.wait(timeout)
        wake.clear()
        if self.interrupted:
            raise OSError("interrupted")

    def interrupt(self):
        self.interrupted = True
        self.server.wakeups.setdefault(self.box, threading.Event()).set()

    def __enter__(self):
        return self

    def __exit__(self, *a):
        if self.idling:
            with self.server.lock:
                self.server.idle_conns[self.box] -= 1
        return None


@pytest.fixture
async def redis():
    r = fakeredis.aioredis.FakeRedis()
    yield r
    await r.aclose()


def _registry(server, redis, *, poll_interval=60.0, max_idle=10, lifetime=3600.0):
    return ImapPollerRegistry(
        factory=server,
        detector=KonamiEmailDetector(frozenset({KONAMI})),
        lock=RedisLockManager(redis, ttl_seconds=6),
        poll_interval=poll_interval,
        max_idle_connections=max_idle,
        idle_refresh_seconds=30,
        idle_max_lifetime_seconds=lifetime,
        idle_retry_delays=(0.01,),
    )


def _start_2fa(registry, box, delivered: asyncio.Queue):
    async def on_2fa(hit):
        delivered.put_nowait(hit.code)

    return registry.start(box, "pw", PollPurpose.WAIT_2FA_CODE, on_reset=None, on_2fa=on_2fa)


async def _until(predicate, timeout=1.0):
    async with asyncio.timeout(timeout):
        while not predicate():
            await asyncio.sleep(0.005)


async def test_code_is_delivered_as_soon_as_it_arrives_not_after_poll_interval(redis):
    # Polling oralig'i 60s: kod 1 soniyada kelsa, uni faqat IDLE olib kelgan.
    server = FakeServer()
    registry = _registry(server, redis)
    delivered: asyncio.Queue = asyncio.Queue()
    try:
        _start_2fa(registry, BOX, delivered)
        await _until(lambda: server.active_idle(BOX) == 1)

        server.deliver(BOX, Mail("1", "111111"))

        assert await asyncio.wait_for(delivered.get(), 1) == "111111"
        await _until(lambda: server.boxes[BOX][0].seen)
    finally:
        await registry.cancel_all()


async def test_code_that_arrived_before_the_step_started_is_delivered(redis):
    server = FakeServer()
    registry = _registry(server, redis)
    delivered: asyncio.Queue = asyncio.Queue()
    try:
        # Quti boshqa qadam uchun allaqachon kuzatilmoqda.
        registry.start(BOX, "pw", PollPurpose.VERIFY_LINK, on_reset=None, on_2fa=None)
        await _until(lambda: server.active_idle(BOX) == 1)
        server.deliver(BOX, Mail("1", "111111"))
        await asyncio.sleep(0.05)

        _start_2fa(registry, BOX, delivered)

        assert await asyncio.wait_for(delivered.get(), 1) == "111111"
    finally:
        await registry.cancel_all()


async def test_all_steps_of_one_mailbox_share_one_idle_connection(redis):
    server = FakeServer()
    registry = _registry(server, redis)
    try:
        for purpose in PollPurpose:
            registry.start(BOX, "pw", purpose, None, None, None)
        await _until(lambda: server.active_idle(BOX) == 1)
        await asyncio.sleep(0.05)

        assert server.active_idle(BOX) == 1
        assert registry.idle_mailboxes() == {BOX}
    finally:
        await registry.cancel_all()


async def test_many_trades_are_served_in_parallel(redis):
    server = FakeServer()
    registry = _registry(server, redis, max_idle=50)
    boxes = [f"trade-{i}@efbazaar.uz" for i in range(30)]
    delivered: asyncio.Queue = asyncio.Queue()
    try:
        for box in boxes:
            _start_2fa(registry, box, delivered)
        await _until(lambda: all(server.active_idle(b) == 1 for b in boxes))

        for i, box in enumerate(boxes):
            server.deliver(box, Mail("1", f"{i:06d}"))

        async with asyncio.timeout(1):
            codes = {await delivered.get() for _ in boxes}
        assert codes == {f"{i:06d}" for i in range(30)}
    finally:
        await registry.cancel_all()


async def test_mailboxes_over_the_cap_fall_back_to_polling(redis):
    server = FakeServer()
    registry = _registry(server, redis, poll_interval=0.01, max_idle=1)
    delivered: asyncio.Queue = asyncio.Queue()
    try:
        _start_2fa(registry, BOX, delivered)
        _start_2fa(registry, OTHER_BOX, delivered)
        await _until(lambda: server.active_idle(BOX) == 1)

        assert registry.idle_mailboxes() == {BOX}
        server.deliver(OTHER_BOX, Mail("1", "222222"))
        assert await asyncio.wait_for(delivered.get(), 1) == "222222"
        assert server.active_idle(OTHER_BOX) == 0
    finally:
        await registry.cancel_all()


async def test_cancelling_the_mailbox_closes_its_idle_connection(redis):
    server = FakeServer()
    registry = _registry(server, redis)
    _start_2fa(registry, BOX, asyncio.Queue())
    await _until(lambda: server.active_idle(BOX) == 1)

    assert await registry.cancel_mailbox(BOX) == 1

    await _until(lambda: server.active_idle(BOX) == 0)
    assert registry.idle_mailboxes() == set()


async def test_dropped_connection_reconnects_and_still_delivers(redis):
    server = FakeServer()
    server.drop_next_idle[BOX] = 2
    registry = _registry(server, redis)
    delivered: asyncio.Queue = asyncio.Queue()
    try:
        _start_2fa(registry, BOX, delivered)
        await _until(lambda: server.drop_next_idle[BOX] == 0)

        server.deliver(BOX, Mail("1", "333333"))

        assert await asyncio.wait_for(delivered.get(), 1) == "333333"
    finally:
        await registry.cancel_all()


async def test_connection_is_closed_after_max_lifetime(redis):
    # Savdo osilib qolsa va rotate xabari yo'qolsa ham ulanish abadiy qolmaydi.
    server = FakeServer()
    registry = _registry(server, redis, lifetime=0.1)
    task = _start_2fa(registry, BOX, asyncio.Queue())

    await asyncio.wait_for(task, 1)

    await _until(lambda: server.active_idle(BOX) == 0)
    assert registry.idle_mailboxes() == set()


async def test_failed_delivery_is_retried_without_waiting_for_new_mail(redis):
    server = FakeServer()
    registry = _registry(server, redis, poll_interval=0.02)
    attempts: list[str] = []

    async def on_2fa(hit):
        attempts.append(hit.code)
        if len(attempts) == 1:
            raise RuntimeError("kafka down")

    try:
        registry.start(BOX, "pw", PollPurpose.WAIT_2FA_CODE, on_reset=None, on_2fa=on_2fa)
        await _until(lambda: server.active_idle(BOX) == 1)
        server.deliver(BOX, Mail("1", "444444"))

        await _until(lambda: len(attempts) == 2)
        await _until(lambda: server.boxes[BOX][0].seen)
    finally:
        await registry.cancel_all()
