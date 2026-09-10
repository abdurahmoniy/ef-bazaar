package uz.efbazaar.payment.analytics.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.payment.analytics.dto.AnalyticsOverviewResponse;
import uz.efbazaar.payment.analytics.dto.CardThroughputRow;
import uz.efbazaar.payment.analytics.dto.ReferralReachRow;
import uz.efbazaar.payment.analytics.dto.RevenueFlowRow;
import uz.efbazaar.payment.analytics.repository.AnalyticsRepository;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;

import java.time.Clock;
import java.util.Comparator;
import java.util.List;

/**
 * Turns the ledger into the four numbers an owner actually asks for: how much
 * of the money on the cards is ours, how much of it is theirs, what the
 * commission earned, and what growth spending cost.
 *
 * <p><b>Sign handling is the whole job here.</b> The ledger stores positive
 * debits and negative credits, which means the accounts holding money the
 * platform has are the ones that sum negative. Every flip happens in this class
 * and nowhere else — the response records what a person would say out loud.
 *
 * <p><b>A negative net is not an error.</b> Referral rewards come out of equity
 * by design; while the platform is buying growth, spending more than the
 * commission brings in is the expected state. Nothing here clamps, warns, or
 * flags it, and the screen must not either.
 */
@Service
@RequiredArgsConstructor
public class AnalyticsService {

    private final AnalyticsRepository analytics;
    private final Clock clock;

    @Transactional(readOnly = true)
    public AnalyticsOverviewResponse overview() {
        // Asset: debits are positive, so this account already reads the way a
        // person would say it.
        long cards = analytics.sumByAccount(LedgerAccount.PLATFORM_CARDS);

        // Liabilities: money owed to a user is a credit, so it sums negative.
        long available = -analytics.sumByAccount(LedgerAccount.USER_AVAILABLE);
        long held = -analytics.sumByAccount(LedgerAccount.USER_HELD);
        long withdrawPending = -analytics.sumByAccount(LedgerAccount.WITHDRAW_PENDING);
        long users = available + held + withdrawPending;

        // Expense: an absorbed fee is a debit, already positive.
        long fees = analytics.sumByAccount(LedgerAccount.PLATFORM_FEES);

        List<RevenueFlowRow> byKind = analytics.revenueByKind().stream()
                .sorted(Comparator.comparingLong(RevenueFlowRow::netTiyin).reversed())
                .toList();
        long revenueIn = byKind.stream().mapToLong(RevenueFlowRow::inTiyin).sum();
        long revenueOut = byKind.stream().mapToLong(RevenueFlowRow::outTiyin).sum();

        long referral = byKind.stream()
                .filter(r -> r.kind() == TransactionKind.REFERRAL_REWARD)
                .mapToLong(RevenueFlowRow::outTiyin)
                .sum();
        ReferralReachRow reach = analytics.referralReach();

        // Every posting sums to zero, so this is the same figure as
        // revenueIn − revenueOut − fees — reached from the other side. They can
        // only disagree if a transaction was written outside LedgerService.
        long platformOwn = cards - users;

        return new AnalyticsOverviewResponse(
                cards,
                analytics.observedCardBalance(),
                (int) analytics.unobservedCardCount(),
                available,
                held,
                withdrawPending,
                users,
                platformOwn,
                revenueIn,
                revenueOut,
                fees,
                revenueIn - revenueOut - fees,
                referral,
                reach == null ? 0 : reach.payouts(),
                reach == null ? 0 : reach.recipients(),
                byKind,
                analytics.throughputByCard().stream()
                        .sorted(Comparator.comparingLong(CardThroughputRow::throughputTiyin).reversed())
                        .toList(),
                clock.instant());
    }
}
