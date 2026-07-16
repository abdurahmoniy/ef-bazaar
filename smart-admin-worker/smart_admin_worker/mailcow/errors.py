"""Mailcow-domain exceptions."""

from __future__ import annotations


class MailcowApiError(Exception):
    """Generic Mailcow API failure (non-2xx unless a subclass matched first)."""

    def __init__(self, status_code: int, body: str) -> None:
        super().__init__(f"Mailcow API returned {status_code}: {body[:200]}")
        self.status_code = status_code
        self.body = body


class MailboxAlreadyExists(MailcowApiError):
    pass


class MailboxNotFound(MailcowApiError):
    pass
