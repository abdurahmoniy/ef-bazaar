"""Central runtime configuration loaded from environment variables.

All defaults match the docker-compose entry and the Plan C spec §7. Fields
are validated at startup — a bad value fails fast rather than at first use.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    # Kafka
    kafka_bootstrap_servers: str = Field(alias="KAFKA_BOOTSTRAP_SERVERS")
    kafka_consumer_group: str = Field(default="smart-admin-worker")

    # Redis
    redis_host: str = Field(default="localhost", alias="REDIS_HOST")
    redis_port: int = Field(default=6379, alias="REDIS_PORT")
    redis_password: str = Field(default="", alias="REDIS_PASSWORD")

    # Mailcow
    mailcow_api_url: str = Field(
        default="https://mailcow.efbazaar.uz/api/v1", alias="MAILCOW_API_URL"
    )
    mailcow_api_key_file: Path = Field(
        default=Path("/run/secrets/mailcow_api_key"), alias="MAILCOW_API_KEY_FILE"
    )

    # IMAP
    imap_host: str = Field(default="mailcow.efbazaar.uz", alias="IMAP_HOST")
    imap_port: int = Field(default=993, alias="IMAP_PORT")
    imap_poll_interval_seconds: int = Field(default=5, alias="IMAP_POLL_INTERVAL_SECONDS")
    imap_poll_lock_ttl_seconds: int = Field(default=6, alias="IMAP_POLL_LOCK_TTL_SECONDS")

    # Konami
    konami_sender_allowlist: str = Field(
        default="noreply@konami.com,no-reply@konami.jp,noreply@konami.net",
        alias="KONAMI_SENDER_ALLOWLIST",
    )
    max_concurrent_rotate: int = Field(default=1, alias="MAX_CONCURRENT_ROTATE")
    max_concurrent_rotate_cap: int = Field(default=5, alias="MAX_CONCURRENT_ROTATE_CAP")

    # Crypto
    master_key_file: Path = Field(
        default=Path("/run/secrets/master_key"), alias="MASTER_KEY_FILE"
    )

    # Runtime
    healthcheck_port: int = Field(default=8086, alias="WORKER_HEALTHCHECK_PORT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    # Telegram notifications (all optional — worker starts cleanly with none set;
    # if token or chat id is missing the notifier degrades to a silent no-op).
    telegram_bot_token: str | None = Field(default=None, alias="TELEGRAM_BOT_TOKEN")
    telegram_group_chat_id: str | None = Field(default=None, alias="TELEGRAM_GROUP_CHAT_ID")
    telegram_topic_logs: int | None = Field(default=None, alias="TELEGRAM_TOPIC_LOGS")

    @model_validator(mode="after")
    def clamp_concurrent_rotate(self) -> Settings:
        cap = self.max_concurrent_rotate_cap
        if self.max_concurrent_rotate < 1:
            self.max_concurrent_rotate = 1
        elif self.max_concurrent_rotate > cap:
            self.max_concurrent_rotate = cap
        return self

    @property
    def konami_sender_allowlist_set(self) -> frozenset[str]:
        return frozenset(
            s.strip().lower() for s in self.konami_sender_allowlist.split(",") if s.strip()
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
