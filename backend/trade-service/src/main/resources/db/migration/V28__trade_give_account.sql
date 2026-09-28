-- Obmenda xaridor beradigan akkount. NULL = "Boshqa" (platformadan tashqari).
ALTER TABLE trades ADD COLUMN give_account_id UUID;
ALTER TABLE trades ADD COLUMN give_account_snapshot JSONB;

-- Bitta akkount bir vaqtda faqat bitta tirik savdoda berilishi mumkin.
-- Ilova tekshiruvi poygada ikkalasini ham o'tkazib yuborishi mumkin — bu oxirgi to'siq.
CREATE UNIQUE INDEX ux_trades_live_give_account
    ON trades (give_account_id)
    WHERE give_account_id IS NOT NULL
      AND state NOT IN ('SUCCESS', 'REJECTED', 'ORPHANED');
