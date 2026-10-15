package uz.efbazaar.payment.plan.service;

import org.springframework.http.HttpStatus;
import uz.efbazaar.payment.plan.domain.PlanPeriod;
import uz.efbazaar.payment.plan.exception.PlanPurchaseException;

import java.time.Instant;

/**
 * When a purchased plan starts and ends. Pure, so every rule is a unit test.
 *
 * <p>Same plan extends; a higher one starts today at full length and the rest of
 * the old one is forfeited (product decision); a lower one over a live higher
 * one is refused, because the buyer would pay to lose what they already have.
 */
public final class PlanTerm {

    private PlanTerm() {}

    /** {@code expiresAt == null} = does not run out. A free/expired user is STANDARD with null. */
    public record Current(String planCode, int sortOrder, Instant expiresAt) {}

    public record Window(Instant startsAt, Instant expiresAt) {}

    public static Window next(Current current, String planCode, int targetOrder,
                              PlanPeriod period, Instant now) {
        boolean onFree = PlanService.DEFAULT_PLAN.equals(current.planCode());
        if (onFree) {
            return new Window(now, period.addTo(now));
        }
        if (current.planCode().equals(planCode)) {
            if (current.expiresAt() == null) {
                throw new PlanPurchaseException(HttpStatus.CONFLICT, "already_unlimited",
                        "Bu tarif sizda muddatsiz faol");
            }
            return new Window(current.expiresAt(), period.addTo(current.expiresAt()));
        }
        if (targetOrder < current.sortOrder()) {
            throw new PlanPurchaseException(HttpStatus.CONFLICT, "downgrade_not_allowed",
                    "Pastroq tarifga joriy tarif tugagach o'tish mumkin");
        }
        return new Window(now, period.addTo(now));
    }
}
