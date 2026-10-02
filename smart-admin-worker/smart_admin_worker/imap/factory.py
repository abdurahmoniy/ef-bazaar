"""Production IMAP connection factory using imap-tools.

`imap_tools.MailBox` is a synchronous, blocking client. `ImapPoller` runs
`factory.open(...).fetch()` inside `asyncio.to_thread`, so the blocking I/O
here never blocks the event loop.
"""

from __future__ import annotations

import socket
from collections.abc import Iterable

from imap_tools import AND, MailBox, MailMessageFlags
from imap_tools.message import MailMessage

# Bounds connect/login/fetch reads. Without it a half-open TCP link (NAT
# dropped it, server vanished) blocks the thread for ever. IDLE waits are not
# affected: imap-tools polls the socket with its own timeout.
SOCKET_TIMEOUT_SECONDS = 30


class _ImapConn:
    def __init__(self, mailbox: MailBox) -> None:
        self._mailbox = mailbox

    def fetch(self) -> Iterable[MailMessage]:
        # UNSEEN messages, left unread here: the poller marks a step's mail
        # SEEN only after delivering its code (see mark_seen). Bounded to the
        # most recent 50 to cap per-call cost.
        return self._mailbox.fetch(AND(seen=False), mark_seen=False, limit=50, reverse=True)

    def mark_seen(self, uids: list[str]) -> None:
        # Called only after the code reached Kafka, so a resend never re-reads it.
        self._mailbox.flag(uids, MailMessageFlags.SEEN, True)

    def wait_for_change(self, timeout: float) -> None:
        # IDLE until Dovecot reports a change (new mail, flags) or timeout.
        self._mailbox.idle.wait(timeout=timeout)

    def interrupt(self) -> None:
        # Called from another thread to break a blocking IDLE wait.
        self._mailbox.client.sock.shutdown(socket.SHUT_RDWR)

    def __enter__(self) -> _ImapConn:
        return self

    def __exit__(self, *args: object) -> None:
        self._mailbox.__exit__(*args)


class ImapToolsConnectionFactory:
    """Implements the `ImapConnectionFactory` protocol from `imap.poller`."""

    def open(self, host: str, port: int, email: str, password: str) -> _ImapConn:
        mb = MailBox(host, port, timeout=SOCKET_TIMEOUT_SECONDS).login(
            email, password, initial_folder="INBOX"
        )
        return _ImapConn(mb)
