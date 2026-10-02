"""One IMAP IDLE connection per mailbox, held in its own thread.

Polling logged in every POLL_INTERVAL and still left the code waiting up to
that long. Here the connection stays open and Dovecot pushes a notice the
moment mail lands; the watcher then fetches UNSEEN and hands the snapshot to
the pollers subscribed to this mailbox.

Each watcher owns a dedicated thread, not a slot in asyncio's default
executor: an IDLE wait blocks for minutes, and a shared pool of a handful of
threads would make every other trade queue behind it. A thread blocked on a
socket costs no CPU and a few tens of KB of memory.

Lifecycle:
- The first snapshot is fetched right after login, so mail that arrived
  before the watcher started is not missed. The same happens after every
  reconnect.
- IDLE is re-issued every ``refresh_seconds``: it re-fetches as a safety net
  and keeps NAT/firewalls from dropping a silent connection.
- A dropped connection is retried with ``retry_delays`` backoff.
- ``stop()`` interrupts the blocking wait; ``max_lifetime_seconds`` bounds a
  watcher whose trade never sent the rotate that normally stops it.
- ``on_closed`` fires exactly once when the thread exits, for any reason.
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable, Sequence
from typing import Protocol

log = logging.getLogger(__name__)


class IdleConnection(Protocol):
    def fetch(self): ...
    def wait_for_change(self, timeout: float) -> None: ...
    def interrupt(self) -> None: ...
    def __enter__(self): ...
    def __exit__(self, *args: object) -> None: ...


class MailboxWatcher:
    def __init__(
        self,
        open_connection: Callable[[], IdleConnection],
        mailbox_email: str,
        *,
        on_snapshot: Callable[[list], None],
        on_closed: Callable[[], None],
        refresh_seconds: float,
        max_lifetime_seconds: float,
        retry_delays: Sequence[float] = (1, 2, 5, 10, 30),
    ) -> None:
        self._open = open_connection
        self._mailbox = mailbox_email
        self._on_snapshot = on_snapshot
        self._on_closed = on_closed
        self._refresh = refresh_seconds
        self._lifetime = max_lifetime_seconds
        self._retry_delays = tuple(retry_delays) or (1,)
        self._stopped = threading.Event()
        self._conn: IdleConnection | None = None
        self._conn_lock = threading.Lock()
        self._thread = threading.Thread(
            target=self._run, name=f"imap-idle:{mailbox_email}", daemon=True
        )

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stopped.set()
        with self._conn_lock:
            conn = self._conn
        if conn is not None:
            try:
                conn.interrupt()
            except Exception:  # noqa: BLE001
                pass

    def _run(self) -> None:
        deadline = time.monotonic() + self._lifetime
        failures = 0
        try:
            while not self._stopped.is_set() and time.monotonic() < deadline:
                try:
                    with self._open() as conn:
                        with self._conn_lock:
                            self._conn = conn
                        while not self._stopped.is_set():
                            remaining = deadline - time.monotonic()
                            if remaining <= 0:
                                break
                            self._on_snapshot(list(conn.fetch()))
                            failures = 0
                            conn.wait_for_change(min(self._refresh, remaining))
                except Exception as e:  # noqa: BLE001
                    if self._stopped.is_set():
                        break
                    delay = self._retry_delays[min(failures, len(self._retry_delays) - 1)]
                    failures += 1
                    log.warning("imap idle for %s dropped, reconnecting in %ss: %s",
                                self._mailbox, delay, e)
                    self._stopped.wait(min(delay, max(0.0, deadline - time.monotonic())))
                finally:
                    with self._conn_lock:
                        self._conn = None
            if not self._stopped.is_set():
                log.info("imap idle for %s reached its max lifetime, closing", self._mailbox)
        finally:
            self._on_closed()
