-- ==============================================================
-- marketplace-service V22 — chat message type.
-- Existing rows are chat text — default to 'TEXT'. Trade-service will
-- insert 'TRADE_PROPOSAL' rows via its Kafka consumer (see
-- TradeProposalConsumer). No other types envisioned for MVP.
-- proposal_id + proposal_outcome carry system-message state without
-- inventing a second table.
-- ==============================================================

ALTER TABLE chat_messages
    ADD COLUMN message_type      VARCHAR(24) NOT NULL DEFAULT 'TEXT',
    ADD COLUMN proposal_id       UUID,
    ADD COLUMN proposal_outcome  VARCHAR(16);

ALTER TABLE chat_messages
    ADD CONSTRAINT chk_chat_messages_type
        CHECK (message_type IN ('TEXT', 'TRADE_PROPOSAL')),
    ADD CONSTRAINT chk_chat_messages_proposal_outcome
        CHECK (proposal_outcome IS NULL
            OR proposal_outcome IN ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED'));

-- Fast lookup when a proposal resolves and we need to patch the system row.
CREATE INDEX idx_chat_messages_proposal_id ON chat_messages (proposal_id)
    WHERE proposal_id IS NOT NULL;
