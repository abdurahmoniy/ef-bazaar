r"""Heuristic classifier: is this Konami email a reset link, a 2FA code, or noise?

Sender allowlist is authoritative — non-allowlisted senders are dropped outright.
Beyond that:

- Reset: any body URL matching `https?://[^\s]*konami[^\s]*`. If sender matches
  but no URL is present, we still return a hit with reset_link_present=False so
  the caller can decide whether to advance state (spec §3.2 STATE 4 says
  "reset link present" is the acceptance signal).

- 2FA: 4-8 digit run near a keyword ("code", "verification", "verify"). If both
  present, return the digit run.
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
