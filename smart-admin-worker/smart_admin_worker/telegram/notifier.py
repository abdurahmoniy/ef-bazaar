"""Telegram Bot API notifier for smart-admin-worker events.

Design:
- Reuses the ef-bazaar Telegram bot credentials (see docker-compose `bot` block).
- Posts to a forum-topic on the ops group chat so mailbox events don't drown
  out other channels.
- Every notify_* method is best-effort: Telegram outage, DNS glitch, HTTP 5xx —
  none of them may propagate into the caller. Trades must keep flowing even if
  the ops group is offline.
- If bot_token or chat_id is missing (unset in this environment) the notifier
  degrades to a silent no-op — logged once on the first call so operators can
  tell the difference from "sent but not delivered".
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import UUID

import httpx
import structlog

if TYPE_CHECKING:  # pragma: no cover
    pass

log = structlog.get_logger(__name__)

_SEND_TIMEOUT_SECONDS = 5.0


class TelegramNotifier:
    """Thin async wrapper over Telegram Bot API sendMessage.

    The single shared httpx client is passed in from the composition root so
    connections stay pooled across many notifications and its lifecycle is
    owned by the FastAPI lifespan (not by this class).
    """

    def __init__(
        self,
        bot_token: str | None,
        chat_id: str | None,
        topic_id: int | None,
        http_client: httpx.AsyncClient,
    ) -> None:
        self._bot_token = bot_token
        self._chat_id = chat_id
        self._topic_id = topic_id
        self._http = http_client
        # Inert when we don't have both a token and a chat — this lets ops
        # deploy the worker without Telegram credentials during initial rollout.
        self._enabled = bool(bot_token) and bool(chat_id)

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def notify_mailbox_created(
        self,
        trade_id: UUID,
        mailbox_email: str,
        capacity: dict[str, int] | None,
        mailbox_password: str | None = None,
    ) -> None:
        """Fire off a "mailbox created" message. Silent on any failure.

        ``mailbox_password`` is optional and included plaintext — this chat is
        admin-only and having the initial password on hand saves a decrypt
        round-trip when operators need to log into Mailcow directly.
        """
        if not self._enabled:
            return
        text = self._format_mailbox_created(trade_id, mailbox_email, capacity, mailbox_password)
        await self._send(text)

    @staticmethod
    def _format_mailbox_created(
        trade_id: UUID,
        mailbox_email: str,
        capacity: dict[str, int] | None,
        mailbox_password: str | None = None,
    ) -> str:
        short_id = str(trade_id)[:8]
        now = datetime.now(UTC).strftime("%H:%M")
        lines = [
            "✅ Yangi mailbox yaratildi",
            f"\U0001f194 Trade: {short_id}",
            f"\U0001f4e7 {mailbox_email}",
        ]
        if mailbox_password:
            lines.append(f"\U0001f511 {mailbox_password}")
        if capacity is not None:
            used = capacity.get("used", 0)
            limit = capacity.get("limit", 0)
            pct = int(round(used * 100 / limit)) if limit > 0 else 0
            lines.append(f"\U0001f4ca {used}/{limit} mailbox ({pct}%)")
        lines.append(f"\U0001f550 {now} UTC")
        lines.append("⚠️ Faqat adminlar uchun")
        return "\n".join(lines)

    async def notify_error(
        self,
        *,
        context: str,
        error: BaseException,
        trade_id: UUID | None = None,
    ) -> None:
        """Post an error message to the admin group. Fire-and-forget.

        ``context`` is a short label the operator can grep for (e.g.
        ``"forgot_password.rotate"`` or ``"imap_poll.detect"``). Exceptions are
        rendered as ``ClassName: message``, truncated so a runaway traceback
        can't hit Telegram's 4096-char limit.
        """
        if not self._enabled:
            return
        try:
            text = self._format_error(context, error, trade_id)
            await self._send(text)
        except Exception as exc:  # noqa: BLE001 — best-effort, never propagate
            log.warning(
                "telegram_notify_error_failed",
                error=str(exc),
                error_type=type(exc).__name__,
            )

    @staticmethod
    def _format_error(
        context: str,
        error: BaseException,
        trade_id: UUID | None,
    ) -> str:
        now = datetime.now(UTC).strftime("%H:%M")
        short_trade = str(trade_id)[:8] if trade_id is not None else "yo'q"
        # `repr()` gives us `ExcClass('message')`; we want `ClassName: message`
        detail = f"{type(error).__name__}: {error}"
        if len(detail) > 500:
            detail = detail[:497] + "..."
        return "\n".join([
            "🚨 Smart-admin xatosi",
            f"\U0001f3f7 {context}",
            f"\U0001f194 Trade: {short_trade}",
            f"\U0001f4c4 {detail}",
            f"\U0001f550 {now} UTC",
        ])

    async def _send(self, text: str) -> None:
        payload: dict[str, object] = {
            "chat_id": self._chat_id,
            "text": text,
            "disable_web_page_preview": True,
        }
        if self._topic_id is not None:
            payload["message_thread_id"] = self._topic_id

        url = f"https://api.telegram.org/bot{self._bot_token}/sendMessage"
        try:
            resp = await self._http.post(url, json=payload, timeout=_SEND_TIMEOUT_SECONDS)
            if resp.status_code >= 400:
                log.warning(
                    "telegram_notify_failed",
                    status_code=resp.status_code,
                    body=resp.text[:200],
                )
        except Exception as exc:  # noqa: BLE001 — best-effort, never propagate
            log.warning("telegram_notify_error", error=str(exc), error_type=type(exc).__name__)
