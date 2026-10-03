"""One-time move of the terminal-created `.session` file into the database.

The file is left in place so the old image can still be rolled back to. It is
read only while no PAYMENT binding exists, i.e. once."""

from __future__ import annotations

import logging
from collections.abc import Callable
from pathlib import Path
from uuid import UUID

from userbot_service.errors import ApiError
from userbot_service.features import PAYMENT
from userbot_service.repository import AccountRepository
from userbot_service.telegram.ports import LegacySession

log = logging.getLogger(__name__)


async def import_legacy_session(
    *, session_file: Path, repo: AccountRepository, open_legacy: Callable[[], LegacySession],
) -> UUID | None:
    if not session_file.exists() or PAYMENT in await repo.bindings():
        return None
    legacy = open_legacy()
    try:
        me = await legacy.open()
        session = await legacy.export()
    finally:
        await legacy.close()
    try:
        account = await repo.upsert_connected(
            me=me, session_string=session, source="IMPORTED", actor=None, bind_feature=PAYMENT)
    except ApiError as e:
        if e.code != "ALREADY_CONNECTED":
            raise
        account = await repo.find_by_telegram_id(me.telegram_user_id)
        await repo.bind(PAYMENT, account.id, None)
    log.info("imported the terminal session as account %s and bound it to PAYMENT", account.id)
    return account.id
