package uz.efbazaar.payment.plan;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.payment.plan.service.PlanService;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;
import java.time.Instant;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = "outbox.relay.send-timeout=100ms")
class PlanOutboxIT extends AbstractPostgresIT {
    @Autowired PlanService plans;
    @Autowired JdbcTemplate jdbc;
    @Autowired TransactionTemplate tx;

    private void requireDurableQueue() {
        assertThat(jdbc.queryForObject("SELECT to_regclass('outbox_events')::text", String.class))
                .as("plan events need a durable queue in the payment transaction").isEqualTo("outbox_events");
    }

    @Test
    void brokerOutageKeepsSubscriptionAndEventTogether() {
        requireDurableQueue();
        UUID user = UUID.randomUUID();
        plans.assign(user, "PRO", Instant.now().plusSeconds(3600), "ADMIN");
        assertThat(plans.planFor(user)).isEqualTo("PRO");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE message_key=? AND published_at IS NULL",
                Long.class, user.toString())).isEqualTo(1L);
        assertThat(jdbc.queryForObject("SELECT convert_from(payload, 'UTF8')::jsonb->>'planCode' FROM outbox_events WHERE message_key=?",
                String.class, user.toString())).isEqualTo("PRO");
    }

    @Test
    void rollbackKeepsNeitherSubscriptionNorEvent() {
        requireDurableQueue();
        UUID user = UUID.randomUUID();
        tx.executeWithoutResult(status -> {
            plans.assign(user, "PRO", null, "ADMIN");
            status.setRollbackOnly();
        });
        assertThat(plans.planFor(user)).isEqualTo("STANDARD");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE message_key=?", Long.class,
                user.toString())).isZero();
    }

    @Test
    void startupReplayIncludesSubscriptionsAndMonotonicVersions() {
        requireDurableQueue();
        UUID user = UUID.randomUUID();
        plans.assign(user, "PRO", null, "ADMIN");
        plans.publishAllEntitlements();
        var versions = jdbc.queryForList("SELECT (convert_from(payload, 'UTF8')::jsonb->>'version')::bigint "
                + "FROM outbox_events WHERE message_key=? ORDER BY id", Long.class, user.toString());
        assertThat(versions).hasSize(2);
        assertThat(versions.get(0)).isPositive();
        assertThat(versions.get(1)).isGreaterThan(versions.get(0));
    }
}
