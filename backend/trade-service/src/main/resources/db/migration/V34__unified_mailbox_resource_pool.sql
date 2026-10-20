-- Losing UI access is not proof that an external account moved away.
ALTER TABLE mailboxes ADD COLUMN retained_user_id UUID;
CREATE INDEX idx_mailboxes_retained_user ON mailboxes(retained_user_id)
    WHERE retained_user_id IS NOT NULL AND deleted_at IS NULL;
-- Existing detached boxes have no reliable user attribution. Do not invent one.
