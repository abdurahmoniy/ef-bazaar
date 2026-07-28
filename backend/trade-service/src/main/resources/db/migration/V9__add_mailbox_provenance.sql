-- ==============================================================
-- trade-service — mailbox provenance for the admin panel.
--
-- Until now every mailbox row was born inside a trade, so "who/when/how"
-- was implicit (trade_id + created_at). The admin panel can also register
-- a standalone mailbox for a user, so the origin has to be explicit:
--
--   source                = TRADE (escrow provisioning) | ADMIN (panel)
--   created_by_admin_id   = admin who pressed the button (ADMIN rows only)
--   provisioned_at        = when smart-admin-worker confirmed Mailcow
--                           actually created the box; NULL = still pending
-- ==============================================================

ALTER TABLE mailboxes
    ADD COLUMN source              VARCHAR(16) NOT NULL DEFAULT 'TRADE',
    ADD COLUMN created_by_admin_id UUID,
    ADD COLUMN provisioned_at      TIMESTAMPTZ;

ALTER TABLE mailboxes
    ADD CONSTRAINT chk_mailboxes_source CHECK (source IN ('TRADE', 'ADMIN'));

-- Existing rows all came from the trade flow and are long since provisioned;
-- created_at is the closest honest approximation of the confirmation time.
UPDATE mailboxes SET provisioned_at = created_at WHERE provisioned_at IS NULL;

CREATE INDEX idx_mailboxes_created_at ON mailboxes (created_at DESC);
