-- Self-declared Gamer Card profile fields (owner-editable via /gamer-cards/me).
CREATE TABLE gamer_profiles (
    user_id           UUID PRIMARY KEY,
    bio               VARCHAR(280),
    platform          VARCHAR(16) CHECK (platform IN ('ANDROID', 'IOS', 'BOTH')),
    highest_division  INTEGER CHECK (highest_division BETWEEN 1 AND 9),
    favorite_team     VARCHAR(64),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
