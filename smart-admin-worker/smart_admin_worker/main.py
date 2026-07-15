"""smart-admin-worker entrypoint.

Assembles the FastAPI app, wires the lifespan hook that will (in later tasks)
start the aiokafka consumer + producer + IMAP poller registry, and mounts
/health + /metrics. Uvicorn runs this via `uvicorn smart_admin_worker.main:app`.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

from smart_admin_worker.config import get_settings
from smart_admin_worker.http import health
from smart_admin_worker.logging_config import configure_logging


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    log = structlog.get_logger(__name__)
    log.info("startup", version=app.version)
    # Task 10 wires the aiokafka consumer + producer here.
    yield
    log.info("shutdown")


app = FastAPI(title="smart-admin-worker", version="0.1.0", lifespan=lifespan)
app.include_router(health.router)
