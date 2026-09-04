package uz.efbazaar.bot.partner;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.bot.partner.ChannelRefreshResults.ChannelRefreshResult;
import uz.efbazaar.bot.telegram.TelegramApiClient;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentCaptor.forClass;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Kunlik yangilanish sinovlari.
 *
 * <p>Uchta narsani qo'riqlaydi: avatar chindan ham o'qiladi, obunachi
 * soni bilan rasm hech qachon yarim yangilanmaydi, va o'qib bo'lmagani
 * jimgina yutilmaydi.
 */
class ChannelRefresherTest {

    private static final long CHANNEL = -1001234L;
    private static final ObjectMapper JSON = new ObjectMapper();

    private TelegramApiClient telegram;
    private ChannelRefreshResults results;
    private ChannelRefresher refresher;

    private final UUID channelId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        telegram = mock(TelegramApiClient.class);
        results = mock(ChannelRefreshResults.class);
        refresher = new ChannelRefresher(telegram, results);
    }

    @Test
    @DisplayName("avatar va obunachi soni Telegram'dan o'qiladi")
    void readsPhotoAndSubscribers() throws Exception {
        when(telegram.getChat(CHANNEL)).thenReturn(Optional.of(JSON.readTree("""
                {"title":"Yangi nom","username":"yangi_kanal",
                 "photo":{"big_file_id":"yangi-avatar"}}
                """)));
        when(telegram.getChatMemberCount(CHANNEL)).thenReturn(Optional.of(4200));

        refresher.refresh(request());

        ChannelRefreshResult sent = captured();
        assertThat(sent.photoFileId()).isEqualTo("yangi-avatar");
        assertThat(sent.subscriberCount()).isEqualTo(4200);
        assertThat(sent.title()).isEqualTo("Yangi nom");
        assertThat(sent.username()).isEqualTo("yangi_kanal");
        assertThat(sent.error()).isNull();
    }

    @Test
    @DisplayName("avatarsiz kanal ham yangilanadi — rasm bo'sh ketadi")
    void aChannelWithoutAPhotoStillRefreshes() throws Exception {
        // Avatar ixtiyoriy. Uni majburiy qilsak, rasmini olib tashlagan
        // hamkorning obunachi soni ham yangilanmay qolardi.
        when(telegram.getChat(CHANNEL)).thenReturn(
                Optional.of(JSON.readTree("{\"title\":\"Rasmsiz\"}")));
        when(telegram.getChatMemberCount(CHANNEL)).thenReturn(Optional.of(10));

        refresher.refresh(request());

        ChannelRefreshResult sent = captured();
        assertThat(sent.photoFileId()).isNull();
        assertThat(sent.subscriberCount()).isEqualTo(10);
        assertThat(sent.error()).isNull();
    }

    @Test
    @DisplayName("obunachi soni o'qilmasa rasm ham yangilanmaydi")
    void aHalfReadIsNotSent() throws Exception {
        // Yarim yangilansa kanalda ESKI son bilan YANGI rasm qolardi va
        // hech kim bu qorishmani sezmasdi.
        when(telegram.getChat(CHANNEL)).thenReturn(Optional.of(JSON.readTree("""
                {"title":"Kanal","photo":{"big_file_id":"yangi-avatar"}}
                """)));
        when(telegram.getChatMemberCount(CHANNEL)).thenReturn(Optional.empty());

        refresher.refresh(request());

        ChannelRefreshResult sent = captured();
        assertThat(sent.subscriberCount()).isNull();
        assertThat(sent.photoFileId()).isNull();
        assertThat(sent.error()).contains("getChatMemberCount");
    }

    @Test
    @DisplayName("kanal umuman o'qilmasa ham natija yuboriladi")
    void anUnreadableChannelIsStillReported() {
        // Bot kanaldan chiqarib tashlangan bo'lishi mumkin. Jim
        // qolsak, botsiz kanal ro'yxatda abadiy qolardi.
        when(telegram.getChat(CHANNEL)).thenReturn(Optional.empty());

        refresher.refresh(request());

        ChannelRefreshResult sent = captured();
        assertThat(sent.error()).contains("getChat");
        assertThat(sent.subscriberCount()).isNull();
    }

    private ChannelRefreshRequest request() {
        return new ChannelRefreshRequest(channelId, CHANNEL, Instant.now());
    }

    private ChannelRefreshResult captured() {
        var captor = forClass(ChannelRefreshResult.class);
        verify(results).report(captor.capture());
        assertThat(captor.getValue().partnerChannelId()).isEqualTo(channelId);
        return captor.getValue();
    }
}
