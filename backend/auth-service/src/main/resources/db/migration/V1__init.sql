-- ==============================================================
-- auth-service — initial schema
-- users: classic credentials + optional Telegram link
-- ==============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    username              VARCHAR(64)  NOT NULL,
    email                 VARCHAR(255) NOT NULL,
    password_hash         VARCHAR(100) NOT NULL,

    -- Telegram (nullable — link post-registration)
    telegram_id           BIGINT,
    telegram_username     VARCHAR(64),
    telegram_first_name   VARCHAR(128),
    telegram_last_name    VARCHAR(128),
    telegram_photo_url    VARCHAR(512),

    role                  VARCHAR(16)  NOT NULL DEFAULT 'USER',

    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_users_role CHECK (role IN ('USER', 'ADMIN'))
);

-- Unique constraints (NULL telegram_id allowed for multiple unlinked users)
CREATE UNIQUE INDEX idx_users_username    ON users (LOWER(username));
CREATE UNIQUE INDEX idx_users_email       ON users (LOWER(email));
CREATE UNIQUE INDEX idx_users_telegram_id ON users (telegram_id) WHERE telegram_id IS NOT NULL;
