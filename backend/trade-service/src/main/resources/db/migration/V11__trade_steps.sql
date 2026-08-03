-- ==============================================================
-- trade-service V11 — the six manual steps of a human trade.
--
-- Six rows are created when the admin accepts; the admin ticks them in
-- ANY order, and may untick to correct a mistake. 6/6 unlocks close.
--
-- NOTE: the design spec draws a composite primary key (trade_id, step).
-- A surrogate key plus UNIQUE gives the identical guarantee without a
-- JPA @IdClass, so that is what ships. Not an oversight.
-- ==============================================================

CREATE TABLE trade_steps (
    id           UUID PRIMARY KEY,
    trade_id     UUID        NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    step         VARCHAR(32) NOT NULL,
    completed_at TIMESTAMPTZ,
    completed_by UUID,
    note         VARCHAR(500),

    CONSTRAINT uk_trade_steps UNIQUE (trade_id, step),
    CONSTRAINT chk_trade_steps_step CHECK (step IN (
        'SELLER_BRIEFED', 'ACCOUNT_TRANSFERRED', 'ACCOUNT_VERIFIED',
        'PAYMENT_RECEIVED', 'CREDENTIALS_DELIVERED', 'SELLER_PAID')),
    -- completed_by is meaningless without a completion time and vice versa.
    CONSTRAINT chk_trade_steps_completion CHECK (
        (completed_at IS NULL AND completed_by IS NULL)
     OR (completed_at IS NOT NULL AND completed_by IS NOT NULL))
);

CREATE INDEX ix_trade_steps_trade ON trade_steps (trade_id);
