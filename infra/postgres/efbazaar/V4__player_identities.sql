-- Stable player identity, separate from a particular card edition.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS player_identities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name  VARCHAR(120) NOT NULL,
    normalized_name VARCHAR(120) NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS card_player_identities (
    efhub_id          BIGINT PRIMARY KEY,
    player_id         UUID NOT NULL REFERENCES player_identities(id),
    assignment_source VARCHAR(10) NOT NULL DEFAULT 'AUTO'
        CHECK (assignment_source IN ('AUTO', 'ADMIN')),
    assigned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_player_identities_player
    ON card_player_identities (player_id, efhub_id);

-- Initial grouping is deterministic by normalized Unicode name. Once written,
-- mappings are never changed by later spelling corrections; admins may reassign.
INSERT INTO player_identities (canonical_name, normalized_name)
SELECT min(name), normalized_name
FROM (
    SELECT name, lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) AS normalized_name FROM bigtime
    UNION ALL
    SELECT name, lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) AS normalized_name FROM epic
    UNION ALL
    SELECT name, lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) AS normalized_name FROM showtime
) cards
WHERE normalized_name <> ''
GROUP BY normalized_name
ON CONFLICT (normalized_name) DO NOTHING;

INSERT INTO card_player_identities (efhub_id, player_id, assignment_source)
SELECT cards.efhub_id, identities.id, 'AUTO'
FROM (
    SELECT efhub_id, lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) AS normalized_name FROM bigtime
    UNION ALL
    SELECT efhub_id, lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) AS normalized_name FROM epic
    UNION ALL
    SELECT efhub_id, lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) AS normalized_name FROM showtime
) cards
JOIN player_identities identities USING (normalized_name)
ON CONFLICT (efhub_id) DO NOTHING;
