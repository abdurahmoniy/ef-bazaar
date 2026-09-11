package uz.efbazaar.bot.partner;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.bot.telegram.TelegramApiClient;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Postni kanaldan o'chirish.
 *
 * <p>Ikki manbadan keladi va manzili ikki xil shaklda bo'ladi: hamkor
 * kanali raqamli identifikator, rasmiy kanal esa sozlamada matn —
 * {@code @username} ham bo'lishi mumkin.
 */
class ChannelPostDeleteConsumerTest {

    private TelegramApiClient telegram;
    private ChannelPostDeleteConsumer consumer;

    @BeforeEach
    void setUp() {
        telegram = mock(TelegramApiClient.class);
        consumer = new ChannelPostDeleteConsumer(telegram);
    }

    private static ChannelPostDeleteRequest request(Long channelId, String chatId, String messageId) {
        return new ChannelPostDeleteRequest(
                UUID.randomUUID(), channelId, chatId, messageId, Instant.now());
    }

    @Test
    void hamkorKanalidanOchiradi() {
        consumer.onDeleteRequested(request(-1001234L, "-1001234", "9001"));

        verify(telegram).deleteMessage("-1001234", 9001L);
    }

    /** Rasmiy kanal raqam emas — uni Long ga sig'dirib bo'lmaydi. */
    @Test
    @DisplayName("rasmiy kanaldan @username bo'yicha o'chiradi")
    void rasmiyKanaldanOchiradi() {
        consumer.onDeleteRequested(request(null, "@EfBazaar", "7001"));

        verify(telegram).deleteMessage("@EfBazaar", 7001L);
    }

    /**
     * Eski marketplace versiyasi {@code chatId} ni yubormaydi. Deploy
     * tartibiga qarab bu holat bir necha daqiqa yashaydi va o'sha
     * paytdagi o'chirishlar yo'qolmasligi kerak.
     */
    @Test
    void chatIdSizEskiXabarHamIshlaydi() {
        consumer.onDeleteRequested(request(-1001234L, null, "9001"));

        verify(telegram).deleteMessage("-1001234", 9001L);
    }

    @Test
    void manzilsizXabarOtkazibYuboriladi() {
        consumer.onDeleteRequested(request(null, null, "9001"));
        consumer.onDeleteRequested(request(null, "   ", "9001"));
        consumer.onDeleteRequested(null);

        verify(telegram, never()).deleteMessage(anyString(), anyLong());
    }

    @Test
    void identifikatorsizXabarOtkazibYuboriladi() {
        consumer.onDeleteRequested(request(-1001234L, "-1001234", null));
        consumer.onDeleteRequested(request(-1001234L, "-1001234", "  "));
        consumer.onDeleteRequested(request(-1001234L, "-1001234", "raqam-emas"));

        verify(telegram, never()).deleteMessage(anyString(), anyLong());
    }

    /** chatId ustun: ikkalasi kelsa aynan bot ishlatadigan qiymat o'sha. */
    @Test
    void chatIdUstunTuradi() {
        assertThat(request(-1001234L, "@EfBazaar", "1").chatOrChannel()).isEqualTo("@EfBazaar");
        assertThat(request(-1001234L, null, "1").chatOrChannel()).isEqualTo("-1001234");
        assertThat(request(null, null, "1").chatOrChannel()).isNull();
    }
}
