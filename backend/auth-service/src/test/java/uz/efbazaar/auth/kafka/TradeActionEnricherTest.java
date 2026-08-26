package uz.efbazaar.auth.kafka;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.repository.UserRepository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TradeActionEnricherTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private KafkaTemplate<String, Object> kafka;

    private TradeActionEnricher enricher;

    @BeforeEach
    void setUp() {
        enricher = new TradeActionEnricher(userRepository, kafka);
    }

    @Test
    void enrichesTradeActionWithTelegramIdentity() {
        UUID userId = UUID.randomUUID();
        UUID tradeId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();

        User user = User.builder()
                .id(userId)
                .telegramId(987654321L)
                .telegramFirstName("Sardor")
                .telegramUsername("sardor_dev")
                .build();

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        TradeActionNotificationDto dto = new TradeActionNotificationDto(
                tradeId,
                chatId,
                userId,
                "PROPOSAL_CREATED",
                150_000L,
                null,
                Instant.now()
        );

        enricher.onTradeAction(dto);

        ArgumentCaptor<TradeActionNotificationEvent> captor =
                ArgumentCaptor.forClass(TradeActionNotificationEvent.class);
        verify(kafka).send(eq("efbazaar.notifications.trade-action"), eq(userId.toString()), captor.capture());

        TradeActionNotificationEvent event = captor.getValue();
        assertThat(event.recipientTelegramId()).isEqualTo(987654321L);
        assertThat(event.recipientDisplayName()).isEqualTo("Sardor");
        assertThat(event.actionType()).isEqualTo("PROPOSAL_CREATED");
        assertThat(event.amountUzs()).isEqualTo(150_000L);
    }

    @Test
    void dropsWhenUserNotFound() {
        UUID userId = UUID.randomUUID();
        when(userRepository.findById(userId)).thenReturn(Optional.empty());

        TradeActionNotificationDto dto = new TradeActionNotificationDto(
                UUID.randomUUID(),
                UUID.randomUUID(),
                userId,
                "TRADE_SUCCESS",
                100_000L,
                null,
                Instant.now()
        );

        enricher.onTradeAction(dto);

        verifyNoInteractions(kafka);
    }
}
