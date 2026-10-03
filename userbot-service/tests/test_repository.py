import uuid

import pytest
from sqlalchemy import text

from userbot_service.errors import ApiError
from userbot_service.telegram.ports import Me

ADMIN = uuid.uuid4()


def me(tg_id=1001, first="Aziz"):
    return Me(telegram_user_id=tg_id, first_name=first, last_name=None,
              username="aziz", phone="998901234567")


async def test_a_connected_account_is_stored_encrypted_and_masked(repo, engine):
    account = await repo.upsert_connected(
        me=me(), session_string="SESSION", source="PANEL", actor=ADMIN)

    assert account.status == "ACTIVE"
    assert account.phone_masked == "+998 ******* 67"
    assert account.connected_by == ADMIN
    assert await repo.session_string(account.id) == "SESSION"
    async with engine.connect() as conn:
        raw = (await conn.execute(
            text("SELECT session_ciphertext FROM userbot_accounts"))).scalar_one()
    assert b"SESSION" not in raw


async def test_connecting_an_active_account_again_is_refused(repo):
    await repo.upsert_connected(me=me(), session_string="A", source="PANEL", actor=ADMIN)
    with pytest.raises(ApiError) as e:
        await repo.upsert_connected(me=me(), session_string="B", source="PANEL", actor=ADMIN)
    assert e.value.code == "ALREADY_CONNECTED"


async def test_reconnecting_a_revoked_account_replaces_the_session_and_keeps_bindings(repo):
    first = await repo.upsert_connected(me=me(), session_string="OLD", source="IMPORTED",
                                        actor=None, bind_feature="PAYMENT")
    await repo.mark_revoked(first.id, "AUTH_KEY_UNREGISTERED")

    again = await repo.upsert_connected(me=me(first="Aziz2"), session_string="NEW",
                                        source="PANEL", actor=ADMIN)

    assert again.id == first.id
    assert again.status == "ACTIVE"
    assert again.first_name == "Aziz2"
    assert await repo.session_string(first.id) == "NEW"
    assert (await repo.bindings())["PAYMENT"] == first.id


async def test_binding_needs_a_known_feature_and_an_active_account(repo):
    a = await repo.upsert_connected(me=me(), session_string="S", source="PANEL", actor=ADMIN)
    with pytest.raises(ApiError) as unknown:
        await repo.bind("NOPE", a.id, ADMIN)
    assert unknown.value.code == "UNKNOWN_FEATURE"

    await repo.mark_revoked(a.id, "x")
    with pytest.raises(ApiError) as inactive:
        await repo.bind("PAYMENT", a.id, ADMIN)
    assert inactive.value.code == "ACCOUNT_NOT_ACTIVE"


async def test_rebinding_moves_the_feature(repo):
    a = await repo.upsert_connected(me=me(1), session_string="S", source="PANEL", actor=ADMIN)
    b = await repo.upsert_connected(me=me(2), session_string="S", source="PANEL", actor=ADMIN)
    await repo.bind("PAYMENT", a.id, ADMIN)
    await repo.bind("PAYMENT", b.id, ADMIN)
    assert await repo.bindings() == {"PAYMENT": b.id}
    assert await repo.features_of(a.id) == []
    assert await repo.features_of(b.id) == ["PAYMENT"]


async def test_disconnect_wipes_the_session_and_leaves_an_audit_trail(repo, engine):
    a = await repo.upsert_connected(me=me(), session_string="S", source="PANEL", actor=ADMIN)
    await repo.mark_disconnected(a.id, ADMIN)

    assert (await repo.get(a.id)).status == "DISCONNECTED"
    assert a.id not in await repo.active_ids()
    async with engine.connect() as conn:
        ct = (await conn.execute(
            text("SELECT session_ciphertext FROM userbot_accounts"))).scalar_one()
        actions = (await conn.execute(
            text("SELECT action FROM userbot_audit ORDER BY id"))).scalars().all()
    assert ct == b""
    assert actions == ["CONNECTED", "DISCONNECTED"]


async def test_an_unknown_account_is_not_found(repo):
    with pytest.raises(ApiError) as e:
        await repo.get(uuid.uuid4())
    assert e.value.code == "ACCOUNT_NOT_FOUND"
