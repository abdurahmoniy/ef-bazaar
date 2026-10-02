"""What the service needs from Telegram, without Pyrogram.

Everything that decides something — login rules, leases, the payment queue —
talks to these ports, so it is tested with fakes and no Telegram account."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True)
class Me:
    telegram_user_id: int
    first_name: str
    last_name: str | None
    username: str | None
    phone: str


@dataclass(frozen=True)
class Msg:
    id: int
    text: str | None
    date: datetime


@dataclass(frozen=True)
class CodeSent:
    phone_code_hash: str
    code_type: str
    timeout_sec: int | None


class TelegramError(Exception):
    def __init__(self, code: str, retry_after: int | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.retry_after = retry_after


class PasswordNeeded(Exception):  # noqa: N818 - names are the port contract
    def __init__(self, hint: str | None) -> None:
        super().__init__("password needed")
        self.hint = hint


class SessionDead(Exception):  # noqa: N818 - names are the port contract
    """The authorization is gone: revoked, logged out elsewhere, deactivated."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class LoginGateway(Protocol):
    async def connect(self) -> None: ...
    async def send_code(self, phone: str) -> CodeSent: ...
    async def resend_code(self, phone: str, phone_code_hash: str) -> CodeSent: ...
    async def sign_in(self, phone: str, phone_code_hash: str, code: str) -> Me: ...
    async def check_password(self, password: str) -> Me: ...
    async def export_session(self) -> str: ...
    async def log_out(self) -> None: ...
    async def disconnect(self) -> None: ...


class AccountClient(Protocol):
    @property
    def is_connected(self) -> bool: ...
    def has_handlers(self) -> bool: ...
    async def start(self) -> None: ...
    async def stop(self) -> None: ...
    async def get_me(self) -> Me: ...
    async def log_out(self) -> None: ...
    async def download_avatar(self, path: str) -> bool: ...
    def on_incoming(self, chat: str | int, callback: Callable[[Msg], Awaitable[None]]) -> None: ...
    async def history_after(
        self, chat: str | int, after_id: int, limit: int = 500
    ) -> list[Msg]: ...
    async def newest_message_id(self, chat: str | int) -> int: ...


class LegacySession(Protocol):
    async def open(self) -> Me: ...
    async def export(self) -> str: ...
    async def close(self) -> None: ...
