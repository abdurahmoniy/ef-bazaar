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
 * <p>A mailbox in a live trade is always open and counts toward the limit;
 * locking it mid-trade would strand the trade, so after a downgrade the user
 * may briefly read more than N.
 */
@Service
@RequiredArgsConstructor
public class MailboxAccessService {

    private final MailboxRepository mailboxes;
    private final TradeRepository trades;
    private final EntitlementService entitlements;

    @Transactional(readOnly = true)
    public Set<UUID> lockedIds(UUID userId) {
        OptionalLong limit = entitlements.limit(userId, MailboxSlotService.KEY);
        if (limit.isEmpty()) return Set.of();

        List<Mailbox> live = new ArrayList<>();
        List<Mailbox> rest = new ArrayList<>();
        for (Mailbox m : mailboxes.findAccessOrderOwnedBy(userId)) {
            (trades.existsLiveWithMailbox(m.getId(), TradeState.nonTerminal()) ? live : rest).add(m);
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
