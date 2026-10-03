"""AES-GCM for session strings. A session string is full control of a
Telegram account, so it is only ever at rest encrypted."""

from __future__ import annotations

import base64
import binascii
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class SessionCipher:
    def __init__(self, key_b64: str) -> None:
        try:
            key = base64.b64decode(key_b64, validate=True)
        except (binascii.Error, ValueError) as e:
            raise ValueError("USERBOT_SESSION_KEY is not valid base64") from e
        if len(key) != 32:
            raise ValueError(
                "USERBOT_SESSION_KEY must decode to 32 bytes (openssl rand -base64 32)"
            )
        self._aes = AESGCM(key)

    def encrypt(self, plaintext: str) -> tuple[bytes, bytes]:
        iv = os.urandom(12)
        return self._aes.encrypt(iv, plaintext.encode("utf-8"), None), iv

    def decrypt(self, ciphertext: bytes, iv: bytes) -> str:
        return self._aes.decrypt(iv, ciphertext, None).decode("utf-8")
