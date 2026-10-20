ALTER TABLE mailboxes ADD COLUMN provisioning_status varchar(16) NOT NULL DEFAULT 'NONE'
 CHECK (provisioning_status IN ('NONE','STARTED','CONFIRMED'));
ALTER TABLE mailboxes ADD COLUMN provisioning_claim_id uuid;
ALTER TABLE mailboxes ADD COLUMN provisioning_error text;
UPDATE mailboxes SET provisioning_status='CONFIRMED' WHERE provisioned_at IS NOT NULL;
CREATE TABLE mailbox_provisioning_claims (
 id uuid PRIMARY KEY, mailbox_id uuid NOT NULL UNIQUE REFERENCES mailboxes(id),
 email text NOT NULL, trade_id uuid REFERENCES trades(id), responsible_user_id uuid NOT NULL,
 encrypted_password bytea NOT NULL, iv bytea NOT NULL, tag bytea NOT NULL,
 started_at timestamptz NOT NULL, confirmed_at timestamptz
);
ALTER TABLE mailboxes ADD CONSTRAINT mailbox_provisioning_claim_fk
 FOREIGN KEY(provisioning_claim_id) REFERENCES mailbox_provisioning_claims(id);
CREATE FUNCTION guard_started_mailbox_provisioning() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.provisioning_status='STARTED' THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'mailbox provisioning outcome unresolved' USING ERRCODE='23514'; END IF;
  IF NEW.email IS DISTINCT FROM OLD.email OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
    OR NEW.retained_user_id IS DISTINCT FROM OLD.retained_user_id OR NEW.trade_id IS DISTINCT FROM OLD.trade_id
    OR NEW.linked_account_id IS DISTINCT FROM OLD.linked_account_id OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    OR NEW.deletion_status IS DISTINCT FROM OLD.deletion_status OR NEW.deletion_request_id IS DISTINCT FROM OLD.deletion_request_id
    OR NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password OR NEW.password_iv IS DISTINCT FROM OLD.password_iv
    OR NEW.password_tag IS DISTINCT FROM OLD.password_tag OR NEW.provisioning_claim_id IS DISTINCT FROM OLD.provisioning_claim_id
    OR NEW.provisioning_status NOT IN ('STARTED','CONFIRMED')
    OR (NEW.provisioned_at IS DISTINCT FROM OLD.provisioned_at AND NEW.provisioning_status <> 'CONFIRMED')
    OR (NEW.provisioning_status='CONFIRMED' AND NEW.provisioned_at IS NULL) THEN
    RAISE EXCEPTION 'mailbox provisioning identity is immutable until confirmed' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mailbox_started_provisioning_guard BEFORE UPDATE OR DELETE ON mailboxes
 FOR EACH ROW EXECUTE FUNCTION guard_started_mailbox_provisioning();
