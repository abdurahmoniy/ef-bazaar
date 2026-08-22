package uz.efbazaar.payment.plan;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
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

    @Test
    void everyoneStartsOnTheFreePlanWithoutARowToSaySo() {
        // The absence of a decision, not a decision. It is what spares every
        // existing and future user a backfill.
        assertThat(plans.planFor(UUID.randomUUID())).isEqualTo("STANDARD");
    }

    @Test
    void theShippedPlansGrantWhatTheyAdvertise() {
        assertThat(plans.entitlementsOf("STANDARD")).containsEntry("mailbox.slots", "3");
        assertThat(plans.entitlementsOf("PRO")).containsEntry("mailbox.slots", "10");
    }

    @Test
    void unlimitedIsAKeyWithNoValue() {
        Map<String, String> max = plans.entitlementsOf("MAX");

        assertThat(max)
                .as("the key is granted, which is what tells a reader the plan has this at all")
                .containsKey("mailbox.slots");
        assertThat(max.get("mailbox.slots"))
                .as("null, not -1: a sentinel is read as zero by every comparison that forgets it")
                .isNull();
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
