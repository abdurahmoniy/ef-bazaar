"""AES-256-GCM + HKDF-SHA256 encryption, byte-compatible with Java TradeCrypto.

- Master key: 32 raw bytes.
- Per-record key: HKDF-SHA256(ikm=master, salt=32 zero bytes, info=context.utf-8, length=32).
- Cipher: AES-256-GCM with a 12-byte IV and 16-byte tag.
- On decrypt, GCM's authentication catches wrong-context/tampered data.

Vectors emitted by the Java CryptoTestVectorsExporterTest must round-trip
here — that's the compatibility contract.
"""

from __future__ import annotations

from dataclasses import dataclass
from os import urandom
from typing import Final

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

_KEY_LENGTH: Final = 32
_IV_LENGTH: Final = 12
_TAG_LENGTH: Final = 16
_EMPTY_SALT: Final = b"\x00" * 32


@dataclass(frozen=True, slots=True)
class EncryptedField:
    iv: bytes
    tag: bytes
    ciphertext: bytes

    def __post_init__(self) -> None:
        if len(self.iv) != _IV_LENGTH:
            raise ValueError("iv must be 12 bytes")
        if len(self.tag) != _TAG_LENGTH:
            raise ValueError("tag must be 16 bytes")


class FieldEncryptor:
    """Encrypt/decrypt using a per-context HKDF-derived subkey."""

    def __init__(self, master_key: bytes) -> None:
        if len(master_key) != _KEY_LENGTH:
            raise ValueError(f"master key must be {_KEY_LENGTH} bytes")
        self._master = master_key

    def _derive(self, context: str) -> bytes:
        hkdf = HKDF(
            algorithm=hashes.SHA256(),
            length=_KEY_LENGTH,
            salt=_EMPTY_SALT,
            info=context.encode("utf-8"),
        )
        return hkdf.derive(self._master)

    def encrypt(self, context: str, plaintext: bytes) -> EncryptedField:
        key = self._derive(context)
        iv = urandom(_IV_LENGTH)
        cipher_and_tag = AESGCM(key).encrypt(iv, plaintext, None)
        # AESGCM.encrypt returns ciphertext || tag.
        ciphertext = cipher_and_tag[:-_TAG_LENGTH]
        tag = cipher_and_tag[-_TAG_LENGTH:]
        return EncryptedField(iv=iv, tag=tag, ciphertext=ciphertext)

    def decrypt(self, context: str, field: EncryptedField) -> bytes:
        key = self._derive(context)
        cipher_and_tag = field.ciphertext + field.tag
        return AESGCM(key).decrypt(field.iv, cipher_and_tag, None)
