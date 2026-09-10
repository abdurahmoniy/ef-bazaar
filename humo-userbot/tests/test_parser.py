"""Parser tests over captured Humo bot messages.

No Telegram, no network, no Kafka — parse_topup is a pure function and this
file is what proves the filter that separates a top-up from a withdrawal.

Every fixture is a module-level constant and every test derives its input from
one of them. Real captures can therefore be pasted over the constants below
without touching a single assertion.

Fixture provenance:
  TOPUP       — a real captured message from the Humo card bot.
  WITHDRAWAL  — a real captured debit notice. It replaced a reconstruction
                that guessed the heading as "Yechish"; the bank actually
                sends "Amaliyot", which is why parse_debit keys off the
                direction sign rather than a heading literal. This is the
                highest-consequence fixture in the service: a withdrawal
                misread as a top-up credits a user money nobody sent, and
                payment-service trusts this output by design.
  WITHDRAWAL_NO_COMMISSION
              — a second real capture. Same shape, no commission line, which
                is why commission is optional everywhere.
  OTHER_CARD  — RECONSTRUCTED. A balance notice that carries neither the
                top-up heading nor the plus sign.
"""

from humo_userbot.parser import parse_debit, parse_topup

TOPUP = (
    "🎉 To'ldirish\n"
    "➕ 30.000,00 UZS\n"
    "📍 PAYME AJ P2P HUMO2H\n"
    "💳 HUMOCARD *4556\n"
    "🕓 20:41 10.08.2026\n"
    "💰 31.659,16 UZS"
)

WITHDRAWAL = (
    "💸 Amaliyot\n"
    "➖ 10.000,00 UZS\n"
    "⚠️ Komissiya: 0,00 UZS\n"
    "📍 Openbank P2P HUMO OT\n"
    "💳 VISA *4962\n"
    "🕓 01:34 11.09.2026\n"
    "💰 44.000,00 UZS"
)

WITHDRAWAL_NO_COMMISSION = (
    "💸 Amaliyot\n"
    "➖ 4.020,00 UZS\n"
    "📍 SQB MOBILE HUMO P2P\n"
    "💳 HUMOCARD *7272\n"
    "🕓 01:43 11.09.2026\n"
    "💰 980,00 UZS"
)

OTHER_CARD = "Sizning balansingiz: 31.659,16 UZS"

# Captured from production on 2026-08-14, the first real transfer this service
# ever saw. It did NOT parse: the card pattern demanded the literal "HUMOCARD"
# and the platform's card is a Hamkorbank-issued VISA. Nothing was credited.
# Note the commission line, which the reconstructed fixtures did not have.
PRODUCTION_VISA = (
    "🎉 To'ldirish\n"
    "➕ 1.000,00 UZS\n"
    "⚠️ Komissiya: 0,00 UZS\n"
    "📍 HAMKORBANK PAYME AJ\n"
    "💳 VISA *4962\n"
    "🕓 08:21 14.08.2026\n"
    "💰 1.000,00 UZS"
)


def test_a_topup_is_parsed():
    result = parse_topup(TOPUP)
    assert result is not None
    assert result.amount_tiyin == 3_000_000
    assert result.card_last4 == "4556"
    assert result.card_balance_tiyin == 3_165_916


def test_a_withdrawal_is_not_a_topup():
    assert parse_topup(WITHDRAWAL) is None


def test_a_withdrawal_wearing_the_topup_heading_is_still_rejected():
    """Both the heading and the '➕' are required, so half a match emits nothing.

    Neither check alone is load-bearing today. Requiring both is what makes a
    future wording change on Humo's side fail closed — we stop crediting —
    instead of failing open and crediting a withdrawal.
    """
    assert parse_topup(WITHDRAWAL.replace("💸 Amaliyot", "🎉 To'ldirish")) is None
    assert parse_topup(TOPUP.replace("🎉 To'ldirish", "💸 Amaliyot")) is None


def test_a_small_amount_without_a_thousands_separator():
    text = TOPUP.replace("➕ 30.000,00 UZS", "➕ 1.000,00 UZS")
    result = parse_topup(text)
    assert result is not None
    assert result.amount_tiyin == 100_000


def test_the_bumped_amount_survives_the_decimal_conversion():
    text = TOPUP.replace("➕ 30.000,00 UZS", "➕ 100.100,00 UZS")
    result = parse_topup(text)
    assert result is not None
    assert result.amount_tiyin == 10_010_000


def test_a_non_zero_decimal_part_is_kept():
    text = TOPUP.replace("➕ 30.000,00 UZS", "➕ 30.000,55 UZS")
    result = parse_topup(text)
    assert result is not None
    assert result.amount_tiyin == 3_000_055


def test_an_amount_a_float_would_round_is_exact():
    """8 199 999,99 UZS is 819 999 999 tiyin.

    float('8199999.99') * 100 is 819999998.9999999, which int() truncates to
    819_999_998 — one tiyin short. This test fails the moment anyone
    reintroduces floating point into the conversion.
    """
    text = TOPUP.replace("➕ 30.000,00 UZS", "➕ 8.199.999,99 UZS")
    result = parse_topup(text)
    assert result is not None
    assert result.amount_tiyin == 819_999_999


def test_a_message_without_a_card_tail_is_rejected():
    text = "\n".join(line for line in TOPUP.splitlines() if "HUMOCARD" not in line)
    assert parse_topup(text) is None


def test_a_message_without_an_amount_is_rejected():
    text = "\n".join(line for line in TOPUP.splitlines() if "➕" not in line)
    assert parse_topup(text) is None


def test_a_missing_balance_line_still_parses():
    text = "\n".join(line for line in TOPUP.splitlines() if "💰" not in line)
    result = parse_topup(text)
    assert result is not None
    assert result.amount_tiyin == 3_000_000
    assert result.card_balance_tiyin is None


def test_empty_and_none_are_safe():
    assert parse_topup("") is None
    assert parse_topup(None) is None


def test_an_unrelated_message_is_ignored():
    assert parse_topup(OTHER_CARD) is None


def test_every_apostrophe_spelling_of_the_heading_is_understood():
    """Uzbek Latin writes it Toʻldirish (U+02BB), not To'ldirish (ASCII).

    The fixture above was transcribed with an ASCII apostrophe. If the real
    Humo message uses U+02BB and the parser demands ASCII, the marker never
    matches: the userbot runs, logs nothing unusual, and credits nobody --
    forever. Every test here would still pass. So fold the variants.
    """
    for apostrophe in ["'", "ʻ", "ʼ", "’", "‘"]:
        text = TOPUP.replace("To'ldirish", f"To{apostrophe}ldirish")
        result = parse_topup(text)
        assert result is not None, f"U+{ord(apostrophe):04X} was not recognised"
        assert result.amount_tiyin == 3_000_000


def test_folding_the_apostrophe_does_not_let_a_withdrawal_through():
    """The widened marker must not widen the filter towards withdrawals.

    No apostrophe spelling turns "Yechish" into the top-up heading, and '➕'
    plus a card tail are still required.
    """
    for apostrophe in ["'", "ʻ", "ʼ", "’", "‘"]:
        assert parse_topup(WITHDRAWAL.replace("'", apostrophe)) is None


def test_a_withdrawal_that_mentions_a_previous_topup_is_not_a_topup():
    """The message is a WITHDRAWAL; the top-up words are in its footer.

    Searching the heading, the '➕' and the card tail independently over the
    whole text read that footer as this message's amount and credited 10 000
    UZS that nobody sent. A '➖' anywhere now ends it.
    """
    text = (
        "💸 Yechish\n"
        "➖ 50.000,00 UZS\n"
        "💳 HUMOCARD *4556\n"
        "Oldingi To'ldirish: ➕ 10.000,00 UZS"
    )
    assert parse_topup(text) is None


def test_a_reversed_topup_is_not_a_topup():
    """"To'ldirish bekor qilindi" carries the heading AND the plus sign.

    It is the exact opposite of a deposit, and it used to parse as one.
    """
    for heading in [
        "🎉 To'ldirish bekor qilindi",
        "🎉 To'ldirish rad etildi",
        "🎉 To'ldirish qaytarildi",
    ]:
        text = TOPUP.replace("🎉 To'ldirish", heading)
        assert parse_topup(text) is None, f"{heading!r} was read as a top-up"


def test_a_digest_carrying_two_records_is_refused():
    """Two records in one message: the amount and the tail may be different rows.

    Refusing sends it to the admin queue. Guessing sends someone else's money
    to the wrong wallet.
    """
    two_topups = TOPUP + "\n\n" + TOPUP.replace("*4556", "*9999")
    assert parse_topup(two_topups) is None


def test_the_heading_must_be_the_first_line():
    """A top-up quoted inside some other notice is not this message's subject."""
    text = "📊 Kunlik hisobot\n" + TOPUP
    assert parse_topup(text) is None


def test_a_longer_card_tail_is_not_truncated_to_another_card():
    """*45567 must not be read as card *4556, which may be a different card."""
    text = TOPUP.replace("HUMOCARD *4556", "HUMOCARD *45567")
    assert parse_topup(text) is None


def test_a_narrow_no_break_space_separator_is_rejected_not_raised():
    """U+202F reached int() and raised, aborting before the log line."""
    text = TOPUP.replace("➕ 30.000,00 UZS", "➕ 30 000,00 UZS")
    result = parse_topup(text)
    assert result is None or result.amount_tiyin == 3_000_000


def test_a_plus_sign_with_no_digits_is_rejected_not_raised():
    """'➕  UZS' matches the amount pattern on whitespace alone.

    Converting that would raise ValueError on int(''), which aborts the
    handler before it can log what happened. Rejecting it keeps the failure
    closed and legible.
    """
    text = TOPUP.replace("➕ 30.000,00 UZS", "➕  UZS")
    assert parse_topup(text) is None


def test_the_first_real_production_message_parses():
    """The capture that proved the brand check was wrong.

    The parser demanded "HUMOCARD" and production sent a VISA, so the transfer
    was silently not credited. The brand is not what makes a card ours --
    payment-service resolves the tail with findActiveByLast4 and ignores what
    it does not own.
    """
    result = parse_topup(PRODUCTION_VISA)
    assert result is not None
    assert result.amount_tiyin == 100_000
    assert result.card_last4 == "4962"
    assert result.card_balance_tiyin == 100_000


def test_the_commission_line_is_not_read_as_the_amount():
    """"Komissiya: 0,00 UZS" is an amount-shaped line without a plus sign.

    If it were ever counted the multi-record guard would refuse the message,
    and a non-zero commission could be credited instead of the transfer.
    """
    bumped = PRODUCTION_VISA.replace("Komissiya: 0,00 UZS", "Komissiya: 500,00 UZS")
    result = parse_topup(bumped)
    assert result is not None
    assert result.amount_tiyin == 100_000


def test_every_card_brand_the_platform_supports_is_read():
    """PlatformCardResponse models four brands; the parser must read them all."""
    for brand in ["VISA", "HUMOCARD", "UZCARD", "MASTERCARD", "HUMO"]:
        text = PRODUCTION_VISA.replace("VISA *4962", f"{brand} *4962")
        result = parse_topup(text)
        assert result is not None, f"{brand} was not recognised"
        assert result.card_last4 == "4962"


# --- debits ----------------------------------------------------------------
#
# The mirror of everything above. A debit is never credited to anybody — it is
# recorded and announced — so the failure that matters here is the opposite
# one: a debit that goes unnoticed leaves the card balance on the dashboard
# saying money is still there when it is gone.


def test_a_real_debit_notice_is_parsed_whole():
    result = parse_debit(WITHDRAWAL)
    assert result is not None
    assert result.amount_tiyin == 1_000_000
    assert result.card_last4 == "4962"
    assert result.card_balance_tiyin == 4_400_000
    assert result.commission_tiyin == 0
    assert result.description == "Openbank P2P HUMO OT"


def test_a_debit_without_a_commission_line_parses_with_commission_unknown():
    """None, not 0: the bank did not say, and "no commission charged" is a
    different statement from "the notice omitted the line"."""
    result = parse_debit(WITHDRAWAL_NO_COMMISSION)
    assert result is not None
    assert result.amount_tiyin == 402_000
    assert result.card_last4 == "7272"
    assert result.card_balance_tiyin == 98_000
    assert result.commission_tiyin is None
    assert result.description == "SQB MOBILE HUMO P2P"


def test_a_topup_is_never_read_as_a_debit():
    assert parse_debit(TOPUP) is None


def test_a_debit_is_never_read_as_a_topup():
    assert parse_topup(WITHDRAWAL) is None
    assert parse_topup(WITHDRAWAL_NO_COMMISSION) is None


def test_the_two_parsers_never_both_accept_one_message():
    """The property the whole design rests on. If this ever fails, one Telegram
    message becomes two observations of opposite sign on the same card."""
    for fixture in (TOPUP, WITHDRAWAL, WITHDRAWAL_NO_COMMISSION, OTHER_CARD):
        assert not (parse_topup(fixture) and parse_debit(fixture))


def test_no_heading_is_required_because_the_bank_changed_it_once_already():
    """The captured heading is "Amaliyot"; an earlier reconstruction guessed
    "Yechish". Pinning either literal is how this filter would stop seeing real
    money the next time the bank rewords it."""
    assert parse_debit(WITHDRAWAL.replace("💸 Amaliyot", "💸 Yechish")) is not None
    assert parse_debit(WITHDRAWAL.replace("💸 Amaliyot", "🔔 Bildirishnoma")) is not None


def test_a_reversed_debit_is_not_recorded_as_one():
    """"Yechish bekor qilindi" — the money came back. Recording it would show
    the card draining twice for one reversal."""
    assert parse_debit(WITHDRAWAL.replace("💸 Amaliyot", "💸 Yechish bekor qilindi")) is None


def test_a_digest_carrying_two_debits_is_refused_rather_than_guessed():
    doubled = WITHDRAWAL + "\n➖ 5.000,00 UZS\n💳 HUMOCARD *7272"
    assert parse_debit(doubled) is None


def test_a_debit_whose_footer_mentions_a_topup_is_refused():
    """Humo appends "Oldingi To'ldirish: ➕ ..." to some notices. Reading that
    footer's card tail as this message's would attribute the movement to
    whatever card the previous operation touched."""
    with_footer = WITHDRAWAL + "\nOldingi To'ldirish: ➕ 10.000,00 UZS"
    assert parse_debit(with_footer) is None


def test_a_debit_with_no_balance_line_still_parses():
    text = "\n".join(
        line for line in WITHDRAWAL.splitlines() if not line.startswith("💰")
    )
    result = parse_debit(text)
    assert result is not None
    assert result.card_balance_tiyin is None


def test_a_debit_with_no_description_still_parses():
    text = "\n".join(
        line for line in WITHDRAWAL.splitlines() if not line.startswith("📍")
    )
    result = parse_debit(text)
    assert result is not None
    assert result.description is None


def test_an_empty_message_is_not_a_debit():
    assert parse_debit(None) is None
    assert parse_debit("") is None


def test_a_debit_sign_with_no_digits_emits_nothing():
    assert parse_debit("💸 Amaliyot\n➖  UZS\n💳 VISA *4962") is None
