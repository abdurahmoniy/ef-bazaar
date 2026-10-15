package uz.efbazaar.payment.plan.domain;

import java.time.Instant;
import java.time.ZoneOffset;

/** How long one purchase lasts. Calendar months and years, counted in UTC. */
public enum PlanPeriod {
    MONTH, YEAR;

    public Instant addTo(Instant from) {
        var at = from.atZone(ZoneOffset.UTC);
        return (this == MONTH ? at.plusMonths(1) : at.plusYears(1)).toInstant();
    }
}
