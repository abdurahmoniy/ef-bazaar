-- V30 — qaysi pochta qutilari tarif limiti ichida ochiq qolishini belgilaydi.
--
-- Qulf SAQLANMAYDI: har o'qishda "ustuvorligi eng yuqori N ta ochiq" deb
-- hisoblanadi (MailboxAccessService). Bu ustun faqat tartib. Default —
-- yaratilgan vaqt, ya'ni eng yangilari ochiq. User ikki qutining ustuvorligini
-- almashtirib, qaysi biri ochiq bo'lishini o'zi tanlaydi.
ALTER TABLE mailboxes ADD COLUMN access_priority BIGINT;
UPDATE mailboxes SET access_priority = (EXTRACT(EPOCH FROM created_at) * 1000)::BIGINT;
ALTER TABLE mailboxes ALTER COLUMN access_priority SET NOT NULL;
CREATE INDEX idx_mailboxes_owner_priority ON mailboxes (owner_user_id, access_priority DESC)
    WHERE deleted_at IS NULL;
