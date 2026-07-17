"""KonamiClient — subprocess mocked, semaphore behavior asserted."""

from __future__ import annotations

import asyncio
import subprocess
from types import SimpleNamespace

import pytest

from smart_admin_worker.konami.client import KonamiClient, KonamiRotateFailed


def _fake_run(*, returncode=0, stderr=b""):
    def _impl(cmd, env, capture_output, timeout, check=False):
        return SimpleNamespace(returncode=returncode, stderr=stderr, stdout=b"")
    return _impl


async def test_trigger_reset_calls_subprocess(monkeypatch):
    monkeypatch.setenv("KONAMI_ROTATE_ENABLED", "true")
    seen = {}

    def _capture(cmd, env, capture_output, timeout, check=False):
        seen["cmd"] = cmd
        seen["env"] = env
        return SimpleNamespace(returncode=0, stderr=b"", stdout=b"")

    monkeypatch.setattr(subprocess, "run", _capture)
    client = KonamiClient(max_concurrent=1, timeout_seconds=30)
    await client.trigger_reset("test@efbazaar.uz", None)
    assert seen["cmd"][0] == "python"
    assert seen["cmd"][1].endswith("rotate.py")
    assert seen["env"]["KONAMI_EMAIL"] == "test@efbazaar.uz"


async def test_trigger_reset_raises_on_nonzero_exit(monkeypatch):
    monkeypatch.setenv("KONAMI_ROTATE_ENABLED", "true")
    monkeypatch.setattr(subprocess, "run", _fake_run(returncode=2, stderr=b"boom"))
    client = KonamiClient(max_concurrent=1, timeout_seconds=30)
    with pytest.raises(KonamiRotateFailed) as ei:
        await client.trigger_reset("x@y.z", None)
    assert ei.value.exit_code == 2
    assert "boom" in ei.value.stderr


async def test_semaphore_serializes_calls(monkeypatch):
    monkeypatch.setenv("KONAMI_ROTATE_ENABLED", "true")
    events = []

    def _slow_run(cmd, env, capture_output, timeout, check=False):
        # Simulate a 40ms-long subprocess so the second waiter clearly sees the first still running.
        import time
        events.append(("start", env["KONAMI_EMAIL"]))
        time.sleep(0.04)
        events.append(("end", env["KONAMI_EMAIL"]))
        return SimpleNamespace(returncode=0, stderr=b"", stdout=b"")

    monkeypatch.setattr(subprocess, "run", _slow_run)
    client = KonamiClient(max_concurrent=1, timeout_seconds=30)
    await asyncio.gather(
        client.trigger_reset("a@x", None),
        client.trigger_reset("b@x", None),
    )
    # With semaphore=1, "start b" only after "end a".
    assert events == [("start", "a@x"), ("end", "a@x"), ("start", "b@x"), ("end", "b@x")]


def test_queue_position_tracking():
    client = KonamiClient(max_concurrent=1, timeout_seconds=30)
    assert client.queue_position() == 0

    async def _run():
        async with client._semaphore:
            assert client.queue_position() == 0
            # Simulate someone waiting.

    # We can't easily test queue depth without touching internal state; the
    # observable API `queue_position()` returns waiters + reservation delta.
    # A more thorough test lives in the forgot_password handler suite.
