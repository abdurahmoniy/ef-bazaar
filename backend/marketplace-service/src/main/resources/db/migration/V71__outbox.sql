-- Transactional outbox (uz.efbazaar:outbox). Manba: backend/libs/outbox/.../outbox-schema.sql.
-- Kutubxona sxemasi o'zgarsa — shu faylni emas, yangi V-migratsiyani yozing.
CREATE TABLE IF NOT EXISTS outbox_events (
    id           BIGSERIAL PRIMARY KEY,
    topic        TEXT        NOT NULL,
    message_key  TEXT,
    payload      BYTEA       NOT NULL,
    headers      JSONB       NOT NULL DEFAULT '[]',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    attempts     INT         NOT NULL DEFAULT 0,
    last_error   TEXT,
    parked_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS outbox_events_pending_idx
    ON outbox_events (id) WHERE published_at IS NULL AND parked_at IS NULL;

CREATE TABLE IF NOT EXISTS outbox_snapshot_pending (
    source    TEXT        NOT NULL,
    entity_id TEXT        NOT NULL,
    marked_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (source, entity_id)
);
CREATE SEQUENCE IF NOT EXISTS outbox_snapshot_version_seq;
