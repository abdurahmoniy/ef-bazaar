package uz.efbazaar.payment.analytics.dto;

import uz.efbazaar.payment.wallet.domain.TransactionKind;

/**
 * One transaction kind's effect on {@code PLATFORM_REVENUE}, split into the two
 * directions.
 *
 * <p>Both numbers are reported POSITIVE. In the ledger a credit is negative, so
 * the money the platform earned arrives as a negative sum; a screen that showed
 * "commission: −4 180 000" beside "referral: +2 400 000" would read exactly
 * backwards.
 *
 * @param inTiyin  what this kind added to the platform's equity
 * @param outTiyin what it took out — referral rewards, partner shares
 */
public record RevenueFlowRow(TransactionKind kind, long inTiyin, long outTiyin) {

    public long netTiyin() {
        return inTiyin - outTiyin;
    }
}
