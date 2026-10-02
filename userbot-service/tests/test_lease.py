import uuid

from sqlalchemy import text

from userbot_service.lease import LeaseStore
from userbot_service.telegram.ports import Me


async def account(repo, tg=1):
    a = await repo.upsert_connected(
        me=Me(tg, "A", None, None, "998901234567"), session_string="S", source="PANEL", actor=None)
    return a.id


async def test_only_one_runner_can_hold_an_account(engine, repo):
    acc = await account(repo)
    core, payment = LeaseStore(engine, "core"), LeaseStore(engine, "payment")

    assert await core.acquire(acc) is True
    assert await payment.acquire(acc) is False


async def test_the_same_runner_reacquires_its_own_lease_after_a_restart(engine, repo):
    acc = await account(repo)
    assert await LeaseStore(engine, "payment").acquire(acc)
    assert await LeaseStore(engine, "payment").acquire(acc)


async def test_an_expired_lease_can_be_taken_over(engine, repo):
    acc = await account(repo)
    await LeaseStore(engine, "core").acquire(acc)
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE userbot_leases SET lease_until = now() - interval '1 second'"))
    assert await LeaseStore(engine, "payment").acquire(acc) is True


async def test_release_frees_the_account_immediately(engine, repo):
    acc = await account(repo)
    core = LeaseStore(engine, "core")
    await core.acquire(acc)
    await core.release(acc)
    assert await LeaseStore(engine, "payment").acquire(acc) is True


async def test_renew_reports_only_leases_still_held_and_stamps_alive_ones(engine, repo):
    a, b = await account(repo, 1), await account(repo, 2)
    core = LeaseStore(engine, "core")
    await core.acquire(a)
    await core.acquire(b)
    async with engine.begin() as conn:  # b was lost (expired and taken by payment)
        await conn.execute(
            text("UPDATE userbot_leases SET runner = 'payment' WHERE account_id = :b"), {"b": b})

    held = await core.renew([a, b], alive={a})

    assert held == {a}
    live = await core.liveness()
    assert live[a][0] == "core"
    assert live[a][1].year > 1970


async def test_a_new_lease_is_not_alive_until_renewed_as_alive(engine, repo):
    acc = await account(repo)
    store = LeaseStore(engine, "core")
    await store.acquire(acc)
    assert (await store.liveness())[acc][1].year == 1970


async def test_releasing_an_unknown_lease_is_harmless(engine):
    await LeaseStore(engine, "core").release(uuid.uuid4())


async def test_renew_with_nothing_alive_keeps_leases_but_stamps_no_heartbeat(engine, repo):
    acc = await account(repo)
    store = LeaseStore(engine, "core")
    await store.acquire(acc)

    assert await store.renew([acc], alive=set()) == {acc}
    assert (await store.liveness())[acc][1].year == 1970
