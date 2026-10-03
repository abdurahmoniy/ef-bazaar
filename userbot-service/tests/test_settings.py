import base64
import os

from userbot_service.config import Settings

ENV = {
    "TELEGRAM_API_ID": "1",
    "TELEGRAM_API_HASH": "h",
    "KAFKA_BOOTSTRAP_SERVERS": "kafka:9092",
    "RUNNER": "core",
    "POSTGRES_HOST": "postgres",
    "POSTGRES_USER": "efbazaar",
    "POSTGRES_PASSWORD": "p@ss/word",
    "USERBOT_SESSION_KEY": base64.b64encode(os.urandom(32)).decode(),
}


def test_the_database_url_escapes_the_password(monkeypatch):
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    s = Settings()
    assert s.database_url == "postgresql+asyncpg://efbazaar:p%40ss%2Fword@postgres:5432/userbot_db"
    assert s.http_port == 8089
