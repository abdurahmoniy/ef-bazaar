package uz.efbazaar.trade.plan.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.OptionalLong;
import java.util.UUID;

/**
 * What a user's plan allows them.
 *
 * <p>The only way the rest of this service asks. Callers name a capability —
 * {@code "mailbox.total_slots"} — and never a plan, so adding a tier or renaming one
 * changes nothing outside the projection.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EntitlementService {

    /** What a user is on when nobody has decided otherwise, as in payment-service. */
    public static final String DEFAULT_PLAN = "STANDARD";

    private final PlanProjection projection;

    @Transactional(readOnly = true)
    public String planFor(UUID userId) {
        return projection.readCapability(userId, "").planCode();
    }

    /** Only an explicit fresh null grant means unlimited; unknown paid state fails closed. */
    @Transactional(readOnly = true)
    public OptionalLong limit(UUID userId, String key) {
        return numericLimit(projection.readCapability(userId, key), key);
    }

    private OptionalLong numericLimit(PlanProjection.CapabilitySnapshot snapshot, String key) {
        String plan = snapshot.planCode();
        if (!snapshot.planFresh()) {
            // Preserve basic Free trades while payment is unavailable. Never infer paid capabilities.
            return OptionalLong.of(DEFAULT_PLAN.equals(plan) && ("mailbox.slots".equals(key) || "mailbox.total_slots".equals(key)) ? 3 : 0);
        }
        if (!snapshot.granted()) return OptionalLong.of(DEFAULT_PLAN.equals(plan) && ("mailbox.slots".equals(key) || "mailbox.total_slots".equals(key)) ? 3 : 0);
        String value = snapshot.value();
        if (value == null) return OptionalLong.empty();
        try {
            long limit = Long.parseLong(value.trim());
            return OptionalLong.of(Math.max(0, limit));
        } catch (NumberFormatException e) {
            log.error("Invalid numeric entitlement {} on plan {} — denying allocation", key, plan);
            return OptionalLong.of(0);
        }
    }
    /** Read-only access must not disappear because a snapshot is late or corrupt. This never allocates slots. */
    @Transactional(readOnly = true)
    public OptionalLong mailboxReadLimit(UUID userId, String key) {
        var snapshot = projection.readMailboxAccess(userId, key);
        if (!snapshot.subscriptionKnown()) return OptionalLong.empty();
        // Explicit Free downgrade/expiry enforces the Free total even before its catalog replay.
        if (DEFAULT_PLAN.equals(snapshot.planCode()) && "mailbox.total_slots".equals(key)
                && !snapshot.granted()) return OptionalLong.of(3);
        if (!snapshot.granted() || snapshot.value() == null) return OptionalLong.empty();
        try {
            long limit = Long.parseLong(snapshot.value().trim());
            return limit < 0 ? OptionalLong.empty() : OptionalLong.of(limit);
        } catch (NumberFormatException e) {
            return OptionalLong.empty();
        }
    }

    @Transactional(readOnly = true)
    public OptionalLong allocationLimit(UUID userId, String key) {
        var snapshot = projection.readCapability(userId, key);
        requireReady(snapshot);
        return numericLimit(snapshot, key);
    }

    @Transactional(readOnly = true)
    public void assertAllocationReady(UUID userId, String key) {
        requireReady(projection.readCapability(userId, key));
    }

    public record MailboxAllocationPolicy(String planCode, OptionalLong totalLimit, OptionalLong customLimit) {}

    /** Total/custom limits, domain plan and readiness share one authoritative database snapshot. */
    @Transactional(readOnly = true)
    public MailboxAllocationPolicy mailboxAllocationPolicy(UUID userId) {
        var snapshots = projection.readCapabilities(userId,
                java.util.List.of(MailboxSlotService.KEY, CustomSlotService.KEY));
        var total = snapshots.get(MailboxSlotService.KEY);
        var custom = snapshots.get(CustomSlotService.KEY);
        requireReady(total);
        requireReady(custom);
        return new MailboxAllocationPolicy(total.planCode(), numericLimit(total, MailboxSlotService.KEY),
                numericLimit(custom, CustomSlotService.KEY));
    }

    private void requireReady(PlanProjection.CapabilitySnapshot snapshot) {
        if (!snapshot.paidSubscriptionLive()) return;
        boolean ready = snapshot.subscriptionFresh() && snapshot.planFresh() && snapshot.granted();
        if (ready && snapshot.value() != null) {
            try { ready = Long.parseLong(snapshot.value().trim()) >= 0; }
            catch (NumberFormatException e) { ready = false; }
        }
        if (!ready) throw new uz.efbazaar.trade.common.exception.ApiCodeException(
                org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE, "plan_projection_unavailable",
                "Tarif huquqlari yangilanmoqda. Birozdan keyin qayta urinib ko‘ring.");
    }

}
