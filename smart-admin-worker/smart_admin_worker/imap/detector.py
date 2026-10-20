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

import logging
import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from typing import Protocol

log = logging.getLogger(__name__)

# Tiklash havolasi — faqat yo'lida password/reset/reminder bo'lgan konami
# havolasi (haqiqiysi: `my.konami.net/<til>/password-reminder/register-password?put=...`).
# Istalgan konami havolasi yetmaydi: Konami pochta Konami ID ga ulanmagan
# bo'lsa ham aynan shu sarlavha bilan "not registered" deb javob beradi,
# va uning tanasida bosh sahifa hamda murojaat formasi havolalari bor.
_RESET_URL_RE = re.compile(
    r"https?://[^\s/]*konami[^\s/]*/[^\s]*(?:password|reset|reminder)[^\s]*",
    re.IGNORECASE,
)
# "Bu pochta Konami ID ga ulanmagan" javobi. Havola tekshiruvidan tashqari
# ikkinchi himoya: rad javobiga keyinchalik parol sahifasi havolasi qo'shilsa
# ham savdo keyingi qadamga o'tib ketmasin.
_NOT_REGISTERED_RE = re.compile(r"not\s+registered\s+to\s+a\s+konami\s+id", re.IGNORECASE)

# Qadamga bog'langan sarlavhalar — normallashtirilgan ko'rinishda.
#
# Yangi til qo'shish — shu to'plamlarga bitta qator. Taxmin qilmaymiz:
# ro'yxatga tushmagan sarlavha logga yoziladi va namunasi kelgach
# qo'shiladi.
SUBJECTS_EMAIL_CHANGE = frozenset({
    "[konami id] update email address",
    "【konami id】メールアドレスの更新",
})
SUBJECTS_RESET = frozenset({
    "[konami id] reissue password",
    "【konami id】パスワードの再発行",
})
SUBJECTS_LOGIN_CODE = frozenset({
    "[konami id] save data transfer to new device",
    # Konami ID ga kirishda keladigan kod. Xaridor akkountni tekshirish
    # uchun aynan shu yo'ldan o'tadi. ONGLI CHEGIRMA: bu xat ISTALGAN
    # kirishda keladi, ya'ni sotuvchi o'zi kirsa ham tushadi. Kod faqat
    # qabul qiluvchi tomonga ko'rsatiladi va tugmani baribir o'zi bosadi.
    "[konami id] verification code",
    "【konami id】ログイン用の確認コード",
})
_ALL_SUBJECTS = SUBJECTS_EMAIL_CHANGE | SUBJECTS_RESET | SUBJECTS_LOGIN_CODE

_WHITESPACE_RE = re.compile(r"\s+")
# Yakka turgan olti raqam: uzunroq sonning bir bo'lagi hisoblanmaydi.
_SIX_DIGITS_RE = re.compile(r"(?<!\d)(\d{6})(?!\d)")


def _normalize_subject(subject: str | None) -> str:
    """Sarlavhani solishtirishga tayyorlaydi.

    NFKC to'liq kenglikdagi lotin harflari va bo'shliqni oddiysiga
    keltiradi (`ＫＯＮＡＭＩ` → `KONAMI`, `　` → ` `), `【】` esa o'z holicha
    qoladi — ular yapon sarlavhasining bir qismi.
    """
    folded = unicodedata.normalize("NFKC", subject or "")
    return _WHITESPACE_RE.sub(" ", folded).strip().lower()


def _subject_in(subject: str | None, expected: frozenset[str]) -> bool:
    """Sarlavha shu qadamnikimi — TO'LIQ tenglik bilan.

    Prefiks bo'yicha emas: `[KONAMI ID] Verification Code` boshqa bir
    sarlavhaning — `... Verification Code for Email Address Change` —
    boshlanishi hamdir, va ular ikki xil oqim. Prefiks solishtiruvi
    ularni birlashtirib yuborardi.
    """
    return _normalize_subject(subject) in expected
# NOTE: The brief's literal `[\s:]*` failed its own test case ("verification code is 483920")
# because "is" sits between keyword and digits. `[\sA-Za-z:]{0,30}` bounds the gap to ~30 chars
# (typical short English phrasing) so a keyword can't grab an unrelated distant code from a
# different sentence.
_CODE_RE = re.compile(
    r"(?:code|verification|verify)[\sA-Za-z:]{0,30}([0-9]{6})", re.IGNORECASE
)
# Yaponcha: avval kalit so'z, keyin raqam — `確認コード：273685`. Ikki nuqta
# to'liq kenglikda ham, oddiy ham bo'lishi mumkin.
_CODE_JA_RE = re.compile(r"確認コード\s*[：:]\s*(\d{6})")
# Xat kodni umuman shu so'zlar bilan atamaganini bilish uchun.
_CODE_WORD_RE = re.compile(r"code|verification|verify|確認コード", re.IGNORECASE)
# Email-change verification: Konami's literal phrasing is "247616 is the
# verification code." — digits come FIRST, followed by "is the verification
# code". This shape is distinctive enough on its own that a general 2FA login
# ("your verification code is 483920") won't trip it, but we still gate on the
# subject line as a belt-and-braces guard.
_EMAIL_CHANGE_CODE_RE = re.compile(
    r"(\d{6})\s+is\s+the\s+verification\s+code", re.IGNORECASE
)
# Yaponchasi aynan ko'zgusi: `189467 が確認コードです。`
_EMAIL_CHANGE_CODE_JA_RE = re.compile(r"(\d{6})\s*が\s*確認コード")


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
    # Konami "bu pochta Konami ID ga ulanmagan" deb javob berdi — sotuvchi
    # akkount emailini o'tkazmagan.
    email_not_registered: bool = False
    raw_message: bytes | None = None


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
        # Har 5 soniyada qayta o'qiladigan xat har safar logga tushmasligi
        # uchun: bir sarlavha — bir xabar. O'sib ketmasligi uchun chegara bor.
        self._reported_subjects: set[str] = set()

    def _sender_ok(self, from_: str) -> bool:
        return from_.strip().lower() in self._allowed

    def _note_unknown(self, subject: str | None) -> None:
        """Ro'yxatda yo'q Konami xati — yangi til yoki yangi oqim belgisi.

        Taxmin qilmaymiz: sarlavhani yozib qo'yamiz va namunasi kelgach
        map'ga bitta qator qo'shiladi. Jim o'tkazib yuborilsa, qadam nega
        ishlamayotganini hech kim bila olmaydi.
        """
        normalized = _normalize_subject(subject)
        if not normalized or normalized in _ALL_SUBJECTS:
            return
        if normalized in self._reported_subjects:
            return
        if len(self._reported_subjects) < 200:
            self._reported_subjects.add(normalized)
        log.warning(
            "Konami xati hech bir qadamga mos kelmadi, sarlavha: %r", subject
        )

    def check_reset(self, messages: Iterable[Msg]) -> ResetHit | None:
        for m in messages:
            if not self._sender_ok(m.from_):
                continue
            # Sarlavhasiz bu tekshiruv amalda hech narsani tekshirmasdi:
            # har bir Konami xatining footerida konami havolasi bor, ya'ni
            # istalgan xat "havola keldi" bo'lib hisoblanardi.
            if not _subject_in(m.subject, SUBJECTS_RESET):
                self._note_unknown(m.subject)
                continue
            body = m.text or ""
            not_registered = bool(_NOT_REGISTERED_RE.search(body))
            has_url = bool(_RESET_URL_RE.search(body)) and not not_registered
            return ResetHit(
                sender=m.from_.lower(),
                received_at=m.date,
                reset_link_present=has_url,
                email_not_registered=not_registered,
            )
        return None

    def check_release(self, messages: Iterable[Msg]) -> ResetHit | None:
        for message in messages:
            hit = self.check_reset([message])
            if hit is not None and hit.email_not_registered and not hit.reset_link_present:
                raw = getattr(message, "raw_message", None)
                return replace(hit, raw_message=raw if isinstance(raw, bytes) else None)
        return None

    def check_2fa(self, messages: Iterable[Msg]) -> TwoFaHit | None:
        # Unread messages survive polling. A resend must win over an older code
        # regardless of the order returned by the IMAP client.
        latest = None
        for m in messages:
            if not self._sender_ok(m.from_):
                continue
            if not _subject_in(m.subject, SUBJECTS_LOGIN_CODE):
                self._note_unknown(m.subject)
                continue
            code = self._code_in(m.text or "")
            if code:
                hit = TwoFaHit(
                    sender=m.from_.lower(),
                    received_at=m.date if m.date.tzinfo else m.date.replace(tzinfo=UTC),
                    code=code,
                )
                if latest is None or hit.received_at > latest.received_at:
                    latest = hit
        return latest

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
            near_keyword = _CODE_RE.search(text) or _CODE_JA_RE.search(text)
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
        latest = None
        for m in messages:
            if not self._sender_ok(m.from_):
                continue
            if not _subject_in(m.subject, SUBJECTS_EMAIL_CHANGE):
                self._note_unknown(m.subject)
                continue
            body = m.text or ""
            match = (_EMAIL_CHANGE_CODE_RE.search(body)
                     or _EMAIL_CHANGE_CODE_JA_RE.search(body))
            if match:
                hit = EmailChangeCodeHit(
                    sender=m.from_.lower(),
                    received_at=m.date if m.date.tzinfo else m.date.replace(tzinfo=UTC),
                    verification_code=match.group(1),
                )
                if latest is None or hit.received_at > latest.received_at:
                    latest = hit
        return latest
