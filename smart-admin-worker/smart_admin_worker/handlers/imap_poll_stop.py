"""Handler for efbazaar.trade.imap-poll-stop-request.

A custom-mailbox link session ended (verified, expired or cancelled). Trade
boxes stop their pollers through rotate/delete at trade end; a custom box is
never rotated or deleted, so without this its pollers would run for ever.
"""

from __future__ import annotations

from smart_admin_worker.imap.registry import ImapPollerRegistry
from smart_admin_worker.kafka import events as e


class ImapPollStopHandler:
    def __init__(self, registry: ImapPollerRegistry) -> None:
        self._registry = registry

    async def handle(self, event: e.ImapPollStopRequest) -> None:
        await self._registry.cancel_mailbox(event.mailbox_email)
