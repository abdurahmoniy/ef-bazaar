package uz.efbazaar.payment.plan.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import uz.efbazaar.payment.plan.domain.Plan;
import uz.efbazaar.payment.plan.domain.UserSubscription;
import uz.efbazaar.payment.plan.dto.PlanEntitlementsSnapshot;
import uz.efbazaar.payment.plan.repository.PlanEntitlementRepository;
import uz.efbazaar.payment.plan.repository.PlanRepository;
import uz.efbazaar.payment.plan.repository.UserSubscriptionRepository;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Who is on which plan, and what each plan grants.
 *
 * <p>This service owns both, and publishes them; nothing else writes them. The
 * services that enforce a limit keep their own copy fed from those events, so
 * opening a trade never waits on this one being up.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PlanService {

    /** What a user is on when nobody has decided otherwise. */
    public static final String DEFAULT_PLAN = "STANDARD";

    /**
     * What an ADMIN is on: every entitlement unlimited, never for sale, never
     * edited from the panel. Granted by role (source {@link #ROLE_SOURCE}), not bought.
     */
    public static final String STAFF_PLAN = "STAFF";

    /** Subscription source for a plan that follows the user's auth role. */
    public static final String ROLE_SOURCE = "ROLE";

    private final PlanRepository plans;
    private final PlanEntitlementRepository entitlements;
    private final UserSubscriptionRepository subscriptions;
    private final PlanEventPublisher events;

    @Transactional(readOnly = true)
    public List<Plan> activePlans() {
        return plans.findByActiveTrueOrderBySortOrderAsc();
    }

    /**
     * The plan this user is on right now.
     *
     * <p>An expired subscription reads as the default rather than as itself —
     * the row is kept for history, and letting it keep granting would make
     * "expires_at" decorative.
     */
    @Transactional(readOnly = true)
    public String planFor(UUID userId) {
        return subscriptions.findById(userId)
                .filter(s -> s.isLiveAt(Instant.now()))
                .map(UserSubscription::getPlanCode)
                .orElse(DEFAULT_PLAN);
    }

    /** When the current plan runs out, or null if it does not. */
    @Transactional(readOnly = true)
    public Instant expiryFor(UUID userId) {
        return subscriptions.findById(userId)
                .filter(s -> s.isLiveAt(Instant.now()))
                .map(UserSubscription::getExpiresAt)
                .orElse(null);
    }

    @Transactional(readOnly = true)
    public Map<String, String> entitlementsOf(String planCode) {
        Map<String, String> out = new HashMap<>();
        for (var e : entitlements.findByIdPlanCode(planCode)) {
            out.put(e.key(), e.getValue());
        }
        return out;
    }

    /**
     * Puts a user on a plan and tells everyone.
     *
     * <p>Idempotent by nature: assigning the plan somebody is already on
     * rewrites the row and re-announces it, which is what a replayed admin
     * action or a retried purchase should do.
     */
    @Transactional
    public UserSubscription assign(UUID userId, String planCode, Instant expiresAt, String source) {
        if (!plans.existsById(planCode)) {
            throw new IllegalArgumentException("Unknown plan " + planCode);
        }
        UserSubscription sub = subscriptions.findById(userId)
                .orElseGet(() -> UserSubscription.builder().userId(userId).build());
        sub.setPlanCode(planCode);
        sub.setExpiresAt(expiresAt);
        sub.setSource(source == null ? "ADMIN" : source);
        subscriptions.save(sub);

        // Only once the row is durable: a rollback after this point must not
        // leave readers believing in a plan the database never recorded.
        Runnable announce = () -> events.subscriptionChanged(userId, planCode, expiresAt);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    announce.run();
                }
            });
        } else {
            announce.run();
        }
        log.info("User {} is now on plan {} (expires {})", userId, planCode, expiresAt);
        return sub;
    }

    /**
     * Republishes what every plan grants.
     *
     * <p>Run on startup as well as on change. A reader that came up after the
     * last change, or lost its copy, has no way to ask for one — this is how it
     * gets back in step without an operator being involved.
     */
    @EventListener(ApplicationReadyEvent.class)
    @Transactional(readOnly = true)
    public void publishAllEntitlements() {
        for (Plan plan : plans.findAll()) {
            events.planEntitlements(new PlanEntitlementsSnapshot(
                    plan.getCode(), entitlementsOf(plan.getCode()), Instant.now()));
        }
        log.info("Published entitlements for all plans");
    }
}
