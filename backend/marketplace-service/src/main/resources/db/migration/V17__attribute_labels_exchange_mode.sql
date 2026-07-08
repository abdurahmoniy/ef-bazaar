-- Adds Uzbek option labels to `exchange_mode`. Originally the labels were
-- squeezed into V16 after that migration had already been applied to prod,
-- which changed its checksum and blocked Flyway startup. V16 has been
-- reverted to its original content; this migration carries the label change
-- forward as a proper follow-up.

UPDATE attribute_definitions
   SET constraints = '{"options":["NONE","EXCHANGE_ONLY","EXCHANGE_WITH_SURCHARGE","BOTH"],"option_labels_uz":{"NONE":"Yo''q","EXCHANGE_ONLY":"Faqat obmen","EXCHANGE_WITH_SURCHARGE":"Obmen + doplata","BOTH":"Obmen yoki obmen + doplata"}}'::jsonb,
       updated_at  = NOW()
 WHERE key = 'exchange_mode';
