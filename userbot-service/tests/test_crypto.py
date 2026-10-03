import base64
import os

import pytest
from cryptography.exceptions import InvalidTag

from userbot_service.crypto import SessionCipher

KEY = base64.b64encode(os.urandom(32)).decode()


def test_a_session_string_round_trips():
    cipher = SessionCipher(KEY)
    ciphertext, iv = cipher.encrypt("BAADsession")
    assert cipher.decrypt(ciphertext, iv) == "BAADsession"


def test_the_ciphertext_does_not_contain_the_plaintext():
    ciphertext, _ = SessionCipher(KEY).encrypt("BAADsession")
    assert b"BAADsession" not in ciphertext


def test_every_encryption_uses_a_fresh_iv():
    cipher = SessionCipher(KEY)
    assert cipher.encrypt("x")[1] != cipher.encrypt("x")[1]


def test_a_wrong_key_cannot_decrypt():
    ciphertext, iv = SessionCipher(KEY).encrypt("secret")
    other = SessionCipher(base64.b64encode(os.urandom(32)).decode())
    with pytest.raises(InvalidTag):
        other.decrypt(ciphertext, iv)


@pytest.mark.parametrize("bad", ["", "not-base64!!", base64.b64encode(b"short").decode()])
def test_a_key_that_is_not_32_bytes_is_refused_at_startup(bad):
    with pytest.raises(ValueError, match="USERBOT_SESSION_KEY"):
        SessionCipher(bad)
