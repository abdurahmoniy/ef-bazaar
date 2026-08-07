package uz.efbazaar.marketplace.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.domain.Chat;
import uz.efbazaar.marketplace.domain.ChatStatus;
import uz.efbazaar.marketplace.domain.Notification;
import uz.efbazaar.marketplace.domain.NotificationType;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.NotificationRepository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NotificationServiceTest {

    @Mock NotificationRepository notifications;

    @InjectMocks NotificationService service;

    private UUID buyerId;
    private UUID sellerId;
    private Chat chat;

    @BeforeEach
    void setUp() {
        buyerId = UUID.randomUUID();
        sellerId = UUID.randomUUID();
        chat = Chat.builder()
                .id(UUID.randomUUID())
                .listingId(UUID.randomUUID())
                .buyerId(buyerId)
                .sellerId(sellerId)
                .buyerDisplayName("Aziz")
                .sellerDisplayName("Sardor")
                .status(ChatStatus.ACTIVE)
                .build();
    }

    @Test
    void chatCreated_notifiesSellerWithBuyerName() {
        service.chatCreated(chat);

        ArgumentCaptor<Notification> captor = ArgumentCaptor.forClass(Notification.class);
        verify(notifications).save(captor.capture());
        Notification n = captor.getValue();
        assertThat(n.getUserId()).isEqualTo(sellerId);
        assertThat(n.getType()).isEqualTo(NotificationType.CHAT_CREATED);
        assertThat(n.getActorDisplayName()).isEqualTo("Aziz");
        assertThat(n.getChatId()).isEqualTo(chat.getId());
    }

    @Test
    void newMessage_notifiesOtherParticipant() {
        when(notifications.findFirstByUserIdAndChatIdAndTypeAndReadAtIsNull(
                sellerId, chat.getId(), NotificationType.CHAT_MESSAGE))
                .thenReturn(Optional.empty());

        service.newMessage(chat, buyerId); // buyer sends → seller notified

        ArgumentCaptor<Notification> captor = ArgumentCaptor.forClass(Notification.class);
        verify(notifications).save(captor.capture());
        Notification n = captor.getValue();
        assertThat(n.getUserId()).isEqualTo(sellerId);
        assertThat(n.getActorDisplayName()).isEqualTo("Aziz");
    }

    @Test
    void newMessage_bumpsExistingUnreadInsteadOfDuplicating() {
        Notification existing = Notification.builder()
                .id(UUID.randomUUID())
                .userId(sellerId)
                .type(NotificationType.CHAT_MESSAGE)
                .chatId(chat.getId())
                .createdAt(Instant.now().minusSeconds(600))
                .build();
        when(notifications.findFirstByUserIdAndChatIdAndTypeAndReadAtIsNull(
                sellerId, chat.getId(), NotificationType.CHAT_MESSAGE))
                .thenReturn(Optional.of(existing));

        Instant before = existing.getCreatedAt();
        service.newMessage(chat, buyerId);

        verify(notifications, never()).save(any());
        assertThat(existing.getCreatedAt()).isAfter(before);
    }

    @Test
    void tradeAdminInvited_savesNotification() {
        UUID adminId = UUID.randomUUID();
        UUID tradeId = UUID.randomUUID();
        when(notifications.existsByUserIdAndTypeAndTradeId(
                adminId, NotificationType.TRADE_ADMIN_INVITED, tradeId))
                .thenReturn(false);

        service.tradeAdminInvited(adminId, tradeId);

        ArgumentCaptor<Notification> captor = ArgumentCaptor.forClass(Notification.class);
        verify(notifications).save(captor.capture());
        Notification n = captor.getValue();
        assertThat(n.getUserId()).isEqualTo(adminId);
        assertThat(n.getType()).isEqualTo(NotificationType.TRADE_ADMIN_INVITED);
        assertThat(n.getTradeId()).isEqualTo(tradeId);
    }

    @Test
    void tradeAdminInvited_skipsDuplicateForSameAdminAndTrade() {
        UUID adminId = UUID.randomUUID();
        UUID tradeId = UUID.randomUUID();
        when(notifications.existsByUserIdAndTypeAndTradeId(
                adminId, NotificationType.TRADE_ADMIN_INVITED, tradeId))
                .thenReturn(true);

        service.tradeAdminInvited(adminId, tradeId);

        verify(notifications, never()).save(any());
    }

    @Test
    void markRead_rejectsForeignNotification() {
        UUID id = UUID.randomUUID();
        Notification other = Notification.builder()
                .id(id).userId(UUID.randomUUID())
                .type(NotificationType.CHAT_MESSAGE).build();
        when(notifications.findById(id)).thenReturn(Optional.of(other));

        assertThatThrownBy(() -> service.markRead(id, buyerId))
                .isInstanceOf(MarketplaceException.class);
    }

    @Test
    void markRead_setsReadAtOnce() {
        UUID id = UUID.randomUUID();
        Notification mine = Notification.builder()
                .id(id).userId(buyerId)
                .type(NotificationType.CHAT_MESSAGE).build();
        when(notifications.findById(id)).thenReturn(Optional.of(mine));

        Notification result = service.markRead(id, buyerId);
        assertThat(result.getReadAt()).isNotNull();

        Instant first = result.getReadAt();
        service.markRead(id, buyerId); // idempotent
        assertThat(result.getReadAt()).isEqualTo(first);
    }
}
