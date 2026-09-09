-- Support chat (qo'llab-quvvatlash, hamkorlik va savollar)
-- Foydalanuvchi yoki mehmon sayt orqali yozadi, xabar Telegram guruh topiciga chiqadi
-- va u yerdan berilgan reply javoblar foydalanuvchiga qaytariladi.

CREATE TABLE support_chat (
    id                       UUID PRIMARY KEY,
    category                 VARCHAR(32)  NOT NULL, -- 'SUPPORT', 'PARTNERSHIP', 'QUESTION'
    status                   VARCHAR(20)  NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'REPLIED', 'CLOSED'
    user_id                  UUID,                  -- ro'yxatdan o'tgan user bo'lsa
    guest_session_id         VARCHAR(64),           -- login qilmagan mehmon brauzer sessiyasi
    sender_name              VARCHAR(128) NOT NULL,
    sender_contact           VARCHAR(128),          -- @telegram yoki telefon raqami
    telegram_topic_id        INT,
    telegram_root_message_id BIGINT,                -- Telegram topicidagi birinchi xabar id'si
    last_message_at          TIMESTAMPTZ  NOT NULL,
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE support_message (
    id                  UUID PRIMARY KEY,
    support_chat_id     UUID         NOT NULL REFERENCES support_chat(id) ON DELETE CASCADE,
    sender_type         VARCHAR(20)  NOT NULL, -- 'USER', 'ADMIN'
    sender_id           UUID,                  -- agar login qilgan user bo'lsa
    sender_name         VARCHAR(128) NOT NULL,
    content             TEXT         NOT NULL,
    telegram_message_id BIGINT,                -- Telegramda yuborilgan/kelgan xabar id'si
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ix_support_chat_user_id ON support_chat (user_id);
CREATE INDEX ix_support_chat_guest_session ON support_chat (guest_session_id);
CREATE INDEX ix_support_chat_tg_root_msg ON support_chat (telegram_root_message_id);
CREATE INDEX ix_support_msg_chat_id ON support_message (support_chat_id);
CREATE INDEX ix_support_msg_tg_msg_id ON support_message (telegram_message_id);
