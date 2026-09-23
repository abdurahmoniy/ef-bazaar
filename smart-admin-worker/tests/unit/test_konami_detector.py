"""KonamiEmailDetector — heuristic tests with synthetic messages."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import pytest

from smart_admin_worker.imap.detector import (
    EmailChangeCodeHit,
    KonamiEmailDetector,
    ResetHit,
    TwoFaHit,
)


@dataclass
class FakeMsg:
    from_: str
    subject: str
    text: str
    date: datetime


ALLOWLIST = frozenset({
    "noreply@konami.com",
    "no-reply@konami.jp",
    "konami-info@konami.net",
})


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
            subject="[KONAMI ID] Reissue Password",
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
            subject="[KONAMI ID] Reissue Password",
            text="Something went wrong and no link came through.",
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
            subject="[KONAMI ID] Reissue Password",
            text="Click https://id.konami.net/reset to reset.",
        )
    ]
    assert detector.check_reset(msgs) is None


def test_sender_matching_is_case_insensitive(detector):
    msgs = [
        _msg(
            from_="NoReply@Konami.COM",
            subject="[KONAMI ID] Reissue Password",
            text="https://id.konami.net/reset?a=b",
        )
    ]
    assert detector.check_reset(msgs) is not None


def test_2fa_hit_extracts_digit_code_near_keyword(detector):
    msgs = [
        _msg(
            from_="noreply@konami.com",
            subject="[KONAMI ID] Save Data Transfer to New Device",
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
            subject="[KONAMI ID] Save Data Transfer to New Device",
            text="Here are numbers: 12345 for fun.",
        )
    ]
    assert detector.check_2fa(msgs) is None


def test_2fa_rejects_distant_code_from_different_sentence(detector):
    msgs = [
        _msg(
            from_="noreply@konami.com",
            subject="[KONAMI ID] Save Data Transfer to New Device",
            text=(
                "Please note: this notice mentions verification requirements. "
                "By the way, here is a completely unrelated reference number: 998877."
            ),
        )
    ]
    # The keyword "verification" is > 30 chars away from "998877", so no hit.
    assert detector.check_2fa(msgs) is None


# ---- email-change verification code (KONAMI account email update flow) ----


def test_email_change_hit_on_real_konami_body(detector):
    """Matches the exact body Konami sends on account email update — see brief."""
    msgs = [
        _msg(
            from_="konami-info@konami.net",
            subject="[KONAMI ID] Update Email Address",
            text=(
                "Thank you for using a KONAMI ID.\n"
                "Enter the verification code to complete the email address update.\n"
                "247616 is the verification code.\n"
                "Please note that this verification code is only valid for 5 minutes."
            ),
        )
    ]
    hit = detector.check_email_change_verification(msgs)
    assert isinstance(hit, EmailChangeCodeHit)
    assert hit.verification_code == "247616"
    assert hit.sender == "konami-info@konami.net"


def test_email_change_no_hit_when_subject_missing(detector):
    """Body regex alone is not enough — subject must also mention email update.
    This is the belt-and-braces guard against ordinary 2FA login mails whose
    body could otherwise trip the digit-first phrasing."""
    msgs = [
        _msg(
            from_="konami-info@konami.net",
            subject="Weekly newsletter",  # NOT "Update Email Address"
            text="247616 is the verification code. Have a nice day.",
        )
    ]
    assert detector.check_email_change_verification(msgs) is None


def test_email_change_no_hit_on_ordinary_2fa_body(detector):
    """A common 2FA login mail says 'verification code is 123456' (digits at
    the END, keyword first). That shape must NOT match the email-change regex,
    otherwise the seller would see a login code instead of the update code."""
    msgs = [
        _msg(
            from_="noreply@konami.com",
            subject="Your verification code",
            text="Your verification code is 123456. Do not share it.",
        )
    ]
    assert detector.check_email_change_verification(msgs) is None


def test_email_change_no_hit_when_sender_not_allowlisted(detector):
    """Sender allowlist is authoritative — a phishing mail with a matching
    subject+body must still be dropped."""
    msgs = [
        _msg(
            from_="phishing@evil.com",
            subject="[KONAMI ID] Update Email Address",
            text="247616 is the verification code.",
        )
    ]
    assert detector.check_email_change_verification(msgs) is None


# ---- sarlavha qadamga QAT'IY bog'lanadi ----
#
# Konami bir nechta oqimda kod yuboradi va ularning hammasi bitta qutiga
# tushadi. Sarlavha tekshirilmasa, boshqa oqimdan kelgan kod qadamni
# qanoatlantiradi: masalan sotuvchi brauzerda Konami ID ga kirsa,
# xaridorning "Tasdiqlash" tugmasi hech qanday haqiqiy tekshiruvsiz
# ochilardi.


def test_login_code_ignores_the_browser_signin_mail(detector):
    """`[KONAMI ID] Verification Code` — brauzerda Konami ID ga kirish kodi.

    Savdoda umuman ishlatilmaydi. Muhimi: uning sarlavhasi email
    o'zgartirish kodinikining BOSHLANISHI ham emas, ya'ni prefiks
    solishtiruvi ikkalasini chalkashtirmasligi kerak.
    """
    msgs = [
        _msg(
            from_="noreply@konami.com",
            subject="[KONAMI ID] Verification Code",
            text="Your verification code is 483920. Do not share.",
        )
    ]
    assert detector.check_2fa(msgs) is None


def test_login_code_ignores_the_email_change_mail(detector):
    """3-qadamning kodi 6-qadamni ochib yubormasligi kerak."""
    msgs = [
        _msg(
            from_="konami-info@konami.net",
            subject="[KONAMI ID] Update Email Address",
            text="247616 is the verification code.",
        )
    ]
    assert detector.check_2fa(msgs) is None


def test_login_code_reads_a_body_without_the_keyword(detector):
    """Sarlavha aniq bo'lgach, tanadagi 6 raqamli kod yetarli.

    "code" so'ziga bog'lanib qolsak, Konami matnni bir oz o'zgartirsa
    xaridor kodni umuman ololmaydi va savdo qotib qoladi.
    """
    msgs = [
        _msg(
            from_="noreply@konami.com",
            subject="[KONAMI ID] Save Data Transfer to New Device",
            text="Enter 552104 on the device you are transferring to.",
        )
    ]
    hit = detector.check_2fa(msgs)
    assert isinstance(hit, TwoFaHit)
    assert hit.code == "552104"


def test_reset_ignores_any_other_konami_mail(detector):
    """Har bir Konami xatining footerida konami havolasi bor.

    Sarlavha tekshirilmasa, istalgan Konami xati "parol tiklash havolasi
    keldi" bo'lib hisoblanardi va savdo tekshiruvsiz oldinga siljirdi.
    """
    msgs = [
        _msg(
            from_="noreply@konami.com",
            subject="[KONAMI ID] Save Data Transfer to New Device",
            text="Enter 552104. Need help? https://id.konami.net/support",
        )
    ]
    assert detector.check_reset(msgs) is None


def test_email_change_ignores_the_similarly_named_mail(detector):
    """`[KONAMI ID] Verification Code for Email Address Change` — boshqa oqim.

    Savdoda ishlatilmaydi; 3-qadam faqat `Update Email Address` bilan
    bog'langan.
    """
    msgs = [
        _msg(
            from_="konami-info@konami.net",
            subject="[KONAMI ID] Verification Code for Email Address Change",
            text="247616 is the verification code.",
        )
    ]
    assert detector.check_email_change_verification(msgs) is None


def test_subject_matching_survives_case_and_spacing(detector):
    """Sarlavha registri va ortiqcha bo'shliqlari xatning mohiyatini
    o'zgartirmaydi — ular qadamni to'sib qo'ymasligi kerak."""
    msgs = [
        _msg(
            from_="noreply@konami.com",
            subject="  [konami id]   save data transfer to NEW device  ",
            text="Your code is 552104.",
        )
    ]
    assert detector.check_2fa(msgs) is not None
