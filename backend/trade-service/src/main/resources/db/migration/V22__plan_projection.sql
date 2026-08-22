-- ==============================================================
-- trade-service V22 — tarif rejalarining lokal nusxasi.
--
-- NEGA NUSXA. Slot cheklovi savdo ochilishida tekshiriladi, ya'ni eng issiq
-- yo'lda. Har safar payment-service'ga HTTP qilsak, o'sha servis sekinlashsa
-- yoki o'chsa butun bozor savdo ocholmay qoladi — bu haftada escrow HTTP
-- chaqiruvi bilan aynan shunga o'xshash muammoni ko'rdik. Shuning uchun
-- ma'lumot Kafka orqali oldindan keladi va bu yerda turadi.
--
-- IKKI JADVAL, BITTA EMAS. Kim qaysi rejada ekani va reja nima berishi
-- butunlay boshqa tezlikda o'zgaradi: birinchisi har bir sotib olishda,
-- ikkinchisi yiliga bir necha marta. Bitta jadvalda saqlasak, STANDARD
-- limitini 3 dan 5 ga o'zgartirish har bir foydalanuvchi uchun alohida hodisa
-- talab qilardi — minglab xabar, hammasi bir xil gapni aytadi.
--
-- HUQUQ NOMLARI QATTIQ YOZILMAGAN. `mailbox.slots` shunchaki qator; ertaga
-- `trade.concurrent` qo'shilsa bu migratsiya ham, uni o'qiydigan kod ham
-- o'zgarmaydi.
--
-- NULL = cheksiz, payment-service'dagi kabi.
-- ==============================================================

CREATE TABLE plan_entitlement_view (
    plan_code   VARCHAR(32)  NOT NULL,
    key         VARCHAR(64)  NOT NULL,
    value       VARCHAR(64),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    PRIMARY KEY (plan_code, key)
);

CREATE TABLE user_plan_view (
    user_id     UUID         PRIMARY KEY,
    plan_code   VARCHAR(32)  NOT NULL,
    expires_at  TIMESTAMPTZ,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Qator yo'q = STANDARD, xuddi manbadagidek. Shu sabab bu jadval faqat
-- pullik rejadagilarni saqlaydi va kichik qolaveradi.
