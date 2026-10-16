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
    """Start (or, with ``restart``, re-start) watching a mailbox.

    ``trade_id`` is whatever trade-service keys the answer on: a trade, or a
    custom-mailbox link session. The credential fields are optional so older
    requests still decode; when present they let a poller start after a worker
    restart emptied the in-memory password cache. ``password_context`` is the
    HKDF context the password was sealed with.
    """

    trade_id: UUID
    mailbox_email: str
    purpose: str  # VERIFY_LINK | WAIT_2FA_CODE | WAIT_EMAIL_CHANGE_CODE
    password_context: str | None = None
    encrypted_password: bytes | None = None
    iv: bytes | None = None
    tag: bytes | None = None
    restart: bool = False


@dataclass(frozen=True, slots=True)
class ImapPollStopRequest:
    """Stop every poller of a mailbox — a link session ended."""

    mailbox_email: str


@dataclass(frozen=True, slots=True)
class MailboxProvisionRequest:
    """Admin-panel mailbox registration — no trade attached.

    The admin picks the local part, so unlike EmailProvisionRequest there is
    nothing to derive it from. mailbox_id is both the row id trade-service
    already reserved and the encryption context.
    """

    mailbox_id: UUID
    local_part: str
    # Mailcow domain; older trade-services did not send it (= the default).
    domain: str | None = None
    # A user-chosen (custom) name: an existing Mailcow box with it is not ours.
    custom: bool = False


@dataclass(frozen=True, slots=True)
class MailboxRotateRequest:
    """Rotate a mailbox's password.

    ``mailbox_email`` is optional only so a request queued by an older
    trade-service still decodes; every current publisher sends it.
    """

    mailbox_id: UUID
    mailbox_email: str | None = None


@dataclass(frozen=True)
class MailboxDeleteRequest:
    """An admin is clearing out a mailbox nobody holds.

    Carries the address rather than only the id: trade-service marks its own
    row deleted before publishing, so by the time this arrives there is nothing
    left here to look the address up from.
    """

    mailbox_id: UUID
    mailbox_email: str


# ---------- Response DTOs (worker produces) ----------


@dataclass(frozen=True, slots=True)
class EmailProvisionFailed:
    """Quti ochilmadi va urinishlar tugadi — savdo yopilishi kerak."""

    trade_id: UUID
    mailbox_id: UUID
    reason: str


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
    # Obmenda ikkita quti bor va javob qaysi biriga kelgani MUHIM: har
    # taraf o'z akkountini o'z qutisi orqali o'tkazadi. Manzilsiz
    # trade-service uni "hali bajarmagan birinchi tarafga" yozardi, ya'ni
    # tanga tashlardi.
    mailbox_email: str | None = None
    # Konami pochta Konami ID ga ulanmaganini aytdi: trade-service sotuvchiga
    # emailni o'tkazishni aytadi, savdo esa shu qadamda kutib turadi.
    email_not_registered: bool = False


@dataclass(frozen=True, slots=True)
class Imap2faCode:
    trade_id: UUID
    code: str
    # Qaysi qutidan. Obmenda ikkita quti bor va kod qutining egasiga emas,
    # uni qabul qilayotgan tarafga kerak — trade-service shu maydon bo'yicha
    # kimga yuborishni hal qiladi.
    mailbox_email: str
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
    "email_not_registered": "emailNotRegistered",
    "encrypted_password": "encryptedPassword",
    "estimated_wait_seconds": "estimatedWaitSeconds",
    "trade_id": "tradeId",
    "mailbox_id": "mailboxId",
    "mailbox_email": "mailboxEmail",
    "konami_id": "konamiId",
    "received_at": "receivedAt",
    "verification_code": "verificationCode",
    "local_part": "localPart",
    "password_context": "passwordContext",
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
    topics.TOPIC_MAILBOX_DELETE_REQ: MailboxDeleteRequest,
    topics.TOPIC_MAILBOX_PROVISION_REQ: MailboxProvisionRequest,
    topics.TOPIC_IMAP_POLL_STOP_REQ: ImapPollStopRequest,
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


_BYTES_REQUEST_FIELDS = frozenset({"encrypted_password", "iv", "tag"})


def _decode_field(name: str, raw: Any) -> Any:
    if raw is None:
        return None
    if name in ("trade_id", "mailbox_id"):
        return UUID(raw)
    if name in _BYTES_REQUEST_FIELDS:
        # Jackson writes byte[] as base64, the same way to_json() does.
        return base64.b64decode(raw)
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
