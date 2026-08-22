package uz.efbazaar.payment.plan.dto;

import uz.efbazaar.payment.plan.domain.Plan;

import java.util.Map;

/**
 * A plan as the site shows it.
 *
 * <p>Entitlements go out as the map they are stored as, so a frontend built
 * today keeps working when a new one is added: it renders what it knows and
 * ignores the rest, and nothing here needs releasing to add a capability.
 */
public record PlanResponse(
        String code,
        int sortOrder,
        Map<String, String> entitlements) {

    public static PlanResponse of(Plan plan, Map<String, String> entitlements) {
        return new PlanResponse(plan.getCode(), plan.getSortOrder(), entitlements);
    }
}
