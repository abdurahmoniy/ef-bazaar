-- auth-service V8 — user-submitted applications for ROLE_TRADE_ADMIN.
-- auth-service owns this queue because it owns users and role changes.

CREATE TABLE trade_admin_applications (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    applicant_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status              VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    reason              VARCHAR(1000) NOT NULL,
    contact             VARCHAR(255),
    decision_note       VARCHAR(500),
    reviewer_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at         TIMESTAMPTZ,

    CONSTRAINT chk_taa_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    CONSTRAINT chk_taa_reviewed_state CHECK (
        (status = 'PENDING' AND reviewed_at IS NULL)
        OR (status IN ('APPROVED', 'REJECTED') AND reviewed_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX ux_taa_one_pending_per_user
    ON trade_admin_applications (applicant_user_id)
    WHERE status = 'PENDING';

CREATE INDEX ix_taa_status_created
    ON trade_admin_applications (status, created_at DESC);

CREATE INDEX ix_taa_applicant_created
    ON trade_admin_applications (applicant_user_id, created_at DESC);
