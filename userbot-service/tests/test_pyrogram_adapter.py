"""Only what can be checked without a network: construction and error mapping.
Everything else in the adapter is a one-line delegation to Pyrogram."""

import asyncio
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from pyrogram import errors

from userbot_service.telegram.ports import SessionDead, TelegramError
from userbot_service.telegram.pyrogram_adapter import (
    PyrogramAccountClient,
    as_session_dead,
    as_telegram_error,
)


async def test_a_client_built_inside_the_loop_dispatches_on_that_loop():
    """The bug that cost three real transfers: a Client built outside the
    running loop registers its handlers on a loop nothing runs."""
    client = PyrogramAccountClient(uuid.uuid4(), "", api_id=1, api_hash="x")
    assert client._client.dispatcher.loop is asyncio.get_running_loop()


@pytest.mark.parametrize("exc, code", [
    (errors.PhoneNumberInvalid(), "PHONE_INVALID"),
    (errors.PhoneCodeInvalid(), "CODE_INVALID"),
    (errors.PhoneCodeExpired(), "CODE_EXPIRED"),
    (errors.PasswordHashInvalid(), "PASSWORD_INVALID"),
    (errors.PhoneNumberBanned(), "PHONE_BANNED"),
    (errors.PhoneNumberUnoccupied(), "PHONE_NOT_REGISTERED"),
])
def test_telegram_login_errors_get_our_codes(exc, code):
    assert as_telegram_error(exc).code == code


def test_flood_wait_carries_the_wait():
    mapped = as_telegram_error(errors.FloodWait(value=42))
    assert (mapped.code, mapped.retry_after) == ("FLOOD_WAIT", 42)


def test_an_unknown_rpc_error_is_a_generic_telegram_error():
    assert as_telegram_error(errors.InternalServerError()).code == "TELEGRAM_ERROR"


@pytest.mark.parametrize("exc", [errors.AuthKeyUnregistered(), errors.SessionRevoked(),
                                 errors.UserDeactivated(), errors.UserDeactivatedBan()])
def test_a_dead_authorization_is_session_dead(exc):
    assert isinstance(as_session_dead(exc), SessionDead)


def test_a_password_prompt_is_not_a_dead_session():
    """SessionPasswordNeeded subclasses Unauthorized in Pyrogram."""
    assert as_session_dead(errors.SessionPasswordNeeded()) is None


def test_non_auth_errors_are_not_session_dead():
    assert as_session_dead(errors.FloodWait(value=1)) is None
    assert isinstance(as_telegram_error(errors.FloodWait(value=1)), TelegramError)


class _StubClient:
    """Stands in for pyrogram.Client; mimics its connect/initialize split."""

    def __init__(self, *, start_error=None, history=()):
        self.start_error = start_error
        self.history = list(history)
        self.is_connected = False
        self.is_initialized = False
        self.disconnects = 0

    async def start(self):
        self.is_connected = True  # Client.start() connects first ...
        if self.start_error:  # ... and get_me() fails after, without disconnecting
            raise self.start_error
        self.is_initialized = True

    async def stop(self):
        if not self.is_initialized:
            raise ConnectionError("Client is already terminated")
        self.is_connected = self.is_initialized = False

    async def disconnect(self):
        self.disconnects += 1
        self.is_connected = False

    async def log_out(self):
        self.is_connected = self.is_initialized = False

    async def get_chat_history(self, chat, limit=0):
        for i, m in enumerate(self.history):
            if limit and i >= limit:
                return
            yield m


def _adapter(stub):
    adapter = PyrogramAccountClient(uuid.uuid4(), "", api_id=1, api_hash="x")
    adapter._client = stub
    return adapter


async def test_start_failing_after_connect_leaves_nothing_connected():
    stub = _StubClient(start_error=errors.AuthKeyUnregistered())
    adapter = _adapter(stub)
    with pytest.raises(SessionDead):
        await adapter.start()
    assert not stub.is_connected


async def test_stop_after_a_failed_start_does_not_raise():
    stub = _StubClient(start_error=errors.AuthKeyUnregistered())
    adapter = _adapter(stub)
    with pytest.raises(SessionDead):
        await adapter.start()
    await adapter.stop()


async def test_stop_when_connected_but_not_initialized_just_disconnects():
    stub = _StubClient()
    stub.is_connected = True
    await _adapter(stub).stop()
    assert not stub.is_connected


async def test_stop_after_log_out_does_not_raise():
    stub = _StubClient()
    adapter = _adapter(stub)
    await adapter.start()
    await adapter.log_out()
    await adapter.stop()


def _m(id_, text="x", outgoing=False):
    return SimpleNamespace(id=id_, text=text, caption=None, outgoing=outgoing,
                           date=datetime(2026, 10, 1, tzinfo=UTC))


async def test_history_after_is_oldest_first_and_stops_at_after_id():
    adapter = _adapter(_StubClient(history=[_m(9), _m(8), _m(7), _m(6)]))
    assert [m.id for m in await adapter.history_after("c", 7)] == [8, 9]


async def test_history_after_skips_outgoing():
    adapter = _adapter(_StubClient(history=[_m(9), _m(8, outgoing=True), _m(7)]))
    assert [m.id for m in await adapter.history_after("c", 6)] == [7, 9]


async def test_history_after_is_not_cut_at_the_old_default_of_500():
    adapter = _adapter(_StubClient(history=[_m(i) for i in range(1200, 0, -1)]))
    assert len(await adapter.history_after("c", 0)) == 1200


async def test_history_after_logs_an_error_when_the_cap_is_reached(caplog):
    adapter = _adapter(_StubClient(history=[_m(i) for i in range(10, 0, -1)]))
    with caplog.at_level("ERROR"):
        found = await adapter.history_after("c", 0, limit=4)
    assert len(found) == 4
    assert any("4" in r.getMessage() and r.levelname == "ERROR" for r in caplog.records)
