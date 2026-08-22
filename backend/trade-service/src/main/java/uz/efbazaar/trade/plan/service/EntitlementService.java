package uz.efbazaar.trade.plan.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.plan.domain.UserPlanView;
import uz.efbazaar.trade.plan.repository.PlanEntitlementViewRepository;
import uz.efbazaar.trade.plan.repository.UserPlanViewRepository;

import java.time.Instant;
import java.util.OptionalLong;
import java.util.UUID;

/**
 * What a user's plan allows them.
 *
 * <p>The only way the rest of this service asks. Callers name a capability —
 * {@code "mailbox.slots"} — and never a plan, so adding a tier or renaming one
 * changes nothing outside the projection.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EntitlementService {

    /** What a user is on when nobody has decided otherwise, as in payment-service. */
    public static final String DEFAULT_PLAN = "STANDARD";

    private final UserPlanViewRepository userPlans;
    private final PlanEntitlementViewRepository entitlements;

    @Transactional(readOnly = true)
    public String planFor(UUID userId) {
        return userPlans.findById(userId)
                .filter(p -> p.isLiveAt(Instant.now()))
                .map(UserPlanView::getPlanCode)
                .orElse(DEFAULT_PLAN);
    }

    /**
     * A numeric allowance, or empty when the user has no limit on it.
     *
     * <p>Empty covers two cases on purpose, because both mean "do not refuse
     * this": the plan grants it without a ceiling, and we do not yet know what
     * the plan grants. The second happens on a fresh deploy, before the
     * publisher's startup snapshot has landed — and a marketplace that stops
     * selling because a projection is a few seconds behind would be a worse
     * failure than a user briefly getting more than they paid for. It is logged
     * so a projection that never fills does not stay quiet.
     */
    @Transactional(readOnly = true)
    public OptionalLong limit(UUID userId, String key) {
        String plan = planFor(userId);
        var row = entitlements.findByIdPlanCodeAndIdKey(plan, key);
        if (row.isEmpty()) {
            log.warn("No '{}' entitlement known for plan {} — not enforcing it. "
                    + "Expected right after a deploy; persistent means the "
                    + "plan-entitlements projection is not being fed.", key, plan);
            return OptionalLong.empty();
        }
        String value = row.get().getValue();
        if (value == null) {
            return OptionalLong.empty();   // granted without a ceiling
        }
        try {
            return OptionalLong.of(Long.parseLong(value.trim()));
        } catch (NumberFormatException e) {
            log.error("Entitlement {}={} on plan {} is not a number — not enforcing it",
                    key, value, plan);
            return OptionalLong.empty();
        }
    }
}
