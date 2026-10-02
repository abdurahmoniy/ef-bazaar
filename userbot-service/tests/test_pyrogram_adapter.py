"""Only what can be checked without a network: construction and error mapping.
Everything else in the adapter is a one-line delegation to Pyrogram."""

import asyncio
import uuid

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
