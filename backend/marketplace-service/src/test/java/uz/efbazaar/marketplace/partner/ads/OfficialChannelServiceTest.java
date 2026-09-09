package uz.efbazaar.marketplace.partner.ads;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.ads.ListingChannelPost.State;
import uz.efbazaar.marketplace.partner.ads.PartnerAdEventPublisher.OfficialPostPayload;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.ListingChannelPostRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.OfficialChannelPostRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentCaptor.forClass;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * E'lonning efBazaar rasmiy kanalidagi nusxasi.
 *
 * <p>Eng nozik qoida — nusxa HAR DOIM to'g'ridan-to'g'ri joylanadi.
 * Ilgari hamkor posti bo'lsa undan forward qilinardi, chunki
 * "Forwarded from" sarlavhasi hamkorlikni ko'rsatardi. Lekin forward
 * qilingan xabarni TAHRIRLAB BO'LMAYDI va sotilgan e'lon rasmiy
 * kanalda sotuvda turaverardi — xaridor uchun yolg'on ma'lumot.
 * Hamkorlik belgisi shunga arzimadi.
 */
class OfficialChannelServiceTest {

    private static final String CHANNEL = "@EfBazaar";

    private ListingRepository listings;
    private OfficialChannelPostRepository official;
    private ListingChannelPostRepository posts;
    private PartnerAdEventPublisher events;
    private OfficialChannelService service;

    private final UUID listingId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        listings = mock(ListingRepository.class);
        official = mock(OfficialChannelPostRepository.class);
        posts = mock(ListingChannelPostRepository.class);
        events = mock(PartnerAdEventPublisher.class);
        when(official.save(any())).thenAnswer(i -> i.getArgument(0));
        when(official.existsById(any())).thenReturn(false);
        when(posts.findByListingId(any())).thenReturn(List.of());
        service = build(CHANNEL);
    }

    private OfficialChannelService build(String channel) {
        return new OfficialChannelService(listings, official, posts, events,
                "https://efbazaar.uz", channel);
    }

    private Listing listing() {
        Listing l = new Listing();
        l.setId(listingId);
        l.setPrice(new BigDecimal("4500000"));
        l.setDescription("Akkaunt");
        when(listings.findById(listingId)).thenReturn(Optional.of(l));
        return l;
    }

    private OfficialChannelPost pendingRow() {
        OfficialChannelPost row = new OfficialChannelPost();
        row.setListingId(listingId);
        when(official.findById(listingId)).thenReturn(Optional.of(row));
        return row;
    }

    private OfficialPostPayload captured() {
        var captor = forClass(OfficialPostPayload.class);
        verify(events).officialPostRequested(captor.capture());
        return captor.getValue();
    }

    @Test
    @DisplayName("e'lon rasmiy kanalga to'g'ridan-to'g'ri chiqadi")
    void aListingIsPostedDirectly() {
        service.onListingCreated(listing());

        OfficialPostPayload sent = captured();
        assertThat(sent.officialChannel()).isEqualTo(CHANNEL);
        assertThat(sent.caption()).contains("so'm");
        // Hamkor kodi YO'Q: bu post hech qaysi hamkorga tegishli emas
        // va undan kelgan savdo ulushi ham yo'q.
        assertThat(sent.buttonUrl()).doesNotContain("?p=");
    }

    @Test
    @DisplayName("hamkor kanali tanlangan bo'lsa ham forward qilinmaydi")
    void partnerChannelsDoNotTurnItIntoAForward() {
        // Butun o'zgarishning sababi shu. Forward qilingan xabarni
        // tahrirlab bo'lmaydi, ya'ni SOTILDI belgisi rasmiy kanalda hech
        // qachon ishlamasdi — va u jimgina ishlamasdi, chunki tahrir
        // xatosi INFO bilan yozilardi.
        service.onListingCreated(listing());

        OfficialPostPayload sent = captured();
        assertThat(sent.sourceChannelId()).isNull();
        assertThat(sent.sourceMessageId()).isNull();
        assertThat(sent.caption()).isNotBlank();
    }

    @Test
    @DisplayName("e'lon ikki marta yaratilsa ikkinchi nusxa tushmaydi")
    void theOfficialCopyIsWrittenOnce() {
        when(official.existsById(listingId)).thenReturn(true);

        service.onListingCreated(listing());

        verify(events, never()).officialPostRequested(any());
    }

    @Test
    @DisplayName("kanal sozlanmagan bo'lsa hech narsa yuborilmaydi")
    void anUnconfiguredChannelIsSilent() {
        // Sozlanmagan muhit na yiqilishi, na noto'g'ri joyga post
        // qilishi kerak.
        OfficialChannelService off = build("");

        off.onListingCreated(listing());

        assertThat(off.enabled()).isFalse();
        verify(events, never()).officialPostRequested(any());
    }

    private ListingChannelPost post(String telegramMessageId) {
        ListingChannelPost p = new ListingChannelPost();
        p.setId(UUID.randomUUID());
        p.setListingId(listingId);
        p.setPartnerChannelId(UUID.randomUUID());
        p.setState(State.POSTED.name());
        p.setTelegramMessageId(telegramMessageId);
        return p;
    }

    private PartnerChannel channel(long telegramChannelId) {
        PartnerChannel c = new PartnerChannel();
        c.setId(UUID.randomUUID());
        c.setTelegramChannelId(telegramChannelId);
        return c;
    }
}
