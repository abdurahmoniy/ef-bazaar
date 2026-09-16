package uz.efbazaar.marketplace.push;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.domain.Notification;
import uz.efbazaar.marketplace.domain.NotificationType;
import uz.efbazaar.marketplace.repository.PushTokenRepository;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.RejectedExecutionException;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PushDeliveryServiceTest {
    private final PushTokenRepository tokens = mock(PushTokenRepository.class);
    private final PushSender sender = mock(PushSender.class);
    private final PushProperties properties = new PushProperties();
    private final UUID owner = UUID.randomUUID();
    private final NotificationPushEvent event = NotificationPushEvent.from(Notification.builder()
            .id(UUID.randomUUID()).userId(owner).type(NotificationType.CHAT_MESSAGE)
            .chatId(UUID.randomUUID()).build());
    private PushDeliveryService service;
    @BeforeEach void setUp() {
        properties.setEnabled(true);
        service = new PushDeliveryService(tokens, sender, Runnable::run, properties);
    }
    @Test void deliversToEveryCurrentOwnedDeviceAndCleansOnlyInvalidRegistration() {
        when(tokens.findByUserId(owner)).thenReturn(List.of("expired", "phone", "tablet"));
        when(sender.send("expired", event.data())).thenReturn(PushSender.Result.INVALID_TOKEN);
        when(sender.send("phone", event.data())).thenThrow(new IllegalStateException("network failed"));
        when(sender.send("tablet", event.data())).thenReturn(PushSender.Result.SENT);
        assertThatCode(() -> service.enqueue(event)).doesNotThrowAnyException();
        verify(tokens).remove(owner, "expired");
        verify(tokens, never()).remove(owner, "phone");
        verify(sender).send("tablet", event.data());
    }
    @Test void disabledDeliveryDoesNotReadTokensOrCallFirebase() {
        properties.setEnabled(false);
        service.enqueue(event);
        verifyNoInteractions(tokens, sender);
    }
    @Test void fullQueueAndDatabaseFailureNeverEscapeToBusinessFlow() {
        service = new PushDeliveryService(tokens, sender, task -> { throw new RejectedExecutionException(); }, properties);
        assertThatCode(() -> service.enqueue(event)).doesNotThrowAnyException();
        service = new PushDeliveryService(tokens, sender, Runnable::run, properties);
        when(tokens.findByUserId(owner)).thenThrow(new IllegalStateException("database failed"));
        assertThatCode(() -> service.enqueue(event)).doesNotThrowAnyException();
    }
    @Test void cleanupFailureDoesNotPreventOtherDeviceDelivery() {
        when(tokens.findByUserId(owner)).thenReturn(List.of("expired", "phone"));
        when(sender.send("expired", event.data())).thenReturn(PushSender.Result.INVALID_TOKEN);
        doThrow(new IllegalStateException("cleanup failed")).when(tokens).remove(owner, "expired");
        service.enqueue(event);
        verify(sender).send("phone", event.data());
    }
}
