"""Testcontainers Kafka + Redis for the integration suite."""

from __future__ import annotations

import pytest
from testcontainers.kafka import KafkaContainer
from testcontainers.redis import RedisContainer


@pytest.fixture(scope="session")
def kafka_container():
    c = KafkaContainer("confluentinc/cp-kafka:7.4.0")
    c.start()
    yield c
    c.stop()


@pytest.fixture(scope="session")
def redis_container():
    c = RedisContainer("redis:7-alpine")
    c.start()
    yield c
    c.stop()


@pytest.fixture(scope="session")
def kafka_bootstrap(kafka_container):
    return kafka_container.get_bootstrap_server()


@pytest.fixture(scope="session")
def redis_url(redis_container):
    return f"redis://{redis_container.get_container_host_ip()}:{redis_container.get_exposed_port(6379)}"
