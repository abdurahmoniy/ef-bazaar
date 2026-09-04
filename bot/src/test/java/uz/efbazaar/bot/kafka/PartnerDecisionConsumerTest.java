package uz.efbazaar.bot.kafka;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import uz.efbazaar.bot.kafka.PartnerDecisionDtos.PartnerApproved;
import uz.efbazaar.bot.kafka.PartnerDecisionDtos.PartnerCancelled;
import uz.efbazaar.bot.kafka.PartnerDecisionDtos.PartnerRejected;
import uz.efbazaar.bot.telegram.TelegramApiClient;
import uz.efbazaar.bot.telegram.TelegramApiClient.WebAppButton;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentCaptor.forClass;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Hamkorlik qarori arizachiga yetadimi.
 *
 * <p>Ilgari qaror qabul qilingach hech kimga xabar ketmasdi va odam
 * o'zi sahifaga qaytib kirmaguncha bilmasdi. Bu yerdagi sinovlar
 * jimlik qaytib kelmasligini qo'riqlaydi.
 */
class PartnerDecisionConsumerTest {

    private static final long TELEGRAM_ID = 555_000L;

    private TelegramApiClient telegram;
    private PartnerDecisionConsumer consumer;

    @BeforeEach
    void setUp() {
        telegram = mock(TelegramApiClient.class);
        consumer = new PartnerDecisionConsumer(telegram);
        ReflectionTestUtils.setField(consumer, "webBaseUrl", "https://efbazaar.uz");
    }

    @Test
    @DisplayName("tasdiqlangach panelga havola bilan xabar ketadi")
    void approvalLinksToThePanel() {
        // Havola shart: narx nolda qolsa kanalga bepul e'lon
        // joylanaveradi va hamkor buni bilmaydi.
        consumer.onApproved(new PartnerApproved(
                UUID.randomUUID(), UUID.randomUUID(), TELEGRAM_ID, Instant.now()));

        assertThat(button().url()).isEqualTo("https://efbazaar.uz/partner");
        assertThat(text()).contains("tasdiqlandi");
    }

    @Test
    @DisplayName("rad etilganda SABAB yuboriladi")
    void rejectionCarriesTheReason() {
        // Sababni bilmagan odam qayta ariza berib yana o'shanga urilardi.
        consumer.onRejected(new PartnerRejected(UUID.randomUUID(), UUID.randomUUID(),
                "Obunachilar soni yetarli emas", TELEGRAM_ID, Instant.now()));

        assertThat(text()).contains("Obunachilar soni yetarli emas");
    }

    @Test
    @DisplayName("admin to'xtatganda xabar ketadi")
    void anAdminCancellationIsAnnounced() {
        // Bundan odamning o'zi bexabar: kanali bozordan yo'qolgan.
        consumer.onCancelled(new PartnerCancelled(UUID.randomUUID(), UUID.randomUUID(),
                "Kanal qoidabuzarlik", false, TELEGRAM_ID, Instant.now()));

        assertThat(text()).contains("Kanal qoidabuzarlik");
    }

    @Test
    @DisplayName("o'zi to'xtatganga xabar yuborilmaydi")
    void aSelfCancellationIsSilent() {
        // Odam hozirgina tasdiqlash oynasini bosgan — bu shovqin
        // bo'lardi va bildirishnomalarni umuman o'qimaslikka o'rgatardi.
        consumer.onCancelled(new PartnerCancelled(UUID.randomUUID(), UUID.randomUUID(),
                "Foydalanuvchi bekor qildi", true, TELEGRAM_ID, Instant.now()));

        verify(telegram, never()).sendMessage(anyString(), any(), anyString(), any());
    }

    @Test
    @DisplayName("Telegramsiz odamga urinilmaydi")
    void aUserWithoutTelegramIsSkipped() {
        // Saytdan ro'yxatdan o'tgan odamda manzil yo'q. Platforma
        // bildirishnomasi unga baribir yozilgan — u boshqa yo'ldan.
        consumer.onApproved(new PartnerApproved(
                UUID.randomUUID(), UUID.randomUUID(), null, Instant.now()));

        verify(telegram, never()).sendMessage(anyString(), any(), anyString(), any());
    }

    private String text() {
        var captor = forClass(String.class);
        verify(telegram).sendMessage(eq(String.valueOf(TELEGRAM_ID)), any(),
                captor.capture(), any(WebAppButton.class));
        return captor.getValue();
    }

    private WebAppButton button() {
        var captor = forClass(WebAppButton.class);
        verify(telegram).sendMessage(eq(String.valueOf(TELEGRAM_ID)), any(),
                anyString(), captor.capture());
        return captor.getValue();
    }
}
