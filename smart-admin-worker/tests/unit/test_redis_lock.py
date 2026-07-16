"""RedisLockManager — fakeredis-based tests."""

from __future__ import annotations

import fakeredis.aioredis
import pytest

from smart_admin_worker.redis.lock import RedisLockManager


@pytest.fixture
async def redis_client():
    r = fakeredis.aioredis.FakeRedis()
    yield r
    await r.aclose()


@pytest.fixture
def lock(redis_client):
    return RedisLockManager(redis_client, ttl_seconds=6)


async def test_first_acquire_succeeds(lock):
    assert await lock.try_acquire("smartadmin:imap-poll:a@x") is True


async def test_second_acquire_before_release_fails(lock):
    assert await lock.try_acquire("smartadmin:imap-poll:a@x") is True
    assert await lock.try_acquire("smartadmin:imap-poll:a@x") is False


async def test_acquire_after_release_succeeds(lock):
    assert await lock.try_acquire("k") is True
    await lock.release("k")
    assert await lock.try_acquire("k") is True


async def test_acquire_expires_after_ttl(redis_client):
    # Short TTL so the test finishes quickly.
    m = RedisLockManager(redis_client, ttl_seconds=1)
    assert await m.try_acquire("k") is True

    # fakeredis honours PX expiry; sleep past it.
    import asyncio
    await asyncio.sleep(1.1)

    assert await m.try_acquire("k") is True
