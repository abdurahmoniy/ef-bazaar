from datetime import UTC, datetime

from tests.fakes import ME, FakeAccountClient, FakeKafka
from tests.test_parser import TOPUP
from userbot_service.importer import import_legacy_session
from userbot_service.payment.queue import PendingQueue
from userbot_service.payment.watcher import HumoWatcher
from userbot_service.telegram.ports import Msg


class Legacy:
    def __init__(self):
        self.closed = False

    async def open(self):
        return ME

    async def export(self):
        return "LEGACY-SESSION"

    async def close(self):
        self.closed = True


async def test_the_terminal_session_becomes_the_payment_account(repo, tmp_path):
    f = tmp_path / "humo_userbot_session.session"
    f.write_bytes(b"sqlite")
    legacy = Legacy()

    account_id = await import_legacy_session(session_file=f, repo=repo, open_legacy=lambda: legacy)

    account = await repo.get(account_id)
    assert account.source == "IMPORTED"
    assert account.connected_by is None
    assert await repo.session_string(account_id) == "LEGACY-SESSION"
    assert (await repo.bindings())["PAYMENT"] == account_id
    assert legacy.closed
    assert f.exists()  # kept for rollback


async def test_no_file_means_nothing_to_import(repo, tmp_path):
    assert await import_legacy_session(session_file=tmp_path / "x.session", repo=repo,
                                       open_legacy=Legacy) is None


async def test_an_existing_payment_binding_means_the_import_already_happened(repo, tmp_path):
    f = tmp_path / "s.session"
    f.write_bytes(b"x")
    first = await import_legacy_session(session_file=f, repo=repo, open_legacy=Legacy)
    second = await import_legacy_session(session_file=f, repo=repo, open_legacy=Legacy)
    assert first is not None and second is None
    assert len(await repo.list()) == 1


async def test_an_account_already_connected_from_the_panel_is_just_bound(repo, tmp_path):
    panel = await repo.upsert_connected(me=ME, session_string="PANEL", source="PANEL", actor=None)
    f = tmp_path / "s.session"
    f.write_bytes(b"x")

    account_id = await import_legacy_session(session_file=f, repo=repo, open_legacy=Legacy)

    assert account_id == panel.id
    assert await repo.session_string(panel.id) == "PANEL"
    assert (await repo.bindings())["PAYMENT"] == panel.id


async def test_import_does_not_replay_history(repo, engine, tmp_path):
    """The old userbot published these without userbotTelegramId; replaying
    them now with the id would be a different key to payment-service — a
    double credit."""
    f = tmp_path / "s.session"
    f.write_bytes(b"x")
    account_id = await import_legacy_session(session_file=f, repo=repo, open_legacy=Legacy)
    at = datetime(2026, 10, 1, tzinfo=UTC)
    client = FakeAccountClient(history=[Msg(40, TOPUP, at), Msg(41, TOPUP, at)])
    await client.start()
    kafka = FakeKafka()
    watcher = HumoWatcher(account_id=account_id, telegram_user_id=ME.telegram_user_id,
                          client=client, queue=PendingQueue(engine), kafka=kafka,
                          source_chat="humocardbot")

    await watcher.attach()

    assert kafka.sent == []
