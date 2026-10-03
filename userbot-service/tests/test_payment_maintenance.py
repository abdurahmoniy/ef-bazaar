"""The payment runner's periodic loop: flush often, resync on a slower cadence,
and never die because one round failed."""

import asyncio

import pytest

from userbot_service.main_payment import payment_maintenance


class FakeWatcher:
    def __init__(self, resync_error: Exception | None = None):
        self.account_id = "acc"
        self.flushes = 0
        self.resyncs = 0
        self._resync_error = resync_error

    async def flush(self):
        self.flushes += 1

    async def resync(self):
        self.resyncs += 1
        if self._resync_error:
            raise self._resync_error
        return 0


class StopLoopError(Exception):
    pass


async def run(watchers, rounds, *, flush_every=5, resync_every=60):
    sleeps = []

    async def sleep(seconds):
        sleeps.append(seconds)
        if len(sleeps) >= rounds:
            raise StopLoopError

    with pytest.raises(StopLoopError):
        await payment_maintenance(
            watchers, flush_every=flush_every, resync_every=resync_every, sleep=sleep)
    return sleeps


async def test_flushes_every_round_and_resyncs_on_schedule():
    w = FakeWatcher()
    sleeps = await run({"a": w}, rounds=25)
    # Each round runs, then sleeps; the 25th sleep stops it after 25 rounds.
    assert w.flushes == 25
    # attach() already resynced, so the first scan is 60 s in: round 13 (5 s
    # rounds), then round 25.
    assert w.resyncs == 2
    assert set(sleeps) == {5}


async def test_resync_failure_does_not_stop_the_loop_and_is_retried(caplog):
    bad = FakeWatcher(resync_error=RuntimeError("telegram down"))
    good = FakeWatcher()
    await run({"a": bad, "b": good}, rounds=25)
    # The failing watcher neither stops the loop nor its neighbour's resync,
    # and is tried again at the next 60 s mark.
    assert bad.resyncs == 2 and good.resyncs == 2
    assert good.flushes == 25
    assert "resync failed" in caplog.text


async def test_no_watchers_is_fine():
    assert await run({}, rounds=3) == [5, 5, 5]


async def test_cancellation_propagates():
    async def sleep(_):
        raise asyncio.CancelledError

    with pytest.raises(asyncio.CancelledError):
        await payment_maintenance({}, flush_every=5, resync_every=60, sleep=sleep)
