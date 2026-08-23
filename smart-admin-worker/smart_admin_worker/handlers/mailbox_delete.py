"""Handler for efbazaar.trade.mailbox-delete-request.

An admin cleared out a mailbox nobody holds. trade-service has already marked
its own row deleted; this removes the box from Mailcow so the address stops
existing and stops counting against the server's licence.
"""

from __future__ import annotations

import logging

from smart_admin_worker.kafka import events as e
from smart_admin_worker.mailcow.client import MailcowClient
from smart_admin_worker.mailcow.errors import MailboxNotFound

logger = logging.getLogger(__name__)


class MailboxDeleteHandler:
    def __init__(self, mailcow: MailcowClient) -> None:
        self._mailcow = mailcow

    async def handle(self, event: e.MailboxDeleteRequest) -> None:
        try:
            await self._mailcow.delete_mailbox(event.mailbox_email)
        except MailboxNotFound:
            # Already gone, or never made it to Mailcow at all — a reserved
            # address whose provisioning failed is exactly the kind of leftover
            # an admin is clearing. Treating it as an error would have Kafka
            # redeliver it for ever.
            logger.info("Mailbox %s was not in Mailcow; nothing to delete", event.mailbox_email)
