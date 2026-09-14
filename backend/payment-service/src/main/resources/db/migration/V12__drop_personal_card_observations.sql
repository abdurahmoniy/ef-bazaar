-- payment-service V12 — remove bank notices for cards that are not the platform's.
--
-- The humo-userbot logs in as a personal Telegram account, and that account
-- receives notices for the owner's OWN cards as well as the two platform cards.
-- Until now both ingest paths stored those too: credits as IGNORED rows with the
-- full bank text, debits with card_id NULL plus balance and counterparty. Every
-- admin could read an individual's balance and where they send their money.
--
-- The code now records nothing for such a card. This deletes what was already
-- stored. One-off and irreversible by intent: these rows take part in no
-- reconciliation, no ledger posting and no invoice.
--
-- "Not the platform's" means no row in platform_cards with those digits, active
-- OR NOT. A deactivated platform card is still ours and its rows stay.

DELETE FROM card_debit_observations d
 WHERE d.card_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM platform_cards c WHERE c.last4 = d.card_last4);

-- Only the rows the old ingest wrote automatically for a foreign card. An admin
-- who ignored a row on a platform card set resolved_by; a matched row has an
-- invoice. Neither is touched.
DELETE FROM card_credit_observations o
 WHERE o.status = 'IGNORED'
   AND o.resolved_by IS NULL
   AND o.invoice_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM platform_cards c WHERE c.last4 = o.card_last4);
