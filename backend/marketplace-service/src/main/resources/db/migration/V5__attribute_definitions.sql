-- ==============================================================
-- Dynamic listing attributes — definition table
--
-- Motivation: current listings table hard-codes every gameplay field (division,
-- coins, team strength, ...). Adding a new field means schema change + code
-- change + deploy. Move field metadata into a table so admins can register new
-- attributes at runtime; listings will store the values in a JSONB column
-- (introduced in a later migration, once the code side is switched over).
--
-- Contract:
--   key   — internal identifier used in listing JSON payloads and filters,
--           IMMUTABLE once created (dependent listing values reference it)
--   type  — controls form widget on the frontend and value validation on the
--           backend: INT, DECIMAL, BOOLEAN, STRING, TEXT, LIST_STRING, ENUM
--   constraints — free-form JSONB (min/max, regex, options[], item_max_length)
--   active — soft delete; inactive definitions are hidden from public GET but
--           still resolve historical listing values.
-- ==============================================================

CREATE TABLE attribute_definitions (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    key          VARCHAR(64) NOT NULL,
    label_uz     VARCHAR(255) NOT NULL,
    type         VARCHAR(32) NOT NULL,

    required     BOOLEAN NOT NULL DEFAULT FALSE,
    position     INTEGER NOT NULL DEFAULT 0,
    group_key    VARCHAR(64),

    constraints  JSONB NOT NULL DEFAULT '{}'::jsonb,
    searchable   BOOLEAN NOT NULL DEFAULT TRUE,
    active       BOOLEAN NOT NULL DEFAULT TRUE,

    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uk_attribute_definitions_key UNIQUE (key),
    CONSTRAINT chk_attribute_definitions_type CHECK (
        type IN ('INT', 'DECIMAL', 'BOOLEAN', 'STRING', 'TEXT', 'LIST_STRING', 'ENUM')
    ),
    CONSTRAINT chk_attribute_definitions_key_format CHECK (
        key ~ '^[a-z][a-z0-9_]{0,63}$'
    )
);

CREATE INDEX idx_attribute_definitions_active_position
    ON attribute_definitions (active, position);
CREATE INDEX idx_attribute_definitions_group
    ON attribute_definitions (group_key)
    WHERE group_key IS NOT NULL;

-- ------------------------------------------------------------------
-- Seed the definitions that mirror the current hard-coded listing fields.
-- Phase 1b migration will move values from typed columns into
-- listings.attributes JSONB and drop the columns; until then these rows
-- exist purely so the admin UI + form renderer have something to work with.
-- ------------------------------------------------------------------

INSERT INTO attribute_definitions (key, label_uz, type, required, position, group_key, constraints) VALUES
    ('highest_division_level', 'Eng yuqori division',        'INT',         TRUE,  10, 'gameplay',     '{"min":1,"max":9}'::jsonb),
    ('team_strength',          'Team Strength',              'INT',         TRUE,  20, 'squad',        '{"min":0}'::jsonb),
    ('valuable_players',       'Yulduz o''yinchilar',        'LIST_STRING', FALSE, 30, 'squad',        '{"item_max_length":64}'::jsonb),
    ('android_coins',          'Android coin',               'INT',         TRUE,  40, 'monetization', '{"min":0}'::jsonb),
    ('ios_coins',              'iOS coin',                   'INT',         TRUE,  50, 'monetization', '{"min":0}'::jsonb),
    ('has_google_play_link',   'Google Play link mavjud',    'BOOLEAN',     FALSE, 60, 'monetization', '{}'::jsonb);
