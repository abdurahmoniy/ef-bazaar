package uz.efbazaar.bot.kafka;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import uz.efbazaar.bot.telegram.TelegramApiClient;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class TradeActionNotificationConsumerTest {

    static class RecordingTelegramApiClient extends TelegramApiClient {
        record Call(String chatId, Integer threadId, String text, WebAppButton button) {}
        final List<Call> calls = new ArrayList<>();

        RecordingTelegramApiClient() {
            super(null, null);
        }

        @Override
        public Optional<Integer> sendMessage(String chatId, Integer threadId, String text, WebAppButton button) {
            calls.add(new Call(chatId, threadId, text, button));
            return Optional.of(123);
        }
    }

    private RecordingTelegramApiClient telegram;
    private TradeActionNotificationConsumer consumer;

    @BeforeEach
    void setUp() {
        telegram = new RecordingTelegramApiClient();
        consumer = new TradeActionNotificationConsumer(telegram);
        ReflectionTestUtils.setField(consumer, "webBaseUrl", "https://efbazaar.uz");
    }

    @Test
    void sendsTelegramDmOnProposalCreated() {
        UUID tradeId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        TradeActionNotificationDto dto = new TradeActionNotificationDto(
                tradeId,
                chatId,
                userId,
                11223344L,
                "Ali",
                "PROPOSAL_CREATED",
                350_000L,
                null,
                Instant.now()
        );

        consumer.onTradeAction(dto);

        assertThat(telegram.calls).hasSize(1);
        var call = telegram.calls.get(0);
        assertThat(call.chatId()).isEqualTo("11223344");
        assertThat(call.text()).contains("Yangi savdo taklifi!");
        assertThat(call.text()).contains("350 000 UZS");
        assertThat(call.button().url()).isEqualTo("https://efbazaar.uz/chats/" + chatId);
    }

    @Test
    void dropsWhenNoTelegramId() {
        TradeActionNotificationDto dto = new TradeActionNotificationDto(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                null,
                "Ali",
                "TRADE_SUCCESS",
                100_000L,
                null,
                Instant.now()
        );

        consumer.onTradeAction(dto);

        assertThat(telegram.calls).isEmpty();
    }
}
