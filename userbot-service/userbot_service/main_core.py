"""userbot-core: the admin panel API, logins, and every account not bound to PAYMENT."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable

import uvicorn

from userbot_service.api import create_app
from userbot_service.config import get_settings
from userbot_service.crypto import SessionCipher
from userbot_service.db.engine import make_engine, run_migrations
from userbot_service.kafka_client import KafkaClient
from userbot_service.lease import LeaseStore
from userbot_service.login import LoginService
from userbot_service.observability.kafka_log_forwarder import KafkaLogForwarder
from userbot_service.repository import AccountRepository
from userbot_service.supervisor import Supervisor
from userbot_service.telegram.pyrogram_adapter import PyrogramAccountClient, PyrogramLoginGateway

log = logging.getLogger(__name__)


async def login_sweeper(
    logins: LoginService, *, every: float = 30,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> None:
    """Drop abandoned logins every `every` seconds. A failing sweep is logged and
    retried next round; only cancellation ends the loop."""
    while True:
        try:
            await logins.sweep()
        except Exception:
            log.exception("login sweep failed; retrying next round")
        await sleep(every)


async def main() -> None:
    s = get_settings()
    engine = make_engine(s.database_url)
    repo = AccountRepository(engine, SessionCipher(s.session_key))
    leases = LeaseStore(engine, "core")
    kafka = KafkaClient(s.kafka_bootstrap_servers)
    await kafka.start()
    logging.getLogger().addHandler(KafkaLogForwarder(
        producer=kafka, service_name="userbot-core", loop=asyncio.get_running_loop(),
    ).logging_handler())

    supervisor = Supervisor(
        runner="core", repo=repo, leases=leases,
        client_factory=lambda account_id, session: PyrogramAccountClient(
            account_id, session, api_id=s.telegram_api_id, api_hash=s.telegram_api_hash),
        avatar_dir=s.avatar_dir)
    logins = LoginService(
        gateway_factory=lambda: PyrogramLoginGateway(s.telegram_api_id, s.telegram_api_hash),
        repo=repo)
    app = create_app(repo=repo, logins=logins, logout=supervisor.log_out,
                     liveness=leases.liveness, avatar_dir=s.avatar_dir)
    server = uvicorn.Server(uvicorn.Config(app, host="0.0.0.0", port=s.http_port,
                                           log_level=s.log_level.lower(), access_log=False))

    tasks = [asyncio.create_task(supervisor.run_forever()),
             asyncio.create_task(login_sweeper(logins))]
    try:
        await server.serve()
    finally:
        for t in tasks:
            t.cancel()
        await supervisor.shutdown()
        await kafka.stop()
        await engine.dispose()


if __name__ == "__main__":
    settings = get_settings()
    logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO),
                        format="%(asctime)s %(levelname)s %(name)s %(message)s")
    run_migrations(settings.database_url)
    asyncio.run(main())
