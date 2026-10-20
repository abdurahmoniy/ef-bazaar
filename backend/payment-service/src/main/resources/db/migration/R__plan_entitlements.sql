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

-- D: saved-search/price-watch grants are product policy, not editable mailbox
-- quotas. Missing keys must remain distinct from explicit STAFF unlimited.
INSERT INTO plan_entitlements(plan_code,key,value,updated_at) VALUES
 ('STANDARD','watch.search_limit','1',now()),
 ('STANDARD','watch.price_limit','3',now()),
 ('STANDARD','watch.immediate','false',now()),
 ('PRO','watch.search_limit','5',now()),
 ('PRO','watch.price_limit','20',now()),
 ('PRO','watch.immediate','true',now()),
 ('MAX','watch.search_limit','5',now()),
 ('MAX','watch.price_limit','20',now()),
 ('MAX','watch.immediate','true',now()),
 ('STAFF','watch.search_limit',NULL,now()),
 ('STAFF','watch.price_limit',NULL,now()),
 ('STAFF','watch.immediate','true',now())
ON CONFLICT(plan_code,key) DO UPDATE
 SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at;

-- E: seller analytics, product-owned typed grants.
INSERT INTO plan_entitlements(plan_code,key,value,updated_at) VALUES
 ('STANDARD','analytics.history_days','0',now()), ('STANDARD','analytics.export','false',now()),
 ('PRO','analytics.history_days','90',now()), ('PRO','analytics.export','true',now()),
 ('MAX','analytics.history_days','90',now()), ('MAX','analytics.export','true',now()),
 ('STAFF','analytics.history_days',NULL,now()), ('STAFF','analytics.export','true',now())
ON CONFLICT(plan_code,key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at;

-- F: product boolean grants. NULL is not an enabled boolean, including STAFF.
INSERT INTO plan_entitlements(plan_code,key,value,updated_at) VALUES
 ('STANDARD','seller.tools','false',now()), ('STANDARD','seller.bulk','false',now()), ('STANDARD','profile.decoration','false',now()),
 ('PRO','seller.tools','true',now()), ('PRO','seller.bulk','true',now()), ('PRO','profile.decoration','true',now()),
 ('MAX','seller.tools','true',now()), ('MAX','seller.bulk','true',now()), ('MAX','profile.decoration','true',now()),
 ('STAFF','seller.tools','true',now()), ('STAFF','seller.bulk','true',now()), ('STAFF','profile.decoration','true',now())
ON CONFLICT(plan_code,key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at;
