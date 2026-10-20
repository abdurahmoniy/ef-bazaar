package uz.efbazaar.payment.plan.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.scheduling.annotation.Scheduled;
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
    private final java.time.Clock clock;

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
                .filter(s -> s.isLiveAt(clock.instant()))
                .map(UserSubscription::getPlanCode)
                .orElse(DEFAULT_PLAN);
    }

    /** When the current plan runs out, or null if it does not. */
    @Transactional(readOnly = true)
    public Instant expiryFor(UUID userId) {
        return subscriptions.findById(userId)
                .filter(s -> s.isLiveAt(clock.instant()))
                .map(UserSubscription::getExpiresAt)
                .orElse(null);
    }

    @Transactional
    public uz.efbazaar.payment.plan.dto.MyPlanResponse mine(UUID userId) {
        var sub = initializeIdentity(userId);
        String code = sub != null && sub.isLiveAt(clock.instant()) ? sub.getPlanCode() : DEFAULT_PLAN;
        Instant end = sub == null ? null : sub.getLastPaidExpiresAt();
        return new uz.efbazaar.payment.plan.dto.MyPlanResponse(code,
                sub != null && sub.isLiveAt(clock.instant()) ? sub.getExpiresAt() : null,
                entitlementsOf(code), end, end == null ? null : end.plus(java.time.Duration.ofDays(30)));
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
     * A never-paid authenticated identity still needs an authoritative Free
     * snapshot. INSERT-on-conflict and the same purchase row lock preserve an
     * existing paid/STAFF subscription, even if registration is replayed late.
     */
    @Transactional
    public UserSubscription initializeIdentity(UUID userId) {
        int created = subscriptions.ensureRow(userId);
        UserSubscription sub = subscriptions.lockByUserId(userId).orElseThrow();
        if (created == 1) {
            events.subscriptionChanged(userId, sub.getPlanCode(), sub.getExpiresAt(), sub.getLastPaidExpiresAt());
        }
        return sub;
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
        subscriptions.ensureRow(userId);
        UserSubscription sub = subscriptions.lockByUserId(userId).orElseThrow();
        if (("PRO".equals(planCode) || "MAX".equals(planCode)) && expiresAt != null) {
            sub.setLastPaidExpiresAt(expiresAt);
        }
        sub.setPlanCode(planCode);
        sub.setExpiresAt(expiresAt);
        sub.setSource(source == null ? "ADMIN" : source);
        subscriptions.save(sub);

        events.subscriptionChanged(userId, planCode, expiresAt, sub.getLastPaidExpiresAt());
        log.info("User {} is now on plan {} (expires {})", userId, planCode, expiresAt);
        return sub;
    }

    /** Startup and hourly recovery include subscriptions, even expired/free tombstones. */
    @EventListener(ApplicationReadyEvent.class)
    @Scheduled(fixedDelayString = "${payment.scheduler.plan-replay-interval-ms:3600000}",
            initialDelayString = "${payment.scheduler.plan-replay-interval-ms:3600000}")
    @Transactional
    public void publishAllEntitlements() {
        for (Plan plan : plans.findAll().stream().sorted(java.util.Comparator.comparing(Plan::getCode)).toList()) {
            plans.lockByCode(plan.getCode()).orElseThrow();
            events.planEntitlements(new PlanEntitlementsSnapshot(
                    plan.getCode(), entitlementsOf(plan.getCode()), Instant.now()));
        }
        // Fetch ids only: do not cache entities before taking their locks.
        for (UUID userId : subscriptions.findAllUserIds()) {
            subscriptions.lockByUserId(userId).ifPresent(sub ->
                    events.subscriptionChanged(userId, sub.getPlanCode(), sub.getExpiresAt(), sub.getLastPaidExpiresAt()));
        }
        log.info("Queued plan and subscription recovery snapshots");
    }
}
