-- ==============================================================
-- Admin BOSHQARMAYDIGAN plan huquqlarining yakuniy holati.
--
-- `mailbox.slots` va `mailbox.custom_slots` bu yerda EMAS: ularni admin
-- panelda o'zgartiradi (V15 seed qilgan). Bu fayl har content o'zgarishida
-- qayta ishlaydi — admin qiymatini bu yerga yozsangiz, keyingi deploy uni
-- jimgina default'ga qaytaradi.
--
-- Kelajakda admin boshqarmaydigan kalit qo'shilsa, shu yerga
-- INSERT ... ON CONFLICT DO UPDATE bilan yozing. DDL yozmang.
-- ==============================================================

SELECT 1;
