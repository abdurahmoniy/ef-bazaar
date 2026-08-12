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

from humo_userbot.kafka_client import iso_z


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
