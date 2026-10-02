"""The only module that imports Pyrogram's Client.

Clients are constructed lazily by callers that are already inside the running
event loop: Pyrogram's Dispatcher captures asyncio.get_event_loop() in its
constructor, and a client built anywhere else registers handlers on a loop
that never runs (see tests/test_pyrogram_adapter.py)."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from uuid import UUID

from pyrogram import Client, enums, errors, filters, raw
from pyrogram.handlers import MessageHandler
from pyrogram.types import User

from userbot_service.telegram.ports import (
    CodeSent,
    Me,
    Msg,
    PasswordNeeded,
    SessionDead,
    TelegramError,
)

log = logging.getLogger(__name__)

_LOGIN_CODES = {
    "PHONE_NUMBER_INVALID": "PHONE_INVALID",
    "PHONE_CODE_INVALID": "CODE_INVALID",
    "PHONE_CODE_EMPTY": "CODE_INVALID",
    "PHONE_CODE_EXPIRED": "CODE_EXPIRED",
    "PASSWORD_HASH_INVALID": "PASSWORD_INVALID",
    "PHONE_NUMBER_BANNED": "PHONE_BANNED",
    "PHONE_NUMBER_UNOCCUPIED": "PHONE_NOT_REGISTERED",
}


def as_telegram_error(exc: errors.RPCError) -> TelegramError:
    if isinstance(exc, errors.FloodWait):
        return TelegramError("FLOOD_WAIT", retry_after=int(exc.value))
    return TelegramError(_LOGIN_CODES.get(exc.ID, "TELEGRAM_ERROR"))


def as_session_dead(exc: BaseException) -> SessionDead | None:
    if isinstance(exc, errors.SessionPasswordNeeded):
        return None
    if isinstance(exc, errors.Unauthorized | errors.UserDeactivatedBan):
        return SessionDead(getattr(exc, "ID", type(exc).__name__))
    return None


def _me(user: User) -> Me:
    return Me(telegram_user_id=user.id, first_name=user.first_name or "",
              last_name=user.last_name, username=user.username,
              phone=user.phone_number or "")


def _msg(message) -> Msg:
    return Msg(id=message.id, text=message.text or message.caption, date=message.date)


def _code_sent(sent) -> CodeSent:
    code_type = sent.type.name if isinstance(sent.type, enums.SentCodeType) else str(sent.type)
    return CodeSent(phone_code_hash=sent.phone_code_hash, code_type=code_type,
                    timeout_sec=sent.timeout)


class PyrogramLoginGateway:
    def __init__(self, api_id: int, api_hash: str) -> None:
        self._client = Client("login", api_id=api_id, api_hash=api_hash, in_memory=True)

    async def connect(self) -> None:
        await self._client.connect()

    async def send_code(self, phone: str) -> CodeSent:
        try:
            return _code_sent(await self._client.send_code(phone))
        except errors.RPCError as e:
            raise as_telegram_error(e) from e

    async def resend_code(self, phone: str, phone_code_hash: str) -> CodeSent:
        try:
            return _code_sent(await self._client.resend_code(phone, phone_code_hash))
        except errors.RPCError as e:
            raise as_telegram_error(e) from e

    async def sign_in(self, phone: str, phone_code_hash: str, code: str) -> Me:
        try:
            result = await self._client.sign_in(phone, phone_code_hash, code)
        except errors.SessionPasswordNeeded:
            raise PasswordNeeded(await self._client.get_password_hint()) from None
        except errors.RPCError as e:
            raise as_telegram_error(e) from e
        if not isinstance(result, User):
            # Unregistered number: Pyrogram returns TermsOfService or False.
            raise TelegramError("PHONE_NOT_REGISTERED")
        return _me(result)

    async def check_password(self, password: str) -> Me:
        try:
            return _me(await self._client.check_password(password))
        except errors.RPCError as e:
            raise as_telegram_error(e) from e

    async def export_session(self) -> str:
        return await self._client.export_session_string()

    async def log_out(self) -> None:
        try:
            await self._client.invoke(raw.functions.auth.LogOut())
        except errors.RPCError:
            log.warning("logging the fresh login session out failed", exc_info=True)

    async def disconnect(self) -> None:
        if self._client.is_connected:
            await self._client.disconnect()


class PyrogramAccountClient:
    def __init__(
        self, account_id: UUID, session_string: str, *, api_id: int, api_hash: str
    ) -> None:
        self._client = Client(str(account_id), api_id=api_id, api_hash=api_hash,
                              session_string=session_string or None, in_memory=True)
        self._logged_out = False

    @property
    def is_connected(self) -> bool:
        return bool(self._client.is_connected)

    def has_handlers(self) -> bool:
        # Connected but with an empty dispatcher means updates go nowhere.
        return bool(self._client.dispatcher.groups)

    async def start(self) -> None:
        try:
            await self._client.start()
        except Exception as e:
            # Client.start() disconnects only if authorization fails; a get_me()
            # failure afterwards leaves it connected but not initialized.
            await self._disconnect_quietly()
            dead = as_session_dead(e)
            if dead is not None:
                raise dead from e
            raise

    async def stop(self) -> None:
        if not self._client.is_connected or self._logged_out:
            return
        try:
            if self._client.is_initialized:
                await self._client.stop()
            else:
                await self._client.disconnect()
        except ConnectionError:
            log.debug("client was already terminated", exc_info=True)

    async def _disconnect_quietly(self) -> None:
        try:
            if self._client.is_connected:
                await self._client.disconnect()
        except Exception:
            log.warning("disconnecting after a failed start failed", exc_info=True)

    async def get_me(self) -> Me:
        try:
            return _me(await self._client.get_me())
        except Exception as e:
            dead = as_session_dead(e)
            if dead is not None:
                raise dead from e
            raise

    async def log_out(self) -> None:
        # Pyrogram's log_out() invokes auth.LogOut and then stops the client itself.
        await self._client.log_out()
        self._logged_out = True

    async def download_avatar(self, path: str) -> bool:
        async for photo in self._client.get_chat_photos("me", limit=1):
            await self._client.download_media(photo.file_id, file_name=path)
            return True
        return False

    def on_incoming(self, chat: str | int, callback: Callable[[Msg], Awaitable[None]]) -> None:
        # filters.incoming: anyone with access to this account could otherwise
        # paste a top-up-shaped message and mint a credit observation.
        async def handler(_client, message) -> None:
            await callback(_msg(message))

        self._client.add_handler(MessageHandler(handler, filters.chat(chat) & filters.incoming))

    async def history_after(
        self, chat: str | int, after_id: int, limit: int = 5000
    ) -> list[Msg]:
        # No Pyrogram-side limit: it would keep the newest N and silently drop
        # the oldest, and the caller advances past whatever we return.
        found: list[Msg] = []
        async for message in self._client.get_chat_history(chat):
            if message.id <= after_id:
                break
            if len(found) >= limit:
                log.error("history catch-up hit its cap: read %d messages after %d "
                          "and older ones remain unread", len(found), after_id)
                break
            if message.outgoing:
                continue
            found.append(_msg(message))
        found.reverse()
        return found

    async def newest_message_id(self, chat: str | int) -> int:
        async for message in self._client.get_chat_history(chat, limit=1):
            return message.id
        return 0


class PyrogramLegacySession:
    """The pre-panel `.session` file, opened once to move it into the database."""

    def __init__(self, session_name: str, session_dir: str, *, api_id: int, api_hash: str) -> None:
        self._client = Client(session_name, api_id=api_id, api_hash=api_hash, workdir=session_dir)

    async def open(self) -> Me:
        await self._client.connect()
        return _me(await self._client.get_me())

    async def export(self) -> str:
        return await self._client.export_session_string()

    async def close(self) -> None:
        if self._client.is_connected:
            await self._client.disconnect()
