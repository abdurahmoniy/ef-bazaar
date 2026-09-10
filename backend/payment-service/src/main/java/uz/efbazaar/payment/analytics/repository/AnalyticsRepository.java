package uz.efbazaar.payment.analytics.repository;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.payment.analytics.dto.CardThroughputRow;
import uz.efbazaar.payment.analytics.dto.ReferralReachRow;
import uz.efbazaar.payment.analytics.dto.RevenueFlowRow;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.LedgerEntry;

import java.util.List;

/**
 * Read-only aggregates for the finance dashboard.
 *
 * <p>A plain {@link Repository}, not a {@code JpaRepository}: nothing here may
 * write, and inheriting {@code save}/{@code delete} onto the reporting surface
 * would be an invitation. {@code ledger_entries} is append-only and
 * {@link uz.efbazaar.payment.wallet.service.LedgerService} is its only writer.
 *
 * <p>The queries span three entities on purpose — one round trip each beats
 * loading a ledger that grows without bound into the heap to sum it in Java.
 */
public interface AnalyticsRepository extends Repository<LedgerEntry, Long> {

    /**
     * An account's balance in the ledger's own signed convention: positive
     * debits, negative credits. Callers flip the sign for the liability and
     * equity accounts — see {@link uz.efbazaar.payment.analytics.service.AnalyticsService}.
     */
    @Query("""
           SELECT coalesce(sum(e.amountTiyin), 0)
           FROM LedgerEntry e
           WHERE e.account = :account
           """)
    long sumByAccount(@Param("account") LedgerAccount account);

    /**
     * {@code PLATFORM_REVENUE} broken down by what moved it, both directions
     * reported positive.
     *
     * <p>Grouped by kind rather than listing the kinds this screen knows about:
     * a {@code TransactionKind} added next year shows up here on its own
     * instead of quietly vanishing from a total that still claims to be
     * complete.
     */
    @Query("""
           SELECT new uz.efbazaar.payment.analytics.dto.RevenueFlowRow(
                    t.kind,
                    coalesce(sum(CASE WHEN e.amountTiyin < 0 THEN -e.amountTiyin ELSE 0 END), 0),
                    coalesce(sum(CASE WHEN e.amountTiyin > 0 THEN e.amountTiyin ELSE 0 END), 0))
           FROM LedgerEntry e
           JOIN WalletTransaction t ON t.id = e.transactionId
           WHERE e.account = uz.efbazaar.payment.wallet.domain.LedgerAccount.PLATFORM_REVENUE
           GROUP BY t.kind
           """)
    List<RevenueFlowRow> revenueByKind();

    /**
     * How many distinct people have been paid a referral reward, and over how
     * many transactions.
     *
     * <p>{@code USER_AVAILABLE} only: the reward's other leg is the platform's
     * equity, and counting both sides would double every number here.
     *
     */
    @Query("""
           SELECT new uz.efbazaar.payment.analytics.dto.ReferralReachRow(
                    count(distinct t.id), count(distinct e.userId))
           FROM LedgerEntry e
           JOIN WalletTransaction t ON t.id = e.transactionId
           WHERE t.kind = uz.efbazaar.payment.wallet.domain.TransactionKind.REFERRAL_REWARD
             AND e.account = uz.efbazaar.payment.wallet.domain.LedgerAccount.USER_AVAILABLE
           """)
    ReferralReachRow referralReach();

    /**
     * Settled deposits per card.
     *
     * <p>{@code transferAmountTiyin}, not {@code requestedAmountTiyin}: a bumped
     * invoice asks the user for a few tiyin more so the incoming notification
     * can be told apart from someone else's, and the transfer amount is what
     * actually landed on the card.
     *
     * <p>PAID only. A pending or expired invoice moved no money, and an
     * expired one's slot may already belong to somebody else.
     */
    @Query("""
           SELECT new uz.efbazaar.payment.analytics.dto.CardThroughputRow(
                    i.cardId, coalesce(sum(i.transferAmountTiyin), 0), count(i))
           FROM Invoice i
           WHERE i.cardId IS NOT NULL
             AND i.status = uz.efbazaar.payment.invoice.domain.InvoiceStatus.PAID
           GROUP BY i.cardId
           """)
    List<CardThroughputRow> throughputByCard();

    /** What the userbot last saw across every card that has ever reported. */
    @Query("""
           SELECT coalesce(sum(c.balanceTiyin), 0)
           FROM PlatformCard c
           WHERE c.balanceTiyin IS NOT NULL
           """)
    long observedCardBalance();

    /** Cards {@link #observedCardBalance()} could not include. */
    @Query("SELECT count(c) FROM PlatformCard c WHERE c.balanceTiyin IS NULL")
    long unobservedCardCount();
}
