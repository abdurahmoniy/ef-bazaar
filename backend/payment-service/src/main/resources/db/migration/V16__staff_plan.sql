-- ==============================================================
-- payment-service V16 — STAFF: ADMIN roli uchun yashirin, cheklovsiz tarif.
--
-- Sotilmaydi (narx qatori yo'q, active=FALSE — ochiq katalogda ko'rinmaydi) va
-- admin panelda tahrirlanmaydi: har huquq NULL = cheklovsiz. Foydalanuvchi unga
-- auth-service'ning user-role-changed hodisasi bilan o'tadi (source = 'ROLE').
-- ==============================================================

INSERT INTO plans (code, active, sort_order) VALUES ('STAFF', FALSE, 99)
ON CONFLICT (code) DO NOTHING;

INSERT INTO plan_entitlements (plan_code, key, value, updated_at) VALUES
    ('STAFF', 'mailbox.slots',        NULL, now()),
    ('STAFF', 'mailbox.custom_slots', NULL, now())
ON CONFLICT (plan_code, key) DO UPDATE
    SET value      = NULL,
        updated_at = now();
