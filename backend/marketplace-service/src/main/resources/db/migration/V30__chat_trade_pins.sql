-- ==============================================================
-- marketplace-service V30 — per-trade chat pin ledger.
--
-- Fixes a bug in V29's chats.system_important design: that column was set
-- absolutely by TradeChatPinConsumer, but a chat can host more than one
-- trade over its life (idx_trades_chat_id in trade-service is non-unique).
-- Two trades opened against the same chat, with the first closing while the
-- second is still live, would have unpinned a chat that still needed to
-- stay open — exactly the bug this feature exists to prevent.
--
-- chat_trade_pins holds one row per (chat, trade); chats.system_important is
-- now derived as "does any row for this chat have pinned = TRUE" instead of
-- being written directly. The consumer upserts with a last-write-wins guard
-- on occurred_at, so an out-of-order or redelivered trade-opened/trade-closed
-- pair self-corrects instead of sticking.
-- ==============================================================

CREATE TABLE chat_trade_pins (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id     UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    trade_id    UUID NOT NULL,
    pinned      BOOLEAN NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uk_chat_trade_pins_chat_trade UNIQUE (chat_id, trade_id)
);

-- Recompute query: "does this chat have any pinning trade" — partial index
-- keeps that EXISTS check cheap even as the ledger grows.
CREATE INDEX idx_chat_trade_pins_chat_pinned ON chat_trade_pins (chat_id) WHERE pinned = TRUE;
