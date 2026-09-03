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
    private PartnerChannelService service;

    private final UUID partnerId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        channels = mock(PartnerChannelRepository.class);
        PartnerSettingsRepository settingsRepository = mock(PartnerSettingsRepository.class);

        PartnerSettings settings = new PartnerSettings();
        settings.setMinPostPriceSom(new BigDecimal("1000.00"));
        settings.setMaxPostPriceSom(new BigDecimal("100000.00"));
        when(settingsRepository.findById(PartnerSettings.SINGLETON_ID)).thenReturn(Optional.of(settings));

        when(channels.findByApplicationId(any())).thenReturn(Optional.empty());
        when(channels.existsByLinkCode(anyString())).thenReturn(false);
        when(channels.save(any())).thenAnswer(i -> i.getArgument(0));

        service = new PartnerChannelService(channels, settingsRepository);
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
    @DisplayName("the channel starts at the lowest price the admin allows")
    void startsAtTheMinimumPrice() {
        // Hamkor narxni o'zi qo'yadi. Sozlamagunicha kanali eng arzon
        // bo'lib turgani, qimmat bo'lib turganidan yaxshiroq.
        service.onApproved(approvedApplication());
        assertThat(captureSavedChannel().getPostPriceSom()).isEqualByComparingTo("1000.00");
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
    @DisplayName("deactivating when there is no channel is not an error")
    void deactivateWithoutChannel() {
        when(channels.findByPartnerUserIdAndActiveTrue(partnerId)).thenReturn(Optional.empty());
        assertThatCode(() -> service.deactivate(partnerId)).doesNotThrowAnyException();
    }
}
