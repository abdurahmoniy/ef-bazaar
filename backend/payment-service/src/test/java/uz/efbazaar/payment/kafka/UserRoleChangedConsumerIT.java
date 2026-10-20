package uz.efbazaar.payment.kafka;

import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.ByteArraySerializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.listener.MessageListenerContainer;
import org.springframework.kafka.test.utils.ContainerTestUtils;
import uz.efbazaar.payment.plan.service.PlanEventPublisher;
import uz.efbazaar.payment.plan.service.PlanService;
import uz.efbazaar.payment.testsupport.AbstractIntegrationIT;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;

/**
 * ADMIN gets the unlimited STAFF plan from auth-service's role event, and loses
 * it again only if the role was what gave it.
 */
@SpringBootTest(properties = "payment.kafka.user-role-changed-group=" + UserRoleChangedConsumerIT.GROUP)
class UserRoleChangedConsumerIT extends AbstractIntegrationIT {

    private static final String TOPIC = "efbazaar.auth.user-role-changed";
    static final String GROUP = "payment-service-user-role-changed-it";

    @Autowired PlanService plans;
    @Autowired JdbcTemplate jdbc;
    @Autowired KafkaListenerEndpointRegistry listeners;
    @Autowired UserRoleChangedConsumer consumer;
    @SpyBean PlanEventPublisher events;

    /**
     * Only this listener, and only in its own consumer group. Every cached
     * Spring context in the suite runs the same listeners in the same default
     * groups on one single-partition topic, so a context that waited for all of
     * them would be handed no partitions and hang. A group of its own makes
     * this context the sole owner of the partition.
     */
    private void waitForOwnPartition() {
        for (MessageListenerContainer c : listeners.getListenerContainers()) {
            if (GROUP.equals(c.getGroupId())) {
                ContainerTestUtils.waitForAssignment(c, 1);
            }
        }
    }

    private static UserRoleChangedDto change(UUID user, String from, String to) {
        return new UserRoleChangedDto(user, from, to, Instant.now());
    }

    @Test
    void becomingAdminPutsTheUserOnStaffAndAnnouncesIt() {
        UUID user = UUID.randomUUID();

        consumer.onRoleChanged(change(user, "USER", "ADMIN"));

        assertThat(plans.planFor(user)).isEqualTo("STAFF");
        assertThat(plans.expiryFor(user)).isNull();
        var staff = new java.util.HashMap<>(plans.entitlementsOf("STAFF"));
        assertThat(staff.remove("watch.immediate")).isEqualTo("true");
        assertThat(staff.remove("analytics.export")).isEqualTo("true");
        assertThat(staff.remove("seller.tools")).isEqualTo("true");
        assertThat(staff.remove("seller.bulk")).isEqualTo("true");
        assertThat(staff.remove("profile.decoration")).isEqualTo("true");
        assertThat(staff.values()).isNotEmpty().containsOnlyNulls();
        verify(events).subscriptionChanged(eq(user), eq("STAFF"), eq(null), eq(null));
        assertThat(jdbc.queryForObject("SELECT source FROM user_subscriptions WHERE user_id=?",
                String.class, user)).isEqualTo("ROLE");
    }

    @Test
    void aReplayLandsOnTheSameState() {
        UUID user = UUID.randomUUID();
        consumer.onRoleChanged(change(user, "USER", "ADMIN"));
        consumer.onRoleChanged(change(user, "USER", "ADMIN"));

        assertThat(plans.planFor(user)).isEqualTo("STAFF");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_subscriptions WHERE user_id=?",
                Integer.class, user)).isEqualTo(1);
    }

    @Test
    void losingAdminReturnsARoleGrantedStaffToStandard() {
        UUID user = UUID.randomUUID();
        consumer.onRoleChanged(change(user, "USER", "ADMIN"));

        consumer.onRoleChanged(change(user, "ADMIN", "USER"));

        assertThat(plans.planFor(user)).isEqualTo("STANDARD");
        verify(events).subscriptionChanged(eq(user), eq("STANDARD"), eq(null), eq(null));
    }

    @Test
    void losingAdminLeavesAnAdminGrantedPlanAlone() {
        UUID user = UUID.randomUUID();
        plans.assign(user, "MAX", null, "ADMIN");

        consumer.onRoleChanged(change(user, "ADMIN", "USER"));

        assertThat(plans.planFor(user)).isEqualTo("MAX");
    }

    @Test
    void losingAdminLeavesAPurchasedPlanAlone() {
        UUID user = UUID.randomUUID();
        plans.assign(user, "PRO", Instant.now().plus(10, ChronoUnit.DAYS), "PURCHASE");

        consumer.onRoleChanged(change(user, "ADMIN", "USER"));

        assertThat(plans.planFor(user)).isEqualTo("PRO");
    }

    @Test
    void otherRoleChangesAreIgnored() {
        UUID user = UUID.randomUUID();
        consumer.onRoleChanged(change(user, "USER", "TRADE_ADMIN"));
        consumer.onRoleChanged(change(user, "USER", "PARTNER"));

        assertThat(plans.planFor(user)).isEqualTo("STANDARD");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_subscriptions WHERE user_id=?",
                Integer.class, user)).isZero();
    }

    @Test
    void aRecordWithNoUserIdIsSkipped() {
        consumer.onRoleChanged(new UserRoleChangedDto(null, "USER", "ADMIN", Instant.now()));
        consumer.onRoleChanged(null);
    }

    /**
     * auth-service stamps its own class into {@code __TypeId__}. Without
     * {@code spring.json.use.type.headers=false} the deserialiser tries to load
     * that class, fails inside poll() and re-polls the record for ever. The
     * garbage record before it proves the listener also survives bytes it
     * cannot read.
     */
    @Test
    void aRecordCarryingAuthsTypeHeaderIsUnderstoodAndGarbageDoesNotStallTheListener() {
        waitForOwnPartition();
        UUID user = UUID.randomUUID();
        publishRaw("{ not json".getBytes(StandardCharsets.UTF_8), null);
        String body = "{\"userId\":\"" + user + "\",\"oldRole\":\"USER\",\"newRole\":\"ADMIN\","
                + "\"occurredAt\":\"" + Instant.now() + "\"}";
        publishRaw(body.getBytes(StandardCharsets.UTF_8), "uz.efbazaar.auth.event.UserRoleChangedEvent");

        await().atMost(Duration.ofSeconds(30))
                .untilAsserted(() -> assertThat(plans.planFor(user)).isEqualTo("STAFF"));
    }

    private void publishRaw(byte[] payload, String typeId) {
        Map<String, Object> props = new HashMap<>();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers());
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, ByteArraySerializer.class);
        try (var producer = new KafkaProducer<String, byte[]>(props)) {
            var rec = new ProducerRecord<String, byte[]>(TOPIC, payload);
            if (typeId != null) {
                rec.headers().add("__TypeId__", typeId.getBytes(StandardCharsets.UTF_8));
            }
            producer.send(rec);
            producer.flush();
        }
    }
}
