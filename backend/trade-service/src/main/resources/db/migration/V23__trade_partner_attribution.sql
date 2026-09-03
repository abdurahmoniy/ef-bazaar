-- Savdo ochilganda muhrlanadigan hamkor va stavka.
--
-- STAVKA HAM MUHRLANADI: admin ertaga foizni o'zgartirsa, ochilgan
-- savdolar eski shart bo'yicha yopilishi kerak. Faqat hamkorni saqlab,
-- foizni yopilish paytida o'qisak, kelishuv o'rtada o'zgargan bo'lardi.
--
-- Ikkalasi ham NULL bo'lishi MUTLAQO NORMAL: xaridor e'lonni
-- efBazaar'ning o'zidan topgan bo'lishi mumkin, va bunday savdolar
-- ko'pchilikni tashkil qiladi.
ALTER TABLE trades
    ADD COLUMN partner_user_id    uuid,
    ADD COLUMN partner_percent_bp integer;

ALTER TABLE trades
    ADD CONSTRAINT chk_trades_partner_bp
        CHECK (partner_percent_bp IS NULL OR (partner_percent_bp >= 0 AND partner_percent_bp <= 10000));
