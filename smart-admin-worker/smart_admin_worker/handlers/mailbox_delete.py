"""Delete one requested mailbox and await a correlated, confirmed result."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

import httpx

from smart_admin_worker.imap.registry import ImapPollerRegistry
from smart_admin_worker.kafka import events as e
from smart_admin_worker.kafka.producer import KafkaProducerClient, publish_required_result
from smart_admin_worker.kafka.topics import TOPIC_MAILBOX_DELETE_RESULT
from smart_admin_worker.mailcow.client import MailcowClient
from smart_admin_worker.mailcow.errors import MailboxNotFound, MailcowApiError

log = logging.getLogger(__name__)


class MailboxDeleteHandler:
    def __init__(
        self, mailcow: MailcowClient, registry: ImapPollerRegistry, producer: KafkaProducerClient,
    ) -> None:
        self._mailcow = mailcow
        self._registry = registry
        self._producer = producer

    async def handle(self, event: e.MailboxDeleteRequest) -> None:
        if event.request_id is None:
            # An old Kafka command may predate current ownership. Decoding
            # remains backward compatible; destructive execution requires a
            # fresh trade-service deletion intent and correlation nonce.
            log.warning("Rejected uncorrelated mailbox deletion: mailbox_id=%s", event.mailbox_id)
            await publish_required_result(
                self._producer, TOPIC_MAILBOX_DELETE_RESULT, str(event.mailbox_id),
                e.MailboxDeleteResult(
                    None, event.mailbox_id, event.mailbox_email, False, False,
                    "MISSING_REQUEST_ID", datetime.now(UTC),
                ),
            )
            return
        await self._registry.cancel_mailbox(event.mailbox_email)
        success, absent, error = True, False, None
        transport_error = None
        try:
            await self._mailcow.delete_mailbox(event.mailbox_email)
        except MailboxNotFound:
            absent = True
        except MailcowApiError:
            # access_denied does not prove absence. No raw upstream body is
            # put on Kafka; it can contain operational details or credentials.
            success, error = False, "MAILCOW_REFUSED"
        except (httpx.HTTPError, TimeoutError) as exc:
            success, error = False, f"UNKNOWN:{type(exc).__name__}"
            transport_error = exc

        await publish_required_result(
                self._producer,
            TOPIC_MAILBOX_DELETE_RESULT, str(event.mailbox_id),
            e.MailboxDeleteResult(
                event.request_id, event.mailbox_id, event.mailbox_email,
                success, absent, error, datetime.now(UTC),
            ),
        )
        if transport_error is not None:
            raise transport_error
