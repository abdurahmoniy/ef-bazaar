-- ==============================================================
-- trade-service V7 — add chat_id to trades.
--
-- Links a trade back to the marketplace-service chat it was opened
-- from. Needed so the chat UI can look up "the trade for this chat"
-- in a single query instead of scanning by (seller,buyer,listing).
--
-- Nullable because pre-migration trades and openTrade callers that
-- don't have a chat (e.g. some integration tests) are still valid.
-- ==============================================================

ALTER TABLE trades ADD COLUMN chat_id UUID;

-- Cheap lookup for `GET /api/v1/trades?chatId=`.
CREATE INDEX idx_trades_chat_id ON trades (chat_id) WHERE chat_id IS NOT NULL;
