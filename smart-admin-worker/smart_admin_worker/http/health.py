"""GET /health — reports Kafka consumer readiness.

Until the consumer is wired in Task 10, this returns kafka: "not-started".
Docker healthcheck curls this and expects HTTP 200 regardless of the kafka
field — a slow-to-connect Kafka must NOT cascade to a container restart, so
we return 200 as long as the process itself is up.
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()

# Set by main.py's lifespan hook once the aiokafka consumer joins.
_kafka_state = "not-started"


def set_kafka_state(state: str) -> None:
    global _kafka_state
    _kafka_state = state


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "UP", "kafka": _kafka_state}
