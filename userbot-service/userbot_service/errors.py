"""API-facing domain errors. One class, keyed by code, so the HTTP layer maps
them in one place and the Uzbek wording lives next to the code it explains."""

from __future__ import annotations

MESSAGES: dict[str, tuple[int, str]] = {
    "FORBIDDEN": (403, "Bu bo'lim faqat adminlar uchun."),
    "PHONE_INVALID": (400, "Telefon raqami noto'g'ri."),
    "PHONE_NOT_REGISTERED": (400, "Bu raqamda Telegram akkounti yo'q."),
    "PHONE_BANNED": (400, "Bu raqam Telegram tomonidan bloklangan."),
    "CODE_INVALID": (400, "Kod noto'g'ri."),
    "CODE_EXPIRED": (400, "Kodning muddati tugadi. Kodni qayta yuboring."),
    "PASSWORD_INVALID": (400, "Parol noto'g'ri."),
    "FLOOD_WAIT": (
        429,
        "Telegram urinishlarni vaqtincha to'xtatdi. "
        "{retryAfterSec} soniyadan keyin urinib ko'ring.",
    ),
    "TOO_MANY_LOGINS": (429, "Bir vaqtda juda ko'p login ochilgan. Birozdan keyin urinib ko'ring."),
    "LOGIN_GONE": (410, "Login muddati yoki urinishlar tugadi. Boshidan boshlang."),
    "ALREADY_CONNECTED": (409, "Bu Telegram akkounti allaqachon ulangan."),
    "ACCOUNT_BOUND": (
        409,
        "Bu userbot {features} vazifasiga biriktirilgan. "
        "Avval vazifani boshqa userbotga o'tkazing.",
    ),
    "ACCOUNT_NOT_ACTIVE": (409, "Faqat faol userbotni vazifaga biriktirish mumkin."),
    "ACCOUNT_BUSY": (
        409,
        "Userbot hozir boshqa jarayonda band. "
        "Bir necha soniyadan keyin qayta urinib ko'ring.",
    ),
    "ACCOUNT_NOT_FOUND": (404, "Userbot topilmadi."),
    "UNKNOWN_FEATURE": (404, "Bunday vazifa yo'q."),
    "TELEGRAM_ERROR": (502, "Telegram xatosi. Qayta urinib ko'ring."),
}


class ApiError(Exception):
    def __init__(self, code: str, **params: object) -> None:
        status, template = MESSAGES[code]
        super().__init__(code)
        self.code = code
        self.status = status
        self.params = params
        self.message = template.format(**params)
