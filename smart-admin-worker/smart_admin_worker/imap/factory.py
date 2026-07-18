"""Production IMAP connection factory using imap-tools.

`imap_tools.MailBox` is a synchronous, blocking client. `ImapPoller` runs
`factory.open(...).fetch()` inside `asyncio.to_thread`, so the blocking I/O
here never blocks the event loop.
"""

from __future__ import annotations

from collections.abc import Iterable

from imap_tools import AND, MailBox
from imap_tools.message import MailMessage


class _ImapConn:
    def __init__(self, mailbox: MailBox) -> None:
        self._mailbox = mailbox

    def fetch(self) -> Iterable[MailMessage]:
        # UNSEEN messages, left unread so a re-poll (e.g. after a crash) can
        # still see them; bounded to the most recent 50 to cap per-call cost.
        return self._mailbox.fetch(AND(seen=False), mark_seen=False, limit=50)

    def __enter__(self) -> _ImapConn:
        return self

    def __exit__(self, *args: object) -> None:
        self._mailbox.__exit__(*args)


class ImapToolsConnectionFactory:
    """Implements the `ImapConnectionFactory` protocol from `imap.poller`."""

    def open(self, host: str, port: int, email: str, password: str) -> _ImapConn:
        mb = MailBox(host, port).login(email, password, initial_folder="INBOX")
        return _ImapConn(mb)
