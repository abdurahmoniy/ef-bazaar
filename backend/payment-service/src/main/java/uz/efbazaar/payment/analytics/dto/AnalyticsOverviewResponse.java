package uz.efbazaar.payment.analytics.dto;

import java.time.Instant;
import java.util.List;

/**
 * Everything the admin finance dashboard draws, in one read.
 *
 * <p>Split into three questions, in the order the screen asks them:
 *
 * <ol>
 *   <li>Whose money is on the cards, and do the books agree with what the
 *       userbot actually sees there?
 *   <li>What is left of the commission after referral rewards and fees?
 *   <li>Which card is carrying the traffic?
 * </ol>
 *
 * <p>Every amount is tiyin. Every one is reported in the direction a person
 * reads it — money the platform holds is positive, money it paid out is
 * positive — never in the ledger's signed convention.
 */
public record AnalyticsOverviewResponse(

        // --- 1. Whose money ------------------------------------------------
        /** What the ledger says sits on the cards: the {@code PLATFORM_CARDS} balance. */
        long ledgerCardsTiyin,
        /** What the userbot last saw on them, summed. Cards never observed are absent. */
        long observedCardsTiyin,
        /** How many cards have never reported a balance — {@code observedCardsTiyin} is short by them. */
        int unobservedCards,
        long userAvailableTiyin,
        long userHeldTiyin,
        long userWithdrawPendingTiyin,
        /** The three above. What the platform owes its users. */
        long usersTotalTiyin,
        /** {@code ledgerCardsTiyin − usersTotalTiyin}. The platform's own share of the cards. */
        long platformOwnTiyin,

        // --- 2. Profit -----------------------------------------------------
        /** Commission, partner fees, disambiguation bumps — everything that grew equity. */
        long revenueInTiyin,
        /** Referral rewards and partner shares — everything paid back out of equity. */
        long revenueOutTiyin,
        /** Bank fees the platform absorbed: the {@code PLATFORM_FEES} balance. */
        long feesTiyin,
        /** {@code revenueIn − revenueOut − fees}. Negative is a normal business state, not an error. */
        long netTiyin,
        long referralRewardTiyin,
        long referralPayouts,
        long referralRecipients,
        /** Per kind, so the screen can itemise without hard-coding which kinds exist. */
        List<RevenueFlowRow> revenueByKind,

        // --- 3. Cards ------------------------------------------------------
        List<CardThroughputRow> cardThroughput,

        Instant computedAt
) {}
