"""Dataclasses + JSON (de)serialization for the trade Kafka topics.

Wire format matches Java `TradeEvents` records serialized with Spring's Jackson
`JsonSerializer`. Field names in payloads are camelCase; UUIDs are strings;
timestamps are ISO-8601 with 'Z' suffix; bytes are base64 without padding rules
that would break Java's Base64.getDecoder().
"""

from __future__ import annotations

import base64
import json
import types
import typing
from dataclasses import MISSING, dataclass, fields, is_dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from smart_admin_worker.kafka import topics

# ---------- Request DTOs (worker consumes) ----------


@dataclass(frozen=True, slots=True)
class EmailProvisionRequest:
    trade_id: UUID
    # Placeholder mailbox id supplied by trade-service. Worker echoes it back
    # in EmailProvisioned so all IDs (persisted mailbox row, encryption
    # context, rotate cache key) share the same UUID.
    mailbox_id: UUID


@dataclass(frozen=True, slots=True)
class ForgotPasswordRequest:
    trade_id: UUID
    mailbox_email: str
    konami_id: str | None


@dataclass(frozen=True, slots=True)
class ImapPollRequest:
    trade_id: UUID
    mailbox_email: str
    purpose: str  # VERIFY_LINK | WAIT_2FA_CODE


@dataclass(frozen=True, slots=True)
class MailboxProvisionRequest:
    """Admin-panel mailbox registration — no trade attached.

    The admin picks the local part, so unlike EmailProvisionRequest there is
    nothing to derive it from. mailbox_id is both the row id trade-service
    already reserved and the encryption context.
    """

    mailbox_id: UUID
    local_part: str


@dataclass(frozen=True, slots=True)
class MailboxRotateRequest:
    mailbox_id: UUID


# ---------- Response DTOs (worker produces) ----------


@dataclass(frozen=True, slots=True)
class EmailProvisioned:
    trade_id: UUID
    mailbox_id: UUID
    mailbox_email: str
    encrypted_password: bytes
    iv: bytes
    tag: bytes


@dataclass(frozen=True, slots=True)
class KonamiEmailReceived:
    trade_id: UUID
    reset_link_present: bool
    sender: str
    received_at: datetime


@dataclass(frozen=True, slots=True)
class Imap2faCode:
    trade_id: UUID
    code: str
    received_at: datetime


@dataclass(frozen=True, slots=True)
class MailboxProvisioned:
    mailbox_id: UUID
    mailbox_email: str
    encrypted_password: bytes
    iv: bytes
    tag: bytes


@dataclass(frozen=True, slots=True)
class MailboxRotated:
    mailbox_id: UUID
    encrypted_password: bytes
    iv: bytes
    tag: bytes


@dataclass(frozen=True, slots=True)
class KonamiEmailChangeCodeReceived:
    trade_id: UUID
    verification_code: str
    received_at: datetime
    sender: str
    # Which escrow mailbox it landed in. A swap has two, each with its own
    # code, and without this trade-service cannot tell whose is whose.
    mailbox_email: str


# ---------- Backpressure DTOs (worker produces, NEW) ----------


@dataclass(frozen=True, slots=True)
class WorkerQueued:
    trade_id: UUID
    purpose: str
    estimated_wait_seconds: int


@dataclass(frozen=True, slots=True)
class WorkerStarted:
    trade_id: UUID
    purpose: str


# ---------- Serialization ----------

_SNAKE_TO_CAMEL_OVERRIDES: dict[str, str] = {
    "reset_link_present": "resetLinkPresent",
    "encrypted_password": "encryptedPassword",
    "estimated_wait_seconds": "estimatedWaitSeconds",
    "trade_id": "tradeId",
    "mailbox_id": "mailboxId",
    "mailbox_email": "mailboxEmail",
    "konami_id": "konamiId",
    "received_at": "receivedAt",
    "verification_code": "verificationCode",
    "local_part": "localPart",
}


def _to_camel(name: str) -> str:
    if name in _SNAKE_TO_CAMEL_OVERRIDES:
        return _SNAKE_TO_CAMEL_OVERRIDES[name]
    parts = name.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def _encode_value(v: Any) -> Any:
    if isinstance(v, UUID):
        return str(v)
    if isinstance(v, datetime):
        return v.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    if isinstance(v, bytes):
        return base64.b64encode(v).decode("ascii")
    return v


def to_json(event: Any) -> bytes:
    if not is_dataclass(event):
        raise TypeError(f"not a dataclass: {type(event).__name__}")
    payload = {
        _to_camel(f.name): _encode_value(getattr(event, f.name)) for f in fields(event)
    }
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


_TOPIC_TO_TYPE: dict[str, type] = {
    topics.TOPIC_EMAIL_PROVISION_REQ: EmailProvisionRequest,
    topics.TOPIC_FORGOT_PW_REQ: ForgotPasswordRequest,
    topics.TOPIC_IMAP_POLL_REQ: ImapPollRequest,
    topics.TOPIC_MAILBOX_ROTATE_REQ: MailboxRotateRequest,
    topics.TOPIC_MAILBOX_PROVISION_REQ: MailboxProvisionRequest,
}


def from_json(topic: str, data: bytes) -> Any:
    cls = _TOPIC_TO_TYPE.get(topic)
    if cls is None:
        raise ValueError(f"no DTO registered for topic {topic}")
    payload = json.loads(data.decode("utf-8"))
    kwargs = {}
    for field in fields(cls):
        camel = _to_camel(field.name)
        if camel not in payload:
            # Optional fields (Union[..., None]) may be absent; anything else
            # without a default is required — surface a clear ValueError rather
            # than a cryptic TypeError from the dataclass constructor.
            if _field_is_optional(field.type) or field.default is not MISSING \
                    or field.default_factory is not MISSING:
                continue
            raise ValueError(
                f"Missing required field '{camel}' in {cls.__name__} payload"
            )
        kwargs[field.name] = _decode_field(field.name, payload[camel])
    return cls(**kwargs)


def _decode_field(name: str, raw: Any) -> Any:
    if raw is None:
        return None
    if name in ("trade_id", "mailbox_id"):
        return UUID(raw)
    return raw


def _field_is_optional(annotation: Any) -> bool:
    """True if the annotation is a Union (or PEP-604 X | None) that includes None.

    Because our dataclasses declare `from __future__ import annotations`, the
    `field.type` we see is a string like ``"str | None"`` — evaluate it against
    the module namespace before inspecting the resulting type.
    """
    resolved = annotation
    if isinstance(annotation, str):
        try:
            resolved = eval(annotation, globals())  # noqa: S307 — trusted DTO annotations
        except Exception:
            return False
    origin = typing.get_origin(resolved)
    if origin is typing.Union or origin is types.UnionType:
        return type(None) in typing.get_args(resolved)
    return False
