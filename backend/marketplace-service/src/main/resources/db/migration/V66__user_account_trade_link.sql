-- Savdo yakunlanganda akkount sotuvchidan xaridorga ko'chadi.
--
-- Xaridorning yangi akkounti qaysi savdodan kelganini eslab qoladi:
-- pochta manzili ALOHIDA hodisa bilan keladi va uni aynan shu savdo
-- bo'yicha topish kerak. `source_listing_id` bu ish uchun yaramaydi —
-- u sotuvchining akkountida band va unique.
ALTER TABLE user_accounts ADD COLUMN source_trade_id UUID;

CREATE UNIQUE INDEX user_accounts_owner_trade_idx
    ON user_accounts (owner_id, source_trade_id) WHERE source_trade_id IS NOT NULL;

-- Pochta hodisasi savdo hodisasidan OLDIN kelishi mumkin: Kafka topiklari
-- orasida tartib kafolati yo'q. Manzil shu yerda kutib turadi va akkount
-- ochilganda unga biriktiriladi.
--
-- pending_referrals bilan bir xil g'oya: yo'qolgan xabardan ko'ra kutib
-- turgan yozuv afzal.
CREATE TABLE pending_account_emails (
    trade_id   UUID        NOT NULL,
    user_id    UUID        NOT NULL,
    email      TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (trade_id, user_id)
);
