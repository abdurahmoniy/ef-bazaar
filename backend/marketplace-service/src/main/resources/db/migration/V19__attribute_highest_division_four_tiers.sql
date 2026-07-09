-- highest_division_level: extend from 3 to 4 discrete tiers.
-- Bucket "4" means "division 4 or higher" (all D4–D9 accounts share one
-- badge asset). V18 seeded 3 tiers ("1","2","3"); this row bumps to
-- ("1","2","3","4"). ENUM type set in V18 stays as-is.
--
-- Originally folded into V16 by another PR, which broke Flyway checksum
-- validation and blocked prod boot. V16 has been reverted; the change
-- lives here.

UPDATE attribute_definitions
   SET constraints = '{"options":["1","2","3","4"],"option_labels_uz":{"1":"Division 1","2":"Division 2","3":"Division 3","4":"Division 4+"}}'::jsonb,
       updated_at  = NOW()
 WHERE key = 'highest_division_level';
