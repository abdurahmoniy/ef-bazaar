-- ==============================================================
-- auth-service V9 — to'rtinchi rol: PARTNER (katta kanal adminlari).
--
-- V7 dagi bilan bir xil qadam: CHECK kengaytirilmasa rol berish
-- constraint violation bilan yiqiladi. Qiymat qo'shib bo'lmaydi —
-- cheklov almashtiriladi va ro'yxat to'liq qayta sanaladi.
--
-- Ustun bir qiymatli bo'lib qoladi; JWT dagi roles claim uni
-- Role.authorities() dan oladi va hamkorga ROLE_USER ham beriladi,
-- shunda u oddiy foydalanuvchi kabi sotib olishda davom etadi.
-- ==============================================================

ALTER TABLE users DROP CONSTRAINT chk_users_role;
ALTER TABLE users ADD  CONSTRAINT chk_users_role
    CHECK (role IN ('USER', 'ADMIN', 'TRADE_ADMIN', 'PARTNER'));
