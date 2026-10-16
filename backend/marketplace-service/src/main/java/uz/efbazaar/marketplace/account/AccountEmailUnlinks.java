package uz.efbazaar.marketplace.account;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import uz.efbazaar.marketplace.event.MarketplaceEventPublisher;
import uz.efbazaar.marketplace.service.NotificationService;

import java.util.Set;
import java.util.UUID;

/**
 * An account stopped using the box it was verified on.
 *
 * <p>trade-service is told after commit (so a rolled-back sale frees nothing)
 * and frees the box. A custom box sold away also gets the owner a
 * notification: custom boxes should not sit empty.
 */
@Component
@RequiredArgsConstructor
public class AccountEmailUnlinks {

    public enum Reason { SOLD, SWAPPED, SOLD_ELSEWHERE, EDITED, RELINKED, DELETED }

    /** The account's email link as it was before the change; capture it before clearing. */
    public record Linked(UUID accountId, UUID ownerId, UUID mailboxId, EmailSource source) {
        public static Linked of(UserAccount a) {
            return new Linked(a.getId(), a.getOwnerId(), a.getMailboxId(), a.getEmailSource());
        }
    }

    private static final Set<Reason> FREED_FOR_SALE = Set.of(Reason.SOLD, Reason.SWAPPED, Reason.SOLD_ELSEWHERE);

    private final MarketplaceEventPublisher publisher;
    private final NotificationService notifications;

    public void report(Linked before, Reason reason) {
        if (before == null || before.mailboxId() == null) return;
        if (before.source() == EmailSource.CUSTOM && FREED_FOR_SALE.contains(reason)) {
            notifications.customMailboxFreed(before.ownerId());
        }
        Runnable send = () -> publisher.accountEmailUnlinked(
                before.accountId(), before.ownerId(), before.mailboxId(), reason.name());
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    send.run();
                }
            });
        } else {
            send.run();
        }
    }
}
