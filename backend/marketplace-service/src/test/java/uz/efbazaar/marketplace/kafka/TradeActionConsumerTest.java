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

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

@ExtendWith(MockitoExtension.class)
class TradeActionConsumerTest {

    @Mock
    private NotificationService notifications;

    @InjectMocks
    private TradeActionConsumer consumer;

    @Test
    void savesNotificationForProposalCreated() {
        UUID userId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();

        TradeActionDto dto = new TradeActionDto(
                null,
                chatId,
                userId,
                "PROPOSAL_CREATED",
                200_000L,
                null,
                Instant.now()
        );

        consumer.onTradeAction(dto);

        verify(notifications).tradeAction(userId, null, chatId, NotificationType.TRADE_PROPOSAL_CREATED);
    }

    @Test
    void savesNotificationForTradeSuccess() {
        UUID userId = UUID.randomUUID();
        UUID tradeId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();

        TradeActionDto dto = new TradeActionDto(
                tradeId,
                chatId,
                userId,
                "TRADE_SUCCESS",
                500_000L,
                null,
                Instant.now()
        );

        consumer.onTradeAction(dto);

        verify(notifications).tradeAction(userId, tradeId, chatId, NotificationType.TRADE_SUCCESS);
    }

    @Test
    void telegramTurnDoesNotCreateAnExtraInAppNotification() {
        consumer.onTradeAction(new TradeActionDto(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                "YOUR_TURN", 0L, "WAITING_PASSWORD", Instant.now()));
        verifyNoInteractions(notifications);
    }

    @Test
    void dropsWhenNoRecipient() {
        TradeActionDto dto = new TradeActionDto(
                UUID.randomUUID(),
                UUID.randomUUID(),
                null,
                "TRADE_SUCCESS",
                500_000L,
                null,
                Instant.now()
        );

        consumer.onTradeAction(dto);

        verifyNoInteractions(notifications);
    }
}
