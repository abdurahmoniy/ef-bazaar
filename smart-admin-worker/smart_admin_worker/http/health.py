"""GET /health — reports Kafka consumer readiness.

Until the consumer is wired in Task 10, this returns kafka: "not-started".
Startup returns HTTP 200 while Kafka connects. A crashed consumer returns 503
so monitoring can see the failure and operators can recover/restart safely.
Docker health alone does not automatically restart an unhealthy container.
"""

from __future__ import annotations

from fastapi import APIRouter, Response

router = APIRouter()

# Set by main.py's lifespan hook once the aiokafka consumer joins.
_kafka_state = "not-started"


def set_kafka_state(state: str) -> None:
    global _kafka_state
    _kafka_state = state


@router.get("/health")
async def health(response: Response) -> dict[str, str]:
    if _kafka_state == "error":
        response.status_code = 503
        return {"status": "DOWN", "kafka": _kafka_state}
    return {"status": "UP", "kafka": _kafka_state}
