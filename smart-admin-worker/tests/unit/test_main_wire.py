"""Lifespan-wiring integration tests for main.py.

Exercise the FastAPI lifespan context manager with all external services
mocked so we can verify:
1. All 4 REQUEST_TOPICS are covered by the handler dispatch map.
2. Producer cleanup runs even if consumer.start() raises (I1 contract).
"""

from __future__ import annotations

import base64
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI

from smart_admin_worker.kafka.topics import REQUEST_TOPICS


@pytest.fixture
def secret_files(tmp_path, monkeypatch):
    master_key = tmp_path / "master_key"
    master_key.write_text(base64.b64encode(b"K" * 32).decode())
    api_key = tmp_path / "mailcow_api_key"
    api_key.write_text("test-key")

    monkeypatch.setenv("KAFKA_BOOTSTRAP_SERVERS", "dummy:9092")
    monkeypatch.setenv("MASTER_KEY_FILE", str(master_key))
    monkeypatch.setenv("MAILCOW_API_KEY_FILE", str(api_key))

    from smart_admin_worker.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_handler_dispatch_covers_all_request_topics(secret_files):
    from smart_admin_worker import main as m

    captured: dict[str, object] = {}

    class RecordingRunner:
        def __init__(self, *args, **kwargs):
            captured["handlers"] = kwargs["handlers"]
            captured["topics"] = kwargs["topics"]

        async def start(self):
            pass

        async def stop(self):
            pass

    with (
        patch.object(m, "KafkaConsumerRunner", RecordingRunner),
        patch.object(m, "KafkaProducerClient") as producer_cls,
        patch.object(m, "MailcowClient") as mailcow_cls,
        patch.object(m, "aioredis") as redis_mod,
        patch.object(m, "KonamiClient"),
        patch.object(m, "ImapPollerRegistry") as registry_cls,
    ):
        producer_cls.return_value.start = AsyncMock()
        producer_cls.return_value.stop = AsyncMock()
        mailcow_cls.return_value.aclose = AsyncMock()
        redis_mod.Redis.return_value.aclose = AsyncMock()
        registry_cls.return_value.cancel_all = AsyncMock()

        app = FastAPI(lifespan=m.lifespan)
        async with m.lifespan(app):
            pass

    assert set(captured["handlers"].keys()) == set(REQUEST_TOPICS)


@pytest.mark.asyncio
async def test_producer_stop_called_when_consumer_start_raises(secret_files):
    """I1 contract: producer.stop() must run even if consumer.start() throws."""
    from smart_admin_worker import main as m

    class FailingRunner:
        def __init__(self, *args, **kwargs):
            pass

        async def start(self):
            raise RuntimeError("consumer boom")

        async def stop(self):
            pass

    with (
        patch.object(m, "KafkaConsumerRunner", FailingRunner),
        patch.object(m, "KafkaProducerClient") as producer_cls,
        patch.object(m, "MailcowClient") as mailcow_cls,
        patch.object(m, "aioredis") as redis_mod,
        patch.object(m, "KonamiClient"),
        patch.object(m, "ImapPollerRegistry") as registry_cls,
    ):
        producer_cls.return_value.start = AsyncMock()
        producer_cls.return_value.stop = AsyncMock()
        mailcow_cls.return_value.aclose = AsyncMock()
        redis_mod.Redis.return_value.aclose = AsyncMock()
        registry_cls.return_value.cancel_all = AsyncMock()

        app = FastAPI(lifespan=m.lifespan)
        with pytest.raises(RuntimeError, match="consumer boom"):
            async with m.lifespan(app):
                pass

        producer_cls.return_value.stop.assert_awaited()
