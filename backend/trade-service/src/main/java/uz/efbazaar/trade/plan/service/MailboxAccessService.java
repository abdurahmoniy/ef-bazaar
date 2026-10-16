package uz.efbazaar.trade.plan.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.domain.MailboxKind;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.OptionalLong;
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
    private final CustomSlotService customSlots;

    /** Random boxes past {@code mailbox.slots} plus custom boxes past {@code mailbox.custom_slots}. */
    @Transactional(readOnly = true)
    public Set<UUID> lockedIds(UUID userId) {
        Set<UUID> locked = new LinkedHashSet<>(lockedRandomIds(userId));
        locked.addAll(customSlots.lockedIds(userId));
        return locked;
    }

    private Set<UUID> lockedRandomIds(UUID userId) {
        OptionalLong limit = entitlements.limit(userId, MailboxSlotService.KEY);
        if (limit.isEmpty()) return Set.of();

        List<Mailbox> owned = mailboxes.findAccessOrderOwnedBy(userId, MailboxKind.RANDOM);
        List<UUID> ids = owned.stream().map(Mailbox::getId).toList();
        // Two queries for the lot. Only a live box whose owner is a party to the
        // trade is held open and spends the limit; the escrow box a human
        // trade-admin was lent is open too but neither locked nor counted.
        Set<UUID> anyLive = ids.isEmpty() ? Set.of()
                : Set.copyOf(trades.liveMailboxIds(ids, TradeState.nonTerminal()));
        Set<UUID> partyLive = anyLive.isEmpty() ? Set.of()
                : Set.copyOf(trades.liveMailboxIdsOfParty(userId, ids, TradeState.nonTerminal()));
        List<Mailbox> live = new ArrayList<>();
        List<Mailbox> rest = new ArrayList<>();
        for (Mailbox m : owned) {
            if (partyLive.contains(m.getId())) live.add(m);
            else if (!anyLive.contains(m.getId())) rest.add(m);
        }
        long free = Math.max(0, limit.getAsLong() - live.size());
        Set<UUID> locked = new LinkedHashSet<>();
        for (int i = 0; i < rest.size(); i++) {
            if (i >= free) locked.add(rest.get(i).getId());
        }
        return locked;
    }

    @Transactional(readOnly = true)
    public boolean isLocked(UUID userId, UUID mailboxId) {
        return lockedIds(userId).contains(mailboxId);
    }
}
