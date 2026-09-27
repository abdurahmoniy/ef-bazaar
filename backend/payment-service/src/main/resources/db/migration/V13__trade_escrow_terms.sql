CREATE TABLE trade_escrow_terms (
    trade_id UUID PRIMARY KEY,
    fee_tiyin BIGINT NOT NULL CHECK (fee_tiyin >= 0),
    buyer_hold_tiyin BIGINT NOT NULL CHECK (buyer_hold_tiyin >= 0),
    seller_hold_tiyin BIGINT NOT NULL CHECK (seller_hold_tiyin >= 0),
    seller_proceeds_tiyin BIGINT NOT NULL,
    resolution VARCHAR(16) CHECK (resolution IN ('settle', 'release'))
);
