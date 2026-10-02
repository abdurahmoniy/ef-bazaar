from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from userbot_service.telegram.ports import (
    CodeSent,
    Me,
    Msg,
    PasswordNeeded,
    SessionDead,
    TelegramError,
)

ME = Me(telegram_user_id=5550001, first_name="Aziz", last_name=None, username="aziz",
        phone="998901234567")


class FakeLoginGateway:
    def __init__(self, *, code="12345", password=None, me=ME, send_error=None):
        self.code, self.password, self.me, self.send_error = code, password, me, send_error
        self.connected = self.logged_out = False
        self.sent = 0

    async def connect(self):
        self.connected = True

    async def send_code(self, phone):
        if self.send_error:
            raise self.send_error
        self.sent += 1
        return CodeSent("hash", "APP", 60)

    async def resend_code(self, phone, phone_code_hash):
        self.sent += 1
        return CodeSent("hash", "SMS", 120)

    async def sign_in(self, phone, phone_code_hash, code):
        await asyncio.sleep(0)
        if code != self.code:
            raise TelegramError("CODE_INVALID")
        if self.password is not None:
            raise PasswordNeeded("it's the cat")
        return self.me

    async def check_password(self, password):
        if password != self.password:
            raise TelegramError("PASSWORD_INVALID")
        return self.me

    async def export_session(self):
        return "EXPORTED-SESSION"

    async def log_out(self):
        self.logged_out = True

    async def disconnect(self):
        self.connected = False


class FakeAccountClient:
    def __init__(self, *, me=ME, dead_on_start=False, history=()):
        self.me = me
        self.dead_on_start = dead_on_start
        self.dead = False
        self.history = list(history)
        self.started = self.stopped = self.logged_out = False
        self.handlers = []

    @property
    def is_connected(self):
        return self.started and not self.stopped

    def has_handlers(self):
        return bool(self.handlers)

    async def start(self):
        if self.dead_on_start:
            raise SessionDead("AUTH_KEY_UNREGISTERED")
        self.started = True

    async def stop(self):
        self.stopped = True

    async def get_me(self):
        if self.dead:
            raise SessionDead("SESSION_REVOKED")
        return self.me

    async def log_out(self):
        self.logged_out = True
        self.stopped = True

    async def download_avatar(self, path):
        return False

    def on_incoming(self, chat, callback):
        self.handlers.append(callback)

    async def deliver(self, msg_id, text):
        for h in self.handlers:
            await h(Msg(msg_id, text, datetime(2026, 10, 1, tzinfo=UTC)))

    async def history_after(self, chat, after_id, limit=5000):
        return [m for m in self.history if m.id > after_id]

    async def newest_message_id(self, chat):
        return max((m.id for m in self.history), default=0)


class FakeKafka:
    def __init__(self):
        self.sent = []
        self.fail = False

    async def publish(self, topic, value, key=None):
        if self.fail:
            raise RuntimeError("kafka down")
        self.sent.append((topic, value, key))
