-- Free/Pro launch: STANDARD remains the internal free code. Keep MAX and
-- historical prices/purchases for existing subscriptions and foreign keys.
-- Product availability is enforced separately from editable price values.
UPDATE plans SET active = FALSE WHERE code = 'MAX';

UPDATE plan_prices
SET price_tiyin = 3000000, updated_by = NULL, updated_at = now()
WHERE plan_code = 'PRO' AND period = 'MONTH';

-- Mailbox total/custom pool changes belong to phase B; preserve currently
-- implemented capability values until the total-10 pool is enforced.
