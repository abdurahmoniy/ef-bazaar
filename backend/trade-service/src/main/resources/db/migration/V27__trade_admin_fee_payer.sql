ALTER TABLE trades ADD COLUMN admin_fee_payer VARCHAR(8) NOT NULL DEFAULT 'SELLER'
    CHECK (admin_fee_payer IN ('SELLER', 'BUYER', 'SPLIT'));
