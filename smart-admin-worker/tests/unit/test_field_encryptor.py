"""Round-trip test against Java-emitted vectors.

Fixture: tests/fixtures/crypto_vectors.json (produced by
CryptoTestVectorsExporterTest.emitVectors on the Java side).

If this fails, the two crypto implementations have diverged and mail passwords
encrypted by one side won't decrypt on the other.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

import pytest
from cryptography.exceptions import InvalidTag

from smart_admin_worker.crypto.field_encryptor import EncryptedField, FieldEncryptor

FIXTURE = Path(__file__).parent.parent / "fixtures" / "crypto_vectors.json"


@pytest.fixture
def vectors():
    data = json.loads(FIXTURE.read_text())
    master = base64.b64decode(data["masterKeyBase64"])
    return master, data["vectors"]


def test_decrypt_java_ciphertexts(vectors):
    master, cases = vectors
    enc = FieldEncryptor(master)
    for c in cases:
        field = EncryptedField(
            iv=base64.b64decode(c["ivBase64"]),
            tag=base64.b64decode(c["tagBase64"]),
            ciphertext=base64.b64decode(c["ciphertextBase64"]),
        )
        plaintext = enc.decrypt(c["context"], field)
        assert plaintext == base64.b64decode(c["plaintextBase64"]), (
            f"Python decryption of Java ciphertext diverged for context={c['context']!r}"
        )


def test_python_round_trip(vectors):
    master, cases = vectors
    enc = FieldEncryptor(master)
    for c in cases:
        plaintext = base64.b64decode(c["plaintextBase64"])
        field = enc.encrypt(c["context"], plaintext)
        assert enc.decrypt(c["context"], field) == plaintext


def test_wrong_context_fails_authentication(vectors):
    master, cases = vectors
    enc = FieldEncryptor(master)
    c = cases[0]
    field = EncryptedField(
        iv=base64.b64decode(c["ivBase64"]),
        tag=base64.b64decode(c["tagBase64"]),
        ciphertext=base64.b64decode(c["ciphertextBase64"]),
    )
    with pytest.raises(InvalidTag):
        enc.decrypt("wrong-context", field)
