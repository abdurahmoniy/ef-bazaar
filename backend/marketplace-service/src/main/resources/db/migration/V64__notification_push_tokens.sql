CREATE TABLE notification_push_tokens (
    token varchar(2048) PRIMARY KEY,
    user_id uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notification_push_tokens_user ON notification_push_tokens(user_id);
