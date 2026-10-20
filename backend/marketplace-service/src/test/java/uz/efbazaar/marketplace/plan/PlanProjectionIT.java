package uz.efbazaar.marketplace.plan;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.JdbcTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;

@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
// Dispose the Spring context while its class-owned database is still running.
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
@Import({PlanProjection.class, PlanCapabilities.class})
class PlanProjectionIT {
    @Container @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    @Autowired PlanProjection projection;
    @Autowired PlanCapabilities capabilities;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    private void plan(long version, Map<String,String> grants, Instant at) {
        projection.replacePlan("PRO", grants, version, "plan-" + version, at);
    }
    private void user(UUID id, String plan, long version, Instant at) {
        projection.userMoved(id, plan, null, version, "user-" + id + "-" + version, at);
    }
    @Test void identicalUserReplayRefreshesFreshnessDeadlineWithoutMovingEffectiveTime() {
        UUID id=UUID.randomUUID();Instant old=Instant.now().minusSeconds(3600).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        plan(1,Map.of("watch.price_limit","3"),old);user(id,"PRO",1,old);
        var before=projection.readCapabilities(id);Instant replay=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        plan(2,Map.of("watch.price_limit","3"),replay);user(id,"PRO",2,replay);
        var after=projection.readCapabilities(id);
        assertThat(after.sourceTime()).as("identical user snapshots are readiness heartbeats, not a new grant").isEqualTo(old);
        assertThat(after.subscriptionFresh()).isTrue();assertThat(after.planFresh()).isTrue();
        assertThat(after.validUntil()).as("public appearance deadline must still follow fresh projection state").isAfter(before.validUntil());
        assertThat(after.validUntil()).isEqualTo(replay.plusSeconds(86400));
    }
    @Test void catalogReplayPreservesPerKeyEffectiveTimesAndCompleteSnapshotRemoval() {
        Instant old=Instant.now().minusSeconds(3600).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        plan(1,Map.of("watch.price_limit","3","profile.decoration","true"),old);
        Instant replay=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        plan(2,Map.of("watch.price_limit","3","profile.decoration","true"),replay);
        assertThat(jdbc.queryForObject("SELECT updated_at FROM plan_entitlement_view WHERE plan_code='PRO' AND key='watch.price_limit'",java.sql.Timestamp.class).toInstant()).as("identical catalog replay cannot move an unchanged budget's effective time").isEqualTo(old);
        Instant changed=replay.plusSeconds(1);
        plan(3,Map.of("watch.price_limit","4","profile.decoration","true"),changed);
        assertThat(jdbc.queryForObject("SELECT updated_at FROM plan_entitlement_view WHERE plan_code='PRO' AND key='watch.price_limit'",java.sql.Timestamp.class).toInstant()).isEqualTo(changed);
        assertThat(jdbc.queryForObject("SELECT updated_at FROM plan_entitlement_view WHERE plan_code='PRO' AND key='profile.decoration'",java.sql.Timestamp.class).toInstant()).isEqualTo(old);
        plan(4,Map.of("watch.price_limit","4"),changed.plusSeconds(1));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM plan_entitlement_view WHERE plan_code='PRO' AND key='profile.decoration'",Long.class)).isZero();
    }
    @Test void missingAndStaleStateAreUnavailableRatherThanUnlimited() {
        UUID id = UUID.randomUUID();
        assertThat(capabilities.capability(id, "watch.limit").status()).isEqualTo(PlanCapabilities.Status.UNAVAILABLE);
        plan(1, Map.of("watch.limit", "3"), Instant.now().minusSeconds(90000));
        user(id, "PRO", 1, Instant.now());
        assertThat(capabilities.capability(id, "watch.limit").status()).isEqualTo(PlanCapabilities.Status.UNAVAILABLE);
        plan(2, Map.of("watch.limit", "3"), Instant.now());
        assertThat(capabilities.capability(id, "watch.limit").value()).isEqualTo("3");
        user(id, "PRO", 2, Instant.now().minusSeconds(90000));
        assertThat(capabilities.capability(id, "watch.limit").status()).isEqualTo(PlanCapabilities.Status.UNAVAILABLE);
    }
    @Test void duplicateOlderAndLegacySnapshotsCannotRestoreRemovedGrant() {
        UUID id = UUID.randomUUID();
        plan(1, Map.of("watch.limit", "3"), Instant.now());
        user(id, "PRO", 1, Instant.now());
        plan(2, Map.of(), Instant.now());
        plan(1, Map.of("watch.limit", "3"), Instant.now());
        plan(0, Map.of("watch.limit", "3"), Instant.now());
        assertThat(capabilities.capability(id, "watch.limit").status()).isEqualTo(PlanCapabilities.Status.DENIED);
    }
    @Test void downgradeIsATombstoneAndExplicitFreshNullIsUnlimited() {
        UUID id = UUID.randomUUID();
        Map<String,String> grants = new HashMap<>(); grants.put("watch.limit", null);
        plan(1, grants, Instant.now());
        user(id, "PRO", 1, Instant.now());
        assertThat(capabilities.capability(id, "watch.limit").unlimited()).isTrue();
        projection.replacePlan("STANDARD", Map.of(), 1, "free-1", Instant.now());
        user(id, "STANDARD", 2, Instant.now());
        user(id, "PRO", 1, Instant.now());
        user(id, "PRO", 0, Instant.now());
        assertThat(capabilities.capability(id, "watch.limit").status()).isEqualTo(PlanCapabilities.Status.DENIED);
        assertThat(capabilities.capability(id, "watch.limit").unlimited()).isFalse();
    }
    @Test void wireCompatibilityIgnoresLegacyAndAcceptsVersionedSnapshots() throws Exception {
        var mapper = com.fasterxml.jackson.databind.json.JsonMapper.builder()
                .addModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule())
                .disable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();
        var consumer = new PlanProjectionConsumer(mapper, projection);
        UUID id = UUID.randomUUID();
        consumer.onSubscriptionChanged("{\"userId\":\"" + id + "\",\"planCode\":\"PRO\"}");
        assertThat(capabilities.capability(id, "mailbox.total_slots").status()).isEqualTo(PlanCapabilities.Status.UNAVAILABLE);
        Instant now = Instant.now();
        consumer.onSubscriptionChanged(mapper.writeValueAsString(new PlanEvents.SubscriptionChanged(id, "PRO", null, now, 1, "wire-user-"+id)));
        consumer.onPlanEntitlements(mapper.writeValueAsString(new PlanEvents.PlanEntitlementsSnapshot("PRO", Map.of("mailbox.total_slots","10", "mailbox.slots","5", "mailbox.custom_slots","2"), now, 1, "wire-plan")));
        assertThat(capabilities.capability(id, "mailbox.total_slots").value()).isEqualTo("10");
        assertThat(capabilities.capability(id, "mailbox.custom_slots").value()).isEqualTo("2");
        assertThat(capabilities.capability(id, "mailbox.slots").value()).isEqualTo("5");
        consumer.onPlanEntitlements("{\"planCode\":\"PRO\",\"entitlements\":{\"mailbox.total_slots\":null}}");
        assertThat(capabilities.capability(id, "mailbox.total_slots").value()).isEqualTo("10");
    }
    @Test void repeatedIdempotencyKeyCannotChangeStateEvenWithHigherVersion() {
        UUID id = UUID.randomUUID();
        plan(1, Map.of("watch.limit", "3"), Instant.now());
        user(id, "PRO", 1, Instant.now());
        projection.replacePlan("PRO", Map.of(), 2, "plan-1", Instant.now());
        assertThat(capabilities.capability(id, "watch.limit").value()).isEqualTo("3");
    }
    @Test
    @org.springframework.transaction.annotation.Transactional(propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    void concurrentSnapshotsKeepOnlyHighestVersion() throws Exception {
        String code = "CONCURRENT";
        UUID id = UUID.randomUUID();
        user(id, code, 1, Instant.now());
        try (var pool = java.util.concurrent.Executors.newFixedThreadPool(4)) {
            var go = new java.util.concurrent.CountDownLatch(1);
            var futures = new java.util.ArrayList<java.util.concurrent.Future<?>>();
            for (long v = 1; v <= 12; v++) {
                long version = v;
                futures.add(pool.submit(() -> {
                    go.await();
                    projection.replacePlan(code, Map.of("watch.limit", Long.toString(version)), version,
                            "parallel-" + version, Instant.now());
                    return null;
                }));
            }
            go.countDown();
            for (var future : futures) future.get(15, java.util.concurrent.TimeUnit.SECONDS);
        }
        assertThat(capabilities.capability(id, "watch.limit").value()).isEqualTo("12");
    }

}
