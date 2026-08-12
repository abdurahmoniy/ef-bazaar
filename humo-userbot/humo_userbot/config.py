"""Runtime configuration from environment variables, validated at startup.

`telegram_api_id` and `telegram_api_hash` have no defaults on purpose: an
unconfigured container must fail loudly at import rather than start a client
that can never authenticate.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def as_chat_ref(raw: str) -> str | int:
    """Turn HUMO_SOURCE_CHAT into what `pyrogram.filters.chat` expects.

    Pyrogram compares strings against `chat.username` and ints against
    `chat.id`. A numeric id passed through as a string is compared against
    usernames and matches nothing, so the userbot would run quietly and see no
    top-ups at all. Coerce anything that is entirely digits (with an optional
    leading '-') to int; leave usernames alone.
    """
    value = raw.strip()
    if value.lstrip("-").isdigit():
        return int(value)
    return value


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    telegram_api_id: int = Field(alias="TELEGRAM_API_ID")
    telegram_api_hash: str = Field(alias="TELEGRAM_API_HASH")
    telegram_session_name: str = Field(
        default="humo_userbot_session", alias="TELEGRAM_SESSION_NAME"
    )
    telegram_session_dir: str = Field(
        default="/run/secrets", alias="TELEGRAM_SESSION_DIR"
    )
    source_chat: str = Field(default="humocardbot", alias="HUMO_SOURCE_CHAT")

    kafka_bootstrap_servers: str = Field(alias="KAFKA_BOOTSTRAP_SERVERS")
    heartbeat_interval_seconds: int = Field(
        default=60, alias="HEARTBEAT_INTERVAL_SECONDS"
    )
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")


@lru_cache
def get_settings() -> Settings:
    return Settings()
