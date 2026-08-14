package uz.efbazaar.payment.wallet.service;

/**
 * What the platform keeps from a smart-admin trade.
 *
 * <pre>
 *   price &lt; 100 000 so'm   →  10%,  at least  5 000 so'm
 *   price ≥ 100 000 so'm   →  7.5%, at least 10 000 so'm
 * </pre>
 *
 * <p>The seller pays it: the buyer is held the listed price and the seller
 * receives that price minus this fee.
 *
 * <p>The band boundary is deliberately smooth. At 99 999 so'm ten percent is
 * 9 999.9, floored to 9 999, and the 5 000 floor does not bind; at 100 000 the
 * rate drops to 7.5% (7 500) but the 10 000 floor lifts it back. So the fee
 * moves from ~9 999 to 10 000 across the step instead of jumping.
 *
 * <p>Pure integer arithmetic on tiyin. The rate is applied as per-mille so no
 * float ever touches an amount, and integer division truncates, which rounds
 * the fee down — in the seller's favour, never the platform's.
 */
public final class TradeCommission {

    /** 100 000 so'm, the point where the rate drops and the floor rises. */
    static final long BAND_TIYIN = 10_000_000L;

    private static final long LOW_RATE_PER_MILLE = 100;   // 10%
    private static final long HIGH_RATE_PER_MILLE = 75;   // 7.5%
    private static final long LOW_MIN_TIYIN = 500_000L;   //  5 000 so'm
    private static final long HIGH_MIN_TIYIN = 1_000_000L; // 10 000 so'm

    private TradeCommission() {}

    /**
     * @param priceTiyin what the buyer pays, which is the listed price
     * @return the platform's share, never negative and never more than the price
     */
    public static long feeTiyin(long priceTiyin) {
        if (priceTiyin <= 0) {
            throw new IllegalArgumentException("A trade price must be positive, got " + priceTiyin);
        }
        boolean low = priceTiyin < BAND_TIYIN;
        long rate = low ? LOW_RATE_PER_MILLE : HIGH_RATE_PER_MILLE;
        long floor = low ? LOW_MIN_TIYIN : HIGH_MIN_TIYIN;

        long fee = Math.max(priceTiyin * rate / 1000, floor);

        // On a trade smaller than the floor the fee would exceed the price and
        // the seller would owe money to be paid. Capping keeps the ledger sane,
        // but a trade this small should not be allowed in the first place —
        // see minimumViablePriceTiyin.
        return Math.min(fee, priceTiyin);
    }

    /** What the seller actually receives. */
    public static long sellerProceedsTiyin(long priceTiyin) {
        return priceTiyin - feeTiyin(priceTiyin);
    }

    /**
     * Below this the fee swallows the whole price and the seller receives
     * nothing. Callers should refuse such a trade rather than let it through
     * with a capped fee.
     */
    public static long minimumViablePriceTiyin() {
        return LOW_MIN_TIYIN;
    }
}
