"""Runs the accounts this runner is responsible for, and only while it holds
their leases.

Order matters everywhere here: a client starts only after its lease is ours,
and stops before the lease could expire. Breaking either lets two processes
use one auth key, and Telegram answers that by revoking it.

Leases are renewed by their own loop, never behind the lock that serialises
start/stop/probe/log_out, and every Telegram call has a timeout: a slow
Telegram must not be able to starve renewal. A watchdog stops every client
when the last successful renewal is too old to trust the leases."""

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
        lease_ttl: float | None = None, safety_margin: float = 10,
        renew_interval: float = 5, db_timeout: float = 5, telegram_timeout: float = 15,
    ) -> None:
        self._runner = runner
        self._repo = repo
        self._leases = leases
        self._factory = client_factory
        self._on_started = on_started
        self._on_stopped = on_stopped
        self._avatar_dir = avatar_dir
        self._clock = clock
        self._ttl = lease_ttl if lease_ttl is not None else getattr(leases, "ttl_seconds", 30)
        self._margin = safety_margin
        self._renew_interval = renew_interval
        self._db_timeout = db_timeout
        self._tg_timeout = telegram_timeout
        self._last_renew_ok = clock()
        self._lock = asyncio.Lock()
        self._held: set[UUID] = set()      # every lease we hold, clients still starting included
        self._renewer: asyncio.Task | None = None
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
                    self._hold(account_id)
                    await self._start(account_id)
        await self.renew_once()

    async def renew_once(self) -> None:
        """Renews every held lease; independent of the start/stop lock."""
        if not self._held:
            self._last_renew_ok = self._clock()
            return
        started = self._clock()
        alive = {i for i, c in list(self.running.items()) if c.is_connected}
        try:
            held = await asyncio.wait_for(
                self._leases.renew(list(self._held), alive), self._db_timeout)
        except Exception:
            log.exception("lease renewal failed")
            await self._watchdog()
            return
        self._last_renew_ok = started
        for account_id in self._held - set(held):
            log.error("lost the lease on account %s; stopping it here", account_id)
            await self._stop(account_id, release=False)
        await self._watchdog()

    async def _watchdog(self) -> None:
        if self._clock() - self._last_renew_ok <= self._ttl - self._margin:
            return
        if not self.running and not self._held:
            return
        log.error("no successful lease renewal for %.0fs; stopping every client",
                  self._clock() - self._last_renew_ok)
        for account_id in list(self.running):
            await self._stop(account_id, release=False)
        self._held.clear()

    async def probe(self) -> None:
        async with self._lock:
            for account_id, client in list(self.running.items()):
                try:
                    await self._tg(client.get_me())
                except SessionDead as e:
                    await self._revoked(account_id, e)
                except Exception:
                    log.warning("probe of account %s failed", account_id, exc_info=True)

    async def tick(self, n: int) -> None:
        try:
            await self.reconcile()
            if n % PROBE_EVERY_TICKS == 0:
                await self.probe()
        except Exception:
            log.exception("supervisor tick failed")
        await self._watchdog()

    async def log_out(self, account_id: UUID) -> None:
        async with self._lock:
            client = self.running.pop(account_id, None)
            if client is None:
                if not await self._leases.acquire(account_id):
                    raise ApiError("ACCOUNT_BUSY")
                self._hold(account_id)
                try:
                    client = self._factory(account_id, await self._repo.session_string(account_id))
                except Exception as e:
                    await self._release(account_id)
                    raise ApiError("TELEGRAM_ERROR") from e
                try:
                    await self._tg(client.start())
                except SessionDead:
                    client = None
                except Exception as e:
                    await self._finish(account_id, client)
                    raise ApiError("TELEGRAM_ERROR") from e
            try:
                if client is not None:
                    await self._tg(client.log_out())
            except SessionDead:
                pass
            except Exception as e:
                log.exception("log out of account %s failed", account_id)
                await self._finish(account_id, client)
                raise ApiError("TELEGRAM_ERROR") from e
            await self._finish(account_id, client)
            await self._repo.mark_disconnected(account_id, None)

    async def shutdown(self) -> None:
        async with self._lock:
            for account_id in list(self.running):
                await self._stop(account_id)

    async def run_forever(self, interval: float = 5) -> None:
        self._renewer = asyncio.create_task(self._renew_loop())
        n = 0
        try:
            while True:
                n += 1
                await self.tick(n)
                await asyncio.sleep(interval)
        finally:
            self._renewer.cancel()

    async def _renew_loop(self) -> None:
        while True:
            try:
                await self.renew_once()
            except Exception:
                log.exception("lease renewer failed")
            await asyncio.sleep(self._renew_interval)

    def _tg(self, coro):
        return asyncio.wait_for(coro, self._tg_timeout)

    def _hold(self, account_id: UUID) -> None:
        if not self._held:
            self._last_renew_ok = self._clock()   # a fresh lease was just granted
        self._held.add(account_id)

    async def _release(self, account_id: UUID) -> None:
        self._held.discard(account_id)
        try:
            await asyncio.wait_for(self._leases.release(account_id), self._db_timeout)
        except Exception:
            log.warning("releasing the lease on account %s failed; it will expire",
                        account_id, exc_info=True)

    async def _stop_client(self, account_id: UUID, client: AccountClient | None) -> None:
        if client is None:
            return
        try:
            await self._tg(client.stop())
        except Exception:
            log.warning("stopping account %s raised", account_id, exc_info=True)

    async def _finish(self, account_id: UUID, client: AccountClient | None) -> None:
        """Client down first, then the lease: never the other way round."""
        await self._stop_client(account_id, client)
        await self._release(account_id)
        await self._notify_stopped(account_id)

    async def _notify_stopped(self, account_id: UUID) -> None:
        if self._on_stopped:
            try:
                await self._on_stopped(account_id)
            except Exception:
                log.warning("on_stopped of account %s raised", account_id, exc_info=True)

    async def _start(self, account_id: UUID) -> None:
        try:
            client = self._factory(account_id, await self._repo.session_string(account_id))
        except Exception:
            await self._release(account_id)
            log.exception("account %s could not be prepared; will retry", account_id)
            return
        try:
            await self._tg(client.start())
        except SessionDead as e:
            await self._repo.mark_revoked(account_id, e.reason)
            await self._release(account_id)
            log.error("account %s cannot sign in: %s — marked REVOKED", account_id, e.reason)
            return
        except Exception:
            await self._stop_client(account_id, client)
            await self._release(account_id)
            log.exception("account %s failed to start; will retry", account_id)
            return
        if account_id not in self._held:
            # The lease was lost while the client was starting.
            await self._stop_client(account_id, client)
            return
        self.running[account_id] = client
        log.info("runner %s started account %s", self._runner, account_id)
        if self._on_started:
            try:
                await self._tg(self._on_started(account_id, client))
            except Exception:
                log.exception("on_started of account %s failed; stopping it", account_id)
                await self._stop(account_id)
                return
        await self._refresh_avatar(account_id, client)

    async def _stop(self, account_id: UUID, release: bool = True) -> None:
        client = self.running.pop(account_id, None)
        await self._stop_client(account_id, client)
        if release:
            await self._release(account_id)
        else:
            self._held.discard(account_id)
        if client is not None:
            await self._notify_stopped(account_id)

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
            path = os.path.join(self._avatar_dir, f"{account_id}.jpg")
            await self._tg(client.download_avatar(path))
        except Exception:
            log.warning("avatar of account %s could not be fetched", account_id, exc_info=True)
