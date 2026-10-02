"""Runs the accounts this runner is responsible for, and only while it holds
their leases.

Order matters everywhere here: a client starts only after its lease is ours,
and stops before the lease could expire. Breaking either lets two processes
use one auth key, and Telegram answers that by revoking it."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections.abc import Awaitable, Callable
from uuid import UUID

from userbot_service.errors import ApiError
from userbot_service.features import PAYMENT
from userbot_service.lease import LeaseStore
from userbot_service.repository import AccountRepository
from userbot_service.telegram.ports import AccountClient, SessionDead

log = logging.getLogger(__name__)

ClientFactory = Callable[[UUID, str], AccountClient]
OnStarted = Callable[[UUID, AccountClient], Awaitable[None]]
PROBE_EVERY_TICKS = 12


class Supervisor:
    def __init__(
        self, *, runner: str, repo: AccountRepository, leases: LeaseStore,
        client_factory: ClientFactory, on_started: OnStarted | None = None,
        on_stopped: Callable[[UUID], Awaitable[None]] | None = None,
        avatar_dir: str | None = None, clock: Callable[[], float] = time.monotonic,
        db_grace_seconds: float = 20,
    ) -> None:
        self._runner = runner
        self._repo = repo
        self._leases = leases
        self._factory = client_factory
        self._on_started = on_started
        self._on_stopped = on_stopped
        self._avatar_dir = avatar_dir
        self._clock = clock
        self._grace = db_grace_seconds
        self._last_db_ok = clock()
        self._lock = asyncio.Lock()
        self.running: dict[UUID, AccountClient] = {}

    async def desired(self) -> set[UUID]:
        active = await self._repo.active_ids()
        bound = (await self._repo.bindings()).get(PAYMENT)
        if self._runner == "payment":
            return {bound} & active if bound else set()
        return active - {bound}

    async def reconcile(self) -> None:
        async with self._lock:
            want = await self.desired()
            for account_id in set(self.running) - want:
                await self._stop(account_id)
            for account_id in want - set(self.running):
                if await self._leases.acquire(account_id):
                    await self._start(account_id)
            alive = {i for i, c in self.running.items() if c.is_connected}
            held = await self._leases.renew(self.running.keys(), alive)
            for account_id in set(self.running) - held:
                log.error("lost the lease on account %s; stopping it here", account_id)
                await self._stop(account_id, release=False)

    async def probe(self) -> None:
        async with self._lock:
            for account_id, client in list(self.running.items()):
                try:
                    await client.get_me()
                except SessionDead as e:
                    await self._revoked(account_id, e)
                except Exception:
                    log.warning("probe of account %s failed", account_id, exc_info=True)

    async def tick(self, n: int) -> None:
        try:
            await self.reconcile()
            if n % PROBE_EVERY_TICKS == 0:
                await self.probe()
            self._last_db_ok = self._clock()
        except Exception:
            log.exception("supervisor tick failed")
            if self._clock() - self._last_db_ok > self._grace and self.running:
                # Our leases may be expiring unseen: stop before anyone else may start.
                log.error("cannot renew leases for %ss; stopping every client", self._grace)
                for account_id in list(self.running):
                    await self._stop(account_id, release=False)

    async def log_out(self, account_id: UUID) -> None:
        async with self._lock:
            client = self.running.pop(account_id, None)
            if client is None:
                if not await self._leases.acquire(account_id):
                    raise ApiError("ACCOUNT_BUSY")
                client = self._factory(account_id, await self._repo.session_string(account_id))
                try:
                    await client.start()
                except SessionDead:
                    client = None
                except Exception as e:
                    await self._leases.release(account_id)
                    raise ApiError("TELEGRAM_ERROR") from e
            try:
                if client is not None:
                    await client.log_out()
            except SessionDead:
                pass
            finally:
                await self._leases.release(account_id)
                if self._on_stopped:
                    await self._on_stopped(account_id)
            await self._repo.mark_disconnected(account_id, None)

    async def shutdown(self) -> None:
        async with self._lock:
            for account_id in list(self.running):
                await self._stop(account_id)

    async def run_forever(self, interval: float = 5) -> None:
        n = 0
        while True:
            n += 1
            await self.tick(n)
            await asyncio.sleep(interval)

    async def _start(self, account_id: UUID) -> None:
        client = self._factory(account_id, await self._repo.session_string(account_id))
        try:
            await client.start()
        except SessionDead as e:
            await self._repo.mark_revoked(account_id, e.reason)
            await self._leases.release(account_id)
            log.error("account %s cannot sign in: %s — marked REVOKED", account_id, e.reason)
            return
        except Exception:
            await self._leases.release(account_id)
            log.exception("account %s failed to start; will retry", account_id)
            return
        self.running[account_id] = client
        log.info("runner %s started account %s", self._runner, account_id)
        if self._on_started:
            await self._on_started(account_id, client)
        await self._refresh_avatar(account_id, client)

    async def _stop(self, account_id: UUID, release: bool = True) -> None:
        client = self.running.pop(account_id, None)
        if client is not None:
            try:
                await client.stop()
            except Exception:
                log.warning("stopping account %s raised", account_id, exc_info=True)
            if self._on_stopped:
                await self._on_stopped(account_id)
        if release:
            await self._leases.release(account_id)

    async def _revoked(self, account_id: UUID, e: SessionDead) -> None:
        log.error("account %s lost its Telegram authorization: %s — marked REVOKED",
                  account_id, e.reason)
        await self._stop(account_id)
        await self._repo.mark_revoked(account_id, e.reason)

    async def _refresh_avatar(self, account_id: UUID, client: AccountClient) -> None:
        if not self._avatar_dir:
            return
        try:
            os.makedirs(self._avatar_dir, exist_ok=True)
            await client.download_avatar(os.path.join(self._avatar_dir, f"{account_id}.jpg"))
        except Exception:
            log.warning("avatar of account %s could not be fetched", account_id, exc_info=True)
