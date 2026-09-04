package uz.efbazaar.marketplace.partner.ads;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.partner.PartnerApplication;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.PartnerRepositories.PartnerSettingsRepository;
import uz.efbazaar.marketplace.partner.PartnerSettings;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentCaptor.forClass;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Reklama kanalining tug'ilishi va yopilishi.
 *
 * <p>Bu yerdagi xato ikki yo'l bilan zarar keltiradi: kanal ochilmasa
 * hamkor to'lagan bo'lsa ham reklama bozorida ko'rinmaydi, yopilmasa
 * esa hamkorlikdan chiqqan odamning kanali sotuvchilarga taklif
 * qilinaveradi.
 */
class PartnerChannelServiceTest {

    private PartnerChannelRepository channels;
    private ChannelPostService channelPosts;
    private PartnerChannelService service;

    private final UUID partnerId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        channels = mock(PartnerChannelRepository.class);
        PartnerSettingsRepository settingsRepository = mock(PartnerSettingsRepository.class);

        when(channels.findByApplicationId(any())).thenReturn(Optional.empty());
        when(channels.existsByLinkCode(anyString())).thenReturn(false);
        when(channels.save(any())).thenAnswer(i -> i.getArgument(0));

        channelPosts = mock(ChannelPostService.class);
        // Uch kun ketma-ket o'qib bo'lmasa hamkorlik to'xtaydi.
        service = new PartnerChannelService(channels, settingsRepository, channelPosts, 3);
    }

    @Test
    @DisplayName("kunlik yangilanish avatar va obunachi sonini almashtiradi")
    void refreshReplacesPhotoAndSubscribers() {
        // Ikkalasi ham tekshiruv paytida BIR MARTA olinardi. Obunachi
        // soni reklama narxining asosi, avatar esa vaqt o'tib
        // Telegram'da yaroqsiz bo'lib qoladi.
        PartnerChannel channel = existingChannel();
        channel.setPhotoFileId("eski-avatar");
        channel.setSubscriberCount(50_239);

        service.onChannelRefreshed(refreshed(channel.getId(), "yangi-avatar", 61_004));

        assertThat(channel.getPhotoFileId()).isEqualTo("yangi-avatar");
        assertThat(channel.getSubscriberCount()).isEqualTo(61_004);
    }

    @Test
    @DisplayName("hamkor avatarini olib tashlasa bizda eskisi qolmaydi")
    void aRemovedPhotoIsCleared() {
        PartnerChannel channel = existingChannel();
        channel.setPhotoFileId("eski-avatar");

        service.onChannelRefreshed(refreshed(channel.getId(), null, 100));

        assertThat(channel.getPhotoFileId()).isNull();
    }

    @Test
    @DisplayName("bitta xato hamkorlikni to'xtatmaydi")
    void oneFailureIsForgiven() {
        // Telegram bir daqiqaga javob bermasligi mumkin — buning uchun
        // odamning hamkorligi tugab qolmasligi kerak.
        PartnerChannel channel = existingChannel();

        service.onChannelRefreshed(failed(channel.getId()));

        assertThat(channel.getRefreshFailures()).isEqualTo(1);
        assertThat(channel.isActive()).isTrue();
        verify(channelPosts, never()).refundStranded(any());
    }

    @Test
    @DisplayName("uch kun ketma-ket o'qilmasa hamkorlik to'xtaydi va pul qaytariladi")
    void threeFailuresInARowDeactivate() {
        PartnerChannel channel = existingChannel();
        when(channels.findByPartnerUserIdAndActiveTrue(partnerId))
                .thenReturn(Optional.of(channel));

        service.onChannelRefreshed(failed(channel.getId()));
        service.onChannelRefreshed(failed(channel.getId()));
        assertThat(channel.isActive()).isTrue();

        service.onChannelRefreshed(failed(channel.getId()));

        assertThat(channel.isActive()).isFalse();
        // Chiqmagan buyurtmalar hech qachon chiqmaydi: bot kanalda emas.
        verify(channelPosts).refundStranded(channel.getId());
    }

    @Test
    @DisplayName("muvaffaqiyatli o'qish hisoblagichni nolga qaytaradi")
    void aSuccessResetsTheCounter() {
        // Hisoblagich KETMA-KET xatolarni sanaydi. Umumiy sanoq bo'lsa,
        // oylar davomida yig'ilgan tasodifiy xatolar sog'lom kanalni
        // o'chirib yuborardi.
        PartnerChannel channel = existingChannel();

        service.onChannelRefreshed(failed(channel.getId()));
        service.onChannelRefreshed(failed(channel.getId()));
        service.onChannelRefreshed(refreshed(channel.getId(), "avatar", 10));
        service.onChannelRefreshed(failed(channel.getId()));

        assertThat(channel.getRefreshFailures()).isEqualTo(1);
        assertThat(channel.isActive()).isTrue();
    }

    private PartnerChannel existingChannel() {
        PartnerChannel channel = new PartnerChannel();
        channel.setId(UUID.randomUUID());
        channel.setPartnerUserId(partnerId);
        channel.setTitle("Efootball Uz");
        channel.setPostPriceSom(BigDecimal.ZERO);
        when(channels.findById(channel.getId())).thenReturn(Optional.of(channel));
        return channel;
    }

    private PartnerChannelService.ChannelRefreshedRequest refreshed(
            UUID channelId, String photoFileId, int subscribers) {
        return new PartnerChannelService.ChannelRefreshedRequest(
                channelId, "Efootball Uz", "efootball_uz", photoFileId, subscribers, null);
    }

    private PartnerChannelService.ChannelRefreshedRequest failed(UUID channelId) {
        return new PartnerChannelService.ChannelRefreshedRequest(
                channelId, null, null, null, null, "getChat javob bermadi");
    }

    private PartnerApplication approvedApplication() {
        PartnerApplication app = new PartnerApplication();
        app.setId(UUID.randomUUID());
        app.setUserId(partnerId);
        app.setChannelId(-1001234567L);
        app.setChannelTitle("Efootball Uz");
        app.setChannelUsername("efootball_uz");
        app.setSubscriberCount(50_239);
        return app;
    }

    private PartnerChannel captureSavedChannel() {
        var saved = forClass(PartnerChannel.class);
        verify(channels).save(saved.capture());
        return saved.getValue();
    }

    @Test
    @DisplayName("approving an application opens its advertising channel")
    void createsChannelOnApproval() {
        PartnerApplication app = approvedApplication();

        service.onApproved(app);

        PartnerChannel saved = captureSavedChannel();
        assertThat(saved.getPartnerUserId()).isEqualTo(app.getUserId());
        assertThat(saved.getTelegramChannelId()).isEqualTo(app.getChannelId());
        assertThat(saved.getTitle()).isEqualTo("Efootball Uz");
        assertThat(saved.getSubscriberCount()).isEqualTo(50_239);
        assertThat(saved.isActive()).isTrue();
    }

    @Test
    @DisplayName("the channel starts at zero, not at some price nobody chose")
    void startsAtZero() {
        // Narx hamkorning o'z ishi va u hali qo'ymagan. Biror
        // boshlang'ich qiymat qo'yish uning nomidan qaror qabul
        // qilish bo'lardi, va sotuvchi o'sha qiymatni to'lardi.
        service.onApproved(approvedApplication());
        assertThat(captureSavedChannel().getPostPriceSom()).isEqualByComparingTo("0");
    }

    @Test
    @DisplayName("the payout override starts empty so the channel follows the global policy")
    void payoutStartsUnset() {
        service.onApproved(approvedApplication());

        PartnerChannel saved = captureSavedChannel();
        assertThat(saved.getPayoutMode()).isNull();
        assertThat(saved.getTradePercentBp()).isNull();
        assertThat(saved.getFixedMonthlySom()).isNull();
    }

    @Test
    @DisplayName("the link code is not derived from anything guessable")
    void codeIsRandom() {
        PartnerApplication app = approvedApplication();
        service.onApproved(app);

        String code = captureSavedChannel().getLinkCode();
        assertThat(code).matches("^[A-Z0-9]{8}$");
        assertThat(code).isNotEqualTo(app.getChannelUsername().toUpperCase());
        assertThat(app.getId().toString().replace("-", "").toUpperCase()).doesNotContain(code);
    }

    @Test
    @DisplayName("approving the same application twice does not open a second channel")
    void idempotentOnApproval() {
        PartnerApplication app = approvedApplication();
        when(channels.findByApplicationId(app.getId())).thenReturn(Optional.of(new PartnerChannel()));

        service.onApproved(app);

        verify(channels, never()).save(any());
    }

    @Test
    @DisplayName("an application with no channel is skipped rather than opening a broken one")
    void skipsApplicationWithoutChannel() {
        // Kanalsiz ariza tasdiqlanishi mumkin emas, lekin agar shunday
        // qator bo'lsa, telegram_channel_id NOT NULL da yiqilib butun
        // tasdiqlashni buzardi.
        PartnerApplication app = approvedApplication();
        app.setChannelId(null);

        service.onApproved(app);

        verify(channels, never()).save(any());
    }

    @Test
    @DisplayName("cancelling the partnership takes the channel out of the picker")
    void deactivateOnCancel() {
        PartnerChannel existing = new PartnerChannel();
        existing.setActive(true);
        when(channels.findByPartnerUserIdAndActiveTrue(partnerId)).thenReturn(Optional.of(existing));

        service.deactivate(partnerId);

        assertThat(existing.isActive()).isFalse();
        verify(channels).save(existing);
    }

    @Test
    @DisplayName("cancelling refunds the orders it strands")
    void deactivateRefundsHeldOrders() {
        // Bu postlar hech qachon chiqmaydi — bot kanalda administrator
        // emas. Qoldirilsa sotuvchining puli muzlab qolardi.
        PartnerChannel existing = new PartnerChannel();
        existing.setId(UUID.randomUUID());
        existing.setActive(true);
        when(channels.findByPartnerUserIdAndActiveTrue(partnerId)).thenReturn(Optional.of(existing));

        service.deactivate(partnerId);

        verify(channelPosts).refundStranded(existing.getId());
    }

    @Test
    @DisplayName("deactivating when there is no channel is not an error")
    void deactivateWithoutChannel() {
        when(channels.findByPartnerUserIdAndActiveTrue(partnerId)).thenReturn(Optional.empty());
        assertThatCode(() -> service.deactivate(partnerId)).doesNotThrowAnyException();
    }
}
