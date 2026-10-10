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


# Konami pochta Konami ID ga ulanmagan bo'lsa ham AYNAN SHU sarlavha bilan
# javob qaytaradi. Footerdagi havolalar avval "tiklash havolasi" deb olinib,
# savdo email o'tkazilmagan bo'lsa ham keyingi qadamga o'tib ketardi.
NOT_REGISTERED_BODY = """Thank you for using a KONAMI ID.

This email address is not registered to a KONAMI ID.
On the following page, please try again using the email address registered to your KONAMI ID.
https://my.konami.net/

This email has been automatically sent from the KONAMI ID Portal site.
This is an automated email response and cannot be replied to.

Inquiries: Konami Digital Entertainment Co., Ltd.
3-4-8, Ariake, Koto-ku, Tokyo 135-0063, Japan
https://www.konami.com/games/inquiry/form/konami_id/en/
"""


def test_not_registered_reply_is_not_a_reset_link(detector):
    msgs = [
        _msg(
            from_="konami-info@konami.net",
            subject="[KONAMI ID] Reissue Password",
            text=NOT_REGISTERED_BODY,
        )
    ]
    hit = detector.check_reset(msgs)
    assert hit is not None
    assert hit.reset_link_present is False
    # Sotuvchiga "email o'tkazilmagan" deb aytish uchun alohida belgi.
    assert hit.email_not_registered is True


def test_real_reset_mail_is_not_flagged_not_registered(detector):
    msgs = [
        _msg(
            from_="konami-info@konami.net",
            subject="【KONAMI ID】パスワードの再発行",
            text=JA_RESET_BODY,
        )
    ]
    assert detector.check_reset(msgs).email_not_registered is False


def test_konami_links_without_reset_path_are_not_a_reset_link(detector):
    """Tanada faqat bosh sahifa yoki murojaat formasi bo'lsa — bu tiklash
    havolasi emas, hatto rad etuvchi jumla boshqacha yozilgan bo'lsa ham."""
    msgs = [
        _msg(
            from_="konami-info@konami.net",
            subject="[KONAMI ID] Reissue Password",
            text="See https://my.konami.net/ or "
                 "https://www.konami.com/games/inquiry/form/konami_id/en/",
        )
    ]
    assert detector.check_reset(msgs).reset_link_present is False


def test_english_reset_link_on_my_konami_is_accepted(detector):
    msgs = [
        _msg(
            from_="konami-info@konami.net",
            subject="[KONAMI ID] Reissue Password",
            text="https://my.konami.net/en/password-reminder/register-password"
                 "?put=LlGYLKNt2CnmsoCE8rbBicV0yT0qxRI8\n"
                 "https://www.konami.com/games/inquiry/form/konami_id/en/",
        )
    ]
    assert detector.check_reset(msgs).reset_link_present is True


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


# ---- yapon tilidagi xatlar ----
#
# Konami akkount tili yaponcha bo'lsa xatlar ham yaponcha keladi. Sarlavha
# faqat inglizchaga bog'langanda 4-qadam butunlay to'xtardi, 3- va 6-qadam
# esa hech qachon ishlamagan: `確認コード` lotincha kalit so'zlarga tushmaydi.

JA_LOGIN_BODY = """KONAMI IDをご利用いただき、誠にありがとうございます。
確認コード：273685
※確認コードの有効期限は5分です。

KONAMI IDのログイン操作を受付けました。
お客様がご自身で行われた操作である場合は、以下の確認コードを入力してログインしてください。

【重要】
当社がSNSを通じてお客様から確認コードをお聞きすることは、ございません。
"""

JA_EMAIL_CHANGE_BODY = """KONAMI IDをご利用いただき、誠にありがとうございます。

189467 が確認コードです。

確認コードの有効期限は5分です。
"""

JA_RESET_BODY = """KONAMI IDをご利用いただき、誠にありがとうございます。
2026/09/22 03:51:40 JST

■パスワードの再発行

https://my.konami.net/ja/password-reminder/register-password?put=LlGYLKNt2CnmsoCE8rbBicV0yT0qxRI8

このURLの有効期限は60分です。
"""


def test_japanese_login_code_is_read(detector):
    """`確認コード：273685` — kalit so'zdan keyin raqam, ikki nuqta to'liq kenglikda."""
    msgs = [
        _msg(
            from_="konami-info@konami.net",
            subject="【KONAMI ID】ログイン用の確認コード",
            text=JA_LOGIN_BODY,
        )
    ]
    hit = detector.check_2fa(msgs)
    assert isinstance(hit, TwoFaHit)
    assert hit.code == "273685"


def test_japanese_login_body_ignores_the_phishing_warning(detector):
    """Xatda `確認コード` yana ikki marta uchraydi (fishing ogohlantirishida).

    Ulardan keyin raqam kelmaydi, ya'ni birinchi mos kelgani — haqiqiy kod.
    """
    hit = detector.check_2fa([
        _msg(
            from_="konami-info@konami.net",
            subject="【KONAMI ID】ログイン用の確認コード",
            text=JA_LOGIN_BODY,
        )
    ])
    assert hit.code == "273685"


def test_japanese_email_change_code_is_read(detector):
    """`189467 が確認コードです。` — inglizchaning aynan ko'zgusi: avval raqam."""
    msgs = [
        _msg(
            from_="konami-info@konami.net",
            subject="【KONAMI ID】メールアドレスの更新",
            text=JA_EMAIL_CHANGE_BODY,
        )
    ]
    hit = detector.check_email_change_verification(msgs)
    assert isinstance(hit, EmailChangeCodeHit)
    assert hit.verification_code == "189467"


def test_japanese_reset_mail_is_accepted(detector):
    """Bu yerda regressiya bor edi: sarlavha inglizchaga bog'langach,
    yaponcha parol tiklash xati o'tmay qoldi va 4-qadam to'xtardi."""
    msgs = [
        _msg(
            from_="konami-info@konami.net",
            subject="【KONAMI ID】パスワードの再発行",
            text=JA_RESET_BODY,
        )
    ]
    hit = detector.check_reset(msgs)
    assert isinstance(hit, ResetHit)
    assert hit.reset_link_present is True


def test_japanese_login_mail_does_not_satisfy_other_steps(detector):
    """Har til uchun ham chegara bir xil: kirish xati parol tiklashni ham,
    email o'zgartirishni ham tasdiqlamaydi."""
    msgs = [
        _msg(
            from_="konami-info@konami.net",
            subject="【KONAMI ID】ログイン用の確認コード",
            text=JA_LOGIN_BODY,
        )
    ]
    assert detector.check_reset(msgs) is None
    assert detector.check_email_change_verification(msgs) is None


def test_english_login_verification_mail_is_accepted(detector):
    """`[KONAMI ID] Verification Code` — xaridor akkountga kirganda ham shu
    sarlavha bilan keladi, shuning uchun 6-qadamga qo'shildi.

    Ongli chegirma: bu xat Konami ID ga ISTALGAN kirishda keladi. Kod faqat
    qabul qiluvchi tomonga ko'rsatiladi va tugmani baribir o'zi bosadi.
    """
    msgs = [
        _msg(
            from_="konami-info@konami.net",
            subject="[KONAMI ID] Verification Code",
            text="Your verification code is 483920.",
        )
    ]
    hit = detector.check_2fa(msgs)
    assert hit is not None and hit.code == "483920"


def test_email_change_notice_is_not_a_login_code(detector):
    """`Verification Code for Email Address Change` — alohida sarlavha.

    Solishtiruv TO'LIQ tenglik bilan, shuning uchun u yuqoridagi
    `Verification Code` ga qo'shilib ketmaydi.
    """
    msgs = [
        _msg(
            from_="konami-info@konami.net",
            subject="[KONAMI ID] Verification Code for Email Address Change",
            text="Your verification code is 483920.",
        )
    ]
    assert detector.check_2fa(msgs) is None


def test_unknown_subject_is_reported_once(detector, caplog):
    """Ro'yxatda yo'q sarlavha — yangi til yoki yangi oqim belgisi.

    Uni taxmin qilmaymiz, logga yozamiz: keyin bitta qator qo'shiladi.
    Har 5 soniyalik poll'da qayta yozilmasligi uchun bir marta.
    """
    import logging

    msgs = [
        _msg(
            from_="konami-info@konami.net",
            subject="【KONAMI ID】新しい何か",
            text="123456",
        )
    ]
    with caplog.at_level(logging.WARNING):
        assert detector.check_2fa(msgs) is None
        assert detector.check_2fa(msgs) is None

    reported = [r for r in caplog.records if "新しい何か" in r.getMessage()]
    assert len(reported) == 1
