CREATE TABLE plan_entitlement_view (
    plan_code VARCHAR(32) NOT NULL,
    key VARCHAR(64) NOT NULL,
    value VARCHAR(64),
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (plan_code, key)
);
CREATE TABLE user_plan_view (
    user_id UUID PRIMARY KEY,
    plan_code VARCHAR(32) NOT NULL,
    expires_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL
);
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
