"""Both containers run `alembic upgrade head` on start, at the same time on a
deploy. A session-level advisory lock serialises them; the loser waits and
then finds nothing to do."""

import asyncio

from alembic import context
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

MIGRATION_LOCK = 7_240_001


def _run(connection) -> None:
    context.configure(connection=connection, target_metadata=None)
    with context.begin_transaction():
        context.run_migrations()


async def _main() -> None:
    url = context.config.get_main_option("sqlalchemy.url")
    engine = create_async_engine(url)
    async with engine.connect() as conn:
        await conn.execute(text(f"SELECT pg_advisory_lock({MIGRATION_LOCK})"))
        await conn.commit()
        try:
            await conn.run_sync(_run)
            await conn.commit()
        finally:
            await conn.execute(text(f"SELECT pg_advisory_unlock({MIGRATION_LOCK})"))
            await conn.commit()
    await engine.dispose()


asyncio.run(_main())
