ALTER TABLE mailboxes ADD COLUMN deletion_status VARCHAR(16) NOT NULL DEFAULT 'NONE'
 CHECK (deletion_status IN ('NONE','PENDING','FAILED','CONFIRMED'));
ALTER TABLE mailboxes ADD COLUMN deletion_error TEXT;
ALTER TABLE mailboxes ADD COLUMN deletion_request_id UUID;

CREATE TABLE mailbox_release_checks (
 id UUID PRIMARY KEY, mailbox_id UUID NOT NULL REFERENCES mailboxes(id), user_id UUID NOT NULL,
 email TEXT NOT NULL, expected_owner UUID, expected_retained UUID, expected_provisioned_at TIMESTAMPTZ,
 started_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
 status VARCHAR(16) NOT NULL CHECK (status IN ('PENDING','VERIFIED','EXPIRED','FAILED')),
 verified_at TIMESTAMPTZ, error TEXT
);
CREATE INDEX mailbox_release_checks_box ON mailbox_release_checks(mailbox_id,started_at DESC);
CREATE TABLE mailbox_deletion_requests (
 id UUID PRIMARY KEY, mailbox_id UUID NOT NULL REFERENCES mailboxes(id), email TEXT NOT NULL,
 requested_at TIMESTAMPTZ NOT NULL, expected_owner UUID, expected_retained UUID,
 expected_provisioned_at TIMESTAMPTZ, status VARCHAR(16) NOT NULL CHECK(status IN ('PENDING','FAILED','CONFIRMED')),
 error TEXT, confirmed_at TIMESTAMPTZ, next_dispatch_at TIMESTAMPTZ NOT NULL,
 dispatch_attempts INTEGER NOT NULL DEFAULT 0, last_publish_error TEXT
);
CREATE INDEX mailbox_deletion_dispatch ON mailbox_deletion_requests(next_dispatch_at) WHERE status='PENDING';

-- A worker may already be processing a durable delete command. Freeze identity,
-- ownership, credentials and account attachment until its correlated result.
CREATE FUNCTION guard_mailbox_pending_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.deletion_status IN ('PENDING','FAILED') AND NEW.deletion_status <> 'CONFIRMED'
   AND (NEW.email IS DISTINCT FROM OLD.email OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
     OR NEW.retained_user_id IS DISTINCT FROM OLD.retained_user_id OR NEW.trade_id IS DISTINCT FROM OLD.trade_id
     OR NEW.linked_account_id IS DISTINCT FROM OLD.linked_account_id
     OR NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password
     OR NEW.password_iv IS DISTINCT FROM OLD.password_iv OR NEW.password_tag IS DISTINCT FROM OLD.password_tag
     OR NEW.provisioned_at IS DISTINCT FROM OLD.provisioned_at OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN
   RAISE EXCEPTION 'mailbox deletion unresolved' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mailbox_pending_delete_guard BEFORE UPDATE ON mailboxes
 FOR EACH ROW EXECUTE FUNCTION guard_mailbox_pending_delete();

CREATE FUNCTION guard_trade_pending_mailbox_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.mailbox_id IS NOT NULL AND EXISTS (SELECT 1 FROM mailboxes WHERE id=NEW.mailbox_id
       AND (deletion_status IN ('PENDING','FAILED','CONFIRMED') OR deleted_at IS NOT NULL))
   AND (TG_OP='INSERT' OR NEW.mailbox_id IS DISTINCT FROM OLD.mailbox_id) THEN
   RAISE EXCEPTION 'mailbox deletion unresolved' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trade_pending_delete_guard BEFORE INSERT OR UPDATE OF mailbox_id ON trades
 FOR EACH ROW EXECUTE FUNCTION guard_trade_pending_mailbox_delete();
CREATE TRIGGER trade_side_pending_delete_guard BEFORE INSERT OR UPDATE OF mailbox_id ON trade_sides
 FOR EACH ROW EXECUTE FUNCTION guard_trade_pending_mailbox_delete();
