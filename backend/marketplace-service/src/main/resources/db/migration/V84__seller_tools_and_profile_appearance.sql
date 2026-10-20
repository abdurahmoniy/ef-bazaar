CREATE TABLE seller_reply_templates (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, title varchar(120) NOT NULL,
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 8000),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX seller_reply_templates_owner ON seller_reply_templates(owner_id, created_at DESC, id DESC);
CREATE TABLE seller_private_notes (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, title varchar(120) NOT NULL DEFAULT '',
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 8000),
 chat_id uuid, listing_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT seller_private_note_context CHECK(chat_id IS NOT NULL OR listing_id IS NOT NULL)
);
-- Context IDs deliberately survive deletion/transfer of the original context.
CREATE INDEX seller_private_notes_owner ON seller_private_notes(owner_id, created_at DESC, id DESC);
CREATE INDEX seller_private_notes_chat ON seller_private_notes(owner_id, chat_id);
CREATE INDEX seller_private_notes_listing ON seller_private_notes(owner_id, listing_id);
CREATE TABLE profile_appearances (
 user_id uuid PRIMARY KEY, cover_file_id text, updated_at timestamptz NOT NULL DEFAULT now()
);
