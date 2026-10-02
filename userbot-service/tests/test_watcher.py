from datetime import UTC, datetime

from sqlalchemy import text

from tests.fakes import FakeAccountClient, FakeKafka
from tests.test_parser import TOPUP
from userbot_service.payment.queue import PendingQueue
from userbot_service.payment.watcher import HumoWatcher
from userbot_service.telegram.ports import Me, Msg

AT = datetime(2026, 10, 1, tzinfo=UTC)


async def setup(repo, engine, *, history=(), kafka=None):
    acc = await repo.upsert_connected(me=Me(5550001, "A", None, None, "998901234567"),
                                      session_string="S", source="PANEL", actor=None)
    client = FakeAccountClient(history=history)
    await client.start()
    queue = PendingQueue(engine)
    kafka = kafka or FakeKafka()
    watcher = HumoWatcher(account_id=acc.id, telegram_user_id=5550001, client=client,
                          queue=queue, kafka=kafka, source_chat="humocardbot")
    return acc, client, queue, kafka, watcher


async def test_a_fresh_account_starts_at_the_newest_message_and_replays_nothing(repo, engine):
    acc, _, queue, kafka, watcher = await setup(
        repo, engine, history=[Msg(1, TOPUP, AT), Msg(2, TOPUP, AT)])
    await watcher.attach()
    await watcher.flush()
    assert kafka.sent == []
    assert await queue.last_message_id(acc.id) == 2


async def test_messages_missed_while_down_are_published_once_after_a_restart(repo, engine):
    acc, _, queue, kafka, watcher = await setup(
        repo, engine, history=[Msg(5, TOPUP, AT), Msg(6, "salom", AT), Msg(7, TOPUP, AT)])
    await queue.init_state(acc.id, 5)

    await watcher.attach()
    await watcher.flush()
    await watcher.flush()

    assert [v["telegramMessageId"] for _, v, _ in kafka.sent] == [7]
    assert await queue.last_message_id(acc.id) == 7


async def test_a_live_message_is_published_with_the_account_in_its_key(repo, engine):
    acc, client, _, kafka, watcher = await setup(repo, engine)
    await watcher.attach()
    await client.deliver(11, TOPUP)
    assert len(kafka.sent) == 1
    assert kafka.sent[0][2] == "5550001:11"


async def test_a_kafka_failure_keeps_the_observation_queued_and_retries_it(repo, engine):
    kafka = FakeKafka()
    acc, client, queue, _, watcher = await setup(repo, engine, kafka=kafka)
    await watcher.attach()
    kafka.fail = True
    await client.deliver(12, TOPUP)
    assert len(await queue.pending(acc.id)) == 1

    kafka.fail = False
    await watcher.flush()
    assert len(kafka.sent) == 1
    assert await queue.pending(acc.id) == []


async def test_health_fails_when_an_observation_is_stuck(repo, engine):
    kafka = FakeKafka()
    acc, client, _, _, watcher = await setup(repo, engine, kafka=kafka)
    await watcher.attach()
    assert await watcher.health() == (True, "")

    kafka.fail = True
    await client.deliver(13, TOPUP)
    async with engine.begin() as conn:
        await conn.execute(text(
            "UPDATE humo_pending SET created_at = now() - interval '61 seconds'"))
    healthy, reason = await watcher.health()
    assert healthy is False
    assert "unpublished" in reason


async def test_health_fails_when_the_client_is_down(repo, engine):
    _, client, _, _, watcher = await setup(repo, engine)
    await watcher.attach()
    await client.stop()
    assert (await watcher.health())[0] is False


async def test_health_fails_when_no_handler_is_registered(repo, engine):
    _, _, _, _, watcher = await setup(repo, engine)
    assert (await watcher.health())[0] is False   # attach() never ran
