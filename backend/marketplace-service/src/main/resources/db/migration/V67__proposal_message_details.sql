-- Keep each offer independent from the conversation's latest trade.
ALTER TABLE chat_messages
    ADD COLUMN proposal_kind VARCHAR(24),
    ADD COLUMN proposal_listing_id UUID,
    ADD COLUMN proposal_expires_at TIMESTAMPTZ,
    ADD COLUMN proposal_trade_id UUID;

-- Both event listeners lock the same row, so concurrent or reversed delivery
-- cannot acknowledge a resolution before its message has been updated.
CREATE TABLE proposal_message_resolutions (
    proposal_id UUID PRIMARY KEY,
    outcome VARCHAR(16),
    trade_id UUID
);
