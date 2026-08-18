-- ==============================================================
-- trade-service V19 — obmen (akkount almashinuvi).
--
-- Savdo bir tomonlama edi: sotuvchi akkountini escrow pochtasiga
-- o'tkazadi, xaridor pul to'laydi, yakunda quti xaridorga biriktiriladi.
-- Obmenda ikkala taraf ham o'z akkountini o'z qutisiga o'tkazadi va
-- yakunda qutilar TESKARI biriktiriladi.
--
-- Nega bitta savdo qatori, ikkita emas: escrow, chat juftligi, muddat va
-- audit — hammasi savdoga bog'langan. Ikkita qator bo'lsa "ikkalasi ham
-- bo'ladi yoki hech biri" kafolati ikkita qator o'rtasida taqsimlangan
-- muammoga aylanadi. Bitta qator bilan bu bitta tranzaksiya bo'lib qoladi.
--
-- Chiziqli `state` ustuni saqlanadi, lekin endi u ENG SEKIN tomonni
-- bildiradi: ikkala taraf ham bosqichni bitirmaguncha oldinga siljimaydi.
-- Har tomonning o'z holati `trade_sides` da.
-- ==============================================================

ALTER TABLE trades ADD COLUMN kind VARCHAR(20) NOT NULL DEFAULT 'SALE';

ALTER TABLE trades ADD CONSTRAINT chk_trades_kind
    CHECK (kind IN ('SALE', 'SWAP', 'SWAP_SURCHARGE'));

-- `price_uzs` ma'nosi bitta: QABUL QILUVCHI hamyonidan ushlanadigan summa.
-- Sotishda narx, obmen+dopda doplata, toza obmenda 0 — shuning uchun
-- musbatlik sharti bo'shashtiriladi. Escrow kodi shu ustunni ushlaydi,
-- ya'ni 0 bo'lganda muzlatish bosqichi o'zi tushib qoladi.
ALTER TABLE trades DROP CONSTRAINT IF EXISTS chk_trades_price_positive;
ALTER TABLE trades ADD CONSTRAINT chk_trades_price_non_negative
    CHECK (price_uzs >= 0);

-- Toza obmenda pul harakat qilmaydi, lekin platforma haqi baribir olinadi —
-- taklif yuboruvchidan, e'lon narxidan hisoblab. Yopilgan savdo arifmetikasi
-- keyingi tarif o'zgarishidan himoyalanishi uchun qiymat qatorda saqlanadi.
ALTER TABLE trades ADD COLUMN proposer_fee_uzs BIGINT;

ALTER TABLE trades ADD CONSTRAINT chk_trades_proposer_fee
    CHECK (proposer_fee_uzs IS NULL OR proposer_fee_uzs >= 0);

-- ==============================================================
-- Tomonlar. Sotishda ham, obmenda ham har taraf uchun bitta qator:
-- bitta yo'l, ikkita emas.
-- ==============================================================

CREATE TABLE trade_sides (
    trade_id             UUID        NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    role                 VARCHAR(8)  NOT NULL,

    -- Bu taraf akkountini o'tkazadigan quti. Sotishda faqat SELLER tarafida
    -- bo'ladi — xaridor hech narsa o'tkazmaydi.
    mailbox_id           UUID,

    email_changed_at     TIMESTAMPTZ,
    konami_verified_at   TIMESTAMPTZ,
    password_sent_at     TIMESTAMPTZ,

    -- Yakuniy qaror. Ikkalasi ham tasdiqlasa qutilar teskari biriktiriladi;
    -- boshqa har qanday holatda har kim o'z akkountini qaytarib oladi.
    confirmed_at         TIMESTAMPTZ,
    rejected_at          TIMESTAMPTZ,

    CONSTRAINT pk_trade_sides PRIMARY KEY (trade_id, role),
    CONSTRAINT chk_trade_sides_role CHECK (role IN ('SELLER', 'BUYER')),
    -- Bir taraf bir vaqtda ham tasdiqlab, ham rad eta olmaydi.
    CONSTRAINT chk_trade_sides_decision CHECK (
        confirmed_at IS NULL OR rejected_at IS NULL
    )
);

CREATE INDEX idx_trade_sides_mailbox ON trade_sides (mailbox_id)
    WHERE mailbox_id IS NOT NULL;

-- Mavjud savdolarni ko'chirish: har birida sotuvchi tarafi bor va uning
-- qutisi `trades.mailbox_id` da. Xaridor tarafi qutisiz yaratiladi, chunki
-- sotishda xaridor hech narsa o'tkazmaydi.
--
-- Bosqich vaqtlari to'ldirilmaydi: eski savdolarda ular yozilmagan va
-- to'qib chiqarilgan sana audit jurnalidagi haqiqiy vaqtga zid bo'lardi.
-- Yakunlangan savdolar uchun bu ahamiyatsiz, tirik savdolar uchun esa
-- `trades.state` obro'li manba bo'lib qolaveradi.
INSERT INTO trade_sides (trade_id, role, mailbox_id)
SELECT id, 'SELLER', mailbox_id FROM trades
ON CONFLICT DO NOTHING;

INSERT INTO trade_sides (trade_id, role)
SELECT id, 'BUYER' FROM trades
ON CONFLICT DO NOTHING;
