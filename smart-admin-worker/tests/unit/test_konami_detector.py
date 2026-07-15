"""KonamiEmailDetector — heuristic tests with synthetic messages."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import pytest

from smart_admin_worker.imap.detector import KonamiEmailDetector, ResetHit, TwoFaHit


@dataclass
class FakeMsg:
    from_: str
    subject: str
    text: str
    date: datetime


ALLOWLIST = frozenset({"noreply@konami.com", "no-reply@konami.jp"})


@pytest.fixture
def detector():
    return KonamiEmailDetector(sender_allowlist=ALLOWLIST)


def _msg(**kw):
    defaults = dict(
        from_="",
        subject="",
        text="",
        date=datetime(2026, 7, 15, tzinfo=UTC),
    )
    defaults.update(kw)
    return FakeMsg(**defaults)


def test_reset_hit_when_konami_sender_and_reset_url(detector):
    msgs = [
        _msg(
            from_="noreply@konami.com",
            subject="Konami — Password reset",
            text="Click https://id.konami.net/reset?token=abc123 to reset.",
        )
    ]
    hit = detector.check_reset(msgs)
    assert isinstance(hit, ResetHit)
    assert hit.sender == "noreply@konami.com"
    assert hit.reset_link_present is True


def test_reset_hit_but_no_link_marks_link_false(detector):
    msgs = [
        _msg(
            from_="noreply@konami.com",
            subject="Konami newsletter",
            text="Buy PES 2027 now! No reset here.",
        )
    ]
    hit = detector.check_reset(msgs)
    # Sender matches but body has no konami URL → returns hit with False so caller can decide.
    assert hit is not None
    assert hit.reset_link_present is False


def test_reset_not_hit_when_sender_not_in_allowlist(detector):
    msgs = [
        _msg(
            from_="phishing@evil.com",
            subject="Password reset",
            text="Click https://id.konami.net/reset to reset.",
        )
    ]
    assert detector.check_reset(msgs) is None


def test_sender_matching_is_case_insensitive(detector):
    msgs = [
        _msg(
            from_="NoReply@Konami.COM",
            subject="reset",
            text="https://id.konami.net/reset?a=b",
        )
    ]
    assert detector.check_reset(msgs) is not None


def test_2fa_hit_extracts_digit_code_near_keyword(detector):
    msgs = [
        _msg(
            from_="noreply@konami.com",
            subject="Your verification code",
            text="Your verification code is 483920. Do not share.",
        )
    ]
    hit = detector.check_2fa(msgs)
    assert isinstance(hit, TwoFaHit)
    assert hit.code == "483920"


def test_2fa_no_hit_without_keyword(detector):
    msgs = [
        _msg(
            from_="noreply@konami.com",
            subject="Weekly digest",
            text="Here are numbers: 12345 for fun.",
        )
    ]
    assert detector.check_2fa(msgs) is None
