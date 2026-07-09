-- android_coins / ios_coins: allow negative balances.
--
-- eFootball lets an account go into a negative coin balance (spent > owned
-- credit path). The V5 seed set `{"min":0}` on both rows, which made
-- AttributeValidator reject those listings at 400. Drop the constraint so
-- any integer is accepted; admin can retune via the attribute panel later.
--
-- Cross-field rule (coins ⇒ platform link) still holds — enforced in
-- AttributeValidator, updated in the same change to fire on non-zero
-- balances rather than only positive ones.

UPDATE attribute_definitions
   SET constraints = '{}'::jsonb,
       updated_at  = NOW()
 WHERE key IN ('android_coins', 'ios_coins');
