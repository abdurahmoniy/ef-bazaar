-- Existing listings are baseline only: no inferred publication time from relay time.
ALTER TABLE listings ADD COLUMN publication_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE listings ADD COLUMN published_at TIMESTAMPTZ;
ALTER TABLE listings ADD COLUMN price_version BIGINT NOT NULL DEFAULT 0;

CREATE TABLE watch_price_events (
    listing_id UUID NOT NULL,
    price_version BIGINT NOT NULL,
    publication_version BIGINT NOT NULL,
    old_price NUMERIC(19,2) NOT NULL,
    new_price NUMERIC(19,2) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    processed_at TIMESTAMPTZ,
    PRIMARY KEY(listing_id,price_version)
);
CREATE INDEX watch_price_events_pending ON watch_price_events(occurred_at) WHERE processed_at IS NULL;
CREATE FUNCTION watch_listing_transition() RETURNS trigger AS $$
BEGIN
    IF TG_OP='INSERT' THEN
        IF NEW.status='ACTIVE' THEN
            NEW.publication_version := 1;
            NEW.published_at := clock_timestamp();
        END IF;
    ELSE
        NEW.publication_version := OLD.publication_version;
        NEW.published_at := OLD.published_at;
        NEW.price_version := OLD.price_version;
        IF NEW.status='ACTIVE' AND OLD.status<>'ACTIVE' THEN
            NEW.publication_version := OLD.publication_version+1;
            NEW.published_at := clock_timestamp();
        END IF;
        IF NEW.price IS DISTINCT FROM OLD.price THEN
            NEW.price_version := OLD.price_version+1;
            INSERT INTO watch_price_events(listing_id,price_version,publication_version,old_price,new_price)
            VALUES(NEW.id,NEW.price_version,NEW.publication_version,OLD.price,NEW.price);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER listings_watch_transition BEFORE INSERT OR UPDATE ON listings
    FOR EACH ROW EXECUTE FUNCTION watch_listing_transition();

CREATE TABLE watch_preferences (
    user_id UUID PRIMARY KEY,
    notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    telegram_enabled BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE price_watches (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES watch_preferences(user_id),
    listing_id UUID NOT NULL,
    pause_reason VARCHAR(16) CHECK(pause_reason IN ('USER','LIMIT','UNAVAILABLE')),
    priority INTEGER NOT NULL,
    baseline_price_version BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(user_id,listing_id)
);
CREATE INDEX price_watches_listing ON price_watches(listing_id);
CREATE TABLE watch_intents (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    listing_id UUID NOT NULL,
    event_key VARCHAR(160) NOT NULL,
    publication_version BIGINT NOT NULL,
    source_intent_id UUID,
    reasons JSONB NOT NULL,
    old_price NUMERIC(19,2),
    new_price NUMERIC(19,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    state VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','DELIVERED','DISCARDED')),
    delivery_id UUID,
    UNIQUE(user_id,listing_id,event_key)
);
CREATE INDEX watch_intents_pending ON watch_intents(user_id,created_at) WHERE state='PENDING';
CREATE TABLE watch_deliveries (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    digest_date DATE,
    payload JSONB NOT NULL,
    notification_id UUID NOT NULL UNIQUE,
    telegram_state VARCHAR(16) NOT NULL DEFAULT 'PENDING'
       CHECK(telegram_state IN ('PENDING','SENDING','SENT','UNCONFIRMED','SKIPPED')),
    telegram_message_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(user_id,digest_date)
);
ALTER TABLE notifications ADD COLUMN watch_payload JSONB;
ALTER TABLE notifications DROP CONSTRAINT chk_notifications_type;
ALTER TABLE notifications ADD CONSTRAINT chk_notifications_type CHECK(type IN (
'CHAT_CREATED','CHAT_MESSAGE','TRUST_WARNING','TRUST_BLOCKED','TRUST_UNBLOCKED','TRADE_ADMIN_INVITED',
'WALLET_CREDITED','WITHDRAWAL_REQUESTED','WITHDRAWAL_PAID','WITHDRAWAL_REJECTED','TRADE_MAILBOX_RECEIVED',
'TRADE_MAILBOX_RETURNED','CUSTOM_MAILBOX_FREED','TRADE_PROPOSAL_CREATED','TRADE_STARTED','TRADE_EMAIL_CHANGED',
'TRADE_PASSWORD_SENT','TRADE_SUCCESS','TRADE_REJECTED','TRADE_ORPHANED','PARTNER_APPROVED','PARTNER_REJECTED',
'PARTNER_CANCELLED','TRADE_EMAIL_CHANGE_CODE','TRADE_LOGIN_CODE','WATCH_MATCH','WATCH_DIGEST'));
