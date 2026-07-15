"""Per-key SET NX PX lock, used to serialize IMAP polling across worker replicas.

Not a re-entrant lock. Not a fencing token. Just: `SET key value NX PX ttl`.
If two workers race, only one gets True; the other skips this iteration.
"""

from __future__ import annotations

from typing import Protocol


class _AsyncRedis(Protocol):
    async def set(self, name: str, value: str, *, nx: bool, px: int) -> bool | None: ...
    async def delete(self, *keys: str) -> int: ...


class RedisLockManager:
    def __init__(self, redis: _AsyncRedis, ttl_seconds: int) -> None:
        self._redis = redis
        self._ttl_ms = ttl_seconds * 1000

    async def try_acquire(self, key: str) -> bool:
        result = await self._redis.set(key, "1", nx=True, px=self._ttl_ms)
        return bool(result)

    async def release(self, key: str) -> None:
        await self._redis.delete(key)
