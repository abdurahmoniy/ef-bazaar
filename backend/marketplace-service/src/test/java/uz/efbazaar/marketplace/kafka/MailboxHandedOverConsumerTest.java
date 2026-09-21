package uz.efbazaar.marketplace.kafka;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.domain.NotificationType;
import uz.efbazaar.marketplace.service.NotificationService;

import java.time.Instant;
import java.util.UUID;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * The outcome decides which of the two things the bell says.
 *
 * <p>Getting it backwards would tell somebody whose trade timed out that it
 * completed — worse than saying nothing, because they would stop looking for
 * the account they had already transferred.
 */
@ExtendWith(MockitoExtension.class)
class MailboxHandedOverConsumerTest {

    @Mock NotificationService notifications;
    @Mock uz.efbazaar.marketplace.account.ListingAccountLink accounts;
    @InjectMocks MailboxHandedOverConsumer consumer;

    private static MailboxHandedOverDto event(UUID user, UUID trade, String outcome) {
        return new MailboxHandedOverDto(trade, user, "trade-abcd1234@efbazaar.uz",
                outcome, Instant.now());
    }

    @Test
    void aCompletedTradeSaysTheAccountWasReceived() {
        UUID user = UUID.randomUUID();
        UUID trade = UUID.randomUUID();

        consumer.onHandedOver(event(user, trade, "RECEIVED"));

        verify(notifications).tradeMailboxHandedOver(
                user, trade, NotificationType.TRADE_MAILBOX_RECEIVED);
        // Olingan quti akkountga ham biriktiriladi: aynan shu "qaysi email
        // qaysi akkountniki" savolini yopadi.
        verify(accounts).onMailboxHandedOver(trade, user, "trade-abcd1234@efbazaar.uz");
    }

    @Test
    void aReturnedMailboxIsNotAttachedToAnything() {
        UUID user = UUID.randomUUID();
        UUID trade = UUID.randomUUID();

        consumer.onHandedOver(event(user, trade, "RETURNED"));

        // Qaytarilgan quti odamning O'Z akkountiniki edi — u allaqachon
        // biriktirilgan va ustiga yozish noto'g'ri bo'lardi.
        verifyNoInteractions(accounts);
    }

    @Test
    void anyOtherEndingSaysTheInboxCameBack() {
        UUID user = UUID.randomUUID();
        UUID trade = UUID.randomUUID();

        consumer.onHandedOver(event(user, trade, "RETURNED"));

        verify(notifications).tradeMailboxHandedOver(
                user, trade, NotificationType.TRADE_MAILBOX_RETURNED);
    }

    @Test
    void anUnknownOutcomeIsNotTreatedAsSuccess() {
        // A producer that grows a third outcome must not have it read as
        // "your trade completed" by an older consumer.
        UUID user = UUID.randomUUID();
        UUID trade = UUID.randomUUID();

        consumer.onHandedOver(event(user, trade, "SOMETHING_NEW"));

        verify(notifications, never()).tradeMailboxHandedOver(
                user, trade, NotificationType.TRADE_MAILBOX_RECEIVED);
    }

    @Test
    void anEventWithNoRecipientIsDropped() {
        consumer.onHandedOver(new MailboxHandedOverDto(
                UUID.randomUUID(), null, "x@efbazaar.uz", "RETURNED", Instant.now()));
        consumer.onHandedOver(null);

        verifyNoInteractions(notifications);
    }
}
