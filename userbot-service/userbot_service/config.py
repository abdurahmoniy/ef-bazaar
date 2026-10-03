"""Runtime configuration from environment variables, validated at startup.

`telegram_api_id` and `telegram_api_hash` have no defaults on purpose: an
unconfigured container must fail loudly at import rather than start a client
that can never authenticate.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal
from urllib.parse import quote

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
        default="/session", alias="TELEGRAM_SESSION_DIR"
    )
    source_chat: str = Field(default="humocardbot", alias="HUMO_SOURCE_CHAT")

    kafka_bootstrap_servers: str = Field(alias="KAFKA_BOOTSTRAP_SERVERS")
    heartbeat_interval_seconds: int = Field(
        default=60, alias="HEARTBEAT_INTERVAL_SECONDS"
    )
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    runner: Literal["core", "payment"] = Field(alias="RUNNER")

    postgres_host: str = Field(alias="POSTGRES_HOST")
    postgres_port: int = Field(default=5432, alias="POSTGRES_PORT")
    postgres_user: str = Field(alias="POSTGRES_USER")
    postgres_password: str = Field(alias="POSTGRES_PASSWORD")
    postgres_db: str = Field(default="userbot_db", alias="POSTGRES_DB")

    # base64 of 32 random bytes; `openssl rand -base64 32`. Losing it makes
    # every stored session unreadable — the accounts must then be re-connected.
    session_key: str = Field(alias="USERBOT_SESSION_KEY")

    http_port: int = Field(default=8089, alias="HTTP_PORT")
    avatar_dir: str = Field(default="/avatars", alias="AVATAR_DIR")

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{quote(self.postgres_user, safe='')}:"
            f"{quote(self.postgres_password, safe='')}@{self.postgres_host}:"
            f"{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
