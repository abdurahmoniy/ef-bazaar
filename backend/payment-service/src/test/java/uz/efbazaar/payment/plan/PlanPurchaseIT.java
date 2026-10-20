package uz.efbazaar.payment.plan;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import uz.efbazaar.payment.plan.domain.PlanPeriod;
import uz.efbazaar.payment.plan.dto.PurchasePlanRequest;
import uz.efbazaar.payment.plan.repository.PlanPurchaseRepository;
import uz.efbazaar.payment.plan.service.PlanPurchaseService;
import uz.efbazaar.payment.plan.service.PlanService;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.service.LedgerService;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class PlanPurchaseIT extends AbstractPostgresIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired LedgerService ledger;
    @Autowired PlanService plans;
    @Autowired PlanPurchaseService purchases;
    @Autowired PlanPurchaseRepository purchaseRows;
    @Autowired JdbcTemplate jdbc;
    @Autowired org.springframework.transaction.support.TransactionTemplate transactions;

    private UUID fundedUser(long tiyin) {
        UUID user = UUID.randomUUID();
        ledger.post(TransactionKind.DEPOSIT, "dep-" + user, null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_CARDS, null, tiyin),
                new Posting(LedgerAccount.USER_AVAILABLE, user, -tiyin)));
        return user;
    }

    private ResultActions buy(UUID user, String plan, String period, long expected, String key) throws Exception {
        var req = new PurchasePlanRequest(plan, PlanPeriod.valueOf(period), expected, key);
        return mvc.perform(post("/api/v1/payments/plans/purchase").with(asUser(user))
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(req)));
    }

    @Test
    void buyingDebitsTheWalletAndPutsTheUserOnThePlan() throws Exception {
        UUID user = fundedUser(6_000_000);

        buy(user, "PRO", "MONTH", 3_000_000, UUID.randomUUID().toString())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("PRO"))
                .andExpect(jsonPath("$.expiresAt").isNotEmpty());

        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(3_000_000);
        assertThat(plans.planFor(user)).isEqualTo("PRO");
        assertThat(purchaseRows.findAll()).anyMatch(p -> p.getUserId().equals(user)
                && p.getPriceTiyin() == 3_000_000 && "PURCHASE".equals(jdbc.queryForObject(
                        "SELECT source FROM user_subscriptions WHERE user_id = ?", String.class, user)));
    }

    @Test
    void notEnoughMoneyChargesNothingAndSaysHowMuchIsMissing() throws Exception {
        UUID user = fundedUser(400_000);

        buy(user, "PRO", "MONTH", 3_000_000, UUID.randomUUID().toString())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("Hamyonda mablag' yetarli emas — 26000 so'm yetishmayapti"));

        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(400_000);
        assertThat(plans.planFor(user)).isEqualTo("STANDARD");
    }

    @Test
    void aStalePriceIsRefusedAndNothingIsCharged() throws Exception {
        UUID user = fundedUser(5_000_000);
        jdbc.update("UPDATE plan_prices SET price_tiyin=1500000 WHERE plan_code='PRO' AND period='MONTH'");
        try {
            buy(user, "PRO", "MONTH", 3_000_000, UUID.randomUUID().toString())
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("price_changed"))
                    .andExpect(jsonPath("$.currentPriceTiyin").value(1_500_000));
            assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(5_000_000);
        } finally {
            jdbc.update("UPDATE plan_prices SET price_tiyin=3000000 WHERE plan_code='PRO' AND period='MONTH'");
        }
    }

    @Test
    void retryingTheSameKeyChargesOnce() throws Exception {
        UUID user = fundedUser(5_000_000);
        String key = UUID.randomUUID().toString();

        buy(user, "PRO", "MONTH", 3_000_000, key).andExpect(status().isOk());
        buy(user, "PRO", "MONTH", 3_000_000, key).andExpect(status().isOk());

        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(2_000_000);
    }

    @Test
    void theFreePlanIsNotForSale() throws Exception {
        UUID user = fundedUser(5_000_000);
        buy(user, "STANDARD", "MONTH", 1, UUID.randomUUID().toString())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("plan_not_purchasable"));
    }

    @Test
    void twoConcurrentRequestsWithTheSameKeyChargeOnceAndBothSucceed() throws Exception {
        UUID user = fundedUser(5_000_000);
        String key = UUID.randomUUID().toString();
        var pool = Executors.newFixedThreadPool(2);
        var start = new CountDownLatch(1);
        Callable<Object> attempt = () -> {
            start.await();
            try {
                return purchases.purchase(user, null, new PurchasePlanRequest(
                        "PRO", PlanPeriod.MONTH, 3_000_000L, key));
            } catch (RuntimeException e) {
                return e;
            }
        };
        var a = pool.submit(attempt);
        var b = pool.submit(attempt);
        start.countDown();
        Object ra = a.get(30, TimeUnit.SECONDS);
        Object rb = b.get(30, TimeUnit.SECONDS);
        pool.shutdown();

        assertThat(ra).isNotInstanceOf(Exception.class);
        assertThat(rb).isNotInstanceOf(Exception.class);
        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(2_000_000);
        var rows = purchaseRows.findAll().stream().filter(p -> key.equals(p.getIdempotencyKey())).toList();
        assertThat(rows).hasSize(1);
        assertThat(plans.expiryFor(user)).isCloseTo(rows.get(0).getExpiresAt(),
                org.assertj.core.api.Assertions.within(1, java.time.temporal.ChronoUnit.MILLIS));
    }

    @Test
    void anAnonymousPurchaseIsRejected() throws Exception {
        var req = new PurchasePlanRequest("PRO", PlanPeriod.MONTH, 3_000_000L, UUID.randomUUID().toString());
        mvc.perform(post("/api/v1/payments/plans/purchase")
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(req)))
                .andExpect(status().is4xxClientError())
                .andExpect(result -> assertThat(result.getResponse().getStatus()).isIn(401, 403));
    }

    @Test
    void twoConcurrentPurchasesSerialise() throws Exception {
        UUID user = fundedUser(6_000_000);
        var pool = Executors.newFixedThreadPool(2);
        var start = new CountDownLatch(1);
        Callable<Object> attempt = () -> {
            start.await();
            try {
                return purchases.purchase(user, null, new PurchasePlanRequest(
                        "PRO", PlanPeriod.MONTH, 3_000_000L, UUID.randomUUID().toString()));
            } catch (RuntimeException e) {
                return e;
            }
        };
        var a = pool.submit(attempt);
        var b = pool.submit(attempt);
        start.countDown();
        a.get(30, TimeUnit.SECONDS);
        b.get(30, TimeUnit.SECONDS);
        pool.shutdown();

        // Both succeed one after the other: the second extends the first.
        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isZero();
        var rows = purchaseRows.findAll().stream().filter(p -> p.getUserId().equals(user)).toList();
        assertThat(rows).hasSize(2);
        assertThat(rows).extracting(p -> p.getStartsAt()).doesNotHaveDuplicates();
    }

    @Test
    void legacyPriceRowsNeverMakeRetiredProductsPurchasable() throws Exception {
        UUID user = fundedUser(100_000_000);
        for (String sku : new String[]{"PRO:YEAR:10000000", "MAX:MONTH:3000000", "MAX:YEAR:25000000"}) {
            String[] parts = sku.split(":");
            buy(user, parts[0], parts[1], Long.parseLong(parts[2]), UUID.randomUUID().toString())
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("plan_not_purchasable"));
        }
        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(100_000_000);
        assertThat(plans.planFor(user)).isEqualTo("STANDARD");
        assertThat(purchaseRows.findAll()).noneMatch(row -> row.getUserId().equals(user));
    }

    @Test
    void renewingProExtendsTheCurrentTermWithoutDiscardingRemainingDays() throws Exception {
        UUID user = fundedUser(6_000_000);
        buy(user, "PRO", "MONTH", 3_000_000, UUID.randomUUID().toString()).andExpect(status().isOk());
        var firstExpiry = plans.expiryFor(user);
        buy(user, "PRO", "MONTH", 3_000_000, UUID.randomUUID().toString()).andExpect(status().isOk());
        assertThat(plans.expiryFor(user)).isEqualTo(firstExpiry.atZone(java.time.ZoneOffset.UTC)
                .plusMonths(1).toInstant());
        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isZero();
        assertThat(purchaseRows.findAll().stream().filter(p -> p.getUserId().equals(user)))
                .hasSize(2);
    }

    @Test
    void anotherUsersPurchaseKeyCannotGrantAFreeSubscription() throws Exception {
        UUID first = fundedUser(3_000_000);
        UUID second = fundedUser(3_000_000);
        String key = UUID.randomUUID().toString();
        buy(first, "PRO", "MONTH", 3_000_000, key).andExpect(status().isOk());
        buy(second, "PRO", "MONTH", 3_000_000, key).andExpect(status().isConflict());
        assertThat(ledger.balanceOf(second).getAvailableTiyin()).isEqualTo(3_000_000);
        assertThat(plans.planFor(second)).isEqualTo("STANDARD");
        assertThat(purchaseRows.findByIdempotencyKey(key)).get()
                .extracting(row -> row.getUserId()).isEqualTo(first);
    }

    @Test
    void anExistingLegacyPurchaseCanBeReplayedWithoutChargingAgain() throws Exception {
        UUID user = fundedUser(3_000_000);
        String key = UUID.randomUUID().toString();
        var expiry = java.time.Instant.now().plus(java.time.Duration.ofDays(20));
        plans.assign(user, "MAX", expiry, "PURCHASE");
        jdbc.update("INSERT INTO plan_purchases "
                + "(id,user_id,plan_code,period,price_tiyin,starts_at,expires_at,ledger_tx_id,idempotency_key) "
                + "VALUES (?,?,'MAX','YEAR',25000000,now(),?, ?,?)",
                UUID.randomUUID(), user, java.sql.Timestamp.from(expiry), UUID.randomUUID(), key);
        buy(user, "MAX", "YEAR", 25_000_000, key)
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value("MAX"));
        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(3_000_000);
    }
    @Test
    void concurrentRenewalsRefreshAnExistingSubscriptionLoadedBeforeTheLock() throws Exception {
        UUID user = fundedUser(6_000_000);
        plans.assign(user, "PRO", java.time.Instant.now().plus(java.time.Duration.ofDays(20)), "PURCHASE");
        var originalExpiry = plans.expiryFor(user);
        var bothReadOriginalPlan = new CyclicBarrier(2);
        var pool = Executors.newFixedThreadPool(2);
        Callable<Object> renew = () -> transactions.execute(status -> {
            // Each transaction has the old entity managed before either renewal
            // obtains its lock. A locking query alone does not refresh that entity.
            assertThat(plans.planFor(user)).isEqualTo("PRO");
            try {
                bothReadOriginalPlan.await(15, TimeUnit.SECONDS);
            } catch (Exception e) {
                throw new IllegalStateException("Both renewals must read the initial plan", e);
            }
            return purchases.purchase(user, null, new PurchasePlanRequest(
                    "PRO", PlanPeriod.MONTH, 3_000_000L, UUID.randomUUID().toString()));
        });
        try {
            var first = pool.submit(renew);
            var second = pool.submit(renew);
            first.get(30, TimeUnit.SECONDS);
            second.get(30, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }
        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isZero();
        assertThat(plans.expiryFor(user)).isEqualTo(originalExpiry.atZone(java.time.ZoneOffset.UTC)
                .plusMonths(2).toInstant());
        var rows = purchaseRows.findAll().stream().filter(p -> p.getUserId().equals(user)).toList();
        assertThat(rows).hasSize(2);
        assertThat(rows).extracting(p -> p.getStartsAt()).containsExactlyInAnyOrder(originalExpiry,
                originalExpiry.atZone(java.time.ZoneOffset.UTC).plusMonths(1).toInstant());
    }

}
