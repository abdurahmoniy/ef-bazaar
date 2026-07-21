"""Tracks the asyncio.Task per (mailbox, purpose) so we can cancel cleanly."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable

from smart_admin_worker.imap.detector import (
    EmailChangeCodeHit,
    KonamiEmailDetector,
    ResetHit,
    TwoFaHit,
)
from smart_admin_worker.imap.poller import ImapConnectionFactory, ImapPoller, PollPurpose
from smart_admin_worker.redis.lock import RedisLockManager


class ImapPollerRegistry:
    def __init__(
        self,
        factory: ImapConnectionFactory,
        detector: KonamiEmailDetector,
        lock: RedisLockManager,
        poll_interval: float,
        imap_host: str = "mail.efbazaar.uz",
        imap_port: int = 993,
    ) -> None:
        self._factory = factory
        self._detector = detector
        self._lock = lock
        self._poll_interval = poll_interval
        self._imap_host = imap_host
        self._imap_port = imap_port
        self._tasks: dict[tuple[str, PollPurpose], asyncio.Task] = {}

    def start(
        self,
        mailbox_email: str,
        password: str,
        purpose: PollPurpose,
        on_reset: Callable[[ResetHit], Awaitable[None]] | None,
        on_2fa: Callable[[TwoFaHit], Awaitable[None]] | None,
        on_email_change_code: Callable[[EmailChangeCodeHit], Awaitable[None]] | None = None,
    ) -> asyncio.Task:
        key = (mailbox_email, purpose)
        if key in self._tasks and not self._tasks[key].done():
            raise ValueError(f"already polling {mailbox_email} for {purpose}")
        poller = ImapPoller(
            factory=self._factory,
            detector=self._detector,
            lock=self._lock,
            poll_interval=self._poll_interval,
            on_reset=on_reset,
            on_2fa=on_2fa,
            on_email_change_code=on_email_change_code,
            imap_host=self._imap_host,
            imap_port=self._imap_port,
        )
        task = asyncio.create_task(poller.run(mailbox_email, password, purpose))
        self._tasks[key] = task
        return task

    async def cancel(self, mailbox_email: str, purpose: PollPurpose) -> None:
        key = (mailbox_email, purpose)
        task = self._tasks.pop(key, None)
        if task is None or task.done():
            return
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass

    async def cancel_all(self) -> None:
        keys = list(self._tasks.keys())
        for mailbox_email, purpose in keys:
            await self.cancel(mailbox_email, purpose)
