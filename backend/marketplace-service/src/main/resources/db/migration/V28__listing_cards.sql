CREATE TABLE listing_cards (
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    efhub_id   BIGINT NOT NULL,
    player_id  UUID NOT NULL,
    ordinal    SMALLINT NOT NULL CHECK (ordinal >= 0 AND ordinal < 30),
    snapshot   JSONB NOT NULL,
    PRIMARY KEY (listing_id, efhub_id),
    CONSTRAINT listing_cards_unique_player UNIQUE (listing_id, player_id)
);

CREATE INDEX listing_cards_player_listing_idx
    ON listing_cards (player_id, listing_id);
CREATE INDEX listing_cards_efhub_listing_idx
    ON listing_cards (efhub_id, listing_id);
CREATE INDEX listing_cards_listing_idx
    ON listing_cards (listing_id, ordinal);
