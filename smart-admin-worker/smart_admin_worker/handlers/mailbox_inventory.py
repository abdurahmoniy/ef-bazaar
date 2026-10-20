"""Complete, bounded inventory observations for trusted trade-service domains."""

from __future__ import annotations

from datetime import UTC, datetime

import httpx

from smart_admin_worker.kafka import events as e
from smart_admin_worker.kafka.producer import KafkaProducerClient, publish_required_result
from smart_admin_worker.kafka.topics import TOPIC_MAILBOX_INVENTORY_OBSERVED
from smart_admin_worker.mailcow.client import (
    MAX_INVENTORY_MAILBOXES,
    MailcowClient,
    validate_domain,
)
from smart_admin_worker.mailcow.errors import MailcowApiError


class MailboxInventoryHandler:
    def __init__(self, mailcow: MailcowClient, producer: KafkaProducerClient) -> None:
        self._mailcow = mailcow
        self._producer = producer

    async def handle(self, event: e.MailboxInventoryRequest) -> None:
        observed_at = datetime.now(UTC)
        try:
            if not isinstance(event.domains, list) or not 1 <= len(event.domains) <= 50:
                raise ValueError("Inventory requires 1 to 50 platform domains")
            domains = sorted({validate_domain(domain) for domain in event.domains})
            rows = []
            for domain in domains:
                rows.extend(await self._mailcow.get_mailbox_inventory(domain))
                if len(rows) > MAX_INVENTORY_MAILBOXES:
                    raise ValueError("Inventory exceeds mailbox limit")
        except (MailcowApiError, httpx.HTTPError, TimeoutError, ValueError) as exc:
            await publish_required_result(
                self._producer,
                TOPIC_MAILBOX_INVENTORY_OBSERVED, str(event.request_id),
                e.MailboxInventoryObserved(
                    event.request_id, observed_at, 0, False, False, type(exc).__name__, [],
                ),
            )
            return

        # Publish only after every domain validated successfully. A partial
        # snapshot must never remove missing rows during reconciliation.
        pages = [rows[start:start + 100] for start in range(0, len(rows), 100)] or [[]]
        for page, mailboxes in enumerate(pages):
            await publish_required_result(
                self._producer,
                TOPIC_MAILBOX_INVENTORY_OBSERVED, str(event.request_id),
                e.MailboxInventoryObserved(
                    event.request_id, observed_at, page, page == len(pages) - 1,
                    True, None, mailboxes,
                ),
            )
