"""The login sweeper must survive a failing sweep: abandoned logins keep their
Pyrogram clients open until it runs again."""

import asyncio

import pytest

from userbot_service.main_core import login_sweeper


class StopLoopError(Exception):
    pass


class FakeLogins:
    def __init__(self, fail_first: bool):
        self.calls = 0
        self._fail_first = fail_first

    async def sweep(self):
        self.calls += 1
        if self._fail_first and self.calls == 1:
            raise RuntimeError("disconnect failed")


async def run(logins, rounds):
    sleeps = []

    async def sleep(seconds):
        sleeps.append(seconds)
        if len(sleeps) >= rounds:
            raise StopLoopError

    with pytest.raises(StopLoopError):
        await login_sweeper(logins, every=30, sleep=sleep)
    return sleeps


async def test_a_failed_sweep_is_retried_next_round(caplog):
    logins = FakeLogins(fail_first=True)
    sleeps = await run(logins, rounds=3)
    assert logins.calls == 3
    assert sleeps == [30, 30, 30]
    assert "login sweep failed" in caplog.text


async def test_cancellation_propagates():
    async def sleep(_):
        raise asyncio.CancelledError

    with pytest.raises(asyncio.CancelledError):
        await login_sweeper(FakeLogins(False), every=30, sleep=sleep)
