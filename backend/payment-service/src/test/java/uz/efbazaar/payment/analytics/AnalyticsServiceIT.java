package uz.efbazaar.payment.analytics;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import uz.efbazaar.payment.analytics.dto.AnalyticsOverviewResponse;
import uz.efbazaar.payment.analytics.dto.RevenueFlowRow;
import uz.efbazaar.payment.analytics.service.AnalyticsService;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.service.LedgerService;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The finance dashboard's numbers, checked against a ledger built by hand.
 *
 * <p>What is really under test is the sign flipping. The ledger stores positive
 * debits and negative credits, which means the accounts holding money read
 * negative; a single missed flip turns "users hold 700 000" into "users hold
 * −700 000" and the screen contradicts itself without failing.
 */
@SpringBootTest
class AnalyticsServiceIT extends AbstractPostgresIT {

    @Autowired AnalyticsService analytics;
    @Autowired LedgerService ledger;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        jdbc.update("DELETE FROM ledger_entries");
        jdbc.update("DELETE FROM wallet_transactions");
        jdbc.update("DELETE FROM wallet_accounts");
    }

    @Test
    void theCardsHoldTheUsersMoneyPlusWhateverTheCommissionKept() {
        UUID buyer = UUID.randomUUID();
        UUID seller = UUID.randomUUID();

        // A user deposits 1 000 000 tiyin: it lands on a card and is owed back.
        ledger.post(TransactionKind.DEPOSIT, "dep-1", null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_CARDS, null, 1_000_000),
                new Posting(LedgerAccount.USER_AVAILABLE, buyer, -1_000_000)));

        // A trade settles: 900 000 to the seller, 100 000 kept as commission.
        ledger.post(TransactionKind.TRADE_SETTLE, "settle-1", null, null, List.of(
                new Posting(LedgerAccount.USER_AVAILABLE, buyer, 1_000_000),
                new Posting(LedgerAccount.USER_AVAILABLE, seller, -900_000),
                new Posting(LedgerAccount.PLATFORM_REVENUE, null, -100_000)));

        AnalyticsOverviewResponse o = analytics.overview();

        assertThat(o.ledgerCardsTiyin()).isEqualTo(1_000_000);
        assertThat(o.userAvailableTiyin())
                .as("read the way a person says it, not the ledger's sign")
                .isEqualTo(900_000);
        assertThat(o.usersTotalTiyin()).isEqualTo(900_000);
        assertThat(o.platformOwnTiyin()).isEqualTo(100_000);
        assertThat(o.revenueInTiyin()).isEqualTo(100_000);
        assertThat(o.netTiyin()).isEqualTo(100_000);
    }

    /**
     * The case the whole dashboard exists for. Referral spending comes out of
     * equity, so it can — and while the platform is buying growth, will — push
     * the net below zero. Nothing may clamp it to zero or refuse to report it.
     */
    @Test
    void referralSpendingCanPushTheNetNegativeAndIsReportedAsIs() {
        UUID referrer = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();

        ledger.post(TransactionKind.DEPOSIT, "dep-2", null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_CARDS, null, 500_000),
                new Posting(LedgerAccount.USER_AVAILABLE, buyer, -500_000)));
        ledger.post(TransactionKind.TRADE_SETTLE, "settle-2", null, null, List.of(
                new Posting(LedgerAccount.USER_AVAILABLE, buyer, 40_000),
                new Posting(LedgerAccount.PLATFORM_REVENUE, null, -40_000)));
        ledger.post(TransactionKind.REFERRAL_REWARD, "ref-1", null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_REVENUE, null, 70_000),
                new Posting(LedgerAccount.USER_AVAILABLE, referrer, -70_000)));

        AnalyticsOverviewResponse o = analytics.overview();

        assertThat(o.revenueInTiyin()).isEqualTo(40_000);
        assertThat(o.revenueOutTiyin()).isEqualTo(70_000);
        assertThat(o.referralRewardTiyin()).isEqualTo(70_000);
        assertThat(o.netTiyin()).isEqualTo(-30_000);
        assertThat(o.platformOwnTiyin())
                .as("the identity holds through a loss too")
                .isEqualTo(-30_000);
    }

    @Test
    void referralReachCountsPeopleNotPostings() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();

        ledger.post(TransactionKind.REFERRAL_REWARD, "ref-a1", null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_REVENUE, null, 10_000),
                new Posting(LedgerAccount.USER_AVAILABLE, a, -10_000)));
        ledger.post(TransactionKind.REFERRAL_REWARD, "ref-a2", null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_REVENUE, null, 10_000),
                new Posting(LedgerAccount.USER_AVAILABLE, a, -10_000)));
        ledger.post(TransactionKind.REFERRAL_REWARD, "ref-b1", null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_REVENUE, null, 10_000),
                new Posting(LedgerAccount.USER_AVAILABLE, b, -10_000)));

        AnalyticsOverviewResponse o = analytics.overview();

        assertThat(o.referralPayouts()).isEqualTo(3);
        assertThat(o.referralRecipients()).isEqualTo(2);
    }

    @Test
    void heldAndPendingMoneyIsStillTheUsersMoney() {
        UUID buyer = UUID.randomUUID();

        ledger.post(TransactionKind.DEPOSIT, "dep-3", null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_CARDS, null, 300_000),
                new Posting(LedgerAccount.USER_AVAILABLE, buyer, -300_000)));
        ledger.post(TransactionKind.TRADE_HOLD, "hold-1", null, null, List.of(
                new Posting(LedgerAccount.USER_AVAILABLE, buyer, 120_000),
                new Posting(LedgerAccount.USER_HELD, buyer, -120_000)));
        ledger.post(TransactionKind.WITHDRAW_RESERVE, "wd-1", null, null, List.of(
                new Posting(LedgerAccount.USER_AVAILABLE, buyer, 50_000),
                new Posting(LedgerAccount.WITHDRAW_PENDING, buyer, -50_000)));

        AnalyticsOverviewResponse o = analytics.overview();

        assertThat(o.userAvailableTiyin()).isEqualTo(130_000);
        assertThat(o.userHeldTiyin()).isEqualTo(120_000);
        assertThat(o.userWithdrawPendingTiyin()).isEqualTo(50_000);
        assertThat(o.usersTotalTiyin()).isEqualTo(300_000);
        assertThat(o.platformOwnTiyin())
                .as("moving a user's money between their own accounts earns nothing")
                .isZero();
    }

    @Test
    void anEmptyLedgerReportsZerosRatherThanFailing() {
        AnalyticsOverviewResponse o = analytics.overview();

        assertThat(o.ledgerCardsTiyin()).isZero();
        assertThat(o.usersTotalTiyin()).isZero();
        assertThat(o.netTiyin()).isZero();
        assertThat(o.referralPayouts()).isZero();
        assertThat(o.revenueByKind()).isEmpty();
        assertThat(o.computedAt()).isNotNull();
    }

    @Test
    void everyKindThatTouchedEquityIsItemised() {
        UUID user = UUID.randomUUID();

        // The fee is charged from the wallet, so the wallet has to have it
        // first — chk_wallet_non_negative would otherwise abort the posting.
        ledger.post(TransactionKind.DEPOSIT, "dep-4", null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_CARDS, null, 200_000),
                new Posting(LedgerAccount.USER_AVAILABLE, user, -200_000)));
        ledger.post(TransactionKind.PARTNER_FEE, "pf-1", null, null, List.of(
                new Posting(LedgerAccount.USER_AVAILABLE, user, 200_000),
                new Posting(LedgerAccount.PLATFORM_REVENUE, null, -200_000)));
        ledger.post(TransactionKind.REFERRAL_REWARD, "ref-c1", null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_REVENUE, null, 30_000),
                new Posting(LedgerAccount.USER_AVAILABLE, user, -30_000)));

        List<RevenueFlowRow> rows = analytics.overview().revenueByKind();

        assertThat(rows).hasSize(2);
        assertThat(rows)
                .as("biggest contributor first")
                .first()
                .satisfies(r -> {
                    assertThat(r.kind()).isEqualTo(TransactionKind.PARTNER_FEE);
                    assertThat(r.inTiyin()).isEqualTo(200_000);
                    assertThat(r.outTiyin()).isZero();
                });
        assertThat(rows.get(1).kind()).isEqualTo(TransactionKind.REFERRAL_REWARD);
        assertThat(rows.get(1).netTiyin()).isEqualTo(-30_000);
    }
}
