-- Keep the most recently changed team for users who created several before
-- Dream Team became a singleton, then enforce that invariant permanently.
WITH ranked AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY user_id
               ORDER BY updated_at DESC, created_at DESC, id DESC
           ) AS row_number
    FROM dream_teams
)
DELETE FROM dream_teams team
USING ranked
WHERE team.id = ranked.id
  AND ranked.row_number > 1;

DROP INDEX IF EXISTS dream_teams_user_idx;

CREATE UNIQUE INDEX dream_teams_user_unique_idx
    ON dream_teams (user_id);
