-- payment-service V14 — kuzatuv qaysi Telegram akkountidan kelgani.
--
-- Shaxsiy chatdagi message.id faqat bitta akkount ichida noyob. Payment
-- kuzatuvi boshqa userbot akkountiga o'tkazilganda yangi akkountning
-- xabar id'lari eskisinikiga to'qnashadi va eski UNIQUE (telegram_message_id)
-- haqiqiy kirimni "takror" deb jim tashlab yuboradi. Kalit endi juftlik.
--
-- NULL = bu ustundan oldingi userbot yuborgan xabar. COALESCE(…, 0) NULL'larni
-- bitta guruhga yig'adi: eski formatdagi takroriy xabar baribir to'qnashadi.
-- Telegram user id hech qachon 0 bo'lmaydi.

ALTER TABLE card_credit_observations ADD COLUMN userbot_telegram_id BIGINT;
ALTER TABLE card_credit_observations
    DROP CONSTRAINT card_credit_observations_telegram_message_id_key;
CREATE UNIQUE INDEX ux_card_credit_obs_account_message
    ON card_credit_observations (COALESCE(userbot_telegram_id, 0), telegram_message_id);

ALTER TABLE card_debit_observations ADD COLUMN userbot_telegram_id BIGINT;
ALTER TABLE card_debit_observations
    DROP CONSTRAINT card_debit_observations_telegram_message_id_key;
CREATE UNIQUE INDEX ux_card_debit_obs_account_message
    ON card_debit_observations (COALESCE(userbot_telegram_id, 0), telegram_message_id);
