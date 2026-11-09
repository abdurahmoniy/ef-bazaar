-- Rasmiy Telegram kanalga obuna bo'lish va chiqib ketish jurnali.
--
-- Login uchun obuna majburiy, lekin bir qismi kirgach chiqib ketadi. Bu
-- jadval "kanal nega o'smayapti" savoliga javob beradi: kunlik qo'shilish
-- va chiqish soni. Faqat rasmiy kanal (app.channels.official) yoziladi —
-- hamkor kanallar a'zoligi bu yerga tushmaydi.
CREATE TABLE channel_member_events (
    id          bigserial   PRIMARY KEY,
    telegram_id bigint      NOT NULL,
    kind        text        NOT NULL,
    -- Telegram'ning o'z vaqti (update.date), qabul qilingan vaqt emas:
    -- qayta yetkazilgan yoki kechikkan update ham to'g'ri kunga tushadi.
    occurred_at timestamptz NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_channel_member_events_kind CHECK (kind IN ('JOIN', 'LEAVE')),
    -- Telegram bir update'ni qayta yuborishi mumkin — ikkinchisi yozilmaydi.
    CONSTRAINT uq_channel_member_events UNIQUE (telegram_id, kind, occurred_at)
);

CREATE INDEX idx_channel_member_events_occurred ON channel_member_events (occurred_at);
