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
