-- ==============================================================
-- trade-service V13 — human trade-admin mode.
--
-- One state machine serves both modes; `mode` decides which side
-- effects fire (see TradeStateHandler). Smart transitions are
-- untouched, so this migration only ADDS reachable states.
--
-- V4/V5/V6 are immutable, so their CHECK constraints are dropped
-- and re-added here rather than edited in place.
-- ==============================================================

ALTER TABLE trades
    ADD COLUMN mode                   VARCHAR(8) NOT NULL DEFAULT 'SMART',
    ADD COLUMN assigned_admin_id      UUID,
    ADD COLUMN admin_fee_uzs          BIGINT,
    ADD COLUMN admin_accepted_at      TIMESTAMPTZ,
    ADD COLUMN admin_closed_at        TIMESTAMPTZ,
    ADD COLUMN seller_confirmed_at    TIMESTAMPTZ,
    ADD COLUMN buyer_confirmed_at     TIMESTAMPTZ,
    ADD COLUMN escalation_deadline_at TIMESTAMPTZ,
    ADD COLUMN escalated_at           TIMESTAMPTZ,
    ADD COLUMN escalation_reason      VARCHAR(32);

ALTER TABLE trades ADD CONSTRAINT chk_trades_mode
    CHECK (mode IN ('SMART', 'HUMAN'));

-- An admin arbitrating their own purchase or sale is not arbitration.
ALTER TABLE trades ADD CONSTRAINT chk_trades_admin_not_party
    CHECK (assigned_admin_id IS NULL
        OR (assigned_admin_id <> seller_id AND assigned_admin_id <> buyer_id));

-- Smart trades must never carry admin fields.
ALTER TABLE trades ADD CONSTRAINT chk_trades_smart_no_admin
    CHECK (mode = 'HUMAN' OR (assigned_admin_id IS NULL AND admin_fee_uzs IS NULL));

-- Three new states, all reachable only on the HUMAN path.
ALTER TABLE trades DROP CONSTRAINT chk_trades_state;
ALTER TABLE trades ADD  CONSTRAINT chk_trades_state CHECK (state IN (
    'INITIATED', 'WAITING_PAYMENT', 'WAITING_EMAIL_CHANGE',
    'VERIFYING_KONAMI_LINK', 'WAITING_PASSWORD', 'WAITING_BUYER_VERIFY',
    'WAITING_ADMIN', 'IN_PROGRESS', 'WAITING_CLOSE_CONFIRM',
    'SUCCESS', 'REJECTED', 'ORPHANED'
));

-- Human trades have no platform payment, so a card serves no purpose.
-- Smart trades still require both; enforced by the CHECK below and by
-- TradeService.openTrade.
ALTER TABLE trades ALTER COLUMN seller_card_id DROP NOT NULL;
ALTER TABLE trades ALTER COLUMN buyer_card_id  DROP NOT NULL;
ALTER TABLE trades ADD CONSTRAINT chk_trades_smart_cards
    CHECK (mode = 'HUMAN' OR (seller_card_id IS NOT NULL AND buyer_card_id IS NOT NULL));

-- Escalation sweeper lookup: "human trades whose admin has gone quiet".
-- Deliberately NOT state_deadline — TradeTimeoutScheduler fires TIMEOUT for
-- every non-terminal state with a due state_deadline, and IN_PROGRESS has no
-- TIMEOUT transition, which would throw every 10 seconds forever.
CREATE INDEX ix_trades_escalation_due ON trades (escalation_deadline_at)
    WHERE escalated_at IS NULL AND escalation_deadline_at IS NOT NULL;
CREATE INDEX ix_trades_escalated ON trades (escalated_at)
    WHERE escalated_at IS NOT NULL;
CREATE INDEX ix_trades_assigned_admin ON trades (assigned_admin_id)
    WHERE assigned_admin_id IS NOT NULL;

-- Enum widening for the audit log and chat messages.
ALTER TABLE trade_audit_log DROP CONSTRAINT chk_audit_actor;
ALTER TABLE trade_audit_log ADD  CONSTRAINT chk_audit_actor
    CHECK (actor_type IN ('USER', 'WORKER', 'SYSTEM', 'ADMIN', 'TRADE_ADMIN'));

ALTER TABLE trade_messages DROP CONSTRAINT chk_trade_messages_sender;
ALTER TABLE trade_messages ADD  CONSTRAINT chk_trade_messages_sender
    CHECK (sender_type IN ('USER', 'SMART_ADMIN', 'SYSTEM', 'HUMAN_ADMIN'));
