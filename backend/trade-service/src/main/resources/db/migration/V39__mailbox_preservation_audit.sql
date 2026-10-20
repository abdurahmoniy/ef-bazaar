CREATE TABLE mailbox_preservation_audit (
    id uuid PRIMARY KEY,
    mailbox_id uuid NOT NULL REFERENCES mailboxes(id),
    admin_id uuid NOT NULL,
    reason text NOT NULL,
    created_at timestamptz NOT NULL
);
CREATE INDEX mailbox_preservation_audit_mailbox_idx ON mailbox_preservation_audit(mailbox_id, created_at);
