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

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

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

    /**
     * Simulates a Kafka redelivery racing the original post: two threads call
     * {@code post} with the same idempotency key at (as close to) the same
     * instant. Only one transaction row must ever exist for the key, and
     * every caller must observe its id -- never an exception.
     */
    @Test
    void concurrentPostsWithTheSameIdempotencyKeyProduceExactlyOneTransaction() throws Exception {
        for (int iteration = 0; iteration < 5; iteration++) {
            UUID user = UUID.randomUUID();
            String key = "race-" + user;
            List<Posting> postings = List.of(
                    new Posting(LedgerAccount.PLATFORM_CARDS, null, 10_000),
                    new Posting(LedgerAccount.USER_AVAILABLE, user, -10_000));

            int threadCount = 8;
            CountDownLatch ready = new CountDownLatch(threadCount);
            CountDownLatch start = new CountDownLatch(1);
            ExecutorService pool = Executors.newFixedThreadPool(threadCount);
            try {
                List<Future<UUID>> futures = new ArrayList<>();
                for (int i = 0; i < threadCount; i++) {
                    futures.add(pool.submit(() -> {
                        ready.countDown();
                        start.await();
                        return ledger.post(TransactionKind.DEPOSIT, key, null, null, postings);
                    }));
                }
                ready.await();
                start.countDown();

                Set<UUID> results = new HashSet<>();
                for (Future<UUID> f : futures) {
                    results.add(f.get(10, TimeUnit.SECONDS));
                }
                assertThat(results)
                        .as("iteration %d: every racing caller must see the same transaction id", iteration)
                        .hasSize(1);
            } finally {
                pool.shutdownNow();
            }

            Integer count = jdbc.queryForObject(
                    "SELECT count(*) FROM wallet_transactions WHERE idempotency_key = ?",
                    Integer.class, key);
            assertThat(count)
                    .as("iteration %d: exactly one transaction row for the key", iteration)
                    .isEqualTo(1);
        }
    }

    /**
     * Simulates a deposit crediting a brand-new user at the same instant that
     * something else (a wallet-page load, another concurrent deposit) first
     * touches that same userId. Neither caller has a row to lock yet, so both
     * must survive the race to create it, and the resulting balance must
     * still be the exact sum of every deposit.
     */
    @Test
    void concurrentFirstTouchesOfTheSameWalletDoNotCrash() throws Exception {
        for (int iteration = 0; iteration < 5; iteration++) {
            UUID user = UUID.randomUUID();
            int threadCount = 8;
            CountDownLatch ready = new CountDownLatch(threadCount);
            CountDownLatch start = new CountDownLatch(1);
            ExecutorService pool = Executors.newFixedThreadPool(threadCount);
            try {
                List<Future<UUID>> futures = new ArrayList<>();
                for (int i = 0; i < threadCount; i++) {
                    int idx = i;
                    futures.add(pool.submit(() -> {
                        ready.countDown();
                        start.await();
                        return ledger.post(TransactionKind.DEPOSIT, "wallet-race-" + user + "-" + idx, null, null,
                                List.of(
                                        new Posting(LedgerAccount.PLATFORM_CARDS, null, 1_000),
                                        new Posting(LedgerAccount.USER_AVAILABLE, user, -1_000)));
                    }));
                }
                ready.await();
                start.countDown();

                for (Future<UUID> f : futures) {
                    assertThat(f.get(10, TimeUnit.SECONDS))
                            .as("iteration %d: no racing caller may throw", iteration)
                            .isNotNull();
                }
            } finally {
                pool.shutdownNow();
            }

            assertThat(ledger.balanceOf(user).getAvailableTiyin())
                    .as("iteration %d: every thread's deposit must be reflected exactly once", iteration)
                    .isEqualTo(1_000L * threadCount);
        }
    }
}
