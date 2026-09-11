-- marketplace V59 — a channel post we took down ourselves, and may put back.
--
-- A listing pulled from efBazaar stayed live in every channel it had reached:
-- the post kept its button, and the button led to a listing that no longer
-- existed. For a listing taken down because it was wrong or harmful that is the
-- worst possible outcome — the thing being removed is exactly the thing still
-- being advertised.
--
-- Why a new column instead of reusing replaced_at: that one means "a newer post
-- superseded this one", which is permanent and is what SoldPostMarker and
-- replacePrevious both read. This one means "we deleted this message and the
-- row may yet get a new message id", which is reversible. Folding the two
-- together would make a restored post look like a superseded one and it would
-- never be marked SOLD again.

ALTER TABLE listing_channel_posts ADD COLUMN removed_at TIMESTAMPTZ;

-- The restore path's lookup: which of this listing's posts did we take down.
CREATE INDEX ix_listing_channel_posts_removed
    ON listing_channel_posts (listing_id) WHERE removed_at IS NOT NULL;

-- The official copy needs the same reversible marker, and its state column is
-- guarded by a CHECK — a value the enum has and the constraint does not is
-- unwritable in production and silent everywhere else. (chk_notifications_type
-- has cost this repo that twice.)
--
-- REMOVED rather than back to PENDING: PENDING means "waiting to go out for the
-- first time", and a takedown that is never restored would sit there looking
-- like a post somebody forgot to send.
ALTER TABLE listing_official_posts DROP CONSTRAINT chk_listing_official_posts_state;
ALTER TABLE listing_official_posts ADD  CONSTRAINT chk_listing_official_posts_state
    CHECK (state IN ('PENDING', 'POSTED', 'FAILED', 'REMOVED'));
