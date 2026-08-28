-- ==============================================================
-- marketplace-service V40 — hamkorlikni bekor qilish.
--
-- Uch xil yo'l bilan bekor qilinadi va ularni AJRATIB ko'rsatish kerak:
-- foydalanuvchi o'zi voz kechdi, admin to'xtatdi, yoki bot kanaldan
-- chiqarib tashlandi. Uchtasi bitta "bekor qilingan" bo'lib ko'rinsa,
-- "nega men endi hamkor emasman" degan savolga javob qolmaydi.
--
-- Holat bitta — CANCELLED. Sabab alohida ustunda: uchta yangi holat
-- kiritish holat mashinasini kengaytirardi, ular esa bir xil yakun.
-- ==============================================================

ALTER TABLE partner_applications
    ADD COLUMN cancel_reason text,
    ADD COLUMN cancelled_by  uuid,
    ADD COLUMN cancelled_at  timestamptz;

-- CHECK'ga qiymat qo'shib bo'lmaydi — faqat almashtirish mumkin.
-- V29 va V34 dagi nosozlik aynan shu qadam unutilgani uchun chiqqan edi.
ALTER TABLE partner_applications DROP CONSTRAINT chk_partner_applications_status;
ALTER TABLE partner_applications ADD  CONSTRAINT chk_partner_applications_status
    CHECK (status IN (
        'AWAITING_CHANNEL',
        'AWAITING_PAYMENT',
        'AWAITING_REVIEW',
        'APPROVED',
        'REJECTED',
        'CANCELLED'));

-- Bekor qilingan ariza foydalanuvchini ham, kanalni ham BO'SHATADI.
--
-- Ikkala qisman indeks ham qayta yaratiladi: CANCELLED ular ichida
-- bo'lmasligi kerak, aks holda bekor qilingan arizadan keyin yangisini
-- ochib bo'lmasdi — muzlab qolishning aynan o'zi.
DROP INDEX uk_partner_applications_open_per_user;
CREATE UNIQUE INDEX uk_partner_applications_open_per_user
    ON partner_applications (user_id)
    WHERE status IN ('AWAITING_CHANNEL', 'AWAITING_PAYMENT', 'AWAITING_REVIEW');

DROP INDEX uk_partner_applications_channel;
CREATE UNIQUE INDEX uk_partner_applications_channel
    ON partner_applications (channel_id)
    WHERE channel_id IS NOT NULL
      AND status IN ('AWAITING_PAYMENT', 'AWAITING_REVIEW', 'APPROVED');
