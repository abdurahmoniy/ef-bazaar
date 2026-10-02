import asyncio
import uuid

import pytest
from sqlalchemy import text

from tests.fakes import FakeAccountClient
from userbot_service.errors import ApiError
from userbot_service.lease import LeaseStore
from userbot_service.supervisor import Supervisor
from userbot_service.telegram.ports import Me


class Factory:
    def __init__(self, **kw):
        self.kw = kw
        self.made: dict[uuid.UUID, list[FakeAccountClient]] = {}

    def __call__(self, account_id, session):
        c = FakeAccountClient(**self.kw)
        self.made.setdefault(account_id, []).append(c)
        return c


async def acc(repo, tg):
    return (await repo.upsert_connected(me=Me(tg, "A", None, None, "998901234567"),
                                        session_string=f"S{tg}", source="PANEL", actor=None)).id


def sup(runner, repo, engine, factory, **kw):
    return Supervisor(runner=runner, repo=repo, leases=LeaseStore(engine, runner),
                      client_factory=factory, **kw)


async def test_payment_runs_only_the_bound_account_and_core_runs_the_rest(repo, engine):
    a, b = await acc(repo, 1), await acc(repo, 2)
    await repo.bind("PAYMENT", a, None)
    core, payment = sup("core", repo, engine, Factory()), sup("payment", repo, engine, Factory())

    await core.reconcile()
    await payment.reconcile()

    assert set(core.running) == {b}
    assert set(payment.running) == {a}


async def test_rebinding_never_runs_one_account_in_two_places(repo, engine):
    a, b = await acc(repo, 1), await acc(repo, 2)
    await repo.bind("PAYMENT", a, None)
    core, payment = sup("core", repo, engine, Factory()), sup("payment", repo, engine, Factory())
    await core.reconcile()
    await payment.reconcile()

    await repo.bind("PAYMENT", b, None)
    for _ in range(3):
        for s in (payment, core, core, payment):   # any interleaving
            await s.reconcile()
            assert not (set(core.running) & set(payment.running))

    assert set(payment.running) == {b}
    assert set(core.running) == {a}


async def test_a_dead_session_is_marked_revoked_and_its_lease_released(repo, engine):
    a = await acc(repo, 1)
    core = sup("core", repo, engine, Factory(dead_on_start=True))
    await core.reconcile()

    assert core.running == {}
    assert (await repo.get(a)).status == "REVOKED"
    assert await LeaseStore(engine, "payment").acquire(a)


async def test_a_session_revoked_while_running_is_noticed_by_the_probe(repo, engine):
    a = await acc(repo, 1)
    factory = Factory()
    core = sup("core", repo, engine, factory)
    await core.reconcile()
    factory.made[a][0].dead = True

    await core.probe()

    assert core.running == {}
    assert (await repo.get(a)).status == "REVOKED"


async def test_a_lost_lease_stops_the_client_without_touching_the_new_owner(repo, engine):
    a = await acc(repo, 1)
    factory = Factory()
    core = sup("core", repo, engine, factory)
    await core.reconcile()
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE userbot_leases SET runner = 'payment'"))

    await core.reconcile()

    assert factory.made[a][0].stopped is True
    async with engine.connect() as conn:
        runner = (await conn.execute(text("SELECT runner FROM userbot_leases"))).scalar_one()
    assert runner == "payment"


async def test_db_outage_stops_every_client(repo, engine):
    await acc(repo, 1)
    factory = Factory()
    t = [0.0]
    core = sup("core", repo, engine, factory, clock=lambda: t[0])
    await core.tick(1)
    client = next(iter(factory.made.values()))[0]

    async def broken(*a, **k):
        raise ConnectionError("db down")
    core._repo.active_ids = broken

    t[0] = 10
    await core.tick(2)
    assert client.stopped is False          # inside the grace period
    t[0] = 25
    await core.tick(3)
    assert client.stopped is True
    assert core.running == {}


async def test_log_out_of_a_running_account(repo, engine):
    a = await acc(repo, 1)
    factory = Factory()
    core = sup("core", repo, engine, factory)
    await core.reconcile()

    await core.log_out(a)

    assert factory.made[a][0].logged_out is True
    assert a not in core.running
    assert (await repo.get(a)).status == "DISCONNECTED"


async def test_log_out_of_an_account_held_elsewhere_is_busy(repo, engine):
    a = await acc(repo, 1)
    await LeaseStore(engine, "payment").acquire(a)
    with pytest.raises(ApiError) as e:
        await sup("core", repo, engine, Factory()).log_out(a)
    assert e.value.code == "ACCOUNT_BUSY"


async def test_log_out_of_an_already_dead_session_still_disconnects(repo, engine):
    a = await acc(repo, 1)
    core = sup("core", repo, engine, Factory(dead_on_start=True))
    await core.log_out(a)
    assert (await repo.get(a)).status == "DISCONNECTED"


async def test_on_started_runs_for_each_started_account(repo, engine):
    a = await acc(repo, 1)
    started = []

    async def hook(account_id, client):
        started.append(account_id)
    core = sup("core", repo, engine, Factory(), on_started=hook)
    await core.reconcile()
    await core.reconcile()
    assert started == [a]


class HangingStart(FakeAccountClient):
    async def start(self):
        await asyncio.Event().wait()


class BrokenLogOut(FakeAccountClient):
    async def log_out(self):
        raise RuntimeError("telegram hiccup")


def factory_of(cls_for):
    made: dict[uuid.UUID, list[FakeAccountClient]] = {}

    def make(account_id, session):
        c = cls_for(account_id)()
        made.setdefault(account_id, []).append(c)
        return c
    make.made = made
    return make


async def test_a_hanging_start_does_not_starve_renewal_and_times_out(repo, engine):
    a, b = sorted([await acc(repo, 1), await acc(repo, 2)])
    factory = factory_of(lambda i: HangingStart if i == a else FakeAccountClient)
    core = sup("core", repo, engine, factory, telegram_timeout=0.15, renew_interval=0.01)
    seen = []
    real = core._leases.renew

    async def spy(held, alive):
        held = list(held)
        seen.append(set(held))
        return await real(held, alive)
    core._leases.renew = spy
    renewer = asyncio.create_task(core._renew_loop())
    try:
        await core.reconcile()
    finally:
        renewer.cancel()

    assert any(a in s for s in seen)           # renewed while its start hung
    assert set(core.running) == {b}
    assert a not in core._held
    assert await LeaseStore(engine, "payment").acquire(a)   # its lease was released


async def test_watchdog_stops_clients_before_the_lease_can_expire(repo, engine):
    await acc(repo, 1)
    factory = Factory()
    t = [0.0]
    core = sup("core", repo, engine, factory, clock=lambda: t[0])
    await core.reconcile()                     # last successful renew at t=0
    client = next(iter(factory.made.values()))[0]

    async def broken(*a, **k):
        raise ConnectionError("db down")
    core._leases.renew = broken

    t[0] = 19                                  # ttl 30 - margin 10 = 20
    await core.renew_once()
    assert client.stopped is False
    t[0] = 21
    await core.renew_once()
    assert client.stopped is True
    assert core.running == {}


async def test_on_started_failure_is_isolated_to_its_account(repo, engine):
    a, b = sorted([await acc(repo, 1), await acc(repo, 2)])
    factory = Factory()

    async def hook(account_id, client):
        if account_id == a:
            raise RuntimeError("catch-up failed")
    core = sup("core", repo, engine, factory, on_started=hook)

    await core.reconcile()

    assert set(core.running) == {b}
    assert factory.made[a][0].stopped is True
    assert await LeaseStore(engine, "payment").acquire(a)


async def test_log_out_failure_stops_the_client_keeps_account_and_restarts_once(repo, engine):
    a = await acc(repo, 1)
    first = [True]

    def cls(_):
        if first[0]:
            first[0] = False
            return BrokenLogOut
        return FakeAccountClient
    factory = factory_of(cls)
    core = sup("core", repo, engine, factory)
    await core.reconcile()

    with pytest.raises(ApiError) as e:
        await core.log_out(a)

    assert e.value.code == "TELEGRAM_ERROR"
    assert factory.made[a][0].stopped is True
    assert (await repo.get(a)).status == "ACTIVE"
    assert a not in core.running
    await core.reconcile()
    assert len(factory.made[a]) == 2 and set(core.running) == {a}
