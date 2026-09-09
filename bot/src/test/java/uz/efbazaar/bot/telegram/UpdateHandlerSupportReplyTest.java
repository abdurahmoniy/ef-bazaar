package uz.efbazaar.bot.telegram;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;
import uz.efbazaar.bot.config.TelegramProperties;
import uz.efbazaar.bot.guide.GuideMessenger;
import uz.efbazaar.bot.kafka.SupportReplyReceivedDto;
import uz.efbazaar.bot.partner.ChannelVerifier;
import uz.efbazaar.bot.referral.PendingReferralClient;
import uz.efbazaar.bot.settings.BotSettingsClient;

import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UpdateHandlerSupportReplyTest {

    @Mock private TelegramApiClient telegram;
    @Mock private BotSettingsClient settings;
    @Mock private ChannelVerifier channels;
    @Mock private PendingReferralClient pendingReferrals;
    @Mock private PremiumEmojiInspector premiumEmoji;
    @Mock private GuideMessenger guides;
    @Mock private KafkaTemplate<String, Object> kafka;

    private TelegramProperties props;
    private UpdateHandler handler;
    private final ObjectMapper mapper = new ObjectMapper();

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
        handler = new UpdateHandler(
                telegram,
                settings,
                channels,
                pendingReferrals,
                premiumEmoji,
                guides,
                props,
                kafka
        );
    }

    @Test
    @DisplayName("Guruh support topicidagi reply xabari ushlanadi va Kafka ga e'lon qilinadi")
    void supportTopicReply_publishedToKafka() throws Exception {
        String json = """
        {
          "update_id": 10001,
          "message": {
            "message_id": 555,
            "message_thread_id": 77,
            "chat": {
              "id": -100123456789,
              "type": "supergroup"
            },
            "from": {
              "id": 999001,
              "first_name": "Admin",
              "last_name": "User",
              "username": "admin_ef"
            },
            "reply_to_message": {
              "message_id": 12345,
              "text": "Foydalanuvchi xabari"
            },
            "text": "Assalomu alaykum, qanday yordam bera olamiz?"
          }
        }
        """;

        when(kafka.send(anyString(), anyString(), any()))
                .thenReturn(CompletableFuture.completedFuture(null));

        handler.handle(mapper.readTree(json));

        ArgumentCaptor<SupportReplyReceivedDto> dtoCaptor =
                ArgumentCaptor.forClass(SupportReplyReceivedDto.class);
        verify(kafka).send(eq("efbazaar.bot.support-reply-received"), eq("12345"), dtoCaptor.capture());

        SupportReplyReceivedDto dto = dtoCaptor.getValue();
        assertThat(dto.replyToTelegramMessageId()).isEqualTo(12345L);
        assertThat(dto.telegramMessageId()).isEqualTo(555L);
        assertThat(dto.adminName()).isEqualTo("Admin User");
        assertThat(dto.adminUsername()).isEqualTo("admin_ef");
        assertThat(dto.text()).isEqualTo("Assalomu alaykum, qanday yordam bera olamiz?");
    }

    @Test
    @DisplayName("Boshqa topic yoki reply bo'lmagan xabar Kafka ga yuborilmaydi")
    void nonReplyOrOtherTopic_ignored() throws Exception {
        String json = """
        {
          "update_id": 10002,
          "message": {
            "message_id": 556,
            "message_thread_id": 4,
            "chat": {
              "id": -100123456789,
              "type": "supergroup"
            },
            "from": { "id": 1 },
            "text": "Boshqa xabar"
          }
        }
        """;

        handler.handle(mapper.readTree(json));

        verify(kafka, never()).send(anyString(), anyString(), any());
    }

    @Test
    @DisplayName("Kafka send istisno (exception) berganda handle metodi buzilmaydi")
    void supportTopicReply_kafkaThrows_handledGracefully() throws Exception {
        String json = """
        {
          "update_id": 10003,
          "message": {
            "message_id": 557,
            "message_thread_id": 77,
            "chat": {
              "id": -100123456789,
              "type": "supergroup"
            },
            "from": {
              "id": 999002,
              "first_name": "Admin"
            },
            "reply_to_message": {
              "message_id": 12346,
              "text": "Savol"
            },
            "text": "Javob"
          }
        }
        """;

        when(kafka.send(anyString(), anyString(), any()))
                .thenThrow(new RuntimeException("Kafka broker down"));

        // Should not throw
        handler.handle(mapper.readTree(json));

        verify(kafka).send(eq("efbazaar.bot.support-reply-received"), eq("12346"), any());
    }
}
