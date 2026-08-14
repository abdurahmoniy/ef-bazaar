-- When a trade's escrow was resolved — settled to the seller or released back
-- to the buyer. NULL on a terminal SMART trade means the money is still frozen
-- and somebody has to finish the job.
--
-- Needed because release() deliberately swallows its failure: a trade nobody
-- can close is worse than a refund that is late. That trade-off is only safe
-- if something comes back for the refund, and this column is what it looks at.
--
-- NULL on a non-terminal trade means nothing — the escrow is meant to be held.
ALTER TABLE trades ADD COLUMN escrow_resolved_at TIMESTAMPTZ;

-- The sweeper's only query: terminal SMART trades still owing a movement.
-- Partial, because that set is tiny and the table is not.
--
-- This has to come after V13, which is where the `mode` column arrives. It was
-- first written as V10 and Flyway refused it outright: `ls | tail` sorts V10
-- before V6, so the "next free" version looked much lower than it was.
CREATE INDEX ix_trades_escrow_unresolved
    ON trades (created_at)
    WHERE escrow_resolved_at IS NULL AND mode = 'SMART';
