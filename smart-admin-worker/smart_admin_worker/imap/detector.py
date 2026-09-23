r"""Konami xatini qaysi savdo qadami qabul qilishini hal qiladi.

Ikki bosqichli: jo'natuvchi ro'yxati (allowlist) va SARLAVHA. Sarlavha
har bir qadamga qat'iy bog'langan, chunki Konami bir nechta oqimda 6
raqamli kod yuboradi va hammasi bitta qutiga tushadi. Sarlavha
tekshirilmasa, boshqa oqimdan kelgan kod qadamni qanoatlantiradi —
masalan sotuvchi brauzerda Konami ID ga kirsa, xaridorning "Tasdiqlash"
tugmasi hech qanday haqiqiy tekshiruvsiz ochilardi.

Savdoda ishlatiladigan uchta xat:

===========================================  ========  ====================
Sarlavha                                     Tarkib    Qadam
===========================================  ========  ====================
[KONAMI ID] Update Email Address             6 raqam   email o'zgartirish
[KONAMI ID] Reissue Password                 havola    Konami tekshiruvi
[KONAMI ID] Save Data Transfer to New Device 6 raqam   akkountga kirish
===========================================  ========  ====================

Qolgan hamma narsa — jumladan `[KONAMI ID] Verification Code` (brauzerda
Konami ID ga kirish) va `[KONAMI ID] Verification Code for Email Address
Change` — savdoda ISHLATILMAYDI va e'tiborsiz qoladi.

Solishtiruv normallashtirilgan sarlavhaning BOSHIDAN qilinadi: Konami
oxiriga qo'shimcha qo'ysa qadam sinmaydi, uchala sarlavha esa bir-birining
boshlanishi emas, ya'ni chalkashish ehtimoli yo'q.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

_RESET_URL_RE = re.compile(r"https?://[^\s]*konami[^\s]*", re.IGNORECASE)

# Qadamga bog'langan sarlavhalar — normallashtirilgan ko'rinishda.
SUBJECT_EMAIL_CHANGE = "[konami id] update email address"
SUBJECT_RESET = "[konami id] reissue password"
SUBJECT_LOGIN_CODE = "[konami id] save data transfer to new device"

_WHITESPACE_RE = re.compile(r"\s+")
# Yakka turgan olti raqam: uzunroq sonning bir bo'lagi hisoblanmaydi.
_SIX_DIGITS_RE = re.compile(r"(?<!\d)(\d{6})(?!\d)")


def _subject_is(subject: str | None, expected: str) -> bool:
    """Sarlavha shu qadamnikimi.

    Registr va ortiqcha bo'shliq xatning mohiyatini o'zgartirmaydi,
    shuning uchun ular tozalanadi. Solishtiruv boshidan: Konami oxiriga
    qo'shimcha qo'ysa qadam sinmasligi kerak.
    """
    normalized = _WHITESPACE_RE.sub(" ", subject or "").strip().lower()
    return normalized.startswith(expected)
# NOTE: The brief's literal `[\s:]*` failed its own test case ("verification code is 483920")
# because "is" sits between keyword and digits. `[\sA-Za-z:]{0,30}` bounds the gap to ~30 chars
# (typical short English phrasing) so a keyword can't grab an unrelated distant code from a
# different sentence.
_CODE_RE = re.compile(
    r"(?:code|verification|verify)[\sA-Za-z:]{0,30}([0-9]{6})", re.IGNORECASE
)
# Xat kodni umuman shu so'zlar bilan atamaganini bilish uchun.
_CODE_WORD_RE = re.compile(r"code|verification|verify", re.IGNORECASE)
# Email-change verification: Konami's literal phrasing is "247616 is the
# verification code." — digits come FIRST, followed by "is the verification
# code". This shape is distinctive enough on its own that a general 2FA login
# ("your verification code is 483920") won't trip it, but we still gate on the
# subject line as a belt-and-braces guard.
_EMAIL_CHANGE_CODE_RE = re.compile(
    r"(\d{6})\s+is\s+the\s+verification\s+code", re.IGNORECASE
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
            # Sarlavhasiz bu tekshiruv amalda hech narsani tekshirmasdi:
            # har bir Konami xatining footerida konami havolasi bor, ya'ni
            # istalgan xat "havola keldi" bo'lib hisoblanardi.
            if not _subject_is(m.subject, SUBJECT_RESET):
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
            if not _subject_is(m.subject, SUBJECT_LOGIN_CODE):
                continue
            code = self._code_in(m.text or "")
            if code:
                return TwoFaHit(
                    sender=m.from_.lower(),
                    received_at=m.date,
                    code=code,
                )
        return None

    @staticmethod
    def _code_in(text: str) -> str | None:
        """Kodni tanadan oladi.

        Xat kodni "code" / "verification" deb atagan bo'lsa — faqat o'sha
        so'z yonidagi olti raqam. Tanadagi boshqa sonlar (havola ichidagi
        raqam, ma'lumot raqami) shunda ham kod deb olinmaydi.

        Xat bu so'zlarning birortasini ishlatmagan bo'lsa, tanada YAGONA
        olti raqamli son bo'lsagina o'sha olinadi. Bu Konami matnni
        o'zgartirgan kuni qadam jim turib qolmasligi uchun; ikkitadan ko'p
        bo'lsa taxmin qilmaymiz — noto'g'ri kod odamni akkountga kirita
        olmaydi va admin qo'lda yuborishga majbur bo'ladi.
        """
        if _CODE_WORD_RE.search(text):
            near_keyword = _CODE_RE.search(text)
            return near_keyword.group(1) if near_keyword else None
        found = _SIX_DIGITS_RE.findall(text)
        return found[0] if len(found) == 1 else None

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
            if not _subject_is(m.subject, SUBJECT_EMAIL_CHANGE):
                continue
            match = _EMAIL_CHANGE_CODE_RE.search(m.text or "")
            if match:
                return EmailChangeCodeHit(
                    sender=m.from_.lower(),
                    received_at=m.date,
                    verification_code=match.group(1),
                )
        return None
