"""Tracks the asyncio.Task per (mailbox, purpose) so we can cancel cleanly.

Also owns the IDLE watchers: one MailboxWatcher (one IMAP connection, one
thread) per mailbox, shared by every purpose polling it. Up to
``max_idle_connections`` mailboxes get a watcher; beyond that, pollers fall
back to periodic polling so nobody waits on a free slot. The watcher stops
when the mailbox's last poller is cancelled (rotate/delete at trade end).
"""

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
from smart_admin_worker.imap.watcher import MailboxWatcher
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
        max_idle_connections: int = 0,
        idle_refresh_seconds: float = 300,
        idle_max_lifetime_seconds: float = 86400,
        idle_retry_delays: tuple[float, ...] = (1, 2, 5, 10, 30),
    ) -> None:
        self._factory = factory
        self._detector = detector
        self._lock = lock
        self._poll_interval = poll_interval
        self._imap_host = imap_host
        self._imap_port = imap_port
        self._tasks: dict[tuple[str, PollPurpose], asyncio.Task] = {}
        self._max_idle = max_idle_connections
        self._idle_refresh = idle_refresh_seconds
        self._idle_lifetime = idle_max_lifetime_seconds
        self._idle_retry_delays = idle_retry_delays
        self._watched: dict[str, _Watched] = {}
        self._queues: dict[tuple[str, PollPurpose], asyncio.Queue] = {}

    def idle_mailboxes(self) -> set[str]:
        return set(self._watched)

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
            snapshots=self._subscribe(key, password),
        )
        task = asyncio.create_task(poller.run(mailbox_email, password, purpose))
        self._tasks[key] = task
        return task

    async def cancel(self, mailbox_email: str, purpose: PollPurpose) -> None:
        key = (mailbox_email, purpose)
        task = self._tasks.pop(key, None)
        self._unsubscribe(key)
        if task is None or task.done():
            return
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass

    async def cancel_mailbox(self, mailbox_email: str) -> int:
        """Stops every poller watching this mailbox, whatever the purpose.

        Callers know the mailbox — a rotate request, a delete — but not which
        of the three purposes happen to be live on it. Left behind, a poller
        logs in every interval with a password Mailcow has already replaced,
        for ever: `run()` has no exit of its own.
        """
        purposes = [key[1] for key in self._tasks if key[0] == mailbox_email]
        for purpose in purposes:
            await self.cancel(mailbox_email, purpose)
        return len(purposes)

    async def cancel_all(self) -> None:
        keys = list(self._tasks.keys())
        for mailbox_email, purpose in keys:
            await self.cancel(mailbox_email, purpose)

    # --- IDLE watchers -----------------------------------------------------

    def _subscribe(self, key: tuple[str, PollPurpose], password: str) -> asyncio.Queue | None:
        mailbox_email = key[0]
        watched = self._watched.get(mailbox_email)
        if watched is None:
            if len(self._watched) >= self._max_idle:
                return None  # over the cap: this mailbox polls instead
            watched = self._start_watcher(mailbox_email, password)
        queue: asyncio.Queue = asyncio.Queue()
        if watched.last is not None:
            # Mail that landed before this step started must not wait for
            # the next IDLE notice.
            queue.put_nowait(watched.last)
        watched.queues.add(queue)
        self._queues[key] = queue
        return queue

    def _unsubscribe(self, key: tuple[str, PollPurpose]) -> None:
        queue = self._queues.pop(key, None)
        watched = self._watched.get(key[0])
        if queue is None or watched is None:
            return
        watched.queues.discard(queue)
        if not watched.queues:
            del self._watched[key[0]]
            watched.watcher.stop()

    def _start_watcher(self, mailbox_email: str, password: str) -> _Watched:
        loop = asyncio.get_running_loop()
        watched = _Watched()

        def on_snapshot(msgs: list) -> None:
            loop.call_soon_threadsafe(self._fan_out, watched, msgs)

        def on_closed() -> None:
            try:
                loop.call_soon_threadsafe(self._closed, mailbox_email, watched)
            except RuntimeError:
                pass  # loop already closed at shutdown

        watched.watcher = MailboxWatcher(
            lambda: self._factory.open(
                self._imap_host, self._imap_port, mailbox_email, password
            ),
            mailbox_email,
            on_snapshot=on_snapshot,
            on_closed=on_closed,
            refresh_seconds=self._idle_refresh,
            max_lifetime_seconds=self._idle_lifetime,
            retry_delays=self._idle_retry_delays,
        )
        self._watched[mailbox_email] = watched
        watched.watcher.start()
        return watched

    @staticmethod
    def _fan_out(watched: _Watched, msgs: list) -> None:
        watched.last = msgs
        for queue in watched.queues:
            queue.put_nowait(msgs)

    def _closed(self, mailbox_email: str, watched: _Watched) -> None:
        if self._watched.get(mailbox_email) is watched:
            del self._watched[mailbox_email]
        for queue in watched.queues:
            queue.put_nowait(None)  # pollers on this mailbox exit


class _Watched:
    __slots__ = ("watcher", "queues", "last")

    def __init__(self) -> None:
        self.watcher: MailboxWatcher
        self.queues: set[asyncio.Queue] = set()
        self.last: list | None = None
