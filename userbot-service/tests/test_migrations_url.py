"""Settings.database_url percent-encodes the password; alembic's Config is a
ConfigParser that treats a bare % as interpolation."""

import asyncio
from urllib.parse import quote

from sqlalchemy import text
from sqlalchemy.engine import make_url

from userbot_service.db.engine import make_engine, run_migrations

_PASSWORD = "p@ss+/=%"


async def _alembic_version(url) -> list:
    engine = make_engine(url)
    try:
        async with engine.connect() as conn:
            return list((await conn.execute(text("SELECT version_num FROM alembic_version"))).all())
    finally:
        await engine.dispose()


async def test_run_migrations_survives_a_password_with_special_characters(engine, database_url):
    admin = make_url(database_url)
    async with engine.connect() as conn:
        conn = await conn.execution_options(isolation_level="AUTOCOMMIT")
        await conn.execute(text("DROP DATABASE IF EXISTS pw_db"))
        await conn.execute(text("DROP ROLE IF EXISTS pw_user"))
        await conn.execute(text(f"CREATE ROLE pw_user LOGIN PASSWORD '{_PASSWORD}'"))
        await conn.execute(text("CREATE DATABASE pw_db OWNER pw_user"))
    url = (f"postgresql+asyncpg://pw_user:{quote(_PASSWORD, safe='')}"
           f"@{admin.host}:{admin.port}/pw_db")

    await asyncio.to_thread(run_migrations, url)

    assert await _alembic_version(url)
