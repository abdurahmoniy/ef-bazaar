"""Humo bot message -> structured top-up.

A pure function over text. No Telegram import belongs in this file: keeping it
dependency-free is what makes the filter testable, and the filter is the line
between crediting a real deposit and crediting somebody else's withdrawal.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# "➕ 30.000,00 UZS" — '.' groups thousands, ',' separates decimals.
_AMOUNT = re.compile(r"➕\s*([\d.\s]+(?:,\d+)?)\s*UZS")
# "💳 HUMOCARD *4556"
_CARD = re.compile(r"💳\s*HUMOCARD\s*\*(\d{4})")
# "💰 31.659,16 UZS" — the card balance after the movement.
_BALANCE = re.compile(r"💰\s*([\d.\s]+(?:,\d+)?)\s*UZS")

_TOPUP_MARKER = "To'ldirish"

# Uzbek Latin spells the heading with U+02BB (Toʻldirish); Telegram clients,
# copy-paste and hand-typed fixtures also produce U+02BC, U+2019 and plain
# ASCII. They are the same word, so fold them all before matching the marker.
#
# This deliberately does NOT widen the filter towards withdrawals: '➕' and a
# card tail are still required, and no apostrophe variant turns "Yechish" into
# the top-up heading. What it removes is the opposite failure -- if the real
# Humo message uses U+02BB and the fixture was transcribed with ASCII, the
# marker never matches, nothing is ever credited, and no test would show it.
_APOSTROPHES = str.maketrans(
    {"ʻ": "'", "ʼ": "'", "‘": "'", "’": "'", "´": "'", "`": "'"}
)


@dataclass(frozen=True)
class TopUp:
    amount_tiyin: int
    card_last4: str
    card_balance_tiyin: int | None


def _to_tiyin(raw: str) -> int:
    """'30.000,00' -> 3_000_000 tiyin.

    Integer arithmetic throughout: this is money, and a float would round.
    """
    cleaned = raw.replace(".", "").replace(" ", "").replace(" ", "")
    if "," in cleaned:
        whole, _, frac = cleaned.partition(",")
    else:
        whole, frac = cleaned, "0"
    frac = (frac + "00")[:2]
    return int(whole) * 100 + int(frac)


def parse_topup(text: str | None) -> TopUp | None:
    """Return a TopUp, or None when the message is not one.

    None covers every non-top-up case: withdrawals, balance notices, and
    malformed messages. The caller emits nothing for None.
    """
    if not text:
        return None

    # The marker AND the plus sign must both be present. A withdrawal carries
    # '➖' and a different heading, so either check alone would be enough --
    # requiring both keeps a wording change from silently widening the filter.
    if _TOPUP_MARKER not in text.translate(_APOSTROPHES) or "➕" not in text:
        return None

    amount_match = _AMOUNT.search(text)
    card_match = _CARD.search(text)
    if not amount_match or not card_match:
        return None

    # '➕  UZS' matches the amount pattern on whitespace alone, and converting
    # that would raise on int(''). No digits, no amount, no emit.
    if not any(ch.isdigit() for ch in amount_match.group(1)):
        return None

    balance_match = _BALANCE.search(text)
    return TopUp(
        amount_tiyin=_to_tiyin(amount_match.group(1)),
        card_last4=card_match.group(1),
        card_balance_tiyin=_to_tiyin(balance_match.group(1)) if balance_match else None,
    )
