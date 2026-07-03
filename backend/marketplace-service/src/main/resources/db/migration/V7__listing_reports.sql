-- ==============================================================
-- marketplace-service — V7: listing_reports
-- Xaridorlar/foydalanuvchilar shubhali e'lonlarni "Shikoyat" tugmasi
-- orqali belgilay oladi. Har bir foydalanuvchi bir e'lonni faqat bir
-- marta belgilaydi (uk_listing_reports_listing_reporter).
-- ==============================================================

CREATE TABLE listing_reports (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id   UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    reporter_id  UUID NOT NULL,
    reason       VARCHAR(64)  NOT NULL,
    details      TEXT,
    status       VARCHAR(16)  NOT NULL DEFAULT 'PENDING',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uk_listing_reports_listing_reporter UNIQUE (listing_id, reporter_id),
    CONSTRAINT chk_listing_reports_status CHECK (status IN ('PENDING', 'RESOLVED', 'DISMISSED'))
);

CREATE INDEX idx_listing_reports_listing_status ON listing_reports (listing_id, status);
CREATE INDEX idx_listing_reports_created_at     ON listing_reports (created_at DESC);
