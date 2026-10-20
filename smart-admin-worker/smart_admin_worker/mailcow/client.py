"""Async Mailcow REST client.

Mailcow's API is quirky — it returns HTTP 200 even for logical failures, with
a JSON body like `[{"type": "danger", "msg": ["object_exists"]}]`. We map
those danger msgs to our domain exceptions so callers can retry/branch
sensibly. HTTP 4xx/5xx bubble up as MailcowApiError.
"""

from __future__ import annotations

import re
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


@dataclass(frozen=True, slots=True)
class MailboxInventoryEntry:
    mailbox_email: str
    used_bytes: int
    quota_bytes: int
    active: bool


MAX_INVENTORY_BYTES = 8 * 1024 * 1024
MAX_INVENTORY_MAILBOXES = 10_000
_DOMAIN = re.compile(r"(?=.{1,253}\Z)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+"
                     r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\Z")


def validate_domain(domain: str) -> str:
    if not isinstance(domain, str) or not _DOMAIN.fullmatch(domain):
        raise ValueError("Invalid inventory domain")
    return domain


def _byte_count(value: Any) -> int:
    # Mailcow PDO can encode BIGINT columns as decimal strings. Both GET
    # quota_used and quota are bytes, unlike POST add/mailbox's MiB quota.
    if isinstance(value, str) and re.fullmatch(r"[0-9]{1,19}", value):
        value = int(value)
    if type(value) is not int or not 0 <= value <= 2**63 - 1:
        raise ValueError("Invalid inventory byte count")
    return value


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

    async def get_mailbox_inventory(self, domain: str) -> list[MailboxInventoryEntry]:
        """Read a bounded, complete domain snapshot; errors are never empty lists.

        Official Mailcow OpenAPI: GET /api/v1/get/mailbox/all/{domain}.
        quota_used and quota are byte counts; active is 0/1 (often strings).
        """
        validate_domain(domain)
        async with self._client.stream("GET", f"/get/mailbox/all/{domain}") as response:
            if not 200 <= response.status_code < 300:
                raise MailcowApiError(response.status_code, "Inventory request failed")
            body = bytearray()
            async for chunk in response.aiter_bytes():
                body.extend(chunk)
                if len(body) > MAX_INVENTORY_BYTES:
                    raise MailcowApiError(200, "Inventory response exceeds byte limit")
        try:
            import json

            payload = json.loads(body)
            if not isinstance(payload, list) or len(payload) > MAX_INVENTORY_MAILBOXES:
                raise ValueError("Invalid inventory list")
            result = []
            seen = set()
            for entry in payload:
                if not isinstance(entry, dict):
                    raise ValueError("Invalid inventory entry")
                email = entry.get("username")
                if (not isinstance(email, str) or len(email) > 254 or email.count("@") != 1
                        or not 1 <= len(email.split("@")[0]) <= 64
                        or any(c.isspace() or ord(c) < 32 for c in email)):
                    raise ValueError("Invalid inventory mailbox address")
                email = email.lower()
                # Never publish unrelated server mailboxes, even if Mailcow's
                # endpoint unexpectedly returns rows outside the requested domain.
                if email.rsplit("@", 1)[1] != domain:
                    continue
                if email in seen:
                    raise ValueError("Duplicate inventory mailbox")
                seen.add(email)
                active = entry.get("active")
                if type(active) not in (str, int, bool) or active not in ("0", "1", 0, 1):
                    raise ValueError("Invalid inventory active flag")
                result.append(MailboxInventoryEntry(
                    email, _byte_count(entry.get("quota_used")),
                    _byte_count(entry.get("quota")), active in ("1", 1),
                ))
            return result
        except (ValueError, TypeError) as exc:
            raise MailcowApiError(200, "Malformed inventory response") from exc

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
        if not 200 <= r.status_code < 300:
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
        if not isinstance(body, list) or not body or any(
            not isinstance(entry, dict) or entry.get("type") not in ("success", "danger", "error")
            for entry in body
        ):
            raise MailcowApiError(200, "Malformed Mailcow mutation response")
        for entry in body:
            msg = entry.get("msg")
            if (not isinstance(msg, str | list) or not msg
                    or isinstance(msg, list) and not all(isinstance(part, str) for part in msg)):
                raise MailcowApiError(200, "Malformed Mailcow mutation message")
        failures = [entry for entry in body if entry["type"] != "success"]
        if not failures:
            return
        messages = []
        for entry in failures:
            msg = entry.get("msg") or []
            messages.append(msg if isinstance(msg, list) else [msg])
        if when_exists and all("object_exists" in parts for parts in messages):
            raise when_exists(200, "object_exists")
        if when_missing and all(
            any(part in ("object_dne", "not_found") for part in parts) for parts in messages
        ):
            raise when_missing(200, "object_dne")
        raise MailcowApiError(200, "Mailcow mutation refused")
