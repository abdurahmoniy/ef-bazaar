from __future__ import annotations

import base64
from uuid import uuid4

import httpx
import pytest
import respx

from smart_admin_worker.crypto.field_encryptor import EncryptedField

BASE = "http://trade.fixture.test:8085"


@respx.mock
async def test_claim_carries_sealed_credentials_and_returns_original_replay_password():
    from smart_admin_worker.trade.client import ProvisionClaimClient

    mailbox, trade, claim_id = uuid4(), uuid4(), uuid4()
    original = EncryptedField(b"i" * 12, b"t" * 16, b"original")
    route = respx.post(f"{BASE}/internal/mailboxes/{mailbox}/provision-claim").mock(
        return_value=httpx.Response(
            200,
            json={
                "claimId": str(claim_id),
                "mailboxId": str(mailbox),
                "mailboxEmail": "kept@efbazaar.uz",
                "allowCreate": False,
                "encryptedPassword": base64.b64encode(original.ciphertext).decode(),
                "iv": base64.b64encode(original.iv).decode(),
                "tag": base64.b64encode(original.tag).decode(),
            },
        )
    )
    client = ProvisionClaimClient(BASE, "fixture-secret")
    try:
        result = await client.claim(mailbox, trade, "kept@efbazaar.uz", original)
        assert result.claim_id == claim_id and result.allow_create is False
        assert result.password == original
        assert route.calls.last.request.headers["X-Internal-Secret"] == "fixture-secret"
        import json

        body = json.loads(route.calls.last.request.content)
        assert body["tradeId"] == str(trade)
        assert body["mailboxEmail"] == "kept@efbazaar.uz"
        assert body["addressVersion"] == 2
        assert "password" not in body
    finally:
        await client.aclose()


@pytest.mark.parametrize(
    "body",
    [
        {"allowCreate": "true"},
        {"allowCreate": True, "mailboxEmail": "other@efbazaar.uz"},
        {"allowCreate": True, "mailboxId": str(uuid4()), "encryptedPassword": "bad"},
    ],
)
@respx.mock
async def test_malformed_or_mismatched_claim_never_authorizes_create(body):
    from smart_admin_worker.trade.client import ProvisionClaimClient

    mailbox = uuid4()
    respx.post(f"{BASE}/internal/mailboxes/{mailbox}/provision-claim").mock(
        return_value=httpx.Response(200, json=body)
    )
    client = ProvisionClaimClient(BASE, "fixture-secret")
    try:
        with pytest.raises(ValueError):
            await client.claim(
                mailbox, None, "kept@efbazaar.uz", EncryptedField(b"i" * 12, b"t" * 16, b"c")
            )
    finally:
        await client.aclose()


@respx.mock
async def test_claim_missing_secret_fails_closed_without_http_request():
    from smart_admin_worker.trade.client import ProvisionClaimClient

    client = ProvisionClaimClient(BASE, "")
    try:
        with pytest.raises(ValueError, match="secret"):
            await client.claim(
                uuid4(), None, "kept@efbazaar.uz", EncryptedField(b"i" * 12, b"t" * 16, b"c")
            )
        assert len(respx.calls) == 0
    finally:
        await client.aclose()


@pytest.mark.parametrize(
    "base_url",
    [
        "file:///tmp/not-http",
        "http://user:password@trade.fixture",
        "http://trade.fixture/?token=secret",
    ],
)
def test_claim_client_rejects_nonservice_or_credential_bearing_base_urls(base_url):
    from smart_admin_worker.trade.client import ProvisionClaimClient

    with pytest.raises(ValueError):
        ProvisionClaimClient(base_url, "fixture-secret")
