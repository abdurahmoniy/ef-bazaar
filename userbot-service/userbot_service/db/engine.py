from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

_ROOT = Path(__file__).resolve().parents[2]


def make_engine(url: str) -> AsyncEngine:
    return create_async_engine(url, pool_size=5, max_overflow=0, pool_pre_ping=True)


def run_migrations(url: str) -> None:
    """Sync on purpose: called before any event loop exists (env.py runs its own)."""
    cfg = Config(str(_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(_ROOT / "userbot_service/db/migrations"))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")
