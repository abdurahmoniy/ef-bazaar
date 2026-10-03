from __future__ import annotations

import re

from userbot_service.errors import ApiError


def normalize_phone(raw: str) -> str:
    digits = re.sub(r"[\s\-()+]", "", raw or "")
    if not digits.isdigit() or not 7 <= len(digits) <= 15:
        raise ApiError("PHONE_INVALID")
    return "+" + digits


def mask_phone(digits: str) -> str:
    """'998901234567' → '+998 ******* 67'. Shown on admin screens; the full
    number is never stored."""
    digits = digits.lstrip("+")
    if len(digits) < 6:
        return "+" + "*" * len(digits)
    return f"+{digits[:3]} {'*' * (len(digits) - 5)} {digits[-2:]}"
