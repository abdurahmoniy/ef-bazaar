-- Version tombstones survive removals and restarts; source time determines freshness.
CREATE TABLE plan_projection_state (
    kind VARCHAR(16) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    version BIGINT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (kind, entity_id)
);
CREATE TABLE plan_event_receipts (
    idempotency_key VARCHAR(256) PRIMARY KEY
);
