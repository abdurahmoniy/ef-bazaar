package uz.efbazaar.payment.wallet;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.service.LedgerService;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class LedgerServiceIT extends AbstractPostgresIT {

    @Autowired LedgerService ledger;
    @Autowired JdbcTemplate jdbc;

    @Test
    void aDepositCreditsTheWalletAndBalancesTheBooks() {
        UUID user = UUID.randomUUID();

        UUID txId = ledger.post(TransactionKind.DEPOSIT, "dep-" + user, null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_CARDS, null, 100_000),
                new Posting(LedgerAccount.USER_AVAILABLE, user, -100_000)));

        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(100_000);

        Long sum = jdbc.queryForObject(
                "SELECT sum(amount_tiyin) FROM ledger_entries WHERE transaction_id = ?",
                Long.class, txId);
        assertThat(sum).as("every transaction must sum to zero").isZero();
    }

    @Test
    void postingsThatDoNotSumToZeroAreRejected() {
        UUID user = UUID.randomUUID();

        assertThatThrownBy(() -> ledger.post(
                TransactionKind.DEPOSIT, "unbalanced-" + user, null, null, List.of(
                        new Posting(LedgerAccount.PLATFORM_CARDS, null, 100_000),
                        new Posting(LedgerAccount.USER_AVAILABLE, user, -99_000))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("sum to zero");

        assertThat(ledger.balanceOf(user).getAvailableTiyin())
                .as("a rejected posting must leave nothing behind")
                .isZero();
    }

    @Test
    void theSameIdempotencyKeyPostsOnce() {
        UUID user = UUID.randomUUID();
        List<Posting> postings = List.of(
                new Posting(LedgerAccount.PLATFORM_CARDS, null, 50_000),
                new Posting(LedgerAccount.USER_AVAILABLE, user, -50_000));

        UUID first  = ledger.post(TransactionKind.DEPOSIT, "idem-" + user, null, null, postings);
        UUID second = ledger.post(TransactionKind.DEPOSIT, "idem-" + user, null, null, postings);

        assertThat(second).isEqualTo(first);
        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(50_000);
    }

    @Test
    void theBumpCaseBalances() {
        // 100 100 arrives on the card, 100 000 reaches the user, 100 is revenue.
        UUID user = UUID.randomUUID();

        UUID txId = ledger.post(TransactionKind.DEPOSIT, "bump-" + user, null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_CARDS, null, 100_100),
                new Posting(LedgerAccount.USER_AVAILABLE, user, -100_000),
                new Posting(LedgerAccount.PLATFORM_REVENUE, null, -100)));

        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(100_000);
        Long sum = jdbc.queryForObject(
                "SELECT sum(amount_tiyin) FROM ledger_entries WHERE transaction_id = ?",
                Long.class, txId);
        assertThat(sum).isZero();
    }

    @Test
    void aHoldMovesMoneyBetweenTheUsersOwnBuckets() {
        UUID user = UUID.randomUUID();
        ledger.post(TransactionKind.DEPOSIT, "hold-dep-" + user, null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_CARDS, null, 100_000),
                new Posting(LedgerAccount.USER_AVAILABLE, user, -100_000)));

        ledger.post(TransactionKind.TRADE_HOLD, "hold-" + user, null, null, List.of(
                new Posting(LedgerAccount.USER_AVAILABLE, user, 80_000),
                new Posting(LedgerAccount.USER_HELD, user, -80_000)));

        var w = ledger.balanceOf(user);
        assertThat(w.getAvailableTiyin()).isEqualTo(20_000);
        assertThat(w.getHeldTiyin()).isEqualTo(80_000);
    }

    @Test
    void spendingMoreThanIsAvailableIsRefusedByTheDatabase() {
        UUID user = UUID.randomUUID();

        assertThatThrownBy(() -> ledger.post(
                TransactionKind.TRADE_HOLD, "overdraw-" + user, null, null, List.of(
                        new Posting(LedgerAccount.USER_AVAILABLE, user, 1),
                        new Posting(LedgerAccount.USER_HELD, user, -1))))
                .hasMessageContaining("chk_wallet_non_negative");
    }

    @Test
    void balanceOfCreatesAZeroedWalletOnFirstRead() {
        UUID stranger = UUID.randomUUID();
        var w = ledger.balanceOf(stranger);
        assertThat(w.getAvailableTiyin()).isZero();
        assertThat(w.getHeldTiyin()).isZero();
    }

    @Test
    void historyReturnsOnlyTheCallersOwnEntriesNewestFirst() {
        UUID mine = UUID.randomUUID();
        UUID theirs = UUID.randomUUID();

        ledger.post(TransactionKind.DEPOSIT, "hist-1-" + mine, null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_CARDS, null, 100_000),
                new Posting(LedgerAccount.USER_AVAILABLE, mine, -100_000)));
        ledger.post(TransactionKind.TRADE_HOLD, "hist-2-" + mine, null, null, List.of(
                new Posting(LedgerAccount.USER_AVAILABLE, mine, 30_000),
                new Posting(LedgerAccount.USER_HELD, mine, -30_000)));
        ledger.post(TransactionKind.DEPOSIT, "hist-other-" + theirs, null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_CARDS, null, 500),
                new Posting(LedgerAccount.USER_AVAILABLE, theirs, -500)));

        var history = ledger.historyOf(mine, 50);

        assertThat(history).hasSize(3);   // one deposit credit + two hold entries
        assertThat(history).allSatisfy(e ->
                assertThat(e.kind()).isIn(TransactionKind.DEPOSIT, TransactionKind.TRADE_HOLD));
        assertThat(ledger.historyOf(theirs, 50))
                .as("one user's history must never contain another's")
                .hasSize(1);
    }

    @Test
    void onlyADepositCountsTowardsTheLifetimeTotal() {
        UUID user = UUID.randomUUID();

        ledger.post(TransactionKind.DEPOSIT, "life-dep-" + user, null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_CARDS, null, 100_000),
                new Posting(LedgerAccount.USER_AVAILABLE, user, -100_000)));

        ledger.post(TransactionKind.TRADE_HOLD, "life-hold-" + user, null, null, List.of(
                new Posting(LedgerAccount.USER_AVAILABLE, user, 40_000),
                new Posting(LedgerAccount.USER_HELD, user, -40_000)));

        ledger.post(TransactionKind.TRADE_RELEASE, "life-rel-" + user, null, null, List.of(
                new Posting(LedgerAccount.USER_HELD, user, 40_000),
                new Posting(LedgerAccount.USER_AVAILABLE, user, -40_000)));

        var w = ledger.balanceOf(user);
        assertThat(w.getAvailableTiyin()).isEqualTo(100_000);
        assertThat(w.getLifetimeDepositedTiyin())
                .as("a release is not a deposit")
                .isEqualTo(100_000);
    }
}
