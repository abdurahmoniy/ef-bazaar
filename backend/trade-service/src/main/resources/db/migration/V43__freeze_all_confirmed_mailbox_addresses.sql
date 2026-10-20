-- A missing provision acknowledgement is not evidence that a real address
-- never existed. Every server-confirmed deletion permanently reserves identity.
-- Earlier internal-only placeholder discards were not server acknowledgements.
UPDATE mailboxes SET deletion_status='NONE'
 WHERE deletion_status='CONFIRMED' AND provisioned_at IS NULL
   AND deletion_request_id IS NULL AND source='TRADE' AND kind='RANDOM'
   AND email ~ '^pending-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@[^@]+$'
   AND encrypted_password=decode('00','hex');

CREATE OR REPLACE FUNCTION guard_confirmed_mailbox_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.deletion_status='CONFIRMED' THEN
   IF TG_OP='DELETE' THEN
     RAISE EXCEPTION 'confirmed mailbox address is a permanent tombstone' USING ERRCODE='23514';
   END IF;
   IF NEW.email IS DISTINCT FROM OLD.email OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
      OR NEW.retained_user_id IS DISTINCT FROM OLD.retained_user_id OR NEW.trade_id IS DISTINCT FROM OLD.trade_id
      OR NEW.linked_account_id IS DISTINCT FROM OLD.linked_account_id
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.deletion_status IS DISTINCT FROM OLD.deletion_status
      OR NEW.provisioned_at IS DISTINCT FROM OLD.provisioned_at
      OR NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password
      OR NEW.password_iv IS DISTINCT FROM OLD.password_iv OR NEW.password_tag IS DISTINCT FROM OLD.password_tag THEN
     RAISE EXCEPTION 'confirmed mailbox identity is immutable' USING ERRCODE='23514';
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
