package uz.efbazaar.marketplace.partner.ads;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.ads.PartnerAdDtos.ChannelCard;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Sotuvchi ko'radigan kanallar ro'yxati.
 *
 * <p>Tartib bu yerda hal qilinadi va u sotuvchining qaroriga bevosita
 * ta'sir qiladi: yuqoridagi kanal ko'proq tanlanadi.
 */
class ChannelDirectoryServiceTest {

    private PartnerChannelRepository channels;
    private ChannelDirectoryService service;

    @BeforeEach
    void setUp() {
        channels = mock(PartnerChannelRepository.class);
        service = new ChannelDirectoryService(channels, new PartnerPricing());
    }

    private PartnerChannel channel(String title, int subscribers) {
        PartnerChannel c = new PartnerChannel();
        c.setId(UUID.randomUUID());
        c.setTitle(title);
        c.setSubscriberCount(subscribers);
        c.setPostPriceSom(new BigDecimal("5000.00"));
        return c;
    }

    @Test
    @DisplayName("an empty query ranks every active channel by subscribers")
    void emptyQueryRanksBySubscribers() {
        when(channels.findByActiveTrueOrderBySubscriberCountDesc())
                .thenReturn(List.of(channel("Efootball Uz", 50_239), channel("Kichik kanal", 1_200)));

        assertThat(service.search("")).extracting(ChannelCard::title)
                .containsExactly("Efootball Uz", "Kichik kanal");
    }

    @Test
    @DisplayName("a query matches the start of the title, still ranked by subscribers")
    void prefixSearchRanksBySubscribers() {
        when(channels.findByActiveTrueAndTitleStartsWithIgnoreCaseOrderBySubscriberCountDesc("PRE"))
                .thenReturn(List.of(
                        channel("Premium Efootball akkountlari", 4_219),
                        channel("Prefer Efootball", 2_334)));

        assertThat(service.search("Pre")).extracting(ChannelCard::title)
                .containsExactly("Premium Efootball akkountlari", "Prefer Efootball");
    }

    @Test
    @DisplayName("a card carries the price the seller will actually be charged")
    void cardCarriesPrice() {
        PartnerChannel c = channel("Efootball Uz", 50_239);
        c.setPostPriceSom(new BigDecimal("15000.00"));
        when(channels.findByActiveTrueOrderBySubscriberCountDesc()).thenReturn(List.of(c));

        assertThat(service.search(null).get(0).priceSom()).isEqualByComparingTo("15000.00");
    }

    @Test
    @DisplayName("a blank-ish query is treated as no query")
    void whitespaceIsNoQuery() {
        when(channels.findByActiveTrueOrderBySubscriberCountDesc()).thenReturn(List.of());

        service.search("   ");

        verify(channels).findByActiveTrueOrderBySubscriberCountDesc();
        verify(channels, never())
                .findByActiveTrueAndTitleStartsWithIgnoreCaseOrderBySubscriberCountDesc(any());
    }

    @Test
    @DisplayName("a channel with no avatar gets no photo url rather than a broken one")
    void missingAvatar() {
        when(channels.findByActiveTrueOrderBySubscriberCountDesc())
                .thenReturn(List.of(channel("Rasmsiz kanal", 100)));

        assertThat(service.search(null).get(0).photoUrl()).isNull();
    }

    @Test
    @DisplayName("a channel with an avatar gets a proxy url, never the raw file id")
    void avatarIsProxied() {
        // Telegram file_id brauzerga berilmaydi: u botning tokeni bilan
        // birga ishlaydigan ichki identifikator.
        PartnerChannel c = channel("Rasmli kanal", 100);
        c.setPhotoFileId("AgACAgIAAxk-secret");
        when(channels.findByActiveTrueOrderBySubscriberCountDesc()).thenReturn(List.of(c));

        String url = service.search(null).get(0).photoUrl();
        assertThat(url).contains(c.getId().toString()).doesNotContain("AgACAgIAAxk-secret");
    }
}
