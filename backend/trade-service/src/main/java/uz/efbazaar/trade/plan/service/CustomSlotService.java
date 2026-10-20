package uz.efbazaar.trade.plan.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;

import java.util.OptionalLong;
import java.util.UUID;

/**
 * Self-named mailboxes a plan allows. Boxes an admin registered for a user are
 * custom too, but they are gifts: they spend no slot and never lock.
 *
 * <p>New mailbox allocation fails closed: an unknown
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
    private final MailboxRepository mailboxes;

    /** The ceiling, or empty when the plan grants it without one. */
    @Transactional(readOnly = true)
    public OptionalLong limitFor(UUID userId) {
        return entitlements.limit(userId, KEY);
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

}
