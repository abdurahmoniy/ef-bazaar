"""Timestamp wire format.

payment-service deserializes both payloads into fixed Java records with
`Instant` fields, and a record it cannot build is dropped silently — no
exception, no log line. The Task 5 ledger entry records exactly that failure
mode costing an afternoon, so the format is pinned by a test rather than left
to `datetime.isoformat()`'s defaults.

smart-admin-worker's kafka/events.py already fixes the house convention:
ISO-8601, second precision, literal 'Z'. This matches it, and matches the
`"observedAt": "2026-08-10T20:41:00Z"` shape the plan documents for this topic.
"""

from datetime import UTC, datetime, timedelta, timezone

from humo_userbot.kafka_client import (
    build_card_credit_payload,
    build_card_debit_payload,
    iso_z,
)


def test_a_utc_datetime_renders_with_a_z_suffix():
    assert iso_z(datetime(2026, 8, 10, 20, 41, 0, tzinfo=UTC)) == "2026-08-10T20:41:00Z"


def test_sub_second_precision_is_dropped_not_appended():
    stamped = datetime(2026, 8, 10, 20, 41, 0, 123456, tzinfo=UTC)
    assert iso_z(stamped) == "2026-08-10T20:41:00Z"


def test_a_non_utc_datetime_is_converted_before_rendering():
    tashkent = datetime(2026, 8, 11, 1, 41, 0, tzinfo=timezone(timedelta(hours=5)))
    assert iso_z(tashkent) == "2026-08-10T20:41:00Z"


def test_a_naive_datetime_is_read_as_local_time():
    """Pyrogram builds message.date with datetime.fromtimestamp(), which is
    naive local time. astimezone() on a naive value assumes local time, which
    is the matching interpretation — so the round trip is lossless whatever
    TZ the container runs in."""
    naive = datetime.now()
    assert iso_z(naive) == iso_z(naive.astimezone(UTC))


def test_the_card_credit_payload_key_set_is_exactly_what_java_expects():
    """These keys are a contract with ByCardService.CardCreditEvent.

    Renaming one leaves every Python and Java test green while every deposit
    silently stops arriving, because the Java side deserializes by field name.
    """
    payload = build_card_credit_payload(
        telegram_message_id=77_001,
        card_last4="4556",
        amount_tiyin=3_000_000,
        card_balance_tiyin=3_165_916,
        observed_at=datetime(2026, 8, 10, 20, 41, tzinfo=UTC),
        raw_text="🎉 To'ldirish",
    )

    assert set(payload) == {
        "telegramMessageId",
        "cardLast4",
        "amountTiyin",
        "cardBalanceTiyin",
        "observedAt",
        "rawText",
    }
    assert payload["observedAt"] == "2026-08-10T20:41:00Z"
    assert payload["amountTiyin"] == 3_000_000


def test_a_missing_card_balance_stays_null_rather_than_zero():
    """cardBalanceTiyin is Long on the Java side: null means unknown, 0 means empty."""
    payload = build_card_credit_payload(
        telegram_message_id=1,
        card_last4="4556",
        amount_tiyin=100,
        card_balance_tiyin=None,
        observed_at=datetime(2026, 8, 10, 20, 41, tzinfo=UTC),
        raw_text="x",
    )
    assert payload["cardBalanceTiyin"] is None


def test_the_card_debit_payload_key_set_is_exactly_what_java_expects():
    """A contract with ByCardDebitService.CardDebitEvent, same as the credit one.

    Deliberately a different key set from the credit payload: they go to
    different topics and different tables, and a debit that reached the credit
    table could be "attributed" to a user by an admin — turning money that LEFT
    a card into a wallet credit.
    """
    payload = build_card_debit_payload(
        telegram_message_id=88_002,
        card_last4="4962",
        amount_tiyin=1_000_000,
        commission_tiyin=0,
        card_balance_tiyin=4_400_000,
        description="Openbank P2P HUMO OT",
        observed_at=datetime(2026, 9, 10, 20, 34, tzinfo=UTC),
        raw_text="💸 Amaliyot",
    )

    assert set(payload) == {
        "telegramMessageId",
        "cardLast4",
        "amountTiyin",
        "commissionTiyin",
        "cardBalanceTiyin",
        "description",
        "observedAt",
        "rawText",
    }
    assert payload["observedAt"] == "2026-09-10T20:34:00Z"
    assert payload["amountTiyin"] == 1_000_000


def test_a_debit_amount_is_always_positive_on_the_wire():
    """The sign is the topic, not the number. A negative amount here would be
    negated a second time on the Java side and read as a credit."""
    payload = build_card_debit_payload(
        telegram_message_id=1,
        card_last4="4962",
        amount_tiyin=1_000_000,
        commission_tiyin=None,
        card_balance_tiyin=None,
        description=None,
        observed_at=datetime(2026, 9, 10, 20, 34, tzinfo=UTC),
        raw_text="x",
    )
    assert payload["amountTiyin"] > 0


def test_an_absent_commission_stays_null_rather_than_zero():
    """0 means the bank charged nothing; null means it did not say."""
    payload = build_card_debit_payload(
        telegram_message_id=2,
        card_last4="7272",
        amount_tiyin=402_000,
        commission_tiyin=None,
        card_balance_tiyin=98_000,
        description=None,
        observed_at=datetime(2026, 9, 10, 20, 43, tzinfo=UTC),
        raw_text="x",
    )
    assert payload["commissionTiyin"] is None
