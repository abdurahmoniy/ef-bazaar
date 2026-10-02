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
