package uz.efbazaar.trade.plan.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.plan.domain.PlanEntitlementView;
import uz.efbazaar.trade.plan.domain.PlanEntitlementViewId;
import uz.efbazaar.trade.plan.domain.UserPlanView;
import uz.efbazaar.trade.plan.repository.PlanEntitlementViewRepository;
import uz.efbazaar.trade.plan.repository.UserPlanViewRepository;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/** Keeps the local copy of plans in step with payment-service. */
@Slf4j
@Service
@RequiredArgsConstructor
public class PlanProjection {

    private final PlanEntitlementViewRepository entitlements;
    private final UserPlanViewRepository userPlans;

    /**
     * Replaces everything known about one plan.
     *
     * <p>Cleared first, then written: merging a snapshot key by key would leave
     * behind whatever the plan used to grant, and the source has no way to say
     * "this one is gone" other than by no longer mentioning it.
     */
    @Transactional
    public void replacePlan(String planCode, Map<String, String> granted) {
        entitlements.deleteByPlanCode(planCode);
        granted.forEach((key, value) -> entitlements.save(PlanEntitlementView.builder()
                .id(new PlanEntitlementViewId(planCode, key))
                .value(value)
                .build()));
        log.info("Plan {} now grants {}", planCode, granted.keySet());
    }

    /**
     * Records which plan a user is on.
     *
     * <p>The default is stored as the absence of a row, so moving somebody back
     * to it deletes theirs rather than writing the plan's name — that keeps
     * this table to the users who are actually paying.
     */
    @Transactional
    public void userMoved(UUID userId, String planCode, Instant expiresAt) {
        if (EntitlementService.DEFAULT_PLAN.equals(planCode)) {
            userPlans.deleteById(userId);
            return;
        }
        UserPlanView row = userPlans.findById(userId)
                .orElseGet(() -> UserPlanView.builder().userId(userId).build());
        row.setPlanCode(planCode);
        row.setExpiresAt(expiresAt);
        userPlans.save(row);
    }
}
