package uz.efbazaar.marketplace.kafka;

import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.domain.NotificationType;
import uz.efbazaar.marketplace.service.NotificationService;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class TradeAdminInvitedConsumerTest {

    private final NotificationService notifications = mock(NotificationService.class);
    private final TradeAdminInvitedConsumer consumer =
            new TradeAdminInvitedConsumer(notifications);

    @Test
    void writesANotificationForTheInvitedAdmin() {
        UUID tradeId = UUID.randomUUID(), adminId = UUID.randomUUID();

        consumer.onInvited(new TradeAdminInvitedDto(tradeId, adminId,
                UUID.randomUUID(), UUID.randomUUID(), 80_000L, 20_000L, Instant.now()));

        verify(notifications).tradeAdminInvited(eq(adminId), eq(tradeId));
    }

    @Test
    void ignoresAnEventWithNoAdmin() {
        consumer.onInvited(new TradeAdminInvitedDto(UUID.randomUUID(), null,
                UUID.randomUUID(), UUID.randomUUID(), 80_000L, 20_000L, Instant.now()));

        verifyNoInteractions(notifications);
    }

    @Test
    void ignoresANullEvent() {
        consumer.onInvited(null);
        verifyNoInteractions(notifications);
    }

    @Test
    void theNotificationTypeExists() {
        assertThat(NotificationType.TRADE_ADMIN_INVITED.name())
                .isEqualTo("TRADE_ADMIN_INVITED");
    }
}
