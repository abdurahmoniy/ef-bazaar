-- ==============================================================
-- attribute_definitions — canonical, always-latest seed.
--
-- Repeatable (`R__`) migration: Flyway re-runs it whenever the checksum
-- changes. Every attribute row's *desired final state* lives here, so
-- label/constraint/position tweaks are a one-line edit — no new V<n> and
-- no checksum drama.
--
-- Rules of the road:
--   * DDL (CREATE / ALTER / DROP, new columns, new constraints) → new V<n>.
--   * attribute_definitions data tweaks → edit this file.
--   * `key` values are immutable — renaming would orphan listing payloads.
--     Add a new row instead.
--   * Everything is idempotent (INSERT ... ON CONFLICT DO UPDATE). Safe to
--     re-run against any DB state.
--
-- Runs after all V__ migrations on every boot, so it wins over any
-- earlier V-level UPDATE. Historical V17..V20 still exist unchanged for
-- checksum stability but their effect is what this file declares.
-- ==============================================================

INSERT INTO attribute_definitions (key, label_uz, type, required, position, group_key, constraints, searchable, active) VALUES
    ('highest_division_level', 'Eng yuqori division',    'ENUM',      TRUE,  10, 'gameplay',     '{"options":["1","2","3","4"],"option_labels_uz":{"1":"Division 1","2":"Division 2","3":"Division 3","4":"Division 4+"}}'::jsonb, TRUE,  TRUE),
    ('team_strength',          'Team Strength',          'INT',       TRUE,  20, 'squad',        '{"min":1000,"max":5000}'::jsonb,       TRUE,  TRUE),
    ('players_count',          'Jami o''yinchilar',      'INT',       FALSE, 25, 'squad',        '{"min":11,"max":5000}'::jsonb,         TRUE,  TRUE),
    ('valuable_players',       'Qidiriladigan qimmatli kartalar', 'CARD_LIST', FALSE, 30, 'squad', '{"max_items":30}'::jsonb,              TRUE,  TRUE),
    ('android_coins',          'Android coin',           'INT',       FALSE, 40, 'monetization', '{}'::jsonb,                            TRUE,  TRUE),
    ('ios_coins',              'iOS coin',               'INT',       FALSE, 50, 'monetization', '{}'::jsonb,                            TRUE,  TRUE),
    ('coins',                  'Coin balansi',                   'INT',       FALSE, 55, 'monetization', '{}'::jsonb,                            TRUE,  TRUE),
    ('platform',               'Platforma',              'ENUM',      TRUE,  60, 'platform',     '{"options":["MOBILE","STEAM","PLAYSTATION"],"option_labels_uz":{"MOBILE":"Mobile","STEAM":"Steam","PLAYSTATION":"PlayStation"},"default":"MOBILE"}'::jsonb, TRUE, TRUE),
    ('has_google_play_link',   'Google Play ulangan',    'BOOLEAN',   FALSE, 65, 'platform',     '{}'::jsonb,                            TRUE,  TRUE),
    ('has_game_center_link',   'Game Center ulangan',    'BOOLEAN',   FALSE, 70, 'platform',     '{}'::jsonb,                            TRUE,  TRUE),
    -- eFootball "transfer data to new device": 10 sign-ins per account per
    -- month. A trade burns at least two of them (moderator verification +
    -- buyer's own sign-in after handover), so `min_sellable` blocks listings
    -- that cannot physically be handed over this month. `min` stays 0 so the
    -- seller can still state the truthful remaining count and get a clear
    -- "not enough" error instead of a cryptic range error.
    ('device_transfer_limit',  'Qurilma almashtirish limiti', 'INT',  TRUE,  75, 'platform',     '{"min":0,"max":10,"min_sellable":2}'::jsonb, TRUE, TRUE),
    ('exchange_mode',          'Obmen shartlari',        'ENUM',      FALSE, 80, 'price',        '{"options":["NONE","EXCHANGE_ONLY","EXCHANGE_WITH_SURCHARGE","BOTH"],"option_labels_uz":{"NONE":"Yo''q","EXCHANGE_ONLY":"Faqat obmen","EXCHANGE_WITH_SURCHARGE":"Obmen + doplata","BOTH":"Obmen yoki obmen + doplata"}}'::jsonb, TRUE, TRUE)
ON CONFLICT (key) DO UPDATE SET
    label_uz    = EXCLUDED.label_uz,
    type        = EXCLUDED.type,
    required    = EXCLUDED.required,
    position    = EXCLUDED.position,
    group_key   = EXCLUDED.group_key,
    constraints = EXCLUDED.constraints,
    searchable  = EXCLUDED.searchable,
    active      = EXCLUDED.active,
    updated_at  = NOW();

-- Retired boolean pair — historical listings may still reference them, so
-- soft-delete rather than DELETE. Skipped if the rows never existed (fresh DB).
UPDATE attribute_definitions
   SET active     = FALSE,
       updated_at = NOW()
 WHERE key IN ('allow_exchange', 'allow_exchange_plus_surcharge')
   AND active = TRUE;
