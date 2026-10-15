package uz.efbazaar.payment.plan;

import org.junit.jupiter.api.Test;
import uz.efbazaar.payment.plan.domain.PlanPeriod;
import uz.efbazaar.payment.plan.exception.PlanPurchaseException;
import uz.efbazaar.payment.plan.service.PlanTerm;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PlanTermTest {

    static final Instant NOW = Instant.parse("2026-01-31T10:00:00Z");
    static final PlanTerm.Current FREE = new PlanTerm.Current("STANDARD", 1, null);

    @Test
    void aFirstPurchaseStartsNow() {
        var w = PlanTerm.next(FREE, "PRO", 2, PlanPeriod.MONTH, NOW);
        assertThat(w.startsAt()).isEqualTo(NOW);
        // Jan 31 + 1 month = Feb 28 (java.time clamps to the month's last day).
        assertThat(w.expiresAt()).isEqualTo(Instant.parse("2026-02-28T10:00:00Z"));
    }

    @Test
    void theSamePlanExtendsFromWhereItEnds() {
        var cur = new PlanTerm.Current("PRO", 2, Instant.parse("2026-03-10T00:00:00Z"));
        var w = PlanTerm.next(cur, "PRO", 2, PlanPeriod.YEAR, NOW);
        assertThat(w.startsAt()).isEqualTo(Instant.parse("2026-03-10T00:00:00Z"));
        assertThat(w.expiresAt()).isEqualTo(Instant.parse("2027-03-10T00:00:00Z"));
    }

    @Test
    void aHigherPlanStartsTodayAtFullLength() {
        var cur = new PlanTerm.Current("PRO", 2, Instant.parse("2026-03-10T00:00:00Z"));
        var w = PlanTerm.next(cur, "MAX", 3, PlanPeriod.MONTH, NOW);
        assertThat(w.startsAt()).isEqualTo(NOW);
        assertThat(w.expiresAt()).isEqualTo(Instant.parse("2026-02-28T10:00:00Z"));
    }

    @Test
    void aLowerPlanOverALiveHigherOneIsRefused() {
        var cur = new PlanTerm.Current("MAX", 3, Instant.parse("2026-03-10T00:00:00Z"));
        assertThatThrownBy(() -> PlanTerm.next(cur, "PRO", 2, PlanPeriod.MONTH, NOW))
                .isInstanceOfSatisfying(PlanPurchaseException.class,
                        e -> assertThat(e.getCode()).isEqualTo("downgrade_not_allowed"));
    }

    @Test
    void theSamePlanHeldWithoutEndCannotBeBought() {
        var cur = new PlanTerm.Current("PRO", 2, null);
        assertThatThrownBy(() -> PlanTerm.next(cur, "PRO", 2, PlanPeriod.MONTH, NOW))
                .isInstanceOfSatisfying(PlanPurchaseException.class,
                        e -> assertThat(e.getCode()).isEqualTo("already_unlimited"));
    }

    @Test
    void anUnlimitedLowerPlanDoesNotBlockAnUpgrade() {
        var cur = new PlanTerm.Current("PRO", 2, null);
        var w = PlanTerm.next(cur, "MAX", 3, PlanPeriod.MONTH, NOW);
        assertThat(w.startsAt()).isEqualTo(NOW);
    }
}
