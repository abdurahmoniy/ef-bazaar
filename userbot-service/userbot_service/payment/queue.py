"""Write-ahead queue for observations, per account.

An observation is in this table before anything tries to publish it, and
leaves only after Kafka acknowledged it, so neither a Kafka outage nor a
restart can lose money the card received."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


@dataclass(frozen=True)
class Pending:
    message_id: int
    topic: str
    payload: dict[str, Any]


class PendingQueue:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def last_message_id(self, account_id: UUID) -> int | None:
        async with self._engine.connect() as conn:
            return (await conn.execute(
                text("SELECT last_message_id FROM humo_watch_state WHERE account_id = :a"),
                {"a": account_id})).scalar_one_or_none()

    async def init_state(self, account_id: UUID, last_id: int) -> None:
        async with self._engine.begin() as conn:
            await conn.execute(text(
                "INSERT INTO humo_watch_state (account_id, last_message_id) VALUES (:a, :m)"
                " ON CONFLICT (account_id) DO NOTHING"), {"a": account_id, "m": last_id})

    async def record(self, account_id: UUID, message_id: int,
                     item: tuple[str, dict[str, Any]] | None) -> None:
        async with self._engine.begin() as conn:
            if item is not None:
                await conn.execute(text(
                    "INSERT INTO humo_pending (account_id, message_id, topic, payload)"
                    " VALUES (:a, :m, :t, CAST(:p AS JSONB)) ON CONFLICT DO NOTHING"),
                    {"a": account_id, "m": message_id, "t": item[0],
                     "p": json.dumps(item[1])})
            await conn.execute(text(
                "INSERT INTO humo_watch_state (account_id, last_message_id) VALUES (:a, :m)"
                " ON CONFLICT (account_id) DO UPDATE"
                " SET last_message_id = GREATEST("
                "humo_watch_state.last_message_id, EXCLUDED.last_message_id)"),
                {"a": account_id, "m": message_id})

    async def pending(self, account_id: UUID) -> list[Pending]:
        async with self._engine.connect() as conn:
            rows = await conn.execute(text(
                "SELECT message_id, topic, payload FROM humo_pending WHERE account_id = :a"
                " ORDER BY message_id"), {"a": account_id})
            return [Pending(r.message_id, r.topic, r.payload) for r in rows]

    async def done(self, account_id: UUID, message_id: int) -> None:
        async with self._engine.begin() as conn:
            await conn.execute(text(
                "DELETE FROM humo_pending WHERE account_id = :a AND message_id = :m"),
                {"a": account_id, "m": message_id})

    async def oldest_age_seconds(self, account_id: UUID) -> float | None:
        async with self._engine.connect() as conn:
            return (await conn.execute(text(
                "SELECT EXTRACT(EPOCH FROM now() - min(created_at)) FROM humo_pending"
                " WHERE account_id = :a"), {"a": account_id})).scalar_one_or_none()
