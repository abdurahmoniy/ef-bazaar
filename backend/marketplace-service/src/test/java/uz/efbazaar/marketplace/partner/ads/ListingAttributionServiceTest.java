package uz.efbazaar.marketplace.partner.ads;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.PartnerRepositories.PartnerSettingsRepository;
import uz.efbazaar.marketplace.partner.PartnerSettings;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.ListingPartnerAttributionRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerClickRepository;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentCaptor.forClass;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Qaysi kanal xaridorni shu e'longa olib kelgani.
 *
 * <p>SAVDO ULUSHI SHUNGA TAYANADI. Bu yerda xato bo'lsa, ulush noto'g'ri
 * kanalga ketadi yoki umuman ketmaydi — va ikkalasi ham hech qanday
 * xato ko'rsatmaydi.
 */
class ListingAttributionServiceTest {

    private PartnerChannelRepository channels;
    private PartnerClickRepository clicks;
    private ListingPartnerAttributionRepository attributions;
    private ListingAttributionService service;

    private final UUID listing = UUID.randomUUID();
    private final UUID buyer = UUID.randomUUID();
    private PartnerChannel channel;
    private PartnerChannel otherChannel;

    @BeforeEach
    void setUp() {
        channels = mock(PartnerChannelRepository.class);
        clicks = mock(PartnerClickRepository.class);
        attributions = mock(ListingPartnerAttributionRepository.class);
        PartnerSettingsRepository settingsRepository = mock(PartnerSettingsRepository.class);

        PartnerSettings settings = new PartnerSettings();
        settings.setDefaultPayoutMode("PERCENT");
        settings.setDefaultTradePercentBp(1000);
        settings.setDefaultFixedMonthlySom(BigDecimal.ZERO);
        when(settingsRepository.findById(PartnerSettings.SINGLETON_ID)).thenReturn(Optional.of(settings));

        service = new ListingAttributionService(channels, clicks, attributions,
                new PartnerPayoutPolicy(settingsRepository));

        channel = channelWithCode("K7M4XQP2");
        otherChannel = channelWithCode("BBBB2222");
        when(attributions.findById(any())).thenReturn(Optional.empty());
    }

    private PartnerChannel channelWithCode(String code) {
        PartnerChannel c = new PartnerChannel();
        c.setId(UUID.randomUUID());
        c.setPartnerUserId(UUID.randomUUID());
        c.setLinkCode(code);
        c.setActive(true);
        when(channels.findByLinkCode(code)).thenReturn(Optional.of(c));
        when(channels.findById(c.getId())).thenReturn(Optional.of(c));
        return c;
    }

    private ListingPartnerAttribution captureAttribution() {
        var saved = forClass(ListingPartnerAttribution.class);
        verify(attributions).save(saved.capture());
        return saved.getValue();
    }

    private ListingPartnerAttribution existingFor(PartnerChannel c) {
        return new ListingPartnerAttribution(listing, buyer, c.getId());
    }

    @Test
    @DisplayName("a click on a listing link attributes that listing to that channel")
    void recordsAttribution() {
        service.recordClick("K7M4XQP2", listing, buyer);

        ListingPartnerAttribution saved = captureAttribution();
        assertThat(saved.getPartnerChannelId()).isEqualTo(channel.getId());
        assertThat(saved.getId().getListingId()).isEqualTo(listing);
        assertThat(saved.getId().getUserId()).isEqualTo(buyer);
    }

    @Test
    @DisplayName("the last click wins")
    void lastClickWins() {
        // Bitta akkountni ikki kanalda ko'rgan odam ikkalasiga ham
        // bosishi mumkin. Ulush savdoni haqiqatan keltirganga tegishli.
        when(attributions.findById(any())).thenReturn(Optional.of(existingFor(otherChannel)));

        service.recordClick("K7M4XQP2", listing, buyer);

        assertThat(captureAttribution().getPartnerChannelId()).isEqualTo(channel.getId());
    }

    @Test
    @DisplayName("an anonymous click is logged but attributes nothing yet")
    void anonymousClickIsLoggedOnly() {
        service.recordClick("K7M4XQP2", listing, null);

        verify(clicks).save(any());
        verify(attributions, never()).save(any());
    }

    @Test
    @DisplayName("a click through an unknown code is ignored, not an error")
    void unknownCodeIgnored() {
        assertThatCode(() -> service.recordClick("NOSUCH11", listing, buyer))
                .doesNotThrowAnyException();
        verify(clicks, never()).save(any());
    }

    @Test
    @DisplayName("a click on an inactive channel's link still counts")
    void inactiveChannelStillCounts() {
        // Kanal yopilgan bo'lsa ham, uning eski postidan kelgan odam
        // haqiqatan o'sha kanaldan kelgan. Qidiruvda ko'rinmasligi
        // boshqa masala.
        channel.setActive(false);

        service.recordClick("K7M4XQP2", listing, buyer);

        verify(clicks).save(any());
    }

    @Test
    @DisplayName("the attribution resolves to the channel owner and the rate that applies")
    void resolvesOwnerAndRate() {
        when(attributions.findById(any())).thenReturn(Optional.of(existingFor(channel)));

        var found = service.attributionFor(listing, buyer);

        assertThat(found).isPresent();
        assertThat(found.get().partnerUserId()).isEqualTo(channel.getPartnerUserId());
        assertThat(found.get().percentBp()).isEqualTo(1000);
    }

    @Test
    @DisplayName("a buyer who arrived through no channel resolves to nothing")
    void noAttribution() {
        assertThat(service.attributionFor(listing, buyer)).isEmpty();
    }

    @Test
    @DisplayName("a fixed-mode channel resolves to a zero rate rather than no attribution")
    void fixedModeResolvesToZero() {
        // Attributsiya SAQLANADI — voronka uni ko'rsatadi — lekin foiz
        // nol: fiks va foiz bir-birini almashtiradi.
        channel.setPayoutMode("FIXED");
        channel.setFixedMonthlySom(new BigDecimal("300000"));
        when(attributions.findById(any())).thenReturn(Optional.of(existingFor(channel)));

        assertThat(service.attributionFor(listing, buyer).orElseThrow().percentBp()).isZero();
    }

    @Test
    @DisplayName("a per-channel percentage override wins over the global one")
    void overrideWins() {
        channel.setPayoutMode("PERCENT");
        channel.setTradePercentBp(2500);
        when(attributions.findById(any())).thenReturn(Optional.of(existingFor(channel)));

        assertThat(service.attributionFor(listing, buyer).orElseThrow().percentBp()).isEqualTo(2500);
    }

    @Test
    @DisplayName("an attribution pointing at a channel that no longer exists resolves to nothing")
    void danglingAttribution() {
        ListingPartnerAttribution dangling = new ListingPartnerAttribution(listing, buyer, UUID.randomUUID());
        when(attributions.findById(any())).thenReturn(Optional.of(dangling));

        assertThat(service.attributionFor(listing, buyer)).isEmpty();
    }
}
