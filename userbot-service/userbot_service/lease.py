"""Exactly one runner may run an account at a time.

Telegram revokes an auth key it sees used from two places at once
(AUTH_KEY_DUPLICATED), so a client is started only after its lease row is ours
and stopped before the lease could expire (see Supervisor)."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

_ACQUIRE = text("""
    INSERT INTO userbot_leases (account_id, runner, lease_until, last_heartbeat)
    VALUES (:id, :runner, now() + make_interval(secs => :ttl), to_timestamp(0))
    ON CONFLICT (account_id) DO UPDATE
        SET runner = EXCLUDED.runner, lease_until = EXCLUDED.lease_until
        WHERE userbot_leases.lease_until < now() OR userbot_leases.runner = EXCLUDED.runner
    RETURNING account_id
""")

_RENEW = text("""
    UPDATE userbot_leases
       SET lease_until = now() + make_interval(secs => :ttl),
           last_heartbeat = CASE WHEN account_id = ANY(:alive) THEN now() ELSE last_heartbeat END
     WHERE runner = :runner AND account_id = ANY(:held)
    RETURNING account_id
""")


class LeaseStore:
    def __init__(self, engine: AsyncEngine, runner: str, ttl_seconds: int = 30) -> None:
        self._engine = engine
        self.runner = runner
        self._ttl = ttl_seconds

    async def acquire(self, account_id: UUID) -> bool:
        async with self._engine.begin() as conn:
            row = (await conn.execute(
                _ACQUIRE, {"id": account_id, "runner": self.runner, "ttl": self._ttl})).first()
        return row is not None

    async def renew(self, held: Iterable[UUID], alive: set[UUID]) -> set[UUID]:
        held = list(held)
        if not held:
            return set()
        async with self._engine.begin() as conn:
            rows = await conn.execute(_RENEW, {
                "ttl": self._ttl, "runner": self.runner, "held": held, "alive": list(alive)})
        return set(rows.scalars())

    async def release(self, account_id: UUID) -> None:
        async with self._engine.begin() as conn:
            await conn.execute(
                text("DELETE FROM userbot_leases WHERE account_id = :id AND runner = :runner"),
                {"id": account_id, "runner": self.runner})

    async def liveness(self) -> dict[UUID, tuple[str, datetime]]:
        async with self._engine.connect() as conn:
            rows = await conn.execute(
                text("SELECT account_id, runner, last_heartbeat FROM userbot_leases"))
        return {r.account_id: (r.runner, r.last_heartbeat) for r in rows}
