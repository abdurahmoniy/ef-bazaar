-- ==============================================================
-- auth-service V7 — third role: TRADE_ADMIN.
-- Without widening this CHECK, granting the role fails with a
-- constraint violation (chk_users_role was 'USER' | 'ADMIN' only).
-- The column stays single-valued; the JWT roles claim is derived
-- from it by Role.authorities().
-- ==============================================================

ALTER TABLE users DROP CONSTRAINT chk_users_role;
ALTER TABLE users ADD  CONSTRAINT chk_users_role
    CHECK (role IN ('USER', 'ADMIN', 'TRADE_ADMIN'));
