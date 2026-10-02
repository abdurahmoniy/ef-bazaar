-- Optional in-app campaigns. Reservations count against caps even without an impression.
CREATE TABLE popup_campaigns (
    id UUID PRIMARY KEY,
    title VARCHAR(100) NOT NULL CHECK (length(btrim(title)) > 0),
    message VARCHAR(600) NOT NULL CHECK (length(btrim(message)) > 0),
    tone VARCHAR(10) NOT NULL CHECK (tone IN ('INFO', 'SUCCESS', 'WARNING')),
    audience VARCHAR(10) NOT NULL CHECK (audience IN ('ALL', 'SELLERS', 'SELECTED')),
    recipient_ids UUID[] NOT NULL DEFAULT '{}',
    trigger VARCHAR(25) NOT NULL CHECK (trigger IN ('BROWSE', 'LISTING_PUBLISHED', 'EMPTY_SEARCH', 'TRADE_COMPLETED')),
    action_label VARCHAR(60),
    action_path VARCHAR(200),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    priority INTEGER NOT NULL CHECK (priority BETWEEN 0 AND 10),
    status VARCHAR(10) NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NOT NULL,
    CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '720 hours'),
    CHECK ((action_label IS NULL) = (action_path IS NULL)),
    CHECK (cardinality(recipient_ids) <= 100 AND array_position(recipient_ids, NULL) IS NULL),
    CHECK ((audience = 'SELECTED' AND cardinality(recipient_ids) > 0)
        OR (audience <> 'SELECTED' AND cardinality(recipient_ids) = 0))
);
CREATE INDEX idx_popup_campaigns_active ON popup_campaigns (trigger, priority DESC, created_at DESC, id DESC)
    WHERE status = 'ACTIVE';
CREATE INDEX idx_popup_campaigns_newest ON popup_campaigns (created_at DESC, id DESC);

-- A durable row lock serializes claims across all sessions and application instances.
CREATE TABLE popup_delivery_users (user_id UUID PRIMARY KEY);
CREATE TABLE popup_deliveries (
    id UUID PRIMARY KEY,
    campaign_id UUID NOT NULL REFERENCES popup_campaigns(id),
    user_id UUID NOT NULL REFERENCES popup_delivery_users(user_id),
    session_id UUID NOT NULL,
    claimed_at TIMESTAMPTZ NOT NULL,
    shown_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    CHECK (clicked_at IS NULL OR dismissed_at IS NULL),
    UNIQUE (user_id, campaign_id),
    UNIQUE (user_id, session_id)
);
CREATE INDEX idx_popup_deliveries_user_time ON popup_deliveries (user_id, claimed_at DESC);
CREATE INDEX idx_popup_deliveries_campaign ON popup_deliveries (campaign_id);
