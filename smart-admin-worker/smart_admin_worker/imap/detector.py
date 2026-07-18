r"""Heuristic classifier: is this Konami email a reset link, a 2FA code, or noise?

Sender allowlist is authoritative — non-allowlisted senders are dropped outright.
Beyond that:

- Reset: any body URL matching `https?://[^\s]*konami[^\s]*`. If sender matches
  but no URL is present, we still return a hit with reset_link_present=False so
  the caller can decide whether to advance state (spec §3.2 STATE 4 says
  "reset link present" is the acceptance signal).

- 2FA: 4-8 digit run near a keyword ("code", "verification", "verify"). If both
  present, return the digit run.

- Email-change verification code: Konami sends a 6-digit code to the NEW email
  ("... is the verification code") when the account owner changes their KONAMI
  ID email. Since the escrow mailbox IS the new address, the seller can't see
  this code on their end — smart-admin scrapes it and relays it via a Kafka
  event so the frontend can show it to the seller. We require BOTH subject
  ("update email address") AND body regex to reduce false positives against
  ordinary 2FA logins ("your verification code is ...").
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

_RESET_URL_RE = re.compile(r"https?://[^\s]*konami[^\s]*", re.IGNORECASE)
# NOTE: The brief's literal `[\s:]*` failed its own test case ("verification code is 483920")
# because "is" sits between keyword and digits. `[\sA-Za-z:]{0,30}` bounds the gap to ~30 chars
# (typical short English phrasing) so a keyword can't grab an unrelated distant code from a
# different sentence.
_CODE_RE = re.compile(
    r"(?:code|verification|verify)[\sA-Za-z:]{0,30}([0-9]{4,8})", re.IGNORECASE
)
# Email-change verification: Konami's literal phrasing is "247616 is the
# verification code." — digits come FIRST, followed by "is the verification
# code". This shape is distinctive enough on its own that a general 2FA login
# ("your verification code is 483920") won't trip it, but we still gate on the
# subject line as a belt-and-braces guard.
_EMAIL_CHANGE_CODE_RE = re.compile(
    r"(\d{6})\s+is\s+the\s+verification\s+code", re.IGNORECASE
)
_EMAIL_CHANGE_SUBJECT_RE = re.compile(
    r"update\s+email\s+address", re.IGNORECASE
)


class Msg(Protocol):
    from_: str
    subject: str
    text: str
    date: datetime


@dataclass(frozen=True, slots=True)
class ResetHit:
    sender: str
    received_at: datetime
    reset_link_present: bool


@dataclass(frozen=True, slots=True)
class TwoFaHit:
    sender: str
    received_at: datetime
    code: str


@dataclass(frozen=True, slots=True)
class EmailChangeCodeHit:
    sender: str
    received_at: datetime
    verification_code: str


class KonamiEmailDetector:
    def __init__(self, sender_allowlist: frozenset[str]) -> None:
        # Lowercase everything up-front so per-message check is a single set lookup.
        self._allowed = frozenset(s.lower() for s in sender_allowlist)

    def _sender_ok(self, from_: str) -> bool:
        return from_.strip().lower() in self._allowed

    def check_reset(self, messages: Iterable[Msg]) -> ResetHit | None:
        for m in messages:
            if not self._sender_ok(m.from_):
                continue
            has_url = bool(_RESET_URL_RE.search(m.text or ""))
            return ResetHit(
                sender=m.from_.lower(),
                received_at=m.date,
                reset_link_present=has_url,
            )
        return None

    def check_2fa(self, messages: Iterable[Msg]) -> TwoFaHit | None:
        for m in messages:
            if not self._sender_ok(m.from_):
                continue
            match = _CODE_RE.search(m.text or "")
            if match:
                return TwoFaHit(
                    sender=m.from_.lower(),
                    received_at=m.date,
                    code=match.group(1),
                )
        return None

    def check_email_change_verification(
        self, messages: Iterable[Msg]
    ) -> EmailChangeCodeHit | None:
        """Detect the "[KONAMI ID] Update Email Address" verification email.

        Requires all three: allowlisted sender, subject matching
        ``update email address``, and a body containing ``NNNNNN is the
        verification code``. Missing any one → no hit. This is stricter than
        ``check_2fa`` on purpose — the code is used to authorize a state-
        changing action on the seller's Konami account, so a false positive
        would surface the wrong 6 digits to the seller.
        """
        for m in messages:
            if not self._sender_ok(m.from_):
                continue
            if not _EMAIL_CHANGE_SUBJECT_RE.search(m.subject or ""):
                continue
            match = _EMAIL_CHANGE_CODE_RE.search(m.text or "")
            if match:
                return EmailChangeCodeHit(
                    sender=m.from_.lower(),
                    received_at=m.date,
                    verification_code=match.group(1),
                )
        return None
