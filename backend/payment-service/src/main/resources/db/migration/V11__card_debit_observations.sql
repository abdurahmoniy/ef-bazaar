-- payment-service V11 — every movement OUT of a platform card, as the userbot
-- saw it.
--
-- A separate table from card_credit_observations rather than a `direction`
-- column on it, and the reason is a safety one rather than a modelling
-- preference: that table doubles as the admin's reconciliation queue
-- (WHERE status = 'UNMATCHED'), and an admin working the queue can attribute a
-- row to a user, which CREATES money. A debit reaching that queue could be
-- turned into a wallet credit — money leaving a card becoming money arriving
-- in somebody's balance. There is no such path out of this table.
--
-- Nothing here posts to the ledger. A payout is already written there when an
-- admin closes the withdrawal ticket (WITHDRAW_FULFIL debits PLATFORM_CARDS),
-- and a second posting from this side would count every payout twice. These
-- rows exist to record what actually happened on the card, which is what makes
-- the ledger-versus-observed comparison on the finance dashboard mean anything.

CREATE TABLE card_debit_observations (
    id                  UUID PRIMARY KEY,
    -- Idempotency key, exactly as on the credit side: a Kafka redelivery
    -- collides here and records nothing twice.
    telegram_message_id BIGINT      NOT NULL UNIQUE,
    -- ON DELETE SET NULL, not the default RESTRICT. The row recording where
    -- money went must never be destroyed or blocked from existing, and
    -- card_last4 keeps it readable without the card. Refusing the delete is
    -- PlatformCardService's job, where it comes with a sentence an admin can
    -- act on; a bare RESTRICT here would instead make every fixture that
    -- clears platform_cards fail on a constraint name.
    card_id             UUID        REFERENCES platform_cards(id) ON DELETE SET NULL,
    card_last4          VARCHAR(4)  NOT NULL,
    amount_tiyin        BIGINT      NOT NULL,
    -- NULL means the notice carried no commission line — a different fact from
    -- a commission of zero, which some notices state explicitly.
    commission_tiyin    BIGINT,
    card_balance_tiyin  BIGINT,
    -- Free text from the bank ("Openbank P2P HUMO OT"). Stored and shown to
    -- admins, never parsed for meaning.
    description         TEXT,
    raw_text            TEXT        NOT NULL,
    observed_at         TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_card_debit_amount_positive CHECK (amount_tiyin > 0)
);

-- The history read: newest first, optionally narrowed to one card.
CREATE INDEX ix_card_debits_observed ON card_debit_observations (observed_at DESC);
CREATE INDEX ix_card_debits_card     ON card_debit_observations (card_id, observed_at DESC);
