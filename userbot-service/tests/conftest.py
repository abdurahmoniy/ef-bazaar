import base64
import os

import pytest
from sqlalchemy import text
from testcontainers.postgres import PostgresContainer

from userbot_service.crypto import SessionCipher
from userbot_service.db.engine import make_engine, run_migrations


@pytest.fixture(scope="session")
def database_url():
    with PostgresContainer("postgres:16-alpine") as pg:
        url = pg.get_connection_url().replace("postgresql+psycopg2", "postgresql+asyncpg")
        run_migrations(url)
        yield url


@pytest.fixture
async def engine(database_url):
    engine = make_engine(database_url)
    async with engine.begin() as conn:
        await conn.execute(text(
            "TRUNCATE userbot_audit, humo_pending, humo_watch_state, userbot_leases,"
            " userbot_bindings, userbot_accounts"))
    yield engine
    await engine.dispose()


@pytest.fixture
def cipher():
    return SessionCipher(base64.b64encode(os.urandom(32)).decode())


@pytest.fixture
def repo(engine, cipher):
    from userbot_service.repository import AccountRepository
    return AccountRepository(engine, cipher)
