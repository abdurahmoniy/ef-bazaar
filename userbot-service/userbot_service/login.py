"""Interactive login, one HTTP call per step.

A pending login is an in-memory, not-yet-authorized client keyed by a random
id. A restart of userbot-core loses them; the admin starts again."""

from __future__ import annotations

import asyncio
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from uuid import UUID

from userbot_service.errors import ApiError
from userbot_service.phone import normalize_phone
from userbot_service.repository import Account, AccountRepository
from userbot_service.telegram.ports import LoginGateway, Me, PasswordNeeded, TelegramError


@dataclass(frozen=True)
class LoginStep:
    login_id: UUID
    status: str  # "CODE_SENT" | "PASSWORD_REQUIRED" | "DONE"
    code_type: str | None = None
    timeout_sec: int | None = None
    hint: str | None = None
    account: Account | None = None


@dataclass
class _Pending:
    gateway: LoginGateway
    phone: str
    phone_code_hash: str
    actor: UUID | None
    created_at: float
    awaiting_password: bool = False
    code_attempts: int = 0
    password_attempts: int = 0
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


def _api_error(e: TelegramError) -> ApiError:
    if e.code == "FLOOD_WAIT":
        return ApiError("FLOOD_WAIT", retryAfterSec=e.retry_after or 0)
    return ApiError(e.code)


class LoginService:
    def __init__(
        self, *, gateway_factory: Callable[[], LoginGateway], repo: AccountRepository,
        clock: Callable[[], float] = time.monotonic, ttl_seconds: int = 300,
        max_attempts: int = 5, max_pending: int = 5,
    ) -> None:
        self._factory = gateway_factory
        self._repo = repo
        self._clock = clock
        self._ttl = ttl_seconds
        self._max_attempts = max_attempts
        self._max_pending = max_pending
        self._pending: dict[UUID, _Pending] = {}

    async def start(self, phone: str, actor: UUID | None) -> LoginStep:
        phone = normalize_phone(phone)
        await self.sweep()
        if len(self._pending) >= self._max_pending:
            raise ApiError("TOO_MANY_LOGINS")
        gateway = self._factory()
        await gateway.connect()
        try:
            sent = await gateway.send_code(phone)
        except TelegramError as e:
            await gateway.disconnect()
            raise _api_error(e) from e
        login_id = uuid.uuid4()
        self._pending[login_id] = _Pending(
            gateway, phone, sent.phone_code_hash, actor, self._clock())
        return LoginStep(login_id, "CODE_SENT", sent.code_type, sent.timeout_sec)

    async def submit_code(self, login_id: UUID, code: str) -> LoginStep:
        p = self._get(login_id)
        async with p.lock:
            if p.awaiting_password:
                raise ApiError("LOGIN_GONE")
            try:
                me = await p.gateway.sign_in(p.phone, p.phone_code_hash, code.strip())
            except PasswordNeeded as e:
                p.awaiting_password = True
                return LoginStep(login_id, "PASSWORD_REQUIRED", hint=e.hint)
            except TelegramError as e:
                p.code_attempts += 1
                await self._drop_if_spent(login_id, p.code_attempts, e)
                raise _api_error(e) from e
            return await self._finish(login_id, p, me)

    async def submit_password(self, login_id: UUID, password: str) -> LoginStep:
        p = self._get(login_id)
        async with p.lock:
            if not p.awaiting_password:
                await self._close(login_id)
                raise ApiError("LOGIN_GONE")
            try:
                me = await p.gateway.check_password(password)
            except TelegramError as e:
                p.password_attempts += 1
                await self._drop_if_spent(login_id, p.password_attempts, e)
                raise _api_error(e) from e
            return await self._finish(login_id, p, me)

    async def resend(self, login_id: UUID) -> LoginStep:
        p = self._get(login_id)
        async with p.lock:
            try:
                sent = await p.gateway.resend_code(p.phone, p.phone_code_hash)
            except TelegramError as e:
                raise _api_error(e) from e
            p.phone_code_hash = sent.phone_code_hash
            return LoginStep(login_id, "CODE_SENT", sent.code_type, sent.timeout_sec)

    async def cancel(self, login_id: UUID) -> None:
        await self._close(login_id)

    async def sweep(self) -> None:
        now = self._clock()
        for login_id in [i for i, p in self._pending.items() if now - p.created_at > self._ttl]:
            await self._close(login_id)

    def _get(self, login_id: UUID) -> _Pending:
        p = self._pending.get(login_id)
        if p is None or self._clock() - p.created_at > self._ttl:
            raise ApiError("LOGIN_GONE")
        return p

    async def _drop_if_spent(self, login_id: UUID, attempts: int, e: TelegramError) -> None:
        # CODE_EXPIRED / FLOOD_WAIT also end the login: the admin starts over.
        if attempts >= self._max_attempts or e.code in {"CODE_EXPIRED", "FLOOD_WAIT"}:
            await self._close(login_id)

    async def _finish(self, login_id: UUID, p: _Pending, me: Me) -> LoginStep:
        try:
            session = await p.gateway.export_session()
            account = await self._repo.upsert_connected(
                me=me, session_string=session, source="PANEL", actor=p.actor)
        except ApiError as e:
            if e.code == "ALREADY_CONNECTED":
                # The sign-in just created a second authorization on that account.
                await p.gateway.log_out()
            raise
        finally:
            await self._close(login_id)
        return LoginStep(login_id, "DONE", account=account)

    async def _close(self, login_id: UUID) -> None:
        p = self._pending.pop(login_id, None)
        if p is not None:
            await p.gateway.disconnect()
