"""structlog configuration.

Format: JSON in prod-ish environments, human-readable in dev. Prod flag comes
from the LOG_LEVEL setting — we don't detect DEV vs PROD; we just always
render JSON. Docker + Loki + Grafana consume it uniformly.
"""

from __future__ import annotations

import logging
import sys

import structlog

# Set once the Kafka producer exists. A mutable holder rather than
# reconfiguring structlog later: structlog caches a logger's processor chain on
# first use, so a logger that spoke during startup would keep the old chain and
# its later errors would never reach Telegram.
_forwarder: dict[str, object] = {"fwd": None}


def _forward_to_kafka(logger, method_name, event_dict):
    """Pass-through processor; forwards WARN+ once a forwarder is attached."""
    fwd = _forwarder["fwd"]
    if fwd is not None:
        fwd.structlog_processor()(logger, method_name, event_dict)
    return event_dict


def attach_kafka_forwarder(forwarder) -> None:
    """Wires this service's own logs into `efbazaar.system.log-event`.

    Both halves, because the worker logs two ways: structlog (via the holder
    above) and stdlib logging (`kafka/consumer.py`, `imap/poller.py`). Wiring
    only one would silently miss half the service.
    """
    _forwarder["fwd"] = forwarder
    logging.getLogger().addHandler(forwarder.logging_handler())


def configure_logging(level: str) -> None:
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, level.upper(), logging.INFO),
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            _forward_to_kafka,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, level.upper(), logging.INFO)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
