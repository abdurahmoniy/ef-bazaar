-- Foydalanuvchi egalik qiladigan akkount inventari.
--
-- E'lon endi akkountning HOLATI: bozorga chiqarilgan bo'lsa
-- current_listing_id to'ldiriladi. Akkountning o'zi esa sotilgandan keyin
-- ham, e'lon yechilgandan keyin ham egasida qoladi va qayta ishlatiladi.
--
-- Sotuv shartlari (narx, savdolashish, exchange_mode) bu yerda YO'Q —
-- ular e'lonning o'z sozlamasi va har chiqarishda boshqacha bo'lishi mumkin.
CREATE TABLE user_accounts (
    id                 UUID PRIMARY KEY,
    owner_id           UUID        NOT NULL,
    title              TEXT,
    description        TEXT,
    attributes         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    media_message_ids  TEXT[]      NOT NULL DEFAULT '{}',
    -- Maxfiy: faqat egasiga qaytariladi va e'longa hech qachon ko'chmaydi.
    email              TEXT,
    email_source       VARCHAR(16),
    mailbox_id         UUID,
    status             VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    current_listing_id UUID,
    source_listing_id  UUID,
    archived_reason    VARCHAR(24),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_accounts_owner_idx
    ON user_accounts (owner_id, status, created_at DESC);

-- Bitta e'lon ortida bitta akkount. Qisman indeks: bozorda bo'lmagan
-- akkountlarda ustun NULL va ular bir-biriga xalaqit bermaydi.
CREATE UNIQUE INDEX user_accounts_current_listing_idx
    ON user_accounts (current_listing_id) WHERE current_listing_id IS NOT NULL;

-- Bir e'londan ikkinchi akkount yaratilmasligi uchun — backfill va e'lon
-- yaratish ilgagi ikkalasi ham shu cheklovga tayanadi.
CREATE UNIQUE INDEX user_accounts_source_listing_idx
    ON user_accounts (source_listing_id) WHERE source_listing_id IS NOT NULL;

-- listing_cards bilan bir xil shakl: qidiruv va o'yinchi statistikasi
-- ikkalasida ham bitta kod yo'li bilan ishlaydi.
CREATE TABLE user_account_cards (
    account_id UUID   NOT NULL REFERENCES user_accounts (id) ON DELETE CASCADE,
    efhub_id   BIGINT NOT NULL,
    player_id  UUID   NOT NULL,
    ordinal    INT    NOT NULL,
    snapshot   JSONB  NOT NULL,
    CONSTRAINT user_account_cards_unique_player UNIQUE (account_id, player_id)
);

CREATE INDEX user_account_cards_player_idx
    ON user_account_cards (player_id, account_id);
