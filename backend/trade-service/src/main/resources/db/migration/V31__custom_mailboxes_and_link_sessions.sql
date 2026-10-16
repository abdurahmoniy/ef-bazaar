-- Custom (self-named) mailboxes and the sessions that link a Konami account to one.
-- RANDOM = the existing escrow / admin boxes; CUSTOM = claimed by the user from
-- mailbox.custom_slots, never used by a trade.
ALTER TABLE mailboxes ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'RANDOM';
ALTER TABLE mailboxes ADD CONSTRAINT chk_mailboxes_kind CHECK (kind IN ('RANDOM', 'CUSTOM'));
-- The one marketplace account this box is verified for. Cleared when marketplace
-- reports the account lost the email (sold, swapped, edited, relinked).
ALTER TABLE mailboxes ADD COLUMN linked_account_id UUID;
-- USER = claimed by the user themselves (custom box).
ALTER TABLE mailboxes DROP CONSTRAINT chk_mailboxes_source;
ALTER TABLE mailboxes ADD CONSTRAINT chk_mailboxes_source CHECK (source IN ('TRADE', 'ADMIN', 'USER'));

CREATE TABLE mailbox_link_sessions (
    id                 UUID PRIMARY KEY,
    owner_id           UUID        NOT NULL,
    mailbox_id         UUID        NOT NULL REFERENCES mailboxes (id),
    account_id         UUID        NOT NULL,
    state              VARCHAR(24) NOT NULL,
    step_deadline      TIMESTAMPTZ NOT NULL,
    email_change_code  VARCHAR(16),
    code_received_at   TIMESTAMPTZ,
    not_registered     BOOLEAN     NOT NULL DEFAULT false,
    -- Step an EXPIRED session timed out in, so "retry" resumes there.
    expired_from       VARCHAR(24),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_link_session_state CHECK (state IN
        ('WAIT_EMAIL_CHANGE', 'WAIT_RESET', 'VERIFIED', 'EXPIRED', 'CANCELLED'))
);
-- One live session per mailbox.
CREATE UNIQUE INDEX mailbox_link_sessions_live_idx
    ON mailbox_link_sessions (mailbox_id) WHERE state IN ('WAIT_EMAIL_CHANGE', 'WAIT_RESET');
CREATE INDEX mailbox_link_sessions_deadline_idx
    ON mailbox_link_sessions (step_deadline) WHERE state IN ('WAIT_EMAIL_CHANGE', 'WAIT_RESET');
