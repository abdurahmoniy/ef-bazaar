"""Handler for efbazaar.trade.imap-poll-request.

Trade-service tells us "please start (or continue) polling mailbox X for
purpose Y" — we register a poll task and publish results as they arrive.
"""

from __future__ import annotations

import hashlib
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from smart_admin_worker.crypto.field_encryptor import EncryptedField, FieldEncryptor
from smart_admin_worker.imap.poller import PollPurpose
from smart_admin_worker.imap.registry import ImapPollerRegistry
from smart_admin_worker.kafka import events as e
from smart_admin_worker.kafka.producer import KafkaProducerClient, publish_required_result
from smart_admin_worker.kafka.topics import (
    TOPIC_IMAP_2FA,
    TOPIC_KONAMI_EMAIL,
    TOPIC_KONAMI_EMAIL_CHANGE_CODE,
)

PasswordProvider = Callable[[str], Awaitable[str]]
OriginVerifier = Callable[[bytes, str, datetime, datetime], Awaitable[bool]]
log = logging.getLogger(__name__)


async def _release_origin(*args) -> bool:
    from smart_admin_worker.imap.release_auth import verify_release_origin

    return await verify_release_origin(*args)


class ImapPollHandler:
    def __init__(
        self,
        registry: ImapPollerRegistry,
        producer: KafkaProducerClient,
        password_provider: PasswordProvider,
        decryptor: FieldEncryptor | None = None,
        origin_verifier: OriginVerifier | None = None,
    ) -> None:
        self._registry = registry
        self._producer = producer
        self._password_provider = password_provider
        self._decryptor = decryptor
        self._origin_verifier = origin_verifier or _release_origin

    async def handle(self, event: e.ImapPollRequest) -> None:
        purpose = PollPurpose(event.purpose)
        if purpose is PollPurpose.VERIFY_RELEASE:
            start, end = getattr(event, "started_at", None), getattr(event, "expires_at", None)
            if (
                not isinstance(start, datetime)
                or not isinstance(end, datetime)
                or start.tzinfo is None
                or end.tzinfo is None
                or start >= end
                or start > datetime.now(UTC)
                or end <= datetime.now(UTC)
            ):
                raise ValueError("Invalid release proof time bounds")
        password = await self._password_provider(event.mailbox_email)
        if not password:
            password = self._decrypt_from_request(event)
        if not password:
            # Cache miss — the worker restarted since this mailbox was
            # provisioned (see the MVP note in main.py). Starting a poller on
            # an empty password is the worst of both: it can never log in, and
            # `run()` would retry every interval for ever with nobody
            # watching. Raising hands it to the consumer's retry path and the
            # wrapper in main.py, which tells the admin group.
            raise LookupError(
                f"no cached password for {event.mailbox_email} — "
                "refusing to start a poller that cannot log in"
            )

        async def on_reset(hit):
            await self._producer.publish(
                TOPIC_KONAMI_EMAIL,
                str(event.trade_id),
                e.KonamiEmailReceived(
                    trade_id=event.trade_id,
                    reset_link_present=hit.reset_link_present,
                    sender=hit.sender,
                    received_at=hit.received_at,
                    # Qaysi qutini kuzatgan bo'lsak, javob ham o'shaniki.
                    mailbox_email=event.mailbox_email,
                    email_not_registered=hit.email_not_registered,
                ),
            )

        reported_failures: set[bytes] = set()

        async def on_release(hit) -> bool:
            if datetime.now(UTC) > event.expires_at:
                return False
            raw = getattr(hit, "raw_message", None)
            verified = False
            if isinstance(raw, bytes) and raw:
                try:
                    verified = (
                        await self._origin_verifier(
                            raw,
                            event.mailbox_email,
                            event.started_at,
                            event.expires_at,
                        )
                        is True
                    )
                except Exception:
                    verified = False
            fingerprint = hashlib.sha256(raw or b"missing-original-rfc822").digest()
            if not verified and fingerprint in reported_failures:
                return False
            await publish_required_result(
                self._producer,
                TOPIC_KONAMI_EMAIL,
                str(event.trade_id),
                e.KonamiEmailReceived(
                    trade_id=event.trade_id,
                    reset_link_present=False,
                    sender=hit.sender,
                    received_at=hit.received_at if verified else datetime.now(UTC),
                    mailbox_email=event.mailbox_email,
                    email_not_registered=bool(verified and hit.email_not_registered),
                    origin_verified=verified,
                ),
            )
            if not verified:
                if len(reported_failures) < 200:
                    reported_failures.add(fingerprint)
                log.warning(
                    "Release origin proof unverified: request_id=%s mailbox=%s",
                    event.trade_id,
                    event.mailbox_email,
                )
            return bool(verified and hit.email_not_registered and not hit.reset_link_present)

        async def on_2fa(hit):
            await self._producer.publish(
                TOPIC_IMAP_2FA,
                str(event.trade_id),
                e.Imap2faCode(
                    trade_id=event.trade_id,
                    code=hit.code,
                    mailbox_email=event.mailbox_email,
                    received_at=hit.received_at,
                ),
            )

        async def on_email_change_code(hit):
            await self._producer.publish(
                TOPIC_KONAMI_EMAIL_CHANGE_CODE,
                str(event.trade_id),
                e.KonamiEmailChangeCodeReceived(
                    trade_id=event.trade_id,
                    verification_code=hit.verification_code,
                    received_at=hit.received_at,
                    sender=hit.sender,
                    mailbox_email=event.mailbox_email,
                ),
            )

        # getattr: callers and tests may hand in an older-shaped event.
        if getattr(event, "restart", False):
            # A new step of a link session: the old poller may already have
            # gone idle on its first hit and would never see the next mail.
            await self._registry.cancel(event.mailbox_email, purpose)
        try:
            self._registry.start(
                event.mailbox_email,
                password,
                purpose,
                on_reset=on_reset if purpose is PollPurpose.VERIFY_LINK else None,
                on_release=on_release if purpose is PollPurpose.VERIFY_RELEASE else None,
                expires_at=event.expires_at if purpose is PollPurpose.VERIFY_RELEASE else None,
                on_2fa=on_2fa if purpose is PollPurpose.WAIT_2FA_CODE else None,
                on_email_change_code=(
                    on_email_change_code if purpose is PollPurpose.WAIT_EMAIL_CHANGE_CODE else None
                ),
            )
        except ValueError:
            # Already polling — this is a re-fire, no-op.
            pass

    def _decrypt_from_request(self, event: e.ImapPollRequest) -> str:
        """The password trade-service sent along, or "" when it sent none."""
        context = getattr(event, "password_context", None)
        ciphertext = getattr(event, "encrypted_password", None)
        iv = getattr(event, "iv", None)
        tag = getattr(event, "tag", None)
        if self._decryptor is None or not context or None in (ciphertext, iv, tag):
            return ""
        field = EncryptedField(iv=iv, tag=tag, ciphertext=ciphertext)
        return self._decryptor.decrypt(context, field).decode("utf-8")
