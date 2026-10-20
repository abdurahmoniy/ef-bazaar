package uz.efbazaar.trade.plan.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Which of a user's mailboxes their plan lets them read.
 *
 * <p>Computed on every read, never stored: a plan change, an expiry, an admin
 * cutting the limit, a detach — each shows up on the next request with no job
 * to run and nothing to fall out of step.
 *
 * <p>A mailbox in a live trade the owner is a party to is always open and
 * counts toward the limit; locking it mid-trade would strand the trade, so
 * after a downgrade the user may briefly read more than N. A live-trade box
 * whose owner is not a party (the escrow box of a human trade, lent to the
 * assigned admin) is always open too, but is not the owner's own allowance:
 * it does not count toward the limit.
 */
@Service
@RequiredArgsConstructor
public class MailboxAccessService {

    private final MailboxRepository mailboxes;
    private final TradeRepository trades;
    private final EntitlementService entitlements;
    private final uz.efbazaar.trade.plan.repository.UserPlanViewRepository plans;
    private final java.time.Clock clock;

    public enum AccessState { ACTIVE, GRACE, RECOVERY }
    public record Access(AccessState accessState, java.time.Instant paidExpiresAt,
                         java.time.Instant graceEndsAt, boolean selectedForFree) {
        public boolean locked() { return accessState == AccessState.RECOVERY; }
    }

    @Transactional(readOnly = true)
    public Access metadata(UUID userId, UUID mailboxId) {
        var owned = metadataFor(userId).get(mailboxId);
        if (owned != null) return owned;
        var plan = plans.findById(userId).orElse(null);
        var expiry = plan == null ? null : plan.getLastPaidExpiresAt();
        return new Access(AccessState.RECOVERY, expiry, expiry == null ? null : expiry.plus(java.time.Duration.ofDays(30)), false);
    }

    /** One owner snapshot and two live-trade queries for the whole account switcher. */
    @Transactional(readOnly = true)
    public java.util.Map<UUID, Access> metadataFor(UUID userId) {
        var plan = plans.findById(userId).orElse(null);
        var paidExpiry = plan == null ? null : plan.getLastPaidExpiresAt();
        var graceEnd = paidExpiry == null ? null : paidExpiry.plus(java.time.Duration.ofDays(30));
        var limit = entitlements.mailboxReadLimit(userId, MailboxSlotService.KEY);
        List<Mailbox> owned = mailboxes.findAccessOrderOwnedBy(userId);
        List<UUID> ids = owned.stream().map(Mailbox::getId).toList();
        Set<UUID> anyLive = ids.isEmpty() ? Set.of() : Set.copyOf(trades.liveMailboxIds(ids, TradeState.nonTerminal()));
        Set<UUID> partyLive = anyLive.isEmpty() ? Set.of()
                : Set.copyOf(trades.liveMailboxIdsOfParty(userId, ids, TradeState.nonTerminal()));
        List<Mailbox> priority = new ArrayList<>();
        owned.stream().filter(m -> m.getSource() != uz.efbazaar.trade.mailbox.domain.MailboxSource.ADMIN
                && partyLive.contains(m.getId())).forEach(priority::add);
        owned.stream().filter(m -> m.getSource() != uz.efbazaar.trade.mailbox.domain.MailboxSource.ADMIN
                && !anyLive.contains(m.getId())).forEach(priority::add);
        Set<UUID> freeSelected = new LinkedHashSet<>();
        priority.stream().limit(3).map(Mailbox::getId).forEach(freeSelected::add);
        Set<UUID> withinLimit = new LinkedHashSet<>();
        priority.stream().limit(limit.orElse(Long.MAX_VALUE)).map(Mailbox::getId).forEach(withinLimit::add);
        var result = new java.util.LinkedHashMap<UUID, Access>();
        for (Mailbox mb : owned) {
            boolean active = mb.getSource() == uz.efbazaar.trade.mailbox.domain.MailboxSource.ADMIN
                    || anyLive.contains(mb.getId()) || withinLimit.contains(mb.getId());
            AccessState state = active ? AccessState.ACTIVE
                    : graceEnd != null && clock.instant().isBefore(graceEnd) ? AccessState.GRACE : AccessState.RECOVERY;
            result.put(mb.getId(), new Access(state, paidExpiry, graceEnd, freeSelected.contains(mb.getId())));
        }
        return result;
    }

    @Transactional(readOnly = true)
    public Set<UUID> excessIds(UUID userId) {
        // Free selection remains available during grace and survives renewal; priorities are persisted.
        var states = metadataFor(userId);
        var selected = new LinkedHashSet<UUID>();
        states.forEach((id, a) -> { if (a.accessState() != AccessState.ACTIVE) selected.add(id); });
        return selected;
    }

    @Transactional(readOnly = true)
    public Set<UUID> lockedIds(UUID userId) {
        var selected = new LinkedHashSet<UUID>();
        metadataFor(userId).forEach((id, a) -> { if (a.locked()) selected.add(id); });
        return selected;
    }

    @Transactional(readOnly = true)
    public boolean isLocked(UUID userId, UUID mailboxId) {
        return lockedIds(userId).contains(mailboxId);
    }
}
