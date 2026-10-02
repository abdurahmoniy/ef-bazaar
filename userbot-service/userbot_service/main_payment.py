"""userbot-payment: the account bound to PAYMENT, the Humo watcher, the heartbeat.

Separate from userbot-core so that nothing done for other features can stall
the process that money depends on."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable, Mapping
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from userbot_service.config import get_settings
from userbot_service.crypto import SessionCipher
from userbot_service.db.engine import make_engine, run_migrations
from userbot_service.importer import import_legacy_session
from userbot_service.kafka_client import USERBOT_HEARTBEAT, KafkaClient, iso_z
from userbot_service.lease import LeaseStore
from userbot_service.observability.kafka_log_forwarder import KafkaLogForwarder
from userbot_service.payment.queue import PendingQueue
from userbot_service.payment.watcher import HumoWatcher
from userbot_service.repository import AccountRepository
from userbot_service.supervisor import Supervisor
from userbot_service.telegram.pyrogram_adapter import PyrogramAccountClient, PyrogramLegacySession

log = logging.getLogger(__name__)

FLUSH_EVERY_SECONDS = 5
RESYNC_EVERY_SECONDS = 60


async def payment_maintenance(
    watchers: Mapping[UUID, HumoWatcher], *, flush_every: float, resync_every: float,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> None:
    """Flush queued observations every `flush_every` seconds and re-scan history
    every `resync_every`. The first scan is one interval after start because
    attach() already resynced. A failure is logged and retried at the next
    round; it never ends the loop (cancellation does)."""
    since_resync = 0.0
    while True:
        due = since_resync >= resync_every
        for watcher in list(watchers.values()):
            try:
                await watcher.flush()
            except Exception:
                log.exception("flush failed for account %s", watcher.account_id)
            if due:
                try:
                    await watcher.resync()
                except Exception:
                    log.exception("resync failed for account %s; retrying next round",
                                  watcher.account_id)
        since_resync = 0.0 if due else since_resync
        await sleep(flush_every)
        since_resync += flush_every


async def main() -> None:
    s = get_settings()
    engine = make_engine(s.database_url)
    repo = AccountRepository(engine, SessionCipher(s.session_key))
    queue = PendingQueue(engine)
    kafka = KafkaClient(s.kafka_bootstrap_servers)
    await kafka.start()
    logging.getLogger().addHandler(KafkaLogForwarder(
        producer=kafka, service_name="userbot-payment", loop=asyncio.get_running_loop(),
    ).logging_handler())

    try:
        await import_legacy_session(
            session_file=Path(s.telegram_session_dir) / f"{s.telegram_session_name}.session",
            repo=repo,
            open_legacy=lambda: PyrogramLegacySession(
                s.telegram_session_name, s.telegram_session_dir,
                api_id=s.telegram_api_id, api_hash=s.telegram_api_hash))
    except Exception as e:
        # A dead legacy session must not crash-loop the runner; the panel can
        # connect the account afresh. Only the type is logged, never session data.
        log.error("importing the legacy session failed (%s); starting without it",
                  type(e).__name__)

    watchers: dict[UUID, HumoWatcher] = {}

    async def on_started(account_id, client):
        account = await repo.get(account_id)
        watcher = HumoWatcher(account_id=account_id, telegram_user_id=account.telegram_user_id,
                              client=client, queue=queue, kafka=kafka, source_chat=s.source_chat)
        watchers[account_id] = watcher
        await watcher.attach()
        log.info("watching %s with account %s", s.source_chat, account_id)

    async def on_stopped(account_id):
        watchers.pop(account_id, None)

    supervisor = Supervisor(
        runner="payment", repo=repo, leases=LeaseStore(engine, "payment"),
        client_factory=lambda account_id, session: PyrogramAccountClient(
            account_id, session, api_id=s.telegram_api_id, api_hash=s.telegram_api_hash),
        on_started=on_started, on_stopped=on_stopped, avatar_dir=s.avatar_dir)

    async def heartbeat() -> None:
        while True:
            try:
                watcher = next(iter(watchers.values()), None)
                healthy, reason = (await watcher.health()) if watcher else (
                    False, "no account is bound to PAYMENT or it is not running")
                if healthy:
                    await kafka.publish(USERBOT_HEARTBEAT, {"sentAt": iso_z(datetime.now(UTC))})
                else:
                    # Withholding is the safe direction: deposits close.
                    log.error("withholding the heartbeat — %s", reason)
            except Exception:
                log.exception("heartbeat failed")
            await asyncio.sleep(s.heartbeat_interval_seconds)

    tasks = [
        asyncio.create_task(supervisor.run_forever()),
        asyncio.create_task(heartbeat()),
        asyncio.create_task(payment_maintenance(
            watchers, flush_every=FLUSH_EVERY_SECONDS, resync_every=RESYNC_EVERY_SECONDS)),
    ]
    try:
        await asyncio.gather(*tasks)
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
    # Clients are built by the supervisor inside this loop, never at import.
    asyncio.run(main())
