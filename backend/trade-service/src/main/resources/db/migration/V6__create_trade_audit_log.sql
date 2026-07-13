-- ==============================================================
-- trade-service V6 — audit log.
-- Append-only. GDPR archival strategy is a follow-up (spec §11).
-- ==============================================================

CREATE TABLE trade_audit_log (
    id           BIGSERIAL PRIMARY KEY,
    trade_id     UUID          NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    actor_type   VARCHAR(16)   NOT NULL,
    actor_id     UUID,
    action       VARCHAR(64)   NOT NULL,
    metadata     JSONB,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_audit_actor CHECK (actor_type IN ('USER','WORKER','SYSTEM','ADMIN'))
);

CREATE INDEX idx_audit_trade_created ON trade_audit_log (trade_id, created_at);
