"""Handler for efbazaar.trade.mailbox-delete-request.

An admin cleared out a mailbox nobody holds. trade-service has already marked
its own row deleted; this removes the box from Mailcow so the address stops
existing and stops holding a licence slot.
"""

from __future__ import annotations

import logging

import httpx

from smart_admin_worker.kafka import events as e
from smart_admin_worker.mailcow.client import MailcowClient
from smart_admin_worker.mailcow.errors import MailcowApiError

logger = logging.getLogger(__name__)


class MailboxDeleteHandler:
    def __init__(self, mailcow: MailcowClient) -> None:
        self._mailcow = mailcow

    async def handle(self, event: e.MailboxDeleteRequest) -> None:
        try:
            await self._mailcow.delete_mailbox(event.mailbox_email)
        except MailcowApiError as refused:
            # Mailcow answered and said no, which it will say again to an
            # identical request for ever. Retrying only produces the same
            # alert on a loop — three of them arrived within a minute the
            # first time this fired, for a "pending-…" address that was never
            # created in Mailcow at all (it answers access_denied for a
            # mailbox that does not exist, not object_dne).
            #
            # Swallowed rather than re-raised because trade-service has
            # already marked the row deleted: the worst outcome is one stray
            # mailbox on the server, which is a cleanup, not a reason to jam
            # the topic.
            logger.warning(
                "Mailcow refused to delete %s: %s. Not retrying — the row is "
                "already marked deleted on our side.",
                event.mailbox_email,
                refused,
            )
        except (httpx.HTTPError, TimeoutError):
            # Mailcow unreachable rather than unwilling. This one is worth
            # another go, so it goes back to Kafka.
            logger.warning("Mailcow unreachable while deleting %s; will retry",
                           event.mailbox_email)
            raise
