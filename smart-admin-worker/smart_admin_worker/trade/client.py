"""One-shot provision claims; no local/Redis fallback can authorize creation."""

from __future__ import annotations

import base64
from dataclasses import dataclass
from uuid import UUID

import httpx

from smart_admin_worker.crypto.field_encryptor import EncryptedField


@dataclass(frozen=True, slots=True)
class ProvisionClaim:
    claim_id: UUID
    mailbox_id: UUID
    mailbox_email: str
    allow_create: bool
    password: EncryptedField


class ProvisionClaimClient:
    def __init__(self, base_url: str, internal_secret: str) -> None:
        url = httpx.URL(base_url)
        if (
            url.scheme not in ("http", "https")
            or not url.host
            or url.username
            or url.password
            or url.query
            or url.fragment
        ):
            raise ValueError("Provision claim authority must use a plain HTTP(S) service URL")
        self._secret = internal_secret
        self._client = httpx.AsyncClient(base_url=base_url.rstrip("/"), timeout=15)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def claim(
        self,
        mailbox_id: UUID,
        trade_id: UUID | None,
        email: str,
        password: EncryptedField,
    ) -> ProvisionClaim | None:
        if not self._secret:
            raise ValueError("Trade internal secret is required for provisioning")
        response = await self._client.post(
            f"/internal/mailboxes/{mailbox_id}/provision-claim",
            headers={"X-Internal-Secret": self._secret},
            json={
                "tradeId": str(trade_id) if trade_id else None,
                "mailboxEmail": email,
                "addressVersion": 2,
                "encryptedPassword": base64.b64encode(password.ciphertext).decode(),
                "iv": base64.b64encode(password.iv).decode(),
                "tag": base64.b64encode(password.tag).decode(),
            },
        )
        if response.status_code == 409:
            return None
        response.raise_for_status()
        if not 200 <= response.status_code < 300 or len(response.content) > 65536:
            raise ValueError("Invalid provisioning claim response")
        data = response.json()
        try:
            if (
                not isinstance(data, dict)
                or data.get("mailboxId") != str(mailbox_id)
                or data.get("mailboxEmail") != email
                or type(data.get("allowCreate")) is not bool
            ):
                raise ValueError("Provision claim identity mismatch")
            field = EncryptedField(
                iv=base64.b64decode(data["iv"], validate=True),
                tag=base64.b64decode(data["tag"], validate=True),
                ciphertext=base64.b64decode(data["encryptedPassword"], validate=True),
            )
            if (
                len(field.iv) != 12
                or len(field.tag) != 16
                or not 1 <= len(field.ciphertext) <= 4096
            ):
                raise ValueError("Invalid sealed provisioning password")
            return ProvisionClaim(
                UUID(data["claimId"]), mailbox_id, email, data["allowCreate"], field
            )
        except (KeyError, TypeError, ValueError) as invalid:
            raise ValueError("Invalid provisioning claim response") from invalid
