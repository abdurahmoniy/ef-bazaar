"""Accounts, feature bindings and their audit trail."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import insert, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncEngine

from userbot_service.crypto import SessionCipher
from userbot_service.db.schema import accounts, audit, bindings
from userbot_service.errors import ApiError
from userbot_service.features import FEATURES
from userbot_service.phone import mask_phone
from userbot_service.telegram.ports import Me


@dataclass(frozen=True)
class Account:
    id: UUID
    telegram_user_id: int
    first_name: str
    last_name: str | None
    username: str | None
    phone_masked: str
    status: str
    status_reason: str | None
    source: str
    connected_by: UUID | None
    connected_at: datetime


_COLUMNS = [
    accounts.c.id, accounts.c.telegram_user_id, accounts.c.first_name, accounts.c.last_name,
    accounts.c.username, accounts.c.phone_masked, accounts.c.status, accounts.c.status_reason,
    accounts.c.source, accounts.c.connected_by, accounts.c.connected_at,
]


def _now() -> datetime:
    return datetime.now(UTC)


class AccountRepository:
    def __init__(self, engine: AsyncEngine, cipher: SessionCipher) -> None:
        self._engine = engine
        self._cipher = cipher

    async def upsert_connected(
        self, *, me: Me, session_string: str, source: str, actor: UUID | None,
        bind_feature: str | None = None,
    ) -> Account:
        ciphertext, iv = self._cipher.encrypt(session_string)
        now = _now()
        async with self._engine.begin() as conn:
            existing = (await conn.execute(
                select(accounts.c.id, accounts.c.status)
                .where(accounts.c.telegram_user_id == me.telegram_user_id)
                .with_for_update()
            )).first()
            values = dict(
                first_name=me.first_name, last_name=me.last_name, username=me.username,
                phone_masked=mask_phone(me.phone), session_ciphertext=ciphertext, session_iv=iv,
                status="ACTIVE", source=source, connected_by=actor, connected_at=now,
                status_changed_at=now, status_reason=None,
            )
            if existing is None:
                account_id = uuid.uuid4()
                await conn.execute(insert(accounts).values(
                    id=account_id, telegram_user_id=me.telegram_user_id, **values))
            elif existing.status == "ACTIVE":
                raise ApiError("ALREADY_CONNECTED")
            else:
                account_id = existing.id
                await conn.execute(
                    update(accounts).where(accounts.c.id == account_id).values(**values))
            await conn.execute(insert(audit).values(
                action="IMPORTED" if source == "IMPORTED" else "CONNECTED",
                account_id=account_id, actor=actor))
            if bind_feature is not None:
                await self._bind(conn, bind_feature, account_id, actor)
        return await self.get(account_id)

    async def get(self, account_id: UUID) -> Account:
        async with self._engine.connect() as conn:
            row = (await conn.execute(select(*_COLUMNS).where(accounts.c.id == account_id))).first()
        if row is None:
            raise ApiError("ACCOUNT_NOT_FOUND")
        return Account(**row._mapping)

    async def find_by_telegram_id(self, telegram_user_id: int) -> Account | None:
        async with self._engine.connect() as conn:
            row = (await conn.execute(
                select(*_COLUMNS).where(accounts.c.telegram_user_id == telegram_user_id))).first()
        return None if row is None else Account(**row._mapping)

    async def list(self) -> list[Account]:
        async with self._engine.connect() as conn:
            rows = (await conn.execute(select(*_COLUMNS).order_by(accounts.c.connected_at))).all()
        return [Account(**r._mapping) for r in rows]

    async def session_string(self, account_id: UUID) -> str:
        async with self._engine.connect() as conn:
            row = (await conn.execute(
                select(accounts.c.session_ciphertext, accounts.c.session_iv)
                .where(accounts.c.id == account_id))).first()
        if row is None:
            raise ApiError("ACCOUNT_NOT_FOUND")
        return self._cipher.decrypt(row.session_ciphertext, row.session_iv)

    async def mark_revoked(self, account_id: UUID, reason: str) -> None:
        async with self._engine.begin() as conn:
            await conn.execute(update(accounts).where(accounts.c.id == account_id).values(
                status="REVOKED", status_reason=reason, status_changed_at=_now()))
            await conn.execute(insert(audit).values(action="REVOKED", account_id=account_id))

    async def mark_disconnected(self, account_id: UUID, actor: UUID | None) -> None:
        async with self._engine.begin() as conn:
            await conn.execute(update(accounts).where(accounts.c.id == account_id).values(
                status="DISCONNECTED", status_reason=None, status_changed_at=_now(),
                session_ciphertext=b"", session_iv=b""))
            await conn.execute(insert(audit).values(
                action="DISCONNECTED", account_id=account_id, actor=actor))

    async def active_ids(self) -> set[UUID]:
        async with self._engine.connect() as conn:
            rows = await conn.execute(select(accounts.c.id).where(accounts.c.status == "ACTIVE"))
        return set(rows.scalars())

    async def bindings(self) -> dict[str, UUID]:
        async with self._engine.connect() as conn:
            rows = (await conn.execute(select(bindings.c.feature, bindings.c.account_id))).all()
        return {r.feature: r.account_id for r in rows}

    async def features_of(self, account_id: UUID) -> list[str]:
        async with self._engine.connect() as conn:
            rows = await conn.execute(
                select(bindings.c.feature).where(bindings.c.account_id == account_id)
                .order_by(bindings.c.feature))
        return list(rows.scalars())

    async def bind(self, feature: str, account_id: UUID, actor: UUID | None) -> None:
        async with self._engine.begin() as conn:
            await self._bind(conn, feature, account_id, actor)

    async def _bind(self, conn, feature: str, account_id: UUID, actor: UUID | None) -> None:
        if feature not in FEATURES:
            raise ApiError("UNKNOWN_FEATURE")
        status = (await conn.execute(
            select(accounts.c.status).where(accounts.c.id == account_id))).scalar_one_or_none()
        if status is None:
            raise ApiError("ACCOUNT_NOT_FOUND")
        if status != "ACTIVE":
            raise ApiError("ACCOUNT_NOT_ACTIVE")
        stmt = pg_insert(bindings).values(
            feature=feature, account_id=account_id, bound_by=actor, bound_at=_now())
        await conn.execute(stmt.on_conflict_do_update(
            index_elements=[bindings.c.feature],
            set_=dict(account_id=stmt.excluded.account_id, bound_by=stmt.excluded.bound_by,
                      bound_at=stmt.excluded.bound_at)))
        await conn.execute(insert(audit).values(
            action="BOUND", account_id=account_id, feature=feature, actor=actor))
