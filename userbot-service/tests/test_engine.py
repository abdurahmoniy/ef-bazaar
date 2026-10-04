"""Production Postgres runs with max_connections=50 and the Java services
already hold 40 (Hikari keeps every pool full). userbot-service runs as two
containers, so each engine must stay at 2 connections or the database fills
up and every deploy's psql step is refused ("too many clients already")."""

from userbot_service.db.engine import MAX_CONNECTIONS, make_engine


def test_each_container_holds_at_most_two_connections():
    engine = make_engine("postgresql+asyncpg://u:p@localhost:5432/userbot_db")
    pool = engine.sync_engine.pool
    assert MAX_CONNECTIONS == 2
    assert pool.size() == 2
    assert pool._max_overflow == 0
