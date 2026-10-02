"""Tests for the chat reference the Telegram filter is built from.

`pyrogram.filters.chat` compares a str against `chat.username` and an int
against `chat.id`. A numeric chat id handed over as the string "-1001234567890"
is therefore compared against usernames and matches nothing — the userbot
would connect, log "started", and observe zero top-ups forever. Silent, and in
the safe direction only because nobody gets credited.

No env vars and no Settings instance here: `as_chat_ref` is a pure function so
this stays runnable without a Telegram account.
"""

from userbot_service.config import Settings, as_chat_ref


def test_a_username_stays_a_string():
    assert as_chat_ref("humocardbot") == "humocardbot"


def test_a_username_keeps_its_at_sign_handling_to_pyrogram():
    assert as_chat_ref("@humocardbot") == "@humocardbot"


def test_a_numeric_chat_id_becomes_an_int():
    assert as_chat_ref("777000") == 777000


def test_a_negative_supergroup_id_becomes_an_int():
    assert as_chat_ref("-1001234567890") == -1001234567890


def test_surrounding_whitespace_is_stripped():
    assert as_chat_ref("  -1001234567890  ") == -1001234567890
    assert as_chat_ref("  humocardbot  ") == "humocardbot"


def test_legacy_session_name_default_is_unchanged(monkeypatch):
    # The production volume holds humo_userbot_session.session and nothing
    # overrides TELEGRAM_SESSION_NAME; renaming the default would hide it.
    monkeypatch.delenv("TELEGRAM_SESSION_NAME", raising=False)
    monkeypatch.setenv("TELEGRAM_API_ID", "1")
    monkeypatch.setenv("TELEGRAM_API_HASH", "hash")
    monkeypatch.setenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
    assert Settings().telegram_session_name == "humo_userbot_session"
