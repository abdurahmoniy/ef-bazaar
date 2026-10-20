package uz.efbazaar.trade.plan;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.trade.plan.kafka.PlanEvents;
import uz.efbazaar.trade.plan.kafka.PlanProjectionConsumer;
import uz.efbazaar.trade.plan.service.EntitlementService;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class PlanProjectionReliabilityIT extends AbstractIntegrationIT {
    @Autowired ObjectMapper mapper;
    @Autowired PlanProjectionConsumer consumer;
    @Autowired EntitlementService entitlements;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactions;
    @Autowired uz.efbazaar.trade.plan.repository.PlanEntitlementViewRepository rows;
    @Autowired uz.efbazaar.trade.plan.service.PlanProjection projection;

    private void plan(String code, String values, long version, Instant at) throws Exception {
        consumer.onPlanEntitlements(mapper.readValue("""
            {"planCode":"%s","entitlements":%s,"version":%d,"idempotencyKey":"p-%s-%d","occurredAt":"%s"}
            """.formatted(code, values, version, code, version, at), PlanEvents.PlanEntitlementsSnapshot.class));
    }
    private void subscription(UUID user, String code, long version, Instant at) throws Exception {
        consumer.onSubscriptionChanged(mapper.readValue("""
            {"userId":"%s","planCode":"%s","version":%d,"idempotencyKey":"s-%s-%d","occurredAt":"%s"}
            """.formatted(user, code, version, user, version, at), PlanEvents.SubscriptionChanged.class));
    }
    @Test void missingOrMalformedEntitlementNeverMeansUnlimited() throws Exception {
        UUID user = UUID.randomUUID();
        assertThat(entitlements.limit(user, "unknown.paid")).hasValue(0);
        String code = "TEST_INVALID";
        plan(code, "{\"mailbox.slots\":\"invalid\"}", 1, Instant.now());
        subscription(user, code, 1, Instant.now());
        assertThat(entitlements.limit(user, "mailbox.slots")).hasValue(0);
    }
    @Test void downgradeSurvivesDuplicateOutOfOrderAndLegacyEvents() throws Exception {
        UUID user = UUID.randomUUID();
        subscription(user, "PRO", 1, Instant.now());
        subscription(user, "STANDARD", 2, Instant.now());
        subscription(user, "PRO", 1, Instant.now());
        subscription(user, "PRO", 0, Instant.now());
        assertThat(entitlements.planFor(user)).isEqualTo("STANDARD");
    }
    @Test void stalePaidSnapshotCannotGrantUnlimited() throws Exception {
        UUID user = UUID.randomUUID();
        plan("TEST_STALE", "{\"paid.feature\":null}", 1, Instant.now().minusSeconds(90000));
        subscription(user, "TEST_STALE", 1, Instant.now());
        assertThat(entitlements.limit(user, "paid.feature")).hasValue(0);
    }
    @Test void planReplayCannotResurrectRemovedCapabilities() throws Exception {
        UUID user = UUID.randomUUID();
        String code = "TEST_ORDER";
        plan(code, "{\"paid.feature\":null}", 1, Instant.now());
        plan(code, "{}", 2, Instant.now());
        plan(code, "{\"paid.feature\":null}", 1, Instant.now());
        subscription(user, code, 1, Instant.now());
        assertThat(entitlements.limit(user, "paid.feature")).hasValue(0);
    }
    @Test void capabilityAndFreshnessUseOneDatabaseSnapshotEvenInsideOuterTransaction() throws Exception {
        UUID user = UUID.randomUUID();
        String code = "TEST_RACE";
        plan(code, "{\"paid.feature\":null}", 1, Instant.now().minusSeconds(90000));
        subscription(user, code, 1, Instant.now());
        new org.springframework.transaction.support.TransactionTemplate(transactions).executeWithoutResult(status -> {
            // Prime the outer JPA persistence context with the old unlimited grant.
            assertThat(rows.findByIdPlanCodeAndIdKey(code, "paid.feature").orElseThrow().getValue()).isNull();
            var update = new org.springframework.transaction.support.TransactionTemplate(transactions);
            update.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            update.executeWithoutResult(inner -> projection.replacePlan(code, java.util.Map.of("paid.feature", "0"),
                    2, "race-plan-2", Instant.now()));
            assertThat(entitlements.limit(user, "paid.feature")).hasValue(0);
        });
    }

    @Test void onlyFreshSubscriptionsCanUseExplicitUnlimitedGrants() throws Exception {
        UUID user = UUID.randomUUID();
        plan("TEST_STAFF", "{\"paid.feature\":null}", 1, Instant.now());
        subscription(user, "TEST_STAFF", 1, Instant.now().minusSeconds(90000));
        assertThat(entitlements.limit(user, "paid.feature")).hasValue(0);
        subscription(user, "TEST_STAFF", 2, Instant.now());
        assertThat(entitlements.limit(user, "paid.feature")).isEmpty();
    }
    @Test void negativeLimitCannotPermitAllocationOrBreakLockCalculation() throws Exception {
        UUID user = UUID.randomUUID();
        plan("TEST_NEGATIVE", "{\"mailbox.custom_slots\":\"-1\"}", 1, Instant.now());
        subscription(user, "TEST_NEGATIVE", 1, Instant.now());
        assertThat(entitlements.limit(user, "mailbox.custom_slots")).hasValue(0);
    }

    @Test void additiveWatchPolicyKeepsTheMailboxBudgetAndBooleanTypesDistinct() throws Exception {
        UUID user = UUID.randomUUID();
        String code = "TEST_D_WATCH_WIRE";
        plan(code, "{\"mailbox.total_slots\":\"10\",\"mailbox.custom_slots\":\"2\","
                + "\"watch.search_limit\":\"5\",\"watch.price_limit\":\"20\",\"watch.immediate\":\"true\"}",
                1, Instant.now());
        subscription(user, code, 1, Instant.now());
        assertThat(entitlements.limit(user, "mailbox.total_slots")).hasValue(10);
        assertThat(entitlements.limit(user, "mailbox.custom_slots")).hasValue(2);
        assertThat(rows.findByIdPlanCodeAndIdKey(code, "watch.immediate").orElseThrow().getValue()).isEqualTo("true");
        assertThat(entitlements.limit(user, "watch.immediate")).as("a boolean must not become an unlimited numeric budget").hasValue(0);
    }

}
