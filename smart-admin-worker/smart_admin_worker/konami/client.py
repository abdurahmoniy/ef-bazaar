"""Subprocess wrapper around konami/rotate/rotate.py.

Concurrency is gated by an asyncio.Semaphore so that a burst of forgot-password
requests doesn't launch N Chromium instances and OOM the container. A cap on
the semaphore's initial value is enforced up-stream in Settings; here we take
whatever value we're given.

Failure surface: rotate.py raises SystemExit / prints to stderr / returns
non-zero. We wrap all three cases in KonamiRotateFailed.
"""

from __future__ import annotations

import asyncio
import os
import subprocess
from pathlib import Path

_ROTATE_SCRIPT = str(
    (Path(__file__).parent / "rotate" / "rotate.py").resolve()
)


class KonamiRotateFailed(Exception):
    def __init__(self, exit_code: int, stderr: str) -> None:
        super().__init__(f"rotate.py exited {exit_code}: {stderr[:200]}")
        self.exit_code = exit_code
        self.stderr = stderr


class KonamiClient:
    def __init__(self, max_concurrent: int = 1, timeout_seconds: float = 120.0) -> None:
        if max_concurrent < 1:
            max_concurrent = 1
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._max_concurrent = max_concurrent
        self._timeout = timeout_seconds

    @property
    def semaphore(self) -> asyncio.Semaphore:
        """Concurrency gate — exposed so callers that need to interleave work
        around slot acquisition (e.g. publish a "queued" event before acquire,
        publish a "started" event after acquire but before the subprocess
        runs) can drive it directly. Callers that just want to run a reset
        should prefer :meth:`trigger_reset`.
        """
        return self._semaphore

    def queue_position(self) -> int:
        # Best-effort snapshot: number of tasks currently blocked waiting for a slot.
        # Access to internal `_waiters` is intentional; asyncio.Semaphore exposes
        # no public API for this and the value only feeds a UX metric.
        waiters = getattr(self._semaphore, "_waiters", None)
        return len(waiters) if waiters else 0

    async def trigger_reset(self, email: str, konami_id: str | None) -> None:
        async with self._semaphore:
            await self.invoke_reset(email, konami_id)

    async def invoke_reset(self, email: str, konami_id: str | None) -> None:
        """Run rotate.py for ``email`` in a worker thread. Does NOT acquire the
        semaphore — callers driving the slot themselves (see
        :attr:`semaphore`) call this once they hold a slot.

        Konami's server-side bot detection blocks our datacenter IPs at the
        HTTP/2 layer (INTERNAL_ERROR stream reset) and even HTTP/1.1 requests
        time out. The seller now clicks forgot-password from their own
        residential browser via the frontend TradePanel. This method
        short-circuits unless KONAMI_ROTATE_ENABLED=true, so the semaphore
        hold in the caller is preserved (for worker-queued/started UX) but
        the doomed subprocess call is skipped in production.
        """
        if os.environ.get("KONAMI_ROTATE_ENABLED", "false").lower() != "true":
            return
        await asyncio.to_thread(self._run_subprocess, email, konami_id)

    def _run_subprocess(self, email: str, konami_id: str | None) -> None:
        env = os.environ.copy()
        env["KONAMI_EMAIL"] = email
        # Container has no X server — Playwright refuses without headless=True.
        # Force headless unless caller (or the base env) explicitly opts out.
        env.setdefault("HEADLESS", "true")
        if konami_id:
            env["KONAMI_ID"] = konami_id
        try:
            result = subprocess.run(  # noqa: S603
                ["python", _ROTATE_SCRIPT],
                env=env,
                capture_output=True,
                timeout=self._timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as e:
            raise KonamiRotateFailed(-1, f"timeout after {self._timeout}s: {e}") from e
        if result.returncode != 0:
            raise KonamiRotateFailed(result.returncode, result.stderr.decode(errors="replace"))
