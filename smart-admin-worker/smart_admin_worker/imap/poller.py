"""Async IMAP poller.

Runs one task per (mailbox, purpose). Messages come from one of two sources:

- IDLE (preferred): the registry's MailboxWatcher holds one connection per
  mailbox and pushes an UNSEEN snapshot into ``snapshots`` as soon as mail
  lands. A ``None`` in the queue means the watcher closed; the poller exits.
- Polling (fallback, when the IDLE cap is reached): sleep POLL_INTERVAL, take
  the per-mailbox Redis lock (SET NX PX), open a connection and fetch.

For each batch:

1. Feed the messages to the detector for this purpose.
2. On detection: invoke the caller's async callback. Login and email-change code polling keeps
   watching for fresh messages, suppressing previously delivered and older
   codes. Reset-link polling idles after its first hit. All tasks stop when the
   caller cancels them via ImapPollerRegistry.cancel.
3. Only after the callback succeeded, mark this step's messages SEEN — the
   delivered one and older ones of the same step. Other steps' mail stays
   unread. A resend (or a poller restarted after a worker restart) then sees
   only the new message, never the old code again. A failed callback leaves
   the mail unread, so the next batch retries it.

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
    VERIFY_RELEASE = "VERIFY_RELEASE"
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
    imap_host: str = "mail.efbazaar.uz"
    imap_port: int = 993
    snapshots: asyncio.Queue | None = None
    on_release: Callable[[ResetHit], Awaitable[bool]] | None = None

    async def run(self, mailbox_email: str, password: str, purpose: PollPurpose) -> None:
        lock_key = f"smartadmin:imap-poll:{mailbox_email}"
        detected = False
        delivered_resets: set[ResetHit] = set()
        delivered_2fa: set[TwoFaHit] = set()
        latest_2fa: TwoFaHit | None = None
        delivered_email_codes: set[EmailChangeCodeHit] = set()
        latest_email_code: EmailChangeCodeHit | None = None
        msgs: list | None = []
        retry = False
        while True:
            if self.snapshots is not None:
                if retry:
                    # The callback failed; retry the same batch unless a newer
                    # one arrives first — IDLE may stay quiet for minutes.
                    try:
                        msgs = await asyncio.wait_for(self.snapshots.get(), self.poll_interval)
                    except TimeoutError:
                        pass
                else:
                    msgs = await self.snapshots.get()
                while not self.snapshots.empty():
                    msgs = self.snapshots.get_nowait()  # only the newest matters
                if msgs is None:
                    log.info("imap watcher for %s closed, %s poller stops",
                             mailbox_email, purpose.value)
                    return
                if detected:
                    continue
            else:
                await asyncio.sleep(self.poll_interval)
                if detected:
                    # Already dispatched a hit; idle until the caller cancels us
                    # (via ImapPollerRegistry.cancel or direct task.cancel()).
                    continue
                if not await self.lock.try_acquire(lock_key):
                    continue
                try:
                    msgs = await asyncio.to_thread(self._fetch, mailbox_email, password)
                except Exception as e:  # noqa: BLE001
                    log.warning("imap poll failed for %s: %s", mailbox_email, e)
                    await self.lock.release(lock_key)
                    continue
                await self.lock.release(lock_key)
            retry = False
            if purpose is PollPurpose.VERIFY_RELEASE:
                # Try every candidate so an unsigned/spoofed newest message
                # cannot permanently hide a genuine older signed response.
                for message in msgs:
                    release_hit = self.detector.check_release([message])
                    if release_hit is None or self.on_release is None:
                        continue
                    try:
                        accepted = await self.on_release(release_hit)
                    except Exception as error:
                        log.warning("release proof delivery failed: %s", type(error).__name__)
                        continue
                    if accepted:
                        detected = True
                        uid = getattr(message, "uid", None)
                        await self._mark_seen(mailbox_email, password, [uid] if uid else [])
                        break
                retry = not detected
                continue
            hit, consumed_uids = self._detect(msgs, purpose)
            if hit is None:
                continue
            if isinstance(hit, ResetHit) and self.on_reset is not None:
                if hit not in delivered_resets:
                    if not await self._deliver(self.on_reset, hit, mailbox_email):
                        retry = True
                        continue
                    delivered_resets.add(hit)
                # Havolasiz javob (masalan "pochta Konami ID ga ulanmagan")
                # qadamni yopmaydi: sotuvchi emailni o'tkazib tiklashni qayta
                # so'raydi va haqiqiy havola shu kuzatuvga tushishi kerak.
                # Xat pastda SEEN bo'ladi, ya'ni qayta yuborilmaydi.
                detected = hit.reset_link_present
            elif isinstance(hit, TwoFaHit) and self.on_2fa is not None:
                fresh = hit not in delivered_2fa and (
                    latest_2fa is None or hit.received_at >= latest_2fa.received_at
                )
                if fresh:
                    if not await self._deliver(self.on_2fa, hit, mailbox_email):
                        retry = True
                        continue
                    delivered_2fa.add(hit)
                    latest_2fa = hit
                # Keep the existing registry task alive and watching: a repeated
                # request must neither spawn a second poller nor replay an old code.
            elif isinstance(hit, EmailChangeCodeHit) and self.on_email_change_code is not None:
                fresh = hit not in delivered_email_codes and (
                    latest_email_code is None
                    or hit.received_at >= latest_email_code.received_at
                )
                if fresh:
                    if not await self._deliver(self.on_email_change_code, hit, mailbox_email):
                        retry = True
                        continue
                    delivered_email_codes.add(hit)
                    latest_email_code = hit
            else:
                continue
            # Already-delivered or stale codes are marked too: a previous
            # mark may have failed, and they must not resurface after restart.
            await self._mark_seen(mailbox_email, password, consumed_uids)

    @staticmethod
    async def _deliver(callback, hit, mailbox_email: str) -> bool:
        try:
            await callback(hit)
        except Exception as e:  # noqa: BLE001
            log.warning("delivering %s for %s failed, will retry: %s",
                        type(hit).__name__, mailbox_email, e)
            return False
        return True

    async def _mark_seen(self, mailbox_email: str, password: str, uids: list[str]) -> None:
        if not uids:
            return
        try:
            await asyncio.to_thread(self._mark_seen_sync, mailbox_email, password, uids)
        except Exception as e:  # noqa: BLE001
            # The in-memory dedup above still stops a replay within this poller.
            log.warning("marking %s seen failed for %s: %s", uids, mailbox_email, e)

    def _mark_seen_sync(self, mailbox_email: str, password: str, uids: list[str]) -> None:
        with self.factory.open(self.imap_host, self.imap_port, mailbox_email, password) as conn:
            conn.mark_seen(uids)

    def _fetch(self, mailbox_email: str, password: str) -> list:
        with self.factory.open(self.imap_host, self.imap_port, mailbox_email, password) as conn:
            return list(conn.fetch())

    def _detect(
        self, msgs: list, purpose: PollPurpose
    ) -> tuple[ResetHit | TwoFaHit | EmailChangeCodeHit | None, list[str]]:
        """Returns the step's newest hit and the UIDs of every message that
        belongs to this step (allowlisted sender, step subject, parsable)."""
        if purpose is PollPurpose.VERIFY_LINK:
            check = self.detector.check_reset
        elif purpose is PollPurpose.WAIT_EMAIL_CHANGE_CODE:
            check = self.detector.check_email_change_verification
        else:
            check = self.detector.check_2fa
        hit = check(msgs)
        if hit is None:
            return None, []
        uids = [
            m.uid for m in msgs
            if getattr(m, "uid", None) and check([m]) is not None
        ]
        return hit, uids
