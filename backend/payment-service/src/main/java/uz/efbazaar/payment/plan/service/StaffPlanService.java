package uz.efbazaar.payment.plan.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.payment.plan.repository.UserSubscriptionRepository;

import java.util.UUID;

/**
 * Keeps ADMINs on STAFF, the unlimited plan, following their auth role.
 *
 * <p>Only a subscription this class created (source {@code ROLE}) is ever taken
 * back: a plan an admin handed out or the user paid for is theirs to keep.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class StaffPlanService {

    private static final String ADMIN = "ADMIN";

    private final PlanService plans;
    private final UserSubscriptionRepository subscriptions;

    @Transactional
    public void onRoleChanged(UUID userId, String oldRole, String newRole) {
        if (!ADMIN.equals(oldRole) && !ADMIN.equals(newRole)) return;
        subscriptions.ensureRow(userId);
        subscriptions.lockByUserId(userId).orElseThrow();
        if (ADMIN.equals(newRole)) {
            plans.assign(userId, PlanService.STAFF_PLAN, null, PlanService.ROLE_SOURCE);
        } else if (ADMIN.equals(oldRole)) {
            boolean grantedByRole = subscriptions.findById(userId)
                    .filter(s -> PlanService.STAFF_PLAN.equals(s.getPlanCode()))
                    .filter(s -> PlanService.ROLE_SOURCE.equals(s.getSource()))
                    .isPresent();
            if (grantedByRole) {
                plans.assign(userId, PlanService.DEFAULT_PLAN, null, PlanService.ROLE_SOURCE);
            }
        }
    }
}
