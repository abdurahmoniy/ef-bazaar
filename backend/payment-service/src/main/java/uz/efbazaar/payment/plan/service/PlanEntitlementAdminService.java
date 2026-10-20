package uz.efbazaar.payment.plan.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.payment.plan.domain.PlanEntitlement;
import uz.efbazaar.payment.plan.domain.PlanEntitlementId;
import uz.efbazaar.payment.plan.dto.PlanEntitlementRow;
import uz.efbazaar.payment.plan.dto.PlanEntitlementsSnapshot;
import uz.efbazaar.payment.plan.dto.UpdatePlanEntitlementsRequest;
import uz.efbazaar.payment.plan.repository.PlanEntitlementRepository;
import uz.efbazaar.payment.plan.repository.PlanRepository;

import java.time.Instant;
import java.util.*;

/**
 * The entitlements an admin may change from the panel.
 *
 * <p>Only the keys listed here: anything else is either not a number of things
 * or not ready to be tuned by hand, and accepting it would let a typo grant a
 * capability nothing enforces yet.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PlanEntitlementAdminService {

    public static final Set<String> ADMIN_KEYS = Set.of("mailbox.total_slots", "mailbox.custom_slots");

    private final PlanEntitlementRepository entitlements;
    private final PlanRepository plans;
    private final PlanService planService;
    private final PlanEventPublisher events;

    @Transactional(readOnly = true)
    public List<PlanEntitlementRow> all() {
        return entitlements.findAll().stream()
                .filter(e -> ADMIN_KEYS.contains(e.key()))
                .filter(e -> !PlanService.STAFF_PLAN.equals(e.planCode()))
                .sorted(Comparator.comparing(PlanEntitlement::planCode).thenComparing(PlanEntitlement::key))
                .map(PlanEntitlementRow::of)
                .toList();
    }

    @Transactional
    public List<PlanEntitlementRow> update(UUID adminId, List<UpdatePlanEntitlementsRequest.Item> items) {
        items.forEach(PlanEntitlementAdminService::validate);   // all before any write
        Set<String> touched = new TreeSet<>();
        // Lock in a stable order before any writes, also used by recovery replay.
        items.stream().map(UpdatePlanEntitlementsRequest.Item::planCode).distinct().sorted()
                .forEach(code -> plans.lockByCode(code)
                        .orElseThrow(() -> new IllegalArgumentException("Unknown plan " + code)));
        for (var item : items) {
            if (!plans.existsById(item.planCode())) {
                throw new IllegalArgumentException("Unknown plan " + item.planCode());
            }
            // Always unlimited: a number here would cap every admin.
            if (PlanService.STAFF_PLAN.equals(item.planCode())) {
                throw new IllegalArgumentException("STAFF is always unlimited");
            }
            var id = new PlanEntitlementId(item.planCode(), item.key());
            PlanEntitlement row = entitlements.findById(id)
                    .orElseGet(() -> PlanEntitlement.builder().id(id).build());
            row.setValue(item.value() == null ? null : item.value().trim());
            row.setUpdatedBy(adminId);
            entitlements.save(row);
            touched.add(item.planCode());
            log.info("Admin {} set {}.{} = {}", adminId, item.planCode(), item.key(),
                    item.value() == null ? "unlimited" : item.value());
        }
        for (String plan : touched) {
            events.planEntitlements(new PlanEntitlementsSnapshot(plan, planService.entitlementsOf(plan), Instant.now()));
        }
        return all();
    }

    private static void validate(UpdatePlanEntitlementsRequest.Item item) {
        if (!ADMIN_KEYS.contains(item.key())) {
            throw new IllegalArgumentException("Not an admin-managed key: " + item.key());
        }
        if (item.value() == null) return;
        try {
            if (Long.parseLong(item.value().trim()) < 0) {
                throw new IllegalArgumentException("Negative " + item.key());
            }
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Not a whole number: " + item.value());
        }
    }
}
