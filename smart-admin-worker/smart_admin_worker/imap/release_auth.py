"""Authenticate RFC822 origin for destructive mailbox release, never ordinary mail.

DKIM is verified over the original IMAP octets, using the system's trusted DNS
resolver (not Authentication-Results). Only exact Konami senders with strictly
aligned rsa-sha256 signatures and RSA keys >=1024 bits are accepted. Unsupported
or unverifiable mail stays on the manual hold path.

RFC5322 Date has second precision. We deliberately do NOT round request start
down: a Date earlier than even a fractional request start is rejected. The user
can request a fresh email in the following second. No unsigned freshness signal
can repair an old signed Date.
"""

from __future__ import annotations

import asyncio
import re
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from email import policy
from email.parser import BytesHeaderParser
from email.utils import parsedate_to_datetime

import dkim
from dkim.util import parse_tag_value

MAX_MESSAGE_BYTES = 2 * 1024 * 1024
MAX_HEADER_BYTES = 64 * 1024
MAX_HEADERS = 200
MAX_SIGNATURES = 4
MAX_SIGNATURE_BYTES = 8192
MAX_DNS_BYTES = 2048
DNS_TIMEOUT_SECONDS = 0.5
VERIFY_TIMEOUT_SECONDS = 3.0
ALLOWED_SENDERS = frozenset(
    {
        "noreply@konami.com",
        "no-reply@konami.jp",
        "noreply@konami.net",
        "konami-info@konami.net",
    }
)
_REQUIRED = frozenset({"from", "to", "subject", "date"})
_MIME_HEADERS = frozenset({"mime-version", "content-type", "content-transfer-encoding"})
# A timed-out coroutine does not cancel a running thread or free its slot. This
# caps both executing work and queued work, including during DNS outages.
_SLOTS = threading.BoundedSemaphore(4)
_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="release-dkim")
DnsLookup = Callable[..., bytes | None]


def _aware(value: datetime) -> bool:
    return (
        isinstance(value, datetime) and value.tzinfo is not None and value.utcoffset() is not None
    )


def _single_address(header) -> str | None:
    if header is None or getattr(header, "defects", ()):
        return None
    addresses = getattr(header, "addresses", ())
    if len(addresses) != 1:
        return None
    address = addresses[0].addr_spec
    return address.lower() if address and address.isascii() else None


class ReleaseOriginVerifier:
    """Inject a local DNS function for offline signed fixtures; production uses trusted DNS."""

    def __init__(self, dnsfunc: DnsLookup | None = None) -> None:
        self._dnsfunc = dnsfunc or dkim.get_txt

    async def verify(
        self,
        raw_message: bytes,
        mailbox_email: str,
        started_at: datetime,
        deadline: datetime,
        *,
        now: datetime | None = None,
    ) -> bool:
        if not isinstance(raw_message, bytes) or len(raw_message) > MAX_MESSAGE_BYTES:
            return False
        if not _SLOTS.acquire(blocking=False):
            return False
        loop = asyncio.get_running_loop()

        def execute():
            try:
                return self._verify(
                    raw_message, mailbox_email, started_at, deadline, now or datetime.now(UTC)
                )
            finally:
                # Physical completion must return capacity even if the caller's
                # event loop has already closed after timeout or cancellation.
                _SLOTS.release()

        try:
            work = loop.run_in_executor(_EXECUTOR, execute)
        except Exception:  # noqa: BLE001 -- capacity is released on submission failure
            _SLOTS.release()
            return False
        try:
            result = await asyncio.wait_for(asyncio.shield(work), VERIFY_TIMEOUT_SECONDS)
            return result and (now or datetime.now(UTC)) < deadline
        except Exception:  # noqa: BLE001 -- no unverifiable origin can authorize deletion
            return False

    def _verify(
        self,
        raw: bytes,
        mailbox: str,
        start: datetime,
        end: datetime,
        now: datetime,
    ) -> bool:
        try:
            if not all(_aware(t) for t in (start, end, now)) or not start <= now < end:
                return False
            head, separator, _ = raw.partition(b"\r\n\r\n")
            if not separator or len(head) > MAX_HEADER_BYTES:
                return False
            if (
                b"\n" in head.replace(b"\r\n", b"")
                or b"\r" in head.replace(b"\r\n", b"")
                or b"\0" in head
            ):
                return False
            message = BytesHeaderParser(policy=policy.default).parsebytes(head + separator)
            if message.defects or len(message.items()) > MAX_HEADERS:
                return False
            critical = _REQUIRED | _MIME_HEADERS
            for name in critical:
                values = message.get_all(name, [])
                if len(values) > 1 or (name in _REQUIRED and len(values) != 1):
                    return False
                if values and getattr(message[name], "defects", ()):
                    return False
            sender = _single_address(message["from"])
            recipient = _single_address(message["to"])
            if sender not in ALLOWED_SENDERS or recipient != mailbox.lower():
                return False
            date = parsedate_to_datetime(str(message["date"]))
            if not _aware(date) or not start <= date <= now or not date < end:
                return False
            if not str(message["subject"]).strip():
                return False
            signatures = message.get_all("dkim-signature", [])
            if not 1 <= len(signatures) <= MAX_SIGNATURES:
                return False
            if any(len(str(sig)) > MAX_SIGNATURE_BYTES for sig in signatures):
                return False
            domain = sender.rsplit("@", 1)[1].encode("ascii")
            required = {name.encode() for name in critical if message[name] is not None}
            verifier = dkim.DKIM(raw, minkey=1024, timeout=DNS_TIMEOUT_SECONDS)
            for index, signature in enumerate(signatures):
                try:
                    tags = parse_tag_value(str(signature).encode("ascii"))
                    signed_headers = {h.strip().lower() for h in tags.get(b"h", b"").split(b":")}
                    if tags.get(b"d", b"").lower() != domain or tags.get(b"a") != b"rsa-sha256":
                        continue
                    if b"l" in tags or not required <= signed_headers:
                        continue
                    selector = tags.get(b"s", b"")
                    if not re.fullmatch(
                        rb"[A-Za-z0-9_-]{1,63}(?:\.[A-Za-z0-9_-]{1,63})*", selector
                    ):
                        continue
                    query = selector.lower() + b"._domainkey." + domain + b"."
                    if len(query) > 253:
                        continue

                    def lookup(name, timeout=DNS_TIMEOUT_SECONDS, expected=query):
                        if name.lower() != expected:
                            return None
                        value = self._dnsfunc(name, timeout=min(timeout, DNS_TIMEOUT_SECONDS))
                        return (
                            value
                            if isinstance(value, bytes) and len(value) <= MAX_DNS_BYTES
                            else None
                        )

                    if verifier.verify(idx=index, dnsfunc=lookup):
                        return True
                except Exception:  # noqa: BLE001 -- another eligible signature may verify
                    continue
            return False
        except Exception:  # noqa: BLE001 -- malformed RFC822/DNS/crypto input fails closed
            return False


_DEFAULT = ReleaseOriginVerifier()


async def verify_release_origin(
    raw_message: bytes,
    mailbox_email: str,
    started_at: datetime,
    deadline: datetime,
    *,
    now: datetime | None = None,
) -> bool:
    """Verify the original RFC822 octets; failure never grants release authority."""
    return await _DEFAULT.verify(raw_message, mailbox_email, started_at, deadline, now=now)
