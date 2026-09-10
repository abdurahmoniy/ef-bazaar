"""Humo bot message -> structured movement.

Two pure functions over text, one per direction. No Telegram import belongs in
this file: keeping it dependency-free is what makes the filter testable, and
the filter is the line between crediting a real deposit and crediting somebody
else's withdrawal.

The two are deliberately symmetrical and deliberately exclusive: a message
carrying the other direction's sign is refused outright by both, so no text can
ever be read as a top-up AND a debit.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# "➕ 30.000,00 UZS" — '.' groups thousands, ',' separates decimals.
_AMOUNT = re.compile(r"➕\s*([\d.\s]+(?:,\d+)?)\s*UZS")
# "💳 VISA *4962", "💳 HUMOCARD *4556", "💳 UZCARD *1234".
#
# The brand is NOT matched. It used to demand "HUMOCARD" and the first real
# production message was a VISA issued by Hamkorbank, so nothing was credited.
# The platform's own cards can be any of the four brands PlatformCardResponse
# already models, and the brand is not what makes a card ours: payment-service
# looks the tail up with findActiveByLast4 and IGNOREs anything it does not
# own. Matching the brand here only invented a way to miss our own money.
#
# The (?!\d) stops a longer tail from being read as its own first four digits,
# which could name a DIFFERENT platform card.
_CARD = re.compile(r"💳[^*\n]*\*(\d{4})(?!\d)")
# "💰 31.659,16 UZS" — the card balance after the movement.
_BALANCE = re.compile(r"💰\s*([\d.\s]+(?:,\d+)?)\s*UZS")

# "➖ 10.000,00 UZS" — the mirror of _AMOUNT.
_DEBIT_AMOUNT = re.compile(r"➖\s*([\d.\s]+(?:,\d+)?)\s*UZS")
# "⚠️ Komissiya: 0,00 UZS" — absent on some notices, so always optional.
_COMMISSION = re.compile(r"Komissiya:\s*([\d.\s]+(?:,\d+)?)\s*UZS")
# "📍 Openbank P2P HUMO OT" — where the money went. Free text from the bank:
# it is stored and shown to admins, never parsed for meaning.
_DESCRIPTION = re.compile(r"📍\s*(.+)")

_TOPUP_MARKER = "To'ldirish"

# Words that turn the top-up heading into its opposite. Matched on the heading
# line only, case-folded. If Humo never sends these the filter is unchanged; if
# it does, we decline to credit -- which is the safe direction either way.
_NEGATIONS = ("bekor", "rad etil", "qaytar", "amalga oshmadi", "muvaffaqiyatsiz")

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
    # Strip everything that is not a digit or the decimal comma. The amount
    # pattern admits any Unicode space, so listing the separators by hand
    # missed U+202F (narrow no-break space) and int() raised on it.
    cleaned = re.sub(r"[^\d,]", "", raw)
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

    # Each check below narrows the same question: is this message ONE top-up,
    # and only a top-up? Requiring the heading and the '➕' was not enough --
    # both tokens can appear in a message that is not a deposit at all.
    folded = text.translate(_APOSTROPHES)

    # A withdrawal marker anywhere means do not credit, full stop. Humo puts a
    # footer like "Oldingi To'ldirish: ➕ 10.000,00 UZS" on withdrawal notices,
    # and searching the markers independently over the whole text would read
    # that footer as this message's amount -- crediting money nobody sent.
    if "➖" in text:
        return None

    # The heading has to BE the message, not appear somewhere inside it.
    first_line = folded.splitlines()[0]
    if _TOPUP_MARKER not in first_line:
        return None

    # "To'ldirish bekor qilindi" is a reversal: the heading and the plus sign
    # are both present and it is the opposite of a deposit.
    if any(word in first_line.casefold() for word in _NEGATIONS):
        return None

    # More than one record in one message (a digest, a "last operations"
    # summary) means the amount and the card tail may belong to different
    # rows. Refuse rather than guess: an unmatched payment is an admin's
    # problem, a mis-attributed one is a user's money.
    amounts = _AMOUNT.findall(text)
    cards = _CARD.findall(text)
    if len(amounts) != 1 or len(cards) != 1:
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


@dataclass(frozen=True)
class Debit:
    """Money that LEFT one of the platform's cards.

    Purely an observation. payment-service does not post it to the ledger —
    a payout is already written there when an admin closes the withdrawal
    ticket, and a second posting would count every payout twice.
    """

    amount_tiyin: int
    card_last4: str
    card_balance_tiyin: int | None
    commission_tiyin: int | None
    description: str | None


def parse_debit(text: str | None) -> Debit | None:
    """Return a Debit, or None when the message is not one.

    The mirror of :func:`parse_topup`, and the checks are deliberately the same
    ones in the same order — the two functions must never both accept the same
    text.

    No heading is required. Real captures say "💸 Amaliyot" where an earlier
    reconstruction guessed "💸 Yechish", which is exactly the failure the card
    pattern's comment above records: pinning a literal the bank never promised
    is how a filter stops seeing real money. The direction sign and a single
    card tail are what identify this message.
    """
    if not text:
        return None

    # A top-up marker anywhere means this is not a debit, full stop. Humo puts
    # an "Oldingi To'ldirish: ➕ ..." footer on some notices, and reading that
    # footer's card tail as this message's would attribute the movement to
    # whatever card the previous operation touched.
    if "➕" in text:
        return None

    folded = text.translate(_APOSTROPHES)
    first_line = folded.splitlines()[0]

    # "Yechish bekor qilindi" — the money came back. Recording it as a debit
    # would show the card draining twice for one reversal.
    if any(word in first_line.casefold() for word in _NEGATIONS):
        return None

    # A digest carrying several rows: the amount and the card tail may belong
    # to different ones. Refuse rather than guess.
    amounts = _DEBIT_AMOUNT.findall(text)
    cards = _CARD.findall(text)
    if len(amounts) != 1 or len(cards) != 1:
        return None

    amount_match = _DEBIT_AMOUNT.search(text)
    card_match = _CARD.search(text)
    if not amount_match or not card_match:
        return None

    # '➖  UZS' matches on whitespace alone and int('') would raise.
    if not any(ch.isdigit() for ch in amount_match.group(1)):
        return None

    commission_match = _COMMISSION.search(text)
    balance_match = _BALANCE.search(text)
    description_match = _DESCRIPTION.search(text)

    return Debit(
        amount_tiyin=_to_tiyin(amount_match.group(1)),
        card_last4=card_match.group(1),
        card_balance_tiyin=_to_tiyin(balance_match.group(1)) if balance_match else None,
        commission_tiyin=(
            _to_tiyin(commission_match.group(1))
            if commission_match and any(ch.isdigit() for ch in commission_match.group(1))
            else None
        ),
        description=description_match.group(1).strip() if description_match else None,
    )
