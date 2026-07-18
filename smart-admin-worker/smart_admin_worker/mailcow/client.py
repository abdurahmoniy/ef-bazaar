"""Async Mailcow REST client.

Mailcow's API is quirky — it returns HTTP 200 even for logical failures, with
a JSON body like `[{"type": "danger", "msg": ["object_exists"]}]`. We map
those danger msgs to our domain exceptions so callers can retry/branch
sensibly. HTTP 4xx/5xx bubble up as MailcowApiError.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from smart_admin_worker.mailcow.errors import (
    MailboxAlreadyExists,
    MailboxNotFound,
    MailcowApiError,
)


@dataclass(frozen=True, slots=True)
class Mailbox:
    email: str


class MailcowClient:
    def __init__(self, base_url: str, api_key: str, timeout_seconds: float = 15.0) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers={"X-API-Key": api_key, "Content-Type": "application/json"},
            timeout=timeout_seconds,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def create_mailbox(
        self,
        local_part: str,
        domain: str,
        password: str,
        quota_mb: int = 100,
    ) -> Mailbox:
        payload = {
            "local_part": local_part,
            "domain": domain,
            "quota": str(quota_mb),
            "password": password,
            "password2": password,
            "name": local_part,
            "active": "1",
            "force_pw_update": "0",
            "tls_enforce_in": "0",
            "tls_enforce_out": "0",
        }
        body = await self._post("/add/mailbox", payload)
        self._raise_for_msg(body, when_exists=MailboxAlreadyExists)
        return Mailbox(email=f"{local_part}@{domain}")

    async def rotate_password(self, mailbox_email: str, new_password: str) -> None:
        payload = {
            "items": [mailbox_email],
            "attr": {"password": new_password, "password2": new_password},
        }
        body = await self._post("/edit/mailbox", payload)
        self._raise_for_msg(body, when_missing=MailboxNotFound)

    async def delete_mailbox(self, mailbox_email: str) -> None:
        payload = [mailbox_email]
        body = await self._post("/delete/mailbox", payload)
        self._raise_for_msg(body, when_missing=MailboxNotFound)

    async def get_domain_capacity(self, domain: str) -> dict[str, int] | None:
        """Return current mailbox usage for the domain, or None on any error.

        Mailcow's /get/domain/<domain> returns a single object with
        ``mboxes_in_domain`` (used) and ``mboxes_left`` (remaining), from which
        the total limit is derived. This is best-effort decoration for the
        Telegram notification — any failure (HTTP error, unexpected shape,
        Mailcow down) returns None rather than raising, since a missing capacity
        line is much better than a crashed provision handler.
        """
        try:
            r = await self._client.get(f"/get/domain/{domain}")
            if r.status_code >= 400:
                return None
            data = r.json()
        except (httpx.HTTPError, ValueError):
            return None

        # Mailcow returns the object directly for /get/domain/<name>, but some
        # deployments return [obj]. Handle both defensively.
        if isinstance(data, list):
            data = data[0] if data else {}
        if not isinstance(data, dict):
            return None

        used = data.get("mboxes_in_domain")
        left = data.get("mboxes_left")
        if not isinstance(used, int) or not isinstance(left, int):
            return None
        return {"used": used, "limit": used + left}

    async def _post(self, path: str, payload: Any) -> list[dict]:
        r = await self._client.post(path, json=payload)
        if r.status_code >= 400:
            raise MailcowApiError(r.status_code, r.text)
        try:
            return r.json()
        except ValueError as e:
            raise MailcowApiError(r.status_code, r.text) from e

    @staticmethod
    def _raise_for_msg(
        body: list[dict],
        when_exists: type[MailcowApiError] | None = None,
        when_missing: type[MailcowApiError] | None = None,
    ) -> None:
        for entry in body:
            if entry.get("type") == "success":
                return
        for entry in body:
            msg = entry.get("msg") or []
            joined = " ".join(msg) if isinstance(msg, list) else str(msg)
            if when_exists and "object_exists" in joined:
                raise when_exists(200, joined)
            if when_missing and ("object_dne" in joined or "not_found" in joined):
                raise when_missing(200, joined)
        raise MailcowApiError(200, str(body))
