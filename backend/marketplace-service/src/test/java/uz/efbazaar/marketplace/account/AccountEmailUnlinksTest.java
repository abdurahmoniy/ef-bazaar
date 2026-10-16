package uz.efbazaar.marketplace.account;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.account.AccountEmailUnlinks.Reason;
import uz.efbazaar.marketplace.event.MarketplaceEventPublisher;
import uz.efbazaar.marketplace.service.NotificationService;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * An account lost the email of a box it was verified on: trade-service has to
 * free the box, and a custom one sold away is worth telling the owner about —
 * custom boxes should not sit empty.
 */
@ExtendWith(MockitoExtension.class)
class AccountEmailUnlinksTest {

    @Mock MarketplaceEventPublisher publisher;
    @Mock NotificationService notifications;
    @InjectMocks AccountEmailUnlinks unlinks;

    private final UUID account = UUID.randomUUID();
    private final UUID owner = UUID.randomUUID();
    private final UUID box = UUID.randomUUID();

    @Test
    void soldCustomBoxIsAnnouncedAndTheOwnerTold() {
        unlinks.report(new AccountEmailUnlinks.Linked(account, owner, box, EmailSource.CUSTOM), Reason.SOLD);

        verify(publisher).accountEmailUnlinked(account, owner, box, "SOLD");
        verify(notifications).customMailboxFreed(owner);
    }

    @Test
    void editedCustomBoxIsAnnouncedButNobodyIsTold() {
        unlinks.report(new AccountEmailUnlinks.Linked(account, owner, box, EmailSource.CUSTOM), Reason.EDITED);

        verify(publisher).accountEmailUnlinked(account, owner, box, "EDITED");
        verify(notifications, never()).customMailboxFreed(any());
    }

    @Test
    void verifiedRandomBoxIsAnnouncedWithoutNotification() {
        unlinks.report(new AccountEmailUnlinks.Linked(account, owner, box, EmailSource.PLATFORM), Reason.SWAPPED);

        verify(publisher).accountEmailUnlinked(account, owner, box, "SWAPPED");
        verify(notifications, never()).customMailboxFreed(any());
    }

    @Test
    void noMailboxNothingToFree() {
        unlinks.report(new AccountEmailUnlinks.Linked(account, owner, null, EmailSource.MANUAL), Reason.SOLD);

        verifyNoInteractions(publisher, notifications);
    }
}
