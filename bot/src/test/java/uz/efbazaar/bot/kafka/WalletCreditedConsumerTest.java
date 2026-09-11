package uz.efbazaar.bot.kafka;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import uz.efbazaar.bot.telegram.TelegramApiClient;
import uz.efbazaar.bot.telegram.TelegramApiClient.WebAppButton;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentCaptor.forClass;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * "Hamyoningiz to'ldirildi" xabari.
 *
 * <p>Ilgari pul tushganida hech kimga xabar ketmasdi — odam o'zi
 * hamyonga kirib qaramaguncha bilmasdi. Bu yerdagi sinovlar jimlik
 * qaytib kelmasligini qo'riqlaydi.
 */
class WalletCreditedConsumerTest {

    private static final long TELEGRAM_ID = 555_000L;
    private static final Instant AT = Instant.parse("2026-09-11T10:00:00Z");

    private TelegramApiClient telegram;
    private WalletCreditedConsumer consumer;

    @BeforeEach
    void setUp() {
        telegram = mock(TelegramApiClient.class);
        consumer = new WalletCreditedConsumer(telegram);
        ReflectionTestUtils.setField(consumer, "webBaseUrl", "https://efbazaar.uz");
    }

    private String sentText() {
        var text = forClass(String.class);
        verify(telegram).sendMessage(eq(String.valueOf(TELEGRAM_ID)), any(), text.capture(), any());
        return text.getValue();
    }

    private static WalletCreditedDto event(Long amountTiyin, Long balanceTiyin) {
        return new WalletCreditedDto(
                UUID.randomUUID(), TELEGRAM_ID, amountTiyin, balanceTiyin, AT);
    }

    @Test
    void xabarSummaVaJoriyBalansniAytadi() {
        consumer.onCredited(event(5_000_000L, 32_150_000L));

        String text = sentText();
        assertThat(text).contains("Hamyoningiz to'ldirildi");
        assertThat(text).contains("50 000 so'm");
        assertThat(text).contains("321 500 so'm");
    }

    /** Balansni o'qib bo'lmagan bo'lsa xabar bittagina qatorini yo'qotadi. */
    @Test
    void balanssizHamXabarKetadi() {
        consumer.onCredited(event(5_000_000L, null));

        String text = sentText();
        assertThat(text).contains("50 000 so'm");
        assertThat(text).doesNotContain("Joriy balans");
    }

    /**
     * Qo'lda biriktirilgan tushum butun so'm bo'lishiga kafolat yo'q, va odam
     * bu raqamni bank cheki bilan solishtiradi.
     */
    @Test
    void tiyinQoldigiSaqlanadi() {
        consumer.onCredited(event(1_234_56L, null));

        assertThat(sentText()).contains("1 234,56 so'm");
    }

    @Test
    void hamyonTugmasiQoshiladi() {
        consumer.onCredited(event(1_000L, null));

        var button = forClass(WebAppButton.class);
        verify(telegram).sendMessage(anyString(), any(), anyString(), button.capture());
        assertThat(button.getValue().url()).isEqualTo("https://efbazaar.uz/hamyon");
    }

    @Test
    void manzilsizHodisaga_hechNarsaYuborilmaydi() {
        consumer.onCredited(new WalletCreditedDto(UUID.randomUUID(), null, 1_000L, null, AT));
        consumer.onCredited(new WalletCreditedDto(UUID.randomUUID(), TELEGRAM_ID, null, null, AT));
        consumer.onCredited(null);

        verify(telegram, never()).sendMessage(anyString(), any(), anyString(), any());
    }

    /** Botni bloklagan odamga yozib bo'lmaydi, va bu pulni qaytarmaydi. */
    @Test
    void bloklaganOdamXabarniYiqitmaydi() {
        doThrow(new RuntimeException("bot was blocked by the user"))
                .when(telegram).sendMessage(anyString(), any(), anyString(), any());

        assertThatCode(() -> consumer.onCredited(event(1_000L, null)))
                .doesNotThrowAnyException();
    }
}
