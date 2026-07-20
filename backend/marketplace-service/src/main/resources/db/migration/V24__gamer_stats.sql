-- Gamer Card projection fed by Chempionat-X tournament events
-- (efbazaar.tournament.elo-updated / match-finished). Kept local so the card
-- renders even when the tournament service is down. Keyed by the efBazaar
-- auth user UUID; rows appear on the first consumed event.
--
-- last_match_id guards W/D/L double-counting on Kafka redelivery; elo is
-- last-write-wins (monotonic per elo-updated event stream).
CREATE TABLE gamer_stats (
    user_id        UUID PRIMARY KEY,
    elo            INTEGER NOT NULL DEFAULT 1000,
    wins           INTEGER NOT NULL DEFAULT 0,
    draws          INTEGER NOT NULL DEFAULT 0,
    losses         INTEGER NOT NULL DEFAULT 0,
    goals_for      INTEGER NOT NULL DEFAULT 0,
    goals_against  INTEGER NOT NULL DEFAULT 0,
    matches_count  INTEGER NOT NULL DEFAULT 0,
    tournaments    INTEGER NOT NULL DEFAULT 0,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency ledger for consumed match events, one row per (user, match).
-- tournament_id backs the distinct-tournament counter.
CREATE TABLE gamer_stats_matches (
    user_id        UUID NOT NULL,
    match_id       BIGINT NOT NULL,
    tournament_id  BIGINT,
    PRIMARY KEY (user_id, match_id)
);
