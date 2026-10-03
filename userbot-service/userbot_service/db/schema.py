from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    Identity,
    LargeBinary,
    MetaData,
    Table,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

metadata = MetaData()

accounts = Table(
    "userbot_accounts", metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("telegram_user_id", BigInteger, nullable=False, unique=True),
    Column("first_name", Text, nullable=False),
    Column("last_name", Text),
    Column("username", Text),
    Column("phone_masked", Text, nullable=False),
    Column("session_ciphertext", LargeBinary, nullable=False),
    Column("session_iv", LargeBinary, nullable=False),
    Column("status", Text, nullable=False),
    Column("source", Text, nullable=False),
    Column("connected_by", UUID(as_uuid=True)),
    Column("connected_at", DateTime(timezone=True), nullable=False),
    Column("status_changed_at", DateTime(timezone=True), nullable=False),
    Column("status_reason", Text),
)

bindings = Table(
    "userbot_bindings", metadata,
    Column("feature", Text, primary_key=True),
    Column("account_id", UUID(as_uuid=True), ForeignKey("userbot_accounts.id"), nullable=False),
    Column("bound_by", UUID(as_uuid=True)),
    Column("bound_at", DateTime(timezone=True), nullable=False),
)

leases = Table(
    "userbot_leases", metadata,
    Column("account_id", UUID(as_uuid=True),
           ForeignKey("userbot_accounts.id", ondelete="CASCADE"), primary_key=True),
    Column("runner", Text, nullable=False),
    Column("lease_until", DateTime(timezone=True), nullable=False),
    Column("last_heartbeat", DateTime(timezone=True), nullable=False),
)

humo_watch_state = Table(
    "humo_watch_state", metadata,
    Column("account_id", UUID(as_uuid=True),
           ForeignKey("userbot_accounts.id", ondelete="CASCADE"), primary_key=True),
    Column("last_message_id", BigInteger, nullable=False),
)

humo_pending = Table(
    "humo_pending", metadata,
    Column("account_id", UUID(as_uuid=True), primary_key=True),
    Column("message_id", BigInteger, primary_key=True),
    Column("topic", Text, nullable=False),
    Column("payload", JSONB, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)

audit = Table(
    "userbot_audit", metadata,
    Column("id", BigInteger, Identity(), primary_key=True),
    Column("action", Text, nullable=False),
    Column("account_id", UUID(as_uuid=True)),
    Column("feature", Text),
    Column("actor", UUID(as_uuid=True)),
    Column("at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)
