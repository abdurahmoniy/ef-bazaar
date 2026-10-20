package uz.efbazaar.payment.plan;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.payment.plan.service.PlanEventPublisher;
import uz.efbazaar.payment.plan.repository.UserSubscriptionRepository;
import uz.efbazaar.payment.plan.service.PlanService;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Plans, and what being on one gets you.
 *
 * <p>Run against the real migrations, so the values asserted here are the ones
 * the repeatable migration actually loads — a test that seeds its own would
 * pass while the shipped numbers were wrong.
 */
@SpringBootTest
class PlanServiceIT extends AbstractPostgresIT {

    @Autowired PlanService plans;
    @Autowired UserSubscriptionRepository subscriptions;
    @Autowired TransactionTemplate tx;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    @SpyBean PlanEventPublisher events;

    @Test
    void anAssignThatRollsBackAnnouncesNothing() {
        UUID user = UUID.randomUUID();
        tx.executeWithoutResult(st -> {
            plans.assign(user, "PRO", Instant.now().plus(30, ChronoUnit.DAYS), "ADMIN");
            st.setRollbackOnly();
        });
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE message_key=?",
                Long.class, user.toString())).isZero();
    }

    @Test
    void anAssignThatCommitsAnnouncesOnce() {
        UUID user = UUID.randomUUID();
        Instant paidEnd = Instant.now().plus(30, ChronoUnit.DAYS);
        tx.executeWithoutResult(st -> plans.assign(user, "PRO", paidEnd, "ADMIN"));
        org.mockito.Mockito.verify(events, org.mockito.Mockito.times(1))
                .subscriptionChanged(org.mockito.ArgumentMatchers.eq(user),
                        org.mockito.ArgumentMatchers.eq("PRO"), org.mockito.ArgumentMatchers.eq(paidEnd),
                        org.mockito.ArgumentMatchers.eq(paidEnd));
    }

    @Test
    void everyoneStartsOnTheFreePlanWithoutARowToSaySo() {
        // The absence of a decision, not a decision. It is what spares every
        // existing and future user a backfill.
        assertThat(plans.planFor(UUID.randomUUID())).isEqualTo("STANDARD");
    }

    @Test
    void theShippedPlansGrantWhatTheyAdvertise() {
        assertThat(plans.entitlementsOf("STANDARD"))
                .containsEntry("mailbox.total_slots", "3").containsEntry("mailbox.slots", "3").containsEntry("mailbox.custom_slots", "0");
        assertThat(plans.entitlementsOf("PRO"))
                .containsEntry("mailbox.total_slots", "10").containsEntry("mailbox.slots", "5").containsEntry("mailbox.custom_slots", "2");
        assertThat(plans.entitlementsOf("MAX"))
                .containsEntry("mailbox.total_slots", "13").containsEntry("mailbox.slots", "10").containsEntry("mailbox.custom_slots", "3");
    }

    @Test
    void assigningMovesTheUserAndSaysWhen() {
        UUID user = UUID.randomUUID();
        Instant until = Instant.now().plus(30, ChronoUnit.DAYS);

        plans.assign(user, "PRO", until, "ADMIN");

        assertThat(plans.planFor(user)).isEqualTo("PRO");
        assertThat(plans.expiryFor(user)).isCloseTo(until, org.assertj.core.api.Assertions.within(1, ChronoUnit.SECONDS));
    }

    @Test
    void anExpiredSubscriptionStopsGranting() {
        // Otherwise expires_at is decorative: the row would keep paying out
        // long after whatever bought it ran out.
        UUID user = UUID.randomUUID();
        plans.assign(user, "MAX", Instant.now().minusSeconds(60), "ADMIN");

        assertThat(plans.planFor(user)).isEqualTo("STANDARD");
        assertThat(subscriptions.findById(user))
                .as("the row stays — it is the record of what they had")
                .isPresent();
    }

    @Test
    void assigningTheSamePlanAgainIsHarmless() {
        // A retried purchase or a replayed admin action must not be an error.
        UUID user = UUID.randomUUID();
        plans.assign(user, "PRO", null, "ADMIN");
        plans.assign(user, "PRO", null, "ADMIN");

        assertThat(plans.planFor(user)).isEqualTo("PRO");
    }

    @Test
    void anUnknownPlanIsRefused() {
        assertThatThrownBy(() -> plans.assign(UUID.randomUUID(), "PLATINUM", null, "ADMIN"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
