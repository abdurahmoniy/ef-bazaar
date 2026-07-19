"""Async periodic IMAP poller.

Runs one task per (mailbox, purpose). Each iteration:

1. Try to acquire the per-mailbox Redis lock (SET NX PX).
2. On success, open the IMAP connection via the injected factory, fetch new
   messages in the "Konami" domain, feed them to the detector.
3. On detection: invoke the caller's async callback and stop detecting further
   hits (the task idles, sleeping each interval, until the caller cancels it
   via ImapPollerRegistry.cancel — the task itself never returns on its own).
4. Sleep POLL_INTERVAL and repeat.

If the lock is held by another replica, we skip this iteration silently. If
the IMAP connection fails, we log and retry next iteration — imap-tools
reconnects on the next `open()` call.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from enum import Enum
from typing import Protocol

from smart_admin_worker.imap.detector import (
    EmailChangeCodeHit,
    KonamiEmailDetector,
    ResetHit,
    TwoFaHit,
)
from smart_admin_worker.redis.lock import RedisLockManager

log = logging.getLogger(__name__)


class PollPurpose(str, Enum):
    VERIFY_LINK = "VERIFY_LINK"
    WAIT_2FA_CODE = "WAIT_2FA_CODE"
    # NEW: seller has started the Konami "Update Email Address" flow — the
    # 6-digit verification code lands in the escrow mailbox they can't read.
    # Smart-admin scrapes it and relays via Kafka so the frontend can show it.
    WAIT_EMAIL_CHANGE_CODE = "WAIT_EMAIL_CHANGE_CODE"


class ImapConnectionFactory(Protocol):
    def open(self, host: str, port: int, email: str, password: str):
        """Returns a context-manager IMAP connection with a .fetch() method."""


@dataclass(slots=True)
class ImapPoller:
    factory: ImapConnectionFactory
    detector: KonamiEmailDetector
    lock: RedisLockManager
    poll_interval: float
    on_reset: Callable[[ResetHit], Awaitable[None]] | None
    on_2fa: Callable[[TwoFaHit], Awaitable[None]] | None
    on_email_change_code: Callable[[EmailChangeCodeHit], Awaitable[None]] | None = None
    imap_host: str = "mailcow.efbazaar.uz"
    imap_port: int = 993

    async def run(self, mailbox_email: str, password: str, purpose: PollPurpose) -> None:
        lock_key = f"smartadmin:imap-poll:{mailbox_email}"
        detected = False
        while True:
            await asyncio.sleep(self.poll_interval)
            if detected:
                # Already dispatched a hit; idle until the caller cancels us
                # (via ImapPollerRegistry.cancel or direct task.cancel()).
                continue
            if not await self.lock.try_acquire(lock_key):
                continue
            try:
                hit = await asyncio.to_thread(
                    self._fetch_and_detect, mailbox_email, password, purpose
                )
            except Exception as e:  # noqa: BLE001
                log.warning("imap poll failed for %s: %s", mailbox_email, e)
                await self.lock.release(lock_key)
                continue
            await self.lock.release(lock_key)
            if hit is None:
                continue
            if isinstance(hit, ResetHit) and self.on_reset is not None:
                await self.on_reset(hit)
                detected = True
            elif isinstance(hit, TwoFaHit) and self.on_2fa is not None:
                await self.on_2fa(hit)
                detected = True
            elif isinstance(hit, EmailChangeCodeHit) and self.on_email_change_code is not None:
                await self.on_email_change_code(hit)
                detected = True

    def _fetch_and_detect(
        self, mailbox_email: str, password: str, purpose: PollPurpose
    ) -> ResetHit | TwoFaHit | EmailChangeCodeHit | None:
        with self.factory.open(self.imap_host, self.imap_port, mailbox_email, password) as conn:
            msgs = list(conn.fetch())
        if purpose is PollPurpose.VERIFY_LINK:
            return self.detector.check_reset(msgs)
        if purpose is PollPurpose.WAIT_EMAIL_CHANGE_CODE:
            return self.detector.check_email_change_verification(msgs)
        return self.detector.check_2fa(msgs)
