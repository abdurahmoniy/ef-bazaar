-- Retype `highest_division_level` from INT → ENUM.
--
-- Only 3 tiers are meaningful on this platform (top-tier accounts), so a
-- bounded discrete choice reads better than an unbounded number spinner —
-- the FE renders it as a badge picker (DivisionBadge).
--
-- The type-column CHECK already admits ENUM (V5 seed lists it), so no
-- ALTER TABLE is needed.
--
-- Originally squeezed into V16 after that migration had already been
-- applied to prod, which changed its checksum and blocked Flyway startup.
-- V16 has been reverted to its original content; carry the change here.

UPDATE attribute_definitions
   SET type        = 'ENUM',
       constraints = '{"options":["1","2","3"],"option_labels_uz":{"1":"Divisiya 1","2":"Divisiya 2","3":"Divisiya 3"}}'::jsonb,
       updated_at  = NOW()
 WHERE key = 'highest_division_level';
