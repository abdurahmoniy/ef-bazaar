"""Publishes this service's own WARN/ERROR logs to `efbazaar.system.log-event`.

The bot consumes that topic and posts to the Telegram logs channel, so this is
how the worker joins the same reporting path as auth, marketplace, trade and
payment. Until now it only spoke up when a Kafka handler raised (the wrapper
in `main.py`); an IMAP poller dying or Mailcow refusing went nowhere.

This service logs only through stdlib `logging`, so the handler alone covers
it. The structlog adapter is carried along unused, so the file stays
diff-comparable with smart-admin-worker's copy — there is no shared module
between services and drift between near-identical files is how the two ends of
a contract quietly stop matching.

Publishing is async and log calls are not, and they may arrive off the loop,
so the record is handed
to the loop with `run_coroutine_threadsafe` and never awaited by the caller.
Reporting a problem must not become a second problem.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import traceback
from datetime import UTC, datetime
from typing import Any

from userbot_service.observability.log_throttle import LogThrottle

LOG_TOPIC = "efbazaar.system.log-event"

# Kafka's own logging would feed itself: publishing a record logs, which
# publishes a record. Same guard the Java forwarders apply to org.apache.kafka.
_MUTED_PREFIXES = ("aiokafka", "kafka", "userbot_service.observability")

_LEVEL_NAMES = {
    "critical": "ERROR", "exception": "ERROR", "error": "ERROR",
    "warning": "WARNING", "warn": "WARNING",
}


class KafkaLogForwarder:
    def __init__(self, producer, service_name: str, loop: asyncio.AbstractEventLoop,
                 throttle: LogThrottle | None = None) -> None:
        self._producer = producer
        self._service = service_name
        self._loop = loop
        self._throttle = throttle or LogThrottle()
        # Guards against a publish path that logs at WARN+ re-entering here.
        self._local = threading.local()

    # -- entry points ----------------------------------------------------

    def logging_handler(self) -> logging.Handler:
        """For the parts of the worker that use stdlib ``logging``."""
        forwarder = self

        class _Handler(logging.Handler):
            def emit(self, record: logging.LogRecord) -> None:
                if record.levelno < logging.WARNING:
                    return
                if record.name.startswith(_MUTED_PREFIXES):
                    return
                stack = None
                if record.exc_info:
                    stack = "".join(traceback.format_exception(*record.exc_info))
                forwarder.submit(
                    level=record.levelname,
                    logger=record.name,
                    thread=record.threadName or "",
                    message=record.getMessage(),
                    stack_trace=stack,
                    key=f"{record.name}|{_exception_name(record) or record.levelname}",
                )

        handler = _Handler()
        handler.setLevel(logging.WARNING)
        return handler

    def structlog_processor(self):
        """For the parts that use structlog, which never reaches stdlib.

        Returns the event dict untouched — it is a pass-through that happens
        to forward, so it can sit anywhere in the processor chain.
        """
        def processor(_logger: Any, method_name: str, event_dict: dict) -> dict:
            level = _LEVEL_NAMES.get(method_name.lower())
            if level is None:
                return event_dict
            event = str(event_dict.get("event", ""))
            fields = " ".join(
                f"{k}={v}" for k, v in event_dict.items()
                if k not in ("event", "exception", "timestamp", "level")
            )
            self.submit(
                level=level,
                logger=str(event_dict.get("logger", self._service)),
                thread=threading.current_thread().name,
                message=f"{event} {fields}".strip(),
                stack_trace=event_dict.get("exception"),
                key=f"{event_dict.get('logger', '')}|{event}",
            )
            return event_dict

        return processor

    # -- shared path -----------------------------------------------------

    def submit(self, level: str, logger: str, thread: str, message: str,
               stack_trace: str | None, key: str) -> None:
        if getattr(self._local, "publishing", False):
            return
        try:
            verdict = self._throttle.admit(key)
            if verdict.suppressed:
                self._enqueue(self._payload(
                    "WARNING", "LogThrottle", thread,
                    f"Oldingi daqiqada {verdict.suppressed} ta log xabari bostirildi "
                    "(takror yoki chegara). To'liq ko'rinish uchun Grafana/Loki.",
                    None))
            if not verdict.send:
                return
            self._enqueue(self._payload(level, logger, thread, message, stack_trace))
        except Exception:  # noqa: BLE001 — never let reporting break the caller
            pass

    def _payload(self, level: str, logger: str, thread: str,
                 message: str, stack_trace: str | None) -> dict:
        # Field names and shape are the bot's LogEventDto. A missing field
        # makes the bot's formatter throw and the message vanish.
        return {
            "service": self._service,
            "level": level,
            "logger": logger,
            "thread": thread,
            "message": message,
            "stackTrace": stack_trace,
            "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        }

    def _enqueue(self, payload: dict) -> None:
        async def publish() -> None:
            self._local.publishing = True
            try:
                await self._producer.publish(LOG_TOPIC, payload, self._service)
            except Exception:  # noqa: BLE001
                pass
            finally:
                self._local.publishing = False

        try:
            asyncio.run_coroutine_threadsafe(publish(), self._loop)
        except RuntimeError:
            # Loop already closed (shutdown). Nothing useful left to do.
            pass


def _exception_name(record: logging.LogRecord) -> str | None:
    if not record.exc_info or record.exc_info[0] is None:
        return None
    return record.exc_info[0].__name__
