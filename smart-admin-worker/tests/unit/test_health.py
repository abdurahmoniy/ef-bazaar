"""Kafka startup is liveness; an exhausted required result is an actionable failure."""
from fastapi.testclient import TestClient

from smart_admin_worker.http import health


def test_consumer_error_health_is_unavailable_but_startup_is_live():
    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(health.router)
    original = health._kafka_state
    try:
        client = TestClient(app)
        health.set_kafka_state("starting")
        assert client.get("/health").status_code == 200
        health.set_kafka_state("error")
        response = client.get("/health")
        assert response.status_code == 503
        assert response.json() == {"status": "DOWN", "kafka": "error"}
    finally:
        health.set_kafka_state(original)
