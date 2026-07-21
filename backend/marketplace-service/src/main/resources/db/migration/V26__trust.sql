-- Trust module: complaints → penalty engine → public blacklist.
--
-- complaints: one row per grievance; UNIQUE (complainant, context) blocks
-- spam re-filing on the same match/trade/chat.
-- penalties: graduated sanctions (1 confirmed = WARNING, 3 = 7-day
-- TEMP_BLOCK, 5+ = PERM_BLOCK). expires_at NULL = permanent.
-- blacklist_identifiers: external identities (Konami ID, telegram, phone)
-- attached to a penalty so re-registrations are catchable. Values are
-- normalized (lowercase, no '@', digits-only phone) before insert.

CREATE TABLE complaints (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complainant_id        UUID NOT NULL,
    accused_id            UUID NOT NULL,
    context_type          VARCHAR(16) NOT NULL CHECK (context_type IN ('MATCH', 'TRADE', 'CHAT')),
    context_id            VARCHAR(64) NOT NULL,
    category              VARCHAR(24) NOT NULL CHECK (category IN ('LAG_BREAK', 'FRAUD', 'TOXIC', 'FAKE_RESULT')),
    details               TEXT,
    evidence_message_ids  TEXT[],
    status                VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED')),
    reviewed_by           UUID,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at           TIMESTAMPTZ,
    CONSTRAINT uk_complaints_context UNIQUE (complainant_id, context_type, context_id)
);

CREATE INDEX idx_complaints_accused ON complaints (accused_id, status);
CREATE INDEX idx_complaints_complainant ON complaints (complainant_id, status);
CREATE INDEX idx_complaints_status ON complaints (status, created_at DESC);

CREATE TABLE penalties (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL,
    type                  VARCHAR(16) NOT NULL CHECK (type IN ('WARNING', 'TEMP_BLOCK', 'PERM_BLOCK')),
    reason                VARCHAR(128) NOT NULL,
    source_complaint_ids  UUID[],
    starts_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at            TIMESTAMPTZ,
    status                VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'REVOKED')),
    created_by            UUID,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_penalties_user_active ON penalties (user_id) WHERE status = 'ACTIVE';
CREATE INDEX idx_penalties_public ON penalties (status, type, created_at DESC);

CREATE TABLE blacklist_identifiers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    penalty_id  UUID NOT NULL REFERENCES penalties (id) ON DELETE CASCADE,
    type        VARCHAR(24) NOT NULL CHECK (type IN ('KONAMI_ID', 'TELEGRAM_ID', 'TELEGRAM_USERNAME', 'PHONE')),
    value       VARCHAR(128) NOT NULL
);

CREATE INDEX idx_blacklist_identifiers_lookup ON blacklist_identifiers (type, value);
