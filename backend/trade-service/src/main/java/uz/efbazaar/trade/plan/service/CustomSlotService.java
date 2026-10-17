package uz.efbazaar.trade.plan.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.domain.MailboxKind;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.plan.repository.PlanEntitlementViewRepository;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.OptionalLong;
import java.util.Set;
import java.util.UUID;

/**
 * Self-named mailboxes a plan allows. Boxes an admin registered for a user are
 * custom too, but they are gifts: they spend no slot and never lock.
 *
 * <p>Unlike {@link MailboxSlotService} this fails closed: an unknown
 * entitlement means 0. A custom box is a permanent address handed out for
 * good, not a trade the marketplace has to keep selling through a projection
 * that is a few seconds behind.
 */
@Service
@RequiredArgsConstructor
public class CustomSlotService {

    /** The capability this asks about. Plans are never named here. */
    public static final String KEY = "mailbox.custom_slots";

    private final EntitlementService entitlements;
    private final PlanEntitlementViewRepository rows;
    private final MailboxRepository mailboxes;

    /** The ceiling, or empty when the plan grants it without one. */
    @Transactional(readOnly = true)
    public OptionalLong limitFor(UUID userId) {
        var row = rows.findByIdPlanCodeAndIdKey(entitlements.planFor(userId), KEY);
        if (row.isEmpty()) return OptionalLong.of(0);
        String value = row.get().getValue();
        if (value == null) return OptionalLong.empty();
        try {
            return OptionalLong.of(Long.parseLong(value.trim()));
        } catch (NumberFormatException e) {
            return OptionalLong.of(0);
        }
    }

    @Transactional(readOnly = true)
    public long used(UUID userId) {
        return mailboxes.countClaimedCustomOwnedBy(userId);
    }

    @Transactional(readOnly = true)
    public boolean canAllocate(UUID userId) {
        OptionalLong limit = limitFor(userId);
        return limit.isEmpty() || used(userId) < limit.getAsLong();
    }

    /** Custom boxes past the limit, lowest priority first to go. Locked, never deleted. */
    @Transactional(readOnly = true)
    public Set<UUID> lockedIds(UUID userId) {
        OptionalLong limit = limitFor(userId);
        if (limit.isEmpty()) return Set.of();
        // Admin gifts are always open and do not take a claimed box's place.
        List<Mailbox> owned = mailboxes.findAccessOrderOwnedBy(userId, MailboxKind.CUSTOM).stream()
                .filter(m -> m.getSource() != uz.efbazaar.trade.mailbox.domain.MailboxSource.ADMIN)
                .toList();
        Set<UUID> locked = new LinkedHashSet<>();
        for (int i = (int) Math.min(limit.getAsLong(), owned.size()); i < owned.size(); i++) {
            locked.add(owned.get(i).getId());
        }
        return locked;
    }
}
