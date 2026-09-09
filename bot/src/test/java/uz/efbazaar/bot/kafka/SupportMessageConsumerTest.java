package uz.efbazaar.bot.kafka;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.any;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;
import uz.efbazaar.bot.config.TelegramProperties;
import uz.efbazaar.bot.telegram.TelegramApiClient;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SupportMessageConsumerTest {

    @Mock
    private TelegramApiClient telegram;

    @Mock
    private KafkaTemplate<String, Object> kafka;

    private TelegramProperties props;
    private SupportMessageConsumer consumer;

    @BeforeEach
    void setUp() {
        props = new TelegramProperties(
                "token",
                "testbot",
                "http://tg.api",
                "-100123456789",
                new TelegramProperties.Topics(1, 2, 3, 4, 77),
                "http://webhook",
                "secret"
        );
        consumer = new SupportMessageConsumer(telegram, props, kafka);
    }

    @Test
    @DisplayName("Yangi support xabari kelganda Telegram topiciga jo'natiladi va bound event chiqadi")
    void onMessageCreated_sendsToTelegramAndPublishesBound() {
        UUID chatId = UUID.randomUUID();
        UUID messageId = UUID.randomUUID();
        SupportMessageCreatedDto dto = new SupportMessageCreatedDto(
                chatId,
                messageId,
                "PARTNERSHIP",
                UUID.randomUUID(),
                "Alisher",
                "@alisher_tg",
                "Salom, hamkorlik qilaylik",
                null,
                Instant.now()
        );

        when(telegram.sendMessageWithReply(eq("-100123456789"), eq(77), anyString(), isNull()))
                .thenReturn(Optional.of(12345));

        consumer.onMessageCreated(dto);

        ArgumentCaptor<String> textCaptor = ArgumentCaptor.forClass(String.class);
        verify(telegram).sendMessageWithReply(eq("-100123456789"), eq(77), textCaptor.capture(), isNull());
        assertThat(textCaptor.getValue()).contains("Hamkorlik");
        assertThat(textCaptor.getValue()).contains("Alisher");
        assertThat(textCaptor.getValue()).contains("Salom, hamkorlik qilaylik");

        verify(kafka).send(eq("efbazaar.bot.support-message-bound"), eq(chatId.toString()), any(SupportMessageBoundDto.class));
    }

    @Test
    @DisplayName("Topic sozlanmagan bo'lsa xatoliksiz o'tkazib yuboriladi")
    void onMessageCreated_unconfiguredTopicSkipped() {
        TelegramProperties unconfiguredProps = new TelegramProperties(
                "token", "testbot", "http://tg.api", "-100123456789",
                new TelegramProperties.Topics(1, 2, 3, 4, null),
                "http://webhook", "secret"
        );
        SupportMessageConsumer unconfiguredConsumer = new SupportMessageConsumer(telegram, unconfiguredProps, kafka);

        SupportMessageCreatedDto dto = new SupportMessageCreatedDto(
                UUID.randomUUID(), UUID.randomUUID(), "SUPPORT",
                null, "Mehmon", null, "Yordam", null, Instant.now()
        );

        unconfiguredConsumer.onMessageCreated(dto);

        verify(telegram, never()).sendMessageWithReply(any(), any(), any(), any());
        verify(kafka, never()).send(anyString(), anyString(), any());
    }

    @Test
    @DisplayName("Telegram xato bersa ham metod to'xtab qolmaydi va istisno tashlamaydi")
    void onMessageCreated_telegramErrorHandledGracefully() {
        UUID chatId = UUID.randomUUID();
        UUID messageId = UUID.randomUUID();
        SupportMessageCreatedDto dto = new SupportMessageCreatedDto(
                chatId, messageId, "SUPPORT", null, "Mehmon", null, "Yordam", null, Instant.now()
        );

        when(telegram.sendMessageWithReply(any(), any(), any(), any()))
                .thenThrow(new RuntimeException("Telegram network error"));

        // Should not throw
        consumer.onMessageCreated(dto);

        verify(kafka, never()).send(anyString(), anyString(), any());
    }

    @Nested
    @DisplayName("topikdagi ko'rinish")
    class TopicReadability {

        private String textSentFor(Long replyTo, String content) {
            when(telegram.sendMessageWithReply(anyString(), anyInt(), anyString(), any()))
                    .thenReturn(Optional.of(1));
            consumer.onMessageCreated(new SupportMessageCreatedDto(
                    UUID.fromString("fa02085f-0000-4000-8000-000000000001"),
                    UUID.randomUUID(), "SUPPORT", UUID.randomUUID(),
                    "Abdurakhmoniy", "@abdurahmoniy", content, replyTo, Instant.now()));
            ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
            verify(telegram).sendMessageWithReply(anyString(), anyInt(), text.capture(), any());
            return text.getValue();
        }

        @Test
        @DisplayName("birinchi murojaat to'liq sarlavha bilan keladi")
        void theFirstMessageCarriesTheHeader() {
            // Bu haqiqatan yangi murojaat: admin kimdan kelganini va qanday
            // bog'lanishni shu yerda ko'rishi kerak.
            String text = textSentFor(null, "help");

            assertThat(text).contains("Yangi murojaat");
            assertThat(text).contains("Abdurakhmoniy");
            assertThat(text).contains("@abdurahmoniy");
            assertThat(text).contains("#fa02085f");
        }

        @Test
        @DisplayName("keyingi xabar sarlavhani takrorlamaydi")
        void followUpsAreCompact() {
            // Ilgari har xabar to'rt qator bezak bilan kelardi va bitta
            // so'zlik javob ham YANGI MUROJAATDEK ko'rinardi. Reply zanjiri
            // kontekstni allaqachon beradi.
            String text = textSentFor(999L, "help");

            assertThat(text).doesNotContain("Yangi murojaat");
            assertThat(text).doesNotContain("Kimdan");
            assertThat(text).doesNotContain("────");
            // Qisqa id qoladi: bir nechta murojaat aralashganda ko'z bilan
            // ajratishning yagona yo'li shu.
            assertThat(text).contains("#fa02085f");
            assertThat(text).contains("help");
        }

        @Test
        @DisplayName("keyingi xabar qisqa — ko'pi bilan ikki qator bezak")
        void followUpsStayShort() {
            String text = textSentFor(999L, "help");

            assertThat(text.lines().count()).isLessThanOrEqualTo(2L);
        }
    }
}
