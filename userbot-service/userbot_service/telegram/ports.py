from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Me:
    telegram_user_id: int
    first_name: str
    last_name: str | None
    username: str | None
    phone: str
